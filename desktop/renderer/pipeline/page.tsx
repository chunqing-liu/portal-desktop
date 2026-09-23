import "@xyflow/react/dist/style.css";
import "./v4.css";
import {
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
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type DragEvent as ReactDragEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent,
} from "react";
import type { AppModel } from "../app/models/app";
import { useModel } from "../shared/hooks/use-model";
import type {
  BugStatus,
  Demand,
  NodeOverride,
  NodeStatus,
  PipelineFlow,
  PipelineLocalState,
  PipelineNode,
  PipelinePoint,
  PipelineStation,
  StationOverride,
} from "./models/schema";
import { BUG_STATUSES, NODE_STATUSES } from "./models/schema";
import {
  createDemand,
  demandNodes,
  demandStations,
  demandTransitions,
  getPipelineFlow,
  loadPipelineState,
  PIPELINE_STORAGE_KEY,
  sanitizePipelineState,
} from "./models/templates";

const COMPACT_ZOOM = 0.58;
const NODE_WIDTH = 214;
const NODE_HEIGHT = 86;
const STATION_MIN_WIDTH = 286;
const STATION_EMPTY_HEIGHT = 152;
const STATION_COMPACT_HEIGHT = 170;
const STATION_HEADER_HEIGHT = 112;
const STATION_PADDING = 24;
const STATION_NODE_GAP = 108;
const FREE_NODE_GAP = 44;

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

type StationSize = { width: number; height: number };

function visibleNodePosition(node: PipelineNode, positions: Record<string, PipelinePoint>, stationPositions: Map<string, PipelinePoint>) {
  const raw = positions[node.id] || { x: 80, y: 120 };
  if (!node.stationId) return raw;
  const station = stationPositions.get(node.stationId);
  if (!station) return raw;
  return {
    x: Math.max(raw.x, station.x + STATION_PADDING),
    y: Math.max(raw.y, station.y + STATION_HEADER_HEIGHT),
  };
}

function stationSizeFor(stationId: string, stationNodes: PipelineNode[], positions: Record<string, PipelinePoint>, compact: boolean): StationSize {
  if (compact) return { width: STATION_MIN_WIDTH, height: STATION_COMPACT_HEIGHT };
  const stationPosition = positions[stationId] || { x: 80, y: 120 };
  const stationPositions = new Map([[stationId, stationPosition]]);
  let width = STATION_MIN_WIDTH;
  let height = STATION_EMPTY_HEIGHT;
  stationNodes.forEach((node) => {
    const position = visibleNodePosition(node, positions, stationPositions);
    width = Math.max(width, position.x - stationPosition.x + NODE_WIDTH + STATION_PADDING);
    height = Math.max(height, position.y - stationPosition.y + NODE_HEIGHT + STATION_PADDING);
  });
  return { width, height };
}

