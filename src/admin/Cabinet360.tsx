import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Circle, Eye, ListTodo, Mail, MessageSquarePlus, Phone } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import { CabinetActions } from "./Cabinets";
import { EventRow } from "./events";
import { ago, Avatar, Badge, Card, day, Drawer, Empty, eur, HealthBadge, LIFECYCLE, Loadable, Meter, SeverityBadge, Tabs, TICKET_PRIORITY, TICKET_STATUS, Timeline, time, useApi, VERIFICATION } from "./ui";

const TABS = ["Résumé", "Équipe", "Activité", "Patients", "Finance", "Documents", "Support", "Historique", "Configuration"];
const DOC_STATUS: Record<string, string> = { draft: "Brouillon", sent: "Envoyé", accepted: "Accepté", paid: "Payé", cancelled: "Annulé" };

export default function Cabinet360({ id, close }: { id: string; close: () => void }) {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>(id ? "cc-cabinet" : null, { id, v: cc.version });
  const [tab, setTab] = useState("Résumé");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { setTab("Résumé"); }, [id]);
  useEffect(() => {
    const on = (e: Event) => { const [t, focus] = String((e as CustomEvent).detail).split(":"); setTab(t); if (focus === "note") setTimeout(() => noteRef.current?.focus(), 80); };
    addEventListener("cc:cabinet-tab", on); return () => removeEventListener("cc:cabinet-tab", on);
  }, []);
  const c = data?.cabinet;
  const name = c ? c.clinic_name || c.name : "Cabinet";
  const owner = c && cc.me.team.find((t) => t.id === c.crm_owner_id)?.name;
  const tabs = TABS.filter((t) => (t !== "Finance" && t !== "Documents") || cc.can("billing.read")).filter((t) => t !== "Support" || cc.can("support.read")).map((t) => ({ key: t, label: t, count: t === "Support" ? data?.tickets.filter((x: any) => !["resolved", "closed"].includes(x.status)).length || undefined : undefined }));
  return <Drawer wide open={!!id} onClose={close} title={name}
    subtitle={c && <span className="cc-inline">{c.city || "Ville non renseignée"}{c.suspended ? <Badge tone="critical" icon>Suspendu</Badge> : <Badge tone="ok" icon>Actif</Badge>}{c.verified ? <Badge tone="ok">Vérifié</Badge> : <Badge tone="warn">Non vérifié</Badge>}<Badge>{LIFECYCLE[c.lifecycle]}{c.lifecycle_derived ? " (déduit)" : ""}</Badge><span>Responsable : <b>{c.name}</b></span>{owner && <span>Suivi : <b>{owner}</b></span>}</span>}
    actions={c && <div className="cc-head-actions">
      <a className="cc-btn is-small" href={"mailto:" + c.email}><Mail size={14} />Contacter</a>
      {cc.can("inbox.manage") && <button className="cc-btn is-small" onClick={() => cc.createTask({ cabinet_id: c.id, cabinet_name: name })}><ListTodo size={14} />Créer tâche</button>}
      {cc.can("cabinet.update") && <button className="cc-btn is-small" onClick={() => { setTab("Résumé"); setTimeout(() => noteRef.current?.focus(), 60); }}><MessageSquarePlus size={14} />Ajouter note</button>}
      <button className="cc-btn is-small" onClick={() => setTab("Activité")}>Voir activité</button>
      {cc.can("impersonation.readonly") && <button className="cc-btn is-small" onClick={() => cc.startAssist({ id: c.id, name })}><Eye size={14} />Voir comme cabinet</button>}
      <CabinetActions compact={false} c={{ id: c.id, name, email: c.email, suspended: c.suspended }} />
    </div>}>
    <Loadable loading={loading && !data} error={error} retry={reload} rows={10}>
      {data && <>
        <Tabs label="Sections du cabinet" tabs={tabs} value={tab} onChange={setTab} />
        <div className="cc-tab-body">
          {tab === "Résumé" && <Summary data={data} reload={reload} noteRef={noteRef} />}
          {tab === "Équipe" && <Team data={data} />}
          {tab === "Activité" && <Card title="Activité du cabinet"><Timeline items={data.history.filter((h: any) => h.kind !== "audit")} empty="Aucune activité enregistrée." /></Card>}
          {tab === "Patients" && <Patients data={data} />}
          {tab === "Finance" && <Finance data={data} />}
          {tab === "Documents" && <Documents data={data} />}
          {tab === "Support" && <Card title="Tickets support">{data.tickets.length ? <ul className="cc-list">{data.tickets.map((t: any) => <li key={t.id}><button className="cc-list-row" onClick={() => cc.open("ticket", t.id)}><span><strong>{t.subject}</strong><small>{t.requester} · {ago(t.created_at)}</small></span><span className="cc-inline"><Badge tone={t.priority === "critical" || t.priority === "high" ? "critical" : "neutral"}>{TICKET_PRIORITY[t.priority]}</Badge><Badge tone={["resolved", "closed"].includes(t.status) ? "ok" : "info"}>{TICKET_STATUS[t.status] || t.status}</Badge></span></button></li>)}</ul> : <Empty title="Aucun ticket support pour ce cabinet." />}</Card>}
          {tab === "Historique" && <><Card title="Journal des décisions"><Timeline items={data.history.filter((h: any) => h.kind === "audit" || h.kind === "assist")} empty="Aucune décision administrative enregistrée." /></Card>
            <Card title="Sessions d’assistance">{data.assist.length ? <ul className="cc-list">{data.assist.map((s: any) => <li key={s.id}><span><strong>{s.admin}</strong><small>{day(s.started_at)} {time(s.started_at)} → {s.ended_at ? time(s.ended_at) : "en cours"} · {s.reason}</small></span></li>)}</ul> : <Empty title="Aucune session d’assistance." icon="·" />}</Card></>}
          {tab === "Configuration" && <Config data={data} reload={reload} />}
        </div>
      </>}
    </Loadable>
  </Drawer>;
}

