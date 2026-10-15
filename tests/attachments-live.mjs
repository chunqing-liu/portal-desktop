// Explicit opt-in: sends the supplied synthetic samples to the locally connected Being.
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import {_electron as electron} from 'playwright';
if (!process.env.PORTAL_LIVE_ATTACHMENT_SAMPLES) throw new Error('Set PORTAL_LIVE_ATTACHMENT_SAMPLES to explicitly authorize live sends');
const samples=path.resolve(process.env.PORTAL_LIVE_ATTACHMENT_SAMPLES);
const manifest=JSON.parse(await readFile(path.join(samples,'样本校验.json'),'utf8'));
const directory=await mkdtemp(path.join(os.tmpdir(),'town-live-attachments-'));
const output=path.resolve('test-results/attachments/live'); await mkdir(output,{recursive:true});
const sceneId='multimodal-test-'+Date.now();
let app;
const results=[];
try {
 await build({stdin:{loader:'ts',resolveDir:process.cwd(),contents:`
 import {app,protocol,BrowserWindow,safeStorage,net,session} from 'electron';
 import {SettingsStore} from './desktop/main/app/settings';
 import {parseConnection} from './desktop/main/chat/connection';
 import {clientUserData} from './desktop/main/app/profile';
 import {AttachmentDownloads} from './desktop/main/chat/downloads';
 import {ChatProxy} from './desktop/main/chat/proxy';
 import {registerLocalProtocol} from './desktop/main/app/protocol';
 app.setName('portal-desktop');
 const profile=clientUserData(app.getPath('appData'));
 app.setPath('userData',${JSON.stringify(path.join(directory,'profile'))});
 protocol.registerSchemesAsPrivileged([{scheme:'beings',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
 app.whenReady().then(async()=>{
  const settings=new SettingsStore(profile,safeStorage,''); try { await settings.load(); } catch { const fs=require('node:fs');const service=JSON.parse(fs.readFileSync(profile+'/portal-service.json','utf8'));settings.connection=parseConnection(fs.readFileSync(service.root+'/connection.url','utf8').trim()); }
  const saved=JSON.parse(require('node:fs').readFileSync(profile+'/connection.json','utf8'));
  if(settings.connection?.endpoint!==saved.settings.endpoint)throw new Error('Fallback connection does not match current Being');
  const connection=settings.connection; if(!connection)throw new Error('No connected Being');
  const scene={scene_id:${JSON.stringify(sceneId)},scene_meta:{client:'portal',scene_label:'多模态样本验收'}};
  const events=[],downloads=[];globalThis.live={being:connection.being,events,downloads};
  session.defaultSession.on('will-download',(_event,item)=>{item.setSavePath(${JSON.stringify(output)}+'/'+item.getFilename());item.once('done',(_event,state)=>downloads.push({name:item.getFilename(),state}));});
  const proxy=new ChatProxy(()=>connection,async(url,init)=>{
   const response=await (init?.body instanceof ReadableStream ? fetch(url,init) : net.fetch(url,init));const p=new URL(url).pathname;
   if(p.startsWith('/api/')||p.endsWith('/api/chat/stream')){
    const event={path:p,status:response.status,method:init?.method||'GET'};if(p.endsWith('/api/chat/stream'))event.message=JSON.parse(init.body).message;events.push(event);
    if(p.endsWith('/parsed')||p.startsWith('/api/media-jobs/')||p.endsWith('/complete')) {
     try{event.body=await response.clone().json();}catch{}
    }
   }
   return response;
  },scene);
  const localDownloads=new AttachmentDownloads(${JSON.stringify(path.join(directory,'profile'))},async()=>${JSON.stringify(output)},async()=>'',()=>{});
  registerLocalProtocol(${JSON.stringify(path.resolve('desktop/generated'))},proxy,undefined,localDownloads);
  globalThis.live.localDownloads=localDownloads;
  const window=new BrowserWindow({width:1150,height:1000,show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  globalThis.live.window=window;
  await window.loadURL('beings://chat/?scene_id='+scene.scene_id+'&scene_label='+encodeURIComponent(scene.scene_meta.scene_label)+'&history_scope='+encodeURIComponent(connection.endpoint));
 }).catch(error=>{require('node:fs').writeFileSync('/tmp/town-live-start-error.log',error.message);app.exit(1);});
 `},bundle:true,platform:'node',external:['electron'],outfile:path.join(directory,'main.cjs')});
 await writeFile(path.join(directory,'package.json'),JSON.stringify({name:'portal-desktop',productName:'Portal Desktop',main:'main.cjs'}));
 app=await electron.launch({args:[directory]});
 app.process().stderr.on('data',data=>{const text=String(data);if(/Error|exception|fatal/i.test(text))console.log(text.replace(/https?:[^\s]+/g,'[url]'));});
 const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.locator('#input').waitFor();
 console.log('Connected Being:',await app.evaluate(()=>globalThis.live.being));
 for (const file of manifest.files) {
  const bytes=await readFile(path.join(samples,file.filename));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
  const start=await app.evaluate(()=>globalThis.live.events.length);
  const result={filename:file.filename,bytes:file.bytes,expected:file.expected,question:file.question};
  try {
   await page.locator('#file-input').setInputFiles(path.join(samples,file.filename));
   await page.locator('#input').fill(file.question);await page.locator('#send-btn').click();
   await page.waitForFunction(name=>Array.from(document.querySelectorAll('.attachment-card')).some(el=>el.textContent.includes(name)),file.filename);
   result.uploadVisible=true;
   await page.waitForFunction(name=>{
    const cards=Array.from(document.querySelectorAll('.attachment-card'));const card=cards.find(el=>el.textContent.includes(name));
    return card && (Array.from(card.querySelectorAll('button')).some(b=>b.getAttribute('aria-label')==='下载 '+name)||document.body.innerText.includes('重试附件处理'));
   },file.filename,{timeout:120000});
   const card=page.locator('.attachment-card').filter({hasText:file.filename}).last();
   result.card=await card.innerText();
   if(await card.getByRole('button',{name:'下载 '+file.filename,exact:true}).count()){
    await card.getByRole('button',{name:'下载 '+file.filename,exact:true}).click();
    await page.waitForFunction(name=>Array.from(document.querySelectorAll('.attachment-card')).some(el=>el.textContent.includes(name)&&el.textContent.includes('已下载 · 校验通过')),file.filename,{timeout:90000});
    await new Promise(resolve=>setTimeout(resolve,500));
    const saved=JSON.parse(await readFile(path.join(directory,'profile/attachment-downloads.json'),'utf8'));
    const stored=Object.values(saved.files).find(f=>f.sha256===file.sha256);
    const downloaded=await readFile(stored.path);result.downloadHashMatch=createHash('sha256').update(downloaded).digest('hex')===file.sha256;
   }
   // Wait for the parse and chat acceptance, or a visible terminal failure.
   const until=Date.now()+180000;
   while(Date.now()<until){
    const events=await app.evaluate((_electron,start)=>globalThis.live.events.slice(start),start);
    if(events.some(e=>e.path.endsWith('/api/chat/stream') && e.message?.includes(file.filename))||await page.getByText('重试附件处理',{exact:true}).count())break;
    await new Promise(resolve=>setTimeout(resolve,1500));
   }
   result.events=await app.evaluate((_electron,start)=>globalThis.live.events.slice(start),start);
   result.sent=result.events.some(e=>e.path.endsWith('/api/chat/stream') && e.message?.includes(file.filename)&&e.status<300);
   result.card=await card.innerText();
   await page.screenshot({path:path.join(output,file.filename+'.png')});
   if(!result.sent){result.failure=(await page.locator('body').innerText()).slice(-2500);}
  }catch(error){result.error=error.message;result.events=await app.evaluate((_electron,start)=>globalThis.live.events.slice(start),start);}
  results.push(result);await writeFile(path.join(output,'verified-results.json'),JSON.stringify({sceneId,being:await app.evaluate(()=>globalThis.live.being),results},null,2));
  console.log(file.filename,JSON.stringify({sent:result.sent,downloadHashMatch:result.downloadHashMatch,error:result.error,card:result.card}));
  // Wait for this reply to finish before adding the next independent sample.
  const idleUntil=Date.now()+120000;
  while(Date.now()<idleUntil && await page.getByRole('button',{name:'停止生成',exact:true}).count())await new Promise(resolve=>setTimeout(resolve,1000));
 }
} finally {await app?.close();await rm(directory,{recursive:true,force:true});}
