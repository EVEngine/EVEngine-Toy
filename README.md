# EVEngine Toy 插件

独立的 EVEngine 平台插件项目，提供 EveScript → 浏览器 Toy SDK 桥接、WebGPU 游戏壳、环境探针和发布包检查。插件源文件不复制进引擎，不修改 EVEngine 或任何第三方依赖源码。

当前是可测试的首版集成源码。已验证桥接契约、打包流程和 C++ 两条预处理路径的编译；完整引擎链接、真实游戏帧和 Toy 线上/App 容器兼容性仍待验证。不能把生成上传包等同于游戏已可上线。

## 首先验证运行环境

需要 Node.js 22+，无 npm 依赖。

```powershell
node bin/eve-toy.mjs probe dist-probe
node bin/eve-toy.mjs serve dist-probe
```

打开命令输出的 `/toy/local/index.html`，点击检测。将 `dist-probe` 作为 Toy 作品预览，在桌面浏览器、B 站 App 内分别运行并保存 JSON 报告。

当前 EVEngine 浏览器构建使用 pthreads，需要 WebGPU、设备创建成功、`crossOriginIsolated` 与 `SharedArrayBuffer`。本项目的本地服务器故意不添加 COOP/COEP：否则本地通过会掩盖 Toy 的实际托管限制。引擎自己的 `scripts/serve_webgpu.py` 可用于隔离环境下的引擎调试。

若 Toy 环境探针不通过，当前构建不能在那里运行；下一步应根据报告评估引擎的无共享内存构建或平台支持。这里没有通过改文件后缀、模拟 SDK 或偷偷切换渲染后端隐藏失败。

## 构建浏览器插件与游戏

激活 emsdk，按对应引擎版本的 WebGPU 构建指南准备依赖。插件通过 CMake 的 `CMAKE_PROJECT_INCLUDE` 在 EVEngine 根项目配置完成后附加到 `eve` 宿主。它遵循现有原生插件的 `ModuleRegister` 注册路径，在浏览器静态链接，不依赖 web profile 中已裁剪的动态库加载模块。

```powershell
$engine = 'C:/path/to/EVEngine'
$plugin = 'C:/path/to/EVEngine-Toy'
$game = 'C:/path/to/my-game'
emcmake cmake -S $engine -B build/web-toy -G Ninja -DCMAKE_BUILD_TYPE=Release "-DCMAKE_PROJECT_INCLUDE=$plugin/cmake/AttachToEngine.cmake" "-DEVENGINE_WEBGPU_GAME_DIR=$game"
cmake --build build/web-toy --target deps
cmake --build build/web-toy --target eve
node bin/eve-toy.mjs pack build/web-toy/src/engine dist-toy
node bin/eve-toy.mjs doctor dist-toy
```

使用全新的 `dist-toy` 路径；打包拒绝覆盖目录。游戏必须有自己的 `main.nut`、`config.nut` 和资源。打包选取 `eve*.js/.wasm/.data/.html`，把 `eve.html` 变为 `index.html`，加入插件静态页面；CMake 元数据不会上传。游戏资源由引擎原有 `--preload-file` 打入 `eve.data`。

本插件的游戏壳在环境检查通过后才加载 WASM，保留 `canvas` 和 `eveEngineReady` 合同，不包含开发用 playground。

## EveScript API

浏览器静态插件可直接创建 `eve.ToyPlugin()`。桌面先使用匹配 SDK 构建的 `eve_toy.dll/.so/.dylib` 和既有 `eve.Plugins().load()` 加载，再创建同一类；桌面 SDK 调用返回 `Unsupported`，不会伪造用户资料或本地云存档。

```squirrel
local toy = eve.ToyPlugin();
local started = toy.begin("getCloudStorage", [["coins", "level"]]);
if (!started.ok) throw started.status.summary;
local token = started.value;

// 在 eve_update 中检查本地请求状态；不会轮询 Toy 网络接口。
local checked = toy.poll(token);
if (!checked.ok) throw checked.status.summary;
local packet = checked.value;
if (packet.state == "succeeded") {
    print(packet.value.coins + "\n");
} else if (packet.state == "failed") {
    print(packet.error.type + ": " + packet.error.message + "\n");
}
// pending: 下一帧继续检查。终态只能取一次，此后 token 失效。
```

`begin(method, args)` 的 `args` 是位置参数数组，例如：

- 能力检查：`begin("isSupport", ["getCloudStorage"])`
- 批量存档：`begin("setCloudStorage", [{coins="100",level="5"}])`
- 结算成绩：`begin("submitScore", [{board=1,score=100}])`
- 榜单读取：`begin("getRankList", [{board=1}])`
- 用户资料：`begin("getUserProfile", [])`

返回值一律通过引擎 `script::projectResult` 投影。异步状态使用版本化的 `evengine.toy.request` 包，状态为 `pending/succeeded/failed`；SDK 失败保留 `type/code/message`，包括限流码 `307044`。插件不自动重试远程写入，超时意味着远程结果可能未知。

最多 128 个未回收请求，每次参数和响应最多 256 KiB，30 秒超时。调用者必须取回终态或 `cancel(token)`。取消只释放本地请求，不撤销已经发送的 SDK 操作。token 只在当前页面会话有效，不持久化；热重载要保留仍需处理的 token，或显式取消。

权限、分享等方法仍受官方 SDK 的真实用户手势要求约束。EveScript 帧回调不能凭空制造浏览器激活；首次授权应安排在真实 DOM 点击链路中。`getContainerState/setContainerMode` 在部分环境不可用，调用返回不代表容器模式已经实际变更。

## 发布

复用 B 站官方 `toy` CLI。首次使用先按官方项目安装并登录，命令字段始终以当前 CLI 为准：

```powershell
node bin/eve-toy.mjs toy-help
toy create --help-json
node bin/eve-toy.mjs preview dist-toy --name=MyGame
```

preview 会先检查包，再读取官方 CLI 当前帮助验证元信息参数，最后调用 create（强制 JSON，不带 --yes）创建预览；不提供提交开关。检查真实环境探针和游戏帧后再提交审核。该仓库没有存储登录凭据，也不会在测试、构建或打包时上传内容。正式发布仍需平台资格及审核。

## 桌面插件构建

```powershell
cmake -S . -B build/native -DEVEngine_DIR=C:/path/to/target-sdk/cmake -DCMAKE_BUILD_TYPE=Debug
cmake --build build/native
```

Windows 通过引擎 `cmake/with-msvc.cmd` 配置，SDK 和插件须匹配架构、配置和 CRT。桌面插件用于确认脚本 API 及 provider-absent 行为，Toy 业务实际运行在浏览器。

## 验证

```powershell
npm test
# 限制子进程的 Node 版本/沙箱中：Node 24+ 可用
node --test --test-isolation=none test/*.test.mjs
```

完整边界、来源、已验证证据与剩余验收见 [docs/module-interface.md](docs/module-interface.md) 和 [docs/validation.md](docs/validation.md)。
