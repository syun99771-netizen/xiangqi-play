// SPDX-License-Identifier: GPL-3.0-or-later
// Exact root-style third-occurrence public rule, source b562d6aeac5401879e973dc53ddb56053f07bb6a.
import {createIdentityReplay} from './public-rules/legal-threat-evidence.mjs';
import {mainlineCycleEvidence} from './public-rules/pinned-mainline-cycle.mjs';
const canonical=b=>b.toFEN().split(' ').slice(0,2).join(' ');
export function classifyPublicRepetition({fen,moves,expectedBoard,poll=()=>{}}){
 if(!Array.isArray(moves))throw Error('Complete move array required');poll();
 const replay=createIdentityReplay({fen,poll}),states=[{key:canonical(replay.board),check:replay.board.inCheck(),rule60:replay.board.halfmove,checks:{1:0,'-1':0}}];
 for(const move of moves){poll();const previous=states.at(-1),r=replay.push(move),checks={...previous.checks};let rule60=previous.rule60;if(!r.gaveCheck||++checks[r.side]<=10){if(checks[-r.side]>10&&previous.check)checks[-r.side]++;else rule60++;}if(r.target){rule60=0;checks[1]=checks[-1]=0;}states.push({key:canonical(replay.board),check:r.gaveCheck,checks,rule60});}
 if(expectedBoard&&canonical(expectedBoard)!==canonical(replay.board))throw Error('Public repetition replay/root mismatch');
 const n=moves.length,current=states[n],end=Math.min(current.rule60+Math.max(0,current.checks[1]-10)+Math.max(0,current.checks[-1]-10),n);if(end<4)return null;
 let count=0,checkThem=current.check&&states[n-2].check,checkUs=states[n-1].check&&states[n-3].check;
 for(let i=4;i<=end;i+=2){poll();const old=states[n-i];checkThem=checkThem&&old.check;
  if(old.key===current.key&&++count===2){
   if(checkThem||checkUs)return {terminal:true,winner:!checkUs?replay.board.turn:!checkThem?-replay.board.turn:0,reason:'public-perpetual-check',cyclePlies:i};
   const evidence=mainlineCycleEvidence({fen,moves,cyclePlies:i,poll}),score=evidence.sourceScoreAtPly0;
   return {terminal:true,winner:score?Math.sign(score)*replay.board.turn:0,reason:score?'public-perpetual-chase':'public-repetition-draw',cyclePlies:i};
  }
  if(i+1<=end)checkUs=checkUs&&states[n-i-1].check;
 }
 return null;
}
