import React, { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Download,
  ExternalLink,
  FileText,
  Heart,
  Image,
  Kanban,
  Link,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Navigation,
  Paperclip,
  Phone,
  Plus,
  Receipt,
  Search,
  Send,
  Settings,
  Stethoscope,
  Trash2,
  Upload,
  Users,
  Wallet,
  X,
  Menu,
} from "lucide-react";
import {
  api,
  Account,
  Appointment,
  BusinessDocument,
  Dashboard,
  Mission,
  PatientRecord,
  Profile,
  Service,
  WorkTask,
  dateFormat,
  money,
  roleLabel,
} from "./client";
import { usePanel } from "./usePanel";
import DentalChart from "./DentalChart";
import DocumentEditor from './DocumentEditor';
import {downloadSharedDocument} from './documents';
import {downloadPatientPdf, downloadWorkbook} from "./exports";
import TeamPanel from './TeamPanel';
import LiveTracking from './LiveTracking';
import SupportPanel from './SupportPanel';
import NotificationCenter from "./NotificationCenter";

const pages = [
  "Agenda",
  "Patients",
  "Comptabilité",
  "Messages",
  "Courses",
  "Tâches",
  "Mon profil",
  "Équipe",
  "SmilePec",
];
const statusLabels: Record<string, string> = {
  planned: "Planifiée",
  en_route: "En route",
  nearby: "À proximité",
  arrived: "Arrivée",
  completed: "Terminée",
  draft: "Brouillon",
  sent: "Envoyé",
  accepted: "Accepté",
  paid: "Payé",
  cancelled: "Annulé",
};
const initials = (name: string) =>
  name
    .split(" ")
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const localDate = (value?: string) =>
  value ? new Date(value).toISOString().slice(0, 16) : "";
async function fileData(file?: File) {
  if (!file) return "";
  if (file.size > 1300000)
    throw new Error("Choisissez une image de moins de 1,3 Mo.");
  return await new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(new Error("Lecture de l’image impossible."));
    r.readAsDataURL(file);
  });
}
async function fileDataAny(file?: File) {
  if (!file) return "";
  if (file.size > 3000000)
    throw new Error("Choisissez un fichier de moins de 3 Mo.");
  if (
    !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(
      file.type,
    )
  )
    throw new Error("Formats acceptés : PDF, JPG, PNG ou WebP.");
  return await new Promise<string>((ok, no) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => no(new Error("Lecture du fichier impossible."));
    r.readAsDataURL(file);
  });
}
async function downloadDocument(
  doc: BusinessDocument,
  profile: Profile,
  proName: string,
) {
  await downloadSharedDocument(doc.id);
}

function Avatar({
  name,
  src,
  size = "normal",
}: {
  name: string;
  src?: string;
  size?: string;
}) {
  return src ? (
    <img className={`pro-avatar ${size}`} src={src} alt="" />
  ) : (
    <span className={`pro-avatar fallback ${size}`}>{initials(name)}</span>
  );
}
function Modal({
  title,
  close,
  children,
  wide = false,
}: {
  title: string;
  close: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => e.target === e.currentTarget && close()}
    >
      <section className={`modal pro-modal glass ${wide ? "wide" : ""}`}>
        <button
          className="icon-button close"
          onClick={close}
          aria-label="Fermer"
        >
          <X />
        </button>
        <div className="eyebrow">ESPACE PROFESSIONNEL</div>
        <h2>{title}</h2>
        {children}
      </section>
    </div>
  );
}

