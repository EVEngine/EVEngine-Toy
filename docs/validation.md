# 实际验证记录

日期：2026-10-30。此次结论基于完整 EVEngine 浏览器运行时和真实 EveScript 游戏；早期空 main 的打包试验不作为游戏可用证据。

## 已交付产物

- 发布目录：`dist/toy-game-final/`，根目录是 index.html，含真实 eve.js、eve.wasm、eve.data。
- ZIP：`dist/evengine-toy-game.zip`，28,628,858 字节，9 个根级文件，CRC 校验通过。
- ZIP SHA256：`5e866c0231c652f187f6e6d10a0af029301084280cc4c714b31dcc7aebcf9b24`。
- 构建收据：`build/toy-game/build-receipt.json`，记录实际游戏归档 hash、输入、输出及预检结果。
- 引擎渲染帧：`build/browser-smoke/engine-frame.png`，800x600。
- 浏览器验收：`build/browser-smoke/report.json` 与 `build/browser-smoke-final.log`。
- 构建完整日志：`build/toy-game-export-final-validated.log`。

游戏归档由 PATH 中的真实 `eve zip`（SDK v0.6.0）生成，浏览器宿主由当前 EVEngine 源码构建。使用 Emscripten 6.0.7、CMake 3.29.6、minimal + font、默认单线程链接。不是将 Windows exe 改名，也没有替代运行时或模拟 EveScript。

## 真实浏览器结果

Headless Edge 从 `/toy/local/` 子路径运行，服务器不提供 COOP/COEP：

- WebGPU 设备创建成功。
- crossOriginIsolated=false；SharedArrayBuffer 不存在；requiresThreads=false。
- 真正进入 EveScript eve_init 和帧循环。
- 官方 Toy SDK 的 isSupport 请求通过 JS/C++/EveScript 桥接完成。
- 按下 ArrowRight 后脚本报告玩家坐标移动。
- 引擎自己保存的 PNG 中有 1024 个蓝色玩家像素、1600 个红色障碍像素。
- 无 pageerror、present error 或 render error。测试会拒绝全黑或缺少游戏几何的图片。

这证明了本地浏览器的游戏执行、GPU 渲染、归档加载、输入和 SDK 桥接通路；不等于已在 B 站发布。

## 实测发现并修复的问题

1. 输出父目录不存在时打包失败：自动创建父目录，同时仍拒绝覆盖最终输出。
2. Emscripten 压缩 HTML 会去除属性引号：预检现在能读取实际生成的线程标记。
3. 仅在链接阶段启用异常无法恢复编译时删除的 catch：引擎和依赖 C++ 编译、宿主链接均开启 -fexceptions。最小真实 WASM 回归证明旧配置退出 1、新配置捕获后退出 0。
4. 浏览器 C API adapter 未填 surface usages，导致误判 COPY_SRC：浏览器按 WebGPU canvas 规范配置，原生后端仍查询能力。独立 WebGPU 探针读回 BGRA `[191,128,64,255]`，无验证错误。
5. 截图前没有已呈现帧或 GPU 复制失败却编码黑图：现在正确失败，不再将空图视作成功，也不让不支持回读的 surface 中断正常 present。

引擎修复保存在 EVEngine 的 `codex/toy-webgpu-runtime`，提交 `9beed7683`。插件不修改任何依赖实现或通过头文件覆盖注入实现。

## 检查结果与适用范围

- npm test：21/21 通过，覆盖 SDK 存在/缺失、超时、取消、限流码、预算、CLI 参数发现、打包和构建锁失败路径。
- 真实 Emscripten 异常回归：通过，源码与执行器保存在 test/emscripten_exceptions.cpp/.py。
- 完整引擎 WASM 链接、真实游戏导出：通过。
- 加强后的真实浏览器渲染/键盘验收：通过。
- EVEngine make check：通过，clang-format 18.1.8；完整日志在引擎 build/toy-final-source-check.log。
- ZIP 完整性、入口位置、发布目录预检：通过。

未验证：B 站线上预览和 App WebView、已登录云存档/排行榜、线程模式的浏览器运行，以及 native Dawn 回读测试套件。官方 Toy CLI 未在本次执行真实上传。平台的 ZIP 包体上限是账号相关配置，需要以发布页显示的额度为准；不能假设所有账号都接受相同大小。

## 官方依据

- [Toy SDK](https://www.bilibili.com/toy/publish/sdk)
- [发布指南](https://www.bilibili.com/toy/publish/guide)
- [官方 Toy CLI](https://github.com/bilibili/toy)
- [官方内容检查清单](https://github.com/bilibili/toy/blob/main/skills/toy/references/content-checklist.md)
- [Emscripten C++ 异常合同](https://emscripten.org/docs/porting/exceptions.html)
- [GPUCanvasContext.configure](https://developer.mozilla.org/en-US/docs/Web/API/GPUCanvasContext/configure)

接口使用 common Value/Result 的标准投影；Promise 只持有复制的数据，不回调 VM；终态 token 单次消费。游戏包仍由 eve 拥有格式；发布目录检查成功才发布。未新增 ECS、引擎模块声明或跨域生命周期接口，无架构规则豁免。
