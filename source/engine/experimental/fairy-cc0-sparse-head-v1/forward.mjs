// SPDX-License-Identifier: GPL-3.0-or-later
// Experimental adapter derived from Fairy-Stockfish NNUE inference mathematics.
// Upstream: https://github.com/fairy-stockfish/Fairy-Stockfish/tree/84dd49a4bd00b9959b07e1b917d362c46e6f6d75/src/nnue
// This adapter is GPL-3.0-or-later. Separately acquired network weights are CC0.
import { FORMAT } from './format.mjs';

const clip = value => Math.max(0, Math.min(127, value));
const truncDiv = (value, divisor) => Math.trunc(value / divisor) || 0;

function checkedIndices(indices, name, pieceCount) {
  if (!Array.isArray(indices) && !(ArrayBuffer.isView(indices) && !(indices instanceof DataView))) {
    throw new TypeError(`${name} must be an Array or TypedArray of integer feature indices`);
  }
  if (indices.length !== pieceCount) throw new RangeError(`${name}.length must equal pieceCount`);
  const copy = new Uint16Array(pieceCount);
  const seen = new Set();
  for (let i = 0; i < pieceCount; i++) {
    const index = indices[i];
    if (!Number.isInteger(index) || index < 0 || index >= FORMAT.featureCount) {
      throw new RangeError(`${name}[${i}] must be an integer in [0, ${FORMAT.featureCount - 1}]`);
    }
    if (seen.has(index)) throw new RangeError(`${name} contains duplicate feature index ${index}`);
    seen.add(index);
    copy[i] = index;
  }
  return copy;
}

function accumulatorStorage() {
  return {accumulation: new Int16Array(FORMAT.accumulatorSize), psqt: new Int32Array(FORMAT.psqtBuckets)};
}

function refresh(parameters, indices, storage = accumulatorStorage()) {
  const {accumulation, psqt} = storage;
  accumulation.set(parameters.ftBias);
  psqt.fill(0);
  for (const index of indices) {
    const start = index * FORMAT.accumulatorSize;
    for (let i = 0; i < FORMAT.accumulatorSize; i++) {
      // Assignment to Int16Array reproduces the upstream accumulator's 16-bit
      // wrap, rather than incorrectly keeping an unbounded JavaScript sum.
      accumulation[i] = accumulation[i] + parameters.ftWeight[start + i];
    }
    const psqtStart = index * FORMAT.psqtBuckets;
    for (let i = 0; i < FORMAT.psqtBuckets; i++) {
      psqt[i] = (psqt[i] + parameters.psqt[psqtStart + i]) | 0;
    }
  }
  return { accumulation, psqt };
}

function affine(input, layer, outputs, realInputSize, paddedInputSize) {
  const output = new Int32Array(outputs);
  for (let row = 0; row < outputs; row++) {
    let value = layer.bias[row];
    const start = row * paddedInputSize;
    // The serialized second layer has 32 columns, but only its first 16
    // columns correspond to inputs. Padding must never multiply stale data.
    for (let col = 0; col < realInputSize; col++) {
      value += layer.weight[start + col] * input[col];
    }
    output[row] = value | 0;
  }
  return output;
}

function transposeFirstHead(layer) {
  // The file is row-major. This private, one-time transpose puts all sixteen
  // output weights for one input together. Neither layout is publicly exposed.
  const weightByInput = new Int8Array(FORMAT.inputSize * FORMAT.hidden1Size);
  for (let col = 0; col < FORMAT.inputSize; col++) {
    for (let row = 0; row < FORMAT.hidden1Size; row++) {
      weightByInput[col * FORMAT.hidden1Size + row] = layer.weight[row * FORMAT.inputSize + col];
    }
  }
  return { bias: layer.bias, weightByInput };
}

