# 客户端能力与代码 Review

日期：2026-10-20。客户端基线：`1cf523135ae78cd5d9eebe52ec7c33aa4854c264`；Heart Portal：`dd4ee7d3fe30f67d22142353afe77e571548c5f1`。

结论：当前客户端已有完整度较高的桌面基础和本机执行基础。下一阶段应优先巩固权限执行、请求身份、停止确认和产物生命周期，再扩展生成类型。主要问题不是缺少更多工具，而是已有工具、聊天与产物之间的可靠性契约还不一致。

## 范围与证据等级

- 实际阅读：Electron 进程隔离、聊天代理、流式/重放/场景队列、本地预览、插件宿主，以及 Rust 工具分发、命令策略、文件编辑、网页抓取、Relay、MCP 取消、后台回调等关键路径。Web、浏览器、更新与部署作架构抽查，未逐行审计全仓库。
- Muse：按用户指定，通过 Computer Use 观察本机 Meta Muse。实际打开现有生成网页、资源库、目标页；未发送新消息、上传文件或创建任务。没有获得 Muse 内部代码，不据 UI 推断它的沙箱、恢复或幂等实现。
- ChatGPT：查阅并打开官方产物文档。没有把 ChatGPT 桌面应用当作公开源码项目。
- Codex：直接阅读本机 `openai/codex` 源码副本，固定 commit `e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914`；这不是对最新版的逐项兼容声明。
- Heart/Being 服务端不在本次仓库中；模型循环、上下文压缩和服务端幂等能力无法在这里直接审定。
- 本轮修改仅为此报告；没有修改生产实现、运行真实 Being 任务、发布版本或改动用户设置。

## 一、应优先修复的代码问题

P1 表示应在继续扩大自动执行能力前修复；P2 表示会造成明确的可靠性问题。以下不是仅依据函数名提出的猜测。

### F1 · P1：文件、搜索、网页工具的禁用配置没有在执行入口落实

位置：`heart-portal/portal/src/tools/mod.rs:695`，相关列表过滤位于 369、390、521 行。

`tools.file/search/web_fetch=false` 会从工具列表隐藏相应工具，但 `call_with_scene` 的这些分支仍直接调用实现。与 exec、process、screenshot 的执行时检查不一致；RPC `tools/call` 也没有要求工具必须先出现在列表中。

触发条件：已有授权调用者、保留旧工具列表的模型或客户端，直接调用被禁用工具名。不是未认证网络攻击的结论。

无害复现：在临时工作目录中设置 `tools.file=false`，通过真正的 `ToolHost::call("portal_file_write", ...)` 写入哨兵文件，写入成功。源文件与真实工作区未改动。search/web_fetch 的缺失检查由同一执行分支确认。

影响：用户以为已撤回的文件/网络能力仍可被调用；工具列表不能充当授权边界。

建议：统一注册表同时管理 `enabled`、参数校验、调用策略与执行器；每次调用重新核对有效配置。至少补齐 file 四个工具、search、web_fetch 的执行检查，测试“未展示且直接调用也失败”。

### F2 · P1：换行可绕过非空命令白名单

位置：`heart-portal/portal/src/exec_policy.rs:128`、141；执行点 `tools/exec.rs:66` 附近。

校验只识别 `; | &`，随后交给 shell 执行。换行也是 shell 命令分隔符，却没有被分段验证。

无害复现：白名单仅含 `echo`；单独执行 `printf` 被拒绝，但 `echo ALLOWED\nprintf BYPASS_CONFIRMED` 通过实际 `exec::execute` 执行，并输出第二个命令的哨兵。

影响：非空白名单无法约束实际执行的命令。此结论针对 macOS/Unix 上已实测的路径，不把它泛化为所有 Windows shell 行为。

建议：短期采用保守规则，拒绝无法可靠解析的复合 shell 语法；长期区分结构化 argv 执行和任意 shell，shell 使用匹配平台的解析器与明确授权。解释器、脚本文件、重定向与文件访问仍需单独控制，不能把命令名白名单当成操作系统沙箱。

### F3 · P1：网页抓取的本机/内网地址限制可以绕过

位置：`heart-portal/portal/src/tools/web.rs:53`、97、113。

