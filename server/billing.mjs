import Stripe from 'stripe';
import {randomUUID} from 'node:crypto';
import {clean} from './security.mjs';
const fail=(status,message)=>Object.assign(new Error(message),{status});
export const billingReady=()=>Boolean(process.env.STRIPE_SECRET_KEY&&process.env.STRIPE_WEBHOOK_SECRET&&process.env.RESEND_API_KEY&&process.env.BILLING_FROM_EMAIL&&process.env.PUBLIC_APP_URL);
export async function billingAction({action,req,b,sql,account,workspaceId,can,send,internal}){
 if(!action?.startsWith('billing-'))return false;
 if(account.role!=='admin'||!internal?.permissions.has(req.method==='GET'?'billing.read':'billing.manage'))throw fail(403,'Accès à la comptabilité requis.');
 if(action==='billing-clients'&&req.method==='GET'){
  const clients=await sql`SELECT * FROM billing_clients WHERE owner_id=${workspaceId} ORDER BY name`;
  const invoices=await sql`SELECT i.*,c.name AS client_name FROM billing_invoices i JOIN billing_clients c ON c.id=i.client_id WHERE c.owner_id=${workspaceId} ORDER BY i.issued_at DESC LIMIT 200`;
  send({clients,invoices,ready:billingReady(),canActivate:account.role==='admin'});return true;
 }
 if(action==='billing-client-save'&&req.method==='POST'){
  const name=clean(b.name,180),email=clean(b.email,254).toLowerCase(),amount=Math.round(Number(b.monthly_amount)*100);
  if(!name||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!Number.isSafeInteger(amount)||amount<0||amount>10000000)throw fail(400,'Vérifiez le nom, l’e-mail et le montant mensuel.');
  const id=b.id||randomUUID();
  if(b.id){const [client]=await sql`SELECT * FROM billing_clients WHERE id=${b.id} AND owner_id=${workspaceId}`;if(!client)throw fail(404,'Client introuvable.');if(client.stripe_session_id||client.stripe_subscription_id)throw fail(409,'Un mandat ou un abonnement est déjà en cours. Gérez ses modifications depuis Stripe.');}
  await sql`INSERT INTO billing_clients(id,owner_id,name,email,address,company_id,monthly_amount,service_label) VALUES(${id},${workspaceId},${name},${email},${clean(b.address,500)},${clean(b.company_id,40)},${amount},${clean(b.service_label,200)||'Accompagnement SmilePec'}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,address=excluded.address,company_id=excluded.company_id,monthly_amount=excluded.monthly_amount,service_label=excluded.service_label,updated_at=now() WHERE billing_clients.owner_id=${workspaceId}`;
  send({ok:true,id});return true;
 }
 if(action==='billing-checkout'&&req.method==='POST'){
  if(account.role!=='admin')throw fail(403,'L’activation SEPA est réservée à l’administration SmilePec.');
  if(!billingReady())throw fail(503,'Stripe et l’envoi des factures doivent être configurés avant l’activation.');
  const [client]=await sql`SELECT * FROM billing_clients WHERE id=${b.id} AND owner_id=${workspaceId}`;
  if(!client||client.monthly_amount<1)throw fail(400,'Enregistrez le client et un montant mensuel positif.');
  const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);
  if(client.stripe_subscription_id)throw fail(409,'Ce client possède déjà un abonnement Stripe.');
  if(client.stripe_session_id){const old=await stripe.checkout.sessions.retrieve(client.stripe_session_id);if(old.status==='open'){send({url:old.url});return true;}if(old.status==='complete')throw fail(409,'Mandat déjà signé. La confirmation est en cours.');}
  const customer=client.stripe_customer_id?{id:client.stripe_customer_id}:await stripe.customers.create({name:client.name,email:client.email,metadata:{smilepec_client_id:client.id,owner_id:workspaceId}}, {idempotencyKey:'smilepec-customer-'+client.id});
  await sql`UPDATE billing_clients SET stripe_customer_id=${customer.id} WHERE id=${client.id}`;
  const base=new URL(process.env.PUBLIC_APP_URL);if(base.protocol!=='https:')throw fail(503,'Adresse publique HTTPS requise.');
  const session=await stripe.checkout.sessions.create({mode:'subscription',customer:customer.id,payment_method_types:['sepa_debit'],line_items:[{price_data:{currency:'eur',unit_amount:client.monthly_amount,recurring:{interval:'month'},product_data:{name:client.service_label}},quantity:1}],client_reference_id:client.id,metadata:{smilepec_client_id:client.id},subscription_data:{metadata:{smilepec_client_id:client.id,owner_id:workspaceId}},success_url:base.origin+'/?billing=success',cancel_url:base.origin+'/?billing=cancelled',locale:'fr'}, {idempotencyKey:'smilepec-mandate-'+client.id+'-'+new Date(client.updated_at).getTime()+'-'+(client.stripe_session_id||'new')});
  await sql`UPDATE billing_clients SET stripe_session_id=${session.id},stripe_session_url=${session.url},subscription_status='awaiting_mandate' WHERE id=${client.id}`;
  send({url:session.url});return true;
 }
 throw fail(404,'Action de facturation introuvable.');
}
