import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { SecretStorage } from '../app/settings';
import type { ModelProfileInput, ModelProfilesResult, PublicModelProfile } from '../../shared/types';
import { redact } from './connection';

export type PublicProfile = PublicModelProfile;
export interface ModelProfile extends Omit<PublicProfile, 'hasKey'> { key?: string }
const providers = new Set(['anthropic', 'openai', 'openrouter', 'gemini', 'groq', 'xai', 'glm', 'self-hosted', 'portal-custom']);
const invalid = () => new Error('无效的模型档案。');
const unavailable = () => new Error('系统密钥库不可用，无法安全保存模型密钥。');
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function validId(value: unknown): value is string {
  return typeof value === 'string' && !!value.trim() && value.length <= 128;
}
function validate(input: unknown): asserts input is ModelProfileInput {
  if (!object(input) || Object.keys(input).some(key => !['id', 'name', 'provider', 'base_url', 'api', 'model', 'thinking', 'api_key'].includes(key)) ||
    Object.values(input).some(value => value !== undefined && typeof value !== 'string') ||
    Buffer.byteLength(JSON.stringify(input), 'utf8') > 16384 ||
    (input.id !== undefined && !validId(input.id)) ||
    typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 40 ||
    typeof input.model !== 'string' || !input.model.trim() ||
    typeof input.provider !== 'string' || !providers.has(input.provider)) throw invalid();
  if (input.base_url !== undefined) {
    try {
      const url = new URL(input.base_url as string);
      // Credentials belong in safeStorage, never in a plaintext URL.
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw invalid();
    } catch { throw invalid(); }
  }
}

export class ModelProfileStore {
  private profiles: ModelProfile[] = [];
  private mutation = Promise.resolve();
  constructor(private directory: string, private storage: SecretStorage) {}
  async load() {
    let raw: string;
    try { raw = await readFile(path.join(this.directory, 'model-profiles.json'), 'utf8'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    const saved: unknown = JSON.parse(raw);
    if (!object(saved) || saved.version !== 1 || !Array.isArray(saved.profiles)) throw invalid();
    const profiles: ModelProfile[] = saved.profiles.map(value => {
      if (!object(value)) throw invalid();
      const { key, ...profile } = value;
      if ('api_key' in profile) throw invalid();
      validate(profile);
      if (!validId(profile.id) || (key !== undefined && (typeof key !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(key) || !key))) throw invalid();
      return { ...profile, id: profile.id, ...(key ? { key: key as string } : {}) };
    });
    if (new Set(profiles.map(profile => profile.id)).size !== profiles.length ||
      new Set(profiles.map(profile => profile.name)).size !== profiles.length) throw invalid();
    this.profiles = profiles;
  }
  list(): PublicProfile[] {
    return this.profiles.map(({ key, ...profile }) => ({ ...profile, hasKey: !!key }));
  }
  upsert(input: ModelProfileInput): Promise<PublicProfile[]> {
    return this.change(async () => {
      validate(input);
      if (!this.storage.isEncryptionAvailable()) throw unavailable();
      const name = input.name.trim();
      const existing = (input.id ? this.profiles.find(profile => profile.id === input.id) : undefined) ||
        this.profiles.find(profile => profile.name === name);
      if (this.profiles.some(profile => profile !== existing && profile.name === name)) throw invalid();
      const apiKey = input.api_key?.trim();
      const key = apiKey ? this.storage.encryptString(apiKey).toString('base64') : existing?.key;
      const profile: ModelProfile = {
        id: existing?.id || input.id || randomUUID(), name, provider: input.provider, model: input.model.trim(),
        ...(input.base_url !== undefined ? { base_url: input.base_url.trim() } : {}),
        ...(input.api !== undefined ? { api: input.api } : {}),
        ...(input.thinking !== undefined ? { thinking: input.thinking } : {}),
        ...(key ? { key } : {}),
      };
      await this.persist(existing ? this.profiles.map(value => value === existing ? profile : value) : [...this.profiles, profile]);
      return this.list();
    });
  }
  remove(id: string): Promise<PublicProfile[]> {
    return this.change(async () => {
      if (!validId(id)) throw invalid();
      await this.persist(this.profiles.filter(profile => profile.id !== id));
      return this.list();
    });
  }
  keyOf(id: string): string | undefined {
    const key = this.profiles.find(profile => profile.id === id)?.key;
    if (!key) return undefined;
    if (!this.storage.isEncryptionAvailable()) throw unavailable();
    return this.storage.decryptString(Buffer.from(key, 'base64'));
  }
  async persist(profiles = this.profiles) {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const file = path.join(this.directory, 'model-profiles.json');
    await writeFile(file + '.tmp', JSON.stringify({ version: 1, profiles }), { mode: 0o600 });
    await rename(file + '.tmp', file);
    this.profiles = profiles;
  }
  private change(operation: () => Promise<PublicProfile[]>) {
    const next = this.mutation.then(operation);
    this.mutation = next.then(() => {}, () => {});
    return next;
  }
}

// A server error can echo its request. Neither returned fields nor error text may
// carry the decrypted key across IPC (including into the common error logger).
function publicResult(value: unknown, key?: string): unknown {
  if (typeof value === 'string') return key ? redact(value, [key]) : value;
  if (Array.isArray(value)) return value.map(item => publicResult(item, key));
  if (object(value)) return Object.fromEntries(Object.entries(value)
    .filter(([name]) => name !== 'api_key' && name !== 'key')
    .map(([name, item]) => [key ? redact(name, [key]) : name, publicResult(item, key)]));
  return value;
}
export async function handleModelProfiles(
  input: unknown, store: ModelProfileStore,
  configure: (patch: Record<string, string | number | boolean>) => Promise<Record<string, unknown>>,
): Promise<ModelProfilesResult> {
  if (!object(input)) throw invalid();
  if (input.action === 'list' && Object.keys(input).length === 1) return { ok: true, profiles: store.list() };
  if (input.action === 'save' && Object.keys(input).length === 2 && 'profile' in input) {
    validate(input.profile);
    return { ok: true, profiles: await store.upsert(input.profile) };
  }
  if (!['delete', 'apply'].includes(String(input.action)) || Object.keys(input).length !== 2 || !validId(input.id)) throw invalid();
  if (input.action === 'delete') return { ok: true, profiles: await store.remove(input.id) };
  const profile = store.list().find(value => value.id === input.id);
  if (!profile) throw invalid();
  const key = store.keyOf(profile.id);
  try {
    const data = await configure({
      model: profile.model, provider: profile.provider,
      // Clear a custom endpoint when switching to a profile using its provider default.
      base_url: profile.base_url || '',
      ...(key !== undefined ? { api_key: key } : {}),
      ...(profile.thinking !== undefined ? { thinking: profile.thinking } : {}),
      ...(profile.provider === 'portal-custom' && profile.api !== undefined ? { api: profile.api } : {}),
    });
    return { ...publicResult(data, key) as Record<string, unknown>, ok: data.ok === true, profiles: store.list() };
  } catch (error) {
    throw new Error(redact(error instanceof Error ? error.message : '模型切换失败。', key ? [key] : []));
  }
}
