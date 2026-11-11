// SPDX-License-Identifier: GPL-3.0-or-later
// Rebuild the finite material graph from legal moves; no native binary or model.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {Board} from '../engine/src/board.js';
const states=[],by=new Map(),key=b=>b.toFEN().split(' ').slice(0,2).join(' ');
const red=[66,67,68,75,76,77,84,85,86],black=[3,4,5,12,13,14,21,22,23],advisors=[-1,3,5,13,21,23];
for(const r of red)for(const k of black)for(let n=0;n<90;n++)for(const a of advisors)for(const t of [1,-1]){
 if(n===r||n===k||(a>=0&&(a===k||a===n)))continue;
 const b=new Board();b.squares.fill(0);b.squares[r]=7;b.squares[k]=-7;b.squares[n]=4;if(a>=0)b.squares[a]=-2;b.kings[0]=r;b.kings[1]=k;b.turn=t;b.halfmove=0;b.fullmove=1;b.rehash();if(b.inCheck(-t))continue;
 const index=((red.indexOf(r)*9+black.indexOf(k))*90+n)*12+advisors.indexOf(a)*2+(t===-1?1:0);
 by.set(key(b),states.length);states.push({fen:b.toFEN(),index,turn:t,children:[],parents:[],v:0,d:-1});
}
for(const s of states){const b=new Board(s.fen);for(const m of b.generateLegalMoves()){const u=b.makeMove(m);const j=u.captured===4?-1:by.get(key(b));assert.notEqual(j,undefined);s.children.push(j);b.unmakeMove(u);}s.left=s.children.length;if(!s.left){s.v=-1;s.d=0;}}
for(let i=0;i<states.length;i++)for(const j of states[i].children)if(j>=0)states[j].parents.push(i);
const queue=states.map((s,i)=>s.v?i:-1).filter(i=>i>=0);
for(let q=0;q<queue.length;q++){const s=states[queue[q]];for(const i of s.parents){const p=states[i];if(p.v)continue;if(s.v===-1){p.v=1;p.d=s.d+1;queue.push(i);}else if(--p.left===0){p.v=-1;p.d=1+Math.max(...p.children.map(j=>states[j].d));queue.push(i);}}}
const data=new Uint8Array(87480);
for(const s of states){if(!s.v)continue;assert.equal(s.v*s.turn,1,'every solved outcome is red winning');data[s.index]=s.d+1;if(s.v===1)assert.equal(s.d,1+Math.min(...s.children.filter(j=>j>=0&&states[j].v===-1).map(j=>states[j].d)));else if(s.children.length){assert(s.children.every(j=>j>=0&&states[j].v===1));assert.equal(s.d,1+Math.max(...s.children.map(j=>states[j].d)));}}
const source=readFileSync(new URL('../engine/src/endgame-guide.js',import.meta.url),'utf8');
const stored=Buffer.from(source.match(/atob\("([A-Za-z0-9+/=]+)"\)/)[1],'base64');assert.deepEqual(Buffer.from(data),stored);assert.equal(states.length,53736);assert.equal(data.filter(Boolean).length,52752);
console.log(JSON.stringify({status:'PASS',states:states.length,edges:states.reduce((n,s)=>n+s.children.length,0),slots:data.length,sha256:createHash('sha256').update(data).digest('hex')}));
