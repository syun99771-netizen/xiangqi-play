import test from 'node:test';import assert from 'node:assert/strict';
import {createWasmHead,wasmHeadStats} from '../engine/experimental/fairy-cc0-sparse-head-v1/wasm-head.mjs';
test('SIMD head matches scalar head over 2112 dense and interleaved cases',()=>{
let seed=0x819fc;const rnd=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
const clip=x=>Math.max(0,Math.min(127,x));
function scalar(stacks,a,b,bucket){let input=[...a,...b].map(clip);for(let l=0;l<3;l++){const layer=stacks[bucket][l],size=[1024,16,32][l],stride=[1024,32,32][l],out=[];for(let r=0;r<layer.bias.length;r++){let v=layer.bias[r];for(let c=0;c<size;c++)v+=input[c]*layer.weight[r*stride+c];out.push(v|0);}input=l<2?out.map(x=>clip(x>>6)):out;}return input[0];}
let checked=0;const models=[];
for(let model=0;model<16;model++){
 const stacks=Array.from({length:8},()=>[16,32,1].map((n,l)=>({bias:Int32Array.from({length:n},()=>rnd()|0),weight:Int8Array.from({length:[16384,1024,32][l]},()=>rnd()&255)})));
 const run=createWasmHead(stacks);assert.equal(typeof run,'function');models.push({stacks,run});
 for(let pattern=0;pattern<16;pattern++){const a=Int16Array.from({length:512},(_,i)=>pattern===0?0:pattern===1?-32768:pattern===2?32767:pattern===3?(i%2?128:-1):rnd()&65535),b=Int16Array.from({length:512},()=>rnd()&65535);for(let bucket=0;bucket<8;bucket++){assert.equal(run(a,b,bucket),scalar(stacks,a,b,bucket));checked++;}}
}
for(let i=0;i<64;i++){const x=models[i%models.length],a=Int16Array.from({length:512},()=>rnd()&65535),b=Int16Array.from({length:512},()=>rnd()&65535),bucket=i%8;assert.equal(x.run(a,b,bucket),scalar(x.stacks,a,b,bucket));checked++;}
for(const bucket of [-1,8,NaN,1.1])assert.throws(()=>models[0].run(new Int16Array(512),new Int16Array(512),bucket));assert.throws(()=>models[0].run(new Int16Array(511),new Int16Array(512),0));
assert.equal(checked,2112);assert(wasmHeadStats().calls>=2112);
});
