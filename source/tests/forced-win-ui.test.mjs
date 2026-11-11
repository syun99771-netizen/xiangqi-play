import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const path='../web/thinking.mjs';
const {thinkingLimits,completedResult,statsLabel,forcedWinResult}=await import(path);
const valid=()=>({type:'result',status:'forced-win-found',terminal:false,move:'a3a4',pv:['a3a4'],score:null,
  depth:4,nodes:20638,time:201,stopped:true,stopReason:'nodes',completionReason:null,
  completedIterations:[1,2,3,4].map(depth=>({depth,cycleGuardReturns:0})),
  forcedWin:{move:'a3a4',scoreLowerBound:29995,winWithinPlies:5,searchDepth:5,nodesWhenFound:20637,
    cycleGuardReturns:0,lastCompletedDepth:4,rootIterationComplete:false,scoreBound:'lower'}});
const corruptions={
  score:r=>r.score=0,
  terminal:r=>r.terminal=true,
  stoppedType:r=>r.stopped='yes',
  completionReason:r=>r.completionReason='mate',
  negativeNodes:r=>{r.nodes=-1;r.forcedWin.nodesWhenFound=-2;},
  negativeFound:r=>r.forcedWin.nodesWhenFound=-1,
  negativeTime:r=>r.time=-1,
  external:r=>r.stopReason='external',
  iterationComplete:r=>r.forcedWin.rootIterationComplete=true,
  nonImprovedDepth:r=>r.forcedWin.searchDepth=4,
  wrongInnerMove:r=>r.forcedWin.move='c3c4',
  multiMovePV:r=>r.pv.push('b9c7'),
};
test('UI validator keeps forced result separate from completed iteration',()=>{
  const r=valid(),copy=forcedWinResult(r);assert.ok(copy);
  assert.notEqual(copy.pv,r.pv);assert.notEqual(copy.forcedWin,r.forcedWin);
  assert.equal(completedResult(r),null);
  assert.match(statsLabel(r),/强制胜着.*最多 5 半回合.*当前层未完成/);
  assert.doesNotMatch(statsLabel(r),/完成深度|0 分|第 5 层|备用着法/);
});
for(const [name,mutate] of Object.entries(corruptions))test(`UI validator rejects malformed ${name}`,()=>{
  const r=valid();mutate(r);assert.equal(forcedWinResult(r),null);
  assert.equal(completedResult(r),null);
});
function harness(mode='time'){
  const elements=new Map(),timers=new Map(),workers=[];let timerId=0;
  const element=()=>({hidden:false,value:'',textContent:'',dataset:{},children:[],setAttribute(){},removeAttribute(){},append(...x){this.children.push(...x);},replaceChildren(){this.children=[];}});
  const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
  $('side').value='1';$('mode').value=mode;$('seconds').value='3';$('depth').value='3';
  class FakeGame{constructor(){this.moves=[];this.board={turn:1,squares:new Int8Array(90),generateLegalMoves:()=>[],inCheck:()=>false};}verdict(){return{terminal:false};}request(limits){return{limits,moves:[...this.moves]};}play(move){this.moves.push(move);this.board.turn*=-1;}}
  class FakeWorker{constructor(){workers.push(this);}postMessage(x){this.request=x;}terminate(){this.terminated=true;}}
  const context=vm.createContext({document:{getElementById:$,createElement:element},Game:FakeGame,Worker:FakeWorker,
    thinkingLimits,completedResult,statsLabel,forcedWinResult,progressLabel:()=>'',chineseHistory:()=>[],readableVersion:()=>'',moveFrom:()=>0,moveTo:()=>1,
    performance:{now:()=>1000},fetch:()=>new Promise(()=>{}),setTimeout:f=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id),
    setInterval:f=>{timers.set(++timerId,f);return timerId;},clearInterval:id=>timers.delete(id)});
  let source=fs.readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');
  source=source.replace('function renderHistory(){','function renderHistory(){return;');vm.runInContext(source,context);
  return {$,workers,timers,run:s=>vm.runInContext(s,context),start:()=>{$('side').value='-1';$('side').onchange();return workers.at(-1);}};
}
for(const mode of ['time','depth','infinite'])test(`real app VM: valid result remains separate and usable in ${mode}`,()=>{
  const h=harness(mode),w=h.start(),id=w.request.id,emit=data=>w.onmessage({data:{id,...data}});
  emit({type:'model-phase',stage:'ready'});
  emit({type:'info',info:{depth:4,nodes:100,time:20,pv:['c3c4'],score:300}});
  const rows=h.$('iteration-list').children.length;
  emit({type:'result',result:valid()});
  assert.equal(h.$('iteration-list').children.length,rows,'Forced result must not append an iteration row');
  if(mode==='infinite'){assert.equal(h.run('game.moves.length'),0);h.$('stop').onclick();}
  assert.equal(h.run('game.moves.join()'),'a3a4');assert.match(h.$('stats').textContent,/当前层未完成/);
  assert.doesNotMatch(h.$('stats').textContent,/备用着法|完成深度/);assert.equal(h.timers.size,0);
});
for(const mode of ['time','depth','infinite'])test(`real app VM: malformed forced result must not auto-play or claim a completed layer in ${mode}`,()=>{
  const h=harness(mode),w=h.start(),id=w.request.id,r=valid();r.score=0;
  w.onmessage({data:{id,type:'result',result:r}});
  assert.equal(h.run('game.moves.length'),0,'Malformed forced result must fail closed');
  assert.doesNotMatch(h.$('stats').textContent,/完成深度 4/,'Rejected result cannot inherit completed-layer label');
});
test('real app VM: manual stop and restart reject late forced result',()=>{
  const h=harness('infinite'),w=h.start(),id=w.request.id;
  w.onmessage({data:{id,type:'info',info:{depth:4,nodes:100,time:20,pv:['c3c4'],score:300}}});
  h.$('stop').onclick();assert.equal(h.run('game.moves.join()'),'c3c4');
  w.onmessage({data:{id,type:'result',result:valid()}});assert.equal(h.run('game.moves.join()'),'c3c4');
  h.$('restart').onclick();w.onmessage({data:{id,type:'result',result:valid()}});assert.equal(h.run('game.moves.length'),0);
});
