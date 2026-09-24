# 星图社区插件化 + 围炉共享机制设计

> 设计日期：2026-09-24
>
> 唯一需求基准：`pipeline/v10-plugin-mechanism-requirements.md`
>
> 文档性质：机制设计，不包含代码实现。本文把需求基准中列出的事实当作硬边界；凡是当前不存在的能力，均明确标注“需客户端新增”或“需 Town 服务端新增”。

## 0. 结论先行

推荐把星图做成一种新的“宿主渲染 Canvas 界面插件”，而不是把现有 React 页面原样作为任意网页塞进客户端：插件声明图模型、字段、操作和数据源，宿主提供受控的 xyflow Canvas、导航、详情面板、Town 连接和生命周期。这样能保留星图需要的节点拖拽、连线、站容器、缩放、专注模式和右键操作，又不把 DOM、CSS、Electron IPC、Town token 暴露给社区插件。

共享机制分两阶段：第一阶段使用“消息即状态”，通过现有围炉 `speak/hear/since/SSE` 跑通，不等待 Town 改服务；第二阶段再增加围炉域文档/操作端点，把消息流作为迁移期回放和降级通道。当前用户可见的首个完整切片应是“最小插件加载器 + 星图插件 + 消息事件同步”；仅做同步层的切片作为内部 spike，不应被描述成已经完成社区插件化。

推荐的协作语义是：围炉成员都能读写项目任务内容，炉主负责项目生命周期和迁移/压缩操作；事件按 Town 服务端围炉 `seq` 排序，节点/字段使用按实体的 LWW（last writer wins），MVP 不引入 CRDT。退出或被移除的成员保留已产生的历史消息，之后的新写入由 Town 成员校验拒绝；其本地缓存只能只读显示并标注可能过期。

## 1. 事实边界与设计范围

### 1.1 已核实、不能推翻的事实

- 星图现在硬编码在客户端 `desktop/renderer/pipeline/`：`page.tsx`、`v4.css`、`models/schema.ts`、`templates.ts`、`bug-fix.ts` 等随客户端构建发布；没有插件运行时加载。
- `desktop/EXTENSIONS.md` 是设计提案，客户端尚未实现插件 SDK、界面扩展加载器或统一插件管理页。已有的是本地 Portal Kit 导入和 Grove Kit 安装。
- 现有界面插件设想是声明式列表、详情卡片、筛选项、设置表单和导航入口；隔离网页面板是条件苛刻且尚未实现的逃生门。声明式组件本身装不下星图的全交互画布。
- `desktop/TOWN-SDK.md` 和 `desktop/ARCHITECTURE.md` 说明客户端已有独立 Town 连接、围炉消息 UI、成员名单、SSE 增量流、Bearer/查询参数鉴权；renderer 当前拿到的是连接状态/变更提示，token 不进入插件或 renderer。
- 需求基准以 2026-09-24 从 `/api/fireside/help` 实测的能力面为准：围炉有 create/join/leave/delete/rename/hear/speak/revise/unsay/members/mentions；没有 KV、共享状态或文档/JSON 数据端点。消息单条上限 32,000 字符，`hear` 支持 `since` 增量，`limit ≤ 200`。
- 围炉成员身份是 `town_id`；being 和人类都在同一消息流内，`via` 可区分来源。围炉是 key 邀请制私密小圈子。
- 星图当前主要状态在 `localStorage`：`PipelineLocalState` 包含 board、demands；评论在 `pipeline_comments_v1` 前缀下另存。`PipelineWritebackPort` 只是空的预留出口，不是已经存在的协作写回。
- 实际画布研究文档位于 `desktop/renderer/pipeline/canvas-research.md`（需求中提到的根目录 `pipeline/canvas-research.md` 不存在）。该研究确认当前连接回调校验、重连、自动平移、统一历史等仍有缺口；它是交互设计参考，不是插件或协作能力的实现证明。

### 1.2 共享与本地的边界

| 应共享的项目数据 | 只保留本地的数据 |
| --- | --- |
| 星轨/任务（Demand）的标题、描述、状态、分组、排序、置顶等协作字段 | 当前选中任务/节点、左右栏折叠、侧栏宽度、专注模式 |
| 工作流实例的节点、闸口、站、站间链接、转换、位置和节点覆盖字段 | 撤销/重做栈、当前 viewport/zoom、临时右键菜单、连接中的手势状态 |
| 评论/批注（如果切片纳入评论同步）及作者 `town_id`、时间 | `last_seen_seq` 这类“本机已读”标记、未发送草稿、错误提示 |
| 事件游标、快照覆盖到的围炉 seq、插件/事件 schema 版本 | `currentUserId` 的本地显示别名；服务端身份仍以 Town 连接为准 |

“同一个围炉看到同一个项目任务”指共享列最终一致，不指每台机器的 UI 视口、选中态或撤销栈完全相同。模板随插件版本提供；共享数据记录所用 `workflowId/flowRevision`，插件缺少对应模板时进入只读降级，不静默换模板。

---

## A. 星图如何打包为社区插件

### A.1 方案对比

