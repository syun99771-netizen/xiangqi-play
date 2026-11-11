import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {Board,moveFrom,moveTo} from '../engine/src/board.js';
import {Search as PublicSearch} from '../engine/src/search-public-b562.js';
import {Search as LegacySearch} from '../engine/src/search.js';
import {thinkingLimits,completedResult,statsLabel} from '../web/thinking.mjs';
import {progressLabel} from '../web/model-download.mjs';
import {readableVersion} from '../web/version.mjs';

// No engine/model worker is instantiated. Fail immediately if a Search is attempted.
let searchCalls=0;
for(const Search of [PublicSearch,LegacySearch])Search.prototype.run=function(){searchCalls++;throw Error('Search forbidden in UI-only tests');};
const copy=x=>JSON.parse(JSON.stringify(x));
async function webModule(name){
 let source=fs.readFileSync(new URL('../web/'+name,import.meta.url),'utf8');
 source=source.replace("'./engine/src/board.js'",JSON.stringify(new URL('../engine/src/board.js',import.meta.url).href));
 source=source.replace("'./api.mjs'",JSON.stringify(new URL('../api.mjs',import.meta.url).href));
 return import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
}
const {Game}=await webModule('game.mjs');
const {chineseHistory}=await webModule('notation.mjs');
const candidateSource=fs.readFileSync(new URL('../web/app.mjs',import.meta.url),'utf8');
const originalSource="import {thinkingLimits,completedResult,statsLabel} from './thinking.mjs';\nimport {Game} from './game.mjs';\nimport {progressLabel} from './model-download.mjs';\nimport {chineseHistory} from './notation.mjs';\nimport {readableVersion} from './version.mjs';\nimport {moveFrom,moveTo} from './engine/src/board.js';\nconst $=id=>document.getElementById(id),names={1:'兵',2:'仕',3:'相',4:'马',5:'炮',6:'车',7:'帅','-1':'卒','-2':'士','-3':'象','-4':'马','-5':'砲','-6':'车','-7':'将'};\nlet game,selected=null,worker=null,busy=false,last=null,generation=0,watchdog,statsTimer,searchStarted=null,latest=null;\nconst player=()=>Number($('side').value),squareName=s=>String.fromCharCode(97+s%9)+(9-Math.floor(s/9));\nfunction status(s){$('status').textContent=s;}\nfunction resetLoading(){$('model-loading').hidden=true;$('model-progress').removeAttribute('value');$('model-bytes').textContent='';$('model-stage').textContent='';}\nfunction stop(){resetLoading();generation++;worker?.terminate();worker=null;busy=false;clearTimeout(watchdog);clearInterval(statsTimer);$('stop').hidden=true;searchStarted=null;}\nfunction render(){const legal=selected===null?[]:game.board.generateLegalMoves().filter(m=>moveFrom(m)===selected).map(moveTo);$('board').replaceChildren();for(let i=0;i<90;i++){const s=player()===1?i:89-i,p=game.board.squares[s],b=document.createElement('button');b.className='square'+(p>0?' red':'')+(selected===s?' selected':'')+(legal.includes(s)?' target':'')+(last?.includes(s)?' last':'');b.setAttribute('aria-label',squareName(s)+(p?' '+(p>0?'红':'黑')+names[p]:' 空位'));b.dataset.square=s;b.setAttribute('aria-pressed',String(selected===s));b.onclick=()=>click(s);if(p){const el=document.createElement('span');el.className='piece';el.textContent=names[p];b.append(el);}$('board').append(b);}renderHistory();}\nfunction renderHistory(){\n const host=$('moves');host.replaceChildren();\n if(!game.moves.length){host.textContent='尚未落子';return;}\n const table=document.createElement('table');table.className='scoresheet';table.setAttribute('aria-label','中文棋谱');\n const head=table.createTHead().insertRow();for(const text of ['回合','红方','黑方']){const th=document.createElement('th');th.scope='col';th.textContent=text;head.append(th);}\n const body=table.createTBody();let number=null,tr;\n for(const entry of chineseHistory(game.moves)){if(entry.number!==number){number=entry.number;tr=body.insertRow();tr.insertCell().textContent=String(number);tr.insertCell();tr.insertCell();}tr.cells[entry.side===1?1:2].textContent=entry.text;}\n host.append(table);\n}\nfunction resetIterations(){$('iteration-list').replaceChildren();$('iterations').hidden=true;}\nfunction renderIteration(info){\n const row=document.createElement('li'),heading=document.createElement('strong'),line=document.createElement('p'),meta=document.createElement('small');\n heading.textContent=`第 ${info.depth} 层`;\n try{const entries=chineseHistory([...game.moves,...info.pv]).slice(game.moves.length);line.textContent=entries.map(e=>`${e.side===1?'红':'黑'}：${e.text}`).join('　');}catch{line.textContent='走法暂无法显示';}\n meta.textContent=`${Math.round(info.time)} ms · ${info.nodes.toLocaleString()} 节点`;\n row.append(heading,line,meta);$('iteration-list').append(row);$('iterations').hidden=false;\n}\nfunction terminal(){const a=game.verdict();if(!a.terminal)return false;status((a.winner===0?'和棋':a.winner===1?'红方胜':'黑方胜')+' · '+a.reason);return true;}\nfunction click(s){if(busy||game.board.turn!==player()||terminal())return;const p=game.board.squares[s];if(p*player()>0){selected=selected===s?null:s;render();return;}if(selected===null)return;const m=selected*90+s;if(!game.board.isLegalMove(m)){status('这里不能落子，请选择标记的合法落点。');return;}game.play(m);last=[selected,s];selected=null;render();advance();}\nfunction fail(message){stop();status('引擎暂不可用：'+message);$('retry').hidden=false;}\nfunction finish(result){\n clearTimeout(watchdog);clearInterval(statsTimer);busy=false;$('stop').hidden=true;resetLoading();\n try{\n  if(!result.move){if(!terminal()){status('尚无完整搜索结果，未落子。请继续思考或重新开始。');$('retry').hidden=false;}return;}\n  const from=(9-Number(result.move[1]))*9+result.move.charCodeAt(0)-97,to=(9-Number(result.move[3]))*9+result.move.charCodeAt(2)-97;\n  game.play(result.move);last=[from,to];$('stats').textContent=statsLabel(result,result.stoppedElapsed??null)+(result.depth===0?' · 时间不足，使用合法备用着法':'');\n  render();if(!terminal())status('轮到你了'+(game.board.inCheck()?' · 正在被将军':''));\n }catch(e){fail(e.message);}\n}\nfunction stopAndPlay(){\n if(!busy)return;\n const result=latest?{...latest,stoppedElapsed:searchStarted===null?latest.time:performance.now()-searchStarted}:null;stop();\n if(result)finish(result);\n else{status('已停止，尚未完成第一层，未落子。可重试引擎。');$('retry').hidden=false;}\n}\nfunction advance(){\n if(busy||terminal())return;\n if(game.board.turn===player()){status('轮到你了 · '+(game.board.inCheck()?'正在被将军':'请选择棋子'));return;}\n let limits;try{limits=thinkingLimits($('mode').value,$('seconds').value,$('depth').value);}catch(e){fail(e.message);return;}\n resetIterations();busy=true;latest=null;searchStarted=null;$('stats').textContent='等待搜索开始…';status('引擎正在思考…');$('retry').hidden=true;$('stop').hidden=false;\n const id=++generation;\n if(!worker)worker=new Worker('./engine-worker.mjs',{type:'module'});worker.onerror=e=>{if(id===generation)fail(e.message||'Worker 加载失败');};\n const searchReady=()=>{\n  resetLoading();status('引擎正在思考…');clearTimeout(watchdog);searchStarted=performance.now();\n  const update=()=>{$('stats').textContent=statsLabel(latest,performance.now()-searchStarted);};update();clearInterval(statsTimer);statsTimer=setInterval(update,200);\n  if(limits.mode==='time')watchdog=setTimeout(()=>fail('搜索超时，请重试'),limits.movetime+30000);\n };\n worker.onmessage=({data})=>{\n  if(id!==generation)return;if(data.id!==id)return;if(data.type==='model-phase'){\n   if(data.stage==='ready')searchReady();\n   else{$('model-loading').hidden=false;$('model-progress').removeAttribute('value');const labels={download:'正在下载模型',verify:'下载完成，正在校验模型…',parse:'校验通过，正在解析模型…'};$('model-stage').textContent=labels[data.stage]||'正在准备模型…';status('正在准备引擎…');if(data.stage!=='download')$('model-bytes').textContent='';}return;\n  }\n  if(data.type==='model-progress'){$('model-loading').hidden=false;const p=$('model-progress');if(data.total===null){p.removeAttribute('value');}else{p.max=data.total;p.value=data.loaded;}$('model-bytes').textContent=progressLabel(data);return;}\n  if(data.type==='info'){const snapshot=completedResult(data.info);if(snapshot&&(!latest||snapshot.depth>latest.depth)){latest=snapshot;if(limits.mode==='infinite')renderIteration(snapshot);$('stats').textContent=statsLabel(latest,searchStarted===null?latest.time:performance.now()-searchStarted);}return;}\n  if(data.type==='error'){fail(data.error);return;}\n  if(data.type==='result'){\n   const r=data.result;\n   if(limits.mode==='infinite'&&r.move){clearTimeout(watchdog);clearInterval(statsTimer);resetLoading();latest=completedResult(r);$('stats').textContent=statsLabel(r);status(latest?'搜索已结束，点击“停止并走棋”采用结果。':'搜索已停止，尚无完整层结果；可停止后重试。');return;}\n   finish(limits.mode!=='time'&&r.depth===0?{...r,move:null}:r);\n  }\n };\n watchdog=setTimeout(()=>fail('模型加载超时，请重试'),120000);\n worker.postMessage({id,request:game.request(limits)});\n}\nfunction settings(){\n const mode=$('mode').value;$('time-setting').hidden=mode!=='time';$('depth-setting').hidden=mode!=='depth';\n $('mode-help').textContent=(mode==='time'?'0.1–60 秒。':mode==='depth'?'1–32 层，不限时间；高深度可能耗时很久。':'不限时间，点击“停止并走棋”采用已完成最深层结果。')+'设置下一步生效。首次加载不计入思考时间。';\n}\nfunction restart(){stop();resetIterations();game=new Game();selected=null;last=null;$('retry').hidden=true;$('stats').textContent='点击棋子，再点击落点。';render();advance();}\n$('mode').onchange=settings;$('stop').onclick=stopAndPlay;settings();$('restart').onclick=restart;$('side').onchange=restart;$('retry').onclick=advance;restart();\nfetch('./version.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{$('version').textContent=readableVersion(v);}).catch(()=>{$('version').textContent='版本信息暂不可用';});\n";


