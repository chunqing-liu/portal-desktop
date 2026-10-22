// Actual React bundle + real IndexedDB; no user profile or live Being requests.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
const assets = new Map(await Promise.all(['loom.html', 'chat.js', 'chat.css', 'highlight.css'].map(async name => ['/' + name, await readFile('desktop/generated/' + name)])));
const history = [
  {seq:1,role:'user',content:'旧场景问题一',scene_id:'old',at:'2026-10-01T01:00:00Z'},
  {seq:2,role:'being',content:'旧场景回复一',scene_id:'old',at:'2026-10-01T01:00:01Z'},
  {seq:3,role:'user',content:'旧场景问题二',scene_id:'old',at:'2026-10-01T01:01:00Z'},
  {seq:4,role:'being',content:'旧场景回复二',scene_id:'old',at:'2026-10-01T01:01:01Z'},
  ...Array.from({length:100},(_,i)=>({seq:i+5,role:i%2?'being':'user',content:'其他场景消息 '+i,scene_id:'recent',at:'2026-10-20T01:00:00Z'})),
];
let offline=false, sends=0;
const active={stream_id:'background',origin:'callback',scene_id:null,finished:false,next_seq:2,
  events:[{seq:1,event:'tool_use',data:{scene_id:null,name:'wait',input:{}}}]};
const server=createServer((request,response)=>{
  const url=new URL(request.url,'http://localhost');
  const json=(data,status=200)=>{response.writeHead(status,{'Content-Type':'application/json'});response.end(JSON.stringify(data));};
  if(url.pathname==='/api/history') {
    if(offline)return json({error:'offline fixture'},503);
    const after=url.searchParams.get('after'),limit=Number(url.searchParams.get('limit')||100);
    return json({messages:after===null?history.slice(-limit):history.filter(row=>row.seq>Number(after)).slice(0,limit)});
  }
  if(url.pathname==='/api/stream/active')return json(active);
  if(url.pathname==='/api/status')return json({being_name:'Fixture'});
  if(url.pathname==='/api/llm/config')return json({sbs_enabled:true});
  if(url.pathname==='/health'){response.end('OK fixture');return;}
  if(url.pathname==='/api/chat/stream'){sends++;return json({},500);}
  if(assets.has(url.pathname)){response.setHeader('Content-Type',url.pathname.endsWith('.js')?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html; charset=utf-8');response.end(assets.get(url.pathname));return;}
  response.setHeader('Content-Type','text/html; charset=utf-8');
  if(url.pathname==='/seed'){response.end('<!doctype html><title>Fixture seed</title>');return;}
  const scene=url.searchParams.get('scene')==='old'?'old':'recent';
  response.end(`<!doctype html><style>body{margin:0}iframe{width:100vw;height:100vh;border:0}</style><iframe id="chat" src="/loom.html?revision=fixture&scene_id=${scene}&scene_strict=1"></iframe><script>window.messages=[];addEventListener('message',event=>{if(event.source===document.getElementById('chat').contentWindow)window.messages.push(event.data)});</script>`);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
let browser;
try {
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE}:{channel:'chrome'})});
  const page=await browser.newPage({viewport:{width:1100,height:850}}), errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  const origin='http://127.0.0.1:'+server.address().port, database='loom-history-'+encodeURIComponent(origin);
  await page.route('**/*',route=>route.request().url().startsWith(origin+'/')?route.continue():route.abort());
  await page.goto(origin+'/seed');
  await page.evaluate(({database,history})=>new Promise((resolve,reject)=>{
    const request=indexedDB.open(database,2);
    request.onupgradeneeded=()=>{request.result.createObjectStore('messages',{keyPath:'seq'}).createIndex('scene','scene_id');request.result.createObjectStore('meta',{keyPath:'key'});};
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result,tx=db.transaction(['messages','meta'],'readwrite');for(const row of history)tx.objectStore('messages').put(row);tx.objectStore('meta').put({key:'state',lastSeq:104});tx.oncomplete=()=>{db.close();resolve();};tx.onerror=()=>reject(tx.error);};
  }),{database,history});
  const chat=page.frameLocator('#chat');
  const switchScene=async sceneId=>{
    await page.evaluate(sceneId=>{window.messages=[];document.querySelector('#chat').contentWindow.postMessage({type:'beings:session-select',revision:'fixture',scene:{scene_id:sceneId,scene_meta:{scene_label:sceneId,client:'fixture'}},scope:'current'},location.origin);},sceneId);
    await page.waitForFunction(sceneId=>window.messages.some(row=>row.type==='beings:session-selected'&&row.sceneId===sceneId),sceneId);
  };
  const ready=()=>page.waitForFunction(()=>document.querySelector('#chat').contentWindow.performance.getEntriesByName('loom:ready').length>0);
  await page.goto(origin);await ready();
  await page.waitForFunction(()=>window.messages.some(row=>row.type==='beings:scene-sbs-state'&&row.origin==='callback')||window.messages.some(row=>row.origin==='callback'));
  await switchScene('old');
  await chat.getByText('旧场景回复一',{exact:true}).waitFor();
  await chat.getByText('旧场景回复二',{exact:true}).waitFor();
  assert.equal(await chat.locator('.message.user').count(),2);
  assert.equal(await chat.locator('.message.being').count(),2);
  assert.equal(await chat.getByText('其他场景消息 99',{exact:true}).count(),0);
  history.push({seq:105,role:'user',content:'新增问题',scene_id:'old',at:new Date().toISOString()},
    {seq:106,role:'being',content:'新增回复',scene_id:'old',at:new Date().toISOString()},
    {seq:107,role:'being',content:'另一个场景的独立回复',scene_id:'other',at:new Date().toISOString()});
  await switchScene('recent');await switchScene('old');
  await chat.getByText('新增回复',{exact:true}).waitFor();
  assert.equal(await chat.locator('.message.user').count(),3);
  assert.equal(await chat.locator('.message.being').count(),3);
  await switchScene('other');await chat.getByText('另一个场景的独立回复',{exact:true}).waitFor();
  assert.equal(await chat.getByText('旧场景回复一',{exact:true}).count(),0);
  // A sparse history snapshot must not strip a cached row's scene index.
  for (const row of history.filter(row=>row.seq===105||row.seq===106)) delete row.scene_id;
  await page.goto(origin+'/?scene=old');await ready();
  await chat.getByText('新增回复',{exact:true}).waitFor();
  assert.equal(await chat.locator('.message.being').count(),3);
  history.length=0;await page.reload();await ready();
  await chat.getByText('新增回复',{exact:true}).waitFor();
  assert.equal(await chat.locator('.message.user').count(),3);
  assert.equal(await chat.locator('.message.being').count(),3);
  offline=true;await page.reload();await ready();
  await chat.getByText('旧场景回复一',{exact:true}).waitFor();
  assert.equal(await chat.locator('.message.user').count(),3);
  assert.equal(await chat.locator('.message.being').count(),3);
  assert.equal(sends,0);
  assert.deepEqual(errors,[]);
  await mkdir('test-results',{recursive:true});await page.screenshot({path:'test-results/chat-history-recovered.png'});
  console.log('PASS: real IndexedDB replies survive active SBS, scene changes, sparse metadata, empty history, reload and offline recovery.');
} finally {await browser?.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
