/** Partial game referee, independently implemented from documented behavior.
 * Target: official Pikafish-2026-09-06 computer rules, not all tournament rules.
 * Primary semantics: https://github.com/official-pikafish/Pikafish/blob/Pikafish-2026-09-06/src/position.cpp
 * See docs/adjudication-plan.md. No GPL implementation code is copied here.
 * Supported: no-legal-move loss and threefold checking cycles.
 * Unsupported: no-check chase cycles, rule-60 check exemptions, material draws.
 */
import { Board, START_FEN, moveToUci } from './board.js';
const canonical = board => board.toFEN().split(' ').slice(0,2).join(' ');
const ongoing = () => ({terminal:false,winner:null,reason:'ongoing',unresolved:false});
/** Pure checking-cycle classifier. Entries must cover the entire repeated span.
 * A non-check cycle is intentionally unresolved until chase adjudication exists.
 */
export function classifyCheckCycle(entries) {
  const red=entries.filter(e=>e.moverSide===1),black=entries.filter(e=>e.moverSide===-1);
  if(!red.length||!black.length)throw new Error('A cycle must contain moves by both sides');
  const redChecks=red.every(e=>e.gaveCheck),blackChecks=black.every(e=>e.gaveCheck);
  if(redChecks&&blackChecks)return {terminal:true,winner:0,reason:'mutual-perpetual-check',unresolved:false};
  if(redChecks||blackChecks)return {terminal:true,winner:redChecks?-1:1,reason:'unilateral-perpetual-check',unresolved:false};
  if(entries.some(e=>e.gaveCheck))return {terminal:true,winner:0,reason:'mixed-check-repetition',unresolved:false};
  return {terminal:false,winner:null,reason:'unresolved-repetition',unresolved:true};
}
export class Adjudicator {
  constructor(board, { historyComplete }={}) {
    this.initialFEN=board.toFEN();
    this.historyComplete=historyComplete??(this.initialFEN===START_FEN);
    this.previous=new Board(this.initialFEN);
    this.states=[{key:board.key(),canonical:canonical(board),turn:board.turn,moverSide:null,gaveCheck:board.inCheck(),move:null,captured:0}];
    this.occurrences=new Map([[board.key(),[0]]]);
    this.pieceIds=Int16Array.from(board.squares,(p,i)=>p?i+1:0);
    this.moves=[];this.result=ongoing();
  }
  /** The caller supplies actual legal moves only. Search/null states are rejected. */
  push(boardAfterMove,moverSide) {
    if(this.result.terminal)throw new Error('Cannot append moves after a terminal adjudication');
    const old=this.previous,b=boardAfterMove;
    if(moverSide!==old.turn||b.turn!==-moverSide)throw new Error('Invalid mover or side-to-move transition');
    const changed=[];for(let i=0;i<90;i++)if(old.squares[i]!==b.squares[i])changed.push(i);
    if(changed.length!==2)throw new Error('Expected one real move, not a null move or replacement position');
    const from=changed.find(s=>old.squares[s]*moverSide>0&&b.squares[s]===0);
    const to=changed.find(s=>s!==from);
    if(from===undefined||b.squares[to]!==old.squares[from])throw new Error('Invalid piece transition');
    const move=from*90+to;
    if(!old.isLegalMove(move))throw new Error(`Illegal history move ${moveToUci(move)}`);
    const captured=old.squares[to];old.makeMove(move);
    if(canonical(old)!==canonical(b))throw new Error('History position mismatch');
    this.pieceIds[to]=this.pieceIds[from];this.pieceIds[from]=0;
    const state={key:b.key(),canonical:canonical(b),turn:b.turn,moverSide,gaveCheck:b.inCheck(),move:moveToUci(move),captured};
    this.states.push(state);this.moves.push(state.move);
    const index=this.states.length-1,occurrences=this.occurrences.get(state.key)??[];
    // Hash hits are only an index: verify exact piece placement AND side-to-move.
    const same=occurrences.filter(i=>this.states[i].canonical===state.canonical);
    occurrences.push(index);this.occurrences.set(state.key,occurrences);
    if(!b.generateLegalMoves().length){
      this.result={terminal:true,winner:moverSide,reason:b.inCheck()?'checkmate':'stalemate-loss',unresolved:false};return this.result;
    }
    if(same.length<2)return this.result=ongoing();
    const cycleStart=same.at(-2),span=this.states.slice(cycleStart+1);
    // Captures cannot restore the same exact placement; this also guards malformed history.
    if(span.some(s=>s.captured))throw new Error('Repeated position unexpectedly spans a capture');
    this.result={...classifyCheckCycle(span),cycleStart,cycleEnd:index,cyclePlies:index-cycleStart};
    return this.result;
  }
}
