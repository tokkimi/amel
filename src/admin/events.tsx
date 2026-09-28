import { useEffect, useState } from "react";
import { AlarmClock, Check, ChevronRight, Clock, MessageSquarePlus, UserPlus, X } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import { ago, Avatar, Badge, day, Drawer, EVENT_STATUS, EVENT_TYPE, Loadable, SeverityBadge, snoozeDate, Timeline, useApi } from "./ui";

export type OpEvent = {
  id: string; type: string; severity: string; status: string; title: string; description: string;
  cabinet_id: string | null; clinic_name: string | null; cabinet_owner_name: string | null;
  entity_type: string | null; entity_id: string | null; owner_id: string | null; owner_name: string | null;
  due_at: string | null; snoozed_until: string | null; created_at: string; source: string; rule_key: string | null; note_count?: number;
};
const PRIMARY: Record<string, string> = { verification: "Examiner", finance: "Voir", support: "Répondre", appointment: "Voir", onboarding: "Relancer", operational: "Traiter", document: "Voir", security: "Examiner" };

export function usePrimary() {
  const cc = useCC();
  return (e: OpEvent) => {
    if (e.entity_type === "ticket" && e.entity_id) return cc.open("ticket", e.entity_id);
    if (e.type === "verification" && e.entity_id) return cc.go("Réseau", "Vérifications:" + e.entity_id);
    if (e.cabinet_id && ["finance", "onboarding", "appointment", "document"].includes(e.type)) return cc.open("cabinet", e.cabinet_id);
    cc.open("event", e.id);
  };
}

export function useEventActions(done: () => void) {
  const cc = useCC();
  return async (id: string, patch: Record<string, unknown>, message = "Élément mis à jour.") => {
    await api("cc-event-update", { id, ...patch });
    cc.toast(message); cc.bump(); done();
  };
}

export function SnoozeMenu({ onPick, compact = false }: { onPick: (iso: string) => void; compact?: boolean }) {
  const [open, setOpen] = useState(false), [custom, setCustom] = useState("");
  return <div className="cc-menu-wrap">
    <button className={"cc-btn " + (compact ? "is-ghost is-small" : "")} aria-haspopup="menu" aria-expanded={open} onClick={(e) => { e.stopPropagation(); setOpen(!open); }}><AlarmClock size={14} />Reporter</button>
    {open && <div className="cc-menu" role="menu" onClick={(e) => e.stopPropagation()}>
      <button role="menuitem" onClick={() => { setOpen(false); onPick(snoozeDate("tomorrow")); }}>Demain 8:00</button>
      <button role="menuitem" onClick={() => { setOpen(false); onPick(snoozeDate("monday")); }}>Lundi 8:00</button>
      <button role="menuitem" onClick={() => { setOpen(false); onPick(snoozeDate("week")); }}>Dans une semaine</button>
      <label>Choisir une date<input type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
      <button role="menuitem" disabled={!custom} onClick={() => { setOpen(false); onPick(new Date(custom + "T08:00:00").toISOString()); }}>Valider la date</button>
    </div>}
  </div>;
}

export function AssignMenu({ value, onPick, compact = false }: { value: string | null; onPick: (id: string | null) => void; compact?: boolean }) {
  const { me } = useCC();
  return <label className={"cc-assign " + (compact ? "compact" : "")} onClick={(e) => e.stopPropagation()}>
    <UserPlus size={14} aria-hidden /><span className="sr-only">Assigner</span>
    <select aria-label="Responsable" value={value || ""} onChange={(e) => onPick(e.target.value || null)}>
      <option value="">Non assigné</option>
      {me.team.map((t) => <option key={t.id} value={t.id}>{t.id === me.account.id ? `Moi (${t.name})` : t.name}</option>)}
    </select>
  </label>;
}

