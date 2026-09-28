import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Download, Search } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import DataTable, { Column } from "./DataTable";
import { ago, Avatar, Badge, Card, Chips, csvDownload, day, Drawer, Empty, Loadable, Meter, ROLE, Tabs, Timeline, useApi, useUrlParam, VERIFICATION } from "./ui";

const SUBS = ["Comptes", "Vérifications", "Onboarding", "Équipes"];
export default function Network() {
  const [sub, setSub] = useUrlParam("sub");
  const [tab, target] = (sub || "Comptes").split(":");
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Réseau</h1><p>Professionnels, comptes, vérifications, onboarding et équipes.</p></div></header>
    <Tabs label="Réseau" tabs={SUBS.map((s) => ({ key: s, label: s }))} value={SUBS.includes(tab) ? tab : "Comptes"} onChange={(s) => setSub(s === "Comptes" ? "" : s, true)} />
    {(tab === "Comptes" || !SUBS.includes(tab)) && <Accounts key={target || ""} initial={target} />}
    {tab === "Vérifications" && <Verifications focus={target} />}
    {tab === "Onboarding" && <Onboarding />}
    {tab === "Équipes" && <Teams />}
  </div>;
}

type Person = { id: string; name: string; email: string; role: string; created_at: string; suspended: boolean; verified: boolean; identifier: string; specialty: string; city: string; published: boolean; qualifications: string; cabinet_id: string };
function Accounts({ initial = "" }: { initial?: string }) {
  const cc = useCC();
  const [q, setQ] = useState(initial), [debounced, setDebounced] = useState(initial), [role, setRole] = useState(""), [status, setStatus] = useState(""), [page, setPage] = useState(0), [person, setPerson] = useState<Person | null>(null);
  useEffect(() => { const t = setTimeout(() => { setDebounced(q); setPage(0); }, 250); return () => clearTimeout(t); }, [q]);
  const { data, error, loading, reload } = useApi<any>("cc-accounts", { q: debounced, role, status, page, v: cc.version });
  const pages = data ? Math.max(1, Math.ceil(data.total / data.size)) : 1;
  const columns: Column<Person>[] = [
    { key: "name", label: "Nom", mobile: "title", render: (p) => <span className="cc-inline"><Avatar name={p.name} /><span className="cc-cell-main"><strong>{p.name}</strong><small>{p.email || "—"}</small></span></span> },
    { key: "role", label: "Rôle", render: (p) => ROLE[p.role] || p.role },
    { key: "status", label: "Statut", render: (p) => <span className="cc-inline">{p.suspended ? <Badge tone="critical" icon>Suspendu</Badge> : <Badge tone="ok">Actif</Badge>}{["professional", "worker"].includes(p.role) && (p.verified ? <Badge tone="ok">Vérifié</Badge> : <Badge tone="warn">Non vérifié</Badge>)}</span> },
    { key: "city", label: "Ville", mobile: "hide", render: (p) => p.city || "—" },
    { key: "created", label: "Inscription", render: (p) => day(p.created_at) },
  ];
  return <Card>
    <div className="cc-table-toolbar">
      <label className="cc-search-input"><Search size={15} aria-hidden /><input aria-label="Rechercher un compte" placeholder="Nom, e-mail, ville, identifiant…" value={q} onChange={(e) => setQ(e.target.value)} /></label>
      <select aria-label="Rôle" value={role} onChange={(e) => { setRole(e.target.value); setPage(0); }}><option value="">Tous les rôles</option>{Object.entries(ROLE).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      <select aria-label="Statut" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }}><option value="">Tous statuts</option><option value="suspended">Suspendus</option><option value="unverified">Non vérifiés</option><option value="verified">Vérifiés</option></select>
      {cc.can("export.bulk") && <button className="cc-btn" onClick={() => cc.confirm({ title: "Exporter les comptes", reason: "optional", summary: <p>Export CSV des <b>{data?.items.length || 0}</b> comptes de la page courante. L’export est journalisé.</p>, run: async (reason) => { await api("cc-export-log", { kind: "accounts", count: data?.items.length || 0, reason }); csvDownload("amelib-comptes", [["Nom", "E-mail", "Rôle", "Suspendu", "Vérifié"], ...(data?.items || []).map((p: Person) => [p.name, p.email, ROLE[p.role], p.suspended ? "Oui" : "Non", p.verified ? "Oui" : "Non"])]); } })}><Download size={14} />Exporter</button>}
    </div>
    <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
      <DataTable label="Comptes" rows={data?.items || []} columns={columns} onOpen={setPerson} pageSize={50} />
      {pages > 1 && <nav className="cc-pager" aria-label="Pages"><button className="cc-icon" disabled={page === 0} onClick={() => setPage(page - 1)} aria-label="Page précédente"><ChevronLeft size={16} /></button><span>Page {page + 1} / {pages} · {data.total} comptes</span><button className="cc-icon" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} aria-label="Page suivante"><ChevronRight size={16} /></button></nav>}
    </Loadable>
    {person && <PersonDrawer person={person} close={() => setPerson(null)} />}
  </Card>;
}

