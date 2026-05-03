import { useCallback, useEffect, useRef, useState } from 'react';
import { Board } from './Board';
import { BgBubbles } from './BgBubbles';
import { Confetti } from './Confetti';
import { DirectionFlash, type FlashTrigger } from './DirectionFlash';
import { StatCard } from './StatCard';
import { PlayPauseButton } from './PlayPauseButton';
import { IconButton } from './IconButton';
import { SpeedSlider } from './SpeedSlider';
import { AILevel } from './AILevel';
import { useAutoPlay } from './useAutoPlay';
import {
  newGame, move, canMove, spawnTile, maxValue, gridToBigint,
  type Direction, type Grid,
} from '@/lib/engine';
import { createSolver, type Solver } from '@/solver';

const INITIAL_SPEED_MS = 250;
const INITIAL_AI_LEVEL = 3;
const BIG_MERGE = 256;
const AI_THINK_FLASH_MS = 220;

interface MoveOutcome {
  next: Grid;
  reward: number;
  mergedValues: number[];
  changed: boolean;
}

function applyMove(grid: Grid, dir: Direction): MoveOutcome {
  const result = move(grid, dir);
  if (!result.moved) return { next: grid, reward: 0, mergedValues: [], changed: false };
  const next = spawnTile(result.board);
  return { next, reward: result.gainedScore, mergedValues: result.mergedValues, changed: true };
}

interface KeyHandlerArgs {
  playing: boolean;
  gameOver: boolean;
  onMove: (dir: Direction, fromAI: boolean) => void;
  onAiStep: () => void;
  onTogglePlay: () => void;
}

const KEY_MAP: Record<string, Direction> = {
  ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3,
  w: 0, d: 1, s: 2, a: 3, W: 0, D: 1, S: 2, A: 3,
};

const FOCUS_TAGS = new Set(['BUTTON', 'INPUT', 'TEXTAREA', 'SELECT']);
function isFocusedInteractive(t: EventTarget | null): boolean {
  return t instanceof HTMLElement && FOCUS_TAGS.has(t.tagName);
}

function useKeyboard({ playing, gameOver, onMove, onAiStep, onTogglePlay }: KeyHandlerArgs) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !isFocusedInteractive(e.target)) {
        e.preventDefault();
        onTogglePlay();
        return;
      }
      if (playing || gameOver) return;
      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        onAiStep();
        return;
      }
      const dir = KEY_MAP[e.key];
      if (dir !== undefined) {
        e.preventDefault();
        onMove(dir, false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [playing, gameOver, onMove, onAiStep, onTogglePlay]);
}