| 方案 | 做法 | 对星图交互的覆盖 | 安全/宿主边界 | 改造量与主要前置 | 判断 |
| --- | --- | --- | --- | --- | --- |
| A1 声明式面板 | 只使用 `list/detail-card/filter/settings/navigation` 等已有拟议组件，插件只声明数据和字段 | 不能自然表达 xyflow 节点拖拽、端口连线、框选、多选删除、站容器、专注模式和右键菜单 | 最容易统一渲染，但只能退化成任务列表，失去“星图”本体 | 中；仍需实现 Registry、manifest、Host API；不需要开放任意 JS | 不推荐作为星图主界面，可作为无画布的移动端/降级只读视图 |
| A2 隔离网页面板 | 把当前 React/xyflow 页面编成插件资源，在独立来源 iframe/web 面板中运行，通过受限消息桥访问宿主 | 覆盖最好，现有 Canvas 代码复用最多 | 必须有独立来源、CSP/渲染器隔离、大小和频率限制、生命周期撤销；网页不能拿 preload、IPC 或 Being/Town token | 大；隔离网页面板和桥接均是“需客户端新增”，且要补足安全契约测试 | 可作为迁移过渡或受控实验通道；不应绕过未实现的安全条件直接公开 |
| A3 宿主 Canvas 组件（推荐） | 在声明式组件模型上新增已实现枚举 `component: "canvas"`/`source: "town.fireside.star-map"`；插件声明图模型、节点字段、操作和数据源，宿主统一运行 xyflow、画布手势、详情/列表和 Town 适配器 | 能覆盖星图所需的 Canvas 交互；宿主逐项开放拖动、连线、重连、布局、站容器等能力 | 插件不接触 DOM/CSS/Electron IPC，不任意 `fetch/exec`；Host 控制数据、连接代次、取消和权限 | 大，但边界清晰；Canvas Host、声明 schema、同步 API、插件 SDK 均“需客户端新增” | 推荐的公开路线；是对 EXTENSIONS.md 声明式模型的受控扩展，不是放开任意插件 JavaScript |
| A4 “内置页面换个名字” | 保留 `page.tsx` 作为客户端固定路由，只在 Grove 中发布安装说明 | 交互完整 | 没有真正的插件隔离、版本独立更新或卸载语义 | 小，但不满足“下载安装才有星图” | 不接受；只能作为迁移前基线，不能当最终方案 |

### A.2 推荐方案：宿主 Canvas 组件

A3 对应 EXTENSIONS.md 所说的“扩展插件组件模型，新增 canvas 类组件”：不是把星图压扁为列表，也不是把任意网页脚本放进主窗口，而是增加一个由宿主实现的、能力枚举受控的 Canvas 贡献点。推荐的插件清单可以是：

```json
{
  "schemaVersion": 1,
  "id": "community.star-map",
  "name": "星图",
  "version": "0.1.0",
  "requires": {
    "pluginApi": "^1.1.0",
    "hostFeatures": ["canvas.graph.v1", "town.fireside.sync.v1"]
  },
  "capabilities": [
    "town.fireside.read",
    "town.fireside.write"
  ],
  "contributes": {
    "panels": [{
      "id": "star-map",
      "title": "星图",
      "component": "canvas",
      "source": "town.fireside.star-map"
    }]
  }
}
```

这里的 `canvas`、`canvas.graph.v1`、`town.fireside.sync.v1` 只有在客户端真正实现并列入宿主枚举后才能写入可发布 manifest；在此之前写入只是未实现声明，不能激活插件。插件不携带 Town token，也不直接调用 `fetch`；所有读写由 Host 绑定当前插件版本、激活代次和 Town 连接代次后执行。

### A.3 从硬编码状态迁移的分步路径

#### A0：拆共享域模型，不改变用户行为

1. 从 `desktop/renderer/pipeline/models/` 抽出纯 TypeScript 的 `StarMapSharedDocument`、命令/事件类型、归一化和迁移函数；把 `PipelineLocalState` 拆成共享文档与本地视图状态。
2. 保留当前 `page.tsx` 作为临时适配器，继续使用 `localStorage`，但存储通过 `LocalStarMapStore` 接口进入，而不是让组件直接决定未来 Town 结构。
3. 将 `pipeline_comments_v1` 明确归类为本地评论或纳入共享命令；如果切片声明“大家看到同一份任务”，应把评论同步列入同一共享文档，不能继续默认为跨成员可见。
4. 把 `PipelineWritebackPort` 改成同步适配器抽象的占位接口。当前没有 Town 写回，不应把空对象误报为已支持协作。

**状态：需客户端新增抽象和迁移测试；不改 Town 服务。**

#### A1：最小插件宿主与 Registry

1. 实现 `desktop.plugin.json` 解析、schema 校验、来源/版本/依赖记录、能力枚举检查和命名空间冲突检查。
2. 实现本地插件目录加载、停用、激活代次、请求取消和错误隔离；先不支持任意脚本组件，只支持宿主已实现的贡献类型。
3. 增加统一插件管理页和导航入口。插件未安装时不显示星图入口；已有本地星图数据不得被删除，可显示“插件未安装，数据保留在本机”。
4. 将“公开卷轴”继续作为声明式组件的 conformance 示例；它验证 Registry/只读 Host API，不证明 Canvas 能力完成。

**状态：全部为需客户端新增。**

#### A2：Canvas Host 与星图插件适配

1. 宿主提供 Canvas 容器、列表/详情槽、键盘焦点管理、错误和加载态；插件只提供节点/站/边类型、字段定义、命令和模板。
2. 先把 `page.tsx` 中的渲染和操作拆为 Host 可承载的 Canvas 模块，再把 `v4.css` 改为插件命名空间样式或宿主 token；不允许依赖主窗口内部 DOM 类名。
3. 将当前 xyflow 行为逐项映射为 Host capability：拖动、框选、端口命中、连接预览、连接校验、重连、自动布局、删除/复制、撤销/重做。
4. UI 偏好、选中和 viewport 留在插件私有存储；共享状态只通过同步适配器提交命令。

