import { useCC } from "./context";
import { Bars, Card, day, Empty, eur, Kpi, LIFECYCLE, Loadable, num, TICKET_CATEGORY, useApi } from "./ui";

const hours = (h: number) => (h ? (h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} j`) : "—");
export default function Analytics() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-analytics", { v: cc.version });
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Analytics</h1><p>Adoption, cabinets, opérations, support et finance — pour décider, pas pour décorer.</p></div></header>
    <Loadable loading={loading && !data} error={error} retry={reload} rows={10}>
      {data && <>
        <Card title="Adoption" action={data.adoption.tracked_since ? <small className="cc-muted">Suivi quotidien depuis le {day(data.adoption.tracked_since)}</small> : <small className="cc-muted">Suivi quotidien démarré avec cette version</small>}>
          <div className="cc-kpis inline">
            <Kpi label="Actifs aujourd’hui (DAU)" value={data.adoption.dau} />
            <Kpi label="Actifs 7 j (WAU)" value={data.adoption.wau} />
            <Kpi label="Actifs 30 j (MAU)" value={data.adoption.mau} hint={data.adoption.pro_accounts ? `${Math.round((data.adoption.mau / data.adoption.pro_accounts) * 100)} % des comptes pro` : undefined} />
            <Kpi label="Connexions 30 j" value={data.adoption.sessions_30d} />
          </div>
          <h3>Fonctionnalités utilisées (30 jours)</h3>
          <Bars data={data.features.map((f: any) => ({ label: f.feature, value: f.count }))} />
        </Card>
        <div className="cc-grid-2">
          <Card title="Cabinets">
            <div className="cc-kpis inline">
              <Kpi label="Total" value={data.cabinets.total} onClick={() => cc.go("Cabinets")} />
              <Kpi label="Inscrits" value={data.cabinets.signed_up} hint="Créés depuis le site" />
              <Kpi label="Ajoutés par Amel" value={data.cabinets.manually_added} hint="Suivi CRM avant inscription" />
              <Kpi label="Nouveaux 30 j" value={data.cabinets.new_30d} onClick={() => cc.go("Cabinets", "new")} />
              <Kpi label="Activés" value={data.cabinets.activated} hint="≥ 5 étapes d’onboarding" />
              <Kpi label="Inactifs 14 j" value={data.cabinets.inactive} tone={data.cabinets.inactive ? "warn" : "ok"} onClick={() => cc.go("Cabinets", "relancer")} />
              <Kpi label="À risque" value={data.cabinets.at_risk} tone={data.cabinets.at_risk ? "critical" : "ok"} onClick={() => cc.go("Cabinets", "risk")} />
              <Kpi label="Onboarding incomplet" value={data.cabinets.onboarding_incomplete} onClick={() => cc.go("Réseau", "Onboarding")} />
            </div>
            <h3>Inscriptions par mois</h3>
            <Bars data={data.signups.map((s: any) => ({ label: s.month.slice(5), value: s.count }))} height={90} />
            <h3>Cycle de vie</h3>
            <ul className="cc-dist">{data.cabinets.lifecycle.map((l: any) => <li key={l.lifecycle}><span>{LIFECYCLE[l.lifecycle]}</span><b>{l.count}</b></li>)}</ul>
          </Card>
          <Card title="Opérations">
            <div className="cc-kpis inline">
              <Kpi label="Backlog" value={data.operations.backlog} onClick={() => cc.go("Inbox")} />
              <Kpi label="En retard" value={data.operations.overdue} tone={data.operations.overdue ? "critical" : "ok"} onClick={() => cc.go("Inbox", "overdue")} />
              <Kpi label="Temps moyen de traitement" value={hours(data.operations.avg_resolution_hours)} hint="éléments résolus manuellement" />
              <Kpi label="Créés sur 7 j" value={data.operations.created_7d} />
            </div>
          </Card>
        </div>
        <div className="cc-grid-2">
          <Card title="Support">
            <div className="cc-kpis inline">
              <Kpi label="Tickets 30 j" value={data.support.last_30d} />
              <Kpi label="1re réponse moyenne" value={hours(data.support.first_response_hours)} />
              <Kpi label="Résolution moyenne" value={hours(data.support.resolution_hours)} />
              <Kpi label="Réouverts" value={data.support.reopened} />
            </div>
            <h3>Volume hebdomadaire</h3>
            <Bars data={data.weekly_tickets.map((w: any) => ({ label: w.week.slice(5), value: w.tickets }))} height={80} />
            <h3>Catégories fréquentes</h3>
            {data.support.categories.length ? <ul className="cc-dist">{data.support.categories.map((c: any) => <li key={c.category}><span>{TICKET_CATEGORY[c.category] || c.category}</span><b>{c.count}</b></li>)}</ul> : <Empty title="Aucun ticket." icon="·" />}
            <h3>Tickets par cabinet</h3>
            {data.support.per_cabinet.length ? <ul className="cc-dist">{data.support.per_cabinet.map((c: any) => <li key={c.id}><button className="cc-link" onClick={() => cc.open("cabinet", c.id)}>{c.name}</button><b>{c.open} ouvert(s) · {c.last_14d} sur 14 j</b></li>)}</ul> : <Empty title="Aucun ticket ouvert." icon="·" />}
          </Card>
          {cc.can("billing.read") && <Card title="Revenus SmilePec">
            <div className="cc-kpis inline"><Kpi label="Facturé" value={eur(data.finance.invoiced)} /><Kpi label="Encaissé" value={eur(data.finance.paid)} tone="ok" /><Kpi label="Impayé en retard" value={eur(data.finance.overdue)} tone={data.finance.overdue ? "critical" : "ok"} onClick={() => cc.go("Finance")} /></div>
            <h3>Évolution (facturé / payé)</h3>
            <Bars data={data.finance.monthly.map((m: any) => ({ label: m.month.slice(5), value: m.invoiced, secondary: m.paid }))} format={(n) => eur(n)} />
            <p className="cc-muted">Taux d’encaissement : {data.finance.invoiced ? num(Math.round((data.finance.paid / data.finance.invoiced) * 100)) : 0} %.</p>
          </Card>}
        </div>
      </>}
    </Loadable>
  </div>;
}
