import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {loadPinnedModel,searchWithModel,MODEL_SHA256} from '../api.mjs';
import {forcedWinResult,completedResult,statsLabel} from '../web/thinking.mjs';
import {createNodeClient} from '../node-client.mjs';
test('real authenticated public API: node-limited anchor reports forced subtree without fake layer',async t=>{
  // Public-domain composed position xq_shi_qing_ya_qu_065, XiangqiBench pinned blob71cd092a57b3184cdbfb526484c804253af75745.
  const anchor={fen:'1rbak3r/1N1Ra4/cR2b1N2/9/9/9/9/9/5p3/4K4 w - - 0 1'};
  try{await fs.access(new URL('../models/xiangqi-c07e94a5c7cb.nnue',import.meta.url));}catch(e){if(e.code==='ENOENT'){t.skip('External pinned C07 model absent; no replacement model permitted');return;}throw e;}
  const bytes=await fs.readFile(new URL('../models/xiangqi-c07e94a5c7cb.nnue',import.meta.url));
  const model=await loadPinnedModel(bytes);assert.equal(model.modelSha256,MODEL_SHA256);
  const infos=[];
  const r=searchWithModel({requestId:'review-real-forced-win',fen:anchor.fen,moves:[],historyComplete:true,
    limits:{nodes:20638,movetime:60000,depth:16}},{model,onInfo:i=>infos.push(structuredClone(i))});
  assert.equal(r.status,'forced-win-found');assert.equal(r.terminal,false);assert.equal(r.score,null);
  assert.equal(r.move,'d8d9');assert.deepEqual(r.pv,['d8d9']);assert.equal(r.forcedWin.move,r.move);
  assert.equal(r.depth,4);assert.equal(r.forcedWin.searchDepth,5);assert.equal(r.forcedWin.lastCompletedDepth,4);
  assert.equal(r.forcedWin.scoreLowerBound,29995);assert.equal(r.forcedWin.winWithinPlies,5);
  assert.equal(r.forcedWin.nodesWhenFound,20637);assert.equal(r.nodes,20638);assert.equal(r.stopReason,'nodes');
  assert.equal(r.forcedWin.rootIterationComplete,false);assert.equal(r.completionReason,null);
  assert.deepEqual(infos.map(x=>x.depth),[1,2,3,4]);assert.ok(infos.every(x=>!x.forcedWin));
  assert.equal(infos.at(-1).pv[0],'e0d0');assert.equal(infos.at(-1).score,-430);
  assert.deepEqual(r.completedIterations.map(x=>x.depth),[1,2,3,4]);
  assert.ok(forcedWinResult(r));assert.equal(completedResult(r),null);assert.match(statsLabel(r),/当前层未完成/);
  t.diagnostic(JSON.stringify({status:r.status,move:r.move,score:r.score,depth:r.depth,nodes:r.nodes,forcedWin:r.forcedWin,infoDepths:infos.map(x=>x.depth)}));
});

test('real Node worker/client preserve forced-win status and nested UCI metadata',async t=>{
  // Public-domain composed position xq_shi_qing_ya_qu_065, XiangqiBench pinned blob71cd092a57b3184cdbfb526484c804253af75745.
  const anchor={fen:'1rbak3r/1N1Ra4/cR2b1N2/9/9/9/9/9/5p3/4K4 w - - 0 1'};
  try{await fs.access(new URL('../models/xiangqi-c07e94a5c7cb.nnue',import.meta.url));}catch(e){if(e.code==='ENOENT'){t.skip('External pinned C07 model absent; no replacement model permitted');return;}throw e;}
  const client=createNodeClient();
  try{
    await client.ready;
    const r=await client.search({requestId:'review-worker-forced-win',fen:anchor.fen,moves:[],historyComplete:true,
      limits:{nodes:20638,movetime:60000,depth:16}},{timeoutMs:30000});
    assert.equal(r.status,'forced-win-found');assert.equal(r.move,'d8d9');assert.equal(r.forcedWin.move,'d8d9');
    assert.equal(r.score,null);assert.equal(r.depth,4);assert.equal(r.forcedWin.searchDepth,5);
    assert.equal(r.nodes,20638);assert.ok(forcedWinResult(r));assert.equal(completedResult(r),null);
  }finally{await client.close();}
});