function Summary({ data, reload, noteRef }: { data: any; reload: () => void; noteRef: React.RefObject<HTMLTextAreaElement | null> }) {
  const cc = useCC();
  const c = data.cabinet, h = c.health, t = data.today;
  const [why, setWhy] = useState(false), [note, setNote] = useState(""), [mentions, setMentions] = useState<string[]>([]), [busy, setBusy] = useState(false);
  return <div className="cc-360-grid">
    <div className="cc-stack">
      <Card className="cc-health-card" title="Santé du cabinet" action={<button className="cc-link" aria-expanded={why} onClick={() => setWhy(!why)}>Pourquoi ?</button>}>
        <div className="cc-health-head"><HealthBadge {...h} /><ul className="cc-dims">{h.dimensions.map((d: any) => <li key={d.key} className={d.ok ? "ok" : "warn"}><span aria-hidden>{d.ok ? "✓" : "⚠"}</span>{d.label}<small>{d.score}/{d.max}</small></li>)}</ul></div>
        {why && <div className="cc-explain"><ul>{h.reasons.map((r: string) => <li key={r}>{r}</li>)}</ul><small>Calcul déterministe : activation 20, utilisation 25, finance 20, support 20, engagement 15. Voir la documentation du score.</small></div>}
        <dl className="cc-facts">
          <dt>Activité</dt><dd>{c.activity_14d ? `${c.activity_14d} action(s) sur 14 j${h.trend !== null ? ` (${h.trend > 0 ? "+" : ""}${h.trend} %)` : ""}` : "Aucune sur 14 j"}</dd>
          <dt>Support</dt><dd>{c.open_tickets ? `${c.open_tickets} demande(s) ouverte(s)` : "Aucune demande ouverte"}</dd>
          {cc.can("billing.read") && <><dt>Finance</dt><dd>{c.overdue_count ? `${c.overdue_count} facture(s) en retard (${eur(c.overdue_amount)})` : "Aucun retard"}</dd></>}
          <dt>Équipe</dt><dd>{c.team_count + 1} personne(s){c.pending_invites ? ` · ${c.pending_invites} invitation(s) en attente` : ""}</dd>
          <dt>Dernière activité</dt><dd>{c.last_activity_at ? `${day(c.last_activity_at)} ${time(c.last_activity_at)}` : "—"}</dd>
        </dl>
      </Card>
      <Card title="Aujourd’hui"><div className="cc-mini-kpis">
        <span><b>{t.appointments}</b>rendez-vous</span><span><b>{t.patients}</b>nouvelle(s) fiche(s)</span><span><b>{t.documents}</b>document(s)</span>{cc.can("billing.read") && <span><b>{eur(t.invoiced)}</b>facturés</span>}
      </div></Card>
      <Card title="À surveiller">{data.watch.length ? <ul className="cc-watch">{data.watch.map((w: any, i: number) => <li key={i}><SeverityBadge severity={w.severity} /><span>{w.text}</span></li>)}</ul> : <Empty title="Rien à signaler." text="Aucun signal faible détecté pour ce cabinet." />}</Card>
      {!!data.events.length && <Card title="Éléments ouverts"><div className="cc-event-list">{data.events.map((e: any) => <EventRow key={e.id} e={e} refresh={reload} />)}</div></Card>}
    </div>
    <div className="cc-stack">
      <Card title={`Onboarding — ${data.onboarding.percent} %`}><Meter value={data.onboarding.percent} /><ul className="cc-steps">{data.onboarding.steps.map((s: any) => <li key={s.key} className={s.done ? "done" : ""}>{s.done ? <CheckCircle2 size={15} aria-label="Fait" /> : <Circle size={15} aria-label="À faire" />}{s.label}</li>)}</ul>
        {cc.can("cabinet.update") && !data.onboarding.steps.find((s: any) => s.key === "training").done && <button className="cc-btn is-small" onClick={async () => { await api("cc-crm-update", { cabinet_id: c.id, training_done: true }); cc.toast("Formation marquée comme terminée."); reload(); }}>Marquer la formation terminée</button>}
      </Card>
      <Card title="Notes internes" action={<Badge tone="info">Visibles par Amelib uniquement</Badge>}>
        {cc.can("cabinet.update") && <form className="cc-note-form internal" onSubmit={async (e) => { e.preventDefault(); if (!note.trim()) return; setBusy(true); try { await api("cc-note-add", { entity_type: "cabinet", entity_id: c.id, body: note, mentions }); setNote(""); setMentions([]); cc.toast("Note ajoutée."); reload(); } catch (err) { cc.toast((err as Error).message); } finally { setBusy(false); } }}>
          <label><span className="sr-only">Nouvelle note</span><textarea ref={noteRef} rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={4000} placeholder="Ex. Cabinet intéressé par le nouveau module, à rappeler après la formation." /></label>
          <div className="cc-inline"><span className="cc-muted">Mentionner :</span>{cc.me.team.filter((m) => m.id !== cc.me.account.id).map((m) => <label key={m.id} className="cc-check-label"><input type="checkbox" checked={mentions.includes(m.id)} onChange={() => setMentions(mentions.includes(m.id) ? mentions.filter((x) => x !== m.id) : [...mentions, m.id])} />{m.name}</label>)}<button className="cc-btn is-small is-primary" disabled={busy || !note.trim()}>Ajouter</button></div>
        </form>}
        {data.notes.length ? <div className="cc-notes">{data.notes.map((n: any) => <article key={n.id}><header><Avatar name={n.author} size={20} /><strong>{n.author}</strong><time>{day(n.created_at)}</time></header><p>{n.body}</p>{!!n.mentions?.length && <small>Mentionne : {n.mentions.map((m: string) => cc.me.team.find((t) => t.id === m)?.name).filter(Boolean).join(", ")}</small>}</article>)}</div> : <Empty title="Aucune note pour le moment." icon="·" />}
      </Card>
      <Card title="Activité récente"><Timeline items={data.history.slice(0, 8)} /></Card>
    </div>
  </div>;
}

