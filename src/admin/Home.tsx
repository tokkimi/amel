import { ArrowRight, Building2, Euro, Flame, Inbox as InboxIcon, Sparkles } from "lucide-react";
import { useCC } from "./context";
import { EventRow, OpEvent, usePrimary } from "./events";
import { ago, AUDIT_LABEL, Avatar, Card, Empty, eur, Kpi, Loadable, Skeleton, time, useApi } from "./ui";
import AskAmelib from "./AskAmelib";

export default function Home() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-home", { v: cc.version });
  const primary = usePrimary();
  const first = cc.me.account.name.split(" ")[0];
  const hour = new Date().getHours();
  if (error) return <Loadable loading={false} error={error} retry={reload}>{null}</Loadable>;
  if (loading && !data) return <div className="cc-stack"><Skeleton rows={2} height={28} /><div className="cc-kpis">{[0, 1, 2, 3].map((i) => <div key={i} className="cc-kpi"><Skeleton rows={2} /></div>)}</div><Skeleton rows={6} height={46} /></div>;
  const c = data.counts;
  return <div className="cc-stack">
    <header className="cc-hello">
      <div><h1>{hour < 18 ? "Bonjour" : "Bonsoir"} {first}</h1><p>Voici ce qui demande ton attention aujourd’hui.</p></div>
      <button className="cc-btn is-primary" onClick={() => cc.go("Inbox")}><InboxIcon size={15} />Ouvrir l’Inbox</button>
    </header>
    <div className="cc-kpis">
      <Kpi icon={<InboxIcon size={16} />} label="À traiter" value={c.todo} hint={c.unassigned ? `${c.unassigned} non assigné(s)` : "Tout est assigné"} onClick={() => cc.go("Inbox")} />
      <Kpi icon={<Flame size={16} />} tone={c.urgent ? "critical" : "ok"} label="Urgents" value={c.urgent} hint={c.urgent ? "Priorité haute ou critique" : "Aucune urgence"} onClick={() => cc.go("Inbox", "urgent")} />
      {cc.can("billing.read") && <Kpi icon={<Euro size={16} />} tone={c.overdue_amount ? "warn" : "neutral"} label="Finance à suivre" value={eur(c.outstanding)} hint={c.overdue_amount ? `dont ${eur(c.overdue_amount)} en retard` : "Aucun retard"} onClick={() => cc.go("Finance")} />}
      <Kpi icon={<Building2 size={16} />} tone={c.cabinets_to_contact ? "warn" : "neutral"} label="Cabinets à relancer" value={c.cabinets_to_contact} hint={c.onboarding_stalled ? `${c.onboarding_stalled} onboarding bloqué(s)` : "Inactifs, onboarding, rappels"} onClick={() => cc.go("Cabinets", "relancer")} />
    </div>
    <div className="cc-home-grid">
      <Card className="cc-now" title="À traiter maintenant" action={<button className="cc-link" onClick={() => cc.go("Inbox")}>Tout voir ({c.todo}) <ArrowRight size={13} /></button>}>
        {data.now.length ? <div className="cc-event-list">{data.now.map((e: OpEvent) => <EventRow key={e.id} e={e} refresh={reload} />)}</div>
          : <Empty title="Rien à traiter 🎉" text="Tout est sous contrôle pour le moment. Les nouvelles alertes apparaîtront ici automatiquement." />}
      </Card>
      <div className="cc-stack">
        <Card className="cc-brief" title={<><Sparkles size={15} /> Brief du jour</>}>
          <ul>{data.brief.map((line: string) => <li key={line}>{line}</li>)}</ul>
          {!!data.priorities.length && <><h3>Priorités</h3><ol>{data.priorities.map((e: OpEvent) => <li key={e.id}><button className="cc-link" onClick={() => primary(e)}>{e.clinic_name || e.cabinet_owner_name ? `${e.clinic_name || e.cabinet_owner_name} — ` : ""}{e.title}</button></li>)}</ol></>}
          <small className="cc-muted">Généré à partir des données de la plateforme, sans IA.</small>
        </Card>
        <Card title="Équipe" action={<button className="cc-link" onClick={() => cc.go("Inbox", "team")}>Vue équipe</button>}>
          <ul className="cc-team">{data.team.map((t: any) => <li key={t.id}><Avatar name={t.name} /><span>{t.name}</span><small>{t.open_count} en cours{t.overdue ? ` · ${t.overdue} en retard` : ""}{t.resolved_today ? ` · ${t.resolved_today} résolu(s) aujourd’hui` : ""}</small></li>)}</ul>
        </Card>
        <Card title="Activité récente" action={cc.can("audit.read") ? <button className="cc-link" onClick={() => cc.go("Sécurité & Audit")}>Journal</button> : undefined}>
          {data.recent.length ? <ul className="cc-recent">{data.recent.map((r: any, i: number) => <li key={i}><time title={ago(r.at)}>{time(r.at)}</time><span>{r.label || AUDIT_LABEL[r.code] || r.code}<small>{r.actor}</small></span></li>)}</ul> : <Empty title="Aucune activité récente." icon="·" />}
        </Card>
      </div>
    </div>
    <AskAmelib />
  </div>;
}
