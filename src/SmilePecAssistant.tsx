import { useState } from "react";
import { Bot, Send } from "lucide-react";
import { api } from "./client";

export default function SmilePecAssistant({ admin = false }: { admin?: boolean }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const ask = async (value?: string) => { const q = value || question; if (!q.trim()) return; setBusy(true); try { const r = await api<{answer:string;sources:string[]}>("assistant", { question:q }); setAnswer(r.answer); setSources(r.sources); setQuestion(""); } finally { setBusy(false); } };
  const prompts = admin ? ["Quel est le bilan comptable ?", "Quelles sont les priorités ?", "Combien de cabinets sont actifs ?"] : ["Quelles poses de prothèse prioriser ?", "Que reste-t-il à encaisser ?", "Qu’ai-je à faire aujourd’hui ?"];
  return <section className="glass panel smilepec-assistant"><div className="section-title"><div><span className="eyebrow">ASSISTANT SMILEPEC</span><h2>{admin ? "Pilotage de la plateforme" : "Votre assistant cabinet"}</h2><p>{admin ? "Synthèse des données d’administration autorisées." : "Réponses fondées uniquement sur les données de votre cabinet."}</p></div><span className="assistant-orb"><Bot size={22}/></span></div><div className="assistant-prompts">{prompts.map(p=><button key={p} className="secondary" onClick={()=>ask(p)}>{p}</button>)}</div><form onSubmit={e=>{e.preventDefault();ask()}} className="assistant-form"><input value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Ex. quelles factures sont à suivre ?" /><button className="primary" disabled={busy} aria-label="Interroger l’assistant"><Send size={16}/></button></form>{answer&&<div className="assistant-answer"><strong>SmilePec</strong><p>{answer}</p><small>{sources.join(" · ")}</small></div>}</section>;
}
