import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { PluginRegistry, readPlugin } from '../desktop/main/plugins/registry';
import { PluginsModel } from '../desktop/renderer/plugins/model';
import { MAX_PLUGIN_ICON_BYTES, parsePluginIcon } from '../desktop/shared/plugin-icon';
import { parsePluginManifest, type DesktopPluginAPI } from '../desktop/shared/plugins';

const manifest = { schemaVersion: 1, apiVersion: 1, id: 'example.icons', name: 'Icons', version: '1.0.0', description: 'Icons', author: 'Test', entry: 'index.html', capabilities: [], contributes: { views: [{ id: 'board', title: 'Board', icon: '🌟' }, { id: 'settings', title: 'Settings' }] }, icon: '🧩' };
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
async function fixture(value = manifest) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'plugin-icons-')); roots.push(root);
  const source = path.join(root, 'source'); await mkdir(source);
  await writeFile(path.join(source, 'desktop.plugin.json'), JSON.stringify(value));
  await writeFile(path.join(source, 'index.html'), '<h1>Icons</h1>');
  return { root, source, registry: new PluginRegistry(path.join(root, 'registry')) };
}

describe('plugin navigation icons', () => {
  it('persists per-view overrides and restores view/plugin defaults without altering package integrity', async () => {
    const { root, source, registry } = await fixture();
    const bundle = await readPlugin(source); await registry.install(bundle, { kind: 'local' });
    const model = new PluginsModel({ list: () => registry.list(), setIcon: (...args) => registry.setIcon(...args) } as DesktopPluginAPI, () => {});
    await model.refresh();
    expect(model.icon(manifest.id, 'board')).toBe('🌟');
    expect(model.icon(manifest.id, 'settings')).toBe('🧩');
    await model.setIcon(manifest.id, 'board', '🚀');
    expect(model.icon(manifest.id, 'board')).toBe('🚀');
    const reloaded = new PluginRegistry(path.join(root, 'registry'));
    expect((await reloaded.list()).plugins[0]).toMatchObject({ iconOverrides: { board: '🚀' }, sha256: bundle.sha256 });
    await model.setIcon(manifest.id, 'board', null);
    expect(model.icon(manifest.id, 'board')).toBe('🌟');
    expect(model.icon(manifest.id, 'settings')).toBe('🧩');
    await expect(registry.setIcon(manifest.id, 'missing', '🚀')).rejects.toThrow();
    await expect(registry.setIcon(manifest.id, 'board', 'assets/icon.svg')).rejects.toThrow();
    expect((await reloaded.list()).problems).toEqual([]);
  });
  it('copies bundled artwork so icons survive source removal and remain covered by the package hash', async () => {
    const { source, registry } = await fixture({ ...manifest, icon: 'assets/icon.svg' });
    await mkdir(path.join(source, 'assets'));
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="red"/></svg>';
    await writeFile(path.join(source, 'assets/icon.svg'), svg);
    const bundle = await readPlugin(source);
    expect(bundle.manifest.icon).toBe(`data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`);
    await registry.install(bundle, { kind: 'local' });
    await rm(source, { recursive: true });
    expect((await registry.list()).plugins[0].manifest.icon).toBe(bundle.manifest.icon);
    expect((await registry.list()).problems).toEqual([]);
  });
  it('rejects missing, oversized and escaping image files', async () => {
    const { root, source } = await fixture({ ...manifest, icon: 'assets/icon.png' });
    await expect(readPlugin(source)).rejects.toThrow();
    await mkdir(path.join(source, 'assets'));
    await writeFile(path.join(source, 'assets/icon.png'), Buffer.alloc(MAX_PLUGIN_ICON_BYTES + 1));
    await expect(readPlugin(source)).rejects.toThrow('256 KB');
    await rm(path.join(source, 'assets'), { recursive: true });
    await mkdir(path.join(root, 'outside'));
    await writeFile(path.join(root, 'outside/icon.png'), 'private');
    await symlink(path.join(root, 'outside'), path.join(source, 'assets'), 'dir');
    await expect(readPlugin(source)).rejects.toThrow('目录内');
  });
  it('can reload packages with large escaped HTML and copied artwork', async () => {
    const { source, registry } = await fixture({ ...manifest, icon: 'icon.svg' });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(64 * 1024) + '</svg>';
    await writeFile(path.join(source, 'icon.svg'), svg);
    await writeFile(path.join(source, 'index.html'), '<!--' + '\u0000'.repeat(8 * 1024 * 1024 - 7) + '-->');
    await registry.install(await readPlugin(source), { kind: 'local' });
    const library = await registry.list();
    expect(library.problems).toEqual([]);
    expect(library.plugins).toHaveLength(1);
    await registry.setIcon(manifest.id, 'board', '🚀');
    expect((await registry.list()).plugins[0].iconOverrides).toEqual({ board: '🚀' });
  });
  it.each(['https://example.com/icon.png', '../icon.png', '/icon.png', 'data:text/html;base64,YQ==', '<svg/>', '', 123, 'a'.repeat(17)])('rejects invalid manifest and custom icons: %s', icon => {
    expect(() => parsePluginManifest({ ...manifest, icon })).toThrow();
    expect(() => parsePluginManifest({ ...manifest, contributes: { views: [{ id: 'board', title: 'Board', icon }] } })).toThrow();
    expect(() => parsePluginIcon(icon, false)).toThrow();
  });
  it('accepts bounded image data and compound emoji, and keeps old manifests unchanged', () => {
    expect(parsePluginIcon('👩🏽‍💻')).toBe('👩🏽‍💻');
    const data = `data:image/png;base64,${Buffer.alloc(MAX_PLUGIN_ICON_BYTES).toString('base64')}`;
    expect(parsePluginIcon(data)).toBe(data);
    expect(() => parsePluginIcon(`data:image/png;base64,${Buffer.alloc(MAX_PLUGIN_ICON_BYTES + 1).toString('base64')}`)).toThrow();
    const { icon: _, ...legacy } = manifest;
    legacy.contributes = { views: [{ id: 'board', title: 'Board' }] };
    expect(parsePluginManifest(legacy)).toEqual(legacy);
  });
});
