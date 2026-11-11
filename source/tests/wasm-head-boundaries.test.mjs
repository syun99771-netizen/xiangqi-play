// SPDX-License-Identifier: GPL-3.0-or-later
// Packaged BigInt, ownership, transaction and binary-contract regressions.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
test('SIMD boundaries, ownership, rollback, reentry and fixed binary contract',async()=>{
const root=new URL('../',import.meta.url),headUrl=new URL('engine/experimental/fairy-cc0-sparse-head-v1/wasm-head.mjs',root),forwardUrl=new URL('engine/experimental/fairy-cc0-sparse-head-v1/forward.mjs',root);
const source=fs.readFileSync(headUrl,'utf8'),forward=fs.readFileSync(forwardUrl,'utf8');
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const normal=await import(headUrl);
let checked=0,headCases=0,transactionCases=0;
const mk=()=>Array.from({length:8},()=>[{bias:new Int32Array(16),weight:new Int8Array(16384)},{bias:new Int32Array(32),weight:new Int8Array(1024)},{bias:new Int32Array(1),weight:new Int8Array(32)}]);
const wrap=x=>Number(BigInt.asIntN(32,BigInt(x)));
const clip=x=>Math.max(0,Math.min(127,x));
function oracle(stacks,a,b,bucket){let input=[...a,...b].map(clip);for(let l=0;l<3;l++){const layer=stacks[bucket][l],size=[1024,16,32][l],stride=[1024,32,32][l],out=[];for(let r=0;r<layer.bias.length;r++){let v=BigInt(layer.bias[r]);for(let c=0;c<size;c++)v+=BigInt(input[c])*BigInt(layer.weight[r*stride+c]);out.push(Number(BigInt.asIntN(32,v)));}input=l<2?out.map(v=>clip(v>>6)):out;}return input[0];}
const values=[-2147483648,-2147483647,-65,-64,-63,-1,0,1,63,64,65,8127,8128,8191,8192,2147483646,2147483647];
const a=Int16Array.from({length:512},(_,i)=>[-32768,-1,0,1,126,127,128,32767][i%8]);
const b=Int16Array.from({length:512},(_,i)=>[32767,128,127,126,1,0,-1,-32768][i%8]);
// H1/H2 outputs are routed losslessly through subsequent activations, so errors cannot hide behind saturated later layers.
for(let stage=0;stage<3;stage++)for(let n=0;n<values.length;n++){
 const stacks=mk();
 for(let bucket=0;bucket<8;bucket++){
  const s=stacks[bucket],row=(n+bucket)%16;
  if(stage===0){s[0].weight.fill(n%2?-128:127,row*1024,(row+1)*1024);let d=0;for(const x of [...a,...b])d+=clip(x)*(n%2?-128:127);s[0].bias[row]=wrap(values[n]-d);s[1].weight[row]=64;s[2].weight[0]=1;}
  if(stage===1){for(let r=0;r<16;r++)s[0].bias[r]=(r%2?127:1)*64;let d=0;for(let c=0;c<16;c++){const w=c%2?-128:127;s[1].weight[c]=w;d+=(c%2?127:1)*w;}s[1].weight.fill(n%2?-128:127,16,32);s[1].bias[0]=wrap(values[n]-d);s[2].weight[0]=1;}
  if(stage===2){let d=0;for(let c=0;c<32;c++){const x=c%2?127:1;s[1].bias[c]=x*64;s[2].weight[c]=c%2?-128:127;d+=x*s[2].weight[c];}s[2].bias[0]=wrap(values[n]-d);}
 }
 const run=normal.createWasmHead(stacks);
 for(let bucket=0;bucket<8;bucket++){const expected=oracle(stacks,a,b,bucket);assert.equal(run(a,b,bucket),expected);assert.equal(expected,stage<2?clip(values[n]>>6):values[n]);headCases++;}
 // Ownership: all source head arrays can be mutated after creation without changing copied WASM parameters.
 const expected=run(a,b,0);for(const s of stacks)for(const l of s){l.bias.fill(1);l.weight.fill(1);}assert.equal(run(a,b,0),expected);checked++;
}
// Precisely injected private helper, not a modified candidate artifact.
const needle='busy=true;try{accum.set(stm,0);accum.set(opp,512);calls++;return e.run_head(bucket);}finally{busy=false;}';assert(source.includes(needle));
const injectedSource="let reviewHook=()=>{},reviewBucket=null;export const setReviewHook=f=>{reviewHook=f;};export const setReviewBucket=b=>{reviewBucket=b;};\n"+source.replace(needle,"busy=true;try{reviewHook('before-copy');accum.set(stm,0);reviewHook('after-stm');accum.set(opp,512);reviewHook('after-opp');calls++;const result=e.run_head(reviewBucket??bucket);reviewHook('after-call');return result;}finally{busy=false;}");
const injectedUrl=moduleUrl(injectedSource),injectedHead=await import(injectedUrl);
const injectedForward=await import(moduleUrl(forward.replace("'./format.mjs'",JSON.stringify(new URL('format.mjs',forwardUrl).href)).replace("'./wasm-head.mjs'",JSON.stringify(injectedUrl))));
const params={ftBias:new Int16Array(512).fill(127),ftWeight:new Int16Array(10530*512),psqt:new Int32Array(10530*8),stacks:mk()};
for(let index=0;index<300;index++)for(let lane=0;lane<512;lane++)params.ftWeight[index*512+lane]=(index+lane)%257-128;
for(const s of params.stacks){s[0].weight.fill(1);s[1].weight.fill(1);s[2].weight.fill(1);}
const model={evaluateFeatures:injectedForward.createOwnedEvaluator(params)},one=injectedForward.createIncrementalFeatureEvaluator(model),two=injectedForward.createIncrementalFeatureEvaluator(model);
const opts=(r=[0,1,2,3],b=[100,101,102,103])=>({red:r,black:b,pieceCount:r.length,sideToMove:'red'}),base=opts(),next=opts([0,1,2,4],[100,101,102,104]);
const raw=o=>model.evaluateFeatures({...o,diagnostics:true}).raw;
assert.equal(one(base),raw(base));assert.equal(two(base),raw(base));
for(const point of ['before-copy','after-stm','after-opp','after-call']){
 const before=one.stats();injectedHead.setReviewHook(at=>{if(at===point)throw Error('Review fault '+point);});
 assert.throws(()=>one(next),/Review fault/);assert.deepEqual(one.stats(),before);
 injectedHead.setReviewHook(()=>{});assert.equal(one(base),raw(base));assert.equal(one(next),raw(next));transactionCases++;
}
for(const action of [()=>one(next),()=>one.reset(),()=>two(next),()=>model.evaluateFeatures(next)]){
 const beforeOne=one.stats(),beforeTwo=two.stats();injectedHead.setReviewHook(at=>{if(at==='after-stm')action();});
 assert.throws(()=>one(base),/reentrant|busy/);assert.deepEqual(one.stats(),beforeOne);assert.deepEqual(two.stats(),beforeTwo);
 injectedHead.setReviewHook(()=>{});assert.equal(one(next),raw(next));assert.equal(two(base),raw(base));transactionCases++;
}
// Force the actual compiled C bucket trap after normal JS input validation.
{const before=one.stats();injectedHead.setReviewBucket(8);assert.throws(()=>one(next),WebAssembly.RuntimeError);assert.deepEqual(one.stats(),before);injectedHead.setReviewBucket(null);assert.equal(one(base),raw(base));assert.equal(one(next),raw(next));transactionCases++;}
const snapshot=one({...base,diagnostics:true}),saved=structuredClone(snapshot);
for(let i=0;i<12;i++){assert.equal(one(i%2?next:base),raw(i%2?next:base));assert.equal(two(i%2?base:next),raw(i%2?base:next));assert.deepEqual(snapshot,saved);}
for(const val of Object.values(snapshot))if(ArrayBuffer.isView(val))val.fill(0);
assert.equal(one(base),raw(base));assert.equal(two(next),raw(next));
// Capability and CSP classification are tested separately with complete API descriptors
// in wasm-head-capability.test.mjs; do not duplicate partial WebAssembly mocks here.
// Read actual encoded binary and section limits, without a compiler/disassembler.
const embedded=Buffer.from(source.match(/const encoded='([^']+)'/)[1],'base64');assert.equal(embedded.length,1184);assert.equal(crypto.createHash('sha256').update(embedded).digest('hex'),'9e806804d5e5a0041c20165a2cc3481060ad63bf774b598dc7d99858d5eab046');
const wasmModule=new WebAssembly.Module(embedded);assert.deepEqual(WebAssembly.Module.imports(wasmModule),[]);assert.deepEqual(WebAssembly.Module.exports(wasmModule),[{name:'memory',kind:'memory'},{name:'weights_ptr',kind:'function'},{name:'accum_ptr',kind:'function'},{name:'weights_bytes',kind:'function'},{name:'run_head',kind:'function'}]);
let pos=8,memoryLimits=null;function uleb(){let value=0,shift=0,b;do{b=embedded[pos++];value|=(b&127)<<shift;shift+=7;}while(b&128);return value>>>0;}
while(pos<embedded.length){const section=embedded[pos++],len=uleb(),end=pos+len;if(section===5){assert.equal(uleb(),1);const flags=uleb(),initial=uleb(),maximum=flags&1?uleb():null;memoryLimits={flags,initial,maximum};assert.deepEqual(memoryLimits,{flags:1,initial:4,maximum:4});}pos=end;}
const instance=new WebAssembly.Instance(wasmModule),e=instance.exports,w=e.weights_ptr(),acc=e.accum_ptr();assert(w>=0&&w+e.weights_bytes()<=acc);assert(acc+2048<=e.memory.buffer.byteLength);for(const bucket of [-1,8])assert.throws(()=>e.run_head(bucket),WebAssembly.RuntimeError);assert.throws(()=>e.memory.grow(1),RangeError);
assert.equal(headCases,408);assert.equal(checked,51);assert.equal(transactionCases,9);
});
