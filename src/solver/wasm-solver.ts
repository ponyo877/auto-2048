import { SolverError, SOLVER_ERROR_CODES } from './types';
import type { ActionResult, Solver, SolverConfig } from './types';
import { fetchWeights } from './fetch-weights';

interface EmModule {
  cwrap: (name: string, ret: string | null, args: string[]) => (...a: unknown[]) => unknown;
  HEAPU8: Uint8Array;
  _malloc: (n: number) => number;
  _free: (ptr: number) => void;
}

interface CoreApi {
  init: (network: string) => number;
  load: (ptr: number, size: number) => number;
  step: (board: bigint, depth: number) => number;
  dispose: () => void;
}

function bind(mod: EmModule): CoreApi {
  const cw = mod.cwrap;
  return {
    init:    cw('solver_init', 'number', ['string'])                          as (n: string) => number,
    load:    cw('solver_load_weights', 'number', ['number', 'number'])        as (p: number, s: number) => number,
    step:    cw('solver_step', 'number', ['bigint', 'number'])                as (b: bigint, d: number) => number,
    dispose: cw('solver_dispose', null, [])                                   as () => void,
  };
}

function pushWeights(api: CoreApi, mod: EmModule, buf: Uint8Array): void {
  const ptr = mod._malloc(buf.byteLength);
  mod.HEAPU8.set(buf, ptr);
  try {
    const code = api.load(ptr, buf.byteLength);
    if (code !== SOLVER_ERROR_CODES.OK) throw new SolverError(code, 'weight load failed');
  } finally {
    mod._free(ptr);
  }
}

async function resolveWeights(config: SolverConfig): Promise<Uint8Array | undefined> {
  if (config.weightsBytes) return config.weightsBytes;
  if (config.weightsUrl) return fetchWeights(config.weightsUrl);
  return undefined;
}

class WasmSolver implements Solver {
  constructor(private readonly api: CoreApi) {}

  async step(board: bigint, depth = 1): Promise<ActionResult> {
    const r = this.api.step(board, depth);
    if (r === -1 || r === 0 || r === 1 || r === 2 || r === 3) return r as ActionResult;
    throw new SolverError(r, 'unexpected step result');
  }

  async dispose(): Promise<void> { this.api.dispose(); }
}

export interface WasmFactoryArgs { locateFile?: (p: string) => string; }
export type WasmFactory = (a: WasmFactoryArgs) => Promise<EmModule>;

export async function createWasmSolverFromFactory(
  factory: WasmFactory,
  config: SolverConfig,
  wasmDir = '/',
): Promise<Solver> {
  const mod = await factory({ locateFile: (p) => `${wasmDir}${p}` });
  const api = bind(mod);
  if (api.init(config.network) !== SOLVER_ERROR_CODES.OK) {
    throw new SolverError(SOLVER_ERROR_CODES.INVALID_NETWORK, `init failed: ${config.network}`);
  }
  const buf = await resolveWeights(config);
  if (buf) pushWeights(api, mod, buf);
  return new WasmSolver(api);
}