function sparseFirstAffine(input, layer) {
  const bias = layer.bias, weight = layer.weightByInput;
  let v0 = bias[0], v1 = bias[1], v2 = bias[2], v3 = bias[3];
  let v4 = bias[4], v5 = bias[5], v6 = bias[6], v7 = bias[7];
  let v8 = bias[8], v9 = bias[9], v10 = bias[10], v11 = bias[11];
  let v12 = bias[12], v13 = bias[13], v14 = bias[14], v15 = bias[15];
  // All nonzero transformed inputs contribute to every lane, in exactly the
  // same ascending input order as the serialized row-major dot products.
  // Accumulate in exact JS integers and apply i32 wrap only at final storage,
  // just like affine(). Bounds: an i32 bias plus <= 1024 * 128 * 127.
  for (let col = 0; col < FORMAT.inputSize; col++) {
    const value = input[col];
    if (value === 0) continue;
    const start = col * FORMAT.hidden1Size;
    v0 += weight[start] * value;
    v1 += weight[start + 1] * value;
    v2 += weight[start + 2] * value;
    v3 += weight[start + 3] * value;
    v4 += weight[start + 4] * value;
    v5 += weight[start + 5] * value;
    v6 += weight[start + 6] * value;
    v7 += weight[start + 7] * value;
    v8 += weight[start + 8] * value;
    v9 += weight[start + 9] * value;
    v10 += weight[start + 10] * value;
    v11 += weight[start + 11] * value;
    v12 += weight[start + 12] * value;
    v13 += weight[start + 13] * value;
    v14 += weight[start + 14] * value;
    v15 += weight[start + 15] * value;
  }
  const output = new Int32Array(FORMAT.hidden1Size);
  output[0] = v0 | 0; output[1] = v1 | 0; output[2] = v2 | 0; output[3] = v3 | 0;
  output[4] = v4 | 0; output[5] = v5 | 0; output[6] = v6 | 0; output[7] = v7 | 0;
  output[8] = v8 | 0; output[9] = v9 | 0; output[10] = v10 | 0; output[11] = v11 | 0;
  output[12] = v12 | 0; output[13] = v13 | 0; output[14] = v14 | 0; output[15] = v15 | 0;
  return output;
}

function activation(input) {
  const result = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i++) result[i] = clip(input[i] >> FORMAT.weightScaleBits);
  return result;
}

// A private association, keyed by parser-created full-refresh closures. No
// weight array is published on the model, function, or session. A session can
// only be created from this module's validated, privately owned parser model.
const sessionFactories = new WeakMap();

function checkedOptions(options) {
  if (options === null || typeof options !== 'object') throw new TypeError('evaluation options are required');
  const { pieceCount, sideToMove, diagnostics = false } = options;
  if (!Number.isInteger(pieceCount) || pieceCount < 2 || pieceCount > 32) {
    throw new RangeError('pieceCount must be an integer from 2 through 32');
  }
  if (sideToMove !== 'red' && sideToMove !== 'black') {
    throw new TypeError("sideToMove must be 'red' or 'black'");
  }
  if (typeof diagnostics !== 'boolean') throw new TypeError('diagnostics must be boolean');
  // Validate and snapshot BOTH perspectives before any persistent state changes.
  const red = checkedIndices(options.red, 'red', pieceCount);
  const black = checkedIndices(options.black, 'black', pieceCount);
  return { red, black, pieceCount, sideToMove, diagnostics };
}

