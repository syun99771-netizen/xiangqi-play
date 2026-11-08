/** Original, experimental JavaScript Xiangqi residual network. No third-party weights/code. */
import {evaluateRed} from './evaluate.js';
export const NNUE_FORMAT='xiangqi-original-residual-nnue-v1';
export const INPUTS=1260;
export const HIDDEN=32;
export const DEFAULT_RESIDUAL_CAP=80;
const clip=x=>Math.max(0,Math.min(1,x));
function seededRandom(seed){let s=seed>>>0;return()=>{s=(Math.imul(1664525,s)+1013904223)>>>0;return s/4294967296;};}
export function featureIndex(piece,square,perspective=1){
  if(perspective===-1){piece=-piece;square=89-square;}
  return ((piece>0?piece-1:7+(-piece)-1)*90)+square;
}
export function createEmptyModel({seed=1,residualCap=DEFAULT_RESIDUAL_CAP,outputScale=100}={}){
  const random=seededRandom(seed);
  return validateModel({format:NNUE_FORMAT,inputs:INPUTS,hidden:HIDDEN,seed,residualCap,outputScale,
    inputWeights:Float32Array.from({length:INPUTS*HIDDEN},()=> (random()*2-1)*0.05),
    hiddenBias:new Float32Array(HIDDEN).fill(0.1),outputWeights:new Float32Array(HIDDEN),
    provenance:{implementation:'original-js-residual-v1',initialization:'seeded-original',trainingSource:'untrained',thirdPartyWeights:false},
    status:'experimental-unvalidated',baseline:'fixed-handcrafted-default-v1'});
}
export function validateModel(model){
  if(!model||model.format!==NNUE_FORMAT||model.inputs!==INPUTS||model.hidden!==HIDDEN)throw new Error('Unsupported NNUE model shape or format');
  if(!Number.isFinite(model.residualCap)||model.residualCap<0||model.residualCap>400||!Number.isFinite(model.outputScale)||model.outputScale<=0||model.outputScale>1000)throw new Error('Invalid NNUE scale or residual cap');
  if(model.provenance?.implementation!=='original-js-residual-v1'||model.provenance?.initialization!=='seeded-original'||model.provenance?.thirdPartyWeights!==false||!['untrained','original-js-selfplay','original-synthetic-tests'].includes(model.provenance?.trainingSource))throw new Error('NNUE provenance must identify original initialization and original-only training');
  for(const [key,length] of [['inputWeights',INPUTS*HIDDEN],['hiddenBias',HIDDEN],['outputWeights',HIDDEN]]){
    const values=model[key];if(!values||values.length!==length||!Array.from(values).every(Number.isFinite))throw new Error(`Invalid NNUE ${key}`);
    // Keep bounded, finite Float32 parameters to prevent accumulator overflow.
    if(Array.from(values).some(v=>Math.abs(v)>100))throw new Error(`NNUE ${key} exceeds parameter safety bound`);
  }
  return model;
}
export function serializeModel(model){
  validateModel(model);
  return {...model,inputWeights:Array.from(model.inputWeights),hiddenBias:Array.from(model.hiddenBias),outputWeights:Array.from(model.outputWeights)};
}
export function loadModel(data){
  const obj=typeof data==='string'?JSON.parse(data):data;validateModel(obj);
  return validateModel({...obj,inputWeights:Float32Array.from(obj.inputWeights),hiddenBias:Float32Array.from(obj.hiddenBias),outputWeights:Float32Array.from(obj.outputWeights)});
}
export function activeFeatures(board,perspective=1){
  const active=[];
  for(let sq=0;sq<90;sq++)if(board.squares[sq])active.push(featureIndex(board.squares[sq],sq,perspective));
  return active;
}
export function rebuildAccumulator(model,board,out=new Float64Array(HIDDEN*2),offset=0){
  if(!board.squares||board.squares.length!==90)throw new Error('Expected Xiangqi board');
  for(let j=0;j<HIDDEN;j++)out[offset+j]=out[offset+HIDDEN+j]=model.hiddenBias[j];
  for(let sq=0;sq<90;sq++){
    const piece=board.squares[sq];if(!piece)continue;
    const red=featureIndex(piece,sq,1)*HIDDEN,black=featureIndex(piece,sq,-1)*HIDDEN;
    for(let j=0;j<HIDDEN;j++){out[offset+j]+=model.inputWeights[red+j];out[offset+HIDDEN+j]+=model.inputWeights[black+j];}
  }
  return out;
}
export function residualFromAccumulator(model,accumulator,offset=0){
  let red=0,black=0;
  for(let j=0;j<HIDDEN;j++){red+=model.outputWeights[j]*clip(accumulator[offset+j]);black+=model.outputWeights[j]*clip(accumulator[offset+HIDDEN+j]);}
  const raw=(red-black)*model.outputScale*0.5;
  return {raw,clamped:Math.max(-model.residualCap,Math.min(model.residualCap,raw))};
}
/** Allocating reference forward path for training and correctness checks, not node search. */
export function forwardReference(model,board){
  const accumulator=rebuildAccumulator(model,board),residual=residualFromAccumulator(model,accumulator);
  const baseline=evaluateRed(board);
  return {accumulator,rawResidual:residual.raw,residual:residual.clamped,baseline,scoreRed:baseline+residual.clamped};
}
/** Call push BEFORE Board.makeMove; pop restores parent frame without inverse arithmetic. */
export class NeuralEvaluator{
  constructor(model=createEmptyModel(),{maxPly=256}={}){
    this.model=loadModel(model);
    if(!Number.isInteger(maxPly)||maxPly<1||maxPly>4096)throw new Error('Invalid NNUE stack capacity');
    this.maxPly=maxPly;this.stack=new Float64Array((maxPly+1)*HIDDEN*2);this.ply=0;this.initialized=false;
  }
  reset(board){this.ply=0;rebuildAccumulator(this.model,board,this.stack,0);this.initialized=true;return this;}
  push(boardBefore,move){
    if(!this.initialized)throw new Error('NNUE evaluator must be reset first');
    if(this.ply>=this.maxPly)throw new Error('NNUE accumulator stack exhausted');
    const from=(move/90)|0,to=move%90,piece=boardBefore.squares[from],capture=boardBefore.squares[to];
    if(!Number.isInteger(move)||from<0||from>=90||to<0||to>=90||from===to||!piece||piece*boardBefore.turn<=0||capture*piece>0)throw new Error('Invalid NNUE move transition');
    const oldOffset=this.ply*HIDDEN*2,newOffset=oldOffset+HIDDEN*2,w=this.model.inputWeights;
    for(let j=0;j<HIDDEN*2;j++)this.stack[newOffset+j]=this.stack[oldOffset+j];
    for(const perspective of [1,-1]){
      const offset=newOffset+(perspective===1?0:HIDDEN);
      const removed=featureIndex(piece,from,perspective)*HIDDEN,added=featureIndex(piece,to,perspective)*HIDDEN;
      const captured=capture?featureIndex(capture,to,perspective)*HIDDEN:-1;
      for(let j=0;j<HIDDEN;j++){
        this.stack[offset+j]-=w[removed+j];this.stack[offset+j]+=w[added+j];
        if(capture)this.stack[offset+j]-=w[captured+j];
      }
    }
    this.ply++;return this;
  }
  pop(){if(!this.initialized||this.ply===0)throw new Error('NNUE accumulator stack underflow');this.ply--;return this;}
  residual(){if(!this.initialized)throw new Error('NNUE evaluator must be reset first');return residualFromAccumulator(this.model,this.stack,this.ply*HIDDEN*2);}
  evaluate(board,weights){const residual=this.residual().clamped;return board.turn*Math.round(evaluateRed(board,weights)+residual);}
  /** Snapshot only for tests/debugging; the hot evaluation path does not allocate an accumulator. */
  accumulator(){if(!this.initialized)throw new Error('NNUE evaluator must be reset first');return this.stack.slice(this.ply*HIDDEN*2,(this.ply+1)*HIDDEN*2);}
}
