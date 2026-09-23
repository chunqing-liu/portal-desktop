import type { PipelineFlow, PipelineNode, PipelineStation, PipelineTransition } from "./schema";

const group = "bug 修复组";
const station = (id: string, title: string, subtitle: string, nodeIds: string[]): PipelineStation => ({
  id, kind: "station", title, subtitle, nodeIds, locked: true,
});
const step = (id: string, stationId: string, title: string, owner: string, description: string, status: PipelineNode["status"] = "pending"): PipelineNode => ({
  id, kind: "node", stationId, title, status, owner, owner_group: group, description,
  trigger: ["事件"], execution: "being", evidenceLevel: "L2", input: "待补充", output: "待补充",
  timeout: "待补充", failureRoute: "重新打开",
});
const gate = (id: string, stationId: string, title: string, owner: string, description: string): PipelineNode => ({
  id, kind: "gate", gateRole: "product", stationId, title, status: "pending", owner,
  owner_group: group, description, trigger: ["人工"], execution: "being+人", evidenceLevel: "L2",
  input: "测试结论与复现证据", output: "审核结论与证据", timeout: "待补充", failureRoute: "重新打开",
  options: ["通过", "重新打开"], defaultOption: "待补充", requires_human_review: true,
  assigned_user: "local-user", locked: true,
});

export const bugFixStations: PipelineStation[] = [
  station("B-S01", "提报", "填写标题、优先级、经办人与详情", ["B01", "B02"]),
  station("B-S02", "修复", "开发定位并提交修复证据", ["B03"]),
  station("B-S03", "验证", "测试验证，失败则重新打开", ["B04", "B05"]),
  station("B-S04", "关闭", "人工确认已解决并关闭问题", ["B06"]),
];

export const bugFixNodes: PipelineNode[] = [
  step("B01", "B-S01", "填写 Bug 信息", "提报人", "录入 Bug 标题、优先级、经办人、文字描述与附件。", "ready"),
  step("B02", "B-S01", "提交 Bug", "提报人", "提交后状态进入开放，并保留提交内容。"),
  step("B03", "B-S02", "开发修复", "开发 Agent", "定位问题、实现修复并附上可核验证据。"),
  step("B04", "B-S03", "测试验证", "测试 Agent", "验证修复结果；失败时将状态改为重新打开。"),
  step("B05", "B-S03", "重新打开处理", "开发 Agent", "处理测试失败或回归问题后再次进入测试。"),
  gate("B06", "B-S04", "关闭审核", "负责人", "人工确认问题已解决，审核通过后才允许进入已关闭。"),
];

export const bugFixTransitions: PipelineTransition[] = [
  { id: "B-E01", fromNode: "B01", event: "提交", toNode: "B02" },
  { id: "B-E02", fromNode: "B02", event: "开放", toNode: "B03" },
  { id: "B-E03", fromNode: "B03", event: "开发完成", toNode: "B04" },
  { id: "B-E04", fromNode: "B04", event: "失败", toNode: "B05", toStatus: "failed" },
  { id: "B-E05", fromNode: "B04", event: "通过", toNode: "B06" },
  { id: "B-E06", fromNode: "B05", event: "修复完成", toNode: "B04" },
  { id: "B-E07", fromNode: "B06", event: "关闭", toStatus: "done" },
];

const layout: PipelineFlow["layout"] = {
  "B-S01": { x: 60, y: 118 }, "B-S02": { x: 410, y: 118 },
  "B-S03": { x: 760, y: 118 }, "B-S04": { x: 1110, y: 118 },
  B01: { x: 84, y: 190 }, B02: { x: 84, y: 310 }, B03: { x: 434, y: 190 },
  B04: { x: 784, y: 190 }, B05: { x: 784, y: 310 }, B06: { x: 1134, y: 190 },
};

export const bugFixWorkflow: PipelineFlow = {
  id: "bug-fix", name: "bug 修复流程", version: "v5-bug-fix",
  source: "pipeline/v5-requirements.md", groupName: group,
  description: "替代 Jira 的本地 Bug 流程：开放 → 开发中 → 测试中 → 重新打开 → 已解决 → 已关闭。",
  stations: bugFixStations, nodes: bugFixNodes, transitions: bugFixTransitions,
  layout, itemOrder: ["B-S01", "B-S02", "B-S03", "B-S04"],
};
