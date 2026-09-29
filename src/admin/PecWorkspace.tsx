import {useEffect,useState} from 'react';
import {api,Account,Dashboard,WorkTask} from '../client';
import {PecBoard,PecForm} from '../PecBoard';
import PecReport from '../PecReport';
import {PEC_STAGES} from '../pec';
import {useCC} from './context';
import {Drawer,Empty,useUrlParam} from './ui';
export default function PecWorkspace(){
 const cc=useCC();
 const [cabinets,setCabinets]=useState<any[]>([]),[cabinet,setCabinet]=useUrlParam('pecCabinet'),[data,setData]=useState<any>(null),[editing,setEditing]=useState<Partial<WorkTask>|null>(null),[error,setError]=useState(''),[loading,setLoading]=useState(false);
 useEffect(()=>{let active=true;api('cc-cabinets').then(d=>{if(active)setCabinets(d.cabinets)}).catch(e=>{if(active)setError(e.message)});return()=>{active=false}},[]);
 const endpoint=(action:string)=>action+'&workspace='+encodeURIComponent(cabinet);
 const load=async()=>{const d=await api(endpoint('cc-pec-list'));setData(d)};
 useEffect(()=>{setData(null);setEditing(null);setError('');if(!cabinet)return;let active=true;setLoading(true);api(endpoint('cc-pec-list')).then(d=>{if(active)setData(d)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[cabinet]);
 const save=async(action:string,body:any)=>{try{setError('');await api(endpoint(action),body);await load();cc.toast('Dossier PEC enregistré.');return true}catch(e){setError((e as Error).message);return false}};
 return <div className="cc-stack"><header className="cc-page-head"><div><h1>Dossiers PEC confiés à SmilePec</h1><p>Amel travaille ici pour un cabinet sélectionné, avec son compte SmilePec. Chaque plan conserve ses documents, ses dates et son statut.</p></div></header>
 <label className="workspace-picker">Cabinet client<select value={cabinet} onChange={e=>setCabinet(e.target.value)}><option value="">Sélectionner un cabinet</option>{cabinets.map(c=><option key={c.id} value={c.id}>{c.clinic_name||c.name}</option>)}</select><small>Le cabinet reste sélectionné lorsque vous rechargez la page ou partagez ce lien.</small></label>
 {error&&<p role="alert" className="form-error">{error}<button onClick={()=>load().catch(e=>setError(e.message))}>Réessayer</button></p>}{loading&&<p role="status">Chargement des dossiers…</p>}
 {!cabinet&&<Empty title="Choisissez le cabinet pour commencer" text="Seuls les dossiers du cabinet sélectionné seront affichés."/>}
 {data&&<><div className="cc-page-head"><h2>{data.clinic.clinic_name||data.clinic.name}</h2><button className="cc-btn is-primary" onClick={()=>setEditing({stage:PEC_STAGES[0]})}>Nouveau dossier PEC</button></div>{cc.can('billing.read')&&<PecReport revision={data.tasks} endpoint={endpoint('cc-pec-report')}/>}<PecBoard tasks={data.tasks} edit={setEditing} move={(id,stage)=>save('cc-pec-stage',{id,stage})}/></>}
 {editing&&data&&<Drawer open title={editing.id?'Plan de traitement':'Nouveau plan de traitement'} onClose={()=>setEditing(null)}><PecForm key={editing.id||'new-'+(editing.parent_task_id||'')} task={editing} patients={[]} account={{...cc.me.account,role:'admin'} as Account} members={data.members as Dashboard['members']} ownerId={cabinet} ownerName={data.clinic.name} canBill={cc.can('billing.read')} close={()=>setEditing(null)} save={async body=>{const ok=await save('cc-pec-save',body);if(ok)setEditing(null);return ok}} related={data.tasks.filter((t:WorkTask)=>t.id!==editing.id&&(t.id===(editing.parent_task_id||editing.id)||t.parent_task_id===(editing.parent_task_id||editing.id)))} openPlan={setEditing} addPlan={()=>setEditing({title:editing.title,parent_task_id:editing.parent_task_id||editing.id,stage:PEC_STAGES[0],assignee_id:editing.assignee_id,practitioner_id:editing.practitioner_id,attachments:[]})}/></Drawer>}
 </div>
}
