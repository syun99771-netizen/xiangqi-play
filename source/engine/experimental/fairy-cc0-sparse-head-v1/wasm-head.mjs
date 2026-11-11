// SPDX-License-Identifier: GPL-3.0-or-later
// Exact fixed SIMD numeric head only; corresponding source: wasm-head-source.c.
const encoded='AGFzbQEAAAABCgJgAAF/YAF/AX8DBQQAAAABBQQBAQQEBz8FBm1lbW9yeQIAC3dlaWdodHNfcHRyAAAJYWNjdW1fcHRyAAENd2VpZ2h0c19ieXRlcwACCHJ1bl9oZWFkAAMKoAYEBgBBgIAECwYAQaDODAsGAEGgzggLiAYCBH8EeyAAQQdNBEBBoM4MIQFBcCECA0AgAkGw3gxqIAH9AAQA/QwAAAAAAAAAAAAAAAAAAAAA/ZgB/Qx/AH8AfwB/AH8AfwB/AH8A/ZYBIAFBEGr9AAQA/QwAAAAAAAAAAAAAAAAAAAAA/ZgB/Qx/AH8AfwB/AH8AfwB/AH8A/ZYB/Wb9CwQAIAJBwN4MaiABQSBq/QAEAP0MAAAAAAAAAAAAAAAAAAAAAP2YAf0MfwB/AH8AfwB/AH8AfwB/AP2WASABQTBq/QAEAP0MAAAAAAAAAAAAAAAAAAAAAP2YAf0MfwB/AH8AfwB/AH8AfwB/AP2WAf1m/QsEACABQUBrIQEgAkEgaiICQfAHSQ0ACyAAQeSJAWwiAUHAgARqIQAgAUGAgARqIQNBACECA0D9DAAAAAAAAAAAAAAAAAAAAAAhBUEAIQEDQCABQaDeDGr9AAQAIgb9iQEgACABav0AAgAiB/2HAf26ASAF/a4BIAb9igEgB/2IAf26Af2uASEFIAFB8AdJIAFBEGohAQ0ACyACQf8AIAMgAkECdGooAgAgBf0bACAF/RsBaiAF/RsCaiAF/RsDamoiAUEGdiABQf8/SxtBACABQQBOGzoAoOYMIABBgAhqIQAgAkEBaiICQRBHDQALIANBwIEBaiEBIANBwIABaiECQaDmDP0ABAAiBf2KASEGIAX9iQEhB0FgIQADQCAAQdDmDGpB/wAgAigCACAHIAH9AAIAIgX9hwH9ugEgBiAF/YgB/boB/a4BIgX9GwFqIAX9GwBqIAX9GwJqIAX9GwNqIgRBBnYgBEH/P0sbQQAgBEEAThs6AAAgAkEEaiECIAFBIGohASAAQQFqIgANAAsgAygCwIkBQcDmDP0ABAAiBf2JASAD/QAC1IkBIgb9hwH9ugFBsOYM/QAEACIH/YkBIAP9AALEiQEiCP2HAf26ASAH/YoBIAj9iAH9ugH9rgH9rgEgBf2KASAG/YgB/boB/a4BIgX9GwAgBf0bAWogBf0bAmogBf0bA2pqDwsACwB5CXByb2R1Y2VycwEMcHJvY2Vzc2VkLWJ5AQVjbGFuZ1kyNC4wLjBnaXQgKGh0dHBzOi8vZ2l0aHViLmNvbS9sbHZtL2xsdm0tcHJvamVjdCA4NGJhN2IzN2YwMmRmNWE1NTY3ZTMxYTFiY2ZhMGY2MDdlNTc4ZjEyKQCdAQ90YXJnZXRfZmVhdHVyZXMJKw9tdXRhYmxlLWdsb2JhbHMrE25vbnRyYXBwaW5nLWZwdG9pbnQrB3NpbWQxMjgrC2J1bGstbWVtb3J5KwhzaWduLWV4dCsPcmVmZXJlbmNlLXR5cGVzKwptdWx0aXZhbHVlKw9idWxrLW1lbW9yeS1vcHQrFmNhbGwtaW5kaXJlY3Qtb3Zlcmxvbmc=';
let compiled;let calls=0,instances=0,fallbacks=0;
export const wasmHeadStats=()=>Object.freeze({calls,instances,fallbacks});
function moduleOrNull(){
 if(compiled!==undefined)return compiled;
 const endian=new Uint16Array([1]);
 if(typeof WebAssembly==='undefined'||typeof WebAssembly.validate!=='function'||typeof WebAssembly.Module!=='function'||typeof WebAssembly.Instance!=='function'||typeof atob!=='function'||new Uint8Array(endian.buffer)[0]!==1)return compiled=null;
 const bytes=Uint8Array.from(atob(encoded),x=>x.charCodeAt(0));
 if(!WebAssembly.validate(bytes))return compiled=null;
 // Unsupported features or CSP can reject construction after validate succeeds.
 // Only the native CompileError class is a capability failure, not a message/name match.
 try{compiled=new WebAssembly.Module(bytes);}catch(error){
  if(typeof WebAssembly.CompileError==='function'&&error instanceof WebAssembly.CompileError)return compiled=null;
  throw error;
 }
 if(WebAssembly.Module.imports(compiled).length)throw Error('WASM head must not import a runtime');
 return compiled;
}
export function createWasmHead(stacks){
 const module=moduleOrNull();if(!module){fallbacks++;return null;}
 let instance;
 try{instance=new WebAssembly.Instance(module);}catch(error){
  if(typeof WebAssembly.CompileError==='function'&&error instanceof WebAssembly.CompileError){compiled=null;fallbacks++;return null;}
  throw error;
 }
 const e=instance.exports,buffer=e.memory.buffer;
 if(buffer.byteLength!==262144||e.weights_bytes()!==141088||e.weights_ptr()!==65536||e.accum_ptr()!==206624)throw Error('Unexpected WASM head layout');
 const view=new DataView(buffer),weights=new Uint8Array(buffer);let offset=e.weights_ptr();
 if(stacks.length!==8)throw Error('Expected exactly eight NNUE stacks');
 for(const stack of stacks)for(let l=0;l<3;l++){
  const layer=stack[l],n=[16,32,1][l],w=[16384,1024,32][l];
  if(!(layer.bias instanceof Int32Array)||layer.bias.length!==n||!(layer.weight instanceof Int8Array)||layer.weight.length!==w)throw Error('Unexpected validated WASM head parameters');
  for(const v of layer.bias){view.setInt32(offset,v,true);offset+=4;}
  weights.set(new Uint8Array(layer.weight.buffer,layer.weight.byteOffset,layer.weight.byteLength),offset);offset+=w;
 }
 const accum=new Int16Array(buffer,e.accum_ptr(),1024);let busy=false;instances++;
 return (stm,opp,bucket)=>{
  if(busy)throw Error('WASM head is not reentrant');
  if(!(stm instanceof Int16Array)||stm.length!==512||!(opp instanceof Int16Array)||opp.length!==512||!Number.isInteger(bucket)||bucket<0||bucket>=8)throw Error('Invalid WASM head input');
  busy=true;try{accum.set(stm,0);accum.set(opp,512);calls++;return e.run_head(bucket);}finally{busy=false;}
 };
}