**状态：Canvas Host、插件私有存储和 capability 均需客户端新增。**

#### A3：接入围炉同步

先接消息即状态（见 B），让 Host 通过已有 Town 连接触发 `hear(since)`，再把适配器接到星图插件。插件不直接持有凭据；同一 Town 连接切换身份、离开围炉或停用插件时，Host 取消旧订阅和迟到结果。

#### A4：社区分发和版本治理

通过 Grove 发现 GitHub Release/插件包，暂存、校验、安装、升级和回退沿用 EXTENSIONS.md 的生命周期；插件升级不需要重新发布客户端，但需要客户端已经实现兼容的 plugin API。

### A.4 是否把星图作为“最小社区界面扩展”的首个真实案例

**推荐：是，但要调整原实施顺序。** 星图能尽早暴露“声明式界面不够表达复杂交互”的真实边界，比继续用一个简单列表示例假装能力足够更有价值。调整后的顺序：

1. 原生 Kit 管理（保留 EXTENSIONS.md 第一步）。
2. **新增 Canvas Host 和 Host/Town 只读同步桥的最小骨架（需客户端新增）**；同时保留公开卷轴作为声明式 smoke test。
3. 实现 manifest/Registry/Host 生命周期和本地目录加载。
4. 以星图作为首个 Canvas 插件，先本地加载，再接消息即状态。
5. 完成 Grove 分发、版本锁定、升级回退和兼容工具。
6. 隔离网页面板仍作为独立后续能力，不作为星图公开版的隐式依赖；只有 Host Canvas 无法覆盖的第三方 UI 才评估它。

### A.5 风险清单

- **范围膨胀**：Canvas Host 一次性支持所有 xyflow 能力会把插件项目变成画布平台。建议先锁定星图已有的站、节点、边、状态、详情和评论，条件分支/模板市场等放到后续 capability。
- **伪插件化**：只移动文件路径或在客户端保留固定路由不算插件。验收必须包含“未安装不出现入口、安装后 Registry 加载、停用后入口和订阅消失、升级失败保留旧版本”。
- **不安全的网页逃生门**：A2 不能在隔离条件未完成前以开发便利为由公开任意 JavaScript；否则破坏 ARCHITECTURE.md 现有 iframe/preload 信任边界。
- **模板漂移**：插件版本缺少共享数据使用的模板时，不能静默按当前默认模板重绘；应显示只读降级和需要升级的原因。
- **本地数据误删**：插件卸载与“删除共享/本地数据”分开；默认卸载只撤销贡献和订阅，保留星图文档和缓存。

---

## B. 围炉共享数据机制

### B.1 三种方案对比

| 方案 | 数据路径 | 今天能否实现 | 一致性/冷启动 | 非插件成员体验 | 长期判断 |
| --- | --- | --- | --- | --- | --- |
| B1 Town 服务端文档/操作端点 | Town 为每个围炉保存星图文档或操作日志；客户端读写专用端点 | 不能；全部端点和服务端权限均为需 Town 服务端新增，SSE 事件也需补协议 | 最容易做服务端版本、全量读取和冲突返回；新成员 GET 一次即可启动 | 围炉普通消息中不出现机器 JSON；最好 | 长期目标，但排期和协议风险最大 |
| B2 消息即状态 | `speak` 发星图操作事件，`hear(since)` 回放，SSE 只做唤醒；快照以普通消息追加/必要时由作者 `revise` 自己的快照 | 可以利用现有 Town API；仍需客户端新增插件 Host 的消息适配、分页和事件正文桥 | Town `seq` 提供天然总序；新成员从最新完整快照 + 后续事件启动；需处理 32k 上限和消息增长 | 会看到可读的 `[星图] ...` 原始消息及紧凑 JSON；无法隐藏 | 推荐 MVP，作为迁移层；不把消息流误称为 KV |
| B3 混合 | 先 B2；Town 端点上线后由 Host 双读/迁移，旧消息做历史回放/降级，新写入切换端点 | 第一阶段可以，第二阶段需 Town 服务端新增 | 可以逐步迁移而不清空已有围炉；需要明确 cutover 和重复提交规则 | 迁移前后都能阅读；非插件成员仍可能看到旧事件消息 | 推荐长期路线：B2 验证产品，B1 承担规模和隐私 |

**推荐：B2 先行、B3 目标。** 需求基准明确 Town 目前只有消息系统，不能把 B1 当成现有能力；同时直接等待 B1 会无法验证“围炉成员共享同一个星图”。

### B.2 共享文档与事件边界

建议把当前 `PipelineLocalState` 映射为下列共享文档（字段名可在实现时落到现有模型，不要求现在改代码）：

```ts
type StarMapSharedDocument = {
  schemaVersion: 1;
  pluginId: "community.star-map";
  boardId: string;
  firesideId: string;
  workflowCatalogVersion: string;
  demands: Demand[];
  comments: PipelineComment[];
  coveredThroughSeq: number;
};
```

`selectedDemandId`、viewport、侧栏宽度、`last_seen_seq`、撤销栈等不放入共享文档。`currentUserId` 不由共享文档决定，渲染时取当前已确认的 Town 身份。共享文档必须保留 `workflowId` 和 `flowRevision`，以便不同插件版本判断是否能安全编辑。

事件使用“一个用户动作一个业务操作”的粒度，不发送每一帧拖动坐标：

