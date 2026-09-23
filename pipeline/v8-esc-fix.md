# V8 Esc 修复（C1 收尾）

日期：2026-09-24 03:10 → 03:40 终稿
来源：heart 真机验收（隔离实例 CDP，4 步几何断言 ALL PASS）

## 结论

C1 专注模式 Esc 已修复并真机验证通过：

- 专注态 Esc → 只退出专注，星图面板保持打开（20 节点、13 边可见）
- 非专注态 Esc → 关闭星图面板
- 重开面板正常

## 根因链（三轮迭代）

1. **React 合成 onCancel 收不到原生 cancel**：`<dialog>` 的 Esc 触发原生 close watcher → cancel 事件，但 React 合成事件系统不代理 cancel/close——Dialog 组件的 onCancel 永远不跑。shouldClose 闸门挂在 onCancel 上等于没挂。
2. **keyboard 分支直接 dispatch 的竞态**：在 document capture keydown 里直接派发 pipeline:exit-focus，React flush 先移除专注态 class，随后到达的 cancel 闸门用 `querySelector("#pipeline-view.pipeline-focus-mode")` 查不到专注态 → 放行关闭 → 面板被关。
3. **最终方案（双保险）**：
   - keyboard 分支：preventDefault + stopPropagation + **设 `documentElement.dataset.pipelineFocusEsc = "1"`** + dispatch exit-focus
   - 原生 cancel 监听（#place-sheet，非 React）：**优先消费 dataset 标记**（不受 React flush 影响），preventDefault 保面板；无标记时回退 DOM class 检查

## 排障中钉死的事实

- Esc 时序（CDP 探针实测）：keydown(target=BUTTON) → cancel → pv-mut(hidden) → close。cancel 与 close 间隔仅 ~3ms，React 渲染在中间，竞态窗口极窄。
- keydown preventDefault 能拦 close watcher（patch3 后 cancel 不再触发，面板保持开）——但拦了 cancel 也就没人退专注，所以 dispatch 必须留在 keyboard 分支。
- **Vite HMR 断链坑**：patch4 写盘后 tsc 过（磁盘是新代码）、fetch('/app/page.tsx') 也返回新代码，但运行中的 App 闭包还是旧版（HMR 未推送、location.reload 拿的还是 transform 缓存旧模块）。症状：改动「生效了一半」——preventDefault 在（旧分支）但新加的 dispatch/flag 不在。**解法：重启 dev server（杀 Vite + electron 重起）**。以后遇到「补丁写盘了但行为只变一半」，先怀疑 HMR 断链，别怀疑代码。
- 隔离实例启动：`set PORTAL_DESKTOP_USER_DATA=<独立目录> && npx electron-forge start -- --remote-debugging-port=9222`（独立 userData = 独立单实例锁，不与醇青的实例冲突）。
- 专注态会持久化（reload 后 focusOn 仍 true），验收脚本必须先归一再进专注，否则点专注按钮=退出专注。

## 验证记录（v8_esc_verify2.py，4 步几何断言）

```
STEP1 focus-in:              OK | focusOn=true, open=true
STEP2 esc-exits-only-focus:  OK | focusOn=false, open=true
STEP3 non-focus-esc-closes:  OK | focusOn=false, open=false
STEP4 reopen:                OK | focusOn=false, open=true
=== VERDICT: ALL PASS ===
```

commit：b81cc3c（feature/pipeline，13 files，+980/-165，含 V8 七条 + Esc 修复 + canvas-research.md）。
push：待醇青在桌时点 GCM 授权（非交互探测 fatal: Cannot prompt，凭据库无 github.com 条目）。
