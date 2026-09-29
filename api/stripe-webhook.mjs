import Stripe from 'stripe';
import {neon} from '@neondatabase/serverless';
export const config={api:{bodyParser:false}};
const escape=value=>String(value||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).end();
 if(!process.env.STRIPE_SECRET_KEY||!process.env.STRIPE_WEBHOOK_SECRET)return res.status(503).json({error:'Stripe non configuré.'});
 const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);let event;
 try{const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>2000000)throw new Error('Payload too large');chunks.push(Buffer.from(chunk))}event=stripe.webhooks.constructEvent(Buffer.concat(chunks),req.headers['stripe-signature'],process.env.STRIPE_WEBHOOK_SECRET)}catch{return res.status(400).json({error:'Signature invalide.'})}
 try{
  const sql=neon(process.env.DATABASE_URL);const [done]=await sql`SELECT id FROM stripe_events WHERE id=${event.id}`;if(done)return res.status(200).json({received:true});
  const object=event.data.object;
  if(event.type==='checkout.session.completed'&&object.mode==='subscription'){
   const sub=await stripe.subscriptions.retrieve(object.subscription);
   await sql`UPDATE billing_clients SET stripe_subscription_id=${sub.id},subscription_status=${sub.status} WHERE stripe_customer_id=${String(object.customer)} AND stripe_session_id=${object.id}`;
  }
  if(event.type.startsWith('customer.subscription.')){
   const sub=event.type==='customer.subscription.deleted'?object:await stripe.subscriptions.retrieve(object.id);
   await sql`UPDATE billing_clients SET subscription_status=${sub.status} WHERE stripe_subscription_id=${sub.id}`;
  }
  if(['invoice.finalized','invoice.paid','invoice.payment_failed'].includes(event.type)){
   const invoice=await stripe.invoices.retrieve(object.id);
   const [client]=await sql`SELECT * FROM billing_clients WHERE stripe_customer_id=${String(invoice.customer)}`;
   if(client){
    await sql`INSERT INTO billing_invoices(stripe_invoice_id,client_id,number,status,amount_due,amount_paid,currency,hosted_url,pdf_url,issued_at) VALUES(${invoice.id},${client.id},${invoice.number},${invoice.status},${invoice.amount_due},${invoice.amount_paid},${invoice.currency},${invoice.hosted_invoice_url},${invoice.invoice_pdf},${new Date(invoice.created*1000).toISOString()}) ON CONFLICT(stripe_invoice_id) DO UPDATE SET status=excluded.status,amount_due=excluded.amount_due,amount_paid=excluded.amount_paid,hosted_url=excluded.hosted_url,pdf_url=excluded.pdf_url`;
    const [saved]=await sql`SELECT email_sent_at FROM billing_invoices WHERE stripe_invoice_id=${invoice.id}`;
    if(!saved.email_sent_at&&invoice.hosted_invoice_url){
     if(!process.env.RESEND_API_KEY||!process.env.BILLING_FROM_EMAIL)throw new Error('Email configuration missing');
     const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json','Idempotency-Key':'invoice-'+invoice.id},body:JSON.stringify({from:process.env.BILLING_FROM_EMAIL,to:[invoice.customer_email||client.email],subject:'Votre facture SmilePec '+invoice.number,html:`<p>Bonjour ${escape(client.name)},</p><p>Votre facture mensuelle SmilePec ${escape(invoice.number)} est disponible.</p><p><a href="${escape(invoice.hosted_invoice_url)}">Consulter votre facture et son état de paiement</a></p><p>Bien cordialement,<br>SmilePec</p>`,attachments:invoice.invoice_pdf?[{filename:invoice.number+'.pdf',path:invoice.invoice_pdf}]:[]})});
     if(!response.ok)throw new Error('Invoice email failed');
     await sql`UPDATE billing_invoices SET email_sent_at=now() WHERE stripe_invoice_id=${invoice.id}`;
    }
   }
  }
  await sql`INSERT INTO stripe_events(id) VALUES(${event.id}) ON CONFLICT DO NOTHING`;
  return res.status(200).json({received:true});
 }catch(error){console.error('Stripe webhook processing failed:',error.message);return res.status(500).json({error:'Traitement à réessayer.'})}
}
