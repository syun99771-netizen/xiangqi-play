// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const source=fs.readFileSync(new URL('../engine/experimental/fairy-cc0-sparse-head-v1/wasm-head.mjs',import.meta.url),'utf8');
let sequence=0;
const fresh=async text=>import('data:text/javascript;base64,'+Buffer.from((text??source)+'\n// isolated '+sequence++).toString('base64'));
const stacks=()=>Array.from({length:8},()=>[{bias:new Int32Array(16),weight:new Int8Array(16384)},{bias:new Int32Array(32),weight:new Int8Array(1024)},{bias:new Int32Array(1),weight:new Int8Array(32)}]);
const real=globalThis.WebAssembly;
const replacement=patch=>Object.defineProperties({}, {...Object.getOwnPropertyDescriptors(real),...Object.fromEntries(Object.entries(patch).map(([k,value])=>[k,{value,writable:true,configurable:true,enumerable:true}]))});

test('supported head really executes and exposes only immutable counter snapshots',async()=>{
 const h=await fresh(),params=stacks();params[0][2].bias[0]=1234;
 const run=h.createWasmHead(params),before=h.wasmHeadStats();assert.equal(typeof run,'function');
 assert.equal(run(new Int16Array(512),new Int16Array(512),0),1234);
 assert.deepEqual(h.wasmHeadStats(),{calls:1,instances:1,fallbacks:0});assert(Object.isFrozen(before));assert.deepEqual(before,{calls:0,instances:1,fallbacks:0});
 assert.deepEqual(Object.keys(h).sort(),['createWasmHead','wasmHeadStats']);
});

test('absent APIs, unavailable SIMD, decoder and endian support choose scalar without construction',async()=>{
 const originalAtob=globalThis.atob;
 try{
  for(const fake of [undefined,replacement({validate:undefined}),replacement({Module:undefined}),replacement({Instance:undefined}),replacement({validate:()=>false,Module:class{constructor(){assert.fail('unsupported SIMD must not construct');}}})]){
   globalThis.WebAssembly=fake;const h=await fresh();assert.equal(h.createWasmHead(stacks()),null);assert.deepEqual(h.wasmHeadStats(),{calls:0,instances:0,fallbacks:1});
  }
  globalThis.WebAssembly=real;globalThis.atob=undefined;const noDecoder=await fresh();assert.equal(noDecoder.createWasmHead(stacks()),null);
  globalThis.atob=originalAtob;
  const needle='new Uint8Array(endian.buffer)[0]!==1';assert(source.includes(needle));
  const endian=await fresh(source.replace(needle,'true'));assert.equal(endian.createWasmHead(stacks()),null);
 }finally{globalThis.WebAssembly=real;globalThis.atob=originalAtob;}
});

test('native constructor CompileError including CSP falls back once and stays scalar',async()=>{
 try{
  for(const where of ['Module','Instance']){
   let attempts=0;
   globalThis.WebAssembly=replacement({[where]:class{constructor(){attempts++;throw new real.CompileError('WebAssembly code generation disallowed by CSP');}}});
   const h=await fresh();assert.equal(h.createWasmHead(stacks()),null);assert.equal(h.createWasmHead(stacks()),null);
   assert.equal(attempts,1);assert.deepEqual(h.wasmHeadStats(),{calls:0,instances:0,fallbacks:2});
  }
 }finally{globalThis.WebAssembly=real;}
});

test('ordinary, forged-name, link, resource and runtime constructor failures are never swallowed',async()=>{
 try{
  const forged=new Error('not a native CompileError');forged.name='CompileError';
  for(const error of [new Error('unexpected'),forged,new TypeError('bad input'),new RangeError('resource limit'),new real.LinkError('unexpected link failure'),new real.RuntimeError('runtime trap')])for(const where of ['Module','Instance']){
   globalThis.WebAssembly=replacement({[where]:class{constructor(){throw error;}}});
   const h=await fresh();assert.throws(()=>h.createWasmHead(stacks()),e=>e===error);
   assert.equal(h.wasmHeadStats().fallbacks,0);
  }
 }finally{globalThis.WebAssembly=real;}
});

test('layout, imported-runtime and parameter corruption propagate rather than choosing scalar',async()=>{
 try{
  const module=new real.Module(Buffer.from(source.match(/const encoded='([^']+)'/)[1],'base64'));
  for(const patch of [{weights_ptr:()=>65552},{accum_ptr:()=>206640},{weights_bytes:()=>1},{memory:new real.Memory({initial:3,maximum:3})}]){
   globalThis.WebAssembly=replacement({Instance:class{constructor(){this.exports={...new real.Instance(module).exports,...patch};}}});
   const h=await fresh();assert.throws(()=>h.createWasmHead(stacks()),/Unexpected WASM head layout/);assert.equal(h.wasmHeadStats().fallbacks,0);
  }
  class ImportedModule{constructor(bytes){return new real.Module(bytes);}static imports(){return [{module:'unexpected',name:'runtime',kind:'function'}];}}
  globalThis.WebAssembly=replacement({Module:ImportedModule});
  const imported=await fresh();assert.throws(()=>imported.createWasmHead(stacks()),/must not import a runtime/);
  globalThis.WebAssembly=real;
  const h=await fresh();assert.throws(()=>h.createWasmHead(stacks().slice(1)),/exactly eight/);
  for(const invalid of [[],new Int16Array(16),new Int32Array(15)]){const p=stacks();p[0][0].bias=invalid;assert.throws(()=>h.createWasmHead(p),/parameters/);}
  assert.equal(h.wasmHeadStats().fallbacks,0);
 }finally{globalThis.WebAssembly=real;}
});
