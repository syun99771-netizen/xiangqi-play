// SPDX-License-Identifier: GPL-3.0-or-later
// Experimental JavaScript adapter derived from Fairy-Stockfish's NNUE file
// format and inference mathematics. Model weights have a separate CC0 license.

/** This is one pinned architecture, NOT a generic Stockfish NNUE reader. */
export const FORMAT = Object.freeze({
  version: 0x7AF32F20,
  networkHash: 0x3c103e72,
  featureTransformerHash: 0x5f2348b8,
  stackHash: 0x633376ca,
  featureCount: 10530,
  accumulatorSize: 512,
  psqtBuckets: 8,
  stacks: 8,
  inputSize: 1024,
  hidden1Size: 16,
  hidden2Size: 32,
  hidden2PaddedInputSize: 32,
  outputSize: 1,
  weightScaleBits: 6,
  outputScale: 16,
  descriptionBytes: 92,
  byteLength: 11261932,
});

const ftBiasOffset = 12 + FORMAT.descriptionBytes + 4;
const ftWeightOffset = ftBiasOffset + FORMAT.accumulatorSize * 2;
const psqtOffset = ftWeightOffset + FORMAT.featureCount * FORMAT.accumulatorSize * 2;
const stackOffset = psqtOffset + FORMAT.featureCount * FORMAT.psqtBuckets * 4;
const stackBytes = 4 + 16 * 4 + 16 * 1024 + 32 * 4 + 32 * 32 + 4 + 32;

/** Byte offsets are exposed for reproducibility; no parameter arrays are exposed. */
export const LAYOUT = Object.freeze({
  descriptionOffset: 12,
  featureTransformerHashOffset: 12 + FORMAT.descriptionBytes,
  ftBiasOffset,
  ftWeightOffset,
  psqtOffset,
  stackOffset,
  stackBytes,
});
