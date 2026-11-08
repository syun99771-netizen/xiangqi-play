import {createZobristTables} from './zobrist.js';
export {HASH_SCHEME} from './zobrist.js';
/** Pure JavaScript Xiangqi rules. Repetition adjudication belongs to the match arbiter:
 * neither repeated positions nor the halfmove counter alone imply an official draw.
 * halfmove is raw capture-free plies, including quiet pawn moves and all checks.
 * It does not reconstruct rule-60 check exemptions or tournament claim procedures.
 * Coordinates: a0 is Red's lower-left; array index 0 is a9 (Black's upper-left).
 */
export const START_FEN = 'rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w - - 0 1';
const CHAR = ['', 'P', 'A', 'B', 'N', 'C', 'R', 'K'];
const TYPES = {p:1,a:2,b:3,e:3,n:4,h:4,c:5,r:6,k:7};
const row = s => (s / 9) | 0;
const col = s => s % 9;
const inside = (r,c) => r >= 0 && r < 10 && c >= 0 && c < 9;
const palace = (r,c,side) => c >= 3 && c <= 5 && (side === 1 ? r >= 7 && r <= 9 : r >= 0 && r <= 2);
const kingIndex = side => side === 1 ? 0 : 1;
const ORTH = [[-1,0],[1,0],[0,-1],[0,1]];
const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
const HORSE = [[-2,-1,-1,0],[-2,1,-1,0],[2,-1,1,0],[2,1,1,0],[-1,-2,0,-1],[1,-2,0,-1],[-1,2,0,1],[1,2,0,1]];
const horseAt = Array.from({length:90},(_,s)=>HORSE.filter(([dr,dc])=>inside(row(s)+dr,col(s)+dc)).map(([dr,dc,lr,lc])=>[s+dr*9+dc,s+lr*9+lc]));
// Target-indexed geometry for the optional generic attack probe. Side-dependent
// pawn/palace/river filters are resolved once, not during each legality check.
const attackGeometry=Array.from({length:90},(_,target)=>{
  const r=row(target),c=col(target);
  const rays=ORTH.map(([dr,dc])=>{const out=[];for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc)out.push(rr*9+cc);return out;});
  const horses=[];for(const [dr,dc,lr,lc] of HORSE){const sr=r-dr,sc=c-dc;if(inside(sr,sc))horses.push([sr*9+sc,(sr+lr)*9+sc+lc]);}
  const sides=[1,-1].map(side=>{
    const pawns=[],advisors=[],elephants=[],palaceTarget=palace(r,c,side),pr=r+(side===1?1:-1);
    if(inside(pr,c))pawns.push(pr*9+c);
    if(side===1?r<=4:r>=5){if(c>0)pawns.push(target-1);if(c<8)pawns.push(target+1);}
    for(const [dr,dc] of DIAG){const ar=r+dr,ac=c+dc,er=r+dr*2,ec=c+dc*2;
      if(palaceTarget&&inside(ar,ac))advisors.push(ar*9+ac);
      if((side===1?r>=5:r<=4)&&inside(er,ec))elephants.push([er*9+ec,ar*9+ac]);
    }
    return {pawns,advisors,elephants,palaceTarget};
  });return {rays,horses,sides};
});
const {lo:Z1,hi:Z2}=createZobristTables();
const zi = (piece,square) => (piece > 0 ? piece-1 : 7-piece-1)*90+square;
export const moveFrom = move => (move / 90) | 0;
export const moveTo = move => move % 90;
export function moveToUci(move) {
  const from = moveFrom(move), to = moveTo(move);
  return String.fromCharCode(97+col(from))+(9-row(from))+String.fromCharCode(97+col(to))+(9-row(to));
}
export function uciToMove(text) {
  if (!/^[a-i][0-9][a-i][0-9]$/.test(text)) throw new Error(`Invalid UCI move: ${text}`);
  const from=(9-Number(text[1]))*9+text.charCodeAt(0)-97;
  const to=(9-Number(text[3]))*9+text.charCodeAt(2)-97;
  return from*90+to;
}
export class Board {
  constructor(fen=START_FEN) {
    this.squares = new Int8Array(90);
    this.kings = new Int16Array([-1,-1]);
    this.loadFEN(fen);
  }
  loadFEN(fen) {
    const fields=fen.trim().split(/\s+/), ranks=fields[0].split('/');
    if (ranks.length!==10 || !['w','r','b'].includes(fields[1])) throw new Error('Invalid Xiangqi FEN');
    this.squares.fill(0); this.kings.fill(-1);
    for(let r=0;r<10;r++) {
      let c=0;
      for(const ch of ranks[r]) {
        if (/^[1-9]$/.test(ch)) { c+=Number(ch); continue; }
        const type=TYPES[ch.toLowerCase()];
        if (!type || c>=9) throw new Error('Invalid FEN piece or rank');
        const side=ch===ch.toUpperCase()?1:-1, s=r*9+c++;
        this.squares[s]=side*type;
        if(type===7) {
          if(this.kings[kingIndex(side)]!==-1) throw new Error('Duplicate king');
          this.kings[kingIndex(side)]=s;
        }
      }
      if(c!==9) throw new Error('Invalid FEN rank width');
    }
    if(this.kings[0]===-1 || this.kings[1]===-1) throw new Error('Both kings are required');
    this.turn=fields[1]==='b'?-1:1;
    this.halfmove=Number(fields[4]??0); this.fullmove=Number(fields[5]??1);
    if(!Number.isInteger(this.halfmove)||this.halfmove<0||!Number.isInteger(this.fullmove)||this.fullmove<1) throw new Error('Invalid FEN counters');
    this.rehash(); return this;
  }
  rehash() {
    let h1=this.turn===-1?Z1[1260]:0, h2=this.turn===-1?Z2[1260]:0;
    for(let s=0;s<90;s++) if(this.squares[s]) { const i=zi(this.squares[s],s); h1^=Z1[i];h2^=Z2[i]; }
    this.hashLo=h1>>>0;this.hashHi=h2>>>0;
  }
  get hash() { return this.hashLo; }
  key() { return this.hashHi+':'+this.hashLo; }
  toFEN() {
    const ranks=[];
    for(let r=0;r<10;r++) {
      let text='',empty=0;
      for(let c=0;c<9;c++) {
        const p=this.squares[r*9+c];
        if(!p) {empty++;continue;}
        if(empty) {text+=empty;empty=0;}
        text+=p>0?CHAR[p]:CHAR[-p].toLowerCase();
      }
      if(empty) text+=empty;
      ranks.push(text);
    }
    return `${ranks.join('/')} ${this.turn===1?'w':'b'} - - ${this.halfmove} ${this.fullmove}`;
  }
  clone() { return new Board(this.toFEN()); }
  makeMove(move) {
    if(!Number.isInteger(move) || move<0 || move>=8100) throw new Error('Invalid encoded move');
    const from=moveFrom(move),to=moveTo(move),piece=this.squares[from],captured=this.squares[to];
    if(!piece || piece*this.turn<=0 || captured*this.turn>0 || Math.abs(captured)===7 || from===to) throw new Error('Invalid move application');
    const undo={move,piece,captured,halfmove:this.halfmove,fullmove:this.fullmove,hashLo:this.hashLo,hashHi:this.hashHi};
    let h1=this.hashLo ^ Z1[zi(piece,from)] ^ Z1[zi(piece,to)] ^ Z1[1260];
    let h2=this.hashHi ^ Z2[zi(piece,from)] ^ Z2[zi(piece,to)] ^ Z2[1260];
    if(captured) {h1^=Z1[zi(captured,to)];h2^=Z2[zi(captured,to)];}
    this.hashLo=h1>>>0;this.hashHi=h2>>>0;
    this.squares[from]=0;this.squares[to]=piece;
    if(Math.abs(piece)===7) this.kings[kingIndex(this.turn)]=to;
    this.halfmove=captured?0:this.halfmove+1;
    if(this.turn===-1) this.fullmove++;
    this.turn=-this.turn;
    return undo;
  }
  unmakeMove(undo) {
    const from=moveFrom(undo.move),to=moveTo(undo.move);
    this.turn=-this.turn;this.squares[from]=undo.piece;this.squares[to]=undo.captured;
    if(Math.abs(undo.piece)===7) this.kings[kingIndex(this.turn)]=from;
    this.halfmove=undo.halfmove;this.fullmove=undo.fullmove;this.hashLo=undo.hashLo;this.hashHi=undo.hashHi;
  }
  inCheck(side=this.turn) { return this.isAttacked(this.kings[kingIndex(side)],-side); }
  // Geometric attacks (including pinned pieces), not legal capture availability.
  // Flying generals threaten only the opposing king, never arbitrary file squares.
  isAttacked(target,bySide) {
    if(target<0) return true;
    const b=this.squares,r=row(target),c=col(target);
    // Rooks, cannons, kings facing on a file, and adjacent palace kings.
    for(const [dr,dc] of ORTH) {
      let seen=false;
      for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc) {
        const p=b[rr*9+cc];
        if(!p) continue;
        if(!seen) {
          if(p===bySide*6) return true;
          if(p===bySide*7 &&
             ((dc===0 && b[target]===-bySide*7) ||
              (Math.abs(rr-r)+Math.abs(cc-c)===1 && palace(r,c,bySide)))) return true;
          seen=true;
        } else { if(p===bySide*5) return true; break; }
      }
    }
    // Reverse knight attacks: the horse's leg is relative to its origin.
    for(const [dr,dc,lr,lc] of HORSE) {
      const sr=r-dr,sc=c-dc;
      if(inside(sr,sc) && b[sr*9+sc]===bySide*4 && !b[(sr+lr)*9+sc+lc]) return true;
    }
    const pawnSourceR=r+(bySide===1?1:-1);
    if(inside(pawnSourceR,c) && b[pawnSourceR*9+c]===bySide) return true;
    if(bySide===1?r<=4:r>=5) {
      if(c>0 && b[target-1]===bySide) return true;
      if(c<8 && b[target+1]===bySide) return true;
    }
    for(const [dr,dc] of DIAG) {
      const ar=r+dr,ac=c+dc;
      if(inside(ar,ac) && palace(r,c,bySide) && b[ar*9+ac]===bySide*2) return true;
      const er=r+dr*2,ec=c+dc*2;
      if(inside(er,ec) && (bySide===1?r>=5:r<=4) && b[er*9+ec]===bySide*3 && !b[ar*9+ac]) return true;
    }
    return false;
  }
  // Optional exact geometric attack probe; original isAttacked remains default.
  isAttackedFast(target,bySide) {
    if(target<0)return true;
    if(!Number.isInteger(target)||target>=90||!(bySide===1||bySide===-1))return Board.prototype.isAttacked.call(this,target,bySide);
    const b=this.squares,g=attackGeometry[target],side=g.sides[kingIndex(bySide)];
    const rook=bySide*6,king=bySide*7,cannon=bySide*5;
    for(let direction=0;direction<4;direction++){
      const ray=g.rays[direction];let seen=false;
      for(let distance=0;distance<ray.length;distance++){
        const p=b[ray[distance]];if(!p)continue;
        if(!seen){
          if(p===rook)return true;
          if(p===king&&((direction<2&&b[target]===-king)||(distance===0&&side.palaceTarget)))return true;
          seen=true;
        }else{if(p===cannon)return true;break;}
      }
    }
    const horse=bySide*4;for(const [origin,leg] of g.horses)if(b[origin]===horse&&!b[leg])return true;
    for(const origin of side.pawns)if(b[origin]===bySide)return true;
    const advisor=bySide*2;for(const origin of side.advisors)if(b[origin]===advisor)return true;
    const elephant=bySide*3;for(const [origin,eye] of side.elephants)if(b[origin]===elephant&&!b[eye])return true;
    return false;
  }
  generatePseudoMoves({capturesOnly=false}={}) {
    const moves=[],b=this.squares,side=this.turn;
    const add=(from,to)=> {const p=b[to];if(p*side<=0 && Math.abs(p)!==7 && (!capturesOnly||p))moves.push(from*90+to);};
    for(let from=0;from<90;from++) {
      const p=b[from];if(p*side<=0)continue;
      const r=row(from),c=col(from);
      switch(Math.abs(p)) {
        case 1: {
          const rr=r+(side===1?-1:1);
          if(inside(rr,c))add(from,rr*9+c);
          if(side===1?r<=4:r>=5) {if(c>0)add(from,from-1);if(c<8)add(from,from+1);}
          break;
        }
        case 2:
          for(const [dr,dc] of DIAG) if(palace(r+dr,c+dc,side))add(from,(r+dr)*9+c+dc);
          break;
        case 3:
          for(const [dr,dc] of DIAG) {
            const rr=r+dr*2,cc=c+dc*2;
            if(inside(rr,cc) && (side===1?rr>=5:rr<=4) && !b[(r+dr)*9+c+dc])add(from,rr*9+cc);
          }
          break;
        case 4:
          for(const [to,leg] of horseAt[from]) if(!b[leg])add(from,to);
          break;
        case 5: case 6:
          for(const [dr,dc] of ORTH) {
            let screen=false;
            for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc) {
              const to=rr*9+cc,occupied=b[to]!==0;
              if(Math.abs(p)===6) {add(from,to);if(occupied)break;}
              else if(!screen) {if(occupied)screen=true;else add(from,to);}
              else if(occupied) {add(from,to);break;}
            }
          }
          break;
        case 7:
          for(const [dr,dc] of ORTH)if(palace(r+dr,c+dc,side))add(from,(r+dr)*9+c+dc);
          break;
      }
    }
    return moves;
  }
  generatePseudoMovesInto(buffer,{capturesOnly=false}={}) {
    buffer.reset();const b=this.squares,side=this.turn;
    for(let from=0;from<90;from++) {
      const p=b[from];if(p*side<=0)continue;
      const r=row(from),c=col(from);
      switch(Math.abs(p)) {
        case 1: {
          const rr=r+(side===1?-1:1);
          if(inside(rr,c))buffer.candidate(b,side,capturesOnly,from,rr*9+c);
          if(side===1?r<=4:r>=5) {if(c>0)buffer.candidate(b,side,capturesOnly,from,from-1);if(c<8)buffer.candidate(b,side,capturesOnly,from,from+1);}
          break;
        }
        case 2:
          for(const [dr,dc] of DIAG) if(palace(r+dr,c+dc,side))buffer.candidate(b,side,capturesOnly,from,(r+dr)*9+c+dc);
          break;
        case 3:
          for(const [dr,dc] of DIAG) {
            const rr=r+dr*2,cc=c+dc*2;
            if(inside(rr,cc) && (side===1?rr>=5:rr<=4) && !b[(r+dr)*9+c+dc])buffer.candidate(b,side,capturesOnly,from,rr*9+cc);
          }
          break;
        case 4:
          for(const [to,leg] of horseAt[from]) if(!b[leg])buffer.candidate(b,side,capturesOnly,from,to);
          break;
        case 5: case 6:
          for(const [dr,dc] of ORTH) {
            let screen=false;
            for(let rr=r+dr,cc=c+dc;inside(rr,cc);rr+=dr,cc+=dc) {
              const to=rr*9+cc,occupied=b[to]!==0;
              if(Math.abs(p)===6) {buffer.candidate(b,side,capturesOnly,from,to);if(occupied)break;}
              else if(!screen) {if(occupied)screen=true;else buffer.candidate(b,side,capturesOnly,from,to);}
              else if(occupied) {buffer.candidate(b,side,capturesOnly,from,to);break;}
            }
          }
          break;
        case 7:
          for(const [dr,dc] of ORTH)if(palace(r+dr,c+dc,side))buffer.candidate(b,side,capturesOnly,from,(r+dr)*9+c+dc);
          break;
      }
    }
    return buffer;
  }
  /** Optional typed destination. Returned view belongs to the caller's workspace;
   * do not reuse that workspace while a prior view is still being consumed.
   */
  generateLegalMovesInto(buffer,options={}) {
    this.generatePseudoMovesInto(buffer,options);
    const side=this.turn,b=this.squares,ki=kingIndex(side),count=buffer.length;let legalCount=0;
    for(let i=0;i<count;i++){
      const move=buffer.data[i],from=moveFrom(move),to=moveTo(move),piece=b[from],captured=b[to];
      const king=Math.abs(piece)===7,oldKing=this.kings[ki];b[from]=0;b[to]=piece;if(king)this.kings[ki]=to;
      try{if(!this.inCheck(side))buffer.data[legalCount++]=move;}
      finally{b[from]=piece;b[to]=captured;if(king)this.kings[ki]=oldKing;}
    }
    buffer.length=legalCount;return buffer.view();
  }
  generateLegalMoves(options={}) {
    const side=this.turn,moves=this.generatePseudoMoves(options),legal=[];
    for(const move of moves) {const undo=this.makeMove(move);if(!this.inCheck(side))legal.push(move);this.unmakeMove(undo);}
    return legal;
  }
  // Optional square-only legality probes. No hashing, clocks, side flip, or
  // full undo allocation: inCheck receives the explicit original moving side.
  // Leave generateLegalMoves as the reference/default until separately promoted.
  generateLegalMovesFast(options={}) {
    const side=this.turn,moves=this.generatePseudoMoves(options),legal=[];
    const b=this.squares,ki=kingIndex(side);
    for(const move of moves) {
      const from=moveFrom(move),to=moveTo(move),piece=b[from],captured=b[to];
      const king=Math.abs(piece)===7,oldKing=this.kings[ki];
      b[from]=0;b[to]=piece;if(king)this.kings[ki]=to;
      try {if(!this.inCheck(side))legal.push(move);}
      finally {b[from]=piece;b[to]=captured;if(king)this.kings[ki]=oldKing;}
    }
    return legal;
  }
  isLegalMove(move) { return this.generateLegalMoves().includes(typeof move==='string'?uciToMove(move):move); }
  playUci(text) { const move=uciToMove(text);if(!this.isLegalMove(move))throw new Error(`Illegal move ${text}`);return this.makeMove(move); }
  perft(depth) {
    if(depth===0)return 1;
    const moves=this.generateLegalMoves();if(depth===1)return moves.length;
    let n=0;for(const move of moves){const undo=this.makeMove(move);n+=this.perft(depth-1);this.unmakeMove(undo);}return n;
  }
}
