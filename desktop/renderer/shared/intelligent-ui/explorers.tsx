import { useId, type ReactNode } from 'react';
import { evaluate, type UINode, type Value } from './runtime';
import { displayValue } from './visuals';

export function Tabs({ node, selected, onSelect, render }: { node: UINode; selected: string; onSelect: (id: string) => void; render: (node: UINode) => ReactNode }) {
  const prefix = useId(), children = node.children || [];
  return <section className="iui-tabs"><div role="tablist" aria-label={node.label || '内容分类'} className="iui-segments">{children.map((child, index) => <button key={child.id} id={`${prefix}-${child.id}`} role="tab" type="button" tabIndex={selected === child.id ? 0 : -1} aria-selected={selected === child.id} aria-controls={`${prefix}-panel-${child.id}`} onClick={() => onSelect(child.id)} onKeyDown={e => {
    const next = e.key === 'Home' ? 0 : e.key === 'End' ? children.length - 1 : e.key === 'ArrowRight' ? (index + 1) % children.length : e.key === 'ArrowLeft' ? (index + children.length - 1) % children.length : -1;
    if (next >= 0) { e.preventDefault(); onSelect(children[next].id); (e.currentTarget.parentElement?.children[next] as HTMLElement)?.focus(); }
  }}>{child.label}</button>)}</div>{children.map(child => <div key={child.id} role="tabpanel" id={`${prefix}-panel-${child.id}`} aria-labelledby={`${prefix}-${child.id}`} hidden={selected !== child.id}>{render(child)}</div>)}</section>;
}

const colors = ['#4f91ca', '#3a9b74', '#b880c5', '#d49b44', '#d47870', '#7183bd', '#739d99', '#a49477'];
export function Breakdown({ node, values }: { node: UINode; values: Record<string, Value> }) {
  const rows = node.rows!.map(row => ({ label: displayValue(evaluate(row[0], values)), value: evaluate(row[1], values) }));
  const valid = rows.every(row => typeof row.value === 'number' && row.value >= 0);
  const total = valid ? rows.reduce((sum, row) => sum + Number(row.value), 0) : 0;
  return <figure className="iui-breakdown"><figcaption>{node.label}</figcaption>{!valid || !Number.isFinite(total) ? <p role="status">组成比例需要有效的非负数值。</p> : <><div className="iui-breakdown-track" role="img" aria-label={rows.map(row => `${row.label}：${row.value}`).join('，')}>{rows.map((row, i) => <span key={i} style={{ width: `${total ? Number(row.value) / total * 100 : 0}%`, background: colors[i] }} />)}</div><dl>{rows.map((row, i) => <div key={i}><dt><i aria-hidden="true" style={{ background: colors[i] }} />{row.label}</dt><dd>{Number(row.value).toLocaleString(undefined, { maximumFractionDigits: 2 })}</dd></div>)}</dl></>}</figure>;
}
