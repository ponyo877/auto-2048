import { describe, it, expect } from 'vitest';
import { simulateMove, isGameOverSync } from '../board-moves';
import { setTile, boardToArray } from '../board';

describe('simulateMove', () => {
  it('left-merge of [2,2,0,0] produces [4,0,0,0] with reward 4', () => {
    let b = 0n;
    b = setTile(b, 0, 1);
    b = setTile(b, 1, 1);
    const { after, reward } = simulateMove(b, 3); // Left
    expect(boardToArray(after)[0]).toEqual([4, 0, 0, 0]);
    expect(reward).toBe(4);
  });

  it('right-merge of [2,2,2,2] produces [0,0,4,4] with reward 8', () => {
    let b = 0n;
    for (let i = 0; i < 4; i++) b = setTile(b, i, 1);
    const { after, reward } = simulateMove(b, 1); // Right
    expect(boardToArray(after)[0]).toEqual([0, 0, 4, 4]);
    expect(reward).toBe(8);
  });

  it('up move stacks column', () => {
    let b = 0n;
    b = setTile(b, 4, 1);
    b = setTile(b, 8, 1);
    const { after } = simulateMove(b, 0); // Up
    expect(boardToArray(after).map((r) => r[0])).toEqual([4, 0, 0, 0]);
  });

  it('returns same board when no move possible', () => {
    let b = 0n;
    b = setTile(b, 0, 1);
    const { after, reward } = simulateMove(b, 3); // Left, but already at left
    expect(after).toBe(b);
    expect(reward).toBe(0);
  });

  it('does not merge already-different adjacent tiles', () => {
    let b = 0n;
    b = setTile(b, 0, 1);
    b = setTile(b, 1, 2);
    const { after, reward } = simulateMove(b, 3); // Left
    expect(boardToArray(after)[0]).toEqual([2, 4, 0, 0]);
    expect(reward).toBe(0);
  });
});

describe('isGameOverSync', () => {
  it('reports false on empty board', () => {
    expect(isGameOverSync(0n)).toBe(false);
  });

  it('reports false when at least one merge available', () => {
    let b = 0n;
    for (let i = 0; i < 16; i++) b = setTile(b, i, ((i % 4) + 1));
    expect(isGameOverSync(b)).toBe(false);
  });

  it('reports true on a fully blocked board', () => {
    /* checkerboard of 1 and 2 -> no merges, no empties */
    let b = 0n;
    for (let i = 0; i < 16; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const v = ((row + col) % 2 === 0) ? 1 : 2;
      const off = (row % 2) * 2;
      b = setTile(b, i, v + off);
    }
    expect(isGameOverSync(b)).toBe(true);
  });
});
