import { Eye, LogOut } from "lucide-react";
import { Badge, Card, day, Empty, eur, Loadable, time, useApi } from "./ui";

// Read-only "View as cabinet". The admin keeps their own session: this screen only renders a GET snapshot,
// no mutation is possible on behalf of the cabinet. Start/end and reason are audited server-side.
export default function AssistMode({ session, exit }: { session: { cabinet_name: string; reason: string; started_at: string }; exit: () => void }) {
  const { data, error, loading, reload } = useApi<any>("cc-assist-view");
  const p = data?.profile;
  return <div className="cc-assist" role="region" aria-label="Mode assistance">
    <div className="cc-assist-banner" role="status">
      <Eye size={16} aria-hidden /><span>Vous consultez Amelib en tant que <b>{session.cabinet_name}</b> — Mode assistance Amel · <b>lecture seule</b></span>
      <button className="cc-btn is-small" onClick={exit}><LogOut size={14} />Quitter le mode assistance</button>
    </div>
    <div className="cc-assist-body">
      <p className="cc-muted">Motif : {session.reason} · depuis {time(session.started_at)}. Aucune modification n’est possible dans ce mode ; les données cliniques ne sont pas affichées.</p>
      <Loadable loading={loading && !data} error={error} retry={reload} rows={10}>
        {data && <div className="cc-assist-grid">
          <Card title={p.clinic_name || p.name}><div className="cc-kv"><span>Praticien</span><span>{p.name}</span><span>Adresse</span><span>{[p.address, p.city].filter(Boolean).join(", ") || "—"}</span><span>Téléphone</span><span>{p.phone || "—"}</span><span>Agenda</span><span>{p.calendar_provider || (Object.keys(p.weekly_hours || {}).length ? "Horaires configurés" : "Non configuré")}</span><span>Statut</span><span className="cc-inline">{p.verified ? <Badge tone="ok">Vérifié</Badge> : <Badge tone="warn">Non vérifié</Badge>}{p.published ? <Badge>Publié</Badge> : null}</span></div>
            <div className="cc-mini-kpis"><span><b>{data.counts.patients}</b>patients</span><span><b>{data.counts.services}</b>prestations</span><span><b>{data.counts.free_slots}</b>créneaux libres</span></div></Card>
          <Card title="Agenda">{data.agenda.length ? <ul className="cc-list">{data.agenda.map((a: any, i: number) => <li key={i}><span><strong>{day(a.starts_at)} {time(a.starts_at)}</strong><small>{a.patient} · {a.duration} min</small></span><Badge>{a.status}</Badge></li>)}</ul> : <Empty title="Aucun rendez-vous à venir." icon="·" />}</Card>
          <Card title="Devis & factures">{data.documents.length ? <ul className="cc-list">{data.documents.map((d: any) => <li key={d.number}><span><strong>{d.number}</strong><small>{d.doc_type === "quote" ? "Devis" : "Facture"} · {day(d.issue_date)}</small></span><span className="cc-inline"><Badge>{d.status}</Badge>{eur(d.total, 2)}</span></li>)}</ul> : <Empty title="Aucun document." icon="·" />}</Card>
          <Card title="Tâches ouvertes">{data.tasks.length ? <ul className="cc-list">{data.tasks.map((t: any, i: number) => <li key={i}><span><strong>{t.title}</strong><small>{t.assignee || "Non attribuée"} · {t.stage}</small></span><Badge>{t.priority}</Badge></li>)}</ul> : <Empty title="Aucune tâche ouverte." icon="·" />}</Card>
          <Card title="Équipe">{data.team.length ? <ul className="cc-list">{data.team.map((m: any, i: number) => <li key={i}><span><strong>{m.name}</strong><small>{m.job_title || "Membre"} · {(m.permissions || []).join(", ") || "aucun droit"}</small></span>{!m.accepted && <Badge tone="warn">Invitation</Badge>}</li>)}</ul> : <Empty title="Aucun membre invité." icon="·" />}</Card>
          <Card title="Demandes SmilePec">{data.tickets.length ? <ul className="cc-list">{data.tickets.map((t: any, i: number) => <li key={i}><span><strong>{t.subject}</strong><small>{day(t.created_at)}</small></span><Badge>{t.answered ? "Répondu" : t.status}</Badge></li>)}</ul> : <Empty title="Aucune demande." icon="·" />}</Card>
        </div>}
      </Loadable>
    </div>
  </div>;
}
