import test from 'node:test';import assert from 'node:assert/strict';
import {Board} from '../engine/src/board.js';
import {DEFAULT_RULE_PROFILE,getRuleProfile,createProfileAdjudicator,classifyRepetitionForProfile} from '../engine/src/rule-profiles.js';
const fen='4k4/9/3R5/9/9/4P4/9/9/9/4K4 w - - 0 1',cycle=['d7e7','e9d9','e7d7','d9e9'];
function run(profile){const b=new Board(fen),a=createProfileAdjudicator(b,profile?{profile}:{});let result;for(const m of [...cycle,...cycle]){let side=b.turn;b.playUci(m);result=a.push(b,side);}return {result,b,a};}
test('mainland CCA2020 is explicit default and partial',()=>{assert.equal(DEFAULT_RULE_PROFILE,'cca2020');assert.equal(getRuleProfile().status,'partial-conservative');assert.equal(getRuleProfile().editionEffectiveDate,null);assert.throws(()=>getRuleProfile('latest'));});
test('mainland does not inherit unverified computer repetition rulings',()=>{
 const {result,b,a}=run();assert.equal(result.terminal,false);assert.equal(result.winner,null);assert.equal(result.unresolved,true);assert.equal(result.ruleProfile,'cca2020');assert.equal(result.reason,'unresolved-cca2020-repetition');
 let side=b.turn;b.playUci(cycle[0]);assert.doesNotThrow(()=>a.push(b,side));
});
test('explicit reference profile preserves verified computer-check subset',()=>{const {result}=run('pikafish2026');assert.equal(result.terminal,true);assert.equal(result.winner,-1);assert.equal(result.ruleProfile,'pikafish2026');});
test('mixed check cycle never automatically draws under mainland profile',()=>{const span=[{moverSide:1,gaveCheck:true},{moverSide:-1,gaveCheck:false},{moverSide:1,gaveCheck:false},{moverSide:-1,gaveCheck:false}];assert.equal(classifyRepetitionForProfile(span).winner,null);assert.equal(classifyRepetitionForProfile(span,'pikafish2026').winner,0);});
test('mainland mate/stalemate ordinary terminal semantics are retained',()=>{const b=new Board('3k5/9/9/9/9/9/9/3r5/5r3/4K4 b - - 0 1'),a=createProfileAdjudicator(b);b.playUci('d2d1');const r=a.push(b,-1);assert.equal(r.winner,-1);assert.equal(r.terminal,true);assert.equal(r.reason,'stalemate-loss');assert.equal(r.ruleProfile,'cca2020');});
