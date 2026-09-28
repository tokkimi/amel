import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { downloadWorkbook } from "../exports";
import { useCC } from "./context";
import DataTable, { Column } from "./DataTable";
import { ago, Badge, Bars, Card, day, Empty, Kpi, Loadable, SeverityBadge, Tabs, time, useApi, useUrlParam } from "./ui";

const SUBS = ["Tâches Amelib", "Poses à venir", "Tâches cabinets", "Rendez-vous", "Volume"];
export default function Operations() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-operations", { v: cc.version });
  const [sub, setSub] = useUrlParam("sub");
  const tab = SUBS.includes(sub) ? sub : "Tâches Amelib";
  const [owner, setOwner] = useState("");
  const tasks = (data?.tasks || []).filter((t: any) => !owner || (owner === "none" ? !t.owner_id : t.owner_id === owner));
  const lateTasks = (data?.tasks || []).filter((t: any) => t.due_at && new Date(t.due_at) < new Date()).length;
  const poseColumns: Column<any>[] = [
    { key: "date", label: "Pose", mobile: "title", sort: (p) => p.prosthesis_date, render: (p) => <strong>{day(p.prosthesis_date)}</strong> },
    { key: "cabinet", label: "Cabinet", sort: (p) => p.cabinet_name, render: (p) => <button className="cc-link" onClick={(e) => { e.stopPropagation(); cc.open("cabinet", p.owner_id); }}>{p.cabinet_name}</button> },
    { key: "patient", label: "Patient", render: (p) => p.initials },
    { key: "ready", label: "Dossier", sort: (p) => (p.ready ? 1 : 0), render: (p) => (p.ready ? <Badge tone="ok" icon>Devis accepté</Badge> : <Badge tone="warn" icon>Devis manquant</Badge>) },
  ];
  const cabinetTaskColumns: Column<any>[] = [
    { key: "title", label: "Tâche", mobile: "title", sort: (t) => t.title, render: (t) => <span className="cc-cell-main"><strong>{t.title}</strong><small>{t.assignee || "Non attribuée"}</small></span> },
    { key: "cabinet", label: "Cabinet", sort: (t) => t.cabinet_name, render: (t) => t.cabinet_name },
    { key: "priority", label: "Priorité", sort: (t) => ["Basse", "Normale", "Haute", "Urgente"].indexOf(t.priority), render: (t) => <Badge tone={t.priority === "Urgente" ? "critical" : t.priority === "Haute" ? "warn" : "neutral"}>{t.priority}</Badge> },
    { key: "stage", label: "Étape", render: (t) => t.stage },
    { key: "due", label: "Échéance", sort: (t) => (t.due_at ? new Date(t.due_at).getTime() : Infinity), render: (t) => <span className={t.due_at && new Date(t.due_at) < new Date() ? "late" : ""}>{day(t.due_at)}</span> },
  ];
  const apptColumns: Column<any>[] = [
    { key: "when", label: "Date", mobile: "title", sort: (a) => new Date(a.starts_at).getTime(), render: (a) => <strong>{day(a.starts_at)} {time(a.starts_at)}</strong> },
    { key: "cabinet", label: "Cabinet", sort: (a) => a.cabinet_name, render: (a) => a.cabinet_name },
    { key: "patient", label: "Patient", render: (a) => a.patient_initials },
    { key: "status", label: "Statut", render: (a) => ({ confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé" } as Record<string, string>)[a.status] || a.status },
    { key: "duration", label: "Durée", mobile: "hide", render: (a) => a.duration + " min" },
  ];
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Opérations</h1><p>Tâches de l’équipe, poses à préparer, activité des cabinets et volume hebdomadaire.</p></div>
      <div className="cc-inline">{cc.can("inbox.manage") && <button className="cc-btn is-primary" onClick={() => cc.createTask()}><Plus size={15} />Nouvelle tâche</button>}
        {data && <button className="cc-btn" onClick={() => downloadWorkbook("smilepec-priorites", { "Poses prévues": data.poses.map((p: any) => ({ Patient: p.initials, Cabinet: p.cabinet_name, "Date de pose": p.prosthesis_date, "Devis accepté": p.ready ? "Oui" : "Non" })), "Tâches ouvertes": data.cabinet_tasks.map((t: any) => ({ Tâche: t.title, Cabinet: t.cabinet_name, Assignée: t.assignee, Priorité: t.priority, Échéance: t.due_at || "", Statut: t.stage })) })}><Download size={15} />Excel</button>}</div></header>
    <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
      {data && <>
        <div className="cc-kpis">
          <Kpi label="Tâches Amelib ouvertes" value={data.tasks.length} onClick={() => setSub("", true)} />
          <Kpi label="En retard" value={lateTasks} tone={lateTasks ? "critical" : "ok"} onClick={() => cc.go("Inbox", "overdue")} />
          <Kpi label="Poses sous 7 jours" value={data.poses.filter((p: any) => new Date(p.prosthesis_date).getTime() - Date.now() < 7 * 86400000 && new Date(p.prosthesis_date).getTime() >= Date.now() - 86400000).length} hint={`${data.poses.filter((p: any) => !p.ready).length} sans devis accepté`} onClick={() => setSub("Poses à venir", true)} />
          <Kpi label="Tâches cabinets en retard" value={data.cabinet_tasks.filter((t: any) => t.due_at && new Date(t.due_at) < new Date()).length} onClick={() => setSub("Tâches cabinets", true)} />
        </div>
        <Tabs label="Opérations" tabs={SUBS.map((s) => ({ key: s, label: s }))} value={tab} onChange={(s) => setSub(s === "Tâches Amelib" ? "" : s, true)} />
        {tab === "Tâches Amelib" && <Card title="Tâches de l’équipe Amelib" action={<select aria-label="Responsable" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Tout le monde</option><option value={cc.me.account.id}>Mon travail</option><option value="none">Non assignées</option>{cc.me.team.filter((t) => t.id !== cc.me.account.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}>
          {tasks.length ? <ul className="cc-list">{tasks.map((t: any) => <li key={t.id}><button className="cc-list-row" onClick={() => cc.open("event", t.id)}><span><strong>{t.title}</strong><small>{t.cabinet_name ? t.cabinet_name + " · " : ""}{t.owner_name || "Non assignée"} · créée {ago(t.created_at)}</small></span><span className="cc-inline"><SeverityBadge severity={t.severity} />{t.due_at && <span className={new Date(t.due_at) < new Date() ? "late" : ""}>{day(t.due_at)}</span>}</span></button></li>)}</ul>
            : <Empty title="Aucune tâche ouverte 🎉" text="Créez une tâche depuis ce bouton, un cabinet ou la palette de commandes (Ctrl K)." />}
        </Card>}
        {tab === "Poses à venir" && <Card><p className="cc-muted">Vue de coordination : les données cliniques restent dans les dossiers cabinet.</p><DataTable label="Poses" rows={data.poses} columns={poseColumns} initialSort={{ key: "date", dir: 1 }} search={(p) => p.cabinet_name} /></Card>}
        {tab === "Tâches cabinets" && <Card><DataTable label="Tâches cabinets" rows={data.cabinet_tasks} columns={cabinetTaskColumns} onOpen={(t) => cc.open("cabinet", t.cabinet_id)} search={(t) => [t.title, t.cabinet_name, t.assignee].join(" ")} initialSort={{ key: "due", dir: 1 }} /></Card>}
        {tab === "Rendez-vous" && <Card><p className="cc-muted">Vue de coordination (7 derniers jours et à venir). Les motifs de soin et les messages privés ne sont pas affichés.</p><DataTable label="Rendez-vous" rows={data.appointments} columns={apptColumns} initialSort={{ key: "when", dir: 1 }} search={(a) => a.cabinet_name} /></Card>}
        {tab === "Volume" && <Card title="Éléments opérationnels par semaine"><Bars data={data.weekly.map((w: any) => ({ label: w.week.slice(5), value: w.created, secondary: w.resolved }))} /><p className="cc-muted">Barres pleines : créés · barres claires : résolus. Temps moyen de traitement (manuel) : {data.weekly.length ? Math.round(data.weekly.reduce((s: number, w: any) => s + w.avg_hours, 0) / data.weekly.length) : 0} h.</p></Card>}
      </>}
    </Loadable>
  </div>;
}
