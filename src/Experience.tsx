import {useEffect,useState} from 'react';
export function MobileSplash(){
 const [visible,setVisible]=useState(()=>{try{return !sessionStorage.getItem('smilepec-original-welcome')}catch{return false}});
 useEffect(()=>{if(!visible)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';return()=>{document.body.style.overflow=previous}},[visible]);
 if(!visible)return null;
 const enter=()=>{try{sessionStorage.setItem('smilepec-original-welcome','1')}catch{}setVisible(false);window.dispatchEvent(new Event('smilepec:entered'))};
 return <div className="original-smilepec-splash" role="dialog" aria-modal="true" aria-label="Bienvenue sur SmilePec"><img src="/brand/smilepec-original-stacked.svg" alt="SmilePec"/><p>Pensé dans les moindres détails</p><button autoFocus onClick={enter}>Cliquez pour entrer</button></div>;
}
