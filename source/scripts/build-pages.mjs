import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';import {execFileSync} from 'node:child_process';
const root=process.cwd(),out=path.resolve(process.env.PAGES_OUT||'../pages-dist');
if(out===root||out.startsWith(root+path.sep))throw Error('Build output must be outside source tree');
fs.mkdirSync(out,{recursive:true});
for(const name of ['api.mjs','reference-core.mjs','engine','LICENSE','NOTICE.md','licenses','provenance'])fs.cpSync(name,path.join(out,name),{recursive:true});
for(const name of fs.readdirSync('web'))fs.copyFileSync(path.join('web',name),path.join(out,name));
const model=fs.readFileSync(process.env.XIANGQI_MODEL_PATH||'models/xiangqi-c07e94a5c7cb.nnue');
if(createHash('sha256').update(model).digest('hex')!=='c07e94a5c7cbeae443ed79a8fa412875d833a7f8e04333815e39729c59d52e11')throw Error('Model SHA256 mismatch');
fs.mkdirSync(path.join(out,'models'),{recursive:true});fs.writeFileSync(path.join(out,'models/xiangqi-c07e94a5c7cb.nnue'),model);
fs.writeFileSync(path.join(out,'version.json'),JSON.stringify({commit:process.env.GITHUB_SHA||'local-development',builtAt:new Date().toISOString()}));
// Publish precisely the reviewed source manifest, never .git or unrelated private files.
const files=['MANIFEST.json',...Object.keys(JSON.parse(fs.readFileSync('MANIFEST.json')).files)];
execFileSync('tar',['-czf',path.join(out,'source.tar.gz'),'--',...files]);
fs.writeFileSync(path.join(out,'.nojekyll'),'');console.log(out);
