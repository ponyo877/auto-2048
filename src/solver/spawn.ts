/**
 * Random tile spawn logic.
 * Standard 2048 rules: 90% chance of a "2" (logValue=1), 10% chance of a "4" (logValue=2),
 * placed at a uniformly random empty cell.
 */
import { emptyPositions, setTile } from './board';

/** Mulberry32 — solid quality from any 32-bit seed including small ones. */
function mulberry32(state: number): { value: number; next: number } {
  let t = (state + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return { value: ((t ^ (t >>> 14)) >>> 0) / 0x1_0000_0000, next: state + 0x6d2b79f5 };
}

interface RngState { s: number; }

function nextRandom(rng: RngState): number {
  const { value, next } = mulberry32(rng.s);
  rng.s = next;
  return value;
}

function pickEmpty(empties: number[], r: number): number {
  return empties[Math.floor(r * empties.length)];
}

function pickValue(r: number): number {
  return r < 0.9 ? 1 : 2;
}

export function spawnTile(board: bigint, seed?: number): bigint {
  const empties = emptyPositions(board);
  if (empties.length === 0) return board;

  if (seed === undefined || seed === 0) {
    const pos = empties[Math.floor(Math.random() * empties.length)];
    return setTile(board, pos, Math.random() < 0.9 ? 1 : 2);
  }

  const rng: RngState = { s: seed | 0 || 1 };
  const pos = pickEmpty(empties, nextRandom(rng));
  const value = pickValue(nextRandom(rng));
  return setTile(board, pos, value);
}

export function spawnInitialBoard(seed?: number): bigint {
  return spawnTile(spawnTile(0n, seed), seed === undefined ? undefined : seed + 1);
}
