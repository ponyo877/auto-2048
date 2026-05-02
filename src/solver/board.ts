/**
 * Board encoding: a single bigint holds 16 tiles × 4 bits.
 * Each 4-bit nibble stores log2(tileValue); 0 means empty.
 * Position 0 is row 0 col 0; position 15 is row 3 col 3 (row-major).
 */

const NIBBLE = 0xFn;

export function getTile(board: bigint, pos: number): number {
  return Number((board >> BigInt(pos * 4)) & NIBBLE);
}

export function setTile(board: bigint, pos: number, logValue: number): bigint {
  const shift = BigInt(pos * 4);
  const mask = NIBBLE << shift;
  return (board & ~mask) | (BigInt(logValue) << shift);
}

export function tileValue(logValue: number): number {
  return logValue === 0 ? 0 : 1 << logValue;
}

export function boardToArray(board: bigint): number[][] {
  const grid: number[][] = [[], [], [], []];
  for (let i = 0; i < 16; i++) {
    grid[Math.floor(i / 4)].push(tileValue(getTile(board, i)));
  }
  return grid;
}

export function emptyPositions(board: bigint): number[] {
  const out: number[] = [];
  for (let i = 0; i < 16; i++) {
    if (getTile(board, i) === 0) out.push(i);
  }
  return out;
}

export function maxTile(board: bigint): number {
  let max = 0;
  for (let i = 0; i < 16; i++) {
    const t = getTile(board, i);
    if (t > max) max = t;
  }
  return tileValue(max);
}

export function emptyBoard(): bigint {
  return 0n;
}

export function boardToString(board: bigint): string {
  return board.toString(16).padStart(16, '0');
}

export function boardFromString(s: string): bigint {
  return BigInt('0x' + s);
}
