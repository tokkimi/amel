// Isolated local preview. Never imports .env.local or contacts production services.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {createTestDatabase} from './local-test-db.mjs';
import {passwordHash} from '../server/security.mjs';
const {sql}=await createTestDatabase();
const {default:handler}=await import('../api/index.mjs');
const password='DemoLocale!2026';const ids={};
for(const [key,name,role] of [['amel','Amel · démonstration locale','admin'],['cabinet','Dr Camille · démonstration locale','professional'],['second','Dr Alex · démonstration locale','professional']]){
 const id=randomUUID();ids[key]=id;
 await sql`INSERT INTO accounts(id,email,name,role,password_hash,recovery_hash) VALUES(${id},${key+'@demo.invalid'},${name},${role},${await passwordHash(password)},'local-demo')`;
 await sql`INSERT INTO profiles(account_id,clinic_name,city) VALUES(${id},${key==='amel'?'SmilePec':key==='cabinet'?'Cabinet Rivoli · démo':'Cabinet Lumière · démo'},'Démonstration')`;
}
const task=randomUUID(),file='data:application/pdf;base64,JVBERi0xLjQKJUVPRg==';
await sql`INSERT INTO tasks(id,owner_id,title,plan_name,stage,attachments,initial_quote,final_quote,recovered_amount,financial_date,practitioner_id) VALUES(${task},${ids.cabinet},'Patient exemple · fictif','Plan 1 · exemple','ACCORD PEC',${JSON.stringify([{kind:'devis',name:'Devis exemple.pdf',url:file},{kind:'mutuelle',name:'Mutuelle exemple.pdf',url:file}])}::jsonb,100,250,125,current_date,${ids.cabinet})`;
await sql`INSERT INTO support_tickets(id,account_id,subject,body) VALUES(${randomUUID()},${ids.cabinet},'Demande de suivi · exemple','Bonjour Amel, pouvez-vous nous accompagner sur ce dossier de démonstration ?')`;
const client=randomUUID();await sql`INSERT INTO billing_clients(id,owner_id,name,email,monthly_amount,service_label) VALUES(${client},${ids.amel},'Cabinet Rivoli · démo','cabinet@demo.invalid',12000,'Accompagnement mensuel · exemple')`;
const root=resolve(fileURLToPath(new URL('../dist',import.meta.url)));
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp'};
createServer(async(req,res)=>{
 try{
 const url=new URL(req.url,'http://127.0.0.1:3001');
 if(url.pathname==='/api'){
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>4500000){res.writeHead(413);res.end();return}}
 const body=raw?JSON.parse(raw):undefined;
 return handler(Object.assign(req,{query:Object.fromEntries(url.searchParams),body}),{setHeader(k,v){res.setHeader(k,k==='Set-Cookie'?v.replace('; Secure',''):v)},status(code){res.statusCode=code;return this},json(data){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}});
 }
 const path=resolve(root,'.'+decodeURIComponent(url.pathname));if(!path.startsWith(root)){res.writeHead(403);res.end();return}
 let file=extname(path)?path:resolve(root,'index.html');let data;try{data=await readFile(file)}catch{file=resolve(root,'index.html');data=await readFile(file)}res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');res.end(data);
 }catch{res.writeHead(500);res.end('Erreur aperçu local')}
}).listen(3001,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:3001/admin — amel@demo.invalid / '+password+' — données fictives locales uniquement'));
