/**
 * MockSolver — heuristic policy used until the WASM core lands.
 * Prefers actions that increase reward; ties broken by empty-tile count.
 *
 * Implements the full Solver interface so the UI can run end-to-end
 * before emcc is wired up.
 */
import { simulateMove, isGameOverSync } from './board-moves';
import { emptyPositions, maxTile } from './board';
import { spawnTile } from './spawn';
import type {
  Action,
  ActionResult,
  SimulateResult,
  Solver,
  SolverConfig,
} from './types';

const ALL_ACTIONS: readonly Action[] = [0, 1, 2, 3];

interface Score {
  action: Action;
  reward: number;
  empties: number;
  changed: boolean;
}

function scoreAction(board: bigint, action: Action): Score {
  const result = simulateMove(board, action);
  return {
    action,
    reward: result.reward,
    empties: emptyPositions(result.after).length,
    changed: result.after !== board,
  };
}

function pickBest(scores: readonly Score[]): ActionResult {
  const legal = scores.filter((s) => s.changed);
  if (legal.length === 0) return -1;
  let best = legal[0];
  for (const s of legal.slice(1)) {
    if (s.reward > best.reward) { best = s; continue; }
    if (s.reward === best.reward && s.empties > best.empties) best = s;
  }
  return best.action;
}

class MockSolver implements Solver {
  async step(board: bigint, _depth = 1): Promise<ActionResult> {
    return pickBest(ALL_ACTIONS.map((a) => scoreAction(board, a)));
  }

  async evaluate(board: bigint): Promise<number> {
    return Math.log2(Math.max(2, maxTile(board))) + emptyPositions(board).length * 0.1;
  }

  async evaluateActions(
    board: bigint,
    _depth = 1,
  ): Promise<[number, number, number, number]> {
    const out: number[] = [];
    for (const a of ALL_ACTIONS) {
      const s = scoreAction(board, a);
      out.push(s.changed ? s.reward + s.empties * 0.5 : -Infinity);
    }
    return [out[0], out[1], out[2], out[3]];
  }

  async simulateMove(board: bigint, action: Action): Promise<SimulateResult> {
    return simulateMove(board, action);
  }

  async spawnTile(board: bigint, seed?: number): Promise<bigint> {
    return spawnTile(board, seed);
  }

  async isGameOver(board: bigint): Promise<boolean> {
    return isGameOverSync(board);
  }

  async dispose(): Promise<void> { /* no-op */ }
}

export function createMockSolver(_config?: SolverConfig): Solver {
  return new MockSolver();
}
