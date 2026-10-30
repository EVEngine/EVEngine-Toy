# EVEngine Toy

独立的 EVEngine 平台插件。以真实 `eve zip` 生成游戏归档，将完整 EVEngine WebGPU 运行时与 Toy 插件静态链接，导出 B 站 Toy 发布目录。

完整示例已通过真实浏览器渲染与键盘验收，成品在 `dist/evengine-toy-game.zip`。引擎源码需要包含 `9beed7683` 的 WebGPU 异常捕获及截图修复；本机对应分支是 `codex/toy-webgpu-runtime`。

## 一条命令导出游戏

准备 Node.js 22+、PATH 中的 `eve`、EVEngine 源码及其子模块、emsdk（本次验证为 6.0.7，须提供 emdawnwebgpu port），以及 CMake 3.29.x。浏览器运行时尚无官方预编译 SDK，因此首次导出会构建一次完整引擎；后续复用此目录中的构建缓存。

```powershell
node bin/eve-toy.mjs build `
  --game examples/toy-game `
  --engine C:/path/to/EVEngine `
  --emsdk C:/path/to/emsdk `
  --cmake C:/path/to/cmake-3.29/bin/cmake.exe `
  --build build/webgpu `
  --output dist/toy-game `
  --jobs 6
```

`--game` 可换为自己的 `config.nut` + `main.nut` 游戏目录。`--eve`、`--python` 可指定工具路径，默认分别为 `eve` 和 `python3`。输出目录必须不存在，拒绝覆盖既有作品。默认使用引擎 minimal 配置并显式启用图形绑定需要的 font 模块；需要更多运行时模块时选 --profile web。构建目录带独占锁，避免并发导出混用游戏归档。

流程如下：

1. 复制游戏输入到构建快照，并直接调用 `eve zip`；不自造游戏归档格式。
2. 将引擎生成的 `game.eve` 预加载到浏览器 `/game`，由 EVEngine 原有启动逻辑挂载。
3. 使用 emsdk 构建完整 `eve`，链接外部 ToyPlugin、官方 SDK 桥接和游戏壳。
4. 生成 `index.html`、JS、WASM、data 及诊断页面，检查资源路径和 Toy 格式限制。
5. 在构建目录写入带游戏归档 SHA256 的 `build-receipt.json`。

本项目不把 Windows `eve.exe` 塞进网页包，也不以空 main 作为游戏导出验证。浏览器构建目标是原来的 EVEngine 源码，游戏仍使用 EveScript。

## 浏览器与线程

默认 `--threads false` 使用 Emscripten 单线程系统库，保留主线程帧循环和 ASYNCIFY，不要求 SharedArrayBuffer 或跨源隔离响应头。需要原生工作线程的游戏显式使用 `--threads true`，此时实际托管环境必须支持 SharedArrayBuffer、COOP/COEP。

两个模式都需要真实浏览器 WebGPU 和可创建的设备。游戏壳先检测环境，失败会显示具体报告。`probe.html` 是单线程基础能力探针。静态检查通过不能替代 B 站实际托管及 App WebView 验收。

```powershell
node bin/eve-toy.mjs doctor dist/toy-game
node bin/eve-toy.mjs serve dist/toy-game
```

打开输出的 `/toy/local/index.html`，验证子路径下的游戏及资源加载。本地服务器不添加隔离头。

## Toy SDK 的 EveScript 接口

浏览器插件与引擎静态链接，可直接调用 `eve.ToyPlugin()`；不依赖 Web profile 已裁剪的动态插件加载器。

```squirrel
local toy = eve.ToyPlugin();
local started = toy.begin("getCloudStorage", [["coins", "level"]]);
if (!started.ok) throw started.status.summary;
local token = started.value;

// 在 eve_update 中检查本地完成队列，不会重复发网络请求。
local checked = toy.poll(token);
if (!checked.ok) throw checked.status.summary;
local packet = checked.value;
if (packet.state == "succeeded") {
    print(packet.value + "\n");
} else if (packet.state == "failed") {
    print(packet.error.type + ": " + packet.error.message + "\n");
}
```

`begin(method,args)` 接收 SDK 方法名和位置参数数组。例：

- 能力：`begin("isSupport", ["getCloudStorage"])`
- 云存档：`begin("setCloudStorage", [{coins="100",level="5"}])`
- 结算成绩：`begin("submitScore", [{board=1,score=100}])`
- 榜单：`begin("getRankList", [{board=1}])`
- 用户资料：`begin("getUserProfile", [])`

返回值沿用引擎 Result 投影。异步包 `evengine.toy.request` v1 的状态是 `pending/succeeded/failed`；终态取回后 token 失效。调用者须取回终态或 `cancel(token)`，不得跨页面持久化 token。取消不会撤销已经发送的远程操作。热重载需保留待处理 token 或显式取消。

最多 128 个未回收请求、每次参数/响应最多 256 KiB、30 秒超时。超时的远程提交结果可能未知，插件不自动重试写入。SDK 的 type/code/message（包括限流码 307044）会保留。云存储按关键节点批量提交，榜单按结算事件提交。

首次资料授权、分享等方法仍受官方 SDK 的真实浏览器用户手势要求约束，帧回调不能凭空制造用户激活。平台不支持的能力返回明确失败；没有本地假云存档或假用户资料。桌面插件调用返回 Unsupported。

## 发布预览

先安装并登录 B 站官方 Toy CLI。发布命令参数以已安装 CLI 的实时帮助为准：

```powershell
# 如果 toy 不在 PATH，可指定官方可执行文件：
$env:TOY_CLI = "C:/path/to/toy.exe"
node bin/eve-toy.mjs toy-help
node bin/eve-toy.mjs preview dist/toy-game --title=MyGame
```

preview 先运行预检，再从 `toy --help-json` 验证 create 参数，最后调用官方 `toy create` 创建预览，强制 JSON 且不带 --yes。检查线上游戏和 App 环境后，再通过官方工具提交审核。构建、测试和打包不会自行上传内容。

## 示例、测试与证据

`examples/toy-game` 是可交互的躲避游戏：左右键移动蓝色方块，碰到红色障碍重置回合。启动时实际调用 ToyPlugin 能力检查，首次渲染由引擎 saveFramePng 记录。`examples/sdk-smoke` 是较小的 SDK 调用例。

```powershell
npm test
python3 test/browser_smoke.py http://127.0.0.1:18090/toy/local/index.html
```

浏览器测试需要 Playwright 与 Edge；本机项目内依赖位于 build/tools/playwright。测试检查实际 EveScript 启动、键盘输入，并读取引擎自己写入的 PNG，不使用浏览器截图代替引擎证据。

手工调试底层链接：通过 `-DCMAKE_PROJECT_INCLUDE=<plugin>/cmake/AttachToEngine.cmake` 将外部插件附加到引擎。桌面插件可用本项目 CMakeLists.txt 对匹配 SDK 调用 find_package(EVEngine)；SDK 的公共 API 和 ABI 必须与插件匹配。

详细边界、来源和验收结果见 [docs/module-interface.md](docs/module-interface.md) 与 [docs/validation.md](docs/validation.md)。
