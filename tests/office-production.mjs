import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { cp, mkdir, mkdtemp, readFile, writeFile, rename } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = path.resolve('.');
try { await fetch('http://127.0.0.1:9224/json/version'); throw new Error('9224 is occupied; stop only your own validation instance first'); }
catch (error) { if (!String(error).includes('fetch failed')) throw error; }
const directory = await mkdtemp(path.join(tmpdir(), 'office-p1-production-'));
const distribution = path.join(directory, 'desktop');
await cp(path.join(root, 'node_modules/electron/dist'), distribution, { recursive: true });
const appRoot = path.join(distribution, 'resources/app');
await mkdir(path.join(appRoot, '.vite/build'), { recursive: true });
await cp(path.join(root, '.vite/renderer/main_window'), path.join(appRoot, '.vite/renderer/main_window'), { recursive: true });
await cp(path.join(root, '.vite/build/preload.js'), path.join(appRoot, '.vite/build/preload.js'));
await cp(path.join(root, 'resources/branding'), path.join(distribution, 'resources/branding'), { recursive: true });
await writeFile(path.join(appRoot, 'package.json'), JSON.stringify({ name: 'portal-desktop', version: '0.1.5', main: '.vite/build/main.js' }));
await build({ entryPoints: ['desktop/main/main.ts'], outfile: path.join(appRoot, '.vite/build/main.js'), bundle: true, platform: 'node', format: 'cjs', external: ['electron'], plugins: [{ name: 'raw', setup(builder) { builder.onResolve({ filter: /\?raw$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'raw' })); builder.onLoad({ filter: /.*/, namespace: 'raw' }, async args => ({ contents: await readFile(args.path.replace(/\?raw$/, ''), 'utf8'), loader: 'text' })); } }], define: { MAIN_WINDOW_VITE_DEV_SERVER_URL: 'undefined', MAIN_WINDOW_VITE_NAME: JSON.stringify('main_window'), PORTAL_DESKTOP_BUILD: JSON.stringify('office-p1-production-smoke'), PORTAL_DESKTOP_UPDATE_REPOSITORY: JSON.stringify('d5z/portal-desktop') } });
const executable = path.join(distribution, process.platform === 'win32' ? 'Portal.exe' : 'electron');
if (process.platform === 'win32') await rename(path.join(distribution, 'electron.exe'), executable);
const child = spawn(executable, ['--remote-debugging-port=9224'], { cwd: appRoot, env: { ...process.env, PORTAL_DESKTOP_USER_DATA: path.join(directory, 'profile') }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
child.stdout.on('data', data => { output += data; }); child.stderr.on('data', data => { output += data; });
let browser;
try {
  for (let attempt = 0; attempt < 80; attempt++) {
    try { await fetch('http://127.0.0.1:9224/json/version'); break; } catch {}
    if (child.exitCode !== null) throw new Error('Production app exited: ' + output);
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  browser = await chromium.connectOverCDP('http://127.0.0.1:9224');
  const page = browser.contexts().flatMap(context => context.pages())[0];
  assert.equal(page.url(), 'beings://desktop/');
  const session = await browser.contexts()[0].newCDPSession(page);
  await session.send('Network.enable');
  await session.send('Network.setBlockedURLs', { urls: ['http://*', 'https://*', 'ws://*', 'wss://*'] });
  const errors = [], requests = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => requests.push(request.url()));
  await page.reload();
  await page.waitForTimeout(1000);
  assert.notEqual(await page.locator('body').innerText(), 'Not found', 'production protocol must serve the renderer');
  await page.locator('#options-home button').filter({ hasText: '小镇' }).evaluate(button => button.click());
  await page.locator('.place-switcher button').filter({ hasText: '星图' }).click();
  const standalone = page.getByRole('button', { name: '打开独立协作舱' });
  if (await standalone.isVisible()) await standalone.click();
  await page.waitForFunction(() => document.querySelector('.office-scene canvas'));
  await page.waitForTimeout(300);
  assert.equal(await page.locator('.office-scene canvas').count(), 1);
  assert.equal(await page.locator('.office-people [role=status]').count(), 0);
  assert.equal(errors.length, 0, errors.join(' | '));
  assert(!requests.some(url => /\/characters\/|\/assets\/office\//.test(url)), 'must not fetch upstream image paths');
  const license = await page.evaluate(async () => (await fetch('./PIXOFFICE-LICENSE.txt')).text());
  assert(license.includes('MIT License'));
  await mkdir('test-results/office', { recursive: true });
  await page.screenshot({ path: 'test-results/office/production.png' });
  console.log('PASS production beings://desktop/ + original CSP + all network blocked + one Pixi canvas + bundled MIT license');
  console.log('Production fixture: ' + directory);
  await writeFile('test-results/office/production.json', JSON.stringify({ url: page.url(), errors, upstreamAssetRequests: requests.filter(url => /\/characters\/|\/assets\/office\//.test(url)), fixture: directory }, null, 2));
} finally { await browser?.close(); child.kill(); }
