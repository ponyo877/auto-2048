import { boardToArray } from '@/solver';

interface Props { board: bigint; }

function tileClass(value: number): string {
  if (value === 0) return 'tile';
  if (value > 2048) return 'tile t-big';
  return `tile t-${value}`;
}

export function Board({ board }: Props) {
  const grid = boardToArray(board);
  return (
    <div className="board">
      {grid.flat().map((v, i) => (
        <div key={i} className={tileClass(v)}>{v === 0 ? '' : v}</div>
      ))}
    </div>
  );
}
