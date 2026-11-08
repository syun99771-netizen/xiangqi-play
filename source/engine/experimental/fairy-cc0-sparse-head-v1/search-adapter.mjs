// SPDX-License-Identifier: GPL-3.0-or-later
// Source-derived units: Fairy-Stockfish 84dd49a4bd00b9959b07e1b917d362c46e6f6d75.
// Network weights have their own separately documented CC0 declaration.
import { activeFeatures } from './features.mjs';
import { evaluateFeatures, createIncrementalFeatureEvaluator } from './forward.mjs';

export const SCORE_CONTRACT = Object.freeze({
  id: 'fairy-cc0-unadjusted-raw-to-cp-v1',
  perspective: 'side-to-move',
  conversion: 'truncate toward zero: 100 * unadjusted NNUE Value / 208',
  adjustedPsqtDense: false,
  materialScale: false,
  shuffleDamping: false,
  residual: false,
  note: 'Standalone full evaluator; intentionally not Fairy final Eval::evaluate. Search retains its own terminal band and rule policy.'
});

export function rawValueToCentipawns(raw) {
  if (!Number.isInteger(raw) || !Number.isSafeInteger(raw * 100)) throw new TypeError('Expected a safe integral raw NNUE Value');
  return Math.trunc(raw * 100 / 208) || 0;
}

/** Portable full-refresh proof-of-concept. No native fallback or model mutation. */
export function createFullRefreshEvaluator(model) {
  if (!model || typeof model.evaluateFeatures !== 'function') throw new TypeError('Expected parsed NNUE model');
  const evaluate = board => {
    if (!board || (board.turn !== 1 && board.turn !== -1)) throw new TypeError('Expected Board turn +/-1');
    const red = activeFeatures(board, 1);
    const black = activeFeatures(board, -1);
    return rawValueToCentipawns(evaluateFeatures(model, {
      red, black, pieceCount: red.length, sideToMove: board.turn === 1 ? 'red' : 'black'
    }));
  };
  Object.defineProperty(evaluate, 'scoreContract', {value: SCORE_CONTRACT});
  return Object.freeze(evaluate);
}

/**
 * One private, independent accumulator session. Construct once per Search.
 * Arbitrary board jumps and interrupted/resumed searches need no push/pop hook.
 * The host still owns legal-position checks and the static-score safety band.
 */
export function createIncrementalEvaluator(model) {
  const session = createIncrementalFeatureEvaluator(model);
  const evaluate = board => {
    if (!board || (board.turn !== 1 && board.turn !== -1)) throw new TypeError('Expected Board turn +/-1');
    const sideToMove = board.turn === 1 ? 'red' : 'black';
    const red = activeFeatures(board, 1);
    const black = activeFeatures(board, -1);
    return rawValueToCentipawns(session({ red, black, pieceCount: red.length, sideToMove }));
  };
  Object.defineProperties(evaluate, {
    scoreContract: { value: SCORE_CONTRACT },
    reset: { value: session.reset },
    stats: { value: session.stats },
  });
  return Object.freeze(evaluate);
}
