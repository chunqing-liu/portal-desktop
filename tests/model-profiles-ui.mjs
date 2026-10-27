// Real desktop panels + real profile store; all Being responses and encryption
// are isolated fixtures. No Electron session, real credential or live API is used.
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, readFile, mkdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const storeBundle = await build({
  entryPoints: ["desktop/main/chat/model-profiles.ts"], bundle: true, write: false, platform: "node", format: "esm",
});
const { ModelProfileStore, handleModelProfiles } = await import(
  "data:text/javascript;base64," + Buffer.from(storeBundle.outputFiles[0].contents).toString("base64")
);
const directory = await mkdtemp(path.join(os.tmpdir(), "portal-model-profiles-ui-"));
const store = new ModelProfileStore(directory, {
  isEncryptionAvailable: () => true,
  encryptString: value => Buffer.from(value),
  decryptString: value => value.toString(),
});
const patches = [];
const secret = "ui-fixture-only-secret";
let config = { provider: "self-hosted", model: "initial-model", thinking: "medium" };
async function configure(patch) {
  patches.push(patch);
  await new Promise(resolve => setTimeout(resolve, 100));
  if (patch.model === "failed-model") return { ok: false, error: "上游原始错误：模型不可用。", http_status: 503 };
  if (patch.model === "rolled-back-model") return { ok: true, rolled_back: true, config };
  const { api_key, ...publicPatch } = patch;
  config = { ...config, ...(patch.provider && patch.provider !== config.provider ? { base_url: undefined, api: undefined } : {}), ...publicPatch };
  return { ok: true, config };
}
const bundle = await build({
  stdin: {
    contents: `
import { createRoot } from 'react-dom/client';
import { StrictMode } from 'react';
import { SubagentModelSettings } from './desktop/renderer/app/components/subagent-model-settings';
import { Store } from './desktop/renderer/shared/models/store';
const params=new URLSearchParams(location.search);
async function request(path,input) {
 const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)});
 const data=await response.json(); if(!response.ok)throw new Error(data.error); return data;
}
const api={
 modelProfiles:input=>request('/profiles',input),
 beingModelConfig:patch=>request('/config',patch||{}),
 subagentConfig:async()=>({provider:'openai',model:'subagent-fixture',thinking:'medium'}),
};
window.beings=api;
let routeHasKey=false;
if(!params.has('legacy'))api.beingModelCatalog=async input=>{
 if(params.has('fallback'))return {status:404,data:{error:'legacy fixture'}};
 if(input.kind==='routes')return {status:200,data:{routes:[{id:'openrouter',name:'OpenRouter',has_key:routeHasKey}]}};
 if(input.kind==='keys'){routeHasKey=true;return {status:200,data:{ok:true}};}
 return {status:200,data:{models:[{id:'vendor/flash',name:'Flash 测试模型'}]}};
};
const app=Object.assign(new Store(),{modelSettingsTarget:'Heart',snapshot:{settings:{hasToken:true}},api,
 closeSubagentSettings(){},applySnapshot(){}});
createRoot(document.getElementById('root')).render(<StrictMode><div className="workspace-body" style={{height:'100vh'}}>
 <main className="workspace-stage">模型档案隔离交互测试</main><SubagentModelSettings app={app}/>
</div></StrictMode>);
`,
    loader: "tsx", resolveDir: process.cwd(),
  },
  bundle: true, write: false, format: "iife", platform: "browser", jsx: "automatic",
});
const css = (await readFile("desktop/renderer/app/styles.css", "utf8")).replace('@import "../shared/model-settings.css";', "") +
  await readFile("desktop/renderer/shared/model-settings.css", "utf8");