function evaluateStates(parameters, options, redState, blackState) {
  const { pieceCount, sideToMove, diagnostics } = options;
    const stm = sideToMove === 'red' ? redState : blackState;
    const opp = sideToMove === 'red' ? blackState : redState;
    const transformed = new Uint8Array(FORMAT.inputSize);
    for (let i = 0; i < FORMAT.accumulatorSize; i++) {
      transformed[i] = clip(stm.accumulation[i]);
      transformed[i + FORMAT.accumulatorSize] = clip(opp.accumulation[i]);
    }
    const bucket = Math.min(Math.floor((pieceCount - 1) / 4), FORMAT.stacks - 1);
    const stack = parameters.stacks[bucket];
    const hidden1Affine = sparseFirstAffine(transformed, stack[0]);
    const hidden1 = activation(hidden1Affine);
    const hidden2Affine = affine(hidden1, stack[1], FORMAT.hidden2Size, FORMAT.hidden1Size, FORMAT.hidden2PaddedInputSize);
    const hidden2 = activation(hidden2Affine);
    const denseOutput = affine(hidden2, stack[2], 1, FORMAT.hidden2Size, FORMAT.hidden2Size)[0];
    const psqtDifference = (stm.psqt[bucket] - opp.psqt[bucket]) | 0;
    const psqtTerm = truncDiv(psqtDifference, 2);
    const combined = (psqtTerm + denseOutput) | 0;
    const raw = truncDiv(combined, FORMAT.outputScale);
    if (!diagnostics) return raw;
    // Persistent session accumulators are never exposed. Every diagnostic
    // array belongs to this call, not to the model or any session.
    return Object.freeze({
      raw, adjusted: false, bucket, sideToMove, pieceCount,
      psqtDifference, psqtTerm, denseOutput, combined,
      redAccumulation: redState.accumulation.slice(), blackAccumulation: blackState.accumulation.slice(),
      redPsqt: redState.psqt.slice(), blackPsqt: blackState.psqt.slice(),
      transformed, hidden1Affine, hidden1, hidden2Affine, hidden2,
    });
}

/**
 * Internal parser handoff. Parameters must already be validated and privately
 * owned. It captures arrays and never returns them. Not a model-loading API.
 */
export function createOwnedEvaluator(parameters) {
  // Retain only the transposed first heads in private evaluator state. The
  // temporary row-major arrays created by parsing are not retained here.
  parameters = {
    ...parameters,
    stacks: parameters.stacks.map(stack => [transposeFirstHead(stack[0]), stack[1], stack[2]]),
  };
  const evaluator = function evaluateOwnedFeatures(options) {
    const checked = checkedOptions(options);
    return evaluateStates(parameters, checked,
      refresh(parameters, checked.red), refresh(parameters, checked.black));
  };
  sessionFactories.set(evaluator, () => createSession(parameters));
  return evaluator;
}

function applyColumn(parameters, state, index, sign) {
  const start = index * FORMAT.accumulatorSize;
  // Pinned architecture has512 lanes. Preserve separate Int16 writes exactly.
  for (let i = 0; i < FORMAT.accumulatorSize; i += 4) {
    state.accumulation[i] = state.accumulation[i] + sign * parameters.ftWeight[start + i];
    state.accumulation[i + 1] = state.accumulation[i + 1] + sign * parameters.ftWeight[start + i + 1];
    state.accumulation[i + 2] = state.accumulation[i + 2] + sign * parameters.ftWeight[start + i + 2];
    state.accumulation[i + 3] = state.accumulation[i + 3] + sign * parameters.ftWeight[start + i + 3];
  }
  const psqtStart = index * FORMAT.psqtBuckets;
  for (let i = 0; i < FORMAT.psqtBuckets; i++) {
    state.psqt[i] = (state.psqt[i] + sign * parameters.psqt[psqtStart + i]) | 0;
  }
}

