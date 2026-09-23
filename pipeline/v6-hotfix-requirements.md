# 星图 V6 P0 修复任务（codex 专属）

> **2026-09-23 21:49 结案更新**：白屏直接根因 = 验收窗口被完全遮挡的环境伪影（Chromium 遮挡追踪 → ResizeObserver 停摆 → 节点尺寸测不到 → 错误屏），解除遮挡即自愈——本文件三条病灶假设均非白屏根因。codex-45f0707b 修复的 selection callback 引用循环是**独立真实病灶**（控制台 StoreUpdater 报错来源），修复保留。详见篝火 seq 2508。

> 负责人醇青。V6 交付后隔离实例 CDP 验收发现 P0 崩溃，本文件是修复任务唯一需求基准。
> 2026-09-23 20:43 由醇青的 being 记录。

## 崩溃证据（隔离实例，全新 PORTAL_DESKTOP_USER_DATA，Vite :5175，CDP :9222）

- 现象：打开客户端即见错误边界屏「页面加载未完成，请重新加载。」，CDP Page.reload 后复现。
- 控制台实锤：`Error: Maximum update depth exceeded ... The above error occurred in the <StoreUpdater> component. React will try to recreate this component tree from scratch using the error boundary`。
- StoreUpdater 是 @xyflow/react 内部组件：无限 setState 循环通常来自 ①节点对象每次渲染重建（未 memo）导致反复测量 ②某个 effect 在测量（resize/尺寸自适应）后写状态又触发重测量 ③nodeExtent/fitView 与受控尺寸互相打架。
- 伴随警告（非致命但要修）：`[React Flow]: Edge type "bezier" not found. Using fallback type "default".` ——V6 连线用了 xyflow 不存在的 edge type 名（内置只有 default/straight/step/smoothstep，或用自定义 custom-edge）。

## 病灶假设（按可能性排序，请逐一验证而非盲改）

1. **R5「站展开自适应尺寸」**：站尺寸根据内含节点测量 → 写回 state → 重渲染 → 再测量。测量回调里 setState 没有收敛条件（尺寸相同就不写）就会死循环。
2. **R1/R9 重构后 nodes/edges 数组每次渲染重建**：传给 ReactFlow 的对象引用不稳定，StoreUpdater 反复应用"新"节点。
3. **站间自动连线（R10）**：自动连首尾节点的 effect 每次渲染都生成新 edge 对象。

## 修复要求

- R1–R11 功能语义不变，只修稳定性。
- 修复后自检：`npm run typecheck` + renderer 生产构建。
- **新增自检（必须）**：在无 electron 前提下用你认为可行的方式论证循环已断——例如对涉事 effect/memo 逐个说明依赖数组为何收敛；如能写一个 node 端跑的纯逻辑测试更好，但禁止启动 electron 图形自测（硬约束不变）。
- 顺带：edge type 改为合法类型名（或注册自定义 bezier），消除控制台警告。
- 完成后报告：改了哪些文件、循环根因到底是哪一条假设（或别的）、为什么不会再循环、自检结果。

## 边界（不变）

- 不回退 V4/V5 已验收行为；localStorage 向后兼容；不 commit 不 push。
- 仓库：C:\Users\chunqing.liu\heart-portal\workspace\portal-desktop，分支 feature/pipeline。
