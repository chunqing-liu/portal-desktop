import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {_electron as electron} from 'playwright';
const directory=await mkdtemp(path.join(os.tmpdir(),'town-source-ui-'));let app;
try{
 const source=path.join(directory,'local.txt');await writeFile(source,'local source');
 await build({entryPoints:['desktop/preload/preload.ts'],bundle:true,platform:'node',external:['electron'],outfile:path.join(directory,'preload.cjs')});
 await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:`
 import {app,BrowserWindow,protocol,ipcMain} from 'electron';
 import {AttachmentDownloads} from './desktop/main/chat/downloads';
 app.setPath('userData',${JSON.stringify(path.join(directory,'profile'))});
 protocol.registerSchemesAsPrivileged([{scheme:'beings',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
 app.whenReady().then(async()=>{
  const manager=new AttachmentDownloads(${JSON.stringify(directory)},async()=>undefined,async()=>'',()=>{});
  ipcMain.handle('beings:attachment-source',async(event,file)=>{if(event.senderFrame!==event.sender.mainFrame)throw new Error('untrusted');const token=await manager.registerSource(file);globalThis.sourcePath=file;return token;});
  protocol.handle('beings',request=>new Response(new URL(request.url).hostname==='desktop' ? '<iframe src="beings://chat/"></iframe><script>window.addEventListener("message",async e=>{if(e.origin!=="beings://chat"||e.source!==document.querySelector("iframe").contentWindow)return;const token=await window.beings.registerAttachmentSource(e.data.file);e.source.postMessage({token},"beings://chat");});</script>' : '<input type="file"><p id="result"></p><script>document.querySelector("input").onchange=e=>parent.postMessage({file:e.target.files[0]},"beings://desktop");window.onmessage=e=>document.querySelector("#result").textContent=e.data.token||"missing";</script>',{headers:{'Content-Type':'text/html'}}));
  globalThis.window=new BrowserWindow({show:false,webPreferences:{preload:${JSON.stringify(path.join(directory,'preload.cjs'))},sandbox:true,contextIsolation:true}});await globalThis.window.loadURL('beings://desktop/');
 });
 `},bundle:true,platform:'node',external:['electron'],outfile:path.join(directory,'main.cjs')});
 app=await electron.launch({args:[path.join(directory,'main.cjs')]});const page=await app.firstWindow();
 await page.frameLocator('iframe').locator('input').setInputFiles(source);
 await page.frameLocator('iframe').locator('#result').filter({hasText:/[a-f0-9-]{36}/}).waitFor();
 assert.equal(await app.evaluate(()=>globalThis.sourcePath),source);
 console.log('PASS sandboxed chat File → trusted shell preload preserves the native path');
}finally{await app?.close();await rm(directory,{recursive:true,force:true});}
