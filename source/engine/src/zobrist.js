/** Deterministic noncryptographic Zobrist initialization, version2.
 * SplitMix64 algorithm by Sebastiano Vigna (2015), public-domain dedication and
 * permissive grant: https://prng.di.unimi.it/splitmix64.c
 * BigInt is initialization-only; board probes retain Uint32 XOR operations.
 */
export const HASH_SCHEME='zobrist-splitmix64-v2-seed-12345678';
export function createZobristTables(){
 const mask=(1n<<64n)-1n;let state=0x12345678n;
 const lo=new Uint32Array(1261),hi=new Uint32Array(1261);
 for(let i=0;i<1261;i++){
  state=(state+0x9e3779b97f4a7c15n)&mask;
  let z=state;z=((z^(z>>30n))*0xbf58476d1ce4e5b9n)&mask;
  z=((z^(z>>27n))*0x94d049bb133111ebn)&mask;z=z^(z>>31n);
  lo[i]=Number(z&0xffffffffn);hi[i]=Number(z>>32n);
 }
 return {lo,hi};
}
