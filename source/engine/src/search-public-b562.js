import {classifyPublicRepetition} from './public-repetition.mjs';
import {moveToUci,START_FEN} from './board.js';
import {MoveBuffer} from './move-buffer.js';
import {validateSearchHistory,sameSearchPosition} from './search-history-public-b562.js';
import { evaluate } from './evaluate.js';
import {NeuralEvaluator} from './nnue.js';
import {TranspositionTable} from './transposition.js';
import {classifyCheckCycle} from './adjudication.js';
export const MATE = 30000;
// Ordinary evaluations must never enter the terminal-score band, including
// supported synthetic positions and caller-provided evaluators/weights.
export const MAX_STATIC_SCORE = 20000;
export function boundedStaticScore(value){if(!Number.isFinite(value))throw new Error('Evaluator must return a finite score');return Math.max(-MAX_STATIC_SCORE,Math.min(MAX_STATIC_SCORE,value));}
const INF = 32000;
const VALUES = [0,100,200,200,450,450,900,10000];
export class Search {
  constructor(options={}) { if(options.ruleProfile!=='pikafish-public-b562'||options.repetitionPolicy!=='verified-check-terminal')throw Error('Public Search requires explicit b562 verified profile'); this.timeBasis=options.timeBasis??'wall-ms'; this.now=options.clock??(()=>performance.now()); if(typeof this.now!=='function')throw Error('clock must be a function'); this.options={tt:true,ttBounds:false,lmr:false,qsearchRepetition:false,fastStrictHistory:false,moveOrderWorkspace:null,typedMoveBuffers:false,repetitionPolicy:'legacy',checkExtensions:0,ruleProfile:'cca2020', ...options}; if(!Number.isInteger(this.options.checkExtensions)||this.options.checkExtensions<0||this.options.checkExtensions>2)throw new Error('checkExtensions must be0,1,or2'); if(this.options.qsearchRepetition&&!this.options.checkAware)throw new Error('qsearchRepetition requires checkAware'); if(!['legacy','verified-check-terminal'].includes(this.options.repetitionPolicy))throw new Error('Unknown repetition policy'); if(this.options.repetitionPolicy==='verified-check-terminal'&&(!this.options.checkAware||!this.options.qsearchRepetition||this.options.ruleProfile!=='pikafish-public-b562'||this.options.ttBounds))throw new Error('Verified-check policy requires checkAware, qsearchRepetition, pikafish-public-b562 and disabled TT bounds'); this.strictPathSlots=this.options.repetitionPolicy==='verified-check-terminal'?Array.from({length:101},()=>new Int8Array(90)):null; this.strictStateSlots=this.options.fastStrictHistory&&this.strictPathSlots?this.strictPathSlots.map(squares=>({squares,turn:0,moverSide:0,gaveCheck:false,hashLo:0,hashHi:0})):null; if(![null,'stable-insertion-v1'].includes(this.options.moveOrderWorkspace))throw Error('Unsupported move-order workspace version'); if(this.options.typedMoveBuffers&&this.options.moveOrderWorkspace!=='stable-insertion-v1')throw Error('Typed moves require stable-insertion-v1 ordering'); this.moveBufferSlots=[]; this.orderScoreSlots=[]; this.neural=options.neuralModel?new NeuralEvaluator(options.neuralModel):null; this.rawEvaluate=this.neural?((b,w)=>this.neural.evaluate(b,w)):(options.evaluator??evaluate); this.evaluate=(b,w)=>boundedStaticScore(this.rawEvaluate(b,w)); this.tt=options.typedTT?new TranspositionTable({capacity:options.ttCapacity??(1<<18)}):new Map(); this.ttEntry={}; this.killers=[]; this.history=new Int32Array(8100);this.directMaterialCounts=new Int16Array(16);this.publicClockFrames=Array.from({length:103},()=>({rule60:0,red:0,black:0,check:false,resolved:false,captured:false,mover:0})); }
  run(board,{depth=8,movetime=1000,nodes=Infinity,onInfo=()=>{},stopFlag,weights,gameHistory=[],historyComplete=false,historyOriginFEN}={}) {
    const runStart=this.now(); // Entire setup/history validation belongs to the think budget.
    const strictHistory=this.options.repetitionPolicy==='verified-check-terminal'?validateSearchHistory(board,gameHistory,{historyComplete,historyOriginFEN}):null;
    const historyValidationMs=strictHistory?this.now()-runStart:0;
    const weightKey=JSON.stringify(weights??null);if(this.weightKey!==weightKey){this.tt.clear();this.weightKey=weightKey;}
    this.publicClockIndex=0;this.publicClockReturns=0;this.publicMateMaterialReturns=0;this.publicMaterialProbeCalls=0;this.publicMaterialProbeMoves=0;this.publicClockEnabled=!!strictHistory;Object.assign(this.publicClockFrames[0],strictHistory?.publicClock??{rule60:0,red:0,black:0,check:false},{resolved:true});
    this.directMaterialCounts.fill(0);for(const p of board.squares)if(p)this.directMaterialCounts[(p>0?0:8)+Math.abs(p)]++;this.directMaterialReturns=0;this.publicRootMoves=strictHistory?gameHistory.slice(1).map(x=>x.move):null;this.publicOrigin=historyOriginFEN??START_FEN;this.publicPathMoves=[];this.publicRuleMemo=new Map();this.publicRuleComputes=0;this.publicRuleHits=0;this.publicRuleMemoClears=0;this.publicRuleCalls=0;this.publicRuleTerminalReturns=0;this.publicRuleClockMs=0;this.board=board;this.neural?.reset(board);if(this.options.typedTT)this.tt.newGeneration();this.start=runStart;this.deadline=this.start+movetime;this.maxNodes=nodes;this.nodes=0;this.selDepth=0;this.extensions=0;this.stopped=false;this.stopReason=null;this.completionReason=null;this.totalCycleGuardReturns=0;this.strictTerminalReturns=0;this.approxCycleGuards=0;this.completedIterationCycleGuardReturns=0;this.abortedIterationCycleGuardReturns=0;this.completedIterations=[];this.stopFlag=stopFlag;this.weights=weights??undefined;this.path=[];this.pathLow=[];this.pathHigh=[];this.pathStates=[];this.nullDepth=0;this.gameHistory=strictHistory?strictHistory.states:(this.options.checkAware?gameHistory.slice(0,-1):[]);this.historyScope=strictHistory?.scope??null;this.killers=[];this.history.fill(0);
    const legal=this.legalMoves(0);let bestMove=legal[0]??null,score=legal.length?0:-MATE,pv=bestMove===null?[]:[bestMove],completedDepth=0;
    const setupEnd=this.now(),setupMs=setupEnd-runStart;
    if(setupEnd>=this.deadline){this.stopped=true;this.stopReason='time';}
    for(let d=1;d<=depth&&!this.stopped;d++) {
      // Guard counts describe visited return sites, not provenance of the root score.
      const iterationCycleStart=this.totalCycleGuardReturns;
      try {
        const result=this.root(d,bestMove);bestMove=result.move;score=result.score;pv=this.principalVariation(bestMove,d);completedDepth=d;
        this.completedIterationCycleGuardReturns=this.totalCycleGuardReturns-iterationCycleStart;
        this.completedIterations.push({depth:d,cycleGuardReturns:this.completedIterationCycleGuardReturns});
        onInfo({depth:d,seldepth:this.selDepth,extensions:this.extensions,completedIterationCycleGuardReturns:this.completedIterationCycleGuardReturns,totalCycleGuardReturns:this.totalCycleGuardReturns,score,nodes:this.nodes,time:Math.round(this.now()-this.start),pv});
        if(Math.abs(score)>MATE-100){this.completionReason='mate';break;}
        if(this.now()>=this.deadline){this.completionReason='time-after-iteration';break;}
      } catch(e) {if(e!==STOP)throw e;this.abortedIterationCycleGuardReturns=this.totalCycleGuardReturns-iterationCycleStart;break;}
    }
    if(!this.stopped&&!this.completionReason)this.completionReason='depth';
    return {publicMateMaterialReturns:this.publicMateMaterialReturns,publicMaterialProbeCalls:this.publicMaterialProbeCalls,publicMaterialProbeMoves:this.publicMaterialProbeMoves,publicClockReturns:this.publicClockReturns,directMaterialReturns:this.directMaterialReturns,timeBasis:this.timeBasis,move:bestMove,score,pv,depth:completedDepth,seldepth:this.selDepth,extensions:this.extensions,nodes:this.nodes,time:Math.round(this.now()-this.start),stopped:this.stopped,stopReason:this.stopReason,completionReason:this.completionReason,completedIterationCycleGuardReturns:this.completedIterationCycleGuardReturns,totalCycleGuardReturns:this.totalCycleGuardReturns,abortedIterationCycleGuardReturns:this.abortedIterationCycleGuardReturns,completedIterations:this.completedIterations,strictTerminalReturns:this.strictTerminalReturns,approxCycleGuards:this.approxCycleGuards,repetitionPolicy:this.options.repetitionPolicy,historyScope:this.historyScope,setupMs,historyValidationMs,publicRuleComputes:this.publicRuleComputes,publicRuleHits:this.publicRuleHits,publicRuleMemoClears:this.publicRuleMemoClears,publicRuleCalls:this.publicRuleCalls,publicRuleTerminalReturns:this.publicRuleTerminalReturns,publicRuleClockMs:this.publicRuleClockMs};
  }
  legalMoves(ply,options={}){if(!this.options.typedMoveBuffers)return this.board.generateLegalMoves(options);if(!Number.isInteger(ply)||ply<0||ply>100)throw Error('Move buffer ply out of range');const buffer=this.moveBufferSlots[ply]??(this.moveBufferSlots[ply]=new MoveBuffer());return this.board.generateLegalMovesInto(buffer,options);}
  ttGet(key){return this.options.typedTT?this.tt.get(this.board.hash,this.board.hashHi,this.ttEntry):this.tt.get(key);}
  ttSet(key,entry){if(this.options.typedTT)this.tt.set(this.board.hash,this.board.hashHi,entry);else this.tt.set(key,entry);}
  pushPath(){this.pathLow.push(this.board.hash);this.pathHigh.push(this.board.hashHi);}
  popPath(){this.pathLow.pop();this.pathHigh.pop();}
  pathRepeats(){const b=this.board;for(let i=0;i<this.pathLow.length;i++)if(this.pathLow[i]===b.hash&&this.pathHigh[i]===b.hashHi)return true;return false;}
  makeSearchMove(move){this.neural?.push(this.board,move);try{const undo=this.board.makeMove(move);if(undo.captured)this.directMaterialCounts[(undo.captured>0?0:8)+Math.abs(undo.captured)]--;this.publicPathMoves.push(move);const f=this.publicClockFrames[++this.publicClockIndex];f.resolved=false;f.captured=!!undo.captured;f.mover=-this.board.turn;return undo;}catch(error){this.neural?.pop();throw error;}}
  unmakeSearchMove(undo){try{this.board.unmakeMove(undo);}finally{if(undo.captured)this.directMaterialCounts[(undo.captured>0?0:8)+Math.abs(undo.captured)]++;this.publicPathMoves.pop();this.publicClockIndex--;this.neural?.pop();}}
  publicRepetitionDecision(){
    // Root history is validated and fixed during this run. Exact delimiter-separated
    // integer move sequence is injective; no board hash or TT identity is used.
    this.pollPublicRule();
    const key=this.publicPathMoves.join(',');
    if(this.publicRuleMemo.has(key)){this.publicRuleHits++;return this.publicRuleMemo.get(key);}
    this.publicRuleComputes++;
    const decision=classifyPublicRepetition({fen:this.publicOrigin,moves:[...this.publicRootMoves,...this.publicPathMoves.map(moveToUci)],expectedBoard:this.board,poll:()=>this.pollPublicRule()});
    this.pollPublicRule(); // No caching after a deadline or cancellation crossed at completion.
    if(this.publicRuleMemo.size>=4096){this.publicRuleMemo.clear();this.publicRuleMemoClears++;}
    this.publicRuleMemo.set(key,decision===null?null:Object.freeze({...decision}));
    return decision;
  }
  pollPublicRule(){if(this.stopFlag&&Atomics.load(this.stopFlag,0)){this.stopped=true;this.stopReason='external';throw STOP;}if(this.now()>=this.deadline){this.stopped=true;this.stopReason='time';throw STOP;}}
  tick(){this.nodes++;let reason=null;if(this.nodes>=this.maxNodes)reason='nodes';else if((this.nodes&31)===0){if(this.now()>=this.deadline)reason='time';else if(this.stopFlag&&Atomics.load(this.stopFlag,0))reason='external';}if(reason){this.stopped=true;this.stopReason=reason;throw STOP;}}
  root(depth,preferred){const b=this.board;let extensionsLeft=this.options.checkExtensions;if(extensionsLeft>0&&b.inCheck()){depth++;extensionsLeft--;this.extensions++;}let best=-INF,move=null,alpha=-INF;const moves=this.order(this.legalMoves(0),preferred,0);this.pushPath();if(this.options.checkAware)this.pushCheckState(b.inCheck());
    try {let index=0;for(const m of moves){const u=this.makeSearchMove(m);let s;try{if(this.options.rootPvs&&index>0){s=-this.negamax(depth-1,-alpha-1,-alpha,1,true,extensionsLeft);if(s>alpha)s=-this.negamax(depth-1,-INF,-alpha,1,true,extensionsLeft);}else s=-this.negamax(depth-1,-INF,-alpha,1,true,extensionsLeft);index++;}finally{this.unmakeSearchMove(u);}if(s>best){best=s;move=m;}alpha=Math.max(alpha,s);}}
    finally{this.popPath();this.pathStates.pop();}return {move,score:move===null?-MATE:best};}
  negamax(depth,alpha,beta,ply,allowNull=true,extensionsLeft=0){this.selDepth=Math.max(this.selDepth??0,ply);this.tick();const b=this.board;
    // Search-cycle guard only, not official game adjudication. Match runner records this limitation.
    if(this.options.checkAware&&!this.nullDepth){const repeated=this.repetitionValue(ply);if(repeated!==null){this.totalCycleGuardReturns=(this.totalCycleGuardReturns??0)+1;return repeated;}}
    else if(!this.nullDepth&&this.pathRepeats()){this.totalCycleGuardReturns=(this.totalCycleGuardReturns??0)+1;return 0;}
    let check=null;
    if(depth>0||ply>=100){check=b.inCheck();this.resolvePublicClock(check);const terminal=this.publicNonRepetitionTerminal(ply);if(terminal!==null)return terminal;}
    if(ply>=100){if(!this.legalMoves(ply).length)return -MATE+ply;this.stopped=true;this.stopReason='hard-ply';throw STOP;}
    if(depth>=0&&extensionsLeft>0&&!this.nullDepth){if(check===null)check=b.inCheck();this.resolvePublicClock(check);if(check){depth++;extensionsLeft--;this.extensions=(this.extensions??0)+1;if(depth===1){const terminal=this.publicNonRepetitionTerminal(ply);if(terminal!==null)return terminal;}}}
    const key=this.options.typedTT?null:b.key(),originalAlpha=alpha,tt=this.options.tt?this.ttGet(key):null;
    // Until full repetition-history context is part of the key, TT scores are
    // ordering hints only. Bounds from another ancestor/history can be unsound.
    if(this.options.ttBounds&&tt&&tt.depth>=depth){const value=fromTT(tt.score,ply);if(tt.flag===0)return value;if(tt.flag===1&&value>=beta)return value;if(tt.flag===2&&value<=alpha)return value;}
    if(depth<=0)return this.qsearch(alpha,beta,ply,0);
    if(check===null)check=b.inCheck();
    const moves=this.order(this.legalMoves(ply),tt?.move,ply);if(!moves.length)return -MATE+ply;
    if(this.options.nullMove&&allowNull&&depth>=3&&!check&&Math.abs(beta)<MATE-100&&this.evaluate(b,this.weights)>=beta){
      let heavy=0;for(const p of b.squares)if(p*b.turn>0&&[4,5,6].includes(Math.abs(p)))heavy+=VALUES[Math.abs(p)];
      if(heavy>=900){const originalTurn=b.turn;b.turn=-b.turn;b.rehash();this.nullDepth++;let score;
        try{score=-this.negamax(depth-3,-beta,-beta+1,ply+1,false,extensionsLeft);}finally{this.nullDepth--;b.turn=originalTurn;b.rehash();}
        if(score>=beta&&Math.abs(score)<MATE-100)return score;
      }
    }
    let best=-INF,bestMove=moves[0],index=0;this.pushPath();if(this.options.checkAware)this.pushCheckState(check);
    try{for(const m of moves){const capture=b.squares[m%90]!==0;const u=this.makeSearchMove(m);let score;
      try{const reduction=this.options.lmr&&depth>=3&&index>=4&&!capture&&!check&&!b.inCheck()?1:0;
        if(index===0)score=-this.negamax(depth-1,-beta,-alpha,ply+1,true,extensionsLeft);
        else {score=-this.negamax(depth-1-reduction,-alpha-1,-alpha,ply+1,true,extensionsLeft);if(score>alpha&&(reduction||score<beta))score=-this.negamax(depth-1,-beta,-alpha,ply+1,true,extensionsLeft);}}
      finally{this.unmakeSearchMove(u);}index++;
      if(score>best){best=score;bestMove=m;}if(score>alpha)alpha=score;
      if(alpha>=beta){if(!capture){this.killers[ply]=m;this.history[m]=Math.min(100000,this.history[m]+depth*depth);}break;}
    }}finally{this.popPath();this.pathStates.pop();}
    if(this.options.tt){if(!this.options.typedTT&&this.tt.size>250000)this.tt.clear();this.ttSet(key,{depth,score:toTT(best,ply),flag:best<=originalAlpha?2:best>=beta?1:0,move:bestMove});}return best;
  }
  pushCheckState(check){
    const b=this.board;
    if(this.strictStateSlots){
      const state=this.strictStateSlots[this.pathStates.length];if(!state)throw Error('Strict path slot overflow');
      state.turn=b.turn;state.moverSide=-b.turn;state.gaveCheck=check;state.hashLo=b.hashLo;state.hashHi=b.hashHi;state.squares.set(b.squares);
      this.pathStates.push(state);return;
    }
    const state={key:b.key(),turn:b.turn,gaveCheck:check,moverSide:-b.turn};
    if(this.strictPathSlots){const slot=this.strictPathSlots[this.pathStates.length];if(!slot)throw Error('Strict path slot overflow');slot.set(b.squares);state.squares=slot;}
    this.pathStates.push(state);
  }
  repetitionValue(ply){
    const b=this.board,fast=!!this.strictStateSlots,key=fast?null:b.key(),history=this.gameHistory,path=this.pathStates,historyLength=history.length;
    const strict=this.options.repetitionPolicy==='verified-check-terminal';
    let last=-1,previous=-1;
    // No merged history or matches array on the overwhelmingly common no-hit path.
    if(fast){
      // Reverse chronology, stopping only after the last TWO exact matches.
      // Numeric hashes are filters, never a substitute for the 90-square check.
      for(let i=path.length-1;i>=0;i--){const state=path[i];if(state.hashLo===b.hashLo&&state.hashHi===b.hashHi&&sameSearchPosition(b,state)){if(last<0)last=historyLength+i;else{previous=historyLength+i;break;}}}
      if(previous<0)for(let i=historyLength-1;i>=0;i--){const state=history[i];if(state.hashLo===b.hashLo&&state.hashHi===b.hashHi&&sameSearchPosition(b,state)){if(last<0)last=i;else{previous=i;break;}}}
    }else{
    for(let i=0;i<historyLength;i++)if(history[i].key===key&&(!strict||sameSearchPosition(b,history[i]))){previous=last;last=i;}
    for(let i=0;i<path.length;i++)if(path[i].key===key&&(!strict||sameSearchPosition(b,path[i]))){previous=last;last=historyLength+i;}
    }
    if(last<0||(strict&&previous<0))return null;
    if(strict){
      const started=this.now();this.publicRuleCalls++;
      try{
        const decision=this.publicRepetitionDecision();
        if(decision?.terminal){this.publicRuleTerminalReturns++;this.strictTerminalReturns++;return decision.winner===0?0:decision.winner===b.turn?MATE-ply:-MATE+ply;}
      }finally{this.publicRuleClockMs+=this.now()-started;}
    }
    const start=previous>=0?previous:last,span=[];
    for(let i=start+1;i<historyLength;i++)span.push(history[i]);
    for(let i=Math.max(0,start+1-historyLength);i<path.length;i++)span.push(path[i]);
    span.push({key,turn:b.turn,moverSide:-b.turn,gaveCheck:b.inCheck()});
    const decision=classifyCheckCycle(span);
    if(strict){if(decision.reason==='unilateral-perpetual-check'&&decision.winner){this.strictTerminalReturns++;return decision.winner===b.turn?MATE-ply:-MATE+ply;}this.approxCycleGuards++;return 0;}
    if(decision.terminal&&decision.winner){
      // A second occurrence is only an anticipation heuristic, not a mate.
      const value=previous>=0&&this.options.ruleProfile==='pikafish-public-b562'?MATE-ply:1000;
      return decision.winner===b.turn?value:-value;
    }
    return 0;
  }
  // Resolve each real child exactly once using its already-computed node check.
  // Null subtrees never consult/update public clock state; their frames are discarded on undo.
  resolvePublicClock(check){
    if(!this.publicClockEnabled||this.nullDepth)return;
    const f=this.publicClockFrames[this.publicClockIndex];if(f.resolved)return;
    const p=this.publicClockFrames[this.publicClockIndex-1];
    if(!p?.resolved)throw Error('Unresolved public clock parent');
    f.rule60=p.rule60;f.red=p.red;f.black=p.black;f.check=check;
    const us=f.mover===1?'red':'black',them=f.mover===1?'black':'red';
    if(!check||++f[us]<=10){if(f[them]>10&&p.check)f[them]++;else f.rule60++;}
    if(f.captured){f.rule60=0;f.red=f.black=0;}
    f.resolved=true;
  }
  isPublicClockDraw(){return this.publicClockEnabled&&!this.nullDepth&&this.publicClockFrames[this.publicClockIndex].resolved&&this.publicClockFrames[this.publicClockIndex].rule60>=120;}
  publicMaterialLevel(){
    if(this.nullDepth||!Array.isArray(this.publicRootMoves))return 0;
    const c=this.directMaterialCounts;if(c[1]+c[9])return 0;
    const majors=c[4]+c[5]+c[6]+c[12]+c[13]+c[14];
    if(!majors)return 1;
    if(majors===1&&c[5]+c[13]===1){const us=c[5]?0:8,them=8-us;if(!c[us+2]){if(!c[them+2])return 1;if(c[them+2]===1)return c[us+3]?2:1;if(c[them+2]===2&&!c[us+3])return 2;}}
    if(majors===2&&c[5]===1&&c[13]===1&&!c[2]&&!c[10])return c[3]+c[11]?2:1;
    return 0;
  }
  isDirectMaterialDraw(){return this.publicMaterialLevel()===1;}
  publicNonRepetitionTerminal(ply){
    if(this.nullDepth||!Array.isArray(this.publicRootMoves))return null;
    if(this.isPublicClockDraw()){this.pollPublicRule();const hasLegal=this.board.generateLegalMoves().length>0;this.pollPublicRule();this.publicClockReturns++;return hasLegal?0:-MATE+ply;}
    const level=this.publicMaterialLevel();if(!level)return null;
    this.pollPublicRule();
    if(level===1){this.directMaterialReturns++;return 0;}
    this.publicMaterialProbeCalls++;
    // Private ordinary arrays: child legality cannot overwrite a search move buffer.
    const moves=this.board.generateLegalMoves();this.pollPublicRule();
    if(!moves.length){this.publicMateMaterialReturns++;return -MATE+ply;}
    for(const move of moves){
      this.pollPublicRule();const undo=this.board.makeMove(move);let noReply;
      try{noReply=this.board.generateLegalMoves().length===0;}finally{this.board.unmakeMove(undo);}
      this.pollPublicRule();this.publicMaterialProbeMoves++;
      // This is the native material exception, NOT a recursive terminal or mate score.
      if(noReply)return null;
    }
    this.publicMateMaterialReturns++;return 0;
  }
  qsearch(alpha,beta,ply,qply){this.selDepth=Math.max(this.selDepth??0,ply);this.tick();const b=this.board;const check=b.inCheck();this.resolvePublicClock(check);// Stand-pat is forbidden in check; avoid an unused evaluator/cache update.
    const stand=check?0:this.evaluate(b,this.weights);
    const moves=this.order(this.legalMoves(ply,{capturesOnly:!check}),null,ply);
    // Public repetition precedes clock, material and generic no-legal loss.
    if(this.options.qsearchRepetition&&!this.nullDepth){const repeated=this.repetitionValue(ply);if(repeated!==null){this.totalCycleGuardReturns=(this.totalCycleGuardReturns??0)+1;return repeated;}}
    const terminal=this.publicNonRepetitionTerminal(ply);if(terminal!==null)return terminal;
    // Empty capture list alone is not stalemate. Xiangqi stalemate is a loss.
    if(!moves.length&&(check||!this.legalMoves(ply).length))return -MATE+ply;
    if(!check){if(stand>=beta)return stand;if(stand>alpha)alpha=stand;}
    if(!moves.length)return alpha;
    if(ply>=100){this.stopped=true;this.stopReason='hard-ply';throw STOP;}
    if(qply>=12&&!check)return alpha;
    const track=this.options.qsearchRepetition&&!this.nullDepth;
    if(track)this.pushCheckState(check);
    try{for(const m of moves){const u=this.makeSearchMove(m);let s;try{s=-this.qsearch(-beta,-alpha,ply+1,qply+1);}finally{this.unmakeSearchMove(u);}if(s>=beta)return s;if(s>alpha)alpha=s;}return alpha;}
    finally{if(track)this.pathStates.pop();}
  }
  order(moves,preferred,ply){const b=this.board;const score=m=>{const to=m%90,from=(m/90)|0;return m===preferred?1e9:b.squares[to]?100000+16*VALUES[Math.abs(b.squares[to])]-VALUES[Math.abs(b.squares[from])]:m===this.killers[ply]?90000:this.history[m];};
    if(this.options.moveOrderWorkspace==='stable-insertion-v1'){
      if(!Number.isInteger(ply)||ply<0||ply>100)throw Error('Move-order workspace ply out of range');
      let scores=this.orderScoreSlots[ply];
      if(!scores||scores.length<moves.length){let capacity=scores?.length??64;while(capacity<moves.length)capacity*=2;scores=this.orderScoreSlots[ply]=new Float64Array(capacity);}
      for(let i=0;i<moves.length;i++)scores[i]=score(moves[i]);
      // Stable descending insertion: equality NEVER displaces an earlier move.
      // Only the scores are pooled. Each caller retains its own legal-move array.
      for(let i=1;i<moves.length;i++){const move=moves[i],value=scores[i];let j=i;while(j>0&&value>scores[j-1]){moves[j]=moves[j-1];scores[j]=scores[j-1];j--;}moves[j]=move;scores[j]=value;}
      return moves;
    }
    if(this.options.directOrdering)return moves.sort((a,b)=>score(b)-score(a));
    return moves.map(m=>[m,score(m)]).sort((a,b)=>b[1]-a[1]).map(x=>x[0]);}
  principalVariation(first,depth){if(first===null)return [];const pv=[],undos=[],seen=new Set(),rootState={turn:this.board.turn,hashLo:this.board.hashLo,hashHi:this.board.hashHi,squares:Int8Array.from(this.board.squares)};let m=first;try{for(let i=0;i<depth&&m!=null;i++){if(seen.has(this.board.key())||!this.board.generateLegalMoves().includes(m))break;seen.add(this.board.key());pv.push(m);undos.push(this.board.makeMove(m));
      // PV is a reporting hint, not a fresh search. Conservatively truncate on ANY
      // exact historical recurrence rather than print moves beyond a rule terminal.
      // No expensive classifier or new score is invoked here.
      const b=this.board,exact=s=>s.hashLo===b.hashLo&&s.hashHi===b.hashHi&&sameSearchPosition(b,s);
      if(this.options.repetitionPolicy==='verified-check-terminal'&&(exact(rootState)||this.gameHistory.some(exact)))break;
      m=this.ttGet(this.board.key())?.move;}}finally{while(undos.length)this.board.unmakeMove(undos.pop());}return pv;}
}
const STOP=Symbol('stop');
function toTT(v,p){return v>MATE-100?v+p:v<-MATE+100?v-p:v;}
function fromTT(v,p){return v>MATE-100?v-p:v<-MATE+100?v+p:v;}
