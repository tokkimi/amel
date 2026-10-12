import {api} from './client';
export const paymentLabels:Record<string,string>={sur_place:'Sur place au cabinet',mutuelle:'Mutuelle / complémentaire',tiers_payant:'Tiers payant',virement:'Virement bancaire',qonto:'Lien Qonto',cheque:'Chèque',especes:'Espèces',carte_cabinet:'Carte au cabinet'};
export type PreparedDocument={data:string;name:string;doc:any;profile:any};
export async function prepareSharedDocument(id:string):Promise<PreparedDocument>{
 const {doc,profile}=await api('document-read&id='+encodeURIComponent(id));
 const name=doc.pdf_name||doc.number+'.pdf';
 if(doc.pdf_data)return {data:doc.pdf_data,name,doc,profile};
 const {createInvoicePdf}=await import('./invoicePdf');
 const pdf=createInvoicePdf({...doc,payment_label:paymentLabels[doc.payment_method]||paymentLabels.sur_place},profile);
 return {data:pdf.output('datauristring'),name,doc,profile};
}
export async function downloadSharedDocument(id:string){
 const prepared=await prepareSharedDocument(id);
 const a=document.createElement('a');a.href=prepared.data;a.download=prepared.name;a.click();
}
