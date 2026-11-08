import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../engine/src/board.js';
import {Search} from '../engine/src/search.js';
import {createEmptyModel,forwardReference} from '../engine/src/nnue.js';

test('zero NNUE exactly preserves fixed-node search decisions',()=>{
 for(const options of [{},{nullMove:true},{checkAware:true}]){
  const a=new Search(options).run(new Board(),{depth:4,nodes:3000,movetime:Infinity});
  const s=new Search({...options,neuralModel:createEmptyModel()});
  const b=new Board(),fen=b.toFEN(),result=s.run(b,{depth:4,nodes:3000,movetime:Infinity});
  for(const key of ['move','score','depth','nodes','stopped'])assert.deepEqual(result[key],a[key],key);
  assert.equal(b.toFEN(),fen);assert.equal(s.neural.ply,0);
 }
});
test('nonzero NNUE accumulator agrees at every searched leaf and restores after stop',()=>{
 const model=createEmptyModel();model.outputWeights.fill(.1);
 const s=new Search({neuralModel:model,nullMove:true}),base=s.evaluate;
 let count=0;s.evaluate=(b,w)=>{count++;const actual=base(b,w),expected=b.turn*Math.round(forwardReference(model,b).scoreRed);assert.equal(actual,expected);return actual;};
 const b=new Board(),fen=b.toFEN();s.run(b,{depth:5,nodes:1000,movetime:Infinity});
 assert.ok(count>100);assert.equal(b.toFEN(),fen);assert.equal(s.neural.ply,0);
 s.run(b,{depth:2,movetime:Infinity});assert.equal(s.neural.ply,0);
});
