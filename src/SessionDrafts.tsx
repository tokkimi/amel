import {useEffect,useRef,useState,RefObject} from 'react';
import {api} from './client';
type Extras={value:unknown;restore:(value:any)=>void};
const extras=new WeakMap<HTMLFormElement,Extras>();
const writes=new Map<string,Promise<unknown>>();
export function useDraftExtras(ref:RefObject<HTMLFormElement|null>,value:unknown,restore:(value:any)=>void){
 const previous=useRef(value),previousForm=useRef<HTMLFormElement|null>(null);
 useEffect(()=>{const form=ref.current;if(!form)return;extras.set(form,{value,restore});if(previousForm.current===form&&previous.current!==value){form.dispatchEvent(new Event('smilepec:draft-change',{bubbles:true}));}previous.current=value;previousForm.current=form;});
}
export default function SessionDrafts({accountId}:{accountId:string}){
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let alive=true,loaded=false,restoring=false;
  const drafts=new Map<string,any>(),restored=new WeakSet<HTMLFormElement>(),dirty=new Set<HTMLFormElement>(),timers=new Map<HTMLFormElement,ReturnType<typeof setTimeout>>(),submitted=new Map<string,HTMLFormElement>();
  const fields=(form:HTMLFormElement)=>Array.from(form.elements).filter((e:any)=>e.name&&['INPUT','SELECT','TEXTAREA'].includes(e.tagName)&&!['password','file','submit','hidden'].includes(e.type)&&!/password|token|secret|recovery/i.test(e.name)) as (HTMLInputElement|HTMLSelectElement|HTMLTextAreaElement)[];
  const eligible=(form:HTMLFormElement)=>!!form.dataset.draftKey;
  const scope=(form:HTMLFormElement)=>form.dataset.draftKey!;
  const payload=(form:HTMLFormElement)=>({fields:Object.fromEntries(fields(form).map((e:any)=>[e.name,e.type==='checkbox'?e.checked:e.value])),extra:extras.get(form)?.value,version:form.dataset.draftVersion||''});
  const enqueue=(key:string,body:any)=>{const full=accountId+'|'+key;const next=(writes.get(full)||Promise.resolve()).catch(()=>{}).then(()=>api('workspace-drafts',body));writes.set(full,next);return next;};
  const save=(form:HTMLFormElement)=>{const key=scope(form),value=payload(form);drafts.set(key,value);void enqueue(key,{scope:key,payload:value}).then(()=>{if(alive)setMessage('Brouillon enregistré dans votre compte.')}).catch(()=>{if(alive)setMessage('Brouillon non enregistré. Vérifiez votre connexion avant de quitter.');});};
  const restore=()=>{if(!loaded)return;document.querySelectorAll<HTMLFormElement>('form[data-draft-key]').forEach(form=>{if(restored.has(form)||dirty.has(form))return;const value=drafts.get(scope(form));if(!value){restored.add(form);return;}if(value.extra&&!extras.has(form))return;restored.add(form);if(value.version!==(form.dataset.draftVersion||'')){setMessage('Une version plus récente a été enregistrée. Le brouillon ancien n’a pas remplacé la fiche.');return;}restoring=true;for(const e of fields(form)){if(!(e.name in (value.fields||{})))continue;const proto=e.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:e.tagName==='SELECT'?HTMLSelectElement.prototype:HTMLInputElement.prototype;const prop=(e as HTMLInputElement).type==='checkbox'?'checked':'value';Object.getOwnPropertyDescriptor(proto,prop)?.set?.call(e,value.fields[e.name]);e.dispatchEvent(new Event('input',{bubbles:true}));e.dispatchEvent(new Event('change',{bubbles:true}));}restoring=false;extras.get(form)?.restore(value.extra);setMessage('Votre brouillon a été repris.');});};
  const input=(event:Event)=>{if(restoring)return;const form=(event.target as HTMLElement)?.closest('form');if(!form||!eligible(form)||!loaded)return;dirty.add(form);clearTimeout(timers.get(form));timers.set(form,setTimeout(()=>save(form),800));};
  const submit=(event:Event)=>{const form=event.target as HTMLFormElement;if(!eligible(form))return;submitted.set(form.dataset.draftAction||'',form);clearTimeout(timers.get(form));save(form);};
  const success=(event:Event)=>{const action=(event as CustomEvent).detail?.action?.split('&')[0],form=submitted.get(action);if(!form)return;submitted.delete(action);dirty.delete(form);clearTimeout(timers.get(form));const key=scope(form);drafts.delete(key);void enqueue(key,{scope:key,clear:true}).catch(()=>{});setMessage('Modifications enregistrées.');};
  const failed=(event:Event)=>submitted.delete((event as CustomEvent).detail?.action?.split('&')[0]);
  const observer=new MutationObserver(()=>{for(const form of dirty){if(!form.isConnected){clearTimeout(timers.get(form));save(form);dirty.delete(form)}}restore()});
  void api('workspace-drafts').then(r=>{if(!alive)return;for(const d of r.drafts)drafts.set(d.scope,d.payload);loaded=true;restore()}).catch(()=>{setMessage('Sauvegarde des brouillons indisponible.');});
  observer.observe(document.body,{childList:true,subtree:true});
  const pagehide=()=>{for(const form of dirty){const body=JSON.stringify({scope:scope(form),payload:payload(form)});if(body.length<60000)void fetch('/api?action=workspace-drafts',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'same-origin',body,keepalive:true}).catch(()=>{});}};
  for(const name of ['input','change','smilepec:draft-change'])document.addEventListener(name,input,true);
  document.addEventListener('submit',submit,true);window.addEventListener('smilepec:saved',success);window.addEventListener('smilepec:save-failed',failed);window.addEventListener('pagehide',pagehide);
  return()=>{alive=false;for(const form of dirty)save(form);for(const timer of timers.values())clearTimeout(timer);observer.disconnect();for(const name of ['input','change','smilepec:draft-change'])document.removeEventListener(name,input,true);document.removeEventListener('submit',submit,true);window.removeEventListener('smilepec:saved',success);window.removeEventListener('smilepec:save-failed',failed);window.removeEventListener('pagehide',pagehide);};
 },[accountId]);
 return message?<div className="sp-draft-status" role="status">{message}<button onClick={()=>setMessage('')} aria-label="Masquer">×</button></div>:null;
}
