export type Action = 0 | 1 | 2 | 3;

export const ACTION_NAMES = ['Up', 'Right', 'Down', 'Left'] as const;

export type ActionResult = Action | -1;

export interface SimulateResult {
  after: bigint;
  reward: number;
}

export interface SolverConfig {
  network: '2x6patt' | '4x6patt' | string;
  weightsUrl?: string;
  wasmUrl?: string;
  workerUrl?: string;
}

export interface Solver {
  step(board: bigint, depth?: number): Promise<ActionResult>;
  evaluate(board: bigint): Promise<number>;
  evaluateActions(board: bigint, depth?: number): Promise<[number, number, number, number]>;
  simulateMove(board: bigint, action: Action): Promise<SimulateResult>;
  spawnTile(board: bigint, seed?: number): Promise<bigint>;
  isGameOver(board: bigint): Promise<boolean>;
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
  WEIGHT_COUNT: -3,
  NOT_INITIALIZED: -4,
  WEIGHTS_NOT_LOADED: -5,
} as const;
