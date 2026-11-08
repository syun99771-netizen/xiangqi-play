// SPDX-License-Identifier: GPL-3.0-or-later
// Exact cache of the ORIGINAL, unadjusted raw CC0 static evaluator only.
// Never accepts arbitrary evaluators, search values, history, weights, or bounds.
import {createIncrementalEvaluator, SCORE_CONTRACT} from '../fairy-cc0-sparse-head-v1/search-adapter.mjs';

export const CACHE_ENTRIES = 16384;
export const CACHE_STORAGE_BYTES = CACHE_ENTRIES * (90 + 1 + 4 + 4 + 8 + 1);
export const CACHE_CONTRACT = Object.freeze({
  id: 'cc0-static-eval-cache-v1', entries: CACHE_ENTRIES,
  storageBytes: CACHE_STORAGE_BYTES, replacement: 'direct-mapped',
  identity: '90 exact signed piece codes and side to move; hash tags only filter',
  value: SCORE_CONTRACT.id,
  lifecycle: 'one private cache and arbitrary-jump accumulator per Search; no cross-model sharing',
  invalidHash: 'bypass cache; do not normalize, reject, repair or trust malformed hash metadata',
  staleHash: 'may lower hit rate; full identity comparison still prevents false hits',
});
const isU32 = n => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;

/**
 * The parser-owned immutable model/session and fixed cp conversion are the
 * only backend. Cache hits deliberately DO NOT advance the accumulator. Its
 * next miss is an arbitrary jump, supported exactly by the original adapter.
 * A successful miss publishes validity last. A failed raw evaluation leaves the
 * old entry intact; a failed publication invalidates the replaced entry.
 * Board counters, history and stale board.kings metadata are not consulted.
 */
export function createCachedEvaluator(model) {
  const raw = createIncrementalEvaluator(model);
  const lo = new Uint32Array(CACHE_ENTRIES), hi = new Uint32Array(CACHE_ENTRIES);
  const squares = new Int8Array(CACHE_ENTRIES * 90), sides = new Int8Array(CACHE_ENTRIES);
  const values = new Float64Array(CACHE_ENTRIES), valid = new Uint8Array(CACHE_ENTRIES);
  let requests = 0, hits = 0, misses = 0, boardCollisions = 0, tagReplacements = 0;
  let rawEvaluations = 0, invalidHashBypasses = 0, occupied = 0, busy = false;
  const evaluate = board => {
    if (busy) throw new Error('Static evaluation cache is not reentrant');
    busy = true;
    try {
      requests++;
      const b = board?.squares, turn = board?.turn;
      // Unsupported/invalid boards go through the unchanged validating backend.
      const shapeOK = (Array.isArray(b) || ArrayBuffer.isView(b)) && b.length === 90 && (turn === 1 || turn === -1);
      const hashLo = board?.hashLo, hashHi = board?.hashHi;
      const hashOK = isU32(hashLo) && isU32(hashHi);
      let slot = -1, offset = 0;
      if (shapeOK && hashOK) {
        slot = (hashLo ^ hashHi) & (CACHE_ENTRIES - 1);
        offset = slot * 90;
        if (valid[slot]) {
          if (lo[slot] === hashLo && hi[slot] === hashHi) {
            let same = sides[slot] === turn;
            for (let i = 0; same && i < 90; i++) if (squares[offset + i] !== b[i]) same = false;
            if (same) { hits++; return values[slot]; }
            boardCollisions++;
          } else tagReplacements++;
        }
      } else if (!hashOK) invalidHashBypasses++;
      misses++;
      rawEvaluations++;
      const value = raw(board);
      if (slot >= 0) {
        // Replacement must revoke old validity BEFORE touching any slot bytes.
        // If an exotic Array getter throws during publication, no mixed snapshot
        // can remain valid. Stable SDK Int8Array boards do not throw here.
        if(valid[slot]){valid[slot]=0;occupied--;}
        // Only validated pieces (integers in +/-[1,7] or zero) reach this point.
        for (let i = 0; i < 90; i++) squares[offset + i] = b[i];
        lo[slot] = hashLo; hi[slot] = hashHi; sides[slot] = turn; values[slot] = value;
        if (!valid[slot]) occupied++;
        valid[slot] = 1;
      }
      return value;
    } finally { busy = false; }
  };
  Object.defineProperties(evaluate, {
    scoreContract: {value: SCORE_CONTRACT},
    cacheContract: {value: CACHE_CONTRACT},
    stats: {value: () => Object.freeze({
      requests, hits, misses, boardCollisions, tagReplacements, rawEvaluations,
      invalidHashBypasses, occupied, capacity: CACHE_ENTRIES,
      storageBytes: lo.byteLength + hi.byteLength + squares.byteLength + sides.byteLength + values.byteLength + valid.byteLength,
      raw: raw.stats(),
    })},
    reset: {value: () => {
      if (busy) throw new Error('Cannot reset a busy static evaluation cache');
      raw.reset(); valid.fill(0);
      requests = hits = misses = boardCollisions = tagReplacements = rawEvaluations = invalidHashBypasses = occupied = 0;
    }},
  });
  return Object.freeze(evaluate);
}
