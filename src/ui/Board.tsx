import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Tile } from './Tile';
import { SIZE, type Direction, type Grid } from '@/lib/engine';

interface Dims { cell: number; gap: number; }

const SWIPE_THRESHOLD = 24;

interface Props {
  board: Grid;
  shake: number;
  onSwipe?: (dir: Direction) => void;
}

function pickDirection(dx: number, dy: number): Direction {
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 1 : 3;
  return dy > 0 ? 2 : 0;
}

function useDims(ref: React.RefObject<HTMLDivElement>) {
  const [dims, setDims] = useState<Dims>({ cell: 90, gap: 12 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const W = el.clientWidth;
      const gap = Math.max(8, Math.round(W * 0.025));
      const cell = (W - gap * 5) / 4;
      setDims({ cell, gap });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return dims;
}

function useSwipe(ref: React.RefObject<HTMLDivElement>, onSwipe?: (d: Direction) => void) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !onSwipe) return;
    let sx = 0, sy = 0, tracking = false;
    const ts = (e: TouchEvent) => {
      const t = e.touches[0]; sx = t.clientX; sy = t.clientY; tracking = true;
    };
    const te = (e: TouchEvent) => {
      if (!tracking) return;
      tracking = false;
      const t = e.changedTouches[0];
      const dx = t.clientX - sx, dy = t.clientY - sy;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return;
      onSwipe(pickDirection(dx, dy));
    };
    const tm = (e: TouchEvent) => { if (tracking) e.preventDefault(); };
    el.addEventListener('touchstart', ts, { passive: true });
    el.addEventListener('touchmove', tm, { passive: false });
    el.addEventListener('touchend', te, { passive: true });
    return () => {
      el.removeEventListener('touchstart', ts);
      el.removeEventListener('touchmove', tm);
      el.removeEventListener('touchend', te);
    };
  }, [ref, onSwipe]);
}

function cellStyle(r: number, c: number, d: Dims): CSSProperties {
  return {
    position: 'absolute',
    width: d.cell,
    height: d.cell,
    transform: `translate(${c * (d.cell + d.gap)}px, ${r * (d.cell + d.gap)}px)`,
  };
}

export function Board({ board, shake, onSwipe }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const dims = useDims(wrapRef);
  useSwipe(wrapRef, onSwipe);

  const tiles: JSX.Element[] = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const t = board[r][c];
      if (t) {
        tiles.push(<Tile key={t.id} tile={t} row={r} col={c} cellSize={dims.cell} gap={dims.gap} />);
      }
    }
  }
  const innerSize = SIZE * dims.cell + (SIZE - 1) * dims.gap;
  const gridStyle: CSSProperties = { position: 'relative', width: innerSize, height: innerSize };

  return (
    <div className={`board-wrap ${shake ? 'shake' : ''}`} ref={wrapRef}>
      <div className="board-frame" style={{ padding: dims.gap }}>
        <div className="board-grid" style={gridStyle}>
          {Array.from({ length: SIZE * SIZE }).map((_, i) => {
            const r = Math.floor(i / SIZE), c = i % SIZE;
            return <div key={i} className="cell" style={cellStyle(r, c, dims)} />;
          })}
          <div className="tiles-layer" style={{ position: 'absolute', inset: 0 }}>
            {tiles}
          </div>
        </div>
      </div>
    </div>
  );
}
