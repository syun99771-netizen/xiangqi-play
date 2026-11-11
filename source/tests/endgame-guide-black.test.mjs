import test from'node:test';import assert from'node:assert/strict';import{readFileSync}from'node:fs';
import{preparePosition}from'../engine/src/sdk/core.js';import{probeEndgameGuide}from'../engine/src/endgame-guide.js';
import{loadCc0BenchmarkModel,runCc0BenchmarkSearch}from'../reference-core.mjs';import{BENCHMARK_SEARCH_OPTIONS}from'../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
const fen='4k4/9/9/9/9/9/2n6/3K1A3/9/9 b - - 0 1';
const request=(extra={})=>({requestId:'black-knka',fen,moves:[],historyComplete:true,options:{...BENCHMARK_SEARCH_OPTIONS},limits:{nodes:65536,depth:16},...extra});
const model=loadCc0BenchmarkModel(readFileSync(new URL('../models/xiangqi-c07e94a5c7cb.nnue',import.meta.url)));
test('black exact-material guide returns certified move and restores all board fields',()=>{
 const p=preparePosition(request()),before=JSON.stringify(p);const r=probeEndgameGuide(p);
 assert.equal(r.move,'c3a4');assert.equal(r.remainingPlies,15);assert.equal(r.root,p.board.toFEN().split(' ').slice(0,2).join(' '));assert.equal(JSON.stringify(p),before);
 for(const half of [104,105,119])assert.equal(Boolean(probeEndgameGuide(preparePosition(request({fen:fen.replace(' 0 1',` ${half} 1`)})))),half===104);
 for(const extra of [{fen:fen.replace(' b ',' w ')},{fen:fen.replace('2n6','2r6')},{options:{ruleProfile:'cca2020'}},{fen:undefined}])assert.equal(probeEndgameGuide(preparePosition(request(extra))),null);
 assert.throws(()=>preparePosition(request({historyComplete:false})));
});
test('black guide retains original-color complete history and rejects a real cycle',()=>{
 const moves=['e9e8','f2e1','e8e9','e1f2'];const p=preparePosition(request({moves}));assert(!p.context.adjudication.terminal);assert.equal(probeEndgameGuide(p),null);
 const useful=preparePosition(request({moves:['c3a4','d2d1']}));const before=JSON.stringify(useful);assert(probeEndgameGuide(useful));let count=0;assert.equal(probeEndgameGuide(useful,()=>++count===2),null);assert.equal(count,2);assert.equal(JSON.stringify(useful),before);
});
test('black proof runner preserves modes, cancellation and callback isolation',()=>{
 for(const limits of [{mode:'time',movetime:100},{mode:'depth',depth:32},{mode:'infinite'}]){const r=runCc0BenchmarkSearch(request({limits}),{model});assert.equal(r.status,'proven-endgame');assert.equal(r.move,'c3a4');assert.equal(r.proof.remainingPlies,15);assert.equal(r.score,null);assert.equal(r.depth,0);assert.equal(r.nodes,0);assert.deepEqual(r.completedIterations,[]);}
 const flag=new Int32Array(new SharedArrayBuffer(4));Atomics.store(flag,0,1);const cancelled=runCc0BenchmarkSearch(request(),{model,stopFlag:flag});assert.equal(cancelled.move,null);assert.equal(cancelled.stopReason,'external');
 Atomics.store(flag,0,0);const after=runCc0BenchmarkSearch(request(),{model,stopFlag:flag,onInfo:i=>{i.pv[0]='a0a1';Atomics.store(flag,0,1);}});assert.equal(after.move,'c3a4');assert.deepEqual(after.pv,['c3a4']);assert.equal(after.stopReason,'external');
 assert.throws(()=>runCc0BenchmarkSearch(request(),{model,onInfo:()=>{throw Error('callback');}}),/callback/);
 assert.equal(runCc0BenchmarkSearch(request(),{model}).move,'c3a4');
});
