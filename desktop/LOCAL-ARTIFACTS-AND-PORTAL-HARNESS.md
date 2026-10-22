# 当前对话中的本地文件预览与 Portal 工具优化

日期：2026-10-20。状态：本地源码实现与测试；未打包安装或发布。

## 使用方式

在同一场景里要求 Being 创建 HTML。客户端不向用户消息注入本地文件预览提示词。Portal 文件工具通过工具说明告知保存与预览能力，成功写入或修改后返回 preview_link，模型可在原对话返回该 Markdown 文件链接。客户端先批量检查文件存在、可读、是普通文件、格式支持且未超大小限制，再将 HTML 链接显示为带真实文件名的文件卡片；不存在或不支持的路径保留为普通文字，右键不显示预览操作。新版本检查只读取文件元信息，点击时重新检查。界面与主进程版本不一致时兼容原有预览接口，验证后立即释放临时预览；接口未就绪或检查超时视为未知并有限重试，不冒充文件不存在。点击卡片或右键选择「预览文件」打开右侧面板；继续在左侧提出修改要求，Being 修改原文件，再点击链接或「刷新」读取最新文件。不会为预览创建任务、旁聊、subagent 或后台调度。

预览由客户端渲染器直接识别文件引用，已有历史消息中的链接也可使用，无需重新发送能力说明。旧版已写入历史的隐藏说明仅做兼容清理，不再新增。2026-10-22 增加工具结果入口：成功的 `portal_file_write` / `portal_file_edit` 事件携带结构化 `path` 时，过程记录旁直接显示文件引用，无需等待助手返回链接。文件仍经过原有主进程可用性检查；失败结果、读取工具和网络 URL 不生成产物引用。旧服务端仅返回摘要时继续使用回复中的文件链接。工具卡片属于当前活动记录，尚未新增持久化产物库。

支持绝对路径、file URL、相对于客户端工作目录的文件路径，以及代码行号后缀。Markdown 链接和行内代码中的文件路径可点击。带空格的 Markdown 路径请写成 `[预览页面](</absolute/path/demo page.html>)`。相对路径依赖客户端配置的工作目录，不能把云端容器文件直接作为本机文件预览。

HTML 在沙箱 iframe 内运行，可使用内联 CSS/JS 和文件所在目录内的相对 CSS、JS、图片、字体。独立源码页、刷新、展开、还原、关闭都在当前工作区完成。预览工具栏提供「打开所在文件夹」，由主进程校验文件后通过系统文件管理器定位原文件。仅加载本地资源；远程 CDN、接口请求、嵌套网页、弹窗和页面跳转不受支持。生成复杂联网应用时需要另行设计开发服务器预览。

其他本机格式：PDF、XLSX、PPTX、常见图片、Markdown、CSV、JSON、TXT 和常见文本源码。DOCX 的本机原件预览暂不支持；既有上传附件的 DOCX 解析预览保留。文本上限 2 MiB，二进制上限 128 MiB，HTML 子资源单个上限 20 MiB。

「打开所在文件夹」单独校验实际文件路径和存在性，不受预览格式或大小限制影响。文件被移动/删除、系统访问权限不足、路径无效和接口尚未加载分别提示；其他系统错误写入客户端日志。开发时仅刷新前端不会加载新主进程 IPC，新增定位接口后需要完全退出并重启客户端。旧主进程缺少接口时提示重启，不误报文件不存在。

### 信任与生命周期

- 只有可信桌面 shell 能调用读本地文件的 IPC；聊天 iframe 通过 origin/source/revision 校验发送预览请求。
- HTML 的资源 URL 是短期随机 capability，仅服务该文件目录内允许的静态格式；拒绝越界路径及指向目录外的符号链接。关闭、切换文件、切换场景、过期异步结果都会释放 capability。
- HTML 使用 `sandbox=allow-scripts`，无同源权限、Node、preload、客户端 IPC 或外部网络访问。生成内容不会被插入宿主 DOM。
- 查看/刷新读取真实文件，不修改原文件，也不上传其内容。文件尚未保存、路径错误、格式或大小不受支持时在面板显示错误。

## Codex 源码对照

最初参考官方工具文档；用户明确要求源码后，拉取并阅读 `openai/codex`，固定 commit：`e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914`。以下是独立适配，不是直接导入 Codex crate，也不宣称完整兼容 Codex 工具协议。

