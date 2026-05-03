/**
 * Public Solver API. Fetches the weights on the main thread (so we can
 * surface download progress, retry, and offline detection to the UI),
 * then spins up a Worker preloaded with the bytes.
 */
import { WorkerSolverProxy } from './proxy';
import { fetchWeights, type ProgressCallback } from './fetch-weights';
import type { Solver, SolverConfig } from './types';

export type { Solver, SolverConfig } from './types';
export type { ProgressCallback } from './fetch-weights';
export { checkBrowserSupport } from './browser-check';

interface CreateOpts {
  onProgress?: ProgressCallback;
  signal?: AbortSignal;
}

export async function createSolver(
  config: SolverConfig,
  opts: CreateOpts = {},
): Promise<Solver> {
  const weightsBytes = config.weightsBytes
    ?? (config.weightsUrl ? await fetchWeights(config.weightsUrl, opts) : undefined);
  const worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  const proxy = new WorkerSolverProxy(worker);
  /* Hand off the bytes to the worker via a transferable so we don't pay
   * the structured-clone copy on a 256 MB buffer. */
  const initConfig: SolverConfig = { ...config, weightsBytes, weightsUrl: undefined };
  const transfer: Transferable[] = weightsBytes ? [weightsBytes.buffer] : [];
  await proxy.init(initConfig, transfer);
  return proxy;
}
