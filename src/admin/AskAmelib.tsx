import { useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import { Badge, Card } from "./ui";

// Ask Amelib (bêta): questions are matched to fixed, permission-checked queries on real data.
// No generative model is involved, so answers cannot be invented; unsupported questions are declined.
export default function AskAmelib() {
  const cc = useCC();
  const [q, setQ] = useState(""), [busy, setBusy] = useState(false), [result, setResult] = useState<any>(null), [error, setError] = useState("");
  const ask = async (question: string) => {
    setQ(question); setBusy(true); setError("");
    try { setResult(await api("cc-ask&q=" + encodeURIComponent(question))); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  const examples = result?.examples || ["Quels cabinets nécessitent mon attention ?", "Montre-moi les factures en retard de plus de 30 jours.", "Quels cabinets ont plus de deux tickets ouverts ?", "Qu’est-ce qui s’est passé aujourd’hui ?"];
  return <Card className="cc-ask" title={<><MessageCircleQuestion size={15} /> Ask Amelib <Badge tone="info">Bêta</Badge></>}>
    <form onSubmit={(e) => { e.preventDefault(); if (q.trim()) ask(q.trim()); }} className="cc-ask-form">
      <input aria-label="Poser une question" placeholder="Pose une question sur la plateforme…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={300} />
      <button className="cc-btn is-primary" disabled={busy || !q.trim()}>{busy ? "…" : "Demander"}</button>
    </form>
    <div className="cc-chips">{examples.map((x: string) => <button key={x} onClick={() => ask(x)}>{x}</button>)}</div>
    {error && <p className="cc-form-error">{error}</p>}
    {result?.answer && <div className="cc-ask-answer" aria-live="polite">
      <p>{result.answer}</p>
      {!!result.rows?.length && <ul>{result.rows.map((r: any, i: number) => <li key={i}>{r.cabinet_id ? <button className="cc-link" onClick={() => cc.open("cabinet", r.cabinet_id)}>{r.label}</button> : <span>{r.label}</span>}<b>{r.value}</b>{r.detail && <small>{r.detail}</small>}</li>)}</ul>}
      {result.sources && <small className="cc-muted">Sources : {result.sources.join(", ")} · réponses calculées, sans IA générative.</small>}
    </div>}
  </Card>;
}