export default function ProSuite({
  account,
  logout,
}: {
  account: Account;
  logout: () => void;
}) {
  const [editingDocument,setEditingDocument]=useState<BusinessDocument|null>(null);
  const [data, setData] = useState<Dashboard | null>(null),
    [page, setPage] = usePanel("Agenda", pages),
    [menu, setMenu] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(""),
    [patient, setPatient] = useState<PatientRecord | null>(null),
    [conversation, setConversation] = useState<Appointment | null>(null),
    [messages, setMessages] = useState<any[]>([]),
    [draft, setDraft] = useState(""),
    [search, setSearch] = useState(""),
    [documentPatient, setDocumentPatient] = useState<PatientRecord | null>(
      null,
    ),
    [editingTask, setEditingTask] = useState<Partial<WorkTask> | null>(null);
  const [patientTab, setPatientTab] = useState("Synthèse");
  const load = async () => {
    try {
      const next=await api<Dashboard>("dashboard");setData(next);
      setPatient(old=>old?next.patients.find(p=>p.patient_id===old.patient_id)||old:null);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => setMenu(false), [page]);
  useEffect(() => {
    if (!conversation) return;
    const get = () =>
      api("messages&appointment=" + conversation.id)
        .then((r) => setMessages(r.messages))
        .catch((e) => setError(e.message));
    get();
    const timer = setInterval(get, 10000);
    return () => clearInterval(timer);
  }, [conversation?.id]);
  const act = async (action: string, body: any, text: string, close = true) => {
    setBusy(true);
    setError("");
    try {
      await api(action, body);
      await load();
      setNotice(text);
      if (close) setModal("");
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const go = (p: string) => {
    setPage(p);
    setMenu(false);
    setError("");
    window.scrollTo(0, 0);
  };
  const filteredPatients = useMemo(
    () =>
      data?.patients.filter((p) =>
        (p.name + " " + p.email + " " + p.tags)
          .toLowerCase()
          .includes(search.toLowerCase()),
      ) || [],
    [data, search],
  );
  if (!data)
    return (
      <div className="pro-loading">
        Préparation de votre espace professionnel…
      </div>
    );
  const profile = data.profile,
    appointments = data.appointments,
    upcoming = appointments.filter(
      (a) => a.status === "confirmed" && new Date(a.starts_at) > new Date(),
    ),
    activeMissions = data.missions.filter((m) => m.status !== "completed"),
    prosthesisPriorities = data.patients.filter((p) => p.prosthesis_date).sort((a, b) => String(a.prosthesis_date).localeCompare(String(b.prosthesis_date))).slice(0, 8);
  const openChat = (p: PatientRecord) => {
    const ap = appointments.find((a) => a.patient_id === p.patient_id);
    if (ap) {
      setConversation(ap);
      go("Messages");
    }
  };
  const heading = (title: string, copy: string, action?: React.ReactNode) => (
    <div className="page-heading pro-heading">
      <div>
        <div className="eyebrow">PILOTEZ VOTRE ACTIVITÉ</div>
        <h1>{title}</h1>
        <p>{copy}</p>
      </div>
      {action}
    </div>
  );
  const nav = [
    ["Agenda", CalendarDays],
    ["Patients", Users],
    ["Comptabilité", Wallet],
    ["Messages", MessageCircle],
    ["Courses", Navigation],
    ["Tâches", Kanban],
    ["Mon profil", Settings],
    ["Équipe", Users],
    ["SmilePec", Heart],
  ] as const;
  const photoInput = async (
    e: React.ChangeEvent<HTMLInputElement>,
    field: "photo_data" | "logo_data",
  ) => {
    try {
      const value = await fileData(e.target.files?.[0]);
      await act(
        "profile",
        { ...profile, name: account.name, [field]: value },
        field === "photo_data" ? "Photo mise à jour." : "Logo mis à jour.",
      );
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="pro-suite">
      {menu&&<button className="pro-menu-shade" aria-label="Fermer le menu" onClick={()=>setMenu(false)}/>}
      <aside className={`pro-sidebar ${menu ? "open" : ""}`}>
        <a className="brand" href="/"><img className="brand-full-logo" src="/smilepec-logo.png" alt="SmilePec" /></a>
        <div className="pro-identity">
          <Avatar name={account.name} src={profile.photo_data} />
          <div>
            <strong>{account.name}</strong>
            <small>{profile.specialty || roleLabel(account.role)}</small>
          </div>
        </div>
        <nav>
          {nav.map(([n, I]) => (
            <button
              key={n}
              className={page === n ? "active" : ""}
              onClick={() => go(n)}
            >
              <I size={18} />
              {n}
              {n === "Courses" && activeMissions.length > 0 && (
                <b>{activeMissions.length}</b>
              )}
            </button>
          ))}
        </nav>
        <button className="logout" onClick={logout}>
          <LogOut size={17} />
          Déconnexion
        </button>
      </aside>
      <div className="pro-main">
        <header className="pro-topbar">
          <button className="icon-button pro-menu-toggle" aria-label="Tous les outils" aria-expanded={menu} onClick={()=>setMenu(!menu)}><Menu/></button>
          <button className="text-button" onClick={() => go("Agenda")}>
            <ArrowLeft size={15} />
            Aujourd’hui
          </button>
          <div className="pro-top-actions">
            <button
              className="secondary"
              onClick={() => {
                setEditingTask({
                  stage: "À faire",
                  priority: "Normale",
                  checklist: [],
                  attachments: [],
                });
                setModal("task");
              }}
            >
              <Plus size={15} />
              Tâche
            </button>
            <a className="icon-button" href="/" aria-label="Voir le site">
              <ExternalLink size={17} />
            </a>
            <NotificationCenter />
            <button
              className="icon-button"
              onClick={logout}
              aria-label="Déconnexion"
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        <main>
          <nav className="pro-shortcuts" aria-label="Outils du cabinet"><button onClick={()=>go('Équipe')}><Users size={16}/>Équipe & rôles</button><button onClick={()=>go('Mon profil')}><Settings size={16}/>Cabinet & horaires</button><button onClick={()=>go('Tâches')}><Kanban size={16}/>Tâches</button><button onClick={()=>go('SmilePec')}><Heart size={16}/>SmilePec</button>{account.role==='admin'&&<a href="/admin">Administration</a>}</nav>
          {error && <p className="form-error">{error}</p>}
          {notice && (
            <div className="save-notice">
              <Check size={15} />
              {notice}
              <button className="icon-button" onClick={() => setNotice("")}>
                <X size={14} />
              </button>
            </div>
          )}

          {page === "Agenda" && (
            <>
              {heading(
                "Votre agenda.",
                "Les demandes, les rendez-vous et les actions utiles réunis dans une seule journée.",
                <button className="primary" onClick={() => setModal("slot")}>
                  <Plus size={16} />
                  Nouveau créneau
                </button>,
              )}
              <div className="pro-kpis">
                {[
                  ["À venir", upcoming.length, CalendarDays],
                  ["Patients", data.patients.length, Users],
                  [
                    "À encaisser",
                    money(
                      data.ledger
                        .filter((x) => x.kind === "income" && !x.paid)
                        .reduce((s, x) => s + Number(x.amount), 0),
                    ),
                    Receipt,
                  ],
                  [
                    "Tâches ouvertes",
                    data.tasks.filter((t) => t.stage !== "Terminé").length,
                    CheckCircle2,
                  ],
                ].map(([l, v, I]: any) => (
                  <div className="glass pro-kpi" key={l}>
                    <I />
                    <span>{l}</span>
                    <strong>{v}</strong>
                  </div>
                ))}
              </div>
              <section className="glass panel priority-planner">
                <div className="section-title"><div><h2>Mes priorités de pose</h2><p>Les dates renseignées dans les fiches patient, dans l’ordre d’échéance.</p></div><button className="text-button" onClick={()=>go("Patients")}>Voir les dossiers</button></div>
                {prosthesisPriorities.length ? prosthesisPriorities.map((p) => {
                  const days = Math.ceil((new Date(String(p.prosthesis_date)).getTime() - Date.now()) / 86400000);
                  return <button className="priority-patient" key={p.patient_id} onClick={()=>{setPatient(p);setPatientTab("Synthèse");setModal("patient")}}><Avatar name={p.name}/><div><strong>{p.name}</strong><small>Pose prévue le {new Date(String(p.prosthesis_date)).toLocaleDateString("fr-FR")}</small></div><span className={days < 0 ? "late" : days <= 7 ? "soon" : ""}>{days < 0 ? "En retard" : days === 0 ? "Aujourd’hui" : `J-${days}`}</span></button>;
                }) : <p className="empty">Aucune pose de prothèse programmée. Ajoutez une date dans une fiche patient.</p>}
              </section>
              <section className="glass pro-day">
                <div className="section-title">
                  <div>
                    <h2>Prochains rendez-vous</h2>
                    <p>
                      {new Date().toLocaleDateString("fr-FR", {
                        weekday: "long",
                        day: "numeric",
                        month: "long",
                      })}
                    </p>
                  </div>
                  {profile.booking_url && (
                    <a
                      className="secondary"
                      href={profile.booking_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Link size={15} />
                      {profile.calendar_provider || "Agenda connecté"}
                    </a>
                  )}
                </div>
                {upcoming.length ? (
                  upcoming.slice(0, 8).map((a) => (
                    <article className="pro-appointment" key={a.id}>
                      <div className="pro-time">
                        {new Date(a.starts_at).toLocaleTimeString("fr-FR", {
                          timeZone: "Europe/Paris",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                      <Avatar name={a.patient_name} />
                      <div className="grow">
                        <strong>{a.patient_name}</strong>
                        <span>
                          {a.reason} · {a.duration} min
                        </span>
                      </div>
                      <button
                        className="icon-button"
                        aria-label="Message"
                        onClick={() => {
                          setConversation(a);
                          go("Messages");
                        }}
                      >
                        <MessageCircle size={17} />
                      </button>
                      <button
                        className="secondary"
                        onClick={() => {
                          const p = data.patients.find(
                            (x) => x.patient_id === a.patient_id,
                          );
                          if (p) {
                            setDocumentPatient(p);
                            setModal("document");
                          }
                        }}
                      >
                        Envoyer un devis
                      </button>
                    </article>
                  ))
                ) : (
                  <p className="empty">Aucun rendez-vous à venir.</p>
                )}
              </section>
              <div className="pro-home-grid">
                <section className="glass panel">
                  <div className="section-title">
                    <h2>À faire maintenant</h2>
                    <button
                      className="text-button"
                      onClick={() => go("Tâches")}
                    >
                      Tout voir
                    </button>
                  </div>
                  {data.tasks
                    .filter((t) => t.stage !== "Terminé")
                    .slice(0, 4)
                    .map((t) => (
                      <button
                        className="mini-task"
                        key={t.id}
                        onClick={() => {
                          setEditingTask(t);
                          setModal("task");
                        }}
                      >
                        <span
                          className={`priority ${t.priority.toLowerCase()}`}
                        />
                        <div>
                          <strong>{t.title}</strong>
                          <small>
                            {t.assignee || "Non assignée"}
                            {t.due_at
                              ? " · " +
                                new Date(t.due_at).toLocaleDateString("fr-FR")
                              : ""}
                          </small>
                        </div>
                        <ChevronRight />
                      </button>
                    ))}
                </section>
                <section className="glass panel">
                  <div className="section-title">
                    <h2>Courses en cours</h2>
                    <button
                      className="text-button"
                      onClick={() => go("Courses")}
                    >
                      Suivre
                    </button>
                  </div>
                  {activeMissions.slice(0, 3).map((m) => (
                    <div className="mini-mission" key={m.id}>
                      <Avatar name={m.assignee} src={m.photo_data} />
                      <div>
                        <strong>{m.assignee}</strong>
                        <small>
                          {statusLabels[m.status]} ·{" "}
                          {m.eta ? m.eta + " min" : "heure à confirmer"}
                        </small>
                      </div>
                      <span className="live-dot" />
                    </div>
                  ))}
                  {!activeMissions.length && (
                    <p className="empty">Aucune course active.</p>
                  )}
                </section>
              </div>
            </>
          )}

          {page === "Patients" && (
            <>
              {heading(
                "Patients.",
                "Une fiche claire pour retrouver le suivi, les notes, les rendez-vous, les documents et les prochaines actions.",
                <><button className="secondary" onClick={()=>downloadWorkbook("smilepec-patients", {Patients:data.patients.map(p=>({Nom:p.name,Email:p.email,Téléphone:p.phone,"Pose de prothèse":p.prosthesis_date||"",Mutuelle:p.mutual_provider,Statut:p.record_status,"Rendez-vous":p.appointment_count}))})}><Download size={16}/> Excel</button><button className="primary" onClick={() => setModal("patient-info")}><Plus size={16} />Nouvelle fiche</button></>,
              )}
              <div className="pro-search">
                <Search />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Rechercher un patient, un tag, un e-mail…"
                />
              </div>
              <div className="patient-grid">
                {filteredPatients.map((p) => (
                  <article className="glass patient-crm" key={p.patient_id}>
                    <div className="patient-crm-head">
                      <Avatar name={p.name} />
                      <span
                        className={`badge ${p.insurance_card_data && p.billing_document_data ? "" : "warning"}`}
                      >
                        {p.insurance_card_data && p.billing_document_data
                          ? p.record_status
                          : "Pièces requises"}
                      </span>
                    </div>
                    <h2>{p.name}</h2>
                    <p>{p.email}</p>
                    <div className="patient-tags">
                      {p.tags
                        .split(",")
                        .filter(Boolean)
                        .map((t) => (
                          <span key={t}>{t.trim()}</span>
                        ))}
                    </div>
                    <div className="patient-facts">
                      <span>
                        <CalendarDays /> {p.appointment_count} rendez-vous
                      </span>
                      <span>
                        <ClipboardList />{" "}
                        {p.notes ? "Notes à jour" : "Fiche à compléter"}
                      </span>
                    </div>
                    <div className="patient-actions">
                      <button
                        className="secondary"
                        onClick={() => {
                          setPatient(p);
                          setPatientTab("Synthèse");
                          setModal("patient");
                        }}
                      >
                        Ouvrir la fiche
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => openChat(p)}
                        aria-label="Message"
                      >
                        <MessageCircle />
                      </button>
                      <button
                        className="icon-button"
                        onClick={() => {
                          setDocumentPatient(p);
                          setModal("document");
                        }}
                        aria-label="Créer un devis"
                      >
                        <FileText />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {!filteredPatients.length && (
                <p className="empty">
                  Les patients apparaissent dès leur première demande de
                  rendez-vous.
                </p>
              )}
            </>
          )}

          {page === "Comptabilité" && (
            <>
              {heading(
                "Comptabilité.",
                "Catalogue détaillé, devis, factures et règlements : chaque montant reste relié au bon patient.",
                <><button className="secondary" onClick={()=>downloadWorkbook("smilepec-cabinet", {Patients:data.patients.map(p=>({Nom:p.name,Email:p.email,"Pose de prothèse":p.prosthesis_date||"",Mutuelle:p.mutual_provider})),Documents:data.documents.map(d=>({Numéro:d.number,Type:d.doc_type,Patient:d.patient_name,Total:d.total,Statut:d.status,"Émis le":d.issue_date})),Tâches:data.tasks.map(t=>({Titre:t.title,Statut:t.stage,Priorité:t.priority,Assignée:t.assignee,Échéance:t.due_at||""})),"Rendez-vous":appointments.map(a=>({Patient:a.patient_name,Date:a.starts_at,Durée:a.duration,Statut:a.status}))})}><Download size={16}/> Export Excel</button><button className="primary" disabled={!data.patients.length} onClick={() => {setDocumentPatient(data.patients[0]);setModal("document");}}><Plus />Créer un document</button></>,
              )}
              <div className="pro-kpis finance">
                {[
                  [
                    "Facturé",
                    data.documents
                      .filter((d) => d.doc_type === "invoice")
                      .reduce((s, d) => s + Number(d.total), 0),
                  ],
                  [
                    "À encaisser",
                    data.documents
                      .filter(
                        (d) =>
                          d.doc_type === "invoice" &&
                          !["paid", "cancelled"].includes(d.status),
                      )
                      .reduce((s, d) => s + Number(d.total), 0),
                  ],
                  [
                    "Devis envoyés",
                    data.documents
                      .filter(
                        (d) => d.doc_type === "quote" && d.status === "sent",
                      )
                      .reduce((s, d) => s + Number(d.total), 0),
                  ],
                ].map(([l, v]) => (
                  <div className="glass pro-kpi" key={String(l)}>
                    <span>{l}</span>
                    <strong>{money(Number(v))}</strong>
                  </div>
                ))}
              </div>
              <div className="pro-finance-grid">
                <section className="glass panel">
                  <div className="section-title">
                    <div>
                      <h2>Prestations & tarifs</h2>
                      <p>Prix, durée, TVA et description modifiables.</p>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => setModal("service")}
                    >
                      <Plus />
                      Ajouter
                    </button>
                  </div>
                  {data.services.map((s) => (
                    <div className="service-row" key={s.id}>
                      <div>
                        <strong>{s.name}</strong>
                        <small>
                          {s.duration} min · TVA {Number(s.vat)}% ·{" "}
                          {s.description || "Sans description"}
                        </small>
                      </div>
                      <b>{money(Number(s.price))}</b>
                      <button
                        className="icon-button"
                        onClick={() => {
                          setModal("service:" + s.id);
                        }}
                      >
                        <Settings />
                      </button>
                    </div>
                  ))}
                  {!data.services.length && (
                    <p className="empty">
                      Créez votre catalogue pour remplir les devis en quelques
                      secondes.
                    </p>
                  )}
                </section>
                <section className="glass panel documents-list">
                  <div className="section-title">
                    <h2>Devis & factures</h2>
                    <span>{data.documents.length} documents</span>
                  </div>
                  {data.documents.map((d) => (
                    <article key={d.id}>
                      <span className={`doc-icon ${d.doc_type}`}>
                        <FileText />
                      </span>
                      <div className="grow">
                        <strong>{d.number}</strong>
                        <small>
                          {d.patient_name} · {statusLabels[d.status]}
                        </small>
                      </div>
                      <b>{money(Number(d.total))}</b>
                      <button className="secondary" onClick={()=>{setEditingDocument(d);setModal("edit-document")}}>Modifier</button>
                      <select
                        value={d.status}
                        aria-label="Statut"
                        onChange={(e) =>
                          act(
                            "document-update",
                            { ...d, status: e.target.value },
                            "Statut du document mis à jour.",
                            false,
                          )
                        }
                      >
                        <option value="draft">Brouillon</option>
                        <option value="sent">Envoyé</option>
                        <option value="accepted">Accepté</option>
                        <option value="paid">Payé</option>
                        <option value="cancelled">Annulé</option>
                      </select>
                      <button
                        className="icon-button"
                        onClick={() =>
                          downloadDocument(d, profile, account.name)
                        }
                        aria-label="PDF"
                      >
                        <Download />
                      </button>
                      <a
                        className="icon-button"
                        href={`mailto:${d.patient_email}?subject=${encodeURIComponent(`${d.doc_type === "quote" ? "Devis" : "Facture"} ${d.number}`)}&body=${encodeURIComponent(`Bonjour ${d.patient_name},\n\nVotre ${d.doc_type === "quote" ? "devis" : "facture"} ${d.number} d’un montant de ${money(Number(d.total))} est disponible dans votre messagerie SmilePec.${d.payment_url ? `\n\nLien de paiement Qonto : ${d.payment_url}` : ""}\n\nBien cordialement,\n${account.name}`)}`}
                        aria-label="Préparer la copie par e-mail"
                      >
                        <Mail />
                      </a>
                      {d.status === "draft" && (
                        <button
                          className="secondary"
                          onClick={() =>
                            act(
                              "document-send",
                              { id: d.id },
                              "Document envoyé dans la messagerie.",
                            )
                          }
                        >
                          Envoyer
                        </button>
                      )}
                    </article>
                  ))}
                </section>
              </div>
            </>
          )}

          {page === "Messages" && (
            <>
              {heading(
                "Messagerie.",
                "Chaque demande de rendez-vous ouvre une conversation. Les devis et factures restent dans le fil.",
              )}
              <div className="pro-messenger glass">
                <aside>
                  <div className="pro-search">
                    <Search />
                    <input placeholder="Rechercher…" />
                  </div>
                  {appointments.map((a) => (
                    <button
                      className={conversation?.id === a.id ? "active" : ""}
                      key={a.id}
                      onClick={() => setConversation(a)}
                    >
                      <Avatar name={a.patient_name} />
                      <div>
                        <strong>{a.patient_name}</strong>
                        <small>{a.reason}</small>
                      </div>
                    </button>
                  ))}
                </aside>
                <section>
                  {conversation ? (
                    <>
                      <header>
                        <Avatar name={conversation.patient_name} />
                        <div className="grow">
                          <strong>{conversation.patient_name}</strong>
                          <small>{conversation.reason}</small>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => {
                            setDocumentPatient(
                              data.patients.find(
                                (p) => p.patient_id === conversation.patient_id,
                              ) || null,
                            );
                            setModal("document");
                          }}
                        >
                          <FileText />
                          Envoyer un devis
                        </button>
                      </header>
                      <div className="chat-messages">
                        {messages.map((m) => (
                          <div
                            className={`bubble ${m.sender_id === account.id ? "mine" : ""}`}
                            key={m.id}
                          >
                            {m.body}
                            {m.document_id && (
                              <button
                                className="message-document"
                                onClick={() => {
                                  const d = data.documents.find(
                                    (x) => x.id === m.document_id,
                                  );
                                  if (d)
                                    downloadDocument(d, profile, account.name);
                                }}
                              >
                                <FileText />
                                <span>
                                  {m.number}
                                  <small>{money(Number(m.total))} · PDF</small>
                                </span>
                                <Download />
                              </button>
                            )}
                            <small>
                              {m.name} · {dateFormat(m.created_at)}
                            </small>
                          </div>
                        ))}
                      </div>
                      <form
                        className="chat-input"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          if (!draft.trim()) return;
                          await api("message-send", {
                            appointment_id: conversation.id,
                            body: draft,
                          });
                          setDraft("");
                          setMessages(
                            (
                              await api(
                                "messages&appointment=" + conversation.id,
                              )
                            ).messages,
                          );
                        }}
                      >
                        <button type="button" className="icon-button">
                          <Paperclip />
                        </button>
                        <input
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          placeholder="Écrire un message…"
                        />
                        <button className="primary">
                          <Send />
                        </button>
                      </form>
                    </>
                  ) : (
                    <div className="empty-message">
                      <MessageCircle />
                      <h2>Choisissez une conversation</h2>
                      <p>
                        Les échanges et documents du patient apparaîtront ici.
                      </p>
                    </div>
                  )}
                </section>
              </div>
            </>
          )}

          {page === "Courses" && (
            <>
              {heading(
                "Courses en cours.",
                "Planifiez une visite, suivez son statut et partagez une heure d’arrivée claire.",
                <button className="primary" onClick={() => setModal("mission")}>
                  <Plus />
                  Nouvelle course
                </button>,
              )}
              <div className="mission-layout">
                <LiveTracking missions={data.missions}/>
                <section className="glass mission-map" hidden>
                  <div className="fake-map">
                    <div className="map-road one" />
                    <div className="map-road two" />
                    {activeMissions.slice(0, 4).map((m, i) => (
                      <div className={`map-person p${i}`} key={m.id}>
                        <Avatar name={m.assignee} src={m.photo_data} />
                        <span>
                          {m.eta ? m.eta + " min" : statusLabels[m.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="map-note">
                    <Navigation />
                    <span>Position illustrative</span>
                    <small>
                      Le branchement GPS temps réel nécessite le consentement de
                      l’intervenant.
                    </small>
                  </div>
                </section>
                <section className="mission-list">
                  {data.missions.map((m) => (
                    <article className="glass" key={m.id}>
                      <Avatar
                        name={m.assignee}
                        src={m.photo_data}
                        size="large"
                      />
                      <div className="grow">
                        <span className="feature-state">
                          {statusLabels[m.status]}
                        </span>
                        <h2>{m.title}</h2>
                        <p>
                          {m.assignee} · {m.address}
                        </p>
                        <strong>
                          {m.eta
                            ? `Arrivée estimée dans ${m.eta} min`
                            : "Horaire à confirmer"}
                        </strong>
                      </div>
                      <select
                        value={m.status}
                        onChange={(e) =>
                          act(
                            "mission-status",
                            { id: m.id, status: e.target.value, eta: m.eta },
                            "Statut de la course actualisé.",
                          )
                        }
                      >
                        <option value="planned">Planifiée</option>
                        <option value="en_route">En route</option>
                        <option value="nearby">À proximité</option>
                        <option value="arrived">Arrivée</option>
                        <option value="completed">Terminée</option>
                      </select>
                    </article>
                  ))}
                </section>
              </div>
            </>
          )}

          {page === "Tâches" && (
            <>
              {heading(
                "Organisation d’équipe.",
                "Un tableau vivant pour assigner, documenter et terminer chaque action.",
                <button
                  className="primary"
                  onClick={() => {
                    setEditingTask({
                      stage: "À faire",
                      priority: "Normale",
                      checklist: [],
                      attachments: [],
                    });
                    setModal("task");
                  }}
                >
                  <Plus />
                  Nouvelle tâche
                </button>,
              )}
              <div className="kanban-board">
                {["À faire", "En cours", "En attente", "Terminé"].map(
                  (stage) => (
                    <section key={stage}>
                      <header>
                        <h2>{stage}</h2>
                        <span>
                          {data.tasks.filter((t) => t.stage === stage).length}
                        </span>
                      </header>
                      {data.tasks
                        .filter((t) => t.stage === stage)
                        .map((t) => (
                          <article
                            className="glass task-card"
                            key={t.id}
                            onClick={() => {
                              setEditingTask(t);
                              setModal("task");
                            }}
                          >
                            <span
                              className={`task-priority ${t.priority.toLowerCase()}`}
                            >
                              {t.priority}
                            </span>
                            <h3>{t.title}</h3>
                            <p>{t.description}</p>
                            {t.patient_name && (
                              <small>
                                <Users /> {t.patient_name}
                              </small>
                            )}
                            <div className="task-meta">
                              <span>
                                {t.checklist.filter((x) => x.done).length}/
                                {t.checklist.length}
                                <CheckCircle2 />
                              </span>
                              {t.attachments.length > 0 && (
                                <span>
                                  {t.attachments.length}
                                  <Paperclip />
                                </span>
                              )}
                              <Avatar name={t.assignee || account.name} />
                            </div>
                          </article>
                        ))}
                    </section>
                  ),
                )}
              </div>
            </>
          )}

          {page === 'Équipe' && <TeamPanel/>}
          {page === 'SmilePec' && <SupportPanel/>}
          {page === "Mon profil" && (
            <>
              {heading(
                "Votre présence SmilePec.",
                "Votre image, votre présentation, vos contacts et votre agenda public au même endroit.",
              )}
              <div className="profile-studio">
                <section className="glass panel profile-visual">
                  <div className="cover-preview">
                    <span>
                      {profile.headline ||
                        "Le soin commence par une rencontre."}
                    </span>
                  </div>
                  <div className="profile-photo-row">
                    <label className="upload-avatar">
                      <Avatar
                        name={account.name}
                        src={profile.photo_data}
                        size="xlarge"
                      />
                      <span>
                        <Upload />
                        Changer la photo
                      </span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => photoInput(e, "photo_data")}
                      />
                    </label>
                    <label className="upload-logo">
                      {profile.logo_data ? (
                        <img src={profile.logo_data} alt="Logo" />
                      ) : (
                        <Image />
                      )}
                      <span>Logo du cabinet</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => photoInput(e, "logo_data")}
                      />
                    </label>
                  </div>
                  <h2>{account.name}</h2>
                  <p>{profile.specialty}</p>
                </section>
                <form
                  className="glass panel profile-editor"
                  onSubmit={(e) => {
                    e.preventDefault();
                    act(
                      "profile",
                      { ...profile, name: account.name },
                      "Profil professionnel enregistré.",
                    );
                  }}
                >
                  <h2>Identité & présentation</h2>
                  <div className="form-grid">
                    <label>
                      Nom du cabinet
                      <input
                        value={profile.clinic_name || ""}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: {
                              ...profile,
                              clinic_name: e.target.value,
                            },
                          })
                        }
                        placeholder="Cabinet dentaire…"
                      />
                    </label>
                    <label>
                      Accroche
                      <input
                        value={profile.headline}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: { ...profile, headline: e.target.value },
                          })
                        }
                        maxLength={180}
                      />
                    </label>
                    <label>
                      Spécialité
                      <input
                        value={profile.specialty}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: { ...profile, specialty: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      Téléphone
                      <input
                        value={profile.phone}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: { ...profile, phone: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      E-mail de contact
                      <input
                        type="email"
                        value={profile.contact_email}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: {
                              ...profile,
                              contact_email: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                    <label>
                      Site internet
                      <input
                        type="url"
                        value={profile.website}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: { ...profile, website: e.target.value },
                          })
                        }
                        placeholder="https://…"
                      />
                    </label>
                    <label>
                      Identifiant RPPS / SIRET
                      <input
                        value={profile.identifier}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: { ...profile, identifier: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      Ville
                      <input
                        value={profile.city}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: { ...profile, city: e.target.value },
                          })
                        }
                      />
                    </label>
                    <label>
                      Adresse
                      <input
                        value={profile.address}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: { ...profile, address: e.target.value },
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Présentation
                    <textarea
                      rows={5}
                      value={profile.bio}
                      onChange={(e) =>
                        setData({
                          ...data,
                          profile: { ...profile, bio: e.target.value },
                        })
                      }
                    />
                  </label>
                  <label>
                    Formations & qualifications
                    <textarea
                      rows={3}
                      value={profile.qualifications}
                      onChange={(e) =>
                        setData({
                          ...data,
                          profile: {
                            ...profile,
                            qualifications: e.target.value,
                          },
                        })
                      }
                    />
                  </label>
                  <h2>Agenda connecté</h2>
                  <div className="form-grid">
                    <label>
                      Service
                      <select
                        value={profile.calendar_provider}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: {
                              ...profile,
                              calendar_provider: e.target.value,
                            },
                          })
                        }
                      >
                        <option value="">Agenda SmilePec</option>
                        <option>Calendly</option>
                        <option>Cal.com</option>
                        <option>Google Calendar</option>
                        <option>Outlook</option>
                        <option>Doctolib</option>
                      </select>
                    </label>
                    <label>
                      Lien public de réservation
                      <input
                        type="url"
                        value={profile.booking_url}
                        onChange={(e) =>
                          setData({
                            ...data,
                            profile: {
                              ...profile,
                              booking_url: e.target.value,
                            },
                          })
                        }
                        placeholder="https://calendly.com/…"
                      />
                    </label>
                  </div>
                  <h2>Horaires habituels</h2>
                  <div className="hours-editor">
                    {[
                      "Lundi",
                      "Mardi",
                      "Mercredi",
                      "Jeudi",
                      "Vendredi",
                      "Samedi",
                    ].map((day) => {
                      const h = profile.weekly_hours?.[day] || {
                        enabled: !["Samedi"].includes(day),
                        start: "09:00",
                        end: "18:00",
                      };
                      return (
                        <div key={day}>
                          <label className="checkbox">
                            <input
                              type="checkbox"
                              checked={h.enabled}
                              onChange={(e) =>
                                setData({
                                  ...data,
                                  profile: {
                                    ...profile,
                                    weekly_hours: {
                                      ...(profile.weekly_hours || {}),
                                      [day]: {
                                        ...h,
                                        enabled: e.target.checked,
                                      },
                                    },
                                  },
                                })
                              }
                            />
                            {day}
                          </label>
                          <input
                            type="time"
                            value={h.start}
                            disabled={!h.enabled}
                            onChange={(e) =>
                              setData({
                                ...data,
                                profile: {
                                  ...profile,
                                  weekly_hours: {
                                    ...(profile.weekly_hours || {}),
                                    [day]: { ...h, start: e.target.value },
                                  },
                                },
                              })
                            }
                          />
                          <span>à</span>
                          <input
                            type="time"
                            value={h.end}
                            disabled={!h.enabled}
                            onChange={(e) =>
                              setData({
                                ...data,
                                profile: {
                                  ...profile,
                                  weekly_hours: {
                                    ...(profile.weekly_hours || {}),
                                    [day]: { ...h, end: e.target.value },
                                  },
                                },
                              })
                            }
                          />
                        </div>
                      );
                    })}
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={profile.published}
                      onChange={(e) =>
                        setData({
                          ...data,
                          profile: { ...profile, published: e.target.checked },
                        })
                      }
                    />
                    Afficher mon profil dans l’annuaire
                  </label>
                  <button className="primary" disabled={busy}>
                    Enregistrer et prévisualiser
                  </button>
                </form>
              </div>
              <section className="glass panel team-panel" hidden>
                <div className="section-title">
                  <div>
                    <h2>Équipe & droits d’accès</h2>
                    <p>
                      Les assistants voient uniquement les éléments que vous
                      leur attribuez.
                    </p>
                  </div>
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    act(
                      "clinic-member-add",
                      {
                        email: f.get("email"),
                        job_title: f.get("job_title"),
                        permissions: f.getAll("permissions"),
                      },
                      "Membre ajouté au cabinet.",
                      false,
                    );
                  }}
                >
                  <div className="form-grid">
                    <label>
                      E-mail du membre
                      <input name="email" type="email" required />
                    </label>
                    <label>
                      Fonction
                      <select name="job_title">
                        <option>Dentiste associé</option>
                        <option>Assistant médical</option>
                        <option>Secrétaire</option>
                        <option>Gestionnaire tiers payant</option>
                      </select>
                    </label>
                  </div>
                  <div className="permission-grid">
                    {[
                      ["agenda", "Agenda"],
                      ["patients_admin", "Coordonnées patient"],
                      ["clinical", "Dossier clinique"],
                      ["billing", "Facturation"],
                      ["messages", "Messagerie"],
                      ["tasks", "Tâches"],
                    ].map(([v, l]) => (
                      <label className="checkbox" key={v}>
                        <input type="checkbox" name="permissions" value={v} />
                        {l}
                      </label>
                    ))}
                  </div>
                  <button className="secondary">
                    <Plus /> Ajouter à l’équipe
                  </button>
                </form>
                <div className="member-list">
                  {(data.members || []).map((m) => (
                    <article key={m.id}>
                      <Avatar name={m.name} />
                      <div>
                        <strong>{m.name}</strong>
                        <small>
                          {m.job_title} · {m.permissions.join(", ")}
                        </small>
                      </div>
                      <span className="badge">Actif</span>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
        <nav className="pro-dock" aria-label="Navigation professionnelle">
          {[
            ["Agenda", CalendarDays],
            ["Patients", Users],
            ["Comptabilité", Wallet],
            ["Messages", MessageCircle],
            ["Courses", Navigation],
          ].map(([n, I]: any) => (
            <button
              key={n}
              className={page === n ? "active" : ""}
              onClick={() => go(n)}
            >
              <I />
              {n === "Comptabilité" ? "Compta" : n}
              {n === "Courses" && activeMissions.length > 0 && (
                <b>{activeMissions.length}</b>
              )}
            </button>
          ))}
        </nav>
      </div>

      {modal === "edit-document" && editingDocument && <Modal title="Modifier le document" close={()=>setModal("")}><DocumentEditor doc={editingDocument} onSaved={()=>{setModal("");load()}}/></Modal>}
      {modal === "slot" && (
        <Modal title="Ouvrir un créneau" close={() => setModal("")}>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const f = new FormData(e.currentTarget);
              const ok = await act(
                "slot-create",
                {
                  starts_at: new Date(String(f.get("date"))).toISOString(),
                  duration: Number(f.get("duration")),
                },
                "Créneau publié.",
              );
              if (ok) e.currentTarget.reset();
            }}
          >
            <label>
              Date et heure
              <input name="date" type="datetime-local" required />
            </label>
            <label>
              Durée
              <select name="duration">
                <option value="30">30 minutes</option>
                <option value="45">45 minutes</option>
                <option value="60">1 heure</option>
                <option value="90">1 h 30</option>
              </select>
            </label>
            <button className="primary full">Publier</button>
          </form>
        </Modal>
      )}
      {modal === "patient" && patient && (
        <Modal title={patient.name} close={() => setModal("")} wide>
          <div className="patient-sheet-head">
            <Avatar name={patient.name} size="large" />
            <div>
              <strong>{patient.email}</strong>
              <small>
                {patient.appointment_count} rendez-vous · Dernier contact{" "}
                {patient.last_appointment
                  ? dateFormat(patient.last_appointment)
                  : "—"}
              </small>
            </div>
            <button className="secondary" onClick={() => openChat(patient)}>
              <MessageCircle />
              Conversation
            </button>
            <button className="secondary" onClick={() => downloadPatientPdf(patient, profile, account.name)}><Download /> Fiche PDF</button>
            <button
              className="primary"
              onClick={() => {
                setDocumentPatient(patient);
                setModal("document");
              }}
            >
              <FileText />
              Devis
            </button>
          </div>
          <div className="patient-tabs">
            {["Synthèse", "Dentaire", "Rendez-vous", "Documents"].map((t) => (
              <button
                type="button"
                key={t}
                className={patientTab === t ? "active" : ""}
                onClick={() => setPatientTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          {patientTab === "Synthèse" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const f = new FormData(e.currentTarget);
                Promise.all([
                  fileDataAny(
                    (f.get("insurance_card") as File)?.size
                      ? (f.get("insurance_card") as File)
                      : undefined,
                  ),
                  fileDataAny(
                    (f.get("billing_document") as File)?.size
                      ? (f.get("billing_document") as File)
                      : undefined,
                  ),
                ])
                  .then(([insurance, billing]) =>
                    act(
                      "patient-record-save",
                      {
                        patient_id: patient.patient_id,
                        status: f.get("status"),
                        phone: f.get("phone"),
                        email: f.get("email"),
                        tags: f.get("tags"),
                        notes: f.get("notes"),
                        birth_date: f.get("birth_date"),
                        prosthesis_date: f.get("prosthesis_date"),
                        address: f.get("address"),
                        social_security_number: f.get("social_security_number"),
                        mutual_provider: f.get("mutual_provider"),
                        mutual_member_number: f.get("mutual_member_number"),
                        medical_alerts: f.get("medical_alerts"),
                        allergies: f.get("allergies"),
                        medications: f.get("medications"),
                        dental_chart: patient.dental_chart || {},
                        insurance_card_data: insurance,
                        insurance_card_name: insurance
                          ? (f.get("insurance_card") as File).name
                          : patient.insurance_card_name,
                        billing_document_data: billing,
                        billing_document_name: billing
                          ? (f.get("billing_document") as File).name
                          : patient.billing_document_name,
                      },
                      "Fiche dentaire enregistrée.",
                      false,
                    ),
                  )
                  .catch((e) => setError(e.message));
              }}
            >
              <div className="form-grid">
                <label>
                  Statut
                  <select name="status" defaultValue={patient.record_status}>
                    <option>prospect</option>
                    <option>actif</option>
                    <option>suivi</option>
                    <option>inactif</option>
                  </select>
                </label>
                <label>
                  Téléphone
                  <input name="phone" defaultValue={patient.phone} />
                </label>
                <label>
                  E-mail de suivi
                  <input
                    name="email"
                    type="email"
                    defaultValue={patient.email}
                  />
                </label>
                <label>
                  Tags
                  <input
                    name="tags"
                    defaultValue={patient.tags}
                    placeholder="Orthodontie, devis envoyé…"
                  />
                </label>
                <label>
                  Date de naissance
                  <input
                    name="birth_date"
                    type="date"
                    defaultValue={patient.birth_date?.slice(0, 10)}
                  />
                </label>
                <label>
                  Adresse
                  <input name="address" defaultValue={patient.address} />
                </label>
                <label>
                  N° de sécurité sociale
                  <input
                    name="social_security_number"
                    defaultValue={patient.social_security_number}
                    inputMode="numeric"
                  />
                </label>
                <label>
                  Mutuelle / complémentaire
                  <input
                    name="mutual_provider"
                    defaultValue={patient.mutual_provider}
                    required
                  />
                </label>
                <label>
                  N° adhérent mutuelle
                  <input
                    name="mutual_member_number"
                    defaultValue={patient.mutual_member_number}
                    required
                  />
                </label>
                <label>
                  Pose de prothèse prévue
                  <input name="prosthesis_date" type="date" defaultValue={patient.prosthesis_date?.slice(0, 10)} />
                </label>
              </div>
              <div className="required-documents">
                <label>
                  <strong>Carte de mutuelle *</strong>
                  <input
                    name="insurance_card"
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                  />
                  {patient.insurance_card_name && (
                    <small>
                      <FileText /> {patient.insurance_card_name}
                    </small>
                  )}
                </label>
                <label>
                  <strong>Facture justificative *</strong>
                  <input
                    name="billing_document"
                    type="file"
                    accept="image/*,application/pdf"
                    capture="environment"
                  />
                  {patient.billing_document_name && (
                    <small>
                      <FileText /> {patient.billing_document_name}
                    </small>
                  )}
                </label>
              </div>
              <div className="form-grid">
                <label>
                  Alertes médicales
                  <textarea
                    name="medical_alerts"
                    rows={3}
                    defaultValue={patient.medical_alerts}
                  />
                </label>
                <label>
                  Allergies
                  <textarea
                    name="allergies"
                    rows={3}
                    defaultValue={patient.allergies}
                  />
                </label>
                <label>
                  Traitements en cours
                  <textarea
                    name="medications"
                    rows={3}
                    defaultValue={patient.medications}
                  />
                </label>
              </div>
              <label>
                Notes de suivi
                <textarea
                  name="notes"
                  rows={8}
                  defaultValue={patient.notes}
                  placeholder="Contexte, préférences, relances, prochaines étapes…"
                />
              </label>
              <p className="privacy-note">
                Les données réelles de santé doivent être hébergées chez un
                prestataire certifié HDS avant la mise en production clinique.
              </p>
              <button className="primary">Enregistrer la fiche</button>
            </form>
          )}
          {patientTab === "Dentaire" && (
            <>
              <DentalChart
                value={patient.dental_chart}
                onSave={(chart) => {
                  setPatient({ ...patient, dental_chart: chart });
                  act(
                    "patient-record-save",
                    {
                      ...patient,
                      patient_id: patient.patient_id,
                      status: patient.record_status,
                      dental_chart: chart,
                    },
                    "Odontogramme enregistré.",
                    false,
                  );
                }}
              />
              <section className="patient-media">
                <div className="section-title">
                  <div>
                    <h3>Radios & photographies</h3>
                    <p>
                      Importez un cliché ou prenez une photo sans quitter
                      l’application.
                    </p>
                  </div>
                  <label className="primary">
                    <Image /> Ajouter / photographier
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      capture="environment"
                      onChange={async (e) => {
                        try {
                          const file = e.target.files?.[0];
                          const data = await fileDataAny(file);
                          await act(
                            "dental-media-add",
                            {
                              patient_id: patient.patient_id,
                              kind:
                                file?.type === "application/pdf"
                                  ? "xray"
                                  : "photo",
                              title: file?.name,
                              data_url: data,
                            },
                            "Média ajouté.",
                            false,
                          );
                        } catch (err) {
                          setError((err as Error).message);
                        }
                      }}
                    />
                  </label>
                </div>
                <div className="media-grid">
                  {(patient.media || []).map((m) => (
                    <a key={m.id} href={m.data_url} download={m.title}>
                      {m.data_url.startsWith("data:image") ? (
                        <img src={m.data_url} alt="" />
                      ) : (
                        <FileText />
                      )}
                      <span>{m.title}</span>
                    </a>
                  ))}
                </div>
              </section>
            </>
          )}
          {patientTab === "Rendez-vous" && (
            <div className="patient-timeline">
              {appointments
                .filter((a) => a.patient_id === patient.patient_id)
                .map((a) => (
                  <article key={a.id}>
                    <CalendarDays />
                    <div>
                      <strong>{a.reason}</strong>
                      <small>
                        {dateFormat(a.starts_at)} ·{" "}
                        {statusLabels[a.status] || a.status}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => {
                        setConversation(a);
                        setModal("");
                        go("Messages");
                      }}
                    >
                      Message
                    </button>
                  </article>
                ))}
            </div>
          )}
          {patientTab === "Documents" && (
            <div className="patient-timeline">
              {data.documents
                .filter((d) => d.patient_id === patient.patient_id)
                .map((d) => (
                  <article key={d.id}>
                    <FileText />
                    <div>
                      <strong>
                        {d.number} · {money(Number(d.total))}
                      </strong>
                      <small>
                        {new Date(d.issue_date).toLocaleDateString("fr-FR")} ·{" "}
                        {statusLabels[d.status]}
                      </small>
                    </div>
                    <button
                      className="secondary"
                      onClick={() => downloadDocument(d, profile, account.name)}
                    >
                      <Download /> PDF
                    </button>
                    {d.payment_url && (
                      <a
                        className="primary"
                        href={d.payment_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Payer
                      </a>
                    )}
                  </article>
                ))}
            </div>
          )}
        </Modal>
      )}
      {modal === "patient-info" && (
        <Modal title="Créer une fiche patient" close={() => setModal("")}>
          <PatientCreateForm
            save={(body) =>
              act(
                "patient-create",
                body,
                "Fiche patient créée et prête à compléter.",
              )
            }
          />
        </Modal>
      )}
      {modal.startsWith("service") && (
        <Modal
          title={
            modal.includes(":")
              ? "Modifier la prestation"
              : "Nouvelle prestation"
          }
          close={() => setModal("")}
        >
          <ServiceForm
            service={
              modal.includes(":")
                ? data.services.find((s) => s.id === modal.split(":")[1])
                : undefined
            }
            save={(body: any) =>
              act("service-save", body, "Catalogue mis à jour.")
            }
          />
        </Modal>
      )}
      {modal === "document" && documentPatient && (
        <Modal
          title="Créer et vérifier le document"
          close={() => setModal("")}
          wide
        >
          <DocumentForm
            patient={documentPatient}
            services={data.services}
            appointments={appointments}
            save={async (body) => {
              const result = await api<{ id: string; number: string }>(
                "document-create",
                body,
              );
              await load();
              setModal("");
              setNotice(
                `${result.number} créé. Vous pouvez maintenant le vérifier, télécharger et envoyer.`,
              );
            }}
          />
        </Modal>
      )}
      {modal === "task" && editingTask && (
        <Modal
          title={editingTask.id ? "Détails de la tâche" : "Nouvelle tâche"}
          close={() => setModal("")}
          wide
        >
          <TaskForm
            task={editingTask}
            patients={data.patients}
            account={account}
            save={(body) => act("task-save", body, "Tâche enregistrée.")}
          />
        </Modal>
      )}
      {modal === "mission" && (
        <Modal title="Planifier une course" close={() => setModal("")}>
          <MissionForm
            appointments={appointments}
            profile={profile}
            save={(body) => act("mission-save", body, "Course planifiée.")}
          />
        </Modal>
      )}
    </div>
  );
}

