#!/usr/bin/env node
/* Emit a 4x6patt structure-only .w file with all-zero weights.
 *
 * Useful for end-to-end testing the load path even when the public TC-trained
 * weights are not available. With zero weights the WASM solver collapses to
 * pure-reward greedy play (no positional value); useful for smoke tests.
 *
 * Usage: node tools/gen_dummy_weights.mjs > public/weights/4x6patt.zero.w
 */
import { writeFileSync } from 'node:fs';

const FEATURE_COUNT = 4;
const PATTERN_SIZE = 16 ** 6;          /* 16,777,216 */
const PER_PATTERN_BYTES = 1 + 4 + 2 + 2 + 2 + 8 + PATTERN_SIZE * 4 + 2;
const TOTAL = 1 + 4 + FEATURE_COUNT * PER_PATTERN_BYTES;

const buf = Buffer.alloc(TOTAL);
let off = 0;
buf.writeUInt8(0, off); off += 1;          /* wrapper code */
buf.writeUInt32LE(FEATURE_COUNT, off); off += 4;
const SIGNATURES = [0x012345, 0x456789, 0x012456, 0x45689a];
for (let i = 0; i < FEATURE_COUNT; i++) {
  buf.writeUInt8(4, off); off += 1;        /* entry code */
  buf.writeUInt32LE(SIGNATURES[i], off); off += 4;
  buf.writeUInt16LE(0, off); off += 2;     /* sign_size legacy */
  buf.writeUInt16LE(0, off); off += 2;     /* reserved */
  buf.writeUInt16LE(4, off); off += 2;     /* blkz = float32 */
  buf.writeBigUInt64LE(BigInt(PATTERN_SIZE), off); off += 8;
  /* PATTERN_SIZE * 4 zero bytes already from Buffer.alloc */
  off += PATTERN_SIZE * 4;
  buf.writeUInt16LE(0, off); off += 2;     /* terminator */
}
const path = process.argv[2] ?? '/dev/stdout';
writeFileSync(path, buf);
process.stderr.write(`wrote ${TOTAL} bytes to ${path}\n`);
