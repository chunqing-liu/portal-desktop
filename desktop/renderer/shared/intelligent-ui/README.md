# Intelligent UI Beta

开启聊天输入框旁的 Beta 开关后，可按条选择“本条使用智能 UI”。只有选中的普通发送或生成中追加消息才附加能力协议及当前界面选择；发送后自动取消，选择不会跨客户端重启保存。排队消息保留入队时的选择，网络重试沿用原请求。没有关键词路由；模型可按任意任务组合组件。本地示例仅用于体验和回归测试。关闭开关后停止注入，历史界面仍可交互。

## 生成与渲染

模型在 `intelligent-ui` 围栏内输出 JSONL v2：begin → state → node → commit。node 可指定 parent，使用稳定 id 更新原节点。完整合法事件逐步显示，错误事件被隔离并保留最近可用界面。仍兼容 JSON v1 文档。真实协议由 `catalog.ts` 和 `context.ts` 维护。

通用组件包括 row/stack/card、图片、文本、指标、输入控件、表格、图表、时间线和 SVG 图解。图解可由模型自由生成 line/circle/rect/path/text，支持部件选择、线宽、填充和 dx/dy 拆解偏移。explodeBind 关联 0..1 状态，连续控制拆解。可选 bicycle 素材提供稳定几何，不限制模型创作其他图形。图片只接受已有 HTTPS 地址或内嵌 PNG/JPEG/WebP，不提供图片生成服务。

需要计算或动画时，app 组件在独立 Worker 内运行 JavaScript，以 ui.render 输出同一套原生组件。ui.onEvent、ui.onTick、ui.save 提供交互、时钟与标量持久化。没有任意 DOM、HTML、CSS、第三方包、网络或 WebGL 接口；不宣称兼容 OpenAI DIL，也不能保证不同 Being 的视觉设计质量相同。

## 状态与体验

交互状态以会话/消息/界面身份存入 IndexedDB，流式更新和展开保留状态。continue 将当前选择放入输入框，由用户发送；选择摘要也可附入下次对话。输入和计算在客户端完成，不增加模型往返。仅 HTTPS 图片可能请求外部图片资源。示例无需网络。

聊天滚动由统一控制器维护，内容扩展时跟随底部；用户向上阅读后停止跟随，回到底部按钮恢复。表格分页，界面支持窄屏和展开。

## 隔离与验证

原生协议仅接受白名单组件与属性，表达式受深度/数量限制。SVG 不接受脚本、外部引用或 HTML。应用代码只在沙盒 iframe 创建的 Worker 中执行，父级校验渲染消息；超时、过量消息和不可见场景受到限制。生成代码无法直接操作聊天 DOM。

验证：`npm run typecheck`；`npx vitest run tests/intelligent-ui*.test.ts tests/markdown.test.ts`；`PLAYWRIGHT_CHANNEL=chrome node tests/intelligent-ui-browser.mjs`；构建后运行 `tests/intelligent-ui-chat.mjs` 和 `tests/chat-scroll.mjs`。浏览器性能数据是本机 headless 测量，不能视为所有设备的延迟保证。
