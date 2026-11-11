import test from 'node:test';
import assert from 'node:assert/strict';
import {Search, MATE, MAX_STATIC_SCORE} from '../engine/src/search-public-b562.js';
import {preparePosition,START_FEN} from '../engine/src/sdk/core.js';
import {BENCHMARK_SEARCH_OPTIONS} from '../engine/experimental/cc0-portable-public-b562-v2/profile.mjs';
import {runCc0BenchmarkSearch} from '../reference-core.mjs';
import {createReference, searchWithModel} from '../api.mjs';

// Mechanical tests deliberately inject returned bounds and interruptions, not
// chess evidence. Real search/root-admission checks are explicitly named below.
const FEN='4k4/9/9/9/9/4P4/9/9/9/4K4 w - - 0 1';
const sharedFlag=()=>new Int32Array(new SharedArrayBuffer(4));
const request=(id,fen=FEN)=>({requestId:id,fen,moves:[],historyComplete:true,
  options:{...BENCHMARK_SEARCH_OPTIONS},limits:{mode:'depth',depth:1}});
function position(){return preparePosition(request('review-position'));}
function snap(b){return {fen:b.toFEN(),squares:[...b.squares],kings:[...b.kings],
  turn:b.turn,hashLo:b.hashLo,hashHi:b.hashHi};}
function assertRestored(s,p,before,history){
  assert.deepEqual(snap(p.board),before);
  assert.deepEqual(p.judge.states,history);
  for(const field of ['publicPathMoves','pathLow','pathHigh','pathStates'])assert.deepEqual(s[field],[],field);
  assert.equal(s.publicClockIndex,0);assert.equal(s.nullDepth,0);
  const counts=new Int16Array(16);
  for(const piece of p.board.squares)if(piece)counts[(piece>0?0:8)+Math.abs(piece)]++;
  assert.deepEqual(s.directMaterialCounts,counts);
}
function nodeStop(s){s.maxNodes=s.nodes+1;s.tick();assert.fail('Expected internal STOP');}
function mechanical(steps,{options={},clock=()=>0,stopFlag=sharedFlag()}={}){
  const p=position(),before=snap(p.board),history=structuredClone(p.judge.states),calls=[];
  class Controlled extends Search{
    negamax(depth,alpha,beta,ply,...rest){
      const i=calls.length;calls.push({depth,alpha,beta,ply,move:this.publicPathMoves.at(-1)});
      assert.equal(ply,1);
      const step=steps[i]??(()=>nodeStop(this));
      return typeof step==='function'?step(this,calls[i]):step;
    }
  }
  const s=new Controlled({...BENCHMARK_SEARCH_OPTIONS,retainCompletedRootWin:true,
    evaluator:()=>0,clock,...options});
  const run=extra=>s.run(p.board,{depth:1,movetime:1000,gameHistory:p.judge.states,
    historyComplete:true,historyOriginFEN:p.origin,stopFlag,...extra});
  return {p,s,calls,stopFlag,run,restored:()=>assertRestored(s,p,before,history)};
}

for(const bound of [MATE-5,MATE-6])test(`mechanical: contaminated mate alpha then ${bound} upper bound is not evidence`,()=>{
  const h=mechanical([s=>{s.totalCycleGuardReturns++;return -(MATE-5);},-bound]);
  const r=h.run();h.restored();
  assert.equal(h.calls[1].beta,-(MATE-5));
  assert.equal(r.forcedWin,undefined);assert.equal(r.score,0);
  assert.equal(r.depth,0);assert.equal(r.stopReason,'nodes');
  assert.equal(h.s.completedRootWin,null);assert.equal(r.totalCycleGuardReturns,1);
});

test('mechanical: genuine prior evidence survives later equal upper bound without replacement',()=>{
  const h=mechanical([-(MATE-5),-(MATE-5)]);const r=h.run();h.restored();
  assert.equal(r.move,h.calls[0].move);assert.notEqual(h.calls[0].move,h.calls[1].move);
  assert.equal(r.forcedWin.move,h.calls[0].move);assert.equal(r.score,null);
  assert.equal(r.forcedWin.scoreLowerBound,MATE-5);assert.equal(r.forcedWin.winWithinPlies,5);
  assert.equal(r.forcedWin.searchDepth,1);assert.equal(r.forcedWin.lastCompletedDepth,0);
  assert.equal(r.forcedWin.rootIterationComplete,false);assert.equal(r.forcedWin.scoreBound,'lower');
  assert.deepEqual(r.pv,[r.move]);assert.deepEqual(r.completedIterations,[]);
  assert.equal(r.completionReason,null);assert.equal(r.stopped,true);
});

