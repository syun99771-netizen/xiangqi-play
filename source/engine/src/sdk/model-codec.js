/** Portable codec for the original residual model, not Pikafish/Stockfish NNUE. */
import {loadModel,serializeModel,INPUTS,HIDDEN} from '../nnue.js';
export const MAX_MODEL_BYTES=2*1024*1024;
const COUNT=INPUTS*HIDDEN+2*HIDDEN, HEADER=16, MAX_META=16384;
const encoder=new TextEncoder(),decoder=new TextDecoder('utf-8',{fatal:true});
export function readModel(data){
 if(data instanceof ArrayBuffer)return decodeModel(data);
 if(typeof data==='string'){
  if(data.length>MAX_MODEL_BYTES||encoder.encode(data).length>MAX_MODEL_BYTES)throw Error('Model JSON exceeds size limit');
  data=JSON.parse(data);
 }
 const model=loadModel(data);
 // Also bound non-weight metadata, including provenance and training annotations.
 const {inputWeights,hiddenBias,outputWeights,...metadata}=model;
 if(encoder.encode(JSON.stringify(metadata)).length>MAX_META)throw Error('Model metadata exceeds size limit');
 return model;
}
export function encodeModel(data){
 const model=readModel(data),{inputWeights,hiddenBias,outputWeights,...metadata}=model;
 const meta=encoder.encode(JSON.stringify(metadata));
 const buffer=new ArrayBuffer(HEADER+meta.length+COUNT*4),view=new DataView(buffer),bytes=new Uint8Array(buffer);
 bytes.set([88,81,74,83]);view.setUint32(4,1,true);view.setUint32(8,meta.length,true);view.setUint32(12,COUNT,true);bytes.set(meta,HEADER);
 let offset=HEADER+meta.length;for(const values of [inputWeights,hiddenBias,outputWeights])for(const value of values){view.setFloat32(offset,value,true);offset+=4;}
 return buffer;
}
export function decodeModel(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<HEADER||buffer.byteLength>MAX_MODEL_BYTES)throw Error('Invalid binary model size');
 const view=new DataView(buffer),bytes=new Uint8Array(buffer);
 if(bytes[0]!==88||bytes[1]!==81||bytes[2]!==74||bytes[3]!==83||view.getUint32(4,true)!==1)throw Error('Unsupported binary model magic/version');
 const length=view.getUint32(8,true),count=view.getUint32(12,true);
 if(length>MAX_META||count!==COUNT||buffer.byteLength!==HEADER+length+COUNT*4)throw Error('Invalid binary model dimensions');
 const meta=JSON.parse(decoder.decode(bytes.subarray(HEADER,HEADER+length)));
 if(!meta||typeof meta!=='object'||Array.isArray(meta))throw Error('Invalid model metadata');
 let offset=HEADER+length;const arrays={};for(const [key,size] of [['inputWeights',INPUTS*HIDDEN],['hiddenBias',HIDDEN],['outputWeights',HIDDEN]]){
  const values=new Float32Array(size);for(let i=0;i<size;i++,offset+=4)values[i]=view.getFloat32(offset,true);arrays[key]=values;
 }
 return loadModel({...meta,...arrays});
}
export function modelJSON(data){return JSON.stringify(serializeModel(readModel(data)));}