```json
{
  "kind": "star-map.event",
  "schemaVersion": 1,
  "boardId": "board-7f3a",
  "eventId": "town:<actor-town-id>:<client-local-id>",
  "actorTownId": "town-...",
  "baseSeq": 184,
  "op": "node.patch",
  "target": { "demandId": "star-track-1", "nodeId": "N02" },
  "patch": { "status": "testing" },
  "clientCreatedAt": "2026-09-24T03:00:00.000Z"
}
```

允许的 `op` 初始集合应有限且可校验，例如 `board.init`、`demand.patch`、`node.patch`、`station.patch`、`edge.add`、`edge.remove`、`position.commit`、`comment.add`、`comment.remove-own`、`snapshot.publish`。事件 ID 用于客户端去重和重试，不把 hash、冻结 contract 或额外 baseline 当作一致性前提；服务端围炉 `seq`、实体 ID 和普通测试足以支撑 MVP 的顺序与幂等处理。

### B.3 消息即状态的消息格式与回放

#### 事件消息

由于 Town `speak` 是纯文本，消息正文采用可读前缀加机器段，示例：

```text
[星图·事件 v1] 星轨「支付接入」：N02 状态 → 测试中
{"kind":"star-map.event","schemaVersion":1,"boardId":"board-7f3a","eventId":"town:...:c91","actorTownId":"town-...","baseSeq":184,"op":"node.patch","target":{"demandId":"star-track-1","nodeId":"N02"},"patch":{"status":"testing"}}
```

第一行保证未安装插件的成员至少能读懂“谁的哪条任务发生了什么”；机器段不放 token、完整身份凭据或任意 URL。事件应保持紧凑，建议单条远低于 32,000 字符；若单次批量编辑超过上限，拆成多个有序事件，不把整份文档塞进一条消息。

#### 快照消息

快照是压缩回放用的普通消息，不依赖修改他人消息：

```text
[星图·快照 v1] board=board-7f3a coveredThroughSeq=240 part=1/1
{"kind":"star-map.snapshot","schemaVersion":1,"boardId":"board-7f3a","coveredThroughSeq":240,"state":{...}}
```

快照由任何仍在围炉中的客户端按事件数量或冷启动成本发布；多个快照并存时选择 `seq` 最大且完整的一份。若超过消息上限，按 `part/partCount` 分片；缺片时放弃该快照，从下一份完整快照或更早事件重建。`revise` 只能由原作者编辑自己的消息，可用于该作者维护的最新快照，但不能依赖它实现跨成员覆盖，也不能删除别人的历史操作。

#### 新成员冷启动

1. Host 先确认当前 Town 身份和围炉成员资格，再读取本地游标/最新快照元数据。
2. 从 `hear(since=<snapshot-seq>, limit=200)` 循环读取，直到返回页不足 200；若有完整快照，先加载快照，再按 `seq` 回放其后的事件。
3. 没有快照或快照缺片时，从最早可读游标回放；回放遇到未知 schema/op 时保留原消息、记录降级原因，不把整个项目清空。
4. 回放完成后显示“已同步至围炉 seq N”。如果期间收到新的 SSE 房间变更，继续从最后游标补齐，不重复应用同一 `eventId`/`seq`。

现有客户端的普通围炉页面只读最近窗口、SSE renderer 侧目前只收到房间级变更提示；“按游标循环 `hear` 并把正文安全交给插件 Host”是**需客户端新增**，不能引用现有页面已经做到来替代。

#### 实时与离线

- Town SSE 只需作为唤醒信号：Host 收到该围炉有新内容后，使用最后的 `since` 调 `hear` 获取正文。这样不会把 token 或任意消息正文直接暴露给插件。
- 目标体验是网络正常时通常在一次 SSE + 一次 hear 后更新，预期秒级；Town 当前没有端到端延迟承诺，不能把“实时”写成硬 SLA。
- SSE 断开时不发送“已同步”；页面重新打开、身份重新确认、网络恢复时从本地游标 catch-up。事件消息写入未确认时保留本地待发送草稿，不自动重发有副作用操作。
- 游标是客户端按 `firesideId/boardId/pluginId` 分区保存的普通状态，不上传到共享正文，不把房间级通知计数误当成未读消息数。

### B.4 Town 端点方案（B1/B3 的目标形状）

以下不是现有 API；每一项都标为**需 Town 服务端新增**。命名沿用现有 `/api/fireside/*` 风格，最终路径以 Town 评审为准。

| 端点 | 形状 | 语义 |
| --- | --- | --- |
| `GET /api/fireside/state?fireside_id=<64hex>&project_id=<id>` | 返回 `{project_id, schemaVersion, revision, snapshot, updated_by, updated_at}` | 只允许当前围炉成员读取；新成员加入后用它做全量冷启动 |
| `GET /api/fireside/state/events?fireside_id=<64hex>&project_id=<id>&since=<seq>&limit<=200` | 返回按服务端顺序排列的操作和 `next_since` | 断线补齐、调试和迁移；响应必须能安全重复读取 |
| `POST /api/fireside/state/operations` | `{fireside_id, project_id, base_revision, event_id, op, payload}`；成功返回 `{revision, fireside_seq}`，过期返回 `409` 及当前 revision | 服务端校验成员、schema、实体和大小；`event_id` 幂等 |
| `POST /api/fireside/state/snapshots` | `{fireside_id, project_id, covered_revision, state}` | 成员可请求压缩；炉主或服务端任务负责最终提交/保留策略，不能覆盖较新的 revision |
| Town SSE 新事件类型 `f:state:<fireside_id>:<project_id>` | 只携带 revision/seq，不携带凭据 | 让现有客户端及时触发 GET/events；**需 Town 服务端新增 + 需客户端新增** |

