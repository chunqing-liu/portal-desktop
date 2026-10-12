import { useState } from 'react';
import { evaluate, type UINode, type Value } from './runtime';
export const displayValue = (value: Value) => value === null ? '—' : String(value);
export function DataTable({ node, values }: { node: UINode; values: Record<string, Value> }) {
  const [page, setPage] = useState(0);
  const [sort, setSort] = useState<{ column: number; direction: number } | null>(null);
  const rows = node.rows!.map(r => r.map(v => evaluate(v, values)));
  if (sort) rows.sort((a, b) => {
    const x = a[sort.column], y = b[sort.column];
    return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * sort.direction;
  });
  const pages = Math.max(1, Math.ceil(rows.length / 10)), current = Math.min(page, pages - 1);
  return <section className="iui-data"><div className="iui-table"><table><caption>{node.label}</caption><thead><tr>{node.columns!.map((c, i) => <th key={i} scope="col" aria-sort={sort?.column === i ? sort.direction === 1 ? 'ascending' : 'descending' : 'none'}><button type="button" onClick={() => { setSort({ column: i, direction: sort?.column === i ? -sort.direction : 1 }); setPage(0); }}>{c}<span aria-hidden="true"> ↕</span></button></th>)}</tr></thead><tbody>{rows.slice(current * 10, current * 10 + 10).map((r, i) => <tr key={i}>{r.map((v, j) => <td key={j}>{displayValue(v)}</td>)}</tr>)}</tbody></table></div>{pages > 1 && <nav className="iui-pagination" aria-label={`${node.label || '表格'}分页`}><span>{rows.length} 项 · {current + 1} / {pages}</span><button type="button" disabled={!current} onClick={() => setPage(current - 1)}>上一页</button><button type="button" disabled={current + 1 >= pages} onClick={() => setPage(current + 1)}>下一页</button></nav>}</section>;
}
export function DataChart({ node, values }: { node: UINode; values: Record<string, Value> }) {
  const rows = node.rows!.map(r => ({ label: displayValue(evaluate(r[0], values)), value: evaluate(r[1], values) }));
  const numbers = rows.map(r => typeof r.value === 'number' ? r.value : 0);
  const lo = Math.min(0, ...numbers), hi = Math.max(1, ...numbers), span = hi - lo;
  const points = rows.map((_, i) => `${36 + i / Math.max(1, rows.length - 1) * 528},${190 - (numbers[i] - lo) / span * 160}`).join(' ');
  return <figure className="iui-chart"><figcaption>{node.label}</figcaption>{node.variant === 'line' ? <>
    <svg viewBox="0 0 600 230" role="img" aria-label={node.label || '趋势图'}><path d="M36 20V190H570" fill="none" stroke="var(--border)"/><text x="36" y="14" fontSize="12" fill="currentColor">{hi.toLocaleString()}</text><text x="6" y="194" fontSize="12" fill="currentColor">{lo.toLocaleString()}</text><polyline points={points} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinejoin="round"/>{rows.map((r, i) => <circle key={i} cx={36 + i / Math.max(1, rows.length - 1) * 528} cy={190 - (numbers[i] - lo) / span * 160} r="3" fill="var(--accent)"><title>{r.label}: {displayValue(r.value)}</title></circle>)}<text x="36" y="215" fontSize="12" fill="currentColor">{rows[0]?.label}</text><text x="566" y="215" textAnchor="end" fontSize="12" fill="currentColor">{rows.at(-1)?.label}</text></svg>
    <details><summary>查看图表数据</summary><DataTable node={node} values={values} /></details>
  </> : rows.map((r, i) => <div key={i} className="iui-bar-row"><span>{r.label}</span><div className="iui-bar-track"><span className="iui-zero" style={{ left: `${-lo / span * 100}%` }} /><div className="iui-bar" style={{ marginLeft: `${(Math.min(0, numbers[i]) - lo) / span * 100}%`, width: `${Math.abs(numbers[i]) / span * 100}%` }} /></div><output>{displayValue(r.value)}</output></div>)}</figure>;
}
export function Diagram({ node, selected, onSelect, explode = 0, onExplode }: { node: UINode; selected: string; onSelect: (id: string) => void; explode?: number; onExplode?: (value: number) => void }) {
  const part = node.parts!.find(p => p.id === selected);
  const amount = Math.max(0, Math.min(1, explode));
  const groups = [undefined, ...node.parts!.map(p => p.id)];
  return <section className="iui-diagram">
    <div className="iui-diagram-stage"><svg viewBox={`0 0 ${node.width} ${node.height}`} role="group" aria-label={node.label || '交互图解'}>
      {groups.map(group => {
        const shapes = node.shapes!.filter(s => s.part === group);
        if (!shapes.length) return null;
        return <g key={group || 'background'} className={group ? 'iui-diagram-part' : undefined} opacity={part && group !== selected ? .16 : 1} role={group ? 'button' : undefined} tabIndex={group ? 0 : undefined} aria-label={node.parts!.find(p => p.id === group)?.label} aria-pressed={group ? selected === group : undefined} onClick={() => group && onSelect(group)} onKeyDown={e => { if (group && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onSelect(group); } }}>
          {shapes.map((s, i) => {
            const color = s.color === 'muted' ? 'var(--text-muted)' : s.color === 'text' ? 'var(--text)' : 'var(--accent)';
            const shape = s.type === 'circle' ? <circle cx={s.x} cy={s.y} r={s.r} /> : s.type === 'line' ? <line x1={s.x} y1={s.y} x2={s.x2} y2={s.y2} /> : s.type === 'rect' ? <rect x={s.x} y={s.y} width={s.width} height={s.height} rx="4" /> : s.type === 'path' ? <path d={s.d} /> : <text x={s.x} y={s.y} fill={color} stroke="none" fontSize="16">{s.text}</text>;
            return <g key={i} transform={`translate(${(s.dx || 0) * amount} ${(s.dy || 0) * amount})`} fill={s.fill === 'text' ? 'var(--text)' : s.fill === 'surface' ? 'var(--bg)' : 'none'} stroke={color} strokeWidth={s.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round">{shape}</g>;
          })}
        </g>;
      })}
    </svg></div>
    {node.explodeBind && <label className="iui-explode"><span>完整装配</span><input type="range" aria-label="拆解程度" min="0" max="1" step="0.01" value={amount} onChange={e => onExplode?.(e.target.valueAsNumber)} /><span>拆解结构</span></label>}
    {!!node.parts!.length && <><div className="iui-segments" role="group" aria-label={node.label || '选择部件'}><button type="button" aria-pressed={!part} onClick={() => onSelect('all')}>全部</button>{node.parts!.map(p => <button type="button" key={p.id} aria-pressed={p.id === selected} onClick={() => onSelect(p.id)}>{p.label}</button>)}</div>
    <aside className="iui-part-description" aria-live="polite"><h4>{part?.label || node.label || '探索结构'}</h4><p>{part?.description || (node.asset === 'bicycle' ? '车架承载重量，传动系统将踩踏变成前进的动力。点选部件，了解五个系统如何共同工作。' : '点选图中的部件或标签，查看它的作用与连接关系。')}</p></aside></>}
  </section>;
}
