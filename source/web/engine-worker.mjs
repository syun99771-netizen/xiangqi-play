import {createReference} from './api.mjs';
const reference=createReference({readModelBytes:async()=>{self.postMessage({type:'loading'});const r=await fetch('./models/xiangqi-c07e94a5c7cb.nnue');if(!r.ok)throw Error('模型下载失败：HTTP '+r.status);return new Uint8Array(await r.arrayBuffer());}});
self.onmessage=async({data})=>{try{const result=await reference.search(data.request);self.postMessage({type:'result',id:data.id,result});}catch(e){self.postMessage({type:'error',id:data.id,error:String(e.message||e)});}};
