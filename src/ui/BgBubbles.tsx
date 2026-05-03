import type { CSSProperties } from 'react';

interface Bubble {
  left: string;
  top: string;
  size: number;
  color: string;
}

const BUBBLES: Bubble[] = [
  { left: '8%',  top: '12%', size: 80,  color: 'rgba(255, 209, 102, 0.45)' },
  { left: '88%', top: '18%', size: 110, color: 'rgba(255, 107, 157, 0.35)' },
  { left: '82%', top: '70%', size: 70,  color: 'rgba(124, 200, 224, 0.40)' },
  { left: '4%',  top: '78%', size: 130, color: 'rgba(178, 153, 224, 0.30)' },
  { left: '50%', top: '92%', size: 60,  color: 'rgba(107, 212, 181, 0.40)' },
  { left: '92%', top: '46%', size: 50,  color: 'rgba(255, 176, 136, 0.45)' },
];

export function BgBubbles() {
  return (
    <div className="bg-bubbles" aria-hidden>
      {BUBBLES.map((b, i) => {
        const style: CSSProperties = {
          left: b.left,
          top: b.top,
          width: b.size,
          height: b.size,
          background: b.color,
          animationDelay: `${i * -2.3}s`,
          animationDuration: `${10 + i * 2}s`,
        };
        return <div key={i} className="bg-bubble" style={style} />;
      })}
    </div>
  );
}
