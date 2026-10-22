# Intelligent UI Beta

开启聊天输入框旁的 Beta 开关后，可按条选择“本条使用智能 UI”。只有选中的普通发送或生成中追加消息才附加能力协议及当前界面选择；发送后自动取消，选择不会跨客户端重启保存。排队消息保留入队时的选择，网络重试沿用原请求。没有关键词路由；模型可按任意任务组合组件。本地示例仅用于体验和回归测试。关闭开关后停止注入，历史界面仍可交互。

## 生成与渲染

模型在 `intelligent-ui` 围栏内输出 JSONL v2：begin → state → node → commit。node 事件可在外层指定 parent，与 op、node 同级，不能写入 node 组件对象。使用稳定 id 更新原节点。完整合法事件逐步显示，错误事件被隔离并保留最近可用界面。仍兼容 JSON v1 文档。真实协议由 `catalog.ts` 和 `context.ts` 维护。

通用组件包括 row/stack/card、图片、文本、指标、输入控件、表格、图表、时间线和 SVG 图解。图解可由模型自由生成 line/circle/rect/path/text，支持部件选择、线宽、填充和 dx/dy 拆解偏移。explodeBind 关联 0..1 状态，连续控制拆解。可选 bicycle 素材提供稳定几何，不限制模型创作其他图形。图片只接受已有 HTTPS 地址或内嵌 PNG/JPEG/WebP，不提供图片生成服务。

需要计算或动画时，app 组件在独立 Worker 内运行 JavaScript，以 ui.render 输出同一套原生组件。ui.onEvent、ui.onTick、ui.save 提供交互、时钟与标量持久化。没有任意 DOM、HTML、CSS、第三方包、网络或 WebGL 接口；不宣称兼容 OpenAI DIL，也不能保证不同 Being 的视觉设计质量相同。

## 状态与体验

交互状态以会话/消息/界面身份存入 IndexedDB，流式更新和展开保留状态。continue 将当前选择放入输入框，由用户发送；选择摘要也可附入下次对话。输入和计算在客户端完成，不增加模型往返。仅 HTTPS 图片可能请求外部图片资源。示例无需网络。

聊天滚动由统一控制器维护，内容扩展时跟随底部；用户向上阅读后停止跟随，回到底部按钮恢复。表格分页，界面支持窄屏和展开。

## 隔离与验证

原生协议仅接受白名单组件与属性，表达式受深度/数量限制。SVG 不接受脚本、外部引用或 HTML。应用代码只在沙盒 iframe 创建的 Worker 中执行，父级校验渲染消息；超时、过量消息和不可见场景受到限制。生成代码无法直接操作聊天 DOM。

验证：`npm run typecheck`；`npx vitest run tests/intelligent-ui*.test.ts tests/markdown.test.ts`；`PLAYWRIGHT_CHANNEL=chrome node tests/intelligent-ui-browser.mjs`；构建后运行 `tests/intelligent-ui-chat.mjs` 和 `tests/chat-scroll.mjs`。浏览器性能数据是本机 headless 测量，不能视为所有设备的延迟保证。

### 校验生成文件

从仓库根目录运行 `node scripts/validate-intelligent-ui.mjs /绝对路径/界面.jsonl`。
支持 JSONL v2、JSON v1 和包含 intelligent-ui 代码围栏的 Markdown，也可传入多个文件。必须显式指定文件，不会回落到内置样例；输出包含实际文件路径和错误详情，失败返回非零退出码。脚本复用客户端 UIStream/compileUI，不执行生成的 app 代码；协议通过不代表算法、联动或内容正确，仍需检查实际交互。

嵌套事件示例：

```json
{"op":"node","parent":"panel","node":{"id":"description","type":"text","value":"内容"}}
```

未知组件属性会报告节点 id、类型和字段；parent 层级错误还会给出修正提示。section.value、slider.value 和 list/checklist 的 items.description 均为合法字段。联动输出必须引用绑定状态，静态说明不会自动随滑块变化。

## 跨轮界面与提交选择

聊天界面按 Being、连接地址和场景隔离 surface。新界面的 begin 可带 surfaceId；旧版未标记界面会获得本地稳定标识。界面持续记录当前选择快照；用户在聊天输入区选择“本条使用智能 UI”后发送，才附带 surfaceId、revision、values 和 app 选择。界面底部不再固定追加继续按钮；Agent 可按任务需要生成有明确目的的 continue 按钮，将内容放入输入框供编辑。普通消息不自动附带智能 UI 上下文。

同一 surface 的新回复需在 begin 中传入 baseRevision。默认 replace 提交完整版本；mode 为 patch 时从上一版本开始，只需输出修改的 node/state，可用 remove 按 id 删除组件及其子树。patch 中省略 parent 保持原父节点；显式 children 替换子树，省略 children 保留子树。节点属性仍按完整节点替换，不是任意 JSON Merge Patch。新增任务使用新 surfaceId。

