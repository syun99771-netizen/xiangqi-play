// UI configuration and completed-iteration snapshots; no speculative move fallback.
export function thinkingLimits(mode,seconds,depth){
 if(mode==='time'){const ms=Number(seconds)*1000;if(!Number.isFinite(ms)||ms<100||ms>60000)throw Error('思考时间请输入 0.1–60 秒');return {mode:'time',movetime:Math.round(ms),depth:32};}
 if(mode==='depth'){const n=Number(depth);if(!Number.isInteger(n)||n<1||n>32)throw Error('目标深度请输入 1–32 的整数');return {mode:'depth',depth:n};}
 if(mode==='infinite')return {mode:'infinite'};
 throw Error('请选择有效的思考方式');
}
export function completedResult(info){
 if(info?.status==='proven-endgame'&&info.proof?.source==='knka-exact-v1'&&Number.isInteger(info.proof.remainingPlies)&&info.proof.remainingPlies>0&&info.depth===0&&info.nodes===0&&Number.isFinite(info.time)&&Array.isArray(info.pv)&&info.pv.length===1&&info.move===info.pv[0])return {...info,pv:[...info.pv],proof:{...info.proof}};
 if(!info||!Number.isInteger(info.depth)||info.depth<1||!Array.isArray(info.pv)||!info.pv.length||!Number.isFinite(info.nodes)||!Number.isFinite(info.time))return null;
 return {depth:info.depth,nodes:info.nodes,time:info.time,pv:[...info.pv],move:info.pv[0],score:info.score};
}
export function statsLabel(info,elapsed=null){
 if(info?.status==='proven-endgame')return `残局证明 · 最多 ${info.proof.remainingPlies} 半回合（每方走一步计 1） · ${Math.round(info.time)} ms`;
 const depth=info?.depth??0,nodes=info?.nodes??0;
 return `完成深度 ${depth} · ${nodes.toLocaleString()} 节点${elapsed===null?'':'（已完成层）'} · ${elapsed===null?Math.round(info?.time??0)+' ms':(elapsed/1000).toFixed(1)+' 秒'}`;
}
