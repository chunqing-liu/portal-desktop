import type { NodeStatus, PipelineLocalState } from '../models/schema';
import { demandNodes, getPipelineFlow } from '../models/templates';
import type { OfficeIdentity } from './identities';
import type { ActorPresentation } from './bridge';

export interface OfficeTask {
  key: string;
  demandId: string;
  nodeId: string;
  demandTitle: string;
  title: string;
  owner: string;
  status: NodeStatus;
  reason: string;
  actorId?: string;
  needsMe: boolean;
}
export interface OfficePerson extends ActorPresentation { identity: OfficeIdentity; tasks: OfficeTask[]; marker: string }
export interface OfficeProjection { people: OfficePerson[]; unbound: OfficeTask[]; reviews: OfficeTask[] }

export const STATUS_MARKERS: Record<NodeStatus, string> = {
  pending: '待命', ready: '可接手', running: '工作中 · 来自流程状态', waiting_human: '待审核', blocked: '阻塞', failed: '异常', done: '已结束', skipped: '已跳过',
};
const priority: NodeStatus[] = ['failed', 'blocked', 'waiting_human', 'running', 'ready', 'pending', 'done', 'skipped'];

export function projectOffice(state: PipelineLocalState, identities: OfficeIdentity[]): OfficeProjection {
  const tasks = state.demands.flatMap(demand => demandNodes(getPipelineFlow(demand.workflowId), demand).map(node => {
    const matches = node.owner.trim() && node.execution !== '人' ? identities.filter(identity => identity.owners.includes(node.owner.trim())) : [];
    return { key: demand.id + ':' + node.id, demandId: demand.id, nodeId: node.id, demandTitle: demand.title, title: node.title, owner: node.owner, status: node.status, reason: node.status === 'blocked' ? node.precondition || '阻塞原因未填写' : node.status === 'skipped' ? node.failureRoute || '跳过原因未填写' : '', actorId: matches.length === 1 ? matches[0].id : undefined, needsMe: node.status === 'waiting_human' && Boolean(node.kind === 'gate' || node.requires_human_review) && node.assigned_user === state.board.currentUserId } satisfies OfficeTask;
  }));
  return {
    people: identities.map(identity => {
      const assigned = tasks.filter(task => task.actorId === identity.id);
      const primary = priority.map(status => assigned.find(task => task.status === status)).find(Boolean);
      const marker = primary ? STATUS_MARKERS[primary.status] : '待命';
      return { id: identity.id, identity, tasks: assigned, status: primary?.status === 'running' ? 'working' : 'idle', marker, title: marker + (primary?.reason ? ' · ' + primary.reason : '') };
    }),
    unbound: tasks.filter(task => !task.actorId),
    reviews: tasks.filter(task => task.needsMe),
  };
}

