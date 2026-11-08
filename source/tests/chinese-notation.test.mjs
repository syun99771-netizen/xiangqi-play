import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {Board,START_FEN} from '../engine/src/board.js';
import {readableVersion} from '../web/version.mjs';
const source=fs.readFileSync(new URL('../web/notation.mjs',import.meta.url),'utf8').replace("'./engine/src/board.js'",JSON.stringify(new URL('../engine/src/board.js',import.meta.url).href));
const {chineseMove,chineseHistory}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const notation=(fen,move)=>chineseMove(new Board(fen),move);
test('standard red and black notation: file numerals, diagonal moves, advance and captures',()=>{
 for(const [move,text] of [['a3a4','兵九进一'],['h2e2','炮二平五'],['b0c2','马八进七'],['f0e1','仕四进五'],['c0e2','相七进五'],['b2b9','炮八进七']])assert.equal(notation(START_FEN,move),text,move);
 const black=START_FEN.replace(' w ',' b ');
 for(const [move,text] of [['a6a5','卒1进1'],['h7e7','炮8平5'],['h9g7','马8进7'],['f9e8','士6进5'],['c9e7','象3进5']])assert.equal(notation(black,move),text,move);
});
test('notation uses pre-capture board and preserves board state',()=>{const b=new Board(),before=b.toFEN();assert.equal(chineseMove(b,'b2b9'),'炮八进七');assert.equal(b.toFEN(),before);b.playUci('b2b9');assert.equal(b.squares[1],5);});
test('full history, truncation for undo, and reset remain deterministic independent of view orientation',()=>{const moves=['h2e2','h9g7','b0c2','b9c7'];const entries=chineseHistory(moves);assert.deepEqual(entries.map(e=>e.text),['炮二平五','马8进7','马八进七','马2进3']);assert.deepEqual(entries.map(e=>[e.number,e.side]),[[1,1],[1,-1],[2,1],[2,-1]]);assert.deepEqual(chineseHistory(moves.slice(0,2)),entries.slice(0,2));assert.deepEqual(chineseHistory([]),[]);assert.deepEqual(chineseHistory(moves),entries);assert.throws(()=>chineseHistory(['a3b3']),/illegal/);});
test('version displays real build time in readable local timezone, never invents missing timestamps',()=>{const v={commit:'a'.repeat(40),builtAt:'2026-11-08T10:22:27.884Z'};const s=readableVersion(v,{timeZone:'Asia/Shanghai'});assert.match(s,/18:22:27/);assert.match(s,/2026/);assert.match(s,/GMT\+8/);assert.ok(!s.includes('T10:'));assert.match(readableVersion({...v,builtAt:null}),/构建时间未知/);assert.match(readableVersion({...v,builtAt:'garbage'}),/构建时间未知/);assert.match(readableVersion({}),/版本未知/);});
test('play page removes requested introductory and technical copy',()=>{const html=fs.readFileSync(new URL('../web/index.html',import.meta.url),'utf8');for(const text of ['XIANGQI / 浏览器引擎','落子，见真章','纯 JavaScript','CC0 神经网络','本地运算'])assert.ok(!html.includes(text));assert.ok(!html.includes('<header>'));});
test('front/rear and pawn ordinals disambiguate legal positions, including multiple stacked files',()=>{
 const cases=[
 ['5k3/9/9/R8/9/9/R8/9/9/3K5 w - - 0 1',[['a6b6','前车平八'],['a3b3','后车平八']]],
 ['5k3/9/9/4n4/9/9/4n4/9/9/3K5 b - - 0 1',[['e3c2','前马进3'],['e6c5','后马进3']]],
 ['5k3/9/P8/P8/P8/9/9/9/9/3K5 w - - 0 1',[['a7b7','前兵平八'],['a6b6','中兵平八'],['a5b5','后兵平八']]],
 ['5k3/P8/P8/P8/P8/9/9/9/9/3K5 w - - 0 1',[['a8b8','一兵平八'],['a7b7','二兵平八'],['a6b6','三兵平八'],['a5b5','四兵平八']]],
 ['P4k3/P8/P8/P8/P8/9/9/9/9/3K5 w - - 0 1',[['a9b9','一兵平八'],['a8b8','二兵平八'],['a7b7','三兵平八'],['a6b6','四兵平八'],['a5b5','五兵平八']]],
 ['4k4/3P1P3/4P4/3P1P3/9/9/9/9/9/3K5 w - - 0 1',[['f8e8','一兵平五'],['f6e6','二兵平五'],['d8e8','三兵平五'],['d6e6','四兵平五'],['e7e8','兵五进一']]],
 ['5k3/9/9/9/9/9/3p1p3/4p4/3p1p3/4K4 b - - 0 1',[['d1e1','一卒平5'],['d3e3','二卒平5'],['f1e1','三卒平5'],['f3e3','四卒平5'],['e2e1','卒5进1']]],
 ['5k3/9/9/9/9/9/9/3A5/9/3AK4 w - - 0 1',[['d2e1','仕六退五'],['d0e1','仕六进五']]],
 ['5k3/9/9/9/9/2B6/9/9/9/2BK5 w - - 0 1',[['c4e2','相七退五'],['c0e2','相七进五']]],
 ['3k1a3/9/5a3/9/9/9/9/9/9/4K4 b - - 0 1',[['f7e8','士6退5'],['f9e8','士6进5']]]
 ];
 for(const [fen,moves] of cases)for(const [move,text] of moves)assert.equal(notation(fen,move),text,fen+' '+move);
});
