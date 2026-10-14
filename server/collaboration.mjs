import { randomUUID, createHash } from 'node:crypto';
import { clean } from './security.mjs';
import { queueCommunication, flushCommunication, mailReady } from './collaboration-mail.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const isUuid=value=>typeof value==='string'&&/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value);
const mimes=['application/pdf','image/jpeg','image/png','image/webp','video/mp4','video/webm','video/quicktime','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','text/plain','text/csv'];
const fileUrl=id=>'/smilepec?file='+id;
export const meetingCalendar = m => {
 const stamp=v=>new Date(v).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
 const ics=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//SmilePec//Rendez-vous//FR','METHOD:PUBLISH','BEGIN:VEVENT','UID:'+m.id+'@smilepec.fr','DTSTAMP:'+stamp(Date.now()),'DTSTART:'+stamp(m.starts_at),'DTEND:'+stamp(+new Date(m.starts_at)+m.duration*60000),'SUMMARY:Rendez-vous SmilePec','STATUS:'+(m.status==='confirmed'?'CONFIRMED':m.status==='cancelled'?'CANCELLED':'TENTATIVE'),'URL:https://amelib.vercel.app/smilepec?cabinet='+m.cabinet_id,'END:VEVENT','END:VCALENDAR',''].join('\r\n');
 return {filename:'rendez-vous-smilepec.ics',content:Buffer.from(ics).toString('base64')};
};
export async function cabinetAccess(sql,cabinetId){
 await sql`INSERT INTO service_access(cabinet_id) VALUES(${cabinetId}) ON CONFLICT DO NOTHING`;
 return (await sql`SELECT active,activated_at FROM service_access WHERE cabinet_id=${cabinetId}`)[0];
}
export async function communicationNotice(sql,cabinetId,title,body,extras={}){
 const admins=await sql`SELECT id FROM accounts WHERE role='admin' AND NOT suspended`;
 await sql.transaction([cabinetId,...admins.map(a=>a.id)].map(id=>sql`INSERT INTO notifications(id,account_id,kind,title,body,href) VALUES(${randomUUID()},${id},'support',${title},${body},${'/smilepec?cabinet='+cabinetId})`));
 await queueCommunication(sql,cabinetId,title,extras);
}
export async function collaborationAction({action,req,res,b,sql,account,workspaceId,membership,internal,send,limit}){
 if(!String(action).startsWith('collaboration'))return false;
 if(!['admin','professional','worker'].includes(account.role))throw fail(403,'Cet espace est réservé aux cabinets et à SmilePec.');
 const admin=account.role==='admin';
 if(admin&&!internal?.permissions.has('support.read'))throw fail(403,'Accès aux échanges SmilePec requis.');
 const cabinetId=admin?(req.query.cabinet||b.cabinet_id):workspaceId;
 if(!isUuid(cabinetId))throw fail(400,'Sélectionnez le cabinet concerné depuis sa demande SmilePec.');
 const [cabinet]=await sql`SELECT a.id,a.name,a.email,p.clinic_name FROM accounts a JOIN profiles p ON p.account_id=a.id WHERE a.id=${cabinetId} AND a.role='professional' AND NOT a.suspended`;
 if(!cabinet)throw fail(404,'Cabinet indisponible.');
 if(membership && !membership.permissions?.includes('messages'))throw fail(403,'Votre rôle ne permet pas l’accès aux échanges SmilePec.');
 const canReply=!admin||internal.permissions.has('support.reply');
 if(req.method==='POST'&&!canReply)throw fail(403,'Votre rôle ne permet pas de répondre.');
 const getFile=async id=>{
  if(!isUuid(id))throw fail(400,'Fichier invalide.');
  const [file]=await sql`SELECT * FROM service_files WHERE id=${id} AND cabinet_id=${cabinetId}`;
  if(!file)throw fail(404,'Fichier inaccessible.');
  if(file.author_id!==account.id){
   const [shared]=await sql`SELECT 1 FROM support_messages m JOIN support_tickets t ON t.id=m.ticket_id WHERE t.account_id=${cabinetId} AND m.visibility='public' AND m.attachments @> ${JSON.stringify([{file_id:file.id}])}::jsonb LIMIT 1`;
   if(!shared)throw fail(403,'Ce fichier n’a pas encore été transmis.');
  }
  return file;
 };
 const bytes=async file=>{
  const rows=await sql`SELECT part,data FROM service_file_chunks WHERE file_id=${file.id} ORDER BY part`;
  if(rows.some((r,i)=>r.part!==i))throw fail(400,'Le transfert du document est incomplet.');
  return Buffer.concat(rows.map(r=>Buffer.from(r.data,'base64')));
 };
 const ticket=async()=>{
  if(!isUuid(b.ticket_id))throw fail(400,'Choisissez une conversation.');
  const [t]=await sql`SELECT * FROM support_tickets WHERE id=${b.ticket_id} AND account_id=${cabinetId}`;
  if(!t)throw fail(404,'Conversation indisponible.');return t;
 };
 const attachments=async()=>{
  if(!Array.isArray(b.file_ids)||b.file_ids.length>10)throw fail(400,'10 pièces jointes maximum.');
  const result=[];
  for(const id of [...new Set(b.file_ids)]){const file=await getFile(id);if(!file.ready)throw fail(400,'Un fichier est encore en cours de transfert.');result.push({name:file.name,data:fileUrl(file.id)+'&cabinet='+cabinetId,file_id:file.id,mime:file.mime,size:file.size});}
  return result;
 };
 const append=async(t,body,files=[],extras={})=>{
  const id=randomUUID();
  await sql.transaction([
   sql`INSERT INTO support_messages(id,ticket_id,author_id,visibility,body,attachments) VALUES(${id},${t.id},${account.id},'public',${body},${JSON.stringify(files)}::jsonb)`,
   sql`UPDATE support_tickets SET status=${admin?'waiting_customer':'open'},admin_reply=CASE WHEN ${admin} THEN ${body} ELSE admin_reply END,first_response_at=CASE WHEN ${admin} THEN coalesce(first_response_at,now()) ELSE first_response_at END,last_reply_at=now(),updated_at=now(),resolved_at=NULL WHERE id=${t.id}`,
  ]);
  await communicationNotice(sql,cabinetId,admin?'Nouveau message de SmilePec':'Message du cabinet reçu par SmilePec','Un échange est disponible dans votre espace sécurisé.',extras);
  return id;
 };
 if(action==='collaboration'&&req.method==='GET'){
  const access=await cabinetAccess(sql,cabinetId);
  await flushCommunication(sql,cabinetId);
  const [tickets,messages,quotes,meetings,delivery]=await Promise.all([
   sql`SELECT id,subject,body,status,created_at,admin_reply FROM support_tickets WHERE account_id=${cabinetId} ORDER BY updated_at DESC LIMIT 100`,
   sql`SELECT m.id,m.ticket_id,m.body,m.attachments,m.created_at,a.name AS author,a.role AS author_role FROM support_messages m JOIN accounts a ON a.id=m.author_id JOIN support_tickets t ON t.id=m.ticket_id WHERE t.account_id=${cabinetId} AND m.visibility='public' ORDER BY m.created_at LIMIT 1000`,
   sql`SELECT q.id,q.ticket_id,q.status,q.created_at,q.decided_at,q.reason,f.id AS file_id,f.name,f.digest FROM service_quotes q JOIN service_files f ON f.id=q.file_id WHERE q.cabinet_id=${cabinetId} ORDER BY q.created_at DESC`,
   sql`SELECT id,ticket_id,starts_at,duration,status,provider,external_url FROM service_meetings WHERE cabinet_id=${cabinetId} ORDER BY starts_at DESC LIMIT 100`,
   sql`SELECT count(*)::int AS pending FROM service_mail_outbox WHERE cabinet_id=${cabinetId} AND status<>'sent'`,
  ]);
  const https=value=>{try{const u=new URL(value||'');return u.protocol==='https:'?u.href:''}catch{return ''}};
  const [booking]=await sql`SELECT value FROM platform_state WHERE key='service-booking'`;
  send({cabinet,access,can_decide:!admin&&!membership,can_reply:canReply,can_quote:admin&&internal.permissions.has('billing.manage'),can_schedule:admin&&internal.permissions.has('appointment.manage'),can_configure:admin&&internal.permissions.has('settings.update'),tickets:tickets.map(t=>({...t,messages:messages.filter(m=>m.ticket_id===t.id)})),quotes,meetings,capabilities:{email:mailReady(),calendly:https(booking?.value?.calendly||process.env.SMILEPEC_CALENDLY_URL),google_booking:https(booking?.value?.google_booking||process.env.SMILEPEC_GOOGLE_BOOKING_URL)},pending_emails:delivery[0].pending});return true;
 }
 if(action==='collaboration-booking-settings'&&req.method==='POST'){
  if(!admin||!internal.permissions.has('settings.update'))throw fail(403,'Seule la direction SmilePec peut configurer les liens de réservation.');
  const urls={calendly:clean(b.calendly,1000),google_booking:clean(b.google_booking,1000)};
  for(const url of Object.values(urls)){if(!url)continue;try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error()}catch{throw fail(400,'Utilisez uniquement des liens HTTPS valides.');}}
  await sql`INSERT INTO platform_state(key,value) VALUES('service-booking',${JSON.stringify(urls)}::jsonb) ON CONFLICT(key) DO UPDATE SET value=excluded.value,updated_at=now()`;send({ok:true});return true;
 }
 if(action==='collaboration-request'&&req.method==='POST'){
  const subject=clean(b.subject,180),body=clean(b.body,5000);if(!subject||!body)throw fail(400,'Indiquez le sujet et votre demande.');
  const id=randomUUID();
  await sql`INSERT INTO support_tickets(id,account_id,subject,body,category) VALUES(${id},${cabinetId},${subject},${body},'onboarding')`;
  await communicationNotice(sql,cabinetId,'Votre demande SmilePec est enregistrée','Une nouvelle demande de service est disponible.');send({ok:true,id});return true;
 }
 if(action==='collaboration-message'&&req.method==='POST'){
  const t=await ticket(),body=clean(b.body,5000),files=await attachments();if(!body&&!files.length)throw fail(400,'Écrivez un message ou joignez un fichier.');
  await append(t,body,files);send({ok:true});return true;
 }
 if(action==='collaboration-file-start'&&req.method==='POST'){
  const size=Number(b.size),mime=clean(b.mime,100),name=clean(b.name,180);
  if(!name||!mimes.includes(mime)||!Number.isInteger(size)||size<1||size>52428800)throw fail(400,'Format non accepté ou fichier supérieur à 50 Mo.');
  const [{n,total}]=await sql`SELECT count(*) FILTER(WHERE NOT ready)::int AS n,coalesce(sum(size),0)::float AS total FROM service_files WHERE author_id=${account.id} AND created_at>now()-interval '1 day'`;
  if(n>=20)throw fail(429,'Trop de transferts incomplets. Réessayez demain ou terminez vos transferts.');
  if(total+size>524288000)throw fail(429,'Limite de 500 Mo de transferts par jour atteinte.');
  const id=randomUUID();await sql`INSERT INTO service_files(id,cabinet_id,author_id,name,mime,size) VALUES(${id},${cabinetId},${account.id},${name},${mime},${size})`;
  send({id});return true;
 }
 if(action==='collaboration-file-chunk'&&req.method==='POST'){
  const file=await getFile(b.id),part=Number(b.part),data=typeof b.data==='string'?b.data:'';
  if(file.author_id!==account.id||file.ready)throw fail(403,'Ce transfert n’est pas modifiable.');
  if(!Number.isInteger(part)||part<0||part>=Math.ceil(file.size/262144)||data.length>349528||!/^[a-zA-Z0-9+/]+={0,2}$/.test(data))throw fail(400,'Fragment invalide.');
  const length=Buffer.from(data,'base64').length,expected=Math.min(262144,file.size-part*262144);if(length!==expected)throw fail(400,'Taille de fragment incorrecte.');
  await sql`INSERT INTO service_file_chunks(file_id,part,data) VALUES(${file.id},${part},${data}) ON CONFLICT(file_id,part) DO UPDATE SET data=excluded.data`;
  send({ok:true});return true;
 }
 if(action==='collaboration-file-finish'&&req.method==='POST'){
  const file=await getFile(b.id);if(file.author_id!==account.id)throw fail(403,'Transfert inaccessible.');
  const buffer=await bytes(file);if(buffer.length!==file.size)throw fail(400,'Transfert incomplet.');
  // Validate signatures for common document and image types before marking the upload complete.
  const valid=file.mime==='application/pdf'?buffer.subarray(0,5).toString()==='%PDF-':file.mime==='image/png'?buffer.subarray(0,8).toString('hex')==='89504e470d0a1a0a':file.mime==='image/jpeg'?buffer.subarray(0,3).toString('hex')==='ffd8ff':file.mime==='image/webp'?buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP':file.mime==='video/mp4'||file.mime==='video/quicktime'?buffer.subarray(4,8).toString()==='ftyp':file.mime==='video/webm'?buffer.subarray(0,4).toString('hex')==='1a45dfa3':file.mime.includes('openxmlformats')?buffer.subarray(0,4).toString('hex')==='504b0304':!buffer.includes(0);
  if(!valid)throw fail(400,'Le contenu ne correspond pas au format annoncé.');
  const digest=createHash('sha256').update(buffer).digest('hex');await sql`UPDATE service_files SET ready=true,digest=${digest} WHERE id=${file.id}`;send({ok:true,id:file.id});return true;
 }
 if(action==='collaboration-file-download'&&req.method==='GET'){
  const file=await getFile(req.query.id);if(!file.ready)throw fail(404,'Transfert incomplet.');
  if(file.size>3000000)throw fail(413,'Ouvrez ce document depuis votre espace SmilePec pour un téléchargement par fragments.');
  const buffer=await bytes(file);res.setHeader('Content-Type',file.mime);res.setHeader('Content-Disposition',`inline; filename*=UTF-8''${encodeURIComponent(file.name.replace(/[\r\n]/g,''))}`);res.setHeader('Cache-Control','private, no-store');res.status(200).end(buffer);return true;
 }
 if(action==='collaboration-file-read'&&req.method==='GET'){
  const file=await getFile(req.query.id);if(!file.ready)throw fail(404,'Transfert incomplet.');
  if(req.query.part===undefined){send({name:file.name,mime:file.mime,size:file.size,parts:Math.ceil(file.size/262144)});return true;}
  const part=Number(req.query.part);if(!Number.isInteger(part)||part<0||part>=Math.ceil(file.size/262144))throw fail(400,'Fragment invalide.');
  const [chunk]=await sql`SELECT data FROM service_file_chunks WHERE file_id=${file.id} AND part=${part}`;if(!chunk)throw fail(404,'Fragment inaccessible.');send(chunk);return true;
 }
 if(action==='collaboration-quote'&&req.method==='POST'){
  if(!admin||!internal.permissions.has('billing.manage'))throw fail(403,'Le droit de gérer la facturation SmilePec est requis pour proposer un devis.');
  const t=await ticket(),file=await getFile(b.file_id);if(!file.ready||file.mime!=='application/pdf'||file.author_id!==account.id)throw fail(400,'Joignez un devis PDF complet.');
  const id=randomUUID();await sql.transaction([
   sql`UPDATE service_quotes SET status='superseded' WHERE cabinet_id=${cabinetId} AND status='sent'`,
   sql`INSERT INTO service_quotes(id,cabinet_id,ticket_id,file_id,author_id) VALUES(${id},${cabinetId},${t.id},${file.id},${account.id})`,
  ]);
  await append(t,clean(b.body,5000)||'Votre devis SmilePec est disponible. Consultez-le puis acceptez ou refusez cette proposition.',[{name:file.name,data:fileUrl(file.id)+'&cabinet='+cabinetId,file_id:file.id,mime:file.mime,size:file.size}]);send({ok:true,id});return true;
 }
 if(action==='collaboration-quote-decide'&&req.method==='POST'){
  if(admin||membership)throw fail(403,'Seul le titulaire du cabinet peut accepter ou refuser le devis.');
  if(!isUuid(b.id)||!['accepted','rejected'].includes(b.status))throw fail(400,'Décision invalide.');
  const reason=clean(b.reason,1500);
  // Atomically decide and activate, so a replay or superseded quote cannot unlock access.
  const [q]=await sql`WITH decision AS(UPDATE service_quotes SET status=${b.status},decided_by=${account.id},decided_at=now(),reason=${reason} WHERE id=${b.id} AND cabinet_id=${cabinetId} AND status='sent' RETURNING *), activation AS(
   INSERT INTO service_access(cabinet_id,active,activated_at) SELECT cabinet_id,true,now() FROM decision WHERE status='accepted' ON CONFLICT(cabinet_id) DO UPDATE SET active=true,activated_at=coalesce(service_access.activated_at,now()) RETURNING cabinet_id) SELECT * FROM decision`;
  if(!q)throw fail(409,'Ce devis a déjà reçu une réponse ou a été remplacé.');
  await sql`INSERT INTO audit_log(id,actor_id,action,detail,entity_type,entity_id,tenant_id) VALUES(${randomUUID()},${account.id},${'service_quote_'+b.status},'Décision du titulaire sur le devis SmilePec','service_quote',${q.id},${cabinetId})`;
  await append({id:q.ticket_id},`${b.status==='accepted'?'Devis accepté — les outils du cabinet sont ouverts.':'Devis refusé — aucune ouverture des outils.'}${reason?'\n'+reason:''}`);
  send({ok:true,active:b.status==='accepted'});return true;
 }
 if(action==='collaboration-meeting'&&req.method==='POST'){
  if(admin&&!internal.permissions.has('appointment.manage'))throw fail(403,'Le droit de gérer les rendez-vous est requis.');
  const t=await ticket(),date=new Date(b.starts_at),duration=Number(b.duration)||30;
  if(!Number.isFinite(+date)||+date<Date.now()+300000||+date>Date.now()+366*86400000||![15,30,45,60].includes(duration))throw fail(400,'Choisissez une date future et une durée valide.');
  const id=randomUUID();await sql`INSERT INTO service_meetings(id,cabinet_id,ticket_id,starts_at,duration,status,confirmed_by) VALUES(${id},${cabinetId},${t.id},${date.toISOString()},${duration},${admin?'confirmed':'requested'},${admin?account.id:null})`;
  await append(t,`${admin?'Rendez-vous confirmé':'Demande de rendez-vous'} : ${date.toLocaleString('fr-FR',{timeZone:'Europe/Paris'})} (heure de Paris), ${duration} minutes.\nLe rendez-vous et la visio sont disponibles dans l’espace SmilePec.`,[],{attachments:[meetingCalendar({id,cabinet_id:cabinetId,starts_at:date.toISOString(),duration,status:admin?'confirmed':'requested'})]});send({ok:true,id});return true;
 }
 const meeting=async()=>{
  if(!isUuid(b.id||req.query.id))throw fail(400,'Rendez-vous invalide.');
  const [m]=await sql`SELECT * FROM service_meetings WHERE id=${b.id||req.query.id} AND cabinet_id=${cabinetId}`;if(!m)throw fail(404,'Rendez-vous inaccessible.');return m;
 };
 if(action==='collaboration-meeting-update'&&req.method==='POST'){
  if(admin&&!internal.permissions.has('appointment.manage'))throw fail(403,'Le droit de gérer les rendez-vous est requis.');
  const m=await meeting();if(!['confirmed','cancelled','completed'].includes(b.status)||(!admin&&b.status!=='cancelled'))throw fail(403,'Seule SmilePec confirme le rendez-vous.');
  if(['cancelled','completed'].includes(m.status))throw fail(409,'Ce rendez-vous est déjà terminé ou annulé.');
  const url=b.external_url===undefined?(m.external_url||''):clean(b.external_url,1000);if(url){try{const parsed=new URL(url);if(parsed.protocol!=='https:'||parsed.username||parsed.password)throw new Error()}catch{throw fail(400,'Utilisez un lien de visio HTTPS valide.');}}
  await sql`UPDATE service_meetings SET status=${b.status},confirmed_by=CASE WHEN ${admin} THEN ${account.id} ELSE confirmed_by END,external_url=${url||null},provider=${url?'external':'smilepec'} WHERE id=${m.id}`;
  await append({id:m.ticket_id},'Rendez-vous '+({confirmed:'confirmé',cancelled:'annulé',completed:'terminé'}[b.status])+'. Retrouvez son invitation et son accès dans votre espace SmilePec.',[],{attachments:[meetingCalendar({...m,status:b.status})]});send({ok:true});return true;
 }
 if(['collaboration-call','collaboration-call-start','collaboration-signal'].includes(action)){
  const m=await meeting();if(m.status!=='confirmed'||m.provider!=='smilepec')throw fail(409,'La visio nécessite un rendez-vous confirmé dans SmilePec.');
  if(Date.now()<+new Date(m.starts_at)-3600000||Date.now()>+new Date(m.starts_at)+(m.duration+120)*60000)throw fail(409,'La visio ouvre une heure avant le rendez-vous et ferme deux heures après.');
  if(action==='collaboration-call-start'&&req.method==='POST'){
   const generation=admin?randomUUID():m.call_generation;
   if(admin)await sql.transaction([sql`UPDATE service_meetings SET call_generation=${generation} WHERE id=${m.id}`,sql`DELETE FROM service_call_signals WHERE meeting_id=${m.id}`]);
   send({generation});return true;
  }
  if(action==='collaboration-call'&&req.method==='GET'&&req.query.generation!==m.call_generation){send({restart:true,generation:m.call_generation,signals:[]});return true;}
  if((b.generation||req.query.generation)!==m.call_generation)throw fail(409,'La session visio a changé. Fermez puis rejoignez de nouveau le rendez-vous.');
  if(action==='collaboration-call'&&req.method==='GET'){
   const after=Math.max(0,Number(req.query.after)||0);const signals=await sql`SELECT id,kind,payload FROM service_call_signals WHERE meeting_id=${m.id} AND sender_id<>${account.id} AND id>${after} AND created_at>now()-interval '5 minutes' ORDER BY id LIMIT 100`;
   const iceServers=[{urls:'stun:stun.l.google.com:19302'}];if(process.env.SMILEPEC_TURN_URL&&process.env.SMILEPEC_TURN_USER&&process.env.SMILEPEC_TURN_PASSWORD)iceServers.push({urls:process.env.SMILEPEC_TURN_URL,username:process.env.SMILEPEC_TURN_USER,credential:process.env.SMILEPEC_TURN_PASSWORD});
   send({signals,iceServers,initiator:admin});return true;
  }
  if(action==='collaboration-signal'&&req.method==='POST'){
   if((b.kind==='offer'&&!admin)||(b.kind==='answer'&&admin))throw fail(403,'Signal de visio non autorisé pour ce participant.');
   await limit('call:'+account.id,1000);if(!['offer','answer','ice','hangup'].includes(b.kind)||JSON.stringify(b.payload||{}).length>65536)throw fail(400,'Signal invalide.');
   await sql`INSERT INTO service_call_signals(meeting_id,sender_id,kind,payload) VALUES(${m.id},${account.id},${b.kind},${JSON.stringify(b.payload||{})}::jsonb)`;send({ok:true});return true;
  }
 }
 throw fail(405,'Action ou méthode non autorisée.');
}
