import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePosition} from '../engine/src/sdk/core.js';
import {Search, MATE} from '../engine/src/search-public-b562.js';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';

const checked = '2bakab2/9/9/p4R2p/2p1C4/9/P1n1P1P1P/2N1B4/9/2BA1K1r1 w - - 5 24';
function ready(fen, evaluator) {
  const p = preparePosition({requestId:'checked-evaluation', ...(fen ? {fen} : {}),
    moves:[], historyComplete:true, limits:{nodes:1024,depth:2},
    options:{ruleProfile:'pikafish-public-b562'}});
  const s = new Search({...BENCHMARK_SEARCH_OPTIONS, evaluator});
  s.run(p.board, {depth:0,movetime:Infinity,historyComplete:true,
    gameHistory:p.judge.states,historyOriginFEN:p.origin});
  return {p,s};
}
test('checked qsearch never requests a stand-pat value and restores interrupted evasions', () => {
  let calls=0;
  const {p,s}=ready(checked, b => {assert.equal(b.inCheck(),false); calls++; return 17;});
  assert(p.board.inCheck());
  const before=p.board.toFEN(), key=p.board.key();
  s.maxNodes=256;
  try { s.qsearch(-32000,32000,0,0); } catch(e) { assert.equal(typeof e,'symbol'); }
  assert(calls>0);
  assert.equal(p.board.toFEN(),before); assert.equal(p.board.key(),key);
  for(const k of ['path','pathLow','pathHigh','pathStates','publicPathMoves']) assert.equal(s[k].length,0);
});
test('ordinary qsearch still evaluates and clamps stand-pat scores', () => {
  let calls=0; const {s}=ready(undefined,()=>{calls++;return 1e9;});
  assert.equal(s.qsearch(-32000,100,0,0),20000); assert.equal(calls,1);
});
test('ordinary qsearch still rejects non-finite evaluator output', () => {
  const {s}=ready(undefined,()=>NaN);
  assert.throws(()=>s.qsearch(-32000,100,0,0),/finite score/);
});
test('checked no-legal loss precedes any static value and check evasion respects hard ply', () => {
  const {p,s}=ready(checked,()=>{throw Error('unused checked evaluation');});
  const original=p.board.generateLegalMoves;
  p.board.generateLegalMoves=()=>[];
  assert.equal(s.qsearch(-32000,32000,5,0),-MATE+5);
  p.board.generateLegalMoves=original;
  assert.throws(()=>s.qsearch(-32000,32000,100,0),e=>typeof e==='symbol');
  assert.equal(s.stopReason,'hard-ply');
});
