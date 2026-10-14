import { SceneQueueStore } from "./scene-queue";
import type { SavedSceneSend } from "./scene-queue";
import { inCurrentScene, messageScene, stripSceneTransition, withSceneTransition } from "../models/scenes";
import type { ChatRuntime, ChatState, RuntimeOptions } from "../models/chat";

/** One Being coordinator; scene-local state is not a separate agent or breath. */
export function createSceneRuntime(state: ChatState, options: RuntimeOptions, createRuntime: any): ChatRuntime {
  const sessions = new Map<any, any>();
  const restoredHistory = new WeakSet<object>();
  let selected: any, owner: any, disposed = false, counter = 0;
  let lastActivity = "";
  let historyRefreshes = 0;
  const sendQueue: any[] = [];
  let drainScheduled = false, dispatching = false;
  let submission = Promise.resolve();
  let queueReady = false, drainTimer: any;
  let activityTimer: ReturnType<typeof setTimeout> | undefined;
  let activityInFlight = false, coordinatorStarted = false;
  async function syncActivity() {
    if (disposed || activityInFlight) return;
    activityInFlight = true;
    const snapshots = [...sessions.values()].map(session => [session, session.runtime.captureActivity?.()] as const);
    try {
      const response = await owner.runtime.request('/api/stream/active', {cache: 'no-store', signal: AbortSignal.timeout(8000)});
      if (disposed || (!response.ok && response.status !== 204)) return;
      const active = response.status === 204 ? null : await response.json();
      // Malformed/failed responses are not evidence that the server is idle.
      if (response.status !== 204 && (!active || typeof active.stream_id !== 'string' || !active.stream_id || typeof active.finished !== 'boolean')) return;
      if (disposed) return;
      for (const [session, snapshot] of snapshots) {
        if (disposed) return;
        if (snapshot) await session.runtime.reconcileActivity(active, snapshot);
      }
      if (disposed) return;
      if (active) owner.runtime.discoverActiveStream?.(active);
      // Short autonomous breaths may finish between polls; their history still
      // needs to appear without a focus change or manual refresh.
      await owner.runtime.reconcileHistory?.({preserve: true});
      for (const session of sessions.values()) session.runtime.settleHistoryReply?.();
      publish();
    } catch { /* A failed observation must not clear valid work. Retry below. */ }
    finally {
      activityInFlight = false;
      if (!disposed) activityTimer = setTimeout(syncActivity, 10000);
    }
  }
  const pageLocation = typeof location === 'undefined' ? { search: '', origin: '' } : location;
  const queueStore = new SceneQueueStore(new URLSearchParams(pageLocation.search).get('history_scope') || pageLocation.origin);
  let queueStoreClosed = false;
  function closeQueueStore() {
    if (queueStoreClosed) return;
    queueStoreClosed = true;
    queueStore.close();
  }
  function retryDrain() {
    if (!disposed && !drainTimer) drainTimer = setTimeout(() => { drainTimer = null; scheduleDrain(); }, 2000);
  }
  function attachQueued(target: any, entry: any, saved: any, persisted = true) {
    const queued = { session: target, entry, saved, persisted, claimed: false };
    sendQueue.push(queued);
    entry.message.canInterruptQueued = persisted && saved.phase === "queued";
    target.local.queued++;
    entry.message.queueNotice = saved.phase === 'sending' ? '发送状态待确认，请先查看场景历史；不会自动重发' : undefined;
    entry.message.cancelQueued = async () => {
      if (queued.claimed) return;
      queued.claimed = true;
      try { await queueStore.write(saved.id); }
      catch { queued.claimed = false; entry.message.queueNotice = '无法保存取消操作，请重试'; publish(); return; }
      const index = sendQueue.indexOf(queued);
      if (index < 0) return;
      detachQueued(queued);
      state.items = state.items.filter((item: any) => item !== entry.message);
      publish();
    };
    entry.message.interruptQueued = () => {
      submission = submission.then(async () => {
        if (disposed || queued.claimed || !sendQueue.includes(queued) || !queued.persisted || saved.phase !== 'queued') return;
        if ([...sessions.values()].some(other => other !== target && busy(other))) return;
        queued.claimed = true;
        try {
          saved.createdAt = Date.now();
          await queueStore.write({ ...saved, phase: 'sending' });
          if (disposed || [...sessions.values()].some(other => other !== target && busy(other))) { await queueStore.write(saved); return; }
          saved.phase = 'sending';
          detachQueued(queued, true);
          // The server's existing splice/yield path interrupts this scene with
          // the new input; do not stop a different scene's stream.
          void Promise.resolve(target.runtime.send(entry.text, entry.files, { ...entry.sendOptions, queuedMessage: entry.message }))
            .then(() => { if (!disposed) return queueStore.write(saved.id); })
            .catch(() => { /* Keep the durable uncertain record for reconciliation. */ });
        } catch {
          entry.message.queueNotice = '无法保存发送状态，请重试';
        } finally { queued.claimed = false; publish(); }
      });
      return submission;
    };
    return queued;
  }
  function detachQueued(queued: any, sent = false) {
    const index = sendQueue.indexOf(queued);
    if (index < 0) return false;
    sendQueue.splice(index, 1);
    queued.session.local.queued = Math.max(0, queued.session.local.queued - 1);
    if (sent) {
      state.items = [...state.items.filter((item: any) => item !== queued.entry.message), queued.entry.message];
      queued.entry.message.createdAt = queued.saved.createdAt;
      queued.entry.message.queued = false;
      queued.entry.message.cancelQueued = undefined;
      queued.entry.message.interruptQueued = undefined;
      queued.entry.message.queueNotice = undefined;
    }
    return true;
  }
  function restoredSendWasAccepted(queued: any) {
    if (queued.saved.phase !== 'sending') return false;
    const expected = stripSceneTransition(queued.saved.text || '').replace(/\s+/g, ' ').trim();
    if (!expected) return false;
    return state.items.some((item: any) => {
      if (item.kind !== 'message' || item.role !== 'user' || !item.historySeq || item === queued.entry.message) return false;
      const actual = stripSceneTransition(item.text || '').replace(/\s+/g, ' ').trim();
      if (actual !== expected || !inCurrentScene(item, queued.saved.scene) || !inCurrentScene(queued.saved.scene, item)) return false;
      const sentAt = Number(queued.saved.createdAt), acceptedAt = Number(item.createdAt);
      return Number.isFinite(sentAt) && Number.isFinite(acceptedAt) && Math.abs(sentAt - acceptedAt) <= 2 * 60 * 1000;
    });
  }
  // Presentation also includes completed delegated tasks awaiting a summary.
  // Only runtime ownership can block sending; those ledger rows hold no stream.
  const busy = (session: any) => typeof session.runtime?.isBusy === "function"
    ? session.runtime.isBusy()
    : ["thinking", "replying", "working", "waiting", "reconnecting"].includes(session.runtime?.sceneActivity());
  function scheduleDrain() {
    if (disposed || !queueReady || drainTimer || drainScheduled || dispatching || !sendQueue.length) return;
    drainScheduled = true;
    queueMicrotask(async () => {
      drainScheduled = false;
      if (disposed || dispatching || [...sessions.values()].some(busy)) { retryDrain(); return; }
      const next = sendQueue[0];
      if (!next || next.claimed || next.saved.phase === 'sending' || !next.persisted) return;
      next.claimed = true;
      dispatching = true;
      try {
        // Refresh can erase local activity flags; check the actual breath first.
        const response = await owner.runtime.request('/api/stream/active', { cache: 'no-store', signal: AbortSignal.timeout(8000) });
        if (response.status !== 204) {
          if (!response.ok) { retryDrain(); return; }
          const active = await response.json();
          if (!active.finished && (!active.origin || active.origin === 'human')) { retryDrain(); return; }
        }
        if (disposed || [...sessions.values()].some(busy)) { retryDrain(); return; }
        next.saved.createdAt = Date.now();
        await queueStore.write({ ...next.saved, phase: 'sending' });
        next.saved.phase = 'sending';
        if (disposed || [...sessions.values()].some(busy)) {
          // Storage yields to other submissions. Recheck ownership before send
          // and restore the retryable row if another turn or disposal won.
          next.saved.phase = 'queued';
          try { await queueStore.write(next.saved); } catch { /* The next load keeps the conservative sending row. */ }
          retryDrain();
          return;
        }
        detachQueued(next, true);
        await next.session.runtime.send(next.entry.text, next.entry.files, { ...next.entry.sendOptions, queuedMessage: next.entry.message });
        // If refresh interrupts the request, retain the uncertain record instead
        // of risking a duplicate send on the next page load.
        if (!disposed) await queueStore.write(next.saved.id);
      } catch {
        if (sendQueue.includes(next)) next.entry.message.queueNotice = '等待连接或本地存储恢复';
        retryDrain();
      } finally {
        next.claimed = false;
        dispatching = false;
        if (disposed) closeQueueStore();
        publish();
      }
    });
  }
  const localKeys = new Set<PropertyKey>(["currentScene", "activeScene", "draft", "files", "queued", "thinking", "streaming", "stopping", "dotClass"]);
  const sceneStatus = (session: any) => {
    const status = session.runtime?.sceneActivity();
    const tasks = (state.sceneTasks || []).filter((t: any) => t.sceneId === session.local.currentScene.sceneId);
    if (tasks.some((t: any) => t.status === 'running' || t.status === 'queued')) return 'working';
    if (status === 'error' || status === 'timeout' || status === 'stopped') return session.local.queued ? 'queued' : status;
    // Creation order is not completion order: an earlier slow task can finish
    // after a stage reply for a later fast task. Inspect every pending result.
    const currentTasks = tasks.filter((t: any) => !session.submittedAt || t.createdAt >= session.submittedAt);
    const repliedAt = session.runtime?.replyCompletedAt?.() || 0;
    if (!['thinking','replying'].includes(status)) {
      if (session.submittedAt && currentTasks.some((t: any) => t.status === 'done' && t.endedAt > repliedAt)) return 'waiting';
      if (currentTasks.some((t: any) => ['failed','interrupted','budget_exhausted','timeout'].includes(t.status) &&
          (!t.endedAt || t.endedAt > repliedAt))) return 'error';
    }
    return status && ["queued", "thinking", "replying", "working", "waiting", "reconnecting"].includes(status) ? status :
      session.local.queued ? "queued" : status;
  };
  function publish() {
    if (disposed || !selected) return;
    for (const key of localKeys) {
      if (key !== "currentScene" && key !== "draft") (state as any)[key] = selected.local[key];
    }
    // The transcript may contain an active background run in the all-scenes view.
    state.streaming = [...sessions.values()].some(session => session.local.streaming);
    state.sendWillQueue = sendQueue.length > 0 || [...sessions.values()].some(busy);
    state.canInterruptQueue = ![...sessions.values()].some(session => session !== selected && busy(session));
    const activity = Object.fromEntries([...sessions.entries()].flatMap(([id, session]) => {
      const status = sceneStatus(session);
      return id && status ? [[id, status]] : [];
    }));
    const signature = JSON.stringify(activity);
    if (signature !== lastActivity) {
      lastActivity = signature;
      options.onSceneActivity?.(activity);
    }
    state.changed();
    scheduleDrain();
  }
  function sessionFor(scene: any) {
    let session = sessions.get(scene.sceneId);
    if (session) return session;
    const local: any = { currentScene: { ...scene }, activeScene: { ...scene }, draft: "", files: [], queued: 0,
      thinking: false, streaming: false, stopping: false, dotClass: state.dotClass };
    const routed = new Set<any>();
    const proxy = new Proxy(state, {
      get(target, key) {
        if (key === "changed") return publish;
        if (key === "draft" && selected === session) return state.draft;
        return localKeys.has(key) ? local[key] : (target as any)[key];
      },
      set(target, key, value) {
        if (localKeys.has(key)) {
          local[key] = value;
          if (key === "draft" && selected === session) state.draft = value;
        } else (target as any)[key] = value;
        return true;
      },
    });
    session = { local, runtime: null };
    sessions.set(scene.sceneId, session);
    session.runtime = createRuntime(proxy, {
      ...options,
      nextId: () => ++counter,
      resolveDefaultScene(scene: any) {
        if (local.currentScene.sceneId || !scene.sceneId) return;
        // Resolve the existing room in place so replies carrying the new Loom
        // identity do not create a second, background session.
        sessions.delete(local.currentScene.sceneId);
        local.currentScene = { ...scene };
        local.activeScene = { ...scene };
        sessions.set(scene.sceneId, session);
        if (selected === session) state.currentScene = { ...scene };
      },
      prepareMessage(text: any) {
        // Track submission without changing the editable or locally rendered body.
        session.submittedAt = Date.now();
        return text;
      },
      prepareRequestMessage(text: any, scene: any, sendOptions: any = {}) {
        const previous = [...state.items].reverse().find(item =>
          item !== sendOptions.queuedMessage && item.kind === "message" &&
          (item.role === "user" || item.role === "being") && !item.queued);
        return withSceneTransition(text, scene, previous);
      },
      onConnection(next: any) {
        for (const other of sessions.values()) if (other !== session) other.runtime?.syncConnection(next);
        options.onConnection?.(next);
      },
      recoverScenes: async (details: any) => {
        if (session !== owner) return;
        await Promise.all([...sessions.values()].filter(s => s !== owner).map(s => s.runtime.recoverConnection(details)));
      },
      historyOwner: () => owner && owner !== session ? owner.runtime : null,
      selectedScene: () => state.currentScene,
      activeAutonomousOrigin: () => [...sessions.values()].map(s => s.runtime?.activeAutonomousOrigin?.()).find(Boolean),
      restoredHistory,
      isLiveScene: (scene: any) => [...sessions.values()].some(s => s.runtime?.ownsLiveScene(scene)),
      routeEvent(type: any, data: any) {
        if (!Object.hasOwn(data, "scene_id")) return false;
        const scene = messageScene(data);
        if (scene.sceneId === local.currentScene.sceneId ||
            (scene.sceneId && local.currentScene.legacySceneId && inCurrentScene(scene, local.currentScene))) return false;
        const target = sessionFor(scene);
        routed.add(target);
        target.runtime.acceptSceneEvent(type, data);
        return true;
      },
      finishRoutes() {
        for (const target of routed) target.runtime.finishRoutedStream();
        routed.clear();
      },
      routeReplay(data: any) {
        if (data.stream_id && [...sessions.values()].some(s => s !== session && s.runtime?.hasStream(data.stream_id))) return true;
        if (!Object.hasOwn(data, "scene_id")) return false;
        const scene = messageScene(data);
        if (scene.sceneId === local.currentScene.sceneId ||
            (scene.sceneId && local.currentScene.legacySceneId && inCurrentScene(scene, local.currentScene))) return false;
        sessionFor(scene).runtime.acceptReplay(data);
        return true;
      },
    });
    if (owner) session.runtime.syncConnection(state.connection);
    return session;
  }
  owner = selected = sessionFor(state.currentScene);
  selected.local.draft = state.draft;
  let selection = Promise.resolve();
  const runtime: any = {
    updateSceneTasks(tasks: any, subagentReady = state.subagentReady) {
      state.subagentReady = subagentReady === true;
      state.sceneTasks = tasks;
      for (const task of tasks) sessionFor({ sceneId: task.sceneId, sceneLabel: state.sceneNames?.[task.sceneId] || '' });
      publish();
    },
    async start() {
      if (coordinatorStarted || disposed) return;
      coordinatorStarted = true;
      try {
        const saved = await queueStore.read();
        if (disposed) return;
        for (const row of saved) {
          const target = sessionFor(row.scene);
          const entry = target.runtime.stageQueuedSend(row.text, row.files, row.sendOptions);
          if (entry) { entry.message.createdAt = row.createdAt; attachQueued(target, entry, row); }
        }
        await owner.runtime.start();
        for (const queued of [...sendQueue]) {
          if (!restoredSendWasAccepted(queued)) continue;
          detachQueued(queued);
          state.items = state.items.filter((item: any) => item !== queued.entry.message);
          try { await queueStore.write(queued.saved.id); } catch { /* Reconciliation will retry after the next load. */ }
        }
        queueReady = true;
      } catch {
        state.items.push({ kind: 'message', id: `queue-error-${++counter}`, role: 'system', text: '无法恢复本地排队记录，已暂停自动发送。请重新打开页面重试。', streaming: false, timestamp: '', label: 'system', consecutive: false, ...state.currentScene });
        await owner.runtime.start();
      }
      publish();
      if (!disposed) activityTimer = setTimeout(syncActivity, 10000);
    },
    send(...args: any[]) {
      const target = selected;
      args[2] = { intelligentUI: state.intelligentUIEnabled && state.intelligentUIForMessage,
        uiSnapshot: state.intelligentUISnapshots?.[state.currentScene.sceneId || 'global'], ...args[2] };
      // Detach structured UI values now, before any queued asynchronous work.
      if (args[2].uiAction) args[2].uiAction = structuredClone(args[2].uiAction);
      const sendSnapshot = !Array.isArray(args[1])
        ? (typeof target.runtime.captureSendSnapshot === 'function'
          ? target.runtime.captureSendSnapshot()
          : { draft: state.draft, files: Array.isArray(state.files) ? [...state.files] : [] })
        : null;
      // Serialize only capture/dispatch decisions, never wait for a breath here.
      submission = submission.then(async () => {
        const prepared = typeof target.runtime.prepareSend === 'function'
          ? await target.runtime.prepareSend(args[1], sendSnapshot)
          : (await target.runtime.waitForPendingFiles(), true);
        if (!prepared) return;
        if (disposed) return;
        const othersBusy = [...sessions.values()].some(other => other !== target && busy(other));
        if (othersBusy || (args[2].mode !== 'interrupt' && (sendQueue.length || busy(target)))) {
          // Older/embedded runtimes may not expose the durable queue hook yet.
          // Keep sending functional while the host is being upgraded; the full
          // Desktop runtime supplies stageQueuedSend and persists the entry.
          if (typeof target.runtime.stageQueuedSend !== 'function') {
            void target.runtime.send(...args);
            return;
          }
          const entry = target.runtime.stageQueuedSend(...args);
          if (!entry) return;
          const saved: SavedSceneSend = { id: crypto.randomUUID(), endpoint: queueStore.endpoint,
            scene: { ...target.local.currentScene }, text: entry.text, files: entry.files,
            createdAt: entry.message.createdAt || Date.now(), phase: 'queued', sendOptions: entry.sendOptions };
          const queued = attachQueued(target, entry, saved, false);
          try { await queueStore.write(saved); queued.persisted = true; entry.message.canInterruptQueued = true; }
          catch { entry.message.queueNotice = '排队内容未能保存，刷新可能丢失；请取消后重试'; }
          publish();
        } else {
          void target.runtime.send(...args);
        }
      });
      return submission;
    },
    selectScene(scene: any) {
      selection = selection.then(async () => {
        await selected.runtime.waitForPendingFiles();
        if (disposed) return;
        selected.local.draft = state.draft;
        const next = sessionFor(scene);
        if (next !== selected) state.resetScroll++;
        selected = next;
        selected.local.currentScene = { ...scene };
        state.currentScene = scene;
        state.historyScope = "current";
        state.draft = selected.local.draft;
        publish();
        await owner.runtime.restoreSceneHistory?.(scene);
        if (disposed) return;
        void owner.runtime.refreshHistory();
      });
      return selection;
    },
    dispose() {
      disposed = true;
      clearTimeout(drainTimer);
      clearTimeout(activityTimer);
      for (const queued of [...sendQueue]) detachQueued(queued);
      state.queued = 0;
      if (lastActivity) options.onSceneActivity?.({});
      if (!dispatching) closeQueueStore();
      for (const session of sessions.values()) session.runtime.dispose();
    },
    async refreshHistory() {
      historyRefreshes++;
      state.historyRefreshing = true;
      state.changed();
      try { await owner.runtime.refreshHistory(); }
      finally {
        historyRefreshes--;
        if (!disposed) { state.historyRefreshing = historyRefreshes > 0; state.changed(); }
      }
    },
    refreshOnRegainedAttention: () => Promise.all([...sessions.values()].map(s => s.runtime.refreshOnRegainedAttention())),
  };
  for (const method of ["stopCurrentTurn", "handleFiles", "removePending"])
    runtime[method] = (...args: any[]) => {
      selected.local.files = state.files;
      return selected.runtime[method](...args);
    };
  for (const method of ["loadLlmConfig", "applyConfigChange", "toggleSbs", "loadSbsState", "request", "revealHistory"])
    runtime[method] = (...args: any[]) => owner.runtime[method](...args);
  return runtime as ChatRuntime;
}
