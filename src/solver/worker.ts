/**
 * Worker entry — receives Req messages, dispatches to the WASM-backed
 * Solver, and replies via postMessage. Dispatch is table-driven so this
 * file's cognitive complexity stays low.
 */
import { createWasmSolverFromFactory, type WasmFactory } from './wasm-solver';
import type { Req, Res } from './rpc';
import type { Solver, SolverConfig } from './types';

let solver: Solver | null = null;

function dirOf(url: string): string {
  const i = url.lastIndexOf('/');
  return i >= 0 ? url.slice(0, i + 1) : '/';
}

async function bootSolver(config: SolverConfig): Promise<Solver> {
  const url = config.wasmUrl ?? '/solver.js';
  const mod = await import(/* @vite-ignore */ url);
  const factory = (mod.default ?? mod) as WasmFactory;
  return createWasmSolverFromFactory(factory, config, dirOf(url));
}

type Handler = (req: Req) => Promise<unknown>;

function need(): Solver {
  if (!solver) throw new Error('solver not initialised — send init first');
  return solver;
}

const handlers: Record<Req['type'], Handler> = {
  init: async (req) => {
    if (req.type !== 'init') return;
    solver = await bootSolver(req.config);
  },
  step: async (req) => {
    if (req.type !== 'step') return;
    return need().step(req.board, req.depth);
  },
  dispose: async () => {
    if (solver) await solver.dispose();
    solver = null;
  },
};

async function dispatch(req: Req): Promise<Res> {
  try {
    const value = await handlers[req.type](req);
    return { id: req.id, ok: true, value };
  } catch (err) {
    return { id: req.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

self.addEventListener('message', async (ev: MessageEvent<Req>) => {
  const res = await dispatch(ev.data);
  (self as DedicatedWorkerGlobalScope).postMessage(res);
});
