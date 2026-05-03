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
    x: 50 + (Math.random() - 0.5) * 30,
    angle: (Math.random() - 0.5) * 140,
    dist: 40 + Math.random() * 60,
    delay: Math.random() * 100,
    dur: 1400 + Math.random() * 900,
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
    '--dist': `${p.dist}vh`,
    '--rot': `${p.rot}deg`,
  };
}

export function Confetti({ trigger }: { trigger: number }) {
  const [pieces, setPieces] = useState<Piece[]>([]);
  useEffect(() => {
    if (!trigger) return;
    const arr = Array.from({ length: 80 }, (_, i) => makePiece(trigger, i));
    setPieces(arr);
    const t = setTimeout(() => setPieces([]), 2600);
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
