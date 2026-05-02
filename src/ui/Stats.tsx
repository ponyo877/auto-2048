import { maxTile } from '@/solver';

interface Props { board: bigint; score: number; moves: number; }

export function Stats({ board, score, moves }: Props) {
  return (
    <div className="stats">
      <div className="stat"><div>SCORE</div><div className="v">{score}</div></div>
      <div className="stat"><div>MAX</div><div className="v">{maxTile(board)}</div></div>
      <div className="stat"><div>MOVES</div><div className="v">{moves}</div></div>
    </div>
  );
}