冲突建议采用“服务端 revision + 事件操作”而非客户端直接覆盖整份 JSON：

- `base_revision` 只是乐观提示，不是安全边界；服务端以成员资格、schema 和实体权限为最终判断。
- 同一实体的并发 patch 可按服务端接受顺序 LWW；若产品希望阻止静默覆盖，则返回 `409`，客户端展示冲突并让用户重试。MVP 选 LWW + 被覆盖提示，减少阻塞。
- 快照只能覆盖不晚于自身 `covered_revision` 的历史；服务端保留最新快照和之后的操作，定期压缩历史。
- 新成员读取 state 后再读取 `revision` 之后的 events；若期间 revision 变化，循环直到稳定，避免“读全量时漏掉尾部事件”。

### B.5 冲突策略推荐

| 策略 | 优点 | 问题 | 建议 |
| --- | --- | --- | --- |
| 客户端时间戳 LWW | 实现简单 | 时钟不一致；离线旧操作可能覆盖新状态 | 不采用 |
| 围炉 seq 单调序 LWW | 使用 Town 已有事实；重放可确定；跨机器时钟无关 | 离线操作上线后可能按到达顺序覆盖；需给用户提示 | **MVP 推荐** |
| 严格 `baseSeq`/revision 拒绝 | 不静默覆盖 | 频繁 409，协作摩擦高；消息模式难以撤回已发事件 | 端点阶段可作为“敏感字段/炉主操作”选项 |
| 简单 CRDT | 离线合并强 | 对站/节点/边/模板语义复杂，测试和包体显著增加 | 当前不做；出现大量离线并发后再单独立项 |

节点编辑天然是“整节点/字段 patch”，因此按实体 `target` + Town seq 的 LWW 足以覆盖 MVP。对位置拖动只在 pointer-up 提交一次 `position.commit`，避免一段拖动生成数百条消息；被覆盖的本地未发送草稿应提示“远端更新已到达”，不能静默丢掉。

### B.6 风险清单

- **消息增长**：事件很多会增加围炉历史和冷启动时间。用按阈值发布快照、分片、游标回放控制；不把每帧 UI 变化写入消息。
- **32k 上限**：快照分片必须有完整性检查（part 数量/长度/顺序）；缺片时回退事件，不假装快照完整。无需额外 hash contract。
- **普通成员看到机器文本**：这是 B2 的明确代价；前缀必须可读，机器段不得包含凭据，产品文案要说明未安装插件仍会看到星图事件。
- **SSE 只有提示**：现有 renderer 不拿正文；若只接变更计数而不补 hear，插件会漏数据。Host 适配器必须以 `since` 为唯一 catch-up 依据。
- **跨版本回放**：旧插件可能重写整份快照而丢失新字段。遇到更高 major schema 时强制只读，禁止发布快照/覆盖写。
- **消息投递不确定**：`speak` 未收到确认时保留草稿并要求用户核对；不使用自动重试避免重复操作。`eventId` 只用于服务端/客户端去重，不替代用户确认。
- **Town 端点与 B2 双写重复**：迁移时必须有明确的 cutover marker 和 `eventId` 映射；未定方案前不要同时向两条写路径静默写入。

---

## C. 权限模型

### C.1 方案对比

| 方案 | 读取 | 写入 | 优点 | 风险/限制 |
| --- | --- | --- | --- | --- |
| C1 全体成员读写（推荐） | 围炉成员 | 所有成员可改任务字段、节点、站和评论；炉主管理项目生命周期 | 符合“同一围炉共同做项目”；服务端只需复用成员资格 | 误改/覆盖要靠事件记录、撤销和 LWW 提示；不能假设每个成员都装了插件 |
| C2 炉主写入、成员只读 | 围炉成员 | 仅 owner 可改 | 权限简单、误改少 | 不符合协作工作流；所有操作必须经炉主，being/人类协作价值下降 |
| C3 节点创建者写入 | 围炉成员 | 谁创建谁可移动/删除，其他人只能改状态/评论 | 有归属感 | 交接、离职、being 代操作和批量整理复杂；Town 当前没有节点级 ACL |
| C4 端点阶段细粒度 ACL | 围炉成员 | project/board、demand、node、comment 分级授权 | 适合大团队和敏感项目 | 需要 Town 服务端新增权限模型，MVP 成本高 |

### C.2 推荐的最小权限矩阵

| 操作 | 围炉普通成员 | 炉主 | 非成员/退出成员 |
| --- | --- | --- | --- |
| 查看共享星图 | 允许 | 允许 | 拒绝网络读取；本机旧缓存只读且标注过期 |
| 新建/修改/移动任务、节点、站、边 | 允许 | 允许 | 新写入拒绝 |
| 发布事件/评论 | 允许 | 允许 | Town `403`/成员校验拒绝 |
| 创建首个星图项目、绑定/解绑围炉、删除项目 | 只读请求/无权限 | 允许 | 无权限 |
| 发布快照/触发迁移 | 允许请求压缩；不覆盖更新 revision | 允许最终确认 | 无权限 |
| 读取成员名单 | 复用现有 Town 成员接口 | 允许 | 按 Town 现有权限 |

“谁创建的节点谁才能移动”不作为 MVP 的权限边界；事件仍记录 `actorTownId`，后续可在 UI 显示作者/最后修改者。若未来需要敏感节点 ACL，应在 Town 端点阶段新增服务端授权，而不是靠插件自行隐藏按钮。

### C.3 退出、移除与历史语义

