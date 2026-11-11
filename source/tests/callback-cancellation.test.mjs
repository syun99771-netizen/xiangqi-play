import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

// Regression coverage for callback-boundary cancellation.
// Mechanical tests substitute root/PV and clocks explicitly. Real-search tests
// are separately labeled. No unsupported recursive run on the SAME Search is
// asserted: nesting uses distinct instances; reuse is sequential only.
const TINY_FEN = '4k4/9/9/9/9/4P4/9/9/9/4K4 w - - 0 1';
const arms = await Promise.all(['candidate'].map(async name => {
  const base = new URL('../', import.meta.url);
  const [search, profile, sdk, api, board] = await Promise.all([
    import(new URL('engine/src/search-public-b562.js', base)),
    import(new URL('engine/experimental/cc0-portable-public-b562-v2/profile.mjs', base)),
    import(new URL('engine/src/sdk/core.js', base)),
    import(new URL('api.mjs', base)),
    import(new URL('engine/src/board.js', base)),
  ]);
  return {name, base, fixed: name === 'candidate', ...search, ...profile, sdk, api, board};
}));
const flag = () => new Int32Array(new SharedArrayBuffer(4));
const request = (id, fen = TINY_FEN) => ({requestId:id, fen, moves:[], historyComplete:true, limits:{mode:'depth', depth:1}});
const snapshot = b => ({fen:b.toFEN(), squares:[...b.squares], kings:[...b.kings], turn:b.turn, hashLo:b.hashLo, hashHi:b.hashHi});
const receipt = () => {};
function prepared(arm) {
  const p = arm.sdk.preparePosition(arm.api.preflight(request('focused-direct')).request);
  assert.equal(p.context.adjudication.terminal, false, 'tiny declared origin must be nonterminal');
  return p;
}
function runArgs(p, extra = {}) {
  return {depth:1, movetime:Infinity, gameHistory:p.judge.states, historyComplete:true, historyOriginFEN:p.origin, ...extra};
}
function assertRestored(s, p, before, historyBefore) {
  assert.deepEqual(snapshot(p.board), before);
  assert.deepEqual(p.judge.states, historyBefore);
  for (const key of ['publicPathMoves','pathLow','pathHigh','pathStates']) assert.deepEqual(s[key], [], key);
  assert.equal(s.publicClockIndex, 0);
  assert.equal(s.nullDepth, 0);
  const counts = new Int16Array(16);
  for (const piece of p.board.squares) if (piece) counts[(piece>0?0:8)+Math.abs(piece)]++;
  assert.deepEqual(s.directMaterialCounts, counts);
}
function assertCompletedLayer(result, info) {
  assert.equal(result.depth, info.depth);
  assert.equal(result.score, info.score);
  assert.equal(result.move, info.pv[0]);
  assert.deepEqual(result.pv, info.pv);
  assert.equal(result.nodes, info.nodes);
  assert.equal(result.completedIterationCycleGuardReturns, info.completedIterationCycleGuardReturns);
  assert.equal(result.totalCycleGuardReturns, info.totalCycleGuardReturns);
  assert.equal(result.abortedIterationCycleGuardReturns, 0);
  assert.deepEqual(result.completedIterations, [{depth:info.depth, cycleGuardReturns:info.completedIterationCycleGuardReturns}]);
}
function assertCancellation(arm, result, baselineCompletion) {
  assert.equal(result.stopped, arm.fixed);
  assert.equal(result.stopReason, arm.fixed ? 'external' : null);
  assert.equal(result.completionReason, arm.fixed ? null : baselineCompletion);
}
function mechanical(arm, {score = 123, clock = () => 0} = {}) {
  const p = prepared(arm);
  class MechanicalSearch extends arm.Search {
    roots = [];
    root(depth, preferred) {
      this.roots.push(depth);
      this.tick();
      this.totalCycleGuardReturns += depth;
      return {move:preferred, score};
    }
    principalVariation(first) { return first === null ? [] : [first]; }
  }
  const s = new MechanicalSearch({...arm.BENCHMARK_SEARCH_OPTIONS, evaluator:()=>0, clock});
  return {s, p};
}

