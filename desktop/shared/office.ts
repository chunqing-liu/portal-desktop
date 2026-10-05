import { z } from 'zod';

const id = z.string().trim().min(1).max(128);
export const officeIdentitySchema = z.strictObject({ id, name: z.string().trim().min(1).max(80), owners: z.array(id).max(20), assignedUsers: z.array(id).max(20).default([]), color: z.number().int().min(0).max(0xffffff), demo: z.boolean().default(false) });
export type OfficeIdentity = z.infer<typeof officeIdentitySchema>;
const order = { eventId: id, beingId: id, runId: id, runOrder: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER), eventOrder: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER) };
const nodeStatuses = ['pending', 'ready', 'running', 'waiting_human', 'blocked', 'failed', 'done', 'skipped'] as const;
export const officeInputSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...order, type: z.literal('register'), identity: officeIdentitySchema }),
  z.strictObject({ ...order, type: z.literal('unregister') }),
  z.strictObject({ ...order, type: z.literal('presence'), status: z.enum(['working', 'thinking', 'idle', 'offline']), lastSeen: z.number().int().nonnegative(), summary: z.string().max(160).default('') }),
  z.strictObject({ ...order, type: z.literal('disconnect') }),
  z.strictObject({ ...order, type: z.literal('node'), demandId: id, nodeId: id, status: z.enum(nodeStatuses), reason: z.string().max(500).optional() }),
  z.strictObject({ ...order, type: z.literal('handoff'), toBeingId: id, handoffId: id, mode: z.enum(['visual', 'business']), summary: z.string().max(160).default('交接请求'), durationMs: z.number().int().min(300).max(30000).default(1000) }),
  z.strictObject({ ...order, type: z.literal('handoff-confirm'), handoffId: id }),
  z.strictObject({ ...order, type: z.literal('meeting-start'), sessionId: id, participantIds: z.array(id).min(2).max(4).refine(ids => new Set(ids).size === ids.length), summary: z.string().max(160).default('白板讨论') }),
  z.strictObject({ ...order, type: z.literal('meeting-join'), sessionId: id }),
  z.strictObject({ ...order, type: z.literal('meeting-leave'), sessionId: id }),
  z.strictObject({ ...order, type: z.literal('meeting-end'), sessionId: id }),
  z.strictObject({ ...order, type: z.literal('cancel'), targetEventId: id }),
]);
export type OfficeInput = z.infer<typeof officeInputSchema>;
export type OfficeReport = OfficeInput extends infer Input ? Input extends OfficeInput ? Omit<Input, 'runOrder' | 'eventOrder'> : never : never;
export type OfficeNodeReport = Extract<OfficeInput, { type: 'node' }> & { reportedAt: number };
export interface OfficePresence { identity: OfficeIdentity; status: 'working' | 'thinking' | 'idle' | 'offline'; lastSeen: number; expired: boolean; disconnected: boolean; summary: string }
export interface OfficeSnapshot { sequence: number; entries: OfficePresence[]; reports: OfficeNodeReport[] }
export type OfficeMessage = { kind: 'snapshot'; snapshot: OfficeSnapshot } | { kind: 'delta'; sequence: number; snapshot: OfficeSnapshot; input?: OfficeInput };
export interface OfficeReceipt { accepted: boolean; sequence: number; duplicate?: boolean; code?: string }
export const OFFICE_SEEDS: OfficeIdentity[] = [
  { id: 'demo-product', name: '产品伙伴', owners: ['产品 Agent'], assignedUsers: [], color: 0xe3a35d, demo: true },
  { id: 'demo-development', name: '开发伙伴', owners: ['开发 Agent'], assignedUsers: [], color: 0x6baec0, demo: true },
  { id: 'demo-test', name: '测试伙伴', owners: ['测试 Agent'], assignedUsers: [], color: 0x94b879, demo: true },
];
