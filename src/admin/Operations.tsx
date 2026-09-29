import { useState } from "react";
import { Download, Plus } from "lucide-react";
import { downloadWorkbook } from "../exports";
import { useCC } from "./context";
import DataTable, { Column } from "./DataTable";
import { api } from "../client";
import { ago, Badge, Bars, Card, day, Drawer, Empty, Kpi, Loadable, SeverityBadge, Tabs, time, Timeline, useApi, useUrlParam } from "./ui";

const APPT_STATUS: Record<string, string> = { confirmed: "Confirmé", cancelled: "Annulé", completed: "Terminé" };
const localInput = (iso: string) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
// Consult and manage one appointment. Every change needs a reason, is audited and notifies the cabinet and the patient.
function AppointmentDrawer({ id, close }: { id: string; close: () => void }) {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-appointment", { id, v: cc.version });
  const a = data?.appointment;
  const [when, setWhen] = useState(""), [duration, setDuration] = useState(45);
  const manage = cc.can("appointment.manage");
  const change = (title: string, patch: Record<string, unknown>, danger = false, summary?: string) => cc.confirm({
    title, danger, reason: true, summary: <p>{summary || `Rendez-vous de ${a.patient_name} avec ${a.professional_name}.`} Le cabinet et le patient seront notifiés ; la modification est journalisée.</p>,
    run: async (reason) => { await api("cc-appointment-update", { id, ...patch, reason }); cc.toast("Rendez-vous mis à jour."); cc.bump(); reload(); },
  });
  const future = a && new Date(a.starts_at) > new Date();
  return <Drawer open onClose={close} title={a ? `${a.patient_name} · ${day(a.starts_at)} ${time(a.starts_at)}` : "Rendez-vous"} subtitle={a && <span className="cc-inline"><Badge tone={a.status === "cancelled" ? "critical" : a.status === "completed" ? "ok" : "info"}>{APPT_STATUS[a.status]}</Badge>avec {a.professional_name}</span>}>
    <Loadable loading={loading && !data} error={error} retry={reload}>
      {a && <div className="cc-stack">
        <div className="cc-kv">
          <span>Patient</span><span>{a.patient_name}</span>
          <span>Praticien</span><span>{a.professional_name}</span>
          <span>Cabinet</span><button className="cc-link" onClick={() => cc.open("cabinet", a.professional_id)}>{a.cabinet_name}</button>
          <span>Date</span><span>{day(a.starts_at)} à {time(a.starts_at)} · {a.duration} min</span>
          <span>Adresse</span><span>{a.address || "—"}</span>
          <span>Créé</span><span>{ago(a.created_at)}</span>
          <span>Messages</span><span>{a.message_count} (contenu privé, non affiché)</span>
        </div>
        <p className="cc-muted">Le motif de soin n’est pas affiché dans l’administration.</p>
        {manage ? <>
          <div className="cc-row-actions">
            {a.status !== "cancelled" && future && <button className="cc-btn is-danger" onClick={() => change("Annuler le rendez-vous", { status: "cancelled" }, true)}>Annuler…</button>}
            {a.status === "confirmed" && !future && <button className="cc-btn" onClick={() => change("Marquer comme terminé", { status: "completed" })}>Marquer terminé…</button>}
            {a.status !== "confirmed" && <button className="cc-btn" onClick={() => change("Rétablir le rendez-vous", { status: "confirmed" })}>Rétablir (confirmé)…</button>}
          </div>
          {a.status !== "cancelled" && <Card title="Déplacer le rendez-vous">
            <form className="cc-form-grid" onSubmit={(e) => { e.preventDefault(); if (!when) return; change("Déplacer le rendez-vous", { starts_at: new Date(when).toISOString(), duration }, false, `Nouveau créneau : ${new Date(when).toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" })}, ${duration} min.`); }}>
              <label>Nouvelle date et heure<input type="datetime-local" required min={localInput(new Date().toISOString())} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
              <label>Durée (min)<input type="number" min={15} max={180} step={5} value={duration} onChange={(e) => setDuration(Number(e.target.value))} /></label>
              <button className="cc-btn is-primary" disabled={!when}>Déplacer…</button>
            </form>
          </Card>}
        </> : <p className="cc-muted">Votre rôle permet de consulter ce rendez-vous, pas de le modifier.</p>}
        <h3>Historique</h3>
        <Timeline items={data.history} empty="Aucune modification administrative." />
      </div>}
    </Loadable>
  </Drawer>;
}

