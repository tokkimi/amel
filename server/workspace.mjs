import { randomUUID } from 'node:crypto';
import { clean } from './security.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const permissions=['agenda','patients_admin','clinical','billing','messages','tasks'];
export async function workspaceAction({action,req,b,sql,account,workspaceId,membership,can,send}) {
 if(action==='document-read'&&req.method==='GET') {
  const [doc]=await sql`SELECT d.*,pa.name AS patient_name,pa.email AS patient_email,pr.name AS professional_name FROM business_documents d JOIN accounts pa ON pa.id=d.patient_id JOIN accounts pr ON pr.id=d.owner_id WHERE d.id=${req.query.id} AND ((d.owner_id=${workspaceId} AND ${can('billing')&&account.role!=='patient'}) OR (d.patient_id=${account.id} AND d.status<>'draft'))`;
  if(!doc)throw fail(404,'Document indisponible.');const [profile]=await sql`SELECT clinic_name,address,identifier,contact_email,phone,logo_data FROM profiles WHERE account_id=${doc.owner_id}`;send({doc,profile});return true;
 }
 if(action==='team' && req.method==='GET') {
  if(account.role==='patient')throw fail(403,'Espace professionnel requis.');
  const [members,invitations]=await Promise.all([
   membership?[]:sql`SELECT cm.*,a.name,a.email FROM clinic_members cm JOIN accounts a ON a.id=cm.member_id WHERE cm.owner_id=${account.id} ORDER BY cm.created_at DESC`,
   sql`SELECT cm.id,cm.job_title,cm.permissions,a.name,p.clinic_name FROM clinic_members cm JOIN accounts a ON a.id=cm.owner_id JOIN profiles p ON p.account_id=a.id WHERE cm.member_id=${account.id} AND cm.active AND NOT cm.accepted`
  ]);send({members,invitations,owner:!membership,permissions:membership?.permissions||permissions});return true;
 }
 if(action==='team-accept' && req.method==='POST') {
  if(membership)throw fail(409,'Vous appartenez déjà à un cabinet.');
  const rows=await sql`UPDATE clinic_members SET accepted=true WHERE id=${b.id} AND member_id=${account.id} AND active AND NOT accepted RETURNING id`;
  if(!rows.length)throw fail(404,'Invitation introuvable.');send({ok:true});return true;
 }
 if(action==='team-update' && req.method==='POST') {
  if(membership||!['professional','admin'].includes(account.role))throw fail(403,'Seul le propriétaire peut gérer les accès.');
  const selected=(Array.isArray(b.permissions)?b.permissions:[]).filter(x=>permissions.includes(x));
  const rows=await sql`UPDATE clinic_members SET job_title=${clean(b.job_title,120)},permissions=${JSON.stringify(selected)}::jsonb,active=${!!b.active} WHERE id=${b.id} AND owner_id=${account.id} RETURNING member_id`;
  if(!rows.length)throw fail(404,'Membre introuvable.');
  await sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},'team_access_updated',${rows[0].member_id},'Droits de cabinet modifiés')`;
  send({ok:true});return true;
 }
 if(action==='mission-location' && req.method==='POST') {
  if(!['professional','worker','admin'].includes(account.role)||!can('tasks'))throw fail(403,'Accès aux missions requis.');
  const [mission]=await sql`SELECT * FROM missions WHERE id=${b.id} AND owner_id=${workspaceId}`;
  if(!mission)throw fail(404,'Mission introuvable.');
  if(mission.shared_by && mission.shared_by!==account.id && new Date(mission.location_expires_at)>new Date())throw fail(409,'Une autre personne partage déjà sa position.');
  if(b.sharing!==true){await sql`UPDATE missions SET latitude=null,longitude=null,shared_by=null,location_expires_at=null,updated_at=now() WHERE id=${b.id} AND (shared_by=${account.id} OR shared_by IS NULL)`;send({ok:true});return true;}
  const lat=Number(b.latitude),lng=Number(b.longitude);
  if(!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||mission.status==='completed')throw fail(400,'Position ou mission invalide.');
  await sql`UPDATE missions SET latitude=${lat},longitude=${lng},shared_by=${account.id},location_expires_at=now()+interval '60 seconds',updated_at=now() WHERE id=${b.id}`;
  send({ok:true});return true;
 }
 if(action==='mission-live' && req.method==='GET') {
  const rows=await sql`SELECT m.id,m.title,m.status,m.eta,m.updated_at,a.name AS assignee,p.photo_data,
   CASE WHEN m.location_expires_at>now() AND m.status<>'completed' THEN m.latitude ELSE null END AS latitude,
   CASE WHEN m.location_expires_at>now() AND m.status<>'completed' THEN m.longitude ELSE null END AS longitude,
   m.location_expires_at>now() AND m.status<>'completed' AS sharing
   FROM missions m LEFT JOIN accounts a ON a.id=m.shared_by LEFT JOIN profiles p ON p.account_id=m.shared_by
   WHERE (m.owner_id=${workspaceId} AND ${account.role!=='patient'&&can('tasks')}) OR EXISTS(SELECT 1 FROM appointments ap WHERE ap.id=m.appointment_id AND ap.patient_id=${account.id}) ORDER BY m.updated_at DESC LIMIT 100`;
  send({missions:rows});return true;
 }
 if(action==='support'&&req.method==='GET') {
  const tickets=account.role==='admin'?await sql`SELECT t.*,a.name,a.email FROM support_tickets t JOIN accounts a ON a.id=t.account_id ORDER BY t.updated_at DESC LIMIT 300`:await sql`SELECT * FROM support_tickets WHERE account_id=${account.id} ORDER BY updated_at DESC`;
  send({tickets});return true;
 }
 if(action==='support-create'&&req.method==='POST') {
  if(!clean(b.subject,180)||!clean(b.body,5000))throw fail(400,'Indiquez un sujet et votre demande.');
  await sql`INSERT INTO support_tickets(id,account_id,subject,body) VALUES(${randomUUID()},${account.id},${clean(b.subject,180)},${clean(b.body,5000)})`;send({ok:true});return true;
 }
 if(action==='support-update'&&req.method==='POST') {
  if(account.role!=='admin')throw fail(403,'Accès administrateur requis.');
  if(!['open','in_progress','resolved'].includes(b.status))throw fail(400,'Statut invalide.');
  await sql`UPDATE support_tickets SET status=${b.status},admin_reply=${clean(b.admin_reply,5000)},updated_at=now() WHERE id=${b.id}`;
  await sql`INSERT INTO audit_log(id,actor_id,action,detail) VALUES(${randomUUID()},${account.id},'support_updated','Demande d’assistance mise à jour')`;send({ok:true});return true;
 }
 if(action==='admin-cabinets'&&req.method==='GET') {
  if(account.role!=='admin')throw fail(403,'Accès administrateur requis.');
  const cabinets=await sql`SELECT a.id,a.name,a.email,p.clinic_name,p.city,p.phone,p.identifier,p.published,p.verified,(SELECT count(*)::int FROM clinic_members cm WHERE cm.owner_id=a.id AND cm.active AND cm.accepted) AS team_count,(SELECT count(*)::int FROM appointments ap WHERE ap.professional_id=a.id) AS appointment_count FROM accounts a JOIN profiles p ON p.account_id=a.id WHERE a.role IN ('professional','admin') ORDER BY a.name`;
  send({cabinets});return true;
 }
 if(action==='admin-account-update'&&req.method==='POST') {
  if(account.role!=='admin')throw fail(403,'Accès administrateur requis.');
  const name=clean(b.name,80);if(!name)throw fail(400,'Nom obligatoire.');
  const [target]=await sql`SELECT id FROM accounts WHERE id=${b.id}`;if(!target)throw fail(404,'Compte introuvable.');
  await sql.transaction([sql`UPDATE accounts SET name=${name} WHERE id=${b.id}`,sql`UPDATE profiles SET clinic_name=${clean(b.clinic_name,120)},city=${clean(b.city,100)},phone=${clean(b.phone,30)} WHERE account_id=${b.id}`,sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},'account_details_updated',${b.id},'Coordonnées du cabinet actualisées')`]);
  send({ok:true});return true;
 }
 return false;
}
