import type { CSSProperties } from 'react';
import type { Tile as TileT } from '@/lib/engine';

interface TileColors { bg: string; fg: string; shadow: string; }

const FG_WHITE = 'oklch(1 0 0)';

const TILE_COLORS: Record<number, TileColors> = {
  2:    { bg: 'oklch(0.94 0.04 230)', fg: 'oklch(0.35 0.05 230)', shadow: 'oklch(0.78 0.10 230)' },
  4:    { bg: 'oklch(0.92 0.06 210)', fg: 'oklch(0.32 0.08 210)', shadow: 'oklch(0.74 0.12 210)' },
  8:    { bg: 'oklch(0.88 0.10 190)', fg: 'oklch(0.28 0.10 190)', shadow: 'oklch(0.70 0.14 190)' },
  16:   { bg: 'oklch(0.88 0.13 160)', fg: 'oklch(0.28 0.10 160)', shadow: 'oklch(0.70 0.16 160)' },
  32:   { bg: 'oklch(0.90 0.14 130)', fg: 'oklch(0.32 0.10 130)', shadow: 'oklch(0.74 0.16 130)' },
  64:   { bg: 'oklch(0.92 0.15 95)',  fg: 'oklch(0.34 0.12 80)',  shadow: 'oklch(0.78 0.18 95)' },
  128:  { bg: 'oklch(0.88 0.16 75)',  fg: FG_WHITE, shadow: 'oklch(0.72 0.18 75)' },
  256:  { bg: 'oklch(0.82 0.17 55)',  fg: FG_WHITE, shadow: 'oklch(0.66 0.19 55)' },
  512:  { bg: 'oklch(0.74 0.20 35)',  fg: FG_WHITE, shadow: 'oklch(0.60 0.22 35)' },
  1024: { bg: 'oklch(0.68 0.22 20)',  fg: FG_WHITE, shadow: 'oklch(0.54 0.24 20)' },
  2048: { bg: 'oklch(0.62 0.24 5)',   fg: FG_WHITE, shadow: 'oklch(0.50 0.26 5)' },
  4096: { bg: 'oklch(0.58 0.23 350)', fg: FG_WHITE, shadow: 'oklch(0.46 0.25 350)' },
  8192: { bg: 'oklch(0.55 0.22 320)', fg: FG_WHITE, shadow: 'oklch(0.42 0.24 320)' },
  16384: { bg: 'oklch(0.50 0.22 295)', fg: FG_WHITE, shadow: 'oklch(0.36 0.24 295)' },
};

function tileColor(v: number): TileColors {
  return TILE_COLORS[v] ?? TILE_COLORS[16384];
}

function tileFontSize(v: number): string {
  if (v < 100) return 'clamp(28px, 9vw, 56px)';
  if (v < 1000) return 'clamp(24px, 7.5vw, 48px)';
  if (v < 10000) return 'clamp(20px, 6vw, 40px)';
  return 'clamp(16px, 5vw, 32px)';
}

/** 32768 is the practical endgame, 65536 the theoretical miracle —
 *  CSS handles their backgrounds & animations so we skip the inline
 *  colour fields here. */
function specialClass(v: number): string {
  if (v >= 65536) return 'tile-evil';
  if (v >= 32768) return 'tile-ominous';
  return '';
}

interface Props {
  tile: TileT;
  row: number;
  col: number;
  cellSize: number;
  gap: number;
}

export function Tile({ tile, row, col, cellSize, gap }: Props) {
  const v = tile.value;
  const x = col * (cellSize + gap);
  const y = row * (cellSize + gap);
  const scaleAnim = tile.justSpawned ? 'tile-spawn' : tile.justMerged ? 'tile-merge' : '';
  const special = specialClass(v);
  const baseStyle: CSSProperties = {
    width: cellSize,
    height: cellSize,
    transform: `translate(${x}px, ${y}px)`,
    fontSize: tileFontSize(v),
    zIndex: tile.justMerged ? 20 : 10,
  };
  const style: CSSProperties = special ? baseStyle : (() => {
    const c = tileColor(v);
    return {
      ...baseStyle,
      background: c.bg,
      color: c.fg,
      boxShadow: `0 6px 0 0 ${c.shadow}, 0 10px 24px -8px ${c.shadow}`,
    };
  })();
  return (
    <div className={`tile ${scaleAnim} ${special}`} style={style}>
      <span className="tile-text">{v}</span>
    </div>
  );
}