// Adapt the existing thinking-ui VM harness, but retain real Game, Board,
// notation, renderHistory and all app handlers. Only platform surfaces are fake.
function harness(source,{side='1',mode='time',policy=null}={}){
 const elements=new Map(),timers=new Map(),workers=[],games=[];
 const counts={verdict:0,play:0};
 const controls={verdictFailures:0,playFailure:null,now:1000};
 let timerId=0;
 function element(tag='div'){
  let text='';
  const e={tag,hidden:false,value:'',dataset:{},attributes:{},children:[],
   get textContent(){return text;},set textContent(value){text=String(value);this.children=[];},
   setAttribute(k,v){this.attributes[k]=String(v);},removeAttribute(k){delete this.attributes[k];},
   append(...items){this.children.push(...items);},replaceChildren(...items){text='';this.children=[...items];},
   createTHead(){const head=element('thead');this.append(head);return head;},
   createTBody(){const body=element('tbody');this.append(body);return body;},
   insertRow(){const row=element('tr');row.cells=[];this.append(row);return row;},
   insertCell(){const cell=element('td');this.cells.push(cell);this.append(cell);return cell;}};
  return e;
 }
 const $=id=>{if(!elements.has(id))elements.set(id,element());return elements.get(id);};
 $('side').value=side;$('mode').value=mode;$('seconds').value='3';$('depth').value='3';
 class ObservedGame extends Game{
  constructor(){super();games.push(this);this.serial=games.length;}
  verdict(){counts.verdict++;if(controls.verdictFailures){controls.verdictFailures--;throw Error('fixture verdict failure');}return policy?policy(this):super.verdict();}
  play(move){counts.play++;if(controls.playFailure==='before'){controls.playFailure=null;throw Error('fixture play before');}const result=super.play(move);if(controls.playFailure==='after'){controls.playFailure=null;throw Error('fixture play after');}return result;}
 }
 class FakeWorker{
  constructor(){workers.push(this);this.requests=[];this.terminated=false;}
  postMessage(request){this.request=copy(request);this.requests.push(copy(request));}
  terminate(){this.terminated=true;}
 }
 const context=vm.createContext({document:{getElementById:$,createElement:element},Game:ObservedGame,Worker:FakeWorker,
  thinkingLimits,completedResult,statsLabel,progressLabel,chineseHistory,readableVersion,moveFrom,moveTo,
  performance:{now:()=>controls.now},fetch:()=>new Promise(()=>{}),
  setTimeout:(f,ms)=>{timers.set(++timerId,{kind:'timeout',ms,f});return timerId;},clearTimeout:id=>timers.delete(id),
  setInterval:(f,ms)=>{timers.set(++timerId,{kind:'interval',ms,f});return timerId;},clearInterval:id=>timers.delete(id)});
 vm.runInContext(source.replace(/^import .*;\n/gm,''),context);
 const run=s=>vm.runInContext(s,context);
 function tree(e){return{tag:e.tag,hidden:e.hidden,value:e.value,text:e.textContent,attrs:e.attributes,dataset:e.dataset,
  ...(e.max===undefined?{}:{max:e.max}),children:e.children.map(tree)};}
 function snapshot(){return copy({state:run('({moves:[...game.moves],fen:game.board.toFEN(),selected,last,busy,generation,latest,searchStarted})'),
  dom:[...elements].sort(([a],[b])=>a.localeCompare(b)).map(([id,e])=>[id,tree(e)]),
  workers:workers.map(w=>({terminated:w.terminated,requests:w.requests})),
  timers:[...timers].map(([id,t])=>({id,kind:t.kind,ms:t.ms}))});}
 return {$,run,counts,controls,games,workers,snapshot,click:s=>$('board').children.find(e=>e.dataset.square===s).onclick(),
  emit:(w,data)=>w.onmessage({data:{id:w.request.id,...copy(data)}}),close:()=>run('stop()')};
}
function pair(options){return{a:harness(originalSource,options),b:harness(candidateSource,options)};}
function both(p,action,label){const a=action(p.a),b=action(p.b);assert.deepEqual(p.b.snapshot(),p.a.snapshot(),label);return{a,b};}
function close(p){p.a.close();p.b.close();}
const result=move=>({move,pv:[move],depth:2,nodes:100,time:20});

