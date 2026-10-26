import {mailReady} from './collaboration-mail.mjs';
import {createHash} from 'node:crypto';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export async function publicSlots(sql){return sql`SELECT value->>'id' AS id,value->>'starts_at' AS starts_at,value->>'host_name' AS host_name FROM platform_state WHERE key LIKE 'contact-slot:%' AND value->>'status'='open' AND (value->>'starts_at')::timestamptz>now()+interval '1 hour' ORDER BY value->>'starts_at' LIMIT 80`;}
export async function createContactSlot(sql,account,b){
 const date=new Date(b.starts_at);if(!Number.isFinite(+date)||+date<Date.now()+3600000||+date>Date.now()+180*86400000)throw fail(400,'Choisissez un créneau entre une heure et six mois à partir de maintenant.');
 if(date.getUTCMinutes()%30||date.getUTCSeconds()||date.getUTCMilliseconds())throw fail(400,'Les créneaux commencent à l’heure ou à la demi-heure.');
 const hex=createHash('sha256').update(account.id+':'+date.toISOString()).digest('hex').slice(0,32);const id=hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20),value={id,starts_at:date.toISOString(),host_id:account.id,host_name:account.name,status:'open',duration:30};
 const conflicts=await sql`SELECT key FROM platform_state WHERE key LIKE 'contact-slot:%' AND value->>'host_id'=${account.id} AND value->>'status' IN('open','reserved') AND abs(extract(epoch FROM ((value->>'starts_at')::timestamptz-${date.toISOString()}::timestamptz)))<1800`;
 if(conflicts.length)throw fail(409,'Ce créneau chevauche un créneau existant.');
 const inserted=await sql`INSERT INTO platform_state(key,value) VALUES(${'contact-slot:'+id},${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO NOTHING RETURNING key`;if(!inserted.length)throw fail(409,'Ce créneau existe déjà.');return value;
}
export async function saveContactFollowup(sql,b,actor){
 const key='contact-request:'+String(b.id||'');const [row]=await sql`SELECT value FROM platform_state WHERE key=${key}`;if(!row)throw fail(404,'Demande introuvable.');
 const allowed=['new','appointment_completed','recap_prepared','quote_prepared','quote_sent','followup_due','closed'];if(!allowed.includes(b.status))throw fail(400,'Statut invalide.');
 const recap=String(b.recap||'').trim();if(recap.length>10000)throw fail(400,'Récapitulatif trop long.');
 const mode=b.mode==='recap_quote'?'recap_quote':'recap';const due=b.status==='quote_sent'&&row.value.status!=='quote_sent'?new Date(Date.now()+48*3600000).toISOString():row.value.followup_at||null;
 const [config]=await sql`SELECT value FROM platform_state WHERE key='contact-followup-settings'`;
 const settings=config?.value||{mode:'manual',delay_hours:48};
 const followupAt=b.status==='quote_sent'&&row.value.status!=='quote_sent'?new Date(Date.now()+Number(settings.delay_hours||48)*3600000).toISOString():due;
 const patch={status:b.status,recap,mode,followup_mode:settings.mode,followup_at:followupAt,updated_by:actor.id,updated_at:new Date().toISOString()};
 const [updated]=await sql`UPDATE platform_state SET value=value||${JSON.stringify(patch)}::jsonb,updated_at=now() WHERE key=${key} RETURNING value`;return updated.value;
}

export async function saveFollowupSettings(sql,b){
 if(!['manual','automatic'].includes(b.mode)||![24,48,72,168].includes(Number(b.delay_hours)))throw fail(400,'Paramètres de relance invalides.');
 const value={mode:b.mode,delay_hours:Number(b.delay_hours)};
 await sql`INSERT INTO platform_state(key,value) VALUES('contact-followup-settings',${JSON.stringify(value)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;return value;
}

export async function sendContactRecap(sql,b){
 if(!mailReady())throw fail(503,'Envoi e-mail indisponible : le domaine expéditeur doit être validé et activé.');
 const key='contact-request:'+String(b.id||'');const [row]=await sql`SELECT value FROM platform_state WHERE key=${key}`;if(!row)throw fail(404,'Demande introuvable.');const lead=row.value;
 if(!lead.recap||lead.recap.includes('[à compléter]'))throw fail(400,'Complétez et enregistrez le récapitulatif avant envoi.');
 if(lead.mode==='recap_quote')throw fail(409,'Le devis doit être joint depuis la facturation. Choisissez récapitulatif seul pour envoyer ce message sans devis.');
 const digest=createHash('sha256').update(lead.id+':'+lead.recap).digest('hex');if(lead.recap_sent_digest===digest)return {ok:true,already_sent:true};
 const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'contact-recap-'+digest},body:JSON.stringify({from:process.env.BILLING_FROM_EMAIL,to:[lead.email],subject:'Suite de notre rendez-vous SmilePec — '+lead.reference,text:lead.recap}),signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw fail(502,'L’envoi a échoué. Le récapitulatif reste enregistré ; vous pouvez réessayer.');
 await sql`UPDATE platform_state SET value=value||${JSON.stringify({recap_sent_at:new Date().toISOString(),recap_sent_digest:digest})}::jsonb,updated_at=now() WHERE key=${key}`;return {ok:true};
}
