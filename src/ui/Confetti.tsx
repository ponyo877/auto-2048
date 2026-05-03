import { useEffect, useState, type CSSProperties } from 'react';

interface Piece {
  id: string;
  x: number;
  angle: number;
  dist: number;
  delay: number;
  dur: number;
  rot: number;
  size: number;
  color: string;
  shape: 'square' | 'circle';
}

const COLORS = ['#FF6B9D', '#FFD166', '#06D6A0', '#118AB2', '#A06CD5', '#FF9770', '#7CD7E0'];

function makePiece(trigger: number, i: number): Piece {
  return {
    id: `${trigger}:${i}`,
    /* full-width rain across the viewport */
    x: Math.random() * 100,
    /* mostly straight-down with a small horizontal drift */
    angle: (Math.random() - 0.5) * 40,
    /* fall past the bottom of the viewport */
    dist: 110 + Math.random() * 30,
    delay: Math.random() * 600,
    dur: 1800 + Math.random() * 1200,
    rot: (Math.random() - 0.5) * 720,
    size: 8 + Math.random() * 8,
    color: COLORS[Math.floor(Math.random() * COLORS.length)],
    shape: Math.random() < 0.5 ? 'square' : 'circle',
  };
}

interface PieceStyle extends CSSProperties {
  '--ang': string;
  '--dist': string;
  '--rot': string;
}

function pieceStyle(p: Piece): PieceStyle {
  return {
    left: `${p.x}%`,
    background: p.color,
    width: p.size,
    height: p.size,
    animationDelay: `${p.delay}ms`,
    animationDuration: `${p.dur}ms`,
    '--ang': `${p.angle}deg`,
    '--dist': String(p.dist),
    '--rot': `${p.rot}deg`,
  };
}

export function Confetti({ trigger }: { trigger: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (!trigger) return;
    const arr = Array.from({ length: 80 }, (_, i) => makePiece(trigger, i));
    setPieces(arr);
    const t = setTimeout(() => setPieces([]), 3600);
    return () => clearTimeout(t);
  }, [trigger]);
  if (!pieces.length) return null;
  return (
    <div className="confetti-layer" aria-hidden>
      {pieces.map((p) => (
        <span
          key={p.id}
          className={`confetti ${p.shape}`}
          style={pieceStyle(p) as CSSProperties}
        />
      ))}
    </div>
  );
}