for (const arm of arms) {
  for (const scenario of [
    {name:'final-depth', score:123, completion:'depth', cancel:1},
    {name:'positive-mate', score:arm.MATE-1, completion:'mate', cancel:1},
    {name:'negative-mate', score:-arm.MATE+1, completion:'mate', cancel:1},
    {name:'nonzero-negative-flag', score:123, completion:'depth', cancel:-7},
  ]) test(`${arm.name}: mechanical ${scenario.name} callback cancellation`, () => {
    const {s,p} = mechanical(arm, scenario), stopFlag = flag(), infos = [];
    const before=snapshot(p.board), historyBefore=structuredClone(p.judge.states);
    const result=s.run(p.board, runArgs(p, {stopFlag, onInfo:info=>{
      infos.push(structuredClone(info)); Atomics.store(stopFlag,0,scenario.cancel);
    }}));
    assert.equal(infos.length,1); assert.deepEqual(s.roots,[1]);
    assertCancellation(arm,result,scenario.completion);
    assertCompletedLayer(result,infos[0]); assertRestored(s,p,before,historyBefore);
    receipt(arm,`mechanical-${scenario.name}`,result,{roots:s.roots, infos});
  });

  test(`${arm.name}: mechanical callback cancellation wins simultaneous clock expiry`, () => {
    let now=0;
    const {s,p}=mechanical(arm,{clock:()=>now}), stopFlag=flag(), infos=[];
    const result=s.run(p.board,runArgs(p,{movetime:10,stopFlag,onInfo:info=>{
      infos.push(structuredClone(info)); now=10; Atomics.store(stopFlag,0,1);
    }}));
    assertCancellation(arm,result,'time-after-iteration');
    assertCompletedLayer(result,infos[0]); assert.equal(result.time,10); assert.deepEqual(s.roots,[1]);
    receipt(arm,'mechanical-simultaneous-clock-expiry',result,{roots:s.roots,infos});
  });

  test(`${arm.name}: mechanical intermediate callback stops before another root/node`, () => {
    const {s,p}=mechanical(arm), stopFlag=flag(), infos=[];
    const result=s.run(p.board,runArgs(p,{depth:3,stopFlag,onInfo:info=>{
      infos.push(structuredClone(info)); Atomics.store(stopFlag,0,1);
    }}));
    assertCancellation(arm,result,'depth');
    assert.deepEqual(s.roots,arm.fixed?[1]:[1,2,3]);
    assert.deepEqual(infos.map(x=>x.depth),arm.fixed?[1]:[1,2,3]);
    assert.equal(result.nodes,arm.fixed?1:3); assert.equal(result.depth,arm.fixed?1:3);
    if(arm.fixed) assertCompletedLayer(result,infos[0]);
    receipt(arm,'mechanical-intermediate-layer',result,{roots:s.roots,infos});
  });

  test(`${arm.name}: mechanical absent/zero/cleared flag retain ordinary completion`, () => {
    const results=[];
    for(const mode of ['absent','zero','set-then-clear']) {
      const {s,p}=mechanical(arm), stopFlag=mode==='absent'?undefined:flag();
      const result=s.run(p.board,runArgs(p,{depth:3,stopFlag,onInfo:()=>{
        if(mode==='set-then-clear'){Atomics.store(stopFlag,0,1);Atomics.store(stopFlag,0,0);}
      }}));
      assert.equal(result.stopped,false);assert.equal(result.stopReason,null);assert.equal(result.completionReason,'depth');
      assert.deepEqual(s.roots,[1,2,3]); results.push(result);
    }
    assert.deepEqual(results[1],results[0]);assert.deepEqual(results[2],results[0]);
  });

  test(`${arm.name}: mechanical existing mid-root tick cancellation retains prior layer and unwinds`, () => {
    const p=prepared(arm), stopFlag=flag(), infos=[], roots=[];
    const before=snapshot(p.board), historyBefore=structuredClone(p.judge.states);
    class MidLayerSearch extends arm.Search {
      root(depth,preferred) {
        roots.push(depth);
        if(depth===1){for(let i=0;i<30;i++)this.tick();return {move:preferred,score:123};}
        this.pushPath();this.pushCheckState(this.board.inCheck());
        const undo=this.makeSearchMove(preferred);
        try{this.tick();Atomics.store(stopFlag,0,1);this.tick();assert.fail('tick must throw at node 32');}
        finally{this.unmakeSearchMove(undo);this.popPath();this.pathStates.pop();}
      }
      principalVariation(first){return [first];}
    }
    const s=new MidLayerSearch({...arm.BENCHMARK_SEARCH_OPTIONS,evaluator:()=>0,clock:()=>0});
    const result=s.run(p.board,runArgs(p,{depth:3,stopFlag,onInfo:info=>infos.push(structuredClone(info))}));
    assert.equal(result.stopped,true);assert.equal(result.stopReason,'external');assert.equal(result.completionReason,null);
    assert.deepEqual(roots,[1,2]);assert.equal(result.nodes,32);assert.equal(result.depth,1);assert.equal(infos.length,1);
    assert.equal(result.move,infos[0].pv[0]);assert.equal(result.score,infos[0].score);assert.deepEqual(result.pv,infos[0].pv);
    assert.deepEqual(result.completedIterations,[{depth:1,cycleGuardReturns:0}]);assertRestored(s,p,before,historyBefore);
    receipt(arm,'mechanical-existing-mid-root-stop',result,{roots,infos});
  });

  test(`${arm.name}: real tiny Search callback throw propagates and sequential reuse resets`, () => {
    const p=prepared(arm), stopFlag=flag(), sentinel=new Error('focused onInfo sentinel');
    const s=new arm.Search({...arm.BENCHMARK_SEARCH_OPTIONS,evaluator:()=>0,clock:()=>0});
    const before=snapshot(p.board),historyBefore=structuredClone(p.judge.states), infos=[];
    assert.throws(()=>s.run(p.board,runArgs(p,{stopFlag,onInfo:info=>{
      infos.push(structuredClone(info));Atomics.store(stopFlag,0,1);throw sentinel;
    }})),error=>error===sentinel);
    assert.equal(infos.length,1);assertRestored(s,p,before,historyBefore);
    Atomics.store(stopFlag,0,0);
    const clean=s.run(p.board,runArgs(p,{stopFlag}));
    assert.equal(clean.depth,1);assert.equal(clean.stopped,false);assert.equal(clean.stopReason,null);assert.equal(clean.completionReason,'depth');
    assert.equal(clean.score,infos[0].score);assert.deepEqual(clean.pv,infos[0].pv);assert.equal(clean.nodes,infos[0].nodes);
    assertRestored(s,p,before,historyBefore);
    const cancelled=s.run(p.board,runArgs(p,{stopFlag,onInfo:()=>Atomics.store(stopFlag,0,1)}));
    assertCancellation(arm,cancelled,'depth');assertRestored(s,p,before,historyBefore);
    Atomics.store(stopFlag,0,0);
    const resumed=s.run(p.board,runArgs(p,{stopFlag}));
    assert.equal(resumed.stopped,false);assert.equal(resumed.stopReason,null);assert.equal(resumed.completionReason,'depth');
    assert.equal(resumed.score,clean.score);assert.deepEqual(resumed.pv,clean.pv);assert.equal(resumed.nodes,clean.nodes);
    assertRestored(s,p,before,historyBefore);
    receipt(arm,'real-tiny-throw-sequential-reuse',resumed,{thrownIdentityPreserved:true,boardAndHistoryRestored:true});
  });
}

