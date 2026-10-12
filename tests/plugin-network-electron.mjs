import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { _electron as electron } from 'playwright';

const root = await mkdtemp(path.join(os.tmpdir(), 'plugin-network-electron-'));
const server = createServer(async (req, res) => {
  if (req.url === '/cors') res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.url === '/redirect') { res.writeHead(302, { location: '/api' }); res.end(); return; }
  let body = ''; for await (const chunk of req) body += chunk;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ method: req.method, body, auth: req.headers.authorization || null, value: 'live API response' }));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let app;
try {
  await writeFile(path.join(root, 'index.html'), '<html><body><div id="root"></div><script src="shell.js"></script></body></html>');
  await build({ stdin: { loader: 'tsx', resolveDir: process.cwd(), contents: `
    import React from 'react'; import {createRoot} from 'react-dom/client';
    import {PluginFrame} from './desktop/renderer/plugins/page';
    const model = { prepareSession: async () => {}, showCommands() {}, compose: async () => {}, applyUI() {} };
    createRoot(document.getElementById('root')).render(<PluginFrame api={window.fixture} model={model} id="example.network" view="main" title="API test" theme="light" />);
  ` }, bundle: true, platform: 'browser', format: 'iife', outfile: path.join(root, 'shell.js') });
  await build({ stdin: { loader: 'ts', resolveDir: process.cwd(), contents: `
    const {contextBridge,ipcRenderer}=require('electron');
    contextBridge.exposeInMainWorld('fixture', {open:()=>ipcRenderer.invoke('open'),close:token=>ipcRenderer.invoke('close',token),call:(...args)=>ipcRenderer.invoke('call',...args)});
  ` }, bundle: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'preload.cjs') });
  const pluginHtml = `<h1>Plugin API verification</h1><a id="article" href="https://example.com/article" target="_blank">Read original</a><p id="status"></p>`;
  await build({ stdin: { loader: 'ts', resolveDir: process.cwd(), contents: `
    import {app, BrowserWindow, protocol, ipcMain, net, shell} from 'electron';
    import {mkdir,writeFile} from 'node:fs/promises'; import path from 'node:path';
    import {PluginRegistry,readPlugin} from './desktop/main/plugins/registry';
    import {createPluginServices} from './desktop/main/plugins/services';
    import {registerLocalProtocol,configureLocalSession} from './desktop/main/app/protocol';
    app.setPath('userData',${JSON.stringify(path.join(root, 'profile'))});
    protocol.registerSchemesAsPrivileged([{scheme:'beings',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
    app.whenReady().then(async()=>{
      globalThis.opened=[]; shell.openExternal=async url=>{globalThis.opened.push(url)};
      const services=createPluginServices({contextKey:()=>'',endpoint:()=>'',being:()=>({connected:false,name:'',sceneId:'',sceneLabel:''}),town:async()=>({}),proxy:{handle:async()=>new Response('')},confirmChat:async()=>false,openExternal:url=>shell.openExternal(url),fetcher:globalThis.fetch});
      const registry=new PluginRegistry(${JSON.stringify(path.join(root, 'plugins'))},services);
      const source=${JSON.stringify(path.join(root, 'source'))}; await mkdir(source);
      await writeFile(path.join(source,'desktop.plugin.json'),JSON.stringify({schemaVersion:1,apiVersion:1,minSdkVersion:'1.5.0',id:'example.network',name:'Network',version:'1.0.0',description:'Fixture',author:'Test',entry:'index.html',capabilities:['network','external.open'],contributes:{views:[{id:'main',title:'API'}]}}));
      await writeFile(path.join(source,'index.html'),${JSON.stringify(pluginHtml)});
      await registry.install(await readPlugin(source),{kind:'local'});
      registerLocalProtocol(${JSON.stringify(root)},{handle:async()=>new Response('')},registry); configureLocalSession();
      ipcMain.handle('open',()=>registry.open('example.network','main')); ipcMain.handle('close',(_,token)=>registry.close(token)); ipcMain.handle('call',(_, ...args)=>registry.call(...args));
      const window=new BrowserWindow({show:false,webPreferences:{preload:${JSON.stringify(path.join(root, 'preload.cjs'))},sandbox:true,contextIsolation:true,nodeIntegration:false}});
      window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
      await window.loadURL('beings://desktop/');
    });
  ` }, bundle: true, platform: 'node', external: ['electron'], outfile: path.join(root, 'main.cjs') });
  app = await electron.launch({ args: [path.join(root, 'main.cjs')] });
  const page = await app.firstWindow();
  const frame = page.frameLocator('.plugin-frame');
  await frame.locator('#article').waitFor();
  await frame.locator('#article').click();
  await page.waitForTimeout(100);
  assert.deepEqual(await app.evaluate(() => globalThis.opened), ['https://example.com/article']);
  const plugin = await (await page.locator('.plugin-frame').elementHandle()).contentFrame();
  const result = await plugin.evaluate(async base => {
    const direct = await (await fetch(base + '/cors')).json();
    let corsBlocked = false;
    try { await fetch(base + '/api'); } catch { corsBlocked = true; }
    const response = await grove.network.fetch(base + '/api', {method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer plugin-fixture'},body:'{"fresh":true}'});
    const forwarded = await response.json();
    const redirect = await grove.network.fetch(base + '/redirect');
    await grove.ui.openExternal('https://example.com/sdk');
    return { direct, corsBlocked, forwarded, redirected:redirect.redirected, url:redirect.url, sdk:grove.sdkVersion, node:typeof require, preload:typeof window.fixture };
  }, base);
  assert.equal(result.direct.value, 'live API response');
  assert.equal(result.corsBlocked, true);
  assert.deepEqual(result.forwarded, {method:'POST',body:'{"fresh":true}',auth:'Bearer plugin-fixture',value:'live API response'});
  assert.equal(result.redirected, true);
  assert.equal(result.url, base + '/api');
  assert.equal(result.sdk, '1.5.0'); assert.equal(result.node, 'undefined'); assert.equal(result.preload, 'undefined');
  assert.deepEqual(await app.evaluate(() => globalThis.opened), ['https://example.com/article', 'https://example.com/sdk']);
  if (process.env.PLUGIN_NETWORK_PUBLIC_TEST === '1') {
    const publicResult = await plugin.evaluate(async () => {
      const response = await grove.network.fetch('https://jsonplaceholder.typicode.com/todos/1');
      const data = await response.json(); document.getElementById('status').textContent = 'Public API: ' + response.status + ', id=' + data.id;
      return {status:response.status,id:data.id};
    });
    assert.deepEqual(publicResult, {status:200,id:1});
    await frame.locator('#status').getByText('Public API: 200, id=1').waitFor();
    console.log('PASS: real public HTTPS API returned HTTP 200 / id=1 inside the sandboxed plugin panel.');
  }
  console.log('PASS: real plugin link click and SDK dispatch, direct fetch, CORS-independent POST with headers/body, redirects, and sandbox isolation.');
} finally {
  await app?.close(); await new Promise(resolve => server.close(resolve)); await rm(root,{recursive:true,force:true});
}
