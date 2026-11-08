// SPDX-License-Identifier: GPL-3.0-or-later
// Literal set translation of Position::update_blockers<c>(), Pikafish/Stockfish
// contributors, b562d6aeac5401879e973dc53ddb56053f07bb6a src/position.cpp:382-408.
// between geometry: src/attacks.cpp:64-78. See source/{AUTHORS,Copying.txt}.
const row=s=>Math.floor(s/9),col=s=>s%9;
function betweenIncludingTarget(king,sniper){
 const dr=row(sniper)-row(king),dc=col(sniper)-col(king),out=[];
 if(dr===0||dc===0){const step=Math.sign(dr)*9+Math.sign(dc);for(let s=king+step;s!==sniper;s+=step)out.push(s);}
 else if((Math.abs(dr)===2&&Math.abs(dc)===1)||(Math.abs(dr)===1&&Math.abs(dc)===2)){
  // Actual horse originates at sniper and attacks king (KNIGHT_TO table).
  out.push(sniper-(Math.abs(dr)===2?Math.sign(dr)*9:Math.sign(dc)));
 }
 out.push(sniper);return out;
}
export const PIN_SOURCE_COMMIT='b562d6aeac5401879e973dc53ddb56053f07bb6a';
export function pinEvidence(board,side,poll=()=>{}){
 if(side!==1&&side!==-1)throw new TypeError('side +/-1 required');
 const king=board.kings[side===1?0:1];if(!Number.isInteger(king)||king<0||king>=90||board.squares[king]!==7*side)throw Error('Missing matching king');
 const snipers=[];
 for(let s=0;s<90;s++){poll();
  const piece=board.squares[s];if(Math.sign(piece)!==-side)continue;
  const t=Math.abs(piece),dr=Math.abs(row(s)-row(king)),dc=Math.abs(col(s)-col(king));
  if(([5,6,7].includes(t)&&(dr===0||dc===0))||(t===4&&((dr===2&&dc===1)||(dr===1&&dc===2))))snipers.push(s);
 }
 const occupancy=new Set(Array.from(board.squares,(p,s)=>p?s:-1).filter(s=>s>=0));
 for(const s of snipers)if(Math.abs(board.squares[s])!==5)occupancy.delete(s);
 const blockers=new Set(),pinners=new Set(),details=[];
 for(const sniper of snipers){poll();
  const cannon=Math.abs(board.squares[sniper])===5;
  const between=betweenIncludingTarget(king,sniper);
  const blocking=between.filter(s=>cannon?s!==sniper&&board.squares[s]!==0:occupancy.has(s));
  const qualifies=blocking.length===(cannon?2:1);
  if(qualifies){blocking.forEach(s=>blockers.add(s));if(blocking.some(s=>Math.sign(board.squares[s])===side))pinners.add(sniper);}
  details.push({sniper,cannon,between,blocking,qualifies});
 }
 return {sourceCommit:PIN_SOURCE_COMMIT,side,king,snipers,blockers:[...blockers].sort((a,b)=>a-b),pinners:[...pinners].sort((a,b)=>a-b),details};
}
