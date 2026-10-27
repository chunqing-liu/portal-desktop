import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { SecretStorage } from '../app/settings';
import type { ModelProfileInput } from '../../shared/types';
import { handleModelProfiles, ModelProfileStore } from './model-profiles';

let directory: string;
let available: boolean;
let storage: SecretStorage;
let store: ModelProfileStore;
const input: ModelProfileInput = {
  name: '公司中转', provider: 'portal-custom', model: 'fixture-model',
  base_url: 'https://models.example.test/v1', api: 'openai-completions', thinking: 'high',
  api_key: 'unit-test-model-secret',
};
beforeEach(async () => {
  directory = await mkdtemp(path.join(os.tmpdir(), 'portal-model-profiles-'));
  available = true;
  storage = {
    isEncryptionAvailable: () => available,
    encryptString: vi.fn(value => Buffer.from(value, 'utf8')),
    decryptString: vi.fn(value => value.toString('utf8')),
  };
  store = new ModelProfileStore(directory, storage);
});
afterEach(async () => { await rm(directory, { recursive: true, force: true }); });

describe('ModelProfileStore', () => {
  it('round-trips encrypted keys without including key fields in public profiles', async () => {
    await store.load();
    expect(store.list()).toEqual([]);
    const [profile] = await store.upsert(input);
    expect(profile).toMatchObject({ name: input.name, provider: input.provider, hasKey: true });
    expect(profile).not.toHaveProperty('key');
    expect(profile).not.toHaveProperty('api_key');
    const raw = await readFile(path.join(directory, 'model-profiles.json'), 'utf8');
    expect(raw).not.toContain(input.api_key);
    expect(raw).not.toContain('api_key');
    expect(JSON.parse(raw)).toMatchObject({ version: 1, profiles: [{ key: Buffer.from(input.api_key!).toString('base64') }] });
    expect(await readdir(directory)).toEqual(['model-profiles.json']);
    const reopened = new ModelProfileStore(directory, storage);
    await reopened.load();
    expect(storage.decryptString).not.toHaveBeenCalled();
    expect(reopened.list()).toEqual([profile]);
    expect(reopened.keyOf(profile.id)).toBe(input.api_key);
    profile.name = 'renderer mutation';
    expect(reopened.list()[0].name).toBe(input.name);
  });
  it('updates by name or id and preserves an existing key when api_key is blank or omitted', async () => {
    const [original] = await store.upsert(input);
    let [updated] = await store.upsert({ ...input, api_key: '', model: 'new-model' });
    expect(updated.id).toBe(original.id);
    expect(store.keyOf(updated.id)).toBe(input.api_key);
    const { api_key: _, ...publicInput } = input;
    [updated] = await store.upsert({ ...publicInput, id: original.id, name: '新名称' });
    expect(store.list()).toHaveLength(1);
    expect(updated.name).toBe('新名称');
    expect(store.keyOf(updated.id)).toBe(input.api_key);
    await store.upsert({ ...publicInput, id: original.id, name: '新名称', api_key: '  ' });
    expect(store.keyOf(updated.id)).toBe(input.api_key);
    await store.upsert({ ...publicInput, id: original.id, api_key: 'replacement-test-secret' });
    expect(store.keyOf(updated.id)).toBe('replacement-test-secret');
  });
  it('removes only the requested profile and persists deletion', async () => {
    const [first] = await store.upsert(input);
    await store.upsert({ name: '自部署', provider: 'self-hosted', model: 'local-model' });
    const remaining = await store.remove(first.id);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toMatchObject({ name: '自部署', hasKey: false });
    expect(store.keyOf(first.id)).toBeUndefined();
    const reopened = new ModelProfileStore(directory, storage);
    await reopened.load();
    expect(reopened.list()).toEqual(remaining);
  });
  it.each([
    { provider: 'unknown-provider' }, { name: '长'.repeat(41) }, { name: ' ' }, { model: ' ' },
    { base_url: 'file:///tmp/models' }, { base_url: 'not-a-url' }, { base_url: '' },
    { base_url: 'https://user:password@example.test/v1' },
    { api_key: '密'.repeat(6000) }, { key: 'plaintext-is-not-accepted' },
  ])('rejects invalid profile fields: %j', async patch => {
    await expect(store.upsert({ ...input, ...patch })).rejects.toThrow('无效的模型档案。');
    expect(store.list()).toEqual([]);
  });
  it('reports the Chinese keychain error on save while load/list/remove remain usable', async () => {
    const [profile] = await store.upsert(input);
    available = false;
    const reopened = new ModelProfileStore(directory, storage);
    await reopened.load();
    expect(reopened.list()).toEqual([profile]);
    await expect(reopened.upsert(input)).rejects.toThrow('系统密钥库不可用，无法安全保存模型密钥。');
    await expect(reopened.upsert({ name: '无密钥', provider: 'self-hosted', model: 'local' })).rejects.toThrow('系统密钥库不可用，无法安全保存模型密钥。');
    expect(() => reopened.keyOf(profile.id)).toThrow('系统密钥库不可用，无法安全保存模型密钥。');
    expect(await reopened.remove(profile.id)).toEqual([]);
    expect(storage.decryptString).not.toHaveBeenCalled();
  });
  it('serializes concurrent edits so atomic temporary writes do not lose profiles', async () => {
    await Promise.all(Array.from({ length: 6 }, (_, index) => store.upsert({ ...input, name: `配置 ${index}` })));
    expect(store.list()).toHaveLength(6);
    const reopened = new ModelProfileStore(directory, storage);
    await reopened.load();
    expect(reopened.list()).toEqual(store.list());
  });
  it('keeps the previous in-memory and on-disk profiles after a write failure', async () => {
    const original = await store.upsert(input);
    const raw = await readFile(path.join(directory, 'model-profiles.json'), 'utf8');
    await mkdir(path.join(directory, 'model-profiles.json.tmp'));
    await expect(store.upsert({ ...input, model: 'not-persisted' })).rejects.toThrow();
    expect(store.list()).toEqual(original);
    expect(await readFile(path.join(directory, 'model-profiles.json'), 'utf8')).toBe(raw);
  });
  it('rejects a malformed disk file rather than exposing an injected plaintext key', async () => {
    await writeFile(path.join(directory, 'model-profiles.json'), JSON.stringify({ version: 1, profiles: [{ ...input, id: 'injected' }] }));
    await expect(store.load()).rejects.toThrow('无效的模型档案。');
    expect(store.list()).toEqual([]);
  });
});