| Codex 实现 | 已核对机制 | Portal 本轮处理 |
| --- | --- | --- |
| [tools/registry.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/tools/registry.rs) / [tools/parallel.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/tools/parallel.rs) | 注册与执行分离；按工具并发能力选择读写门控；取消、执行时间记录 | 保留 Portal 已有工具分发和连接级并发上限；新增规范路径上的文件修改锁，不同文件可并发，同一文件防止交叉覆盖 |
| [unified_exec/head_tail_buffer.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/unified_exec/head_tail_buffer.rs) | 有界缓冲保留开头和结尾，显式省略中间输出 | 同步命令边读边限制内存，保留开头与结尾，UTF-8 不截断字符；提供 max_output_bytes、exit_code、duration_ms、total_output_bytes |
| [handlers/unified_exec.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/tools/handlers/unified_exec.rs) / [write_stdin.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/tools/handlers/unified_exec/write_stdin.rs) | exec_command 可让出执行，write_stdin 继续同一进程会话 | Portal 已有 background + process poll/write/kill；本轮没有把它改造成完整的 exec_command/write_stdin 兼容层。同步命令新增进程树所有权，超时/取消释放子进程 |
| [apply-patch/src/file_update.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/apply-patch/src/file_update.rs) / [handlers/apply_patch.rs](https://github.com/openai/codex/blob/e18a20d6eb6f5ede32a69fb56e3fe276d5e9d914/codex-rs/core/src/tools/handlers/apply_patch.rs) | 解析变更、计算替换、回传结果，避免整文件重写 | 扩展原有 portal_file_edit：一个调用最多 64 项精确替换，在内存中全部验证后原子保存；保留旧参数。不是 Codex 的补丁语法解析器，也不提供跨文件事务 |

## 本轮 Portal 行为

- `portal_file_read`：先做有界普通文件读取；全文、offset/limit 都受 `max_bytes` 限制，返回真实路径、SHA-256、总行数。默认仍为 100000 字节，兼容既有调用；模型可选择更小预算。
- `portal_file_write`：覆盖写改成同目录临时文件加 rename，避免预览看到写了一半的 HTML；可携带 `expected_sha256`。返回路径、大小、SHA-256 和 Markdown 文件链接。
- `portal_file_edit`：新增 `edits` 数组；顺序作用于同一文件，全部成功才保存。空匹配、非法 count、无匹配、歧义、超大小或旧版本号都返回可修复错误。同一文件的 Portal 写/改串行，不相关文件仍可并发。仍保留有限的修改后行号上下文。
- `portal_search`：默认剪枝 `.git/node_modules/target/dist/build/.next/.venv/venv/__pycache__`，可用 `include_ignored=true` 或显式目录查询；这是固定目录剪枝，不等于实现完整 `.gitignore` 规则。序列化结果最多约 100000 字节，返回扫描量和截断状态。
- `portal_exec`：同步 stdout/stderr 并行排空，不再把无限输出全部收进内存后截断。输出保留头尾；状态、耗时和总输出量是独立字段。超时和取消通过既有 ProcessOwner 管理普通子进程树。Windows 代码路径复用已有 Job Object，本轮只在 macOS 实跑。

版本校验是本进程内协作保护，不是对所有外部编辑器的文件系统原子 compare-and-swap。输出字节预算不含少量省略标记。没有修改模型、服务端采样循环、上下文压缩算法或任务预算，也没有声称端到端生成速度提升某个百分比。

## 验证

- `npm run typecheck`
- `npx vitest run tests/local-file-preview.test.ts tests/markdown.test.ts tests/file-preview-data.test.ts tests/conversation-search.test.ts`
- `npm run build:chat`
- `npx vite build --config vite.renderer.config.ts`
- `npm run test:local-file-preview`：独立临时 Electron 环境，实际验证点击/右键、CSS/JS、隔离、源码、刷新、展开/还原、缺失文件及对话草稿保留；调用真实定位处理逻辑，替换系统文件管理器回调以记录路径，覆盖旧主进程缺少 IPC 的重启提示和预览后删除文件的提示。`LOCAL_PREVIEW_LEGACY=1` 同时验证旧 preload 缺少批量检查接口。
- `cargo test --manifest-path heart-portal/Cargo.toml -p heart-portal tools:: --no-fail-fast`：包括 UTF-8 MCP 往返、文件批量修改失败不落盘、旧版本拒绝、并发版本冲突、删除首行/全文、搜索预算、进程超时清理。
- Windows 交叉编译尝试停在第三方 `ring` 的 C 编译阶段：本机缺少 MSVC/Windows C 标准头文件 `assert.h`。因此不能将 macOS 测试结果当作 Windows 编译或运行验收。
- 搜索 fixture：1 个源码文件 + 100 个依赖文件，默认仅扫描 1 个文件；显式包含依赖时扫描 101 个。这个是可重复的扫描量证据，不是模型端到端耗时基准。

## 后续完整 harness 工作的边界

真正的模型-工具循环与上下文压缩由 Heart 服务端/模型运行器拥有，Portal 是本机工具执行端。因此不能仅替换 Portal 工具就声称完成整个 Codex harness。后续需要在该服务端另行接入稳定 tool-call ID、采样和工具耗时追踪、读工具并行策略、上下文预算与续跑，以及生成→浏览器截图→检查→修复的评测循环。直接移植最新 codex-apply-patch 还依赖其执行器/路径/沙箱 workspace crates，应单独处理适配与许可证，不能把本轮精确替换工具称作原版 apply_patch。
