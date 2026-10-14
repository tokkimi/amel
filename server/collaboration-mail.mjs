import { randomUUID } from 'node:crypto';
const appUrl = () => (process.env.PUBLIC_APP_URL || 'https://amelib.vercel.app').replace(/\/$/, '');
export const mailReady = () => !!(process.env.RESEND_API_KEY && process.env.BILLING_FROM_EMAIL && process.env.SMILEPEC_MAIL_READY === '1');
export async function queueCommunication(sql, cabinetId, title, extras = {}) {
 const [client] = await sql`SELECT email FROM accounts WHERE id=${cabinetId}`;
 if (!client) return;
 const manager=process.env.SMILEPEC_MANAGER_EMAIL||process.env.AMELIB_BOOTSTRAP_ADMIN_EMAIL||'contact@smilepec.fr';
 const to=[client.email],cc=manager===client.email?[]:[manager];
 // Notify with a secure link only. Patient details and attachments never go into notification emails.
 const payload = { from: process.env.BILLING_FROM_EMAIL, to, cc,
  subject: title, text: `Bonjour,\n\n${title}.\nConsultez votre espace sécurisé pour lire le message, vérifier les documents et répondre.\n\n${appUrl()}/smilepec?cabinet=${cabinetId}\n\nL’équipe SmilePec`, ...extras };
 await sql`INSERT INTO service_mail_outbox(id,cabinet_id,payload) VALUES(${randomUUID()},${cabinetId},${JSON.stringify(payload)}::jsonb)`;
 await flushCommunication(sql, cabinetId);
}
export async function flushCommunication(sql, cabinetId) {
 if (!mailReady()) return;
 const rows = await sql`UPDATE service_mail_outbox SET status='sending',attempts=attempts+1,retry_at=now()+interval '2 minutes'
  WHERE id IN(SELECT id FROM service_mail_outbox WHERE cabinet_id=${cabinetId} AND status IN('pending','failed','sending') AND retry_at<=now() AND attempts<5 ORDER BY created_at LIMIT 5 FOR UPDATE SKIP LOCKED) RETURNING *`;
 for (const row of rows) {
  let ok = false;
  try { const result = await fetch('https://api.resend.com/emails', {method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'smilepec-'+row.id},body:JSON.stringify({...row.payload,from:process.env.BILLING_FROM_EMAIL}),signal:AbortSignal.timeout(10000)}); ok=result.ok; } catch {}
  await sql`UPDATE service_mail_outbox SET status=${ok?'sent':'failed'},sent_at=CASE WHEN ${ok} THEN now() ELSE NULL END WHERE id=${row.id}`;
 }
}
