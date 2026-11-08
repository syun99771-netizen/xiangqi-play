import test from 'node:test';
import assert from 'node:assert/strict';
import {preflight, START_FEN, SDK_LIMITS} from '../api.mjs';
import {preparePosition, validateRequest} from '../engine/src/sdk/core.js';
import {Board, uciToMove, moveToUci} from '../engine/src/board.js';
import {Search} from '../engine/src/search-public-b562.js';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';

const request = limits => ({requestId:'limits', fen:START_FEN, moves:[], historyComplete:true, limits});

test('public API accepts inclusive documented limits and rejects invalid limits', () => {
  assert.deepEqual(SDK_LIMITS, {moves:2048, fenChars:256, nodes:10000000, movetime:60000, depth:32});
  assert(Object.isFrozen(SDK_LIMITS));
  for (const movetime of [1, 25, 500, 60000]) assert.equal(preflight(request({movetime})).request.limits.movetime, movetime);
  for (const nodes of [1, 10000000]) assert.equal(preflight(request({nodes})).request.limits.nodes, nodes);
  for (const depth of [1, 32]) assert.equal(preflight(request({nodes:1, depth})).request.limits.depth, depth);
  for (const key of ['nodes','movetime','depth']) {
    for (const value of [0,-1,SDK_LIMITS[key]+1,Infinity,NaN,1.5,'1',null]) {
      assert.throws(() => preflight(request({nodes:1,[key]:value})), new RegExp(key));
    }
  }
  assert.throws(() => preflight(request({depth:1})), /explicit nodes or movetime/);
  assert.throws(() => preflight(request({nodes:1, unknown:1})), /Unsupported limits/);
  assert.equal(preflight(request({nodes:1})).request.limits.depth, 16);
  assert.equal(validateRequest(request({nodes:1})).limits.movetime, Infinity);
  assert.equal(validateRequest(request({nodes:1,movetime:10})).limits.movetime, 10);
});

test('injected Search clock proves movetime reaches the soft-deadline check', () => {
  for (const movetime of [1,25,60000]) {
    const p = preparePosition({...request({movetime}), options:{ruleProfile:'pikafish-public-b562'}});
    let calls = 0;
    const search = new Search({...BENCHMARK_SEARCH_OPTIONS, clock:() => calls++ === 0 ? 0 : movetime + 1});
    const r = search.run(p.board, {...p.limits, gameHistory:p.judge.states, historyComplete:true, historyOriginFEN:p.origin});
    assert.equal(r.stopReason, 'time');
    assert.equal(r.depth, 0);
    assert.equal(r.nodes, 0);
    assert.equal(r.stopped, true);
  }
});

test('SDK history preparation preserves board state and restores on injected attack failure', () => {
  const board = new Board(), moves = [];
  let seed = 81;
  for (let i=0;i<24;i++) {
    const legal = board.generateLegalMoves();
    seed = (Math.imul(seed,1664525)+1013904223) >>> 0;
    const move = legal[seed % legal.length];
    moves.push(moveToUci(move)); board.makeMove(move);
  }
  const p = preparePosition({...request({nodes:1}), moves});
  assert.equal(p.board.toFEN(), board.toFEN());
  assert.equal(p.board.key(), board.key());
  assert(!Object.hasOwn(p.board, 'generateLegalMoves'));
  assert(!Object.hasOwn(p.board, 'isAttacked'));
  const original = Board.prototype.isAttacked;
  let leaked;
  try {
    Board.prototype.isAttacked = function(...args) {
      if (new Error().stack.includes('isPreparationMoveLegal')) { leaked=this; throw Error('injected attack failure'); }
      return original.apply(this,args);
    };
    assert.throws(() => preparePosition({...request({nodes:1}),moves:['a3a4']}), /injected attack failure/);
  } finally { Board.prototype.isAttacked = original; }
  assert(leaked);
  assert.deepEqual(leaked, new Board());
});

test('single-move legality agrees with original legal-list membership and preserves overrides', () => {
  const board = new Board();
  for (let ply=0;ply<32;ply++) {
    const before = board.toFEN(), hash = board.key(), legal = board.generateLegalMoves();
    for (const move of board.generatePseudoMoves()) assert.equal(board.isLegalMove(move),legal.includes(move));
    for (const move of [-1,8100,NaN,1.5,null]) assert.equal(board.isLegalMove(move),false);
    assert.equal(board.toFEN(),before); assert.equal(board.key(),hash);
    if (!legal.length) break;
    board.makeMove(legal[(ply*17+3)%legal.length]);
  }
  const custom = new Board();
  let called = 0;
  custom.generateLegalMoves = () => {called++; return [uciToMove('a3a4')];};
  assert.equal(custom.isLegalMove('a3a4'),true);
  assert.equal(custom.isLegalMove('c3c4'),false);
  assert.equal(called,2);
  custom.generateLegalMoves = () => {throw Error('override first');};
  assert.throws(() => custom.isLegalMove('not a move'), /override first/);
  const exceptional = new Board(), snapshot = exceptional.clone();
  exceptional.inCheck = () => {throw Error('attack exception');};
  assert.throws(() => exceptional.isLegalMove('a3a4'), /attack exception/);
  delete exceptional.inCheck;
  assert.deepEqual(exceptional,snapshot);
});
