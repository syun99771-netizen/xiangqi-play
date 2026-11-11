// SPDX-License-Identifier: GPL-3.0-or-later
// Exact private numerical translation of the project's GPL NNUE head arithmetic.
// No native chess engine, WASI, heap allocator or imported runtime.
#include <stdint.h>
#include <wasm_simd128.h>
#define STACK_BYTES 17636
static uint8_t weights[8 * STACK_BYTES] __attribute__((aligned(16)));
static int16_t accum[1024] __attribute__((aligned(16)));
static uint8_t input[1024] __attribute__((aligned(16)));
static uint8_t hidden1[16] __attribute__((aligned(16)));
static uint8_t hidden2[32] __attribute__((aligned(16)));
uint32_t weights_ptr(void){return (uint32_t)(uintptr_t)weights;}
uint32_t accum_ptr(void){return (uint32_t)(uintptr_t)accum;}
uint32_t weights_bytes(void){return sizeof(weights);}
static uint32_t load32(const uint8_t *p){uint32_t x;__builtin_memcpy(&x,p,4);return x;}
static int32_t dot(const uint8_t *x,const uint8_t *w,int n){
 v128_t sum=wasm_i32x4_splat(0);
 for(int i=0;i<n;i+=16){
  v128_t a=wasm_v128_load(x+i),b=wasm_v128_load(w+i);
  sum=wasm_i32x4_add(sum,wasm_i32x4_dot_i16x8(wasm_u16x8_extend_low_u8x16(a),wasm_i16x8_extend_low_i8x16(b)));
  sum=wasm_i32x4_add(sum,wasm_i32x4_dot_i16x8(wasm_u16x8_extend_high_u8x16(a),wasm_i16x8_extend_high_i8x16(b)));
 }
 // Each dot has at most1024 products, magnitude<=1024*127*128<2^24.
 return wasm_i32x4_extract_lane(sum,0)+wasm_i32x4_extract_lane(sum,1)+wasm_i32x4_extract_lane(sum,2)+wasm_i32x4_extract_lane(sum,3);
}
static int32_t biased(int32_t d,const uint8_t *b){
 // Unsigned addition is defined modulo2^32, matching JS final |0.
 uint32_t v=(uint32_t)d+load32(b);
 return v<=INT32_MAX?(int32_t)v:(int32_t)((int64_t)v-INT64_C(4294967296));
}
static uint8_t activation(int32_t v){
 // Equivalent to signed JS >>6 followed by clamp0..127, without C negative-shift assumptions.
 if(v<0)return 0;v/=64;return v>127?127:(uint8_t)v;
}
int32_t run_head(int32_t bucket){
 if((uint32_t)bucket>=8)__builtin_trap();
 v128_t zero=wasm_i16x8_splat(0),top=wasm_i16x8_splat(127);
 for(int i=0;i<1024;i+=16){
  v128_t lo=wasm_i16x8_min(wasm_i16x8_max(wasm_v128_load(accum+i),zero),top);
  v128_t hi=wasm_i16x8_min(wasm_i16x8_max(wasm_v128_load(accum+i+8),zero),top);
  wasm_v128_store(input+i,wasm_u8x16_narrow_i16x8(lo,hi));
 }
 const uint8_t *p=weights+bucket*STACK_BYTES;
 for(int row=0;row<16;row++)hidden1[row]=activation(biased(dot(input,p+64+row*1024,1024),p+row*4));
 p+=64+16*1024;
 // Only16 real inputs; skip the other16 serialized padding weights per row.
 for(int row=0;row<32;row++)hidden2[row]=activation(biased(dot(hidden1,p+128+row*32,16),p+row*4));
 p+=128+32*32;
 return biased(dot(hidden2,p+4,32),p);
}