export function EventRow({ e, refresh, selectable, selected, onSelect }: { e: OpEvent; refresh: () => void; selectable?: boolean; selected?: boolean; onSelect?: () => void }) {
  const cc = useCC();
  const primary = usePrimary();
  const act = useEventActions(refresh);
  const overdue = e.due_at && new Date(e.due_at) < new Date();
  const manage = cc.can("inbox.manage");
  return <article className={`cc-event sev-${e.severity}` + (selected ? " selected" : "")}>
    {selectable && <input type="checkbox" aria-label="Sélectionner" checked={!!selected} onChange={onSelect} />}
    <button className="cc-event-main" onClick={() => cc.open("event", e.id)}>
      <span className="cc-event-kicker"><SeverityBadge severity={e.severity} /><span>{EVENT_TYPE[e.type] || e.type}</span>{e.status === "in_progress" && <Badge tone="info">En cours</Badge>}</span>
      <strong>{e.title}</strong>
      <span className="cc-event-desc">{e.clinic_name || e.cabinet_owner_name ? <b>{e.clinic_name || e.cabinet_owner_name}</b> : null}{e.description && <> · {e.description}</>}</span>
      <span className="cc-event-meta">
        <span><Clock size={12} aria-hidden /> {ago(e.created_at)}</span>
        {e.due_at && <span className={overdue ? "late" : ""}>Échéance {day(e.due_at)}{overdue ? " · en retard" : ""}</span>}
        <span>{e.owner_name ? <><Avatar name={e.owner_name} size={16} /> {e.owner_name}</> : "Non assigné"}</span>
        {!!e.note_count && <span>{e.note_count} note(s)</span>}
      </span>
    </button>
    <div className="cc-event-actions">
      <button className="cc-btn is-primary is-small" onClick={() => primary(e)}>{PRIMARY[e.type] || "Voir"}<ChevronRight size={14} /></button>
      {manage && <>
        <AssignMenu compact value={e.owner_id} onPick={(id) => act(e.id, { owner_id: id }, id ? "Élément assigné." : "Élément désassigné.")} />
        <SnoozeMenu compact onPick={(iso) => act(e.id, { snoozed_until: iso }, "Reporté — il reviendra automatiquement.")} />
        <button className="cc-btn is-ghost is-small" onClick={() => act(e.id, { status: "resolved" }, "Élément résolu.")}><Check size={14} />Résoudre</button>
      </>}
    </div>
  </article>;
}

