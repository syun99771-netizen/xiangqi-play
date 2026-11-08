// SPDX-License-Identifier: GPL-3.0-or-later
// Portable transcription of the frozen configuration, not an import of Node tooling.
import {assertRequestRecord, validateRequest} from '../../src/sdk/core.js';
import {SCORE_CONTRACT} from '../fairy-cc0-sparse-head-v1/search-adapter.mjs';
export const PROFILE_ID = 'strict-composite-cc0-public-b562-v2';
export const EXPECTED_MODEL_SHA256 = 'c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11';
export const BENCHMARK_SEARCH_OPTIONS = Object.freeze({
  tt: true, ttBounds: false, lmr: false, checkExtensions: 0, checkAware: true,
  typedTT: false, rootPvs: false, nullMove: false, directOrdering: false,
  ruleProfile: 'pikafish-public-b562', qsearchRepetition: true,
  repetitionPolicy: 'verified-check-terminal', fastStrictHistory: true,
});
export const BENCHMARK_PROFILE = Object.freeze({
  descendantRules: 'public-b562-coherent-subnodes-v1', rootRules:'public-b562-rule_judge-0',
  id: PROFILE_ID, searchOptions: BENCHMARK_SEARCH_OPTIONS,
  moveGenerator: 'generateLegalMovesFast', attackMethod: 'isAttackedFast',
  defaultDepthCap: 16, expectedModelSha256: EXPECTED_MODEL_SHA256,
  modelIdentityVerified: false, nativeRefereeIncluded: false,
  codeLicense: 'GPL-3.0-or-later', declaredWeightLicense: 'CC0-1.0',
});
export function benchmarkSearchOptions(arm = 'candidate') {
  if (!['baseline', 'candidate'].includes(arm)) throw new Error('Unknown CC0 arm');
  return {...BENCHMARK_SEARCH_OPTIONS,
    valueEvaluator: arm === 'candidate' ? 'fairy-cc0-exact-sparse-static-cache-v1' : 'handcrafted-v1',
    valueModelSha256: arm === 'candidate' ? EXPECTED_MODEL_SHA256 : null,
    valueNeuralEnabled: arm === 'candidate',
    valueInference: arm === 'candidate' ? 'pure-js-incremental' : 'handcrafted',
    valueScoreContract: arm === 'candidate' ? SCORE_CONTRACT.id : 'handcrafted-cp-v1',
  };
}

/** Instance-local bindings and descriptor restoration match the frozen factory. */
export function configureBenchmarkBoard(board, arm = 'candidate') {
  const searchOptions = benchmarkSearchOptions(arm);
  const descriptor = Object.getOwnPropertyDescriptor(board, 'generateLegalMoves');
  const attackDescriptor = Object.getOwnPropertyDescriptor(board, 'isAttacked');
  const restore = () => {
    if (descriptor) Object.defineProperty(board, 'generateLegalMoves', descriptor);
    else delete board.generateLegalMoves;
    if (attackDescriptor) Object.defineProperty(board, 'isAttacked', attackDescriptor);
    else delete board.isAttacked;
  };
  try {
    board.generateLegalMoves = board.generateLegalMovesFast.bind(board);
    board.isAttacked = board.isAttackedFast.bind(board);
  } catch (error) {restore(); throw error;}
  return {candidateKind: PROFILE_ID, searchOptions,
    attackMethod: 'isAttackedFast', moveGenerator: 'generateLegalMovesFast', neuralModel: null, restore};
}
const copyRecord = value => Object.fromEntries(Object.getOwnPropertyNames(value)
  .map(key => [key, Object.getOwnPropertyDescriptor(value, key).value]));

/** Public request options cannot silently drift from the selected profile. */
export function benchmarkRequest(input) {
  assertRequestRecord(input);
  const normalized = validateRequest(input); // Reject accessors/unknown keys first.
  const request = copyRecord(input), options = copyRecord(request.options ?? {});
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(BENCHMARK_SEARCH_OPTIONS, key) || value !== BENCHMARK_SEARCH_OPTIONS[key])
      throw new Error(`Benchmark profile conflicts with option ${key}`);
  }
  if (!normalized.historyComplete) throw new Error('Benchmark profile requires complete chronological history');
  const limits = copyRecord(request.limits ?? {});
  if (!Object.hasOwn(limits, 'nodes') && !Object.hasOwn(limits, 'movetime'))
    throw new Error('Benchmark profile requires an explicit nodes or movetime budget');
  if (!Object.hasOwn(limits, 'depth')) limits.depth = BENCHMARK_PROFILE.defaultDepthCap;
  return {...request, moves: normalized.moves, historyComplete: true,
    options: {...BENCHMARK_SEARCH_OPTIONS}, limits};
}
