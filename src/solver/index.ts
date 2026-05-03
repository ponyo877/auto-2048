/**
 * Public Solver API. Spins up a Worker that loads /solver.js (Emscripten
 * output) and the .w weight file, then exposes a small async surface
 * (step, dispose) consumed by the React app.
 */
import { WorkerSolverProxy } from './proxy';
import type { Solver, SolverConfig } from './types';

export type { Solver, SolverConfig } from './types';

export async function createSolver(config: SolverConfig): Promise<Solver> {
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const proxy = new WorkerSolverProxy(worker);
  await proxy.init(config);
  return proxy;
}
