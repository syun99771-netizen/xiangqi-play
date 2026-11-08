import {createReference} from './api.mjs';
import {readModelResponse} from './model-download.mjs';
let currentId=null,busy=false;
const phase=stage=>self.postMessage({type:'model-phase',id:currentId,stage});
const reference=createReference({
 readModelBytes:async()=>{phase('download');const r=await fetch('./models/xiangqi-c07e94a5c7cb.nnue');let last=-Infinity;
  return readModelResponse(r,{onProgress:p=>{const now=performance.now();if(p.loaded===0||p.loaded===p.total||now-last>=80){last=now;self.postMessage({type:'model-progress',id:currentId,...p});}}});},
 onModelPhase:phase
});
self.onmessage=async({data})=>{
 if(busy){self.postMessage({type:'error',id:data.id,error:'引擎正在处理上一请求'});return;}
 busy=true;currentId=data.id;
 try{const result=await reference.search(data.request);self.postMessage({type:'result',id:data.id,result});}
 catch(e){self.postMessage({type:'error',id:data.id,error:String(e.message||e)});}
 finally{busy=false;currentId=null;}
};
