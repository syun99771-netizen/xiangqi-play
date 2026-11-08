// Distribution integrity check; a separately supplied archive digest authenticates this manifest.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';

const root=path.dirname(fileURLToPath(import.meta.url));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'MANIFEST.json'),'utf8'));
assert.equal(manifest.schema,'xiangqi-recovered-js-release-v1');
function walk(dir,prefix='') {
  return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>{
    const name=prefix+entry.name;
    // npm intentionally omits .gitignore; it is repository metadata, not runtime source.
    if (name==='.git'||name==='.gitignore'||name==='node_modules'||/^models\/[^/]+\.nnue$/.test(name)) return [];
    assert(!entry.isSymbolicLink(),'Unexpected symlink: '+name);
    if(entry.isDirectory())return walk(path.join(dir,entry.name),name+'/');
    return entry.isFile()?[name]:[];
  });
}
const actual=walk(root).filter(name=>name!=='MANIFEST.json').sort();
assert.deepEqual(actual,Object.keys(manifest.files).sort(),'Unexpected or missing distribution file');
for(const name of actual) {
  assert(!name.startsWith('/')&&!name.split('/').includes('..'));
  const bytes=fs.readFileSync(path.join(root,name)),expected=manifest.files[name];
  assert.equal(bytes.length,expected.bytes,name+' byte count');
  assert.equal(createHash('sha256').update(bytes).digest('hex'),expected.sha256,name+' SHA-256');
}
console.log(JSON.stringify({status:'PASS',files:actual.length,scope:'Distribution file integrity only; external model separately authenticated at load time'}));
