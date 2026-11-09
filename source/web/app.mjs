import {thinkingLimits,completedResult,statsLabel} from './thinking.mjs';
import {Game} from './game.mjs';
import {progressLabel} from './model-download.mjs';
import {chineseHistory} from './notation.mjs';
import {readableVersion} from './version.mjs';
import {moveFrom,moveTo} from './engine/src/board.js';
const $=id=>document.getElementById(id),names={1:'兵',2:'仕',3:'相',4:'马',5:'炮',6:'车',7:'帅','-1':'卒','-2':'士','-3':'象','-4':'马','-5':'砲','-6':'车','-7':'将'};
let game,selected=null,worker=null,busy=false,last=null,generation=0,watchdog,statsTimer,searchStarted=null,latest=null;
const player=()=>Number($('side').value),squareName=s=>String.fromCharCode(97+s%9)+(9-Math.floor(s/9));
function status(s){$('status').textContent=s;}
function resetLoading(){$('model-loading').hidden=true;$('model-progress').removeAttribute('value');$('model-bytes').textContent='';$('model-stage').textContent='';}
function stop(){resetLoading();generation++;worker?.terminate();worker=null;busy=false;clearTimeout(watchdog);clearInterval(statsTimer);$('stop').hidden=true;searchStarted=null;}
function render(){const legal=selected===null?[]:game.board.generateLegalMoves().filter(m=>moveFrom(m)===selected).map(moveTo);$('board').replaceChildren();for(let i=0;i<90;i++){const s=player()===1?i:89-i,p=game.board.squares[s],b=document.createElement('button');b.className='square'+(p>0?' red':'')+(selected===s?' selected':'')+(legal.includes(s)?' target':'')+(last?.includes(s)?' last':'');b.setAttribute('aria-label',squareName(s)+(p?' '+(p>0?'红':'黑')+names[p]:' 空位'));b.dataset.square=s;b.setAttribute('aria-pressed',String(selected===s));b.onclick=()=>click(s);if(p){const el=document.createElement('span');el.className='piece';el.textContent=names[p];b.append(el);}$('board').append(b);}renderHistory();}
function renderHistory(){
 const host=$('moves');host.replaceChildren();
 if(!game.moves.length){host.textContent='尚未落子';return;}
 const table=document.createElement('table');table.className='scoresheet';table.setAttribute('aria-label','中文棋谱');
 const head=table.createTHead().insertRow();for(const text of ['回合','红方','黑方']){const th=document.createElement('th');th.scope='col';th.textContent=text;head.append(th);}
 const body=table.createTBody();let number=null,tr;
 for(const entry of chineseHistory(game.moves)){if(entry.number!==number){number=entry.number;tr=body.insertRow();tr.insertCell().textContent=String(number);tr.insertCell();tr.insertCell();}tr.cells[entry.side===1?1:2].textContent=entry.text;}
 host.append(table);
}
function resetIterations(){$('iteration-list').replaceChildren();$('iterations').hidden=true;}
function renderIteration(info){
 const row=document.createElement('li'),heading=document.createElement('strong'),line=document.createElement('p'),meta=document.createElement('small');
 heading.textContent=`第 ${info.depth} 层`;
 try{const entries=chineseHistory([...game.moves,...info.pv]).slice(game.moves.length);line.textContent=entries.map(e=>`${e.side===1?'红':'黑'}：${e.text}`).join('　');}catch{line.textContent='走法暂无法显示';}
 meta.textContent=`${Math.round(info.time)} ms · ${info.nodes.toLocaleString()} 节点`;
 row.append(heading,line,meta);$('iteration-list').append(row);$('iterations').hidden=false;
}
function terminal(){const a=game.verdict();if(!a.terminal)return false;status((a.winner===0?'和棋':a.winner===1?'红方胜':'黑方胜')+' · '+a.reason);return true;}
function click(s){if(busy||game.board.turn!==player()||terminal())return;const p=game.board.squares[s];if(p*player()>0){selected=selected===s?null:s;render();return;}if(selected===null)return;const m=selected*90+s;if(!game.board.isLegalMove(m)){status('这里不能落子，请选择标记的合法落点。');return;}game.play(m);last=[selected,s];selected=null;render();advance();}
function fail(message){stop();status('引擎暂不可用：'+message);$('retry').hidden=false;}
function finish(result){
 clearTimeout(watchdog);clearInterval(statsTimer);busy=false;$('stop').hidden=true;resetLoading();
 try{
  if(!result.move){if(!terminal()){status('尚无完整搜索结果，未落子。请继续思考或重新开始。');$('retry').hidden=false;}return;}
  const from=(9-Number(result.move[1]))*9+result.move.charCodeAt(0)-97,to=(9-Number(result.move[3]))*9+result.move.charCodeAt(2)-97;
  game.play(result.move);last=[from,to];$('stats').textContent=statsLabel(result,result.stoppedElapsed??null)+(result.depth===0?' · 时间不足，使用合法备用着法':'');
  render();if(!terminal())status('轮到你了'+(game.board.inCheck()?' · 正在被将军':''));
 }catch(e){fail(e.message);}
}
function stopAndPlay(){
 if(!busy)return;
 const result=latest?{...latest,stoppedElapsed:searchStarted===null?latest.time:performance.now()-searchStarted}:null;stop();
 if(result)finish(result);
 else{status('已停止，尚未完成第一层，未落子。可重试引擎。');$('retry').hidden=false;}
}
function advance(){
 if(busy||terminal())return;
 if(game.board.turn===player()){status('轮到你了 · '+(game.board.inCheck()?'正在被将军':'请选择棋子'));return;}
 let limits;try{limits=thinkingLimits($('mode').value,$('seconds').value,$('depth').value);}catch(e){fail(e.message);return;}
 resetIterations();busy=true;latest=null;searchStarted=null;$('stats').textContent='等待搜索开始…';status('引擎正在思考…');$('retry').hidden=true;$('stop').hidden=false;
 const id=++generation;
 if(!worker)worker=new Worker('./engine-worker.mjs',{type:'module'});worker.onerror=e=>{if(id===generation)fail(e.message||'Worker 加载失败');};
 const searchReady=()=>{
  resetLoading();status('引擎正在思考…');clearTimeout(watchdog);searchStarted=performance.now();
  const update=()=>{$('stats').textContent=statsLabel(latest,performance.now()-searchStarted);};update();clearInterval(statsTimer);statsTimer=setInterval(update,200);
  if(limits.mode==='time')watchdog=setTimeout(()=>fail('搜索超时，请重试'),limits.movetime+30000);
 };
 worker.onmessage=({data})=>{
  if(id!==generation)return;if(data.id!==id)return;if(data.type==='model-phase'){
   if(data.stage==='ready')searchReady();
   else{$('model-loading').hidden=false;$('model-progress').removeAttribute('value');const labels={download:'正在下载模型',verify:'下载完成，正在校验模型…',parse:'校验通过，正在解析模型…'};$('model-stage').textContent=labels[data.stage]||'正在准备模型…';status('正在准备引擎…');if(data.stage!=='download')$('model-bytes').textContent='';}return;
  }
  if(data.type==='model-progress'){$('model-loading').hidden=false;const p=$('model-progress');if(data.total===null){p.removeAttribute('value');}else{p.max=data.total;p.value=data.loaded;}$('model-bytes').textContent=progressLabel(data);return;}
  if(data.type==='info'){const snapshot=completedResult(data.info);if(snapshot&&(!latest||snapshot.depth>latest.depth)){latest=snapshot;if(limits.mode==='infinite')renderIteration(snapshot);$('stats').textContent=statsLabel(latest,searchStarted===null?latest.time:performance.now()-searchStarted);}return;}
  if(data.type==='error'){fail(data.error);return;}
  if(data.type==='result'){
   const r=data.result;
   if(limits.mode==='infinite'&&r.move){clearTimeout(watchdog);clearInterval(statsTimer);resetLoading();latest=completedResult(r);$('stats').textContent=statsLabel(r);status(latest?'搜索已结束，点击“停止并走棋”采用结果。':'搜索已停止，尚无完整层结果；可停止后重试。');return;}
   finish(limits.mode!=='time'&&r.depth===0?{...r,move:null}:r);
  }
 };
 watchdog=setTimeout(()=>fail('模型加载超时，请重试'),120000);
 worker.postMessage({id,request:game.request(limits)});
}
function settings(){
 const mode=$('mode').value;$('time-setting').hidden=mode!=='time';$('depth-setting').hidden=mode!=='depth';
 $('mode-help').textContent=(mode==='time'?'0.1–60 秒。':mode==='depth'?'1–32 层，不限时间；高深度可能耗时很久。':'不限时间，点击“停止并走棋”采用已完成最深层结果。')+'设置下一步生效。首次加载不计入思考时间。';
}
function restart(){stop();resetIterations();game=new Game();selected=null;last=null;$('retry').hidden=true;$('stats').textContent='点击棋子，再点击落点。';render();advance();}
$('mode').onchange=settings;$('stop').onclick=stopAndPlay;settings();$('restart').onclick=restart;$('side').onchange=restart;$('retry').onclick=advance;restart();
fetch('./version.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error();return r.json();}).then(v=>{$('version').textContent=readableVersion(v);}).catch(()=>{$('version').textContent='版本信息暂不可用';});
