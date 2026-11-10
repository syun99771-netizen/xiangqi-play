import test from 'node:test';
import assert from 'node:assert/strict';
import {preparePosition} from '../engine/src/sdk/core.js';
import {Search} from '../engine/src/search-public-b562.js';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
function ready(options={}) {
 const p=preparePosition({requestId:'deferred-order',moves:[],historyComplete:true,limits:{nodes:1024,depth:2},options:{ruleProfile:'pikafish-public-b562'}});
 const s=new Search({...BENCHMARK_SEARCH_OPTIONS,evaluator:()=>100,...options});
 s.run(p.board,{depth:0,movetime:Infinity,historyComplete:true,gameHistory:p.judge.states,historyOriginFEN:p.origin});
 return {p,s};
}
test('ordinary stand-pat and q-ply bound skip ordering',()=>{
 for(const cap of [false,true]){const {s}=ready();s.order=()=>{throw Error('unused ordering');};assert.equal(s.qsearch(-200,cap?200:50,0,cap?12:0),100);}
});
test('public repetition and material terminal precede unused ordering',()=>{
 for(const kind of ['repeat','material']){const {s}=ready();s.order=()=>{throw Error('unused ordering');};if(kind==='repeat')s.repetitionValue=()=>17;else s.publicNonRepetitionTerminal=()=>19;assert.equal(s.qsearch(-200,50,0,0),kind==='repeat'?17:19);}
});
test('ordinary expansion consumes the returned ordering array',()=>{
 const {p,s}=ready();let expected,observed;const signal=Symbol('test-stop');
 s.order=moves=>{assert(moves.length>1);const reversed=[...moves].reverse();expected=reversed[0];return reversed;};
 s.makeSearchMove=m=>{observed=m;throw signal;};const before=p.board.toFEN();assert.throws(()=>s.qsearch(-200,200,0,0),e=>e===signal);assert.equal(observed,expected);assert.equal(p.board.toFEN(),before);assert.equal(s.pathStates.length,0);
});
test('typed compatibility still orders before stand-pat',()=>{
 const {s}=ready({typedMoveBuffers:true,moveOrderWorkspace:'stable-insertion-v1'});let count=0;const order=s.order.bind(s);s.order=(...args)=>{count++;return order(...args);};assert.equal(s.qsearch(-200,50,0,0),100);assert.equal(count,1);
});
test('node-budget interruption restores clocks material and board',()=>{
 const {p,s}=ready();const before=JSON.stringify({fen:p.board.toFEN(),clock:s.publicClockIndex,counts:[...s.directMaterialCounts]});s.maxNodes=3;assert.throws(()=>s.qsearch(-200,200,0,0),e=>typeof e==='symbol');assert.equal(JSON.stringify({fen:p.board.toFEN(),clock:s.publicClockIndex,counts:[...s.directMaterialCounts]}),before);assert.equal(s.pathStates.length,0);assert.equal(s.publicPathMoves.length,0);
});
