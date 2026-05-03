import type { CSSProperties } from 'react';

export interface FlashTrigger {
  dir: 0 | 1 | 2 | 3;
  key: number;
}

const DIR_NAMES = ['up', 'right', 'down', 'left'] as const;

interface ArrowStyle extends CSSProperties {
  '--i': number;
}

export function DirectionFlash({ trigger, byAI }: { trigger: FlashTrigger | null; byAI: boolean }) {
  if (!trigger) return null;
  const dirName = DIR_NAMES[trigger.dir];
  const cls = `dir-flash-board dir-${dirName} ${byAI ? 'by-ai' : 'by-user'}`;
  return (
    <div key={trigger.key} className={cls} aria-hidden>
      {[0, 1, 2].map((i) => (
        <div key={i} className="dir-arrow" style={{ '--i': i } as ArrowStyle}>
          <svg viewBox="0 0 64 64" width="60" height="60" fill="none" stroke="currentColor" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round">
            <path d="M32 14 L32 50 M18 28 L32 14 L46 28" />
          </svg>
        </div>
      ))}
    </div>
  );
}
