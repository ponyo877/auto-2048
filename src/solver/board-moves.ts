/**
 * Pure-JS reference implementation of 2048 board moves.
 * Used by MockSolver and shared as cross-check for the WASM port.
 *
 * Each function is intentionally small (cognitive complexity << 20)
 * to satisfy the project-wide gate.
 */
import { getTile, setTile, emptyPositions } from './board';
import type { Action, SimulateResult } from './types';

const ROW_INDICES: ReadonlyArray<readonly number[]> = [
  [0, 1, 2, 3],
  [4, 5, 6, 7],
  [8, 9, 10, 11],
  [12, 13, 14, 15],
];

const COL_INDICES: ReadonlyArray<readonly number[]> = [
  [0, 4, 8, 12],
  [1, 5, 9, 13],
  [2, 6, 10, 14],
  [3, 7, 11, 15],
];

function readLine(board: bigint, indices: readonly number[]): number[] {
  return indices.map((p) => getTile(board, p));
}

function writeLine(board: bigint, indices: readonly number[], line: number[]): bigint {
  let next = board;
  for (let i = 0; i < indices.length; i++) {
    next = setTile(next, indices[i], line[i]);
  }
  return next;
}

interface SlideOutcome {
  line: number[];
  reward: number;
}

/** Slide+merge a 4-cell line toward index 0. Returns the new line and reward gained. */
function slideTowardZero(line: number[]): SlideOutcome {
  const compact = line.filter((v) => v !== 0);
  let reward = 0;
  const merged: number[] = [];
  let i = 0;
  while (i < compact.length) {
    const cur = compact[i];
    const next = compact[i + 1];
    if (next === cur) {
      const upgraded = cur + 1;
      merged.push(upgraded);
      reward += 1 << upgraded;
      i += 2;
    } else {
      merged.push(cur);
      i += 1;
    }
  }
  while (merged.length < 4) merged.push(0);
  return { line: merged, reward };
}

interface DirectionMap {
  indices: ReadonlyArray<readonly number[]>;
  reverse: boolean;
}

const DIRECTION: Record<Action, DirectionMap> = {
  0: { indices: COL_INDICES, reverse: false }, // Up    : columns toward index 0
  1: { indices: ROW_INDICES, reverse: true },  // Right : rows reversed
  2: { indices: COL_INDICES, reverse: true },  // Down  : columns reversed
  3: { indices: ROW_INDICES, reverse: false }, // Left  : rows toward index 0
};

function applyDirection(line: number[], reverse: boolean): SlideOutcome {
  if (!reverse) return slideTowardZero(line);
  const reversed = [...line].reverse();
  const out = slideTowardZero(reversed);
  return { line: out.line.reverse(), reward: out.reward };
}

/** Apply an afterstate move (no random tile spawn). */
export function simulateMove(board: bigint, action: Action): SimulateResult {
  const dir = DIRECTION[action];
  let next = board;
  let total = 0;
  for (const idxs of dir.indices) {
    const line = readLine(next, idxs);
    const out = applyDirection(line, dir.reverse);
    total += out.reward;
    next = writeLine(next, idxs, out.line);
  }
  return { after: next, reward: total };
}

const ALL_ACTIONS: readonly Action[] = [0, 1, 2, 3];

/** Game over iff every cell is occupied AND no direction changes the board. */
export function isGameOverSync(board: bigint): boolean {
  if (emptyPositions(board).length > 0) return false;
  for (const a of ALL_ACTIONS) {
    if (simulateMove(board, a).after !== board) return false;
  }
  return true;
}