test('mechanical: clean strict improvement may follow contaminated mate alpha',()=>{
  const h=mechanical([s=>{s.totalCycleGuardReturns++;return -(MATE-5);},-(MATE-3)]);
  const r=h.run();h.restored();assert.equal(r.move,h.calls[1].move);
  assert.equal(r.forcedWin.scoreLowerBound,MATE-3);assert.equal(r.forcedWin.cycleGuardReturns,0);
  assert.equal(r.totalCycleGuardReturns,1);
});

test('mechanical: PVS scout win is discarded if full re-search aborts',()=>{
  const h=mechanical([-10,-(MATE-5)],{options:{rootPvs:true}});
  const r=h.run();h.restored();
  assert.deepEqual(h.calls.map(c=>[c.alpha,c.beta]),[[-32000,32000],[-11,-10],[-32000,-10]]);
  assert.equal(h.calls[1].move,h.calls[2].move);
  assert.equal(r.forcedWin,undefined);assert.equal(h.s.completedRootWin,null);
  assert.equal(r.depth,0);assert.equal(r.stopReason,'nodes');
});

test('mechanical: PVS scout cycle contamination still rejects a clean re-search',()=>{
  const h=mechanical([-10,s=>{s.totalCycleGuardReturns++;return -(MATE-5);},-(MATE-5)],{options:{rootPvs:true}});
  const r=h.run();h.restored();assert.equal(r.forcedWin,undefined);
  assert.equal(r.totalCycleGuardReturns,1);assert.equal(h.s.completedRootWin,null);
});

test('mechanical: PVS completed clean re-search is eligible',()=>{
  const h=mechanical([-10,-(MATE-5),-(MATE-5)],{options:{rootPvs:true}});
  const r=h.run();h.restored();assert.equal(r.move,h.calls[1].move);
  assert.equal(r.forcedWin.scoreLowerBound,MATE-5);assert.equal(r.score,null);
});

test('mechanical: cancellation raised by final clock wins simultaneous node stop',()=>{
  const stopFlag=sharedFlag();let s;
  const h=mechanical([-(MATE-5)],{stopFlag,clock:()=>{if(s?.stopped)Atomics.store(stopFlag,0,-7);return 0;}});s=h.s;
  const r=h.run();h.restored();assert.ok(s.completedRootWin,'Evidence existed before final cancellation');
  assert.equal(r.forcedWin,undefined);assert.equal(r.stopReason,'external');
  assert.equal(r.completionReason,null);assert.equal(r.score,0);
});

test('mechanical: cancellation raised by capture clock prevents recording',()=>{
  const stopFlag=sharedFlag();let captureClock=false;
  const h=mechanical([()=>{captureClock=true;return -(MATE-5);}],{
    stopFlag,clock:()=>{if(captureClock)Atomics.store(stopFlag,0,1);return 0;}});
  const r=h.run();h.restored();assert.equal(h.s.completedRootWin,null);
  assert.equal(r.forcedWin,undefined);assert.equal(r.stopReason,'external');
});

test('mechanical: final clock exception propagates instead of returning retained evidence',()=>{
  const sentinel=new Error('final-clock-sentinel');let s;
  const h=mechanical([-(MATE-5)],{clock:()=>{if(s?.stopped)throw sentinel;return 0;}});s=h.s;
  assert.throws(()=>h.run(),e=>e===sentinel);h.restored();
});

test('mechanical: later ordinary exception propagates instead of returning retained evidence',()=>{
  const sentinel=new Error('child-sentinel');
  const h=mechanical([-(MATE-5),()=>{throw sentinel;}]);
  assert.throws(()=>h.run(),e=>e===sentinel);h.restored();
});

test('mechanical: hard-ply STOP never adopts prior evidence',()=>{
  const h=mechanical([-(MATE-5),s=>Search.prototype.negamax.call(s,1,-32000,32000,100)]);
  const r=h.run();h.restored();assert.ok(h.s.completedRootWin);
  assert.equal(r.forcedWin,undefined);assert.equal(r.stopReason,'hard-ply');assert.equal(r.score,0);
});

test('mechanical: sequential reuse resets previously retained evidence',()=>{
  const h=mechanical([-(MATE-5)]);const first=h.run();h.restored();assert.ok(first.forcedWin);
  const second=h.run();h.restored();assert.equal(second.forcedWin,undefined);
  assert.equal(h.s.completedRootWin,null);assert.equal(second.depth,0);assert.equal(second.score,0);
});

test('mechanical: restoration exception cannot record an apparently completed child',()=>{
  const sentinel=new Error('restore-sentinel');const h=mechanical([-(MATE-5)]);
  const original=h.s.unmakeSearchMove;
  h.s.unmakeSearchMove=function(undo){original.call(this,undo);throw sentinel;};
  assert.throws(()=>h.run(),e=>e===sentinel);h.restored();assert.equal(h.s.completedRootWin,null);
});

