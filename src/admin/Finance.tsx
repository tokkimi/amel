import { useState } from "react";
import { Download } from "lucide-react";
import { api } from "../client";
import { downloadWorkbook } from "../exports";
import { useCC } from "./context";
import DataTable, { Column } from "./DataTable";
import { Bars, Card, day, Empty, eur, Kpi, Loadable, SeverityBadge, Tabs, useApi } from "./ui";

type Row = { id: string; name: string; city: string; invoiced: number; paid: number; outstanding: number; overdue: number; overdue_count: number; max_days_late: number };
export default function Finance() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-finance", { v: cc.version });
  const [tab, setTab] = useState("cabinets"), [onlyLate, setOnlyLate] = useState(false);
  const columns: Column<Row>[] = [
    { key: "name", label: "Cabinet", mobile: "title", sort: (r) => r.name.toLowerCase(), render: (r) => <span className="cc-cell-main"><strong>{r.name}</strong><small>{r.city}</small></span> },
    { key: "invoiced", label: "Facturé", className: "num", sort: (r) => r.invoiced, render: (r) => eur(r.invoiced) },
    { key: "paid", label: "Payé", className: "num", sort: (r) => r.paid, render: (r) => eur(r.paid) },
    { key: "outstanding", label: "Restant", className: "num", sort: (r) => r.outstanding, render: (r) => eur(r.outstanding) },
    { key: "late", label: "Retard", className: "num", sort: (r) => r.overdue, render: (r) => (r.overdue ? <span className="late">{eur(r.overdue)} <small>({r.overdue_count} · {r.max_days_late} j)</small></span> : "—") },
  ];
  const t = data?.totals;
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Bilan comptable</h1><p>Suivi des encaissements des cabinets et, séparément, des revenus propres d’SmilePec.</p></div>
      {data && <button className="cc-btn" onClick={() => cc.confirm({ title: "Exporter le bilan", reason: "optional", summary: <p>Export Excel de {data.cabinets.length} cabinet(s) et {data.overdue.length} facture(s) en retard, sans données de soins. L’export est journalisé.</p>, run: async (reason) => {
        await api("cc-export-log", { kind: "finance", count: data.cabinets.length + data.overdue.length, reason });
        downloadWorkbook("smilepec-bilan-comptable", { Cabinets: data.cabinets.map((c: Row) => ({ Cabinet: c.name, Facturé: c.invoiced, Payé: c.paid, Restant: c.outstanding, "En retard": c.overdue })), Retards: data.overdue.map((d: any) => ({ Numéro: d.number, Cabinet: d.cabinet_name, Montant: d.total, Échéance: d.due_date, "Jours de retard": d.days_late })) });
      } })}><Download size={15} />Excel</button>}</header>
    <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
      {data && <>
        <Tabs label="Périmètre financier" value={tab} onChange={setTab} tabs={[{ key: "cabinets", label: "Encaissements cabinets" }, { key: "amelib", label: "Revenus SmilePec" }]} />
        {tab === "cabinets" && <>
          <p className="cc-muted">Montants des devis et factures émis par les cabinets à leurs patients — argent géré par les cabinets, jamais comptabilisé comme revenu SmilePec.</p>
          <div className="cc-kpis">
            <Kpi label="Facturé" value={eur(t.invoiced)} />
            <Kpi label="Payé" value={eur(t.paid)} tone="ok" />
            <Kpi label="À encaisser" value={eur(t.outstanding)} hint={t.insurance_expected ? `dont ${eur(t.insurance_expected)} de prise en charge prévue` : undefined} />
            <Kpi label="En retard" value={eur(t.overdue)} tone={t.overdue ? "critical" : "ok"} hint={`${t.overdue_count} facture(s)`} onClick={() => setOnlyLate(true)} />
          </div>
          {!!data.alerts.length && <Card title="Alertes">{<ul className="cc-watch">{data.alerts.map((a: any, i: number) => <li key={i}><SeverityBadge severity={a.severity} />{a.cabinet_id ? <button className="cc-link" onClick={() => cc.open("cabinet", a.cabinet_id)}>{a.text}</button> : <span>{a.text}</span>}</li>)}</ul>}</Card>}
          <div className="cc-grid-2">
            <Card title="Ancienneté des retards (aging)"><div className="cc-aging">{Object.entries(data.aging).map(([k, v]: any) => <div key={k} className={"bucket b" + k.replace(/\W/g, "")}><small>{k} jours</small><strong>{eur(v.amount)}</strong><span>{v.count} facture(s)</span></div>)}</div></Card>
            <Card title="Évolution sur 12 mois"><Bars data={data.monthly.map((m: any) => ({ label: m.month.slice(5), value: m.invoiced, secondary: m.paid }))} format={(n) => eur(n)} /><p className="cc-muted">Barres pleines : facturé · claires : payé.</p></Card>
          </div>
          <Card title="Par cabinet" action={<label className="cc-check-label"><input type="checkbox" checked={onlyLate} onChange={(e) => setOnlyLate(e.target.checked)} />Uniquement en retard</label>}>
            <DataTable label="Finance par cabinet" rows={data.cabinets.filter((c: Row) => !onlyLate || c.overdue > 0)} columns={columns} onOpen={(r) => cc.open("cabinet", r.id)} search={(r) => r.name + " " + r.city} initialSort={{ key: "late", dir: -1 }}
              empty={onlyLate ? <Empty title="Aucun cabinet en retard de paiement 🎉" action={<button className="cc-btn" onClick={() => setOnlyLate(false)}>Voir tous les cabinets</button>} /> : <Empty title="Aucune facture émise pour le moment." icon="·" />} />
          </Card>
          <Card title={`Factures en retard (${data.overdue.length})`}>{data.overdue.length ? <ul className="cc-list">{data.overdue.slice(0, 50).map((d: any) => <li key={d.id}><button className="cc-list-row" onClick={() => cc.open("cabinet", d.owner_id)}><span><strong>{d.number} · {d.cabinet_name}</strong><small>Échéance {day(d.due_date)}</small></span><span className="late">{eur(d.total, 2)} · {d.days_late} j</span></button></li>)}</ul> : <Empty title="Aucune facture en retard 🎉" />}</Card>
        </>}
        {tab === "amelib" && <>
          <p className="cc-muted">Architecture dédiée (plans, abonnements, factures plateforme, paiements, crédits), séparée des factures des cabinets. Les montants affichés proviennent uniquement de ces tables.</p>
          <div className="cc-kpis">
            <Kpi label="Plans actifs" value={data.platform.plans} />
            <Kpi label="Abonnements" value={data.platform.subscriptions} />
            <Kpi label="Facturé plateforme" value={eur(data.platform.invoiced)} />
            <Kpi label="Encaissé" value={eur(data.platform.collected)} tone="ok" />
            <Kpi label="Impayés plateforme" value={eur(data.platform.overdue)} tone={data.platform.overdue ? "critical" : "neutral"} />
          </div>
          {!data.platform.invoiced && !data.platform.subscriptions && <Empty icon="·" title="Aucune facturation plateforme enregistrée." text="La facturation des abonnements SmilePec n’est pas encore activée. Les indicateurs se rempliront dès les premières factures plateforme." />}
        </>}
      </>}
    </Loadable>
  </div>;
}
