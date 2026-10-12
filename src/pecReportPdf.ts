import {jsPDF} from 'jspdf';
export type PecReportDetail={id:string;financial_date:string;title:string;plan_name:string;initial:number;final:number;final_social_security:number;final_mutual:number;total_reimbursed:number;patient_share:number;optimization_gain:number;optimized:boolean;recovered:number;stage:string;billing_status:string;invoice_number:string;billed_amount:number;transfer_amount:number|null;mutual_optimization:number};
export function createPecReportPdf({cabinet,period,selected}:{cabinet:string;period:string;selected:PecReportDetail[]}){
 const pdf=new jsPDF({orientation:'landscape',unit:'mm',format:'a4'});
 const euro=(n:number)=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format(n).replace(/[\u00a0\u202f]/g,' ');
 const optimized=selected.filter(t=>t.optimized).sort((a,b)=>b.optimization_gain-a.optimization_gain);
 const sum=(items:PecReportDetail[],key:keyof PecReportDetail)=>items.reduce((v,t)=>v+Number(t[key]||0),0);
 const ink=[62,51,42] as const;let y=50;
 const text=(value:string,x:number,at:number,size=9,bold=false,align:'left'|'right'='left')=>{pdf.setFont('helvetica',bold?'bold':'normal');pdf.setFontSize(size);pdf.setTextColor(...ink);pdf.text(value,x,at,{align});};
 const header=()=>{pdf.setFillColor(245,239,231);pdf.rect(0,0,297,41,'F');text('SmilePec | Bilan des prises en charge',14,15,17,true);pdf.setFontSize(9);pdf.setFont('helvetica','normal');const lines=pdf.splitTextToSize(cabinet,220);lines.forEach((line:string,i:number)=>text(line,14,23+i*4,9));text(period,283,33,10,true,'right');};
 const next=(height:number,repeat=false)=>{if(y+height>192){pdf.addPage();header();y=50;if(repeat)tableHead();}};
 header();text('Synthèse de la période',14,y,12,true);y+=9;
 text('Gain d’optimisation validé : +'+euro(sum(optimized,'optimization_gain')),14,y,11,true);text(optimized.length+' dossier(s) optimisé(s) / '+selected.length+' PEC',180,y,10);y+=8;
 text('Total remboursé : '+euro(sum(selected,'total_reimbursed')),14,y);text('Reste à charge patient : '+euro(sum(selected,'patient_share')),108,y);text('Montant récupéré (suivi) : '+euro(sum(selected,'recovered')),200,y);y+=8;
 text('Supplément mutuelle : '+euro(sum(optimized,'mutual_optimization')),14,y);text('Facturé : '+euro(sum(selected.filter(t=>t.invoice_number||t.billing_status!=='À facturer'),'billed_amount')),108,y);text('Virements renseignés : '+euro(sum(selected,'transfer_amount')),200,y);y+=12;
 text('Dossiers optimisés | gain validé, classés par gain',14,y,11,true);y+=8;
 const widths=[20,51,27,27,25,25,25,25,25],starts=[14];widths.slice(0,-1).forEach(w=>starts.push(starts[starts.length-1]+w));
 function tableHead(){pdf.setFillColor(233,224,213);pdf.rect(14,y-4,270,9,'F');['Date','Dossier / plan','Devis initial','Devis final','Part SS','Mutuelle','Remboursé','RÀC','Gain'].forEach((v,i)=>text(v,starts[i]+2,y+1,8,true));y+=10;}
 next(16);tableHead();
 for(const [index,t] of optimized.entries()){pdf.setFontSize(8);const lines=pdf.splitTextToSize(t.title+(t.plan_name?'\n'+t.plan_name:''),47) as string[];const height=Math.max(10,lines.length*4+5);next(height+(index===optimized.length-1?40:0),true);const formatted=t.financial_date.slice(0,10).split('-').reverse().join('/');text(formatted,16,y,8);lines.forEach((line,i)=>text(line,starts[1]+2,y+i*4,8));[t.initial,t.final,t.final_social_security,t.final_mutual,t.total_reimbursed,t.patient_share,t.optimization_gain].forEach((n,i)=>text((i===6?'+':'')+euro(n),starts[i+2]+widths[i+2]-2,y,8,i===6,'right'));y+=height;pdf.setDrawColor(226,216,203);pdf.line(14,y-4,284,y-4);}
 if(!optimized.length){next(14,true);text('Aucune optimisation validée sur cette période.',16,y,9);y+=12;}
 next(13);pdf.setFillColor(...ink);pdf.rect(14,y-3,270,11,'F');pdf.setTextColor(255,255,255);pdf.setFont('helvetica','bold');pdf.setFontSize(9);pdf.text('Total du gain validé',18,y+4);pdf.text('+'+euro(sum(optimized,'optimization_gain')),281,y+4,{align:'right'});y+=19;
 next(20);text('Méthode : gain = max(0, SS + mutuelle - (devis initial - RÀC initial)).',14,y,8);y+=5;text('Les estimations sont exclues. Le RÀC patient, le gain et les virements restent des montants distincts.',14,y,8);
 const pages=pdf.getNumberOfPages();for(let i=1;i<=pages;i++){pdf.setPage(i);pdf.setDrawColor(217,205,190);pdf.line(14,199,284,199);text('SmilePec | Document transmis au cabinet destinataire',14,205,7);text(i+' / '+pages,284,205,7,false,'right');}
 const name='bilan-smilepec-'+period.toLowerCase().replace(/[^a-z0-9àâéèêîôùûç]+/g,'-')+'.pdf';
 return {name,data:'data:application/pdf;base64,'+pdf.output('datauristring').split(',')[1],pdf};
}
