import {randomUUID} from 'node:crypto';
import {clean} from './security.mjs';
import {auditEntry,redact} from './audit.mjs';
import {PEC_STAGES,BILLING_STAGES,BILLING_STATUSES,BUSINESS_STATUSES,DOCUMENT_KINDS,pecAmounts,automaticSummary} from '../shared/pec.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
export const FINANCIAL_FIELDS=['initial_quote','final_quote','initial_patient_share','recovered_amount','initial_social_security_amount','final_social_security_amount','initial_mutual_amount','final_mutual_amount','financial_date','practitioner_id','optimization_validated','billing_type','billing_amount','billing_status','invoice_date','invoice_number','transfer_date','transfer_amount','billing_notes'];
export function presentTask(task,financial=true){
 const visible={...task};
 if(!financial)for(const key of FINANCIAL_FIELDS)delete visible[key];
 return {...visible,...(financial?pecAmounts(task):{}),automatic_summary:automaticSummary(task,financial)};
}
const date=value=>{if(!value)return null;const s=(value instanceof Date?value.toISOString():String(value)).slice(0,10);if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw fail(400,'Date invalide.');return s;};
const amount=(value,nullable=false)=>{if(nullable&&(value==null||value===''))return null;const n=Number(value||0);if(!Number.isFinite(n)||n<0||n>100000000)throw fail(400,'Montant invalide : utilisez une valeur positive inférieure à 100 millions.');return Math.round(n*100)/100;};
const bool=value=>value===true||value==='true'||value==='on';
const attachmentsOf=value=>{
 if(!Array.isArray(value)||value.length>20)throw fail(400,'Ajoutez au maximum 20 documents.');
 const docs=value.map(a=>{const url=typeof a.url==='string'?a.url:'';if(!/^data:(?:image\/(?:png|jpeg|webp)|application\/pdf);base64,[a-z0-9+/=]+$/i.test(url)||url.length>1800000||!clean(a.name,180))throw fail(400,'Document invalide : PDF ou image de 1,2 Mo maximum.');return {id:uuid(a.id)?a.id:randomUUID(),kind:Object.hasOwn(DOCUMENT_KINDS,a.kind)?a.kind:'autre',name:clean(a.name,180),url};});
 if(JSON.stringify(docs).length>3900000)throw fail(400,'Les pièces jointes totalisent trop de données. Réduisez leur taille (2,8 Mo au total).');
 return docs;
};
const auditSnapshot=t=>Object.fromEntries(['id','stage','dossier_type','source_estimation_id','business_status','agreement_confirmed','documents_validated','valid_until','act_codes',...FINANCIAL_FIELDS].map(k=>[k,t[k]??null]));

