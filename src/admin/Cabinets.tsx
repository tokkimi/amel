import { useEffect, useState } from "react";
import { Download, MoreHorizontal } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import DataTable, { Column } from "./DataTable";
import SavedViews from "./SavedViews";
import { ago, Badge, Card, Chips, csvDownload, eur, HealthBadge, LIFECYCLE, Loadable, Meter, useApi, useUrlParam } from "./ui";

export type CabinetRow = {
  id: string; name: string; email: string; clinic_name: string; city: string; phone: string; created_at: string; suspended: boolean; verified: boolean; published: boolean;
  lifecycle: string; lifecycle_derived: boolean; crm_owner_id: string | null; tags: string[]; next_contact_at: string | null; team_count: number; patient_count: number;
  open_tickets: number; open_events: number; invoiced: number; outstanding: number; overdue_amount: number; overdue_count: number; last_activity_at: string | null;
  health: { score: number; status: string; label: string }; onboarding: { percent: number; completed: number; total: number };
};
const FILTERS = [
  { key: "all", label: "Tous" }, { key: "relancer", label: "À relancer" }, { key: "risk", label: "À risque" }, { key: "onboarding", label: "Onboarding incomplet" },
  { key: "new", label: "Nouveaux (30 j)" }, { key: "overdue", label: "Retards de paiement" }, { key: "support", label: "Support ouvert" }, { key: "suspended", label: "Suspendus" },
];
const matches = (c: CabinetRow, f: string) => {
  const idle = !c.last_activity_at || Date.now() - new Date(c.last_activity_at).getTime() > 14 * 86400000;
  switch (f) {
    case "relancer": return !c.suspended && c.lifecycle !== "churned" && (idle || (c.next_contact_at && new Date(c.next_contact_at) <= new Date()) || (c.onboarding.percent < 100 && Date.now() - new Date(c.created_at).getTime() > 7 * 86400000));
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

export default function Cabinets() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<{ cabinets: CabinetRow[] }>("cc-cabinets", { v: cc.version });
  const [sub, setSub] = useUrlParam("sub");
  const [filter, setFilter] = useState("all"), [lifecycle, setLifecycle] = useState("");
  useEffect(() => { if (sub && FILTERS.some((f) => f.key === sub)) { setFilter(sub); setSub("", true); } }, [sub]);
  const rows = (data?.cabinets || []).filter((c) => matches(c, filter) && (!lifecycle || c.lifecycle === lifecycle));
  const owner = (id: string | null) => cc.me.team.find((t) => t.id === id)?.name;
  const columns: Column<CabinetRow>[] = [
    { key: "name", label: "Cabinet", mobile: "title", sort: (c) => (c.clinic_name || c.name).toLowerCase(), render: (c) => <span className="cc-cell-main"><strong>{c.clinic_name || c.name}</strong><small>{c.name}{c.city ? " · " + c.city : ""}</small></span> },
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
    <header className="cc-page-head"><div><h1>Cabinets</h1><p>Gestion 360° du réseau : santé, onboarding, suivi commercial et support.</p></div>
      {cc.can("export.bulk") && <button className="cc-btn" onClick={() => exportRows(rows)}><Download size={15} />Exporter la vue</button>}</header>
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
  </div>;
}
