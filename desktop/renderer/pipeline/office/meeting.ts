import { z } from 'zod';
import type { OfficeInput } from '../../../shared/office';
import type { ScenePlugin } from './vendor/runtime/plugins';
import type { OfficeRuntime } from './vendor/runtime/OfficeRuntime';
import { officeObjects } from './vendor/runtime/builtin/officePack';
import { SceneFault } from './vendor/runtime/protocol';

const boardTemplate = officeObjects.templates!.find(template => template.id === 'office.whiteboard')!;
export const starmapMeeting: ScenePlugin = {
  id: 'starmap.meetings', name: '持续白板协作', version: '1.0.0', apiVersion: 1, dependencies: ['office.objects'],
  templates: [{ ...boardTemplate, id: 'starmap.whiteboard', resources: { attendee1: 1, attendee2: 1, attendee3: 1, attendee4: 1 } }],
  stateSchemas: { 'starmap.whiteboard': z.strictObject({ title: z.string().max(60), text: z.string().max(500) }) },
  capabilities: [
    { id: 'starmap.meeting', name: '白板驻留', params: z.strictObject({ slot: z.number().int().min(1).max(4) }), build(context, raw) {
      if (context.participants.length !== 1) throw new SceneFault('INVALID_PARTICIPANTS', '每位参与者独立驻留');
      const actor = context.world.actors.find(item => item.id === context.participants[0].entityId)!;
      const slot = (raw as { slot: number }).slot;
      return { title: '白板协作', continuous: true, maxDurationMs: 3600000,
        claims: [{ resource: 'actor:' + actor.id + ':body', units: 1 }, { resource: 'actor:' + actor.id + ':speech', units: 1 }, { resource: 'prop:collab-board:attendee' + slot, units: 1 }],
        phases: [{ title: '前往白板', moves: [{ actorId: actor.id, targetId: 'collab-board', anchor: 'attendee' + slot }] }, { title: '白板驻留', poses: [{ actorId: actor.id, posture: 'standing', facing: 'back' }] }] };
    } },
    { id: 'starmap.meeting-return', name: '协作结束返回工位', params: z.strictObject({}), build(context) {
      if (context.participants.length !== 1) throw new SceneFault('INVALID_PARTICIPANTS', '每次返回一位参与者');
      const actor = context.world.actors.find(item => item.id === context.participants[0].entityId)!;
      if (!actor.homeId) throw new SceneFault('MISSING_BINDING', actor.id);
      return { title: '返回工位', claims: [{ resource: 'actor:' + actor.id + ':body', units: 1 }], phases: [{ title: '返回工位', moves: [{ actorId: actor.id, targetId: actor.homeId, anchor: 'seat' }] }, { title: '入座', poses: [{ actorId: actor.id, posture: 'seated', facing: 'back' }] }] };
    } },
  ],
};

type Member = { id: string; eventId: string; slot: number; state: 'waiting' | 'arriving' | 'present' | 'leaving' | 'returning' | 'left' | 'failed'; commandId?: string; activityId?: string; returnHome: boolean; code?: string };
export type MeetingView = { sessionId: string; summary: string; error?: { eventId: string; code: string }; phase: 'arriving' | 'active' | 'waiting' | 'paused' | 'ending' | 'ended'; participants: { id: string; state: Member['state']; code?: string }[] };
type Session = { sessionId: string; summary: string; eventId: string; initiator: string; ending: boolean; members: Member[] };
const terminal = (status?: string) => status && ['completed', 'cancelled', 'failed', 'rejected', 'expired'].includes(status);