function transition(parameters, previous, indices, scratch) {
  // Sorted owned feature snapshots make the delta exact and independent of
  // input order, Board object identity, hash collisions, or search ancestry.
  indices.sort();
  if (previous === null) return { ...refresh(parameters, indices, scratch), indices, mode: 'refresh', removed: 0, added: indices.length };
  const removed = [], added = [];
  let oldAt = 0, nextAt = 0;
  while (oldAt < previous.indices.length || nextAt < indices.length) {
    if (oldAt === previous.indices.length) added.push(indices[nextAt++]);
    else if (nextAt === indices.length) removed.push(previous.indices[oldAt++]);
    else if (previous.indices[oldAt] < indices[nextAt]) removed.push(previous.indices[oldAt++]);
    else if (previous.indices[oldAt] > indices[nextAt]) added.push(indices[nextAt++]);
    else { oldAt++; nextAt++; }
  }
  const changes = removed.length + added.length;
  if (changes === 0) return { ...previous, mode: 'unchanged', removed: 0, added: 0 };
  // Own-king bucket jumps replace all columns. Refresh is cheaper than removing
  // the entire old bucket and adding the entire new one. This cost test also
  // handles unrelated position jumps without a board-specific assumption.
  if (changes >= indices.length) return { ...refresh(parameters, indices, scratch), indices, mode: 'refresh', removed: removed.length, added: added.length };
  // Copy-before-write is transactional: neither perspective is committed until
  // both are prepared and inference succeeds. Exceptions cannot poison a search.
  scratch.accumulation.set(previous.accumulation);
  scratch.psqt.set(previous.psqt);
  const next = {
    accumulation: scratch.accumulation, psqt: scratch.psqt,
    indices, mode: 'delta', removed: removed.length, added: added.length,
  };
  for (const index of removed) applyColumn(parameters, next, index, -1);
  for (const index of added) applyColumn(parameters, next, index, 1);
  return next;
}

function createSession(parameters) {
  let redState = null, blackState = null, busy = false;
  // Two private banks per perspective. Scratch is never an active state or a
  // diagnostic result; failed preparation/inference leaves active banks intact.
  let redActive = accumulatorStorage(), redScratch = accumulatorStorage();
  let blackActive = accumulatorStorage(), blackScratch = accumulatorStorage();
  let evaluations = 0, refreshes = 0, deltas = 0, unchanged = 0, removedFeatures = 0, addedFeatures = 0;
  const evaluate = function evaluateIncrementalFeatures(options) {
    if (busy) throw new Error('Incremental evaluator session is not reentrant');
    busy = true;
    try {
      const checked = checkedOptions(options);
      const nextRed = transition(parameters, redState, checked.red, redScratch);
      const nextBlack = transition(parameters, blackState, checked.black, blackScratch);
      const result = evaluateStates(parameters, checked, nextRed, nextBlack);
      // Commit only after BOTH perspectives and diagnostics/inference succeed.
      // An unchanged perspective still uses its active bank: do not swap it.
      if (nextRed.accumulation === redScratch.accumulation) {
        const old = redActive; redActive = redScratch; redScratch = old;
      }
      if (nextBlack.accumulation === blackScratch.accumulation) {
        const old = blackActive; blackActive = blackScratch; blackScratch = old;
      }
      redState = nextRed;
      blackState = nextBlack;
      evaluations++;
      for (const state of [nextRed, nextBlack]) {
        if (state.mode === 'refresh') refreshes++;
        else if (state.mode === 'delta') deltas++;
        else unchanged++;
        removedFeatures += state.removed;
        addedFeatures += state.added;
      }
      return result;
    } finally { busy = false; }
  };
  Object.defineProperties(evaluate, {
    reset: { value: () => {
      if (busy) throw new Error('Cannot reset a busy incremental evaluator session');
      redState = null; blackState = null;
      evaluations = refreshes = deltas = unchanged = removedFeatures = addedFeatures = 0;
    } },
    stats: { value: () => Object.freeze({ evaluations, refreshes, deltas, unchanged, removedFeatures, addedFeatures }) },
  });
  return Object.freeze(evaluate);
}

/** Create one independent feature session from this directory's parseNnue(). */
export function createIncrementalFeatureEvaluator(model) {
  const factory = model && typeof model === 'object' && sessionFactories.get(model.evaluateFeatures);
  if (!factory) throw new TypeError('Expected NNUE model parsed by this incremental runtime');
  return factory();
}

/** Evaluate full-refresh features using a model returned by parseNnue(). */
export function evaluateFeatures(model, options) {
  if (model === null || typeof model !== 'object' || typeof model.evaluateFeatures !== 'function') {
    throw new TypeError('model must be a parsed NNUE model');
  }
  return model.evaluateFeatures(options);
}
