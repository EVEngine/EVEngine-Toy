# Toy 插件边界

这是外部原生插件，不增加 EVEngine 内建模块、引擎 manifest 声明、boot slot 或第二份模块依赖列表。浏览器把注册 TU 静态链接进宿主；桌面使用官方 add_eve_plugin。类名 ToyPlugin 属于插件注册表。脚本显式构造，不使用 getModInst/requireModInst。

- capability in/out：无全局 capability 注入；依赖宿主现有 Module/SquirrelBinding/Value，浏览器依赖官方 window.toy。
- ECS/Link：无 ECS、无跨域实体关系，不改变游戏事实所有权。
- events：不从 Promise 回调进入 VM；Promise 仅发布拥有数据的完成包。脚本主动检查本地队列。
- script bindings：ToyPlugin.begin(method,args)、poll(token)、cancel(token)，统一引擎 Result 投影。
- tool protocol：独立 CLI 产出版本化 JSON 报告；不添加引擎 MCP family。
- build/lifecycle：CMake 外部附加到浏览器宿主。宿主拥有插件实例，JS registry 拥有复制的数据和 Promise。VM 销毁不留下 VM 指针；页面销毁整体释放 registry。SDK completion 经 token 身份与 pending 状态校验，取消和超时后的迟到结果被丢弃。

机制选择：一页一个 SDK provider、低频业务调用、调用者知道请求对象、单次调用独立完成，采用直接调用加 token 完成队列。网络调用只在事件触发时发起，不在每帧查字符串服务或轮询远端；每帧 poll 是已知 token 的本地 Map 查询。

传输：evengine.toy.request v1，拥有 JSON 数据。schema/version 由插件产生，SDK payload 未知字段原样保留；当前客户端只接受自己产生的 v1 包。它不作为存档格式，不恢复旧页面 token。参数先通过 common Value 转换验证，失败不发 SDK 请求。包导出先构造候选目录，检查成功后 rename 发布；失败清理自己的候选。

Toy 的云存档和分数仍由平台拥有，插件不镜像成第二份权威状态。超时或取消无法推断远程写入是否提交；业务自行进行幂等性或结果确认。SDK 可能需要登录、数据授权或真实用户手势。无云存档本地假成功、无网络自动重试。

裁剪：本项目不声称某个引擎内建模块获得 L1-L4 裁剪证明。provider-absent 由 JS 契约测试和原生 Unsupported 路径覆盖；完整插件关闭/开启的引擎链接和实际运行仍须在有完整 SDK 的构建环境补验。没有修改第三方实现。

## 独立导出命令与线程模式

build 命令调用现有 eve zip，归档是游戏输入的唯一权威发布形式。浏览器预加载 /game/game.eve，由原有 PhysFS 挂载流程运行；CMake 缓存不是第二份游戏逻辑实现。生成发布目录仍使用候选目录检查后 rename，构建/归档失败不发布输出。

默认单线程链接从宿主移除 pthread worker-pool 链接选项，改用 Emscripten 单线程系统库；编译后的游戏入口和 ASYNCIFY 保持原来的引擎逻辑。开启 --threads true 时恢复原有线程模式。报告从生成的游戏壳读取实际模式，不把 JS 中出现 pthread 名字误当作共享内存需求。单线程模式不承诺工作线程 API 可用；需要这些能力的游戏必须选择线程模式。
