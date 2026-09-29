import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createTestDatabase} from '../scripts/local-test-db.mjs';
import {hash,passwordHash} from '../server/security.mjs';
const {sql}=await createTestDatabase();
const {default:handler}=await import('../api/index.mjs');
const people={};
try{
 for(const [key,role] of [['amel','admin'],['support','admin'],['cabinet','professional'],['other','professional']]){
  const id=randomUUID(),token=randomBytes(32).toString('hex');people[key]={id,token};
  await sql`INSERT INTO accounts(id,email,name,role,password_hash,recovery_hash) VALUES(${id},${key+'@example.invalid'},${key},${role},${await passwordHash(randomBytes(24).toString('hex'))},'test')`;
  await sql`INSERT INTO profiles(account_id,clinic_name) VALUES(${id},${key})`;
  await sql`INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(${hash(token)},${id},now()+interval '1 hour')`;
 }
 await sql`INSERT INTO admin_members(account_id,internal_role) VALUES(${people.support.id},'support_agent')`;
 async function call(who,action,body,query={}){let status=200,data;await handler({method:body?'POST':'GET',url:'/api',query:{action,...query},headers:{host:'localhost:3001',origin:'http://localhost:3001','content-type':'application/json',cookie:'amelib_session='+people[who].token},body},{setHeader(){},status(s){status=s;return this},json(d){data=d}});return {status,data}}
 const ok=async(...args)=>{const r=await call(...args);assert.equal(r.status,200,JSON.stringify(r));return r.data};
 assert.equal((await call('cabinet','billing-clients')).status,403);
 assert.equal((await call('support','billing-clients')).status,403);
 const client=await ok('amel','billing-client-save',{name:'Cabinet client',email:'billing@example.invalid',monthly_amount:100});
 await sql`INSERT INTO billing_invoices(stripe_invoice_id,client_id,status,amount_due,amount_paid,issued_at) VALUES('local-invoice',${client.id},'open',10000,2000,now())`;
 await sql`INSERT INTO business_documents(id,owner_id,patient_id,doc_type,number,status,total) VALUES(${randomUUID()},${people.cabinet.id},${people.other.id},'invoice','PATIENT-TEST','sent',9999)`;
 const home=await ok('amel','cc-home');assert.equal(home.counts.outstanding,80);
 const finance=await ok('amel','cc-finance');assert.equal(finance.platform.invoiced,100);assert.equal(finance.platform.collected,20);assert.equal(finance.totals.invoiced,9999);
 assert.equal((await ok('amel','cc-analytics')).finance.invoiced,100);
 const workspace={workspace:people.cabinet.id};
 assert.equal((await call('support','cc-pec-list',undefined,workspace)).status,403);
 assert.equal((await call('cabinet','cc-pec-list',undefined,workspace)).status,403);
 assert.equal((await call('amel','cc-pec-list')).status,400);
 assert.equal((await call('amel','dashboard',undefined,workspace)).status,403);
 const file='data:application/pdf;base64,JVBERi0xLjQKJUVPRg==';
 const task={title:'Patient test local',stage:'ACCORD PEC',attachments:[{kind:'devis',name:'Devis.pdf',url:file},{kind:'mutuelle',name:'Mutuelle.pdf',url:file}],initial_quote:100,final_quote:250,recovered_amount:125,financial_date:'2026-09-29'};
 const saved=await ok('amel','cc-pec-save',task,workspace);
 await ok('amel','cc-pec-stage',{id:saved.id,stage:'PEC À FACTURER'},workspace);
 assert.equal((await ok('amel','cc-pec-list',undefined,workspace)).tasks[0].stage,'PEC À FACTURER');
 assert.equal((await ok('amel','cc-pec-list',undefined,{workspace:people.other.id})).tasks.length,0);
 assert.equal((await call('amel','cc-pec-stage',{id:saved.id,stage:'PEC PAYÉE'},{workspace:people.other.id})).status,404);
 await ok('cabinet','support-create',{subject:'Discussion',body:'Bonjour Amel'});
 const ticket=(await ok('cabinet','support')).tickets[0];
 await ok('amel','cc-ticket-reply',{id:ticket.id,visibility:'internal',body:'NOTE PRIVEE'});
 await ok('amel','cc-ticket-reply',{id:ticket.id,visibility:'public',body:'Bonjour cabinet'});
 await ok('cabinet','support-reply',{id:ticket.id,body:'Merci Amel'});
 const thread=await ok('cabinet','support');assert(!JSON.stringify(thread).includes('NOTE PRIVEE'));assert.equal(thread.tickets[0].messages.length,2);
 assert.equal((await call('other','support-reply',{id:ticket.id,body:'Intrusion'})).status,404);
 console.log('PASS: Amel/cabinets separation, revenue isolation, PEC scoping, roles, public thread and private notes.');
}finally{await sql.end()}
