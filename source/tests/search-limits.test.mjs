import test from 'node:test';import assert from 'node:assert/strict';import{Board}from'../engine/src/board.js';import{Search,MATE}from'../engine/src/search.js';
// Migration from the 2026-10-29 fixture: initialize through the real recovered
// lifecycle, which also creates publicPathMoves and the rule counters.
function prepare(fen){const s=new Search({evaluator:()=>123,tt:false});s.run(new Board(fen),{depth:0,movetime:Infinity});return s;}
test('deep search cap still recognizes checkmate before abort',()=>{const s=prepare('3k5/9/9/9/9/9/9/4pr3/4r4/4K4 w - - 0 1');assert.equal(s.board.generateLegalMoves().length,0);assert.equal(s.negamax(1,-32000,32000,100),-MATE+100);});
test('quiescence cap does not permit checked stand-pat',()=>{const s=prepare('3k5/9/9/9/9/9/9/9/4r4/4K4 w - - 0 1'),fen=s.board.toFEN();assert.equal(s.board.inCheck(),true);const value=s.qsearch(-32000,32000,0,12);assert.ok(s.nodes>1);assert.notEqual(value,123);assert.equal(s.board.toFEN(),fen);});
test('hard search limit aborts unresolved live tree rather than inventing score',()=>{const s=prepare();assert.throws(()=>s.negamax(1,-32000,32000,100));assert.equal(s.stopped,true);});
