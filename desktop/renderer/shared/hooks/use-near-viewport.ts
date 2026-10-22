import { useEffect, useRef, useState } from 'react';

/** Activate once near the scroll viewport; never unmount loaded content on scroll. */
export function useNearViewport<T extends HTMLElement>(immediate = false) {
  const ref = useRef<T>(null);
  const [entered, setEntered] = useState(immediate);
  const ready = immediate || entered;
  useEffect(() => {
    if (ready) { if (!entered) setEntered(true); return; }
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === 'undefined') { setEntered(true); return; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(entry => entry.isIntersecting)) { setEntered(true); observer.disconnect(); }
    }, { root: node.closest('#messages'), rootMargin: '800px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [ready, entered]);
  return { ref, ready };
}
