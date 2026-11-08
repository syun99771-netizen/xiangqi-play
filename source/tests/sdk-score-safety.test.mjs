import test from 'node:test';
import assert from 'node:assert/strict';
import {Board,START_FEN,uciToMove} from '../engine/src/board.js';
import {Search,MATE,MAX_STATIC_SCORE,boundedStaticScore} from '../engine/src/search.js';
import {DEFAULT_WEIGHTS} from '../engine/src/evaluate.js';
import {createEmptyModel} from '../engine/src/nnue.js';
import {preparePosition,runSearch} from '../engine/src/sdk/core.js';

// Synthetic positions are intentionally supported. Their material scores must
// not collide with search sentinels and turn an ongoing root into a null move.
const syntheticFEN='rrrrkrrrr/rrrrrrrrr/rrrrrrrrr/rrrrrrrrr/rrrrrrrrr/9/9/PPPPPPPPP/9/4K4 w - - 0 1';
const limits={depth:1,nodes:5000,movetime:Infinity};

test('accepted synthetic SDK root keeps a legal move despite extreme material',()=>{
 const input={requestId:'synthetic-score-bound',fen:syntheticFEN,limits:{depth:1,nodes:256}};
 const prepared=preparePosition(input),legal=prepared.board.generateLegalMoves();
 assert.equal(legal.length,12);
 assert.equal(prepared.context.adjudication.terminal,false);
 for(const model of [null,createEmptyModel({residualCap:400})]){
  const result=runSearch(input,{model});
  assert.equal(result.terminal,false);
  assert.equal(result.context.adjudication.terminal,false);
  assert.notEqual(result.move,null);
  assert.ok(legal.includes(uciToMove(result.move)));
  assert.ok(result.score>-MATE&&result.score<MATE);
  // Quiescence can prove a later mate here. The bug was a fabricated root
  // no-move sentinel, not every score in the genuine mate-distance band.
  assert.equal(result.depth,1);
 }
});

test('static score bound preserves ordinary values and reserves terminal scores',()=>{
 assert.ok(MAX_STATIC_SCORE<MATE-100);
 for(const score of [-MAX_STATIC_SCORE,-100,0,100,MAX_STATIC_SCORE])assert.equal(boundedStaticScore(score),score);
 assert.equal(boundedStaticScore(Number.MAX_VALUE),MAX_STATIC_SCORE);
 assert.equal(boundedStaticScore(-Number.MAX_VALUE),-MAX_STATIC_SCORE);
 for(const value of [NaN,Infinity,-Infinity,'100',null])assert.throws(()=>boundedStaticScore(value),/finite score/);
});

test('huge finite custom evaluations cannot fabricate a mate or lose the root move',()=>{
 for(const value of [-1e9,1e9]){
  const board=new Board(),key=board.key(),search=new Search({evaluator:()=>value});
  assert.equal(search.evaluate(board),Math.sign(value)*MAX_STATIC_SCORE);
  const result=search.run(board,limits);
  assert.equal(result.depth,1);
  assert.ok(board.generateLegalMoves().includes(result.move));
  assert.ok(Math.abs(result.score)<=MAX_STATIC_SCORE);
  assert.notEqual(result.completionReason,'mate');
  assert.equal(board.toFEN(),START_FEN);
  assert.equal(board.key(),key);
 }
});

test('huge custom weights are bounded at the search boundary',()=>{
 const weights=DEFAULT_WEIGHTS.map((value,index)=>index===21?1e9:value);
 const board=new Board(),key=board.key(),search=new Search();
 assert.equal(search.evaluate(board,weights),MAX_STATIC_SCORE);
 const result=search.run(board,{...limits,weights});
 assert.equal(result.depth,1);
 assert.ok(board.generateLegalMoves().includes(result.move));
 assert.ok(Math.abs(result.score)<=MAX_STATIC_SCORE);
 assert.notEqual(result.completionReason,'mate');
 assert.equal(board.toFEN(),START_FEN);
 assert.equal(board.key(),key);
});

test('nonfinite evaluator failures restore the original position',()=>{
 for(const value of [NaN,Infinity,-Infinity]){
  const board=new Board(),key=board.key(),kings=Array.from(board.kings);
  assert.throws(()=>new Search({evaluator:()=>value}).run(board,limits),/finite score/);
  assert.equal(board.toFEN(),START_FEN);
  assert.equal(board.key(),key);
  assert.deepEqual(Array.from(board.kings),kings);
 }
});

test('static score clamp leaves genuine root checkmate and stalemate scores intact',()=>{
 for(const fen of [
  '4k4/3RRR3/9/9/9/9/9/9/9/4K4 b - - 0 1',
  '4k4/3R1R3/9/9/4P4/9/9/9/9/4K4 b - - 0 1'
 ]){
  const board=new Board(fen);
  assert.equal(board.generateLegalMoves().length,0);
  const result=new Search({evaluator:()=>1e9}).run(board,limits);
  assert.equal(result.move,null);
  assert.equal(result.score,-MATE);
  assert.equal(board.toFEN(),fen);
 }
});
