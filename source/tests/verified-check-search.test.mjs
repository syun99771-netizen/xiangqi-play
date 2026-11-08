import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../engine/src/board.js';import {Search,MATE} from '../engine/src/search.js';
import {classifyPublicRepetition} from '../engine/src/public-repetition.mjs';
const options={checkAware:true,qsearchRepetition:true,repetitionPolicy:'verified-check-terminal',ruleProfile:'pikafish2026'};
const fixtures=[{fen:'2bakab2/9/9/p4R2p/2p1C4/9/P1n1P1P1P/2N1B4/9/2BA1K1r1 w - - 5 24',cycle:['f0f1','h0h1','f1f0','h1h0']},{fen:'R1b1ka3/4a4/9/8p/2p6/9/P5P1P/9/2n6/4K4 w - - 8 35',cycle:['e0d0','c1e2','d0e0','e2c1']}];
const canonical=b=>b.toFEN().split(' ').slice(0,2).join(' ');
function history(fixture,plies,rotate=false){
 const b=new Board(fixture.fen);if(rotate){const a=[...b.squares];for(let i=0;i<90;i++)b.squares[89-i]=-a[i];b.turn=-b.turn;b.kings[0]=b.squares.indexOf(7);b.kings[1]=b.squares.indexOf(-7);b.rehash();}
 const origin=b.toFEN(),states=[{canonical:canonical(b),key:b.key(),turn:b.turn,moverSide:null,move:null,captured:0,gaveCheck:b.inCheck()}];
 const rot=m=>[String.fromCharCode(202-m.charCodeAt(0)),String(9-Number(m[1])),String.fromCharCode(202-m.charCodeAt(2)),String(9-Number(m[3]))].join('');
 for(let i=0;i<plies;i++){let move=fixture.cycle[i%4];if(rotate)move=rot(move);const moverSide=b.turn,u=b.playUci(move);states.push({canonical:canonical(b),key:b.key(),turn:b.turn,moverSide,move,captured:u.captured,gaveCheck:b.inCheck()});}
 return {b,states,origin};
}
function ready(h){const s=new Search(options);s.run(h.b,{depth:0,movetime:Infinity,historyComplete:true,historyOriginFEN:h.origin,gameHistory:h.states});return s;}
test('strict second occurrence continues and third verified checker loses in every phase/color',()=>{
 for(const fixture of fixtures)for(const rotate of [false,true])for(let phase=0;phase<4;phase++){
  const second=history(fixture,4+phase,rotate),s=ready(second);assert.equal(s.repetitionValue(3),null);assert.equal(s.strictTerminalReturns,0);
  const third=history(fixture,8+phase,rotate),t=ready(third),fen=third.b.toFEN(),checker=rotate?1:-1;
  assert.equal(t.qsearch(-32000,32000,3,0),third.b.turn===checker?-MATE+3:MATE-3);assert.equal(t.strictTerminalReturns,1);assert.equal(t.totalCycleGuardReturns,1);assert.equal(t.approxCycleGuards,0);assert.deepEqual(t.pathStates,[]);assert.equal(third.b.toFEN(),fen);
 }
});
test('strict canonical verification rejects false hash matches and uses recovered public quiet-draw semantics',()=>{
 const h=history({fen:undefined,cycle:['b0c2','b9c7','c2b0','c7b9']},8),s=ready(h);
 // The recovered 2026-11-02 core explicitly resolves this third occurrence
 // through its pinned public referee, unlike the old 2026-10-29 approximate guard.
 const decision=classifyPublicRepetition({fen:h.origin,moves:h.states.slice(1).map(x=>x.move),expectedBoard:h.b});
 assert.equal(decision.terminal,true);assert.equal(decision.winner,0);assert.equal(decision.reason,'public-repetition-draw');
 assert.equal(s.qsearch(-32000,32000,2,0),0);assert.equal(s.approxCycleGuards,0);assert.equal(s.strictTerminalReturns,1);assert.equal(s.publicRuleTerminalReturns,1);
 const second=history({fen:undefined,cycle:['b0c2','b9c7','c2b0','c7b9']},4),secondSearch=ready(second);
 assert.equal(secondSearch.repetitionValue(2),null);assert.equal(secondSearch.strictTerminalReturns,0);assert.equal(secondSearch.publicRuleTerminalReturns,0);
 const t=ready(h);for(const st of t.gameHistory)if(st.key===h.b.key())st.squares=new Int8Array(90);
 assert.equal(t.repetitionValue(2),null);assert.equal(t.strictTerminalReturns,0);
});
test('strict requires explicit scope and rejects forged chronology/check flags',()=>{
 assert.throws(()=>new Search({...options,ruleProfile:'cca2020'}));assert.throws(()=>new Search({...options,ttBounds:true}));
 const h=history(fixtures[0],4);assert.throws(()=>new Search(options).run(h.b,{depth:0,gameHistory:h.states}));
 for(const field of ['canonical','key','turn','moverSide','captured','gaveCheck','move']){
  const states=structuredClone(h.states);states[2][field]=field==='gaveCheck'?!states[2][field]:null;
  assert.throws(()=>new Search(options).run(h.b,{depth:0,historyComplete:true,historyOriginFEN:h.origin,gameHistory:states}),field);
 }
 const missing=structuredClone(h.states);missing.splice(2,1);assert.throws(()=>new Search(options).run(h.b,{depth:0,historyComplete:true,historyOriginFEN:h.origin,gameHistory:missing}));
});
test('strict q path slots restore after budget stop and guard skips entire null subtree',()=>{
 const h=history(fixtures[0],3),s=ready(h),fen=h.b.toFEN(),key=h.b.key();s.maxNodes=2;
 assert.throws(()=>s.qsearch(-32000,32000,0,0));assert.deepEqual(s.pathStates,[]);assert.equal(h.b.toFEN(),fen);assert.equal(h.b.key(),key);
 const t=ready(history(fixtures[0],4));t.nullDepth=2;t.repetitionValue=()=>{throw Error('strict null guard called');};t.maxNodes=2;
 try{t.qsearch(-32000,32000,0,0);}catch(e){assert.equal(typeof e,'symbol');}assert.deepEqual(t.pathStates,[]);assert.equal(t.strictTerminalReturns,0);
});
test('history validation and baseline setup are charged to the same think budget',()=>{
 const original=Object.getOwnPropertyDescriptor(performance,'now');let now=0;
 Object.defineProperty(performance,'now',{configurable:true,value:()=>now});
 try{
  const h=history(fixtures[0],0),canonical=h.states[0].canonical;
  Object.defineProperty(h.states[0],'canonical',{get(){now=250;return canonical;}});
  const result=new Search(options).run(h.b,{depth:5,movetime:200,historyComplete:true,historyOriginFEN:h.origin,gameHistory:h.states});
  assert.equal(result.depth,0);assert.equal(result.nodes,0);assert.equal(result.time,250);assert.equal(result.setupMs,250);assert.equal(result.historyValidationMs,250);assert.equal(result.stopReason,'time');assert.equal(result.completionReason,null);assert.ok(h.b.generateLegalMoves().includes(result.move));
  now=0;const baseline=new Search().run(new Board(),{depth:5,movetime:200,weights:{toJSON(){now=250;return null;}}});
  assert.equal(baseline.depth,0);assert.equal(baseline.nodes,0);assert.equal(baseline.time,250);assert.equal(baseline.setupMs,250);assert.equal(baseline.historyValidationMs,0);assert.equal(baseline.stopReason,'time');
 }finally{if(original)Object.defineProperty(performance,'now',original);else delete performance.now;}
});
