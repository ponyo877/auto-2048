interface Props {
  playing: boolean;
  gameOver: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

function pickLabel(playing: boolean, gameOver: boolean, disabled: boolean): string {
  if (disabled) return 'Loading model…';
  if (playing) return 'Pause';
  if (gameOver) return 'Play Again';
  return 'AI Play';
}

function Glyph({ playing, disabled }: { playing: boolean; disabled: boolean }) {
  if (disabled) {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <circle cx="12" cy="12" r="9"
                fill="none" stroke="currentColor" strokeWidth="3"
                strokeLinecap="round" strokeDasharray="14 42" />
      </svg>
    );
  }
  if (playing) {
    return (
      <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
        <rect x="6"  y="5" width="4" height="14" rx="1.5" fill="currentColor" />
        <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" />
    </svg>
  );
}

export function PlayPauseButton({ playing, gameOver, disabled = false, onToggle }: Props) {
  const label = pickLabel(playing, gameOver, disabled);
  const cls = ['pp-btn', playing ? 'is-playing' : '', disabled ? 'is-loading' : '']
    .filter(Boolean).join(' ');
  return (
    <button
      className={cls}
      onClick={onToggle}
      disabled={disabled}
      aria-label={label}
    >
      <span className="pp-glyph">
        <Glyph playing={playing} disabled={disabled} />
      </span>
      <span className="pp-label">{label}</span>
    </button>
  );
}
