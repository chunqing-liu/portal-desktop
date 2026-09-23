import { bugFixWorkflow } from "./bug-fix";
import { beingsDevelopmentWorkflow } from "./beings-development";
import type {
  BugHistoryEntry, BugIssue, BugPriority, BugStatus, Demand, NodeOverride, PipelineFlow,
  PipelineLocalState, PipelineNode, PipelineStation, PipelineTransition, StationOverride,
} from "./schema";
import { BUG_STATUSES, DEMAND_STATUSES, NODE_STATUSES } from "./schema";

/** 两个默认星轨组；实例通过 workflowId 选择画布流程。 */
export const defaultPipeline = beingsDevelopmentWorkflow;
export const pipelineFlows: PipelineFlow[] = [beingsDevelopmentWorkflow, bugFixWorkflow];
export const getPipelineFlow = (workflowId?: string): PipelineFlow =>
  pipelineFlows.find((flow) => flow.id === workflowId) || defaultPipeline;

const editableDefaults = {
  stationOverrides: {}, customNodes: [], customStations: [], customTransitions: [],
  deletedNodeIds: [], deletedStationIds: [], deletedTransitionIds: [], positions: {},
} satisfies Pick<Demand, "stationOverrides" | "customNodes" | "customStations" | "customTransitions" | "deletedNodeIds" | "deletedStationIds" | "positions"> & { deletedTransitionIds: string[] };

const defaultBugHistory: BugHistoryEntry = {
  status: "开放", at: new Date().toISOString(), content: "建立默认 Bug 修复星轨。",
};

export const defaultDemand: Demand = {
  ...structuredClone(editableDefaults),
  id: "star-track-default",
  title: "需求开发任务",
  summary: "需求开发流程组：Agent Team 工作流。",
  status: "demand.developing",
  flowRevision: defaultPipeline.version,
  owner_group: "产品交付组",
  workflowId: defaultPipeline.id,
  groupName: defaultPipeline.groupName,
  nodeStates: { H1: "waiting_human" },
  nodeOverrides: {},
  deliverables: [{ id: "deliverable-default", title: "开发交付", status: "deliv.developing" }],
};

export const defaultBugDemand: Demand = {
  ...structuredClone(editableDefaults),
  id: "star-track-bug-default",
  title: "星图 V5 P0 修复",
  summary: "按 Jira 口述建模的 Bug 修复流程。",
  status: "demand.developing",
  flowRevision: bugFixWorkflow.version,
  owner_group: "产品交付组",
  workflowId: bugFixWorkflow.id,
  groupName: bugFixWorkflow.groupName,
  nodeStates: { B01: "ready" },
  nodeOverrides: {},
  bug: {
    priority: "P0", assignee: "", details: "", attachments: [], status: "开放", history: [defaultBugHistory],
  },
  deliverables: [],
};

export const PIPELINE_STORAGE_KEY = "beings:star-map:v4";
const PIPELINE_LEGACY_STORAGE_KEYS = ["beings:star-map:v3", "beings:pipeline-board:v2", "beings:pipeline-board:v1"];

export function createInitialPipelineState(): PipelineLocalState {
  return { schemaVersion: 3, board: {
    id: "star-map-chunqing-main", name: "醇青的星图", version: "v5", sourceBoardId: "待补充",
    sourceVersion: "pipeline/v5-requirements", branchName: "main", ownerGroup: "产品交付组", revision: 1,
  }, selectedDemandId: defaultDemand.id, demands: [structuredClone(defaultDemand), structuredClone(defaultBugDemand)] };
}

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === "object" && !Array.isArray(value));

/** 读取和写入共用的 transition 清洗器，彻底阻断 null/非法项进入 buildEdges。 */
export function normalizeTransition(value: unknown): PipelineTransition | null {
  if (!isRecord(value) || typeof value.fromNode !== "string" || !value.fromNode || typeof value.event !== "string" || !value.event) return null;
  const toNode = typeof value.toNode === "string" && value.toNode ? value.toNode : undefined;
  const toNodes = Array.isArray(value.toNodes) ? value.toNodes.filter((item): item is string => typeof item === "string" && Boolean(item)) : undefined;
  const id = typeof value.id === "string" && value.id ? value.id : undefined;
  const toStatus = typeof value.toStatus === "string" && NODE_STATUSES.includes(value.toStatus as (typeof NODE_STATUSES)[number]) ? value.toStatus as PipelineTransition["toStatus"] : undefined;
  if (!toNode && !toNodes?.length && !toStatus) return null;
  return { id, fromNode: value.fromNode, event: value.event, toNode, toNodes, toStatus,
    writeback: typeof value.writeback === "string" ? value.writeback : undefined,
    note: typeof value.note === "string" ? value.note : undefined };
}

