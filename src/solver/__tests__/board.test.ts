import { describe, it, expect } from 'vitest';
import {
  getTile, setTile, tileValue, boardToArray,
  emptyPositions, maxTile, emptyBoard, boardToString, boardFromString,
} from '../board';

describe('board encoding', () => {
  it('roundtrips empty board', () => {
    expect(emptyBoard()).toBe(0n);
    expect(boardToString(emptyBoard())).toBe('0000000000000000');
  });

  it('sets and reads single tile', () => {
    const b = setTile(0n, 0, 1);
    expect(getTile(b, 0)).toBe(1);
    expect(tileValue(getTile(b, 0))).toBe(2);
  });

  it('sets multiple tiles independently', () => {
    let b = 0n;
    b = setTile(b, 0, 1);
    b = setTile(b, 5, 3);
    b = setTile(b, 15, 11);
    expect(getTile(b, 0)).toBe(1);
    expect(getTile(b, 5)).toBe(3);
    expect(getTile(b, 15)).toBe(11);
    expect(getTile(b, 4)).toBe(0);
  });

  it('overwrites a tile cleanly', () => {
    let b = setTile(0n, 7, 8);
    b = setTile(b, 7, 2);
    expect(getTile(b, 7)).toBe(2);
  });

  it('boardToArray returns 4x4 with correct decoded values', () => {
    let b = 0n;
    b = setTile(b, 0, 1);   // 2
    b = setTile(b, 5, 3);   // 8
    b = setTile(b, 15, 11); // 2048
    const grid = boardToArray(b);
    expect(grid.length).toBe(4);
    expect(grid[0][0]).toBe(2);
    expect(grid[1][1]).toBe(8);
    expect(grid[3][3]).toBe(2048);
    expect(grid[2][2]).toBe(0);
  });

  it('emptyPositions tracks 16 empties on empty board', () => {
    expect(emptyPositions(0n).length).toBe(16);
  });

  it('emptyPositions excludes occupied tiles', () => {
    const b = setTile(setTile(0n, 0, 1), 5, 2);
    const empties = emptyPositions(b);
    expect(empties.length).toBe(14);
    expect(empties.includes(0)).toBe(false);
    expect(empties.includes(5)).toBe(false);
  });

  it('maxTile returns largest tile value', () => {
    let b = 0n;
    b = setTile(b, 1, 4);
    b = setTile(b, 8, 7);
    b = setTile(b, 14, 2);
    expect(maxTile(b)).toBe(128);
  });

  it('roundtrips through string', () => {
    const original = setTile(setTile(0n, 0, 1), 15, 11);
    expect(boardFromString(boardToString(original))).toBe(original);
  });

  it('tileValue maps 0 to 0', () => {
    expect(tileValue(0)).toBe(0);
    expect(tileValue(1)).toBe(2);
    expect(tileValue(11)).toBe(2048);
  });
});
