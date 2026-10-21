import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Mouse-drag scrolling for horizontal rails.
 *
 * Touch already swipes natively; pointer devices do not. This adds grab-and-
 * throw with light inertia so the rails feel physical on desktop, and it
 * swallows the click that ends a drag so a thrown card never navigates.
 */
export function useDragRail() {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);
  const drag = useRef({ active: false, startX: 0, startLeft: 0, moved: 0, x: 0, vx: 0, t: 0 });
  const [edges, setEdges] = useState({ start: true, end: true });
  const [grabbing, setGrabbing] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    });
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    el.addEventListener('scroll', measure, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
      cancelAnimationFrame(raf.current);
    };
  }, [measure]);

  const glide = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    const step = () => {
      drag.current.vx *= 0.94;
      if (Math.abs(drag.current.vx) < 0.4) return;
      el.scrollLeft -= drag.current.vx;
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const el = ref.current;
    if (!el) return;
    cancelAnimationFrame(raf.current);
    drag.current = { active: true, startX: e.clientX, startLeft: el.scrollLeft, moved: 0, x: e.clientX, vx: 0, t: performance.now() };
    setGrabbing(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const el = ref.current;
    const d = drag.current;
    if (!el || !d.active) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 3 && !el.hasPointerCapture(e.pointerId)) el.setPointerCapture(e.pointerId);
    d.moved = Math.max(d.moved, Math.abs(dx));
    el.scrollLeft = d.startLeft - dx;
    const now = performance.now();
    d.vx = ((e.clientX - d.x) / Math.max(now - d.t, 1)) * 16;
    d.x = e.clientX;
    d.t = now;
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d.active) return;
    d.active = false;
    setGrabbing(false);
    if (ref.current?.hasPointerCapture(e.pointerId)) ref.current.releasePointerCapture(e.pointerId);
    if (Math.abs(d.vx) > 1) glide();
    window.setTimeout(() => { d.moved = 0; }, 0);
  };

  const onClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (drag.current.moved > 8) {
      e.preventDefault();
      e.stopPropagation();
      drag.current.moved = 0;
    }
  };

  const nudge = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 240), behavior: 'smooth' });
  };

  return { ref, edges, grabbing, handlers: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onClickCapture }, nudge };
}
