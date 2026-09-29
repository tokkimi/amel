import { useState } from "react";
import { Bookmark, Plus, Trash2 } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import { useApi } from "./ui";

// Saved filters per scope: built-in presets + personal/shared views stored server-side.
export default function SavedViews({ scope, builtins, current, apply }: { scope: string; builtins: { name: string; filters: Record<string, string> }[]; current: Record<string, string>; apply: (f: Record<string, string>) => void }) {
  const cc = useCC();
  const views = useApi<any>("cc-views", { scope, v: cc.version });
  const [open, setOpen] = useState(false), [name, setName] = useState(""), [shared, setShared] = useState(false);
  return <div className="cc-saved">
    <Bookmark size={14} aria-hidden /><span className="sr-only">Vues sauvegardées</span>
    {builtins.map((v) => <button key={v.name} className="cc-chip-lite" onClick={() => apply(v.filters)}>{v.name}</button>)}
    {(views.data?.views || []).map((v: any) => <span key={v.id} className="cc-chip-lite custom"><button onClick={() => apply(v.filters)}>{v.name}{v.shared ? " · équipe" : ""}</button>{v.owner_id === cc.me.account.id && <button aria-label={"Supprimer la vue " + v.name} onClick={async () => { await api("cc-view-delete", { id: v.id }); views.reload(); }}><Trash2 size={12} /></button>}</span>)}
    {open ? <form className="cc-inline-form" onSubmit={async (e) => { e.preventDefault(); if (!name.trim()) return; await api("cc-view-save", { scope, name, filters: current, shared }); setOpen(false); setName(""); views.reload(); cc.toast("Vue enregistrée."); }}>
      <input autoFocus aria-label="Nom de la vue" placeholder="Nom de la vue" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} />
      <label className="cc-check-label"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Partager avec l’équipe</label>
      <button className="cc-btn is-small is-primary">Enregistrer</button><button type="button" className="cc-btn is-small is-ghost" onClick={() => setOpen(false)}>Annuler</button>
    </form> : <button className="cc-chip-lite add" onClick={() => setOpen(true)}><Plus size={12} />Enregistrer la vue</button>}
  </div>;
}
