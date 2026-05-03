import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from './Board';
import { Stats } from './Stats';
import { Controls } from './Controls';
import { useGameLoop } from './use-game-loop';
import {
  createSolver, spawnInitialBoard, simulateMoveSync, spawnTileSync,
  type Action, type Solver,
} from '@/solver';

const DEFAULT_NETWORK = '4x6patt';

function newGame(): bigint {
  return spawnInitialBoard();
}

function applyManualStep(board: bigint, action: Action): { next: bigint; reward: number } {
  const { after, reward } = simulateMoveSync(board, action);
  if (after === board) return { next: board, reward: 0 };
  return { next: spawnTileSync(after), reward };
}

export function App() {
  const [board, setBoard] = useState<bigint>(newGame);
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(0);
  const [depth, setDepth] = useState(3);
  const [solver, setSolver] = useState<Solver | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const boardRef = useRef(board);
  const depthRef = useRef(depth);
  boardRef.current = board;
  depthRef.current = depth;

  useEffect(() => {
    let disposed = false;
    createSolver({
      network: DEFAULT_NETWORK,
      wasmUrl: '/solver.js',
      weightsUrl: '/weights/4x6patt.trained.w.gz',
    })
      .then((s) => { if (!disposed) setSolver(s); })
      .catch((e) => setErr(String(e)));
    return () => { disposed = true; };
  }, []);

  const handleAdvance = useCallback((next: bigint, _a: Action, reward: number) => {
    setBoard(next);
    setScore((s) => s + reward);
    setMoves((m) => m + 1);
  }, []);
  const handleGameOver = useCallback(() => setIsPlaying(false), []);
  const handleError = useCallback((e: unknown) => { setErr(String(e)); setIsPlaying(false); }, []);

  useGameLoop({
    solver, isPlaying, speed,
    getBoard: () => boardRef.current,
    getDepth: () => depthRef.current,
    onAdvance: handleAdvance,
    onGameOver: handleGameOver,
    onError: handleError,
  });

  const onStep = useCallback(async () => {
    if (!solver) return;
    const action = await solver.step(boardRef.current, depthRef.current);
    if (action < 0) return;
    const { next, reward } = applyManualStep(boardRef.current, action as Action);
    handleAdvance(next, action as Action, reward);
  }, [solver, handleAdvance]);

  const onReset = useCallback(() => {
    setBoard(newGame());
    setScore(0); setMoves(0); setIsPlaying(false); setErr(null);
  }, []);

  return (
    <div className="app">
      <h1>auto-2048</h1>
      <p className="sub">2048 solver — WASM expectimax + monotonicity/smoothness heuristic</p>
      <Board board={board} />
      <Stats board={board} score={score} moves={moves} />
      <Controls
        isPlaying={isPlaying} speed={speed} depth={depth} busy={!solver}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onStep={onStep}
        onReset={onReset}
        onSpeedChange={setSpeed}
        onDepthChange={setDepth}
      />
      {!solver && !err && <div className="notice">Loading solver…</div>}
      {err && <div className="notice">Error: {err}</div>}
      <div className="notice">
        TC (Temporal Coherence) 学習済 4x6patt N-Tuple Network (1M episode) + expectimax。
        <br/>実測 (depth=4, 10 ゲーム):4096 100%, 8192 90%, <b>16384 80%</b>。
        <br/>depth=3 で 1 ゲーム 1〜2 分、depth=4 で 5〜10 分。
      </div>
    </div>
  );
}
