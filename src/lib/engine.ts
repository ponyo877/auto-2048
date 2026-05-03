/**
 * Tile-tracking 2048 engine. Each cell holds a stable id so React can
 * animate slides and merges by transforming the same node from old to
 * new (row, col). Ported from design/engine.js with TypeScript types
 * and split into small functions to keep cognitive complexity low.
 */

export const SIZE = 4;

export interface Tile {
  id: number;
  value: number;
  /** previous (row, col) right before the slide that produced this state. */
  fromRow?: number;
  fromCol?: number;
  /** the two ids that combined into this one this turn. */
  mergedFrom?: [number, number];
  justMerged?: boolean;
  justSpawned?: boolean;
}

export type Cell = Tile | null;
export type Grid = Cell[][];
export type Direction = 0 | 1 | 2 | 3; // up, right, down, left

let __id = 1;
export function nextId(): number { return __id++; }

export function emptyBoard(): Grid {
  return Array.from({ length: SIZE }, () => Array<Cell>(SIZE).fill(null));
}

function shallowClone(t: Tile): Tile {
  return { id: t.id, value: t.value };
}

export function clone(board: Grid): Grid {
  return board.map((row) => row.map((c) => (c ? shallowClone(c) : null)));
}

export function emptyCells(board: Grid): Array<[number, number]> {
  const cells: Array<[number, number]> = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (!board[r][c]) cells.push([r, c]);
    }
  }
  return cells;
}

export interface SpawnOptions {
  /** when set, deterministic value+position via this seed */
  seed?: number;
}

function pickFour(rng: () => number): boolean {
  return rng() < 0.1;
}

export function spawnTile(board: Grid, opts: SpawnOptions = {}): Grid {
  const cells = emptyCells(board);
  if (cells.length === 0) return board;
  const rng = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;
  const idx = Math.floor(rng() * cells.length);
  const [r, c] = cells[idx];
  const value = pickFour(rng) ? 4 : 2;
  const next = clone(board);
  next[r][c] = { id: nextId(), value, justSpawned: true };
  return next;
}

function mulberry32(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000;
  };
}

export function newGame(): Grid {
  let b = emptyBoard();
  b = spawnTile(b);
  b = spawnTile(b);
  return b;
}

/** Rotate clockwise `times` quarter-turns. */
function rotate(board: Grid, times: number): Grid {
  let b = board;
  for (let k = 0; k < times; k++) {
    const n = emptyBoard();
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        n[c][SIZE - 1 - r] = b[r][c];
      }
    }
    b = n;
  }
  return b;
}

/** Pre/post rotation counts for a given direction so we always slide left. */
function dirRotations(dir: Direction): [number, number] {
  if (dir === 3) return [0, 0];
  if (dir === 0) return [3, 1];
  if (dir === 1) return [2, 2];
  if (dir === 2) return [1, 3];
  throw new Error('bad dir');
}

interface SlideOutcome {
  board: Grid;
  moved: boolean;
  gainedScore: number;
  mergedValues: number[];
}

function compactRow(row: Tile[]): { row: Tile[]; reward: number; mergedVals: number[] } {
  const out: Tile[] = [];
  let reward = 0;
  const mergedVals: number[] = [];
  let i = 0;
  while (i < row.length) {
    const cur = row[i];
    const nxt = row[i + 1];
    if (nxt && cur.value === nxt.value) {
      const newVal = cur.value * 2;
      out.push({
        id: cur.id,
        value: newVal,
        mergedFrom: [cur.id, nxt.id],
        justMerged: true,
      });
      reward += newVal;
      mergedVals.push(newVal);
      i += 2;
    } else {
      out.push({ id: cur.id, value: cur.value });
      i += 1;
    }
  }
  return { row: out, reward, mergedVals };
}

function slideLeft(board: Grid): SlideOutcome {
  const next = emptyBoard();
  let moved = false;
  let gained = 0;
  const merged: number[] = [];
  for (let r = 0; r < SIZE; r++) {
    const row = board[r].filter(Boolean) as Tile[];
    const { row: out, reward, mergedVals } = compactRow(row);
    gained += reward;
    for (const v of mergedVals) merged.push(v);
    for (let c = 0; c < SIZE; c++) next[r][c] = c < out.length ? out[c] : null;
    for (let c = 0; c < SIZE; c++) {
      const before = board[r][c];
      const after = next[r][c];
      if ((before?.id ?? null) !== (after?.id ?? null)) moved = true;
    }
  }
  return { board: next, moved, gainedScore: gained, mergedValues: merged };
}

export interface MoveResult {
  board: Grid;
  moved: boolean;
  gainedScore: number;
  mergedValues: number[];
}

export function move(board: Grid, dir: Direction): MoveResult {
  const [pre, post] = dirRotations(dir);
  const rotated = rotate(board, pre);
  const slid = slideLeft(rotated);
  const restored = rotate(slid.board, post);
  return { board: restored, moved: slid.moved, gainedScore: slid.gainedScore, mergedValues: slid.mergedValues };
}

const ALL_DIRS: Direction[] = [0, 1, 2, 3];

export function canMove(board: Grid): boolean {
  if (emptyCells(board).length > 0) return true;
  for (const d of ALL_DIRS) {
    if (move(board, d).moved) return true;
  }
  return false;
}

export function maxValue(board: Grid): number {
  let m = 0;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c]?.value ?? 0;
      if (v > m) m = v;
    }
  }
  return m;
}

/** Plain numeric grid for the AI (no IDs). */
export function toGrid(board: Grid): number[][] {
  return board.map((row) => row.map((c) => c?.value ?? 0));
}

/** Convert tile grid to bigint board format for the WASM solver. */
export function gridToBigint(board: Grid): bigint {
  let b = 0n;
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = board[r][c]?.value ?? 0;
      if (v > 0) {
        const log2 = Math.round(Math.log2(v));
        b |= BigInt(log2) << BigInt((r * SIZE + c) * 4);
      }
    }
  }
  return b;
}