const SUBS = ["Tâches SmilePec", "Poses à venir", "Tâches cabinets", "Rendez-vous", "Volume"];
export default function Operations() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-operations", { v: cc.version });
  const [sub, setSub] = useUrlParam("sub");
  const tab = SUBS.includes(sub) ? sub : "Tâches SmilePec";
  const [owner, setOwner] = useState(""), [appointment, setAppointment] = useState(""), [apptStatus, setApptStatus] = useState("");
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
    { key: "patient", label: "Patient", sort: (a) => a.patient_name, render: (a) => a.patient_name },
    { key: "status", label: "Statut", sort: (a) => a.status, render: (a) => <Badge tone={a.status === "cancelled" ? "critical" : a.status === "completed" ? "ok" : "info"}>{APPT_STATUS[a.status] || a.status}</Badge> },
    { key: "duration", label: "Durée", mobile: "hide", render: (a) => a.duration + " min" },
  ];
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>{tab === "Rendez-vous" ? "Rendez-vous" : "Priorités opérationnelles"}</h1><p>{tab === "Rendez-vous" ? "Consulter, déplacer, annuler ou clôturer les rendez-vous des cabinets." : "Tâches de l’équipe SmilePec, priorités des cabinets et volume hebdomadaire."}</p></div>
      <div className="cc-inline">{cc.can("inbox.manage") && <button className="cc-btn is-primary" onClick={() => cc.createTask()}><Plus size={15} />Nouvelle tâche</button>}
        {data && <button className="cc-btn" onClick={() => downloadWorkbook("smilepec-priorites", { "Poses prévues": data.poses.map((p: any) => ({ Patient: p.initials, Cabinet: p.cabinet_name, "Date de pose": p.prosthesis_date, "Devis accepté": p.ready ? "Oui" : "Non" })), "Tâches ouvertes": data.cabinet_tasks.map((t: any) => ({ Tâche: t.title, Cabinet: t.cabinet_name, Assignée: t.assignee, Priorité: t.priority, Échéance: t.due_at || "", Statut: t.stage })) })}><Download size={15} />Excel</button>}</div></header>
    <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
      {data && <>
        <div className="cc-kpis">
          <Kpi label="Tâches SmilePec ouvertes" value={data.tasks.length} onClick={() => setSub("", true)} />
          <Kpi label="En retard" value={lateTasks} tone={lateTasks ? "critical" : "ok"} onClick={() => cc.go("Inbox", "overdue")} />
          <Kpi label="Poses sous 7 jours" value={data.poses.filter((p: any) => new Date(p.prosthesis_date).getTime() - Date.now() < 7 * 86400000 && new Date(p.prosthesis_date).getTime() >= Date.now() - 86400000).length} hint={`${data.poses.filter((p: any) => !p.ready).length} sans devis accepté`} onClick={() => setSub("Poses à venir", true)} />
          <Kpi label="Tâches cabinets en retard" value={data.cabinet_tasks.filter((t: any) => t.due_at && new Date(t.due_at) < new Date()).length} onClick={() => setSub("Tâches cabinets", true)} />
        </div>
        {tab !== "Rendez-vous" && <Tabs label="Priorités" tabs={SUBS.filter((s) => s !== "Rendez-vous").map((s) => ({ key: s, label: s }))} value={tab} onChange={(s) => setSub(s === "Tâches SmilePec" ? "" : s, true)} />}
        {tab === "Tâches SmilePec" && <Card title="Tâches de l’équipe SmilePec" action={<select aria-label="Responsable" value={owner} onChange={(e) => setOwner(e.target.value)}><option value="">Tout le monde</option><option value={cc.me.account.id}>Mon travail</option><option value="none">Non assignées</option>{cc.me.team.filter((t) => t.id !== cc.me.account.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}>
          {tasks.length ? <ul className="cc-list">{tasks.map((t: any) => <li key={t.id}><button className="cc-list-row" onClick={() => cc.open("event", t.id)}><span><strong>{t.title}</strong><small>{t.cabinet_name ? t.cabinet_name + " · " : ""}{t.owner_name || "Non assignée"} · créée {ago(t.created_at)}</small></span><span className="cc-inline"><SeverityBadge severity={t.severity} />{t.due_at && <span className={new Date(t.due_at) < new Date() ? "late" : ""}>{day(t.due_at)}</span>}</span></button></li>)}</ul>
            : <Empty title="Aucune tâche ouverte 🎉" text="Créez une tâche depuis ce bouton, un cabinet ou la palette de commandes (Ctrl K)." />}
        </Card>}
        {tab === "Poses à venir" && <Card><p className="cc-muted">Vue de coordination : les données cliniques restent dans les dossiers cabinet.</p><DataTable label="Poses" rows={data.poses} columns={poseColumns} initialSort={{ key: "date", dir: 1 }} search={(p) => p.cabinet_name} /></Card>}
        {tab === "Tâches cabinets" && <Card><DataTable label="Tâches cabinets" rows={data.cabinet_tasks} columns={cabinetTaskColumns} onOpen={(t) => cc.open("cabinet", t.cabinet_id)} search={(t) => [t.title, t.cabinet_name, t.assignee].join(" ")} initialSort={{ key: "due", dir: 1 }} /></Card>}
        {tab === "Rendez-vous" && <Card><p className="cc-muted">Rendez-vous des 7 derniers jours et à venir. Cliquez pour consulter, déplacer, annuler ou clôturer. Les motifs de soin et les messages privés ne sont pas affichés.</p><DataTable label="Rendez-vous" rows={data.appointments.filter((a: any) => !apptStatus || a.status === apptStatus)} columns={apptColumns} onOpen={(a) => setAppointment(a.id)} initialSort={{ key: "when", dir: 1 }} search={(a) => [a.cabinet_name, a.patient_name, a.professional_name].join(" ")}
          toolbar={<select aria-label="Statut" value={apptStatus} onChange={(e) => setApptStatus(e.target.value)}><option value="">Tous les statuts</option>{Object.entries(APPT_STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>} /></Card>}
        {tab === "Volume" && <Card title="Éléments opérationnels par semaine"><Bars data={data.weekly.map((w: any) => ({ label: w.week.slice(5), value: w.created, secondary: w.resolved }))} /><p className="cc-muted">Barres pleines : créés · barres claires : résolus. Temps moyen de traitement (manuel) : {data.weekly.length ? Math.round(data.weekly.reduce((s: number, w: any) => s + w.avg_hours, 0) / data.weekly.length) : 0} h.</p></Card>}
      </>}
    </Loadable>
    {appointment && <AppointmentDrawer id={appointment} close={() => setAppointment("")} />}
  </div>;
}