const normalizeTransitions = (value: unknown): PipelineTransition[] => Array.isArray(value)
  ? value.map(normalizeTransition).filter((item): item is PipelineTransition => Boolean(item)) : [];

const normalizeBugHistory = (value: unknown): BugHistoryEntry[] => Array.isArray(value)
  ? value.filter(isRecord).flatMap((item) => {
    const status = BUG_STATUSES.includes(item.status as BugStatus) ? item.status as BugStatus : null;
    if (!status || typeof item.at !== "string" || typeof item.content !== "string") return [];
    return [{ status, at: item.at, content: item.content }];
  }) : [];

function normalizeBug(value: unknown): BugIssue | undefined {
  if (!isRecord(value)) return undefined;
  const status = BUG_STATUSES.includes(value.status as BugStatus) ? value.status as BugStatus : "开放";
  const priority = (["P0", "P1", "P2", "P3"] as BugPriority[]).includes(value.priority as BugPriority) ? value.priority as BugPriority : "P2";
  const history = normalizeBugHistory(value.history);
  return {
    priority, status, assignee: typeof value.assignee === "string" ? value.assignee : "",
    details: typeof value.details === "string" ? value.details : "",
    attachments: Array.isArray(value.attachments) ? value.attachments.filter((item): item is string => typeof item === "string") : [],
    history: history.length ? history : [{ status, at: new Date().toISOString(), content: "恢复 Bug 状态记录。" }],
  };
}

function normalizeDemand(value: unknown): Demand | null {
  if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string") return null;
  const workflowId = typeof value.workflowId === "string" ? value.workflowId : defaultPipeline.id;
  const flow = getPipelineFlow(workflowId);
  const status = DEMAND_STATUSES.includes(value.status as (typeof DEMAND_STATUSES)[number]) ? value.status as Demand["status"] : "demand.drafting";
  const nodeStates = isRecord(value.nodeStates) ? Object.fromEntries(Object.entries(value.nodeStates).filter(([, item]) => NODE_STATUSES.includes(item as (typeof NODE_STATUSES)[number]))) as Demand["nodeStates"] : {};
  return {
    ...structuredClone(editableDefaults),
    id: value.id,
    title: value.title,
    summary: typeof value.summary === "string" ? value.summary : "待补充",
    status,
    flowRevision: typeof value.flowRevision === "string" ? value.flowRevision : flow.version,
    owner_group: typeof value.owner_group === "string" ? value.owner_group : "产品交付组",
    workflowId,
    groupName: typeof value.groupName === "string" ? value.groupName : flow.groupName,
    bug: normalizeBug(value.bug),
    nodeStates,
    nodeOverrides: isRecord(value.nodeOverrides) ? value.nodeOverrides as Demand["nodeOverrides"] : {},
    stationOverrides: isRecord(value.stationOverrides) ? value.stationOverrides as Demand["stationOverrides"] : {},
    customNodes: Array.isArray(value.customNodes) ? value.customNodes.filter(isRecord) as unknown as PipelineNode[] : [],
    customStations: Array.isArray(value.customStations) ? value.customStations.filter(isRecord) as unknown as PipelineStation[] : [],
    customTransitions: normalizeTransitions(value.customTransitions),
    deletedNodeIds: Array.isArray(value.deletedNodeIds) ? value.deletedNodeIds.filter((item): item is string => typeof item === "string") : [],
    deletedStationIds: Array.isArray(value.deletedStationIds) ? value.deletedStationIds.filter((item): item is string => typeof item === "string") : [],
    deletedTransitionIds: Array.isArray(value.deletedTransitionIds) ? value.deletedTransitionIds.filter((item): item is string => typeof item === "string") : [],
    positions: isRecord(value.positions) ? value.positions as Demand["positions"] : {},
    deliverables: Array.isArray(value.deliverables) ? value.deliverables.filter(isRecord) as unknown as Demand["deliverables"] : [],
  };
}

/** 写入前再次归一化，防止运行期旧对象/外部注入的 null 项重新污染 localStorage。 */
export function sanitizePipelineState(state: PipelineLocalState): PipelineLocalState {
  const demands = state.demands.map(normalizeDemand).filter((item): item is Demand => Boolean(item));
  const fallback = demands[0] || structuredClone(defaultDemand);
  return {
    ...state, schemaVersion: 3, demands: demands.length ? demands : [fallback],
    selectedDemandId: demands.some((item) => item.id === state.selectedDemandId) ? state.selectedDemandId : fallback.id,
  };
}

