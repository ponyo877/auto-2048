/**
 * Public Solver API. Defaults to the Worker+Mock pipeline so the UI can
 * run without the WASM core; switch via env or config to load real WASM.
 */
import { WorkerSolverProxy } from './proxy';
import { createMockSolver } from './mock-solver';
import type { Solver, SolverConfig } from './types';

export type {
  Action,
  ActionResult,
  SimulateResult,
  Solver,
  SolverConfig,
} from './types';
export { ACTION_NAMES, SolverError, SOLVER_ERROR_CODES } from './types';
export {
  getTile, setTile, tileValue, boardToArray,
  emptyPositions, maxTile, emptyBoard, boardToString, boardFromString,
} from './board';
export { simulateMove as simulateMoveSync, isGameOverSync } from './board-moves';
export { spawnTile as spawnTileSync, spawnInitialBoard } from './spawn';

export interface CreateSolverOptions extends SolverConfig {
  /** When true, run synchronously on the main thread (for tests/dev). */
  inline?: boolean;
}

async function createWorkerSolver(config: SolverConfig): Promise<Solver> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const proxy = new WorkerSolverProxy(worker);
  await proxy.init(config);
  return proxy;
}

export async function createSolver(options: CreateSolverOptions): Promise<Solver> {
  if (options.inline) return createMockSolver(options);
  if (typeof Worker === 'undefined') return createMockSolver(options);
  return createWorkerSolver(options);
}
