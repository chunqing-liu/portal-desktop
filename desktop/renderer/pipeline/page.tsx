import "@xyflow/react/dist/style.css";
import "./v4.css";
import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  Background,
  ConnectionLineType,
  Controls,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type Node,
  type NodeChange,
  type NodeProps,
} from "@xyflow/react";
import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type MouseEvent as ReactMouseEvent, type WheelEvent } from "react";
import { useModel } from "../shared/hooks/use-model";
import type { AppModel } from "../app/models/app";
import {
  createDemand,
  createInitialPipelineState,
  demandTransitions,
  demandNodes,
  demandStations,
  getPipelineFlow,
  loadPipelineState,
  PIPELINE_STORAGE_KEY,
  sanitizePipelineState,
} from "./models/templates";
import type {
  BugStatus,
  Demand,
  NodeOverride,
  NodeStatus,
  PipelineLocalState,
  PipelineFlow,
  PipelineNode,
  PipelinePoint,
  PipelineStation,
  StationOverride,
} from "./models/schema";
import { BUG_STATUSES, NODE_STATUSES } from "./models/schema";

const COMPACT_ZOOM = 0.58;
const NODE_WIDTH = 214;
const NODE_HEIGHT = 78;
const STATION_WIDTH = 286;
const STATION_HEIGHT = 420;
const STATION_NODE_GAP = 108;

const statusLabels: Record<NodeStatus, string> = {
  pending: "待开始", ready: "可开始", running: "运行中", waiting_human: "等待审核",
  blocked: "已阻塞", failed: "失败", done: "已完成", skipped: "已跳过",
};
const demandStatusLabels: Record<Demand["status"], string> = {
  "demand.drafting": "待撰写", "demand.pending_review": "待评审", "demand.reviewed": "已评审",
  "demand.scheduled": "已排期", "demand.developing": "开发中", "demand.validating": "测试验收",
  "demand.released": "已上线", "demand.paused": "已暂停", "demand.cancelled": "已取消",
};
const isDefined = (value?: string) => Boolean(value?.trim() && value.trim() !== "待补充");
const demandStatusLabel = (demand: Demand) => demand.bug?.status || demandStatusLabels[demand.status];
const demandDisplayTitle = (demand: Demand) => `${demandStatusLabel(demand)} · ${demand.title}`;

function stationHeightFor(stationId: string, stationNodes: PipelineNode[], positions: Record<string, PipelinePoint>, compact: boolean) {
  if (compact) return 170;
  const stationPosition = positions[stationId] || { x: 80, y: 120 };
  const maxBottom = stationNodes.reduce((bottom, node) => {
    const position = positions[node.id] || { x: stationPosition.x + 24, y: stationPosition.y + 72 };
    return Math.max(bottom, position.y - stationPosition.y + NODE_HEIGHT);
  }, 72);
  return Math.max(STATION_HEIGHT, maxBottom + 42);
}

type StationData = { item: PipelineStation; compact: boolean; summary: string };
type ItemData = { item: PipelineNode; detailed: boolean };
type FlowNode = Node<StationData | ItemData>;

function isStationNode(node: FlowNode): node is Node<StationData> {
  return node.type === "station";
}

function StationNode({ data }: NodeProps<Node<StationData>>) {
  return (
    <div className={`star-map-station${data.compact ? " is-compact" : ""}`}>
      {data.compact && <>
        <Handle id="input" type="target" position={Position.Left} className="star-map-port is-input" title="连接输入" aria-label={`${data.item.title} 连接输入`} data-testid={`connect-target-${data.item.id}`}><span>●</span></Handle>
        <Handle id="output" type="source" position={Position.Right} className="star-map-port is-output" title="拖动以连接" aria-label={`从 ${data.item.title} 开始连接`} data-testid={`connect-source-${data.item.id}`}><span>＋</span></Handle>
      </>}
      <div className="star-map-station-heading"><span>{data.item.id}</span><strong>{data.item.title}</strong></div>
      <p>{data.compact ? data.summary : data.item.subtitle}</p>
      {!data.compact && <span className="star-map-station-caption">站 · {data.item.nodeIds.length} 个节点</span>}
    </div>
  );
}

function ItemNode({ data }: NodeProps<Node<ItemData>>) {
  const item = data.item;
  return (
    <div className={`star-map-item status-${item.status}${item.kind === "gate" ? " is-review" : ""}${data.detailed ? " is-detailed" : ""}`}>
      <Handle id="input" type="target" position={Position.Left} className="star-map-port is-input" title="连接输入" aria-label={`${item.title} 连接输入`} data-testid={`connect-target-${item.id}`}><span>●</span></Handle>
      <Handle id="output" type="source" position={Position.Right} className="star-map-port is-output" title="拖动以连接" aria-label={`从 ${item.title} 开始连接`} data-testid={`connect-source-${item.id}`}><span>＋</span></Handle>
      <div className="star-map-item-topline"><code>{item.reviewCode || item.id}</code><i /><b>{item.kind === "gate" ? "人工审核" : statusLabels[item.status]}</b></div>
      <strong>{item.title}</strong>
      <small title={data.detailed ? `${item.owner || "待补充"} · ${item.description || "待补充"}` : item.owner || "待补充"}>{data.detailed ? `${item.owner || "待补充"} · ${item.description || "待补充"}` : item.owner || "待补充"}</small>
    </div>
  );
}

