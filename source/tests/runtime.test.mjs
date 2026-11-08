import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {createReference,START_FEN,preflight} from '../api.mjs';
import {createNodeClient} from '../node-client.mjs';

const modelPath = process.env.XIANGQI_MODEL_PATH || fileURLToPath(new URL('../models/xiangqi-c07e94a5c7cb.nnue',import.meta.url));
const request = limits => ({requestId:'runtime',fen:START_FEN,moves:[],historyComplete:true,limits});

test('real public searches honor adjustable node/time/depth requests with one private lazy model', async () => {
  let reads=0;
  const ref=createReference({readModelBytes:()=>{reads++; return fs.readFile(modelPath);}});
  try {
    for (const limits of [{nodes:1,depth:32},{nodes:32,depth:2},{nodes:256,depth:2},{movetime:1},{movetime:25},{nodes:1,movetime:60000,depth:32}]) {
      const r=await ref.search(request(limits));
      assert.equal(r.terminal,false);
      assert.equal(r.referenceModel.verified,true);
      assert.match(r.move,/^[a-i][0-9][a-i][0-9]$/);
      preflight({...request({nodes:1}),moves:[r.move]});
      if (limits.nodes) assert(r.nodes<=limits.nodes);
      if (limits.depth) assert(r.depth<=limits.depth);
      if (limits.movetime && !limits.nodes) assert(r.stopReason==='time'||r.completionReason==='time-after-iteration');
      assert.equal(r.timeBasis,'wall-ms');
      assert.equal(r.status,r.depth>0?'completed-iteration':'budget-exhausted');
    }
    assert.equal(reads,1);
  } finally {ref.dispose();}
});

test('Node client explicit local modelPath runs a real nonterminal request', async () => {
  assert.throws(()=>createNodeClient({modelPath:''}),/modelPath/);
  assert.throws(()=>createNodeClient({modelPath:123}),/modelPath/);
  const client=createNodeClient({modelPath});
  try {
    const r=await client.search(request({nodes:128,depth:1}),{timeoutMs:30000});
    assert.equal(r.referenceModel.verified,true);
    assert.match(r.move,/^[a-i][0-9][a-i][0-9]$/);
  } finally {await client.close();}
});

test('external watchdog terminates an unresponsive worker and closes that client', async () => {
  const source="import {parentPort} from 'node:worker_threads'; parentPort.on('message',()=>{while(true){}}); parentPort.postMessage({type:'ready'});";
  const client=createNodeClient({workerURL:new URL('data:text/javascript,'+encodeURIComponent(source))});
  try {
    await client.ready;
    await assert.rejects(client.search(request({nodes:1}),{timeoutMs:25}),/Whole request timeout/);
    await client.close();
    await assert.rejects(client.search(request({nodes:1})),/closed/);
  } finally {await client.close();}
});

test('real Node search whole-request watchdog includes lazy model loading', async () => {
  const client=createNodeClient({modelPath});
  try {
    await client.ready;
    await assert.rejects(client.search(request({nodes:10000000,movetime:60000,depth:32}),{timeoutMs:1}),/Whole request timeout/);
    await client.close();
    await assert.rejects(client.search(request({nodes:1})),/closed/);
  } finally {await client.close();}
});

test('shared flag stops a real Node search or cancels before Search starts', async () => {
  const client=createNodeClient({modelPath});
  try {
    await client.ready;
    const pending=client.search(request({nodes:10000000,movetime:60000,depth:32}),{timeoutMs:30000});
    const stopped=pending.then(r=>assert.equal(r.stopReason,'external'),e=>assert.match(e.message,/cancelled before Search/));
    await new Promise(r=>setTimeout(r,10));
    client.requestCooperativeStop();
    await stopped;
  } finally {await client.close();}
});
