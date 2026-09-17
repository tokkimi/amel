import fs from 'node:fs';
for (const name of ['Portal','Workspace','ProSuite','AdminConsole']) {
 const p=`src/${name}.tsx`;let s=fs.readFileSync(p,'utf8');
 s=s.replace(/(<a className="brand" href="\/">)[\s\S]*?(<\/a>)/g,'$1<img className="brand-full-logo" src="/smilepec-logo.png" alt="SmilePec" />$2');fs.writeFileSync(p,s);
}
let p='src/Experience.tsx',s=fs.readFileSync(p,'utf8');s=s.replace('<img src="/smilepec-emblem.png" alt="" />','<img src="/smilepec-logo.png" alt="SmilePec" />').replace(/\s*<h1>\s*SmilePec\s*<\/h1>/,'');fs.writeFileSync(p,s);
p='public/manifest.webmanifest';let m=JSON.parse(fs.readFileSync(p,'utf8'));m.icons=[{src:'/smilepec-emblem.png',sizes:'1280x1280',type:'image/png',purpose:'any'}];fs.writeFileSync(p,JSON.stringify(m,null,2));
p='index.html';s=fs.readFileSync(p,'utf8').replace('<link rel="manifest"','<link rel="icon" type="image/png" href="/smilepec-emblem.png" />\n    <link rel="apple-touch-icon" href="/smilepec-emblem.png" />\n    <link rel="manifest"');fs.writeFileSync(p,s);
