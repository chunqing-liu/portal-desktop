# P6R2 办公室视图返修交付

## 交付范围与结论

- 当前分支：`feature/office-collab`；返修前版本：`b06a2e6`。拟提交信息使用 `p6r2` 前缀，不推远端。
- **提交尚未完成**：代码、截图与交付文档已就绪，但本会话的 `.git` 是只读权限；执行限定范围的 `git add` 时返回 `Unable to create .git/index.lock: Permission denied`，因此没有暂存或创建 commit，也未绕过权限限制。
- 只修改 `desktop/renderer/pipeline/office/`、办公室测试与本交付材料；未修改其他视图、主进程、业务工作流、导航父组件或第三方依赖。
- 六项返修均有独立实例实测和实际画面证据。现代感/高级感属于审美验收，最终仍由人类伙伴复看确认，不以自动测试代替。
- **不是全量全绿**：返修前全量为 509 通过 / 7 失败 / 30 跳过；最终全量为 **528 通过 / 7 失败 / 30 跳过**，失败标题逐条一致，无新增失败。仍有 11 条既有原生 Chromium 未处理错误。
- 办公室单测 **64/64**（原有 45 + 新增 19）；办公室六套 UI 脚本 **53/53**。类型检查、renderer 生产构建通过。

## 六项反馈逐条对照

### 1. 透视修正与人物镜头感

- `artwork.ts`：房间改为一致的平行投影视角，去掉与桌面冲突的收缩墙线；桌面、键盘垫、桌沿使用一致斜向边，桌腿保持竖直；统一椅子、柜体及落地阴影关系。
- `character-art.ts`、`textures.ts`、`scene.ts`：增加正面与左右 3/4 姿态、可见五官。休闲人物朝向错开；工作人物使用左右 3/4 姿态，不再整排后脑勺。
- 画面核对：`after-07-workstation-detail.png` 能看到桌沿/键盘垫与桌腿；`after-08-character-detail.png` 为工作人物近景；`after-01-six-idle.png` 展示正面与侧面混合朝向。
- 验证：P6 UI 工作/思考、hover 与入退场通过；P6R2 UI 实测回工位后的非背面姿态。画面已自查；是否达到参考标杆的精致程度待人类审美验收。

### 2. 空闲者离开工位、休闲切换与熄屏（重点）

- 新增 `leisure.ts`，在 `scene.ts` 接入纯视觉休闲调度，不改 Being 的实际业务状态、handoff 或路径占位逻辑。
- 空闲者在休闲区/通道分散站位，显示手机、咖啡杯、散步、哑铃健身、书本五种动作与道具；不默认坐满工位。首次切换错开 18–27 秒，后续错开 23–32 秒，路径走完后再切道具。
- `artwork.ts` 默认屏幕为暗色；`projection.ts`、`host.ts`、`bridge.ts` 将屏幕状态独立投影。未工作者熄屏；实际工作/思考再点亮，人物从当前位置连续返回自己的座位。
- 画面核对：`after-01-six-idle.png` 六人离座、六张桌面屏幕全暗，五类休闲均可辨认；`after-02-activity-switch.png` 同一人由手机切换为咖啡；`after-03-working.png` 工作者回座且对应屏幕亮，其他人继续休闲。
- 验证：UI 真实等待并观察同一人的手机→咖啡切换；单测覆盖同一人完整五活动循环、连续离座/召回、不同规模可达目标、reduced-motion 冻结与清理。未把一次静态截图当作时间切换的证明。

### 3. 完成者工位显示 Done（重点）

