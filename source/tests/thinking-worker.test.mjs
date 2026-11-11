import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import {Worker} from 'node:worker_threads';import {START_FEN,Board} from '../engine/src/board.js';
const model=new URL('../models/xiangqi-c07e94a5c7cb.nnue',import.meta.url);
function worker(){
 const source=fs.readFileSync(new URL('../web/engine-worker.mjs',import.meta.url),'utf8').replace("'./api.mjs'",JSON.stringify(new URL('../api.mjs',import.meta.url).href)).replace("'./model-download.mjs'",JSON.stringify(new URL('../web/model-download.mjs',import.meta.url).href));
 const bootstrap=`const {parentPort}=require('node:worker_threads');const fs=require('node:fs');global.self={postMessage:x=>parentPort.postMessage(x)};global.fetch=async()=>new Response(fs.readFileSync(new URL(${JSON.stringify(model.href)})));(async()=>{await import('data:text/javascript;base64,${Buffer.from(source).toString('base64')}');parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'boot'});})();`;
 return new Worker(bootstrap,{eval:true});
}
test('real browser worker protocol emits completed layers; fixed depth completes and infinite can be terminated', {timeout:30000},async t=>{
 if(!fs.existsSync(model)){t.skip('external model unavailable');return;}
 for(const limits of [{mode:'depth',depth:2},{mode:'infinite'}]){
  const w=worker(),events=[];try{await new Promise((resolve,reject)=>{w.on('error',reject);w.on('message',m=>{
   events.push(m);if(m.type==='boot')w.postMessage({id:7,request:{requestId:'real-web',fen:START_FEN,moves:[],historyComplete:true,limits}});
   if(m.type==='error')reject(Error(m.error));if(limits.mode==='infinite'&&m.type==='info'&&m.info.depth>=1)resolve();if(limits.mode==='depth'&&m.type==='result')resolve();
  });});
  const infos=events.filter(x=>x.type==='info');assert.ok(infos.length);assert.ok(infos.every(x=>x.id===7&&new Board().isLegalMove(x.info.pv[0])));
  assert.ok(events.some(x=>x.type==='model-phase'&&x.stage==='ready'));
  if(limits.mode==='depth'){const r=events.find(x=>x.type==='result').result;assert.equal(r.depth,2);assert.equal(r.move,infos.at(-1).info.pv[0]);}
 }finally{await w.terminate();}}
});

test('real browser worker transports proof metadata in fixed depth and infinite modes', {timeout:30000},async()=>{
 for(const limits of [{mode:'depth',depth:32},{mode:'infinite'}]){
  const w=worker(),events=[];
  try {await new Promise((resolve,reject)=>{w.on('error',reject);w.on('message',m=>{events.push(m);if(m.type==='boot')w.postMessage({id:8,request:{requestId:'proof-web',fen:'9/9/3a1k3/6N2/9/9/9/9/9/4K4 w - - 0 1',moves:[],historyComplete:true,limits}});if(m.type==='error')reject(Error(m.error));if(m.type==='result')resolve();});});
   const r=events.find(x=>x.type==='result').result;assert.equal(r.status,'proven-endgame');assert.equal(r.depth,0);assert.equal(r.move,'g6i5');assert.equal(r.proof.remainingPlies,15);assert.equal(events.filter(x=>x.type==='info').length,1);assert(events.some(x=>x.type==='model-phase'&&x.stage==='ready'));
  }finally{await w.terminate();}
 }
});