export function App() {
  const [board, setBoard] = useState<Grid>(() => newGame());
  const [score, setScore] = useState(0);
  const [moves, setMoves] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(INITIAL_SPEED_MS);
  const [aiLevel, setAiLevel] = useState(INITIAL_AI_LEVEL);
  const [shake, setShake] = useState(0);
  const [confetti, setConfetti] = useState(0);
  const [won, setWon] = useState(false);
  const [gameOver, setGameOver] = useState(false);
  const [aiThinking, setAiThinking] = useState(false);
  const [moveDir, setMoveDir] = useState<FlashTrigger | null>(null);
  const [byAI, setByAI] = useState(false);
  const [solver, setSolver] = useState<Solver | null>(null);
  const [solverErr, setSolverErr] = useState<string | null>(null);

  const boardRef = useRef(board);
  useEffect(() => { boardRef.current = board; }, [board]);

  const max = maxValue(board);

  useEffect(() => {
    let disposed = false;
    createSolver({
      network: '4x6patt',
      wasmUrl: '/solver.js',
      weightsUrl: '/weights/4x6patt.trained.w.gz',
    })
      .then((s) => { if (!disposed) setSolver(s); })
      .catch((e) => setSolverErr(String(e)));
    return () => { disposed = true; };
  }, []);

  const doMove = useCallback((dir: Direction, fromAI: boolean) => {
    if (gameOver) return false;
    const outcome = applyMove(boardRef.current, dir);
    if (!outcome.changed) return false;
    setBoard(outcome.next);
    setScore((s) => s + outcome.reward);
    setMoves((m) => m + 1);
    setByAI(fromAI);
    setMoveDir({ dir, key: Date.now() + Math.random() });
    if (outcome.mergedValues.some((v) => v >= BIG_MERGE)) setShake((x) => x + 1);
    if (outcome.mergedValues.includes(2048) && !won) {
      setWon(true);
      setConfetti((x) => x + 1);
    }
    if (!canMove(outcome.next)) { setGameOver(true); setPlaying(false); }
    return true;
  }, [gameOver, won]);

  const aiStepOnce = useCallback(async () => {
    if (!solver || gameOver) return;
    const action = await solver.step(gridToBigint(boardRef.current), aiLevel);
    if (action < 0) { setGameOver(true); return; }
    setAiThinking(true);
    setTimeout(() => setAiThinking(false), AI_THINK_FLASH_MS);
    doMove(action as Direction, true);
  }, [solver, gameOver, aiLevel, doMove]);

  const restart = useCallback(() => {
    setBoard(newGame());
    setScore(0); setMoves(0);
    setWon(false); setGameOver(false); setPlaying(false);
  }, []);

  const togglePlay = useCallback(() => {
    if (gameOver) { restart(); setTimeout(() => setPlaying(true), 50); return; }
    setPlaying((p) => !p);
  }, [gameOver, restart]);

  useKeyboard({
    playing, gameOver,
    onMove: doMove, onAiStep: aiStepOnce, onTogglePlay: togglePlay,
  });

  useAutoPlay({
    solver, playing, gameOver, speedMs, aiLevel,
    boardRef, doMove,
    onAiThinkingChange: setAiThinking,
    onPlayingChange: setPlaying,
    onGameOver: () => setGameOver(true),
  });

  const handleSwipe = useCallback((d: Direction) => {
    if (!playing) doMove(d, false);
  }, [playing, doMove]);

  return (
    <div className="app">
      <BgBubbles />
      <Confetti trigger={confetti} />
      <div className="shell">
        <div className="left-col">
          <div className="brand-row">
            <div className="brand">
              <div className="brand-logo">2³</div>
              <div className="brand-text">
                <div className="brand-title">AutoPlay&nbsp;2048</div>
                <div className="brand-sub">
                  <span className={`dot ${playing ? '' : gameOver ? 'over' : 'idle'}`}></span>
                  {solverErr
                    ? `Error: ${solverErr}`
                    : !solver
                    ? 'Loading solver…'
                    : gameOver
                    ? (won && !canMove(board)
                        ? `🎉 You hit 2048! Final ${score.toLocaleString()}`
                        : `💔 Game over — Final ${score.toLocaleString()}`)
                    : playing
                    ? `AI Lv.${aiLevel} thinking…`
                    : 'Ready'}
                </div>
              </div>
            </div>
            <span className="meta-pill">MOVES <span className="num">{moves}</span></span>
          </div>

          <div className="stats-row">
            <StatCard label="SCORE" value={score} accent="var(--pink)" big />
            <StatCard label="MAX" value={max || '—'} accent="var(--sun)" big />
          </div>

          <div style={{ position: 'relative' }}>
            <div className={`ai-ring ${aiThinking ? 'on' : ''}`} aria-hidden></div>
            <Board board={board} shake={shake} onSwipe={handleSwipe} />
            <DirectionFlash trigger={moveDir} byAI={byAI} />
          </div>

          <div className="hint-row">
            <span className="hint">
              <span className="kbd">↑</span><span className="kbd">↓</span><span className="kbd">←</span><span className="kbd">→</span> move
            </span>
            <span className="hint"><span className="kbd">Space</span> AI step</span>
            <span className="hint"><span className="kbd">Enter</span> AI play / pause</span>
            <span className="hint">or swipe on touch</span>
            {playing && <span className="hint">— manual controls locked while AI plays</span>}
          </div>
        </div>

        <div className="panel">
          <div className="card">
            <PlayPauseButton playing={playing} gameOver={gameOver} onToggle={togglePlay} />
            <div className="btn-row">
              <IconButton onClick={restart} label="Restart">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12a9 9 0 1 0 3-6.7" /><path d="M3 4v5h5" />
                </svg>
              </IconButton>
              <button
                className="step-btn"
                onClick={() => { void aiStepOnce(); }}
                disabled={playing || gameOver || !solver}
                aria-label="Step one AI move"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6 5 L14 12 L6 19 Z" fill="currentColor" stroke="none" />
                  <line x1="17" y1="5" x2="17" y2="19" />
                </svg>
                <span>Step</span>
              </button>
            </div>
          </div>

          <div className="card">
            <div className="card-title">Auto-play</div>
            <SpeedSlider ms={speedMs} onChange={setSpeedMs} />
            <div style={{ height: 14 }}></div>
            <AILevel level={aiLevel} onChange={setAiLevel} />
          </div>

          <div className="card">
            <div className="card-title">How it plays</div>
            <p style={{ margin: 0, fontSize: 13, lineHeight: 1.55, color: 'var(--ink-soft)' }}>
              The AI uses <b style={{ color: 'var(--ink)' }}>Expectimax search</b> over the
              4x6patt N-Tuple weights from
              <a href="https://github.com/moporgic/TDL2048" target="_blank" rel="noreferrer" style={{ color: 'var(--pink)' }}> TDL2048+ </a>
              (Hung Guei, MIT 2021). Sharp / Genius look more plies ahead — 100-game bench:
              <b> 16384 94%, 32768 37% </b> at depth 3. Pause any time to take over with arrows or swipes.
            </p>
          </div>

          <div className="card credits-card">
            <div className="card-title">Credits</div>
            <p style={{ margin: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--ink-soft)' }}>
              <b style={{ color: 'var(--ink)' }}>AutoPlay 2048</b> — MIT © 2026 ponyo877.
              <br />
              Trained 4x6patt N-Tuple weights and the underlying algorithm — MIT © 2021
              {' '}
              <a href="https://github.com/moporgic/TDL2048" target="_blank" rel="noreferrer" style={{ color: 'var(--pink)' }}>Hung Guei (TDL2048+)</a>
              ; redistributed as a TDL2048+ build artefact under the same license.
              <br />
              Original <i>2048</i> game concept — MIT © 2014
              {' '}
              <a href="https://github.com/gabrielecirulli/2048" target="_blank" rel="noreferrer" style={{ color: 'var(--pink)' }}>Gabriele Cirulli</a>
              ; no source code reused.
              <br />
              Full third-party notices in
              {' '}
              <a href="https://github.com/ponyo877/autoplay-2048/blob/main/NOTICE.md" target="_blank" rel="noreferrer" style={{ color: 'var(--pink)' }}>NOTICE.md</a>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
