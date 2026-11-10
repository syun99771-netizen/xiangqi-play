import test from 'node:test';
import assert from 'node:assert/strict';
import {preflight,START_FEN} from '../api.mjs';
import {preparePosition} from '../engine/src/sdk/core.js';
import {Search} from '../engine/src/search-public-b562.js';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
const snapshot=b=>({fen:b.toFEN(),squares:[...b.squares],kings:[...b.kings],turn:b.turn,hashLo:b.hashLo,hashHi:b.hashHi});
test('real node STOP skips unfinished ancestor TT writes and preserves completed root PV',()=>{
 const p=preparePosition(preflight({requestId:'abort-tt',fen:START_FEN,moves:[],historyComplete:true,limits:{mode:'depth',depth:3}}).request);
 const s=new Search({...BENCHMARK_SEARCH_OPTIONS,evaluator:()=>0,clock:()=>0});
 const before=snapshot(p.board), stack=[],frames=[],writes=[],infos=[];
 let iteration=0,arm=null,trigger=null,result;
 const names=['root','negamax','ttSet','now','maxNodes'];
 const descriptors=Object.fromEntries(names.map(k=>[k,Object.getOwnPropertyDescriptor(s,k)]));
 const original={root:s.root,negamax:s.negamax,ttSet:s.ttSet};
 try {
  s.root=function(depth,...args){iteration=depth;return original.root.call(this,depth,...args);};
  s.ttSet=function(key,entry){
   const f=stack.at(-1),parent=stack.at(-2);
   const value=original.ttSet.call(this,key,entry);
   const w={callId:f?.id,iteration,key,entry:{...entry},ancestors:stack.map(x=>x.id),afterTrigger:!!trigger};writes.push(w);
   if(!arm&&iteration===3&&f?.ply===2&&f.depth>0&&parent?.ply===1&&parent.depth>0)arm={frameId:f.id,parentId:parent.id,writeIndex:writes.length-1};
   return value;
  };
  s.negamax=function(depth,alpha,beta,ply,...args){
   const parent=stack.at(-1),f={id:frames.length+1,depth,ply,parentId:parent?.id??null,iteration,status:'active'};frames.push(f);stack.push(f);
   try {
    if(!trigger&&iteration===3&&ply===2&&arm&&parent?.id===arm.parentId&&frames[arm.frameId-1].status==='returned'){
     trigger={targetId:f.id,ancestorIds:stack.filter(x=>x.depth>0).map(x=>x.id),nodesBefore:this.nodes,limit:this.nodes+1};
     this.maxNodes=trigger.limit;
    }
    const value=original.negamax.call(this,depth,alpha,beta,ply,...args);f.status='returned';return value;
   } finally {if(f.status==='active')f.status='threw';assert.equal(stack.pop(),f);}
  };
  result=s.run(p.board,{depth:3,movetime:Infinity,nodes:50000,gameHistory:p.judge.states,historyComplete:true,historyOriginFEN:p.origin,onInfo:i=>infos.push(structuredClone(i))});
  assert.ok(trigger,'COVERAGE_FAIL: frozen event not reached');assert.ok(arm);
  assert.equal(frames[arm.frameId-1].status,'returned');assert.equal(writes[arm.writeIndex].iteration,3);
  assert.equal(result.nodes,trigger.limit);assert.equal(result.stopped,true);assert.equal(result.stopReason,'nodes');assert.equal(result.depth,2);
  assert.deepEqual(infos.map(i=>i.depth),[1,2]);assert.deepEqual(result.completedIterations.map(i=>i.depth),[1,2]);
  assert.deepEqual(result.pv,infos[1].pv);assert.equal(result.move,infos[1].pv[0]);assert.equal(result.score,infos[1].score);
  const threw=frames.filter(f=>f.status==='threw');assert.ok(threw.some(f=>f.id===arm.parentId));assert.ok(threw.some(f=>f.id===trigger.targetId));
  for(const f of threw)assert.equal(writes.filter(w=>w.callId===f.id).length,0,`unfinished frame ${f.id} wrote TT`);
  assert.equal(writes.filter(w=>w.afterTrigger).length,0);
  assert.deepEqual(snapshot(p.board),before);
  for(const key of ['publicPathMoves','pathLow','pathHigh','pathStates'])assert.deepEqual(s[key],[]);
  assert.equal(s.nullDepth,0);assert.equal(stack.length,0);
  console.log('ABORT_TT_RECEIPT '+JSON.stringify({trigger,arm,armWrite:writes[arm.writeIndex],frames:frames.filter(f=>f.iteration===3),completedWriteCount:writes.length,infos,result,boardRestored:true}));
 } finally {
  for(const k of names){if(descriptors[k])Object.defineProperty(s,k,descriptors[k]);else delete s[k];}
 }
 for(const k of names)assert.deepEqual(Object.getOwnPropertyDescriptor(s,k),descriptors[k]);
});