- `projection.ts`：只在人物空闲、在线非陈旧、至少有一个完成任务，且所有关联任务均为 done/skipped 时给出 `done` 屏幕状态；仍有未完成任务、待人审、断联或实际工作/思考时不误显示 Done。
- `bridge.ts`、`host.ts`、`OfficeDock.tsx` 将该状态送到画面；`scene.ts` 在对应桌面的主屏实际绘制绿色屏幕与 Pixi `Done` 文本。完成者仍可离座休闲，不伪装成正在干活；副屏保持熄灭。
- 画面核对：`after-05-done.png` 三名演示伙伴、三张工位主屏清楚显示 Done，人物在工位外；`after-06-small-window.png` 是含右侧列表的小窗口整页画面。
- 验证：UI 在自身隔离实例里将完整演示流程的所有节点置为完成，再读取投影并截图；单测覆盖 8 类屏幕状态、陈旧与未完成的否定情形。这是受控流程 fixture，不声称已验证真实外部 Being 完成生产任务。

### 4. 人数=工位数，岗位可多人

- 保留 P6 已有 roster 驱动的 `world.ts`/入退场与动态布局，未换成装饰性固定六人。人数按身份而非岗位统计。
- `projection.ts` 优先按明确 `assigned_user` 匹配身份；无明确身份时仅用唯一 owner 匹配；同岗位无法确定执行者的任务保留未绑定，不随意塞给某个开发者。
- `leisure.ts` 给多人分配不同休闲位置；人物显示名/岗位/当前活动仍由真实 roster 投影。
- 画面核对：`after-01-six-idle.png` 为 6 人/6 工位；`after-04-ten-people.png` 为 10 人/10 工位，多名后端、前端和引擎开发身份各自独立。
- 验证：P6/P6R2 UI 覆盖 0、1、6、10 人及退场缩回；原有单测覆盖 100 个身份与不重叠可达工位，新增单测覆盖 1/3/6/10/100 人休闲目标及多开发者绑定。100 人的长时间 UI 压测未执行，不把单测当作它的替代。

### 5. 右侧列表不得自动切画布

- `OfficeDock.tsx`：列表任务/待人审点击只选择人物与本地任务详情，保留办公室视图；小窗口收起态的待人审快捷入口会打开办公室详情，不触发父级画布导航。
- 只有显式点击详情内的「在画布中打开」才调用既有 `onNavigate`，保留手动选需求/节点和返回画布行为。不修改 `pipeline/page.tsx`。
- `office.css` 增加本地详情与选中项样式。
- 画面核对：`after-00-local-task-detail.png` 点击后的办公室仍在当前界面，右侧详情和显式按钮可见。是否发生跳转通过点击前后 UI 状态断言验证，不单凭截图判断。
- 验证：P1、P5、P6R2 UI 均覆盖列表与待人审不自动跳转、手动按钮可跳转；原有 gate 不被自动批准、Delete/Ctrl+Z 不泄漏、画布 pan/zoom 不提交 actor 命令仍通过。

### 6. 简洁高级现代的画风返修

- `artwork.ts`、`character-art.ts`、`textures.ts`、`office.css`：米黄/木纹改为冷白与低饱和蓝，减少装饰线；大窗、细金属桌腿、薄桌面、统一蓝椅、柔和阴影，补简洁休闲区。全部为程序化矢量画面，无网络图片或生成图替换运行时截图。
- 画面核对：对比 `before-01-panorama.png` / `after-01-six-idle.png`；工位与角色近景分别对比 `before-02-workstation.png` / `after-07-workstation-detail.png`、`before-03-character.png` / `after-08-character-detail.png`；多人对比 `before-05-ten-people.png` / `after-04-ten-people.png`。
- 已自查整体配色、物体投影、人物五官与休闲道具可读性。方向参考 Marvis 的灵动简洁感，但不宣称像素级复刻或已获得人类最终审美认可。

## 验证结果与可复核证据

