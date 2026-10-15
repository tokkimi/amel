import OriginalHeadline from './OriginalHeadline';
import SessionDrafts from './SessionDrafts';
import {SMILEPEC_HERO,SmilePecOffers,SmilePecServiceDetails} from './SmilePecHome';
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  Check,
  ChevronLeft,
  Globe,
  Folder,
  Heart,
  House,
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
  UserRound,
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
import ToolsPage from "./PublicServiceTools";
import AdminConsole from "./AdminConsole";
import CollaborationPanel, { CabinetAccess } from './CollaborationPanel';
import SmilePecAssistant from "./SmilePecAssistant";

function Logo() {
  return (
    <a className="brand" href="/"><img className="brand-full-logo" src="/brand/smilepec-original-logo.svg" alt="SmilePec" /></a>
  );
}
function ToothIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7.1 3.4c1.5 0 2.3.8 4.9.8s3.4-.8 4.9-.8c2.3 0 4 1.9 3.8 4.5-.2 2.6-1.4 5.2-2.7 7.9-.9 1.9-1.5 4.5-2.8 4.5-1.6 0-1.2-4.7-3.2-4.7s-1.6 4.7-3.2 4.7c-1.3 0-1.9-2.6-2.8-4.5-1.3-2.7-2.5-5.3-2.7-7.9C3.1 5.3 4.8 3.4 7.1 3.4Z" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9.2 7.6c.8.4 1.7.6 2.8.6 1.1 0 2-.2 2.8-.6" stroke="currentColor" strokeWidth="1.35" strokeLinecap="round" />
    </svg>
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
  const [headerVisible, setHeaderVisible] = useState(true);
  const headerScroll = useRef(0);
  const path = window.location.pathname;
  const isWorkspace = [
    "/patient",
    "/pro",
    "/intervenant",
    "/admin",
    "/mon-espace",
    "/smilepec",
  ].includes(path);
  const [view, setView] = useState(path === "/outils" ? "tools" : "home");
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
    [authRole, setAuthRole] = useState(path === "/admin" ? "admin" : "professional"),
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
    setDirectoryReady(true);
  }, []);
  useEffect(() => {
    if (isWorkspace) return;
    const updateHeader = () => {
      const current = window.scrollY;
      setHeaderVisible(current < 72 || current < headerScroll.current);
      headerScroll.current = current;
    };
    window.addEventListener("scroll", updateHeader, { passive: true });
    return () => window.removeEventListener("scroll", updateHeader);
  }, [isWorkspace]);
  useEffect(() => {
    if (!isWorkspace && (path === "/recherche" || path.startsWith("/praticiens/")))
      history.replaceState({}, "", "/");
  }, [isWorkspace, path]);
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
      setView(p === "/outils" ? "tools" : "home");
      const found = professionals.find((x) => p.endsWith("/" + x.id));
      if (found) setSelected(found);
      setModal(
        p === "/connexion" ? "login" : p === "/inscription" ? "signup" : null,
      );
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, [professionals]);
  const auth = (mode: string, role = "Praticien") => {
    setAuthRole(
      (
        {
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
              ? "Créez votre accès pour contacter SmilePec. Après votre rendez-vous et l’acceptation du devis, les outils de votre cabinet seront ouverts."
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
              {["professional"].map((r) => (
                <button
                  key={r}
                  className={authRole === r ? "selected" : ""}
                  onClick={() => setAuthRole(r)}
                >
                  {r === "professional" ? (
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
                    : path === "/pro" || path === "/smilepec"
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
                    path === "/pro" || path === "/smilepec"
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
    if(path === '/smilepec' && ['admin','professional','worker'].includes(account.role)) return <><SessionDrafts accountId={account.id}/><CollaborationPanel account={account} standalone /></>;
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
    return <>
      <SessionDrafts accountId={account.id}/>
      {account.role === "admin" ? (
        <AdminConsole account={account} logout={logout} />
      ) : account.role === "patient" ? (
        <Workspace account={account} logout={logout} />
      ) : (
        <CabinetAccess account={account} logout={logout}><ProSuite account={account} logout={logout} /><SmilePecAssistant role={account.role}/></CabinetAccess>
      )}
      {["admin","patient"].includes(account.role)&&<SmilePecAssistant role={account.role} />}
    </>;
  }
  return (
    <div className="public-site">
      <header className={`public-header ${headerVisible ? "is-visible" : "is-hidden"}`}>
        <Logo />
        <nav
          className={mobile ? "public-links expanded" : "public-links"}
          onClick={(e) => {
            if ((e.target as Element).closest("a,button")){setMobile(false);const menu=(e.target as Element).closest("details");if(menu)menu.open=false;}
          }}
        >
          <details className="public-offers-menu"><summary>Nos offres</summary><div>{[['gestion','Gestion Tiers Payant complète'],['estimation','Optimisation des Estimations'],['optimisation','Optimisation Tiers Payant'],['conventionnement','Conventionnement'],['reprise','Reprise de portefeuille']].map(([id,label])=><a key={id} href={'/#'+id}>{label}</a>)}</div></details>
          <a href="/outils">Nos outils</a>
          <a href="/#contact">Nous contacter</a>
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
                Créer mon compte cabinet <ArrowUpRight size={15} />
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
          <section className="public-hero" id="hero">
            <div className="hero-copy">
              <span className="hero-kicker">
                <span className="dot" /> TIERS PAYANT · OPTIMISÉ
              </span>
              <OriginalHeadline/>
              <p>
                Gestion et optimisation du tiers payant dentaire : estimations optimisées, suivi des prises en charge et reprise des dossiers impayés.
              </p>
              <div className="hero-people">
                <span>
                  Dentistes, équipes de cabinet et SmilePec.
                  <br />
                  <strong>Un même espace, du dossier au règlement.</strong>
                </span>
              </div>
            </div>
            <div className="public-hero-art" aria-hidden="true">
              <img
                className="hero-care-photo"
                src="/amelib-care-team.webp"
                alt=""
              />
            </div>
            <aside className="hero-quote" aria-label="Promesse SmilePec">
              <span><Heart size={22} /></span>
              <p>« Des patients sereins,<br />un cabinet plus fluide. »</p>
            </aside>
            <div className="hero-search-wrap">
              <div className="hero-actions">
                <a className="primary" href="#preuve">Découvrir nos offres <ArrowRight size={16}/></a><a className="secondary" href="#contact">Nous contacter</a>
              </div>
            </div>
          </section>
          <SmilePecOffers />
          <SmilePecServiceDetails />
          <ToolsPage compact />
          <section className="public-section faq-section">
            <div>
              <div className="eyebrow">ON VOUS RÉPOND</div>
              <h2>
                Avant de faire
                <br />
                le premier pas.
              </h2>
            </div>
            <div className="faq-list"><details><summary>À qui s’adresse SmilePec ?</summary><p>Aux cabinets dentaires qui souhaitent déléguer la gestion du tiers payant, optimiser leurs estimations ou reprendre des dossiers impayés.</p></details><details><summary>Comment démarrer avec SmilePec ?</summary><p>Créez votre compte cabinet, transmettez votre demande puis organisez un rendez-vous avec l’équipe SmilePec. Votre proposition est disponible dans votre espace pour consultation et décision.</p></details><details><summary>Comment transmettre mes dossiers ?</summary><p>Après acceptation de votre devis SmilePec, transmettez les fiches et pièces nécessaires dans votre espace cabinet. Retrouvez vos échanges, documents reçus et rendez-vous avec l’équipe au même endroit.</p></details></div></section>
        </>
      )}
      {view === "tools" && <ToolsPage />}
      <nav className="public-app-dock" aria-label="Navigation mobile">
        <button
          className={view === "home" ? "active" : ""}
          onClick={() => navigate("home", "/")}
        >
          <House size={22} />
          Accueil
        </button>
        <button
          onClick={() => { if (view !== "home") { location.href = "/#preuve"; return; } document.getElementById("preuve")?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth" }); }}
        >
          <ToothIcon size={22} />
          Nos offres
        </button>
        <button
          className={view === "tools" ? "active" : ""}
          onClick={() => navigate("tools", "/outils")}
        >
          <CalendarDays size={22} />
          Nos outils
        </button>
        <button
          onClick={() => {
            if (account) location.href = homeFor(account.role);
            else auth("login");
          }}
        >
          <UserRound size={22} />
          Mon espace
        </button>
      </nav>
      <footer className="public-footer">
        <div>
          <Logo />
          <p>Le tiers payant dentaire, maîtrisé.</p>
          <small>PENSÉ DANS LES MOINDRES DÉTAILS</small>
        </div>
        <div>
          <strong>Cabinets dentaires</strong>
          <a href="/#preuve">Nos offres</a>
          <a href={view==='home'?'#reprise':'/#reprise'}>Reprise des impayés</a>
          <a href={view==='home'?'#contact':'/#contact'}>Contact</a>
          <a href="/outils">Tous les outils</a>

        </div>
        <div>
          <strong>Espace cabinet</strong>
          <a href="/pro">Connexion</a>
          <span>Les membres de l’équipe reçoivent une invitation interne.</span>
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
        <div className="public-footer-bottom">
          <span>
            © {new Date().getFullYear()} SmilePec · Le tiers payant dentaire,
            maîtrisé.
          </span>
          <span>Pensé dans les moindres détails.</span>
        </div>
      </footer>
      {modal&&modal!=='booking'&&<Dialog title="Votre espace SmilePec" close={close}>{modal==='info'?<><h2>Vos informations</h2><p>{info}</p></>:authContent}</Dialog>}
    </div>
  );
}
