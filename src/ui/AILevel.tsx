interface Props { level: number; onChange: (lvl: number) => void; }

const LABELS = ['Rookie', 'Casual', 'Smart', 'Sharp', 'Genius'] as const;
const LEVELS: ReadonlyArray<1 | 2 | 3 | 4 | 5> = [1, 2, 3, 4, 5];

export function AILevel({ level, onChange }: Props) {
  return (
    <div className="control-block">
      <div className="control-head">
        <span className="control-label">AI LEVEL</span>
        <span className="control-value">{LABELS[level - 1]}</span>
      </div>
      <div className="pip-row" role="radiogroup" aria-label="AI level">
        {LEVELS.map((n) => {
          const cls = `pip ${level >= n ? 'on' : ''} ${level === n ? 'current' : ''}`;
          return (
            <button
              key={n}
              role="radio"
              aria-checked={level === n}
              className={cls}
              onClick={() => onChange(n)}
            >
              <span className="pip-num">{n}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
