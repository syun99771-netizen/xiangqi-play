import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../engine/src/board.js';import {Search,MATE} from '../engine/src/search.js';
const fixtures=[
 {fen:'2bakab2/9/9/p4R2p/2p1C4/9/P1n1P1P1P/2N1B4/9/2BA1K1r1 w - - 5 24',cycle:['f0f1','h0h1','f1f0','h1h0']},
 {fen:'R1b1ka3/4a4/9/8p/2p6/9/P5P1P/9/2n6/4K4 w - - 8 35',cycle:['e0d0','c1e2','d0e0','e2c1']}
];
const state=b=>({key:b.key(),turn:b.turn,moverSide:-b.turn,gaveCheck:b.inCheck()});
const rotateMove=m=>[String.fromCharCode(202-m.charCodeAt(0)),String(9-Number(m[1])),String.fromCharCode(202-m.charCodeAt(2)),String(9-Number(m[3]))].join('');
function replay(fixture,plies,rotated=false){const b=new Board(fixture.fen);if(rotated){const a=[...b.squares];for(let i=0;i<90;i++)b.squares[89-i]=-a[i];b.turn=-b.turn;b.kings[0]=b.squares.indexOf(7);b.kings[1]=b.squares.indexOf(-7);b.rehash();}const moves=rotated?fixture.cycle.map(rotateMove):fixture.cycle,history=[state(b)];for(let i=0;i<plies;i++){b.playUci(moves[i%4]);history.push(state(b));}return {b,history};}
function ready(b,history=[],options={}){const s=new Search({checkAware:true,qsearchRepetition:true,...options});s.run(b,{depth:0,movetime:Infinity,gameHistory:history});return s;}
test('optional q guard respects verified checker side at every phase and rotated color',()=>{
 for(const fixture of fixtures)for(const rotated of [false,true])for(const plies of [4,5,6,7,8,9,10,11])for(const ruleProfile of ['cca2020','pikafish2026']){
  const {b,history}=replay(fixture,plies,rotated),fen=b.toFEN(),s=ready(b,history,{ruleProfile,evaluator:()=>5000}),checker=rotated?1:-1;
  const magnitude=plies>=8&&ruleProfile==='pikafish2026'?MATE-3:1000;
  // Narrow beta deliberately exposes the bug if stand-pat were checked first.
  assert.equal(s.qsearch(-32000,0,3,0),b.turn===checker?-magnitude:magnitude);assert.equal(s.totalCycleGuardReturns,1);assert.deepEqual(s.pathStates,[]);assert.equal(b.toFEN(),fen);
 }
});
test('terminal priority and depth-zero bridge never manufacture repetition visits',()=>{
 const terminal=new Board('3k5/9/9/9/9/9/9/4pr3/4r4/4K4 w - - 0 1'),s=ready(terminal);s.repetitionValue=()=>{throw Error('must not inspect repeats before terminal');};assert.equal(s.qsearch(-32000,32000,4,0),-MATE+4);
 const {b,history}=replay(fixtures[0],4),bridge=ready(b,history,{ruleProfile:'pikafish2026'});assert.equal(bridge.negamax(0,-32000,32000,2),1000);assert.equal(bridge.totalCycleGuardReturns,1);assert.deepEqual(bridge.pathStates,[]);
});
test('q recursion pushes its current node exactly once and restores on STOP',()=>{
 const b=new Board('3k5/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1'),fen=b.toFEN(),key=b.key(),s=ready(b),seen=[];
 s.repetitionValue=function(){seen.push(this.pathStates.map(x=>x.key));return null;};s.qsearch(-32000,32000,0,0);assert.deepEqual(seen[0],[]);assert.ok(seen.slice(1).some(path=>path.length===1&&path[0]===key));assert.deepEqual(s.pathStates,[]);assert.equal(b.toFEN(),fen);
 const stopped=ready(b);stopped.maxNodes=2;assert.throws(()=>stopped.qsearch(-32000,32000,0,0));assert.equal(stopped.stopReason,'nodes');assert.deepEqual(stopped.pathStates,[]);assert.equal(b.toFEN(),fen);assert.equal(b.key(),key);
});
test('quiet repetitions stay heuristic zero, not an official draw; null subtrees skip guard',()=>{
 const {b,history}=replay({fen:undefined,cycle:['b0c2','b9c7','c2b0','c7b9']},8),s=ready(b,history);assert.equal(s.qsearch(-32000,32000,2,0),0);assert.equal(s.totalCycleGuardReturns,1);
 const sparse=new Board('3k5/9/9/9/4P4/9/9/9/9/4K4 w - - 0 1'),n=ready(sparse);n.nullDepth=2;n.repetitionValue=()=>{throw Error('virtual subtree used repetition');};n.qsearch(-32000,32000,1,0);assert.equal(n.totalCycleGuardReturns,0);assert.deepEqual(n.pathStates,[]);
});
test('mutual-check synthetic classifier span stays heuristic zero in q guard',()=>{
 const b=new Board('3k5/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1'),s=ready(b);
 // Synthetic flags test only; no claim of a real mutually-checking legal cycle.
 s.gameHistory=[{key:b.key(),turn:1,moverSide:-1,gaveCheck:true},{key:'synthetic-other',turn:-1,moverSide:1,gaveCheck:true}];
 assert.equal(s.qsearch(-32000,32000,2,0),0);assert.equal(s.totalCycleGuardReturns,1);
});
test('qsearch repetition is opt-in and requires check-aware mode',()=>{
 assert.equal(new Search().options.qsearchRepetition,false);assert.throws(()=>new Search({qsearchRepetition:true}),/requires checkAware/);
});
