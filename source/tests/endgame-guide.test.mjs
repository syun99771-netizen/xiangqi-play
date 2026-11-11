import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {preparePosition} from '../engine/src/sdk/core.js';
import {probeEndgameGuide} from '../engine/src/endgame-guide.js';
import {loadCc0BenchmarkModel,runCc0BenchmarkSearch} from '../reference-core.mjs';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
const fen='9/9/3a1k3/6N2/9/9/9/9/9/4K4 w - - 0 1';
const request=(extra={})=>({requestId:'knka',fen,moves:[],historyComplete:true,options:{...BENCHMARK_SEARCH_OPTIONS},limits:{nodes:65536,depth:16},...extra});
const model=loadCc0BenchmarkModel(readFileSync(new URL('../models/xiangqi-c07e94a5c7cb.nnue',import.meta.url)));
test('exact guide requires full public history, precise material, clock slack and no future-history conflict',()=>{
 const p=preparePosition(request()),before=p.board.toFEN(),squares=[...p.board.squares];
 assert.deepEqual(probeEndgameGuide(p),{move:'g6i5',remainingPlies:15,source:'knka-exact-v1',root:before.split(' ').slice(0,2).join(' ')});
 assert.equal(p.board.toFEN(),before);assert.deepEqual([...p.board.squares],squares);
 for(const half of [104,105,119])assert.equal(Boolean(probeEndgameGuide(preparePosition(request({fen:fen.replace(' 0 1',` ${half} 1`)})))),half===104);
 assert.throws(()=>preparePosition(request({historyComplete:false})));
 for(const extra of [{moves:['e0e1','d7e8','e1e0','e8d7']},{fen:fen.replace(' w ',' b ')},{options:{ruleProfile:'cca2020'}},{fen:fen.replace('6N2','6R2')},{fen:undefined}])assert.equal(probeEndgameGuide(preparePosition(request(extra))),null);
 assert.equal(probeEndgameGuide(p,()=>true),null);
 let polls=0;assert.equal(probeEndgameGuide(p,()=>++polls>=2),null);
});
test('real runner returns proof without fabricated depth, score or layers in all modes',()=>{
 for(const limits of [{mode:'time',movetime:100},{mode:'depth',depth:32},{mode:'infinite'}]){
  const infos=[],r=runCc0BenchmarkSearch(request({limits}),{model,onInfo:x=>infos.push(x)});
  assert.equal(r.status,'proven-endgame');assert.equal(r.move,'g6i5');assert.equal(r.depth,0);assert.equal(r.nodes,0);assert.equal(r.score,null);assert.deepEqual(r.completedIterations,[]);assert.equal(infos.length,1);assert.equal(infos[0].proof.remainingPlies,15);assert.equal(r.terminal,false);
 }
});
test('proof path preserves cancellation, callback errors and model authentication',()=>{
 assert.throws(()=>runCc0BenchmarkSearch(request()),/handle/);
 const flag=new Int32Array(new SharedArrayBuffer(4));Atomics.store(flag,0,1);
 const cancelled=runCc0BenchmarkSearch(request(),{model,stopFlag:flag});assert.equal(cancelled.move,null);assert.equal(cancelled.stopReason,'external');
 Atomics.store(flag,0,0);const r=runCc0BenchmarkSearch(request(),{model,stopFlag:flag,onInfo:()=>Atomics.store(flag,0,1)});assert.equal(r.status,'proven-endgame');assert.equal(r.stopped,true);assert.equal(r.stopReason,'external');assert.equal(r.completionReason,null);
 assert.throws(()=>runCc0BenchmarkSearch(request(),{model,onInfo:()=>{throw Error('callback');}}),/callback/);
 assert.equal(runCc0BenchmarkSearch(request(),{model}).move,'g6i5');
});
test('cycle guard falls back to actual iterative search instead of discarding history',()=>{
 const r=runCc0BenchmarkSearch(request({moves:['e0e1','d7e8','e1e0','e8d7'],limits:{depth:1,nodes:4096}}),{model});assert.equal(r.proof,undefined);assert.equal(r.depth,1);assert.equal(r.status,'completed-iteration');
});

test('guide polling can stop mid-history without mutating the validated position',()=>{
 const p=preparePosition(request({moves:['g6i5','f7f8']}));const before=p.board.toFEN();let calls=0;
 assert.equal(probeEndgameGuide(p,()=>++calls===2),null);assert.equal(p.board.toFEN(),before);assert.equal(calls,2);
});

test('proof admission respects deadline and completed proof survives callback deadline',()=>{
 const descriptor=Object.getOwnPropertyDescriptor(globalThis,'performance');
 try{
  let time=0;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>time++*2}});
  const r=runCc0BenchmarkSearch(request({limits:{movetime:1,depth:16}}),{model});assert.equal(r.move,null);assert.equal(r.stopReason,'time');assert.equal(r.status,'budget-exhausted');
  time=0;Object.defineProperty(globalThis,'performance',{configurable:true,value:{now:()=>time}});
  const proof=runCc0BenchmarkSearch(request({limits:{movetime:1,depth:16}}),{model,onInfo:()=>{time=2;}});assert.equal(proof.move,'g6i5');assert.equal(proof.status,'proven-endgame');assert.equal(proof.stopReason,'time');assert.equal(proof.depth,0);
 }finally{Object.defineProperty(globalThis,'performance',descriptor);}
});

test('info callback cannot mutate the returned proof PV',()=>{
 const r=runCc0BenchmarkSearch(request(),{model,onInfo:info=>{info.pv[0]='a0a1';info.pv.push('a1a2');info.move='a0a1';}});
 assert.equal(r.move,'g6i5');assert.deepEqual(r.pv,['g6i5']);assert.equal(r.proof.move,'g6i5');
});
