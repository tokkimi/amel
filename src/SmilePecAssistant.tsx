import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Send, X } from "lucide-react";
import { api } from "./client";

type Role = "patient" | "professional" | "worker" | "admin";
type Position = { x: number; y: number } | null;

const copyFor = (role: Role) => {
  if (role === "admin") return { title: "Pilotage SmilePec", description: "Les informations générales auxquelles votre compte administrateur a accès.", placeholder: "Ex. quelles sont les priorités aujourd’hui ?", prompts: ["Quel est le bilan comptable ?", "Quelles sont les priorités ?", "Combien de cabinets sont actifs ?"] };
  if (role === "patient") return { title: "Assistant SmilePec", description: "Un repère pour vos rendez-vous et vos échanges avec votre cabinet.", placeholder: "Ex. quels sont mes prochains rendez-vous ?", prompts: ["Mes prochains rendez-vous", "Comment contacter mon cabinet ?"] };
  return { title: "Votre assistant cabinet", description: "Réponses fondées uniquement sur les données auxquelles votre compte a accès.", placeholder: "Ex. quelles factures sont à suivre ?", prompts: ["Quelles poses de prothèse prioriser ?", "Que reste-t-il à encaisser ?", "Qu’ai-je à faire aujourd’hui ?"] };
};

export default function SmilePecAssistant({ role }: { role: Role }) {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [position, setPosition] = useState<Position>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ x: number; y: number; pointerX: number; pointerY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  const copy = copyFor(role);

  useEffect(() => {
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);

  const ask = async (value?: string) => {
    const asked = (value || question).trim();
    if (!asked || busy) return;
    setBusy(true);
    try {
      const result = await api<{ answer: string; sources: string[] }>("assistant", { question: asked });
      setAnswer(result.answer);
      setSources(result.sources || []);
      setQuestion("");
    } catch {
      setAnswer("Je n’arrive pas à accéder à votre espace pour le moment. Réessayez dans un instant.");
      setSources([]);
    } finally {
      setBusy(false);
    }
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    drag.current = { x: bounds.left, y: bounds.top, pointerX: event.clientX, pointerY: event.clientY, moved: false };
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(true);
  };
  const moveDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    const deltaX = event.clientX - drag.current.pointerX;
    const deltaY = event.clientY - drag.current.pointerY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 5) drag.current.moved = true;
    const size = 62;
    setPosition({ x: Math.max(12, Math.min(window.innerWidth - size - 12, drag.current.x + deltaX)), y: Math.max(12, Math.min(window.innerHeight - size - 12, drag.current.y + deltaY)) });
  };
  const stopDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (!drag.current) return;
    suppressClick.current = drag.current.moved;
    drag.current = null;
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <div className={`smilepec-assistant-float ${open ? "is-open" : ""} ${dragging ? "is-dragging" : ""}`} style={position ? { left: position.x, top: position.y, right: "auto", bottom: "auto" } : undefined}>
      {open && <section className="smilepec-assistant-panel" role="dialog" aria-label={copy.title}>
        <header><span className="assistant-orb" aria-hidden="true"><img src="/smilepec-assistant.png" alt="" /></span><div><span className="eyebrow">ASSISTANT SMILEPEC</span><h2>{copy.title}</h2></div><button className="assistant-close" type="button" onClick={() => setOpen(false)} aria-label="Fermer l’assistant"><X size={18} /></button></header>
        <p className="assistant-intro">{copy.description}</p>
        <div className="assistant-prompts">{copy.prompts.map((prompt) => <button key={prompt} type="button" onClick={() => ask(prompt)}>{prompt}</button>)}</div>
        {answer && <div className="assistant-answer"><strong>SmilePec</strong><p>{answer}</p>{sources.length > 0 && <small>{sources.join(" · ")}</small>}</div>}
        <form onSubmit={(event) => { event.preventDefault(); ask(); }} className="assistant-form"><input value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={copy.placeholder} aria-label="Votre question à l’assistant" /><button className="assistant-send" disabled={busy} aria-label="Envoyer la question"><Send size={17} /></button></form>
      </section>}
      <button className="smilepec-assistant-trigger" type="button" aria-label={open ? "Fermer l’assistant SmilePec" : "Ouvrir l’assistant SmilePec"} aria-expanded={open} onPointerDown={startDrag} onPointerMove={moveDrag} onPointerUp={stopDrag} onPointerCancel={stopDrag} onClick={() => { if (suppressClick.current) { suppressClick.current = false; return; } setOpen((value) => !value); }}>
        <img src="/smilepec-assistant.png" alt="" /><span className="assistant-pulse" aria-hidden="true" />
      </button>
    </div>
  );
}