function PersonDrawer({ person, close }: { person: Person; close: () => void }) {
  const cc = useCC();
  const history = useApi<any>(cc.can("account.read") ? "cc-timeline" : null, { entity_type: "account", entity_id: person.id, v: cc.version });
  const pro = ["professional", "worker"].includes(person.role);
  const decide = (title: string, action: string, values: Record<string, unknown>, danger = false) => cc.confirm({
    title, danger, reason: true, summary: <p>Compte concerné : <b>{person.name}</b>{person.email ? ` (${person.email})` : ""}. La décision est journalisée.</p>,
    run: async (note) => { await api(action, { id: person.id, ...values, note }); cc.toast("Décision enregistrée dans le journal."); cc.bump(); close(); },
  });
  return <Drawer open onClose={close} title={person.name} subtitle={<span className="cc-inline">{ROLE[person.role]}{person.suspended ? <Badge tone="critical">Suspendu</Badge> : <Badge tone="ok">Actif</Badge>}{pro && (person.verified ? <Badge tone="ok">Vérifié</Badge> : <Badge tone="warn">Non vérifié</Badge>)}</span>}>
    <div className="cc-stack">
      <div className="cc-kv">
        {person.email && <><span>E-mail</span><span>{person.email}</span></>}
        <span>Inscription</span><span>{day(person.created_at)}</span>
        {person.specialty && <><span>Spécialité</span><span>{person.specialty}{person.city ? " · " + person.city : ""}</span></>}
        {person.identifier && <><span>Identifiant</span><span>{person.identifier}</span></>}
        {person.qualifications && <><span>Qualifications</span><span>{person.qualifications}</span></>}
      </div>
      <div className="cc-row-actions">
        {pro && cc.can("cabinet.read") && <button className="cc-btn" onClick={() => cc.open("cabinet", person.cabinet_id)}>Voir le cabinet</button>}
        {pro && cc.can("verification.read") && <button className="cc-btn" onClick={() => { close(); cc.go("Réseau", "Vérifications:" + person.id); }}>Vérifier</button>}
        {person.email && person.role !== "patient" && <a className="cc-btn" href={"mailto:" + person.email}>Contacter</a>}
        {pro && person.published && <a className="cc-btn" href={"/praticiens/" + person.id}>Profil public</a>}
        {pro && person.published && cc.can("account.suspend") && <button className="cc-btn" onClick={() => decide("Retirer le profil de l’annuaire", "admin-unpublish", {})}>Retirer de l’annuaire…</button>}
        {person.role !== "admin" && cc.can("account.suspend") && <button className={"cc-btn " + (person.suspended ? "" : "is-danger")} onClick={() => decide(person.suspended ? "Réactiver le compte" : "Suspendre le compte", "admin-suspend", { suspended: !person.suspended }, !person.suspended)}>{person.suspended ? "Réactiver…" : "Suspendre…"}</button>}
      </div>
      <p className="cc-muted">Une suspension ferme les sessions et masque le profil public. Elle ne supprime pas les rendez-vous.</p>
      <h3>Historique</h3>
      <Loadable loading={history.loading && !history.data} error={history.error}><Timeline items={history.data?.items || []} /></Loadable>
    </div>
  </Drawer>;
}

