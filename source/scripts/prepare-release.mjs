import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
export function prepareRelease(source,target,commit){
 source=fs.realpathSync(source);target=fs.realpathSync(target);
 if(target===source||target.startsWith(source+path.sep))throw Error('Target must be outside source');
 if(!/^[a-f0-9]{40}$/.test(commit))throw Error('Expected full source commit');
 const manifest=JSON.parse(fs.readFileSync(path.join(source,'MANIFEST.json')));
 const safe=name=>typeof name==='string'&&!path.isAbsolute(name)&&!name.includes('\\')&&!name.split('/').some(p=>!p||p==='.'||p==='..'||p==='.git')&&!/\.nnue$/.test(name);
 const dest=path.join(target,'source');
 if(fs.existsSync(dest)&&fs.lstatSync(dest).isSymbolicLink())throw Error('Symlink destination');
 const checkParents=(root,name)=>{let cur=root;for(const part of name.split('/')){cur=path.join(cur,part);if(fs.existsSync(cur)&&fs.lstatSync(cur).isSymbolicLink())throw Error('Symlink rejected: '+name);}};
 const names=Object.keys(manifest.files);
 for(const name of names){if(!safe(name))throw Error('Unsafe source path');checkParents(source,name);const b=fs.readFileSync(path.join(source,name)),v=manifest.files[name];if(b.length!==v.bytes||createHash('sha256').update(b).digest('hex')!==v.sha256)throw Error('Source integrity: '+name);checkParents(dest,name);}
 let old=[];if(fs.existsSync(path.join(dest,'MANIFEST.json'))){checkParents(dest,'MANIFEST.json');old=Object.keys(JSON.parse(fs.readFileSync(path.join(dest,'MANIFEST.json'))).files);}
 for(const name of old){if(!safe(name))throw Error('Unsafe previous manifest');checkParents(dest,name);}
 for(const name of old)if(!Object.hasOwn(manifest.files,name)){const p=path.join(dest,name);if(fs.existsSync(p))fs.unlinkSync(p);}
 for(const name of ['MANIFEST.json',...names]){checkParents(dest,name);const p=path.join(dest,name);fs.mkdirSync(path.dirname(p),{recursive:true});fs.copyFileSync(path.join(source,name),p);}
 checkParents(target,'release.json');fs.writeFileSync(path.join(target,'release.json'),JSON.stringify({sourceCommit:commit})+'\n');
 return {files:names.length+1,sourceCommit:commit};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(prepareRelease(process.argv[2],process.argv[3],process.argv[4])));
