// GPL-3.0-or-later. Board-only evidence, NOT a ChineseRule chase/outcome classifier.
// No Search, evaluator, native engine, filesystem, randomness or external dependencies.
import {Board,START_FEN,uciToMove,moveToUci,moveFrom,moveTo} from './vendor/board.js';
export {Board,START_FEN,uciToMove,moveToUci,moveFrom,moveTo};
export const EVIDENCE_CONTRACT=Object.freeze({version:1,policy:'none',kingCapture:false,
  projection:'Reconstruct a private FEN with requested side; not an actual game pass.',
  identity:'Positive unique IDs follow actual pieces; 0 denotes empty. Replay IDs are initial square index + 1.',
  limits:'Legal captures/recaptures and set differences are not exact chased(), pins, mate threats, or outcome labels.'});
const squareName=s=>String.fromCharCode(97+s%9)+(9-Math.floor(s/9));
const canonical=fen=>fen.split(' ').slice(0,2).join(' ');
function sideCheck(side){if(side!==1&&side!==-1)throw new TypeError('side must be 1 or -1');}
function validateIds(board,pieceIds){
  if(!pieceIds||pieceIds.length!==90)throw new TypeError('pieceIds must contain 90 entries');
  const seen=new Set();
  for(let s=0;s<90;s++){const id=pieceIds[s];if(!Number.isSafeInteger(id)||id<0||(board.squares[s]!==0)!==(id!==0))throw new TypeError(`Invalid piece ID at ${s}`);if(id){if(seen.has(id))throw new TypeError('Duplicate piece identity');seen.add(id);}}
}
function describe(board,ids,square){const piece=board.squares[square],side=Math.sign(piece);if(!piece)throw new Error('Cannot describe empty square');const rank=9-Math.floor(square/9);return {id:ids[square],piece,type:Math.abs(piece),side,square,uciSquare:squareName(square),crossedRiver:side===1?rank>=5:rank<=4};}
function legal(board){return board.generateLegalMovesFast();}
function identitySnapshot(board,pieceIds){validateIds(board,pieceIds);return {fen:board.toFEN(),pieceIds:Array.from(pieceIds),turn:board.turn,kings:Array.from(board.kings),hashLo:board.hashLo,hashHi:board.hashHi};}
export function createIdentityReplay({fen=START_FEN,moves=[],poll=()=>{}}={}){
  const board=new Board(fen),initialFEN=board.toFEN(),identityOrigin=canonical(initialFEN);
  const pieceIds=Int32Array.from(board.squares,(p,s)=>p?s+1:0),history=[];
  function snapshot(){return {...identitySnapshot(board,pieceIds),initialFEN,identityOrigin,plies:history.length,moves:history.map(x=>x.move)};}
  function push(uci){
    poll();
    validateIds(board,pieceIds);const move=typeof uci==='string'?uciToMove(uci):uci;
    if(!Number.isInteger(move)||!legal(board).includes(move))throw new Error(`Illegal history move: ${uci}`);
    const before=snapshot(),from=moveFrom(move),to=moveTo(move),attacker=describe(board,pieceIds,from),target=board.squares[to]?describe(board,pieceIds,to):null;
    const undo=board.makeMove(move);let gaveCheck;
    try{gaveCheck=board.inCheck();}catch(error){board.unmakeMove(undo);throw error;}
    pieceIds[to]=pieceIds[from];pieceIds[from]=0;
    const record={ply:history.length+1,move:moveToUci(move),side:attacker.side,attacker,target,gaveCheck,beforeFEN:before.fen,afterFEN:board.toFEN()};history.push(record);return record;
  }
  if(!Array.isArray(moves))throw new TypeError('moves must be an array');
  for(const move of moves)push(move);
  return {board,pieceIds,history,push,snapshot};
}
export function legalThreats(sourceBoard,pieceIds,side=sourceBoard.turn,poll=()=>{}){
  sideCheck(side);validateIds(sourceBoard,pieceIds);
  // Never alter sourceBoard.turn directly: reconstructed FEN recomputes BOTH hashes and kings.
  const sourceFEN=sourceBoard.toFEN(),fields=sourceFEN.split(' ');fields[1]=side===1?'w':'b';
  const board=new Board(fields.join(' ')),ids=Array.from(pieceIds);
  const projectedFEN=board.toFEN(),projection={fen:projectedFEN,turn:board.turn,kings:Array.from(board.kings),hashLo:board.hashLo,hashHi:board.hashHi};
  const captures=[];
  for(const move of legal(board)){
    poll();
    const from=moveFrom(move),to=moveTo(move);if(!board.squares[to])continue;
    const capture={move:moveToUci(move),from,to,attacker:describe(board,ids,from),target:describe(board,ids,to),legalRecaptures:[]};
    const fromId=ids[from],toId=ids[to],undo=board.makeMove(move);ids[to]=fromId;ids[from]=0;
    try{
      for(const reply of legal(board)){poll();if(moveTo(reply)===to){const rf=moveFrom(reply);capture.legalRecaptures.push({move:moveToUci(reply),from:rf,to,attacker:describe(board,ids,rf),target:describe(board,ids,to)});}}
    }finally{board.unmakeMove(undo);ids[from]=fromId;ids[to]=toId;}
    captures.push(capture);
  }
  return {side,sourceFEN,projectedFEN,projection,wasInCheck:new Board(projectedFEN).inCheck(),captures};
}
function state(value){if(!value||typeof value.fen!=='string')throw new TypeError('snapshot needs fen and pieceIds');const board=new Board(value.fen);validateIds(board,value.pieceIds);return {board,pieceIds:value.pieceIds,identityOrigin:value.identityOrigin};}
export function compareThreats(beforeSnapshot,afterSnapshot,side){
  sideCheck(side);const a=state(beforeSnapshot),b=state(afterSnapshot);
  if(a.identityOrigin&&b.identityOrigin&&a.identityOrigin!==b.identityOrigin)throw new Error('Identity origins differ');
  const prior=new Map(Array.from(a.pieceIds,(id,s)=>[id,a.board.squares[s]]));
  for(let s=0;s<90;s++)if(b.pieceIds[s]&&(!prior.has(b.pieceIds[s])||prior.get(b.pieceIds[s])!==b.board.squares[s]))throw new Error('Piece identity changed type/side or appeared after snapshot');
  const before=legalThreats(a.board,a.pieceIds,side),after=legalThreats(b.board,b.pieceIds,side);
  const key=c=>`${c.attacker.id}:${c.target.id}`,pre=new Set(before.captures.map(key)),post=new Set(after.captures.map(key));
  const beforeTargets=new Set(before.captures.map(c=>c.target.id)),afterTargets=new Set(after.captures.map(c=>c.target.id));
  const sorted=x=>Array.from(x).sort((a,b)=>a-b);
  return {side,before,after,byAttackerTarget:{added:after.captures.filter(c=>!pre.has(key(c))),removed:before.captures.filter(c=>!post.has(key(c))),persisting:after.captures.filter(c=>pre.has(key(c)))},byTarget:{added:sorted([...afterTargets].filter(id=>!beforeTargets.has(id))),removed:sorted([...beforeTargets].filter(id=>!afterTargets.has(id))),persisting:sorted([...afterTargets].filter(id=>beforeTargets.has(id)))} };
}