function Team({ data }: { data: any }) {
  const cc = useCC();
  return <Card title={`Équipe — ${data.team.length} personne(s)`}>
    <ul className="cc-list">{data.team.map((m: any) => <li key={m.id}><span className="cc-inline"><Avatar name={m.name} /><span><strong>{m.name}</strong><small>{m.job_title}{m.role === "worker" ? " · assistant" : ""} · {m.email}</small></span></span>
      <span className="cc-inline">{!m.accepted && <Badge tone="warn">Invitation en attente</Badge>}{!m.active && <Badge>Désactivé</Badge>}{m.suspended && <Badge tone="critical">Suspendu</Badge>}<Badge tone={m.verification_status === "approved" ? "ok" : m.verification_status === "rejected" ? "critical" : "warn"}>{VERIFICATION[m.verification_status]}</Badge><small className="cc-muted">Connexion : {m.last_login ? ago(m.last_login) : "—"}</small>
        {cc.can("verification.read") && m.verification_status !== "approved" && <button className="cc-link" onClick={() => cc.go("Réseau", "Vérifications:" + m.id)}>Vérifier</button>}</span></li>)}</ul>
  </Card>;
}

function Patients({ data }: { data: any }) {
  return <Card title={`Patients — ${data.cabinet.patient_count}`} action={<Badge tone="info">Besoin d’en connaître</Badge>}>
    <p className="cc-muted">Seules les informations nécessaires au suivi administratif sont affichées : aucune donnée clinique, allergie, traitement, schéma dentaire ni coordonnée patient.</p>
    {data.patients.length ? <table className="cc-table plain"><thead><tr><th>Patient</th><th>Statut</th><th>Pose prévue</th><th>Mutuelle</th><th>Pièces</th><th>Devis</th></tr></thead><tbody>{data.patients.map((p: any) => <tr key={p.id}><td data-label="Patient">{p.initials}</td><td data-label="Statut">{p.status}</td><td data-label="Pose">{p.prosthesis_date ? day(p.prosthesis_date) : "—"}</td><td data-label="Mutuelle">{p.mutual_provider || "—"}</td><td data-label="Pièces">{p.has_insurance_card ? "Carte ✓" : "Carte ✗"} · {p.has_billing_document ? "Facture ✓" : "Facture ✗"}</td><td data-label="Devis">{p.quote_status ? DOC_STATUS[p.quote_status] : "—"}</td></tr>)}</tbody></table> : <Empty title="Aucune fiche patient." icon="·" />}
  </Card>;
}

