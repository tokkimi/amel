import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useCC } from "./context";
import { AUDIT_LABEL, Card, day, Drawer, Empty, Kpi, Loadable, time, useApi } from "./ui";

export default function Security() {
  const cc = useCC();
  const [q, setQ] = useState(""), [debounced, setDebounced] = useState(""), [entity, setEntity] = useState(""), [page, setPage] = useState(0), [open, setOpen] = useState<any>(null);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(0); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useApi<any>("cc-audit", { q: debounced, entity_type: entity, page, v: cc.version });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Sécurité & Audit</h1><p>Journal append-only des décisions, sessions d’assistance et actions sensibles.</p></div></header>
    <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
      {data && <>
        <div className="cc-kpis">
          <Kpi label="Actions sur 24 h" value={data.stats.last_24h} />
          <Kpi label="Actions sensibles sur 7 j" value={data.stats.sensitive_7d} tone={data.stats.sensitive_7d ? "warn" : "neutral"} hint="suspensions, rôles, exports, assistance" />
          <Kpi label="Sessions d’assistance ouvertes" value={data.assists.filter((a: any) => !a.ended_at).length} />
        </div>
        <Card title="Journal d’actions" action={<small className="cc-muted">Historique non modifiable depuis l’interface ni en base (mises à jour bloquées).</small>}>
          <div className="cc-table-toolbar">
            <label className="cc-search-input"><Search size={15} aria-hidden /><input aria-label="Rechercher dans le journal" placeholder="Administrateur, décision, motif…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
            <select aria-label="Type d’élément" value={entity} onChange={(e) => { setEntity(e.target.value); setPage(0); }}><option value="">Tous les éléments</option>{["cabinet", "account", "event", "ticket", "verification", "automation", "feature_flag", "export"].map((k) => <option key={k} value={k}>{k}</option>)}</select>
          </div>
          {data.items.length ? <ol className="cc-audit">{data.items.map((a: any) => <li key={a.id}><button onClick={() => setOpen(a)}><time>{day(a.created_at)} {time(a.created_at)}</time><strong>{AUDIT_LABEL[a.action] || a.action}</strong><span>{a.reason || a.detail || "—"}</span><small>{a.actor_name}{a.entity_type ? ` · ${a.entity_type}` : ""}</small></button></li>)}</ol> : <Empty title="Aucune action ne correspond." icon="∅" />}
          {pages > 1 && <nav className="cc-pager" aria-label="Pages"><button className="cc-icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Page précédente"><ChevronLeft size={16} /></button><span>Page {page + 1} / {pages}</span><button className="cc-icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Page suivante"><ChevronRight size={16} /></button></nav>}
        </Card>
        <Card title="Sessions « Voir comme cabinet »">{data.assists.length ? <ul className="cc-list">{data.assists.map((s: any) => <li key={s.id}><span><strong>{s.admin} → {s.cabinet}</strong><small>{day(s.started_at)} {time(s.started_at)} – {s.ended_at ? time(s.ended_at) : "en cours"} · lecture seule · {s.reason}</small></span></li>)}</ul> : <Empty title="Aucune session d’assistance." icon="·" />}</Card>
      </>}
    </Loadable>
    {open && <Drawer open onClose={() => setOpen(null)} title={AUDIT_LABEL[open.action] || open.action} subtitle={`${open.actor_name} · ${day(open.created_at)} ${time(open.created_at)}`}>
      <div className="cc-kv">
        <span>Action</span><code>{open.action}</code>
        <span>Élément</span><span>{open.entity_type || "—"} {open.entity_id || open.target_id || ""}</span>
        <span>Motif</span><span>{open.reason || open.detail || "—"}</span>
        <span>Requête</span><code>{open.request_id || "—"}</code>
        <span>IP</span><code>{open.ip || "—"}</code>
        {open.impersonated_by && <><span>Au nom de</span><code>{open.impersonated_by}</code></>}
      </div>
      {(open.before || open.after) && <div className="cc-diff"><div><h4>Avant</h4><pre>{JSON.stringify(open.before, null, 2) || "—"}</pre></div><div><h4>Après</h4><pre>{JSON.stringify(open.after, null, 2) || "—"}</pre></div></div>}
      <p className="cc-muted">Les secrets, mots de passe, jetons et données médicales ne sont jamais journalisés.</p>
    </Drawer>}
  </div>;
}
