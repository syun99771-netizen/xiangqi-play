// Report bytes actually received. Encoded responses may have compressed Content-Length,
// so only use an identity response's declared length as a percentage denominator.
export async function readModelResponse(response,{onProgress=()=>{},signal}={}){
 if(!response.ok)throw Error('模型下载失败：HTTP '+response.status);
 const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding');
 const n=length&&/^\d+$/.test(length)?Number(length):NaN;
 const total=(!encoding||encoding==='identity')&&Number.isSafeInteger(n)&&n>0?n:null;
 let loaded=0;const chunks=[];const aborted=()=>{if(signal?.aborted)throw new DOMException('模型下载已取消','AbortError');};
 onProgress({loaded,total});aborted();
 if(!response.body?.getReader){const bytes=new Uint8Array(await response.arrayBuffer());aborted();loaded=bytes.length;if(total!==null&&loaded!==total)throw Error('模型下载长度不完整');onProgress({loaded,total});return bytes;}
 const reader=response.body.getReader();
 try{while(true){aborted();const {done,value}=await reader.read();aborted();if(done)break;chunks.push(value);loaded+=value.byteLength;if(total!==null&&loaded>total)throw Error('模型下载长度异常');onProgress({loaded,total});}
  if(total!==null&&loaded!==total)throw Error('模型下载长度不完整');
 }catch(e){await reader.cancel().catch(()=>{});throw e;}finally{reader.releaseLock();}
 const bytes=new Uint8Array(loaded);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength;}
 onProgress({loaded,total});return bytes;
}
export function progressLabel({loaded,total}){
 const bytes=n=>n<1024?`${n} B`:n<1048576?`${(n/1024).toFixed(1)} KB`:`${(n/1048576).toFixed(2)} MB`;
 return total!==null?`${Math.min(100,Math.floor(loaded/total*100))}% · ${bytes(loaded)} / ${bytes(total)}`:`已接收 ${bytes(loaded)} · 总大小未知`;
}
