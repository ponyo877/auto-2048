import type { SolverConfig } from './types';

export type Req =
  | { id: number; type: 'init'; config: SolverConfig }
  | { id: number; type: 'step'; board: bigint; depth: number }
  | { id: number; type: 'dispose' };

export type Res =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };
