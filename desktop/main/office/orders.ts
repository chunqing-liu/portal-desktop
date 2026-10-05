import { existsSync, readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { officeInputSchema, type OfficeInput } from '../../shared/office';

const runSchema = z.strictObject({ beingId: z.string(), runId: z.string(), runOrder: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), eventOrder: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), retired: z.array(z.string()).max(2048), lastSeen: z.number().nonnegative().optional() });
const stateSchema = z.strictObject({ nextRunOrder: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), runs: z.array(runSchema).max(1024), events: z.array(officeInputSchema).max(2048) });
type OrderState = z.infer<typeof stateSchema>;

export class OfficeOrders {
  private state: OrderState = { nextRunOrder: 0, runs: [], events: [] };
  constructor(private file?: string, private now = Date.now) {
    if (file && existsSync(file)) {
      this.state = stateSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
      this.state.runs.forEach(run => { run.lastSeen ??= this.now(); });
    }
  }
  assign(raw: unknown): OfficeInput {
    const input = officeInputSchema.parse({ ...(raw as object), runOrder: 0, eventOrder: 0 });
    if (this.state.runs.find(run => run.beingId === input.beingId)?.retired.includes(input.runId)) throw new Error('STALE_RUN');
    const previous = this.state.events.find(event => event.eventId === input.eventId);
    if (previous) {
      if (JSON.stringify({ ...previous, runOrder: 0, eventOrder: 0 }) !== JSON.stringify(input)) throw new Error('EVENT_CONFLICT');
      return structuredClone(previous);
    }
    const next = structuredClone(this.state);
    const cutoff = this.now() - 30 * 24 * 60 * 60 * 1000;
    next.runs = next.runs.filter(run => run.beingId === input.beingId || (run.lastSeen ?? this.now()) >= cutoff);
    const retained = new Set(next.runs.map(run => run.beingId));
    next.events = next.events.filter(event => retained.has(event.beingId));
    let run = next.runs.find(item => item.beingId === input.beingId);
    if (run?.retired.includes(input.runId)) throw new Error('STALE_RUN');
    if (!run || run.runId !== input.runId) {
      if (!run && next.runs.length >= 1024) throw new Error('ORDER_CAPACITY');
      if (next.nextRunOrder >= Number.MAX_SAFE_INTEGER) throw new Error('ORDER_EXHAUSTED');
      const retired = run ? [...run.retired, run.runId].slice(-2048) : [];
      const nextRun = { beingId: input.beingId, runId: input.runId, runOrder: ++next.nextRunOrder, eventOrder: 0, retired };
      if (run) next.runs[next.runs.indexOf(run)] = nextRun; else next.runs.push(nextRun);
      run = nextRun;
    }
    if (run.eventOrder >= Number.MAX_SAFE_INTEGER) throw new Error('ORDER_EXHAUSTED');
    run.lastSeen = this.now();
    const assigned = { ...input, runOrder: run.runOrder, eventOrder: ++run.eventOrder };
    next.events.push(assigned); next.events = next.events.slice(-2048);
    if (this.file) {
      mkdirSync(dirname(this.file), { recursive: true });
      writeFileSync(this.file + '.tmp', JSON.stringify(next), 'utf8');
      renameSync(this.file + '.tmp', this.file);
    }
    this.state = next;
    return assigned;
  }
}
