import { describe, it, expect } from 'vitest';
import { spawnTile, spawnInitialBoard } from '../spawn';
import { emptyPositions } from '../board';

describe('spawnTile', () => {
  it('adds exactly one tile to an empty board', () => {
    const b = spawnTile(0n, 1);
    expect(emptyPositions(b).length).toBe(15);
  });

  it('is deterministic with the same seed', () => {
    const a = spawnTile(0n, 12345);
    const b = spawnTile(0n, 12345);
    expect(a).toBe(b);
  });

  it('differs for different seeds (probabilistic)', () => {
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    const results = new Set(seeds.map((s) => spawnTile(0n, s).toString()));
    expect(results.size).toBeGreaterThan(1);
  });

  it('returns the same board when no empty cells remain', () => {
    let full = 0n;
    for (let i = 0; i < 16; i++) {
      const shift = BigInt(i * 4);
      full |= 1n << shift;
    }
    expect(spawnTile(full, 1)).toBe(full);
  });
});

describe('spawnInitialBoard', () => {
  it('seeds two tiles', () => {
    const b = spawnInitialBoard(42);
    expect(emptyPositions(b).length).toBe(14);
  });
});