function Finance({ data }: { data: any }) {
  const c = data.cabinet;
  const late = data.documents.filter((d: any) => d.days_late > 0);
  return <div className="cc-stack">
    <div className="cc-mini-kpis boxed"><span><b>{eur(c.invoiced)}</b>facturé</span><span><b>{eur(c.paid)}</b>payé</span><span><b>{eur(c.outstanding)}</b>à encaisser</span><span className={c.overdue_amount ? "late" : ""}><b>{eur(c.overdue_amount)}</b>en retard</span></div>
    <p className="cc-muted">Argent géré par le cabinet (factures patients) — distinct des revenus Amelib.</p>
    <Card title="Factures en retard">{late.length ? <ul className="cc-list">{late.map((d: any) => <li key={d.id}><span><strong>{d.number}</strong><small>Échéance {day(d.due_date)}</small></span><span className="cc-inline late"><b>{eur(d.total, 2)}</b>{d.days_late} j de retard</span></li>)}</ul> : <Empty title="Aucune facture en retard 🎉" />}</Card>
  </div>;
}

function Documents({ data }: { data: any }) {
  return <Card title="Devis et factures">{data.documents.length ? <table className="cc-table plain"><thead><tr><th>Numéro</th><th>Type</th><th>Statut</th><th className="num">Montant</th><th>Émis</th><th>Échéance</th></tr></thead><tbody>{data.documents.map((d: any) => <tr key={d.id}><td data-label="Numéro">{d.number}{d.has_pdf ? " · PDF" : ""}</td><td data-label="Type">{d.doc_type === "quote" ? "Devis" : "Facture"}</td><td data-label="Statut">{DOC_STATUS[d.status]}{d.days_late > 0 && <Badge tone="critical">{d.days_late} j</Badge>}</td><td className="num" data-label="Montant">{eur(d.total, 2)}</td><td data-label="Émis">{day(d.issue_date)}</td><td data-label="Échéance">{day(d.due_date)}</td></tr>)}</tbody></table> : <Empty title="Aucun document." icon="·" />}</Card>;
}

