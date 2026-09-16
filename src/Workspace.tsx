import {downloadSharedDocument} from './documents';
import React, { useEffect, useState } from "react";
import { usePanel } from "./usePanel";
import LiveTracking from './LiveTracking';
import SupportPanel from './SupportPanel';
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Download,
  Heart,
  LogOut,
  MapPin,
  MessageCircle,
  Plus,
  Settings,
  ShieldCheck,
  Stethoscope,
  Users,
  Wallet,
  X,
  Menu,
} from "lucide-react";
import {
  api,
  Account,
  Dashboard,
  Appointment,
  Profile,
  dateFormat,
  money,
  homeFor,
  roleLabel,
} from "./client";
export default function Workspace({
  account,
  logout,
}: {
  account: Account;
  logout: () => void;
}) {
  const [mobileMenu, setMobileMenu] = useState(false);
  const [data, setData] = useState<Dashboard | null>(null),
    [page, setPage] = usePanel(
      "Accueil",
      account.role === "patient"
        ? ["Accueil", "Rendez-vous", "Messages", "Mon profil", "Suivi", "Assistance"]
        : [
            "Accueil",
            "Rendez-vous",
            "Disponibilités",
            "Patients",
            "Messages",
            "Comptabilité",
            "Mon profil",
          ],
    ),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState(""),
    [conversation, setConversation] = useState<Appointment | null>(null),
    [messages, setMessages] = useState<any[]>([]),
    [draft, setDraft] = useState(""),
    [profile, setProfile] = useState<Profile | null>(null),
    [name, setName] = useState(account.name),
    [admin, setAdmin] = useState<any[]>([]);
  useEffect(() => {
    setMobileMenu(false);
  }, [page]);
  useEffect(() => {
    const close = () => setMobileMenu(false);
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
  const pro = account.role !== "patient",
    worker = account.role === "worker";
  const load = async () => {
    try {
      const d = await api<Dashboard>("dashboard");
      setData(d);
      setProfile(d.profile);
      setName(d.account.name);
      if (account.role === "admin") setAdmin((await api("admin")).accounts);
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    load();
  }, []);
  useEffect(() => {
    if (!conversation) return;
    let alive = true;
    const refresh = () =>
      api("messages&appointment=" + conversation.id)
        .then((r) => {
          if (alive) setMessages(r.messages);
        })
        .catch((e) => {
          if (alive) setError(e.message);
        });
    refresh();
    const timer = setInterval(refresh, 10000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [conversation?.id]);
  const act = async (action: string, body: unknown, text: string) => {
    setBusy(true);
    setError("");
    try {
      await api(action, body);
      await load();
      setNotice(text);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const nav = [
    ["Accueil", Heart],
    ["Rendez-vous", CalendarDays],
    ...(pro
      ? [
          ["Disponibilités", Plus],
          ["Patients", Users],
          ["Comptabilité", Wallet],
        ]
      : []),
    ["Messages", MessageCircle],
    ["Mon profil", Settings],
    ...(!pro ? [["Suivi",MapPin],["Assistance",MessageCircle]] : []),
    ...(account.role === "admin" ? [["Administration", ShieldCheck]] : []),
  ] as const;
  const heading = (title: string, subtitle: string) => (
    <div className="page-heading">
      <div>
        <div className="eyebrow">
          VOTRE ESPACE {roleLabel(account.role).toUpperCase()}
        </div>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </div>
  );
  const upcoming =
    data?.appointments.filter(
      (a) => a.status === "confirmed" && new Date(a.starts_at) > new Date(),
    ) || [];
  const list = (rows: Appointment[]) =>
    rows.length ? (
      rows.map((a) => (
        <article className="glass public-reservation" key={a.id}>
          <span className="stat-icon blue">
            <CalendarDays size={22} />
          </span>
          <div className="grow">
            <h3>{pro ? a.patient_name : a.professional_name}</h3>
            <p>
              {a.reason} · {a.duration} min
            </p>
            <strong>{dateFormat(a.starts_at)}</strong>
            {!pro && <small>{a.address}</small>}
          </div>
          <span className="badge">
            {
              {
                confirmed: "Confirmé",
                cancelled: "Annulé",
                completed: "Terminé",
              }[a.status]
            }
          </span>
          <button
            className="secondary"
            onClick={() => {
              setConversation(a);
              setPage("Messages");
            }}
          >
            Message
          </button>
          {a.status === "confirmed" && new Date(a.starts_at) > new Date() && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() =>
                act(
                  "cancel",
                  { id: a.id },
                  "Rendez-vous annulé. Le créneau est libéré.",
                )
              }
            >
              Annuler
            </button>
          )}
          {pro &&
            a.status === "confirmed" &&
            new Date(a.starts_at) <= new Date() && (
              <button
                className="secondary"
                disabled={busy}
                onClick={() =>
                  act("complete", { id: a.id }, "Consultation terminée.")
                }
              >
                Terminer
              </button>
            )}
        </article>
      ))
    ) : (
      <div className="glass search-empty">
        <CalendarDays size={30} />
        <h2>Aucun rendez-vous pour le moment.</h2>
        <p>
          {pro
            ? "Publiez votre profil et ajoutez des disponibilités pour recevoir des réservations."
            : "Trouvez un praticien et choisissez une disponibilité."}
        </p>
        {pro ? (
          <button className="primary" onClick={() => setPage("Disponibilités")}>
            Ajouter une disponibilité
          </button>
        ) : (
          <a className="primary" href="/recherche">
            Trouver un praticien
          </a>
        )}
      </div>
    );
  return (
    <div className="app real-workspace">
      <aside className="sidebar">
        <a className="brand" href="/">
          SmilePec<span className="brand-dot">.</span>
        </a>
        <div className="workspace">
          <span className="stat-icon blue">
            {pro ? <Stethoscope size={20} /> : <Heart size={20} />}
          </span>
          <div>
            <strong>{account.name}</strong>
            <small>Espace {roleLabel(account.role).toLowerCase()}</small>
          </div>
        </div>
        <nav>
          {nav.map(([n, I]) => (
            <button
              key={String(n)}
              className={"nav-item " + (page === n ? "active" : "")}
              onClick={() => {
                setPage(String(n));
                setError("");
                setNotice("");
              }}
            >
              <I size={20} />
              {String(n)}
            </button>
          ))}
        </nav>
        <button className="nav-item logout" onClick={logout}>
          <LogOut size={18} />
          Déconnexion
        </button>
      </aside>
      <div className="main-wrap">
        <header className="topbar">
          <a href="/" className="text-button">
            <ArrowLeft size={16} />
            Site public
          </a>
          <strong>
            {roleLabel(account.role)} · {account.name}
          </strong>
          <button
            className="icon-button"
            aria-label="Déconnexion"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </header>
        <nav
          className={"workspace-mobile-nav " + (mobileMenu ? "expanded" : "")}
        >
          {nav.map(([n, I]) => (
            <button
              key={String(n)}
              className={page === n ? "selected" : ""}
              onClick={() => {
                setPage(String(n));
                setMobileMenu(false);
                window.scrollTo(0, 0);
              }}
            >
              <I size={16} />
              {String(n)}
            </button>
          ))}
        </nav>
        <main>
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
                aria-label="Fermer la notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!data ? (
            <p className="empty">Chargement de votre espace…</p>
          ) : (
            <>
              {page === "Accueil" && (
                <>
                  {heading(
                    "Bonjour, " + data.account.name + ".",
                    "Vos informations, vos rendez-vous et vos échanges, réunis ici.",
                  )}
                  <div className="welcome glass real-welcome">
                    <span className="pill">
                      <span className="dot" /> Espace{" "}
                      {roleLabel(account.role).toLowerCase()}
                    </span>
                    <h2>
                      {pro
                        ? "Plus de temps pour le soin."
                        : "Votre sourire, bien accompagné."}
                    </h2>
                    <p>
                      {pro
                        ? "Votre compte professionnel est distinct des comptes patients. Vos disponibilités publiées sont réservables sur le site."
                        : "Votre compte patient vous permet de réserver et de retrouver vos rendez-vous depuis vos appareils."}
                    </p>
                    <button
                      className="primary"
                      onClick={() =>
                        setPage(pro ? "Disponibilités" : "Rendez-vous")
                      }
                    >
                      {pro ? "Gérer mes disponibilités" : "Mes rendez-vous"}
                      <ArrowRight size={16} />
                    </button>
                  </div>
                  <div className="stats actual-stats">
                    <div className="glass stat">
                      <span>Rendez-vous à venir</span>
                      <strong>{upcoming.length}</strong>
                    </div>
                    <div className="glass stat">
                      <span>
                        {pro ? "Profil public" : "Rendez-vous passés"}
                      </span>
                      <strong>
                        {pro
                          ? data.profile.published
                            ? "Publié"
                            : "À compléter"
                          : data.appointments.filter(
                              (a) => a.status === "completed",
                            ).length}
                      </strong>
                    </div>
                    {pro && (
                      <div className="glass stat">
                        <span>Créneaux disponibles</span>
                        <strong>
                          {data.slots.filter((s) => s.available).length}
                        </strong>
                      </div>
                    )}
                  </div>
                  <a className="glass workspace-tools-banner" href="/outils">
                    <span className="stat-icon blue">
                      <Heart size={20} />
                    </span>
                    <div>
                      <strong>Découvrez tous les outils SmilePec</strong>
                      <small>
                        Coordination, accompagnement à domicile et aperçu du
                        suivi d’arrivée.
                      </small>
                    </div>
                    <ArrowRight size={18} />
                  </a>
                  <h2>À venir</h2>
                  {list(upcoming.slice(0, 4))}
                </>
              )}
              {page === "Rendez-vous" && (
                <>
                  {heading(
                    "Votre agenda",
                    "Heures affichées à l’heure de Paris.",
                  )}
                  <div className="account-toolbar">
                    {pro ? (
                      <button
                        className="primary"
                        onClick={() => setPage("Disponibilités")}
                      >
                        Créer une disponibilité
                      </button>
                    ) : (
                      <a href="/recherche" className="primary">
                        Prendre rendez-vous
                      </a>
                    )}
                  </div>
                  {list(data.appointments)}
                </>
              )}
              {page === "Disponibilités" && pro && (
                <>
                  {heading(
                    "Vos disponibilités",
                    "Ajoutez les horaires que les patients peuvent réserver.",
                  )}
                  <form
                    className="glass panel real-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const f = new FormData(form);
                      const value = String(f.get("date"));
                      const ok = await act(
                        "slot-create",
                        {
                          starts_at: new Date(value).toISOString(),
                          duration: Number(f.get("duration")),
                        },
                        "Créneau enregistré.",
                      );
                      if (ok) form.reset();
                    }}
                  >
                    <h2>Ouvrir un créneau</h2>
                    <p className="muted">
                      Saisie dans le fuseau de votre appareil. Le site affiche
                      ensuite les horaires de Paris. Les chevauchements sont
                      refusés.
                    </p>
                    <div className="form-grid">
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
                    </div>
                    <button className="primary" disabled={busy}>
                      Publier ce créneau
                    </button>
                    {!data.profile.published && (
                      <p className="muted">
                        Votre profil doit aussi être publié pour que les
                        patients puissent réserver.
                      </p>
                    )}
                  </form>
                  <section className="glass panel slots-panel">
                    <h2>Créneaux à venir</h2>
                    {data.slots.length ? (
                      data.slots.map((s) => (
                        <div className="transaction" key={s.id}>
                          <div className="grow">
                            <strong>{dateFormat(s.starts_at)}</strong>
                            <small>{s.duration} minutes</small>
                          </div>
                          <span className="badge">
                            {s.available ? "Disponible" : "Réservé"}
                          </span>
                          {s.available && (
                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  "slot-delete",
                                  { id: s.id },
                                  "Créneau retiré.",
                                )
                              }
                            >
                              Retirer
                            </button>
                          )}
                        </div>
                      ))
                    ) : (
                      <p className="empty">Aucun créneau créé.</p>
                    )}
                  </section>
                </>
              )}
              {page === "Patients" && pro && (
                <>
                  {heading(
                    "Vos patients",
                    "Uniquement les personnes qui ont réservé avec vous.",
                  )}
                  <div className="cards-grid">
                    {Array.from(
                      new Map(
                        data.appointments.map((a) => [a.patient_id, a]),
                      ).values(),
                    ).map((a) => (
                      <article className="glass panel" key={a.patient_id}>
                        <Users size={25} />
                        <h2>{a.patient_name}</h2>
                        <p className="muted">
                          {
                            data.appointments.filter(
                              (x) => x.patient_id === a.patient_id,
                            ).length
                          }{" "}
                          rendez-vous avec vous
                        </p>
                        <button
                          className="secondary"
                          onClick={() => {
                            setConversation(a);
                            setPage("Messages");
                          }}
                        >
                          Ouvrir la conversation
                        </button>
                      </article>
                    ))}
                  </div>
                  {!data.appointments.length && (
                    <p className="empty">
                      Vos patients apparaîtront après leur première réservation.
                    </p>
                  )}
                  <p className="muted">
                    Les dossiers cliniques et documents de santé ne sont pas
                    encore activés.
                  </p>
                </>
              )}
              {page === "Messages" && (
                <>
                  {heading(
                    "Vos conversations",
                    "Échangez avec les participants de vos rendez-vous.",
                  )}
                  <label>
                    Choisir une conversation
                    <select
                      value={conversation?.id || ""}
                      onChange={(e) => {
                        setMessages([]);
                        setConversation(
                          data.appointments.find(
                            (a) => a.id === e.target.value,
                          ) || null,
                        );
                      }}
                    >
                      <option value="">Sélectionner un rendez-vous</option>
                      {data.appointments.map((a) => (
                        <option key={a.id} value={a.id}>
                          {pro ? a.patient_name : a.professional_name} ·{" "}
                          {dateFormat(a.starts_at)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {conversation ? (
                    <section className="glass real-chat">
                      <div className="chat-messages">
                        {messages.length ? (
                          messages.map((m) => (
                            <div
                              key={m.id}
                              className={
                                "bubble " +
                                (m.sender_id === account.id ? "mine" : "")
                              }
                            >
                              {m.body}
                              {m.document_id && <button className="secondary" onClick={()=>downloadSharedDocument(m.document_id).catch(e=>setError(e.message))}>Télécharger le PDF</button>}
                              <small>
                                {m.name} · {dateFormat(m.created_at)}
                              </small>
                            </div>
                          ))
                        ) : (
                          <p className="empty">Commencez votre échange.</p>
                        )}
                      </div>
                      <form
                        className="chat-input"
                        onSubmit={async (e) => {
                          e.preventDefault();
                          setBusy(true);
                          try {
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
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                      >
                        <input
                          aria-label="Votre message"
                          value={draft}
                          onChange={(e) => setDraft(e.target.value)}
                          maxLength={2000}
                          placeholder="Votre message concernant le rendez-vous…"
                          required
                        />
                        <button
                          className="primary"
                          disabled={busy || !draft.trim()}
                        >
                          Envoyer
                        </button>
                      </form>
                      <small className="chat-disclaimer">
                        Actualisation toutes les 10 secondes. Ne transmettez pas
                        de dossier médical ici.
                      </small>
                    </section>
                  ) : (
                    <p className="empty">
                      Une réservation ouvre une conversation entre le patient et
                      le professionnel.
                    </p>
                  )}
                </>
              )}
              {page === "Comptabilité" && pro && (
                <>
                  {heading(
                    "Votre activité financière",
                    "Un journal privé de recettes et dépenses, propre à votre compte.",
                  )}
                  <div className="stats actual-stats">
                    {[
                      [
                        "Encaissements",
                        data.ledger
                          .filter((x) => x.kind === "income" && x.paid)
                          .reduce((s, x) => s + Number(x.amount), 0),
                      ],
                      [
                        "Dépenses payées",
                        data.ledger
                          .filter((x) => x.kind === "expense" && x.paid)
                          .reduce((s, x) => s + Number(x.amount), 0),
                      ],
                      [
                        "À encaisser",
                        data.ledger
                          .filter((x) => x.kind === "income" && !x.paid)
                          .reduce((s, x) => s + Number(x.amount), 0),
                      ],
                    ].map(([label, value]) => (
                      <div className="glass stat" key={label}>
                        <span>{label}</span>
                        <strong>{money(Number(value))}</strong>
                      </div>
                    ))}
                  </div>
                  <form
                    className="glass panel real-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = e.currentTarget;
                      const f = new FormData(form);
                      if (
                        await act(
                          "ledger-create",
                          {
                            label: f.get("label"),
                            amount: Number(f.get("amount")),
                            kind: f.get("kind"),
                            paid: f.get("paid") === "on",
                          },
                          "Opération enregistrée.",
                        )
                      )
                        form.reset();
                    }}
                  >
                    <h2>Ajouter une opération</h2>
                    <label>
                      Libellé
                      <input name="label" required maxLength={200} />
                    </label>
                    <div className="form-grid">
                      <label>
                        Type
                        <select name="kind">
                          <option value="income">Recette</option>
                          <option value="expense">Dépense</option>
                        </select>
                      </label>
                      <label>
                        Montant (€)
                        <input
                          name="amount"
                          type="number"
                          min="0.01"
                          max="1000000"
                          step="0.01"
                          required
                        />
                      </label>
                    </div>
                    <label className="checkbox">
                      <input name="paid" type="checkbox" />
                      Déjà réglé
                    </label>
                    <button className="primary" disabled={busy}>
                      Enregistrer
                    </button>
                  </form>
                  <section className="glass panel slots-panel">
                    <div className="section-title">
                      <h2>Journal</h2>
                      <button
                        className="secondary"
                        onClick={() => {
                          const safe = (s: string) =>
                            /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
                          const csv =
                            "\uFEFF" +
                            [
                              ["Libellé", "Type", "Montant", "Réglé"],
                              ...data.ledger.map((x) => [
                                safe(x.label),
                                x.kind,
                                String(x.amount),
                                x.paid ? "Oui" : "Non",
                              ]),
                            ]
                              .map((r) =>
                                r
                                  .map((v) => '"' + v.replace(/"/g, '""') + '"')
                                  .join(";"),
                              )
                              .join("\r\n");
                          const url = URL.createObjectURL(
                            new Blob([csv], { type: "text/csv;charset=utf-8" }),
                          );
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = "amelib-comptabilite.csv";
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                      >
                        <Download size={16} />
                        CSV
                      </button>
                    </div>
                    {data.ledger.map((x) => (
                      <div className="transaction" key={x.id}>
                        <div className="grow">
                          <strong>{x.label}</strong>
                          <small>
                            {x.kind === "income" ? "Recette" : "Dépense"}
                          </small>
                        </div>
                        <strong>{money(x.amount)}</strong>
                        {x.paid ? (
                          <span className="badge">Réglé</span>
                        ) : (
                          <button
                            className="secondary"
                            disabled={busy}
                            onClick={() =>
                              act(
                                "ledger-paid",
                                { id: x.id },
                                "Règlement enregistré.",
                              )
                            }
                          >
                            Marquer réglé
                          </button>
                        )}
                      </div>
                    ))}
                    <p className="muted">
                      Ce journal ne remplace pas la facturation réglementaire ou
                      votre logiciel comptable.
                    </p>
                  </section>
                </>
              )}
              {page === "Mon profil" && profile && (
                <>
                  {heading(
                    pro ? "Votre profil professionnel" : "Votre profil patient",
                    pro
                      ? "Vous maîtrisez les informations visibles dans l’annuaire."
                      : "Votre identité et vos coordonnées personnelles.",
                  )}
                  <form
                    className="glass panel profile-form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      act(
                        "profile",
                        { ...profile, name },
                        "Profil enregistré.",
                      );
                    }}
                  >
                    <label>
                      Nom complet
                      <input
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        maxLength={80}
                      />
                    </label>
                    <label>
                      E-mail
                      <input value={account.email} disabled />
                    </label>
                    <p className="muted">
                      Votre type de compte est{" "}
                      {roleLabel(account.role).toLowerCase()} et ne peut pas
                      être changé depuis cet écran.
                    </p>
                    {pro && (
                      <>
                        {(
                          [
                            "specialty",
                            "city",
                            "address",
                            "phone",
                            "languages",
                            "identifier",
                            "qualifications",
                          ] as const
                        ).map((k) => (
                          <label key={k}>
                            {
                              {
                                specialty: "Profession / spécialité",
                                city: "Ville",
                                address: "Adresse professionnelle",
                                phone: "Téléphone professionnel",
                                languages: "Langues",
                                identifier:
                                  "Identifiant professionnel (RPPS / SIRET)",
                                qualifications: "Formation et qualifications",
                              }[k]
                            }
                            <input
                              value={profile[k]}
                              onChange={(e) =>
                                setProfile({ ...profile, [k]: e.target.value })
                              }
                              maxLength={k === "qualifications" ? 1500 : 250}
                            />
                          </label>
                        ))}
                        <label>
                          Présentation
                          <textarea
                            rows={5}
                            maxLength={3000}
                            value={profile.bio}
                            onChange={(e) =>
                              setProfile({ ...profile, bio: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Tarif de consultation (€)
                          <input
                            type="number"
                            min="0"
                            max="100000"
                            step="0.01"
                            value={profile.price}
                            onChange={(e) =>
                              setProfile({
                                ...profile,
                                price: Number(e.target.value),
                              })
                            }
                          />
                        </label>
                        <label className="checkbox">
                          <input
                            type="checkbox"
                            checked={profile.published}
                            onChange={(e) =>
                              setProfile({
                                ...profile,
                                published: e.target.checked,
                              })
                            }
                          />
                          Publier mon profil et mes disponibilités dans
                          l’annuaire
                        </label>
                        <p className="muted">
                          Vos informations professionnelles sont déclaratives.
                          Le badge de vérification est réservé à la validation
                          par l’administration.
                        </p>
                      </>
                    )}
                    <button className="primary" disabled={busy}>
                      Enregistrer mon profil
                    </button>
                  </form>
                </>
              )}
              {page === "Administration" && account.role === "admin" && (
                <>
                  {heading(
                    "Administration",
                    "Vérification des profils professionnels.",
                  )}
                  <section className="glass panel">
                    {admin.map((a) => (
                      <div className="transaction" key={a.id}>
                        <div className="grow">
                          <strong>{a.name}</strong>
                          <small>
                            {a.identifier || "Identifiant non renseigné"} ·{" "}
                            {roleLabel(a.role)}
                          </small>
                        </div>
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            act(
                              "admin-verify",
                              { id: a.id, verified: !a.verified },
                              "Statut mis à jour.",
                            )
                          }
                        >
                          {a.verified
                            ? "Retirer la vérification"
                            : "Valider après contrôle"}
                        </button>
                      </div>
                    ))}
                  </section>
                </>
              )}
            </>
          )}
          {!pro&&page==='Suivi'&&<LiveTracking patient/>}
          {!pro&&page==='Assistance'&&<SupportPanel/>}
        </main>
        <nav
          className="workspace-dock"
          aria-label="Navigation de l’application"
        >
          {[
            ["Accueil", Heart],
            ["Rendez-vous", CalendarDays],
            ["Messages", MessageCircle],
            ["Mon profil", Settings],
          ].map(([n, I]) => {
            const Icon = I as typeof Heart;
            return (
              <button
                key={String(n)}
                className={page === n ? "active" : ""}
                onClick={() => {
                  setPage(String(n));
                  setMobileMenu(false);
                  window.scrollTo(0, 0);
                }}
              >
                <Icon size={21} />
                {n === "Rendez-vous"
                  ? "Agenda"
                  : n === "Mon profil"
                    ? "Profil"
                    : String(n)}
              </button>
            );
          })}
          {pro && (
            <button
              className={mobileMenu ? "active" : ""}
              onClick={() => setMobileMenu(!mobileMenu)}
            >
              <Menu size={21} />
              Plus
            </button>
          )}
        </nav>
      </div>
    </div>
  );
}
