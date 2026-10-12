// Exercise the actual desktop scheme and response CSP, not a permissive file fixture.
import { build } from 'esbuild';
import { _electron } from 'playwright';
import electron from 'electron';
import { mkdtemp, rm, cp, copyFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir = await mkdtemp(path.join(tmpdir(), 'town-iui-runtime-'));
const replyDoc = {version:1,title:'对话生成的动态计数器',state:{},body:[{id:'custom',type:'app',code:`
let count=0, time=0;
function draw(){ui.render({version:1,title:'自定义互动',state:{},body:[{id:'count',type:'metric',label:'点击次数',value:count},{id:'clock',type:'metric',label:'动画时间',value:time},{id:'add',type:'button',action:'event',label:'增加一次'}]});}
ui.onEvent(e=>{if(e.key==='add'){count++;draw();}});ui.onTick(t=>{time=t;draw();});draw();`}]};
const reply = '```intelligent-ui\n'+JSON.stringify(replyDoc)+'\n```';
let app;
try {
  const main = path.join(dir, 'main.cjs');
  await cp('desktop/generated',path.join(dir,'assets'),{recursive:true});
  await writeFile(path.join(dir,'preload.js'),'// Isolated regression fixture.');
  await writeFile(path.join(dir,'assets','index.html'), `<!doctype html><meta http-equiv="Content-Security-Policy" content="default-src 'self'; style-src 'unsafe-inline'; frame-src beings://chat beings://plugins"><style>html,body,iframe{width:100%;height:100%;margin:0;border:0}</style><iframe id="chat" src="beings://chat/?scene_id=runtime-test"></iframe>`);
  await build({stdin:{contents:`
import {app,BrowserWindow,protocol} from 'electron';
import {createMainWindow} from './desktop/main/app/window';
import {registerLocalProtocol} from './desktop/main/app/protocol';
protocol.registerSchemesAsPrivileged([{scheme:'beings',privileges:{standard:true,secure:true,supportFetchAPI:true,stream:true}}]);
app.setPath('userData',${JSON.stringify(path.join(dir,'profile'))});
app.whenReady().then(()=>{
 registerLocalProtocol(${JSON.stringify(path.join(dir,'assets'))}, {handle(request){const p=new URL(request.url).pathname;
 if(p==='/api/chat/stream') {
 const reply=${JSON.stringify(reply)};
 const event=(name,data)=>new TextEncoder().encode('event: '+name+'\\ndata: '+JSON.stringify(data)+'\\n\\n');
 return new Response(new ReadableStream({start(controller){controller.enqueue(event('content_block_delta',{delta:{text:reply.slice(0,120)}}));setTimeout(()=>{controller.enqueue(event('content_block_delta',{delta:{text:reply.slice(120)}}));controller.enqueue(event('message_stop',{}));controller.close();},100);}}),{headers:{'Content-Type':'text/event-stream'}});
 }
 return p==='/api/stream/active'?new Response(null,{status:204}):Response.json(p==='/api/history'?{messages:[]}:{sbs_enabled:false,being_name:'Fixture',presets:[]});}});
 globalThis.externalNavigations=[];
 createMainWindow({shellURL:()=> 'beings://desktop/',isQuitting:()=>true,isSessionEnding:()=>false,markSessionEnding:()=>{},openExternal:url=>globalThis.externalNavigations.push(url),onBrowser:()=>{},onClosed:()=>{}});
});`,resolveDir:process.cwd(),loader:'ts'},outfile:main,bundle:true,platform:'node',format:'cjs',external:['electron']});
  app = await _electron.launch({executablePath:electron,args:[main]});
  const window=await app.firstWindow();window.setDefaultTimeout(30000);
  window.on('console',msg=>{if(msg.type()==='error') console.error(msg.text());});
  window.on('pageerror',error=>console.error(error.message));
  const page=await (await window.locator('#chat').elementHandle()).contentFrame();
  await page.getByRole('button',{name:'Intelligent UI Beta 设置'}).click();
  await page.getByRole('switch',{name:'启用智能 UI'}).check();
  await page.getByText('体验本地交互示例',{exact:true}).click();
  await page.getByLabel('选择交互示例').selectOption('simulation');
  await page.locator('.iui-app svg').waitFor().catch(async error=>{console.error(await page.locator('.iui-app').innerText());throw error;});
  assert.equal(await page.getByText('正在准备交互体验…',{exact:true}).count(),0);
  const scene=page.locator('.iui-app svg');
  const initial=await scene.innerHTML();
  await page.waitForFunction(html=>document.querySelector('.iui-app svg')?.innerHTML!==html,initial);
  await page.getByRole('button',{name:'暂停',exact:true}).click();
  await page.getByRole('button',{name:'播放',exact:true}).waitFor();
  await page.getByRole('button',{name:'重新启动',exact:true}).click();
  await page.locator('.iui-app svg').waitFor().catch(async error=>{console.error(await page.locator('.iui-app').innerText());throw error;});
  // A blocked/missing runtime must end loading and allow recovery.
  await rm(path.join(dir,'assets','iui-runtime.html'));
  await page.getByRole('button',{name:'重新启动',exact:true}).click();
  await page.getByText(/本地计算未能启动/).waitFor().catch(async error=>{console.error(await page.locator('.iui-app').innerText());throw error;});
  assert.equal(await page.getByText('正在准备交互体验…',{exact:true}).count(),0);
  await copyFile('web/public/iui-runtime.html',path.join(dir,'assets','iui-runtime.html'));
  await page.getByRole('button',{name:'重新启动',exact:true}).click();
  await page.locator('.iui-app svg').waitFor().catch(async error=>{console.error(await page.locator('.iui-app').innerText());throw error;});
  await page.getByRole('button',{name:'关闭智能界面设置'}).click();
  await page.getByRole('textbox',{name:'message input'}).fill('生成一个可以点击并显示动画时间的计数器');
  await page.getByRole('button',{name:'本条使用智能 UI',exact:true}).click();
  await page.getByRole('button',{name:'发送消息',exact:true}).click();
  await page.locator('.message.being .iui-app').getByRole('button',{name:'增加一次'}).click();
  await page.waitForFunction(()=>document.querySelector('.message.being .iui-app .iui-metric output')?.textContent==='1');
  assert.equal(await page.getByText('正在准备交互体验…',{exact:true}).count(),0);
  assert.deepEqual(await app.evaluate(()=>globalThis.externalNavigations),[]);
  console.log('PASS: production main-window navigation guard and nested chat;  streamed Being reply mounts an arbitrary app and handles interaction; actual beings scheme/CSP starts animation; pause/restart and blocked-runtime timeout/recovery.');
} finally { await app?.close(); await rm(dir,{recursive:true,force:true}); }
