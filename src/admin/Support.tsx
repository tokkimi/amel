import { useEffect, useState } from "react";
import { Lock, Send } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import DataTable, { Column } from "./DataTable";
import { ago, Avatar, Badge, Card, Chips, day, Drawer, Kpi, Loadable, TICKET_CATEGORY, TICKET_PRIORITY, TICKET_STATUS, Timeline, time, useApi, useUrlParam } from "./ui";

type Ticket = { id: string; subject: string; status: string; priority: string; category: string; owner_id: string | null; owner_name: string | null; requester: string; cabinet_id: string; cabinet_name: string; created_at: string; updated_at: string; last_reply_at: string | null; internal_count: number; public_count: number; sla: { due: string; state: string } };
const SLA: Record<string, { label: string; tone: string }> = { breached: { label: "SLA dépassé", tone: "critical" }, at_risk: { label: "SLA proche", tone: "warn" }, ok: { label: "Dans les délais", tone: "ok" }, answered: { label: "Répondu", tone: "ok" }, done: { label: "Terminé", tone: "neutral" } };
const priorityTone = (p: string) => (p === "critical" ? "critical" : p === "high" ? "warn" : "neutral");

export default function Support() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-support", { v: cc.version });
  const [sub, setSub] = useUrlParam("sub");
  const [status, setStatus] = useState("active"), [owner, setOwner] = useState(""), [priority, setPriority] = useState("");
  useEffect(() => { if (sub) { setStatus(sub); setSub("", true); } }, [sub]);
  const tickets: Ticket[] = data?.tickets || [];
  const rows = tickets.filter((t) => (status === "active" ? !["resolved", "closed"].includes(t.status) : status === "all" ? true : status === "breached" ? t.sla.state === "breached" : t.status === status)
    && (!owner || (owner === "none" ? !t.owner_id : t.owner_id === owner)) && (!priority || t.priority === priority));
  const columns: Column<Ticket>[] = [
    { key: "subject", label: "Demande", mobile: "title", sort: (t) => t.subject.toLowerCase(), render: (t) => <span className="cc-cell-main"><strong>{t.subject}</strong><small>{t.cabinet_name} · {t.requester}</small></span> },
    { key: "priority", label: "Priorité", sort: (t) => ["low", "normal", "high", "critical"].indexOf(t.priority), render: (t) => <Badge tone={priorityTone(t.priority)} icon={t.priority === "critical"}>{TICKET_PRIORITY[t.priority]}</Badge> },
    { key: "status", label: "Statut", sort: (t) => t.status, render: (t) => <Badge tone={["resolved", "closed"].includes(t.status) ? "ok" : t.status === "waiting_customer" ? "neutral" : "info"}>{TICKET_STATUS[t.status] || t.status}</Badge> },
    { key: "sla", label: "SLA", sort: (t) => new Date(t.sla.due).getTime(), render: (t) => <span className="cc-inline"><Badge tone={SLA[t.sla.state].tone} icon={t.sla.state === "breached"}>{SLA[t.sla.state].label}</Badge>{!["done", "answered"].includes(t.sla.state) && <small>{ago(t.sla.due)}</small>}</span> },
    { key: "age", label: "Ouvert", sort: (t) => new Date(t.created_at).getTime(), render: (t) => ago(t.created_at) },
    { key: "category", label: "Catégorie", mobile: "hide", sort: (t) => t.category, render: (t) => TICKET_CATEGORY[t.category] || t.category },
    { key: "owner", label: "Responsable", sort: (t) => t.owner_name || "~", render: (t) => t.owner_name || <span className="cc-muted">Non assigné</span> },
    { key: "reply", label: "Dernière réponse", mobile: "hide", sort: (t) => (t.last_reply_at ? new Date(t.last_reply_at).getTime() : 0), render: (t) => (t.last_reply_at ? ago(t.last_reply_at) : "—") },
  ];
  const k = data?.kpis;
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Support Center</h1><p>Demandes des cabinets, SLA et échanges — réponses publiques et notes internes séparées.</p></div></header>
    {k && <div className="cc-kpis">
      <Kpi label="Nouveaux" value={k.new} tone={k.new ? "info" : "neutral"} onClick={() => setStatus("new")} />
      <Kpi label="En cours" value={k.open} onClick={() => setStatus("active")} />
      <Kpi label="En attente cabinet" value={k.waiting} onClick={() => setStatus("waiting_customer")} />
      <Kpi label="Résolus aujourd’hui" value={k.resolved_today} tone="ok" onClick={() => setStatus("resolved")} />
      {k.breached > 0 && <Kpi label="SLA dépassés" value={k.breached} tone="critical" onClick={() => setStatus("breached")} />}
    </div>}
    <div className="cc-filterbar">
      <Chips label="Statut" value={status} onChange={setStatus} items={[{ key: "active", label: "À traiter" }, { key: "new", label: "Nouveaux" }, { key: "in_progress", label: "En cours" }, { key: "waiting_customer", label: "En attente cabinet" }, { key: "breached", label: "SLA dépassé" }, { key: "resolved", label: "Résolus" }, { key: "all", label: "Tous" }]} />
      <select aria-label="Responsable" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Tous les responsables</option><option value={cc.me.account.id}>Mes tickets</option><option value="none">Non assignés</option>{cc.me.team.filter((t) => t.id !== cc.me.account.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
      <select aria-label="Priorité" value={priority} onChange={(e) => setPriority(e.target.value)}><option value="">Toutes priorités</option>{Object.entries(TICKET_PRIORITY).map(([key, l]) => <option key={key} value={key}>{l}</option>)}</select>
    </div>
    <Card>
      <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
        <DataTable label="Tickets" rows={rows} columns={columns} onOpen={(t) => cc.open("ticket", t.id)} search={(t) => [t.subject, t.cabinet_name, t.requester, t.id].join(" ")} initialSort={{ key: "sla", dir: 1 }}
          empty={status === "active" ? <div className="cc-empty"><span>✓</span><strong>Aucun ticket à traiter 🎉</strong><p>Tout est sous contrôle pour le moment.</p></div> : undefined} />
      </Loadable>
    </Card>
  </div>;
}

export function TicketDrawer({ id, close }: { id: string; close: () => void }) {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>(id ? "cc-ticket" : null, { id, v: cc.version });
  const [mode, setMode] = useState<"public" | "internal">("public"), [body, setBody] = useState(""), [next, setNext] = useState(""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => { setBody(""); setMode("public"); setErr(""); }, [id]);
  const t = data?.ticket;
  const update = async (patch: Record<string, unknown>) => { try { await api("cc-ticket-update", { id, ...patch }); cc.toast("Ticket mis à jour."); cc.bump(); } catch (e) { cc.toast((e as Error).message); } };
  const reply = cc.can("support.reply");
  return <Drawer open={!!id} onClose={close} title={t?.subject || "Ticket"} subtitle={t && <span className="cc-inline"><button className="cc-link" onClick={() => cc.open("cabinet", t.cabinet_id)}>{t.cabinet_name}</button>· {t.requester} · ouvert {ago(t.created_at)} · #{t.id.slice(0, 8)}</span>}>
    <Loadable loading={loading && !data} error={error} retry={reload}>
      {t && <div className="cc-stack">
        <div className="cc-kv">
          <span>Statut</span><select disabled={!reply} aria-label="Statut" value={t.status} onChange={(e) => update({ status: e.target.value })}>{Object.entries(TICKET_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span>Priorité</span><select disabled={!reply} aria-label="Priorité" value={t.priority} onChange={(e) => update({ priority: e.target.value })}>{Object.entries(TICKET_PRIORITY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span>Catégorie</span><select disabled={!reply} aria-label="Catégorie" value={t.category} onChange={(e) => update({ category: e.target.value })}>{Object.entries(TICKET_CATEGORY).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <span>Responsable</span><select disabled={!cc.can("support.assign")} aria-label="Responsable" value={t.owner_id || ""} onChange={(e) => update({ owner_id: e.target.value || null })}><option value="">Non assigné</option>{cc.me.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>
          <span>SLA</span><span><Badge tone={SLA[t.sla.state].tone} icon>{SLA[t.sla.state].label}</Badge> <small>échéance {day(t.sla.due)} {time(t.sla.due)}</small></span>
          <span>Deadline</span><input disabled={!reply} type="date" aria-label="Deadline" value={t.due_at ? t.due_at.slice(0, 10) : ""} onChange={(e) => update({ due_at: e.target.value ? new Date(e.target.value + "T18:00:00").toISOString() : null })} />
        </div>
        <div className="cc-thread">
          <article className="msg from-cabinet"><header><Avatar name={t.requester} size={22} /><strong>{t.requester}</strong><time>{day(t.created_at)} {time(t.created_at)}</time></header><p>{t.body}</p><small>Pièces jointes : aucune</small></article>
          {data.messages.map((m: any) => <article key={m.id} className={"msg " + (m.visibility === "internal" ? "internal" : "public")}>
            <header>{m.visibility === "internal" ? <Lock size={13} aria-hidden /> : <Send size={13} aria-hidden />}<strong>{m.author}</strong><Badge tone={m.visibility === "internal" ? "warn" : "info"}>{m.visibility === "internal" ? "Note interne" : "Réponse au cabinet"}</Badge><time>{day(m.created_at)} {time(m.created_at)}</time></header><p>{m.body}</p>
          </article>)}
        </div>
        {reply && <form className={"cc-reply " + mode} onSubmit={async (e) => {
          e.preventDefault(); if (!body.trim()) return;
          setBusy(true); setErr("");
          try { const r = await api("cc-ticket-reply", { id, visibility: mode, body, status: next || undefined }); setBody(""); setNext(""); cc.toast(mode === "public" ? `Réponse envoyée au cabinet (statut : ${TICKET_STATUS[r.status]}).` : "Note interne ajoutée — non visible par le cabinet."); cc.bump(); }
          catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
        }}>
          <div className="cc-reply-switch" role="radiogroup" aria-label="Type de message">
            <button type="button" role="radio" aria-checked={mode === "public"} className={mode === "public" ? "active public" : ""} onClick={() => setMode("public")}><Send size={14} />Réponse publique</button>
            <button type="button" role="radio" aria-checked={mode === "internal"} className={mode === "internal" ? "active internal" : ""} onClick={() => setMode("internal")}><Lock size={14} />Note interne</button>
          </div>
          <p className="cc-reply-hint">{mode === "public" ? "⚠ Visible par le cabinet. Il recevra une notification." : "🔒 Visible uniquement par l’équipe Amelib. Jamais envoyé au cabinet."}</p>
          <textarea aria-label={mode === "public" ? "Réponse au cabinet" : "Note interne"} rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={5000} />
          {err && <p className="cc-form-error" role="alert">{err}</p>}
          <div className="cc-inline"><label>Puis passer à<select value={next} onChange={(e) => setNext(e.target.value)}><option value="">{mode === "public" ? "Statut automatique" : "Statut inchangé"}</option>{Object.entries(TICKET_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
            <button className={"cc-btn " + (mode === "public" ? "is-primary" : "is-internal")} disabled={busy || !body.trim()}>{mode === "public" ? "Envoyer au cabinet" : "Ajouter la note interne"}</button></div>
        </form>}
        <h3>Historique</h3>
        <Timeline items={data.history} />
      </div>}
    </Loadable>
  </Drawer>;
}