describe('model profile IPC operations', () => {
  it('lists, saves and deletes using only public profile responses', async () => {
    const configure = vi.fn();
    expect(await handleModelProfiles({ action: 'list' }, store, configure)).toEqual({ ok: true, profiles: [] });
    const saved = await handleModelProfiles({ action: 'save', profile: input }, store, configure);
    expect(JSON.stringify(saved)).not.toContain(input.api_key);
    expect(saved.profiles[0]).not.toHaveProperty('key');
    expect(await handleModelProfiles({ action: 'delete', id: saved.profiles[0].id }, store, configure)).toEqual({ ok: true, profiles: [] });
    expect(configure).not.toHaveBeenCalled();
  });
  it('applies a decrypted key through the shared configuration operation and strips echoed secrets', async () => {
    const [profile] = await store.upsert(input);
    const configure = vi.fn().mockResolvedValue({
      ok: true, config: { provider: input.provider, model: input.model, api_key: input.api_key },
      message: `upstream echoed ${input.api_key}`, details: [{ key: 'do-not-return-this', api_key: input.api_key }],
      labels: { [input.api_key!]: 'echoed property name' },
    });
    const result = await handleModelProfiles({ action: 'apply', id: profile.id }, store, configure);
    expect(configure).toHaveBeenCalledWith({
      provider: input.provider, model: input.model, base_url: input.base_url,
      api: input.api, thinking: input.thinking, api_key: input.api_key,
    });
    expect(result).toMatchObject({ ok: true, profiles: [profile], config: { provider: input.provider, model: input.model } });
    expect(JSON.stringify(result)).not.toContain(input.api_key);
    expect(JSON.stringify(result)).not.toContain('do-not-return-this');
    expect(result.config).not.toHaveProperty('api_key');
  });
  it('clears a custom base URL when applying a keyless provider-default profile and omits api', async () => {
    const [profile] = await store.upsert({ name: '路由', provider: 'openrouter', model: 'vendor/model', api: 'not-for-this-provider' });
    const configure = vi.fn().mockResolvedValue({ ok: true });
    await handleModelProfiles({ action: 'apply', id: profile.id }, store, configure);
    expect(configure).toHaveBeenCalledWith({ provider: 'openrouter', model: 'vendor/model', base_url: '' });
  });
  it.each([
    { ok: false, http_status: 401, error: '服务商拒绝了密钥。' },
    { ok: true, rolled_back: true, config: { provider: 'openai', model: 'previous' } },
  ])('preserves failure and rollback results: %j', async response => {
    const [profile] = await store.upsert(input);
    const result = await handleModelProfiles({ action: 'apply', id: profile.id }, store, vi.fn().mockResolvedValue(response));
    expect(result).toMatchObject(response);
    expect(result.profiles).toEqual([profile]);
  });
  it('redacts a decrypted key from thrown errors before the IPC logger receives them', async () => {
    const [profile] = await store.upsert(input);
    const configure = vi.fn().mockRejectedValue(new Error(`failed for ${input.api_key}`));
    await expect(handleModelProfiles({ action: 'apply', id: profile.id }, store, configure)).rejects.toThrow('failed for [redacted]');
  });
  it.each([null, [], {}, { action: 'invalid' }, { action: 'list', extra: true }, { action: 'save', profile: null },
    { action: 'apply', id: '' }, { action: 'apply', id: 'x'.repeat(129) }, { action: 'apply', id: 'missing' },
    { action: 'delete', id: 123 }, { action: 'save', profile: { ...input, model: '密'.repeat(6000) } },
  ])('rejects malformed IPC input: %j', async request => {
    const configure = vi.fn();
    await expect(handleModelProfiles(request, store, configure)).rejects.toThrow('无效的模型档案。');
    expect(configure).not.toHaveBeenCalled();
  });
});
