// Browser MODULE worker demonstration; browser execution has not been qualified.
// Caller sends {id,request,modelBytes,cancelBuffer?}; bytes parsed only after terminal preflight.
// A queued message cannot interrupt synchronous Search. Use shared Int32 + Atomics
// when cross-origin isolation permits, or terminate this worker for hard cancellation.
import{createReference}from'./api.mjs';
let bytes=null,busy=false;const reference=createReference({readModelBytes:()=>{if(!bytes)throw Error('Provide original modelBytes');return bytes;}});
self.onmessage=async({data:m})=>{if(busy){self.postMessage({id:m.id,ok:false,error:'Busy'});return;}busy=true;try{if(m.modelBytes&&!reference.modelLoaded)bytes=m.modelBytes;const result=await reference.search(m.request,{stopFlag:m.cancelBuffer?new Int32Array(m.cancelBuffer):undefined});bytes=null;self.postMessage({id:m.id,ok:true,result});}catch(e){self.postMessage({id:m.id,ok:false,error:String(e)});}finally{busy=false;}};
