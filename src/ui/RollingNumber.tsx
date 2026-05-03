import { useEffect, useRef, useState } from 'react';

const DURATION_MS = 380;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function RollingNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  /* Ref mirrors `display` so the animation effect can read the live value
   * without taking it as a dependency (which would restart the tween on
   * every animation frame). */
  const displayRef = useRef(value);
  displayRef.current = display;
  const startRef = useRef(performance.now());
  const rafRef = useRef(0);

  useEffect(() => {
    cancelAnimationFrame(rafRef.current);
    const from = displayRef.current;
    const to = value;
    startRef.current = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - startRef.current) / DURATION_MS);
      const e = easeOutCubic(t);
      setDisplay(Math.round(from + (to - from) * e));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    /* Fallback: requestAnimationFrame is paused in background/hidden tabs.
     * Ensure display still converges to `value` so SCORE etc. stay
     * accurate when the user briefly switches tabs. */
    const fallback = setTimeout(() => setDisplay(to), DURATION_MS + 16);
    return () => { cancelAnimationFrame(rafRef.current); clearTimeout(fallback); };
  }, [value]);

  return <>{display.toLocaleString()}</>;
}
