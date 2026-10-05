import { describe, expect, it } from 'vitest';
import { createStarmapRuntime } from '../desktop/renderer/pipeline/office/world';
import { MeetingController } from '../desktop/renderer/pipeline/office/meeting';
import type { OfficeInput } from '../desktop/shared/office';
import { OfficeHost } from '../desktop/renderer/pipeline/office/host';
import { actorPixels } from '../desktop/renderer/pipeline/office/vendor/scene/gridProjection';

const identities = ['a', 'b', 'c', 'd'].map(id => ({ id, name: id, owners: [id], color: 0x779999, demo: false }));
const input = (fields: Record<string, unknown>): OfficeInput => ({ eventId: crypto.randomUUID(), beingId: 'a', runId: 'run-1', runOrder: 1, eventOrder: 1, ...fields } as OfficeInput);
function fixture(count = 4) {
  const runtime = createStarmapRuntime(identities.slice(0, count));
  const meetings = new MeetingController(runtime); meetings.setEnabled(true);
  const advance = (until: () => boolean) => {
    let ticks = 0;
    while (!until() && ticks++ < 3000) {
      const before = runtime.readActors();
      runtime.tick(50); meetings.refresh();
      runtime.readActors().forEach(actor => {
        const previous = before.find(item => item.id === actor.id)!;
        expect(Math.hypot(actor.position.x - previous.position.x, actor.position.y - previous.position.y)).toBeLessThanOrEqual(1.01);
        const pixels = actorPixels(actor), prior = actorPixels(previous);
        expect(Math.hypot(pixels.x - prior.x, pixels.y - prior.y)).toBeLessThan(35);
      });
    }
    expect(until(), JSON.stringify(meetings.view)).toBe(true);
  };
  return { runtime, meetings, advance };
}

