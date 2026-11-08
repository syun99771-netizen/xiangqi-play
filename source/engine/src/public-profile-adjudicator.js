// SPDX-License-Identifier: GPL-3.0-or-later
// Chronological SDK adapter around the independently validated pinned external referee.
import {Board,START_FEN,moveToUci} from './board.js';
import {PublicJudge} from './public-rules/root-referee.mjs';
const canonical=b=>b.toFEN().split(' ').slice(0,2).join(' ');
export class PublicProfileAdjudicator {
 constructor(board,{historyComplete,ruleProfile}={}){
  this.initialFEN=board.toFEN();this.historyComplete=historyComplete??(this.initialFEN===START_FEN);
  if(this.historyComplete!==true)throw Error('Public profile requires complete supplied chronological history');
  if(!Number.isSafeInteger(board.halfmove)||board.halfmove<0||board.halfmove>119)throw Error('Public origin clock must be 0..119');
  this.ruleProfile=ruleProfile;this.previous=new Board(this.initialFEN);this.publicJudge=new PublicJudge(this.previous);this.moves=[];
  this.states=[this.state(this.previous,null,null,0)];this.result=this.convert(this.publicJudge.verdict(this.previous));
 }
 state(b,moverSide,move,captured){return {key:b.key(),canonical:canonical(b),turn:b.turn,moverSide,gaveCheck:b.inCheck(),move,captured};}
 convert(verdict){return {terminal:!!verdict,winner:verdict?.winner??null,reason:verdict?.reason??'ongoing',unresolved:false,ruleProfile:this.ruleProfile?.id??'pikafish-public-b562',ruleStatus:'pinned-public-reference'};}
 push(board,moverSide){
  if(this.result.terminal)throw Error('Moves continue after terminal public referee result');
  const old=this.previous;
  if(moverSide!==old.turn||board.turn!==-moverSide)throw Error('Invalid public history side transition');
  const changed=[];for(let i=0;i<90;i++)if(old.squares[i]!==board.squares[i])changed.push(i);
  if(changed.length!==2)throw Error('Expected one real legal move, not null/replacement');
  const from=changed.find(i=>old.squares[i]*moverSide>0&&board.squares[i]===0),to=changed.find(i=>i!==from);
  if(from===undefined||to===undefined||board.squares[to]!==old.squares[from])throw Error('Invalid public piece transition');
  const move=from*90+to,text=moveToUci(move);if(!old.isLegalMove(move))throw Error('Illegal public history move '+text);
  const captured=old.squares[to],undo=old.makeMove(move);
  if(old.toFEN()!==board.toFEN()){old.unmakeMove(undo);throw Error('Public history position/clock mismatch');}
  const verdict=this.publicJudge.push(board,moverSide,text);
  this.states.push(this.state(board,moverSide,text,captured));this.moves.push(text);this.result=this.convert(verdict);return this.result;
 }
}
