import { OFFICE_SEEDS, officeInputSchema, type OfficeInput, type OfficeMessage, type OfficeNodeReport, type OfficePresence, type OfficeReceipt, type OfficeSnapshot } from '../../shared/office';

export class OfficePresenceRegistry {
  private entries = new Map<string, OfficePresence>();
  private runs = new Map<string, { runId: string; runOrder: number; eventOrder: number }>();
  private seen = new Map<string, string>();
  private reports = new Map<string, OfficeNodeReport>();
  private handoffs = new Map<string, Extract<OfficeInput, { type: 'handoff' }>>();
  private listeners = new Set<(message: OfficeMessage) => void>();
  private sequence = 0;
  constructor(private now = Date.now, readonly expiresAfterMs = 30000) {
    OFFICE_SEEDS.forEach(identity => this.entries.set(identity.id, { identity, status: 'idle', lastSeen: 0, expired: false, disconnected: false, summary: '演示绑定 · 来自流程状态' }));
  }
  snapshot(): OfficeSnapshot { return structuredClone({ sequence: this.sequence, entries: [...this.entries.values()], reports: [...this.reports.values()] }); }
  subscribe(listener: (message: OfficeMessage) => void) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  accept(raw: unknown): OfficeReceipt {
    const parsed = officeInputSchema.safeParse(raw);
    if (!parsed.success) return { accepted: false, sequence: this.sequence, code: 'INVALID_INPUT' };
    const input = parsed.data;
    const canonical = JSON.stringify(input), previous = this.seen.get(input.eventId);
    if (previous) return { accepted: previous === canonical, duplicate: previous === canonical, sequence: this.sequence, code: previous === canonical ? undefined : 'EVENT_CONFLICT' };
    const run = this.runs.get(input.beingId);
    if (run && (input.runOrder < run.runOrder || (input.runOrder === run.runOrder && (input.runId !== run.runId || input.eventOrder <= run.eventOrder)))) return { accepted: false, sequence: this.sequence, code: 'STALE_RUN' };
    const entry = this.entries.get(input.beingId);
    if (input.type !== 'register' && !entry) return { accepted: false, sequence: this.sequence, code: 'UNBOUND_BEING' };
    if (input.type === 'register' && input.identity.id !== input.beingId) return { accepted: false, sequence: this.sequence, code: 'IDENTITY_MISMATCH' };
    if (input.type === 'register' && !entry && this.entries.size >= 100) return { accepted: false, sequence: this.sequence, code: 'ROSTER_LIMIT' };
    if (input.type === 'presence' && (input.lastSeen > this.now() + 5000 || (entry && input.lastSeen < entry.lastSeen))) return { accepted: false, sequence: this.sequence, code: 'INVALID_LAST_SEEN' };
    if (input.type === 'handoff' && (!this.entries.has(input.toBeingId) || input.toBeingId === input.beingId || this.handoffs.has(input.handoffId))) return { accepted: false, sequence: this.sequence, code: 'INVALID_HANDOFF' };
    if (input.type === 'handoff-confirm') {
      const request = this.handoffs.get(input.handoffId), senderRun = request && this.runs.get(request.beingId);
      if (!request || request.mode !== 'business' || request.toBeingId !== input.beingId || senderRun?.runOrder !== request.runOrder || senderRun.runId !== request.runId) return { accepted: false, sequence: this.sequence, code: 'INVALID_CONFIRMATION' };
    }
    if (input.type === 'cancel') {
      const target = this.seen.get(input.targetEventId);
      if (!target) return { accepted: false, sequence: this.sequence, code: 'UNKNOWN_EVENT' };
      if ((JSON.parse(target) as OfficeInput).beingId !== input.beingId) return { accepted: false, sequence: this.sequence, code: 'NOT_OWNER' };
    }
    this.runs.set(input.beingId, { runId: input.runId, runOrder: input.runOrder, eventOrder: input.eventOrder });
    this.seen.set(input.eventId, canonical);
    if (this.seen.size > 2048) this.seen.delete(this.seen.keys().next().value!);
    if (input.type === 'register') this.entries.set(input.beingId, { identity: input.identity, status: 'idle', lastSeen: this.now(), expired: true, disconnected: false, summary: '等待实况上报' });
    if (input.type === 'unregister') this.entries.delete(input.beingId);
    if (input.type === 'disconnect') Object.assign(entry!, { disconnected: true, expired: true });
    if (input.type === 'presence') Object.assign(entry!, { status: input.status, lastSeen: input.lastSeen, summary: input.summary, expired: this.now() - input.lastSeen >= this.expiresAfterMs, disconnected: input.status === 'offline' });
    if (input.type === 'node') this.reports.set(input.demandId + ':' + input.nodeId, { ...input, reportedAt: this.now() });
    if (input.type === 'handoff') this.handoffs.set(input.handoffId, input);
    if (input.type === 'handoff-confirm') this.handoffs.delete(input.handoffId);
    if (input.type === 'cancel') for (const [key, request] of this.handoffs) if (request.eventId === input.targetEventId) this.handoffs.delete(key);
    if (this.reports.size > 1000) this.reports.delete(this.reports.keys().next().value!);
    if (this.handoffs.size > 512) this.handoffs.delete(this.handoffs.keys().next().value!);
    this.emit(input);
    return { accepted: true, sequence: this.sequence };
  }
  expire() {
    let changed = false;
    for (const entry of this.entries.values()) if (!entry.identity.demo && !entry.expired && this.now() - entry.lastSeen >= this.expiresAfterMs) { entry.expired = true; changed = true; }
    if (changed) this.emit();
  }
  private emit(input?: OfficeInput) {
    this.sequence++;
    const message: OfficeMessage = { kind: 'delta', sequence: this.sequence, snapshot: this.snapshot(), input };
    this.listeners.forEach(listener => listener(message));
  }
}