for(const score of [29900,20000,-29995,30000])test(`mechanical: noneligible score ${score} never records`,()=>{
  const h=mechanical([-score]);const r=h.run();h.restored();assert.equal(r.forcedWin,undefined);
  assert.equal(h.s.completedRootWin,null);
});

for(const checkExtensions of [1,2])test(`mechanical: checkExtensions=${checkExtensions} disables retention`,()=>{
  const h=mechanical([-(MATE-5)],{options:{checkExtensions}});const r=h.run();h.restored();
  assert.equal(h.s.retainCompletedRootWin,false);assert.equal(r.forcedWin,undefined);
});
for(const key of ['lmr','nullMove'])test(`mechanical: ${key} disables retention`,()=>{
  const h=mechanical([-(MATE-5)],{options:{[key]:true}});const r=h.run();h.restored();
  assert.equal(h.s.retainCompletedRootWin,false);assert.equal(r.forcedWin,undefined);
});

test('mechanical: complete root remains ordinary completed iteration',()=>{
  const h=mechanical(Array(100).fill(-(MATE-5)));const infos=[];
  const r=h.run({onInfo:x=>infos.push(structuredClone(x))});h.restored();
  assert.equal(r.forcedWin,undefined);assert.equal(r.score,MATE-5);assert.equal(r.depth,1);
  assert.equal(r.completionReason,'mate');assert.equal(infos.length,1);
  assert.deepEqual(r.completedIterations,[{depth:1,cycleGuardReturns:0}]);
});

test('mechanical: completed-iteration callback exception propagates and resets on reuse',()=>{
  const sentinel=new Error('callback-sentinel'),steps=Array(100).fill(-(MATE-5));
  const h=mechanical(steps);assert.throws(()=>h.run({onInfo:()=>{throw sentinel;}}),e=>e===sentinel);h.restored();
  steps.length=0;const r=h.run();h.restored();assert.equal(r.forcedWin,undefined);
  assert.equal(h.s.completedRootWin,null);assert.equal(r.stopReason,'nodes');
});

for(const value of [-1e9,1e9])test(`real tiny search: scalar evaluator ${value} cannot create mate-band evidence`,()=>{
  const p=position(),before=snap(p.board),history=structuredClone(p.judge.states);
  const s=new Search({...BENCHMARK_SEARCH_OPTIONS,retainCompletedRootWin:true,evaluator:()=>value,clock:()=>0});
  assert.equal(s.evaluate(p.board),Math.sign(value)*MAX_STATIC_SCORE);
  const r=s.run(p.board,{depth:1,movetime:Infinity,gameHistory:p.judge.states,historyComplete:true,historyOriginFEN:p.origin});
  assert.equal(r.forcedWin,undefined);assert.ok(Math.abs(r.score)<=MAX_STATIC_SCORE);
  assertRestored(s,p,before,history);
});

for(const [name,fen,moves=[]] of [
  ['checkmate','4k4/3RRR3/9/9/9/9/9/9/9/4K4 b - - 0 1'],
  ['stalemate','4k4/3R1R3/9/9/4P4/9/9/9/9/4K4 b - - 0 1'],
  ['direct-material','4k4/9/9/9/9/9/9/9/9/3K5 w - - 0 1'],
  ['rule60',START_FEN.replace(' 0 1',' 119 1'),['b0c2']],
  ['perpetual-check','4k4/9/3R5/9/9/4P4/9/9/9/4K4 w - - 0 1',
    ['d7e7','e9d9','e7d7','d9e9','d7e7','e9d9','e7d7','d9e9']],
])test(`real existing public root gate: ${name} never enters model/Search factory`,async()=>{
  const q={...request(`review-terminal-${name}`,fen),moves},prepared=preparePosition(q);
  assert.equal(prepared.context.adjudication.terminal,true);
  let callbacks=0,loads=0;
  const direct=runCc0BenchmarkSearch(q,{onInfo:()=>callbacks++});
  const facade=searchWithModel(q,{onInfo:()=>callbacks++});
  const ref=createReference({readModelBytes:()=>{loads++;throw Error('must not load model');}});
  const lazy=await ref.search(q,{onInfo:()=>callbacks++});ref.dispose();
  for(const r of [direct,facade,lazy]){
    assert.equal(r.status,'terminal');assert.equal(r.terminal,true);assert.equal(r.move,null);
    assert.equal(r.depth,0);assert.equal(r.nodes,0);assert.equal(r.forcedWin,undefined);
  }
  assert.equal(loads,0);assert.equal(callbacks,0);
});

test('existing public request whitelist rejects internal retainCompletedRootWin',()=>{
  assert.throws(()=>preparePosition({...request('internal-option'),options:{...BENCHMARK_SEARCH_OPTIONS,retainCompletedRootWin:true}}),/Unsupported options field retainCompletedRootWin/);
});
