import test from 'node:test';
import assert from 'node:assert/strict';
import {Board} from '../engine/src/board.js';
import {Search} from '../engine/src/search.js';
function historyFixture(){
 const board=new Board(),states=[];
 const record=()=>states.push({key:board.key(),turn:board.turn,moverSide:-board.turn,gaveCheck:board.inCheck()});
 record();for(const move of ['b0c2','b9c7','c2b0']){board.playUci(move);record();}
 return {board,states};
}
for(const typedTT of [false,true])for(const ttBounds of [false,true]){
 test(`history-dependent TT score safety: typed=${typedTT}, experimentalBounds=${ttBounds}`,()=>{
  const {board,states}=historyFixture(),search=new Search({checkAware:true,typedTT,ttBounds,evaluator:()=>123});
  search.run(board,{depth:0,movetime:Infinity,gameHistory:states});
  assert.equal(Math.abs(search.negamax(1,-32000,32000,1)),0);
  search.gameHistory=[];const reused=search.negamax(1,-32000,32000,1);
  search.tt.clear();const fresh=search.negamax(1,-32000,32000,1);
  assert.equal(fresh,-123);
  if(ttBounds)assert.equal(Math.abs(reused),0,'known unsafe experimental option reproduces counterexample');
  else assert.equal(reused,fresh,'default ordering-only TT never reuses historical score');
 });
}
test('checked quiescence obeys node budget and restores state on interrupted evasion',()=>{
 const board=new Board('3k5/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1');
 const fen=board.toFEN(),key=board.key(),kings=Array.from(board.kings);
 const search=new Search({evaluator:()=>123});search.run(board,{depth:0,movetime:Infinity,nodes:2});
 assert.throws(()=>search.qsearch(-32000,32000,0,12));
 assert.equal(search.nodes,2);assert.equal(search.stopped,true);
 assert.equal(board.toFEN(),fen);assert.equal(board.key(),key);assert.deepEqual(Array.from(board.kings),kings);
});
test('checked live position at hard ply cap aborts without static leaf or mutation',()=>{
 const board=new Board('3k5/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1'),fen=board.toFEN();
 const search=new Search({evaluator:()=>123});search.run(board,{depth:0,movetime:Infinity,nodes:10});
 assert.throws(()=>search.qsearch(-32000,32000,100,100));
 assert.equal(search.stopped,true);assert.equal(board.toFEN(),fen);
});
