// Real bundle + IndexedDB: no partial transcript during initial or scene loads.
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir} from 'node:fs/promises';
import {chromium} from 'playwright';
const assets=new Map(await Promise.all(['loom.html','chat.js','chat.css','highlight.css'].map(async name=>['/'+name,await readFile('desktop/generated/'+name)])));
const cached=[{seq:1,role:'user',content:'本地问题',scene_id:'a'},{seq:2,role:'being',content:'本地回复',scene_id:'a'},
  ...Array.from({length:100},(_,i)=>({seq:i+3,role:i%2?'being':'user',content:'其他场景 '+i,scene_id:'b'}))];
const remote=[...cached,{seq:103,role:'user',content:'离线期间的新问题',scene_id:'a'},{seq:104,role:'being',content:'离线期间的新回复',scene_id:'a'}];
let mode='initial',pending=[];
const server=createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
  if(url.pathname==='/api/history'){
    if(mode==='offline')return json({error:'offline'},503);
    if(mode==='empty')return json({messages:[]});
    const after=url.searchParams.get('after');
    const rows=after===null?remote.slice(-100):remote.filter(row=>row.seq>Number(after));
    if(mode==='hold'||(mode==='initial'&&after!=='104')){pending.push(()=>json({messages:rows}));return;}
    return json({messages:rows});
  }
  if(url.pathname==='/api/status')return json({being_name:'fixture'});
  if(url.pathname==='/api/llm/config')return json({sbs_enabled:false});
  if(url.pathname==='/api/stream/active'){res.writeHead(204);res.end();return;}
  if(url.pathname==='/health'){res.end('OK fixture');return;}
  if(assets.has(url.pathname)){res.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html; charset=utf-8');res.end(assets.get(url.pathname));return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  const bootstrap=url.searchParams.has('bootstrap') ? `<script>addEventListener('message',event=>{if(event.data?.type==='beings:scene-tasks-request')event.source.postMessage({type:'beings:session-select',revision:'fixture',scene:{scene_id:'a',scene_meta:{scene_label:'日常灵感'}},scope:'current'},location.origin);});</script>` : '';
  res.end(url.pathname==='/seed'?'<title>Cache fixture</title>':bootstrap+'<!doctype html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe id="chat" src="/loom.html?revision=fixture&scene_id=a&scene_label=%E6%97%A5%E5%B8%B8%E7%81%B5%E6%84%9F&scene_strict=1"></iframe>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));let browser;
const nextRequest=async()=>{
  const until=Date.now()+5000;
  while(!pending.length&&Date.now()<until)await new Promise(resolve=>setTimeout(resolve,10));
  assert.ok(pending.length,'Expected history request');return pending.shift();
};
try{
  browser=await chromium.launch({headless:true,channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1100,height:850}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  const origin='http://127.0.0.1:'+server.address().port;
  await page.goto(origin+'/seed');
  await page.evaluate(rows=>new Promise((resolve,reject)=>{
    const request=indexedDB.open('loom-history-'+encodeURIComponent(location.origin),2);
    request.onupgradeneeded=()=>{request.result.createObjectStore('messages',{keyPath:'seq'}).createIndex('scene','scene_id');request.result.createObjectStore('meta',{keyPath:'key'});};
    request.onsuccess=()=>{const db=request.result,tx=db.transaction(['messages','meta'],'readwrite');rows.forEach(row=>tx.objectStore('messages').put(row));tx.objectStore('meta').put({key:'state',lastSeq:102});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),cached);
  await page.goto(origin);
  const frame=page.frameLocator('#chat'),loading=frame.getByRole('status',{name:'正在加载场景对话'});
  await loading.waitFor();
  const first=await nextRequest();
  await page.waitForTimeout(150); // cached scene has time to restore while network remains held
  assert.equal(await frame.locator('.message').count(),0,'Cached fragments must not flash before initial sync');
  assert.equal(await frame.locator('.chat-scope-empty').count(),0,'No premature empty-state flash');
  assert.equal(await frame.locator('#messages').getAttribute('aria-busy'),'true');
  await mkdir('test-results',{recursive:true});
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const [theme,width] of [['light',1100],['dark',1100],['light',380]]){
    await page.setViewportSize({width,height:850});
    await page.evaluate(theme=>document.querySelector('iframe').contentWindow.postMessage({type:'beings:appearance',theme},location.origin),theme);
    await frame.locator('html').evaluate((el,theme)=>new Promise(resolve=>{const check=()=>el.dataset.theme===theme?resolve():requestAnimationFrame(check);check();}),theme);
    await page.screenshot({path:`test-results/scene-loading-${theme}-${width}.png`});
    assert.equal(await loading.evaluate(el=>el.scrollWidth<=el.clientWidth),true,'Loading fits its viewport');
  }
  assert.equal(await loading.locator('.scene-loading-transcript').evaluate(el=>getComputedStyle(el).animationName),'none');
  await page.setViewportSize({width:1100,height:850});
  first();
  const incremental=await nextRequest();
  await page.waitForTimeout(100);
  assert.equal(await loading.isVisible(),true);
  assert.equal(await frame.locator('.message').count(),0,'Keep loading between recent and incremental history');
  mode='normal';incremental();
  await loading.waitFor({state:'detached'});
  assert.deepEqual(await frame.locator('.message').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.historySeq))),[1,2,103,104]);
  await frame.getByText('离线期间的新回复',{exact:true}).waitFor();
  const post=data=>page.evaluate(data=>document.querySelector('iframe').contentWindow.postMessage(data,location.origin),data);
  mode='hold';
  await post({type:'beings:session-select',revision:'fixture',scene:{scene_id:'b',scene_meta:{scene_label:'B'}},scope:'current'});
  const switched=await nextRequest();
  await loading.waitFor();assert.equal(await frame.locator('.message').count(),0,'Scene changes must not expose a partial cache page');
  mode='normal';switched();await loading.waitFor({state:'detached'});
  await frame.getByText('其他场景 99',{exact:true}).waitFor();
  assert.equal(await frame.locator('.message').count(),40,'Ready scene still renders only a page');
  // Background/manual refresh does not unmount a conversation the user is reading.
  const id=await frame.locator('.message').first().getAttribute('data-message-id');
  mode='hold';await post({type:'beings:chat-refresh',revision:'fixture',id:'refresh'});
  const refresh=await nextRequest();
  assert.equal(await loading.count(),0);
  assert.equal(await frame.locator(`[data-message-id="${id}"]`).count(),1);
  mode='normal';refresh();await frame.getByText('正在刷新对话…',{exact:true}).waitFor({state:'detached'});
  mode='offline';await page.reload();await loading.waitFor({state:'detached'});
  await frame.getByText('本地回复',{exact:true}).waitFor();
  assert.equal(await frame.locator('.message').count(),4,'Network failure releases loading and retains cache');
  mode='empty';
  await page.evaluate(()=>document.querySelector('iframe').src='/loom.html?revision=empty&scene_id=empty&history_scope='+encodeURIComponent(location.origin+'/empty'));
  await frame.locator('.chat-scope-empty').waitFor();
  assert.match(await frame.locator('.chat-scope-empty').innerText(),/当前场景还没有对话/);
  assert.equal(await loading.count(),0);
  // Desktop onLoad posts session-select while startup is still reading the outbox.
  // Hold the real IDB result callback so this ordering is deterministic.
  await page.addInitScript(()=>{
    window.exposedHistoryFrames=[];
    const observe=()=>{
      if(!document.querySelector('.chat-scene-loading')){
        const rows=[...document.querySelectorAll('.message')].map(node=>Number(node.dataset.historySeq));
        if(rows.length)window.exposedHistoryFrames.push(rows);
      }
      requestAnimationFrame(observe);
    };
    requestAnimationFrame(observe);
    const getAll=IDBObjectStore.prototype.getAll;
    IDBObjectStore.prototype.getAll=function(...args){
      const request=getAll.apply(this,args);
      if(this.name==='sends')Object.defineProperty(request,'onsuccess',{set(callback){
        request.addEventListener('success',()=>{window.releaseOutboxRead=()=>callback.call(request);});
      }});
      return request;
    };
  });
  mode='hold';await page.goto(origin+'/?bootstrap=1');
  const earlySelection=await nextRequest();
  await frame.locator('body').evaluate(()=>new Promise(resolve=>{const check=()=>window.releaseOutboxRead?resolve():requestAnimationFrame(check);check();}));
  await frame.locator('body').evaluate(()=>window.releaseOutboxRead());
  await page.waitForTimeout(100);
  mode='normal';earlySelection();
  await loading.waitFor({state:'detached'});
  assert.deepEqual(await frame.locator('.message').evaluateAll(nodes=>nodes.map(n=>Number(n.dataset.historySeq))),[1,2,103,104],
    'The first exposed frame must include local-only messages even if shell selection races startup');
  await page.waitForTimeout(250);
  const exposedFrames=await frame.locator('body').evaluate(()=>window.exposedHistoryFrames);
  assert.ok(exposedFrames.length>0);
  exposedFrames.forEach(rows=>assert.deepEqual(rows,[1,2,103,104],'Never paint a partial transcript before the completed scene'));
  assert.deepEqual(errors,[]);
  console.log('PASS: initial and scene loading hide partial cache/network stages; ready page is bounded; refresh retains DOM; offline cache and empty scene settle; shell startup race exposes complete history on every frame.');
}finally{pending.splice(0).forEach(release=>release());await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
