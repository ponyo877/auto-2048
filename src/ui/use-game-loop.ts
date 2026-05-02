import { useEffect, useRef } from 'react';
import type { Action, Solver } from '@/solver';

export interface LoopHandlers {
  /** Read the current board ONCE at loop start; subsequent iterations use the
   *  result chained inside the loop instead of re-reading React state, so we
   *  don't miss steps when MessageChannel scheduling outpaces React commits. */
  getBoard: () => bigint;
  getDepth: () => number;
  onAdvance: (board: bigint, action: Action, reward: number) => void;
  onGameOver: () => void;
  onError: (err: unknown) => void;
}

interface Args extends LoopHandlers {
  solver: Solver | null;
  isPlaying: boolean;
  speed: number;
}

interface StepResult {
  next: bigint;
  action: Action;
  reward: number;
}

async function runOneStep(
  solver: Solver,
  board: bigint,
  depth: number,
  seed: number,
): Promise<StepResult | null> {
  const action = await solver.step(board, depth);
  if (action < 0) return null;
  const { after, reward } = await solver.simulateMove(board, action as Action);
  /* deterministic per-move seed: matches the Node bench harness so the
   * browser bot's trajectory is reproducible and not at the mercy of
   * libc std::rand() internal state in the WASM module */
  const next = await solver.spawnTile(after, seed | 0);
  return { next, action: action as Action, reward };
}

/** Yield path that survives Chrome's hidden-tab setTimeout throttling. */
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

export function useGameLoop({ solver, isPlaying, speed, getBoard, getDepth, onAdvance, onGameOver, onError }: Args) {
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isPlaying || !solver) return;
    cancelledRef.current = false;
    let cancelTimer: (() => void) | undefined;
    /* Loop-local copy of the board: the React commit may not have happened
     * yet between ticks (especially with speed=0 + MessageChannel), so reading
     * via getBoard() each tick can return a stale value. We initialise once
     * from React state, then advance using the simulator's own next state. */
    let liveBoard = getBoard();
    /* one-shot seed from page-launch time so each Play session uses a
     * different but reproducible spawn sequence */
    const baseSeed = ((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) | 0) || 1;
    let mvIdx = 0;

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const seed = (baseSeed * 37 + mvIdx) | 0;
        const result = await runOneStep(solver, liveBoard, getDepth(), seed);
        if (cancelledRef.current) return;
        if (!result) { onGameOver(); return; }
        liveBoard = result.next;
        mvIdx++;
        onAdvance(result.next, result.action, result.reward);
        cancelTimer = scheduleNext(speed, tick);
      } catch (err) {
        if (!cancelledRef.current) onError(err);
      }
    };

    cancelTimer = scheduleNext(speed, tick);
    return () => {
      cancelledRef.current = true;
      if (cancelTimer) cancelTimer();
    };
  }, [solver, isPlaying, speed, getBoard, getDepth, onAdvance, onGameOver, onError]);
}
