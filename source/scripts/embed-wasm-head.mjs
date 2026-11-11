// SPDX-License-Identifier: GPL-3.0-or-later
// Check by default; --write regenerates only the pinned base64 payload.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url),pin=JSON.parse(fs.readFileSync(new URL('provenance/WASM-HEAD.json',root)));
if(!process.argv[2]||process.argv.slice(3).some(x=>x!=='--write'))throw Error('Usage: node scripts/embed-wasm-head.mjs /path/head.wasm [--write]');
const bytes=fs.readFileSync(process.argv[2]),hash=createHash('sha256').update(bytes).digest('hex');
if(bytes.length!==pin.binary.bytes||hash!==pin.binary.sha256)throw Error('Only the exact audited binary can be embedded');
const url=new URL(pin.helperPath,root),source=fs.readFileSync(url,'utf8'),matches=[...source.matchAll(/const encoded='([^']*)';/g)];
if(matches.length!==1)throw Error('Expected exactly one embedded payload');
const updated=source.replace(matches[0][0],"const encoded='"+bytes.toString('base64')+"';");
if(process.argv.includes('--write'))fs.writeFileSync(url,updated);
else if(updated!==source)throw Error('Embedded module differs from rebuilt module');
console.log(JSON.stringify({status:'PASS',mode:process.argv.includes('--write')?'embed':'check',bytes:bytes.length,sha256:hash}));
