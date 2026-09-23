# V8 Esc 修复（C1 收尾）

日期：2026-09-24 03:10
来源：heart 真机验收结论（C1 其余断言全过，仅 Esc 一项失败）
适用端：desktop/renderer/app/page.tsx（#place-sheet）

## 现象

专注模式下按 Esc：专注正确退出，但整个星图面板（#place-sheet）也被关闭。实测 DOM：`#pipeline-view` 的 hidden 属性被设为 true。

## 根因（已验证，不要改判）

- `#place-sheet` 是原生 `<dialog>` 元素（app/page.tsx:164）。
- Chromium 的 close watcher 在 **window capture 层**处理 Esc，**早于** document capture 的 keydown 处理器。所以现有修复（document capture 阶段 preventDefault + stopPropagation，app/page.tsx:57-67）拦不住它。
- 时序：close watcher 先触发 dialog cancel/close → React onClose → workspace.toggle(false) → 面板关；随后 document capture 的 keyboard 分支也执行 → exit-focus 派发 → 专注退。实测「专注退了 + 面板也关了」两个都发生，与此完全吻合。
- 实测证据：IN-FOCUS 时 `document.querySelector('#pipeline-view.pipeline-focus-mode:not([hidden])')` 返回 true（选择器匹配正常），说明现有分支确实进了、preventDefault 确实调了，但面板仍被关。

## 修复要求

在 `#place-sheet` dialog 上监听 **cancel** 事件（dialog 的 cancel 是可 preventDefault 的规范标准做法）：

1. 用 ref + `addEventListener('cancel', handler)`（React 合成事件对 dialog cancel 支持不稳，用原生监听）。
2. handler 逻辑：
   - 若 `document.querySelector('#pipeline-view.pipeline-focus-mode:not([hidden])')` 匹配 → `event.preventDefault()`（阻止 dialog 关闭）+ `document.dispatchEvent(new CustomEvent('pipeline:exit-focus'))`。
   - 否则不干预（保持原生行为：Esc 关面板，现有 UX 不变）。
3. 现有 document capture 的 keyboard 分支（app/page.tsx:57-67）保留不动——exit-focus 幂等，双保险无害。
4. 不破坏其他 dialog（utility-dialog 等）的 Esc 行为；只对 #place-sheet 加监听。

## 验收标准

- 专注模式中按 Esc：面板保持打开（#pipeline-view 无 hidden、display 非 none）+ 专注退出（shell 无 is-focus-mode）+ 画布 20 节点可见。
- 非专注态按 Esc：面板正常关闭（原行为）。
- chat 等其他视图的 Esc 行为不变。

## 流程要求

- `npx.cmd tsc --noEmit` 过。
- 不 git commit、不启动 electron（heart 真机复验）。