手写 host 解析配合 `IpAddr::parse` 检查字面量，非标准 IP 表示会落入“域名允许”的分支；真正执行请求的 curl 使用另一套解析规则。此外 `-L` 自动跟随重定向，没有逐跳验证目标，DNS 解析后的实际连接地址也不受当前检查约束。

无害复现：只启动临时 `127.0.0.1` HTTP fixture，真实调用 `fetch({url:"http://127.1:<port>/fixture"})`，成功读取 `LOCAL_ONLY_SENTINEL`。没有读取用户实际本地服务或访问内网目标。重定向和 DNS 风险来自代码分析，未进行外部攻击测试。

影响：即使禁用 shell，仅开放网页工具也不能得到代码所宣称的 SSRF 限制。

建议：采用一致的标准 URL 解析，规范化 host；连接前验证 DNS 结果，并确保实际连接绑定到已验证地址；禁用自动重定向或逐跳重新检查；明确代理行为。增加短格式/整数/映射 IPv6、DNS 指向私网、重定向到私网的本地 fixture 测试。

### F4 · P1：普通文本 POST 在结果不确定时自动重发，缺少请求幂等标识

位置：`desktop/renderer/chat/services/runtime.ts:1163`、2134、2149。

附件消息已走不自动重试的路径，普通文本仍用 `fetchWithRetry`，对网络 TypeError 最多重试三次，对 5xx 最多重试一次。请求只有 message/session/scene 等上下文，没有稳定的发送请求 ID 或幂等 header。scene/session ID 不能标识一次发送。桌面代理还会将上游失败转为 502，因此桌面路径同样受影响。

无害复现：mock 服务先记录接收文本，再模拟响应丢失；实际聊天 runtime 自动发出第二次 POST。观察到接收计数 2，body 没有 request_id/client_request_id，header 没有 Idempotency-Key。

影响：在服务端没有额外去重保障时，同一次用户操作可能成为两条消息、两轮生成或重复工具副作用。本次确认客户端重发；没有声称真实 Heart 已发生重复执行。

建议：在 outbox 入队时生成稳定 `client_request_id`，代理透传，服务端持久去重并返回相同 message/turn ID；状态查询也按此 ID 关联。协议配合完成前，把“请求可能已接受”的失败标为 unknown，先对账，不能盲目重发。人工重试也应保留原 ID 或明确作为新任务。

### F5 · P2：停止接口失败也会显示为已停止

位置：`desktop/renderer/chat/services/runtime.ts:2501`，尤其 2516–2522 行。

调用 `/api/stop` 没有检查 HTTP 状态或业务回执；在确认之前已设置 `userStoppedStream`、清空等待与恢复状态。fetch 在收到 500 时正常 resolve，随后本地 reader 被中断。

无害复现：让 `/api/stop` 返回 HTTP 500；实际 runtime 仍得到 `state.streaming=false`，过程记录 outcome 为 `stopped`。

影响：用户会以为远端生成/本机工具已终止，但当前只能证明界面停止读取。网络异常分支也只写 console，缺少清晰的用户可见结果。

建议：明确区分 `stop_requested`、`stop_confirmed`、`stop_unknown`、`stream_detached`。只有服务端确认指定 turn 已停止，才显示“已停止”；失败时保留查询与再次停止入口。进一步验证服务端 → Relay → 工具/进程的取消传播。

### F6 · P2：后台回调的 256 KiB 硬上限并不成立

位置：`heart-portal/portal/src/heart_callback.rs:152`。

`fit_payload` 在序列化超限后把原始输出从 200 KiB 缩到 128 KiB，却没有重新检查 JSON 字节数。控制字符转义后可增长到六倍，其他字段也占预算。

无害复现：200 KiB NUL 输出经真实 `build_callback_payload` 处理，最终 JSON 为 **786,733 字节**，超过声明的 **262,144 字节**。

影响：服务端若按约定限制请求，会拒绝完成回调；413 不会重试，后台工作已完成但主动交付失败。未调用真实回调服务。

建议：对最终序列化结果迭代缩减或二分预算直到满足上限，为 metadata 留出空间；必要时返回截断标记和日志引用。用控制字符、无效 UTF-8、长 command/workdir 测试实际 JSON 大小。

### F7 · P2：网页抓取在完整下载后才截断，不能限制执行内存

位置：`heart-portal/portal/src/tools/web.rs:102`、110–128。

