export interface OfficeIdentity {
  id: string;
  name: string;
  owners: string[];
  color: number;
  demo: boolean;
}

export const DEMO_IDENTITIES: OfficeIdentity[] = [
  { id: 'demo-product', name: '产品伙伴', owners: ['产品 Agent'], color: 0xe3a35d, demo: true },
  { id: 'demo-development', name: '开发伙伴', owners: ['开发 Agent'], color: 0x6baec0, demo: true },
  { id: 'demo-test', name: '测试伙伴', owners: ['测试 Agent'], color: 0x94b879, demo: true },
];

export class IdentityRegistry {
  private identities = new Map<string, OfficeIdentity>();
  constructor(identities: OfficeIdentity[]) { identities.forEach(identity => this.register(identity)); }
  register(identity: OfficeIdentity) {
    if (!identity.id || this.identities.has(identity.id)) throw new Error('身份 ID 为空或已注册');
    this.identities.set(identity.id, structuredClone(identity));
  }
  unregister(id: string) { return this.identities.delete(id); }
  list() { return [...this.identities.values()].map(identity => structuredClone(identity)); }
}

export type NodeStateSource = { kind: 'local' } | { kind: 'being'; beingId: string; reportedAt: number };
export interface BeingNodeReport {
  demandId: string;
  nodeId: string;
  status: import('../models/schema').NodeStatus;
  reason?: string;
  source: Extract<NodeStateSource, { kind: 'being' }>;
}
