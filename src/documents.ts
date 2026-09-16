import {api,money} from './client';
export const paymentLabels:Record<string,string>={sur_place:'Sur place au cabinet',mutuelle:'Mutuelle / complémentaire',tiers_payant:'Tiers payant',virement:'Virement bancaire',qonto:'Lien Qonto',cheque:'Chèque',especes:'Espèces',carte_cabinet:'Carte au cabinet'};
export async function downloadSharedDocument(id:string){
 const {doc,profile}=await api('document-read&id='+encodeURIComponent(id));
 if(doc.pdf_data){const a=document.createElement('a');a.href=doc.pdf_data;a.download=doc.pdf_name||doc.number+'.pdf';a.click();return}
 const {jsPDF}=await import('jspdf');const pdf=new jsPDF();let y=72;
 const head=()=>{pdf.setFillColor(59,50,45);pdf.rect(0,0,210,30,'F');pdf.setTextColor(255);pdf.setFontSize(20);pdf.text(profile.clinic_name||doc.professional_name,18,19);pdf.setFontSize(11);pdf.text(doc.doc_type==='quote'?'DEVIS':'FACTURE',165,19);pdf.setTextColor(59,50,45)};
 head();pdf.setFontSize(10);pdf.text(`${doc.professional_name}\n${profile.address||''}\n${profile.identifier?'Identifiant : '+profile.identifier:''}`,18,41);pdf.text(`${doc.patient_name}\n${doc.patient_email}`,118,41);
 pdf.text(`${doc.number} · ${new Date(doc.issue_date).toLocaleDateString('fr-FR')}${doc.due_date?' · Échéance : '+new Date(doc.due_date).toLocaleDateString('fr-FR'):''}`,18,65);
 if(profile.logo_data){try{pdf.addImage(profile.logo_data,'PNG',178,34,15,15)}catch{}}
 for(const item of doc.items){const lines=pdf.splitTextToSize(item.label,86);const height=Math.max(12,lines.length*5+5);if(y+height>263){pdf.addPage();head();y=44}pdf.setFillColor(247,242,235);pdf.rect(18,y-4,174,height,'F');pdf.setFontSize(9);pdf.text(lines,21,y+1);pdf.text(`${item.quantity} × ${money(item.unitPrice)}`,111,y+1);pdf.text(money(item.quantity*item.unitPrice*(1+item.vat/100)),169,y+1,{align:'right'});y+=height+3}
 const write=(text:string)=>{const lines=pdf.splitTextToSize(text,170);for(const line of lines){if(y>272){pdf.addPage();head();y=45}pdf.text(line,20,y);y+=5}y+=4};
 y+=9;pdf.setFontSize(11);write(`Total : ${money(Number(doc.total))} · TVA : ${money(Number(doc.tax))}`);pdf.setFontSize(10);write('Règlement : '+(paymentLabels[doc.payment_method]||paymentLabels.sur_place));write(`Prise en charge prévue : ${money(Number(doc.insurance_amount||0))} · Reste à charge prévu : ${money(Math.max(0,Number(doc.total)-Number(doc.insurance_amount||0)))}`);if(doc.payment_details)write(doc.payment_details);if(doc.payment_url){write('Lien de paiement :');write(doc.payment_url)}if(doc.note)write(doc.note);pdf.save(doc.number+'.pdf');
}