function Config({ data, reload }: { data: any; reload: () => void }) {
  const cc = useCC();
  const c = data.cabinet;
  const [busy, setBusy] = useState(false);
  const edit = cc.can("cabinet.update");
  return <div className="cc-stack">
    <Card title="Suivi commercial (CRM)">
      <p className="cc-muted">Le cycle de vie commercial est indépendant du statut technique du compte (actif / suspendu).</p>
      <form className="cc-form-grid" onSubmit={async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>; setBusy(true); try { await api("cc-crm-update", { cabinet_id: c.id, lifecycle: f.lifecycle, owner_id: f.owner_id || null, tags: f.tags.split(",").map((x) => x.trim()).filter(Boolean), next_contact_at: f.next_contact_at ? new Date(f.next_contact_at + "T09:00:00").toISOString() : null }); cc.toast("Suivi mis à jour."); cc.bump(); } catch (err) { cc.toast((err as Error).message); } finally { setBusy(false); } }}>
        <label>Cycle de vie<select name="lifecycle" defaultValue={c.lifecycle} disabled={!edit}>{Object.entries(LIFECYCLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
        <label>Suivi par<select name="owner_id" defaultValue={c.crm_owner_id || ""} disabled={!edit}><option value="">Personne</option>{cc.me.team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <label>Prochain contact<input type="date" name="next_contact_at" defaultValue={c.next_contact_at ? c.next_contact_at.slice(0, 10) : ""} disabled={!edit} /></label>
        <label>Tags (séparés par des virgules)<input name="tags" defaultValue={(c.tags || []).join(", ")} disabled={!edit} placeholder="pilote, grand compte" /></label>
        {edit && <button className="cc-btn is-primary" disabled={busy}>Enregistrer</button>}
      </form>
    </Card>
    <Card title="Coordonnées">
      <form className="cc-form-grid" onSubmit={async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); setBusy(true); try { await api("admin-account-update", { id: c.id, ...f }); cc.toast("Coordonnées enregistrées."); cc.bump(); } catch (err) { cc.toast((err as Error).message); } finally { setBusy(false); } }}>
        <label>Responsable<input name="name" defaultValue={c.name} required disabled={!edit} /></label>
        <label>Cabinet<input name="clinic_name" defaultValue={c.clinic_name} disabled={!edit} /></label>
        <label>Ville<input name="city" defaultValue={c.city} disabled={!edit} /></label>
        <label>Téléphone<input name="phone" defaultValue={c.phone} disabled={!edit} /></label>
        {edit && <button className="cc-btn is-primary" disabled={busy}>Enregistrer</button>}
      </form>
      <p className="cc-inline cc-muted"><Mail size={13} />{c.email}{c.phone && <><Phone size={13} />{c.phone}</>}</p>
    </Card>
    <Card title="Fonctionnalités (feature flags)">
      {data.flags.length ? <ul className="cc-list">{data.flags.map((f: any) => <li key={f.key}><span><strong>{f.label}</strong><small>{f.key} · déploiement : {f.rollout}{f.override !== null ? " · forcé pour ce cabinet" : ""}</small></span>
        <span className="cc-inline"><Badge tone={f.enabled ? "ok" : "neutral"}>{f.enabled ? "ON" : "OFF"}</Badge>{cc.can("settings.update") && <select aria-label={"Forcer " + f.label} value={f.override === null ? "" : String(f.override)} onChange={async (e) => { await api("cc-flag-override", { flag_key: f.key, cabinet_id: c.id, enabled: e.target.value === "" ? null : e.target.value === "true" }); reload(); }}><option value="">Règle globale</option><option value="true">Forcer ON</option><option value="false">Forcer OFF</option></select>}</span></li>)}</ul>
        : <Empty title="Aucun feature flag défini." text="Créez-en depuis Configuration › Feature flags." icon="·" />}
    </Card>
  </div>;
}
