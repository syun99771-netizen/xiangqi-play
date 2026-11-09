import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {thinkingLimits,completedResult,statsLabel} from '../web/thinking.mjs';
test('UI budgets are exclusive and validated',()=>{
 assert.deepEqual(thinkingLimits('time','3','6'),{mode:'time',movetime:3000,depth:32});assert.deepEqual(thinkingLimits('depth','bad','6'),{mode:'depth',depth:6});assert.deepEqual(thinkingLimits('infinite','bad','bad'),{mode:'infinite'});
 for(const [m,s,d] of [['time',0,6],['time',61,6],['depth',3,1.2],['depth',3,33],['other',3,6]])assert.throws(()=>thinkingLimits(m,s,d));
 assert.equal(completedResult({depth:0,pv:['a3a4'],time:0,nodes:0}),null);assert.equal(completedResult({depth:1,pv:[],time:1,nodes:1}),null);
 assert.match(statsLabel(null,1000),/完成深度 0.*1.0 秒/);
});
const notationSource=fs.readFileSync(new URL('../web/notation.mjs',import.meta.url),'utf8').replace("'./engine/src/board.js'",JSON.stringify(new URL('../engine/src/board.js',import.meta.url).href));
const {chineseHistory}=await import('data:text/javascript;base64,'+Buffer.from(notationSource).toString('base64'));
function harness(){
 const elements=new Map(),timers=new Map(),workers=[];let timerId=0;
 const element=()=>({hidden:false,value:'',textContent:'',dataset:{},children:[],setAttribute(){},removeAttribute(){},append(...x){this.children.push(...x);},replaceChildren(){this.children=[];}});
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};$('side').value='1';$('mode').value='infinite';$('seconds').value='3';$('depth').value='3';
 class FakeGame{constructor(){this.moves=[];this.board={turn:1,squares:new Int8Array(90),generateLegalMoves:()=>[],inCheck:()=>false};}verdict(){return{terminal:false};}request(limits){return{limits,moves:[...this.moves]};}play(move){this.moves.push(move);this.board.turn*=-1;}}
 class FakeWorker{constructor(){workers.push(this);}postMessage(x){this.request=x;}terminate(){this.terminated=true;}}
 const context=vm.createContext({document:{getElementById:$,createElement:element},Game:FakeGame,Worker:FakeWorker,thinkingLimits,completedResult,statsLabel,progressLabel:()=>'',chineseHistory,readableVersion:()=>'',moveFrom:()=>0,moveTo:()=>1,performance:{now:()=>1000},fetch:()=>new Promise(()=>{}),setTimeout:f=>{timers.set(++timerId,f);return timerId;},clearTimeout:id=>timers.delete(id),setInterval:f=>{timers.set(++timerId,f);return timerId;},clearInterval:id=>timers.delete(id)});
 // Keep real app state transitions and callbacks; only render DOM is stubbed.
 let source=fs.readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8').replace(/^import .*;\n/gm,'');source=source.replace('function renderHistory(){','function renderHistory(){return;');vm.runInContext(source,context);
 return {$,workers,timers,run:s=>vm.runInContext(s,context),start:()=>{$('side').value='-1';$('side').onchange();return workers.at(-1);}};
}
test('stop chooses deepest completed layer, terminates work, never accepts stale result',()=>{
 const h=harness(),w=h.start(),id=w.request.id;
 const emit=data=>w.onmessage({data:{id,...data}});
 emit({type:'model-phase',stage:'ready'});emit({type:'info',info:{depth:1,nodes:100,time:20,pv:['a3a4']}});emit({type:'info',info:{depth:2,nodes:200,time:40,pv:['c3c4']}});emit({type:'info',info:{depth:1,nodes:100,time:20,pv:['a3a4']}});
 assert.equal(h.$('iteration-list').children.length,2);assert.match(h.$('iteration-list').children[0].children[0].textContent,/第 1 层/);assert.match(h.$('iteration-list').children[1].children[0].textContent,/第 2 层/);h.$('stop').onclick();assert.equal(h.$('iteration-list').children.length,2);assert.equal(w.terminated,true);assert.equal(h.run('game.moves.join()'),'c3c4');assert.equal(h.$('stop').hidden,true);assert.equal(h.timers.size,0);
 emit({type:'result',result:{move:'e3e4',depth:3,nodes:1000,time:100}});assert.equal(h.run('game.moves.join()'),'c3c4');h.$('stop').onclick();assert.equal(h.run('game.moves.length'),1);
});
test('stop before first iteration or while loading makes no move; retry and restart isolate generations',()=>{
 const h=harness(),w=h.start();h.$('stop').onclick();assert.equal(h.run('game.moves.length'),0);assert.equal(h.$('retry').hidden,false);assert.match(h.$('status').textContent,/尚未完成第一层/);
 h.$('retry').onclick();const next=h.workers.at(-1);assert.notEqual(next,w);h.$('side').value='1';h.$('restart').onclick();assert.equal(next.terminated,true);next.onmessage({data:{id:next.request.id,type:'result',result:{move:'a3a4',depth:1,nodes:1,time:1}}});assert.equal(h.run('game.moves.length'),0);assert.equal(h.$('iteration-list').children.length,0);assert.equal(h.$('iterations').hidden,true);assert.equal(h.timers.size,0);
});
test('search timers never impose time caps on depth/infinite, time mode remains bounded and worker reused',()=>{
 for(const mode of ['depth','infinite','time']){const h=harness();h.$('mode').value=mode;const w=h.start(),id=w.request.id;assert.equal(h.timers.size,1);w.onmessage({data:{id,type:'model-phase',stage:'ready'}});assert.equal(h.timers.size,mode==='time'?2:1);w.onmessage({data:{id,type:'result',result:{move:'a3a4',pv:['a3a4'],depth:2,nodes:100,time:20}}});assert.equal(h.timers.size,0);if(mode==='infinite'){assert.equal(h.run('game.moves.length'),0);h.$('stop').onclick();}assert.equal(h.run('game.moves.join()'),'a3a4');}
});

test('per-layer principal variations use legal Chinese notation and original side/history',()=>{
 const h=harness();h.run("game.play('h2e2');advance()");const w=h.workers.at(-1),id=w.request.id;
 w.onmessage({data:{id,type:'info',info:{depth:2,nodes:200,time:40,pv:['h9g7','h0g2']}}});
 assert.equal(h.$('iteration-list').children[0].children[1].textContent,'黑：马8进7　红：马二进三');
 h.$('stop').onclick();assert.equal(h.run('game.moves.join()'),'h2e2,h9g7');
 h.$('restart').onclick();assert.equal(h.$('iteration-list').children.length,0);assert.equal(h.$('iterations').hidden,true);
});
