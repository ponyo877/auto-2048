/** Returns null when the runtime supports everything the solver
 *  needs, or a short user-facing explanation when it does not. */
export function checkBrowserSupport(): string | null {
  if (typeof BigInt !== 'function') {
    return 'This browser does not support BigInt. Please use a current Chrome, Safari 14+, Firefox or Edge.';
  }
  if (typeof DecompressionStream !== 'function') {
    return 'This browser does not support DecompressionStream. Please update to Safari 16.4+, Chrome 91+, Firefox 113+, or Edge.';
  }
  if (typeof WebAssembly === 'undefined' || typeof WebAssembly.validate !== 'function') {
    return 'This browser does not support WebAssembly.';
  }
  if (!supportsWasmSimd()) {
    return 'This browser does not support WebAssembly SIMD. Please update to Safari 16.4+, Chrome 91+, or Firefox 89+.';
  }
  return null;
}

/* Canonical WASM SIMD probe from Google's wasm-feature-detect.
 * If WebAssembly.validate accepts it, the engine has SIMD support. */
const SIMD_PROBE = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x0a, 0x01, 0x08, 0x00, 0x41, 0x00,
  0xfd, 0x0f, 0xfd, 0x62, 0x0b,
]);

function supportsWasmSimd(): boolean {
  try { return WebAssembly.validate(SIMD_PROBE); }
  catch { return false; }
}