test('real app selection/cancellation and human/worker moves preserve every visible snapshot',()=>{
 const p=pair();try{
  assert.deepEqual(p.b.snapshot(),p.a.snapshot());assert.equal(p.b.counts.verdict,1);
  for(const square of [54,54,56,56,54])both(p,h=>h.click(square),'selection '+square);
  assert.equal(p.b.counts.verdict,1);assert.equal(p.a.counts.verdict,6);
  both(p,h=>h.click(36),'illegal two-step pawn move');
  assert.equal(p.b.counts.verdict,1);assert.equal(p.b.counts.play,0);
  both(p,h=>h.click(45),'legal a3a4 through actual click handler');
  // Original Game.play still adjudicates, then advance checks the new state.
  assert.equal(p.b.counts.verdict,3);assert.equal(p.b.counts.play,1);
  assert.deepEqual(copy(p.b.run('game.moves')),['a3a4']);
  both(p,h=>h.emit(h.workers[0],{type:'model-phase',stage:'ready'}),'ready');
  both(p,h=>h.emit(h.workers[0],{type:'info',info:result('a6a5')}),'info');
  both(p,h=>h.emit(h.workers[0],{type:'result',result:result('a6a5')}),'worker a6a5');
  assert.equal(p.b.counts.verdict,5);assert.equal(p.b.counts.play,2);
  assert.deepEqual(copy(p.b.run('game.moves')),['a3a4','a6a5']);
  for(const square of [45,45,56,56])both(p,h=>h.click(square),'later selection '+square);
  assert.equal(p.b.counts.verdict,5);
  both(p,h=>{h.$('mode').value='depth';h.$('mode').onchange();},'settings do not mutate game');
  assert.equal(p.b.counts.verdict,5);
 }finally{close(p);}
});

