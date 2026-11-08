// SPDX-License-Identifier: GPL-3.0-or-later
// Experimental adapter derived from Fairy-Stockfish NNUE serialization.
// Upstream: https://github.com/fairy-stockfish/Fairy-Stockfish/tree/84dd49a4bd00b9959b07e1b917d362c46e6f6d75/src/nnue
// This adapter is GPL-3.0-or-later. Network weights have a separate CC0 license.
import { FORMAT, LAYOUT } from './format.mjs';
import { createOwnedEvaluator } from './forward.mjs';

function bytesOf(input) {
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input) && input.buffer instanceof ArrayBuffer) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }
  throw new TypeError('NNUE input must be an ArrayBuffer or an ArrayBuffer-backed view; shared buffers are rejected');
}

function expectUint32(view, offset, expected, label) {
  const actual = view.getUint32(offset, true);
  if (actual !== expected) {
    throw new RangeError(`Unsupported NNUE ${label}: 0x${actual.toString(16)} (expected 0x${expected.toString(16)})`);
  }
}

/**
 * Parse exactly the pinned 10530x512, 8-stack Xiangqi architecture.
 * Structural hashes are NOT cryptographic model-identity verification.
 * Callers must independently authenticate the downloaded weight file.
 * No source bytes or parameter views are retained in public metadata.
 */
export function parseNnue(input) {
  const bytes = bytesOf(input);
  // Exact byte count checked before parameter allocation. Declared sizes can
  // never cause attacker-controlled allocation or a generic architecture load.
  if (bytes.byteLength !== FORMAT.byteLength) {
    throw new RangeError(`NNUE byte length ${bytes.byteLength} does not equal pinned length ${FORMAT.byteLength}`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  expectUint32(view, 0, FORMAT.version, 'version');
  expectUint32(view, 4, FORMAT.networkHash, 'network hash');
  expectUint32(view, 8, FORMAT.descriptionBytes, 'description length');
  expectUint32(view, LAYOUT.featureTransformerHashOffset, FORMAT.featureTransformerHash, 'feature transformer hash');
  // Preflight every subnetwork header before allocating any parameter arrays.
  for (let stack = 0; stack < FORMAT.stacks; stack++) {
    expectUint32(view, LAYOUT.stackOffset + stack * LAYOUT.stackBytes, FORMAT.stackHash, `stack ${stack} hash`);
  }
  let description = '';
  for (let i = 0; i < FORMAT.descriptionBytes; i++) {
    const byte = bytes[LAYOUT.descriptionOffset + i];
    if (byte < 0x20 || byte > 0x7e) throw new RangeError('NNUE description must contain printable ASCII bytes');
    description += String.fromCharCode(byte);
  }
  let offset = LAYOUT.ftBiasOffset;
  const readI16 = count => {
    const values = new Int16Array(count);
    for (let i = 0; i < count; i++, offset += 2) values[i] = view.getInt16(offset, true);
    return values;
  };
  const readI32 = count => {
    const values = new Int32Array(count);
    for (let i = 0; i < count; i++, offset += 4) values[i] = view.getInt32(offset, true);
    return values;
  };
  const readI8 = count => {
    const values = new Int8Array(count);
    for (let i = 0; i < count; i++, offset++) values[i] = view.getInt8(offset);
    return values;
  };
  const parameters = {
    ftBias: readI16(FORMAT.accumulatorSize),
    ftWeight: readI16(FORMAT.featureCount * FORMAT.accumulatorSize),
    psqt: readI32(FORMAT.featureCount * FORMAT.psqtBuckets),
    stacks: [],
  };
  for (let stack = 0; stack < FORMAT.stacks; stack++) {
    offset += 4; // Already validated above.
    parameters.stacks.push([
      { bias: readI32(16), weight: readI8(16 * 1024) },
      { bias: readI32(32), weight: readI8(32 * 32) },
      { bias: readI32(1), weight: readI8(32) },
    ]);
  }
  if (offset !== bytes.byteLength) throw new RangeError('NNUE parser did not consume the exact input');
  return Object.freeze({
    format: 'fairy-cc0-xiangqi-nnue-v1',
    description,
    byteLength: bytes.byteLength,
    architecture: FORMAT,
    evaluateFeatures: createOwnedEvaluator(parameters),
  });
}