export class MeetingController {
  private session?: Session;
  private enabled = false;
  private processing = false;
  private disposed = false;
  private unavailable = new Set<string>();
  private seen = new Set<string>();
  private runs = new Map<string, number>();
  private unsubscribe: () => void;
  private signature = '';
  private boardSignature = '';
  private error?: { eventId: string; code: string };
  constructor(readonly runtime: OfficeRuntime, private onChange = (_view?: MeetingView) => {}) { this.unsubscribe = runtime.subscribe(() => this.poll()); }
  get view(): MeetingView | undefined {
    const session = this.session;
    if (!session) return;
    const members = session.members.filter(member => !['left', 'failed'].includes(member.state));
    const phase = session.ending ? members.length ? 'ending' : 'ended' : !this.enabled ? 'paused' : members.some(member => member.state === 'waiting' || member.state === 'arriving') ? 'arriving' : members.filter(member => member.state === 'present').length >= 2 ? 'active' : 'waiting';
    return { sessionId: session.sessionId, summary: session.summary, error: this.error, phase, participants: session.members.map(({ id, state, code }) => ({ id, state, code })) };
  }
  preserve() { return this.session && !this.session.ending ? structuredClone(this.session) : undefined; }
  restore(session?: Session) {
    if (!session) { this.onChange(undefined); return; }
    const actors = new Set(this.runtime.readActors().map(actor => actor.id));
    this.session = { ...session, members: session.members.filter(member => actors.has(member.id)).map(member => ({ ...member, commandId: undefined, activityId: undefined })) };
    this.poll();
  }
  get settled() { return !this.session?.members.some(member => ['arriving', 'present', 'leaving', 'returning'].includes(member.state)); }
  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled && this.session?.ending) this.end(false);
    this.poll();
  }
  setUnavailable(ids: string[]) {
    this.unavailable = new Set(ids);
    this.session?.members.filter(member => this.unavailable.has(member.id)).forEach(member => this.leave(member, this.enabled));
    this.poll();
  }
  receive(input: OfficeInput) {
    if (this.disposed || this.seen.has(input.eventId)) return;
    this.seen.add(input.eventId); if (this.seen.size > 2048) this.seen.delete(this.seen.values().next().value!);
    const previous = this.runs.get(input.beingId);
    if (previous !== undefined && input.runOrder < previous) return;
    if (previous !== undefined && input.runOrder > previous) {
      const member = this.session?.members.find(item => item.id === input.beingId);
      if (member) this.leave(member, this.enabled);
    }
    this.runs.set(input.beingId, input.runOrder);
    if (input.type === 'meeting-start') {
      if (!this.settled) { this.error = { eventId: input.eventId, code: 'BUSY' }; this.onChange(this.view); return; }
      this.error = undefined;
      this.session = { sessionId: input.sessionId, summary: input.summary, eventId: input.eventId, initiator: input.beingId, ending: false, members: input.participantIds.map((id, index) => ({ id, eventId: input.eventId, slot: index + 1, state: this.unavailable.has(id) ? 'left' : 'waiting', returnHome: true })) };
      this.boardSignature = '';
    } else if (input.type === 'meeting-join' && this.session?.sessionId === input.sessionId && !this.session.ending && !this.unavailable.has(input.beingId)) {
      const members = this.session.members.filter(member => !['left', 'failed'].includes(member.state));
      const slot = [1, 2, 3, 4].find(value => !members.some(member => member.slot === value));
      if (slot && !members.some(member => member.id === input.beingId)) {
        this.session.members = this.session.members.filter(member => member.id !== input.beingId);
        this.session.members.push({ id: input.beingId, eventId: input.eventId, slot, state: 'waiting', returnHome: true });
      }
    } else if (input.type === 'meeting-leave' && this.session?.sessionId === input.sessionId) {
      const member = this.session.members.find(item => item.id === input.beingId); if (member) this.leave(member, this.enabled);
    } else if (input.type === 'meeting-end' && this.session?.sessionId === input.sessionId) this.end(this.enabled);
    else if (input.type === 'cancel') {
      const member = this.session?.members.find(item => item.id === input.beingId && item.eventId === input.targetEventId); if (member) this.leave(member, this.enabled);
    }
    this.poll();
  }
  end(returnHome = true) { if (this.session) { this.session.ending = true; this.session.members.forEach(member => this.leave(member, returnHome)); } this.poll(); }
  private leave(member: Member, returnHome: boolean) {
    member.returnHome = returnHome;
    if (['left', 'failed', 'leaving'].includes(member.state)) return;
    if (member.state === 'waiting') { member.state = 'left'; return; }
    member.state = 'leaving';
    const record = member.commandId && this.runtime.getRecord(member.commandId);
    const activityId = record && record.activityId || member.activityId;
    if (activityId) this.submit({ type: 'activity.stop', activityId });
    else if (member.commandId && !terminal(record && record.status)) this.submit({ type: 'command.cancel', targetCommandId: member.commandId });
  }
  private submit(fields: Record<string, unknown>) { return this.runtime.submit({ protocolVersion: '2.0', sceneId: this.runtime.sceneId, commandId: 'meeting-' + crypto.randomUUID(), ...fields }); }
  private launch(member: Member, returning: boolean) {
    member.state = returning ? 'returning' : 'arriving';
    member.commandId = 'meeting-' + crypto.randomUUID(); member.activityId = undefined;
    const result = this.runtime.submit({ protocolVersion: '2.0', sceneId: this.runtime.sceneId, commandId: member.commandId, type: 'activity.start', capability: returning ? 'starmap.meeting-return' : 'starmap.meeting', participants: [{ entityId: member.id, role: 'attendee' }], busyPolicy: 'reject', params: returning ? {} : { slot: member.slot } });
    member.activityId = result.activityId;
    if (['failed', 'rejected'].includes(result.status)) { member.state = 'failed'; member.code = result.error?.code; }
  }
  private released(member: Member) {
    const record = member.commandId && this.runtime.getRecord(member.commandId);
    if (!record) return true;
    member.activityId = record.activityId;
    return !this.runtime.hasActivityResources(record.activityId) && (terminal(record.status) || member.state === 'leaving');
  }
  private poll() {
    if (this.processing || this.disposed || !this.session) return;
    this.processing = true;
    try {
      const phases = this.runtime.readActivePhases();
      for (const member of this.session.members) {
        const record = member.commandId && this.runtime.getRecord(member.commandId);
        if (record) member.activityId = record.activityId;
        if (member.state === 'arriving' && phases.some(phase => phase.activityId === member.activityId && phase.title === '白板驻留' && phase.ready)) { member.state = 'present'; this.runtime.releaseStationReservations(member.activityId!); }
        if ((member.state === 'arriving' || member.state === 'present') && record && ['failed', 'rejected', 'cancelled', 'expired'].includes(record.status)) { member.state = 'leaving'; member.returnHome = this.enabled; member.code = record.error?.code; }
        if (member.state === 'returning' && record && terminal(record.status) && this.released(member)) { member.state = record.status === 'completed' ? 'left' : 'failed'; member.code = record.error?.code; }
        if (member.state === 'leaving' && this.released(member)) {
          if (member.returnHome && this.enabled) member.state = 'waiting'; else member.state = 'left';
        }
      }
      const moving = this.session.members.some(member => ['arriving', 'leaving', 'returning'].includes(member.state));
      if (this.enabled && !moving) {
        const next = this.session.members.find(member => member.state === 'waiting');
        if (next) this.launch(next, this.session.ending || Boolean(next.commandId));
      }
      const view = this.view!;
      const signature = JSON.stringify(view);
      if (signature !== this.signature) { this.signature = signature; this.onChange(view); }
      const text = view.phase === 'active' ? view.summary : view.phase === 'arriving' ? '等待参与者到场' : view.phase === 'waiting' ? '等待其他参与者' : view.phase === 'paused' ? '场景已暂停，会话仍在进行' : '讨论已结束';
      const boardSignature = view.phase + ':' + text;
      if (boardSignature !== this.boardSignature) {
        this.boardSignature = boardSignature;
        const board = this.runtime.readWorld().props.find(prop => prop.id === 'collab-board')!;
        this.submit({ type: 'object.state.set', entityId: board.id, expectedStateRevision: board.stateRevision, state: { title: view.phase === 'active' ? '讨论中' : '白板协作', text } });
      }
    } finally { this.processing = false; }
  }
  refresh() { this.poll(); }
  dispose() { this.end(false); this.disposed = true; this.unsubscribe(); }
}