function serialOrder(ids: string[], transitions: ReturnType<typeof demandTransitions>, stableIds: string[]) {
  const selected = new Set(ids);
  const successors = new Map<string, string[]>();
  const indegree = new Map(ids.map((id) => [id, 0]));
  transitions.forEach((transition) => {
    if (!transition.toNode || !selected.has(transition.fromNode) || !selected.has(transition.toNode)) return;
    successors.set(transition.fromNode, [...(successors.get(transition.fromNode) || []), transition.toNode]);
    indegree.set(transition.toNode, (indegree.get(transition.toNode) || 0) + 1);
  });
  const stable = (values: string[]) => values.sort((a, b) => stableIds.indexOf(a) - stableIds.indexOf(b));
  const queue = stable(ids.filter((id) => indegree.get(id) === 0));
  const result: string[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    if (result.includes(id)) continue;
    result.push(id);
    stable(successors.get(id) || []).forEach((next) => {
      indegree.set(next, (indegree.get(next) || 1) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    });
  }
  return [...result, ...stable(ids.filter((id) => !result.includes(id)))];
}

type Attention = "action" | "update" | null;
type StationData = { item: PipelineStation; compact: boolean; summary: string; count: number };
type ItemData = { item: PipelineNode; detailed: boolean; attention: Attention };
type FlowNode = Node<StationData | ItemData>;

function isStationNode(node: FlowNode): node is Node<StationData> {
  return node.type === "station";
}

function StationNode({ data }: NodeProps<Node<StationData>>) {
  return <div className={`star-map-station${data.compact ? " is-compact" : ""}`}>
    <Handle id="input" type="target" position={Position.Left} className="star-map-port is-input" title="连接输入" aria-label={`${data.item.title} 连接输入`} data-testid={`connect-target-${data.item.id}`}><span>●</span></Handle>
    <Handle id="output" type="source" position={Position.Right} className="star-map-port is-output" title="拖动以连接" aria-label={`从 ${data.item.title} 开始连接`} data-testid={`connect-source-${data.item.id}`}><span>＋</span></Handle>
    <div className="star-map-station-heading"><span>{data.item.id}</span><strong>{data.item.title}</strong></div>
    <p>{data.compact ? data.summary : data.item.subtitle}</p>
    {!data.compact && <span className="star-map-station-caption">站 · {data.count} 个节点</span>}
  </div>;
}

function ItemNode({ data }: NodeProps<Node<ItemData>>) {
  const item = data.item;
  return <div className={`star-map-item status-${item.status}${item.kind === "gate" ? " is-review" : ""}${data.detailed ? " is-detailed" : ""}`}>
    <Handle id="input" type="target" position={Position.Left} className="star-map-port is-input" title="连接输入" aria-label={`${item.title} 连接输入`} data-testid={`connect-target-${item.id}`}><span>●</span></Handle>
    <Handle id="output" type="source" position={Position.Right} className="star-map-port is-output" title="拖动以连接" aria-label={`从 ${item.title} 开始连接`} data-testid={`connect-source-${item.id}`}><span>＋</span></Handle>
    {data.attention && <span className={`star-map-attention-dot is-${data.attention}`} title={data.attention === "action" ? "需要你操作" : "有更新"} aria-label={data.attention === "action" ? "需要你操作" : "有更新"} />}
    <div className="star-map-item-topline"><code>{item.reviewCode || item.id}</code><i /><b>{item.kind === "gate" ? "人工审核" : statusLabels[item.status]}</b></div>
    <strong>{item.title}</strong>
    <small title={data.detailed ? `${item.owner || "待补充"} · ${item.description || "待补充"}` : item.owner || "待补充"}>{data.detailed ? `${item.owner || "待补充"} · ${item.description || "待补充"}` : item.owner || "待补充"}</small>
  </div>;
}

const nodeTypes = { station: StationNode, item: ItemNode };
type CanvasMenu = { x: number; y: number; kind: "pane" | "node" | "station" | "selection"; ids: string[] };

function PipelineCanvas({
  demand, flow, stations, nodes, positions, currentUserId, selectedItemIds,
  onDemandChange, onSelectionChange, onCreateItem, onDeleteItems, onDuplicateItems,
  onConvertNode, onMarkNodeUpdated, onRenameStation, onAutoArrange, onCreateStationFromSelection,
  focusMode, onToggleFocus, leftCollapsed, rightCollapsed, onToggleLeft, onToggleRight,
}: {
  demand?: Demand;
  flow: PipelineFlow;
  stations: PipelineStation[];
  nodes: PipelineNode[];
  positions: Record<string, PipelinePoint>;
  currentUserId: string;
  selectedItemIds: string[];
  onDemandChange(change: (current: PipelineLocalState) => PipelineLocalState): void;
  onSelectionChange(ids: string[]): void;
  onCreateItem(kind: "station" | "node" | "gate", position: PipelinePoint): void;
  onDeleteItems(ids: string[]): void;
  onDuplicateItems(ids: string[], options?: { offset?: number; select?: boolean }): void;
  onConvertNode(id: string): void;
  onMarkNodeUpdated(ids: string[]): void;
  onRenameStation(id: string): void;
  onAutoArrange(ids: string[]): void;
  onCreateStationFromSelection(ids: string[]): void;
  focusMode: boolean;
  onToggleFocus(): void;
  leftCollapsed: boolean;
  rightCollapsed: boolean;
  onToggleLeft(): void;
  onToggleRight(): void;
}) {
  const wrapper = useRef<HTMLDivElement>(null);
  const altDragIds = useRef<string[]>([]);
  const [zoom, setZoom] = useState(0.72);
  const [contextMenu, setContextMenu] = useState<CanvasMenu | null>(null);
  const [connectingFromId, setConnectingFromId] = useState("");
  const [lastConnection, setLastConnection] = useState("");
  const [flowNodes, setFlowNodes] = useNodesState<FlowNode>([]);
  const [flowEdges, setFlowEdges] = useEdgesState<Edge>([]);
  const { fitView, zoomIn, zoomOut, getViewport, setViewport, screenToFlowPosition, getNodes, getEdges } = useReactFlow<FlowNode, Edge>();
  const compact = zoom < COMPACT_ZOOM;
  const detailed = zoom >= 0.9;
  const stationById = useMemo(() => new Map(stations.map((item) => [item.id, item])), [stations]);
  const nodeById = useMemo(() => new Map(nodes.map((item) => [item.id, item])), [nodes]);
  const stationPositionById = useMemo(() => new Map(stations.map((station) => [station.id, positions[station.id] || { x: 80, y: 120 }])), [stations, positions]);
  const stationSizeById = useMemo(() => new Map(stations.map((station) => [station.id, stationSizeFor(station.id, nodes.filter((node) => node.stationId === station.id), positions, false)])), [stations, nodes, positions]);

  const orderedStationNodes = (stationId: string) => {
    const order = stationById.get(stationId)?.nodeIds || [];
    const members = nodes.filter((node) => node.stationId === stationId);
    return [...members].sort((a, b) => {
      const ai = order.indexOf(a.id), bi = order.indexOf(b.id);
      return (ai < 0 ? Number.MAX_SAFE_INTEGER : ai) - (bi < 0 ? Number.MAX_SAFE_INTEGER : bi);
    });
  };

  const attentionFor = (item: PipelineNode): Attention => {
    const needsMe = Boolean(item.requires_human_review || item.kind === "gate") && item.status === "waiting_human" && item.assigned_user === currentUserId;
    if (needsMe) return "action";
    return (item.update_seq || 0) > (item.last_seen_seq || 0) ? "update" : null;
  };

  const buildNodes = () => {
    const result: FlowNode[] = stations.map((station) => {
      const stationNodes = nodes.filter((node) => node.stationId === station.id);
      const done = stationNodes.filter((node) => node.status === "done").length;
      const size = stationSizeFor(station.id, stationNodes, positions, compact);
      return {
        id: station.id, type: "station", position: stationPositionById.get(station.id)!, selected: selectedItemIds.includes(station.id),
        data: { item: station, compact, count: stationNodes.length, summary: `${done}/${stationNodes.length} 已完成` },
        style: { width: size.width, height: size.height }, zIndex: 0,
      } satisfies FlowNode;
    });
    nodes.forEach((item) => {
      const hiddenInCompactStation = compact && Boolean(item.stationId);
      result.push({
        id: item.id, type: "item", position: visibleNodePosition(item, positions, stationPositionById), selected: selectedItemIds.includes(item.id),
        data: { item, detailed, attention: attentionFor(item) }, selectable: !hiddenInCompactStation,
        style: { width: NODE_WIDTH, height: NODE_HEIGHT, opacity: hiddenInCompactStation ? 0 : 1, pointerEvents: hiddenInCompactStation ? "none" : "auto", transition: "opacity 160ms ease" },
        zIndex: 2,
      } satisfies FlowNode);
    });
    return result;
  };

  const buildEdges = () => {
    if (!demand) return [];
    const edgeKeys = new Set<string>();
    const edges: Edge[] = [];
    demandTransitions(flow, demand).forEach((transition, index) => {
      if (!transition.toNode || !nodeById.has(transition.fromNode) || !nodeById.has(transition.toNode)) return;
      const sourceNode = nodeById.get(transition.fromNode)!;
      const targetNode = nodeById.get(transition.toNode)!;
      const sameStation = Boolean(sourceNode.stationId) && sourceNode.stationId === targetNode.stationId;
      if (compact && sameStation) return;
      const source = compact && sourceNode.stationId && sourceNode.stationId !== targetNode.stationId ? sourceNode.stationId : sourceNode.id;
      const target = compact && targetNode.stationId && sourceNode.stationId !== targetNode.stationId ? targetNode.stationId : targetNode.id;
      const key = `${source}->${target}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({
        id: transition.id || `E${index}`, source, target, type: "default", selectable: true, deletable: true,
        markerEnd: { type: MarkerType.ArrowClosed }, label: detailed ? transition.event : undefined,
        labelStyle: { fontSize: 10 }, className: transition.event === "失败" ? "is-return" : "",
      });
    });
    demand.stationLinks.forEach((link) => {
      const sourceNodes = orderedStationNodes(link.fromStationId);
      const targetNodes = orderedStationNodes(link.toStationId);
      const source = compact || !sourceNodes.length ? link.fromStationId : sourceNodes.at(-1)!.id;
      const target = compact || !targetNodes.length ? link.toStationId : targetNodes[0].id;
      if (!stationById.has(link.fromStationId) || !stationById.has(link.toStationId)) return;
      const key = `${source}->${target}`;
      if (edgeKeys.has(key)) return;
      edgeKeys.add(key);
      edges.push({ id: link.id, source, target, type: "default", selectable: true, deletable: true,
        markerEnd: { type: MarkerType.ArrowClosed }, label: detailed ? "站间串联" : undefined,
        className: !sourceNodes.length || !targetNodes.length ? "is-pending-station-link" : "" });
    });
    return edges;
  };

  const renderedNodes = useMemo(() => buildNodes(), [demand, flow, stations, nodes, positions, compact, detailed, selectedItemIds, currentUserId]);
  const renderedEdges = useMemo(() => buildEdges(), [demand, flow, stations, nodes, positions, compact, detailed]);
  useEffect(() => { setFlowNodes(renderedNodes); setFlowEdges(renderedEdges); }, [renderedNodes, renderedEdges]);
  useEffect(() => {
    const dismiss = () => setContextMenu(null);
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  const updateStationAndChildren = (stationId: string, nextPosition: PipelinePoint) => {
    if (!demand) return;
    const previous = positions[stationId] || { x: 80, y: 120 };
    const delta = { x: nextPosition.x - previous.x, y: nextPosition.y - previous.y };
    const changes: Record<string, PipelinePoint> = { [stationId]: nextPosition };
    nodes.filter((node) => node.stationId === stationId).forEach((node) => {
      const position = positions[node.id] || { x: previous.x + STATION_PADDING, y: previous.y + STATION_HEADER_HEIGHT };
      changes[node.id] = { x: position.x + delta.x, y: position.y + delta.y };
    });
    onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? { ...item, positions: { ...item.positions, ...changes } } : item) }));
  };

  const persistDraggedNodes = (dragged: FlowNode) => {
    if (!demand) return;
    if (isStationNode(dragged)) { updateStationAndChildren(dragged.id, dragged.position); return; }
    const currentNodes = getNodes();
    const latestById = new Map(currentNodes.map((node) => [node.id, node]));
    latestById.set(dragged.id, dragged);
    const moving = currentNodes.filter((node) => node.type === "item" && node.selected);
    if (!moving.some((node) => node.id === dragged.id)) moving.splice(0, moving.length, dragged);
    const movingIds = new Set(moving.map((node) => node.id));
    onDemandChange((current) => ({ ...current, demands: current.demands.map((entry) => {
      if (entry.id !== demand.id) return entry;
      const stationOverrides = { ...entry.stationOverrides };
      stations.forEach((station) => {
        stationOverrides[station.id] = { ...stationOverrides[station.id], nodeIds: (stationOverrides[station.id]?.nodeIds || station.nodeIds).filter((id) => !movingIds.has(id)) };
      });
      const nodeOverrides = { ...entry.nodeOverrides };
      const nextPositions = { ...entry.positions };
      moving.forEach((movingNode) => {
        const latest = latestById.get(movingNode.id) || movingNode;
        const center = { x: latest.position.x + NODE_WIDTH / 2, y: latest.position.y + NODE_HEIGHT / 2 };
        const target = stations.find((station) => {
          const origin = stationPositionById.get(station.id) || { x: 80, y: 120 };
          const size = stationSizeById.get(station.id) || { width: STATION_MIN_WIDTH, height: STATION_EMPTY_HEIGHT };
          return center.x >= origin.x && center.x <= origin.x + size.width && center.y >= origin.y && center.y <= origin.y + size.height;
        });
        const position = target ? {
          x: Math.max(latest.position.x, (stationPositionById.get(target.id)?.x || 80) + STATION_PADDING),
          y: Math.max(latest.position.y, (stationPositionById.get(target.id)?.y || 120) + STATION_HEADER_HEIGHT),
        } : latest.position;
        nextPositions[movingNode.id] = position;
        nodeOverrides[movingNode.id] = { ...nodeOverrides[movingNode.id], stationId: target?.id || null };
        if (target) stationOverrides[target.id] = { ...stationOverrides[target.id], nodeIds: [...(stationOverrides[target.id]?.nodeIds || []), movingNode.id] };
      });
      return { ...entry, positions: nextPositions, nodeOverrides, stationOverrides };
    }) }));
  };

  const removeEdges = (ids: string[]) => {
    if (!demand || !ids.length) return;
    onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? {
      ...item,
      stationLinks: item.stationLinks.filter((link) => !ids.includes(link.id)),
      deletedTransitionIds: [...new Set([...item.deletedTransitionIds, ...ids])],
    } : item) }));
  };

  const onNodesChange = (changes: NodeChange<FlowNode>[]) => {
    if (!changes.length) return;
    setFlowNodes((current) => applyNodeChanges(changes, current));
  };
  const onEdgesChange = (changes: EdgeChange[]) => {
    setFlowEdges((current) => applyEdgeChanges(changes, current));
    removeEdges(changes.filter((change): change is EdgeChange & { type: "remove" } => change.type === "remove").map((change) => change.id));
  };

  const onConnect = (connection: Connection) => {
    if (!demand || !connection.source || !connection.target || connection.source === connection.target) return;
    if (stationById.has(connection.source) && stationById.has(connection.target)) {
      const id = `station-link-${crypto.randomUUID()}`;
      onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? {
        ...item, stationLinks: [...item.stationLinks, { id, fromStationId: connection.source!, toStationId: connection.target! }],
      } : item) }));
      setLastConnection(`${connection.source} → ${connection.target}`); setConnectingFromId(""); return;
    }
    const source = stationById.has(connection.source) ? orderedStationNodes(connection.source).at(-1)?.id : connection.source;
    const target = stationById.has(connection.target) ? orderedStationNodes(connection.target)[0]?.id : connection.target;
    if (!source || !target || !nodeById.has(source) || !nodeById.has(target)) { setLastConnection("空站会先保留站间连接，节点加入后自动串联"); return; }
    const id = `custom-edge-${crypto.randomUUID()}`;
    onDemandChange((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? {
      ...item, customTransitions: [...item.customTransitions, { id, fromNode: source, toNode: target, event: "手动连接" }],
    } : item) }));
    setLastConnection(`${source} → ${target}`); setConnectingFromId("");
  };

  const createAtViewportCenter = (kind: "station" | "node" | "gate") => {
    const bounds = wrapper.current?.getBoundingClientRect();
    if (!bounds) return;
    const center = screenToFlowPosition({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 });
    const width = kind === "station" ? STATION_MIN_WIDTH : NODE_WIDTH;
    const height = kind === "station" ? STATION_EMPTY_HEIGHT : NODE_HEIGHT;
    onCreateItem(kind, { x: center.x - width / 2, y: center.y - height / 2 });
  };

  const selectedCanvasIds = () => getNodes().filter((node) => node.selected).map((node) => node.id);
  const openNodeMenu = (event: ReactMouseEvent, node: FlowNode) => {
    event.preventDefault(); event.stopPropagation();
    const selection = selectedCanvasIds();
    const ids = selection.includes(node.id) && selection.length > 1 ? selection : [node.id];
    onSelectionChange(ids);
    setContextMenu({ x: event.clientX, y: event.clientY, kind: ids.length > 1 ? "selection" : isStationNode(node) ? "station" : "node", ids });
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Delete" || event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || (event.target instanceof HTMLElement && event.target.isContentEditable)) return;
      const ids = selectedCanvasIds();
      if (ids.length) { event.preventDefault(); onDeleteItems(ids); return; }
      const edgeIds = getEdges().filter((edge) => edge.selected).map((edge) => edge.id);
      if (edgeIds.length) { event.preventDefault(); removeEdges(edgeIds); }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [demand, stations, nodes]);

  const onWheelCapture = (event: WheelEvent<HTMLDivElement>) => {
    if (!event.shiftKey) return;
    event.preventDefault(); event.stopPropagation();
    const viewport = getViewport();
    setViewport({ ...viewport, x: viewport.x - event.deltaY - event.deltaX }, { duration: 0 });
  };

  const handleSelectionChange = useCallback(({ nodes: selected }: { nodes: FlowNode[] }) => {
    onSelectionChange(selected.map((node) => node.id));
  }, [onSelectionChange]);

  const menuNodeIds = contextMenu?.ids.filter((id) => nodeById.has(id)) || [];
  return <div ref={wrapper} className="star-map-canvas" style={{ "--star-map-zoom": zoom } as CSSProperties} onWheelCapture={onWheelCapture} onContextMenuCapture={(event) => event.preventDefault()}>
    <ReactFlow
      nodes={flowNodes} edges={flowEdges} nodeTypes={nodeTypes}
      onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
      onConnectStart={(_event, params) => { setConnectingFromId(params.nodeId || "当前节点"); setLastConnection(""); }}
      onConnectEnd={() => setConnectingFromId("")}
      onNodeClick={(_event, node) => { onSelectionChange([node.id]); setContextMenu(null); }}
      onNodeContextMenu={openNodeMenu}
      onNodeDragStart={(event, node) => {
        altDragIds.current = [];
        if (!("altKey" in event) || !event.altKey || isStationNode(node)) return;
        const selection = selectedCanvasIds();
        altDragIds.current = selection.includes(node.id) ? selection.filter((id) => nodeById.has(id)) : [node.id];
      }}
      onNodeDragStop={(_event, node) => {
        if (altDragIds.current.length) onDuplicateItems(altDragIds.current, { offset: 0, select: false });
        altDragIds.current = [];
        persistDraggedNodes(node);
      }}
      onSelectionChange={handleSelectionChange}
      onPaneClick={() => { onSelectionChange([]); setContextMenu(null); }}
      onPaneContextMenu={(event) => {
        event.preventDefault();
        const ids = selectedCanvasIds();
        setContextMenu({ x: event.clientX, y: event.clientY, kind: ids.length ? "selection" : "pane", ids });
      }}
      onMove={(_event, viewport) => setZoom(viewport.zoom)}
      defaultViewport={{ x: 24, y: 64, zoom: 0.72 }} minZoom={0.28} maxZoom={1.6}
      connectionRadius={48} connectionLineType={ConnectionLineType.Bezier}
      connectionLineStyle={{ stroke: "#6d7cff", strokeWidth: 2, strokeDasharray: "6 4" }} connectionDragThreshold={2}
      isValidConnection={(connection) => Boolean(connection.source && connection.target && connection.source !== connection.target)}
      zoomOnScroll zoomOnPinch panOnDrag={[1, 2]} panOnScroll={false} selectionOnDrag selectionMode={SelectionMode.Partial}
      deleteKeyCode={null} fitViewOptions={{ padding: 0.12 }} proOptions={{ hideAttribution: true }}
    >
      <Background gap={28} size={1} color="var(--line)" />
      <Controls showInteractive={false} position="bottom-right" />
      <Panel position="top-left" className={`star-map-canvas-hint${connectingFromId ? " is-connecting" : ""}`}><span aria-live="polite">{connectingFromId ? `正在从 ${connectingFromId} 连线：拖到目标左侧 ●` : lastConnection ? `已连接 ${lastConnection}` : "左键框选 · 中键平移 · 从右侧 ＋ 拖出连线"}</span><small>滚轮缩放 · Alt 拖拽复制 · Delete 删除</small></Panel>
      <Panel position="top-right" className="star-map-toolbar"><button type="button" onClick={() => zoomOut()} aria-label="缩小">−</button><output>{Math.round(zoom * 100)}%</output><button type="button" onClick={() => zoomIn()} aria-label="放大">+</button><button type="button" className="star-map-fit" onClick={() => fitView({ padding: 0.12 })}>适配</button><button type="button" className="star-map-focus-toggle" onClick={onToggleFocus} aria-pressed={focusMode}>{focusMode ? "退出专注" : "专注"}</button></Panel>
      <Panel position="bottom-center" className="star-map-create-toolbar"><button type="button" onClick={() => createAtViewportCenter("node")}>+ 新建节点</button><button type="button" onClick={() => createAtViewportCenter("gate")}>+ 新建闸口</button><button type="button" onClick={() => createAtViewportCenter("station")}>+ 新建站</button></Panel>
    </ReactFlow>
    <button type="button" className="pipeline-canvas-sidebar-toggle is-left" onClick={onToggleLeft} aria-label={leftCollapsed ? "展开星轨侧栏" : "收起星轨侧栏"} aria-pressed={!leftCollapsed}><span className="sidebar-toggle-icon" aria-hidden="true" /></button>
    <button type="button" className="pipeline-canvas-sidebar-toggle is-right" onClick={onToggleRight} aria-label={rightCollapsed ? "展开详情侧栏" : "收起详情侧栏"} aria-pressed={!rightCollapsed}><span className="sidebar-toggle-icon" aria-hidden="true" /></button>
    {contextMenu && <div className="star-map-context-menu" role="menu" style={{ left: contextMenu.x, top: contextMenu.y }} onPointerDown={(event) => event.stopPropagation()}>
      {contextMenu.kind === "pane" && <><button type="button" onClick={() => { createAtViewportCenter("node"); setContextMenu(null); }}>新建节点</button><button type="button" onClick={() => { createAtViewportCenter("gate"); setContextMenu(null); }}>新建闸口</button><button type="button" onClick={() => { createAtViewportCenter("station"); setContextMenu(null); }}>新建站</button></>}
      {contextMenu.kind === "node" && <><button type="button" onClick={() => { onDuplicateItems(contextMenu.ids); setContextMenu(null); }}>复制节点</button><button type="button" onClick={() => { onConvertNode(contextMenu.ids[0]); setContextMenu(null); }}>转为闸口</button><button type="button" onClick={() => { onMarkNodeUpdated(contextMenu.ids); setContextMenu(null); }}>标记有更新</button><div role="separator" /><button type="button" className="is-danger" onClick={() => { onDeleteItems(contextMenu.ids); setContextMenu(null); }}>删除节点</button></>}
      {contextMenu.kind === "station" && <><button type="button" onClick={() => { onRenameStation(contextMenu.ids[0]); setContextMenu(null); }}>重命名站</button><button type="button" className="is-danger" onClick={() => { onDeleteItems(contextMenu.ids); setContextMenu(null); }}>删除站</button></>}
      {contextMenu.kind === "selection" && <><button type="button" disabled={!menuNodeIds.length} onClick={() => { onDuplicateItems(menuNodeIds); setContextMenu(null); }}>复制选中节点</button><button type="button" disabled={!menuNodeIds.length} onClick={() => { onAutoArrange(menuNodeIds); setContextMenu(null); }}>自动排序</button><button type="button" disabled={!menuNodeIds.length} onClick={() => { onCreateStationFromSelection(menuNodeIds); setContextMenu(null); }}>创建站</button><button type="button" disabled={!menuNodeIds.length} onClick={() => { onMarkNodeUpdated(menuNodeIds); setContextMenu(null); }}>标记有更新</button><div role="separator" /><button type="button" className="is-danger" onClick={() => { onDeleteItems(contextMenu.ids); setContextMenu(null); }}>删除选中项</button></>}
    </div>}
  </div>;
}

function PipelineContent({ model }: { model: AppModel }) {
  const app = useModel(model);
  const [state, setState] = useState<PipelineLocalState>(() => loadPipelineState());
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [focusMode, setFocusMode] = useState(false);
  const focusSidebarState = useRef({ left: false, right: true });
  const [demandQuery, setDemandQuery] = useState("");
  const [demandFilter, setDemandFilter] = useState<"all" | Demand["status"]>("all");
  const [demandGroupBy, setDemandGroupBy] = useState<"group" | "status">("group");
  const [selectedDemandIds, setSelectedDemandIds] = useState<string[]>([]);
  const [draggedDemandId, setDraggedDemandId] = useState("");
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
  const selectedNodes = nodes.filter((item) => selectedItemIds.includes(item.id));
  const selectedNode = selectedItemIds.length === 1 ? selectedNodes[0] : undefined;
  const selectedStation = selectedItemIds.length === 1 ? stations.find((item) => item.id === selectedItemIds[0]) : undefined;
  const visibleDemands = useMemo(() => state.demands.filter((item) => {
    const query = demandQuery.trim().toLowerCase();
    const matchesQuery = !query || [item.title, item.summary, item.owner_group, item.groupName, item.bug?.assignee].some((value) => value?.toLowerCase().includes(query));
    return matchesQuery && (demandFilter === "all" || item.status === demandFilter);
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || a.sortOrder - b.sortOrder), [state.demands, demandFilter, demandQuery]);
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
    const dismiss = () => setDemandContextMenu(null);
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, []);

  const changeState = (change: (current: PipelineLocalState) => PipelineLocalState) => setState((current) => {
    const next = change(current);
    return sanitizePipelineState({ ...next, board: { ...next.board, revision: next.board.revision + 1 } });
  });
  const updateDemand = (patch: Partial<Demand>) => { if (demand) changeState((current) => ({ ...current, demands: current.demands.map((item) => item.id === demand.id ? { ...item, ...patch } : item) })); };

  const handleCanvasSelectionChange = useCallback((ids: string[]) => {
    setSelectedItemIds((current) => current.length === ids.length && current.every((id, index) => id === ids[index]) ? current : ids);
    if (ids.length) setRightCollapsed(false);
  }, []);

  const enterFocus = () => {
    if (focusMode) return;
    focusSidebarState.current = { left: leftCollapsed, right: rightCollapsed };
    setLeftCollapsed(true); setRightCollapsed(true); setFocusMode(true);
  };
  const exitFocus = () => {
    setFocusMode(false);
    setLeftCollapsed(focusSidebarState.current.left); setRightCollapsed(focusSidebarState.current.right);
  };
  useEffect(() => {
    if (!focusMode) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") exitFocus(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [focusMode]);

  const updateNode = <K extends keyof NodeOverride>(field: K, value: NodeOverride[K]) => {
    if (!selectedNode || !demand) return;
    const nodeOverrides = { ...demand.nodeOverrides, [selectedNode.id]: { ...demand.nodeOverrides[selectedNode.id], [field]: value } };
    if (field !== "stationId") { updateDemand({ nodeOverrides }); return; }
    const stationId = typeof value === "string" && value ? value : null;
    const stationOverrides = { ...demand.stationOverrides };
    stations.forEach((station) => {
      const ids = (stationOverrides[station.id]?.nodeIds || station.nodeIds).filter((id) => id !== selectedNode.id);
      stationOverrides[station.id] = { ...stationOverrides[station.id], nodeIds: station.id === stationId ? [...ids, selectedNode.id] : ids };
    });
    const target = stationId ? positions[stationId] : undefined;
    const nextPosition = target ? { x: target.x + STATION_PADDING, y: target.y + STATION_HEADER_HEIGHT + (stations.find((station) => station.id === stationId)?.nodeIds.length || 0) * STATION_NODE_GAP } : positions[selectedNode.id];
    updateDemand({ nodeOverrides: { ...nodeOverrides, [selectedNode.id]: { ...nodeOverrides[selectedNode.id], stationId } }, stationOverrides,
      positions: nextPosition ? { ...demand.positions, [selectedNode.id]: nextPosition } : demand.positions });
  };
  const updateStation = <K extends keyof StationOverride>(field: K, value: StationOverride[K]) => { if (selectedStation && demand) updateDemand({ stationOverrides: { ...demand.stationOverrides, [selectedStation.id]: { ...demand.stationOverrides[selectedStation.id], [field]: value } } }); };

  const validateNodeStatus = (node: PipelineNode, status: NodeStatus) => {
    if (!demand) return false;
    if (!["pending", "waiting_human"].includes(status)) {
      const blocker = demandTransitions(flow, demand).filter((transition) => transition.toNode === node.id)
        .map((transition) => nodes.find((candidate) => candidate.id === transition.fromNode))
        .find((candidate) => candidate?.kind === "gate" && (candidate.status !== "done" || !isDefined(candidate.approver) || !isDefined(candidate.evidence)));
      if (blocker) { window.alert(`下游节点必须等待闸口「${blocker.title}」人工审核通过。`); return false; }
    }
    if (status === "done" && !isDefined(node.evidence)) { window.alert(`节点「${node.title}」完成前必须附证据。`); return false; }
    if (status === "done" && node.kind === "gate" && !isDefined(node.approver)) { window.alert(`闸口「${node.title}」通过前必须填写拍板人。`); return false; }
    return true;
  };
  const updateNodeStatus = (status: NodeStatus) => {
    if (demand && selectedNode && validateNodeStatus(selectedNode, status)) updateDemand({ nodeStates: { ...demand.nodeStates, [selectedNode.id]: status } });
  };
  const updateBulkNodes = (patch: { status?: NodeStatus; owner?: string; description?: string }) => {
    if (!demand || selectedNodes.length < 2) return;
    if (patch.status && selectedNodes.some((node) => !validateNodeStatus(node, patch.status!))) return;
    const nodeOverrides = { ...demand.nodeOverrides };
    selectedNodes.forEach((node) => { nodeOverrides[node.id] = { ...nodeOverrides[node.id], ...(patch.owner !== undefined ? { owner: patch.owner } : {}), ...(patch.description !== undefined ? { description: patch.description } : {}) }; });
    updateDemand({ nodeOverrides, nodeStates: patch.status ? { ...demand.nodeStates, ...Object.fromEntries(selectedNodes.map((node) => [node.id, patch.status])) } : demand.nodeStates });
  };

  const updateBugStatus = (status: BugStatus) => {
    if (!demand?.bug || demand.bug.status === status) return;
    const content = window.prompt("填写本次状态改动内容", `状态改为${status}`)?.trim();
    if (content) updateDemand({ bug: { ...demand.bug, status, history: [...demand.bug.history, { status, at: new Date().toISOString(), content }] } });
  };
  const updateBug = <K extends keyof NonNullable<Demand["bug"]>>(field: K, value: NonNullable<Demand["bug"]>[K]) => { if (demand?.bug) updateDemand({ bug: { ...demand.bug, [field]: value } }); };

  const selectDemand = (id: string, event?: ReactMouseEvent<HTMLButtonElement>) => {
    const additive = Boolean(event?.metaKey || event?.ctrlKey);
    setSelectedDemandIds((current) => additive ? (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]) : [id]);
    changeState((current) => ({ ...current, selectedDemandId: id })); setSelectedItemIds([]); setRightCollapsed(false); setDemandContextMenu(null);
  };
  const addDemand = () => {
    const next = { ...createDemand("新建任务", state.board.ownerGroup), sortOrder: Math.max(-1, ...state.demands.map((item) => item.sortOrder)) + 1 };
    changeState((current) => ({ ...current, selectedDemandId: next.id, demands: [...current.demands, next] }));
    setSelectedItemIds([]); setSelectedDemandIds([next.id]); setRightCollapsed(false);
  };

  const addItem = (kind: "station" | "node" | "gate", position: PipelinePoint) => {
    if (!demand) return;
    if (kind === "station") {
      const id = `station-${crypto.randomUUID()}`;
      const station: PipelineStation = { id, kind: "station", title: "新建站", subtitle: "待补充", description: "待补充", nodeIds: [] };
      updateDemand({ customStations: [...demand.customStations, station], positions: { ...demand.positions, [id]: position } });
      setSelectedItemIds([id]); setRightCollapsed(false); return;
    }
    const id = `node-${crypto.randomUUID()}`;
    const isGate = kind === "gate";
    const node: PipelineNode = {
      id, kind: isGate ? "gate" : "node", stationId: null, title: isGate ? "新建闸口" : "新建节点",
      status: isGate ? "waiting_human" : "pending", owner: "", owner_group: demand.owner_group,
      description: "待补充", trigger: [isGate ? "人工" : "事件"], execution: isGate ? "being+人" : "being",
      gateRole: isGate ? "custom" : undefined, options: isGate ? ["通过", "退回"] : undefined,
      defaultOption: isGate ? "待补充" : undefined, requires_human_review: isGate,
      assigned_user: isGate ? state.board.currentUserId : undefined,
    };
    updateDemand({ customNodes: [...demand.customNodes, node], positions: { ...demand.positions, [id]: position } });
    setSelectedItemIds([id]); setRightCollapsed(false);
  };

  const deleteItems = (ids: string[]) => {
    if (!demand || !ids.length) return;
    const locked = [...nodes, ...stations].filter((item) => ids.includes(item.id) && item.locked);
    const deletable = ids.filter((id) => !locked.some((item) => item.id === id));
    if (locked.length) window.alert(`已跳过 ${locked.length} 个结构锁定项。`);
    if (!deletable.length) return;
    const deletingStations = new Set(stations.filter((station) => deletable.includes(station.id)).map((station) => station.id));
    const deletingNodes = new Set(nodes.filter((node) => deletable.includes(node.id)).map((node) => node.id));
    const nodeOverrides = { ...demand.nodeOverrides };
    nodes.filter((node) => node.stationId && deletingStations.has(node.stationId)).forEach((node) => { nodeOverrides[node.id] = { ...nodeOverrides[node.id], stationId: null }; });
    const stationOverrides = { ...demand.stationOverrides };
    stations.forEach((station) => { stationOverrides[station.id] = { ...stationOverrides[station.id], nodeIds: (stationOverrides[station.id]?.nodeIds || station.nodeIds).filter((id) => !deletingNodes.has(id)) }; });
    updateDemand({
      nodeOverrides, stationOverrides,
      customNodes: demand.customNodes.filter((item) => !deletingNodes.has(item.id)),
      customStations: demand.customStations.filter((item) => !deletingStations.has(item.id)),
      deletedNodeIds: [...new Set([...demand.deletedNodeIds, ...deletingNodes])],
      deletedStationIds: [...new Set([...demand.deletedStationIds, ...deletingStations])],
      stationLinks: demand.stationLinks.filter((link) => !deletingStations.has(link.fromStationId) && !deletingStations.has(link.toStationId)),
    });
    setSelectedItemIds([]); setRightCollapsed(true);
  };

  const duplicateItems = (ids: string[], options: { offset?: number; select?: boolean } = {}) => {
    if (!demand) return;
    const sourceNodes = nodes.filter((node) => ids.includes(node.id));
    if (!sourceNodes.length) return;
    const mapping = new Map(sourceNodes.map((node) => [node.id, `node-${crypto.randomUUID()}`]));
    const offset = options.offset ?? 24;
    const copies = sourceNodes.map((node) => ({ ...structuredClone(node), id: mapping.get(node.id)!, title: `${node.title} 副本`, locked: false, reviewCode: undefined }));
    const nextPositions = { ...demand.positions };
    copies.forEach((copy, index) => {
      const source = positions[sourceNodes[index].id] || { x: 80, y: 120 };
      nextPositions[copy.id] = { x: source.x + offset, y: source.y + offset };
    });
    const stationOverrides = { ...demand.stationOverrides };
    stations.forEach((station) => {
      const appended = sourceNodes.filter((node) => node.stationId === station.id).map((node) => mapping.get(node.id)!);
      stationOverrides[station.id] = { ...stationOverrides[station.id], nodeIds: [...(stationOverrides[station.id]?.nodeIds || station.nodeIds), ...appended] };
    });
    const copiedTransitions = demandTransitions(flow, demand).flatMap((transition) => transition.toNode && mapping.has(transition.fromNode) && mapping.has(transition.toNode) ? [{ ...transition, id: `custom-edge-${crypto.randomUUID()}`, fromNode: mapping.get(transition.fromNode)!, toNode: mapping.get(transition.toNode)! }] : []);
    updateDemand({ customNodes: [...demand.customNodes, ...copies], positions: nextPositions, stationOverrides, customTransitions: [...demand.customTransitions, ...copiedTransitions] });
    if (options.select !== false) { setSelectedItemIds(copies.map((item) => item.id)); setRightCollapsed(false); }
  };

  const convertNode = (id: string) => {
    const node = nodes.find((item) => item.id === id);
    if (!demand || !node || node.locked || node.kind === "gate") return;
    updateDemand({ nodeOverrides: { ...demand.nodeOverrides, [id]: { ...demand.nodeOverrides[id], kind: "gate", gateRole: "custom", requires_human_review: true, assigned_user: state.board.currentUserId } }, nodeStates: { ...demand.nodeStates, [id]: "waiting_human" } });
  };
  const markNodesUpdated = (ids: string[]) => {
    if (!demand) return;
    const nodeOverrides = { ...demand.nodeOverrides };
    nodes.filter((node) => ids.includes(node.id)).forEach((node) => { nodeOverrides[node.id] = { ...nodeOverrides[node.id], update_seq: (node.update_seq || 0) + 1 } ; });
    updateDemand({ nodeOverrides });
  };
  const renameStation = (id: string) => {
    const station = stations.find((item) => item.id === id);
    if (!station || !demand) return;
    const title = window.prompt("站名称", station.title)?.trim();
    if (title) updateDemand({ stationOverrides: { ...demand.stationOverrides, [id]: { ...demand.stationOverrides[id], title } } });
  };

  const autoArrange = (ids: string[]) => {
    if (!demand) return;
    const selected = nodes.filter((node) => ids.includes(node.id));
    const nextPositions = { ...demand.positions };
    const transitions = demandTransitions(flow, demand);
    const stationGroups = new Map<string, PipelineNode[]>();
    selected.filter((node) => node.stationId).forEach((node) => stationGroups.set(node.stationId!, [...(stationGroups.get(node.stationId!) || []), node]));
    stationGroups.forEach((members, stationId) => {
      const order = serialOrder(members.map((node) => node.id), transitions, nodes.map((node) => node.id));
      const origin = positions[stationId] || { x: 80, y: 120 };
      order.forEach((id, index) => { nextPositions[id] = { x: origin.x + STATION_PADDING, y: origin.y + STATION_HEADER_HEIGHT + index * STATION_NODE_GAP }; });
    });
    const free = selected.filter((node) => !node.stationId);
    const freeOrder = serialOrder(free.map((node) => node.id), transitions, nodes.map((node) => node.id));
    const startX = free.length ? Math.min(...free.map((node) => positions[node.id]?.x || 80)) : 80;
    const startY = free.length ? Math.min(...free.map((node) => positions[node.id]?.y || 120)) : 120;
    freeOrder.forEach((id, index) => { nextPositions[id] = { x: startX + index * (NODE_WIDTH + FREE_NODE_GAP), y: startY }; });
    updateDemand({ positions: nextPositions });
  };

  const createStationFromSelection = (ids: string[]) => {
    if (!demand) return;
    const members = nodes.filter((node) => ids.includes(node.id));
    if (!members.length) return;
    const id = `station-${crypto.randomUUID()}`;
    const minX = Math.min(...members.map((node) => positions[node.id]?.x || 80));
    const minY = Math.min(...members.map((node) => positions[node.id]?.y || 120));
    const stationPosition = { x: minX - STATION_PADDING, y: minY - STATION_HEADER_HEIGHT };
    const station: PipelineStation = { id, kind: "station", title: "新建站", subtitle: "由选中节点创建", nodeIds: members.map((node) => node.id) };
    const stationOverrides = { ...demand.stationOverrides };
    stations.forEach((current) => { stationOverrides[current.id] = { ...stationOverrides[current.id], nodeIds: (stationOverrides[current.id]?.nodeIds || current.nodeIds).filter((nodeId) => !ids.includes(nodeId)) }; });
    const nodeOverrides = { ...demand.nodeOverrides };
    members.forEach((node) => { nodeOverrides[node.id] = { ...nodeOverrides[node.id], stationId: id }; });
    updateDemand({ customStations: [...demand.customStations, station], positions: { ...demand.positions, [id]: stationPosition }, stationOverrides, nodeOverrides });
    setSelectedItemIds([id]); setRightCollapsed(false);
  };

  const groupSelectedDemands = () => {
    if (selectedDemandIds.length < 2) return;
    const name = window.prompt("分组名称", "新分组")?.trim();
    if (name) changeState((current) => ({ ...current, demands: current.demands.map((item) => selectedDemandIds.includes(item.id) ? { ...item, groupName: name } : item) }));
    setDemandContextMenu(null);
  };
  const renameDemand = (id: string) => {
    const item = state.demands.find((entry) => entry.id === id);
    const title = item && window.prompt("星轨名称", item.title)?.trim();
    if (title) changeState((current) => ({ ...current, demands: current.demands.map((entry) => entry.id === id ? { ...entry, title } : entry) }));
    setDemandContextMenu(null);
  };
  const duplicateDemand = (id: string) => {
    const source = state.demands.find((item) => item.id === id);
    if (!source) return;
    const copy = { ...structuredClone(source), id: `star-track-${crypto.randomUUID()}`, title: `${source.title} 副本`, pinned: false, unread: true, sortOrder: Math.max(-1, ...state.demands.map((item) => item.sortOrder)) + 1 };
    changeState((current) => ({ ...current, demands: [...current.demands, copy], selectedDemandId: copy.id }));
    setSelectedDemandIds([copy.id]); setSelectedItemIds([]); setDemandContextMenu(null);
  };
  const togglePinnedDemand = (id: string) => { changeState((current) => ({ ...current, demands: current.demands.map((item) => item.id === id ? { ...item, pinned: !item.pinned } : item) })); setDemandContextMenu(null); };
  const markDemandUnread = (id: string) => { changeState((current) => ({ ...current, demands: current.demands.map((item) => item.id === id ? { ...item, unread: true } : item) })); setDemandContextMenu(null); };
  const deleteSelectedDemands = () => {
    if (!selectedDemandIds.length || selectedDemandIds.length >= state.demands.length || !window.confirm(`删除选中的 ${selectedDemandIds.length} 条星轨？`)) return;
    const remaining = state.demands.filter((item) => !selectedDemandIds.includes(item.id));
    changeState((current) => ({ ...current, demands: remaining, selectedDemandId: remaining[0].id }));
    setSelectedDemandIds([remaining[0].id]); setSelectedItemIds([]); setRightCollapsed(false); setDemandContextMenu(null);
  };

  const moveDemand = (targetId: string | undefined, targetGroup: string) => {
    if (!draggedDemandId) return;
    changeState((current) => {
      const moving = current.demands.find((item) => item.id === draggedDemandId);
      if (!moving) return current;
      const remaining = current.demands.filter((item) => item.id !== draggedDemandId);
      const index = targetId ? remaining.findIndex((item) => item.id === targetId) : remaining.length;
      remaining.splice(index < 0 ? remaining.length : index, 0, { ...moving, groupName: targetGroup });
      return { ...current, demands: remaining.map((item, order) => ({ ...item, sortOrder: order })) };
    });
    setDraggedDemandId("");
  };
  const demandDragOver = (event: ReactDragEvent) => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; };

  const bulkOwner = selectedNodes.length && selectedNodes.every((node) => node.owner === selectedNodes[0].owner) ? selectedNodes[0].owner : "";
  const bulkDescription = selectedNodes.length && selectedNodes.every((node) => node.description === selectedNodes[0].description) ? selectedNodes[0].description : "";
  const contextDemand = demandContextMenu ? state.demands.find((item) => item.id === demandContextMenu.ids[0]) : undefined;

  return <section id="pipeline-view" className={`view${focusMode ? " pipeline-focus-mode" : ""}`} hidden={app.view !== "pipeline"} aria-label="星图" onContextMenuCapture={(event) => event.preventDefault()}>
    <div className={`pipeline-shell star-map-shell${leftCollapsed ? " left-collapsed" : ""}${rightCollapsed ? " right-collapsed" : ""}${focusMode ? " is-focus-mode" : ""}`}>
      <aside className={`pipeline-demands${leftCollapsed ? " is-collapsed" : ""}`} aria-label="星轨">
        {!leftCollapsed && <>
          <div className="pipeline-sidebar-heading"><div><span className="pipeline-kicker">STAR TRACKS</span><h2>星轨</h2></div><span className="pipeline-count">{state.demands.length}</span></div>
          <button type="button" className="pipeline-demand-create-button" onClick={addDemand}>+ 新建</button>
          <div className="pipeline-demand-tools"><input value={demandQuery} onChange={(event) => setDemandQuery(event.target.value)} placeholder="筛选星轨" aria-label="筛选星轨" /><select value={demandFilter} onChange={(event) => setDemandFilter(event.target.value as typeof demandFilter)} aria-label="按状态筛选"><option value="all">全部状态</option>{Object.entries(demandStatusLabels).map(([status, label]) => <option key={status} value={status}>{label}</option>)}</select><select value={demandGroupBy} onChange={(event) => setDemandGroupBy(event.target.value as typeof demandGroupBy)} aria-label="星轨分组方式"><option value="group">按分组</option><option value="status">按状态</option></select></div>
          <div className="pipeline-demand-list">{groupedDemands.map(([group, items]) => <div className="pipeline-demand-group" key={group} onDragOver={demandDragOver} onDrop={() => demandGroupBy === "group" && moveDemand(undefined, group)}><span className="pipeline-demand-group-title">{group} <small>{items.length}</small></span>{items.map((item) => <button type="button" draggable key={item.id} className={`pipeline-demand-item${item.id === demand?.id ? " selected" : ""}${selectedDemandIds.includes(item.id) ? " multi-selected" : ""}${item.pinned ? " is-pinned" : ""}`} aria-pressed={selectedDemandIds.includes(item.id)} onDragStart={(event) => { setDraggedDemandId(item.id); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", item.id); }} onDragEnd={() => setDraggedDemandId("")} onDragOver={demandDragOver} onDrop={(event) => { event.stopPropagation(); moveDemand(item.id, item.groupName || group); }} onClick={(event) => selectDemand(item.id, event)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); const ids = selectedDemandIds.includes(item.id) ? selectedDemandIds : [item.id]; setSelectedDemandIds(ids); setDemandContextMenu({ x: event.clientX, y: event.clientY, ids }); }}><span className="pipeline-demand-dot" data-status={item.status} />{item.unread && <span className="pipeline-demand-unread" title="未读" />}<span className="pipeline-demand-copy"><strong>{item.pinned && <span aria-label="已置顶">⌃ </span>}{demandDisplayTitle(item)}</strong><small>{item.groupName || "未分组"} · {item.owner_group}</small></span></button>)}</div>)}</div>
          {demandContextMenu && <div className="pipeline-demand-context-menu" role="menu" style={{ left: demandContextMenu.x, top: demandContextMenu.y }} onPointerDown={(event) => event.stopPropagation()}><button type="button" onClick={() => renameDemand(demandContextMenu.ids[0])}>重命名</button><button type="button" onClick={() => duplicateDemand(demandContextMenu.ids[0])}>复制项目</button><button type="button" onClick={() => togglePinnedDemand(demandContextMenu.ids[0])}>{contextDemand?.pinned ? "取消置顶" : "置顶"}</button><button type="button" onClick={() => markDemandUnread(demandContextMenu.ids[0])}>标记为未读</button><div role="separator" /><button type="button" onClick={groupSelectedDemands} disabled={demandContextMenu.ids.length < 2}>成组</button><button type="button" className="is-danger" onClick={deleteSelectedDemands} disabled={demandContextMenu.ids.length >= state.demands.length}>删除星轨</button></div>}
        </>}
      </aside>
      <section className="pipeline-main" aria-label="星图画布">
        <header className="pipeline-header star-map-compact-header"><div className="pipeline-title-block"><h1>星图</h1><strong>{demand ? demandDisplayTitle(demand) : "未选择星轨"}</strong><p>{demand?.summary || "创建或选择一个星轨。"}</p></div><div className="pipeline-header-actions"><button type="button" className="secondary" onClick={enterFocus}>专注画布</button><details className="star-map-more"><summary>更多</summary><div className="star-map-more-panel"><span className="star-map-flow-badge">{flow.name} · {flow.version}</span><span className="pipeline-legend"><i className="pipeline-status-dot status-done" /> 已完成<i className="pipeline-status-dot status-running" /> 运行中<i className="pipeline-status-dot status-waiting_human" /> 等待审核</span></div></details></div></header>
        <ReactFlowProvider><PipelineCanvas demand={demand} flow={flow} stations={stations} nodes={nodes} positions={positions} currentUserId={state.board.currentUserId} selectedItemIds={selectedItemIds} onDemandChange={changeState} onSelectionChange={handleCanvasSelectionChange} onCreateItem={addItem} onDeleteItems={deleteItems} onDuplicateItems={duplicateItems} onConvertNode={convertNode} onMarkNodeUpdated={markNodesUpdated} onRenameStation={renameStation} onAutoArrange={autoArrange} onCreateStationFromSelection={createStationFromSelection} focusMode={focusMode} onToggleFocus={focusMode ? exitFocus : enterFocus} leftCollapsed={leftCollapsed} rightCollapsed={rightCollapsed} onToggleLeft={() => setLeftCollapsed((value) => !value)} onToggleRight={() => setRightCollapsed((value) => !value)} /></ReactFlowProvider>
      </section>
      <aside className={`pipeline-inspector${rightCollapsed ? " is-collapsed" : ""}`} aria-label="节点详情">
        {!rightCollapsed && <>
          <div className="pipeline-inspector-heading"><div><span className="pipeline-kicker">DETAILS</span><h2>详情</h2></div>{selectedItemIds.length > 0 && <code>{selectedItemIds.length > 1 ? `${selectedItemIds.length} 项` : selectedItemIds[0]}</code>}</div>
          <div className="pipeline-inspector-body">
            {selectedNodes.length > 1 && <><div className="pipeline-inspector-status"><i className="pipeline-status-dot" /><span>批量编辑</span><span className="pipeline-inspector-kind">{selectedNodes.length} 个节点</span></div><label>状态<select defaultValue="" onChange={(event) => { if (event.target.value) updateBulkNodes({ status: event.target.value as NodeStatus }); event.currentTarget.value = ""; }}><option value="">选择后批量修改</option>{NODE_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label>负责人<input value={bulkOwner} placeholder="多值 / 待补充" onChange={(event) => updateBulkNodes({ owner: event.target.value })} /></label><label>说明<textarea rows={5} value={bulkDescription} placeholder="多值 / 待补充" onChange={(event) => updateBulkNodes({ description: event.target.value })} /></label><button type="button" className="secondary" onClick={() => autoArrange(selectedNodes.map((node) => node.id))}>自动排序</button><button type="button" className="secondary" onClick={() => createStationFromSelection(selectedNodes.map((node) => node.id))}>创建站</button></>}
            {selectedNodes.length <= 1 && !selectedNode && !selectedStation && demand && <><div className="pipeline-inspector-status"><i className="pipeline-status-dot" /><span>星轨</span><span className="pipeline-inspector-kind">{demand.groupName || "未分组"}</span></div><label>任务名称<input value={demand.title} onChange={(event) => updateDemand({ title: event.target.value })} /></label><label>摘要<textarea rows={3} value={demand.summary} onChange={(event) => updateDemand({ summary: event.target.value })} /></label><label>分组<input value={demand.groupName || ""} placeholder="未分组" onChange={(event) => updateDemand({ groupName: event.target.value || undefined })} /></label>{demand.bug && <><label>优先级<select value={demand.bug.priority} onChange={(event) => updateBug("priority", event.target.value as NonNullable<Demand["bug"]>["priority"])}>{["P0", "P1", "P2", "P3"].map((priority) => <option key={priority} value={priority}>{priority}</option>)}</select></label><label>经办人<input value={demand.bug.assignee} placeholder="待补充" onChange={(event) => updateBug("assignee", event.target.value)} /></label><label>详情<textarea rows={5} value={demand.bug.details} placeholder="文字描述" onChange={(event) => updateBug("details", event.target.value)} /></label><label>附件<input value={demand.bug.attachments.join(", ")} placeholder="多个附件用逗号分隔" onChange={(event) => updateBug("attachments", event.target.value.split(",").map((item) => item.trim()).filter(Boolean))} /></label><label>Bug 状态<select value={demand.bug.status} onChange={(event) => updateBugStatus(event.target.value as BugStatus)}>{BUG_STATUSES.map((status) => <option key={status} value={status}>{status}</option>)}</select></label><div className="pipeline-history"><strong>状态变更记录</strong>{demand.bug.history.slice().reverse().map((entry, index) => <div key={`${entry.at}-${index}`}><b>{entry.status}</b><time>{entry.at ? new Date(entry.at).toLocaleString() : "待记录"}</time><span>{entry.content}</span></div>)}</div></>}</>}
            {selectedStation && <><div className="pipeline-inspector-status"><i className="pipeline-status-dot" /><span>站</span><span className="pipeline-inspector-kind">{nodes.filter((node) => node.stationId === selectedStation.id).length} 个节点</span></div><label>名称<input value={selectedStation.title} onChange={(event) => updateStation("title", event.target.value)} /></label><label>说明<input value={selectedStation.subtitle} onChange={(event) => updateStation("subtitle", event.target.value)} /></label><label>描述<textarea rows={4} value={selectedStation.description || ""} placeholder="待补充" onChange={(event) => updateStation("description", event.target.value)} /></label></>}
            {selectedNode && <><div className={`pipeline-inspector-status status-${selectedNode.status}`}><i className={`pipeline-status-dot status-${selectedNode.status}`} /><span>{selectedNode.kind === "gate" ? "闸口 · 人工审核" : statusLabels[selectedNode.status]}</span><span className="pipeline-inspector-kind">{selectedNode.stationId || "自由节点"}</span></div><label>状态<select value={selectedNode.status} onChange={(event) => updateNodeStatus(event.target.value as NodeStatus)}>{NODE_STATUSES.map((status) => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label><label>类型<select value={selectedNode.kind} disabled={Boolean(selectedNode.locked)} onChange={(event) => updateNode("kind", event.target.value as NodeOverride["kind"])}><option value="node">普通节点</option><option value="gate">闸口（必须人工审核）</option></select></label><label>标题<input value={selectedNode.title} onChange={(event) => updateNode("title", event.target.value)} /></label><label>负责人<input value={selectedNode.owner} placeholder="待补充" onChange={(event) => updateNode("owner", event.target.value)} /></label><label>所属站<select value={selectedNode.stationId || ""} onChange={(event) => updateNode("stationId", event.target.value || null)}><option value="">自由节点（不属于站）</option>{stations.map((station) => <option key={station.id} value={station.id}>{station.title}</option>)}</select></label><label>节点需人工审核<select value={selectedNode.requires_human_review || selectedNode.kind === "gate" ? "yes" : "no"} onChange={(event) => updateNode("requires_human_review", event.target.value === "yes")}><option value="no">否</option><option value="yes">是</option></select></label><label>审核/操作分配给<input value={selectedNode.assigned_user || ""} placeholder="未分配" onChange={(event) => updateNode("assigned_user", event.target.value)} /></label><label>说明<textarea rows={4} value={selectedNode.description} placeholder="待补充" onChange={(event) => updateNode("description", event.target.value)} /></label><label>完成证据<textarea rows={3} value={selectedNode.evidence || ""} placeholder="链接或可核验摘要" onChange={(event) => updateNode("evidence", event.target.value)} /></label>{selectedNode.kind === "gate" && <label>人工拍板人<input value={selectedNode.approver || ""} placeholder="待补充" onChange={(event) => updateNode("approver", event.target.value)} /></label>}<dl className="pipeline-facts"><div><dt>执行主体</dt><dd>{selectedNode.execution || "待补充"}</dd></div><div><dt>触发</dt><dd>{selectedNode.trigger.join(" / ") || "待补充"}</dd></div><div><dt>退出证据</dt><dd>{selectedNode.evidenceLevel || "待补充"}</dd></div></dl><button type="button" className="secondary" onClick={() => markNodesUpdated([selectedNode.id])}>标记有更新</button></>}
            {(selectedStation || selectedNode || selectedNodes.length > 1) && <button type="button" className="pipeline-delete" disabled={selectedNodes.length <= 1 && Boolean((selectedStation || selectedNode)?.locked)} onClick={() => deleteItems(selectedItemIds)}>{selectedNodes.length <= 1 && (selectedStation || selectedNode)?.locked ? "结构规则锁定，不可删除" : `删除${selectedItemIds.length > 1 ? "选中项" : "当前项"}`}</button>}
          </div>
        </>}
      </aside>
    </div>
  </section>;
}

export function Pipeline({ model }: { model: AppModel }) { return <PipelineContent model={model} />; }

export { NODE_STATUSES };