const nodeTypes = { station: StationNode, item: ItemNode };

function PipelineCanvas({
  demand,
  flow,
  stations,
  nodes,
  positions,
  onDemandChange,
  onSelect,
  onClearSelection,
  onCreateNode,
  onCreateGate,
  onCreateStation,
  onDeleteItem,
  focusMode,
  onToggleFocus,
}: {
  demand?: Demand;
  flow: PipelineFlow;
  stations: PipelineStation[];
  nodes: PipelineNode[];
  positions: Record<string, PipelinePoint>;
  onDemandChange: (change: (current: PipelineLocalState) => PipelineLocalState) => void;
  onSelect: (id: string) => void;
  onClearSelection: () => void;
  onCreateNode: () => void;
  onCreateGate: () => void;
  onCreateStation: () => void;
  onDeleteItem: (id: string) => void;
  focusMode: boolean;
  onToggleFocus: () => void;
}) {
  const [zoom, setZoom] = useState(0.72);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; targetId?: string; targetKind?: "node" | "station" } | null>(null);
  const [connectingFromId, setConnectingFromId] = useState("");
  const [lastConnection, setLastConnection] = useState("");
  const [flowNodes, setFlowNodes] = useNodesState<FlowNode>([]);
  const [flowEdges, setFlowEdges] = useEdgesState<Edge>([]);
  const { fitView, zoomIn, zoomOut, getViewport, setViewport } = useReactFlow();
  const compact = zoom < COMPACT_ZOOM;
  const detailed = zoom >= 0.9;
  const stationById = useMemo(() => new Map(stations.map((item) => [item.id, item])), [stations]);
  const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
  const stationHeightById = useMemo(() => new Map(stations.map((station) => [station.id, stationHeightFor(station.id, nodes.filter((node) => node.stationId === station.id), positions, false)])), [stations, nodes, positions]);

  const buildNodes = () => {
    const result: FlowNode[] = stations.map((station) => {
      const stationNodes = nodes.filter((node) => node.stationId === station.id);
      const done = stationNodes.filter((node) => node.status === "done").length;
      const stationPosition = positions[station.id] || { x: 80, y: 120 };
      return {
        id: station.id, type: "station", position: stationPosition,
        data: { item: station, compact, summary: `${done}/${stationNodes.length} 已完成` },
        style: { width: STATION_WIDTH, height: stationHeightFor(station.id, stationNodes, positions, compact) }, zIndex: 0,
      } satisfies FlowNode;
    });
    nodes.forEach((item) => {
      const parentPosition = positions[item.stationId] || { x: 80, y: 120 };
      const absolute = positions[item.id] || { x: parentPosition.x + 24, y: parentPosition.y + 72 };
      result.push({
        id: item.id, type: "item", parentId: item.stationId,
        position: { x: absolute.x - parentPosition.x, y: absolute.y - parentPosition.y },
        extent: "parent", data: { item, detailed },
        style: { width: NODE_WIDTH, minHeight: NODE_HEIGHT, opacity: compact ? 0 : 1, pointerEvents: compact ? "none" : "auto", transition: "opacity 160ms ease" },
        zIndex: 1,
      } satisfies FlowNode);
    });
    return result;
  };

  const buildEdges = () => {
    if (!demand) return [];
    const edgeKeys = new Set<string>();
    return demandTransitions(flow, demand).flatMap((transition, index) => {
      if (!transition.toNode || !nodeById.has(transition.fromNode) || !nodeById.has(transition.toNode)) return [];
      const sourceNode = nodeById.get(transition.fromNode)!;
      const targetNode = nodeById.get(transition.toNode)!;
      const crossStation = sourceNode.stationId !== targetNode.stationId;
      const source = compact && crossStation ? sourceNode.stationId : sourceNode.id;
      const target = compact && crossStation ? targetNode.stationId : targetNode.id;
      const key = `${source}->${target}`;
      if (edgeKeys.has(key) || (compact && !crossStation)) return [];
      edgeKeys.add(key);
      return [{
        id: transition.id || `E${index}`,
        source, target, type: "bezier", selectable: true, deletable: true,
        markerEnd: { type: MarkerType.ArrowClosed },
        label: detailed ? transition.event : undefined,
        labelStyle: { fontSize: 10 },
        className: transition.event === "失败" ? "is-return" : "",
      } satisfies Edge];
    });
  };

  useEffect(() => { const e = buildEdges(); setFlowNodes(buildNodes()); setFlowEdges(e); }, [demand, flow, stations, nodes, positions, compact, detailed]);

  const updatePosition = (id: string, position: PipelinePoint) => {
    if (!demand) return;
    onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? { ...item, positions: { ...item.positions, [id]: position } } : item) }));
  };
  const updateStationAndChildren = (stationId: string, nextPosition: PipelinePoint, currentNodes: FlowNode[]) => {
    if (!demand) return;
    const stationNode = currentNodes.find((node) => node.id === stationId);
    if (!stationNode) return;
    const changes: Record<string, PipelinePoint> = { [stationId]: nextPosition };
    currentNodes.filter((node) => node.parentId === stationId).forEach((node) => {
      const relative = node.position;
      changes[node.id] = { x: nextPosition.x + relative.x, y: nextPosition.y + relative.y };
    });
    onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? { ...item, positions: { ...item.positions, ...changes } } : item) }));
  };
  const onNodeDragStop = (_event: MouseEvent | TouchEvent | React.MouseEvent, node: FlowNode) => {
    const parent = node.parentId ? flowNodes.find((candidate) => candidate.id === node.parentId) : undefined;
    const absolute = { x: node.position.x + (parent?.position.x || 0), y: node.position.y + (parent?.position.y || 0) };
    if (isStationNode(node)) {
      updateStationAndChildren(node.id, absolute, flowNodes);
      return;
    }
    const item = node.data.item as PipelineNode;
    const center = { x: absolute.x + NODE_WIDTH / 2, y: absolute.y + NODE_HEIGHT / 2 };
    const target = stations.find((station) => {
      const stationPosition = positions[station.id] || { x: 80, y: 120 };
      const height = stationHeightById.get(station.id) || STATION_HEIGHT;
      return center.x >= stationPosition.x && center.x <= stationPosition.x + STATION_WIDTH && center.y >= stationPosition.y && center.y <= stationPosition.y + height;
    });
    if (target && target.id !== item.stationId) {
      const next = { x: (positions[target.id]?.x || 80) + 22, y: (positions[target.id]?.y || 120) + 72 };
      onDemandChange((current) => ({ ...current, demands: current.demands.map((entry) => {
        if (entry.id !== demand?.id) return entry;
        const stationOverrides = { ...entry.stationOverrides };
        stations.forEach((station) => {
          const ids = (stationOverrides[station.id]?.nodeIds || station.nodeIds).filter((id) => id !== node.id);
          stationOverrides[station.id] = { ...stationOverrides[station.id], nodeIds: station.id === target.id ? [...ids, node.id] : ids };
        });
        return { ...entry, positions: { ...entry.positions, [node.id]: next }, stationOverrides, nodeOverrides: { ...entry.nodeOverrides, [node.id]: { ...entry.nodeOverrides[node.id], stationId: target.id } } };
      }) }));
    } else updatePosition(node.id, absolute);
  };
  const onNodesChange = (changes: NodeChange<FlowNode>[]) => setFlowNodes((current) => applyNodeChanges(changes, current));
  const onEdgesChange = (changes: EdgeChange[]) => {
    setFlowEdges((current) => applyEdgeChanges(changes, current));
    const removed = changes.filter((change): change is EdgeChange & { type: "remove" } => change.type === "remove").map((change) => change.id);
    if (removed.length && demand) onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? { ...item, deletedTransitionIds: [...new Set([...item.deletedTransitionIds, ...removed])] } : item) }));
  };
  const onConnect = (connection: Connection) => {
    if (!demand || !connection.source || !connection.target || connection.source === connection.target) return;
    const firstNodeInStation = (stationId: string) => stationById.get(stationId)?.nodeIds[0] || nodes.find((item) => item.stationId === stationId)?.id;
    const source = stationById.has(connection.source) ? firstNodeInStation(connection.source) : connection.source;
    const target = stationById.has(connection.target) ? firstNodeInStation(connection.target) : connection.target;
    if (!source || !target || !nodeById.has(source) || !nodeById.has(target)) return;
    const id = `custom-edge-${crypto.randomUUID()}`;
    setFlowEdges((current) => addEdge({ id, source: connection.source, target: connection.target, sourceHandle: connection.sourceHandle, targetHandle: connection.targetHandle, type: "bezier", markerEnd: { type: MarkerType.ArrowClosed } }, current));
    onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? { ...item, customTransitions: [...(item.customTransitions || []).filter(Boolean), { id, fromNode: source, toNode: target, event: "手动连接" }] } : item) }));
    setLastConnection(`${source} → ${target}`);
    setConnectingFromId("");
  };
  const onWheelCapture = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    event.preventDefault();
    event.stopPropagation();
    const viewport = getViewport();
    setViewport({ ...viewport, x: viewport.x - event.deltaY - event.deltaX }, { duration: 0 });
  };
  const onPaneContextMenu = (event: MouseEvent | React.MouseEvent) => {
    event.preventDefault();
    setContextMenu({ x: event.clientX, y: event.clientY });
  };

  return (
    <div className="star-map-canvas" style={{ "--star-map-zoom": zoom } as CSSProperties} onWheelCapture={onWheelCapture} onContextMenu={(event) => event.preventDefault()}>
      <ReactFlow
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onConnectStart={(_event, params) => { setConnectingFromId(params.nodeId || "当前节点"); setLastConnection(""); }}
        onConnectEnd={() => setConnectingFromId("")}
        onNodeClick={(_event, node) => { onSelect(node.id); setContextMenu(null); }}
        onNodeContextMenu={(event, node) => { event.preventDefault(); onSelect(node.id); setContextMenu({ x: event.clientX, y: event.clientY, targetId: node.id, targetKind: isStationNode(node) ? "station" : "node" }); }}
        onNodeDragStop={onNodeDragStop}
        onPaneClick={() => { onClearSelection(); setContextMenu(null); }}
        onPaneContextMenu={onPaneContextMenu}
        onMove={(_event, viewport) => setZoom(viewport.zoom)}
        defaultViewport={{ x: 24, y: 64, zoom: 0.72 }}
        minZoom={0.28}
        maxZoom={1.6}
        connectionRadius={48}
        connectionLineType={ConnectionLineType.Bezier}
        connectionLineStyle={{ stroke: "#6d7cff", strokeWidth: 2, strokeDasharray: "6 4" }}
        connectionDragThreshold={2}
        isValidConnection={(connection) => Boolean(connection.source && connection.target && connection.source !== connection.target)}
        zoomOnScroll
        zoomOnPinch
        panOnDrag
        panOnScroll={false}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        deleteKeyCode="Delete"
        fitViewOptions={{ padding: 0.12 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={28} size={1} color="var(--line)" />
        <Controls showInteractive={false} position="bottom-right" />
        <Panel position="top-left" className={`star-map-canvas-hint${connectingFromId ? " is-connecting" : ""}`}><span aria-live="polite">{connectingFromId ? `正在从 ${connectingFromId} 连线：拖到目标左侧 ●` : lastConnection ? `已连接 ${lastConnection}` : "从节点右侧 ＋ 拖到另一节点左侧 ●"}</span><small>滚轮缩放 · 空白拖拽平移 · Delete 删除连线</small></Panel>
        <Panel position="top-right" className="star-map-toolbar">
          <button type="button" onClick={() => zoomOut()} aria-label="缩小">−</button><output>{Math.round(zoom * 100)}%</output><button type="button" onClick={() => zoomIn()} aria-label="放大">+</button><button type="button" className="star-map-fit" onClick={() => fitView({ padding: 0.12 })}>适配</button><button type="button" className="star-map-focus-toggle" onClick={onToggleFocus} aria-pressed={focusMode}>{focusMode ? "退出专注" : "专注"}</button>
        </Panel>
        <Panel position="bottom-center" className="star-map-create-toolbar">
          <button type="button" onClick={onCreateNode}>+ 新建节点</button><button type="button" onClick={onCreateGate}>+ 新建闸口</button><button type="button" onClick={onCreateStation}>+ 新建站</button>
        </Panel>
      </ReactFlow>
      {contextMenu && <div className="star-map-context-menu" style={{ left: contextMenu.x, top: contextMenu.y }}>
        {contextMenu.targetId ? <button type="button" onClick={() => { onDeleteItem(contextMenu.targetId!); setContextMenu(null); }}>删除{contextMenu.targetKind === "station" ? "站" : "节点"}</button> : <>
          <button type="button" onClick={() => { onCreateNode(); setContextMenu(null); }}>新建节点</button>
          <button type="button" onClick={() => { onCreateGate(); setContextMenu(null); }}>新建闸口</button>
          <button type="button" onClick={() => { onCreateStation(); setContextMenu(null); }}>新建站</button>
        </>}
      </div>}
    </div>
  );
}

function PipelineContent({ model }: { model: AppModel }) {
  const app = useModel(model);
  const [state, setState] = useState<PipelineLocalState>(() => loadPipelineState());
  const [selectedItemId, setSelectedItemId] = useState("");
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const [newDemandTitle, setNewDemandTitle] = useState("");
  const [demandQuery, setDemandQuery] = useState("");
  const [demandFilter, setDemandFilter] = useState<"all" | Demand["status"]>("all");
  const [demandGroupBy, setDemandGroupBy] = useState<"group" | "status">("group");
  const [selectedDemandIds, setSelectedDemandIds] = useState<string[]>([]);
  const [demandContextMenu, setDemandContextMenu] = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const demand = state.demands.find((item) => item.id === state.selectedDemandId) || state.demands[0];
  const flow = useMemo(() => getPipelineFlow(demand?.workflowId), [demand?.workflowId]);
  const stations = useMemo(() => demand ? demandStations(flow, demand) : [], [demand, flow]);
  const nodes = useMemo(() => demand ? demandNodes(flow, demand) : [], [demand, flow]);
  const positions = useMemo(() => {
    const result: Record<string, PipelinePoint> = {};
    [...stations, ...nodes].forEach((item) => { result[item.id] = demand?.positions[item.id] || flow.layout[item.id] || { x: 80, y: 120 }; });
    return result;
  }, [demand, flow, stations, nodes]);
  const selectedNode = nodes.find((item) => item.id === selectedItemId);
  const selectedStation = stations.find((item) => item.id === selectedItemId);
  const visibleDemands = useMemo(() => state.demands.filter((item) => {
    const query = demandQuery.trim().toLowerCase();
    const matchesQuery = !query || [item.title, item.summary, item.owner_group, item.groupName, item.bug?.assignee].some((value) => value?.toLowerCase().includes(query));
    return matchesQuery && (demandFilter === "all" || item.status === demandFilter);
  }), [state.demands, demandFilter, demandQuery]);
  const groupedDemands = useMemo(() => {
    const groups = new Map<string, Demand[]>();
    visibleDemands.forEach((item) => {
      const key = demandGroupBy === "status" ? demandStatusLabel(item) : (item.groupName || getPipelineFlow(item.workflowId).groupName || "未分组");
      groups.set(key, [...(groups.get(key) || []), item]);
    });
    return [...groups.entries()];
  }, [visibleDemands, demandGroupBy]);

  useEffect(() => { try { localStorage.setItem(PIPELINE_STORAGE_KEY, JSON.stringify(sanitizePipelineState(state))); } catch { /* 本地缓存失败不阻塞星图。 */ } }, [state]);
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setFocusMode(false); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode]);
  const changeState = (change: (current: PipelineLocalState) => PipelineLocalState) => setState((current) => {
    const next = change(current);
    return sanitizePipelineState({ ...next, board: { ...next.board, revision: next.board.revision + 1 } });
  });
  const updateDemand = (patch: Partial<Demand>) => { if (!demand) return; changeState((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? { ...item, ...patch } : item) })); };
  const updateNode = <K extends keyof NodeOverride>(field: K, value: NodeOverride[K]) => {
    if (!selectedNode || !demand) return;
    const nodeOverrides = { ...demand.nodeOverrides, [selectedNode.id]: { ...demand.nodeOverrides[selectedNode.id], [field]: value } };
    if (field !== "stationId" || typeof value !== "string") { updateDemand({ nodeOverrides }); return; }
    const stationOverrides = { ...demand.stationOverrides };
    stations.forEach((station) => {
      const ids = (stationOverrides[station.id]?.nodeIds || station.nodeIds).filter((id) => id !== selectedNode.id);
      stationOverrides[station.id] = { ...stationOverrides[station.id], nodeIds: station.id === value ? [...ids, selectedNode.id] : ids };
    });
    updateDemand({ nodeOverrides, stationOverrides });
  };
  const updateStation = <K extends keyof StationOverride>(field: K, value: StationOverride[K]) => { if (selectedStation) updateDemand({ stationOverrides: { ...demand.stationOverrides, [selectedStation.id]: { ...demand.stationOverrides[selectedStation.id], [field]: value } } }); };
  const updateNodeStatus = (status: NodeStatus) => {
    if (!demand || !selectedNode) return;
    if (!["pending", "waiting_human"].includes(status)) {
      const blocker = demandTransitions(flow, demand)
        .filter((transition) => transition.toNode === selectedNode.id)
        .map((transition) => nodes.find((node) => node.id === transition.fromNode))
        .find((node) => node?.kind === "gate" && (node.status !== "done" || !isDefined(node.approver) || !isDefined(node.evidence)));
      if (blocker) { window.alert(`下游节点必须等待闸口「${blocker.title}」人工审核通过。`); return; }
    }
    if (status === "done" && !isDefined(selectedNode.evidence)) { window.alert("节点完成必须先附证据。"); return; }
    if (status === "done" && selectedNode.kind === "gate" && !isDefined(selectedNode.approver)) { window.alert("人工审核通过必须填写拍板人和证据。"); return; }
    updateDemand({ nodeStates: { ...demand.nodeStates, [selectedNode.id]: status } });
  };
  const updateBugStatus = (status: BugStatus) => {
    if (!demand?.bug || demand.bug.status === status) return;
    const content = window.prompt("填写本次状态改动内容", `状态改为${status}`)?.trim();
    if (!content) return;
    updateDemand({ bug: { ...demand.bug, status, history: [...demand.bug.history, { status, at: new Date().toISOString(), content }] } });
  };
  const updateBug = <K extends keyof NonNullable<Demand["bug"]>>(field: K, value: NonNullable<Demand["bug"]>[K]) => {
    if (demand?.bug) updateDemand({ bug: { ...demand.bug, [field]: value } });
  };
  const selectDemand = (id: string, event?: ReactMouseEvent<HTMLButtonElement>) => {
    const additive = Boolean(event?.metaKey || event?.ctrlKey);
    setSelectedDemandIds((current) => additive ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]);
    changeState((current) => ({ ...current, selectedDemandId: id })); setSelectedItemId(""); setRightCollapsed(false); setDemandContextMenu(null);
  };
  const addDemand = (event: FormEvent) => { event.preventDefault(); const next = createDemand(newDemandTitle || "新建任务", state.board.ownerGroup); changeState((current) => ({ ...current, selectedDemandId: next.id, demands: [...current.demands, next] })); setNewDemandTitle(""); setSelectedItemId(""); setSelectedDemandIds([next.id]); setRightCollapsed(false); };
  const addItem = (kind: "station" | "node" | "gate") => {
    if (!demand) return;
    if (kind === "station") {
      const id = `station-${crypto.randomUUID()}`;
      const station: PipelineStation = { id, kind: "station", title: "新建站", subtitle: "待补充", description: "待补充", nodeIds: [] };
      const position = { x: (positions[stations.at(-1)?.id || ""]?.x || 80) + 350, y: 118 };
      updateDemand({ customStations: [...demand.customStations, station], positions: { ...demand.positions, [id]: position } });
      setSelectedItemId(id); setRightCollapsed(false); return;
    }
    const stationId = selectedNode?.stationId || selectedStation?.id || stations[0]?.id;
    if (!stationId) return;
    const id = `node-${crypto.randomUUID()}`;
    const existingCount = nodes.filter((item) => item.stationId === stationId).length;
    const position = { x: (positions[stationId]?.x || 80) + 24, y: (positions[stationId]?.y || 120) + 72 + existingCount * STATION_NODE_GAP };
    const isGate = kind === "gate";
    const node: PipelineNode = { id, kind: isGate ? "gate" : "node", stationId, title: isGate ? "新建闸口" : "新建节点", status: isGate ? "waiting_human" : "pending", owner: "", owner_group: demand.owner_group, description: "待补充", trigger: [isGate ? "人工" : "事件"], execution: isGate ? "being+人" : "being", gateRole: isGate ? "custom" : undefined, options: isGate ? ["通过", "退回"] : undefined, defaultOption: isGate ? "待补充" : undefined };
    const stationOverrides = { ...demand.stationOverrides };
    stations.forEach((station) => {
      const ids = stationOverrides[station.id]?.nodeIds || station.nodeIds;
      stationOverrides[station.id] = { ...stationOverrides[station.id], nodeIds: station.id === stationId ? [...ids, id] : ids };
    });
    updateDemand({ customNodes: [...demand.customNodes, node], positions: { ...demand.positions, [id]: position }, stationOverrides });
    setSelectedItemId(id); setRightCollapsed(false);
  };
  const deleteItemById = (id: string) => {
    if (!demand) return;
    const station = stations.find((item) => item.id === id);
    const node = nodes.find((item) => item.id === id);
    if (station) { if (nodes.some((item) => item.stationId === station.id)) { window.alert("这个站仍有节点，不能删除。"); return; } updateDemand({ customStations: demand.customStations.filter((item) => item.id !== station.id), deletedStationIds: [...new Set([...demand.deletedStationIds, station.id])] }); }
    else if (node) {
      const stationOverrides = { ...demand.stationOverrides };
      stations.forEach((item) => { stationOverrides[item.id] = { ...stationOverrides[item.id], nodeIds: (stationOverrides[item.id]?.nodeIds || item.nodeIds).filter((itemId) => itemId !== node.id) }; });
      updateDemand({ customNodes: demand.customNodes.filter((item) => item.id !== node.id), deletedNodeIds: [...new Set([...demand.deletedNodeIds, node.id])], stationOverrides });
    }
    setSelectedItemId(""); setRightCollapsed(true);
  };
  const deleteSelected = () => { if (selectedNode || selectedStation) deleteItemById(selectedItemId); };
  const groupSelectedDemands = () => {
    if (selectedDemandIds.length < 2) return;
    const name = window.prompt("分组名称", "新分组")?.trim();
    if (!name) return;
    changeState((current) => ({ ...current, demands: current.demands.map((item) => selectedDemandIds.includes(item.id) ? { ...item, groupName: name } : item) }));
    setDemandContextMenu(null);
  };
  const deleteSelectedDemands = () => {
    if (!selectedDemandIds.length || selectedDemandIds.length >= state.demands.length) return;
    if (!window.confirm(`删除选中的 ${selectedDemandIds.length} 条星轨？`)) return;
    const remaining = state.demands.filter((item) => !selectedDemandIds.includes(item.id));
    const next = remaining[0];
    changeState((current) => ({ ...current, demands: remaining, selectedDemandId: next.id }));
    setSelectedDemandIds([next.id]); setSelectedItemId(""); setRightCollapsed(false); setDemandContextMenu(null);
  };
  const reset = () => { if (!window.confirm("重置星图会清除当前设备上的本地编辑，是否继续？")) return; const initial = createInitialPipelineState(); setState(initial); setSelectedDemandIds([initial.selectedDemandId]); setSelectedItemId(""); setRightCollapsed(true); setDemandContextMenu(null); };
  return (
    <section id="pipeline-view" className={`view${focusMode ? " pipeline-focus-mode" : ""}`} hidden={app.view !== "pipeline"} aria-label="星图">
      <div className={`pipeline-shell star-map-shell${leftCollapsed ? " left-collapsed" : ""}${rightCollapsed ? " right-collapsed" : ""}${focusMode ? " is-focus-mode" : ""}`}>
        <aside className={`pipeline-demands${leftCollapsed ? " is-collapsed" : ""}`} aria-label="星轨">
          {leftCollapsed ? <button type="button" className="pipeline-rail-toggle" onClick={() => setLeftCollapsed(false)} aria-label="展开星轨">星轨 <span>›</span></button> : <>
            <div className="pipeline-sidebar-heading"><div><span className="pipeline-kicker">STAR TRACKS</span><h2>星轨</h2></div><div className="pipeline-heading-actions"><span className="pipeline-count">{state.demands.length}</span><button type="button" className="pipeline-collapse" onClick={() => setLeftCollapsed(true)} aria-label="收起星轨">‹</button></div></div>
            <form className="pipeline-demand-create" onSubmit={addDemand}><input value={newDemandTitle} onChange={(event) => setNewDemandTitle(event.target.value)} placeholder="任务名称（可选）" aria-label="新建星轨名称" /><button type="submit">新建</button></form>
            <div className="pipeline-demand-tools"><input value={demandQuery} onChange={(event) => setDemandQuery(event.target.value)} placeholder="筛选星轨" aria-label="筛选星轨" /><select value={demandFilter} onChange={(event) => setDemandFilter(event.target.value as typeof demandFilter)} aria-label="按状态筛选"><option value="all">全部状态</option>{Object.entries(demandStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select><select value={demandGroupBy} onChange={(event) => setDemandGroupBy(event.target.value as typeof demandGroupBy)} aria-label="星轨分组方式"><option value="group">按分组</option><option value="status">按状态</option></select></div>
            <div className="pipeline-demand-list">{groupedDemands.map(([group, items]) => <div className="pipeline-demand-group" key={group}><span className="pipeline-demand-group-title">{group} <small>{items.length}</small></span>{items.map((item) => <button type="button" key={item.id} className={`pipeline-demand-item${item.id === demand?.id ? " selected" : ""}${selectedDemandIds.includes(item.id) ? " multi-selected" : ""}`} aria-pressed={selectedDemandIds.includes(item.id)} onClick={(event) => selectDemand(item.id, event)} onContextMenu={(event) => { event.preventDefault(); if (!selectedDemandIds.includes(item.id)) setSelectedDemandIds([item.id]); setDemandContextMenu({ x: event.clientX, y: event.clientY, ids: selectedDemandIds.includes(item.id) ? selectedDemandIds : [item.id] }); }}><span className="pipeline-demand-dot" data-status={item.status} /><span className="pipeline-demand-copy"><strong>{demandDisplayTitle(item)}</strong><small>{item.groupName || "未分组"} · {item.owner_group}</small></span></button>)}</div>)}</div>
            {demandContextMenu && <div className="pipeline-demand-context-menu" style={{ left: demandContextMenu.x, top: demandContextMenu.y }}><button type="button" onClick={groupSelectedDemands} disabled={demandContextMenu.ids.length < 2}>成组</button><button type="button" onClick={deleteSelectedDemands} disabled={demandContextMenu.ids.length >= state.demands.length}>删除星轨</button></div>}
          </>}
        </aside>
        <section className="pipeline-main" aria-label="星图画布">
          <header className="pipeline-header star-map-compact-header"><div className="pipeline-title-block"><h1>星图</h1><strong>{demand ? demandDisplayTitle(demand) : "未选择星轨"}</strong><p>{demand?.summary || "创建或选择一个星轨。"}</p></div><div className="pipeline-header-actions"><button type="button" className="secondary" onClick={() => setFocusMode(true)}>专注画布</button><details className="star-map-more"><summary>更多</summary><div className="star-map-more-panel"><span className="star-map-flow-badge">{flow.name} · {flow.version}</span><span className="pipeline-legend"><i className="pipeline-status-dot status-done" /> 已完成<i className="pipeline-status-dot status-running" /> 运行中<i className="pipeline-status-dot status-waiting_human" /> 等待审核</span><button type="button" className="secondary pipeline-reset" onClick={reset}>重置本地编辑</button></div></details><button type="button" className="secondary" aria-label="回到对话" onClick={app.closePlace}>关闭</button></div></header>
          <ReactFlowProvider><PipelineCanvas demand={demand} flow={flow} stations={stations} nodes={nodes} positions={positions} onDemandChange={changeState} onCreateNode={() => addItem("node")} onCreateGate={() => addItem("gate")} onCreateStation={() => addItem("station")} onDeleteItem={deleteItemById} onSelect={(id) => { setSelectedItemId(id); setRightCollapsed(false); }} onClearSelection={() => { setSelectedItemId(""); setRightCollapsed(true); }} focusMode={focusMode} onToggleFocus={() => setFocusMode((value) => !value)} /></ReactFlowProvider>
        </section>
        <aside className={`pipeline-inspector${rightCollapsed ? " is-collapsed" : ""}`} aria-label="节点详情">
          {rightCollapsed ? <button type="button" className="pipeline-rail-toggle" onClick={() => setRightCollapsed(false)} aria-label="展开详情"><span>‹</span> 详情</button> : <>
            <div className="pipeline-inspector-heading"><div><span className="pipeline-kicker">DETAILS</span><h2>详情</h2></div><div className="pipeline-heading-actions">{selectedItemId && <code>{selectedItemId}</code>}<button type="button" className="pipeline-collapse" onClick={() => setRightCollapsed(true)} aria-label="收起详情">›</button></div></div>
            <div className="pipeline-inspector-body">
              {!selectedNode && !selectedStation && demand && <><div className="pipeline-inspector-status"><i className="pipeline-status-dot" /><span>星轨</span><span className="pipeline-inspector-kind">{demand.groupName || "未分组"}</span></div><label>任务名称<input value={demand.title} onChange={(event) => updateDemand({ title: event.target.value })} /></label><label>摘要<textarea rows={3} value={demand.summary} onChange={(event) => updateDemand({ summary: event.target.value })} /></label><label>分组<input value={demand.groupName || ""} placeholder="未分组" onChange={(event) => updateDemand({ groupName: event.target.value || undefined })} /></label>{demand.bug && <><label>优先级<select value={demand.bug.priority} onChange={(event) => updateBug("priority", event.target.value as NonNullable<Demand["bug"]>["priority"])}>{["P0", "P1", "P2", "P3"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>经办人<input value={demand.bug.assignee} placeholder="待补充" onChange={(event) => updateBug("assignee", event.target.value)} /></label><label>详情<textarea rows={5} value={demand.bug.details} placeholder="文字描述" onChange={(event) => updateBug("details", event.target.value)} /></label><label>附件<input value={demand.bug.attachments.join(", ")} placeholder="多个附件用逗号分隔" onChange={(event) => updateBug("attachments", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label><label>Bug 状态<select value={demand.bug.status} onChange={(event) => updateBugStatus(event.target.value as BugStatus)}>{BUG_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><div className="pipeline-history"><strong>状态变更记录</strong>{demand.bug.history.slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><b>{entry.status}</b><time>{entry.at ? new Date(entry.at).toLocaleString() : "待记录"}</time><span>{entry.content}</span></div>)}</div></>}</>}
              {selectedStation && <><div className="pipeline-inspector-status"><i className="pipeline-status-dot" /><span>站</span><span className="pipeline-inspector-kind">{selectedStation.nodeIds.length} 个节点</span></div><label>名称<input value={selectedStation.title} onChange={(event) => updateStation("title", event.target.value)} /></label><label>说明<input value={selectedStation.subtitle} onChange={(event) => updateStation("subtitle", event.target.value)} /></label><label>描述<textarea rows={4} value={selectedStation.description || ""} placeholder="待补充" onChange={(event) => updateStation("description", event.target.value)} /></label></>}
              {selectedNode && <><div className={`pipeline-inspector-status status-${selectedNode.status}`}><i className={`pipeline-status-dot status-${selectedNode.status}`} /><span>{selectedNode.kind === "gate" ? "闸口 · 人工审核" : statusLabels[selectedNode.status]}</span><span className="pipeline-inspector-kind">{selectedNode.stationId}</span></div><label>状态<select value={selectedNode.status} onChange={(event) => updateNodeStatus(event.target.value as NodeStatus)}>{NODE_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label>类型<select value={selectedNode.kind} disabled={Boolean(selectedNode.locked)} onChange={(event) => updateNode("kind", event.target.value as NodeOverride["kind"])}><option value="node">普通节点</option><option value="gate">闸口（必须人工审核）</option></select></label><label>标题<input value={selectedNode.title} onChange={(event) => updateNode("title", event.target.value)} /></label><label>负责人<input value={selectedNode.owner} placeholder="待补充" onChange={(event) => updateNode("owner", event.target.value)} /></label><label>所属站<select value={selectedNode.stationId} onChange={(event) => updateNode("stationId", event.target.value)}>{stations.map((station) => <option key={station.id} value={station.id}>{station.title}</option>)}</select></label><label>说明<textarea rows={4} value={selectedNode.description} placeholder="待补充" onChange={(event) => updateNode("description", event.target.value)} /></label><label>完成证据<textarea rows={3} value={selectedNode.evidence || ""} placeholder="链接或可核验摘要" onChange={(event) => updateNode("evidence", event.target.value)} /></label>{selectedNode.kind === "gate" && <label>人工拍板人<input value={selectedNode.approver || ""} placeholder="待补充" onChange={(event) => updateNode("approver", event.target.value)} /></label>}<dl className="pipeline-facts"><div><dt>执行主体</dt><dd>{selectedNode.execution || "待补充"}</dd></div><div><dt>触发</dt><dd>{selectedNode.trigger.join(" / ") || "待补充"}</dd></div><div><dt>退出证据</dt><dd>{selectedNode.evidenceLevel || "待补充"}</dd></div></dl><button type="button" className="secondary" onClick={() => addItem("node")}>+ 添加节点</button><button type="button" className="secondary" onClick={() => addItem("gate")}>+ 添加闸口</button></>}
              {(selectedStation || selectedNode) && <button type="button" className="pipeline-delete" disabled={Boolean((selectedStation || selectedNode)?.locked)} onClick={deleteSelected}>{(selectedStation || selectedNode)?.locked ? "结构规则锁定，不可删除" : "删除当前项"}</button>}
            </div>
          </>}
        </aside>
      </div>
    </section>
  );
}

export function Pipeline({ model }: { model: AppModel }) { return <PipelineContent model={model} />; }

export { NODE_STATUSES };
