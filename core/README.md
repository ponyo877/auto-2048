# core/ — WASM solver

Self-contained 4x6patt N-Tuple solver compiled to WebAssembly with
Emscripten. Loaded by `src/solver/wasm-solver.ts` over a small extern
"C" ABI:

| symbol               | use |
|----------------------|-----|
| `solver_init`        | register feature layout, build LUTs |
| `solver_load_weights`| parse the .w stream into `WEIGHTS[]` |
| `solver_step`        | best action via expectimax |
| `solver_dispose`     | release weights, mark uninitialised |

## Build

Requires emsdk activated (`source ~/emsdk/emsdk_env.sh`):

```bash
bash core/build.sh
```

Outputs `public/solver.{js,wasm}`.

## Weights

The runtime uses the official TDL2048+ structure-only `.w` file, which
the wrapper parses directly without conversion. Get it once:

```bash
curl -O https://moporgic.info/2048/model/4x6patt.w.xz
xz -d 4x6patt.w.xz
gzip -k 4x6patt.w
mv 4x6patt.w.gz public/weights/4x6patt.trained.w.gz
```

The `.w` files themselves are gitignored (167 MB compressed,
256 MB raw); regenerate as above.
