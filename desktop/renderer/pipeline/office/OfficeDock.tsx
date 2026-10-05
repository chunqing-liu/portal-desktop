import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import type { PipelineLocalState } from '../models/schema';
import { DEMO_IDENTITIES, type OfficeIdentity } from './identities';
import type { OfficeNodeReport, OfficeSnapshot } from '../../../shared/office';
import { OfficePresenceClient } from './presence';
import { applyBeingNodeReport } from './reports';
import { projectOffice, STATUS_MARKERS, type OfficeTask } from './projection';
import { OfficeHost } from './host';
import type { MeetingView } from './meeting';
import './office.css';

export function OfficeDock({ state, selectedIds, focusMode, active, onNavigate, onReports }: { state: PipelineLocalState; selectedIds: string[]; focusMode: boolean; active: boolean; onNavigate: (demandId: string, nodeId: string) => void; onReports?: (reports: OfficeNodeReport[], identities: OfficeIdentity[]) => void }) {
  const [open, setOpen] = useState(() => localStorage.getItem('starmap-office-open') !== 'false');
  const [height, setHeight] = useState(260);
  const [standalone, setStandalone] = useState(false);
  const [available, setAvailable] = useState(0);
  const [actorId, setActorId] = useState(DEMO_IDENTITIES[0].id);
  const [reduced, setReduced] = useState(() => localStorage.getItem('starmap-office-reduced') === 'true' || matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [documentVisible, setDocumentVisible] = useState(!document.hidden);
  const [error, setError] = useState('');
  const [meeting, setMeeting] = useState<MeetingView>();
  const [identities, setIdentities] = useState<OfficeIdentity[]>(DEMO_IDENTITIES);
  const [presence, setPresence] = useState<OfficeSnapshot>({ sequence: 0, entries: [], reports: [] });
  const [reportErrors, setReportErrors] = useState<string[]>([]);
  const [feedback, setFeedback] = useState<{ eventId: string; status: string; code?: string }[]>([]);
  const feedbackSignature = useRef('');
  const reportsSignature = useRef('');
  const stateRef = useRef(state);
  stateRef.current = state;
  const reportsCallback = useRef(onReports);
  reportsCallback.current = onReports;
  const root = useRef<HTMLElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const host = useRef<OfficeHost | null>(null);
  const resize = useRef<{ start: number; height: number } | null>(null);
  const projection = useMemo(() => projectOffice(state, identities, presence.entries), [state, identities, presence.entries]);
  const presentations = JSON.stringify(projection.people.map(({ id, status, title }) => ({ id, status, title })));
  const highlights = JSON.stringify(projection.people.filter(person => person.tasks.some(task => task.demandId === state.selectedDemandId && selectedIds.includes(task.nodeId))).map(person => person.id));
  const expanded = open && !focusMode;
  const sceneVisible = expanded && active && documentVisible && (standalone || available >= 360 + 220);
  const dockHeight = Math.min(height, Math.max(220, available - 360));
  const person = projection.people.find(person => person.id === actorId);

  useEffect(() => {
    const instance = new OfficeHost(DEMO_IDENTITIES, setActorId, next => { setIdentities(next); setActorId(current => next.some(identity => identity.id === current) ? current : next[0]?.id || ''); }, next => {
      const signature = JSON.stringify(next);
      if (signature !== feedbackSignature.current) { feedbackSignature.current = signature; setFeedback(next); }
    }, setMeeting);
    host.current = instance;
    const client = new OfficePresenceClient(snapshot => {
      setPresence(snapshot);
      instance.roster(snapshot.entries.map(entry => entry.identity));
      instance.presence(snapshot.entries);
      const reportSignature = JSON.stringify([snapshot.reports, snapshot.entries.map(entry => entry.identity)]);
      if (reportSignature !== reportsSignature.current) {
        reportsSignature.current = reportSignature;
        const roster = snapshot.entries.map(entry => entry.identity);
        const rejected = snapshot.reports.map(report => ({ report, result: applyBeingNodeReport(stateRef.current, report, roster) })).filter(item => item.result.code);
        setReportErrors(rejected.map(item => item.report.eventId + ': ' + item.result.code));
        reportsCallback.current?.(snapshot.reports, roster);
      }
    }, input => instance.receive(input), setError);
    void client.connect();
    void instance.scene.mount(canvas.current!).catch(reason => setError(String(reason)));
    const observer = new ResizeObserver(entries => setAvailable(entries[0].contentRect.height));
    if (root.current?.parentElement) observer.observe(root.current.parentElement);
    const visibility = () => setDocumentVisible(!document.hidden);
    document.addEventListener('visibilitychange', visibility);
    return () => { client.dispose(); observer.disconnect(); document.removeEventListener('visibilitychange', visibility); instance.dispose(); host.current = null; };
  }, []);
  useEffect(() => { host.current?.project(JSON.parse(presentations)); }, [presentations]);
  useEffect(() => { host.current?.scene.select(JSON.parse(highlights)); }, [highlights]);
  useEffect(() => { host.current?.setActive(sceneVisible); }, [sceneVisible]);
  useEffect(() => { host.current?.scene.setReduced(reduced); localStorage.setItem('starmap-office-reduced', String(reduced)); }, [reduced]);
  useEffect(() => { localStorage.setItem('starmap-office-open', String(open)); }, [open]);
  useEffect(() => { if (!expanded || !active) setStandalone(false); }, [expanded, active]);
  useEffect(() => { if (standalone) canvas.current?.parentElement?.focus(); }, [standalone]);

  const beginResize = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault(); event.currentTarget.setPointerCapture(event.pointerId);
    resize.current = { start: event.clientY, height };
  };
  const taskButton = (task: OfficeTask) => <button type="button" key={task.key} data-office-task={task.key} onClick={() => onNavigate(task.demandId, task.nodeId)}><span>{task.demandTitle} · {task.title}</span><small>{STATUS_MARKERS[task.status]}{task.reason && ' · ' + task.reason}{task.source && ' · 由 ' + task.source + ' 上报'}</small></button>;

  return <section ref={root} className="office-dock" aria-label="协作舱" tabIndex={-1} data-expanded={expanded} data-detached={standalone} onKeyDown={event => {
    event.stopPropagation();
    if (event.key === 'Delete' || ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase()))) event.preventDefault();
    if (standalone && event.key === 'Escape') { event.preventDefault(); setStandalone(false); root.current?.focus(); }
    if (standalone && event.key === 'Tab') {
      const controls = Array.from(root.current!.querySelectorAll<HTMLElement>('.office-body button:not(:disabled), .office-body input, .office-body summary')).filter(element => element.getClientRects().length);
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === canvas.current?.parentElement)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }} onKeyUp={event => event.stopPropagation()} onWheel={event => event.stopPropagation()} onPointerDown={event => event.stopPropagation()} onPointerMove={event => event.stopPropagation()} style={{ height: expanded && available >= 580 ? dockHeight : undefined }}>
    {expanded && available >= 580 && <div className="office-resize" role="separator" aria-label="调整协作舱高度" aria-orientation="horizontal" aria-valuemin={220} aria-valuemax={360} aria-valuenow={dockHeight} tabIndex={0} onPointerDown={beginResize} onPointerMove={event => { if (resize.current) setHeight(Math.min(360, Math.max(220, resize.current.height + resize.current.start - event.clientY))); }} onPointerUp={() => { resize.current = null; }} onPointerCancel={() => { resize.current = null; }} onKeyDown={event => { event.stopPropagation(); if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); setHeight(value => Math.min(360, Math.max(220, value + (event.key === 'ArrowUp' ? 10 : -10)))); } }} />}
    <header className="office-heading"><button type="button" aria-expanded={expanded} onClick={() => setOpen(value => !value)} disabled={focusMode}>{expanded ? '▾' : '▸'} 协作舱</button><span>{identities.length} 位伙伴 · {identities.filter(identity => identity.demo).length} 位演示</span><button type="button" className="office-review" disabled={!projection.reviews.length} onClick={() => { const task = projection.reviews[0]; if (task) onNavigate(task.demandId, task.nodeId); }}><span aria-hidden="true">◉</span> 待你审核 {projection.reviews.length} 项</button></header>
    <div className="office-body" hidden={!expanded || (available < 580 && !standalone)} role={standalone ? 'dialog' : undefined} aria-modal={standalone || undefined} aria-label={standalone ? '独立协作舱' : undefined} tabIndex={standalone ? -1 : undefined}>
      {standalone && <button type="button" className="office-detached-close" onClick={() => { setStandalone(false); root.current?.focus(); }}>关闭独立协作舱</button>}
      <div className="office-scene" ref={canvas} />
      <aside className="office-people" aria-label="人员与关联任务"><div className="office-person-tabs">{projection.people.map(item => <button type="button" key={item.id} data-office-actor={item.id} data-status={item.status} data-stale={presence.entries.some(entry => entry.identity.id === item.id && (entry.expired || entry.disconnected || entry.status === 'offline'))} data-highlighted={JSON.parse(highlights).includes(item.id)} aria-pressed={item.id === actorId} onClick={() => setActorId(item.id)}>{item.identity.name}<small>{item.identity.demo ? '演示 · ' : ''}{item.marker}</small></button>)}</div>
        <div className="office-task-list"><strong>{person?.identity.name} · {person?.identity.demo ? '演示' : 'Being'} · {person?.tasks.length || 0} 项</strong>{person?.tasks.map(taskButton)}<details><summary>未绑定任务 {projection.unbound.length} 项</summary>{projection.unbound.map(taskButton)}</details><details><summary>人类伙伴 · 待你审核 {projection.reviews.length} 项</summary>{projection.reviews.map(taskButton)}</details></div>
        <div className="office-activity-feedback" aria-live="polite">{reportErrors.slice(-2).map(item => <div key={item}>节点上报未应用 · {item}</div>)}{feedback.slice(-2).map(item => <div key={item.eventId + item.status}>{item.eventId} · {item.status}{item.code && ' · ' + item.code}</div>)}</div>
        {meeting && <div className="office-meeting" data-meeting-phase={meeting.phase} aria-live="polite"><strong>白板协作 · {{ arriving: '等待到场', active: '讨论中', waiting: '等待参与者', paused: '画面暂停 · 会话保留', ending: '收尾中', ended: '已结束' }[meeting.phase]}</strong><div>{meeting.summary}</div>{meeting.error && <div>{meeting.error.eventId} · {meeting.error.code}</div>}{meeting.participants.map(member => <div key={member.id} data-meeting-member={member.id} data-member-state={member.state}>{identities.find(identity => identity.id === member.id)?.name || member.id} · {{ waiting: '排队', arriving: '前往白板', present: '已到场', leaving: '离场收尾', returning: '返回工位', left: '已离开', failed: '未能到场' }[member.state]}{member.code && ' · ' + member.code}</div>)}</div>}
        <label className="office-reduced"><input type="checkbox" checked={reduced} onChange={event => setReduced(event.target.checked)} />减少动态效果</label>{error && <p role="status">场景暂不可用，任务列表可继续使用：{error}</p>}
      </aside>
    </div>
    {expanded && available > 0 && available < 580 && <div className="office-compact"><button type="button" onClick={() => setStandalone(true)}>打开独立协作舱</button><span>空间不足，已保留至少 360px 画布。</span></div>}
  </section>;
}