export async function savePec({action,b,sql,account,workspaceId,can,ctx}){
 if(!PEC_STAGES.includes(b.stage))throw fail(400,'Choisissez une colonne PEC valide.');
 let existing;
 if(b.id){if(!uuid(b.id))throw fail(400,'Fiche invalide.');[existing]=await sql.query('SELECT *,updated_at::text AS revision_token FROM tasks WHERE id=$1 AND owner_id=$2',[b.id,workspaceId]);if(!existing)throw fail(404,'Fiche introuvable dans ce cabinet.');}
 if(existing&&b.expected_version&&b.expected_version!==existing.revision_token)throw fail(409,'Cette fiche a été modifiée depuis son ouverture. Rechargez-la avant d’enregistrer.');
 if(existing&&b.expected_updated_at&&new Date(b.expected_updated_at).getTime()!==new Date(existing.updated_at).getTime())throw fail(409,'Cette fiche a été modifiée depuis son ouverture. Rechargez-la avant d’enregistrer.');
 const financial=account.role==='admin'&&can('billing');
 if(!financial&&FINANCIAL_FIELDS.some(k=>Object.hasOwn(b,k)))throw fail(403,'Les montants d’optimisation et la facturation PEC sont réservés à SmilePec.');
 const choose=(key,fallback)=>Object.hasOwn(b,key)?b[key]:existing?.[key]??fallback;
 const type=existing?.dossier_type||choose('dossier_type',['ESTIMATION À FAIRE','ACCORD ESTIM'].includes(b.stage)?'estimation':'pec');
 if(!['pec','estimation'].includes(type))throw fail(400,'Type de dossier invalide.');
 if(type==='estimation'&&(BILLING_STAGES.includes(b.stage)||b.stage==='ACCORD PEC'))throw fail(400,'Créez une PEC liée à l’estimation avant de la facturer ou de la classer en accord PEC.');
 if(type==='pec'&&b.stage==='ACCORD ESTIM')throw fail(400,'Accord estim est réservé aux estimations.');
 if(action==='task-stage'){
  if(!existing)throw fail(404,'Fiche introuvable.');
  const writes=[sql.query('UPDATE tasks SET stage=$1,updated_at=now() WHERE id=$2 AND owner_id=$3',[b.stage,b.id,workspaceId]),auditEntry(sql,ctx,{actorId:account.id,action:'pec_stage_changed',entityType:'pec',entityId:b.id,tenantId:workspaceId,before:{stage:existing.stage},after:{stage:b.stage},detail:'Colonne du dossier modifiée'})];
  await sql.transaction(writes);return {ok:true};
 }
 const title=clean(choose('title',''),200);if(!title)throw fail(400,'Indiquez le nom du patient.');
 const attachments=attachmentsOf(choose('attachments',[]));
 const complete=['devis','mutuelle'].every(kind=>attachments.some(a=>a.kind===kind));
 const validated=bool(choose('documents_validated',existing?false:b.save_mode!=='draft'));
 if((validated||(!existing&&b.save_mode!=='draft'))&&!complete)throw fail(400,'Les documents nominatifs Devis et Mutuelle sont obligatoires pour valider la fiche. Enregistrez un brouillon pour compléter les pièces plus tard.');
 const patient=choose('patient_id',null);if(patient){if(!uuid(patient))throw fail(400,'Patient invalide.');const [linked]=await sql.query('SELECT 1 FROM patient_records WHERE owner_id=$1 AND patient_id=$2',[workspaceId,patient]);if(!linked)throw fail(403,'Ce patient n’appartient pas au cabinet.');}
 const assigneeId=choose('assignee_id',null)||null;let assignee='';
 if(assigneeId){const [member]=await sql.query('SELECT a.name FROM accounts a WHERE a.id=$1 AND (a.id=$2 OR EXISTS(SELECT 1 FROM clinic_members cm WHERE cm.owner_id=$2 AND cm.member_id=a.id AND cm.active AND cm.accepted))',[assigneeId,workspaceId]);if(!member)throw fail(403,'Ce responsable n’appartient pas au cabinet.');assignee=member.name;}
 const parentId=existing?.parent_task_id||(uuid(b.parent_task_id)?b.parent_task_id:null);
 if(b.parent_task_id&&!uuid(b.parent_task_id))throw fail(400,'Fiche parent invalide.');
 if(parentId){const [parent]=await sql.query('SELECT id FROM tasks WHERE id=$1 AND owner_id=$2 AND parent_task_id IS NULL',[parentId,workspaceId]);if(!parent)throw fail(400,'La fiche parent doit appartenir au même cabinet.');}
 const source=existing?.source_estimation_id||(uuid(b.source_estimation_id)?b.source_estimation_id:null);
 if(b.source_estimation_id&&!uuid(b.source_estimation_id))throw fail(400,'Estimation d’origine invalide.');
 if(source){if(type!=='pec')throw fail(400,'Une estimation ne peut pas avoir une estimation d’origine.');const [origin]=await sql.query("SELECT id FROM tasks WHERE id=$1 AND owner_id=$2 AND dossier_type='estimation' AND business_status='agreed'",[source,workspaceId]);if(!origin)throw fail(400,'Choisissez une estimation accordée de ce cabinet.');}
 const business=choose('business_status',b.stage==='ACCORD PEC'?'agreed':'pending');if(!BUSINESS_STATUSES.includes(business))throw fail(400,'Statut métier invalide.');
 const next={id:existing?.id||randomUUID(),owner_id:workspaceId,title,description:clean(choose('description',''),5000),stage:b.stage,assignee,assignee_id:assigneeId,patient_id:patient||null,attachments,impression_date:date(choose('impression_date',null)),placement_date:date(choose('placement_date',null)),parent_task_id:parentId,plan_name:clean(choose('plan_name',''),180),dossier_type:type,source_estimation_id:source,business_status:business,agreement_confirmed:bool(choose('agreement_confirmed',false)),documents_validated:validated&&complete,valid_until:date(choose('valid_until',null)),act_codes:clean(choose('act_codes',''),600),mutual_provider:clean(choose('mutual_provider',''),180)};
 next.due_at=next.placement_date||next.impression_date;
 for(const key of ['initial_quote','final_quote','recovered_amount','initial_patient_share','initial_social_security_amount','final_social_security_amount','initial_mutual_amount','final_mutual_amount'])next[key]=amount(choose(key,0));
 for(const key of ['billing_amount','transfer_amount'])next[key]=amount(choose(key,null),true);
 for(const key of ['financial_date','invoice_date','transfer_date'])next[key]=date(choose(key,null));
 next.practitioner_id=choose('practitioner_id',null)||null;
 if(next.practitioner_id){const [practitioner]=await sql.query("SELECT id FROM accounts a WHERE a.id=$1 AND (a.id=$2 OR (a.role='professional' AND EXISTS(SELECT 1 FROM clinic_members cm WHERE cm.owner_id=$2 AND cm.member_id=a.id AND cm.active AND cm.accepted)))",[next.practitioner_id,workspaceId]);if(!practitioner)throw fail(403,'Choisissez un praticien du cabinet.');}
 if(['initial_quote','final_quote','recovered_amount','final_social_security_amount','final_mutual_amount'].some(k=>next[k]>0)&&!next.financial_date)throw fail(400,'Indiquez la date de rattachement des montants.');
 const financialChanged=existing&&['initial_quote','initial_patient_share','final_quote','final_social_security_amount','final_mutual_amount'].some(k=>next[k]!==Number(existing[k]||0));
 next.optimization_validated=financialChanged&&!Object.hasOwn(b,'optimization_validated')?false:bool(choose('optimization_validated',false));
 if(next.optimization_validated&&(type==='estimation'||!next.final_quote||pecAmounts(next).optimization_gain<=0||['refused','cancelled'].includes(business)))throw fail(400,'L’optimisation nécessite une PEC éligible, un devis final et un gain positif.');
 next.billing_type=clean(choose('billing_type','direct'),80);next.billing_status=choose('billing_status','À facturer');next.invoice_number=clean(choose('invoice_number',''),100);next.billing_notes=clean(choose('billing_notes',''),5000);
 if(!BILLING_STATUSES.includes(next.billing_status))throw fail(400,'Statut de facturation invalide.');
 if(type==='estimation'&&(next.invoice_date||next.invoice_number||next.transfer_date||next.billing_status!=='À facturer'||next.billing_amount!==null||next.transfer_amount!==null))throw fail(400,'Une estimation reste hors du suivi de facturation.');
 if(next.billing_status!=='À facturer'&&(!next.invoice_date||!next.invoice_number))throw fail(400,'Renseignez la date et le numéro de facture avant de la marquer facturée.');
 if(['En banque','Rapprochement fait'].includes(next.billing_status)&&!next.transfer_date)throw fail(400,'Renseignez la date du virement reçu.');
 const keys=Object.keys(next),values=keys.map(k=>k==='attachments'?JSON.stringify(next[k]):next[k]);
 const param=(value)=>{values.push(value);return '$'+values.length;};
 const expected=existing?param(existing.revision_token):null;
 const mutation='INSERT INTO tasks('+keys.join(',')+') VALUES('+keys.map((k,i)=>'$'+(i+1)+(k==='attachments'?'::jsonb':'')).join(',')+') ON CONFLICT(id) DO UPDATE SET '+keys.filter(k=>!['id','owner_id','parent_task_id','dossier_type','source_estimation_id'].includes(k)).map(k=>k+'=excluded.'+k).join(',')+',updated_at=now() WHERE tasks.owner_id=excluded.owner_id'+(expected?' AND tasks.updated_at='+expected+'::timestamptz':'')+' RETURNING id';
 const auditValues=[randomUUID(),account.id,existing?'pec_saved':'pec_created',next.id,existing?'Dossier PEC mis à jour':'Dossier PEC créé',workspaceId,'pec',next.id,existing?JSON.stringify(redact(auditSnapshot(existing))):null,JSON.stringify(redact({...auditSnapshot(next),documents:attachments.map(a=>({id:a.id,kind:a.kind,name:a.name}))})),ctx?.requestId||null];
 const placeholders=auditValues.map(v=>param(v));
 placeholders[8]+='::jsonb';placeholders[9]+='::jsonb';
 const [written]=await sql.query('WITH saved AS ('+mutation+') INSERT INTO audit_log(id,actor_id,action,target_id,detail,tenant_id,entity_type,entity_id,before,after,request_id) SELECT '+placeholders.join(',')+' FROM saved RETURNING target_id',values);
 if(!written)throw fail(409,'Le dossier vient d’être modifié. Rechargez-le avant d’enregistrer.');
 return {ok:true,id:next.id};
}

