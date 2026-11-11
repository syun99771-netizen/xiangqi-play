// UI configuration and completed-iteration snapshots; no speculative move fallback.
export function thinkingLimits(mode,seconds,depth){
 if(mode==='time'){const ms=Number(seconds)*1000;if(!Number.isFinite(ms)||ms<100||ms>60000)throw Error('思考时间请输入 0.1–60 秒');return {mode:'time',movetime:Math.round(ms),depth:32};}
 if(mode==='depth'){const n=Number(depth);if(!Number.isInteger(n)||n<1||n>32)throw Error('目标深度请输入 1–32 的整数');return {mode:'depth',depth:n};}
 if(mode==='infinite')return {mode:'infinite'};
 throw Error('请选择有效的思考方式');
}
export function completedResult(info){
 if(info?.status==='forced-win-found')return null;
 if(info?.status==='proven-endgame'&&info.proof?.source==='knka-exact-v1'&&Number.isInteger(info.proof.remainingPlies)&&info.proof.remainingPlies>0&&info.depth===0&&info.nodes===0&&Number.isFinite(info.time)&&Array.isArray(info.pv)&&info.pv.length===1&&info.move===info.pv[0])return {...info,pv:[...info.pv],proof:{...info.proof}};
 if(!info||!Number.isInteger(info.depth)||info.depth<1||!Array.isArray(info.pv)||!info.pv.length||!Number.isFinite(info.nodes)||!Number.isFinite(info.time))return null;
 return {depth:info.depth,nodes:info.nodes,time:info.time,pv:[...info.pv],move:info.pv[0],score:info.score};
}
export function statsLabel(info,elapsed=null){
 const win=forcedWinResult(info);if(win)return `已找到强制胜着 · 最多 ${win.forcedWin.winWithinPlies} 半回合（每方走一步计 1） · 当前层未完成 · ${Math.round(win.time)} ms`;
 if(info?.status==='proven-endgame')return `残局证明 · 最多 ${info.proof.remainingPlies} 半回合（每方走一步计 1） · ${Math.round(info.time)} ms`;
 const depth=info?.depth??0,nodes=info?.nodes??0;
 return `完成深度 ${depth} · ${nodes.toLocaleString()} 节点${elapsed===null?'':'（已完成层）'} · ${elapsed===null?Math.round(info?.time??0)+' ms':(elapsed/1000).toFixed(1)+' 秒'}`;
}

// A bounded winning-subtree result is usable, but is never a completed layer.
export function forcedWinResult(info){
 const w=info?.forcedWin;
 if(info?.status!=='forced-win-found'||info.type!=='result'||info.terminal!==false||!w||info.score!==null||info.stopped!==true||info.completionReason!==null||!['time','nodes'].includes(info.stopReason)||!Number.isInteger(info.depth)||info.depth<0||w.lastCompletedDepth!==info.depth||!Number.isInteger(w.searchDepth)||w.searchDepth<=info.depth||w.rootIterationComplete!==false||w.scoreBound!=='lower'||w.cycleGuardReturns!==0||!Number.isInteger(w.scoreLowerBound)||w.scoreLowerBound<=29900||w.scoreLowerBound>=30000||w.winWithinPlies!==30000-w.scoreLowerBound||!Number.isInteger(info.nodes)||info.nodes<0||!Number.isFinite(info.time)||info.time<0||!Number.isInteger(w.nodesWhenFound)||w.nodesWhenFound<1||w.nodesWhenFound>info.nodes||typeof info.move!=='string'||!/^[a-i][0-9][a-i][0-9]$/.test(info.move)||w.move!==info.move||!Array.isArray(info.pv)||info.pv.length!==1||info.pv[0]!==info.move)return null;
 return {...info,pv:[...info.pv],forcedWin:{...w}};
}
