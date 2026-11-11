// SPDX-License-Identifier: GPL-3.0-or-later
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {prepareRelease} from '../scripts/prepare-release.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));
const required=['LICENSE','NOTICE.md','licenses/CC0-1.0.txt','licenses/Pikafish-Networks-README.md','WASM-HEAD.md','engine/experimental/fairy-cc0-sparse-head-v1/wasm-head-source.c','engine/experimental/fairy-cc0-sparse-head-v1/wasm-head.mjs','scripts/build-wasm-head.mjs','scripts/embed-wasm-head.mjs','provenance/WASM-HEAD.json','provenance/ENGINE-SOURCE.json','provenance/MODEL.json'];
test('manifest and source snapshot retain complete numeric-head source, reproduction and licenses',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json'))),pin=JSON.parse(fs.readFileSync(path.join(root,'provenance/WASM-HEAD.json'))),pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json')));
 for(const file of required){assert(Object.hasOwn(manifest.files,file),file+' must be distributed');assert(pkg.files.some(entry=>entry===file||entry.endsWith('/')&&file.startsWith(entry)||entry==='*.md'&&file.endsWith('.md')&&!file.includes('/')),file+' npm inclusion');}
 for(const file of Object.keys(manifest.files))assert(!/\.(?:wasm|node|so|dylib|dll|exe|a|o)$/i.test(file),file+' unapproved compiled backend');
 assert.equal(pin.binary.bytes,1184);assert.deepEqual(pin.binary.imports,[]);assert.deepEqual(pin.binary.memory,{initialPages:4,maximumPages:4,bytes:262144,shared:false});
 assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,pin.source.path))).digest('hex'),pin.source.sha256);
 assert.equal(pin.source.sha256,'11fc8606c57f7807a4d61ac6bc17df3348f5919fcbe2b284c5425902f48cc61e');
 assert.equal(pin.binary.sha256,'9e806804d5e5a0041c20165a2cc3481060ad63bf774b598dc7d99858d5eab046');
 const target=fs.mkdtempSync(path.join(os.tmpdir(),'numeric-head-release-'));
 try{prepareRelease(root,target,'0'.repeat(40));for(const file of required)assert.deepEqual(fs.readFileSync(path.join(target,'source',file)),fs.readFileSync(path.join(root,file)));assert(!fs.existsSync(path.join(target,'source/models/xiangqi-c07e94a5c7cb.nnue')));}finally{fs.rmSync(target,{recursive:true,force:true});}
});

test('engine provenance covers every distributed engine file without omissions',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json'))),provenance=JSON.parse(fs.readFileSync(path.join(root,'provenance/ENGINE-SOURCE.json')));
 assert.deepEqual(provenance.files.map(x=>x.path).sort(),Object.keys(manifest.files).filter(x=>x.startsWith('engine/')).sort());
});
