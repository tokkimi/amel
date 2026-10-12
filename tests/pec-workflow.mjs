import assert from 'node:assert/strict';
import {randomUUID,randomBytes} from 'node:crypto';
import {createTestDatabase} from '../scripts/local-test-db.mjs';
import {hash,passwordHash} from '../server/security.mjs';
import {jsPDF} from 'jspdf';
import {pecAmounts,automaticSummary} from '../shared/pec.mjs';
const {sql}=await createTestDatabase();const {default:handler}=await import('../api/index.mjs');
const users={};
try{
 for(const [who,role] of [['admin','admin'],['cabinet','professional'],['other','professional']]){const id=randomUUID(),token=randomBytes(32).toString('hex');users[who]={id,token};await sql`INSERT INTO accounts(id,email,name,role,password_hash,recovery_hash) VALUES(${id},${who+'@example.invalid'},${who},${role},${await passwordHash('LocalRandom'+randomUUID())},'test')`;await sql`INSERT INTO profiles(account_id,clinic_name) VALUES(${id},${who})`;await sql`INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(${hash(token)},${id},now()+interval '1 hour')`;}
 async function call(who,action,body,query={}){let status=200,data;await handler({method:body===undefined?'GET':'POST',url:'/api',query:{action,...query},headers:{host:'localhost:3001',origin:'http://localhost:3001','content-type':'application/json',cookie:'amelib_session='+users[who].token},body},{setHeader(){},status(s){status=s;return this},json(d){data=d}});return {status,data}}
 const workspace={workspace:users.cabinet.id};
 const ok=async(action,body,query=workspace)=>{const r=await call('admin',action,body,query);assert.equal(r.status,200,JSON.stringify(r));return r.data};
 const file='data:application/pdf;base64,JVBERi0xLjQKJUVPRg==';
 const docs=[{kind:'devis',name:'Devis.pdf',url:file},{kind:'mutuelle',name:'Mutuelle.pdf',url:file},{kind:'accord',name:'Accord.pdf',url:file},{kind:'autre',name:'Capture.pdf',url:file}];
 const sources={initial_quote:1000,initial_patient_share:200,final_quote:1000,final_social_security_amount:150,final_mutual_amount:850,initial_mutual_amount:650,optimization_validated:true,financial_date:'2026-10-12',business_status:'agreed'};
 assert.deepEqual(pecAmounts({...sources,dossier_type:'pec'}),{total_reimbursed:1000,patient_share:0,optimization_gain:200,mutual_optimization:200,eligible:true,optimized:true,billed_amount:1000});
 const saved=await ok('cc-pec-save',{title:'Patient fictif',stage:'ACCORD PEC',act_codes:'C MONO 23',valid_until:'2026-12-31',description:'Notes à conserver',attachments:docs,...sources});
 let read=await ok('cc-pec-read',undefined,{...workspace,id:saved.id});assert.equal(read.task.optimization_gain,200);assert(read.task.optimized);assert(read.task.automatic_summary.includes('Pas de RÀC'));assert(read.task.automatic_summary.includes('Accord enregistré'));assert(read.history.length);
 // PostgreSQL timestamps have microseconds; preserve the exact token when guarding writes.
 await sql.query("UPDATE tasks SET updated_at='2026-10-13 10:20:30.123456+00'::timestamptz WHERE id=$1",[saved.id]);
 read=await ok('cc-pec-read',undefined,{...workspace,id:saved.id});await ok('cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'ACCORD PEC',expected_version:read.task.revision_token,save_mode:'draft'});
 const initialHistory=read.history.length;await ok('cc-pec-stage',{id:saved.id,stage:'DOSSIER EN ERREUR'});read=await ok('cc-pec-read',undefined,{...workspace,id:saved.id});assert.equal(read.task.business_status,'agreed');assert.equal(read.task.attachments.length,4);assert(read.task.optimized);assert(read.history.length>initialHistory);
 await ok('cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'DOSSIER EN ERREUR',attachments:docs.filter(d=>!['accord','mutuelle'].includes(d.kind)),documents_validated:false,save_mode:'draft'});
 await ok('cc-pec-stage',{id:saved.id,stage:'ACCORD PEC'});read=await ok('cc-pec-read',undefined,{...workspace,id:saved.id});assert.equal(read.task.description,'Notes à conserver');assert.equal(Number(read.task.initial_quote),1000);assert(!read.task.automatic_summary.includes('Accord enregistré'));
 assert.equal((await call('admin','cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'ACCORD PEC',documents_validated:true},workspace)).status,400);
 assert.equal((await call('admin','cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'ACCORD PEC',expected_updated_at:'2020-01-01T00:00:00Z'},workspace)).status,409);
 await ok('cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'PEC À FACTURER',save_mode:'draft'});read=await ok('cc-pec-read',undefined,{...workspace,id:saved.id});assert(!read.task.invoice_number);assert(!read.task.invoice_date);
 assert.equal((await call('admin','cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'PEC À FACTURER',billing_status:'Facturé'},workspace)).status,400);
 await ok('cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'PEC FACTURÉE',billing_status:'Facturé',invoice_date:'2026-10-13',invoice_number:'F-TEST-001',billing_amount:950,billing_notes:'Relance libre',save_mode:'draft'});
 assert.equal((await call('admin','cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'PEC PAYÉE',billing_status:'En banque'},workspace)).status,400);
 await ok('cc-pec-save',{id:saved.id,title:'Patient fictif',stage:'RAPPROCHEMENT FAIT',billing_status:'Rapprochement fait',transfer_date:'2026-10-14',transfer_amount:925,save_mode:'draft'});
 read=await ok('cc-pec-read',undefined,{...workspace,id:saved.id});assert.equal(read.task.billing_notes,'Relance libre');assert.equal(Number(read.task.billing_amount),950);assert.equal(Number(read.task.transfer_amount),925);assert.equal(read.task.optimization_gain,200);assert.equal(Number(read.task.recovered_amount),0);
 const estimation=await ok('cc-pec-save',{title:'Estimation fictive',stage:'ESTIMATION À FAIRE',save_mode:'draft',attachments:[],dossier_type:'estimation',initial_quote:500,final_quote:600,financial_date:'2026-10-12'});
 await ok('cc-pec-stage',{id:estimation.id,stage:'ACCORD ESTIM'});
 assert.equal((await call('admin','cc-pec-stage',{id:estimation.id,stage:'PEC À FACTURER'},workspace)).status,400);
 await ok('cc-pec-save',{id:estimation.id,title:'Estimation fictive',stage:'ACCORD ESTIM',business_status:'agreed',save_mode:'draft'});
 let report=await ok('cc-pec-report',undefined,{...workspace,year:2026});assert.equal(report.details.length,1);assert.equal(report.details[0].optimization_gain,200);
 const linked=await ok('cc-pec-save',{title:'PEC après estimation',source_estimation_id:estimation.id,dossier_type:'pec',stage:'PEC À FAIRE',save_mode:'draft',attachments:[]});assert.notEqual(linked.id,estimation.id);read=await ok('cc-pec-read',undefined,{...workspace,id:linked.id});assert.equal(read.task.source_estimation_id,estimation.id);
 assert.equal((await call('admin','cc-pec-save',{title:'Mauvaise liaison',source_estimation_id:estimation.id,stage:'PEC À FAIRE',save_mode:'draft'}, {workspace:users.other.id})).status,400);
 const pdf=new jsPDF();pdf.text('Fictitious PEC report',10,10);const reportFile={name:'Bilan fictif.pdf',data:'data:application/pdf;base64,'+pdf.output('datauristring').split(',')[1]};
 const transmission=await ok('cc-pec-report-send',{cabinet_id:users.cabinet.id,period:'octobre 2026',attachment:reportFile,send_email:false},{});const received=(await call('cabinet','support')).data.tickets.find(t=>t.id===transmission.ticket_id);assert.equal(received.messages[0].attachments[0].data,reportFile.data);
 const list=await ok('cc-pec-list');assert.equal(list.total,3);assert(!JSON.stringify(list).includes('base64,'));assert(list.tasks.find(t=>t.id===saved.id).attachments[0].has_data);
 const cabinet=await call('cabinet','dashboard');assert.equal(cabinet.status,200);const safe=cabinet.data.tasks.find(t=>t.id===saved.id);for(const k of ['initial_quote','initial_patient_share','billing_amount','invoice_number','optimization_gain','optimized','transfer_amount'])assert(!Object.hasOwn(safe,k),'Cabinet financial leak: '+k);assert(!safe.automatic_summary.includes('Gain'));assert.equal((await call('cabinet','cc-pec-read',undefined,{...workspace,id:saved.id})).status,403);
 const overview=await ok('cc-pec-overview',undefined,{});assert(overview.stages.some(s=>s.stage==='ACCORD ESTIM'));assert.equal(overview.financial.optimization_gain,200);
 assert(!automaticSummary({business_status:'agreed',attachments:[]},false).includes('Accord enregistré'));
 console.log('PASS: 7 PEC requirements, exact gains, billing separation, estimation exclusion/link, multiple documents, missing-piece movement, retained notes, audit, conflict guard, lightweight board and financial isolation.');
}finally{await sql.end()}
