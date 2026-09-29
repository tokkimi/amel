import {api,money} from './client';
export const paymentLabels:Record<string,string>={sur_place:'Sur place au cabinet',mutuelle:'Mutuelle / complémentaire',tiers_payant:'Tiers payant',virement:'Virement bancaire',qonto:'Lien Qonto',cheque:'Chèque',especes:'Espèces',carte_cabinet:'Carte au cabinet'};
export async function downloadSharedDocument(id:string){
 const {doc,profile}=await api('document-read&id='+encodeURIComponent(id));
 if(doc.pdf_data){const a=document.createElement('a');a.href=doc.pdf_data;a.download=doc.pdf_name||doc.number+'.pdf';a.click();return}
 const {createInvoicePdf}=await import('./invoicePdf');
 const pdf=createInvoicePdf({...doc,payment_label:paymentLabels[doc.payment_method]||paymentLabels.sur_place},profile);
 pdf.save(doc.number+'.pdf');
}
