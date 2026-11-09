import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const H=new URL('../',import.meta.url),source=fs.readFileSync(new URL('engine/experimental/fairy-cc0-sparse-head-v1/forward.mjs',H),'utf8'),part=source.slice(source.indexOf('function transposeFirstHead('),source.indexOf('\nfunction activation('));const {transposeFirstHead,sparseFirstAffine}=new Function('FORMAT',part+';return {transposeFirstHead,sparseFirstAffine};')({inputSize:1024,hidden1Size:16});
test('output-paired first head matches independent row-major BigInt oracle',()=>{
let seed=945713,cases=0;const rng=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return seed>>>0;};
for(let mode=0;mode<80;mode++){
 const input=new Uint8Array(1024),weight=new Int8Array(16384),bias=new Int32Array(16);
 for(let i=0;i<1024;i++)input[i]=mode===0?0:mode<5?127:mode===5?(i%2?0:127):rng()%128;
 for(let i=0;i<16384;i++)weight[i]=mode===1?127:mode===2?-128:mode===3?((i/1024|0)%2?127:-128):mode===4?((i/1024|0)%2?-128:127):(rng()%256)-128;
 for(let r=0;r<16;r++)bias[r]=r%4===0?2147483647:r%4===1?-2147483648:r%4===2?0:rng()|0;
 const oldW=weight.slice(),oldB=bias.slice(),oldI=input.slice(),packed=transposeFirstHead({weight,bias});assert(packed.weightByInput instanceof Float64Array);assert.equal(packed.weightByInput.byteLength,65536);assert.deepEqual(Object.keys(packed).sort(),['bias','weightByInput']);
 const actual=sparseFirstAffine(input,packed),expected=new Int32Array(16);
 for(let r=0;r<16;r++){let sum=BigInt(bias[r]);for(let i=0;i<1024;i++)sum+=BigInt(input[i])*BigInt(weight[r*1024+i]);expected[r]=Number(BigInt.asIntN(32,sum));}
 assert.deepEqual(actual,expected);assert.deepEqual(weight,oldW);assert.deepEqual(bias,oldB);assert.deepEqual(input,oldI);
 // Independent packed-lane bound check; not used to compute expected output.
 for(let pair=0;pair<8;pair++){let lo=0n,hi=0n;for(let i=0;i<1024;i++){lo+=BigInt(input[i])*BigInt(weight[pair*2048+i]+128);hi+=BigInt(input[i])*BigInt(weight[pair*2048+1024+i]+128);}assert(lo<2n**26n&&hi<2n**26n);assert(lo+2n**26n*hi<2n**52n);}cases++;
}
assert.equal(cases,80);
});