test('terminal hit still restores status and restart/side changes miss by Game identity',()=>{
 const policy=g=>g.serial===1?{terminal:true,winner:0,reason:'fixture-draw'}:{terminal:false,winner:null,reason:'ongoing'};
 const p=pair({policy});try{
  assert.match(p.b.$('status').textContent,/和棋.*fixture-draw/);
  both(p,h=>{h.run("status('temporary')");h.click(54);},'terminal hit must update status again');
  assert.equal(p.b.counts.verdict,1);assert.equal(p.a.counts.verdict,2);
  both(p,h=>h.$('restart').onclick(),'restart with equal zero history is a new identity');
  assert.equal(p.b.counts.verdict,2);assert.match(p.b.$('status').textContent,/轮到你了/);
  both(p,h=>{h.$('side').value='-1';h.$('side').onchange();},'side change starts another Game');
  assert.equal(p.b.counts.verdict,3);assert.equal(p.b.workers.length,1);
 }finally{close(p);}
});

test('verdict exception is not cached and a later successful miss can be reused',()=>{
 const p=pair();try{
  both(p,h=>{h.controls.verdictFailures=1;assert.throws(()=>h.$('restart').onclick(),/fixture verdict failure/);},'failed new-game verdict');
  const before=p.b.counts.verdict;
  both(p,h=>assert.equal(h.run('terminal()'),false),'retry after verdict failure');
  assert.equal(p.b.counts.verdict,before+1);
  both(p,h=>{h.run("status('unchanged')");assert.equal(h.run('terminal()'),false);},'ongoing hit does not change status');
  assert.equal(p.b.counts.verdict,before+1);
 }finally{close(p);}
});

