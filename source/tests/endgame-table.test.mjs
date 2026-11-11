import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('regenerate and verify every exact endgame distance from the legal graph',{timeout:30000},()=>{
 const result=JSON.parse(execFileSync(process.execPath,[fileURLToPath(new URL('../scripts/verify-endgame-table.mjs',import.meta.url))],{encoding:'utf8',timeout:25000}));
 assert.equal(result.status,'PASS');assert.equal(result.states,53736);assert.equal(result.edges,268296);assert.equal(result.sha256,'8101d57cb27062287fd6d6a961efd9f3800f4edf97782835e8ecca46a080f430');
});