- 成员退出或被移出围炉后，已经产生的历史消息不会被星图插件删除；其他仍在围炉中的成员继续看到历史操作。
- 离开后本地缓存可以保留，但进入只读状态，显示“已离开围炉，数据可能不是最新”；不能继续向消息或端点写入。
- 重新加入同一围炉后，必须重新通过成员资格校验并从当前快照/游标 catch-up，不直接信任旧本地权限状态。
- 消息 API 当前由 Town 服务端判定成员权限；插件不能仅凭 UI 上一次 `members` 列表决定可写。端点阶段同样以每次请求的服务端成员校验为准。

### C.4 插件如何证明自己在围炉里

插件不自行保存或解析 Bearer/token，也不直接调用 Town。流程如下：

1. 用户在宿主 Town 面板选择围炉；宿主已有的 Town 连接代次和 `firesideId` 进入 `FiresideContext`。
2. Host 用受控 Town adapter 读取成员名单/事件，并把当前 `membership: "member" | "not-member" | "unknown"` 和显示用 `townId/displayName`（如确有需要）给插件；token 永不进入插件。
3. Host 的 `readSharedState`/`appendOperation` 内部重新带上连接代次和围炉 key，身份切换、离开页面、停用/升级时取消旧请求并丢弃迟到结果。
4. 服务端仍是最终权限裁判：消息 `speak` 或未来 operation endpoint 返回 401/403 时，Host 显示鉴权/成员错误，保留未确认草稿，不自动重发。

上述 `FiresideContext`、Host 操作 API 和正文筛选桥均为**需客户端新增**；Town 服务端只负责复用现有身份/成员校验（端点阶段再新增 state 权限）。

### C.5 风险清单

- **客户端按钮冒充权限**：隐藏“删除”不能代替服务端拒绝；所有写操作必须处理 403。
- **owner 信息来源不明**：现有需求只确认 owner 创建时自动加入；如果成员接口没有返回规范 owner，owner-only 操作必须在 Town 端点新增字段/校验，不能由显示名推断。
- **being 与人类混写**：两者都以 `town_id` 作为作者，UI 显示 `via`，不能把“客户端代发”误当作更高权限。
- **撤销权限**：消息系统的 `unsay/revise` 只适用于 API 允许的消息所有者语义；星图撤销应优先发布反向业务事件，不尝试删除他人消息。

---

## D. 分发与版本

### D.1 Grove 来源与插件包形态

当前 Grove 事实是：`kind=app` 只打开经过校验的 GitHub 仓库或 Release，不走 Portal Kit 安装；Portal Kit 的 `manifest.json` 仍服务于工具/MCP。星图是界面插件，不能把它伪装成 Kit，也不能因为包里含 `desktop.plugin.json` 就声称已被 Portal 运行时加载。

| 分发方式 | 复用当前能力 | 用户体验 | 是否需要新增服务/客户端能力 | 判断 |
| --- | --- | --- | --- | --- |
| D1 继续 `kind=app`，打开 GitHub Release，用户手工导入插件目录 | Grove 目录和 Release 跳转可复用 | 能发现但安装断裂；适合开发版/早期验证 | 需客户端新增“界面插件本地导入”；Town 服务端不一定要改 | 可作为切片 1/2 的临时入口 |
| D2 新增 `kind=interface`（推荐正式语义） | 复用 Grove 元数据、Release 和来源记录 | 明确表示是界面插件，可下载 `.desktop-plugin.zip`，由插件 Installer 暂存/校验/激活 | Grove kind 枚举/帮助和客户端 Registry/Installer 均需新增；若 Grove 服务端校验 kind，则是**需 Town 服务端新增** | 正式社区分发路线 |
| D3 和 Portal Kit 同包 | 可共用一个 Release | 用户容易误以为 MCP 工具已安装/已运行；Kit 生命周期和界面插件生命周期耦合 | 需要同时满足两套 manifest 和运行时 | 不推荐；仅当作者确实还有独立工具时以两个独立贡献声明共包 |

**推荐：正式使用 D2；在 `kind=interface` 尚未被 Grove 接受前，用 D1 做开发版降级。** D1 的条目应明确显示“打开 Release / 手动导入界面插件”，不能显示成“已安装”。

推荐插件包为独立的 `.desktop-plugin.zip`，至少包含：

- `desktop.plugin.json`：插件 ID、版本、pluginApi、hostFeatures、能力和 Canvas contribution；
- schema/模板/迁移说明：不携带任意主进程命令或未声明 URL；
- README、许可、变更说明和兼容矩阵；
- 若未来允许隔离网页面板，才包含经过 CSP/来源校验的 web 资源；A3 Canvas 路线首版不要求任意网页脚本。

Installer 沿用 EXTENSIONS.md 的暂存、固定版本、校验、原子切换、权限增加重新确认和旧版本回退。包摘要只用于检测下载内容变化，不能替代发布者身份验证；Grove 没有签名/可信摘要时应明确验证范围。

### D.2 客户端 plugin API 版本

- `desktop.plugin.json.schemaVersion` 是清单格式版本；`requires.pluginApi` 是宿主公开 SDK 版本；事件的 `eventSchemaVersion` 是共享数据协议版本，三者不能混成一个数字。
- plugin API 遵循语义化版本：主版本不兼容则阻止激活并解释原因；次版本向后兼容；补丁版本不改变契约。
- `capabilities` 只能请求宿主已实现枚举。`town.fireside.read/write`、`canvas.graph.v1`、`town.fireside.sync.v1` 在未实现前不能由 manifest 自行开启。
- 异步请求绑定插件版本、激活代次、Town 连接代次和 `firesideId`；升级/停用/身份切换后取消旧请求，丢弃迟到结果。