const server = createServer(async (req, res) => {
  try {
    if (req.method === "POST") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const input = JSON.parse(body);
      const result = req.url === "/profiles" ? await handleModelProfiles(input, store, configure) :
        Object.keys(input).length ? await configure(input) : config;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(result));
    } else {
      res.setHeader("Content-Type", req.url === "/app.js" ? "text/javascript" : req.url === "/style.css" ? "text/css" : "text/html;charset=utf-8");
      res.end(req.url === "/app.js" ? bundle.outputFiles[0].contents : req.url === "/style.css" ? css :
        '<!doctype html><meta charset="utf-8"><link rel="stylesheet" href="/style.css"><div id="root"></div><script src="/app.js"></script>');
    }
  } catch (error) {
    res.statusCode = 400;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: error.message }));
  }
});
let browser;
try {
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const url = "http://127.0.0.1:" + server.address().port;
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const row = name => page.locator(".model-profile-row").filter({ hasText: name });
  async function save(name, expectedDefault) {
    await page.getByRole("button", { name: "存为当前配置", exact: true }).click();
    if (expectedDefault) assert.equal(await page.getByLabel("档案名", { exact: true }).inputValue(), expectedDefault);
    await page.getByLabel("档案名", { exact: true }).fill(name);
    await page.getByRole("button", { name: "确认保存", exact: true }).click();
    await row(name).waitFor();
  }
  async function custom(provider, model, baseUrl) {
    await page.getByRole("button", { name: "更换", exact: true }).click();
    await page.getByRole("button", { name: "自定义", exact: true }).click();
    await page.getByLabel("接口地址", { exact: true }).fill(baseUrl);
    await page.getByLabel("模型 ID", { exact: true }).fill(model);
    await page.getByLabel("协议", { exact: true }).selectOption(provider);
    await page.getByLabel("API 密钥", { exact: true }).fill(secret);
    await page.getByRole("button", { name: "试连并切换", exact: true }).click();
    await page.getByRole("button", { name: "存为当前配置", exact: true }).waitFor();
  }
  await page.goto(url);
  await page.getByText("还没有保存的模型。", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "存为当前配置", exact: true }).count(), 0);
  await custom("self-hosted", "local-glm", "http://127.0.0.1:9999/v1");
  await save("本地 GLM", "self-hosted/local-glm");
  await custom("portal-custom", "company-astra", "https://company.example.test/v1");
  await save("公司中转", "portal-custom/company-astra");
  assert.equal(patches.at(-1).api, "openai-completions");

  // A separately saved route key is captured without ever being read back.
  await page.getByRole("button", { name: "更换", exact: true }).click();
  await page.getByLabel("API 密钥", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "保存并加载模型", exact: true }).click();
  await page.getByRole("button", { name: /Flash 测试模型/ }).click();
  await page.getByRole("button", { name: "试连并切换", exact: true }).click();
  await save("订阅路由", "openrouter/vendor/flash");
  assert.equal(store.list().length, 3);
  assert.ok(store.list().every(profile => profile.hasKey));
  for (const profile of store.list()) {
    assert.equal(store.keyOf(profile.id), secret);
    assert.ok(!("key" in profile) && !("api_key" in profile));
  }
  assert.ok(!(await readFile(path.join(directory, "model-profiles.json"), "utf8")).includes(secret));
  const reopened = new ModelProfileStore(directory, { isEncryptionAvailable: () => true, encryptString: value => Buffer.from(value), decryptString: value => value.toString() });
  await reopened.load();
  assert.deepEqual(reopened.list(), store.list());
  await page.reload();
  await row("订阅路由").locator(".model-profile-current").waitFor();
  assert.equal(await page.getByRole("button", { name: "存为当前配置", exact: true }).count(), 0);
  await row("本地 GLM").getByRole("button", { name: "切换", exact: true }).click();
  await row("本地 GLM").getByRole("button", { name: "切换中…", exact: true }).waitFor();
  assert.equal(await row("公司中转").getByRole("button", { name: "切换", exact: true }).isDisabled(), true);
  await row("本地 GLM").locator(".model-profile-current").waitFor();
  assert.equal(patches.at(-1).api_key, secret);
  assert.equal(patches.at(-1).provider, "self-hosted");
  await row("公司中转").getByRole("button", { name: "切换", exact: true }).click();
  await row("公司中转").locator(".model-profile-current").waitFor();
  assert.equal(patches.at(-1).api, "openai-completions");
  await row("订阅路由").getByRole("button", { name: "切换", exact: true }).click();
  await row("订阅路由").locator(".model-profile-current").waitFor();
  assert.equal(patches.at(-1).base_url, "");
  await page.getByRole("button", { name: "高", exact: true }).click();
  await save("订阅路由", "openrouter/vendor/flash");
  assert.equal(store.keyOf(store.list().find(profile => profile.name === "订阅路由").id), secret,
    "Updating by name without reading a stored key must retain its encrypted key");
  const count = patches.length;
  await row("订阅路由").getByRole("button", { name: "删除", exact: true }).click();
  await row("订阅路由").waitFor({ state: "detached" });
  assert.equal(patches.length, count, "Deleting a profile must not PATCH the active configuration");
  assert.equal(config.model, "vendor/flash");

  await store.upsert({ name: "失败档案", provider: "openai", model: "failed-model", api_key: secret });
  await store.upsert({ name: "回滚档案", provider: "openai", model: "rolled-back-model", api_key: secret });
  await page.reload();
  await row("失败档案").getByRole("button", { name: "切换", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "上游原始错误：模型不可用。" }).waitFor();
  assert.equal(await row("失败档案").locator(".model-profile-current").count(), 0);
  assert.equal(config.model, "vendor/flash");
  await row("回滚档案").getByRole("button", { name: "切换", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "试连失败，已恢复上次可用配置。" }).waitFor();
  assert.equal(await row("回滚档案").locator(".model-profile-current").count(), 0);
  assert.equal(await page.getByRole("button", { name: "存为当前配置", exact: true }).count(), 0);

  await page.getByRole("tab", { name: "subagent", exact: true }).click();
  assert.equal(await page.locator(".model-profile-section:visible").count(), 0);
  await page.getByRole("tab", { name: "Being 模型", exact: true }).click();
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/model-profiles-desktop.png" });
  await page.setViewportSize({ width: 440, height: 900 });
  assert.equal(await page.locator(".model-profile-section").evaluate(element => element.scrollWidth <= element.clientWidth), true);
  await page.screenshot({ path: "test-results/model-profiles-narrow.png" });

  // Both direct legacy and the server's catalog-unsupported fallback stay usable.
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.goto(url + "?legacy=1");
  await row("本地 GLM").waitFor();
  const order = await page.locator("#Heart-llm-step1").evaluate(element =>
    [...element.children].map(child => child.className));
  assert.ok(order.indexOf("model-profile-section") < order.indexOf("model-catalog"));
  await page.getByRole("button", { name: "自定义", exact: false }).click();
  await page.getByLabel("模型名称", { exact: true }).fill("legacy-company");
  await page.getByLabel("服务商", { exact: true }).fill("portal-custom");
  await page.getByLabel("接口地址", { exact: true }).fill("https://legacy.example.test/v1");
  await page.getByLabel("API 密钥", { exact: true }).fill(secret);
  await page.getByLabel("接口协议", { exact: true }).selectOption("openai-completions");
  await page.getByRole("button", { name: "保存并使用", exact: true }).click();
  await save("旧版面板档案", "portal-custom/legacy-company");
  await page.goto(url + "?fallback=1");
  await row("旧版面板档案").locator(".model-profile-current").waitFor();
  await row("本地 GLM").getByRole("button", { name: "切换", exact: true }).click();
  await row("本地 GLM").locator(".model-profile-current").waitFor();
  await row("公司中转").getByRole("button", { name: "切换", exact: true }).click();
  await row("公司中转").locator(".model-profile-current").waitFor();
  await page.getByRole("tab", { name: "subagent", exact: true }).click();
  await page.getByRole("button", { name: "使用 Being 当前模型", exact: true }).click();
  assert.equal(await page.getByLabel("模型名称", { exact: true }).inputValue(), "company-astra",
    "Applying a profile must refresh the host adapter's current Being model");
  assert.deepEqual(errors, []);
  console.log("PASS: three providers, encrypted persistence/reopen, modern/legacy/fallback panels, busy state, switch/delete, raw errors/rollback, narrow layout and subagent isolation.");
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
