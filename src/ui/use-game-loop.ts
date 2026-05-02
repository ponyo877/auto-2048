import { useEffect, useRef } from 'react';
import type { Action, Solver } from '@/solver';

export interface LoopHandlers {
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

async function runOneStep(solver: Solver, board: bigint, depth: number): Promise<StepResult | null> {
  const action = await solver.step(board, depth);
  if (action < 0) return null;
  const { after, reward } = await solver.simulateMove(board, action as Action);
  const next = await solver.spawnTile(after);
  return { next, action: action as Action, reward };
}

export function useGameLoop({ solver, isPlaying, speed, getBoard, getDepth, onAdvance, onGameOver, onError }: Args) {
  const cancelledRef = useRef(false);

  useEffect(() => {
    if (!isPlaying || !solver) return;
    cancelledRef.current = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      if (cancelledRef.current) return;
      try {
        const result = await runOneStep(solver, getBoard(), getDepth());
        if (cancelledRef.current) return;
        if (!result) { onGameOver(); return; }
        onAdvance(result.next, result.action, result.reward);
        timer = setTimeout(tick, speed);
      } catch (err) {
        if (!cancelledRef.current) onError(err);
      }
    };

    timer = setTimeout(tick, speed);
    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [solver, isPlaying, speed, getBoard, getDepth, onAdvance, onGameOver, onError]);
}