更新在生成结束、commit 完整且校验通过后整体应用到原界面，新消息显示更新链接。旧版和当前版从聊天历史重建，界面版本菜单允许预览旧版；历史预览的填写不会影响当前选择，也不能提交。新版本保留同类型的已有用户值，并按新控件范围约束；模型 state 初值不会覆盖用户已填的同名字段。版本冲突、无原始界面或非法更新均保留原界面并提示错误。此扩展是客户端自有协议，不宣称兼容 A2UI 的 wire format。

增量文件可通过 `node scripts/validate-intelligent-ui.mjs --base current.json update.jsonl` 使用完整基底进行协议校验；实际场景归属及 baseRevision 冲突由聊天界面的 surface 管理器检查。浏览器回归：`npm run build:chat && node tests/intelligent-ui-surfaces.mjs`。

### 自由组合与受控设计

组件目录、校验器与生成上下文共享 `design.ts` 设计词表。Agent 可使用 `box` 无边框容器、`split` 主次分栏、`grid` 子节点跨列，配合 `appearance` 的 surface/density/gap/emphasis/size/align 调整层级。窄屏分栏和跨列自动折叠；没有新属性的旧文档保持原渲染路径。设计属性为枚举，不接受任意 CSS。

`choice` 提供带说明的原生单选卡片；`badge` 显示短状态；`progress` 显示有上下限的数值。`when` 接收布尔表达式，隐藏时不丢弃已填状态。`button action:set` 的 `changes` 对同一旧快照计算，结果全部合法才一次更新，随后应用输入范围及选项约束。简单交互无需启动 Worker；复杂数组/算法仍使用现有 `app`。没有引入地图或新服务。

模型说明不再指定聚餐、衣橱、计算等任务的固定组件配方。GDP 本地示例使用共享分栏、强调指标和本地操作，其他 Being 生成文档可使用相同能力。已有聊天文档不会自动重排，需让 Being 按新目录生成/更新。当前仍是受约束的组件渲染，SVG 构图质量取决于生成的图元；不是任意网页生成器。

验证：`npx vitest run tests/intelligent-ui-composition.test.ts`；`node tests/intelligent-ui-composition.mjs`（Chrome）。后者检查分栏/跨列、320/375px 响应布局、键盘单选、隐藏输入保留、原子操作及进度联动，并保存截图到 `test-results`。

### 内容组件精修

- `hero`：meta / label / value 组成辅助信息、标题与简介；根节点首项为 hero 时不再重复默认标题。
- `metric`：unit 和 description；纯指标网格在窄屏保留紧凑横排，普通内容网格仍折叠。
- `stepper.range:true`：同一数值的加减按钮与滑条，不重复标签；`segmented.variant:quiet` 提供等宽轻量选项。
- `checklist.items[].group` 分组，`value` 绑定右侧数量表达式；`copyable:true` 复制即时计算结果和勾选状态。改变数量不清空勾选，现有稳定绑定规则不变。
- `timeline.checkable:false`：编号连线和右侧时间；默认可勾选协议保持兼容。
- `callout` 提示块；`button.variant:primary/quiet` 区分通栏主操作与次要操作。

聚餐示例不依赖图片，用共享能力展示完整内容页，并验证人数、食量、摘要、采购和复制的联动。没有增加外部服务或地图依赖。

复制清单及通用 copy 按钮复用共享 CodeClipboard 上下文，桌面聊天走现有宿主 IPC 剪贴板桥接，独立网页使用浏览器 API；只有接口成功返回才提示已复制。

### 多界面上下文与反馈

快照按场景、surfaceId 分开保存。在用户主动选择前，新登记的界面成为默认目标；用户点击或键盘聚焦界面后，目标固定为该界面，其他界面的恢复、动画和后台渲染不会抢占目标。当前目标自己的快照仍持续更新；历史版本预览不改变目标。按消息发送时继续冻结快照用于排队。

快照原文完整发送，不截断 JSON。当前界面选择与结构化操作的总负载上限为 100000 字符；超过上限时停止发送/入队，显示系统提示并保留草稿。普通消息不受未携带的 UI 快照大小影响。

所有智能 UI 共用一条页面级浮动反馈，后一次操作替换前一次并重新计时；拥有当前提示的组件卸载时清理提示。

每个当前场景的已保存界面顶部提供“修改”：选择该界面并为下一条消息启用智能 UI，保留草稿、聚焦输入框，不自动发送。输入框显示目标标题并可取消；发送后取消本条选择。快照包含完整 document、surfaceId、revision、当前 values 及 app 状态，便于优化原页面；历史预览和其他场景不提供此入口。

界面内的 `continue` 按钮和嵌套 app 的继续操作复用同一修改流程：激活来源界面快照、启用本条智能 UI，并把操作描述追加到现有草稿。展开的界面会收起，便于在输入框补充要求；只有用户发送后才提交。