export function loadPipelineState(): PipelineLocalState {
  try {
    const current = localStorage.getItem(PIPELINE_STORAGE_KEY);
    const legacy = current ? null : PIPELINE_LEGACY_STORAGE_KEYS.map((key) => localStorage.getItem(key)).find(Boolean);
    const parsed = JSON.parse(current || legacy || "null") as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.demands)) {
      const parsedDemands = parsed.demands.map(normalizeDemand).filter((demand): demand is Demand => Boolean(demand));
      if (parsedDemands.length) {
        // V4 的 schemaVersion 仍是 3；用 board.version 判断是否已经完成 V5 双组迁移。
        const isV5Board = isRecord(parsed.board) && parsed.board.version === "v5";
        const demands = parsed.schemaVersion === 3
          ? (isV5Board || parsedDemands.some((item) => item.workflowId === bugFixWorkflow.id) ? parsedDemands : [...parsedDemands, structuredClone(defaultBugDemand)])
          : [structuredClone(defaultDemand), structuredClone(defaultBugDemand)];
        const selectedDemandId = demands.some((demand) => demand.id === parsed.selectedDemandId) ? parsed.selectedDemandId as string : demands[0].id;
        return sanitizePipelineState({
          schemaVersion: 3,
          board: { ...createInitialPipelineState().board, ...(isRecord(parsed.board) ? parsed.board : {}), version: "v5", sourceVersion: "pipeline/v5-requirements" } as PipelineLocalState["board"],
          selectedDemandId, demands,
        });
      }
    }
  } catch {
    // 损坏或旧版本数据不阻塞星图启动，回到内置默认星轨。
  }
  return createInitialPipelineState();
}

export function createDemand(title: string, ownerGroup = "产品交付组"): Demand {
  return {
    ...structuredClone(editableDefaults), id: `star-track-${crypto.randomUUID()}`, title: title.trim() || "新建任务",
    summary: "待补充", status: "demand.drafting", flowRevision: defaultPipeline.version,
    owner_group: ownerGroup || "产品交付组", workflowId: defaultPipeline.id, groupName: defaultPipeline.groupName,
    nodeStates: {}, nodeOverrides: {}, deliverables: [],
  };
}

export function effectiveNode(flow: PipelineFlow, demand: Demand, nodeId: string): PipelineNode | undefined {
  if (demand.deletedNodeIds.includes(nodeId)) return undefined;
  const source = demand.customNodes.find((item) => item.id === nodeId) || flow.nodes.find((item) => item.id === nodeId);
  if (!source) return undefined;
  const override: NodeOverride = demand.nodeOverrides[nodeId] || {};
  return { ...source, ...override, status: demand.nodeStates[nodeId] || source.status };
}

export function effectiveStation(flow: PipelineFlow, demand: Demand, stationId: string): PipelineStation | undefined {
  if (demand.deletedStationIds.includes(stationId)) return undefined;
  const source = demand.customStations.find((item) => item.id === stationId) || flow.stations.find((item) => item.id === stationId);
  if (!source) return undefined;
  const override: StationOverride = demand.stationOverrides[stationId] || {};
  return { ...source, ...override };
}

export function demandNodes(flow: PipelineFlow, demand: Demand): PipelineNode[] {
  const ids = [...flow.nodes.map((item) => item.id), ...demand.customNodes.map((item) => item.id)];
  return [...new Set(ids)].map((id) => effectiveNode(flow, demand, id)).filter((node): node is PipelineNode => Boolean(node));
}

export function demandStations(flow: PipelineFlow, demand: Demand): PipelineStation[] {
  const ids = [...flow.stations.map((item) => item.id), ...demand.customStations.map((item) => item.id)];
  return [...new Set(ids)].map((id) => effectiveStation(flow, demand, id)).filter((station): station is PipelineStation => Boolean(station));
}

export function demandTransitions(flow: PipelineFlow, demand: Demand): PipelineTransition[] {
  const defaults = flow.transitions.map((transition, index) => ({ ...transition, id: transition.id || `E${String(index + 1).padStart(2, "0")}` }));
  return [...defaults, ...normalizeTransitions(demand.customTransitions)].filter((transition) => !demand.deletedTransitionIds.includes(transition.id || ""));
}
