import { useEffect, useRef } from "react";

/**
 * Paints a percentage into an element's width on every animation frame.
 *
 * The playback position is a pure function of time, but the state behind it only refreshes about
 * once a second, so a bar rendered from state steps forward in bursts. Reading the percentage per
 * frame instead makes it glide, and because nothing is transitioned a seek still jumps instantly.
 */
export function useProgressFill<T extends HTMLElement>(active: boolean, read: () => number) {
  const ref = useRef<T | null>(null);
  const readRef = useRef(read);
  readRef.current = read;

  useEffect(() => {
    if (!active) return;
    let frame = 0;
    const paint = () => {
      const node = ref.current;
      if (node) {
        const value = readRef.current();
        node.style.width = `${value < 0 ? 0 : value > 100 ? 100 : value}%`;
      }
      frame = window.requestAnimationFrame(paint);
    };
    frame = window.requestAnimationFrame(paint);
    return () => window.cancelAnimationFrame(frame);
  }, [active]);

  return ref;
}
