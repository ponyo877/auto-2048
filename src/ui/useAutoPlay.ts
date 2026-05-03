import { useEffect } from 'react';
import type { Direction, Grid } from '@/lib/engine';
import { gridToBigint } from '@/lib/engine';
import type { Solver } from '@/solver';

interface Args {
  solver: Solver | null;
  playing: boolean;
  gameOver: boolean;
  speedMs: number;
  aiLevel: number;
  boardRef: React.MutableRefObject<Grid>;
  doMove: (dir: Direction, fromAI: boolean) => boolean;
  onAiThinkingChange: (v: boolean) => void;
  onPlayingChange: (v: boolean) => void;
  onGameOver: () => void;
}

/**
 * Yield path that survives Chrome's hidden-tab setTimeout throttling.
 */
function scheduleNext(delayMs: number, fn: () => void): () => void {
  if (delayMs >= 16) {
    const id = setTimeout(fn, delayMs);
    return () => clearTimeout(id);
  }
  const ch = new MessageChannel();
  let cancelled = false;
  ch.port1.onmessage = () => { if (!cancelled) fn(); };
  ch.port2.postMessage(null);
  return () => { cancelled = true; ch.port1.close(); ch.port2.close(); };
}

export function useAutoPlay(a: Args) {
  useEffect(() => {
    const { solver, playing, gameOver } = a;
    if (!playing || !solver) { a.onAiThinkingChange(false); return; }
    if (gameOver) { a.onPlayingChange(false); return; }
    a.onAiThinkingChange(true);

    let cancelled = false;
    let cancelTimer: (() => void) | undefined;

    const tick = async () => {
      if (cancelled) return;
      try {
        const action = await solver.step(gridToBigint(a.boardRef.current), a.aiLevel);
        if (cancelled) return;
        if (action < 0) { a.onPlayingChange(false); a.onGameOver(); return; }
        a.doMove(action as Direction, true);
        cancelTimer = scheduleNext(a.speedMs, tick);
      } catch (err) {
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn('[autoplay] step failed:', err);
          a.onPlayingChange(false);
        }
      }
    };
    cancelTimer = scheduleNext(Math.min(a.speedMs, 200), tick);
    return () => {
      cancelled = true;
      a.onAiThinkingChange(false);
      if (cancelTimer) cancelTimer();
    };
    // eslint-disable-next-line
  }, [a.solver, a.playing, a.gameOver, a.speedMs, a.aiLevel]);
}
