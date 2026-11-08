import test from 'node:test';
import assert from 'node:assert/strict';
import { Board, START_FEN, moveFrom, moveTo, moveToUci, uciToMove } from '../engine/src/board.js';
const sq = text => (9-Number(text[1]))*9+text.charCodeAt(0)-97;
function setup(pieces={}, turn=1) {
  const b=new Board();b.squares.fill(0);b.squares[sq('e0')]=7;b.squares[sq('e9')]=-7;b.squares[sq('e5')]=1;
  for(const [s,p] of Object.entries(pieces)) b.squares[sq(s)]=p;
  b.kings[0]=b.squares.findIndex(p=>p===7);b.kings[1]=b.squares.findIndex(p=>p===-7);b.turn=turn;b.rehash();return b;
}
const has = (b,m) => b.generateLegalMoves().includes(uciToMove(m));
test('FEN and UCI round trips',()=>{
 const b=new Board();assert.equal(b.toFEN(),START_FEN);
 for(let from=0;from<90;from++)for(let to=0;to<90;to++)assert.equal(uciToMove(moveToUci(from*90+to)),from*90+to);
 assert.throws(()=>uciToMove('j0a1'));assert.throws(()=>new Board('9/9 w'));
 assert.throws(()=>new Board('9/9/9/9/9/9/9/9/9/9 w - - 0 1'));
});
test('initial move count and perft regression',()=>{
 const b=new Board();assert.equal(b.perft(0),1);assert.equal(b.perft(1),44);assert.equal(b.perft(2),1920);assert.equal(b.perft(3),79666);assert.equal(b.toFEN(),START_FEN);
});
test('horse leg obstruction',()=>{
 const b=setup({b0:4,b1:1});assert.equal(has(b,'b0c2'),false);assert.equal(has(b,'b0a2'),false);assert.equal(has(b,'b0d1'),true);
});
test('elephant eye and river boundaries',()=>{
 const b=setup({c0:3,d1:1});assert.equal(has(b,'c0e2'),false);assert.equal(has(b,'c0a2'),true);
 const c=setup({e4:3,e5:0,e6:1});assert.equal(has(c,'e4c6'),false);assert.equal(has(c,'e4g6'),false);assert.equal(has(c,'e4c2'),true);
});
test('cannon requires exactly one screen for capture',()=>{
 const b=setup({a0:5,a2:1,a5:-6,a7:-4});assert.equal(has(b,'a0a1'),true);assert.equal(has(b,'a0a2'),false);assert.equal(has(b,'a0a3'),false);assert.equal(has(b,'a0a5'),true);assert.equal(has(b,'a0a7'),false);
 b.squares[sq('a2')]=0;b.rehash();assert.equal(has(b,'a0a5'),false);assert.equal(has(b,'a0a7'),true);
});
test('pawns cannot retreat and gain sideways motion only after river',()=>{
 const b=setup({a3:1,c5:1});assert.equal(has(b,'a3a4'),true);assert.equal(has(b,'a3b3'),false);assert.equal(has(b,'a3a2'),false);assert.equal(has(b,'c5b5'),true);assert.equal(has(b,'c5d5'),true);assert.equal(has(b,'c5c4'),false);
 const c=setup({a6:-1,c4:-1},-1);assert.equal(has(c,'a6a5'),true);assert.equal(has(c,'a6b6'),false);assert.equal(has(c,'c4b4'),true);
});
test('advisors and kings remain inside palace',()=>{
 const b=setup({d0:2});assert.equal(has(b,'d0e1'),true);assert.equal(has(b,'d0c1'),false);assert.equal(has(b,'e0e1'),true);
 const c=setup({e0:0,d0:7});assert.equal(has(c,'d0c0'),false);
});
test('cannot expose facing kings or capture a king',()=>{
 const b=setup({e5:6});assert.equal(has(b,'e5d5'),false);assert.equal(has(b,'e5e6'),true);assert.equal(has(b,'e5e9'),false);
 const c=setup({e5:0});assert.equal(c.inCheck(1),true);assert.equal(c.inCheck(-1),true);
 assert.throws(()=>b.makeMove(uciToMove('e5e9')));
});
test('check detects horse leg and cannon screens',()=>{
 const b=setup({d2:-4});assert.equal(b.inCheck(),true);b.squares[sq('d1')]=1;assert.equal(b.inCheck(),false);
 const c=setup({e5:1,e7:-5});assert.equal(c.inCheck(),true);c.squares[sq('e3')]=1;assert.equal(c.inCheck(),false);
});
test('capture-only generation excludes quiet moves',()=>{
 const b=new Board();const captures=b.generateLegalMoves({capturesOnly:true});assert.equal(captures.length,2);
 for(const m of captures)assert.ok(b.squares[moveTo(m)]*b.turn<0);
});
test('make/unmake and incremental hashes survive seeded playouts',()=>{
 const b=new Board();const initialKey=b.key(),undos=[];let seed=371;
 for(let i=0;i<200;i++){
   const moves=b.generateLegalMoves();if(!moves.length)break;
   seed=(Math.imul(seed,1664525)+1013904223)>>>0;const move=moves[seed%moves.length];
   const u=b.makeMove(move);undos.push(u);const key=b.key();b.rehash();assert.equal(b.key(),key);
   assert.equal(b.inCheck(-b.turn),false);assert.equal(new Board(b.toFEN()).key(),b.key());
 }
 while(undos.length)b.unmakeMove(undos.pop());assert.equal(b.toFEN(),START_FEN);assert.equal(b.key(),initialKey);
});
test('turn changes hash and halfmove/fullmove counters restore',()=>{
 const b=new Board(),u=b.playUci('b0c2');assert.equal(b.halfmove,1);assert.equal(b.fullmove,1);assert.equal(b.turn,-1);
 const v=b.playUci('a6a5');assert.equal(b.halfmove,2);assert.equal(b.fullmove,2);
 b.unmakeMove(v);b.unmakeMove(u);assert.equal(b.toFEN(),START_FEN);
 const c=new Board(START_FEN.replace(' w ',' b '));assert.notEqual(c.key(),b.key());
});
test('quiet pawn advances increment raw capture-free plies; captures reset and undo restores',()=>{
 const b=new Board('4k4/9/9/9/p8/P3P4/9/9/9/4K4 w - - 37 21');
 const before=b.toFEN(),key=b.key();
 const quiet=b.playUci('e4e5');assert.equal(b.halfmove,38);
 assert.equal(new Board(b.toFEN()).halfmove,38);
 b.unmakeMove(quiet);assert.equal(b.toFEN(),before);assert.equal(b.key(),key);
 const capture=b.playUci('a4a5');assert.equal(b.halfmove,0);
 b.unmakeMove(capture);assert.equal(b.toFEN(),before);assert.equal(b.key(),key);
 const rook=new Board('4k4/9/9/9/p3P4/9/9/9/9/R3K4 w - - 37 21');
 const rookBefore=rook.toFEN(),rookKey=rook.key(),u=rook.playUci('a0a5');
 assert.equal(rook.halfmove,0);rook.unmakeMove(u);
 assert.equal(rook.toFEN(),rookBefore);assert.equal(rook.key(),rookKey);
});
test('malformed encoded moves are rejected without any state mutation',()=>{
 const b=new Board(),before=b.toFEN(),key=b.key(),squares=Array.from(b.squares),kings=Array.from(b.kings);
 for(const move of [-1,-90,8100,8101,99999,1.5,NaN,Infinity,-Infinity,'7290',null,undefined,{},2n]){
  assert.throws(()=>b.makeMove(move),/Invalid encoded move/);
  assert.equal(b.toFEN(),before);assert.equal(b.key(),key);
  assert.deepEqual(Array.from(b.squares),squares);assert.deepEqual(Array.from(b.kings),kings);
 }
});
test('king file attacks apply only to opposing king; ordinary king attacks stay in palace',()=>{
 const square=uci=>uciToMove(uci+uci)%90;
 const b=new Board('4k4/9/9/9/4R4/9/9/9/9/3K5 w - - 0 1');
 assert.equal(b.isAttacked(square('e5'),-1),false,'nonking on open king file');
 assert.equal(b.isAttacked(square('e6'),-1),false,'empty square on open king file');
 assert.equal(b.isAttacked(square('e8'),-1),true,'one step inside palace');
 assert.equal(b.isAttacked(square('d9'),-1),true,'horizontal palace step');
 const edge=new Board('9/9/4k4/9/9/9/9/9/9/3K5 w - - 0 1');
 assert.equal(edge.isAttacked(square('e6'),-1),false,'one step outside palace');
 const facing=new Board('4k4/9/9/9/9/9/9/9/9/4K4 w - - 0 1');
 assert.equal(facing.isAttacked(square('e0'),-1),true);
 assert.equal(facing.isAttacked(square('e9'),1),true);
 assert.equal(facing.inCheck(1),true);assert.equal(facing.inCheck(-1),true);
});
test('legal moves respect file-reflection symmetry in seeded positions',()=>{
 const b=new Board();let seed=79;
 for(let ply=0;ply<40;ply++){
   const mirrored=b.clone();for(let r=0;r<10;r++)for(let c=0;c<9;c++)mirrored.squares[r*9+c]=b.squares[r*9+8-c];
   mirrored.kings[0]=mirrored.squares.findIndex(p=>p===7);mirrored.kings[1]=mirrored.squares.findIndex(p=>p===-7);mirrored.rehash();
   const flip=s=>((s/9)|0)*9+8-s%9;
   const moves=b.generateLegalMoves();assert.deepEqual(mirrored.generateLegalMoves().sort((a,b)=>a-b),moves.map(m=>flip(moveFrom(m))*90+flip(moveTo(m))).sort((a,b)=>a-b));
   if(!moves.length)break;seed=(Math.imul(seed,1664525)+1013904223)>>>0;b.makeMove(moves[seed%moves.length]);
 }
});
test('stalemate is distinct from checkmate but both have no moves',()=>{
 const stalemate=new Board('3k5/9/9/9/9/9/9/9/3r1r3/4K4 w - - 0 1');
 assert.equal(stalemate.inCheck(),false);assert.equal(stalemate.generateLegalMoves().length,0);
 const mate=new Board('3k5/9/9/9/9/9/9/4pr3/4r4/4K4 w - - 0 1');
 assert.equal(mate.inCheck(),true);assert.equal(mate.generateLegalMoves().length,0);
});
test('horse pinned by flying generals cannot move',()=>{
 const b=new Board('4k4/9/9/9/4N4/9/9/9/9/4K4 w - - 0 1');
 assert.ok(b.generatePseudoMoves().some(m=>moveFrom(m)===sq('e5')));
 assert.ok(!b.generateLegalMoves().some(m=>moveFrom(m)===sq('e5')));
});
