/**
 * Proxy — main-thread façade that forwards Solver calls to a Worker via postMessage.
 * Each method's cognitive complexity is intentionally tiny; all dispatch logic
 * lives in `request<T>()`.
 */
import type { Req, Res } from './rpc';
import {
  type Action,
  type ActionResult,
  type SimulateResult,
  type Solver,
  SolverError,
} from './types';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

export class WorkerSolverProxy implements Solver {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private disposed = false;

  constructor(private readonly worker: Worker) {
    worker.addEventListener('message', (ev) => this.onMessage(ev.data as Res));
    worker.addEventListener('error', (ev) => this.onWorkerError(ev));
  }

  private onMessage(res: Res): void {
    const p = this.pending.get(res.id);
    if (!p) return;
    this.pending.delete(res.id);
    if (res.ok) p.resolve(res.value);
    else p.reject(new SolverError('worker', res.error));
  }

  private onWorkerError(ev: ErrorEvent): void {
    const err = new SolverError('worker', ev.message || 'worker error');
    for (const p of this.pending.values()) p.reject(err);
    this.pending.clear();
  }

  private request<T>(payload: { type: Req['type'] } & Record<string, unknown>): Promise<T> {
    if (this.disposed) return Promise.reject(new SolverError('disposed', 'solver disposed'));
    const id = this.nextId++;
    const message = { ...payload, id } as unknown as Req;
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      this.worker.postMessage(message);
    });
  }

  init(config: Extract<Req, { type: 'init' }>['config']): Promise<void> {
    return this.request<void>({ type: 'init', config });
  }

  step(board: bigint, depth = 1): Promise<ActionResult> {
    return this.request<ActionResult>({ type: 'step', board, depth });
  }

  evaluate(board: bigint): Promise<number> {
    return this.request<number>({ type: 'evaluate', board });
  }

  evaluateActions(board: bigint, depth = 1): Promise<[number, number, number, number]> {
    return this.request<[number, number, number, number]>({ type: 'evaluateActions', board, depth });
  }

  simulateMove(board: bigint, action: Action): Promise<SimulateResult> {
    return this.request<SimulateResult>({ type: 'simulateMove', board, action });
  }

  spawnTile(board: bigint, seed = 0): Promise<bigint> {
    return this.request<bigint>({ type: 'spawnTile', board, seed });
  }

  isGameOver(board: bigint): Promise<boolean> {
    return this.request<boolean>({ type: 'isGameOver', board });
  }

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try { await this.request<void>({ type: 'dispose' }); } catch { /* tolerate */ }
    this.worker.terminate();
  }
}
