import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePosition} from '../engine/src/sdk/core.js';
import {Search,MATE} from '../engine/src/search-public-b562.js';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
const CHECKED='2bakab2/9/9/p4R2p/2p1C4/9/P1n1P1P1P/2N1B4/9/2BA1K1r1 w - - 5 24';
function ready({fen,moves=[],typedTT=false,checkExtensions=0}={}){
 const p=preparePosition({requestId:'leaf-tt-test',...(fen?{fen}:{}),moves,historyComplete:true,limits:{nodes:1024,depth:2},options:{ruleProfile:'pikafish-public-b562'}});
 const s=new Search({...BENCHMARK_SEARCH_OPTIONS,typedTT,checkExtensions,evaluator:()=>17});
 s.run(p.board,{depth:0,movetime:Infinity,historyComplete:true,gameHistory:p.judge.states,historyOriginFEN:p.origin});
 return {p,s};
}
function state(b){return {fen:b.toFEN(),squares:[...b.squares],kings:[...b.kings],lo:b.hashLo,hi:b.hashHi};}
test('depth-zero leaf skips key and TT read; result equals retained old route',()=>{
 for(const typedTT of [false,true]){
  const {p,s}=ready({typedTT}),before=state(p.board);
  p.board.key=()=>{throw Error('unused leaf key');};s.ttGet=()=>{throw Error('unused leaf TT');};
  const actual=s.negamax(0,-100,0,0);
  // ttBounds mutation is intentionally low-level. With an empty table this
  // selects the retained pre-optimization route, not an external baseline file.
  const {s:old}=ready({typedTT});old.options.ttBounds=true;
  assert.equal(actual,old.negamax(0,-100,0,0));assert.equal(actual,17);
  assert.equal(s.nodes,old.nodes);assert.deepEqual(state(p.board),before);
 }
});
test('positive depth still reads ordering TT in both storage modes',()=>{
 for(const typedTT of [false,true]){
  const {p,s}=ready({typedTT}),before=state(p.board),marker=new Error('expected TT probe');let probes=0;
  s.ttGet=()=>{probes++;throw marker;};assert.throws(()=>s.negamax(1,-100,100,0),e=>e===marker);assert.equal(probes,1);assert.deepEqual(state(p.board),before);
 }
});
test('checked depth-zero extension happens before leaf dispatch',()=>{
 const {p,s}=ready({fen:CHECKED,checkExtensions:1}),before=state(p.board),marker=new Error('extended node probes');
 assert(p.board.inCheck());s.ttGet=()=>{throw marker;};assert.throws(()=>s.negamax(0,-100,100,0,true,1),e=>e===marker);assert.equal(s.extensions,1);assert.deepEqual(state(p.board),before);
 const {s:plain}=ready({fen:CHECKED});plain.ttGet=()=>{throw Error('no extension must not probe');};plain.qsearch=()=>91;assert.equal(plain.negamax(0,-100,100,0,true,0),91);
});
test('real repetition and public terminal checks retain precedence over dispatch',()=>{
 const moves=['b0c2','b9c7','c2b0','c7b9','b0c2','b9c7','c2b0','c7b9'];
 const {s}=ready({moves});s.qsearch=()=>{throw Error('repetition must return first');};s.ttGet=()=>{throw Error('terminal must not probe');};
 assert.equal(s.negamax(0,-100,100,0),0);assert.equal(s.strictTerminalReturns,1);
 const {s:t}=ready();t.publicNonRepetitionTerminal=()=>0;t.qsearch=()=>{throw Error('terminal must return first');};t.ttGet=()=>{throw Error('terminal must not probe');};assert.equal(t.negamax(1,-100,100,0),0);
});
test('hard-ply terminal and abort precede leaf dispatch',()=>{
 const {p,s}=ready(),before=state(p.board);s.qsearch=()=>{throw Error('hard-ply must precede leaf');};s.ttGet=()=>{throw Error('hard-ply must not probe');};
 assert.throws(()=>s.negamax(0,-100,100,100),e=>typeof e==='symbol');assert.equal(s.stopReason,'hard-ply');assert.deepEqual(state(p.board),before);
 const {s:noMoves}=ready();noMoves.legalMoves=()=>[];noMoves.qsearch=()=>{throw Error('no-legal must precede leaf');};assert.equal(noMoves.negamax(0,-100,100,100),-MATE+100);
});
test('low-level ttBounds mutation retains former leaf bound path',()=>{
 for(const typedTT of [false,true]){
  const {s}=ready({typedTT});s.options.ttBounds=true;let probes=0;
  s.ttGet=()=>{probes++;return {depth:0,flag:0,score:42,move:null};};s.qsearch=()=>{throw Error('exact bound must return first');};
  assert.equal(s.negamax(0,-100,100,0),42);assert.equal(probes,1);
 }
});