`Command::output()` 先收集完整 stdout，随后按 `max_chars` 截断；该参数本身也没有硬上限。10 秒网络超时不等于响应字节上限。多个并行大响应可能挤占 Portal 内存，拖累文件工具和心跳。

证据等级：代码路径确认；未进行耗尽内存的压力复现。

建议：在流式读取中执行下载字节硬上限，对输出另设模型上下文预算；配置连接/响应/总时长以及全局并发预算。取消时回收执行资源。仓库已经依赖 reqwest，可评估统一 HTTP 执行，避免两套网络策略。

## 二、已有能力与实际差距

| 领域 | 当前已有基础 | 优先补齐的能力 | 主要负责层 |
| --- | --- | --- | --- |
| 生成 HTML/代码 | 文件写入、精确编辑、hash 冲突检测、本地 HTML 沙箱预览与源码切换 | 稳定产物身份、版本、预览检查、同一产物连续修改 | Portal + 客户端 + Being |
| 文档与多模态 | 附件解析、图片/音频、PDF/PPTX 原件预览、XLSX 网格；DOCX 内容预览 | 受管理的生成运行时、布局/公式验证、产物登记与导出 | Portal/Kit + Being + 客户端 |
| 工具调用 | 内建工具、Kit/custom MCP、热更新、取消、并发上限 | 执行时授权一致性、明确副作用/重试规则、调用追踪 | Portal + Being |
| 长命令 | 后台 session、poll/log 游标、stdin write/kill、完成回调；前台有界 head/tail 输出 | 前后台统一执行会话、yield、EOF/PTY 按需补充、重连后的结果对账 | Portal |
| 文件修改 | 规范路径边界、同路径修改锁、单文件原子替换、批量精确替换 | 可审阅 diff、显式增删移、外部写入冲突与变更清单 | Portal |
| 聊天恢复 | SSE、replay、历史缓存、场景队列、202 等待、活动巡检 | 稳定发送/turn/tool ID、停止确认、统一事件状态机 | 客户端 + Being |
| 交互内容 | Intelligent UI schema/Worker、状态保存、受控继续对话；HTML 独立预览 | 两种运行时的统一产物管理和版本语义 | 客户端 |
| 浏览器 | 人可操作的内置 WebContentsView | 模型可用的受控 inspect/action、快照/截图、审批与失败反馈 | 可选 Kit/浏览器服务 |
| 插件生态 | 插件清单、权限、隔离页面、私有存储、agent API、revision/requestId | 工具/技能/产物运行时的能力声明与兼容矩阵 | 客户端 + Portal |
| 本地部署 | macOS/Windows 守护、重连、身份与配套升级、诊断 | 任务级恢复指标、故障注入与真实平台验收 | Portal + 客户端 |
| Web | 复用聊天/Town，支持多场景与静态部署 | 清晰呈现本机能力不可用，避免把同路径当作同一文件 | Web + 协议 |

上述“已有”表示发现实现和相应测试，不代表本轮完成全部真实模型任务验收。尤其图片/视频生成质量、Office 布局、浏览器自动化和真实长任务成功率，没有本次实测数据，不能据此打分。

## 三、如何借鉴 Muse、ChatGPT 与 Codex

### Muse：借鉴产物组织和持续工作入口

本次实机观察到：

- 已生成网页以专门构件卡片出现在聊天中；点开右侧网页，左侧聊天仍保留。
- 同一网页可从资源库找到；资源库提供搜索、构件分类、排序、创建入口，区分文档、网络构件、图片、视频、播客、系统文件。
- 已打开网页有可交互控件；本轮没有测试刷新后的交互状态持久化。
- 目标页有目标类别与计划入口，但当前看到的是创建页，不能据此证明完整目标执行机制。

最值得吸收的是“任务产生一个可持续管理的结果”，不是只把 Markdown 文件链接画得更像卡片。本机 Muse 观察仅覆盖当前安装版本和可见页面；未验证分享/导出菜单行为、真实生成耗时和后台权限。

### ChatGPT：借鉴生成、检查、预览、定点修改的完整流程

