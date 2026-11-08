import {Board, START_FEN, moveToUci} from './engine/src/board.js';
import {preflight} from './api.mjs';
export class Game {
 constructor(){this.board=new Board();this.moves=[];}
 request(ms=100){return {requestId:'web-'+this.moves.length,fen:START_FEN,moves:[...this.moves],historyComplete:true,limits:{movetime:ms,depth:32}};}
 verdict(){return preflight(this.request()).adjudication;}
 play(move){if(this.verdict().terminal)throw Error('棋局已经结束');if(!this.board.isLegalMove(move))throw Error('非法走棋');const uci=typeof move==='string'?move:moveToUci(move);this.board.playUci(uci);this.moves.push(uci);}
}
