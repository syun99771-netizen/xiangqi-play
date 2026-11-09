import test from 'node:test';
import assert from 'node:assert/strict';
import {preflight,START_FEN} from '../api.mjs';
import {preparePosition} from '../engine/src/sdk/core.js';
import {Search,MATE} from '../engine/src/search-public-b562.js';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
const request=limits=>({requestId:'thinking',fen:START_FEN,moves:[],historyComplete:true,limits});
const prepared=limits=>preparePosition(preflight(request(limits)).request);
function run(p,search,extra={}){return search.run(p.board,{...p.limits,gameHistory:p.judge.states,historyComplete:true,historyOriginFEN:p.origin,...extra});}

test('explicit thinking modes survive preflight and normalize only inside SDK',()=>{
 for(const depth of [1,32]){const q=preflight(request({mode:'depth',depth})).request;assert.deepEqual(q.limits,{mode:'depth',depth});assert.equal(preparePosition(q).limits.movetime,Infinity);}
 const q=preflight(request({mode:'infinite'})).request;assert.deepEqual(q.limits,{mode:'infinite'});assert.deepEqual(preparePosition(q).limits,{depth:Infinity,movetime:Infinity});
 assert.equal(prepared({mode:'time',movetime:10}).limits.movetime,10);
 for(const limits of [{mode:'unknown'},{mode:1},{mode:'time'},{mode:'depth'},{mode:'depth',depth:0},{mode:'depth',depth:33},{mode:'depth',depth:2,movetime:10},{mode:'depth',depth:2,nodes:1},{mode:'infinite',depth:1},{mode:'infinite',movetime:10},{mode:'infinite',nodes:1}])assert.throws(()=>preflight(request(limits)));
 assert.throws(()=>preflight(request({depth:2})),/explicit nodes or movetime/);
 assert.equal(prepared({nodes:1}).limits.movetime,Infinity);
});

test('fixed depth completes target despite clock far beyond old one-second default',()=>{
 const p=prepared({mode:'depth',depth:2});let clock=0;const search=new Search({...BENCHMARK_SEARCH_OPTIONS,clock:()=>clock+=1001});
 // Deterministic completed root fixture tests iteration/deadline contract rather than strength.
 const move=p.board.generateLegalMoves()[0];search.root=()=>({move,score:0});const infos=[];
 const r=run(p,search,{onInfo:i=>infos.push(i)});assert.equal(r.depth,2);assert.equal(r.completionReason,'depth');assert.equal(r.stopped,false);assert.ok(r.time>1000);assert.deepEqual(infos.map(i=>i.depth),[1,2]);
});

test('infinite real search can stop after completed layer and retains deepest move/score/PV',()=>{
 const p=prepared({mode:'infinite'}),fen=p.board.toFEN();const flag=new Int32Array(new SharedArrayBuffer(4)),infos=[];
 const r=run(p,new Search(BENCHMARK_SEARCH_OPTIONS),{stopFlag:flag,onInfo:i=>{infos.push(structuredClone(i));Atomics.store(flag,0,1);}});
 assert.equal(infos.length,1);assert.equal(r.stopReason,'external');assert.equal(r.depth,1);assert.equal(r.move,infos[0].pv[0]);assert.equal(r.score,infos[0].score);assert.deepEqual(r.pv,infos[0].pv);assert.equal(p.board.toFEN(),fen);assert.ok(p.board.generateLegalMoves().includes(r.move));
});

test('stop before first completed layer never pretends fallback is completed',()=>{
 const p=prepared({mode:'infinite'}),flag=new Int32Array(new SharedArrayBuffer(4));Atomics.store(flag,0,1);let infos=0;
 const r=run(p,new Search(BENCHMARK_SEARCH_OPTIONS),{stopFlag:flag,onInfo:()=>infos++});assert.equal(infos,0);assert.equal(r.depth,0);assert.equal(r.stopReason,'external');assert.ok(p.board.generateLegalMoves().includes(r.move));
});

test('infinite search may complete early on a proven mate score',()=>{
 const p=prepared({mode:'infinite'}),search=new Search(BENCHMARK_SEARCH_OPTIONS),move=p.board.generateLegalMoves()[0];search.root=()=>({move,score:MATE-1});
 const r=run(p,search);assert.equal(r.depth,1);assert.equal(r.completionReason,'mate');assert.equal(r.move,move);
});