export async function pecReport(sql,workspaceId,year){
 const tasks=await sql.query("SELECT to_jsonb(t)-'attachments' AS record,a.name AS practitioner FROM tasks t LEFT JOIN accounts a ON a.id=t.practitioner_id WHERE t.owner_id=$1 AND t.financial_date>=$2::date AND t.financial_date<$3::date ORDER BY t.financial_date DESC,t.updated_at DESC",[workspaceId,year+'-01-01',(year+1)+'-01-01']);
 const details=tasks.map(row=>({...row.record,practitioner:row.practitioner})).filter(t=>t.dossier_type!=='estimation'&&!['ESTIMATION À FAIRE','ACCORD ESTIM'].includes(t.stage)).map(t=>({id:t.id,month:String(t.financial_date).slice(0,7),financial_date:String(t.financial_date).slice(0,10),title:t.title,plan_name:t.plan_name,stage:t.stage,practitioner_id:t.practitioner_id,practitioner:t.practitioner||'Non attribué',initial:Number(t.initial_quote),final:Number(t.final_quote),difference:Number(t.final_quote)-Number(t.initial_quote),recovered:Number(t.recovered_amount),initial_social_security:Number(t.initial_social_security_amount),final_social_security:Number(t.final_social_security_amount),initial_mutual:Number(t.initial_mutual_amount),final_mutual:Number(t.final_mutual_amount),initial_patient_share:Number(t.initial_patient_share),billing_status:t.billing_status,billing_amount:t.billing_amount,invoice_date:t.invoice_date,invoice_number:t.invoice_number,transfer_date:t.transfer_date,transfer_amount:t.transfer_amount,...pecAmounts(t)}));
 const grouped=new Map();for(const t of details){const key=t.month+'|'+t.practitioner_id;const row=grouped.get(key)||{month:t.month,practitioner_id:t.practitioner_id,practitioner:t.practitioner,plans:0,initial:0,final:0,difference:0,recovered:0};row.plans++;for(const k of ['initial','final','difference','recovered'])row[k]+=t[k];grouped.set(key,row);}
 return {year,rows:[...grouped.values()],details};
}
