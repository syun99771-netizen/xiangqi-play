import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const H=new URL('../',import.meta.url),source=fs.readFileSync(new URL('engine/experimental/fairy-cc0-sparse-head-v1/forward.mjs',H),'utf8'),code=source.slice(source.indexOf('function applyColumn('),source.indexOf('\nfunction transition('));const apply=new Function('FORMAT',code+';return applyColumn;')({accumulatorSize:512,psqtBuckets:8});
test('paired FT kernel matches independent BigInt lane oracle',()=>{
const vals=[0,1,2,32767,32768,65534,65535],pairs=[];for(const a of vals)for(const b of vals)for(const c of vals)for(const d of vals)pairs.push([a,b,c,d]);let seed=899471;const rng=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};for(let i=0;i<20000;i++)pairs.push([rng()&65535,rng()&65535,rng()&65535,rng()&65535]);let checks=0;
for(const reversed of [false,true])for(const sign of [1,-1])for(let off=0;off<pairs.length;off+=256){const accumulation=new Int16Array(512),weights=new Int16Array(512),expected=new Int16Array(512);for(let j=0;j<Math.min(256,pairs.length-off);j++){let [a,b,c,d]=pairs[off+j];if(reversed){[a,b]=[b,a];[c,d]=[d,c];}accumulation[2*j]=a;accumulation[2*j+1]=b;weights[2*j]=c;weights[2*j+1]=d;expected[2*j]=Number(BigInt.asIntN(16,BigInt(a)+BigInt(sign)*BigInt(c)));expected[2*j+1]=Number(BigInt.asIntN(16,BigInt(b)+BigInt(sign)*BigInt(d)));checks++;}apply({ftWeight:weights,ftWeightWords:new Uint32Array(weights.buffer),psqt:new Int32Array(8)},{accumulation,accumulationWords:new Uint32Array(accumulation.buffer),psqt:new Int32Array(8)},0,sign);assert.deepEqual(accumulation,expected);}
assert.equal(checks,89604);
});

import {FORMAT as F} from '../engine/experimental/fairy-cc0-sparse-head-v1/format.mjs';
import {createOwnedEvaluator,createIncrementalFeatureEvaluator} from '../engine/experimental/fairy-cc0-sparse-head-v1/forward.mjs';
test('aligned and byteOffset2 FT owners preserve full-refresh oracle and independent banks',()=>{
 const weights=new Int16Array(F.featureCount*512);for(let i=0;i<weights.length;i++)weights[i]=(i*31+(i/512|0)*109)&65535;
 const unaligned=new Int16Array(new ArrayBuffer(weights.byteLength+2),2,weights.length);unaligned.set(weights);
 const params=ftWeight=>({ftBias:new Int16Array(512).fill(32760),ftWeight,psqt:new Int32Array(F.featureCount*8).fill(2147483647),stacks:Array.from({length:8},()=>[{bias:new Int32Array(16),weight:new Int8Array(16*1024).fill(127)},{bias:new Int32Array(32),weight:new Int8Array(32*32).fill(-128)},{bias:new Int32Array(1),weight:new Int8Array(32).fill(127)}])});
 const models=[weights,unaligned].map(w=>({evaluateFeatures:createOwnedEvaluator(params(w))})),sessions=models.map(createIncrementalFeatureEvaluator);
 for(let cycle=0;cycle<3;cycle++)for(const red of [[0,1,2,3],[0,1,2,4],[0,1,2,4],[1170,1171,1172,1173],[0,1,2,3]]){
  const o={red,black:[100,101,102,103],pieceCount:4,sideToMove:cycle%2?'black':'red',diagnostics:true};
  const full=models[0].evaluateFeatures(o);for(let i=0;i<2;i++){assert.deepEqual(sessions[i](o),full);assert.equal(sessions[i]({...o,diagnostics:false}),full.raw);assert.deepEqual(models[i].evaluateFeatures(o),full);}
  assert.deepEqual(sessions[0].stats(),sessions[1].stats());
  const prior=sessions[0].stats();assert.throws(()=>sessions[0]({...o,black:[100,100,102,103]}));assert.deepEqual(sessions[0].stats(),prior);
  const owned=sessions[0](o);for(const v of Object.values(owned))if(ArrayBuffer.isView(v))v.fill(0);assert.deepEqual(sessions[0](o),full);
  // Match successful-call counts without sharing either session's banks.
  sessions[1](o);sessions[1](o);
 }
 for(const s of sessions){s.reset();assert.equal(s.stats().evaluations,0);}
 assert.deepEqual(weights,unaligned);
});
