import React, { useEffect, useState } from "react";
import { usePanel } from "./usePanel";
import SupportPanel from './SupportPanel';
import AdminCabinets from './AdminCabinets';
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  Eye,
  FileCheck,
  Filter,
  LayoutDashboard,
  LogOut,
  Menu,
  RefreshCw,
  Search,
  Settings,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
import { api, Account, dateFormat, roleLabel } from "./client";
import { downloadWorkbook } from "./exports";
type Person = {
  id: string;
  name: string;
  email: string;
  role: string;
  created_at: string;
  suspended: boolean;
  verified: boolean;
  identifier: string;
  specialty: string;
  city: string;
  published: boolean;
  qualifications: string;
};
type Appointment = {
  id: string;
  status: string;
  starts_at: string;
  duration: number;
  patient_name: string;
  professional_name: string;
};
type Audit = {
  id: string;
  actor_name: string;
  action: string;
  detail: string;
  target_id: string;
  created_at: string;
};
type Data = {
  counts: Record<string, number>;
  accounts: Person[];
  appointments: Appointment[];
  audit: Audit[];
  settings: { name: string; support_email: string; announcement: string };
  financials: { id:string; number:string; doc_type:string; status:string; total:number; issue_date:string; patient_name:string; professional_name:string }[];
  priorities: { prosthesis_date:string; patient_name:string; professional_name:string; status:string }[];
  tasks: { id:string; title:string; stage:string; priority:string; due_at:string; assignee:string; professional_name:string }[];
};
const actions: Record<string, string> = {
  profile_verified: "Profil vérifié",
  verification_removed: "Vérification retirée",
  account_suspended: "Compte suspendu",
  account_reactivated: "Compte réactivé",
  profile_unpublished: "Profil retiré de l’annuaire",
  settings_updated: "Paramètres modifiés",
};
const statuses: Record<string, string> = {
  confirmed: "Confirmé",
  cancelled: "Annulé",
  completed: "Terminé",
};
export default function AdminConsole({
  account,
  logout,
}: {
  account: Account;
  logout: () => void;
}) {
  const [data, setData] = useState<Data | null>(null),
    [section, setSection] = usePanel("Vue d’ensemble", [
      "Vue d’ensemble",
      "Comptes",
      "Vérifications",
      "Rendez-vous",
      "Journal d’actions",
      "Paramètres",
      "Cabinets & équipes",
      "Demandes SmilePec",
      "Priorités opérationnelles",
      "Bilan comptable",
    ]),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("Tous"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [person, setPerson] = useState<Person | null>(null),
    [decision, setDecision] = useState<{
      action: string;
      title: string;
      target: Person;
      values: Record<string, unknown>;
    } | null>(null),
    [settings, setSettings] = useState<Data["settings"] | null>(null);
  useEffect(() => {
    setMobile(false);
  }, [section]);
  useEffect(() => {
    const close = () => setMobile(false);
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    addEventListener("popstate", close);
    addEventListener("keydown", key);
    return () => {
      removeEventListener("popstate", close);
      removeEventListener("keydown", key);
    };
  }, []);
  const load = async () => {
    setError("");
    try {
      const d = await api<Data>("admin");
      setData(d);
      setSettings(d.settings);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  const nav = [
    ["Vue d’ensemble", LayoutDashboard],
    ["Comptes", Users],
    ["Vérifications", ShieldCheck],
    ["Rendez-vous", CalendarDays],
    ["Journal d’actions", Activity],
    ["Paramètres", Settings],
    ["Cabinets & équipes", Users],
    ["Demandes SmilePec", FileCheck],
    ["Priorités opérationnelles", CalendarDays],
    ["Bilan comptable", Download],
  ] as const;
  const go = (s: string) => {
    setSection(s);
    setQuery("");
    setFilter("Tous");
    setMobile(false);
    window.scrollTo(0, 0);
  };
  const save = async (action: string, values: unknown) => {
    setBusy(true);
    setError("");
    try {
      await api(action, values);
      await load();
      setNotice("Modification enregistrée dans le journal d’actions.");
      setDecision(null);
      setPerson(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const csv = (name: string, rows: string[][]) => {
    const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
    const text =
      "\uFEFF" +
      rows
        .map((row) =>
          row.map((s) => '"' + safe(s).replace(/"/g, '""') + '"').join(";"),
        )
        .join("\r\n");
    const url = URL.createObjectURL(
      new Blob([text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = name + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  };
  const people =
    data?.accounts.filter(
      (p) =>
        (p.name + " " + p.email + " " + p.city + " " + p.identifier)
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (section === "Vérifications"
          ? ["professional", "worker"].includes(p.role) && !p.verified
          : true) &&
        (filter === "Tous" ||
          (filter === "Suspendus" && p.suspended) ||
          p.role === filter),
    ) || [];
  const appointments =
    data?.appointments.filter(
      (a) =>
        (a.patient_name + " " + a.professional_name)
          .toLowerCase()
          .includes(query.toLowerCase()) &&
        (filter === "Tous" || a.status === filter),
    ) || [];
  const audit =
    data?.audit.filter((a) =>
      (a.actor_name + " " + a.detail + " " + (actions[a.action] || a.action))
        .toLowerCase()
        .includes(query.toLowerCase()),
    ) || [];
  const accountRows = (list: Person[]) =>
    list.length ? (
      list.map((p) => (
        <button
          className="admin-account-row"
          key={p.id}
          onClick={() => setPerson(p)}
        >
          <span className="avatar blue">
            {p.name
              .split(" ")
              .map((n) => n[0])
              .slice(0, 2)
              .join("")}
          </span>
          <div className="grow">
            <strong>{p.name}</strong>
            <small>{p.email}</small>
          </div>
          <span className="role-tag">{roleLabel(p.role)}</span>
          <span className={"badge " + (p.suspended ? "amber" : "")}>
            {p.suspended
              ? "Suspendu"
              : p.verified
                ? "Vérifié"
                : p.published
                  ? "Publié"
                  : "Actif"}
          </span>
          <ArrowRight size={15} />
        </button>
      ))
    ) : (
      <div className="empty">Aucun compte correspondant.</div>
    );
  return (
    <div className="admin-app">
      <aside className={"admin-sidebar " + (mobile ? "shown" : "")}>
        <a className="brand" href="/"><img className="brand-full-logo" src="/smilepec-logo.png" alt="SmilePec" /></a>
        <span className="admin-space-label">
          <ShieldCheck size={14} /> ADMINISTRATION GÉNÉRALE
        </span>
        <nav>
          {nav.map(([n, I]) => (
            <button
              className={section === n ? "active" : ""}
              key={n}
              onClick={() => go(n)}
            >
              <I size={19} />
              {n}
              {n === "Vérifications" && !!data?.counts.pending && (
                <span>{data.counts.pending}</span>
              )}
            </button>
          ))}
        </nav>
        <div className="admin-identity">
          <span className="avatar lilac">{account.name[0]}</span>
          <div>
            <strong>{account.name}</strong>
            <small>Administrateur</small>
          </div>
        </div>
        <button className="secondary" onClick={logout}>
          <LogOut size={16} />
          Se déconnecter
        </button>
      </aside>
      <div className="admin-main">
        <header className="admin-topbar">
          <div>
            <span className="admin-status-dot" /> Administration <span>/</span>{" "}
            <strong>{section}</strong>
          </div>
          <a href="/pro" className="text-button">
            Mon espace pro <ArrowRight size={15} />
          </a>
          <a href="/" className="text-button">
            Voir le site <Eye size={15} />
          </a>
          <button
            className="icon-button admin-logout-mobile"
            aria-label="Se déconnecter"
            onClick={logout}
          >
            <LogOut size={17} />
          </button>
          <button
            className="icon-button"
            aria-label="Actualiser"
            onClick={load}
          >
            <RefreshCw size={17} />
          </button>
        </header>
        <main>
          <div className="page-heading">
            <div>
              <div className="eyebrow">PILOTER, ACCOMPAGNER, PROTÉGER</div>
              <h1>{section}</h1>
              <p>
                {section === "Vue d’ensemble"
                  ? "Le pouls de votre plateforme, en un regard."
                  : "Des actions tracées et des informations à jour."}
              </p>
            </div>
            <span className="pill">
              <ShieldCheck size={14} /> Accès administrateur
            </span>
          </div>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <div className="save-notice" role="status">
              <Check size={16} />
              {notice}
              <button
                className="icon-button"
                aria-label="Fermer"
                onClick={() => setNotice("")}
              >
                <X size={15} />
              </button>
            </div>
          )}
          {!data ? (
            <p className="empty">Chargement de l’administration…</p>
          ) : (
            <>
              {section === "Vue d’ensemble" && (
                <>
                  <section className="admin-welcome glass">
                    <div>
                      <span className="pill">VOTRE RÉSEAU, EN TEMPS RÉEL</span>
                      <h2>
                        Une équipe autour
                        <br />
                        de chaque sourire.
                      </h2>
                      <p>
                        Suivez les inscriptions, accompagnez les cabinets
                        <br />
                        et gardez une vue claire sur les rendez-vous.
                      </p>
                      <button
                        className="primary"
                        onClick={() => go("Vérifications")}
                      >
                        Examiner les profils <ArrowRight size={16} />
                      </button>
                    </div>
                    <div className="admin-orbit">
                      <ShieldCheck size={62} />
                      <span>SmilePec</span>
                    </div>
                  </section>
                  <div className="admin-metrics">
                    {[
                      [
                        "Comptes inscrits",
                        data.counts.accounts,
                        "Comptes",
                        Users,
                      ],
                      [
                        "Professionnels",
                        data.counts.professionals,
                        "Comptes",
                        Users,
                      ],
                      [
                        "Profils à vérifier",
                        data.counts.pending,
                        "Vérifications",
                        ShieldCheck,
                      ],
                      [
                        "RDV confirmés",
                        data.counts.confirmed,
                        "Rendez-vous",
                        CalendarDays,
                      ],
                    ].map(([label, value, dest, I]) => {
                      const Icon = I as typeof Users;
                      return (
                        <button
                          className="glass admin-metric"
                          key={String(label)}
                          onClick={() => go(String(dest))}
                        >
                          <Icon size={21} />
                          <span>{String(label)}</span>
                          <strong>{String(value)}</strong>
                          <small>
                            Consulter <ArrowRight size={13} />
                          </small>
                        </button>
                      );
                    })}
                  </div>
                  <div className="admin-overview-grid">
                    <section className="glass panel">
                      <div className="section-title">
                        <h2>Dernières inscriptions</h2>
                        <button
                          className="text-button"
                          onClick={() => go("Comptes")}
                        >
                          Tout voir <ArrowRight size={14} />
                        </button>
                      </div>
                      {accountRows(data.accounts.slice(0, 5))}
                    </section>
                    <section className="glass panel">
                      <h2>À surveiller</h2>
                      <button
                        className="admin-attention"
                        onClick={() => go("Vérifications")}
                      >
                        <ShieldCheck size={20} />
                        <div>
                          <strong>
                            {data.counts.pending} profil(s) à examiner
                          </strong>
                          <small>
                            Vérifier l’identité et les qualifications
                          </small>
                        </div>
                        <ArrowRight size={15} />
                      </button>
                      <button
                        className="admin-attention"
                        onClick={() => {
                          go("Comptes");
                          setFilter("Suspendus");
                        }}
                      >
                        <Users size={20} />
                        <div>
                          <strong>
                            {data.counts.suspended} compte(s) suspendu(s)
                          </strong>
                          <small>Décisions réversibles et historisées</small>
                        </div>
                        <ArrowRight size={15} />
                      </button>
                      <div className="admin-facts">
                        <p>
                          <span>Patients inscrits</span>
                          <b>{data.counts.patients}</b>
                        </p>
                        <p>
                          <span>Profils publiés</span>
                          <b>{data.counts.published}</b>
                        </p>
                        <p>
                          <span>Rendez-vous annulés</span>
                          <b>{data.counts.cancelled}</b>
                        </p>
                      </div>
                    </section>
                  </div>
                </>
              )}
              {["Comptes", "Vérifications"].includes(section) && (
                <>
                  <div className="admin-toolbar">
                    <label className="search-box">
                      <Search size={18} />
                      <input
                        aria-label="Rechercher un compte"
                        placeholder="Nom, e-mail, ville ou identifiant…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Filtrer les comptes"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option>Tous</option>
                      {(section === "Vérifications"
                        ? ["professional", "worker"]
                        : ["patient", "professional", "worker", "admin"]
                      ).map((r) => (
                        <option value={r} key={r}>
                          {roleLabel(r)}
                        </option>
                      ))}
                      <option>Suspendus</option>
                    </select>
                    <button
                      className="secondary"
                      onClick={() =>
                        csv("amelib-comptes", [
                          ["Nom", "E-mail", "Rôle", "Suspendu", "Vérifié"],
                          ...people.map((p) => [
                            p.name,
                            p.email,
                            roleLabel(p.role),
                            p.suspended ? "Oui" : "Non",
                            p.verified ? "Oui" : "Non",
                          ]),
                        ])
                      }
                    >
                      <Download size={15} />
                      Exporter
                    </button>
                  </div>
                  <section className="glass panel">
                    <div className="section-title">
                      <h2>{people.length} compte(s)</h2>
                      <span className="muted">1 000 plus récents maximum</span>
                    </div>
                    {accountRows(people)}
                  </section>
                </>
              )}
              {section === "Rendez-vous" && (
                <>
                  <div className="admin-toolbar">
                    <label className="search-box">
                      <Search size={18} />
                      <input
                        aria-label="Rechercher un rendez-vous"
                        placeholder="Patient ou professionnel…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                    <select
                      aria-label="Statut du rendez-vous"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    >
                      <option>Tous</option>
                      {Object.entries(statuses).map(([v, l]) => (
                        <option value={v} key={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <section className="glass panel">
                    <h2>{appointments.length} rendez-vous</h2>
                    <p className="muted">
                      Vue de coordination. Les messages privés et les motifs de
                      soin ne sont pas affichés ici.
                    </p>
                    {appointments.map((a) => (
                      <article className="admin-appointment" key={a.id}>
                        <span className="stat-icon blue">
                          <CalendarDays size={19} />
                        </span>
                        <div className="grow">
                          <strong>{a.patient_name}</strong>
                          <small>Avec {a.professional_name}</small>
                          <span>
                            {dateFormat(a.starts_at)} · {a.duration} min
                          </span>
                        </div>
                        <span className="badge">{statuses[a.status]}</span>
                      </article>
                    ))}
                    {!appointments.length && (
                      <p className="empty">Aucun rendez-vous correspondant.</p>
                    )}
                  </section>
                </>
              )}
              {section === "Journal d’actions" && (
                <>
                  <label className="search-box glass">
                    <Search size={18} />
                    <input
                      aria-label="Rechercher dans le journal"
                      placeholder="Administrateur, décision, motif…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <section className="glass panel">
                    <h2>Traçabilité des décisions</h2>
                    <p className="muted">
                      300 dernières actions · historique non modifiable depuis
                      l’interface.
                    </p>
                    {audit.map((a) => (
                      <article className="audit-row" key={a.id}>
                        <span className="audit-dot" />
                        <div>
                          <strong>{actions[a.action] || a.action}</strong>
                          <p>{a.detail || "Aucune note complémentaire."}</p>
                          <small>
                            {a.actor_name} · {dateFormat(a.created_at)}
                          </small>
                        </div>
                      </article>
                    ))}
                    {!audit.length && (
                      <p className="empty">Aucune action à afficher.</p>
                    )}
                  </section>
                </>
              )}
              {section === "Paramètres" && settings && (
                <form
                  className="glass panel real-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    save("admin-settings", settings);
                  }}
                >
                  <h2>Informations publiques</h2>
                  <p className="muted">
                    Ces informations sont visibles sur le site et enregistrées
                    dans le journal.
                  </p>
                  <label>
                    Nom de la plateforme
                    <input
                      required
                      maxLength={60}
                      value={settings.name}
                      onChange={(e) =>
                        setSettings({ ...settings, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    E-mail de contact public
                    <input
                      type="email"
                      maxLength={254}
                      value={settings.support_email}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          support_email: e.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    Bandeau d’annonce
                    <textarea
                      rows={3}
                      maxLength={300}
                      value={settings.announcement}
                      onChange={(e) =>
                        setSettings({
                          ...settings,
                          announcement: e.target.value,
                        })
                      }
                    />
                    <small>
                      Laissez vide pour afficher le message d’accueil par
                      défaut.
                    </small>
                  </label>
                  <button className="primary" disabled={busy}>
                    Enregistrer
                  </button>
                  <div className="admin-security-note">
                    <ShieldCheck size={23} />
                    <div>
                      <h3>Accès sensibles</h3>
                      <p>
                        L’attribution d’un rôle administrateur est effectuée
                        séparément. Aucun compte public ne peut s’octroyer ce
                        rôle.
                      </p>
                    </div>
                  </div>
                </form>
              )}
              {section === "Priorités opérationnelles" && <section className="glass panel"><div className="section-title"><div><h2>Priorités de pose et tâches ouvertes</h2><p>Vue de coordination : les données cliniques détaillées restent dans les dossiers cabinet.</p></div><button className="secondary" onClick={()=>downloadWorkbook("smilepec-priorites", {"Poses prévues":data.priorities.map(p=>({Patient:p.patient_name,Cabinet:p.professional_name,"Date de pose":p.prosthesis_date,Statut:p.status})),"Tâches ouvertes":data.tasks.map(t=>({Tâche:t.title,Cabinet:t.professional_name,Assignée:t.assignee,Priorité:t.priority,Échéance:t.due_at||"",Statut:t.stage}))})}><Download size={15}/> Excel</button></div>{data.priorities.map(p=><article className="admin-appointment" key={p.patient_name+p.prosthesis_date}><span className="stat-icon blue"><CalendarDays size={19}/></span><div className="grow"><strong>{p.patient_name}</strong><small>{p.professional_name}</small><span>Pose prévue : {dateFormat(p.prosthesis_date)}</span></div><span className="badge">{p.status}</span></article>)}{data.tasks.map(t=><article className="admin-appointment" key={t.id}><span className="stat-icon blue"><FileCheck size={19}/></span><div className="grow"><strong>{t.title}</strong><small>{t.professional_name} · {t.assignee||"Non attribuée"}</small></div><span className="badge">{t.priority}</span></article>)}</section>}
              {section === "Bilan comptable" && <><div className="admin-metrics">{[["Facturé",data.financials.filter(x=>x.doc_type==='invoice').reduce((s,x)=>s+Number(x.total),0)],["Payé",data.financials.filter(x=>x.status==='paid').reduce((s,x)=>s+Number(x.total),0)],["En attente",data.financials.filter(x=>!['paid','cancelled'].includes(x.status)).reduce((s,x)=>s+Number(x.total),0)]].map(([label,value])=><div className="glass admin-metric" key={String(label)}><span>{label}</span><strong>{Number(value).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</strong></div>)}</div><section className="glass panel"><div className="section-title"><div><h2>Documents de la plateforme</h2><p>Export centralisé des montants et statuts, sans données de soins.</p></div><button className="secondary" onClick={()=>downloadWorkbook("smilepec-bilan-comptable", {Documents:data.financials.map(f=>({Numéro:f.number,Type:f.doc_type,Statut:f.status,Montant:f.total,"Date d’émission":f.issue_date,Patient:f.patient_name,Cabinet:f.professional_name}))})}><Download size={15}/> Excel</button></div>{data.financials.slice(0,100).map(f=><article className="admin-appointment" key={f.id}><span className="stat-icon blue"><FileCheck size={19}/></span><div className="grow"><strong>{f.number} · {Number(f.total).toLocaleString('fr-FR',{style:'currency',currency:'EUR'})}</strong><small>{f.professional_name} · {f.patient_name}</small><span>{dateFormat(f.issue_date)}</span></div><span className="badge">{f.status}</span></article>)}</section></>}
            </>
          )}
          {section==='Cabinets & équipes'&&<AdminCabinets/>}
          {section==='Demandes SmilePec'&&<SupportPanel admin/>}
        </main>
        <nav className="admin-mobile-dock">
          {nav.slice(0, 3).map(([n, I]) => (
            <button
              key={n}
              className={section === n ? "active" : ""}
              onClick={() => go(n)}
            >
              <I size={21} />
              {n === "Vue d’ensemble" ? "Accueil" : n}
            </button>
          ))}
          <button
            className={mobile ? "active" : ""}
            onClick={() => setMobile(!mobile)}
          >
            <Menu size={21} />
            Plus
          </button>
        </nav>
      </div>
      {person && (
        <div className="modal-backdrop" onClick={() => setPerson(null)}>
          <section
            className="modal public-modal admin-person"
            role="dialog"
            aria-modal="true"
            aria-label="Détails du compte"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="close icon-button"
              aria-label="Fermer le compte"
              onClick={() => setPerson(null)}
            >
              <X />
            </button>
            <span className="avatar lilac">{person.name[0]}</span>
            <h2>{person.name}</h2>
            <p>{person.email}</p>
            <div className="detail-block">
              <p>
                {roleLabel(person.role)} ·{" "}
                {person.suspended ? "Suspendu" : "Actif"}
              </p>
              <p>Inscription : {dateFormat(person.created_at)}</p>
              {person.specialty && (
                <p>
                  {person.specialty} · {person.city}
                </p>
              )}
              {person.identifier && <p>Identifiant : {person.identifier}</p>}
              {person.qualifications && <p>{person.qualifications}</p>}
            </div>
            {["professional", "worker"].includes(person.role) && (
              <>
                <button
                  className="primary full"
                  disabled={!person.identifier && !person.verified}
                  onClick={() =>
                    setDecision({
                      action: "admin-verify",
                      title: person.verified
                        ? "Retirer la vérification"
                        : "Confirmer la vérification professionnelle",
                      target: person,
                      values: { verified: !person.verified },
                    })
                  }
                >
                  {person.verified
                    ? "Retirer la vérification"
                    : "Valider après contrôle des justificatifs"}
                </button>
                {person.published && (
                  <>
                    <a
                      className="secondary full"
                      href={"/praticiens/" + person.id}
                    >
                      Voir le profil public
                    </a>
                    <button
                      className="secondary full"
                      onClick={() =>
                        setDecision({
                          action: "admin-unpublish",
                          title: "Retirer le profil de l’annuaire",
                          target: person,
                          values: {},
                        })
                      }
                    >
                      Retirer de l’annuaire
                    </button>
                  </>
                )}
              </>
            )}
            {person.role !== "admin" && (
              <button
                className="secondary full"
                onClick={() =>
                  setDecision({
                    action: "admin-suspend",
                    title: person.suspended
                      ? "Réactiver le compte"
                      : "Suspendre le compte",
                    target: person,
                    values: { suspended: !person.suspended },
                  })
                }
              >
                {person.suspended
                  ? "Réactiver le compte"
                  : "Suspendre le compte"}
              </button>
            )}
            <p className="muted">
              Une suspension ferme les sessions et masque le profil public. Elle
              ne supprime pas les rendez-vous.
            </p>
          </section>
        </div>
      )}
      {decision && (
        <div className="modal-backdrop admin-confirm">
          <section
            className="modal public-modal"
            role="dialog"
            aria-modal="true"
            aria-label={decision.title}
          >
            <button
              className="close icon-button"
              aria-label="Fermer la confirmation"
              onClick={() => setDecision(null)}
              disabled={busy}
            >
              <X />
            </button>
            <h2>{decision.title}</h2>
            <p>Compte concerné : {decision.target.name}</p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                save(decision.action, {
                  id: decision.target.id,
                  ...decision.values,
                  note: f.get("note"),
                });
              }}
            >
              <label>
                Motif / référence du contrôle
                <textarea name="note" required maxLength={500} rows={4} />
              </label>
              {error && <p className="form-error">{error}</p>}
              <button className="primary full" disabled={busy}>
                Confirmer cette décision
              </button>
              <button
                className="secondary full"
                type="button"
                disabled={busy}
                onClick={() => setDecision(null)}
              >
                Revenir sans modifier
              </button>
            </form>
          </section>
        </div>
      )}
    </div>
  );
}
