// SPDX-License-Identifier: GPL-3.0-or-later
// Policy derived from official-pikafish/Pikafish b562d6aeac5401879e973dc53ddb56053f07bb6a
// src/position.cpp:1159-1232 (chased). Copyright Pikafish/Stockfish contributors.
// See source/Copying.txt and source/AUTHORS. This is NOT 2026-09-25 ChineseRule.
import {pinEvidence} from './pin-evidence.mjs';
import {legalThreats} from './legal-threat-evidence.mjs';
export const POLICY=Object.freeze({id:'pikafish-b562d6ae-full-chase-evidence-v2',sourceCommit:'b562d6aeac5401879e973dc53ddb56053f07bb6a',scope:'Single-state chase target evidence only; no repetition or game verdict',pinPolicy:'Literal pinned-source blockers/pinners set algorithm',actual20260925ChineseRuleEquivalent:false});
const P=1,A=2,B=3,N=4,C=5,R=6,K=7;
const row=s=>Math.floor(s/9),col=s=>s%9;
// Every source update_blockers blocker is either on a king orthogonal ray
// (rook/cannon/flying king), or a knight leg adjacent diagonally/orthogonally
// to the king. This deliberately marks additional harmless blockers UNKNOWN.
export function requiresPinEvidence(board,square,side){
 const king=board.kings[side===1?0:1];if(!Number.isInteger(king)||king<0||king>=90)throw Error('Missing king');
 const dr=Math.abs(row(square)-row(king)),dc=Math.abs(col(square)-col(king));
 return dr===0||dc===0||(dr<=1&&dc<=1);
}
export function mainlineChaseEvidence(board,pieceIds,side,poll=()=>{}){
 const evidence=legalThreats(board,pieceIds,side,poll),reverse=legalThreats(board,pieceIds,-side,poll);
 const reversePairs=new Set(reverse.captures.map(c=>`${c.attacker.id}:${c.target.id}`));
 const included=[],excluded=[],unknown=[],pins=pinEvidence(board,side,poll);
 for(const capture of evidence.captures){poll();
  const at=Math.abs(capture.attacker.piece),tt=Math.abs(capture.target.piece);
  const record=reason=>({move:capture.move,attackerId:capture.attacker.id,targetId:capture.target.id,reason});
  if(at===K||at===P){excluded.push(record('king-or-pawn-attacker-exempt'));continue;}
  const pinned=pins.blockers.includes(capture.from);
  if(pinned&&!pins.pinners.includes(capture.to)){excluded.push(record('pinned-attacker-target-not-pinner'));continue;}
  if(tt===K){excluded.push(record('king-target-not-chase'));continue;}
  const targetCrossed=capture.target.side===1?row(capture.to)<=4:row(capture.to)>=5;
  if(!pinned&&tt===P&&!targetCrossed){excluded.push(record('uncrossed-pawn-target-exempt'));continue;}
  if(((at===N||at===C)&&tt===R)||((at===A||at===B)&&[R,C,N].includes(tt))){included.push(record('stronger-target-special-case-protection-ignored'));continue;}
  if(capture.legalRecaptures.length){excluded.push(record('legal-recapture-protection'));continue;}
  if(at===tt&&reversePairs.has(`${capture.target.id}:${capture.attacker.id}`)){excluded.push(record('same-type-legal-mutual-capture'));continue;}
  included.push(record(at===tt?'same-type-reverse-capture-not-legal-or-geometric':'unprotected-different-type-target'));
 }
 const knownTargets=[...new Set(included.map(c=>c.targetId))].sort((a,b)=>a-b);
 const unresolvedTargets=[...new Set(unknown.map(c=>c.targetId))].filter(id=>!knownTargets.includes(id)).sort((a,b)=>a-b);
 return {policy:POLICY,side,pins,policyComplete:unknown.length===0,knownTargets,unresolvedTargets,included,excluded,unknown,evidence,reverseEvidence:reverse};
}