function ServiceForm({
  service,
  save,
}: {
  service?: Service;
  save: (x: any) => void;
}) {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          id: service?.id,
          name: f.get("name"),
          description: f.get("description"),
          duration: Number(f.get("duration")),
          price: Number(f.get("price")),
          vat: Number(f.get("vat")),
          active: true,
        });
      }}
    >
      <label>
        Nom de la prestation
        <input name="name" defaultValue={service?.name} required />
      </label>
      <label>
        Description
        <textarea
          name="description"
          defaultValue={service?.description}
          rows={3}
        />
      </label>
      <div className="form-grid">
        <label>
          Durée (min)
          <input
            name="duration"
            type="number"
            min="5"
            max="480"
            defaultValue={service?.duration || 45}
          />
        </label>
        <label>
          Prix HT (€)
          <input
            name="price"
            type="number"
            min="0"
            step="0.01"
            defaultValue={service?.price || 0}
          />
        </label>
        <label>
          TVA (%)
          <input
            name="vat"
            type="number"
            min="0"
            max="100"
            step="0.1"
            defaultValue={service?.vat || 0}
          />
        </label>
      </div>
      <button className="primary full">Enregistrer</button>
    </form>
  );
}
function PatientCreateForm({ save }: { save: (body: any) => Promise<any> }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        setSaving(true);
        setError("");
        try {
          const insuranceFile = f.get("insurance_card") as File;
          const billingFile = f.get("billing_document") as File;
          const [insurance, billing] = await Promise.all([
            fileDataAny(insuranceFile),
            fileDataAny(billingFile),
          ]);
          await save({
            name: f.get("name"),
            email: f.get("email"),
            phone: f.get("phone"),
            status: f.get("status"),
            birth_date: f.get("birth_date"),
            prosthesis_date: f.get("prosthesis_date"),
            address: f.get("address"),
            social_security_number: f.get("social_security_number"),
            mutual_provider: f.get("mutual_provider"),
            mutual_member_number: f.get("mutual_member_number"),
            tags: f.get("tags"),
            notes: f.get("notes"),
            medical_alerts: f.get("medical_alerts"),
            allergies: f.get("allergies"),
            medications: f.get("medications"),
            insurance_card_data: insurance,
            insurance_card_name: insuranceFile.name,
            billing_document_data: billing,
            billing_document_name: billingFile.name,
          });
        } catch (err) {
          setError((err as Error).message);
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="muted">
        Importez un dossier existant sans rendez-vous. Il restera privé au
        cabinet et apparaîtra immédiatement dans votre patientèle.
      </p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <div className="form-grid">
        <label>Nom complet *<input name="name" required autoComplete="name" /></label>
        <label>E-mail<input name="email" type="email" autoComplete="email" /></label>
        <label>Téléphone<input name="phone" type="tel" autoComplete="tel" /></label>
        <label>Statut<select name="status" defaultValue="actif"><option value="actif">Actif</option><option value="prospect">Prospect</option><option value="suivi">Suivi</option><option value="inactif">Inactif</option></select></label>
        <label>Date de naissance<input name="birth_date" type="date" /></label>
        <label>Pose de prothèse prévue<input name="prosthesis_date" type="date" /></label>
        <label>Adresse<input name="address" autoComplete="street-address" /></label>
        <label>N° de sécurité sociale<input name="social_security_number" inputMode="numeric" /></label>
        <label>Mutuelle / complémentaire *<input name="mutual_provider" required /></label>
        <label>N° adhérent *<input name="mutual_member_number" required /></label>
        <label>Tags<input name="tags" placeholder="Orthodontie, import 2026" /></label>
      </div>
      <div className="required-documents">
        <label><strong>Carte de mutuelle *</strong><input name="insurance_card" type="file" accept="image/*,application/pdf" capture="environment" required /></label>
        <label><strong>Facture justificative *</strong><input name="billing_document" type="file" accept="image/*,application/pdf" capture="environment" required /></label>
      </div>
      <div className="form-grid">
        <label>Alertes médicales<textarea name="medical_alerts" rows={3} /></label>
        <label>Allergies<textarea name="allergies" rows={3} /></label>
        <label>Traitements en cours<textarea name="medications" rows={3} /></label>
      </div>
      <label>Notes de reprise / historique<textarea name="notes" rows={5} placeholder="Ancien cabinet, soins en cours, points à reprendre…" /></label>
      <button className="primary full" disabled={saving}>{saving ? "Création…" : "Créer la fiche patient"}</button>
    </form>
  );
}

