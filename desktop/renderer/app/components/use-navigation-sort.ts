import { useRef, useState, type PointerEvent } from "react";

/** Preview sorting with transforms; commit the DOM order only on release. */
export function useNavigationSort(keys: string[], commit: (keys: string[]) => void) {
  const [active, setActive] = useState(false);
  const suppressClick = useRef(false);
  const session = useRef<{
    pointer: number; y: number; from: number; to: number; started: boolean;
    nodes: HTMLElement[]; tops: number[]; keys: string[]; container: HTMLElement;
  } | null>(null);
  const finish = (cancel: boolean) => {
    const drag = session.current;
    if (!drag) return;
    session.current = null;
    drag.nodes.forEach(node => { node.style.transform = ""; node.classList.remove("rail-sorting-item"); });
    drag.container.style.removeProperty("--sort-line");
    setActive(false);
    if (drag.container.hasPointerCapture(drag.pointer)) drag.container.releasePointerCapture(drag.pointer);
    if (drag.started) {
      suppressClick.current = true;
      // Pointerup's synthetic click is dispatched before the next task.
      setTimeout(() => { suppressClick.current = false; }, 0);
      if (!cancel && drag.from !== drag.to) {
        const next = [...drag.keys];
        next.splice(drag.to, 0, next.splice(drag.from, 1)[0]);
        commit(next);
      }
    }
  };
  return {
    'data-sorting': active || undefined,
    onPointerDown(event: PointerEvent<HTMLDivElement>) {
      if (event.button !== 0 || session.current) return;
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-navigation-key]');
      if (!button || button.matches(':disabled')) return;
      const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('[data-navigation-key]'));
      session.current = { pointer: event.pointerId, y: event.clientY, from: nodes.indexOf(button), to: nodes.indexOf(button),
        started: false, nodes, tops: nodes.map(node => node.offsetTop), keys: [...keys], container: event.currentTarget };
    },
    onPointerMove(event: PointerEvent<HTMLDivElement>) {
      const drag = session.current;
      if (!drag || event.pointerId !== drag.pointer) return;
      if (!drag.started && Math.abs(event.clientY - drag.y) < 5) return;
      if (!drag.started) {
        drag.started = true;
        drag.container.setPointerCapture(event.pointerId);
        drag.nodes[drag.from].classList.add('rail-sorting-item');
        setActive(true);
      }
      event.preventDefault();
      const delta = Math.max(drag.tops[0] - drag.tops[drag.from], Math.min(drag.tops.at(-1)! - drag.tops[drag.from], event.clientY - drag.y));
      const position = drag.tops[drag.from] + delta;
      drag.to = drag.tops.reduce((best, top, i) => Math.abs(top - position) < Math.abs(drag.tops[best] - position) ? i : best, drag.from);
      drag.container.style.setProperty("--sort-line", `${drag.tops[drag.to] - 3}px`);
      drag.nodes.forEach((node, i) => {
        let shift = 0;
        if (i === drag.from) shift = delta;
        else if (drag.from < drag.to && i > drag.from && i <= drag.to) shift = drag.tops[i - 1] - drag.tops[i];
        else if (drag.from > drag.to && i >= drag.to && i < drag.from) shift = drag.tops[i + 1] - drag.tops[i];
        node.style.transform = i === drag.from ? `translateY(${shift}px) scale(.98)` : `translateY(${shift}px)`;
      });
    },
    onPointerUp: () => finish(false),
    onPointerCancel: () => finish(true),
    onLostPointerCapture: () => finish(true),
    onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) { if (event.key === 'Escape' && session.current) { event.preventDefault(); finish(true); } },
    onClickCapture(event: React.MouseEvent<HTMLDivElement>) { if (suppressClick.current) { event.preventDefault(); event.stopPropagation(); } },
  };
}
