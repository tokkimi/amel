import { useEffect, useState } from "react";
import { Download, FileText, MoreHorizontal, Plus } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import DataTable, { Column } from "./DataTable";
import SavedViews from "./SavedViews";
import { ago, Badge, Card, Chips, csvDownload, Drawer, eur, HealthBadge, Kpi, LIFECYCLE, Loadable, Meter, useApi, useUrlParam } from "./ui";

export type CabinetRow = {
  id: string; name: string; email: string; clinic_name: string; city: string; phone: string; created_at: string; suspended: boolean; verified: boolean; published: boolean;
  lifecycle: string; lifecycle_derived: boolean; source: "signup" | "manual" | "import"; crm_owner_id: string | null; tags: string[]; next_contact_at: string | null; team_count: number; patient_count: number;
  open_tickets: number; open_events: number; invoiced: number; outstanding: number; overdue_amount: number; overdue_count: number; last_activity_at: string | null;
  health: { score: number; status: string; label: string }; onboarding: { percent: number; completed: number; total: number };
};
const FILTERS = [
  { key: "all", label: "Tous" }, { key: "manual", label: "Ajoutés par Amel" }, { key: "relancer", label: "À relancer" }, { key: "risk", label: "À risque" }, { key: "onboarding", label: "Onboarding incomplet" },
  { key: "new", label: "Nouveaux (30 j)" }, { key: "overdue", label: "Retards de paiement" }, { key: "support", label: "Support ouvert" }, { key: "suspended", label: "Suspendus" },
];
const matches = (c: CabinetRow, f: string) => {
  const idle = !c.last_activity_at || Date.now() - new Date(c.last_activity_at).getTime() > 14 * 86400000;
  switch (f) {
    case "relancer": return !c.suspended && c.lifecycle !== "churned" && (idle || (c.next_contact_at && new Date(c.next_contact_at) <= new Date()) || (c.onboarding.percent < 100 && Date.now() - new Date(c.created_at).getTime() > 7 * 86400000));
    case "manual": return c.source === "manual";
    case "risk": return c.health.status === "risk" || c.lifecycle === "at_risk";
    case "onboarding": return c.onboarding.percent < 100;
    case "new": return Date.now() - new Date(c.created_at).getTime() < 30 * 86400000;
    case "overdue": return c.overdue_count > 0;
    case "support": return c.open_tickets > 0;
    case "suspended": return c.suspended;
    default: return true;
  }
};

export function CabinetActions({ c, compact = true }: { c: { id: string; name: string; email?: string; suspended?: boolean }; compact?: boolean }) {
  const cc = useCC();
  const [open, setOpen] = useState(false);
  useEffect(() => { if (!open) return; const close = () => setOpen(false); setTimeout(() => addEventListener("click", close), 0); return () => removeEventListener("click", close); }, [open]);
  return <div className="cc-menu-wrap" onClick={(e) => e.stopPropagation()}>
    <button className={"cc-icon" + (compact ? "" : " bordered")} aria-label={"Actions pour " + c.name} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(!open)}><MoreHorizontal size={17} /></button>
    {open && <div className="cc-menu right" role="menu">
      <button role="menuitem" onClick={() => cc.open("cabinet", c.id)}>Voir la fiche 360°</button>
      {cc.can("cabinet.update") && <button role="menuitem" onClick={() => { cc.open("cabinet", c.id); setTimeout(() => dispatchEvent(new CustomEvent("cc:cabinet-tab", { detail: "Résumé:note" })), 50); }}>Ajouter une note</button>}
      {cc.can("inbox.manage") && <button role="menuitem" onClick={() => cc.createTask({ cabinet_id: c.id, cabinet_name: c.name })}>Créer une tâche</button>}
      {c.email && <a role="menuitem" href={"mailto:" + c.email}>Contacter</a>}
      <button role="menuitem" onClick={() => { cc.open("cabinet", c.id); setTimeout(() => dispatchEvent(new CustomEvent("cc:cabinet-tab", { detail: "Activité" })), 50); }}>Voir l’activité</button>
      {cc.can("impersonation.readonly") && <button role="menuitem" onClick={() => cc.startAssist({ id: c.id, name: c.name })}>Voir comme cabinet</button>}
      {cc.can("account.suspend") && <button role="menuitem" className="danger" onClick={() => cc.confirm({
        title: c.suspended ? "Réactiver le cabinet" : "Suspendre le cabinet", danger: !c.suspended, reason: true,
        summary: <p>{c.suspended ? "Le compte titulaire pourra de nouveau se connecter." : <>Le compte titulaire de <b>{c.name}</b> sera déconnecté et ne pourra plus se connecter. Les données sont conservées.</>}</p>,
        confirmLabel: c.suspended ? "Réactiver" : "Suspendre",
        run: async (reason) => { await api("admin-suspend", { id: c.id, suspended: !c.suspended, note: reason }); cc.toast("Décision enregistrée dans le journal."); cc.bump(); },
      })}>{c.suspended ? "Réactiver…" : "Suspendre…"}</button>}
    </div>}
  </div>;
}