function DocumentForm({
  patient,
  services,
  appointments,
  save,
}: {
  patient: PatientRecord;
  services: Service[];
  appointments: Appointment[];
  save: (x: any) => void;
}) {
  const [items, setItems] = useState([
    {
      label: services[0]?.name || "",
      quantity: 1,
      unitPrice: Number(services[0]?.price || 0),
      vat: Number(services[0]?.vat || 0),
    },
  ]);
  const total = items.reduce(
    (s, x) => s + x.quantity * x.unitPrice * (1 + x.vat / 100),
    0,
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          patient_id: patient.patient_id,
          appointment_id: f.get("appointment_id"),
          doc_type: f.get("doc_type"),
          due_date: f.get("due_date"),
          note: f.get("note"),
          payment_url: f.get("payment_url"),
          payment_method: f.get('payment_method'),
          insurance_amount: Number(f.get('insurance_amount')||0),
          payment_details: f.get('payment_details'),
          items,
        });
      }}
    >
      <div className="document-preview-head">
        <div>
          <span>Destinataire</span>
          <strong>{patient.name}</strong>
          <small>{patient.email}</small>
        </div>
        <div>
          <span>Total TTC</span>
          <strong>{money(total)}</strong>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Type
          <select name="doc_type">
            <option value="quote">Devis</option>
            <option value="invoice">Facture</option>
          </select>
        </label>
        <label>
          Rendez-vous lié
          <select name="appointment_id">
            <option value="">Aucun</option>
            {appointments
              .filter((a) => a.patient_id === patient.patient_id)
              .map((a) => (
                <option value={a.id} key={a.id}>
                  {dateFormat(a.starts_at)} · {a.reason}
                </option>
              ))}
          </select>
        </label>
        <label>
          Échéance
          <input name="due_date" type="date" />
        </label>
        <label>
          Lien de paiement Qonto
          <input
            name="payment_url"
            type="url"
            placeholder="https://pay.qonto.com/…"
          />
        </label>
        <label>Modalité de règlement<select name="payment_method"><option value="sur_place">Sur place au cabinet</option><option value="mutuelle">Mutuelle / complémentaire</option><option value="tiers_payant">Tiers payant partiel ou total</option><option value="carte_cabinet">Carte bancaire au cabinet</option><option value="virement">Virement bancaire</option><option value="qonto">Lien de paiement Qonto</option><option value="cheque">Chèque</option><option value="especes">Espèces</option></select></label>
        <label>Prise en charge prévue (€)<input name="insurance_amount" type="number" min="0" max={total} step="0.01" defaultValue="0"/></label>
      </div>
      <label>Précisions du règlement<textarea name="payment_details" rows={2} placeholder="Organisme, accord attendu, acompte, échéancier, reste à charge…"/></label>
      <h3>Lignes</h3>
      {items.map((item, i) => (
        <div className="doc-line" key={i}>
          <label>
            Prestation
            <input
              value={item.label}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    j === i ? { ...x, label: e.target.value } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Qté
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={item.quantity}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    j === i ? { ...x, quantity: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            Prix HT
            <input
              type="number"
              min="0"
              step="0.01"
              value={item.unitPrice}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    j === i ? { ...x, unitPrice: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </label>
          <label>
            TVA %
            <input
              type="number"
              min="0"
              max="100"
              value={item.vat}
              onChange={(e) =>
                setItems(
                  items.map((x, j) =>
                    j === i ? { ...x, vat: Number(e.target.value) } : x,
                  ),
                )
              }
            />
          </label>
          <button
            type="button"
            className="icon-button"
            onClick={() => setItems(items.filter((_, j) => j !== i))}
          >
            <Trash2 />
          </button>
        </div>
      ))}
      <div className="doc-actions">
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setItems([
              ...items,
              { label: "", quantity: 1, unitPrice: 0, vat: 0 },
            ])
          }
        >
          <Plus />
          Ajouter une ligne
        </button>
        {services.length > 0 && (
          <select
            onChange={(e) => {
              const s = services.find((x) => x.id === e.target.value);
              if (s)
                setItems([
                  ...items,
                  {
                    label: s.name,
                    quantity: 1,
                    unitPrice: Number(s.price),
                    vat: Number(s.vat),
                  },
                ]);
            }}
          >
            <option value="">Ajouter depuis le catalogue…</option>
            {services.map((s) => (
              <option value={s.id} key={s.id}>
                {s.name} · {money(Number(s.price))}
              </option>
            ))}
          </select>
        )}
      </div>
      <label>
        Conditions et message
        <textarea name="note" rows={3} />
      </label>
      <p className="privacy-note">
        Le lien Qonto sera joint au document dans la messagerie. Le paiement par
        carte sera activé lors de l’intégration du prestataire de paiement.
      </p>
      <button className="primary full">Vérifier et créer</button>
    </form>
  );
}
function TaskForm({
  task,
  patients,
  account,
  save,
}: {
  task: Partial<WorkTask>;
  patients: PatientRecord[];
  account: Account;
  save: (x: any) => void;
}) {
  const [checklist, setChecklist] = useState(task.checklist || []),
    [attachments, setAttachments] = useState(task.attachments || []);
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          id: task.id,
          title: f.get("title"),
          description: f.get("description"),
          stage: f.get("stage"),
          priority: f.get("priority"),
          due_at: f.get("due_at"),
          assignee: f.get("assignee"),
          patient_id: f.get("patient_id"),
          checklist,
          attachments,
        });
      }}
    >
      <label>
        Titre
        <input name="title" defaultValue={task.title} required />
      </label>
      <label>
        Description
        <textarea name="description" rows={4} defaultValue={task.description} />
      </label>
      <div className="form-grid">
        <label>
          Colonne
          <select name="stage" defaultValue={task.stage}>
            <option>À faire</option>
            <option>En cours</option>
            <option>En attente</option>
            <option>Terminé</option>
          </select>
        </label>
        <label>
          Priorité
          <select name="priority" defaultValue={task.priority}>
            <option>Basse</option>
            <option>Normale</option>
            <option>Haute</option>
            <option>Urgente</option>
          </select>
        </label>
        <label>
          Responsable
          <input
            name="assignee"
            defaultValue={task.assignee || account.name}
            placeholder="Nom du collaborateur"
          />
        </label>
        <label>
          Échéance
          <input
            name="due_at"
            type="datetime-local"
            defaultValue={localDate(task.due_at)}
          />
        </label>
        <label>
          Patient lié
          <select name="patient_id" defaultValue={task.patient_id}>
            <option value="">Aucun</option>
            {patients.map((p) => (
              <option value={p.patient_id} key={p.patient_id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="checklist-editor">
        <h3>Checklist</h3>
        {checklist.map((c, i) => (
          <label className="check-item" key={c.id}>
            <input
              type="checkbox"
              checked={c.done}
              onChange={(e) =>
                setChecklist(
                  checklist.map((x, j) =>
                    j === i ? { ...x, done: e.target.checked } : x,
                  ),
                )
              }
            />
            <input
              value={c.text}
              onChange={(e) =>
                setChecklist(
                  checklist.map((x, j) =>
                    j === i ? { ...x, text: e.target.value } : x,
                  ),
                )
              }
            />
            <button
              type="button"
              className="icon-button"
              onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
            >
              <X />
            </button>
          </label>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setChecklist([
              ...checklist,
              { id: crypto.randomUUID(), text: "", done: false },
            ])
          }
        >
          <Plus />
          Ajouter une étape
        </button>
      </div>
      <div className="attachments-editor">
        <h3>Documents et liens</h3>
        {attachments.map((a, i) => (
          <div key={i}>
            <input
              value={a.name}
              onChange={(e) =>
                setAttachments(
                  attachments.map((x, j) =>
                    j === i ? { ...x, name: e.target.value } : x,
                  ),
                )
              }
            />
            <input
              type="url"
              value={a.url}
              onChange={(e) =>
                setAttachments(
                  attachments.map((x, j) =>
                    j === i ? { ...x, url: e.target.value } : x,
                  ),
                )
              }
            />
          </div>
        ))}
        <button
          type="button"
          className="text-button"
          onClick={() =>
            setAttachments([...attachments, { name: "", url: "" }])
          }
        >
          <Paperclip />
          Ajouter un document ou lien
        </button>
        <label className="text-button task-photo-upload">
          <Image /> Ajouter une photo
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (file)
                setAttachments([
                  ...attachments,
                  { name: file.name, url: await fileData(file) },
                ]);
            }}
          />
        </label>
      </div>
      <button className="primary full">Enregistrer la tâche</button>
    </form>
  );
}
function MissionForm({
  appointments,
  profile,
  save,
}: {
  appointments: Appointment[];
  profile: Profile;
  save: (x: any) => void;
}) {
  const [photo, setPhoto] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        save({
          title: f.get("title"),
          assignee: f.get("assignee"),
          address: f.get("address"),
          appointment_id: f.get("appointment_id"),
          eta: Number(f.get("eta")),
          photo_data: photo,
        });
      }}
    >
      <label>
        Mission
        <input
          name="title"
          placeholder="Visite à domicile, livraison d’appareil…"
          required
        />
      </label>
      <label>
        Personne assignée
        <input name="assignee" required />
      </label>
      <label>
        Photo de l’intervenant
        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          onChange={async (e) => setPhoto(await fileData(e.target.files?.[0]))}
        />
      </label>
      <label>
        Adresse
        <input name="address" defaultValue={profile.address} />
      </label>
      <div className="form-grid">
        <label>
          Arrivée estimée (min)
          <input name="eta" type="number" min="0" max="240" defaultValue="20" />
        </label>
        <label>
          Rendez-vous lié
          <select name="appointment_id">
            <option value="">Aucun</option>
            {appointments.map((a) => (
              <option value={a.id} key={a.id}>
                {a.patient_name} · {dateFormat(a.starts_at)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <button className="primary full">Planifier la course</button>
    </form>
  );
}

