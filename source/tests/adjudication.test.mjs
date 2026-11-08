import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, uciToMove, moveFrom, moveTo, moveToUci } from '../engine/src/board.js';
import { Adjudicator, classifyCheckCycle } from '../engine/src/adjudication.js';
const FEN='4k4/9/3R5/9/9/4P4/9/9/9/4K4 w - - 0 1';
const CHECK_CYCLE=['d7e7','e9d9','e7d7','d9e9'];
function replay(board,moves){const judge=new Adjudicator(board),results=[];for(const m of moves){const side=board.turn;board.playUci(m);results.push(judge.push(board,side));}return {judge,results,last:results.at(-1)};}
test('unilateral perpetual checking loses only on the third occurrence',()=>{
 const {judge,results,last}=replay(new Board(FEN),[...CHECK_CYCLE,...CHECK_CYCLE]);
 for(const r of results.slice(0,-1))assert.equal(r.terminal,false);
 assert.deepEqual(last,{terminal:true,winner:-1,reason:'unilateral-perpetual-check',unresolved:false,cycleStart:0,cycleEnd:8,cyclePlies:8});
 assert.equal(judge.historyComplete,false);assert.equal(judge.moves.length,8);
});
test('color-rotated unilateral checker loses with correct winner sign',()=>{
 const b=new Board(FEN),copy=Int8Array.from(b.squares);for(let s=0;s<90;s++)b.squares[89-s]=-copy[s];
 b.turn=-1;b.kings[0]=b.squares.findIndex(p=>p===7);b.kings[1]=b.squares.findIndex(p=>p===-7);b.rehash();
 const moves=[...CHECK_CYCLE,...CHECK_CYCLE].map(m=>{const v=uciToMove(m);return moveToUci((89-moveFrom(v))*90+89-moveTo(v));});
 assert.equal(replay(b,moves).last.winner,1);
});
test('unequal repetition gaps use the whole span back to the second prior occurrence',()=>{
 const b=new Board('r3k4/9/9/9/4P4/9/9/9/9/R3K4 w - - 0 1');
 const short=['a0b0','a9b9','b0a0','b9a9'];
 const longer=['a0c0','a9c9','c0b0','c9b9','b0a0','b9a9'];
 const {last}=replay(b,[...short,...longer]);
 assert.equal(last.unresolved,true);assert.equal(last.cycleStart,0);assert.equal(last.cyclePlies,10);
});
test('quiet no-check repetitions are unresolved, not falsely counted draws',()=>{
 const cycle=['b0c2','b9c7','c2b0','c7b9'];const {last,judge}=replay(new Board(),[...cycle,...cycle]);
 assert.equal(last.terminal,false);assert.equal(last.unresolved,true);assert.equal(last.winner,null);assert.equal(last.reason,'unresolved-repetition');assert.equal(judge.historyComplete,true);
});
test('mixed check/noncheck cycle uses pinned computer-rule draw semantics',()=>{
 const cycle=['d7e7','e9f9','e7d7','f9e9'];const {last}=replay(new Board(FEN),[...cycle,...cycle]);
 assert.equal(last.winner,0);assert.equal(last.reason,'mixed-check-repetition');assert.equal(last.terminal,true);
});
test('mutual perpetual-check classifier (synthetic flags, not a legal-position oracle)',()=>{
 const entries=Array.from({length:8},(_,i)=>({moverSide:i%2?-1:1,gaveCheck:true}));
 assert.deepEqual(classifyCheckCycle(entries),{terminal:true,winner:0,reason:'mutual-perpetual-check',unresolved:false});
});
test('hash collision cannot create false repetition',()=>{
 const b=new Board(),judge=new Adjudicator(b),key=b.key();
 for(const m of ['b0c2','b9c7','a3a4','a6a5']){const side=b.turn;b.playUci(m);b.key=()=>key;const result=judge.push(b,side);assert.equal(result.terminal,false);assert.equal(result.unresolved,false);}
});
test('null moves and illegal history changes are rejected',()=>{
 const b=new Board(),judge=new Adjudicator(b);b.turn=-b.turn;assert.throws(()=>judge.push(b,1),/real move/);
 const c=new Board(),other=new Adjudicator(c);c.makeMove(uciToMove('a0a5'));assert.throws(()=>other.push(c,1),/Illegal history/);
});
test('normal checkmate move takes precedence over repetition logic',()=>{
 const b=new Board('3k5/9/9/9/9/9/9/4pr3/3r5/4K4 b - - 0 1');
 const judge=new Adjudicator(b);b.playUci('d1e1');const result=judge.push(b,-1);
 assert.deepEqual(result,{terminal:true,winner:-1,reason:'checkmate',unresolved:false});
 assert.throws(()=>judge.push(b,-1),/terminal/);
});
test('stalemate is a loss, not a western-chess draw',()=>{
 const b=new Board('3k5/9/9/9/9/9/9/3r5/5r3/4K4 b - - 0 1');
 const judge=new Adjudicator(b);b.playUci('d2d1');assert.deepEqual(judge.push(b,-1),{terminal:true,winner:-1,reason:'stalemate-loss',unresolved:false});
});
