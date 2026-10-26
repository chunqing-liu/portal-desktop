import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { ChatState } from '../models/chat';

function MenuIcon({ kind }: { kind: 'file' | 'ui' | 'message' | 'example' }) {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {kind === 'file' ? <path d="m8 13 7-7a3 3 0 0 1 4 4l-9 9a5 5 0 0 1-7-7l10-10M6 15l9-9"/>
      : kind === 'ui' ? <><rect x="3" y="4" width="18" height="16" rx="3"/><path d="M3 10h18M10 10v10"/></>
      : kind === 'message' ? <path d="M5 4h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6 3V6a2 2 0 0 1 2-2Z"/>
      : <><path d="m9 5-6 7 6 7m6-14 6 7-6 7"/><path d="m13 5-2 14"/></>}
  </svg>;
}

export function ComposerAddMenu({ state, onUpload, onExamples, onSelect }: {
  state: ChatState; onUpload: () => void; onExamples: () => void; onSelect: () => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => { if (menu.current?.matches(':popover-open')) menu.current.hidePopover(); };
  const position = () => {
    const element = menu.current!, anchor = trigger.current!.getBoundingClientRect(), bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(anchor.left, innerWidth - bounds.width - 8))}px`;
    element.style.top = `${anchor.top - bounds.height - 8 >= 8 ? anchor.top - bounds.height - 8 : Math.max(8, Math.min(anchor.bottom + 8, innerHeight - bounds.height - 8))}px`;
  };
  const toggle = () => {
    const element = menu.current!;
    if (element.matches(':popover-open')) { close(); return; }
    // Position in the opening event, before the browser paints the top layer.
    element.showPopover(); position(); setOpen(true);
    element.querySelector<HTMLButtonElement>('button')?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const element = menu.current!;
    position();
    const observer = new ResizeObserver(position); observer.observe(element);
    window.addEventListener('resize', close); window.addEventListener('blur', close);
    return () => { observer.disconnect(); window.removeEventListener('resize', close); window.removeEventListener('blur', close); };
  }, [open]);
  return <div className="composer-add">
    <button ref={trigger} type="button" className="btn-icon composer-add-trigger" aria-label="添加附件和工具" title={state.intelligentUIForMessage ? '添加附件和工具 · 本条已开启智能 UI' : '添加附件和工具'}
      popoverTarget={id} onClick={event => { event.preventDefault(); toggle(); }} aria-haspopup="menu" aria-expanded={open} data-active={state.intelligentUIForMessage}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
      {state.intelligentUIForMessage && <span className="composer-add-dot" aria-hidden="true"/>}
    </button>
    <div id={id} ref={menu} popover="auto" role="menu" aria-label="添加附件和工具" className="composer-add-menu" onToggle={event => setOpen(event.newState === 'open')}
      onKeyDown={event => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + items.length) % items.length;
        items[next]?.focus();
      }}>
      <div className="composer-add-heading">添加</div>
      <button type="button" role="menuitem" onClick={() => { close(); onUpload(); }}><MenuIcon kind="file"/><span><strong>上传附件</strong><small>图片、文档和其他文件</small></span></button>
      <div role="separator"/>
      <div className="composer-add-heading">智能 UI <small>Beta</small></div>
      <button type="button" role="menuitemcheckbox" aria-label="启用智能 UI" aria-checked={state.intelligentUIEnabled} onClick={() => {
        const enabled = !state.intelligentUIEnabled;
        state.setIntelligentUIEnabled(enabled);
        if (enabled) state.setIntelligentUIForMessage(true);
      }}><MenuIcon kind="ui"/><span><strong>启用智能 UI</strong><small>支持生成可交互的界面</small></span><i aria-hidden="true">{state.intelligentUIEnabled ? '✓' : ''}</i></button>
      <button type="button" role="menuitemcheckbox" aria-label="本条使用智能 UI" aria-checked={state.intelligentUIForMessage} disabled={!state.intelligentUIEnabled} onClick={() => {
        state.setIntelligentUIForMessage(!state.intelligentUIForMessage); close(); onSelect();
      }}><MenuIcon kind="message"/><span><strong>本条使用智能 UI</strong><small>仅本条消息，发送后自动取消</small></span><i aria-hidden="true">{state.intelligentUIForMessage ? '✓' : ''}</i></button>
      <button type="button" role="menuitem" onClick={() => { close(); onExamples(); }}><MenuIcon kind="example"/><span><strong>交互示例</strong><small>预览智能 UI 的效果</small></span><i aria-hidden="true">›</i></button>
    </div>
  </div>;
}