describe('whiteboard continuous sessions', () => {
  for (const count of [2, 3, 4]) it(count + ' participants walk, arrive before discussion and return without task commands', () => {
    const { runtime, meetings, advance } = fixture(count);
    meetings.receive(input({ type: 'meeting-start', sessionId: 'session', participantIds: identities.slice(0, count).map(item => item.id), summary: '授权摘要' }));
    expect(meetings.view?.phase).toBe('arriving');
    advance(() => meetings.view?.phase === 'active');
    expect(meetings.view?.participants.every(member => member.state === 'present')).toBe(true);
    runtime.tick(100); meetings.refresh();
    expect(runtime.readActivePhases()).toHaveLength(count);
    expect(runtime.hasMotionWork).toBe(false);
    meetings.receive(input({ type: 'meeting-end', sessionId: 'session', eventOrder: 2 }));
    advance(() => meetings.view?.phase === 'ended');
    expect(runtime.snapshot().resources.every(resource => !resource.holders.length)).toBe(true);
    expect(runtime.readActors().every(actor => actor.posture === 'seated')).toBe(true);
    expect(runtime.snapshot().records.every(record => ['activity.start', 'activity.stop', 'object.state.set'].includes(record.command.type))).toBe(true);
    meetings.dispose(); runtime.dispose();
  });

  it('participant departure and join do not end survivors or share workstation claims', () => {
    const { runtime, meetings, advance } = fixture();
    meetings.receive(input({ type: 'meeting-start', sessionId: 'session', participantIds: ['a', 'b', 'c'], summary: '讨论' }));
    advance(() => meetings.view?.phase === 'active');
    meetings.setUnavailable(['a']);
    advance(() => meetings.view?.participants.find(member => member.id === 'a')?.state === 'left');
    expect(meetings.view?.phase).toBe('active');
    expect(runtime.readActivePhases().flatMap(phase => phase.participants).sort()).toEqual(['b', 'c']);
    const join = input({ type: 'meeting-join', beingId: 'd', sessionId: 'session' });
    meetings.receive(join);
    advance(() => meetings.view?.participants.find(member => member.id === 'd')?.state === 'present');
    expect(runtime.snapshot().resources.filter(resource => resource.holders.length).some(resource => resource.resource.startsWith('prop:desk-'))).toBe(false);
    meetings.receive(input({ type: 'cancel', beingId: 'd', targetEventId: join.eventId }));
    advance(() => meetings.view?.participants.find(member => member.id === 'd')?.state === 'left');
    expect(meetings.view?.phase).toBe('active');
    meetings.end(); advance(() => meetings.view?.phase === 'ended'); meetings.dispose(); runtime.dispose();
  });

  it('hidden visibility pauses the session without ending it; cancellation settles only cancelled actors', () => {
    const { runtime, meetings, advance } = fixture(2);
    meetings.receive(input({ type: 'meeting-start', sessionId: 'session', participantIds: ['a', 'b'], summary: '暂停不结束' }));
    advance(() => Boolean(runtime.readActors()[0].step));
    meetings.setEnabled(false); expect(meetings.view?.phase).toBe('paused');
    const position = runtime.readActors()[0]; runtime.settleCancelled(100); expect(runtime.readActors()[0]).toEqual(position);
    meetings.receive(input({ type: 'meeting-leave', sessionId: 'session', eventOrder: 2 }));
    for (let count = 0; count < 30; count++) { runtime.settleCancelled(50); meetings.refresh(); }
    expect(meetings.view?.participants.find(member => member.id === 'a')?.state).toBe('left');
    expect(meetings.view?.participants.find(member => member.id === 'b')?.state).toBe('waiting');
    meetings.setEnabled(true);
    advance(() => meetings.view?.participants.find(member => member.id === 'b')?.state === 'present');
    meetings.end(); advance(() => meetings.view?.phase === 'ended'); meetings.dispose(); runtime.dispose();
  });

  it('unregister removes only that participant and defers roster rebuild until survivors finish', async () => {
    const host = new OfficeHost(identities.slice(0, 3), () => {}); host.setActive(true);
    host.meetings.receive(input({ type: 'meeting-start', sessionId: 'session', participantIds: ['a', 'b', 'c'], summary: '成员变化' }));
    const runUntil = (until: () => boolean) => { for (let count = 0; count < 3000 && !until(); count++) { host.runtime.tick(50); host.meetings.refresh(); } expect(until()).toBe(true); };
    runUntil(() => host.meetings.view?.phase === 'active');
    const previous = host.runtime;
    host.roster(identities.slice(1, 3));
    host.presence(identities.slice(1, 3).map(identity => ({ identity: { ...identity, assignedUsers: [] }, status: 'working', lastSeen: Date.now(), expired: false, disconnected: false, summary: '' })));
    runUntil(() => host.meetings.view?.participants.find(member => member.id === 'a')?.state === 'left');
    await Promise.resolve(); expect(host.runtime).toBe(previous); expect(host.meetings.view?.phase).toBe('active');
    host.meetings.end(); runUntil(() => host.meetings.view?.phase === 'ended');
    await Promise.resolve(); expect(host.runtime).not.toBe(previous); expect(host.runtime.readActors().map(actor => actor.id)).toEqual(['b', 'c']);
    expect(previous.hasPendingSettlement).toBe(false); host.dispose();
  });

  it('retains a paused session across roster rebuild and reports BUSY without replacing an active session', async () => {
    const host = new OfficeHost(identities.slice(0, 2), () => {});
    host.meetings.receive(input({ type: 'meeting-start', sessionId: 'session', participantIds: ['a', 'b'], summary: '持续会话' }));
    expect(host.meetings.view?.phase).toBe('paused');
    host.roster(identities.slice(0, 3)); await Promise.resolve();
    expect(host.meetings.view?.sessionId).toBe('session'); host.setActive(true);
    for (let count = 0; count < 3000 && host.meetings.view?.phase !== 'active'; count++) { host.runtime.tick(50); host.meetings.refresh(); }
    expect(host.meetings.view?.phase).toBe('active');
    host.meetings.receive(input({ type: 'meeting-start', sessionId: 'other', participantIds: ['a', 'b'], summary: '冲突' }));
    expect(host.meetings.view?.sessionId).toBe('session'); expect(host.meetings.view?.error?.code).toBe('BUSY');
    const runtime = host.runtime; host.dispose(); expect(runtime.snapshot().resources.every(resource => !resource.holders.length)).toBe(true);
    expect((runtime as unknown as { listeners: Set<unknown> }).listeners.size).toBe(0);
  });

  for (const stage of ['queued', 'rising', 'walking', 'present', 'returning']) it('cancel and dispose release resources during ' + stage, () => {
    const { runtime, meetings, advance } = fixture(2);
    meetings.receive(input({ type: 'meeting-start', sessionId: 'session', participantIds: ['a', 'b'], summary: '取消验证' }));
    if (stage === 'rising') advance(() => Boolean(runtime.readActors()[0].seatTransition));
    if (stage === 'walking') advance(() => Boolean(runtime.readActors()[0].step));
    if (stage === 'present' || stage === 'returning') advance(() => meetings.view?.phase === 'active');
    if (stage === 'returning') { meetings.end(); advance(() => meetings.view?.participants.some(member => member.state === 'returning') === true); }
    meetings.setEnabled(false); meetings.end(false);
    advance(() => meetings.view?.phase === 'ended');
    expect(runtime.snapshot().resources.every(resource => !resource.holders.length)).toBe(true);
    const revision = runtime.getRevision(); meetings.dispose(); runtime.dispose(); runtime.tick(100);
    expect(runtime.getRevision()).toBe(revision);
  });
});
