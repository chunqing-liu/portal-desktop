import { afterEach, expect, it, vi } from 'vitest';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { parsePluginManifest } from '../desktop/shared/plugins';
import { PluginRegistry, readPlugin } from '../desktop/main/plugins/registry';
import { createPluginServices, type PluginCallContext } from '../desktop/main/plugins/services';

const manifest = parsePluginManifest({ schemaVersion: 1, apiVersion: 1, minSdkVersion: '1.5.0', id: 'example.network', name: 'API fixture', version: '1.0.0', author: 'Test', description: 'API access', entry: 'index.html', capabilities: ['network', 'external.open'], contributes: { views: [{ id: 'main', title: 'API' }] } });
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
function fixture(fetcher: typeof fetch = vi.fn(async () => Response.json({ ok: true }))) {
  const openExternal = vi.fn(async (_url: string) => {});
  const services = createPluginServices({ contextKey: () => 'fixture', endpoint: () => '', being: () => ({ connected: false, name: '', sceneId: '', sceneLabel: '' }),
    town: vi.fn(), proxy: { handle: vi.fn() }, confirmChat: vi.fn(), fetcher, openExternal });
  const context: PluginCallContext = { manifest, signal: new AbortController().signal, check: vi.fn(), emit: vi.fn() };
  return { services, context, openExternal };
}
it('forwards arbitrary HTTP(S) APIs without a Being connection and preserves error bodies and explicit headers', async () => {
  const fetcher = vi.fn(async () => new Response('{"reason":"invalid"}', { status: 422, headers: { 'content-type': 'application/json', 'x-api-version': 'v2' } }));
  const { services, context } = fixture(fetcher);
  const result = await services.call('network.fetch', { url: 'https://arbitrary.example/api', method: 'POST', headers: { authorization: 'Bearer plugin-key' }, body: '{"name":"hello"}' }, context);
  expect(result).toMatchObject({ status: 422, body: '{"reason":"invalid"}', headers: { 'x-api-version': 'v2' } });
  expect(fetcher).toHaveBeenCalledWith('https://arbitrary.example/api', expect.objectContaining({ method: 'POST', headers: { authorization: 'Bearer plugin-key' }, body: '{"name":"hello"}', credentials: 'omit', redirect: 'follow' }));
  await expect(services.call('network.fetch', { url: 'http://127.0.0.1:8000/api' }, context)).resolves.toMatchObject({ status: 422 });
});
it.each(['file:///etc/passwd', 'javascript:alert(1)', 'beings://desktop/'])('does not treat %s as an HTTP API or external website', async url => {
  const { services, context, openExternal } = fixture();
  await expect(services.call('network.fetch', { url }, context)).rejects.toThrow();
  await expect(services.call('ui.openExternal', url, context)).rejects.toThrow();
  expect(openExternal).not.toHaveBeenCalled();
});
it('opens normal links through the host browser service', async () => {
  const { services, context, openExternal } = fixture();
  await services.call('ui.openExternal', 'https://example.com/article?q=test#section', context);
  expect(openExternal).toHaveBeenCalledWith('https://example.com/article?q=test#section');
});
it('cancels requests when the plugin session closes', async () => {
  const fetcher: typeof fetch = async (_url, init) => new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('cancelled'))));
  const { services, context } = fixture(fetcher);
  const controller = new AbortController(); context.signal = controller.signal;
  const request = services.call('network.fetch', { url: 'https://example.com/api' }, context);
  controller.abort();
  await expect(request).rejects.toThrow('cancelled');
});
it('bounds responses and cancels the body reader on overflow', async () => {
  const cancel = vi.fn();
  const { services, context } = fixture(async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(8 * 1024 * 1024 + 1)); }, cancel })));
  await expect(services.call('network.fetch', { url: 'https://example.com/api' }, context)).rejects.toThrow('8 MB');
  expect(cancel).toHaveBeenCalledOnce();
});
it('enables browser networking for declared plugins and enforces host capabilities and revocation', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plugin-network-')); roots.push(root);
  const source = path.join(root, 'source'); await mkdir(source);
  const { services } = fixture();
  const registry = new PluginRegistry(path.join(root, 'registry'), services);
  for (const enabled of [false, true]) {
    const id = enabled ? 'example.allowed' : 'example.denied';
    await writeFile(path.join(source, 'desktop.plugin.json'), JSON.stringify({ ...manifest, id, capabilities: enabled ? manifest.capabilities : [] }));
    await writeFile(path.join(source, 'index.html'), '<h1>Network</h1>');
    await registry.install(await readPlugin(source), { kind: 'local' });
    const session = await registry.open(id, 'main');
    const csp = registry.document(new URL(session.url)).headers.get('Content-Security-Policy');
    expect(csp).toContain(enabled ? 'connect-src https: http: wss: ws:' : "connect-src 'none'");
    expect(csp).toContain('sandbox allow-scripts');
    const request = registry.call(session.token, 'network.fetch', { url: 'https://example.com/api' });
    if (enabled) await expect(request).resolves.toMatchObject({ status: 200 });
    else {
      await expect(request).rejects.toThrow('未获准');
      await expect(registry.call(session.token, 'ui.openExternal', 'https://example.com')).rejects.toThrow('未获准');
    }
    await registry.setEnabled(id, false);
    await expect(registry.call(session.token, 'network.fetch', { url: 'https://example.com/api' })).rejects.toThrow('关闭');
  }
});
it('requires SDK 1.5 for network and external opening', () => {
  expect(() => parsePluginManifest({ ...manifest, minSdkVersion: '1.4.0' })).toThrow('1.5.0');
});
