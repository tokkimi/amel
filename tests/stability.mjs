import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {sql} from './db.mjs';
import handler from '../api/index.mjs';
const ids=[];const nonce=randomUUID();
async function call(action,body,cookie=''){const [name,...params]=action.split('&');const req={method:body===undefined?'GET':'POST',url:'/api',query:{action:name,...Object.fromEntries(new URLSearchParams(params.join('&')))},headers:{host:'amelib.vercel.app',origin:'https://amelib.vercel.app','content-type':'application/json','x-vercel-forwarded-for':'test-'+nonce,cookie},body};let code=200,headers={};let result;const res={setHeader(k,v){headers[k]=v},status(c){code=c;return this},json(data){result=data;return this}};await handler(req,res);return {status:code,body:result,cookie:headers['Set-Cookie']?.split(';')[0]};}
async function signup(role){const email=`amelib-test-${randomUUID()}@example.invalid`,password=randomBytes(24).toString('base64url');const r=await call('signup',{email,password,name:'Integration test '+role,role:'professional'});assert.equal(r.status,200,JSON.stringify(r.body));ids.push(r.body.account.id);if(role==='patient') await sql`UPDATE accounts SET role='patient' WHERE id=${r.body.account.id}`;return {...r.body,email,password,cookie:r.cookie};}
const future=new Date(Date.now()+5*86400000);future.setUTCMinutes(0,0,0);
try {
 const pro=await signup('professional'), patient=await signup('patient');
 const slot=await call('slot-create',{starts_at:future.toISOString(),duration:30},pro.cookie);
 assert.equal(slot.status,200,JSON.stringify(slot.body));
 const appointmentId=randomUUID();
 await sql`INSERT INTO appointments(id,slot_id,patient_id,professional_id,reason,status) VALUES(${appointmentId},${slot.body.id},${patient.account.id},${pro.account.id},'Stability regression','confirmed')`;
 await sql`DELETE FROM patient_records WHERE owner_id=${pro.account.id} AND patient_id=${patient.account.id}`;
 const created=await call('document-create',{patient_id:patient.account.id,appointment_id:appointmentId,doc_type:'quote',items:[{label:'Test uniquement',quantity:1,unitPrice:10,vat:0}]},pro.cookie);
 assert.equal(created.status,200,JSON.stringify(created.body));
 const first=await call('assistant',{question:'Quels rendez-vous à venir ?'},pro.cookie);
 assert.equal(first.status,200);assert.match(first.body.answer,/Integration test/);
 const follow=await call('assistant',{question:'Et plus de détails ?',history:['Quels rendez-vous à venir ?']},pro.cookie);
 assert.equal(follow.status,200);assert.deepEqual(follow.body.sources,['Votre agenda']);
 const tasksFollow=await call('assistant',{question:'Et plus de détails ?',history:['Qu’ai-je à faire aujourd’hui ?']},pro.cookie);
 assert.deepEqual(tasksFollow.body.sources,['Vos tâches']);
 const names=await call('assistant',{question:'Quel est le nom de mon patient ?'},pro.cookie);
 assert.equal(names.status,200);assert.match(names.body.answer,/Aucune fiche patient/);
 assert.equal((await call('assistant',{question:'Mes patients'},patient.cookie)).body.sources[0],'Vos rendez-vous');
 await sql`DELETE FROM business_documents WHERE owner_id=${pro.account.id}`;
 const file='data:application/pdf;base64,JVBERi0xLjQKJUVPRg==';
 const task={title:'Dossier PEC test',stage:'PEC À FAIRE',description:'Commentaire test',impression_date:'2026-10-01',placement_date:'2026-10-20',attachments:[{kind:'devis',name:'Devis nominatif.pdf',url:file},{kind:'mutuelle',name:'Mutuelle nominative.pdf',url:file}]};
 assert.equal((await call('task-save',{...task,attachments:task.attachments.slice(0,1)},pro.cookie)).status,400);
 const saved=await call('task-save',task,pro.cookie);assert.equal(saved.status,200,JSON.stringify(saved.body));
 const stage=await call('task-stage',{id:saved.body.id,stage:'PEC PAYÉE'},pro.cookie);assert.equal(stage.status,200,JSON.stringify(stage.body));
 const otherPro=await signup('professional');
 assert.equal((await call('task-stage',{id:saved.body.id,stage:'PEC FACTURÉE'},otherPro.cookie)).status,404);
 assert.equal((await call('dashboard&workspace='+pro.account.id,undefined,otherPro.cookie)).status,403);
 const amounts={initial_quote:100.25,final_quote:250.75,recovered_amount:120.50,financial_date:'2026-09-15',practitioner_id:pro.account.id};
 const child=await call('task-save',{...task,...amounts,parent_task_id:saved.body.id,plan_name:'Second plan'},pro.cookie);assert.equal(child.status,200,JSON.stringify(child.body));
 assert.equal((await call('task-save',{...task,parent_task_id:saved.body.id},otherPro.cookie)).status,400);
 assert.equal((await call('task-save',{...task,parent_task_id:child.body.id},pro.cookie)).status,400);
 assert.equal((await call('task-save',{...task,...amounts,initial_quote:-1},pro.cookie)).status,400);
 assert.equal((await call('task-save',{...task,...amounts,financial_date:''},pro.cookie)).status,400);
 const report=await call('pec-report&year=2026',undefined,pro.cookie);assert.equal(report.status,200,JSON.stringify(report.body));assert.equal(Number(report.body.rows[0].difference),150.5);assert.equal(Number(report.body.rows[0].recovered),120.5);assert.equal(report.body.rows[0].plans,1);
 assert.deepEqual((await call('pec-report&year=2026',undefined,otherPro.cookie)).body.rows,[]);
 assert.deepEqual((await call('pec-report&year=2025',undefined,pro.cookie)).body.rows,[]);
 assert.equal((await call('task-save',{...task,...amounts,id:child.body.id,stage:'ACCORD PEC'},pro.cookie)).status,200);
 assert.equal((await call('task-save',{...task,...amounts,id:child.body.id,stage:'PEC À FACTURER'},pro.cookie)).status,200);
 const [childRow]=await sql`SELECT parent_task_id,stage FROM tasks WHERE id=${child.body.id}`;assert.equal(childRow.parent_task_id,saved.body.id);assert.equal(childRow.stage,'PEC À FACTURER');
 console.log('PASS: sous-fiches, facturer, montants, bilan annuel/mensuel et isolation.');
 assert.equal((await call('billing-clients',undefined,pro.cookie)).status,403);
 const incomplete=await call('patient-create',{name:'Test',insurance_card_data:file,insurance_card_name:'Mutuelle.pdf'},pro.cookie);assert.equal(incomplete.status,400);
 const newPatient=await call('patient-create',{name:'Patient test',email:'amelib-test-'+randomUUID()+'@example.invalid',insurance_card_data:file,insurance_card_name:'Mutuelle.pdf',quote_document_data:file,quote_document_name:'Devis.pdf'},pro.cookie);assert.equal(newPatient.status,200,JSON.stringify(newPatient.body));ids.push(newPatient.body.patient_id);
 console.log('PASS: chat, devis, 2 pièces obligatoires, statuts PEC, isolation des cabinets et clients de facturation.');
}finally{
 for(const id of ids){await sql`DELETE FROM tasks WHERE owner_id=${id} AND parent_task_id IS NOT NULL`;await sql`DELETE FROM audit_log WHERE actor_id=${id}`;await sql`DELETE FROM messages WHERE appointment_id IN(SELECT id FROM appointments WHERE patient_id=${id} OR professional_id=${id})`;await sql`DELETE FROM appointments WHERE patient_id=${id} OR professional_id=${id}`;await sql`DELETE FROM slots WHERE professional_id=${id}`;await sql`DELETE FROM accounts WHERE id=${id} AND email LIKE 'amelib-test-%@example.invalid'`;}
 await sql`DELETE FROM rate_limits WHERE key=${'auth-ip:'+ (await import('../server/security.mjs')).hash('test-'+nonce)}`;
 console.log('Test-created accounts and records removed.');await sql.end?.();
}
