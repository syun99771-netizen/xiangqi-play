import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../engine/src/board.js';
function compareEveryTarget(b){const fen=b.toFEN(),hash=b.key(),kings=[...b.kings];for(const side of [1,-1])for(let target=0;target<90;target++)assert.equal(b.isAttackedFast(target,side),b.isAttacked(target,side),`target=${target} side=${side} fen=${fen}`);assert.equal(b.toFEN(),fen);assert.equal(b.key(),hash);assert.deepEqual([...b.kings],kings);}
test('optional precomputed attacks match all90 targets and both sides on seeded legal games',()=>{
 let seed=20261115;const next=n=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%n;};
 for(let game=0;game<3;game++){
  const b=new Board();for(let ply=0;ply<64;ply++){if(ply%4===0)compareEveryTarget(b);const moves=b.generateLegalMoves();if(!moves.length)break;b.makeMove(moves[next(moves.length)]);}
 }
});
test('synthetic edge pieces compare generic occupied and empty targets without legal-position assumptions',()=>{
 const edges=[0,3,4,5,8,9,13,18,22,26,36,44,45,53,63,67,76,81,84,85,86,89];
 for(const p of [-7,-6,-5,-4,-3,-2,-1,1,2,3,4,5,6,7])for(const square of edges){
  const b=new Board('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1');b.squares[square]=p;
  // Intentionally arbitrary static occupancies, including unusual king locations.
  compareEveryTarget(b);
 }
});
test('fast king file attacks remain opposing-king-only and adjacent targets remain in palace',()=>{
 for(const fen of ['4k4/9/9/9/4R4/9/9/9/9/3K5 w - - 0 1','9/9/4k4/9/9/9/9/9/9/3K5 w - - 0 1','4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1'])compareEveryTarget(new Board(fen));
});
test('instance-only fast attack override preserves ordered legal and capture lists',()=>{
 const fens=['4k4/9/9/4n4/9/5p3/9/9/9/4KR3 w - - 0 1','c2k5/9/n8/9/p8/9/9/9/9/R3K4 w - - 0 1'];
 for(const fen of fens){const b=new Board(fen);for(const capturesOnly of [false,true]){const expected=b.generateLegalMoves({capturesOnly});b.isAttacked=b.isAttackedFast.bind(b);try{assert.deepEqual(b.generateLegalMoves({capturesOnly}),expected);assert.deepEqual(b.generateLegalMovesFast({capturesOnly}),expected);}finally{delete b.isAttacked;}}}
});
