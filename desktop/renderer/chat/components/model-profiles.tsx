import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ModelProfileInput, PublicModelProfile } from "../../../shared/types";
import type { ChatRuntime, ChatState, LlmConfig } from "../models/chat";
import { useModel } from "../../shared/hooks/use-model";

type Runtime = Pick<ChatRuntime, "loadLlmConfig" | "applyConfigChange"> & Partial<Pick<ChatRuntime, "request">>;
type Candidate = Omit<ModelProfileInput, "name" | "api_key">;
const providerNames: Record<string, string> = {
  anthropic: "Anthropic", openai: "OpenAI", openrouter: "OpenRouter",
  gemini: "Google Gemini", groq: "Groq", xai: "xAI", glm: "智谱",
  "self-hosted": "自部署", "portal-custom": "自定义接口",
};
const identity = (profile: { provider: string; base_url?: string }) => JSON.stringify([profile.provider, profile.base_url || ""]);

/** Desktop-only: the page never reads a stored key, even when applying a profile. */
export function useModelProfiles({
  state, runtime, open, enabled, busy: panelBusy,
}: { state: ChatState; runtime: Runtime; open: boolean; enabled: boolean; busy: boolean }) {
  useModel(state);
  const api = enabled && typeof window !== "undefined" ? window.beings?.modelProfiles : undefined;
  const [profiles, setProfiles] = useState<PublicModelProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [applying, setApplying] = useState("");
  const [candidate, setCandidate] = useState<Candidate | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  // Only keys the user entered in this open panel are retained, in memory.
  const enteredKeys = useRef(new Map<string, string>());
  const nameId = useId();
  function status(text: string, className: string) {
    state.configStatus = text;
    state.configStatusClass = className;
    state.changed();
  }
  useEffect(() => {
    if (!open) {
      enteredKeys.current.clear();
      setCandidate(null);
      setNaming(false);
      setName("");
    }
    if (!open || !api) return;
    let cancelled = false;
    setLoading(true);
    api({ action: "list" }).then(result => {
      if (cancelled) return;
      if (!result.ok) throw new Error(result.error || "模型档案读取失败。");
      setProfiles(result.profiles);
    }).catch(error => {
      if (!cancelled) status(error instanceof Error ? error.message : "模型档案读取失败。", "error");
    }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [api, open]);
  useEffect(() => () => { enteredKeys.current.clear(); }, []);
  const wrappedRuntime = useMemo<Runtime>(() => !api ? runtime : ({
    ...runtime,
    async applyConfigChange(patch) {
      setCandidate(null);
      setNaming(false);
      const result = await runtime.applyConfigChange(patch);
      // A rolled-back or rejected attempt is never a saveable new configuration.
      if (result?.ok && !result.rolled_back && !result.needs_key) {
        const config = result.config || state.config;
        if (config.provider && config.model) {
          const baseUrl = config.base_url !== undefined ? config.base_url : typeof patch.base_url === "string" ? patch.base_url : undefined;
          const next: Candidate = {
            provider: config.provider, model: config.model,
            ...(baseUrl?.trim() ? { base_url: baseUrl.trim() } : {}),
            ...(config.api !== undefined ? { api: config.api } : typeof patch.api === "string" ? { api: patch.api } : {}),
            ...(config.thinking !== undefined ? { thinking: config.thinking } : {}),
          };
          const enteredKey = typeof patch.api_key === "string" && patch.api_key.trim() ? patch.api_key.trim() :
            enteredKeys.current.get(identity({ provider: next.provider, base_url: typeof patch.base_url === "string" ? patch.base_url : undefined }));
          if (enteredKey) enteredKeys.current.set(identity(next), enteredKey);
          setCandidate(next);
          setNaming(false);
        }
      }
      return result;
    },
  }), [api, runtime, state]);
  const disabled = panelBusy || busy || loading || state.configLoading;
  async function applyProfile(profile: PublicModelProfile) {
    if (!api || disabled) return;
    setBusy(true);
    setApplying(profile.id);
    setCandidate(null);
    setNaming(false);
    status("正在切换模型…", "applying");
    try {
      const result = await api({ action: "apply", id: profile.id });
      setProfiles(result.profiles);
      if (result.rolled_back && result.config) state.config = result.config as LlmConfig;
      if (!result.ok || result.rolled_back || result.needs_key)
        throw new Error(result.error || (result.rolled_back ? "试连失败，已恢复上次可用配置。" : "模型切换失败。"));
      if (result.config) state.config = result.config as LlmConfig;
      // Also refresh the host adapter's derived state (e.g. "copy Being model"
      // in the subagent tab), not just this component's current-model label.
      await runtime.loadLlmConfig();
      if (state.configStatusClass === "error") throw new Error(state.configStatus || "模型配置刷新失败。");
      if (state.config.provider !== profile.provider || state.config.model !== profile.model)
        throw new Error("模型配置已提交，但无法确认当前配置，请重新打开模型设置。");
      status(`已切换到「${profile.name}」。`, "success");
    } catch (error) {
      status(error instanceof Error ? error.message : "模型切换失败。", "error");
    } finally {
      setApplying("");
      setBusy(false);
    }
  }
  async function removeProfile(profile: PublicModelProfile) {
    if (!api || disabled) return;
    setBusy(true);
    try {
      const result = await api({ action: "delete", id: profile.id });
      if (!result.ok) throw new Error(result.error || "模型档案删除失败。");
      setProfiles(result.profiles);
      status(`已删除「${profile.name}」；当前模型不变。`, "success");
    } catch (error) {
      status(error instanceof Error ? error.message : "模型档案删除失败。", "error");
    } finally { setBusy(false); }
  }
  async function saveProfile() {
    if (!api || !candidate || disabled) return;
    if (!name.trim() || name.trim().length > 40) {
      status("档案名需为 1–40 个字符。", "error");
      return;
    }
    setBusy(true);
    try {
      const result = await api({
        action: "save", profile: { ...candidate, name: name.trim(), api_key: enteredKeys.current.get(identity(candidate)) },
      });
      if (!result.ok) throw new Error(result.error || "模型档案保存失败。");
      setProfiles(result.profiles);
      setNaming(false);
      status("模型档案已保存在本机。", "success");
    } catch (error) {
      status(error instanceof Error ? error.message : "模型档案保存失败。", "error");
    } finally { setBusy(false); }
  }
  return {
    runtime: wrappedRuntime,
    busy,
    onKeySaved(provider: string, base_url: string | undefined, key: string) {
      enteredKeys.current.set(identity({ provider, base_url }), key);
    },
    section: api ? (
      <section className="model-profile-section" aria-label="我的模型档案" aria-busy={busy || loading}>
        <h3>我的模型档案</h3>
        {loading ? <p className="model-profile-hint">正在读取模型档案…</p> : profiles.length ? (
          <ul className="model-profile-list">
            {profiles.map(profile => {
              const current = state.config.provider === profile.provider && state.config.model === profile.model;
              return <li key={profile.id} className="model-profile-row">
                <div className="model-profile-copy">
                  <div className="model-profile-name">{profile.name}{current && <span className="model-profile-current">当前</span>}</div>
                  <div className="model-profile-detail">{providerNames[profile.provider] || profile.provider} · {profile.model}</div>
                </div>
                <div className="model-profile-actions">
                  <button type="button" disabled={disabled} onClick={() => void applyProfile(profile)}>{applying === profile.id ? "切换中…" : "切换"}</button>
                  <button type="button" disabled={disabled} onClick={() => void removeProfile(profile)}>删除</button>
                </div>
              </li>;
            })}
          </ul>
        ) : <p className="model-profile-hint">还没有保存的模型。填好一套配置并应用后，点下面的『存为当前配置』。</p>}
        {candidate && !naming && <button type="button" className="model-profile-save" disabled={disabled} onClick={() => {
          setName(`${candidate.provider}/${candidate.model}`.slice(0, 40));
          setNaming(true);
        }}>存为当前配置</button>}
        {candidate && naming && <form className="model-profile-form" onSubmit={event => { event.preventDefault(); void saveProfile(); }}>
          <label htmlFor={nameId}>档案名</label>
          <input id={nameId} className="model-profile-input" value={name} maxLength={40} autoFocus autoComplete="off" disabled={disabled}
            onChange={event => setName(event.target.value)} />
          <p className="model-profile-hint">仅保存在本机；同名档案会更新。本次未填写的服务端密钥不会自动复制。</p>
          <div className="model-profile-actions">
            <button type="submit" disabled={disabled || !name.trim()}>{busy ? "保存中…" : "确认保存"}</button>
            <button type="button" disabled={disabled} onClick={() => setNaming(false)}>取消</button>
          </div>
        </form>}
      </section>
    ) : null,
  };
}
