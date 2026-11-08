import test from 'node:test';
import assert from 'node:assert/strict';
import {TranspositionTable,TT_EXACT,TT_LOWER,TT_UPPER,scoreToTT,scoreFromTT} from '../engine/src/transposition.js';
const entry=(depth=5,score=123,flag=TT_EXACT,move=72)=>({depth,score,flag,move});

test('TT validates power-of-two capacity and reports fixed memory',()=>{
  for(const capacity of [0,3,1.5,-1,2**23])assert.throws(()=>new TranspositionTable({capacity}),/power of two/);
  const tt=new TranspositionTable({capacity:16});assert.equal(tt.capacity,16);assert.equal(tt.byteLength,352);assert.equal(tt.size,0);
});
test('TT zero hash is a real entry and independent occupancy distinguishes an empty table',()=>{
  const tt=new TranspositionTable(8);assert.equal(tt.get(0,0),null);assert.equal(tt.find(0,0),-1);
  assert.equal(tt.set(0,0,entry()),true);assert.deepEqual(tt.get(0,0),entry());assert.equal(tt.size,1);
  tt.clear();assert.equal(tt.get(0,0),null);assert.equal(tt.size,0);
});
test('TT validates BOTH hash words and never treats an index collision as a hit',()=>{
  const tt=new TranspositionTable(1);tt.set(0x12345678,0x9abcdef0,entry());
  assert.equal(tt.get(0x12345678,0x9abcdef1),null);assert.equal(tt.get(0x12345679,0x9abcdef0),null);
  assert.deepEqual(tt.get(0x12345678,0x9abcdef0),entry());
});
test('TT signed and unsigned hash inputs represent the same 32-bit words',()=>{
  const tt=new TranspositionTable(8);tt.set(-1,-2147483648,entry());
  assert.deepEqual(tt.get(0xffffffff,0x80000000),entry());assert.equal(tt.hashLo[tt.find(-1,-2147483648)],4294967295);
});
test('TT replaces by depth or generation and retains exact same-key equal-depth information',()=>{
  const tt=new TranspositionTable(1);tt.set(1,2,entry(7));
  assert.equal(tt.set(3,4,entry(6)),false);assert.ok(tt.has(1,2));assert.ok(!tt.has(3,4));
  assert.equal(tt.set(3,4,entry(8)),true);assert.ok(!tt.has(1,2));assert.ok(tt.has(3,4));
  assert.equal(tt.set(3,4,entry(8,20,TT_LOWER)),false);assert.equal(tt.get(3,4).flag,TT_EXACT);
  tt.newGeneration();assert.equal(tt.set(1,2,entry(1)),true);assert.ok(tt.has(1,2));assert.equal(tt.size,1);
});
test('TT generation wrap clears old occupancy and does not create stale hits',()=>{
  const tt=new TranspositionTable(4);tt.set(0,0,entry());tt.generation=0xffffffff;
  assert.equal(tt.newGeneration(),1);assert.equal(tt.size,0);assert.equal(tt.get(0,0),null);
});
test('TT mate scores normalize and decode at a new root ply',()=>{
  assert.equal(scoreToTT(29995,5),30000);assert.equal(scoreFromTT(30000,3),29997);
  assert.equal(scoreToTT(-29995,5),-30000);assert.equal(scoreFromTT(-30000,3),-29997);
  for(const s of [-29900,-200,0,200,29900])assert.equal(scoreFromTT(scoreToTT(s,20),3),s);
  const tt=new TranspositionTable(4);tt.store(5,6,entry(4,29995),5);assert.equal(tt.get(5,6).score,30000);
});
test('TT allocation-free find and optional out object agree with ordinary get',()=>{
  const tt=new TranspositionTable(16);tt.set(7,8,entry(4,-120,TT_UPPER,null));const slot=tt.find(7,8),out={};
  assert.equal(tt.get(7,8,out),out);assert.equal(out.depth,tt.depths[slot]);assert.equal(out.score,tt.scores[slot]);assert.equal(out.flag,tt.flags[slot]);assert.equal(out.move,null);
});
test('TT rejects values that would silently overflow typed storage',()=>{
  const tt=new TranspositionTable(2);
  for(const e of [entry(32768),entry(1,2**31),entry(1,1.5),entry(1,1,3),entry(1,1,0,8100)])assert.throws(()=>tt.set(1,2,e));
});
test('TT randomized collisions return only matching full keys',()=>{
  const tt=new TranspositionTable(32);let state=1;const next=()=>state=(Math.imul(state,1664525)+1013904223)>>>0;const expected=new Map();
  for(let i=0;i<1000;i++){
    if(i%25===0)tt.newGeneration();const lo=next(),hi=next(),data=entry(i%12,i,TT_LOWER,i%8100);
    if(tt.set(lo,hi,data))expected.set(tt.index(lo,hi),{lo,hi,data});
    for(const {lo:a,hi:b,data:d}of expected.values())assert.deepEqual(tt.get(a,b),d);
    assert.equal(tt.get(lo,hi^0x80000000),null);
  }
});