function ManualCabinet({ open, close }: { open: boolean; close: () => void }) {
  const cc = useCC();
  const [busy, setBusy] = useState(false), [created, setCreated] = useState<any>(null);
  return <Drawer open={open} onClose={close} title="Ajouter un cabinet client" subtitle="CRM SmilePec : ce cabinet n’a pas encore besoin d’être inscrit sur la plateforme.">
    {created ? <Card title="Cabinet ajouté"><p>Le cabinet est maintenant suivi dans SmilePec. Pour activer son accès plus tard, transmettez ce code de récupération au responsable : <code>{created.recoveryCode}</code></p><div className="cc-inline"><button className="cc-btn is-primary" onClick={() => { cc.bump(); cc.open("cabinet", created.cabinet.id); close(); }}>Ouvrir la fiche client</button><button className="cc-btn" onClick={close}>Fermer</button></div></Card>
      : <form className="cc-stack" onSubmit={async (e) => { e.preventDefault(); const f = Object.fromEntries(new FormData(e.currentTarget)); setBusy(true); try { const result = await api("cc-cabinet-create", { ...f, tags: String(f.tags || "").split(",").map((x) => x.trim()).filter(Boolean) }); setCreated(result); cc.toast("Cabinet ajouté au suivi SmilePec."); } catch (err) { cc.toast((err as Error).message); } finally { setBusy(false); } }}>
        <Card title="Coordonnées"><div className="cc-form-grid"><label>Nom du cabinet<input name="clinic_name" required maxLength={120} autoFocus /></label><label>Responsable<input name="name" required maxLength={80} /></label><label>E-mail professionnel<input type="email" name="email" required maxLength={254} /></label><label>Téléphone<input name="phone" maxLength={40} /></label><label>Ville<input name="city" maxLength={100} /></label><label>Cycle de départ<select name="lifecycle" defaultValue="lead">{Object.entries(LIFECYCLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label></div></Card>
        <Card title="Suivi SmilePec"><div className="cc-form-grid"><label>Responsable du suivi<select name="owner_id"><option value="">À attribuer plus tard</option>{cc.me.team.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select></label><label>Prochain contact<input type="date" name="next_contact_at" /></label><label>Tags<input name="tags" placeholder="ex. pilote, Paris, à rappeler" maxLength={300} /></label><label className="cc-form-full">Résumé interne<textarea name="internal_summary" rows={4} maxLength={4000} placeholder="Contexte commercial, besoins exprimés, prochaine étape…" /></label><label className="cc-form-full">Motif de l’ajout<input name="reason" maxLength={500} placeholder="Ex. cabinet rencontré au congrès" /></label></div></Card>
        <button className="cc-btn is-primary" disabled={busy}>{busy ? "Ajout…" : "Ajouter au CRM SmilePec"}</button>
      </form>}
  </Drawer>;
}

function CabinetReport({ open, close }: { open: boolean; close: () => void }) {
  const cc = useCC();
  const { data, error, loading } = useApi<any>(open ? "cc-report" : null, { v: cc.version });
  const prepare = async (email = false) => { if (!data) return; await api("cc-report-prepared", { scope: data.scope, count: data.cabinets.length }); if (email) { const subject = encodeURIComponent(`Rapport SmilePec — ${data.summary.total} cabinet(s)`); const body = encodeURIComponent(`Rapport SmilePec du ${new Date(data.generated_at).toLocaleDateString("fr-FR")}\n\nCabinets suivis : ${data.summary.total}\nInscrits : ${data.summary.signed_up}\nAjoutés par Amel : ${data.summary.manually_added}\nÀ risque : ${data.summary.at_risk}\nDemandes ouvertes : ${data.summary.open_requests}\nActions en attente : ${data.summary.pending_actions}`); location.href = `mailto:?subject=${subject}&body=${body}`; } else csvDownload("rapport-smilepec-cabinets", [["Cabinet", "E-mail", "Ville", "Origine", "Cycle", "Santé", "Onboarding %", "Demandes ouvertes", "Actions", "Prochain contact"], ...data.cabinets.map((c: any) => [c.name, c.email, c.city, c.source === "manual" ? "Ajouté par Amel" : "Inscrit", LIFECYCLE[c.lifecycle], c.health.score, c.onboarding, c.open_requests, c.pending_actions, c.next_contact_at || ""]) ]); cc.toast(email ? "E-mail de rapport préparé." : "Rapport CSV téléchargé."); };
  return <Drawer open={open} onClose={close} title="Rapport global SmilePec" subtitle="Vue consolidée des cabinets clients, demandes et suivi."><Loadable loading={loading && !data} error={error || ""} rows={6}>{data && <div className="cc-stack"><div className="cc-kpis inline"><Kpi label="Cabinets suivis" value={data.summary.total} /><Kpi label="Ajoutés par Amel" value={data.summary.manually_added} /><Kpi label="À risque" value={data.summary.at_risk} tone={data.summary.at_risk ? "critical" : "ok"} /><Kpi label="Demandes ouvertes" value={data.summary.open_requests} /></div><Card title="Contenu du rapport"><p>{data.summary.pending_actions} action(s) à traiter. Les données patient et les documents cliniques ne figurent jamais dans ce rapport central.</p><div className="cc-inline"><button className="cc-btn is-primary" onClick={() => prepare(false)}><Download size={14} />Télécharger CSV</button><button className="cc-btn" onClick={() => prepare(true)}>Préparer un e-mail</button></div></Card></div>}</Loadable></Drawer>;
}

export default function Cabinets() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<{ cabinets: CabinetRow[] }>("cc-cabinets", { v: cc.version });
  const [sub, setSub] = useUrlParam("sub");
  const [filter, setFilter] = useState("all"), [lifecycle, setLifecycle] = useState("");
  const [manualOpen, setManualOpen] = useState(false), [reportOpen, setReportOpen] = useState(false);
  useEffect(() => { if (sub && FILTERS.some((f) => f.key === sub)) { setFilter(sub); setSub("", true); } }, [sub]);
  const rows = (data?.cabinets || []).filter((c) => matches(c, filter) && (!lifecycle || c.lifecycle === lifecycle));
  const owner = (id: string | null) => cc.me.team.find((t) => t.id === id)?.name;
  const columns: Column<CabinetRow>[] = [
    { key: "name", label: "Cabinet", mobile: "title", sort: (c) => (c.clinic_name || c.name).toLowerCase(), render: (c) => <span className="cc-cell-main"><strong>{c.clinic_name || c.name}</strong><small>{c.name}{c.city ? " · " + c.city : ""}{c.source === "manual" ? " · ajouté par Amel" : ""}</small></span> },
    { key: "health", label: "Santé", sort: (c) => c.health.score, render: (c) => <HealthBadge {...c.health} /> },
    { key: "lifecycle", label: "Cycle", sort: (c) => c.lifecycle, render: (c) => <span className="cc-inline">{LIFECYCLE[c.lifecycle]}{c.suspended && <Badge tone="critical">Suspendu</Badge>}{c.verified ? <Badge tone="ok">Vérifié</Badge> : <Badge tone="warn">Non vérifié</Badge>}</span> },
    { key: "onboarding", label: "Onboarding", sort: (c) => c.onboarding.percent, render: (c) => <span className="cc-inline"><Meter value={c.onboarding.percent} />{c.onboarding.percent} %</span> },
    { key: "activity", label: "Dernière activité", sort: (c) => (c.last_activity_at ? new Date(c.last_activity_at).getTime() : 0), render: (c) => ago(c.last_activity_at) },
    { key: "open", label: "Ouvert", sort: (c) => c.open_events + c.open_tickets, render: (c) => <span className="cc-inline">{c.open_events ? <Badge tone="warn">{c.open_events} alerte(s)</Badge> : null}{c.open_tickets ? <Badge tone="info">{c.open_tickets} ticket(s)</Badge> : null}{!c.open_events && !c.open_tickets && "—"}</span> },
    ...(cc.can("billing.read") ? [{ key: "finance", label: "À encaisser", className: "num", sort: (c: CabinetRow) => c.outstanding, render: (c: CabinetRow) => <span className={c.overdue_amount ? "late" : ""}>{eur(c.outstanding)}{c.overdue_amount ? <small> · {eur(c.overdue_amount)} en retard</small> : null}</span> }] : []),
    { key: "owner", label: "Suivi par", mobile: "hide", sort: (c) => owner(c.crm_owner_id) || "~", render: (c) => owner(c.crm_owner_id) || <span className="cc-muted">—</span> },
    { key: "actions", label: "", mobile: "hide", className: "actions", render: (c) => <CabinetActions c={{ id: c.id, name: c.clinic_name || c.name, email: c.email, suspended: c.suspended }} /> },
  ];
  const bulk = (selected: CabinetRow[], clear: () => void) => {
    const run = (label: string, patch: Record<string, string>) => cc.confirm({ title: label, reason: "optional", summary: <p>Vous allez modifier <b>{selected.length}</b> cabinet(s) : {selected.slice(0, 5).map((c) => c.clinic_name || c.name).join(", ")}{selected.length > 5 ? "…" : ""}</p>, run: async (reason) => { await api("cc-bulk", { entity: "cabinets", ids: selected.map((c) => c.id), patch, reason }); clear(); cc.toast("Cabinets mis à jour."); cc.bump(); } });
    return <>
      {cc.can("cabinet.update") && <select aria-label="Changer le cycle" value="" onChange={(e) => e.target.value && run("Changer le cycle de vie", { lifecycle: e.target.value })}><option value="">Cycle de vie…</option>{Object.entries(LIFECYCLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>}
      {cc.can("cabinet.update") && <select aria-label="Assigner le suivi" value="" onChange={(e) => e.target.value && run("Assigner le suivi", { owner_id: e.target.value })}><option value="">Suivi par…</option>{cc.me.team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>}
      {cc.can("cabinet.update") && <button className="cc-btn is-small" onClick={() => { const tag = (document.getElementById("cc-bulk-tag") as HTMLInputElement)?.value.trim(); if (tag) run(`Ajouter le tag « ${tag} »`, { tag }); }}>Taguer</button>}
      {cc.can("cabinet.update") && <input id="cc-bulk-tag" className="cc-small-input" placeholder="tag (ex. pilote)" aria-label="Tag" maxLength={40} />}
      {cc.can("export.bulk") && <button className="cc-btn is-small" onClick={() => exportRows(selected)}><Download size={13} />Exporter</button>}
    </>;
  };
  const exportRows = (list: CabinetRow[]) => cc.confirm({ title: "Exporter les cabinets", summary: <p>Export CSV de <b>{list.length}</b> cabinet(s) (coordonnées professionnelles, santé, finance agrégée). L’export est journalisé.</p>, reason: "optional", run: async (reason) => {
    await api("cc-export-log", { kind: "cabinets", count: list.length, reason });
    csvDownload("amelib-cabinets", [["Cabinet", "Responsable", "E-mail", "Ville", "Cycle", "Santé", "Onboarding %", "Tickets ouverts", "À encaisser", "En retard"], ...list.map((c) => [c.clinic_name, c.name, c.email, c.city, LIFECYCLE[c.lifecycle], c.health.score, c.onboarding.percent, c.open_tickets, c.outstanding, c.overdue_amount])]);
  } });
  const counts = Object.fromEntries(FILTERS.map((f) => [f.key, (data?.cabinets || []).filter((c) => matches(c, f.key)).length]));
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Cabinets & équipes</h1><p>Tous les cabinets clients de SmilePec, inscrits ou ajoutés au CRM, avec leurs demandes et leur suivi.</p></div>
      <div className="cc-inline">{cc.can("cabinet.update") && <button className="cc-btn is-primary" onClick={() => setManualOpen(true)}><Plus size={15} />Ajouter un cabinet</button>}{cc.can("export.bulk") && <button className="cc-btn" onClick={() => setReportOpen(true)}><FileText size={15} />Rapport global</button>}{cc.can("export.bulk") && <button className="cc-btn" onClick={() => exportRows(rows)}><Download size={15} />Exporter la vue</button>}</div></header>
    <div className="cc-filterbar">
      <Chips label="Filtres cabinets" items={FILTERS.map((f) => ({ ...f, count: counts[f.key] }))} value={filter} onChange={setFilter} />
      <select aria-label="Cycle de vie" value={lifecycle} onChange={(e) => setLifecycle(e.target.value)}><option value="">Tous les cycles</option>{Object.entries(LIFECYCLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
    </div>
    <SavedViews scope="cabinets" current={{ filter, lifecycle }} apply={(f) => { setFilter(f.filter || "all"); setLifecycle(f.lifecycle || ""); }}
      builtins={[{ name: "Cabinets à relancer", filters: { filter: "relancer" } }, { name: "Nouveaux cabinets", filters: { filter: "new" } }, { name: "À risque", filters: { filter: "risk" } }]} />
    <Card>
      <Loadable loading={loading && !data} error={error ? "Impossible de charger les cabinets." : ""} retry={reload} rows={8}>
        <DataTable label="Cabinets" rows={rows} columns={columns} selectable={cc.can("cabinet.update") || cc.can("export.bulk")} bulk={bulk} onOpen={(c) => cc.open("cabinet", c.id)}
          search={(c) => [c.clinic_name, c.name, c.city, c.email, ...(c.tags || [])].join(" ")} initialSort={{ key: "health", dir: 1 }}
          empty={!data?.cabinets.length ? <div className="cc-empty"><span>·</span><strong>Aucun cabinet inscrit pour le moment.</strong></div> : filter === "risk" ? <div className="cc-empty"><span>✓</span><strong>Aucun cabinet à risque 🎉</strong></div> : undefined} />
      </Loadable>
    </Card>
    <ManualCabinet open={manualOpen} close={() => setManualOpen(false)} />
    <CabinetReport open={reportOpen} close={() => setReportOpen(false)} />
  </div>;
}