test('real official SDK/model: final-depth callback cancellation and independent nested request', async () => {
  const all=[];
  for(const arm of arms) {
    const bytes=await fs.readFile(process.env.XIANGQI_MODEL_PATH || new URL('models/xiangqi-c07e94a5c7cb.nnue',arm.base));
    const model=await arm.api.loadPinnedModel(bytes);
    assert.equal(model.modelSha256,arm.api.MODEL_SHA256);
    const outerFlag=flag(),innerFlag=flag(),outerInfos=[],innerInfos=[];
    let inner;
    // This entire path is the unchanged official facade/model/profile; no clock,
    // evaluator, method, prototype or module monkeypatch is installed.
    const outer=arm.api.searchWithModel(request(`focused-${arm.name}-outer`),{model,stopFlag:outerFlag,onInfo:info=>{
      outerInfos.push(structuredClone(info));
      inner=arm.api.searchWithModel(request(`focused-${arm.name}-inner`),{model,stopFlag:innerFlag,onInfo:child=>innerInfos.push(structuredClone(child))});
      assert.equal(Atomics.load(innerFlag,0),0);assert.equal(Atomics.load(outerFlag,0),0);
      Atomics.store(outerFlag,0,1);
    }});
    assert.equal(outerInfos.length,1);assert.equal(innerInfos.length,1);
    assert.equal(outer.terminal,false);assert.equal(inner.terminal,false);
    assert.equal(outer.referenceModel.verified,true);assert.equal(inner.referenceModel.verified,true);
    assert.equal(inner.depth,1);assert.equal(inner.stopped,false);assert.equal(inner.stopReason,null);assert.equal(inner.completionReason,'depth');
    assertCancellation(arm,outer,'depth');assertCompletedLayer(outer,outerInfos[0]);
    assert.equal(outer.depth,1);assert.ok(outer.nodes>0&&outer.nodes<32,'tiny depth-1 search stays below ordinary tick poll cadence');
    for(const key of ['move','score','pv','depth','nodes','completedIterations'])assert.deepEqual(outer[key],inner[key],key);
    const replay=new arm.board.Board(TINY_FEN);
    for(const text of outer.pv){const move=arm.board.uciToMove(text);assert.ok(replay.generateLegalMoves().includes(move));replay.makeMove(move);}
    assert.equal(outer.status,'completed-iteration');assert.equal(Atomics.load(innerFlag,0),0);
    receipt(arm,'real-official-sdk-model-final-depth-nested',outer,{inner,outerInfos,innerInfos,modelSha256:model.modelSha256,noMonkeypatch:true});
    all.push(outer);
  }
});
