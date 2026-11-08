// Node-host protocol shim only. This does not exercise an actual browser Worker.
import test from 'node:test';
import assert from 'node:assert/strict';
import {START_FEN} from '../api.mjs';

test('browser-worker protocol shim: terminal, bad model, busy rejection and recovery', async () => {
  const previous=Object.getOwnPropertyDescriptor(globalThis,'self');
  const replies=[];
  const self={postMessage:reply=>replies.push(reply)};
  Object.defineProperty(globalThis,'self',{configurable:true,writable:true,value:self});
  try {
    await import('../worker-demo.mjs');
    const request=fen=>({requestId:'protocol',fen,moves:[],historyComplete:true,limits:{nodes:1}});
    const terminal=request('3a5/3k5/5a3/9/9/9/9/3A1K3/9/5A3 w - - 119 1');
    await self.onmessage({data:{id:'terminal',request:terminal}});
    assert.equal(replies[0].id,'terminal');
    assert.equal(replies[0].ok,true);
    assert.equal(replies[0].result.terminal,true);
    assert.equal(replies[0].result.referenceModel,null);
    const pending=self.onmessage({data:{id:'bad-model',request:request(START_FEN),modelBytes:new Uint8Array([1,2,3])}});
    await self.onmessage({data:{id:'concurrent',request:terminal}});
    await pending;
    const busy=replies.find(x=>x.id==='concurrent'),bad=replies.find(x=>x.id==='bad-model');
    assert.equal(busy.ok,false);assert.match(busy.error,/Busy/);
    assert.equal(bad.ok,false);assert.match(bad.error,/SHA256 mismatch/);
    await self.onmessage({data:{id:'recovered',request:terminal}});
    const recovered=replies.find(x=>x.id==='recovered');
    assert.equal(recovered.ok,true);assert.equal(recovered.result.terminal,true);
  } finally {
    if(previous)Object.defineProperty(globalThis,'self',previous);
    else delete globalThis.self;
  }
});
