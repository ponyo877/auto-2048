/**
 * RPC payload definitions shared between proxy.ts (main thread) and worker.ts.
 * Kept as a small, dependency-free module so both sides can import it.
 */
import type { Action, SolverConfig } from './types';

export type Req =
  | { id: number; type: 'init'; config: SolverConfig }
  | { id: number; type: 'step'; board: bigint; depth: number }
  | { id: number; type: 'evaluate'; board: bigint }
  | { id: number; type: 'evaluateActions'; board: bigint; depth: number }
  | { id: number; type: 'simulateMove'; board: bigint; action: Action }
  | { id: number; type: 'spawnTile'; board: bigint; seed: number }
  | { id: number; type: 'isGameOver'; board: bigint }
  | { id: number; type: 'dispose' };

export type Res =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };

export type ReqType = Req['type'];
