import { useCallback, useEffect, useLayoutEffect, useRef, type RefObject, type WheelEvent } from 'react';
import type { ChatItem, Message } from '../models/chat';

/** One controller handles stream growth and late artifact sizes; user scrolling always wins. */
export function useMessageScroll(items: ChatItem[], container: RefObject<HTMLDivElement | null>, elements: RefObject<Map<string, HTMLDivElement>>) {
  const scrollLock = useRef(true), anchor = useRef<string | null>(null), followedTurn = useRef<string | null>(null);
  const tracked = useRef<string | null>(null), accumulated = useRef(0), frame = useRef(0);
  const reading = useRef<{node:HTMLDivElement;offset:number;width:number;scrollTop:number}|null>(null);
  const remember = useCallback(()=>{
    const el=container.current;if(!el)return;
    if(reading.current && reading.current.width!==el.clientWidth)return;
    const top=el.getBoundingClientRect().top;
    for(const node of elements.current.values()){
      const rect=node.getBoundingClientRect();
      if(rect.bottom>top+1 && rect.top<top+el.clientHeight){reading.current={node,offset:rect.top-top,width:el.clientWidth,scrollTop:el.scrollTop};break;}
    }
  },[container,elements]);
  const currentItems = useRef(items); currentItems.current = items;
  const releaseAnchor = useCallback(() => {
    anchor.current = null;
    followedTurn.current = null;
    accumulated.current = 0;
    // Explicit navigation replaces the reading position too. Its highlight
    // render can run before the browser delivers the new scroll event; keeping
    // the old position here would immediately undo the user's jump.
    reading.current = null;
  }, []);
  const compensate = useCallback(() => {
    const el = container.current, saved = reading.current;
    if (!el || !saved || scrollLock.current || !saved.node.isConnected) return;
    // A scroll event may arrive either before or after ResizeObserver. Use
    // the content-space position so both paths preserve intentional scrolling.
    const shift = saved.node.getBoundingClientRect().top-el.getBoundingClientRect().top-saved.offset + el.scrollTop-saved.scrollTop;
    if (Math.abs(shift) > 0.5) el.scrollTop += shift;
    saved.width = el.clientWidth;
  }, [container]);
  const layout = useCallback(() => {
    const el = container.current;
    if (!el || !el.clientWidth) return;
    compensate();
    let reply: Message | undefined, turn: string | null = null;
    const list = currentItems.current;
    for (let i = list.length - 1; i >= 0; i--) {
      const item = list[i];
      // Historical streams can retain their flag after reconnect. Never anchor
      // an earlier turn when a newer user message is already visible.
      if (item.kind === 'message' && item.role === 'user') break;
      if (item.kind !== 'message' || item.role !== 'being' || !item.streaming) continue;
      reply = item;
      for (let j = i - 1; j >= 0; j--) { const user = list[j]; if (user.kind === 'message' && user.role === 'user') { turn = user.turnId || user.id; break; } }
      turn ??= item.id; break;
    }
    if (reply && tracked.current !== reply.id) { tracked.current = reply.id; if (scrollLock.current || followedTurn.current === turn) followedTurn.current = turn; }
    if (anchor.current && (!reply || reply.id !== anchor.current)) { anchor.current = null; accumulated.current = 0; }
    // An anchored reply is a reading position, not a repeated scroll-to-top instruction.
    if (anchor.current) { remember(); return; }
    if (reply && followedTurn.current === turn) {
      const node = elements.current.get(reply.id);
      if (node) {
        const offset = node.getBoundingClientRect().top - el.getBoundingClientRect().top;
        const bottom = Math.max(0, el.scrollHeight - el.clientHeight);
        if (offset + el.scrollTop - bottom < 20) { anchor.current = reply.id; scrollLock.current = false; el.scrollTop += offset - 20; remember(); return; }
      }
    }
    if (scrollLock.current) el.scrollTop = el.scrollHeight;
    remember();
  }, [container, elements, remember, compensate]);
  const schedule = useCallback(() => { if (!frame.current) frame.current = requestAnimationFrame(() => { frame.current = 0; layout(); }); }, [layout]);
  // Content growth is handled by ResizeObserver before paint. Draft/status
  // renders do not need another synchronous geometry scan of every message.
  const structure = items.map(item => item.id).join('\u0000');
  useLayoutEffect(layout, [structure, layout]);
  useEffect(() => {
    const el = container.current;
    if (!el) return;
    // ResizeObserver runs before paint: compensate image/layout growth immediately.
    const observer = new ResizeObserver(layout);
    const observed = new Set<Element>();
    const observe = () => {
      observer.observe(el);
      for (const child of observed) if (child.parentElement !== el) { observer.unobserve(child); observed.delete(child); }
      for (const child of el.children) if (!observed.has(child)) { observed.add(child); observer.observe(child); }
      schedule();
    };
    const mutation = new MutationObserver(observe);
    mutation.observe(el, { childList: true }); observe();
    const keyboard = (event: KeyboardEvent) => {
      if (['PageDown','PageUp','Home','End','ArrowDown','ArrowUp',' '].includes(event.key) && !(event.target as HTMLElement).closest('input,textarea,select,button')) { releaseAnchor(); scrollLock.current = false; remember(); }
    };
    el.addEventListener('keydown', keyboard);
    return () => { observer.disconnect(); mutation.disconnect(); el.removeEventListener('keydown', keyboard); cancelAnimationFrame(frame.current); frame.current = 0; };
  }, [container, schedule, layout, releaseAnchor, remember]);
  return {
    scrollLock, releaseAnchor,
    onWheel(event: WheelEvent) {
      if (anchor.current) { accumulated.current += Math.abs(event.deltaY); if (accumulated.current <= 30) return; }
      releaseAnchor(); scrollLock.current = false; remember();
    },
    onTouchMove() { releaseAnchor(); scrollLock.current = false; remember(); },
    onScroll() { compensate(); remember(); const el = container.current; if (el && el.clientWidth && el.scrollHeight - el.scrollTop - el.clientHeight <= 2) scrollLock.current = true; },
  };
}