type Verification = { id: string; name: string; email: string; role: string; created_at: string; identifier: string; specialty: string; city: string; qualifications: string; clinic_name: string; phone: string; address: string; status: string; checklist: Record<string, boolean>; reviewed_at: string | null; rejection_reason: string; missing_information: string; reviewer: string | null; status_since: string; cabinet_id: string; suspended: boolean };
const CHECKS: Record<string, string> = { identity: "Identité", professional_id: "Identifiant professionnel", cabinet: "Cabinet", documents: "Document nécessaire", contact: "Coordonnées" };
function Verifications({ focus }: { focus?: string }) {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-verifications", { v: cc.version });
  const [filter, setFilter] = useState("todo"), [open, setOpen] = useState<string>(focus || "");
  useEffect(() => { if (focus) setOpen(focus); }, [focus]);
  const items: Verification[] = data?.items || [];
  const todo = (v: Verification) => ["documents_received", "reviewing"].includes(v.status);
  const rows = items.filter((v) => filter === "todo" ? todo(v) : filter === "48h" ? todo(v) && Date.now() - new Date(v.status_since).getTime() > 48 * 3600000 : filter === "all" ? true : v.status === filter);
  const columns: Column<Verification>[] = [
    { key: "name", label: "Professionnel", mobile: "title", sort: (v) => v.name.toLowerCase(), render: (v) => <span className="cc-cell-main"><strong>{v.name}</strong><small>{v.clinic_name || "—"} · {v.city || "ville ?"}</small></span> },
    { key: "status", label: "Statut", sort: (v) => v.status, render: (v) => <Badge tone={v.status === "approved" ? "ok" : v.status === "rejected" ? "critical" : v.status === "missing_information" ? "warn" : "info"}>{VERIFICATION[v.status]}</Badge> },
    { key: "since", label: "Depuis", sort: (v) => new Date(v.status_since).getTime(), render: (v) => ago(v.status_since) },
    { key: "id", label: "Identifiant", render: (v) => v.identifier || <span className="cc-muted">non transmis</span> },
    { key: "checks", label: "Contrôles", mobile: "hide", render: (v) => `${Object.values(v.checklist || {}).filter(Boolean).length}/5` },
    { key: "reviewer", label: "Vérificateur", mobile: "hide", render: (v) => v.reviewer || "—" },
  ];
  const selected = items.find((v) => v.id === open);
  return <>
    <div className="cc-filterbar"><Chips label="Statut de vérification" value={filter} onChange={setFilter} items={[{ key: "todo", label: "À traiter", count: items.filter(todo).length }, { key: "48h", label: "> 48 h" }, { key: "missing_information", label: "Infos manquantes" }, { key: "new", label: "Nouveaux" }, { key: "approved", label: "Approuvés" }, { key: "rejected", label: "Refusés" }, { key: "all", label: "Tous" }]} /></div>
    <Card><Loadable loading={loading && !data} error={error} retry={reload} rows={6}>
      <DataTable label="Vérifications" rows={rows} columns={columns} onOpen={(v) => setOpen(v.id)} search={(v) => [v.name, v.email, v.clinic_name, v.identifier, v.city].join(" ")} initialSort={{ key: "since", dir: 1 }}
        empty={filter === "todo" ? <Empty title="Aucune vérification en attente 🎉" text="Toutes les demandes ont été traitées." /> : undefined} />
    </Loadable></Card>
    {selected && <VerificationDrawer v={selected} close={() => setOpen("")} />}
  </>;
}

