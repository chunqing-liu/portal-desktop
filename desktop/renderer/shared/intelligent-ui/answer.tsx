import { memo, useMemo } from 'react';
import { marked } from 'marked';
import { Markdown } from '../components/markdown';
import { IntelligentUI, type UIActions } from './view';
import type { PlaceTarget } from '../lib/navigation';

/** Artifacts are siblings of prose, never descendants of a Markdown bubble. */
export const IntelligentAnswer = memo(function IntelligentAnswer({ text, streaming, onPlace, ...actions }: UIActions & { text: string; streaming: boolean; onPlace?: (target: PlaceTarget) => void }) {
  const blocks = useMemo(() => {
    const result: { type: 'text' | 'ui'; content: string; id: string }[] = [];
    let uiCount = 0;
    for (const token of marked.lexer(text, { gfm: true, breaks: true })) {
      if (token.type === 'code' && token.lang?.trim().toLowerCase() === 'intelligent-ui') result.push({ type: 'ui', content: token.text, id: `ui-${uiCount++}` });
      else if (result.at(-1)?.type === 'text') result.at(-1)!.content += token.raw;
      else result.push({ type: 'text', content: token.raw, id: `text-${uiCount}` });
    }
    return result;
  }, [text]);
  return <div className="intelligent-answer">{blocks.map(block => block.type === 'ui' ? <IntelligentUI key={block.id} source={block.content} streaming={streaming} {...actions} storageKey={actions.storageKey ? `${actions.storageKey}:${block.id}` : undefined} /> : block.content.trim() ? <Markdown key={block.id} content={block.content} chat onPlace={onPlace} className="content" /> : null)}</div>;
}, (previous, next) => previous.text === next.text && previous.streaming === next.streaming && previous.storageKey === next.storageKey && previous.onPlace === next.onPlace);
