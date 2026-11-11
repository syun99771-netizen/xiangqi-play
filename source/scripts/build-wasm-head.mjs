// SPDX-License-Identifier: GPL-3.0-or-later
// Build the one audited module with the already installed, explicitly supplied compiler.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=fileURLToPath(new URL('../',import.meta.url));
const pin=JSON.parse(fs.readFileSync(path.join(root,'provenance/WASM-HEAD.json')));
const sha=b=>createHash('sha256').update(b).digest('hex');
const cc=process.env.WASM_CC;
if(!cc||!path.isAbsolute(cc))throw Error('Set WASM_CC to the absolute path of the pinned installed clang; no downloads are performed');
const linker=path.join(path.dirname(cc),'wasm-ld');
for(const [file,expected] of [[cc,pin.toolchain.clangSha256],[linker,pin.toolchain.wasmLdSha256]])if(sha(fs.readFileSync(file))!==expected)throw Error('Toolchain SHA-256 mismatch: '+file);
const source=path.join(root,pin.source.path);
if(sha(fs.readFileSync(source))!==pin.source.sha256)throw Error('C source SHA-256 mismatch');
if(!process.argv[2])throw Error('Pass an output .wasm path outside the source tree');
const output=path.resolve(process.argv[2]);
if(output===root||output.startsWith(root+path.sep)||output.startsWith(root))throw Error('Output must be outside source tree');
fs.mkdirSync(path.dirname(output),{recursive:true});
execFileSync(cc,[...pin.buildFlags,source,'-o',output],{stdio:'inherit'});
const bytes=fs.readFileSync(output);
if(bytes.length!==pin.binary.bytes||sha(bytes)!==pin.binary.sha256)throw Error('Rebuilt module does not match the audited binary');
console.log(JSON.stringify({status:'PASS',output,bytes:bytes.length,sha256:sha(bytes)}));
