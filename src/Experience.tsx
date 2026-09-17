import React, { useEffect, useState } from "react";
import {
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock,
  Heart,
  MapPin,
  MessageCircle,
  Navigation,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Users,
  Wallet,
  X,
} from "lucide-react";

const steps = [
  {
    label: "Mission confirmée",
    note: "Votre intervenante prépare sa visite.",
    eta: "Départ à venir",
    position: 0,
  },
  {
    label: "Julie est en route",
    note: "Son trajet est partagé pendant la mission.",
    eta: "8 min",
    position: 1,
  },
  {
    label: "Julie est à proximité",
    note: "Vous pouvez préparer son arrivée.",
    eta: "2 min",
    position: 2,
  },
  {
    label: "Julie est arrivée",
    note: "Le partage de position prend fin.",
    eta: "Arrivée",
    position: 3,
  },
];
export function TrackingDemo({ compact = false }: { compact?: boolean }) {
  const [step, setStep] = useState(0),
    [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setStep((s) => {
          if (s >= 3) {
            setPlaying(false);
            return s;
          }
          return s + 1;
        }),
      2400,
    );
    return () => clearInterval(timer);
  }, [playing]);
  const current = steps[step];
  return (
    <div className={"tracking-story " + (compact ? "compact" : "")}>
      <div className="tracking-story-map">
        <svg
          className="illustrated-map"
          viewBox="0 0 500 330"
          role="img"
          aria-label="Carte illustrative d’une visite à domicile, sans position réelle"
        >
          <defs>
            <pattern
              id={compact ? "blocks-small" : "blocks-full"}
              width="110"
              height="92"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(-18)"
            >
              <rect
                x="10"
                y="10"
                width="86"
                height="68"
                rx="12"
                fill="#e9edf0"
                stroke="#fff"
                strokeWidth="3"
              />
            </pattern>
          </defs>
          <rect width="500" height="330" fill="#f8fafb" />
          <rect
            width="500"
            height="330"
            fill={"url(#" + (compact ? "blocks-small" : "blocks-full") + ")"}
          />
          <path
            d="M390 -20C210 85 385 220 155 355"
            stroke="#d7e9f5"
            strokeWidth="40"
            fill="none"
          />
          <path
            d="M20 90L115 70L155 143L268 112L295 185L395 155"
            fill="none"
            stroke="white"
            strokeWidth="16"
            strokeLinecap="round"
          />
          <path
            d="M75 78L115 70L155 143L268 112L295 185L395 155"
            fill="none"
            stroke="#8594dc"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={step === 0 ? "6 8" : undefined}
          />
          <rect x="34" y="235" width="115" height="48" rx="17" fill="#dcebdd" />
          <text x="90" y="264" textAnchor="middle" fill="#9bad9e" fontSize="10">
            JARDIN
          </text>
          <text
            x="216"
            y="67"
            fill="#a4afbf"
            fontSize="10"
            transform="rotate(-18 216 67)"
          >
            RUE DES SOURIRES
          </text>
          <g
            transform={`translate(${[75, 155, 295, 395][step]},${[78, 143, 185, 155][step]})`}
            className="moving-marker"
          >
            <circle r="30" fill="#7d91d721" />
            <circle r="21" fill="#778bd4" stroke="white" strokeWidth="4" />
            <text
              textAnchor="middle"
              y="4"
              fill="white"
              fontSize="11"
              fontWeight="600"
            >
              JM
            </text>
          </g>
          <g transform="translate(395,155)">
            <circle r="14" fill="white" stroke="#b0bcd6" strokeWidth="2" />
            <path
              d="M-6 1 0-5 6 1M-4-1v7h8v-7"
              stroke="#8a9ec4"
              fill="none"
              strokeWidth="1.5"
            />
          </g>
        </svg>
        <span className="simulation-label">
          <span className="dot" />
          Démonstration illustrée
        </span>
        <div className="tracking-eta glass">
          <Navigation size={15} />
          <span>{current.label}</span>
          <b>{current.eta}</b>
        </div>
      </div>
      <div className="tracking-person">
        <span className="avatar blue">JM</span>
        <div className="grow">
          <strong>Julie Morel</strong>
          <small>Intervenante fictive · visite à domicile</small>
        </div>
        <span className="tracking-status-icon">
          <Heart size={18} />
        </span>
      </div>
      <div className="tracking-story-steps">
        {steps.map((s, i) => (
          <button
            key={s.label}
            className={i === step ? "current" : i < step ? "done" : ""}
            onClick={() => {
              setPlaying(false);
              setStep(i);
            }}
            aria-label={s.label}
            aria-pressed={i === step}
          >
            <span>{i < step ? <Check size={12} /> : i + 1}</span>
            <small>
              {["Confirmée", "En route", "À proximité", "Arrivée"][i]}
            </small>
          </button>
        ))}
      </div>
      <p className="tracking-caption" aria-live="polite">
        {current.note}
      </p>
      <div className="tracking-controls">
        <button
          className="secondary"
          onClick={() => {
            if (step === 3) setStep(0);
            setPlaying(!playing);
          }}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}{" "}
          {playing ? "Pause" : "Voir le parcours"}
        </button>
        <button
          className="icon-button"
          aria-label="Recommencer la démonstration"
          onClick={() => {
            setPlaying(false);
            setStep(0);
          }}
        >
          <RotateCcw size={16} />
        </button>
      </div>
      <small className="tracking-disclaimer">
        Le suivi GPS réel n’est pas encore activé. Cette présentation ne
        localise personne.
      </small>
    </div>
  );
}
const features = [
  {
    icon: CalendarDays,
    title: "Le rendez-vous, sans détour.",
    subtitle: "Du choix du créneau à la confirmation.",
    copy: "Le praticien publie ses disponibilités. Le patient réserve. Le même rendez-vous apparaît dans leurs deux espaces, avec annulation et libération du créneau.",
    status: "Disponible",
    color: "blue",
    link: "/recherche",
    action: "Trouver un praticien",
  },
  {
    icon: MessageCircle,
    title: "Le lien reste ouvert.",
    subtitle: "Une conversation autour du rendez-vous.",
    copy: "Patients et professionnels échangent dans une conversation réservée aux participants. Les messages sont conservés en ligne et se retrouvent sur vos appareils.",
    status: "Disponible",
    color: "mint",
    link: "/patient?tab=Messages",
    action: "Ouvrir mes échanges",
  },
  {
    icon: Users,
    title: "Une équipe, chacun sa place.",
    subtitle: "Des espaces vraiment séparés.",
    copy: "Patients, praticiens et intervenants disposent de leur propre compte. Leurs accès sont vérifiés côté serveur ; aucun sélecteur ne permet de changer de rôle.",
    status: "Disponible",
    color: "lilac",
    link: "/inscription",
    action: "Créer mon compte",
  },
  {
    icon: Wallet,
    title: "Une activité plus lisible.",
    subtitle: "Recettes, dépenses, règlements.",
    copy: "Le professionnel suit son journal financier, enregistre les règlements et exporte ses opérations en CSV. La facturation réglementaire et les paiements restent à connecter.",
    status: "Journal disponible",
    color: "peach",
    link: "/pro?tab=Comptabilité",
    action: "Découvrir mon espace pro",
  },
  {
    icon: ShieldCheck,
    title: "Un réseau bien accompagné.",
    subtitle: "Une administration qui garde la trace.",
    copy: "Comptes, profils à vérifier, suspensions, rendez-vous et décisions : l’administration dispose d’une vue centrale et d’un historique des actions.",
    status: "Accès réservé",
    color: "blue",
    link: "/admin",
    action: "Accès administration",
  },
];
export function ToolsPreview() {
  return (
    <section className="tools-preview public-section" id="outils">
      <div className="public-section-heading">
        <div>
          <div className="eyebrow">BIEN PLUS QU’UN RENDEZ-VOUS</div>
          <h2>
            Le soin garde le lien.
            <br />
            Même en chemin.
          </h2>
          <p>
            Découvrez les outils qui rapprochent patients, cabinets et
            intervenants.
          </p>
        </div>
        <a className="text-button" href="/outils">
          Explorer tous les outils <ArrowRight size={16} />
        </a>
      </div>
      <div className="tools-preview-grid">
        <div className="tools-preview-copy">
          <span className="feature-state future">
            APERÇU · SUIVI À DOMICILE
          </span>
          <h3>
            Il arrive.
            <br />
            Vous le savez.
          </h3>
          <p>
            Imaginez votre intervenant sur une carte, une heure d’arrivée et un
            lien direct avec votre équipe. Du départ à la porte, chacun sait où
            en est la visite.
          </p>
          <ul>
            <li>
              <Navigation size={17} />
              Trajet visible pendant l’intervention
            </li>
            <li>
              <Clock size={17} />
              Estimation de l’heure d’arrivée
            </li>
            <li>
              <ShieldCheck size={17} />
              Partage consenti, limité à la mission
            </li>
          </ul>
          <a className="primary" href="/outils#suivi">
            Découvrir le fonctionnement <ArrowRight size={16} />
          </a>
          <small>Présentation du parcours prévu. GPS réel à connecter.</small>
        </div>
        <div className="glass">
          <TrackingDemo compact />
        </div>
      </div>
      <div className="tools-mini-grid">
        {features.slice(0, 4).map((f) => (
          <a className="glass tool-mini" href="/outils" key={f.title}>
            <span className={"stat-icon " + f.color}>
              <f.icon size={20} />
            </span>
            <h3>{f.title}</h3>
            <p>{f.subtitle}</p>
            <ArrowRight size={16} />
          </a>
        ))}
      </div>
    </section>
  );
}
export default function ToolsPage() {
  return (
    <div className="tools-page">
      <section className="public-section tools-heading">
        <div className="eyebrow">L’ÉCOSYSTÈME AMELIB</div>
        <h1>
          Moins de distance.
          <br />
          <span>Plus d’attention.</span>
        </h1>
        <p>
          Avant, pendant et après le rendez-vous,
          <br />
          un même espace pour avancer ensemble.
        </p>
        <div className="tool-pills">
          <a href="#quotidien">Au quotidien</a>
          <a href="#suivi">À domicile</a>
          <a href="#mobile">Sur votre téléphone</a>
        </div>
      </section>
      <section className="public-section tool-feature-grid" id="quotidien">
        {features.map((f) => (
          <article className="glass tool-feature" key={f.title}>
            <div className="section-title">
              <span className={"stat-icon " + f.color}>
                <f.icon size={22} />
              </span>
              <span className="feature-state">{f.status}</span>
            </div>
            <h2>{f.title}</h2>
            <strong>{f.subtitle}</strong>
            <p>{f.copy}</p>
            <a className="text-button" href={f.link}>
              {f.action}
              <ArrowRight size={16} />
            </a>
          </article>
        ))}
      </section>
      <section className="public-section tracking-detail" id="suivi">
        <div>
          <span className="feature-state future">
            EN PRÉPARATION · GPS RÉEL NON ACTIVÉ
          </span>
          <h2>
            La visite commence
            <br />
            avant la sonnette.
          </h2>
          <p>
            Un aperçu interactif du suivi à domicile SmilePec. Lancez le
            parcours ou touchez une étape pour voir ce qui change.
          </p>
          <div className="tracking-principles">
            <article>
              <Navigation />
              <div>
                <h3>Suivre l’arrivée</h3>
                <p>
                  Une carte, une position et une estimation d’arrivée pendant la
                  mission.
                </p>
              </div>
            </article>
            <article>
              <Users />
              <div>
                <h3>Coordonner l’équipe</h3>
                <p>
                  Le patient et les professionnels autorisés gardent le même
                  point de repère.
                </p>
              </div>
            </article>
            <article>
              <ShieldCheck />
              <div>
                <h3>Partager au bon moment</h3>
                <p>
                  L’intervenant consent au partage. Il s’arrête à la fin de la
                  visite, sans suivi permanent.
                </p>
              </div>
            </article>
          </div>
        </div>
        <div className="glass">
          <TrackingDemo />
        </div>
      </section>
      <section className="public-section mobile-promo" id="mobile">
        <div className="mobile-phone-art">
          <span className="phone-speaker" />
          <div className="phone-logo">
            a<span>✦</span>
          </div>
          <strong>SmilePec.</strong>
          <small>Le soin, ensemble.</small>
          <div className="phone-tabs">
            <Heart />
            <SearchIcon />
            <CalendarDays />
            <Users />
          </div>
        </div>
        <div>
          <div className="eyebrow">PENSÉ POUR TENIR DANS VOTRE MAIN</div>
          <h2>
            Votre quotidien.
            <br />À portée de pouce.
          </h2>
          <p>
            Trouvez un praticien, échangez avec votre équipe et gardez vos
            rendez-vous à portée de main, où que vous soyez.
          </p>
          <div className="mobile-instructions">
            <Smartphone size={21} />
            <span>
              Ajoutez SmilePec à votre écran d’accueil depuis le menu de votre
              navigateur pour le retrouver comme une application.
            </span>
          </div>
          <small>Application iPhone et Android bientôt disponible.</small>
          <a className="primary" href="/inscription">
            Créer mon espace
            <ArrowRight size={16} />
          </a>
        </div>
      </section>
    </div>
  );
}
function SearchIcon() {
  return <Stethoscope />;
}
export function MobileSplash() {
  const [visible, setVisible] = useState(() => {
    try {
      return (
        window.matchMedia("(max-width: 850px)").matches &&
        !sessionStorage.getItem("amelib-welcome-v1")
      );
    } catch {
      return false;
    }
  });
  useEffect(() => {
    if (!visible) return;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const end = () => {
      try {
        sessionStorage.setItem("amelib-welcome-v1", "1");
      } catch {}
      setVisible(false);
    };
    const timer = setTimeout(end, 1700);
    return () => {
      clearTimeout(timer);
      document.body.style.overflow = old;
    };
  }, [visible]);
  if (!visible) return null;
  return (
    <div
      className="mobile-splash"
      role="dialog"
      aria-modal="true"
      aria-label="Bienvenue sur SmilePec"
    >
      <div className="splash-halo one" />
      <div className="splash-halo two" />
      <span className="splash-star star-one">✧</span>
      <span className="splash-star star-two">✧</span>
      <div className="splash-content">
        <div className="splash-logo">
          <img src="/smilepec-logo.png" alt="SmilePec" />
        </div>
        <p>Le soin, ensemble.</p>
        <div className="splash-line" />
        <small>Un même espace. Tous vos sourires.</small>
      </div>
      <button
        onClick={() => {
          try {
            sessionStorage.setItem("amelib-welcome-v1", "1");
          } catch {}
          setVisible(false);
        }}
      >
        Entrer dans SmilePec
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
