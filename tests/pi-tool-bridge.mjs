// Install the pinned Pi into output/pi-security-check before running (see TOOL-PERMISSIONS.md).
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
const piRoot = path.resolve('output/pi-security-check/node_modules/@mariozechner/pi-coding-agent');
assert.equal(JSON.parse(readFileSync(path.join(piRoot,'package.json'),'utf8')).version,'0.65.2');
const { createAgentSession, DefaultResourceLoader, SessionManager } = await import(pathToFileURL(path.join(piRoot,'dist/index.js')));
const fixture = mkdtempSync(path.join(os.tmpdir(),'portal-pi-bridge-'));
const agentDir = path.join(fixture,'agent'); mkdirSync(agentDir);
const extension = path.join(fixture,'bridge.mjs');
const definitions = [{name:'portal_file_read',description:'Read via Portal',inputSchema:{type:'object',properties:{path:{type:'string'}},required:['path']} }];
writeFileSync(extension,readFileSync('heart-portal/portal/src/subagent/tool_bridge.mjs','utf8').replace('/*PORTAL_TOOL_DEFINITIONS*/[]',JSON.stringify(definitions)));
let received;
const server = net.createServer(socket => {
  let text=''; socket.on('data',data=>{text+=data; if(text.includes('\n')) {received=JSON.parse(text);socket.end(JSON.stringify({content:[{type:'text',text:'broker-result'}]})+'\n');}});
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
process.env.PORTAL_TOOL_PORT=String(server.address().port); process.env.PORTAL_TOOL_TOKEN='test-capability';
let session;
try {
  const resourceLoader = new DefaultResourceLoader({cwd:fixture,agentDir,noExtensions:true,noSkills:true,noPromptTemplates:true,additionalExtensionPaths:[extension]});
  await resourceLoader.reload();
  const result = await createAgentSession({cwd:fixture,agentDir,tools:[],resourceLoader,sessionManager:SessionManager.inMemory()});
  session=result.session;
  assert.deepEqual(result.extensionsResult.errors,[]);
  await session.bindExtensions({});
  assert.equal((await session.extensionRunner.emitToolCall({type:'tool_call',toolName:'bash',toolCallId:'forged',input:{command:'echo bypass'}})).block,true);
  assert.deepEqual(session.getActiveToolNames(),['portal_file_read']);
  // Pi retains an inactive built-in catalog; only active tools reach the model.
  assert.deepEqual(session.agent.state.tools.map(t=>t.name),['portal_file_read']);
  const tool = session.agent.state.tools.find(t=>t.name==='portal_file_read');
  const value=await tool.execute('test-id',{path:'notes.txt'},new AbortController().signal);
  assert.equal(value.content[0].text,'broker-result');
  assert.deepEqual(received,{token:'test-capability',tool:'portal_file_read',arguments:{path:'notes.txt'}});
  const abort=new AbortController(); abort.abort();
  await assert.rejects(()=>tool.execute('cancelled',{path:'notes.txt'},abort.signal),/cancel/i);
  console.log('Pi 0.65.2: actual extension loads; only Portal tools are active; authenticated forwarding and cancellation pass.');
} finally {session?.dispose();server.close();delete process.env.PORTAL_TOOL_PORT;delete process.env.PORTAL_TOOL_TOKEN;rmSync(fixture,{recursive:true,force:true});}
