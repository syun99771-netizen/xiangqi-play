// SPDX-License-Identifier: GPL-3.0-or-later
// Structural port of b562d6ae position.cpp detect_chases, with exact board checks.
// Public mainline reference ONLY; explicitly NOT ChineseRule / actual20260925.
import{createIdentityReplay,Board}from'./legal-threat-evidence.mjs';
import{mainlineChaseEvidence}from'./pinned-mainline-chase-v2.mjs';
export function mainlineCycleEvidence({fen,moves,cyclePlies,poll=()=>{}}){
 if(!Array.isArray(moves)||!Number.isInteger(cyclePlies)||cyclePlies<4||cyclePlies%2||cyclePlies>moves.length)throw Error('Invalid complete cycle history');
 const replay=createIdentityReplay({fen,poll}),states=[replay.snapshot()];for(const move of moves){replay.push(move);states.push(replay.snapshot());}
 const start=moves.length-cyclePlies,key=x=>x.fen.split(' ').slice(0,2).join(' ');
 if(key(states[start])!==key(states.at(-1)))throw Error('Cycle endpoints not identical placement+turn');
 const span=replay.history.slice(start);if(span.some(r=>r.target))throw Error('Capture in repeated span');
 const checkShortCircuit=span.some(r=>r.gaveCheck),intersections={1:null,'-1':null},rows=[];
 for(let i=start;i<moves.length;i++){poll();const side=replay.history[i].side,a=mainlineChaseEvidence(new Board(states[i].fen),states[i].pieceIds,side,poll),b=mainlineChaseEvidence(new Board(states[i+1].fen),states[i+1].pieceIds,side,poll),newTargets=b.knownTargets.filter(x=>!a.knownTargets.includes(x));intersections[side]=intersections[side]===null?newTargets:intersections[side].filter(x=>newTargets.includes(x));rows.push({ply:i+1,side,move:moves[i],gaveCheck:replay.history[i].gaveCheck,beforeTargets:a.knownTargets,afterTargets:b.knownTargets,newTargets});}
 const red=Boolean(intersections[1]?.length),black=Boolean(intersections[-1]?.length),offender=red!==black?(red?1:-1):null,score=checkShortCircuit?0:offender===null?0:offender===replay.board.turn?-32000:32000;
 return {policy:'pikafish-b562d6ae-detect-chases-v1',actualChineseRuleEquivalent:false,cycleStart:start,cyclePlies,checkShortCircuit,intersections,rows,sourceScoreAtPly0:score,finalFEN:replay.board.toFEN(),limitation:'Source detect_chases component only; outer perpetual-check/root repetition/material/clock policies separate. No actual-match rescoring.'};
}
