export type Account={id:string;name:string;email:string;role:'patient'|'professional'|'worker'|'admin'};
export type Profile={specialty:string;city:string;address:string;bio:string;phone:string;languages:string;qualifications:string;identifier:string;price:number;published:boolean;verified:boolean};
export type Professional=Profile&{id:string;name:string;role:string;next_slot:string|null};
export type Slot={id:string;starts_at:string;duration:number;available:boolean};
export type Appointment={id:string;slot_id:string;patient_id:string;professional_id:string;patient_name:string;professional_name:string;starts_at:string;duration:number;reason:string;status:string;address:string};
export type Entry={id:string;label:string;amount:number;kind:string;paid:boolean;created_at:string};
export type Dashboard={account:Account;profile:Profile;appointments:Appointment[];slots:Slot[];ledger:Entry[]};
export async function api<T=any>(action:string,data?:unknown):Promise<T>{const response=await fetch('/api?action='+action,{method:data===undefined?'GET':'POST',credentials:'same-origin',headers:data===undefined?{}:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok)throw new Error(result.error||'Le service est indisponible.');return result;}
export const roleLabel=(role:string)=>({patient:'Patient',professional:'Praticien',worker:'Intervenant',admin:'Administrateur'}[role]||role);
export const homeFor=(role:string)=>role==='patient'?'/patient':role==='worker'?'/intervenant':role==='admin'?'/admin':'/pro';
export const dateFormat=(value:string)=>new Date(value).toLocaleString('fr-FR',{timeZone:'Europe/Paris',weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
export const money=(value:number)=>Number(value).toLocaleString('fr-FR',{style:'currency',currency:'EUR'});
