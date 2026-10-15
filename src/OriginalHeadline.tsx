import {useEffect,useState} from 'react';
import {SMILEPEC_HERO} from './SmilePecHome';
export default function OriginalHeadline(){
 const [ready,setReady]=useState(()=>{try{return !!sessionStorage.getItem('smilepec-original-welcome')}catch{return true}});
 useEffect(()=>{const enter=()=>setReady(true);window.addEventListener('smilepec:entered',enter);return()=>window.removeEventListener('smilepec:entered',enter)},[]);
 return <h1 className={'home-original-headline'+(ready?' headline-ready':'')} aria-label={SMILEPEC_HERO}><span aria-hidden="true">{SMILEPEC_HERO.split(' ').map((word,index)=><span className="headline-word" style={{animationDelay:(.2+index*.19+(index>=9?.95:0))+'s'}} key={index}>{word}{' '}</span>)}</span></h1>;
}
