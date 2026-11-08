import {Board,START_FEN,uciToMove} from './board.js';
const canonical=b=>b.toFEN().split(' ').slice(0,2).join(' ');
/** Strict benchmark search history, replayed from explicit game/problem origin.
 * Completeness means no omitted states from this declared origin through root.
 * It never certifies CCA tournament procedures or unknown earlier problem history.
 */
export function validateSearchHistory(root,states,{historyComplete=false,historyOriginFEN=START_FEN}={}){
 if(historyComplete!==true||!Array.isArray(states)||!states.length)throw Error('Verified-check policy requires complete chronological history');
 const b=new Board(historyOriginFEN),normalized=[];
 for(let i=0;i<states.length;i++){
  const s=states[i];if(!s||typeof s.canonical!=='string')throw Error('Verified-check history requires canonical positions');
  let moverSide=null,captured=0;
  if(i===0){if(s.move!==null||s.moverSide!==null||s.captured!==0)throw Error('Invalid history origin state');}
  else{
   if(typeof s.move!=='string')throw Error('Missing chronological history move');
   const move=uciToMove(s.move);if(!b.generateLegalMoves().includes(move))throw Error('Illegal chronological history move');
   moverSide=b.turn;captured=b.squares[move%90];b.makeMove(move);
  }
  if(s.canonical!==canonical(b)||s.turn!==b.turn||s.moverSide!==moverSide||s.captured!==captured||s.gaveCheck!==b.inCheck()||s.key!==b.key())throw Error('History state/check/capture/hash mismatch');
  normalized.push({hashLo:b.hashLo,hashHi:b.hashHi,key:b.key(),canonical:s.canonical,turn:b.turn,moverSide,gaveCheck:s.gaveCheck,squares:Int8Array.from(b.squares)});
 }
 if(b.toFEN()!==root.toFEN())throw Error('History final root mismatch');
 return {states:normalized.slice(0,-1),origin:historyOriginFEN,scope:historyOriginFEN===START_FEN?'complete-initial-game':'complete-from-declared-problem-origin'};
}
export function sameSearchPosition(board,state){
 if(state.turn!==board.turn||!state.squares||state.squares.length!==90)return false;
 for(let i=0;i<90;i++)if(state.squares[i]!==board.squares[i])return false;return true;
}
