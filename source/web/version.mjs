export function readableVersion(version,{timeZone}={}){
 const commit=typeof version?.commit==='string'&&/^[a-f0-9]{40}$/.test(version.commit)?version.commit.slice(0,12):null;
 // A missing timestamp must not be substituted with the viewer's current time.
 const timestamp=typeof version?.builtAt==='string'&&/Z$|[+-]\d\d:\d\d$/.test(version.builtAt)?Date.parse(version.builtAt):NaN;
 const date=Number.isFinite(timestamp)?new Intl.DateTimeFormat('zh-CN',{year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23',timeZoneName:'short',...(timeZone?{timeZone}:{})}).format(new Date(timestamp)):null;
 return (commit?'版本 '+commit:'版本未知')+' · '+(date?'构建于 '+date:'构建时间未知');
}