官方文档描述了文档/表格/演示/PDF 的预览，以及支持预览上的注释来请求局部修改。当前客户端已经拥有多种阅读器，下一步更有价值的是建立从生成文件到检查结果、选区反馈、修订版本的关联。参考：[Work with files](https://learn.chatgpt.com/docs/artifacts-viewer)。

不能以“装上同名技能”推定拥有同样宿主能力。技能、执行环境、预览桥接、模型工具注册各自需要实现与版本约束。

### Codex：借鉴执行协议与控制机制

本轮阅读的固定源码提供以下参考：

| 参考源码 | 可迁移的设计原则 | 本项目应避免的误判 |
| --- | --- | --- |
| [tools/parallel.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/tools/parallel.rs) | 按工具并行能力入场、明确取消语义、区分等待与执行耗时 | 32 个连接并发槽不等于所有操作都能安全并行 |
| [tools/orchestrator.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/tools/orchestrator.rs) | 审批、沙箱选择、拒绝后的重试集中管理 | exec 开关或命令白名单不等于沙箱 |
| [unified_exec/process_manager.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/unified_exec/process_manager.rs) | 执行会话与进程生命周期有独立所有者 | 不必重写已有 poll/log 游标，应在其上统一语义 |
| [core/compact.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/compact.rs) | 上下文压缩与会话历史一致性 | 客户端历史分页不是模型上下文压缩 |

官方 [App Server 协议](https://learn.chatgpt.com/docs/app-server)适合需要持久会话、事件和审批交互的客户端集成。若未来增加 Codex 后端，应以 adapter 映射 thread/turn/item 与现有场景；不应把每条消息变成一次孤立 CLI 调用。

当前建议继续保留 Being 主链路，先明确前后端契约。是否增加 Codex 后端是产品和认证/部署决策，不是本次 review 自动作出的迁移。

## 四、建议的设计收敛

### 1. 将生成文件升级为持久产物

增加服务端/Portal 签发归属的产物记录，至少包括：

```text
artifact_id, being_id/endpoint, scene_id, turn_id, producer_portal_id,
kind, title, entry, revision, sha256, runtime_version,
validation_status, created_at, updated_at
```

当前 `LocalFilePreviews` 用随机 UUID 和内存 Map 签发短期预览能力，这适合访问隔离，但不是持久 artifact_id。继续保留短期 capability，另建可恢复的产物记录。通过工具结果登记后直接显示卡片，不再依赖模型在最终回复里准确复制路径。

本地绝对路径必须与产出设备绑定；在其他 Portal/电脑上同名路径不能自动视作原件。远端文件需要显式传输、校验摘要、标注副本。预览所用 manifest 应固定本版本入口与依赖，避免编辑中混读新旧文件。

资源库先支持查找、最近使用、按场景筛选、版本与来源；分享/发布等外部动作后续单独设计。

### 2. 建立生成质量闭环

建议流程：选择适用技能 → 检查依赖 → 生成文件 → 登记 → 隔离渲染 → 收集错误/截图 → 修正 → 交付。

第一阶段优先 HTML/SVG；检查加载失败、脚本异常、窄屏溢出、主要交互、离线资源和明暗主题。然后按格式加入 PDF 渲染检查、Office 内容/布局检查、表格公式缓存与重算状态。不要把“工具返回文件路径”当作“产物可用”。

普通 HTML 与 Intelligent UI Worker 保留各自适用范围，统一产物管理。若加入 HTML 状态桥，只暴露 theme/state/resize/选区反馈等少量接口，不暴露任意 IPC、文件系统或直接发消息能力；保留当前无同源权限和网络限制。

### 3. 工具注册、授权与调度统一

ToolSpec 增加并明确使用：enabled、输入 schema、只读/写入性质、资源范围、是否可重试、并行规则、超时、输出预算、取消方式、版本。第三方 MCP 的声明只是提示，最终授权由本机策略决定。

把 `@context/@scenes/@plugins` 这类客户端操作从 shell 文本复用中逐步提取成显式工具：当前 `@` 命令借用 portal_exec，导致读取场景上下文也依赖 exec 开关。显式工具能分开声明和授权，同时保留兼容入口。

工作目录应区分：用户选择的项目根目录、每场景产物目录、临时执行目录。默认给只读/工作区写入权限，扩大能力有清晰授权依据；审批结果需要绑定具体参数和权限范围。

### 4. 执行事实与界面状态分离

为发送、运行、工具调用、产物建立各自稳定 ID。推荐事件 envelope 包含 version、event_id/seq、scene_id、turn_id、call_id、timestamp 和类型化 payload。

客户端可持久化 outbox 与最近游标，但服务端需要提供权威执行状态；断线只意味着 transport 状态变化。对有副作用的工具，用持久调用记录、稳定幂等键或恢复检查处理结果不确定；不能承诺对任意 shell 实现通用 exactly-once。

`runtime.ts` 目前 3,821 行，内部 state/options 大量 any，同时负责 POST、SSE、replay、历史、配置、附件与 UI 过程记录；`scene-runtime.ts` 又维护场景协调状态。先定义类型化事件与纯状态 reducer，分别提取 transport、delivery、reconciliation、presentation，再逐步迁移。不要仅为了缩短文件而拆散仍共享隐式状态的函数。

### 5. 技能和运行时应可发现、可诊断

Kit、UI 插件、技能、模型提供者应有独立概念和版本。技能目录先返回受预算约束的 name/description，适用时读取正文；资源读取限定到受信任包和版本。生成前检查 Node/Python/Office/PDF 依赖及系统权限，返回可操作的缺失项。

Portal 能提供技能文件和执行环境；主 Being 必须真正选择并加载它们。当前 subagent 配置中存在技能相关能力，并不能证明主 Being 已拥有统一技能加载机制。

## 五、落地顺序与验收

| 顺序 | 工作 | 完成判据 |
| --- | --- | --- |
| A：执行正确性 | F1–F7；统一工具入口检查与停止状态 | 被禁用工具直接调用也拒绝；白名单不能跨命令绕过；网页不能访问未授权内网；不确定发送不重复执行；停止失败不显示成功；最终 JSON/下载内存有硬预算 |
| B：产物闭环 | artifact registry、来源绑定、版本、资源库、HTML 预览检查 | 同一场景生成并修改两次仍为同一产物；重启恢复；另一设备同名路径不会误匹配；页面失败能回到同一轮修复 |
| C：协议与恢复 | request/turn/call ID、幂等协议、事件 reducer、callback outbox | 接收后丢响应、Relay 中断、工具已完成但结果未送达、应用重启均可解释和恢复 |
| D：能力扩展 | 技能发现、文档生成依赖、受控浏览器工具、可选后端 adapter | 固定真实任务集稳定通过，能力声明与实际可用一致 |

先建立同输入、同模型配置的基线，再谈性能优化。建议固定任务：生成 HTML 并改两次、制作含公式 XLSX、生成中文 PDF/PPTX、读取大 JSON/SVG、取消长命令、断线恢复、后台任务完成交付、多场景同时输入。

记录：可交付成功率、首次可预览时间 P50/P95、模型往返次数、token/费用、工具等待和执行时长、重试次数、取消确认延迟、重复副作用次数、峰值内存。Muse 的 UI 观测和本项目的单元测试不能替代这组端到端对比。

## 六、本轮验证记录

- `npm run typecheck`：通过。
- 15 个重点客户端测试文件：233 项通过。涵盖聊天 runtime、活动恢复、流历史、用户历史、场景/队列、附件、本地预览、插件及 Intelligent UI。请求中还带了一个不存在的 `proxy.test.ts` 筛选名，不计入已运行文件。
- 原始 Portal `cargo test --locked --bin heart-portal tools::`：95 项通过，267 项未选中；macOS 下有两个已有 unused variable 警告。
- 临时源码副本增加 4 个 Rust 缺陷复现：禁用文件工具仍可写、换行绕过白名单、127.1 抓取本机 fixture、回调超过大小上限；全部确认。
- 直接导入工作区实际 TS 实现的 2 个临时 Vitest 复现：不确定 POST 再次发送、stop 返回 500 仍显示 stopped；全部确认。
- 复现测试通过意味着“确认缺陷存在”，不是修复后回归通过。没有做内存耗尽测试。
- 临时测试最初分别遇到源码副本缺少 include_str 资源、macOS `/var` 与 `/private/var` 路径解析问题，补齐 fixture/规范化路径后成功；不作为产品失败记录。
- 没有运行全部 `test:all`、新一轮 Electron E2E、Windows 实机升级、真实 Being 长任务或模型质量 benchmark。因此本报告不宣称完整产品验收或全面安全认证。

生产修复应在对应层落地：Portal 的兼容分支修复并验证后更新客户端 submodule gitlink；客户端/服务端协议变化需双方配套。不要只改打包二进制而让源码 pin 留在旧版本。
