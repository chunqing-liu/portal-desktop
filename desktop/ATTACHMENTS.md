# 桌面附件与多模态

实现依据：[飞书接入文档](https://d5.feishu.cn/wiki/OmwNwrwt1iM2UmkpPMOcvggQnEe)（2026-10-15 读取，revision 19）及同级 `Beings-Town/channel-gateway-rs/src/attachment_help.json`、附件 API 和消息视图实现。

桌面端每文件上限 128 MiB（134217728 字节，与 Gateway 部署示例对齐；服务端未配置时默认 50 MiB，实际仍受其配置约束），每条最多 100 个文件，拒绝空文件。图片、音频、PDF 等文件是否能够完整解析由 Gateway/Parser 决定；客户端不把解析失败当作成功。Web 端沿用原先的附件发送协议。

## 数据流

1. 发送项按 Being endpoint、场景和附件顺序持久保存到 IndexedDB；每个文件保留稳定上传 key。
2. 桌面选文件和 IndexedDB 队列使用 Blob，不再转换整文件 Base64。主进程接收本地 `/api/attachments?filename=...` 文件字节，分块写入私有临时文件并增量计算 SHA-256 和 MD5；向 Gateway `/api/attachments/uploads` 预登记、从磁盘 Blob 直传 OSS、调用 `/complete`。
3. 创建附件消息视图，然后创建或复用解析任务并绑定到视图。保存附件、消息、job 和结果 ID；已上传的文件不继续在队列保留 Blob 或旧 Base64，兼容升级前的 Base64 队列项。
4. 轮询原 job；只有 succeeded 且结果完整、分页版本和总段数一致时发送。解析等待无固定总超时，单请求有超时，轮询可取消。上下文约 100000 字符，按文件和分段分配；截断明确标为节选。
5. 发送正文、解析资料及 `[attachment-message:v1:msg_<64 hex>]` 引用到 Heart，绝不再发送原件 Base64。附件发送禁用自动 POST 重试；网络异常和 5xx 视为结果不明，保留记录并要求核对历史。
6. Heart 成功接受后标为 accepted。渲染原始消息的 parts；保留 Heart 原始历史中的引用标记。pending 列表补充未进入历史的消息，历史引用恢复已接受消息并按 ID 去重。

解析中重启会复用已登记文件与 job；普通重试不会 force。只有用户手动重试已明确失败的解析，才允许创建新 job。取消只停止客户端等待和发送，不取消 Gateway 中已运行的解析任务。

## 配置与身份边界

默认 Gateway 为 `https://beings.town`，匹配的 Heart origin 为 `https://echo.beings.town`。主进程读取当前 Connection 并注入 Heart Bearer 与 `X-Being-Id`；不使用 Town 登录 token。

自建部署由启动进程环境配置：

- `PORTAL_ATTACHMENT_GATEWAY_URL`：Gateway HTTPS origin。
- `PORTAL_ATTACHMENT_HEART_BASE_URL`：与 Gateway 对应的 Heart HTTPS origin。
- `PORTAL_ATTACHMENT_OSS_ORIGINS`：逗号分隔的额外 HTTPS OSS origins；默认允许阿里云 OSS bucket 域名。

自建 Heart 未配置匹配 Gateway 时拒绝请求，避免把其 token 发往公共 Gateway。渲染层不能选择上游；读写请求固定原 Being endpoint，写请求还必须指向主进程已知场景。OSS 请求不带 Gateway 身份头，不允许重定向。签名地址不返回渲染层或写入持久状态。

下载和预览经过主进程，完整下载验证长度和 SHA-256；音频支持 Range。图片只预览 PNG/JPEG/GIF/WebP，禁止内联 SVG/HTML。解析详情按固定 result ID 分页，完整报告下载地址只取本附件返回的 artifact ID。上传和下载上限为 128 MiB；预览另有格式资源限制（文本 2 MiB，表格限制解压体积和单元格数）；下载从 OSS 逐块传输并校验完整性，本地保存通过临时文件写入、落盘校验及原子重命名完成，不拼接整文件 Buffer。正常完成、失败或取消时清理临时文件，传输预算为 330 秒。

开发 Gateway 可以通过上述配置显式切换到 `https://dev.beings.town`；本次没有新增独立 Dev 安装包或修改发布流程。

## 验证

```sh
npm run typecheck
npx vitest run tests/attachments.test.ts tests/attachment-messages.test.ts tests/attachment-echo.test.ts
npm run test:attachments-ui
npm test
npm run build:web
```

Electron 测试使用合成服务和合成文件，覆盖超过旧限制的 11 MiB 文件实际上传及下载、上传代理、慢解析后刷新复用、文件顺序、图片预览、详情、accepted 历史回显。截图保存在 `test-results/attachments/desktop-attachments.png`。

已使用客户端当前连接的 Being 进行真实样本上传与解析验收，结果及限制见 ATTACHMENTS-TEST-REPORT.md 和 MUSE-ATTACHMENTS-REVIEW.md。自动化合成测试与真实链路验收分别记录。


## 交互与本机文件

- 选择附件仅做本地预览和来源登记，不调用上传接口；点击发送后才上传。
- 文件卡片位于提问气泡上方。上传进度在卡片中展示，解析状态保留在原附件消息中，成功后衔接回复；已发送和已解析不作为常驻状态重复显示。
- 已完成消息使用缓存；附件列表只在初始化或重新进入时按需发现，历史出现新的消息引用时解析引用。只有当前场景仍在处理的外部附件需要定时更新，完成/失败后停止。连接心跳与普通对话同步独立保留。
- 本机 File 经沙箱 iframe → 可信壳层 → preload 的 `webUtils.getPathForFile` 注册，渲染层仅得到随机来源标识。上传字节的 SHA-256 匹配后才绑定附件与原文件。
- 本机或已校验下载的文件，支持格式点击后在右侧栏预览（PDF、PPTX、XLSX、文本及 DOCX 解析内容）；其他格式使用系统应用打开，卡片菜单提供“打开所在位置”。每次操作先校验本机文件；文件丢失或内容变化后回退到下载。
- 非本机附件首次下载弹窗选目录，后续复用；客户端设置 → 通用 → 下载统一更改目录，附件菜单不提供目录设置。下载进度实时显示；落盘文件再次通过 SHA-256 校验后才切换为打开。文件记录及目录存于用户配置目录的 `attachment-downloads.json`。
- 上传流使用 Node fetch 传输 OSS（Electron net.fetch 不兼容该请求流）；其他请求保留 Electron 网络栈，签名 OSS 请求仍禁止重定向及携带 Heart 凭据。

实际样本验收见 [ATTACHMENTS-TEST-REPORT.md](ATTACHMENTS-TEST-REPORT.md)。
