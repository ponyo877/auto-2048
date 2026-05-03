#!/usr/bin/env bash
# Build TDL2048+ for the browser via Emscripten.
# Requires: emsdk activated (`source ~/emsdk/emsdk_env.sh`).
#
# Outputs to ../public/solver.{js,wasm}.

set -euo pipefail

cd "$(dirname "$0")"

if ! command -v emcc >/dev/null 2>&1; then
  echo "ERROR: emcc not found. Install emsdk first:" >&2
  echo "  git clone https://github.com/emscripten-core/emsdk.git ~/emsdk" >&2
  echo "  cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest" >&2
  echo "  source ~/emsdk/emsdk_env.sh" >&2
  exit 1
fi

if [ ! -f "third_party/TDL2048/2048.cpp" ]; then
  echo "ERROR: TDL2048 submodule not initialised. Run:" >&2
  echo "  git submodule update --init --recursive" >&2
  exit 1
fi

# NOTE: v1 wrapper.cpp is self-contained and does NOT include TDL2048+
# headers (libc++ specialisations in TDL2048+ master fail under emcc 5.0.7
# libc++; porting is multi-day). Keep submodule for future Phase upgrades.

mkdir -p ../public

EXPORTED_FUNCTIONS='["_solver_init","_solver_load_weights","_solver_step","_solver_dispose","_malloc","_free"]'
EXPORTED_RUNTIME='["cwrap","HEAPU8"]'

emcc \
  -std=c++17 \
  -O3 \
  -msimd128 \
  -DNDEBUG \
  -I . \
  wrapper.cpp \
  -s WASM=1 \
  -s WASM_BIGINT=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=67108864 \
  -s MAXIMUM_MEMORY=2147483648 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME=createSolverModule \
  -s ENVIRONMENT=web,worker,node \
  -s EXPORTED_FUNCTIONS="$EXPORTED_FUNCTIONS" \
  -s EXPORTED_RUNTIME_METHODS="$EXPORTED_RUNTIME" \
  -o ../public/solver.js

echo "[build] ok -> ../public/solver.{js,wasm}"
ls -lh ../public/solver.js ../public/solver.wasm
