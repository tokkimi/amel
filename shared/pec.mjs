export const PEC_STAGES = ['PEC À FAIRE','ESTIMATION À FAIRE','PEC/ESTIM EN COURS','ACCORD PEC','ACCORD ESTIM','DOSSIER EN ERREUR','PEC À FACTURER','PEC FACTURÉE','PEC PAYÉE','RAPPROCHEMENT FAIT'];
export const BILLING_STAGES = ['PEC À FACTURER','PEC FACTURÉE','PEC PAYÉE','RAPPROCHEMENT FAIT'];
export const BILLING_STATUSES = ['À facturer','Facturé','Paiement demandé','En banque','Rapprochement fait'];
export const BUSINESS_STATUSES = ['pending','agreed','refused','cancelled'];
export const DOCUMENT_KINDS = {devis:'Devis',mutuelle:'Mutuelle',accord:'Accord PEC',estimation:'Estimation',facture:'Facture',autre:'Autre document'};
export const cents = value => Math.round((Number(value)||0)*100);
export function pecAmounts(task) {
 const reimbursed = cents(task.final_social_security_amount) + cents(task.final_mutual_amount);
 const baseline = cents(task.initial_quote)-cents(task.initial_patient_share);
 const patientShare = Math.max(0,cents(task.final_quote)-reimbursed);
 const eligible = task.dossier_type !== 'estimation' && !['ESTIMATION À FAIRE','ACCORD ESTIM'].includes(task.stage) && !['refused','cancelled'].includes(task.business_status);
 const gain = Math.max(0,reimbursed-baseline);
 const optimized = eligible && Boolean(task.optimization_validated) && cents(task.final_quote)>0 && gain>0;
 return {total_reimbursed:reimbursed/100,patient_share:patientShare/100,optimization_gain:gain/100,mutual_optimization:(cents(task.final_mutual_amount)-cents(task.initial_mutual_amount))/100,eligible,optimized,billed_amount:task.billing_amount==null?reimbursed/100:Number(task.billing_amount)};
}
export function automaticSummary(task, financial = true) {
 const parts = [task.dossier_type==='estimation'?'Estimation':'PEC'];
 parts.push(({pending:'En attente',agreed:'Accordée',refused:'Refusée',cancelled:'Annulée'})[task.business_status]||'En attente');
 if(task.act_codes)parts.push(task.act_codes);
 if(task.agreement_confirmed||(task.attachments||[]).some(a=>a.kind==='accord'&&(a.url||a.has_data)))parts.push('Accord enregistré');
 if(financial){const a=pecAmounts(task);if(a.optimized)parts.push('Dossier optimisé - Gain : '+a.optimization_gain.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €');if(cents(task.final_quote)>0)parts.push(a.patient_share>0?'RÀC patient : '+a.patient_share.toLocaleString('fr-FR',{minimumFractionDigits:2,maximumFractionDigits:2})+' €':'Pas de RÀC');}
 if(task.valid_until)parts.push('Fin de validité : '+String(task.valid_until).slice(0,10).split('-').reverse().join('/'));
 return parts.join(' - ');
}
