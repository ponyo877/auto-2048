import { RollingNumber } from './RollingNumber';

interface Props {
  score: number;
  won: boolean;
  onRestart: () => void;
}

export function GameOver({ score, won, onRestart }: Props) {
  return (
    <div className="overlay">
      <div className="overlay-card">
        <div className="overlay-emoji" aria-hidden>{won ? '🎉' : '💔'}</div>
        <div className="overlay-title">{won ? 'You hit 2048!' : 'Out of moves'}</div>
        <div className="overlay-sub">Final score</div>
        <div className="overlay-score"><RollingNumber value={score} /></div>
        <button className="overlay-btn" onClick={onRestart}>Play again</button>
      </div>
    </div>
  );
}