function VerificationDrawer({ v, close }: { v: Verification; close: () => void }) {
  const cc = useCC();
  const [checks, setChecks] = useState<Record<string, boolean>>(v.checklist || {}), [reason, setReason] = useState(v.rejection_reason || ""), [missing, setMissing] = useState(v.missing_information || ""), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  const history = useApi<any>("cc-timeline", { entity_type: "verification", entity_id: v.id, v: cc.version });
  const save = async (status: string) => {
    setBusy(true); setErr("");
    try { await api("cc-verification-update", { id: v.id, status, checklist: checks, reason, missing_information: missing }); cc.toast(`Vérification : ${VERIFICATION[status]}.`); cc.bump(); if (["approved", "rejected"].includes(status)) close(); }
    catch (e) { setErr((e as Error).message); } finally { setBusy(false); }
  };
  const all = Object.keys(CHECKS).every((k) => checks[k]);
  return <Drawer open onClose={close} title={`Vérification — ${v.name}`} subtitle={<span className="cc-inline"><Badge>{VERIFICATION[v.status]}</Badge>depuis {ago(v.status_since)}{v.reviewer && <> · vérificateur : {v.reviewer}{v.reviewed_at ? ` (${day(v.reviewed_at)})` : ""}</>}</span>}>
    <div className="cc-stack">
      <div className="cc-kv">
        <span>E-mail</span><span>{v.email}</span><span>Identifiant</span><span>{v.identifier || "Non transmis"}</span>
        <span>Cabinet</span><span>{v.clinic_name ? <button className="cc-link" onClick={() => cc.open("cabinet", v.cabinet_id)}>{v.clinic_name}</button> : "—"}</span>
        <span>Adresse</span><span>{[v.address, v.city].filter(Boolean).join(", ") || "—"}</span><span>Téléphone</span><span>{v.phone || "—"}</span>
        {v.qualifications && <><span>Qualifications</span><span>{v.qualifications}</span></>}
      </div>
      <fieldset className="cc-checklist"><legend>Checklist</legend>{Object.entries(CHECKS).map(([k, l]) => <label key={k}><input type="checkbox" checked={!!checks[k]} onChange={(e) => setChecks({ ...checks, [k]: e.target.checked })} disabled={!cc.can("verification.approve") && !cc.can("verification.reject")} />{l}</label>)}</fieldset>
      <label>Informations manquantes (envoyées au professionnel)<textarea rows={2} value={missing} onChange={(e) => setMissing(e.target.value)} maxLength={1000} /></label>
      <label>Raison du refus<textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} /></label>
      {err && <p className="cc-form-error" role="alert">{err}</p>}
      <div className="cc-row-actions">
        {v.status !== "reviewing" && <button className="cc-btn" disabled={busy} onClick={() => save("reviewing")}>Passer en revue</button>}
        <button className="cc-btn" disabled={busy || !missing.trim()} onClick={() => save("missing_information")}>Demander des informations</button>
        {cc.can("verification.reject") && <button className="cc-btn is-danger" disabled={busy} onClick={() => cc.confirm({ title: "Refuser la vérification", danger: true, summary: <p>Refuser <b>{v.name}</b>. Raison : « {reason || "à préciser"} ».</p>, run: async () => save("rejected") })}>Refuser…</button>}
        {cc.can("verification.approve") && <button className="cc-btn is-primary" disabled={busy || !all || !v.identifier} title={!all ? "Cochez tous les contrôles" : undefined} onClick={() => cc.confirm({ title: "Approuver la vérification", summary: <p><b>{v.name}</b> sera marqué comme vérifié (identifiant {v.identifier}).</p>, run: async () => save("approved") })}>Approuver…</button>}
      </div>
      <h3>Historique</h3>
      <Timeline items={history.data?.items || []} />
    </div>
  </Drawer>;
}

function Onboarding() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-cabinets", { v: cc.version });
  const rows = (data?.cabinets || []).filter((c: any) => c.onboarding.percent < 100).sort((a: any, b: any) => a.onboarding.percent - b.onboarding.percent);
  const stuck = rows.filter((c: any) => Date.now() - new Date(c.created_at).getTime() > 7 * 86400000);
  return <Loadable loading={loading && !data} error={error} retry={reload}>
    {stuck.length > 0 && <div className="cc-callout warn"><strong>{stuck.length} cabinet(s) bloqué(s) dans leur onboarding</strong> depuis plus de 7 jours.</div>}
    <Card>{rows.length ? <ul className="cc-list">{rows.map((c: any) => <li key={c.id}><button className="cc-list-row" onClick={() => cc.open("cabinet", c.id)}><span><strong>{c.clinic_name || c.name}</strong><small>Inscrit {ago(c.created_at)} · {c.onboarding.completed}/{c.onboarding.total} étapes</small></span><span className="cc-inline"><Meter value={c.onboarding.percent} />{c.onboarding.percent} %</span></button></li>)}</ul> : <Empty title="Tous les cabinets ont terminé leur onboarding 🎉" />}</Card>
  </Loadable>;
}

function Teams() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-cabinets", { v: cc.version });
  const rows = (data?.cabinets || []).sort((a: any, b: any) => b.team_count - a.team_count);
  return <Card><Loadable loading={loading && !data} error={error} retry={reload}>
    {rows.length ? <ul className="cc-list">{rows.map((c: any) => <li key={c.id}><button className="cc-list-row" onClick={() => { cc.open("cabinet", c.id); setTimeout(() => dispatchEvent(new CustomEvent("cc:cabinet-tab", { detail: "Équipe" })), 60); }}><span><strong>{c.clinic_name || c.name}</strong><small>{c.name}{c.city ? " · " + c.city : ""}</small></span><span className="cc-inline"><Badge>{c.team_count + 1} personne(s)</Badge></span></button></li>)}</ul> : <Empty title="Aucun cabinet pour le moment." icon="·" />}
  </Loadable></Card>;
}
