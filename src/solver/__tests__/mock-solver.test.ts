import { describe, it, expect } from 'vitest';
import { createMockSolver } from '../mock-solver';
import { setTile } from '../board';

describe('MockSolver', () => {
  const solver = createMockSolver({ network: '4x6patt' });

  it('returns a legal action on a fresh board', async () => {
    let b = 0n;
    b = setTile(b, 0, 1);
    b = setTile(b, 5, 1);
    const a = await solver.step(b, 1);
    expect(a).toBeGreaterThanOrEqual(-1);
    expect(a).toBeLessThanOrEqual(3);
  });

  it('returns -1 on a fully blocked board', async () => {
    let full = 0n;
    for (let i = 0; i < 16; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const v = (row + col) % 2 === 0 ? 1 : 2;
      const off = (row % 2) * 2;
      full = setTile(full, i, v + off);
    }
    expect(await solver.step(full, 1)).toBe(-1);
  });

  it('simulateMove agrees with sync helper', async () => {
    let b = 0n;
    b = setTile(b, 0, 1);
    b = setTile(b, 1, 1);
    const r = await solver.simulateMove(b, 3);
    expect(r.reward).toBe(4);
  });
});
