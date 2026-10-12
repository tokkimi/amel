import { AlertTriangle, ArrowRight, CheckCircle2, FileWarning, Landmark, ReceiptText } from "lucide-react";
import { useCC } from "./context";
import { Card, Empty, eur, Kpi, Loadable, useApi } from "./ui";

const shortStage = (stage: string) => ({
  "PEC À FAIRE": "À faire", "ESTIMATION À FAIRE": "Estimations", "PEC/ESTIM EN COURS": "En cours", "ACCORD PEC": "Accords",
  "DOSSIER EN ERREUR": "Erreurs", "PEC À FACTURER": "À facturer", "PEC FACTURÉE": "Facturées", "PEC PAYÉE": "Payées", "RAPPROCHEMENT FAIT": "Rapprochées",
}[stage] || stage);

export default function PecCommandCenter({ chooseCabinet }: { chooseCabinet: (id: string) => void }) {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-pec-overview", { v: cc.version });
  return <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
    {data && <div className="cc-stack">
      <Card title="Vue globale des dossiers PEC" action={<span className="cc-muted">Agrégée : aucune donnée patient n’est affichée ici</span>}>
        <div className="cc-kpis inline">
          <Kpi label="Plans suivis" value={data.summary.plans} />
          <Kpi label="Erreurs à corriger" value={data.summary.errors} tone={data.summary.errors ? "critical" : "ok"} icon={<AlertTriangle size={15} />} />
          <Kpi label="Accords à contrôler" value={data.summary.to_validate} tone={data.summary.to_validate ? "warn" : "neutral"} />
          <Kpi label="À facturer" value={data.summary.to_invoice} tone={data.summary.to_invoice ? "warn" : "neutral"} icon={<ReceiptText size={15} />} />
          <Kpi label="Sans activité depuis 7 j" value={data.summary.stale} tone={data.summary.stale ? "warn" : "ok"} />
          <Kpi label="Pièces à compléter" value={data.summary.missing_documents} tone={data.summary.missing_documents ? "critical" : "ok"} icon={<FileWarning size={15} />} />
        </div>
      </Card>
      <div className="cc-grid-2">
        <Card title="Pipeline PEC" action={<span className="cc-muted">Cliquer sur un cabinet ci-dessous pour travailler sur ses dossiers</span>}>
          <div className="cc-pec-pipeline" aria-label="Répartition des dossiers PEC">
            {data.stages.map((row: any) => <div key={row.stage} className={row.stage === "DOSSIER EN ERREUR" && row.count ? "is-critical" : row.stage === "PEC À FACTURER" && row.count ? "is-warn" : ""}><span>{shortStage(row.stage)}</span><b>{row.count}</b></div>)}
          </div>
        </Card>
        <Card title="Bilan opérationnel · année en cours" action={<Landmark size={16} aria-hidden="true" />}>
          <div className="cc-mini-kpis boxed">
            <span>Devis initiaux<b>{eur(data.financial.initial)}</b></span>
            <span>Devis définitifs<b>{eur(data.financial.final)}</b></span>
            <span>Mutuelle supplémentaire<b>{eur(data.financial.mutual_optimization)}</b></span>
            <span>Montants récupérés<b>{eur(data.financial.recovered)}</b></span>
          </div>
          <p className="cc-muted cc-pec-note">Indicateurs de suivi des dossiers pour les cabinets. Ils ne sont pas ajoutés au chiffre d’affaires de SmilePec.</p>
        </Card>
      </div>
      <Card title="Priorités par cabinet" action={<span className="cc-muted">Trié par erreurs puis dossiers à facturer</span>}>
        {data.cabinets.length ? <ul className="cc-pec-cabinets">
          {data.cabinets.map((cabinet: any) => <li key={cabinet.id}>
            <button className="cc-list-row" onClick={() => chooseCabinet(cabinet.id)}>
              <span><strong>{cabinet.name}</strong><small>{cabinet.plans} plan(s) suivi(s)</small></span>
              <span className="cc-pec-cabinet-metrics">
                {cabinet.errors > 0 && <em className="critical">{cabinet.errors} erreur(s)</em>}
                {cabinet.to_validate > 0 && <em>{cabinet.to_validate} accord(s)</em>}
                {cabinet.to_invoice > 0 && <em>{cabinet.to_invoice} à facturer</em>}
                {cabinet.missing_documents > 0 && <em className="warn">{cabinet.missing_documents} pièce(s)</em>}
                {cabinet.stale > 0 && <em>{cabinet.stale} sans activité</em>}
                <ArrowRight size={16} aria-hidden="true" />
              </span>
            </button>
          </li>)}
        </ul> : <Empty title="Aucun dossier PEC dans le réseau" text="Les indicateurs se rempliront dès qu’un cabinet créera son premier plan de traitement." icon={<CheckCircle2 />} />}
      </Card>
    </div>}
  </Loadable>;
}
