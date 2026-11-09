/** Browser-safe, synchronous API. Run in a worker to keep the UI responsive. */
import {Board,START_FEN,uciToMove,moveToUci} from '../board.js';
import {Search,MATE} from '../search.js';
import {Search as PublicSearch} from '../search-public-b562.js';
import {withPublicSearchCapabilities} from '../public-search-capabilities.js';
import {createProfileAdjudicator,getRuleProfile} from '../rule-profiles.js';
import {readModel} from './model-codec.js';
export {START_FEN};
export const SDK_LIMITS=Object.freeze({moves:2048,fenChars:256,nodes:10000000,movetime:60000,depth:32});
function record(value,label,allowed){
 if(!value||typeof value!=='object'||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw Error(`${label} must be a plain object`);
 for(const key of Reflect.ownKeys(value))if(typeof key!=='string'||!allowed.includes(key)||!Object.hasOwn(Object.getOwnPropertyDescriptor(value,key),'value'))throw Error(`Unsupported ${label} field ${String(key)}`);
 return value;
}
function integer(value,min,max,label){if(!Number.isSafeInteger(value)||value<min||value>max)throw Error(`Invalid ${label}: expected ${min}..${max}`);return value;}
function normalizeMoves(value){
 if(!Array.isArray(value)||Object.getPrototypeOf(value)!==Array.prototype)throw Error('Move history must be an ordinary dense array');
 const length=Object.getOwnPropertyDescriptor(value,'length').value;
 if(length>SDK_LIMITS.moves)throw Error('Invalid move history length');
 const keys=Reflect.ownKeys(value);
 if(keys.length!==length+1||keys.some(key=>typeof key!=='string'||(key!=='length'&&(!/^(0|[1-9]\d*)$/.test(key)||Number(key)>=length))))throw Error('Move history must contain only dense index data properties');
 const moves=[];
 for(let i=0;i<length;i++){
  const descriptor=Object.getOwnPropertyDescriptor(value,String(i));
  if(!descriptor||!Object.hasOwn(descriptor,'value'))throw Error('Move history accessors and holes are not allowed');
  const text=descriptor.value;
  if(typeof text!=='string'||!/^[a-i][0-9][a-i][0-9]$/.test(text))throw Error('Invalid move history');
  moves.push(text);
 }
 return moves;
}
const booleans=['tt','ttBounds','lmr','nullMove','checkAware','qsearchRepetition','fastStrictHistory','typedTT','directOrdering','rootPvs'];
export function assertRequestRecord(input){
 return record(input,'request',['requestId','fen','moves','historyComplete','limits','options']);
}
export function validateRequest(input){
 assertRequestRecord(input);
 if(typeof input.requestId!=='string'||!/^[\w.:/-]{1,128}$/.test(input.requestId))throw Error('requestId must be 1..128 ASCII identifier characters');
 const fen=input.fen??START_FEN;
 if(typeof fen!=='string'||fen.length>SDK_LIMITS.fenChars)throw Error('Invalid FEN size');
 const fields=fen.trim().split(/\s+/);
 if(![2,6].includes(fields.length)||(fields.length===6&&(fields[2]!=='-'||fields[3]!=='-')))throw Error('Expected two-field or six-field Xiangqi FEN');
 const board=new Board(fen);
 integer(board.halfmove,0,1000000,'FEN halfmove');integer(board.fullmove,1,1000000,'FEN fullmove');
 const moves=normalizeMoves(input.moves??[]);
 const optionRecord=record(input.options??{},'options',[...booleans,'checkExtensions','ruleProfile','repetitionPolicy','ttCapacity']);
 const options=Object.fromEntries(Object.getOwnPropertyNames(optionRecord).map(key=>[key,Object.getOwnPropertyDescriptor(optionRecord,key).value]));
 for(const key of booleans)if(key in options&&typeof options[key]!=='boolean')throw Error(`Invalid option ${key}`);
 // Position-only TT score bounds omit rule/history context and are not a safe public API.
 if(options.ttBounds===true)throw Error('SDK rejects ttBounds:true: position-only TT score cutoffs are unsafe for history-dependent search');
 if('checkExtensions' in options)integer(options.checkExtensions,0,2,'checkExtensions');
 if('ttCapacity' in options)integer(options.ttCapacity,256,1<<20,'ttCapacity');
 const rules=getRuleProfile(options.ruleProfile??'cca2020');options.ruleProfile=rules.id;
 if('repetitionPolicy' in options&&!['legacy','verified-check-terminal'].includes(options.repetitionPolicy))throw Error('Invalid repetitionPolicy');
 const raw=record(input.limits??{},'limits',['nodes','movetime','depth','mode']),limits={};
 for(const key of ['nodes','movetime','depth'])if(key in raw)limits[key]=integer(raw[key],1,SDK_LIMITS[key],key);
 if('mode' in raw){
  if(!['time','depth','infinite'].includes(raw.mode))throw Error('Invalid limits mode');
  if(raw.mode==='time'&&limits.movetime===undefined)throw Error('Time mode requires movetime');
  if(raw.mode==='depth'){
   if(limits.depth===undefined)throw Error('Depth mode requires depth');
   if('movetime' in raw||'nodes' in raw)throw Error('Depth mode does not accept movetime or nodes');
   limits.movetime=Infinity;
  }
  if(raw.mode==='infinite'){
   if(['depth','movetime','nodes'].some(k=>k in raw))throw Error('Infinite mode does not accept depth, movetime or nodes');
   limits.depth=Infinity;limits.movetime=Infinity;
  }
 }
 // Fixed node budgets are not silently cut short by the core's default one second.
 if(limits.nodes!==undefined&&limits.movetime===undefined)limits.movetime=Infinity;
 if(input.historyComplete!==undefined&&typeof input.historyComplete!=='boolean')throw Error('historyComplete must be boolean');
 const origin=board.toFEN(),historyComplete=input.historyComplete??(origin===START_FEN);
 if(rules.id==='pikafish-public-b562'){
  if(!historyComplete)throw Error('Public profile requires complete chronological history from a declared origin');
  if(board.halfmove>119)throw Error('Public profile origin clock must be in native FEN range 0..119');
  const strict={checkAware:true,qsearchRepetition:true,repetitionPolicy:'verified-check-terminal'};
  for(const [key,value] of Object.entries(strict)){if(key in options&&options[key]!==value)throw Error('Public profile requires '+key+':'+value);options[key]=value;}
  options.fastStrictHistory??=true;
 }
 return {requestId:input.requestId,board,origin,moves,options,limits,rules,historyComplete};
}
// Validate only the requested history move; the adjudicator still independently
// verifies the transition. Preserve all Board state even if attack checking throws.
function isPreparationMoveLegal(board,move){
 if(!board.generatePseudoMoves().includes(move))return false;
 const side=board.turn,undo=board.makeMove(move);
 try {return !board.inCheck(side);} finally {board.unmakeMove(undo);}
}
export function preparePosition(input){
 const prepared=validateRequest(input),{board,options,moves,historyComplete}=prepared;
 const judge=createProfileAdjudicator(board,{profile:options.ruleProfile,historyComplete});
 for(const text of moves){
  if(judge.result.terminal)throw Error('Moves continue after terminal referee result');
  const move=uciToMove(text);if(!isPreparationMoveLegal(board,move))throw Error(`Illegal history move ${text}`);
  const side=board.turn;board.makeMove(move);judge.push(board,side);
 }
 // Adjudicator's constructor does not test a zero-move terminal root.
 let adjudication={...judge.result};
 if(prepared.rules.id!=='pikafish-public-b562'&&!board.generateLegalMoves().length)adjudication={terminal:true,winner:-board.turn,reason:board.inCheck()?'checkmate':'stalemate-loss',unresolved:false};
 const historyScope=historyComplete?(prepared.origin===START_FEN?'complete-initial-game':'complete-from-declared-problem-origin'):'incomplete-history';
 return {...prepared,judge,context:{fen:board.toFEN(),historyScope,historyComplete,historyOriginFEN:prepared.origin,ruleProfile:prepared.rules.id,ruleStatus:prepared.rules.status,rules:prepared.rules,adjudication,limitations:['Not a complete CCA2020 referee.','FEN syntax and supplied legal transitions are checked; historical reachability is not certified.','A declared problem origin does not establish earlier game history.',...(prepared.rules.id==='pikafish-public-b562'?['Pinned external rule_judge(0), not native UCI root-search termination priority.','Root adjudication includes adjusted rule60/material; search descendants currently use repetition and no-legal rules, not full public rule60/material.','Origin FEN clock is interpreted as declared adjusted rule60; earlier check counters/history are not inferred.']:['Legacy search repetition scores are heuristic, not authoritative rule verdicts.'])]}};
}
export function runSearch(input,{model=null,onInfo=()=>{}}={}){
 const {requestId,board,origin,options,limits,historyComplete,judge,context:rootContext}=preparePosition(input);
 const context=options.ruleProfile==='pikafish-public-b562'?withPublicSearchCapabilities(rootContext):rootContext;
 if(context.adjudication.terminal){const {winner,reason}=context.adjudication;return {type:'result',requestId,status:'terminal',terminal:true,move:null,pv:[],score:winner===0?0:winner===board.turn?MATE:-MATE,depth:0,nodes:0,time:0,reason,context};}
 const SearchClass=options.ruleProfile==='pikafish-public-b562'?PublicSearch:Search;
 const search=new SearchClass({...options,...(model?{neuralModel:readModel(model)}:{})});
 const result=search.run(board,{...limits,gameHistory:judge.states,historyComplete,historyOriginFEN:origin,onInfo:info=>onInfo({type:'info',requestId,...info,pv:info.pv.map(moveToUci),context})});
 return {...result,type:'result',requestId,status:result.depth>0?'completed-iteration':'budget-exhausted',terminal:false,move:result.move===null?null:moveToUci(result.move),pv:result.pv.map(moveToUci),context};
}
