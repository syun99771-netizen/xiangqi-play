import {Board, START_FEN, moveFrom, moveTo, uciToMove} from './engine/src/board.js';
const chinese=['','一','二','三','四','五','六','七','八','九'];
const names={1:'兵',2:'仕',3:'相',4:'马',5:'炮',6:'车',7:'帅','-1':'卒','-2':'士','-3':'象','-4':'马','-5':'炮','-6':'车','-7':'将'};
const row=s=>Math.floor(s/9),col=s=>s%9;
// Chinese four-character notation follows xqbase's Chinese notation convention.
// Reference: https://www.xqbase.com/protocol/cchess_move.htm
// Advisors/elephants use their file (advance/retreat disambiguates them).
// Pawn ordinal prefixes are Chinese for both sides, including multiple stacked files.
export function chineseMove(board,input){
 const move=typeof input==='string'?uciToMove(input):input;
 if(!board.isLegalMove(move))throw Error('Cannot notate illegal move');
 const from=moveFrom(move),to=moveTo(move),piece=board.squares[from],side=Math.sign(piece),type=Math.abs(piece);
 const number=n=>side===1?chinese[n]:String(n),file=s=>number(side===1?9-col(s):col(s)+1);
 const peers=Array.from(board.squares,(p,s)=>p===piece?s:-1).filter(s=>s>=0);
 const frontFirst=(a,b)=>side*(row(a)-row(b));
 const same=peers.filter(s=>col(s)===col(from)).sort(frontFirst);
 let name=names[piece]+file(from);
 if(same.length>1&&type!==2&&type!==3){
  let prefix;
  if(type===1){
   const files=Array.from({length:9},(_,c)=>peers.filter(s=>col(s)===c).sort(frontFirst)).filter(a=>a.length>1).sort((a,b)=>side*(col(b[0])-col(a[0])));
   if(files.length>1)prefix=chinese[files.flat().indexOf(from)+1];
  }
  if(!prefix){const i=same.indexOf(from);prefix=same.length===2?['前','后'][i]:same.length===3?['前','中','后'][i]:chinese[i+1];}
  name=prefix+names[piece];
 }
 const delta=row(to)-row(from),action=delta===0?'平':delta*side<0?'进':'退';
 const target=delta===0||[2,3,4].includes(type)?file(to):number(Math.abs(delta));
 return name+action+target;
}
export function chineseHistory(moves,origin=START_FEN){
 const board=new Board(origin),entries=[];
 for(const move of moves){const entry={number:board.fullmove,side:board.turn,text:chineseMove(board,move)};board.playUci(move);entries.push(entry);}
 return entries;
}
