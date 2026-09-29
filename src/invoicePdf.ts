import {jsPDF} from 'jspdf';
const euro=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n).replace(/[\u202f\u00a0]/g,' ');
const date=(value:string)=>value?new Date(value).toLocaleDateString('fr-FR'):'-';
export function createInvoicePdf(doc:any,profile:any){
 const pdf=new jsPDF();const ink=[59,50,43] as const;let y=20;
 const text=(value:string,x:number,at:number,size=10,bold=false)=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(...ink);pdf.text(String(value||''),x,at)};
 const header=()=>{pdf.setFillColor(244,238,229);pdf.rect(0,0,210,39,'F');text('SmilePec',18,18,17,true);text(doc.doc_type==='quote'?'DEVIS':'FACTURE',145,18,19,true);text(doc.number,145,27,10);};
 const ensure=(height:number)=>{if(y+height>271){pdf.addPage();header();y=51;}};
 const paragraph=(value:string)=>{pdf.setFont('helvetica','normal');pdf.setFontSize(10);for(const line of pdf.splitTextToSize(String(value||''),172)){ensure(6);text(line,18,y);y+=5;}y+=4;};
 header();y=51;
 const left=[profile.clinic_name||doc.professional_name,profile.address,profile.identifier?'Identifiant : '+profile.identifier:'',profile.contact_email,profile.phone].filter(Boolean);
 const right=[doc.patient_name,doc.patient_email].filter(Boolean);
 text('ÉMETTEUR',18,46,8,true);text('DESTINATAIRE',116,46,8,true);
 // Wrapped address lines stay inside their own column.
 const blockText=(lines:string[],x:number,w:number)=>{let at=54;for(const line of lines){pdf.setFontSize(10);for(const row of pdf.splitTextToSize(line,w)){text(row,x,at);at+=5;}at+=2;}return at;};
 y=Math.max(blockText(left,18,87),blockText(right,116,76))+10;
 paragraph(`Émis le ${date(doc.issue_date)}${doc.due_date?'   |   Échéance : '+date(doc.due_date):''}`);
 const tableHead=()=>{ensure(15);pdf.setFillColor(231,220,205);pdf.rect(18,y,174,11,'F');text('DÉSIGNATION',21,y+7,8,true);text('QTÉ',112,y+7,8,true);text('P.U. HT',126,y+7,8,true);text('TVA',151,y+7,8,true);text('TOTAL TTC',168,y+7,8,true);y+=17;};
 tableHead();
 for(const item of doc.items){pdf.setFontSize(9);const lines=pdf.splitTextToSize(String(item.label||''),84);if(lines.length*5+9<200&&y+lines.length*5+9>271){pdf.addPage();header();y=51;tableHead();}let first=true;for(let i=0;i<lines.length;i++){if(y+8>271){pdf.addPage();header();y=51;tableHead();}text(lines[i],21,y,9);if(first){text(String(item.quantity),112,y,9);text(euro(Number(item.unitPrice)),126,y,9);text(String(item.vat)+' %',151,y,9);pdf.setFontSize(9);pdf.text(euro(item.quantity*item.unitPrice*(1+item.vat/100)),190,y,{align:'right'});first=false;}y+=5;}pdf.setDrawColor(225,216,203);pdf.line(18,y,192,y);y+=9;}
 ensure(43);y+=4;text('Total HT',120,y,10);pdf.text(euro(Number(doc.subtotal)),190,y,{align:'right'});y+=8;text('TVA',120,y,10);pdf.text(euro(Number(doc.tax)),190,y,{align:'right'});y+=6;pdf.setFillColor(244,238,229);pdf.roundedRect(114,y,78,16,3,3,'F');text('TOTAL TTC',120,y+10,11,true);pdf.text(euro(Number(doc.total)),186,y+10,{align:'right'});y+=29;
 paragraph('Règlement : '+(doc.payment_label||doc.payment_method||'Sur place au cabinet'));
 if(Number(doc.insurance_amount)>0)paragraph(`Prise en charge prévue : ${euro(Number(doc.insurance_amount))} - Reste à charge prévu : ${euro(Math.max(0,Number(doc.total)-Number(doc.insurance_amount)))}`);
 if(doc.payment_details)paragraph(doc.payment_details);if(doc.note){ensure(14);text('CONDITIONS ET INFORMATIONS',18,y,9,true);y+=7;paragraph(doc.note)}
 if(doc.payment_url){ensure(14);text('Lien de paiement sécurisé',18,y,10,true);pdf.link(18,y-4,70,6,{url:doc.payment_url});y+=10;}
 const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setDrawColor(218,207,192);pdf.line(18,282,192,282);text(doc.number,18,289,8);text(`${i} / ${pages}`,181,289,8)}
 return pdf;
}
