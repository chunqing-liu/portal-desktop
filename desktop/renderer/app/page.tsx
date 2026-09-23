import { useEffect, useLayoutEffect, useRef } from "react";
import type { AppModel } from "./models/app";
import { useModel } from "../shared/hooks/use-model";
import { useChatBridge } from "./hooks/use-chat-bridge";
import { Topbar } from "./components/topbar";
import { SceneRibbon, Companion } from "./components/workspace";
import { Browser } from "../browser/page";
import { Portal } from "../portal/page";
import { Pipeline } from "../pipeline/page";
import { Town } from "../town/page";
import { TownAuth } from "../town/components/auth";
import { TownComposer } from "../town/components/composer";
import { KitInstall } from "../town/components/kit-install";
import { ChatSearch } from "./components/search";
import { ConnectionSettings, ClientSettings } from "./components/settings";
import { SubagentModelSettings } from "./components/subagent-model-settings";
import { Diagnostics } from "./components/diagnostics";
import { Dialog } from "../shared/components/dialog";
import { EditContextMenu } from "../shared/components/context-menu";
import { PlaceHeading } from "./components/navigation";
import logo from "../../../resources/branding/logo.png";
import logoWhite from "../../../resources/branding/logo-white.png";
export function App({ model }: { model: AppModel }) {
  const app = useModel(model),
    frame = useRef<HTMLIFrameElement>(null);
  const themedLogo = app.theme === "dark" ? logoWhite : logo;
  useChatBridge(app, frame);
  useEffect(() => app.start(), [app]);
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = app.theme;
    document.documentElement.dataset.platform = app.api?.platform || "";
    document.documentElement.style.setProperty(
      "--reading-size",
      app.readingSize + "px",
    );
    document.body.dataset.view = app.view;
  }, [app.theme, app.view, app.readingSize, app.api]);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      const dialog = document.querySelector("dialog[open]");
      if (
        (event.metaKey || event.ctrlKey) &&
        event.key.toLowerCase() === "f" &&
        !dialog
      ) {
        event.preventDefault();
        app.openSearch();
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "1") {
        event.preventDefault();
        app.navigate("chat");
      }
      if ((event.metaKey || event.ctrlKey) && event.key === "," && !dialog) {
        event.preventDefault();
        void app.openClientSettings();
      }
      if (event.key === "Escape") {
        // 星图专注态优先消费 Escape。这个监听在 document capture 阶段，
        // 必须先阻止原生 dialog cancel 和工作区关闭，再把退出动作交给星图。
        if (document.querySelector("#pipeline-view.pipeline-focus-mode:not([hidden])")) {
          event.preventDefault();
          event.stopPropagation();
          // 退出专注的动作交给原生 cancel 闸门与本分支共同处理：
          // 先设 dataset 标记（不受 React flush 影响，专注态 class 被移除后仍可追踪），
          // 再派发 exit-focus。cancel 闸门优先消费标记，确保面板不被关闭。
          document.documentElement.dataset.pipelineFocusEsc = "1";
          document.dispatchEvent(new CustomEvent("pipeline:exit-focus"));
          return;
        }
        if (!dialog && app.workspace.open) app.workspace.toggle(false);
      }
    };
    // Capture before focused controls can consume app-level shortcuts.
    document.addEventListener("keydown", keyboard, true);
    return () => document.removeEventListener("keydown", keyboard, true);
  }, [app]);
  // 星图专注态拦截原生 dialog cancel：React 合成 onCancel 不会收到
  // dialog 的 cancel 事件（实测验证），必须用原生监听才能在
  // close watcher 关闭面板前拿到控制权。专注态时只退出专注，面板保持打开。
  useEffect(() => {
    const sheet = document.querySelector("#place-sheet");
    if (!sheet) return;
    const onSheetCancel = (event: Event) => {
      const root = document.documentElement;
      if (root.dataset.pipelineFocusEsc === "1") {
        // 本次 Esc 源自专注态分支：只退专注，不关面板。
        root.dataset.pipelineFocusEsc = "";
        event.preventDefault();
        return;
      }
      if (!document.querySelector("#pipeline-view.pipeline-focus-mode:not([hidden])"))
        return;
      event.preventDefault();
      document.dispatchEvent(new CustomEvent("pipeline:exit-focus"));
    };
    sheet.addEventListener("cancel", onSheetCancel);
    return () => sheet.removeEventListener("cancel", onSheetCancel);
  }, []);
  return (
    <>
      <section
        id="startup-screen"
        className="startup-screen"
        aria-busy={app.startup === "loading"}
        aria-label="客户端启动"
        hidden={app.startup === "ready"}
      >
        <div className="startup-content">
          <img src={themedLogo} alt="Portal Desktop" width={56} height={56} />
          <span
            id="startup-spinner"
            className="startup-spinner"
            aria-hidden="true"
            hidden={app.startup !== "loading"}
          />
          <p id="startup-message" role="status">
            {app.startup === "error"
              ? "配置加载未完成，请重试。原配置不会被覆盖。"
              : "正在加载配置并恢复连接…"}
          </p>
          <button
            id="startup-retry"
            className="secondary"
            hidden={app.startup !== "error"}
            onClick={() => void app.initialize()}
          >
            重试
          </button>
        </div>
      </section>
      <main id="client-main" hidden={app.startup !== "ready"}>
        <div className="workspace-body">
          <div className="workspace-stage">
            <Topbar model={app} />
            <p
              id="startup-notice"
              className="startup-notice"
              role="status"
              hidden={!app.snapshot?.notice}
            >
              {app.snapshot?.notice || ""}
            </p>
            <SceneRibbon model={app.workspace} />
            <section id="chat-view" className="view">
              <div
                id="welcome"
                hidden={!app.snapshot || app.snapshot.settings.hasToken}
              >
                <div className="welcome-intro">
                  <img
                    className="welcome-logo"
                    src={themedLogo}
                    alt="Portal Desktop"
                    width={88}
                    height={88}
                  />
                  <h1>从一个想法开始</h1>
                  <p>连接你的 Being，继续对话。</p>
                </div>
                <button
                  className="welcome-connect"
                  id="connect-button"
                  onClick={() => app.showSettings()}
                >
                  <span>连接我的 Being</span>
                  <span className="welcome-connect-arrow" aria-hidden="true">
                    ↗
                  </span>
                </button>
              </div>
              <iframe
                id="chat-frame"
                ref={frame}
                title="Being 对话"
                hidden={!app.snapshot?.settings.hasToken}
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-downloads"
                src={app.chatSource || undefined}
                onLoad={() => {
                  if (app.chatSource) app.frameLoaded();
                }}
              />
            </section>
          </div>
          <Companion model={app.workspace} />
          <Browser model={app} />
        </div>
      </main>
      <Diagnostics model={app} />
      <Dialog
        id="place-sheet"
        aria-labelledby="view-title"
        open={app.view !== "chat"}
        onClose={app.closePlace}
        shouldClose={() => {
          // 星图专注态优先消费 Esc：只退出专注，不关面板。
          if (document.querySelector("#pipeline-view.pipeline-focus-mode:not([hidden])")) {
            document.dispatchEvent(new CustomEvent("pipeline:exit-focus"));
            return false;
          }
          return true;
        }}
        dismissOnBackdrop
      >
        <PlaceHeading
          view={app.view}
          navigate={app.navigate}
          onBack={app.settingsRoute === "portal" || app.town.returnView ? app.returnFromPlace : undefined}
          onForward={app.town.forwardView ? app.forwardFromPlace : undefined}
          onClose={app.closePlace}
        />
        <Portal model={app} />
        <Town model={app.town} />
        <Pipeline model={app} />
      </Dialog>
      <ChatSearch model={app} />
      <TownComposer model={app.town} />
      <TownAuth model={app.town} returnToSettings={app.settingsRoute === "town"}
        onReturnToSettings={app.returnToClientSettings} onDismissSettingsRoute={app.dismissSettingsRoute} />
      <ClientSettings model={app} />
      <ConnectionSettings model={app} />
      {app.subagentSettingsOpen && <SubagentModelSettings app={app} />}
      <KitInstall model={app.town} />
      <Toast message={app.toastMessage} />
      <EditContextMenu edit={app.api.editSelection} rootSelector="#client-main, dialog[open]"
        selectionSelector=".reading-text, .dialog-body, #town-body" ignoreSelector="#pipeline-view" />
    </>
  );
}

function Toast({ message }: { message: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const toast = ref.current;
    if (!toast) return;
    if (message) {
      if (typeof toast.showPopover === "function" && !toast.matches(":popover-open"))
        toast.showPopover();
    } else if (typeof toast.hidePopover === "function" && toast.matches(":popover-open")) {
      toast.hidePopover();
    }
  }, [message]);
  return (
    <div ref={ref} id="toast" popover="manual" role="status" aria-live="polite">
      {message}
    </div>
  );
}
