// SPDX-License-Identifier: GPL-3.0-or-later
import {preparePosition} from './engine/src/sdk/core.js';
import {Search, MATE} from './engine/src/search-public-b562.js';
import {moveToUci} from './engine/src/board.js';
import {parseNnue} from './engine/experimental/fairy-cc0-sparse-head-v1/parser.mjs';
import {createCachedEvaluator} from './engine/experimental/cc0-static-eval-cache-v1/cache.mjs';
import {withPublicSearchCapabilities} from './engine/src/public-search-capabilities.js';
import {BENCHMARK_PROFILE, benchmarkRequest, configureBenchmarkBoard} from './engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
export {BENCHMARK_PROFILE};
const models = new WeakMap();
export function loadCc0BenchmarkModel(bytes) {
  const parsed = parseNnue(bytes);
  const handle = Object.freeze({format: parsed.format, byteLength: parsed.byteLength,
    description: parsed.description, profile: BENCHMARK_PROFILE});
  models.set(handle, parsed); return handle;
}

/**
 * Retain one player per game to match the frozen Search/TT lifetime.
 * Caller owns complete legal history, limits, adjudication and config.restore().
 */
function createCc0BenchmarkPlayer(board, {model, arm = 'candidate', clock, timeBasis} = {}) {
  const parsed = models.get(model);
  if (arm === 'candidate' && !parsed) throw new TypeError('Expected loadCc0BenchmarkModel handle');
  const evaluator = arm === 'candidate' ? createCachedEvaluator(parsed) : null;
  const config = configureBenchmarkBoard(board, arm);
  try {
    return {config, search: new Search({...config.searchOptions, clock, timeBasis, ...(evaluator ? {evaluator} : {})})};
  } catch (error) {config.restore(); throw error;}
}

/** One-shot profile search, not a retained match session or native referee. */
export function runCc0BenchmarkSearch(input, {model, onInfo = () => {}, stopFlag} = {}) {
  if (typeof onInfo !== 'function') throw new TypeError('onInfo must be a function');
  const prepared = preparePosition(benchmarkRequest(input));
  const {requestId, board, origin, limits, judge, context: rootContext} = prepared;
  const context = withPublicSearchCapabilities(rootContext);
  const profile = BENCHMARK_PROFILE;
  if (context.adjudication.terminal) {
    const {winner, reason} = context.adjudication;
    return {type: 'result', requestId, status: 'terminal', terminal: true, move: null, pv: [],
      score: winner === 0 ? 0 : winner === board.turn ? MATE : -MATE,
      depth: 0, nodes: 0, time: 0, reason, context, profile};
  }
  if (!models.has(model)) throw new TypeError('Expected loadCc0BenchmarkModel handle');
  const player = createCc0BenchmarkPlayer(board, {model});
  try {
    const result = player.search.run(board, {...limits, stopFlag, gameHistory: judge.states,
      historyComplete: true, historyOriginFEN: origin,
      onInfo: info => onInfo({type: 'info', requestId, ...info, pv: info.pv.map(moveToUci), context, profile})});
    return {...result, type: 'result', requestId,
      status: result.depth > 0 ? 'completed-iteration' : 'budget-exhausted', terminal: false,
      move: result.move === null ? null : moveToUci(result.move), pv: result.pv.map(moveToUci), context, profile};
  } finally {player.config.restore();}
}
