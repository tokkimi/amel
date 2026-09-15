import {neon} from '@neondatabase/serverless';
import {randomBytes,randomUUID} from 'node:crypto';
import {hash,passwordHash,verifyPassword,validPassword,safeAccount,clean} from '../server/security.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
const uuid=x=>typeof x==='string'&&/^[0-9a-f-]{36}$/i.test(x);
const roleCheck=(a,...roles)=>{if(!roles.includes(a.role))throw fail(403,'Cet espace ne correspond pas à votre compte.');};
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');
 try{
 if(!process.env.DATABASE_URL)throw fail(503,'Le service est momentanément indisponible.');
 const sql=neon(process.env.DATABASE_URL);const action=req.query?.action||new URL(req.url,'https://amelib.vercel.app').searchParams.get('action');
 const b=req.body&&typeof req.body==='object'?req.body:{};
 if(!['GET','POST'].includes(req.method))throw fail(405,'Méthode non autorisée.');
 if(req.method==='POST'){
 const origin=req.headers.origin;const expected='https://'+req.headers.host;
 if(origin!==expected&&!(process.env.NODE_ENV!=='production'&&origin==='http://'+req.headers.host))throw fail(403,'Origine de la requête non autorisée.');
 if(!String(req.headers['content-type']||'').includes('application/json'))throw fail(415,'Format non autorisé.');
 }
 const send=data=>res.status(200).json(data);
 const limit=async(key,max)=>{const rows=await sql`INSERT INTO rate_limits(key,count,expires_at) VALUES(${key},1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET count=CASE WHEN rate_limits.expires_at<now() THEN 1 ELSE rate_limits.count+1 END,expires_at=CASE WHEN rate_limits.expires_at<now() THEN now()+interval '15 minutes' ELSE rate_limits.expires_at END RETURNING count`;if(rows[0].count>max)throw fail(429,'Trop de tentatives. Réessayez dans 15 minutes.');};
 const cookie=(token,age=604800)=>res.setHeader('Set-Cookie',`amelib_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`);
 const session=async(account)=>{const token=randomBytes(32).toString('hex');await sql`INSERT INTO sessions(token_hash,account_id,expires_at) VALUES(${hash(token)},${account.id},now()+interval '7 days')`;cookie(token);};
 if(['signup','login','recover'].includes(action)){
 if(req.method!=='POST')throw fail(405,'Requête POST nécessaire.');
 const ip=String(req.headers['x-vercel-forwarded-for']||req.headers['x-forwarded-for']||'unknown').split(',')[0];await limit('auth-ip:'+hash(ip),30);
 const email=clean(b.email,254).toLowerCase();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Indiquez un e-mail valide.');await limit('auth-email:'+hash(email),12);
 if(action==='signup'){
 const name=clean(b.name,80);if(!name||!validPassword(b.password))throw fail(400,'Indiquez un nom et un mot de passe de 12 à 128 caractères.');
 if(!['patient','professional','worker'].includes(b.role))throw fail(400,'Type de compte non autorisé.');
 const id=randomUUID(),password=await passwordHash(b.password),recovery=randomBytes(24).toString('hex');
 const account={id,email,name,role:b.role};
 await sql.transaction([sql`INSERT INTO accounts(id,email,name,role,password_hash,recovery_hash) VALUES(${id},${email},${name},${b.role},${password},${hash(recovery)})`,sql`INSERT INTO profiles(account_id) VALUES(${id})`]);
 await session(account);return send({account,recoveryCode:recovery});
 }
 const [account]=await sql`SELECT * FROM accounts WHERE email=${email}`;
 if(account?.suspended)throw fail(403,'Ce compte est suspendu. Contactez l’administration.');
 if(action==='recover'){
 if(!validPassword(b.password))throw fail(400,'Choisissez un mot de passe de 12 à 128 caractères.');
 if(!account||hash(clean(b.recoveryCode,100))!==account.recovery_hash)throw fail(401,'E-mail ou code de récupération incorrect.');
 const password=await passwordHash(b.password),recovery=randomBytes(24).toString('hex');
 await sql.transaction([sql`UPDATE accounts SET password_hash=${password},recovery_hash=${hash(recovery)} WHERE id=${account.id}`,sql`DELETE FROM sessions WHERE account_id=${account.id}`]);await session(account);return send({account:safeAccount(account),recoveryCode:recovery});
 }
 const dummy='00000000000000000000000000000000:'+ '00'.repeat(64);
 const valid=await verifyPassword(typeof b.password==='string'?b.password.slice(0,128):'',account?.password_hash||dummy);
 if(!account||!valid)throw fail(401,'E-mail ou mot de passe incorrect.');
 if(b.role&&account.role!==b.role)throw fail(403,'Ce compte appartient à un autre espace. Utilisez la connexion adaptée.');
 await session(account);return send({account:safeAccount(account)});
 }
 if(action==='directory'&&req.method==='GET'){
 const rows=await sql`SELECT a.id,a.name,a.role,p.specialty,p.city,p.address,p.bio,p.phone,p.languages,p.qualifications,p.price,p.verified,(SELECT min(starts_at) FROM slots WHERE professional_id=a.id AND available AND starts_at>now()) AS next_slot FROM accounts a JOIN profiles p ON a.id=p.account_id WHERE p.published AND NOT a.suspended AND a.role IN ('professional','worker') ORDER BY a.name LIMIT 200`;return send({professionals:rows});
 }
 if(action==='public-settings'&&req.method==='GET'){const [settings]=await sql`SELECT name,support_email,announcement FROM platform_settings WHERE id=1`;return send({settings});}
 if(action==='slots'&&req.method==='GET'){
 const id=req.query.professional;if(!uuid(id))throw fail(400,'Profil invalide.');const rows=await sql`SELECT s.id,s.starts_at,s.duration FROM slots s JOIN profiles p ON p.account_id=s.professional_id WHERE s.professional_id=${id} AND s.available AND s.starts_at>now() AND p.published AND EXISTS(SELECT 1 FROM accounts WHERE id=s.professional_id AND NOT suspended) ORDER BY s.starts_at LIMIT 200`;return send({slots:rows});
 }
 const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('amelib_session='))?.slice(15)||'';
 const [account]=token?await sql`SELECT a.* FROM sessions s JOIN accounts a ON a.id=s.account_id WHERE s.token_hash=${hash(token)} AND s.expires_at>now() AND NOT a.suspended`:[];
 if(action==='session'&&req.method==='GET')return send({account:account?safeAccount(account):null});
 if(!account)throw fail(401,'Connectez-vous pour accéder à votre espace.');
 if(req.method==='POST')await limit('write:'+account.id,150);
 if(action==='logout'&&req.method==='POST'){await sql`DELETE FROM sessions WHERE token_hash=${hash(token)}`;cookie('',0);return send({ok:true});}
 if(action==='dashboard'&&req.method==='GET'){
 const [profile]=await sql`SELECT * FROM profiles WHERE account_id=${account.id}`;
 const appointments=await sql`SELECT ap.id,ap.slot_id,ap.reason,ap.status,ap.patient_id,ap.professional_id,s.starts_at,s.duration,pa.name AS patient_name,pr.name AS professional_name,p.address FROM appointments ap JOIN slots s ON s.id=ap.slot_id JOIN accounts pa ON pa.id=ap.patient_id JOIN accounts pr ON pr.id=ap.professional_id JOIN profiles p ON p.account_id=pr.id WHERE ap.patient_id=${account.id} OR ap.professional_id=${account.id} ORDER BY s.starts_at DESC LIMIT 300`;
 const slots=account.role==='patient'?[]:await sql`SELECT * FROM slots WHERE professional_id=${account.id} AND starts_at>now() ORDER BY starts_at LIMIT 300`;
 const ledger=account.role==='patient'?[]:await sql`SELECT * FROM ledger WHERE owner_id=${account.id} ORDER BY created_at DESC LIMIT 500`;
 return send({account:safeAccount(account),profile,appointments,slots,ledger});
 }
 if(action==='profile'&&req.method==='POST'){
 const name=clean(b.name,80);if(!name)throw fail(400,'Le nom est obligatoire.');
 const professional=['professional','worker'].includes(account.role);const specialty=clean(b.specialty,100),city=clean(b.city,100),address=clean(b.address,250),price=Number(b.price||0),identifier=clean(b.identifier,50);
 if(!Number.isFinite(price)||price<0||price>100000)throw fail(400,'Tarif invalide.');
 if(professional&&b.published&&(!specialty||!city||!address||!identifier))throw fail(400,'Renseignez la profession, la ville, l’adresse et l’identifiant professionnel avant publication.');
 await sql.transaction([sql`UPDATE accounts SET name=${name} WHERE id=${account.id}`,sql`UPDATE profiles SET specialty=${specialty},city=${city},address=${address},bio=${clean(b.bio,3000)},phone=${clean(b.phone,30)},languages=${clean(b.languages,200)},qualifications=${clean(b.qualifications,1500)},identifier=${identifier},price=${price},published=${professional&&!!b.published},verified=CASE WHEN identifier<>${identifier} THEN false ELSE verified END WHERE account_id=${account.id}`]);return send({ok:true});
 }
 if(action==='slot-create'&&req.method==='POST'){
 roleCheck(account,'professional','worker');const start=new Date(b.starts_at),duration=Number(b.duration);if(!Number.isFinite(start.getTime())||start<=new Date()||start>new Date(Date.now()+180*86400000)||!Number.isInteger(duration)||duration<15||duration>180)throw fail(400,'Choisissez un créneau futur de 15 à 180 minutes, dans les six prochains mois.');
 const id=randomUUID();const [result]=await sql.transaction([sql`SELECT pg_advisory_xact_lock(hashtext(${account.id}))`,sql`INSERT INTO slots(id,professional_id,starts_at,duration) SELECT ${id},${account.id},${start.toISOString()}::timestamptz,${duration} WHERE NOT EXISTS(SELECT 1 FROM slots WHERE professional_id=${account.id} AND tstzrange(starts_at, starts_at+duration*interval '1 minute','[)') && tstzrange(${start.toISOString()}::timestamptz,${start.toISOString()}::timestamptz+${duration}*interval '1 minute','[)')) RETURNING id`]).then(r=>[r[1]]);if(!result.length)throw fail(409,'Ce créneau chevauche un horaire existant.');return send({id});
 }
 if(action==='slot-delete'&&req.method==='POST'){
 roleCheck(account,'professional','worker');if(!uuid(b.id))throw fail(400,'Créneau invalide.');const rows=await sql`DELETE FROM slots s WHERE id=${b.id} AND professional_id=${account.id} AND NOT EXISTS(SELECT 1 FROM appointments WHERE slot_id=s.id) RETURNING id`;if(!rows.length)throw fail(409,'Ce créneau est réservé ou indisponible.');return send({ok:true});
 }
 if(action==='book'&&req.method==='POST'){
 roleCheck(account,'patient');if(!uuid(b.slot_id)||!clean(b.reason,150))throw fail(400,'Choisissez un créneau et un motif.');
 const id=randomUUID();const rows=await sql`WITH chosen AS (UPDATE slots s SET available=false FROM profiles p WHERE s.id=${b.slot_id} AND s.professional_id=p.account_id AND p.published AND s.available AND s.starts_at>now() AND EXISTS(SELECT 1 FROM accounts WHERE id=s.professional_id AND NOT suspended) RETURNING s.id,s.professional_id) INSERT INTO appointments(id,slot_id,patient_id,professional_id,reason) SELECT ${id},id,${account.id},professional_id,${clean(b.reason,150)} FROM chosen RETURNING id`;
 if(!rows.length)throw fail(409,'Ce créneau n’est plus disponible. Choisissez un autre horaire.');return send({id});
 }
 if(action==='cancel'&&req.method==='POST'){
 if(!uuid(b.id))throw fail(400,'Rendez-vous invalide.');const rows=await sql`WITH cancelled AS (UPDATE appointments ap SET status='cancelled' FROM slots s WHERE ap.id=${b.id} AND s.id=ap.slot_id AND s.starts_at>now() AND ap.status='confirmed' AND (ap.patient_id=${account.id} OR ap.professional_id=${account.id}) RETURNING ap.slot_id) UPDATE slots SET available=true WHERE id IN(SELECT slot_id FROM cancelled) RETURNING id`;if(!rows.length)throw fail(403,'Ce rendez-vous ne peut pas être annulé.');return send({ok:true});
 }
 if(action==='complete'&&req.method==='POST'){
 roleCheck(account,'professional','worker');if(!uuid(b.id))throw fail(400,'Rendez-vous invalide.');const rows=await sql`UPDATE appointments ap SET status='completed' FROM slots s WHERE ap.id=${b.id} AND ap.slot_id=s.id AND s.starts_at<=now() AND ap.professional_id=${account.id} AND ap.status='confirmed' RETURNING ap.id`;if(!rows.length)throw fail(403,'Vous pouvez clôturer uniquement une consultation commencée de votre agenda.');return send({ok:true});
 }
 if(['messages','message-send'].includes(action)){
 const id=req.method==='GET'?req.query.appointment:b.appointment_id;if(!uuid(id))throw fail(400,'Conversation invalide.');const [ap]=await sql`SELECT id FROM appointments WHERE id=${id} AND (patient_id=${account.id} OR professional_id=${account.id})`;if(!ap)throw fail(403,'Vous n’avez pas accès à cette conversation.');
 if(action==='message-send'&&req.method==='POST'){const body=clean(b.body,2000);if(!body)throw fail(400,'Écrivez un message.');await sql`INSERT INTO messages(id,appointment_id,sender_id,body) VALUES(${randomUUID()},${id},${account.id},${body})`;return send({ok:true});}
 if(action==='messages'&&req.method==='GET'){const rows=await sql`SELECT m.id,m.body,m.sender_id,m.created_at,a.name FROM messages m JOIN accounts a ON a.id=m.sender_id WHERE m.appointment_id=${id} ORDER BY m.created_at LIMIT 500`;return send({messages:rows});}
 }
 if(action==='ledger-create'&&req.method==='POST'){
 roleCheck(account,'professional','worker');const amount=Number(b.amount),label=clean(b.label,200);if(!label||!Number.isFinite(amount)||amount<=0||amount>1000000||!['income','expense'].includes(b.kind))throw fail(400,'Vérifiez le libellé, le type et le montant.');await sql`INSERT INTO ledger(id,owner_id,label,amount,kind,paid) VALUES(${randomUUID()},${account.id},${label},${amount},${b.kind},${!!b.paid})`;return send({ok:true});
 }
 if(action==='ledger-paid'&&req.method==='POST'){roleCheck(account,'professional','worker');if(!uuid(b.id))throw fail(400,'Opération invalide.');const rows=await sql`UPDATE ledger SET paid=true WHERE id=${b.id} AND owner_id=${account.id} RETURNING id`;if(!rows.length)throw fail(404,'Opération introuvable.');return send({ok:true});}

 if(action==='admin'&&req.method==='GET'){
 roleCheck(account,'admin');
 const [counts,accounts,appointments,audit,settings]=await Promise.all([
 sql`SELECT (SELECT count(*)::int FROM accounts) AS accounts,(SELECT count(*)::int FROM accounts WHERE role='patient') AS patients,(SELECT count(*)::int FROM accounts WHERE role IN('professional','worker')) AS professionals,(SELECT count(*)::int FROM profiles p JOIN accounts a ON a.id=p.account_id WHERE p.published AND NOT a.suspended) AS published,(SELECT count(*)::int FROM accounts a JOIN profiles p ON a.id=p.account_id WHERE a.role IN('professional','worker') AND NOT p.verified) AS pending,(SELECT count(*)::int FROM appointments WHERE status='confirmed') AS confirmed,(SELECT count(*)::int FROM appointments WHERE status='cancelled') AS cancelled,(SELECT count(*)::int FROM accounts WHERE suspended) AS suspended`,
 sql`SELECT a.id,a.name,a.email,a.role,a.created_at,a.suspended,p.verified,p.identifier,p.specialty,p.city,p.published,p.qualifications FROM accounts a JOIN profiles p ON a.id=p.account_id ORDER BY a.created_at DESC LIMIT 1000`,
 sql`SELECT ap.id,ap.status,ap.created_at,s.starts_at,s.duration,pa.name AS patient_name,pr.name AS professional_name FROM appointments ap JOIN slots s ON s.id=ap.slot_id JOIN accounts pa ON pa.id=ap.patient_id JOIN accounts pr ON pr.id=ap.professional_id ORDER BY s.starts_at DESC LIMIT 1000`,
 sql`SELECT l.id,l.action,l.target_id,l.detail,l.created_at,a.name AS actor_name FROM audit_log l JOIN accounts a ON a.id=l.actor_id ORDER BY l.created_at DESC LIMIT 300`,
 sql`SELECT * FROM platform_settings WHERE id=1`]);return send({counts:counts[0],accounts,appointments,audit,settings:settings[0]});
 }
 if(action==='admin-verify'&&req.method==='POST'){
 roleCheck(account,'admin');if(!uuid(b.id))throw fail(400,'Profil invalide.');const [target]=await sql`SELECT a.id,p.identifier FROM accounts a JOIN profiles p ON a.id=p.account_id WHERE a.id=${b.id} AND a.role IN('professional','worker')`;if(!target)throw fail(404,'Professionnel introuvable.');if(b.verified&&!target.identifier)throw fail(400,'Identifiant professionnel obligatoire pour la vérification.');
 await sql.transaction([sql`UPDATE profiles SET verified=${!!b.verified} WHERE account_id=${b.id}`,sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},${b.verified?'profile_verified':'verification_removed'},${b.id},${clean(b.note,500)})`]);return send({ok:true});
 }
 if(action==='admin-suspend'&&req.method==='POST'){
 roleCheck(account,'admin');if(!uuid(b.id)||b.id===account.id)throw fail(400,'Vous ne pouvez pas suspendre votre propre compte.');if(!clean(b.note,500))throw fail(400,'Indiquez le motif de cette décision.');const [target]=await sql`SELECT id FROM accounts WHERE id=${b.id} AND role<>'admin'`;if(!target)throw fail(403,'Cette action n’est pas permise sur ce compte.');
 await sql.transaction([sql`UPDATE accounts SET suspended=${!!b.suspended} WHERE id=${b.id}`,sql`DELETE FROM sessions WHERE account_id=${b.id}`,sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},${b.suspended?'account_suspended':'account_reactivated'},${b.id},${clean(b.note,500)})`]);return send({ok:true});
 }
 if(action==='admin-unpublish'&&req.method==='POST'){
 roleCheck(account,'admin');if(!uuid(b.id)||!clean(b.note,500))throw fail(400,'Profil et motif obligatoires.');const [target]=await sql`SELECT id FROM accounts WHERE id=${b.id} AND role IN('professional','worker')`;if(!target)throw fail(404,'Professionnel introuvable.');await sql.transaction([sql`UPDATE profiles SET published=false WHERE account_id=${b.id}`,sql`INSERT INTO audit_log(id,actor_id,action,target_id,detail) VALUES(${randomUUID()},${account.id},'profile_unpublished',${b.id},${clean(b.note,500)})`]);return send({ok:true});
 }
 if(action==='admin-settings'&&req.method==='POST'){
 roleCheck(account,'admin');const name=clean(b.name,60),email=clean(b.support_email,254);if(!name||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))throw fail(400,'Vérifiez le nom et l’e-mail de contact.');await sql.transaction([sql`UPDATE platform_settings SET name=${name},support_email=${email},announcement=${clean(b.announcement,300)},updated_at=now() WHERE id=1`,sql`INSERT INTO audit_log(id,actor_id,action,detail) VALUES(${randomUUID()},${account.id},'settings_updated','Informations publiques de la plateforme modifiées')`]);return send({ok:true});
 }
 throw fail(404,'Action introuvable.');
 }catch(e){if(e.code==='23505')return res.status(409).json({error:'Ce compte ou ce créneau existe déjà.'});if(e.status)return res.status(e.status).json({error:e.message});console.error('Amelib API failure:',e.code||e.name);return res.status(500).json({error:'Une erreur est survenue. Réessayez dans un instant.'});}
}

