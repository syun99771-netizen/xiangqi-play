// Shared static build for the public release repository. No deployment credentials required.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=(file,args=[],env=process.env)=>execFileSync(file,args,{cwd:root,env,stdio:'inherit'});
run(process.execPath,['verify-manifest.mjs']);
const metadata=JSON.parse(fs.readFileSync(path.join(root,'provenance/MODEL.json'))).network;
const model=path.join(root,'models/xiangqi-c07e94a5c7cb.nnue');
function valid(){if(!fs.existsSync(model))return false;const b=fs.readFileSync(model);return b.length===metadata.bytes&&createHash('sha256').update(b).digest('hex')===metadata.sha256;}
if(!valid()){
 const temp=model+'.download';
 try {
  run('curl',['--fail','--location','--retry','3','--connect-timeout','20','--max-time','180',metadata.url,'-o',temp]);
  const b=fs.readFileSync(temp);
  if(b.length!==metadata.bytes||createHash('sha256').update(b).digest('hex')!==metadata.sha256)throw Error('Downloaded model integrity mismatch');
  fs.renameSync(temp,model);
 } finally {if(fs.existsSync(temp))fs.unlinkSync(temp);}
}
run('npm',['test']);
const releaseFile=path.join(root,'../release.json');
const commit=fs.existsSync(releaseFile)?JSON.parse(fs.readFileSync(releaseFile)).sourceCommit:process.env.GITHUB_SHA;
if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('Expected full source commit from release.json or GITHUB_SHA');
run(process.execPath,['scripts/build-pages.mjs'],{...process.env,GITHUB_SHA:commit,PAGES_OUT:path.join(root,'../pages-dist'),XIANGQI_MODEL_PATH:model});
