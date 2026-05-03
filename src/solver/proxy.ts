import type { Req, Res } from './rpc';
import type { ActionResult, Solver } from './types';
import { SolverError } from './types';

interface Pending {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
}

/**
 * Main-thread façade that forwards Solver calls to a Worker via
 * postMessage. Dispatch is centralised in `request<T>` so each public
 * method is a one-line delegate.
 */
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

  async dispose(): Promise<void> {
    if (this.disposed) return;
    this.disposed = true;
    try { await this.request<void>({ type: 'dispose' }); } catch { /* tolerate */ }
    this.worker.terminate();
  }
}
