# 图片生成回执与原气泡渲染

桌面端支持 `being.image-generation/v1`。Being 用 Heart 原语提交任务并输出 JSON 回执，客户端用当前连接凭据只读查询。无需智能 UI 开关，不经过 Markdown 图片渲染。修正后的完整 seed 在 [docs/seeds/being-service-image-generation.md](../docs/seeds/being-service-image-generation.md)。

## 数据与身份

- 回执只含 Being ID、任务 ID、请求 key、标题和提交结果；严格字段校验，1–24 项、顺序连续、任务和请求 key 不重复。
- 只识别 Being 消息。支持纯 JSON、文字 + 独立 JSON 区块，以及 json / being-image-generation 代码围栏；前后文字按原顺序保留，回执原位替换为画廊。行内代码、引用、普通 JSON、嵌套示例、其他语言代码块不触发查询。
- 流式回执等完整消息结束后才查询；非法回执不发请求，显示修复提示并保留原文，其余文字及合法回执仍正常显示。同消息内相同任务批次不重复查询。
- 回执不与同一 reply 的旁白合并。原始聊天历史保持原样，原气泡由当前 React 组件原位更新。
- 身份为原连接 endpoint、Being、场景和消息；切换/卸载组件会中止 GET 与定时器。刷新从持久聊天历史重建，只 GET 原任务，不提交任务。不持久缓存签名 URL，也不会把轮询结果改写成新聊天消息。
- 本地接口：GET `/api/image-generations/{generation_id}` 或 `/api/image-generations/by-request/{client_request_id}`。要求 `X-Portal-Being-Endpoint` 和 `X-Portal-Generation-Being` 匹配主进程当前连接。
- 主进程注入 `connection.token` 作为 Heart Bearer，Being 头取当前连接。上游固定为 `/api/being-service/v1/generations/...`；不接受模型 URL、自定义认证头、写操作或重定向。响应限 1 MiB，剔除原 prompt 等无关字段，验证返回任务身份和 manifest 的 HTTPS 图片 URL。
- 复用已有 `PORTAL_ATTACHMENT_GATEWAY_URL` / `PORTAL_ATTACHMENT_HEART_BASE_URL` 部署配对配置。默认仅将 echo.beings.town 的 Heart 凭据发给 beings.town；私有 Heart 必须显式配对 Gateway。

## 状态与显示

按响应 poll_after_ms（最少 1 秒、最多 60 秒）串行查询，避免请求重叠。queued/running 显示不定进度和已完成张数，不虚构百分比。succeeded/failed/cancelled 停止自动轮询；uncertain、人工对账要求和 deadline 到期显示待核对。断网/5xx/429 使用有限指数退避，401/403/404/409 等停止并提示手动查询。

成功且可用时，从服务返回的 manifest 选取图片，由 RemoteImage 原生组件展示、放大和下载。签名链接完整保留，不让模型抄写。图片加载错误与任务状态分开，提供重新加载及重新查询；失败、撤销、图片失效都不会触发新的生成。

同一份回执的图片组成一个预览组，按任务及输出顺序排列。打开任一图片后，可用左右方向键或两侧按钮切换，顶部显示当前位置；首尾按钮禁用，不跨批次切换。尚在排队/生成的任务不进入预览，完成后自动加入已打开的组，当前图片保持不变。切换时取消上张图片的加载并恢复适应窗口，下载对应当前图片。桌面顶层预览沿用原图 Blob 通道，组更新验证来源、连接 revision 和组 ID；关闭后更新不会重新打开预览。此功能无需修改 seed 或回执协议。

“生成成功”来自任务 API；缩略图加载成功仅表明浏览器已解码显示，本功能不宣称额外执行下载 SHA-256 校验或内容质量检查。

本次接入桌面主进程。Web 共享渲染器会识别回执并提示在桌面查看，不向外部 Gateway 自动发送 Web 连接凭据。

## 验证

```
npm run typecheck
npx vitest run tests/image-generations.test.ts tests/image-generation-blocks.test.ts tests/chat-stream-history.test.ts tests/attachments.test.ts tests/remote-image.test.ts
npm run build:chat
node tests/image-generations-browser.mjs
node tests/image-gallery-shell-browser.mjs
npx vitest run tests/image-gallery.test.ts tests/remote-image-bridge.test.ts
```

单元测试覆盖协议、身份隔离、固定认证上游、字段过滤、恢复查询、轮询间隔与截止、异常退避、卸载取消。浏览器测试用合成任务和图片验证实际聊天气泡的原位更新、图片加载失败恢复、刷新、窄屏和预览，不产生真实付费生成。

## 旧 Markdown 图片兼容

历史 `![描述](完整链接)` 和引用式 `![描述][id]` 继续使用原图片预览与下载组件，不需要改写历史。旧图片与 JSON 生图回执可以出现在同一条消息，前后顺序及签名 URL 保持不变；跨区块的图片引用定义在整条消息范围内解析。只有生图回执触发任务轮询，普通 Markdown 图片不推测 generation_id。
