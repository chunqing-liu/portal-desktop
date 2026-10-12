import { useState } from 'react';
import type { UINode, Value } from './runtime';

/** Keep useful captions when an optional remote asset fails; never show a broken image icon. */
export function ContentImage({ src, label, caption }: { src: string; label?: string; caption?: string }) {
  const [failed, setFailed] = useState<string>();
  const unavailable = failed === src;
  return <figure className={`iui-image${unavailable ? ' iui-image-unavailable' : ''}`}>
    {!unavailable && <img src={src} alt={label || ''} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(src)} />}
    {(caption || unavailable && label) && <figcaption>{caption || label}{unavailable && <span className="iui-image-note"> · 图片暂不可用</span>}</figcaption>}
  </figure>;
}

export function Checklist({ node, values, onChange }: { node: UINode; values: Record<string, Value>; onChange: (key: string, value: Value) => void }) {
  const items = node.items!;
  const checkable = node.checkable !== false;
  const done = items.filter(item => item.bind && values[item.bind]).length;
  return <section className={`iui-timeline${checkable ? ' iui-checklist' : ''}`}>
    <div className="iui-checklist-heading">{node.label && <h4>{node.label}</h4>}{checkable && <span role="status" aria-live="polite">{done} / {items.length} 已完成</span>}</div>
    {checkable && <progress aria-label={`${node.label || '清单'}完成进度`} value={done} max={Math.max(1, items.length)} />}
    <ol>{items.map(item => {
      const checked = Boolean(item.bind && values[item.bind]);
      const content = <span className="iui-task-content">{item.time && <span className="iui-task-time">{item.time}</span>}<strong>{item.label}</strong>{item.description && <span className="iui-task-description">{item.description}</span>}</span>;
      return <li key={item.id} data-complete={checkable && checked}>
        {checkable && item.bind ? <label><input type="checkbox" aria-label={item.label} checked={checked} onChange={e => onChange(item.bind!, e.target.checked)} />{content}</label> : content}
      </li>;
    })}</ol>
  </section>;
}
