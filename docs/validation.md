# 来源与验证

核查日期：2026-10-29。

## 官方来源

- https://www.bilibili.com/toy/publish/sdk
- https://www.bilibili.com/toy/publish/guide
- https://github.com/bilibili/toy
- https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md
- https://s1.hdslb.com/bfs/seed/toy/app/sdk/toy-sdk.js

本次通过 Node fetch 读取发布页和其加载的官方前端 bundle index-CR0Z-UJA.js，以及 Toy SDK 本体，核对了实际方法签名、SDK URL、允许后缀和存储/排行榜限制。未复制或改写 SDK 实现，运行时加载官方 SDK。SDK 和平台限制可能变化，发布时重新核对官方文档。

相关引擎接口来自当前源码：common/Module.h、common/SquirrelBinding.h、common/Value.h、cmake/EVEnginePlugin.cmake、src/engine/CMakeLists.txt、platform/webgpu/README.md。没有推测新的 eve.* 内建 API。

## 验收分层

- Node 契约测试覆盖 SDK 存在/缺失、同步抛错、Promise reject、限流码、取消、超时、迟到结果、请求和响应预算。
- 导出测试覆盖入口替换、相对路径、缺失资源、禁止格式、入口大小、源目录保持、拒绝覆盖和失败清理。
- 环境探针测试覆盖只有 navigator.gpu 但无 adapter、设备创建及释放、线程隔离依赖。
- Native / Emscripten 编译检查覆盖真正的 ToyPlugin.cpp 与当前引擎/第三方头文件。语法检查不是完整宿主链接证据。
- Emscripten 最小壳链接验证只证明插件 JS 与 HTML 壳可被工具链处理，不等同于完整引擎运行。

待验收：完整引擎浏览器链接；EveScript smoke 真实运行；Toy 托管及 B 站 App 中 probe 报告；真实游戏首帧和交互；SDK 授权、云存档及排行榜端到端；正式发布后的资源和 MIME。没有实际上传或提交审核。

当前机器有可用的 Emscripten 3.1.74，但当前引擎要求的完整依赖构建和 SDK 产物未准备。不要用旧工具链的插件 TU 编译成功宣称整引擎版本兼容。

## 本次实际结果

- npm test：14/14 通过（Node 26.4.0，Windows）。
- ToyPlugin.cpp：Clang 原生对象编译和 Emscripten 3.1.74 WASM 对象编译通过；开启 -Wall -Wextra -Werror，第三方头按 system include 分类。
- 实际 Emscripten 最小壳链接通过；验证后置 --shell-file 覆盖引擎默认壳、--pre-js 注入，并生成 eve.html / eve.js / eve.wasm。
- 实际 Emscripten CMake configure harness 通过；断言外部源、pre-js、shell 选项均已附加到宿主 target。
- build/probe：已生成 4 文件、约 2.5 KiB 的独立探针包；doctor 通过，明确保留线程依赖和实际宿主未验的警告。
- EVEngine 工作树 make check：通过（base=origin/dev）；引擎源码没有修改，这个门禁不覆盖外部仓库，需要结合本项目的测试看待。
- 本机未安装官方 toy CLI，未运行真实预览上传；CLI 参数发现及 preview 的无提交约束由注入执行器契约测试覆盖。

上述都是本地证据；没有远端 CI 成功或 Toy 发布成功的声明。架构规则中适用了 Result 检查、异步拥有数据、VM 线程边界、版本化协议、provider-present/absent、失败不发布半成品和第三方源码归属规则。没有新增 ECS、公共持久存档或引擎模块边界；无规则豁免。

## 实际打包试验（2026-10-29）

重新执行真实 Emscripten 链接，使用 --preload-file 将 examples/sdk-smoke 挂载为 /game，生成 eve.html、eve.js、eve.wasm、eve.data，再执行：

```
node bin/eve-toy.mjs pack build/shell-smoke dist/package-trial
node bin/eve-toy.mjs doctor dist/package-trial
```

实测发现并修复输出父目录不存在时的 ENOENT，加入回归测试后 npm test 15/15 通过。打包检查 0 errors；9 文件，共 169047 bytes。使用标准 ZIP 创建工具生成 dist/evengine-toy-package-trial.zip，49097 bytes；ZIP 根包含 index.html，没有额外包裹目录，CRC 检查通过。

ZIP SHA256：C0527688C782E5D8D533F942EFAA7E29928B32B3FB3642C26F73AEBABE815DBA。

通过本地 /toy/local/ 子路径请求全部 9 个文件，均为 HTTP 200；WASM MIME 为 application/wasm，WebAssembly.validate 通过。测试 HTTP 服务已停止。

这是最小 Emscripten 打包验证：main.cpp 只返回 0，SDK smoke 脚本真实预加载，但没有链接完整 EVEngine，因此不执行这些脚本，不是可玩的游戏。当前未找到完整引擎浏览器产物。保留了线程依赖与实际 Toy 容器未验证警告；本次没有上传。
