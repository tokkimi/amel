import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronLeft,
  Globe,
  Heart,
  LogOut,
  Mail,
  MapPin,
  Menu,
  MessageCircle,
  Phone,
  Search,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  Users,
  X,
} from "lucide-react";
import { SiAndroid, SiApple } from "@icons-pack/react-simple-icons";
import {
  api,
  Account,
  Professional,
  Slot,
  homeFor,
  roleLabel,
  dateFormat,
  money,
} from "./client";
import Workspace from "./Workspace";
import ProSuite from "./ProSuite";
import ToolsPage, { ToolsPreview } from "./Experience";
import AdminConsole from "./AdminConsole";

function Logo() {
  return (
    <a className="brand" href="/">
      <img className="brand-emblem" src="/smilepec-emblem.png" alt="" />
      SmilePec
    </a>
  );
}
function Portrait({ p, large = false }: { p: Professional; large?: boolean }) {
  return (
    <span className={`public-avatar blue ${large ? "large" : ""}`}>
      {p.photo_data ? (
        <img src={p.photo_data} alt={`Portrait de ${p.name}`} />
      ) : (
        p.name
          .replace(/^Dr\.? /, "")
          .split(" ")
          .map((n) => n[0])
          .slice(0, 2)
          .join("")
      )}
      {p.verified && (
        <span>
          <Check size={12} />
        </span>
      )}
    </span>
  );
}
function Dialog({
  title,
  children,
  close,
}: {
  title: string;
  children: React.ReactNode;
  close: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    ref.current?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const items = ref.current?.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select,textarea,a[href]",
        );
        if (!items?.length) return;
        const first = items[0],
          last = items[items.length - 1];
        if (
          e.shiftKey &&
          (document.activeElement === first ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={close}>
      <section
        ref={ref}
        tabIndex={-1}
        className="modal public-modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="close icon-button"
          onClick={close}
          aria-label="Fermer"
        >
          <X />
        </button>
        {children}
      </section>
    </div>
  );
}
export default function Portal() {
  const [publicSettings, setPublicSettings] = useState({
    name: "SmilePec",
    support_email: "",
    announcement: "",
  });
  const [contactOpen, setContactOpen] = useState(false);
  const path = window.location.pathname;
  const isWorkspace = [
    "/patient",
    "/pro",
    "/intervenant",
    "/admin",
    "/mon-espace",
  ].includes(path);
  const [view, setView] = useState(
    path === "/outils"
      ? "tools"
      : path === "/recherche"
        ? "search"
        : path.startsWith("/praticiens/")
          ? "profile"
          : "home",
  );
  const [account, setAccount] = useState<Account | null>(null),
    [loaded, setLoaded] = useState(false),
    [professionals, setProfessionals] = useState<Professional[]>([]),
    [directoryReady, setDirectoryReady] = useState(false),
    [selected, setSelected] = useState<Professional | null>(null),
    [slots, setSlots] = useState<Slot[]>([]),
    [slotsLoading, setSlotsLoading] = useState(false),
    [slotId, setSlotId] = useState(""),
    [query, setQuery] = useState(""),
    [city, setCity] = useState(""),
    [category, setCategory] = useState("Tout"),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false),
    [modal, setModal] = useState<string | null>(
      path === "/inscription"
        ? "signup"
        : path === "/connexion"
          ? "login"
          : null,
    ),
    [authRole, setAuthRole] = useState(path === "/admin" ? "admin" : "patient"),
    [recovery, setRecovery] = useState(""),
    [created, setCreated] = useState(false),
    [reason, setReason] = useState("Première consultation"),
    [pending, setPending] = useState(false),
    [success, setSuccess] = useState(false),
    [info, setInfo] = useState("");
  useEffect(() => {
    api("public-settings")
      .then((r) => setPublicSettings(r.settings))
      .catch(() => {});
    api("session")
      .then((r) => setAccount(r.account))
      .catch((e) => setError(e.message))
      .finally(() => setLoaded(true));
    api("directory")
      .then((r) => {
        setProfessionals(r.professionals);
        const p = r.professionals.find((p: Professional) =>
          path.endsWith("/" + p.id),
        );
        if (p) setSelected(p);
      })
      .catch((e) => setError(e.message))
      .finally(() => setDirectoryReady(true));
  }, []);
  useEffect(() => {
    const dismiss = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMobile(false);
    };
    window.addEventListener("keydown", dismiss);
    return () => window.removeEventListener("keydown", dismiss);
  }, []);
  const navigate = (next: string, url: string) => {
    if (url.startsWith("/mon-espace")) {
      location.href = account ? homeFor(account.role) : "/connexion";
      return;
    }
    setView(next);
    setModal(null);
    setError("");
    setMobile(false);
    history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };
  useEffect(() => {
    const pop = () => {
      setMobile(false);
      const p = location.pathname;
      setView(
        p === "/outils"
          ? "tools"
          : p === "/recherche"
            ? "search"
            : p.startsWith("/praticiens/")
              ? "profile"
              : "home",
      );
      const found = professionals.find((x) => p.endsWith("/" + x.id));
      if (found) setSelected(found);
      setModal(
        p === "/connexion" ? "login" : p === "/inscription" ? "signup" : null,
      );
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, [professionals]);
  const auth = (mode: string, role = "Patient") => {
    setAuthRole(
      (
        {
          Patient: "patient",
          Praticien: "professional",
          Intervenant: "worker",
        } as Record<string, string>
      )[role] || role,
    );
    setModal(mode);
    setError("");
    setMobile(false);
    setCreated(false);
    setRecovery("");
  };
  const close = () => {
    if (busy) return;
    setModal(null);
    setPending(false);
    setError("");
    setRecovery("");
    if (isWorkspace && !account) location.href = "/";
  };
  const showInfo = (text: string) => {
    setInfo(text);
    setModal("info");
  };
  const logout = async () => {
    try {
      await api("logout", {});
      location.href = "/";
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const loadSlots = async (p: Professional) => {
    setSlotsLoading(true);
    setSlots([]);
    try {
      setSlots((await api("slots&professional=" + p.id)).slots);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSlotsLoading(false);
    }
  };
  const openProfile = (p: Professional) => {
    setSelected(p);
    navigate("profile", "/praticiens/" + p.id);
  };
  const openBooking = (p: Professional) => {
    setSelected(p);
    setSlotId("");
    setSuccess(false);
    setError("");
    setModal("booking");
    setReason(
      p.role === "worker"
        ? "Coordination d’accompagnement"
        : "Première consultation",
    );
    loadSlots(p);
  };
  const norm = (s: string) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const results = professionals.filter(
    (p) =>
      norm(p.name + " " + p.specialty).includes(norm(query)) &&
      norm(p.city).includes(norm(city)) &&
      (category === "Tout" ||
        (category === "Orthodontiste"
          ? norm(p.specialty).includes("ortho")
          : category === "Chirurgien-dentiste"
            ? norm(p.specialty).includes("chirurg")
            : norm(p.specialty).includes("dent"))),
  );
  const doSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate("search", "/recherche");
  };
  const searchForm = (
    <form className="public-search" onSubmit={doSearch}>
      <label>
        <Search size={20} />
        <span>
          Un professionnel, une spécialité
          <input
            aria-label="Professionnel ou spécialité"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Orthodontiste, dentiste…"
          />
        </span>
      </label>
      <label>
        <MapPin size={20} />
        <span>
          Où souhaitez-vous consulter ?
          <input
            aria-label="Ville"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Ville ou arrondissement"
          />
        </span>
      </label>
      <button className="primary" type="submit">
        <Search size={18} />
        Rechercher
      </button>
    </form>
  );
  const card = (p: Professional) => (
    <article key={p.id} className="practitioner-card glass">
      <div className="practitioner-top">
        <Portrait p={p} />
        <span className="public-demo-tag">
          {p.verified ? "Identité vérifiée" : "Profil déclaratif"}
        </span>
      </div>
      <button className="name-link" onClick={() => openProfile(p)}>
        <h3>{p.name}</h3>
      </button>
      <strong className="specialty">{p.specialty}</strong>
      <p className="location">
        <MapPin size={14} />
        {p.city}
      </p>
      <div className="expertise-tags">
        <span>{roleLabel(p.role)}</span>
        <span>{p.languages}</span>
      </div>
      <div className="next-slot">
        <span className="dot" /> Prochaine disponibilité
        <strong>
          {p.next_slot ? dateFormat(p.next_slot) : "Aucun créneau publié"}
        </strong>
      </div>
      <div className="practitioner-actions">
        <button className="secondary" onClick={() => openProfile(p)}>
          Voir le profil
        </button>
        <button className="primary" onClick={() => openBooking(p)}>
          Prendre RDV
          <ArrowUpRight size={15} />
        </button>
      </div>
    </article>
  );
  const afterAuth = () => {
    setRecovery("");
    setCreated(false);
    if (pending && selected && account?.role === "patient") {
      setModal("booking");
      setPending(false);
    } else if (account) location.href = homeFor(account.role);
  };
  const authContent = (
    <>
      <span className="modal-emblem">
        <Smile size={25} />
      </span>
      <div className="eyebrow">ESPACE {roleLabel(authRole).toUpperCase()}</div>
      {created ? (
        <>
          <h2>Votre compte est prêt.</h2>
          <p>
            Conservez ce code de récupération dans votre gestionnaire de mots de
            passe. Il permet de réinitialiser votre mot de passe sans e-mail et
            ne sera plus affiché.
          </p>
          <code className="recovery-code">{recovery}</code>
          <button
            className="secondary full"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob(["Code de récupération SmilePec\n" + recovery], {
                  type: "text/plain",
                }),
              );
              const a = document.createElement("a");
              a.href = url;
              a.download = "amelib-code-recuperation.txt";
              a.click();
              URL.revokeObjectURL(url);
            }}
          >
            Télécharger mon code de récupération
          </button>
          <button className="primary full" onClick={afterAuth}>
            J’ai conservé mon code · Continuer
            <ArrowRight size={16} />
          </button>
        </>
      ) : (
        <>
          <h2>
            {modal === "signup"
              ? "Créer mon compte " + roleLabel(authRole).toLowerCase()
              : modal === "recover"
                ? "Récupérer mon compte"
                : "Connexion " + roleLabel(authRole).toLowerCase()}
          </h2>
          <p>
            {modal === "signup"
              ? "Votre type de compte détermine votre espace et ses accès."
              : "Connectez-vous avec votre e-mail et votre mot de passe."}
          </p>
          {authRole !== "admin" && (
            <div className="auth-tabs">
              <button
                className={modal === "signup" ? "selected" : ""}
                onClick={() => {
                  setModal("signup");
                  setError("");
                }}
              >
                Inscription
              </button>
              <button
                className={modal === "login" ? "selected" : ""}
                onClick={() => {
                  setModal("login");
                  setError("");
                }}
              >
                Connexion
              </button>
            </div>
          )}
          {authRole !== "admin" && (
            <div className="role-options">
              {["patient", "professional", "worker"].map((r) => (
                <button
                  key={r}
                  className={authRole === r ? "selected" : ""}
                  onClick={() => setAuthRole(r)}
                >
                  {r === "patient" ? (
                    <Smile size={20} />
                  ) : r === "professional" ? (
                    <Stethoscope size={20} />
                  ) : (
                    <Users size={20} />
                  )}
                  {roleLabel(r)}
                </button>
              ))}
            </div>
          )}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                const result = await api(
                  modal === "recover"
                    ? "recover"
                    : modal === "signup"
                      ? "signup"
                      : "login",
                  {
                    name: f.get("name"),
                    email: f.get("email"),
                    password: f.get("password"),
                    role: authRole,
                    recoveryCode: f.get("recoveryCode"),
                  },
                );
                setAccount(result.account);
                if (result.recoveryCode) {
                  setRecovery(result.recoveryCode);
                  setCreated(true);
                } else if (pending && selected) {
                  if (result.account.role !== "patient") {
                    setError(
                      "Les réservations sont réservées aux comptes patients.",
                    );
                    setPending(false);
                    return;
                  }
                  setModal("booking");
                  setPending(false);
                } else location.href = homeFor(result.account.role);
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            {modal === "signup" && (
              <label>
                Nom complet
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                />
              </label>
            )}
            <label>
              E-mail
              <input
                name="email"
                type="email"
                required
                maxLength={254}
                autoComplete="email"
              />
            </label>
            <label>
              {modal === "recover" ? "Nouveau mot de passe" : "Mot de passe"}
              <input
                name="password"
                type="password"
                minLength={12}
                maxLength={128}
                required
                autoComplete={
                  modal === "login" ? "current-password" : "new-password"
                }
              />
            </label>
            {modal !== "login" && <small>12 caractères minimum.</small>}
            {modal === "recover" && (
              <label>
                Code de récupération
                <input name="recoveryCode" required autoComplete="off" />
              </label>
            )}
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <button className="primary full" disabled={busy}>
              {busy
                ? "Un instant…"
                : modal === "signup"
                  ? "Créer mon compte"
                  : modal === "recover"
                    ? "Réinitialiser mon mot de passe"
                    : "Me connecter"}
              <ArrowRight size={16} />
            </button>
            {modal === "login" && (
              <button
                className="text-button forgot"
                type="button"
                onClick={() => {
                  setModal("recover");
                  setError("");
                }}
              >
                Mot de passe oublié ?
              </button>
            )}
            <p className="auth-disclosure">
              La plateforme est en phase de lancement. Utilisez des données de
              démonstration jusqu’à l’activation de l’hébergement HDS et de la
              vérification des e-mails.
            </p>
          </form>
        </>
      )}
    </>
  );
  if (isWorkspace) {
    if (!loaded)
      return (
        <div className="public-site">
          <p className="empty">Vérification de votre session…</p>
        </div>
      );
    if (!account)
      return (
        <div className="public-site">
          <header className="public-header">
            <Logo />
            <a href="/" className="secondary">
              Retour au site
            </a>
          </header>
          <section className="public-section restricted">
            <ShieldCheck size={35} />
            <h1>Un espace personnel, un accès protégé.</h1>
            <p>Connectez-vous au compte correspondant à cet espace.</p>
            <button
              className="primary"
              onClick={() =>
                auth(
                  "login",
                  path === "/admin"
                    ? "admin"
                    : path === "/pro"
                      ? "professional"
                      : path === "/intervenant"
                        ? "worker"
                        : "patient",
                )
              }
            >
              Connexion
            </button>
            {path !== "/admin" && (
              <button
                className="secondary"
                onClick={() =>
                  auth(
                    "signup",
                    path === "/pro"
                      ? "professional"
                      : path === "/intervenant"
                        ? "worker"
                        : "patient",
                  )
                }
              >
                Créer mon compte
              </button>
            )}
          </section>
          {modal && (
            <Dialog title="Authentification" close={close}>
              {authContent}
            </Dialog>
          )}
        </div>
      );
    if (
      path !== homeFor(account.role) &&
      path !== "/mon-espace" &&
      !(account.role === "admin" && path === "/pro")
    )
      return (
        <div className="public-site">
          <section className="public-section restricted">
            <ShieldCheck size={35} />
            <h1>Cet espace n’est pas celui de votre compte.</h1>
            <p>
              Vous êtes connecté en tant que{" "}
              {roleLabel(account.role).toLowerCase()}.
            </p>
            <a href={homeFor(account.role)} className="primary">
              Ouvrir mon espace
            </a>
          </section>
        </div>
      );
    return account.role === "admin" && path !== "/pro" ? (
      <AdminConsole account={account} logout={logout} />
    ) : account.role === "patient" ? (
      <Workspace account={account} logout={logout} />
    ) : (
      <ProSuite account={account} logout={logout} />
    );
  }
  return (
    <div className="public-site">
      <header className="public-header">
        <Logo />
        <nav
          className={mobile ? "public-links expanded" : "public-links"}
          onClick={(e) => {
            if ((e.target as Element).closest("a,button")) setMobile(false);
          }}
        >
          <button onClick={() => navigate("search", "/recherche")}>
            Trouver un praticien
          </button>
          <a href="/outils">Les outils SmilePec</a>
          <a href="/#professionnels">Vous êtes professionnel ?</a>
        </nav>
        <div className="public-auth">
          {account ? (
            <>
              <a className="login-button" href={homeFor(account.role)}>
                Mon espace
              </a>
              <button
                className="icon-button"
                aria-label="Se déconnecter"
                onClick={logout}
              >
                <LogOut size={18} />
              </button>
            </>
          ) : (
            <>
              <button className="login-button" onClick={() => auth("login")}>
                Connexion
              </button>
              <button className="primary" onClick={() => auth("signup")}>
                Inscription <ArrowUpRight size={15} />
              </button>
            </>
          )}
          <button
            className="public-menu icon-button"
            aria-label="Menu"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            {mobile ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {error && !modal && (
        <p className="form-error public-error" role="alert">
          {error}
        </p>
      )}
      {view === "home" && (
        <>
          <section className="public-hero">
            <div className="hero-copy">
              <span className="hero-kicker">
                <span className="dot" /> L’EXPERTISE DU TIERS PAYANT DENTAIRE
              </span>
              <h1>
                Votre cabinet.
                <br />
                Mieux accompagné.
                <br />
                <span>À chaque étape.</span>
              </h1>
              <p>
                SmilePec aide les cabinets dentaires à estimer, gérer et
                récupérer
                <br className="desktop-break" /> leur tiers payant. Les patients
                trouvent leur dentiste et réservent en ligne.
              </p>
              <div className="hero-people">
                <div className="avatar-stack">
                  {professionals.slice(0, 3).map((p) => (
                    <span className={`avatar small ${"blue"}`} key={p.id}>
                      {p.photo_data ? (
                        <img src={p.photo_data} alt="" />
                      ) : (
                        p.name
                          .split(" ")
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join("")
                      )}
                    </span>
                  ))}
                </div>
                <span>
                  Dentistes, équipes de cabinet et patients.
                  <br />
                  <strong>Un même espace, du rendez-vous au règlement.</strong>
                </span>
              </div>
            </div>
            <div className="public-hero-art" aria-hidden="true">
              <img
                className="hero-care-photo"
                src="/amelib-care-team.webp"
                alt=""
              />
              <div className="halo halo-one" />
              <div className="halo halo-two" />
              <div className="smile-sculpture">
                <div className="sculpture-shine" />
                <svg viewBox="0 0 200 200">
                  <path d="M52 107 Q100 161 148 107" />
                  <path d="M64 70v7M136 70v7" />
                </svg>
              </div>
              <div className="art-appointment glass">
                <span className="art-check">
                  <Check size={18} />
                </span>
                <div>
                  <strong>Un rendez-vous. Un premier pas.</strong>
                  <small>Votre sourire commence ici.</small>
                </div>
                <CalendarDays size={19} />
              </div>
              <div className="art-care glass">
                <Heart size={21} />
                <span>
                  Plus proches.
                  <br />
                  <strong>Pour mieux soigner.</strong>
                </span>
              </div>
              <span className="hero-spark spark-a">✧</span>
              <span className="hero-spark spark-b">✧</span>
            </div>
            <div className="hero-search-wrap">
              {searchForm}
              <div className="search-suggestions">
                <span>Je recherche</span>
                {["Dentiste", "Orthodontiste", "Chirurgien-dentiste"].map(
                  (c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setCategory(c);
                        setQuery("");
                        setCity("");
                        navigate("search", "/recherche");
                      }}
                    >
                      {c}
                      <ArrowUpRight size={12} />
                    </button>
                  ),
                )}
              </div>
            </div>
          </section>
          <section className="public-benefits">
            <div>
              <CalendarDays />
              <span>
                Un rendez-vous
                <br />
                <strong>en quelques clics</strong>
              </span>
            </div>
            <div>
              <Users />
              <span>
                Des professionnels
                <br />
                <strong>qui travaillent ensemble</strong>
              </span>
            </div>
            <div>
              <Heart />
              <span>
                Un accompagnement
                <br />
                <strong>à chaque étape</strong>
              </span>
            </div>
            <div>
              <Smile />
              <span>
                Au cabinet, à domicile
                <br />
                <strong>toujours à vos côtés</strong>
              </span>
            </div>
          </section>
          <section className="smilepec-services public-section">
            <div className="assistant-home glass">
              <div><div className="eyebrow">ASSISTANT SMILEPEC</div><h2>Vos informations utiles, au bon moment.</h2><p>Dans chaque espace, l’assistant répond à partir des données autorisées : priorités de pose, agenda, tâches, devis et factures pour le cabinet ; pilotage global pour Amel.</p></div>
              <div className="assistant-home-chat"><strong>Que dois-je prioriser aujourd’hui ?</strong><span>Les poses de prothèse, les échéances et les tâches ouvertes sont réunies dans votre espace.</span></div>
            </div>
            <div className="public-section-heading">
              <div>
                <div className="eyebrow">
                  SMILEPEC POUR LES CABINETS DENTAIRES
                </div>
                <h2>Le tiers payant, pris en charge de bout en bout.</h2>
                <p>
                  Une gestion à distance partout en France, adaptée à votre
                  organisation.
                </p>
              </div>
              <button className="secondary" onClick={() => auth("signup", "professional")}>
                Inscrire mon cabinet <ArrowUpRight size={15} />
              </button>
            </div>
            <div className="smilepec-service-grid">
              {[
                {
                  title: "Gestion complète",
                  text: "De la demande d’accord au rapprochement mensuel, déléguez le cycle administratif complet.",
                },
                {
                  title: "Estimation optimisée",
                  text: "Sécurisez vos plans de traitement avec une estimation précise et adaptée au dossier.",
                },
                {
                  title: "Optimisation du tiers payant",
                  text: "Associez estimation et gestion complète pour limiter les écarts et les retards.",
                },
                {
                  title: "Reprise des impayés",
                  text: "Confiez les dossiers tiers payant impayés des six derniers mois à une spécialiste.",
                },
              ].map((s, i) => (
                <article className="glass" key={s.title}>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
            <div className="smilepec-callout">
              <div>
                <strong>Analyse gratuite de 5 dossiers impayés</strong>
                <small>Un premier diagnostic concret, sans engagement.</small>
              </div>
              <a className="primary" href="mailto:contact@smilepec.fr">
                Demander mon analyse
              </a>
            </div>
          </section>
          <section className="public-section">
            <div className="public-section-heading">
              <div>
                <div className="eyebrow">LA RENCONTRE QUI CHANGE TOUT</div>
                <h2>À chaque sourire, son praticien.</h2>
                <p>
                  Rencontrez les dentistes qui rejoignent le réseau SmilePec.
                </p>
              </div>
              <button
                className="text-button"
                onClick={() => navigate("search", "/recherche")}
              >
                Explorer les praticiens <ArrowRight size={16} />
              </button>
            </div>
            <div className="public-professionals">
              {professionals.slice(0, 3).map(card)}
              {directoryReady && !professionals.length && (
                <article className="glass launch-card">
                  <Stethoscope size={30} />
                  <h3>Le réseau commence avec vous.</h3>
                  <p>
                    Les premiers cabinets peuvent dès maintenant créer leur
                    profil et ouvrir leurs disponibilités.
                  </p>
                  <button
                    className="primary"
                    onClick={() => auth("signup", "Praticien")}
                  >
                    Inscrire mon cabinet <ArrowRight size={16} />
                  </button>
                </article>
              )}
            </div>
          </section>
          <ToolsPreview />
          <section className="how-section public-section" id="comment">
            <div className="eyebrow">C’EST SIMPLE, ET ÇA CHANGE TOUT</div>
            <h2>
              Moins de démarches.
              <br />
              Plus de place pour vous.
            </h2>
            <div className="how-grid">
              {[
                {
                  icon: Search,
                  title: "Trouvez votre praticien",
                  text: "Une spécialité, une ville, une équipe qui correspond à vos besoins.",
                },
                {
                  icon: CalendarDays,
                  title: "Choisissez votre moment",
                  text: "Consultez les créneaux et choisissez le rendez-vous qui vous convient.",
                },
                {
                  icon: Heart,
                  title: "Gardez le lien",
                  text: "Retrouvez vos rendez-vous et les informations de votre parcours dans votre espace.",
                },
              ].map((s, i) => (
                <article key={s.title}>
                  <div className="how-icon">
                    <s.icon size={24} />
                  </div>
                  <h3>{s.title}</h3>
                  <p>{s.text}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="pro-banner public-section" id="professionnels">
            <div>
              <span className="pill">
                <Stethoscope size={13} /> SMILEPEC POUR LES DENTISTES
              </span>
              <h2>
                Soignez. Pilotez.
                <br />
                SmilePec gère le reste.
              </h2>
              <p>
                Agenda, dossiers dentaires, équipe, factures et tiers payant :
                <br />
                votre cabinet dispose enfin d’un espace complet, avec
                l’expertise SmilePec à la demande.
              </p>
              <div className="pro-banner-actions">
                <button
                  className="primary"
                  onClick={() => auth("signup", "Praticien")}
                >
                  Rejoindre comme professionnel <ArrowRight size={16} />
                </button>
                <a className="secondary" href="/pro">
                  Explorer l’espace pro
                </a>
              </div>
            </div>
            <div className="pro-visual glass">
              <div className="section-title">
                <span className="stat-icon blue">
                  <Stethoscope size={21} />
                </span>
                <span className="pill">Votre cabinet, connecté</span>
              </div>
              <h3>
                Plus de liens.
                <br />
                Moins de distance.
              </h3>
              <div className="pro-feature">
                <Check size={15} /> Votre profil professionnel
              </div>
              <div className="pro-feature">
                <Check size={15} /> Vos rendez-vous et vos patients
              </div>
              <div className="pro-feature">
                <Check size={15} /> Votre équipe, au même endroit
              </div>
            </div>
          </section>
          <section className="public-section faq-section">
            <div>
              <div className="eyebrow">ON VOUS RÉPOND</div>
              <h2>
                Avant de faire
                <br />
                le premier pas.
              </h2>
            </div>
            <div className="faq-list">
              <details>
                <summary>À qui s’adresse SmilePec ?</summary>
                <p>
                  Aux patients et aux familles qui recherchent un parcours de
                  soins dentaires ou orthodontiques, ainsi qu’aux praticiens et
                  à leurs équipes.
                </p>
              </details>
              <details>
                <summary>Puis-je réserver un vrai rendez-vous ?</summary>
                <p>
                  Oui, les créneaux affichés sont publiés par les professionnels
                  inscrits. Votre réservation est enregistrée et visible dans
                  votre espace patient et dans leur agenda. Aucun paiement en
                  ligne n’est demandé.
                </p>
              </details>
              <details>
                <summary>
                  Comment se passe l’accompagnement à domicile ?
                </summary>
                <p>
                  Les demandes d’accompagnement sont coordonnées avec un
                  praticien. Le suivi GPS en direct n’est pas encore ouvert.
                </p>
              </details>
              <details>
                <summary>Comment rejoindre le réseau professionnel ?</summary>
                <p>
                  Choisissez « Inscription », puis votre profil professionnel.
                  Complétez votre profil, publiez-le puis ajoutez vos
                  disponibilités. Les patients peuvent alors vous trouver et
                  réserver. Votre identité professionnelle reste déclarative
                  jusqu’au contrôle par l’administration.
                </p>
              </details>
            </div>
          </section>
          <section className="join-strip">
            <Smile size={28} />
            <div>
              <h2>Votre prochain sourire commence ici.</h2>
              <p>Un espace pour vous. Une équipe autour de vous.</p>
            </div>
            <button className="primary" onClick={() => auth("signup")}>
              Créer mon espace <ArrowRight size={16} />
            </button>
          </section>
        </>
      )}

      {view === "tools" && <ToolsPage />}
      {view === "search" && (
        <section className="public-section search-page">
          <div className="eyebrow">PRENEZ LE TEMPS DE CHOISIR</div>
          <h1>Trouvez votre dentiste.</h1>
          <p>
            Des profils de dentistes et des créneaux publiés directement par les
            cabinets.
          </p>
          {searchForm}
          <div className="filter-row">
            {["Tout", "Dentiste", "Orthodontiste", "Chirurgien-dentiste"].map(
              (c) => (
                <button
                  className={category === c ? "selected" : ""}
                  onClick={() => setCategory(c)}
                  key={c}
                >
                  {c}
                </button>
              ),
            )}
          </div>
          <div className="results-heading">
            <h2>
              {results.length} professionnel{results.length > 1 ? "s" : ""}
            </h2>
          </div>
          <div className="public-practitioners">{results.map(card)}</div>
          {!directoryReady ? (
            <p className="empty">Recherche des praticiens…</p>
          ) : (
            !results.length && (
              <div className="glass search-empty">
                <Search size={32} />
                <h2>Aucun profil publié pour cette recherche.</h2>
                <p>
                  Le réseau ouvre ses portes. Les praticiens apparaissent dès
                  qu’ils publient leur profil.
                </p>
                <button
                  className="secondary"
                  onClick={() => {
                    setQuery("");
                    setCity("");
                    setCategory("Tout");
                  }}
                >
                  Réinitialiser la recherche
                </button>
                <button
                  className="primary"
                  onClick={() => auth("signup", "Praticien")}
                >
                  Inscrire mon cabinet
                </button>
              </div>
            )
          )}
        </section>
      )}
      {view === "profile" &&
        (selected ? (
          <section className="public-section public-profile">
            <button
              className="text-button"
              onClick={() => navigate("search", "/recherche")}
            >
              <ChevronLeft size={16} />
              Retour aux praticiens
            </button>
            <div className="public-profile-layout">
              <div>
                <div className="glass profile-summary">
                  <div className="public-profile-cover blue">
                    {selected.logo_data && (
                      <img src={selected.logo_data} alt="Logo du cabinet" />
                    )}
                    <span>
                      {selected.headline || "Chaque sourire compte. ✧"}
                    </span>
                  </div>
                  <Portrait p={selected} large />
                  <span className="public-demo-tag">
                    {selected.verified
                      ? "Identité professionnelle vérifiée"
                      : "Informations déclarées par le professionnel"}
                  </span>
                  <h1>{selected.name}</h1>
                  <strong className="specialty">{selected.specialty}</strong>
                  <p className="location">
                    <MapPin size={16} />
                    {selected.city}
                  </p>
                </div>
                <div className="glass profile-details">
                  <h2>Présentation</h2>
                  <p>
                    {selected.bio ||
                      "Le professionnel complètera bientôt sa présentation."}
                  </p>
                  <h2>Prestations & tarifs</h2>
                  {selected.services?.length ? (
                    <div className="public-services">
                      {selected.services.map((s) => (
                        <div key={s.id}>
                          <div>
                            <strong>{s.name}</strong>
                            <small>
                              {s.duration} min · {s.description}
                            </small>
                          </div>
                          <b>{money(Number(s.price))}</b>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p>Le catalogue détaillé sera bientôt publié.</p>
                  )}
                  <h2>Formation et qualifications</h2>
                  <p>{selected.qualifications || "Non renseignées"}</p>
                  <h2>Langues</h2>
                  <p>{selected.languages || "Non renseignées"}</p>
                  <h2>Lieu de consultation</h2>
                  <p>{selected.address}</p>
                </div>
              </div>
              <aside className="glass public-booking-aside">
                <CalendarDays size={25} />
                <h2>Votre prochain rendez-vous</h2>
                <p>Avec {selected.name}</p>
                <div className="detail-block">
                  <span>Prochaine disponibilité</span>
                  <strong>
                    {selected.next_slot
                      ? dateFormat(selected.next_slot)
                      : "Aucun créneau publié"}
                  </strong>
                </div>
                {selected.services?.length > 0 && (
                  <p>
                    Prestations à partir de{" "}
                    {money(
                      Math.min(
                        ...selected.services.map((s) => Number(s.price)),
                      ),
                    )}
                  </p>
                )}
                <button
                  className="primary full"
                  onClick={() =>
                    selected.booking_url
                      ? window.open(
                          selected.booking_url,
                          "_blank",
                          "noopener,noreferrer",
                        )
                      : openBooking(selected)
                  }
                >
                  {selected.booking_url
                    ? "Ouvrir l’agenda connecté"
                    : "Choisir un créneau"}
                  <ArrowRight size={16} />
                </button>
                <button
                  className="secondary full contact-trigger"
                  onClick={() => setContactOpen(!contactOpen)}
                >
                  <MessageCircle />
                  Contacter
                </button>
                <small>
                  Heures affichées à l’heure de Paris. Aucun paiement en ligne.
                </small>
              </aside>
            </div>
            <div
              className={`profile-contact-glass ${contactOpen ? "open" : ""}`}
            >
              <button
                className="icon-button"
                onClick={() => setContactOpen(false)}
                aria-label="Fermer"
              >
                <X />
              </button>
              <div className="contact-person">
                <Portrait p={selected} />
                <div>
                  <strong>{selected.name}</strong>
                  <small>{selected.specialty}</small>
                </div>
              </div>
              {selected.phone && (
                <a href={"tel:" + selected.phone}>
                  <Phone />
                  <span>
                    <strong>Appeler</strong>
                    <small>{selected.phone}</small>
                  </span>
                </a>
              )}
              {selected.phone && (
                <a href={"sms:" + selected.phone}>
                  <MessageCircle />
                  <span>
                    <strong>Envoyer un SMS</strong>
                    <small>Réponse directe sur mobile</small>
                  </span>
                </a>
              )}
              {selected.contact_email && (
                <a href={"mailto:" + selected.contact_email}>
                  <Mail />
                  <span>
                    <strong>Envoyer un courriel</strong>
                    <small>{selected.contact_email}</small>
                  </span>
                </a>
              )}
              {selected.booking_url && (
                <a href={selected.booking_url} target="_blank" rel="noreferrer">
                  <CalendarDays />
                  <span>
                    <strong>Prendre rendez-vous</strong>
                    <small>
                      Ouvrir {selected.calendar_provider || "l’agenda connecté"}
                    </small>
                  </span>
                </a>
              )}
              {selected.website && (
                <a href={selected.website} target="_blank" rel="noreferrer">
                  <Globe />
                  <span>
                    <strong>Voir le site</strong>
                    <small>
                      {selected.website.replace(/^https?:\/\//, "")}
                    </small>
                  </span>
                </a>
              )}
            </div>
          </section>
        ) : (
          <section className="public-section search-empty">
            <h1>
              {directoryReady
                ? "Profil introuvable ou non publié."
                : "Chargement du profil…"}
            </h1>
            <a href="/recherche" className="secondary">
              Retour à la recherche
            </a>
          </section>
        ))}
      <nav className="public-app-dock" aria-label="Navigation mobile">
        <button
          className={view === "home" ? "active" : ""}
          onClick={() => navigate("home", "/")}
        >
          <Smile size={21} />
          Accueil
        </button>
        <button
          className={view === "search" || view === "profile" ? "active" : ""}
          onClick={() => navigate("search", "/recherche")}
        >
          <Search size={21} />
          Rechercher
        </button>
        <button
          className={view === "tools" ? "active" : ""}
          onClick={() => navigate("tools", "/outils")}
        >
          <Stethoscope size={21} />
          Outils
        </button>
        <button
          onClick={() => {
            if (account) location.href = homeFor(account.role);
            else auth("login");
          }}
        >
          <Users size={21} />
          Mon espace
        </button>
      </nav>
      <footer className="public-footer">
        <div>
          <Logo />
          <p>Le tiers payant dentaire, maîtrisé.</p>
        </div>
        <div>
          <strong>Patients</strong>
          <a href="/recherche">Trouver un praticien</a>
          <a href="/patient">Mes rendez-vous</a>
          <a href="/outils">Tous les outils</a>
          <button onClick={() => auth("signup")}>
            Créer mon compte patient
          </button>
        </div>
        <div>
          <strong>Professionnels</strong>
          <button onClick={() => auth("signup", "Praticien")}>
            Inscrire mon cabinet
          </button>
          <a href="/pro">Espace professionnel</a>
          <a href="/intervenant">Espace intervenant</a>
        </div>
        <div>
          <strong>{publicSettings.name} · en lancement</strong>
          {publicSettings.support_email && (
            <a href={"mailto:" + publicSettings.support_email}>
              {publicSettings.support_email}
            </a>
          )}
          <a href="tel:+33745134481">07 45 13 44 81</a>
          <p>
            Gestion du tiers payant à distance, partout en France.
            <br />
            Dossiers patients de démonstration uniquement avant hébergement HDS.
          </p>
          <button
            onClick={() =>
              showInfo(
                "Vos informations de compte et de rendez-vous sont conservées dans la base SmilePec, hébergée dans la région de Francfort. Les mots de passe sont hachés et les sessions utilisent un cookie HTTP-only. L’accès aux dossiers est limité par compte et par rôle. Cette version reste une démonstration : aucune donnée réelle de santé ne doit être saisie avant la migration vers un hébergeur certifié HDS, la validation des habilitations et la vérification des e-mails.",
              )
            }
          >
            Informations sur les données
          </button>
        </div>
        <div className="coming-apps">
          <span>Bientôt dans votre poche</span>
          <div>
            <span>
              <SiApple /> App Store
              <small>Bientôt sur iPhone</small>
            </span>
            <span>
              <SiAndroid /> Android
              <small>Bientôt sur Google Play</small>
            </span>
          </div>
        </div>
        <div className="public-footer-bottom">
          <span>
            © {new Date().getFullYear()} SmilePec · Le tiers payant dentaire,
            maîtrisé.
          </span>
          <span>Imaginé pour rapprocher le soin.</span>
        </div>
      </footer>
      {modal && (
        <Dialog
          title={
            modal === "booking"
              ? "Prendre rendez-vous"
              : "Votre espace SmilePec"
          }
          close={close}
        >
          {["signup", "login", "recover"].includes(modal) ? (
            authContent
          ) : modal === "info" ? (
            <>
              <h2>Vos informations</h2>
              <p>{info}</p>
            </>
          ) : (
            modal === "booking" &&
            selected &&
            (success ? (
              <div className="booking-success">
                <span className="success-check">
                  <Check size={30} />
                </span>
                <h2>Votre rendez-vous est confirmé.</h2>
                <p>
                  Il est enregistré dans votre espace patient et dans l’agenda
                  du professionnel.
                </p>
                <a className="primary full" href="/patient">
                  Voir mon rendez-vous
                </a>
              </div>
            ) : (
              <>
                <div className="booking-doctor">
                  <Portrait p={selected} />
                  <div>
                    <h2>{selected.name}</h2>
                    <p>{selected.specialty}</p>
                  </div>
                </div>
                <h2>Choisissez votre rendez-vous.</h2>
                {account && account.role !== "patient" ? (
                  <>
                    <p>
                      Vous êtes connecté avec un compte{" "}
                      {roleLabel(account.role).toLowerCase()}. La réservation
                      nécessite un compte patient distinct.
                    </p>
                    <button className="secondary full" onClick={logout}>
                      Me déconnecter
                    </button>
                  </>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      setError("");
                      if (!slotId) {
                        setError("Choisissez un créneau disponible.");
                        return;
                      }
                      if (!account) {
                        setPending(true);
                        auth("signup");
                        return;
                      }
                      setBusy(true);
                      try {
                        await api("book", { slot_id: slotId, reason });
                        setSuccess(true);
                      } catch (e) {
                        setError((e as Error).message);
                        loadSlots(selected);
                        setSlotId("");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <label>
                      Motif
                      <select
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                      >
                        {[
                          "Première consultation",
                          "Suivi orthodontique",
                          "Bilan bucco-dentaire",
                          "Contention",
                          "Coordination d’accompagnement",
                        ].map((r) => (
                          <option key={r}>{r}</option>
                        ))}
                      </select>
                    </label>
                    <p className="slot-caption">
                      Créneaux disponibles · Heure de Paris
                    </p>
                    <div className="real-slot-grid">
                      {slots.map((s) => (
                        <button
                          type="button"
                          key={s.id}
                          aria-pressed={slotId === s.id}
                          className={slotId === s.id ? "selected" : ""}
                          onClick={() => setSlotId(s.id)}
                        >
                          {dateFormat(s.starts_at)}
                          <small>{s.duration} min</small>
                        </button>
                      ))}
                    </div>
                    {slotsLoading ? (
                      <p className="empty">Chargement…</p>
                    ) : (
                      !slots.length && (
                        <p className="empty">
                          Ce professionnel n’a pas de créneau disponible.
                        </p>
                      )
                    )}
                    {error && (
                      <p className="form-error" role="alert">
                        {error}
                      </p>
                    )}
                    <button className="primary full" disabled={busy || !slotId}>
                      {busy
                        ? "Réservation…"
                        : account
                          ? "Confirmer mon rendez-vous"
                          : "Continuer avec mon compte"}
                      <ArrowRight size={16} />
                    </button>
                    <small>
                      Votre réservation est partagée avec ce professionnel.
                    </small>
                  </form>
                )}
              </>
            ))
          )}
        </Dialog>
      )}
    </div>
  );
}