| 验证 | 结果 | 证据/命令 |
| --- | --- | --- |
| 返修前全量 Vitest | 509 passed / 7 failed / 30 skipped；85 文件，11 errors | 本地 `.p6r2-qa/before-tests.log`；交付附带 `p6r2-screenshots/test-results.txt` 摘录 |
| 最终全量 Vitest | **528 passed / 7 failed / 30 skipped**；86 文件，11 errors；退出码 1 | `node node_modules/vitest/vitest.mjs run --configLoader runner --reporter=dot`；本地 `.p6r2-qa/fulltest-final.log` |
| 办公室单测 | **13 文件、64/64**，原有 45 条全部保留 + 新增 19 条 | `npm test -- --configLoader runner tests/office --reporter=dot` |
| P1 UI | **15/15**；UI 操作到投影 119ms，≤250ms | `tests/office-ui.mjs` |
| P2 UI | **11/11**；独立身份、真正确认后才 handoff、重连与停用 | `tests/office-p2-ui.mjs` |
| P4 离线生产协议 UI | **5/5**；实际 beings:// 本地资源、无网络加载失败 | `tests/office-p4-ui.mjs` |
| P5 UI | **6/6**；小窗口、返回、reduced/隐藏停止持续绘制 | `tests/office-p5-ui.mjs` |
| P6 UI | **6/6**；0/1/6/10 人、动态入退场、近景截图 | `tests/office-p6-ui.mjs` |
| P6R2 UI | **10/10**；六项返修关键行为，page errors 为 [] | `tests/office-p6r2-ui.mjs`、`p6r2-screenshots/verification.json` |
| TypeScript | 通过 | `npm run typecheck` |
| Renderer 生产构建 | 通过，10.02s；仍有既有大 chunk 提示 | `node node_modules/vite/bin/vite.js build --config vite.renderer.config.ts --configLoader runner` |

UI 脚本均显式设置 `OFFICE_CDP_URL=http://127.0.0.1:9224`。P6 截图输出另设 `OFFICE_SCREENSHOT_DIR=.p6r2-qa/p6-screenshots`，避免覆盖旧 P6 截图。旧 UI 脚本只为新导航契约添加显式按钮点击，以及使用人物实际视觉坐标；没有删掉原有 gate/身份/性能/键盘保护断言。

### 7 条既有失败：返修前与最终逐条一致

| # | 文件与测试标题 | 返修前及最终实际失败原因 | 分类 |
| --- | --- | --- | --- |
| 1 | `tests/background-native.test.ts` — opens a saved Windows runtime even when its scheduled task no longer exists | PowerShell discover 拒绝访问，promise 被拒绝 | 既有 Windows 原生环境失败 |
| 2 | `tests/grove.test.ts` — Grove catalog presentation > renders the server growth stage, vitality, progress, adoption and linked experience | 静态 markup 预期包含「安装到本机」，实际缺少该按钮 | **既有 Grove 断言差异，不是 Windows 原生失败** |
| 3 | `tests/installer-handoff-native.test.ts` — runs the Windows installer worker after its client parent exits | esbuild 无法读取 ../../..：Access is denied；无法 resolve ./desktop/main/updates/manual-installer | 既有 Windows 环境/目录权限失败 |
| 4 | `tests/portal-tools-native.test.ts` — uses the selected Portal binary for exec, background sessions and workspace screenshots with 'normal' PATH | 临时中文 workspace fixture 清理时 EBUSY rmdir | 既有 Windows 原生锁占用失败 |
| 5 | `tests/portal-tools-native.test.ts` — uses the selected Portal binary for exec, background sessions and workspace screenshots with 'restricted' PATH | 临时中文 workspace fixture 清理时 EBUSY rmdir | 既有 Windows 原生锁占用失败 |
| 6 | `tests/windows-client-windows.test.ts` — ignores real Chromium tooltips but rejects duplicate or missing client windows | 45000ms timeout；该文件另产生 11 条 Chromium Assertion/Target crashed 未处理错误 | 既有 Windows 原生 Chromium 失败 |
| 7 | `tests/windows-force.test.ts` — force stops a respawning legacy Windows guardian and engine while leaving another Being alive | PowerShell 拒绝访问 | 既有 Windows 原生环境失败 |

