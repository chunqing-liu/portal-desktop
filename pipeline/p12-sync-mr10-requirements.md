# P12 星图模板同步 MR 10 流程更新（2026-09-24 14:15 醇青拍板「要同步」）

> 背景：qitian 团队 MR 10（d5-dcc-provider，1f4dc39）更新了 agent-team 流程：新增 reviewer 独立评审角色、测试交付完整清单规则、按用例与依赖推进、真实运行评测落地。我已把 spec 对齐为 `workspace/agent-team-spec-v0.2.md`（12788 字节）。本任务把星图模板（beings-development.ts）同步到同一语义。

## 改动范围：仅 `desktop/renderer/pipeline/models/beings-development.ts`

**纯数据改动，不动 UI 代码。** 节点 id、站结构（S01-S06 / N01-N10 / H1-H4）、transitions（E01-E14）、layout 全部不动——存量 localStorage 实例（key `beings:star-map:v4`）以节点 id 为键存编辑，id 不变即兼容。

### 1. 元信息

- `version: "v3-agent-team"` → `"v4-agent-team"`
- `source: "pipeline/v5-requirements.md"` → `"agent-team-spec-v0.2.md"`
- `description` 末尾补一句：`对齐 d5-dcc-provider MR 10 流程更新（reviewer 独立评审 / 测试交付完整清单 / 按用例推进 / 真实运行评测）。`

### 2. owner 对齐五角色（产品 / 开发 / 测试 / coordinator / reviewer + 人工）

现模板 owner 有「发布 Agent」，不在 v0.2 角色表里。默认方案（可调，验收时我核）：

| 节点 | 现 owner | 改为 | 依据 |
|---|---|---|---|
| N08 发布准备 | 发布 Agent | 开发 Agent | 发布说明/回滚条件是开发职责（spec §02B） |
| N09 发布执行 | 发布 Agent | 开发 Agent | 执行获批发布 |
| N10 观察与复盘 | 产品 Agent | coordinator | v0.2 明确「任务结束时组织复盘」是 coordinator 职责 |

其余节点 owner 不变（N01/H1/N02=产品，N03-N05/H3/N07=开发，H2/N06/H4=测试）。

### 3. 描述更新（只改 description 字符串，不改结构）

- **H2 测试设计审核**：`确认测试设计、测试条件与能力缺口。` → `确认测试设计、测试条件与能力缺口。未确认时 suite 保持 DRAFT，不用于正式验收执行；人工确认语义后可带明确 missing 进入 REVIEWED。reviewer 可按独立评审流程收件核验。`
- **N06 测试执行**：`在真实运行环境执行测试并记录结果。` → `在真实运行环境执行测试并记录结果。交接必须返回完整 testChecklist（AUTOMATED_PASS / MANUAL_REQUIRED / AUTOMATION_MISSING / FAIL / BLOCKED / UNKNOWN / SKIPPED），不能只给通过总数；缺自动化能力须补实现，不得把 missing 改写成人工已验证。`
- **N10 观察与复盘**：`观察发布结果，记录结论与后续行动。` → `观察发布结果，记录结论与后续行动。复盘按真实运行评测口径：指标从完整实际事件计算，不从收件文件数估造；正确阻塞不算 Agent 失败。`
- **S02 站 subtitle**：`检查方案、依赖与验收语义` → `检查方案、依赖与验收语义；reviewer 按独立评审流程旁路收件`（reviewer 不占主流程节点，以站描述呈现——这是有意的：spec 定位它是旁路角色，不占固定实例）。

### 4. 明确不动

- `input/output/timeout/failureRoute/trigger/execution/evidenceLevel` 等占位字段（「待补充」）——补全是另一个需求，不混入本次。
- reviewer **不加**主流程节点/transition——spec 边界：不替代主流程或 H1-H4，附着在阶段交接上。
- UI 组件、schema.ts、page.tsx、bug-fix.ts。

## 验收标准（我来做，隔离实例）

1. `npx tsc --noEmit` 通过。
2. 隔离 vite 实例（5175 端口，CDP 9223）加载后：N08/N09 owner 显示「开发 Agent」、N10 显示「coordinator」；H2/N06/N10 详情面板显示新描述全文；S02 站 subtitle 含 reviewer。
3. 存量兼容：用旧版模板种过 localStorage 的实例（若隔离实例有），刷新后不报错、编辑保留。
4. 版本串显示 v4-agent-team。

## 执行方式

resume P11 的 codex session（它有星图代码完整上下文），单文件改动预计 <10 分钟。