for(const stage of ['before','after'])test('play invalidates before a '+stage+'-mutation exception',()=>{
 const p=pair({side:'-1'});try{
  both(p,h=>{h.controls.playFailure=stage;h.emit(h.workers[0],{type:'result',result:result('a3a4')});},'throwing worker play');
  assert.match(p.b.$('status').textContent,new RegExp('fixture play '+stage));
  assert.equal(p.b.run('game.moves.length'),stage==='after'?1:0);
  const before=p.b.counts.verdict;
  both(p,h=>assert.equal(h.run('terminal()'),false),'check after failed play');
  assert.equal(p.b.counts.verdict,before+1);
  both(p,h=>assert.equal(h.run('terminal()'),false),'reuse successful retry');
  assert.equal(p.b.counts.verdict,before+1);
 }finally{close(p);}
});

test('original Game rejection stays authoritative and invalidates the private UI cache',()=>{
 const p=pair({side:'-1'});try{
  both(p,h=>h.emit(h.workers[0],{type:'result',result:result('a3a5')}),'illegal actual Game move');
  assert.match(p.b.$('status').textContent,/非法走棋/);assert.equal(p.b.run('game.moves.length'),0);
  assert.equal(p.b.counts.play,1);assert.equal(p.b.counts.verdict,2);
  both(p,h=>assert.equal(h.run('terminal()'),false),'fresh verdict following rejected play');
  assert.equal(p.b.counts.verdict,3);
 }finally{close(p);}
});

