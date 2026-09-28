import { useEffect, useMemo, useState } from "react";
import { Check, Plus, Search } from "lucide-react";
import SavedViews from "./SavedViews";
import { api } from "../client";
import { useCC } from "./context";
import { AssignMenu, EventRow, OpEvent, SnoozeMenu } from "./events";
import { Card, Chips, Empty, Loadable, Tabs, useApi, useUrlParam } from "./ui";

export const INBOX_VIEWS = [
  { key: "active", label: "Actifs" }, { key: "mine", label: "Mon travail" }, { key: "team", label: "Équipe" }, { key: "unassigned", label: "Non assignés" },
  { key: "overdue", label: "En retard" }, { key: "snoozed", label: "Reportés" }, { key: "resolved", label: "Résolus (30 j)" },
];
export const INBOX_FILTERS = [
  { key: "all", label: "Tout" }, { key: "urgent", label: "Urgent" }, { key: "validate", label: "À valider" }, { key: "support", label: "Support" },
  { key: "finance", label: "Finance" }, { key: "cabinets", label: "Cabinets" }, { key: "alerts", label: "Alertes" },
];
export const BUILTIN_VIEWS: { name: string; filters: Record<string, string> }[] = [
  { name: "Mes tâches", filters: { view: "mine" } },
  { name: "Vérifications > 48h", filters: { filter: "validate", min_age_hours: "48" } },
  { name: "Tickets urgents", filters: { filter: "urgent", type: "support" } },
  { name: "Finance en retard", filters: { filter: "finance" } },
];

export default function Inbox() {
  const cc = useCC();
  const [sub, setSub] = useUrlParam("sub");
  const [view, setView] = useState("active"), [filter, setFilter] = useState("all"), [q, setQ] = useState(""), [extra, setExtra] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!sub) return;
    if (INBOX_FILTERS.some((f) => f.key === sub)) { setFilter(sub); setView("active"); }
    else if (INBOX_VIEWS.some((v) => v.key === sub)) setView(sub);
    setSub("", true);
  }, [sub]);
  const { data, error, loading, reload } = useApi<any>("cc-inbox", { view, filter, q: q.length > 1 ? q : undefined, ...extra, v: cc.version });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => setSelected(new Set()), [view, filter, q, extra]);
  const items: OpEvent[] = data?.items || [];
  const counts = data?.counts || {};
  const chosen = useMemo(() => items.filter((e) => selected.has(e.id)), [items, selected]);
  const apply = (f: Record<string, string>) => { setView(f.view || "active"); setFilter(f.filter || "all"); setQ(f.q || ""); const { view: _v, filter: _f, q: _q, ...rest } = f; setExtra(rest); };
  const bulk = (label: string, patch: Record<string, unknown>) => cc.confirm({
    title: label, summary: <p>Vous allez modifier <b>{chosen.length}</b> élément(s) de l’Inbox.</p>, reason: "optional",
    run: async (reason) => { await api("cc-bulk", { entity: "events", ids: chosen.map((e) => e.id), patch, reason }); setSelected(new Set()); cc.toast(`${chosen.length} élément(s) mis à jour.`); cc.bump(); },
  });
  const manage = cc.can("inbox.manage");
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Inbox</h1><p>Tout ce qui demande une action humaine, au même endroit.</p></div>
      {manage && <button className="cc-btn is-primary" onClick={() => cc.createTask()}><Plus size={15} />Nouvelle tâche</button>}</header>
    <Tabs label="Vues" tabs={INBOX_VIEWS} value={view} onChange={(v) => { setView(v); setExtra({}); }} />
    <div className="cc-filterbar">
      <Chips label="Catégories" items={INBOX_FILTERS.map((f) => ({ ...f, count: counts[f.key] || 0 }))} value={filter} onChange={setFilter} />
      <label className="cc-search-input"><Search size={15} aria-hidden /><input aria-label="Rechercher dans l’Inbox" placeholder="Cabinet, personne, sujet…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
    </div>
    <SavedViews scope="inbox" builtins={BUILTIN_VIEWS} current={{ view, filter, q, ...extra }} apply={apply} />
    {Object.keys(extra).length > 0 && <button className="cc-link" onClick={() => setExtra({})}>Retirer les filtres avancés</button>}
    {manage && chosen.length > 0 && <div className="cc-bulkbar" role="region" aria-label="Actions groupées">
      <strong>{chosen.length} sélectionné(s)</strong>
      <AssignMenu value={null} onPick={(id) => bulk(id ? "Assigner la sélection" : "Désassigner la sélection", { owner_id: id })} />
      <SnoozeMenu onPick={(iso) => bulk("Reporter la sélection", { snoozed_until: iso })} />
      <button className="cc-btn" onClick={() => bulk("Résoudre la sélection", { status: "resolved" })}><Check size={14} />Résoudre</button>
      <select aria-label="Changer la priorité" value="" onChange={(e) => e.target.value && bulk("Changer la priorité", { severity: e.target.value })}><option value="">Priorité…</option><option value="critical">Critique</option><option value="high">Urgent</option><option value="medium">À suivre</option><option value="low">Faible</option></select>
      <button className="cc-btn is-ghost" onClick={() => setSelected(new Set())}>Désélectionner</button>
    </div>}
    <Card>
      <Loadable loading={loading && !data} error={error} retry={reload} rows={6}>
        {items.length ? <>
          {manage && <label className="cc-select-all"><input type="checkbox" checked={chosen.length === items.length} onChange={() => setSelected(chosen.length === items.length ? new Set() : new Set(items.map((e) => e.id)))} /> Tout sélectionner ({items.length})</label>}
          <div className="cc-event-list">{items.map((e) => <EventRow key={e.id} e={e} refresh={reload} selectable={manage} selected={selected.has(e.id)} onSelect={() => setSelected((s) => { const n = new Set(s); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })} />)}</div>
        </> : filter === "urgent" ? <Empty title="Aucun élément urgent 🎉" text="Tout est sous contrôle pour le moment." />
          : q || filter !== "all" || Object.keys(extra).length ? <Empty icon="∅" title="Aucun élément ne correspond à ces filtres." action={<button className="cc-btn" onClick={() => { setFilter("all"); setQ(""); setExtra({}); }}>Réinitialiser les filtres</button>} />
            : <Empty title={view === "mine" ? "Rien ne t’est assigné 🎉" : view === "snoozed" ? "Aucun élément reporté." : view === "resolved" ? "Aucun élément résolu ces 30 derniers jours." : "Inbox vide 🎉"} text={view === "active" ? "Tout est sous contrôle. Les automatisations ajouteront ici ce qui demande une action." : undefined} />}
      </Loadable>
    </Card>
  </div>;
}
