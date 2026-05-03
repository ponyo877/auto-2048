interface Props { playing: boolean; gameOver: boolean; onToggle: () => void; }

function pickLabel(playing: boolean, gameOver: boolean): string {
  if (playing) return 'Pause';
  if (gameOver) return 'Play Again';
  return 'AI Play';
}

export function PlayPauseButton({ playing, gameOver, onToggle }: Props) {
  const label = pickLabel(playing, gameOver);
  return (
    <button
      className={`pp-btn ${playing ? 'is-playing' : ''}`}
      onClick={onToggle}
      aria-label={label}
    >
      <span className="pp-glyph">
        {playing ? (
          <svg viewBox="0 0 24 24" width="28" height="28">
            <rect x="6" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
            <rect x="14" y="5" width="4" height="14" rx="1.5" fill="currentColor" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" width="28" height="28">
            <path d="M7 4.5 L19 12 L7 19.5 Z" fill="currentColor" />
          </svg>
        )}
      </span>
      <span className="pp-label">{label}</span>
    </button>
  );
}