for(const mode of ['time','depth','infinite'])test(mode+' stop/retry/stale/complete paths keep exact app snapshots',()=>{
 const p=pair({side:'-1',mode});try{
  both(p,h=>h.$('stop').onclick(),'stop before first layer');
  assert.equal(p.b.counts.verdict,1);
  both(p,h=>h.$('retry').onclick(),'retry unchanged history');
  assert.equal(p.b.counts.verdict,1);
  both(p,h=>h.emit(h.workers[0],{type:'result',result:result('a3a4')}),'stale terminated worker result');
  assert.equal(p.b.counts.play,0);assert.equal(p.b.counts.verdict,1);
  both(p,h=>h.emit(h.workers[1],{type:'model-phase',stage:'ready'}),'fresh worker ready');
  both(p,h=>h.emit(h.workers[1],{type:'info',info:result('a3a4')}),'completed layer');
  both(p,h=>h.emit(h.workers[1],{type:'result',result:result('a3a4')}),'completed result');
  if(mode==='infinite'){
   assert.equal(p.b.counts.play,0);
   both(p,h=>h.$('stop').onclick(),'infinite stop adopts completed result');
  }
  assert.equal(p.b.counts.play,1);assert.equal(p.b.counts.verdict,3);
  both(p,h=>h.$('restart').onclick(),'restart after result');
  assert.equal(p.b.counts.verdict,4);
  both(p,h=>h.emit(h.workers[1],{type:'result',result:result('c3c4')}),'old result after restart');
  assert.equal(p.b.run('game.moves.length'),0);assert.equal(p.b.counts.play,1);
 }finally{close(p);}
});

test('public Game still exposes independent verdict/request objects and validates mutated input',()=>{
 const g=new Game(),a=g.verdict();a.terminal=true;a.reason='caller mutation';
 const b=g.verdict();assert.notEqual(a,b);assert.equal(b.terminal,false);assert.equal(b.reason,'ongoing');
 const request=g.request({mode:'depth',depth:2});request.moves.push('a3a9');request.limits.depth=32;
 assert.deepEqual(g.moves,[]);assert.equal(g.request({mode:'depth',depth:2}).limits.depth,2);
 g.play('a3a4');g.play('a6a5');assert.equal(g.verdict().terminal,false);
 g.moves[0]='a3a9';assert.throws(()=>g.verdict(),/Illegal history move/);
 assert.equal(searchCalls,0);
});

test('both actual app inputs have exactly the reviewed permanent mutation sites',()=>{
 assert.equal((originalSource.match(/game\.play\(/g)||[]).length,2);
 assert.equal((candidateSource.match(/game\.play\(/g)||[]).length,1);
 assert.match(candidateSource,/function play\(move\)\{terminalVerdict=null;return game\.play\(move\);\}/);
 assert.match(candidateSource,/play\(m\);last=\[selected,s\]/);
 assert.match(candidateSource,/play\(result\.move\);last=\[from,to\]/);
 assert.equal((candidateSource.match(/game=new Game\(\)/g)||[]).length,1);
 assert.equal(searchCalls,0);
});