### D.3 围炉成员插件版本不一致

共享事件正文必须带 `schemaVersion`，并按下列兼容规则处理：

| 场景 | 旧版本行为 | 新版本行为 |
| --- | --- | --- |
| 同一 major，新增可选字段 | 读取已知字段，保留未知扩展；继续写 v1 兼容字段 | 写入仍兼容旧读者的最小字段集 |
| 未知 `op` 但不影响现有视图 | 忽略该操作、保留原消息和诊断记录 | 不要求旧客户端理解新操作 |
| 发现更高 major schema 或无法保留未知字段 | 进入只读降级，禁止发布快照/整文档覆盖；提示需升级 | 可继续读取旧事件；写入前检查当前项目最低读者版本 |
| 旧版本尝试重写含新字段的快照 | Host 拒绝整文档写入，避免丢字段 | 允许新版本继续追加事件或发布完整新快照 |

MVP 先只发布 `eventSchemaVersion=1`，不引入“全体成员必须同版”的硬门槛；真正发生未知 major 时再只读。项目状态中保留 `minReaderEventSchema`/`workflowCatalogVersion` 作为诊断和升级提示字段，不把它们当作安全权限。

### D.4 更新、回退与卸载

1. Registry 发现新版本后显示来源、版本、许可、兼容的 pluginApi/事件 schema、权限变化和变更说明。
2. Installer 在插件目录外暂存新版本，校验 manifest、包结构、平台和 capability，再准备切换；不直接执行仓库默认分支的最新版。
3. 等待当前 Host 请求/订阅结束后切换激活代次；插件迁移失败、首屏加载失败或 schema 迁移失败时恢复旧版本和旧配置，不重启 Electron。
4. 新版本增加 `town.fireside.write` 或改变数据范围时必须重新确认；不能静默继承旧授权。
5. 卸载默认只移除该插件拥有的代码、入口和订阅；“删除本地缓存/共享项目”单独确认，不能删除围炉历史或其他插件数据。

### D.5 风险清单

- **把 app 当 Kit**：继续沿用 `kind=app` 时必须保留“只开 Release、不走 Portal Kit”的边界；正式路线需新增 `interface` kind 和安装器。
- **版本兼容假象**：manifest 能解析不代表 Canvas/同步 capability 已实现；Registry 必须逐项阻止缺失必需能力。
- **旧插件破坏新字段**：高版本事件出现后，旧版本必须只读，不能让旧快照覆盖未知字段。
- **回退丢数据**：插件代码可回退，已经写入的共享事件不可假设回滚；升级迁移要追加反向事件或保留旧状态，不能重写历史。
- **来源信任不足**：Release 链接、版本和摘要记录不等同于发布者签名；客户端要在安装前展示验证范围。

---

## E. 最小可行切片

以下工作量是实现规模的粗估（S/M/L），不是排期承诺；每个切片都明确未实现项。

| 切片 | 内容与验收边界 | 规模 | 依赖 | 主要风险 | 推荐度 |
| --- | --- | --- | --- | --- | --- |
| E1 内部同步 spike | 星图暂留客户端内；抽出最小 `StarMapSyncAdapter`，用现有围炉 `speak/hear(since)` 发布/回放 `star-map.event`，SSE 变更只做唤醒；两个开发版客户端加入同一围炉后能看到同一 Demand/节点状态；覆盖新成员冷启动、离线 catch-up、事件重复。**不包含插件安装**。 | S（约 3–5 个开发日） | 现有 Town 消息 API；需客户端新增 Host 内部 hear 分页/正文适配 | 只能证明消息协议，不满足用户“下载安装社区插件”；消息噪声和 32k 快照边界要先暴露 | 作为 E2 前置 spike |
| E2 正经首发（推荐） | 实现最小 Registry + `desktop.plugin.json` + 本地目录导入/停用；把星图抽成首个 Canvas 插件；同步仍用 B2 消息即状态；未装插件的人只在围炉看到可读 `[星图·事件]` 消息；插件停用后取消订阅，升级失败保留旧版本。**不依赖 Town 新端点**。 | M（约 2–4 周） | E1 的事件 schema；Canvas Host、Host Town adapter、插件管理页均需客户端新增 | Canvas Host 范围容易膨胀；本地导入与 Grove 正式安装尚不等价；插件版本不一致需只读策略 | **推荐作为第一个用户可验证版本** |
| E3 完整路线 | E2 全部内容 + Grove `kind=interface` + Release 安装/升级回退 + Town 围炉 state/operations/events/snapshot 端点 + SSE state 事件；消息事件作为历史迁移/降级通道；新成员一键全量加载。 | L（约 5–10 周，客户端与 Town 服务端并行） | E2 稳定；需 Town 服务端新增端点、权限、revision、迁移工具和 SSE 事件；需客户端新增端点 adapter | 双写/迁移复杂；服务端排期、权限和长时间离线一致性风险；一次性范围最大 | 作为第二阶段目标，不建议作为首次验证门槛 |

### E.1 推荐落地顺序

1. **先做 E1，但把它定义为内部协议 spike，不对外宣称插件化完成。** 验证事件 schema、可读前缀、seq 回放、快照分片和冲突提示。
2. **随后做 E2，作为首个真正交付切片。** 它同时满足“社区插件可安装”和“同围炉共享同一任务”，而不把 Town 服务端排期作为前置条件。
3. **E3 作为规模化/正式社区分发路线。** 当消息冷启动、围炉历史大小或隐私需求成为瓶颈时，再上线 Town state 端点并按 board/revision 迁移。

