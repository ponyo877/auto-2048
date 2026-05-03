export type Action = 0 | 1 | 2 | 3;
export type ActionResult = Action | -1;

export interface SolverConfig {
  network: '4x6patt' | string;
  weightsUrl?: string;
  wasmUrl?: string;
}

export interface Solver {
  step(board: bigint, depth?: number): Promise<ActionResult>;
  dispose(): Promise<void>;
}

export class SolverError extends Error {
  public override readonly name = 'SolverError';
  constructor(public readonly code: number | string, message: string) {
    super(`SolverError(${code}): ${message}`);
  }
}

export const SOLVER_ERROR_CODES = {
  OK: 0,
  INVALID_NETWORK: -1,
  WEIGHT_FORMAT: -2,
  NOT_INITIALIZED: -4,
} as const;