本次没有修改这些文件或降低它们的断言/超时，也没有把跳过项算成通过。11 条未处理错误仍然存在，因此全量结果不适合宣传为无错误；办公室独立单测与实际 UI 的通过结果另行记录。

### 本次发现的问题与最终状态

- 新增活动循环单测曾发现散步的微循环阻止后续活动切换，已修为完成路径后停留，再自然进入下一活动；最终 19 条新增测试通过。
- 旧 P1/P5 UI 实测发现小窗口收起态待人审详情不可见、显式返回后未保留收起偏好，已在办公室组件内修复；最终 P1/P5 全部通过。
- 同时跑构建/截图/全量测试的一次中间运行，原有 `office-p6.test.ts > adaptive procedural office > lays out 100 actual identities with reachable non-overlapping desks` 触发 5000ms timeout。**这不是上表 7 条既有失败之一**。停止自己的 UI 实例、避免同时构建后重新跑全量，最终该项通过；独立办公室 64/64 也通过。未增加超时或跳过该项。将其作为并行资源竞争下的测试稳定性风险保留，而非断言已证明性能根因。

## 截图来源与隔离边界

- `before-*.png` 是直接从 `b06a2e6` 的 `desktop/renderer/pipeline/office/p6-screenshots/` 取出的真实旧截图。
- `after-00` 至 `after-06` 是最终代码在本机独立 Electron 实例实际渲染后由 Playwright 截取；`after-07`、`after-08` 是 P6 UI 同实例的真实近景截图。已逐张进行画面自查。
- 正常 UI viewport 为 1600×1100，同时验过 1366×768、1266×823；近景来自 P6 的大 viewport/高 DPI 截图。旧新场景人数、窗口尺寸不完全相同，证据用于观察画风/行为变化，不是逐像素同机位比较。
- 自用实例仅使用 **9224 / `.p6r2-qa/user-data`** 与自用 Vite 5174；没有连接 9223、写入 `iso-user-data` 或终止人类伙伴进程。验收后已停止自己的 9224 实例，检查时人类伙伴 9223 仍监听。
- 因本机沙箱 GPU 加载限制，临时 QA Electron 使用 `--no-sandbox --in-process-gpu`；仅属于自用验收启动参数，未写入生产代码或削弱生产安全措施。
- P4 使用本地 Electron 散包的 **真实 beings:// 生产协议**，确认本地资源可用与生产环境拒绝测试注入；不是把 Vite 页面称作离线生产。未执行正式 NSIS 安装/升级验收。
- `.p6r2-qa/` 内有用户数据、Electron 散包、临时 helper 和完整日志，只留本地，不随提交。可随提交复核的精简日志为 `p6r2-screenshots/test-results.txt`。

## 明确未验与交接

- 人类伙伴最终审美/现场验收尚未进行；本次只提供代码、截图与自动/人工自查证据。
- 未修复或验收通过上述 7 条非办公室既有失败；30 条跳过测试仍未验。
- 未运行 `npm run test:all` 的完整 Rust/安装升级/其他产品打包 E2E 链；本次全量指完整 Vitest 集与办公室 UI 全套，不扩大措辞为整个桌面发布链全绿。
- 未用真实远端生产 Being 跑完一条完整业务流程。身份/状态/handoff 通过开发测试 IPC 的实际 renderer 集成验，Done 通过完整演示流程 fixture 验；演示标识保留。
- 未创建 commit：Git 写权限是唯一收尾阻塞。需给当前会话 `.git` 写权限，或在仓库终端手动暂存本次办公室代码、5 个办公室测试、此文档和 `p6r2-screenshots/`，再用 `p6r2` 前缀提交；不要暂存 `.p6r2-qa/`、输入任务书或其他未跟踪文件。
- 未推送远端。人类伙伴复看后由用户执行推送。
