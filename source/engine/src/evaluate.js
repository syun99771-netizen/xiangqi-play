/** Pure JavaScript, linear RED-perspective evaluation. Values are centipawns. */
export const FEATURE_NAMES = Object.freeze([
  'pawn', 'advisor', 'elephant', 'horse', 'cannon', 'rook',
  'pawn_advance', 'pawn_crossed', 'pawn_center', 'horse_center',
  'horse_free_legs', 'rook_center', 'rook_forward', 'rook_file_mobility',
  'cannon_center', 'cannon_forward', 'king_home', 'advisor_home',
  'elephant_home', 'rook_pair', 'horse_pair', 'tempo'
]);
export const DEFAULT_WEIGHTS = Object.freeze([
  100, 210, 210, 420, 450, 900, 9, 35, 12, 7, 8, 3, 2, 2,
  3, 1, 6, 8, 6, 8, 6, 12
]);
const N = FEATURE_NAMES.length;

/** Features are always RED minus BLACK, independent of the player to move. */
export function extractFeatures(board) {
  const s = board.squares;
  if (!s || s.length !== 90) throw new TypeError('Expected 90 board squares');
  const f = new Float64Array(N);
  let redRooks=0, blackRooks=0, redHorses=0, blackHorses=0;
  for (let sq=0; sq<90; sq++) {
    const p=s[sq]; if (!p) continue;
    const side=p>0?1:-1, type=Math.abs(p), r=(sq/9)|0, c=sq%9;
    const homeDistance=side===1?9-r:r;
    const center=4-Math.abs(c-4);
    if(type<=6) f[type-1]+=side;
    switch(type) {
      case 1: {
        const crossed=side===1?r<=4:r>=5;
        f[6]+=side*Math.max(0,homeDistance-3);
        f[7]+=side*Number(crossed);
        if(crossed) f[8]+=side*center;
        break;
      }
      case 2: f[17]+=side*Number(homeDistance<=2); break;
      case 3: f[18]+=side*Number(homeDistance<=4); break;
      case 4: {
        f[9]+=side*(center+Math.min(homeDistance,9-homeDistance));
        for(const [dr,dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const rr=r+dr,cc=c+dc;
          if(rr>=0&&rr<10&&cc>=0&&cc<9&&s[rr*9+cc]===0) f[10]+=side;
        }
        if(side===1) redHorses++; else blackHorses++;
        break;
      }
      case 5: f[14]+=side*center; f[15]+=side*homeDistance; break;
      case 6: {
        f[11]+=side*center; f[12]+=side*homeDistance;
        for(const dr of [-1,1]) for(let rr=r+dr;rr>=0&&rr<10;rr+=dr) {
          if(s[rr*9+c]!==0) break;
          f[13]+=side;
        }
        if(side===1) redRooks++; else blackRooks++;
        break;
      }
      case 7: f[16]+=side*(2-homeDistance); break;
    }
  }
  f[19]=Number(redRooks>=2)-Number(blackRooks>=2);
  f[20]=Number(redHorses>=2)-Number(blackHorses>=2);
  f[21]=board.turn;
  return f;
}

export function evaluateRedReference(board, weights=DEFAULT_WEIGHTS) {
  const w=weights?.weights??weights;
  if(!w || w.length!==N) throw new TypeError(`Expected ${N} evaluation weights`);
  const f=extractFeatures(board);
  let score=0;
  for(let i=0;i<N;i++) score+=f[i]*w[i];
  return Math.round(score);
}

/** Allocation-free evaluator. Integer feature totals and dot-product addition order
 * deliberately match extractFeatures + evaluateRedReference, including rounding. */
export function evaluateRed(board, weights=DEFAULT_WEIGHTS) {
  const w=weights?.weights??weights;
  if(!w || w.length!==N) throw new TypeError(`Expected ${N} evaluation weights`);
  const s=board.squares;
  if(!s || s.length!==90) throw new TypeError('Expected 90 board squares');
  let f0=0,f1=0,f2=0,f3=0,f4=0,f5=0,f6=0,f7=0,f8=0,f9=0,f10=0;
  let f11=0,f12=0,f13=0,f14=0,f15=0,f16=0,f17=0,f18=0;
  let redRooks=0,blackRooks=0,redHorses=0,blackHorses=0;
  for(let sq=0;sq<90;sq++) {
    const p=s[sq];if(!p)continue;
    const side=p>0?1:-1,type=Math.abs(p),r=(sq/9)|0,c=sq%9;
    const homeDistance=side===1?9-r:r,center=4-Math.abs(c-4);
    switch(type){
      case 1: {
        f0+=side;
        const crossed=side===1?r<=4:r>=5;
        f6+=side*Math.max(0,homeDistance-3);
        f7+=side*Number(crossed);
        if(crossed)f8+=side*center;
        break;
      }
      case 2:f1+=side;f17+=side*Number(homeDistance<=2);break;
      case 3:f2+=side;f18+=side*Number(homeDistance<=4);break;
      case 4:
        f3+=side;f9+=side*(center+Math.min(homeDistance,9-homeDistance));
        if(r>0&&s[sq-9]===0)f10+=side;
        if(r<9&&s[sq+9]===0)f10+=side;
        if(c>0&&s[sq-1]===0)f10+=side;
        if(c<8&&s[sq+1]===0)f10+=side;
        if(side===1)redHorses++;else blackHorses++;
        break;
      case 5:f4+=side;f14+=side*center;f15+=side*homeDistance;break;
      case 6:
        f5+=side;f11+=side*center;f12+=side*homeDistance;
        for(let rr=r-1;rr>=0;rr--){if(s[rr*9+c]!==0)break;f13+=side;}
        for(let rr=r+1;rr<10;rr++){if(s[rr*9+c]!==0)break;f13+=side;}
        if(side===1)redRooks++;else blackRooks++;
        break;
      case 7:f16+=side*(2-homeDistance);break;
    }
  }
  const f19=Number(redRooks>=2)-Number(blackRooks>=2);
  const f20=Number(redHorses>=2)-Number(blackHorses>=2);
  // Do not reassociate additions: arbitrary trained weights can make rounding sensitive.
  let score=0;
  score+=f0*w[0];score+=f1*w[1];score+=f2*w[2];score+=f3*w[3];
  score+=f4*w[4];score+=f5*w[5];score+=f6*w[6];score+=f7*w[7];
  score+=f8*w[8];score+=f9*w[9];score+=f10*w[10];score+=f11*w[11];
  score+=f12*w[12];score+=f13*w[13];score+=f14*w[14];score+=f15*w[15];
  score+=f16*w[16];score+=f17*w[17];score+=f18*w[18];score+=f19*w[19];
  score+=f20*w[20];score+=board.turn*w[21];
  return Math.round(score);
}

/** Returns a score from the side-to-move perspective. Terminal scores belong to search. */
export function evaluate(board, weights=DEFAULT_WEIGHTS) {
  return board.turn*evaluateRed(board,weights);
}
