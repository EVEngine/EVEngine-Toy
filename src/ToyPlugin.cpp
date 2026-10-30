#include "common/Export.h"
#include "common/Module.h"
#include "common/SquirrelBinding.h"

#include <cstdlib>
#include <string>

#ifdef __EMSCRIPTEN__
#include <emscripten.h>

EM_JS(int, toy_begin, (const char* method, const char* args),
      { return globalThis.EVEToyBridge.begin(UTF8ToString(method), UTF8ToString(args)); });
EM_JS(char*, toy_poll, (int token), {
    var text = JSON.stringify(globalThis.EVEToyBridge.poll(token));
    var size = lengthBytesUTF8(text) + 1;
    var ptr  = _malloc(size);
    if (ptr) stringToUTF8(text, ptr, size);
    return ptr;
});
EM_JS(int, toy_cancel, (int token), { return globalThis.EVEToyBridge.cancel(token) ? 1 : 0; });
#endif

namespace eve::toy {
#ifndef __EMSCRIPTEN__
namespace {
Diagnostic unavailable() {
    return Diagnostic::error(DiagnosticCode::Unsupported,
                             "Toy SDK requires the browser plugin build; desktop "
                             "does not emulate cloud data");
}
}  // namespace
#endif

/** @brief External Toy plugin. ModuleManager owns the singleton for the host
 * lifetime.
 * @note Main/script thread only. No script callbacks or VM references are
 * retained. Browser promises own copied JSON and publish results into a bounded
 * request registry.
 */
class ToyPlugin : public Module {
public:
    Module_REG(ToyPlugin);

    /** @brief Starts one SDK call and returns its opaque, session-local token.
     * @param method SDK method name, copied at the JS boundary and allowlisted
     * there.
     * @param args Owning argument array; each element is one positional SDK
     * argument.
     * @return Token, or Unsupported/InvalidArgument/resource diagnostic.
     * @note Main/script thread; executes SDK synchronously through promise
     * creation, so a real browser user activation remains required for permission
     * APIs.
     * @cost JSON serialization scales with argument size; network/UI work
     * completes asynchronously.
     */
    [[nodiscard]] Result<Value> begin(std::string method, Value args) {
        if (!args.getIf<Value::Array>())
            return Result<Value>::failure(
                Diagnostic::error(DiagnosticCode::InvalidArgument, "Arguments must be an array"));
        auto encoded = args.toJson();
        if (!encoded) return Result<Value>::failure(encoded.status());
#ifdef __EMSCRIPTEN__
        const int token = toy_begin(method.c_str(), encoded.value().c_str());
        if (token <= 0)
            return Result<Value>::failure(Diagnostic::error(DiagnosticCode::PreconditionViolation,
                                                            "Toy request registry full or argument payload too large"));
        return Result<Value>::success(Value(std::int64_t(token)));
#else
        (void)method;
        return Result<Value>::failure(unavailable());
#endif
    }

    /** @brief Checks one token; terminal packets are consumed exactly once.
     * @param token Opaque token from begin, never persisted across page reload.
     * @return Owning packet {schema,version,state,value/error}; pending retains
     * token.
     * @note Main/script thread. Cancellation cannot undo SDK side effects already
     * sent.
     * @cost Copies the completed response once; pending checks are constant time.
     */
    [[nodiscard]] Result<Value> poll(int token) {
#ifdef __EMSCRIPTEN__
        char* text = toy_poll(token);
        if (!text)
            return Result<Value>::failure(Diagnostic::error(DiagnosticCode::Failed, "Toy response allocation failed"));
        const std::string owned(text);
        std::free(text);
        return Value::fromJson(owned);
#else
        (void)token;
        return Result<Value>::failure(unavailable());
#endif
    }

    /** @brief Releases a token and ignores its eventual promise completion.
     * @param token Request identity, invalid after successful cancellation.
     * @return Success or StaleHandle; does not roll back remote writes.
     * @note Main/script thread; invokes no script callbacks.
     */
    [[nodiscard]] Result<void> cancel(int token) {
#ifdef __EMSCRIPTEN__
        if (toy_cancel(token)) return Result<void>::success();
        return Result<void>::failure(Diagnostic::error(DiagnosticCode::StaleHandle, "Unknown Toy request"));
#else
        (void)token;
        return Result<void>::failure(unavailable());
#endif
    }
};

Module_IMPL(ToyPlugin, new ToyPlugin());

void ToyPlugin::expose(ssq::Table& table) {
    auto cls = table.addClass(name, ToyPlugin::create, false);
    expose(cls);
}

namespace {
ssq::Table projectChecked(HSQUIRRELVM vm, Result<Value> result) {
    if (result) {
        const auto top     = sq_gettop(vm);
        auto       checked = script::pushValue(vm, result.value());
        sq_settop(vm, top);
        if (!checked)
            return script::projectResult(vm, Result<Value>::failure(checked.status()),
                                         [](Value value) { return value; });
    }
    return script::projectResult(vm, std::move(result), [](Value value) { return value; });
}
}  // namespace

void ToyPlugin::expose(ssq::Class& cls) {
    const auto vm = cls.getHandle();
    cls.addFunc("begin", [vm](ToyPlugin* self, std::string method, ssq::Object arguments) {
        auto args = script::valueFromSquirrel(arguments);
        auto result =
            args ? self->begin(std::move(method), std::move(args).takeValue()) : Result<Value>::failure(args.status());
        return projectChecked(vm, std::move(result));
    });
    cls.addFunc("poll", [vm](ToyPlugin* self, int token) { return projectChecked(vm, self->poll(token)); });
    cls.addFunc("cancel", [vm](ToyPlugin* self, int token) { return script::projectResult(vm, self->cancel(token)); });
}
}  // namespace eve::toy

#ifndef EVE_TOY_STATIC_PLUGIN
EVE_PLUGIN_EXPORT int eve_plugin_init(void) { return 0; }
#endif
