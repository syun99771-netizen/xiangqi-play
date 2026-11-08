/** Original fixed-size JavaScript transposition table. No strings or Map keys. */
export const TT_EXACT=0;
export const TT_LOWER=1;
export const TT_UPPER=2;
export const TT_MATE=30000;
export const TT_MATE_THRESHOLD=TT_MATE-100;

/** Normalize mate distance for storing at a position rather than at a root ply. */
export function scoreToTT(score,ply){return score>TT_MATE_THRESHOLD?score+ply:score<-TT_MATE_THRESHOLD?score-ply:score;}
export function scoreFromTT(score,ply){return score>TT_MATE_THRESHOLD?score-ply:score<-TT_MATE_THRESHOLD?score+ply:score;}

export class TranspositionTable {
  constructor(options={}){
    const capacity=typeof options==='number'?options:(options.capacity??(1<<18));
    if(!Number.isInteger(capacity)||capacity<1||capacity>(1<<22)||(capacity&(capacity-1))!==0)throw new Error('TT capacity must be a power of two from 1 through 2^22');
    this.capacity=capacity;this.mask=capacity-1;this.size=0;this.generation=1;
    this.hashLo=new Uint32Array(capacity);this.hashHi=new Uint32Array(capacity);
    this.scores=new Int32Array(capacity);this.depths=new Int16Array(capacity);
    this.moves=new Int16Array(capacity);this.flags=new Uint8Array(capacity);
    this.generations=new Uint32Array(capacity);this.occupied=new Uint8Array(capacity);
    this.byteLength=capacity*(4+4+4+2+2+1+4+1);
  }
  /** Indexing may collide; a probe ALWAYS verifies both complete unsigned words. */
  index(lo,hi){return ((lo>>>0)^(((hi<<16)|(hi>>>16))>>>0))&this.mask;}
  find(lo,hi){
    lo>>>=0;hi>>>=0;const slot=this.index(lo,hi);
    return this.occupied[slot]&&this.hashLo[slot]===lo&&this.hashHi[slot]===hi?slot:-1;
  }
  has(lo,hi){return this.find(lo,hi)!==-1;}
  /** score is still mate-normalized; use scoreFromTT(score, currentPly). */
  get(lo,hi,out){
    const slot=this.find(lo,hi);if(slot===-1)return null;
    const entry=out??{};
    entry.depth=this.depths[slot];entry.flag=this.flags[slot];entry.score=this.scores[slot];entry.move=this.moves[slot]<0?null:this.moves[slot];
    return entry;
  }
  /** Map-compatible entry shape. Caller supplies an ALREADY normalized integer score.
   * Same-generation shallower writes cannot evict a deeper result. Older-generation
   * slots may be replaced. An equal-depth exact same-key result is not downgraded.
   */
  set(lo,hi,{depth,flag,score,move}){
    if(!Number.isInteger(depth)||depth<-32768||depth>32767)throw new Error('TT depth is outside Int16 range');
    if(!Number.isInteger(flag)||flag<TT_EXACT||flag>TT_UPPER)throw new Error('Invalid TT bound flag');
    if(!Number.isInteger(score)||score<-2147483648||score>2147483647)throw new Error('TT score is outside Int32 range');
    if(move!==null&&(!Number.isInteger(move)||move<0||move>=8100))throw new Error('Invalid TT encoded move');
    lo>>>=0;hi>>>=0;const slot=this.index(lo,hi),used=this.occupied[slot]!==0;
    if(used&&this.generations[slot]===this.generation){
      if(depth<this.depths[slot])return false;
      const same=this.hashLo[slot]===lo&&this.hashHi[slot]===hi;
      if(same&&depth===this.depths[slot]&&this.flags[slot]===TT_EXACT&&flag!==TT_EXACT)return false;
    }
    this.hashLo[slot]=lo;this.hashHi[slot]=hi;this.depths[slot]=depth;this.flags[slot]=flag;
    this.scores[slot]=score;this.moves[slot]=move===null?-1:move;this.generations[slot]=this.generation;this.occupied[slot]=1;
    if(!used)this.size++;return true;
  }
  /** Convenience path for raw search scores; do not pre-normalize when using this. */
  store(lo,hi,{depth,flag,score,move},ply=0){return this.set(lo,hi,{depth,flag,score:scoreToTT(score,ply),move});}
  clear(){this.occupied.fill(0);this.size=0;this.generation=1;return this;}
  /** Start once per root search/game as desired, not once per node. Wrap clears safely. */
  newGeneration(){
    this.generation=(this.generation+1)>>>0;
    if(this.generation===0)this.clear();
    return this.generation;
  }
}