### E.2 E2 的最小验收清单

- 未安装 `community.star-map` 时，客户端没有星图入口；安装本地插件后由 Registry 动态出现入口。
- 两台装有相同或兼容插件版本的客户端加入同一围炉，能同步创建/修改 Demand、节点状态、位置、边和评论（若评论列入本切片）。
- 一台未安装插件的围炉成员看到的是带 `[星图·事件 v1]` 前缀的可读消息，不会收到 token、任意 URL 或失控的机器命令。
- Host 通过现有 Town 连接获取成员资格；插件代码拿不到 Bearer/query token，也不能任意 `fetch/exec`。
- 新成员从最新完整快照/事件回放启动；SSE 断开后重连可按 `since` catch-up；重复事件不会重复创建节点或边。
- 两人同时改同一节点时按 Town seq 确定结果，较早本地草稿有明确的被覆盖提示；不要求 CRDT。
- 成员退出后历史仍保留给围炉中的成员，退出者本地只读，新写入得到 403/成员错误且不自动重试。
- 插件停用、身份切换、围炉切换会取消旧订阅；升级/加载失败不会影响主聊天、Town 或 Electron 主窗口。

### E.3 切片共同风险清单

- **把 spike 当成产品完成**：E1 只能证明消息协议和回放，不能证明插件安装、停用、升级回退或 Host 隔离；对外验收必须以 E2 为最低门槛。
- **Canvas Host 失控**：若 E2 同时追求所有 V7 画布研究建议，会把 M 级切片膨胀成 L 级；首版只锁定当前星图必要交互，复杂布局、模板市场和 CRDT 不进切片。
- **未安装插件用户被机器消息淹没**：控制事件频率、按操作批量、快照压缩，并保持第一行可读；不能假设 Town 能为某类成员隐藏消息。
- **Town 端点排期改变路线**：E3 不是 E2 的隐式依赖；若服务端端点延期，消息模式仍需保持可重放、可只读降级和明确迁移入口。
- **跨版本写坏共享文档**：只要读到更高 major schema，旧插件必须只读；安装器和 Host 都要阻止整文档覆盖未知字段。
- **本地数据和云端数据混淆**：验收记录必须分别验证共享文档、插件私有缓存、UI 偏好和撤销栈；“本机刷新后看得到”不等于“围炉成员看到同一份数据”。

---

## 待醇青拍板的决策点（附推荐答案）

| 决策点 | 推荐答案 | 若选择其他答案的影响 |
| --- | --- | --- |
| 1. 星图采用哪种插件 UI 路线？ | **宿主 Canvas 组件（A3）**；声明式面板保留为降级/示例，隔离网页面板只作后续逃生门 | 选隔离网页面板会增加独立来源、CSP、消息桥和 renderer 隔离前置；选声明式面板会牺牲星图核心交互 |
| 2. 是否把星图作为首个真实社区界面插件？ | **是**；先补 Canvas Host，再以星图验证，公开卷轴仍做声明式 smoke test | 不以星图验证会把“列表能加载”误当成“复杂插件模型可用” |
| 3. 第一版共享用什么？ | **消息即状态 B2**；Town 文档端点走 B3 后续迁移 | 直接等 B1 会把首次用户验证绑定 Town 服务端排期；直接做 B1 则需同时承担协议、权限、迁移三重风险 |
| 4. 事件粒度与冲突规则？ | **业务操作事件 + 围炉 seq 排序的实体级 LWW**；pointer-up 才提交位置；MVP 不做 CRDT | 做 CRDT 会显著增加模型、离线和兼容成本；按客户端时间戳会受时钟漂移影响 |
| 5. 谁能编辑星图？ | **所有围炉成员可编辑任务内容；炉主控制项目创建/删除/绑定和迁移确认** | 炉主独写会违背共同协作目标；节点创建者 ACL 会造成交接和批量整理阻塞 |
| 6. 成员退出后的语义？ | **历史消息不删；围炉内成员继续可见；退出者本地只读，新写入由服务端拒绝** | 若要让退出者继续读云端当前状态，需要额外的离群读取权限，不应从现有围炉成员 API 推断 |
| 7. Grove 用什么 kind？ | **正式新增 `kind=interface`；过渡期 `kind=app` 仅打开 Release/手工导入** | 把 `kind=app` 直接当一键安装会违反当前 Grove 的真实行为；把星图做 Kit 会混淆工具运行时与界面插件 |
| 8. 首个对外切片选哪一个？ | **E2**；E1 作为 3–5 日内部 spike，E3 作为服务端规模化路线 | E1 单独交付不满足插件化；E3 一步到位风险和跨团队依赖最大 |
| 9. 同围炉是否只有一个星图项目？ | **MVP 一个围炉绑定一个默认星图 board，多 Demand/任务在其中；后续由炉主创建多个 board** | 一开始支持多 board 会引入路由、权限、消息筛选和迁移选择，放大首版复杂度 |
| 10. 评论是否属于共享数据？ | **若产品承诺“同一份任务”，评论/批注纳入 E2；UI 选择、历史栈和 viewport 不同步** | 把评论继续留在 localStorage 会让成员看到不一致，必须在产品上明确它是“本机备注”而非共享评论 |
| 11. 是否现在就做 Town state 端点？ | **不作为 E2 前置；在消息冷启动/隐私/规模达到阈值后做 E3** | 现在做可以得到更干净的云端文档，但需要 Town 服务端新增协议、权限、revision、SSE 和迁移，首次验证周期显著变长 |
