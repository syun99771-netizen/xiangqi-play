// SPDX-License-Identifier: GPL-3.0-or-later
// Root (ply=0) structural port of official Pikafish b562d6aeac5401879e973dc53ddb56053f07bb6a.
import {Board,START_FEN,uciToMove,moveTo} from '../board.js';
import {mainlineCycleEvidence} from './pinned-mainline-cycle.mjs';
const key=b=>b.toFEN().split(' ').slice(0,2).join(' ');
const completed=(reason,winner)=>({status:'COMPLETED',reason,winner});
export class PublicJudge {
 constructor(board=new Board()) {this.initialFEN=board.toFEN();this.board=new Board(this.initialFEN);this.moves=[];this.states=[{key:key(board),check:board.inCheck(),rule60:board.halfmove,checks:{1:0,'-1':0},plies:0}];}
 push(board,side,text){
  const move=uciToMove(text),capture=!!this.board.squares[moveTo(move)],prev=this.states.at(-1);this.board.makeMove(move);
  if(key(this.board)!==key(board)||this.board.turn!==-side)throw Error('Referee board mismatch');
  const check=board.inCheck(),checks={...prev.checks};let rule60=prev.rule60;
  if(!check||++checks[side]<=10){if(checks[-side]>10&&prev.check)checks[-side]++;else rule60++;}
  if(capture){rule60=0;checks[1]=checks[-1]=0;}
  this.moves.push(text);this.states.push({key:key(board),check,checks,rule60,plies:prev.plies+1});return this.verdict(board);
 }
 verdict(board=this.board){
  const n=this.moves.length,s=this.states[n],end=Math.min(s.rule60+Math.max(0,s.checks[1]-10)+Math.max(0,s.checks[-1]-10),s.plies);
  if(end>=4){let count=0,checkThem=s.check&&this.states[n-2].check,checkUs=this.states[n-1].check&&this.states[n-3].check;
   for(let i=4;i<=end;i+=2){const old=this.states[n-i];checkThem=checkThem&&old.check;
    if(old.key===s.key&&++count===2){
     if(checkThem||checkUs)return completed('public-perpetual-check',!checkUs?board.turn:!checkThem?-board.turn:0);
     const evidence=mainlineCycleEvidence({fen:this.initialFEN,moves:this.moves,cyclePlies:i});const score=evidence.sourceScoreAtPly0;
     return completed(score?'public-perpetual-chase':'public-repetition-draw',score?Math.sign(score)*board.turn:0);
    }
    if(i+1<=end)checkUs=checkUs&&this.states[n-i-1].check;
   }
  }
  const legal=()=>board.generateLegalMoves();
  if(s.rule60>=120)return completed('public-rule60',legal().length?0:-board.turn);
  const count=(type,side)=>board.squares.reduce((n,p)=>n+(Math.abs(p)===type&&(side===undefined||Math.sign(p)===side)),0);
  if(!count(1)){
   const majors=count(4)+count(5)+count(6);let level=0;
   if(!majors)level=1;
   else if(majors===1&&count(5)===1){const side=count(5,1)?1:-1;if(!count(2,side)){if(!count(2,-side))level=1;else if(count(2,-side)===1)level=!count(3,side)?1:2;else if(!count(3,side))level=2;}}
   else if(majors===2&&count(5,1)===1&&count(5,-1)===1&&!count(2))level=!count(3)?1:2;
   if(level){if(level===2){const moves=legal();if(!moves.length)return completed('public-material-mated',-board.turn);for(const m of moves){const u=board.makeMove(m);let mate;try{mate=!legal().length;}finally{board.unmakeMove(u);}if(mate)return null;}}return completed('public-insufficient-material',0);}
  }
  if(!legal().length)return completed(board.inCheck()?'checkmate':'stalemate-loss',-board.turn);
  return null;
 }
}
export const createPublicJudge=board=>new PublicJudge(board);
