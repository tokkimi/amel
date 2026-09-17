import fs from 'node:fs';
// Replace legacy cool UI colors in their owning styles, preserving alpha and luminance.
for (const file of fs.readdirSync('src').filter(f=>f.endsWith('.css'))) {
  const path='src/'+file;
  const warm=(r,g,b,a='')=>{
    const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
    if(!d)return null;
    let h=max===r?((g-b)/d)%6:max===g?(b-r)/d+2:(r-g)/d+4;h=(h*60+360)%360;
    if(h<175||h>285)return null;
    const l=(max+min)/510,s=Math.min(.30,d/(255-Math.abs(max+min-255)));
    const c=(1-Math.abs(2*l-1))*s,x=c*.5,m=l-c/2;
    return [c+m,x+m,m].map(v=>Math.round(v*255));
  };
  let count=0;
  let css=fs.readFileSync(path,'utf8').replace(/#([\da-f]{8}|[\da-f]{6}|[\da-f]{4}|[\da-f]{3})(?![\da-f])/gi,(all,hex)=>{
    if(hex.length<5)hex=[...hex].map(c=>c+c).join('');
    const rgb=warm(...[0,2,4].map(i=>parseInt(hex.slice(i,i+2),16)));
    if(!rgb)return all;count++;return '#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('')+hex.slice(6);
  }).replace(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(\s*,\s*[\d.]+)?\s*\)/g,(all,r,g,b,a='')=>{const rgb=warm(+r,+g,+b);if(!rgb)return all;count++;return `${a?'rgba':'rgb'}(${rgb.join(',')}${a})`});
  fs.writeFileSync(path,css);console.log(file+': '+count+' couleurs harmonisées');
}
