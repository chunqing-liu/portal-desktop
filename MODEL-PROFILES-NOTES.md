# 桌面端：已保存的模型档案

## 范围与实现

- 工作目录：`E:\Agentspace\portal-modelprofiles`；分支：`feat/model-profiles`。只在本地提交，不 push。
- 档案位于 Electron `userData` 下的 `model-profiles.json`，与 `SettingsStore` 的 `connection.json` 同目录；格式为 `{ version: 1, profiles: [...] }`。
- 复用主进程已有的 `secretStorage`（Electron safeStorage，包括现有 Linux `basic_text` 防护），密钥加密后转 base64 保存。渲染进程只能收到公开信息和 `hasKey`。
- 写入串行化，先写 `.tmp` 再 rename；写入失败不更新内存列表。密钥库不可用仍可读取列表、删除档案，但不能保存或解密密钥。
- 切换复用 `beings:model-config` 提取出的同一个 `beingModelConfig` 函数，经现有 `proxy.handle` PATCH `beings://chat/api/llm/config`，不新增 HTTP 客户端。自定义档案传递 `api`；无自定义地址的档案使用空 `base_url` 清除上一接口地址。
- `beings:model-profiles` 提供 list/save/delete/apply。校验操作形状、服务商白名单、名称、模型、HTTP(S) 地址和档案 UTF-8 序列化大小（不超过 16KB）。地址中不允许明文用户名/密码。
- apply 保留服务端成功、失败和回滚信息，同时过滤返回数据中的 `key` / `api_key` 字段，并遮蔽返回文本或异常中的本次解密密钥，防止错误回显泄密。
- 不修改服务端、Town API、office 或协作舱；不新增依赖。

## 改动文件（12 个）

| 文件 | 用途 |
| --- | --- |
| `desktop/main/chat/model-profiles.ts` | 加密档案存储、输入校验、四种 IPC 操作及 apply 结果脱敏 |
| `desktop/main/chat/model-profiles.test.ts` | 新增存储与 IPC 操作单测 |
| `desktop/main/main.ts` | 复用密钥库、加载档案、注册 IPC、共享原模型配置 proxy 逻辑 |
| `desktop/preload/preload.ts` | 暴露 `modelProfiles` IPC 方法 |
| `desktop/shared/types.ts` | 档案输入、公开档案、请求和响应类型；扩展现有 `DesktopAPI` |
| `desktop/renderer/chat/components/model-profiles.tsx` | 两套面板共用的档案列表、命名表单、切换/保存/删除及状态处理 |
| `desktop/renderer/chat/components/settings.tsx` | 旧面板与共用档案交互接线，自定义接口协议 |
| `desktop/renderer/chat/components/being-model-settings.tsx` | 新版线路面板接线，保留本次填写的线路密钥，自部署/智谱/自定义接口入口 |
| `desktop/renderer/shared/model-settings.css` | 仅新增 `model-profile-` 前缀样式 |
| `vitest.config.ts` | 将指定位置的新增单测纳入实际测试收集 |
| `tests/model-profiles-ui.mjs` | 真实组件 + 真实档案存储的隔离浏览器交互测试 |
| `MODEL-PROFILES-NOTES.md` | 本说明 |

## UI 交互

1. 打开桌面模型设置，选择「Being 模型」。新版线路面板和旧版/目录不受支持时的回退面板均有「我的模型档案」，位于当前模型之后；旧面板位于「切换模型」目录之前。
2. 按原流程填写配置、密钥并成功应用。出现「存为当前配置」，点击后在面板内填写档案名，默认 `provider/model`（超过名称上限时截断到 40 字符），再点「确认保存」。同名档案更新。
3. 本次面板内填写并成功应用/保存的密钥只暂存在内存，保存档案时单向发送给主进程加密；关闭/卸载面板时清除。不会从主进程或服务端取回既有密钥。若此前仅在服务端存过密钥，请在本次配置时重新填写一次，否则新档案不含该密钥；更新已有同名档案且密钥留空时保留原加密密钥。
4. 每行展示档案名、服务商、模型及「切换」「删除」。provider + model 与确认的 `state.config` 相同时标记「当前」。
5. 切换时按钮显示「切换中…」，禁用重复提交、其他模型操作和父面板切换。只有服务端确认后更新当前配置，并经既有加载方法刷新宿主派生状态（包括 subagent 的「使用 Being 当前模型」）；失败显示原始错误，回滚显示回滚提示，不把目标档案误标成当前。
6. 删除仅删除本地档案，不修改正在使用的服务端模型。subagent 面板不显示或应用 Being 档案。

## 已运行验证

```powershell
npm run typecheck
npm run build:chat
npx vitest run desktop/main/chat/model-profiles.test.ts tests/settings.test.ts tests/connection.test.ts tests/architecture.test.ts tests/main-startup.test.ts tests/renderer-state.test.ts tests/subagent-catalog.test.ts tests/chat-runtime.test.ts
node tests/model-profiles-ui.mjs
node tests/model-catalog-ui.mjs
```

- 类型检查通过；仓库无 `tsconfig.web.json`，使用现成的 `typecheck`（`tsc --noEmit`）。
- React chat 生产资源构建通过，生成物位于已忽略的 `desktop/generated`。
- Vitest：8 个测试文件、157 项通过；其中新文件 `model-profiles.test.ts` 的 34 项确实执行并通过。
- 新交互测试通过：三类服务商、保存/重开/重新加载存储、同名更新保留密钥、新旧面板/目录回退、切换忙碌态、删除不改变当前模型、原始错误、回滚不误标、窄面板无横向溢出、subagent 隔离。
- 既有 `model-catalog-ui.mjs` 回归通过。
- 已查看隔离交互测试截图：`test-results/model-profiles-desktop.png`、`test-results/model-profiles-narrow.png`；该目录被 Git 忽略，不提交截图。
- 所有档案/密钥测试使用临时目录、假 `SecretStorage` 和隔离 Being 响应，不读取或修改用户真实配置。

## 未做与边界

- 未做手机端、Web 端档案移植、云同步、导入/导出；档案为本客户端本地数据。
- 未用真实服务商密钥进行联网切换，也未对安装后的 Electron safeStorage/操作系统密钥库做原生端到端验收；浏览器测试不能替代这部分验证。
- 未打安装包、启动/接管其他 worktree 的桌面实例、推送分支或发布。
- 没有未解决的实现、类型检查或上述测试阻塞。
