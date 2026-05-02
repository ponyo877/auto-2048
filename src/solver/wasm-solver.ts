/**
 * WASM-backed Solver. Loads /solver.js (emcc ES6 output) at init time and
 * binds extern "C" entry points via cwrap. uint64_t parameters are JS BigInt
 * thanks to the build flag `-sWASM_BIGINT=1`.
 */
import { SolverError, SOLVER_ERROR_CODES } from './types';
import type {
  Action, ActionResult, SimulateResult, Solver, SolverConfig,
} from './types';

interface EmModule {
  cwrap: (name: string, ret: string | null, args: string[]) => (...a: unknown[]) => unknown;
  HEAPU8: Uint8Array;
  HEAPF32: Float32Array;
  _malloc: (n: number) => number;
  _free: (ptr: number) => void;
  _solver_evaluate_actions: (board: bigint, depth: number, ptr: number) => void;
}

interface CoreApi {
  init: (network: string) => number;
  load: (ptr: number, size: number) => number;
  step: (board: bigint, depth: number) => number;
  evaluate: (board: bigint) => number;
  simulate: (board: bigint, action: number, ptr: number) => bigint;
  spawn: (board: bigint, seed: number) => bigint;
  dispose: () => void;
}

function bind(mod: EmModule): CoreApi {
  const cw = mod.cwrap;
  return {
    init:     cw('solver_init', 'number', ['string'])           as (n: string) => number,
    load:     cw('solver_load_weights', 'number', ['number','number']) as (p: number, s: number) => number,
    step:     cw('solver_step', 'number', ['bigint','number'])  as (b: bigint, d: number) => number,
    evaluate: cw('solver_evaluate', 'number', ['bigint'])       as (b: bigint) => number,
    simulate: cw('solver_simulate_move', 'bigint', ['bigint','number','number']) as (b: bigint, a: number, p: number) => bigint,
    spawn:    cw('solver_spawn_tile', 'bigint', ['bigint','number']) as (b: bigint, s: number) => bigint,
    dispose:  cw('solver_dispose', null, [])                    as () => void,
  };
}

async function fetchWeights(url: string): Promise<Uint8Array> {
  const res = await fetch(url);
  if (!res.ok) throw new SolverError('fetch', `weights fetch ${res.status}`);
  if (!url.endsWith('.gz')) return new Uint8Array(await res.arrayBuffer());
  const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function pushWeights(api: CoreApi, mod: EmModule, url: string): Promise<void> {
  const buf = await fetchWeights(url);
  const ptr = mod._malloc(buf.byteLength);
  mod.HEAPU8.set(buf, ptr);
  try {
    const code = api.load(ptr, buf.byteLength);
    if (code !== SOLVER_ERROR_CODES.OK) throw new SolverError(code, 'weight load failed');
  } finally {
    mod._free(ptr);
  }
}

class WasmSolver implements Solver {
  constructor(private readonly api: CoreApi, private readonly mod: EmModule) {}

  async step(board: bigint, depth = 1): Promise<ActionResult> {
    const r = this.api.step(board, depth);
    if (r === -1 || r === 0 || r === 1 || r === 2 || r === 3) return r as ActionResult;
    throw new SolverError(r, 'unexpected step result');
  }

  async evaluate(board: bigint): Promise<number> { return this.api.evaluate(board); }

  async evaluateActions(board: bigint, depth = 1): Promise<[number, number, number, number]> {
    const ptr = this.mod._malloc(16);
    try {
      this.mod._solver_evaluate_actions(board, depth, ptr);
      const v = this.mod.HEAPF32.subarray(ptr / 4, ptr / 4 + 4);
      return [v[0], v[1], v[2], v[3]];
    } finally {
      this.mod._free(ptr);
    }
  }

  async simulateMove(board: bigint, action: Action): Promise<SimulateResult> {
    const ptr = this.mod._malloc(4);
    try {
      const after = this.api.simulate(board, action, ptr);
      const reward = new DataView(this.mod.HEAPU8.buffer, ptr, 4).getUint32(0, true);
      return { after, reward };
    } finally {
      this.mod._free(ptr);
    }
  }

  async spawnTile(board: bigint, seed = 0): Promise<bigint> { return this.api.spawn(board, seed); }

  async isGameOver(board: bigint): Promise<boolean> {
    return (await this.step(board, 1)) === -1;
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
  if (config.weightsUrl) await pushWeights(api, mod, config.weightsUrl);
  return new WasmSolver(api, mod);
}