export function EventDrawer({ id, close }: { id: string; close: () => void }) {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>(id ? "cc-event" : null, { id, v: cc.version });
  const act = useEventActions(reload);
  const primary = usePrimary();
  const [note, setNote] = useState(""), [busy, setBusy] = useState(false);
  const e: OpEvent | undefined = data?.event;
  const manage = cc.can("inbox.manage");
  return <Drawer open={!!id} onClose={close} title={e?.title || "Élément"} subtitle={e ? <>{EVENT_TYPE[e.type]} · créé {ago(e.created_at)}{e.source === "rule" ? " · automatique" : ""}</> : undefined}
    actions={e && <button className="cc-btn is-primary" onClick={() => primary(e)}>{PRIMARY[e.type] || "Ouvrir"}</button>}>
    <Loadable loading={loading && !data} error={error} retry={reload}>
      {e && <div className="cc-stack">
        <div className="cc-kv">
          <span>Priorité</span><SeverityBadge severity={e.severity} />
          <span>Statut</span><span>{EVENT_STATUS[e.status]}{e.snoozed_until && new Date(e.snoozed_until) > new Date() ? ` · reporté au ${day(e.snoozed_until)}` : ""}</span>
          <span>Cabinet</span>{e.cabinet_id ? <button className="cc-link" onClick={() => cc.open("cabinet", e.cabinet_id!)}>{e.clinic_name || e.cabinet_owner_name}</button> : <span>—</span>}
          <span>Responsable</span>{manage ? <AssignMenu value={e.owner_id} onPick={(owner) => act(e.id, { owner_id: owner }, "Responsable mis à jour.")} /> : <span>{e.owner_name || "Non assigné"}</span>}
          <span>Échéance</span>{manage ? <input type="date" aria-label="Échéance" value={e.due_at ? e.due_at.slice(0, 10) : ""} onChange={(ev) => act(e.id, { due_at: ev.target.value ? new Date(ev.target.value + "T18:00:00").toISOString() : null }, "Échéance mise à jour.")} /> : <span>{day(e.due_at)}</span>}
        </div>
        {e.description && <p className="cc-prose">{e.description}</p>}
        {data.rule && <div className="cc-explain"><strong>Pourquoi cet élément ?</strong><p>{data.rule.condition} — {data.rule.action}.</p><small>Règle « {data.rule.label} ». Il se résout automatiquement quand la condition disparaît.</small></div>}
        {manage && <div className="cc-row-actions">
          {e.status !== "in_progress" && !["resolved", "dismissed"].includes(e.status) && <button className="cc-btn" onClick={() => act(e.id, { status: "in_progress" }, "Pris en charge.")}>Prendre en charge</button>}
          <SnoozeMenu onPick={(iso) => act(e.id, { snoozed_until: iso }, "Reporté.")} />
          {e.snoozed_until && <button className="cc-btn is-ghost" onClick={() => act(e.id, { snoozed_until: null }, "Report annulé.")}>Annuler le report</button>}
          {["resolved", "dismissed"].includes(e.status)
            ? <button className="cc-btn" onClick={() => act(e.id, { status: "open" }, "Rouvert.")}>Rouvrir</button>
            : <><button className="cc-btn is-primary" onClick={() => act(e.id, { status: "resolved" }, "Résolu.")}><Check size={14} />Résoudre</button><button className="cc-btn is-ghost" onClick={() => act(e.id, { status: "dismissed" }, "Classé sans suite.")}><X size={14} />Classer</button></>}
        </div>}
        {manage && <form className="cc-note-form internal" onSubmit={async (ev) => { ev.preventDefault(); if (!note.trim()) return; setBusy(true); try { await api("cc-note-add", { entity_type: "event", entity_id: e.id, body: note }); setNote(""); reload(); cc.toast("Note interne ajoutée."); } catch (err) { cc.toast((err as Error).message); } finally { setBusy(false); } }}>
          <label><span><MessageSquarePlus size={14} /> Note interne — visible uniquement par l’équipe Amelib</span><textarea rows={2} value={note} onChange={(ev) => setNote(ev.target.value)} maxLength={4000} /></label>
          <button className="cc-btn" disabled={busy || !note.trim()}>Ajouter la note</button>
        </form>}
        {!!data.notes.length && <div className="cc-notes">{data.notes.map((n: any) => <article key={n.id}><header><Avatar name={n.author} size={20} /><strong>{n.author}</strong><time>{day(n.created_at)} {new Date(n.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</time></header><p>{n.body}</p></article>)}</div>}
        <h3>Historique</h3>
        <Timeline items={data.history} />
      </div>}
    </Loadable>
  </Drawer>;
}

export function CreateTaskDialog({ preset, close }: { preset: { cabinet_id?: string; cabinet_name?: string; title?: string } | null; close: () => void }) {
  const cc = useCC();
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [cabinets, setCabinets] = useState<{ id: string; name: string }[]>([]);
  useEffect(() => { if (preset && !preset.cabinet_id && cc.can("cabinet.read")) api("cc-cabinets").then((d) => setCabinets(d.cabinets.map((c: any) => ({ id: c.id, name: c.clinic_name || c.name })))).catch(() => {}); }, [preset]);
  if (!preset) return null;
  return <div className="cc-modal-backdrop"><form className="cc-modal" aria-label="Créer une tâche" onSubmit={async (e) => {
    e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    setBusy(true); setError("");
    try { await api("cc-event-create", { title: f.title, description: f.description, severity: f.severity, type: "operational", cabinet_id: preset.cabinet_id || f.cabinet_id || null, owner_id: f.owner_id || null, due_at: f.due_at ? new Date(f.due_at + "T18:00:00").toISOString() : null }); cc.toast("Tâche créée."); cc.bump(); close(); }
    catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }}>
    <h2>Créer une tâche{preset.cabinet_name ? ` — ${preset.cabinet_name}` : ""}</h2>
    <label>Titre<input name="title" required maxLength={200} defaultValue={preset.title} autoFocus /></label>
    <label>Détails<textarea name="description" rows={3} maxLength={3000} /></label>
    <div className="cc-form-grid">
      {!preset.cabinet_id && <label>Cabinet<select name="cabinet_id" defaultValue=""><option value="">Aucun</option>{cabinets.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
      <label>Responsable<select name="owner_id" defaultValue={cc.me.account.id}><option value="">Non assigné</option>{cc.me.team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
      <label>Priorité<select name="severity" defaultValue="medium"><option value="low">Faible</option><option value="medium">À suivre</option><option value="high">Urgent</option><option value="critical">Critique</option></select></label>
      <label>Échéance<input name="due_at" type="date" /></label>
    </div>
    {error && <p className="cc-form-error" role="alert">{error}</p>}
    <div className="cc-modal-actions"><button type="button" className="cc-btn" onClick={close}>Annuler</button><button className="cc-btn is-primary" disabled={busy}>Créer</button></div>
  </form></div>;
}
