import { ArrowRight, Check, Mail, MessageCircle, Phone } from "lucide-react";

// Textes repris du site SmilePec (smilepec.fr) : accroche, gammes, méthode, reprise, avis, contact.
export const SMILEPEC_HERO = "Et si la simple saisie d'un devis … suffisait à révéler les meilleures garanties de vos patients ?";
const phone = "33745134481";
const whatsapp = (message: string) => "https://wa.me/" + phone + "?text=" + encodeURIComponent(message);
const email = (subject: string) => "mailto:contact@smilepec.fr?subject=" + encodeURIComponent(subject);
const analyseMessage = "Bonjour, je souhaite l'analyse gratuite de 5 dossiers impayés.";
const analyseSubject = "Analyse gratuite de dossiers impayés";

type Step = { title: string; text: string };
type Offer = {
  id: string;
  label: string;
  title: string;
  summary: string;
  tag?: string;
  eyebrow: string;
  detailTitle: string;
  intro: string;
  extra?: string;
  quote?: string;
  process: string;
  steps: Step[];
  action: string;
  message: string;
  subject: string;
};

const offers: Offer[] = [
  {
    id: "gestion",
    label: "GAMME 1",
    title: "Gestion Tiers Payant complète",
    summary: "Vous déléguez tout, vous ne vous souciez plus de rien.",
    eyebrow: "CYCLE A À Z",
    detailTitle: "Gestion Tiers Payant complète",
    intro:
      "Une gestion complète du cycle tiers payant, de la demande d'accord au rapprochement mensuel, pour une tranquillité de travail optimale. Vous déléguez l'intégralité de l'administratif et ne vous souciez plus de rien.",
    extra: "Fini les rejets de dossiers et les chèques impayés.",
    process: "LE CYCLE DÉLÉGUÉ",
    steps: [
      { title: "Demande d'accord", text: "Constitution et envoi de la demande de prise en charge." },
      { title: "Suivi du dossier", text: "Relances et échanges avec la mutuelle jusqu'à validation." },
      { title: "Préparation des dossiers à la facturation", text: "Préparation des DRE : numéro d'accord, validité, tout est saisi." },
      { title: "Rapprochement mensuel", text: "Contrôle des paiements reçus." },
    ],
    action: "ÉCHANGER SUR LA GESTION COMPLÈTE",
    message: "Bonjour, je m’intéresse à la Gestion Tiers Payant complète.",
    subject: "Gestion Tiers Payant complète",
  },
  {
    id: "estimation",
    label: "GAMME 2",
    title: "Optimisation des Estimations",
    summary: "Vous gardez la main sur vos honoraires.",
    eyebrow: "LIBERTÉ TOTALE",
    detailTitle: "Optimisation des estimations",
    intro:
      "Fini la simple saisie des devis : nous affinons chaque devis pour chercher le meilleur parti des remboursements. Vous gardez une liberté tarifaire totale sur vos honoraires, sur une prestation ciblée : sans demande d'accord de prise en charge, sans facturation, ni rapprochement.",
    process: "CE QUI CHANGE POUR VOUS",
    steps: [
      { title: "Vous nous transmettez le devis", text: "Devis et carte de mutuelle." },
      { title: "Optimisation de l'estimation", text: "Le devis est étudié pour maximiser le remboursement." },
      { title: "Liberté tarifaire totale", text: "Vous gardez l'entière liberté sur vos honoraires." },
    ],
    action: "ÉCHANGER SUR L'ESTIMATION OPTIMISÉE",
    message: "Bonjour, je m’intéresse à l’Estimation dentaire.",
    subject: "Estimation optimisée",
  },
  {
    id: "optimisation",
    label: "GAMME 3",
    title: "Optimisation Tiers Payant",
    summary: "Rentabilité maximale, zéro effort.",
    tag: "LA PLUS COMPLÈTE",
    eyebrow: "NOTRE OFFRE LA PLUS COMPLÈTE",
    detailTitle: "L'optimisation du tiers payant",
    intro:
      "La gestion complète du tiers payant, associée à une estimation qui va chercher le meilleur parti des remboursements. C'est comme si vous saviez, avant même le début des soins, exactement ce que sa mutuelle est prête à rembourser.",
    quote: "« La vraie question n'est pas ce que nous coûtons. C'est ce que vous perdez sans nous. »",
    extra:
      "Pas un investissement, un autofinancement. Nous ne prenons notre part que sur ce que vous récupérez grâce à nous. Le reste est un gain net, purement nouveau.",
    process: "COMMENT ÇA FONCTIONNE ?",
    steps: [
      { title: "Vous nous transmettez le devis", text: "Devis et carte de mutuelle." },
      { title: "Nous analysons chaque ligne", text: "Détection des optimisations sur chaque garantie disponible." },
      { title: "Retour optimisé", text: "Rentabilité ajustée, dossiers prêts à facturer." },
      { title: "Rapprochement mensuel", text: "Contrôle des paiements reçus." },
    ],
    action: "EN SAVOIR PLUS, ENVOYEZ-NOUS UN MESSAGE WHATSAPP",
    message: "Bonjour, je souhaite en savoir plus sur l’optimisation de devis.",
    subject: "Optimisation du tiers payant",
  },
];

const advantages: [string, string][] = [
  ["Remboursement optimisé", "Meilleures garanties, plafond disponible vérifié avant chaque acte."],
  ["DRE préparées avant facturation", "Aucune erreur, une facturation plus simple et un vrai gain de temps."],
  ["Comptabilité rigoureuse", "Chaque centime tracé à la source."],
  ["Optimisation des estimations & PEC rapides", "Jamais de devis retardé."],
  ["Un interlocuteur dédié", "Joignable directement sur WhatsApp."],
  ["Visibilité totale", "En cours, payés, impayés, statistiques."],
];

const recoverySteps: Step[] = [
  { title: "Évaluation du volume", text: "Consultation conjointe de votre logiciel de facturation pour identifier les dossiers Tiers Payant en souffrance sur les 6 derniers mois." },
  { title: "Accord sur devis", text: "Établissement d'un devis selon le volume identifié, sans impact sur la gestion courante. Vous décidez en toute transparence." },
  { title: "Traitement des dossiers", text: "Reprise de chaque dossier en souffrance : relances mutuelles, corrections d'erreurs, nouvelles demandes selon les cas." },
  { title: "Compte-rendu", text: "À l'issue de la reprise, un récapitulatif des dossiers traités, récupérés et irrécupérables vous est transmis." },
];

const testimonials = [
  { quote: "J'ai récupéré des impayés que je croyais perdus. L'équipe a tout repris en main, je n'y pense plus.", name: "Dr. Laurent M.", role: "Chirurgien-dentiste · Lyon" },
  { quote: "Plus aucun rejet de dossier depuis qu'ils contrôlent tout avant transmission. Un vrai soulagement au quotidien.", name: "Dr. Inès K.", role: "Cabinet dentaire · Paris 15e" },
  { quote: "Tout est à distance, fluide, et je garde une visibilité totale sur mes encaissements. Je recommande sans réserve.", name: "Dr. Thomas B.", role: "SELARL dentaire · Bordeaux" },
];

function ServiceActions({ label, message, subject }: { label: string; message: string; subject: string }) {
  return (
    <div className="home-service-actions">
      <a className="primary" href={whatsapp(message)} target="_blank" rel="noreferrer">
        <MessageCircle size={18} aria-hidden="true" />
        {label}
        <ArrowRight size={16} aria-hidden="true" />
      </a>
      <a className="secondary" href={email(subject)}>
        <Mail size={17} aria-hidden="true" />
        Par e-mail
      </a>
    </div>
  );
}

function ServiceProcess({ label, steps }: { label: string; steps: Step[] }) {
  return (
    <div className="home-service-process">
      <p className="eyebrow">{label}</p>
      <ol>
        {steps.map((step, index) => (
          <li key={step.title}>
            <span className="home-step-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <div>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function SmilePecOffers() {
  return (
    <section className="public-section home-offers" id="preuve" aria-labelledby="offers-heading">
      <header className="home-section-head">
        <div className="eyebrow">NOS OFFRES</div>
        <h2 id="offers-heading">Choisissez votre gamme</h2>
      </header>
      <div className="home-offer-grid">
        {offers.map((offer) => (
          <a className={"home-offer-card" + (offer.tag ? " is-featured" : "")} href={"#" + offer.id} key={offer.id}>
            <div className="home-offer-kicker">
              <span>{offer.label}</span>
              {offer.tag && <strong>{offer.tag}</strong>}
            </div>
            <h3>{offer.title}</h3>
            <p>{offer.summary}</p>
            <span className="home-offer-discover">Découvrir <ArrowRight size={18} aria-hidden="true" /></span>
          </a>
        ))}
      </div>
      <div className="home-offer-promises">
        <p>
          <Check size={18} aria-hidden="true" />
          <span>Vous n'êtes pas conventionné ? <strong>On s'occupe de tout.</strong></span>
        </p>
        <p>
          <Check size={18} aria-hidden="true" />
          <span>La Gamme 3 s'autofinance : son coût est couvert par les gains qu'elle génère, avant même de devenir une dépense pour vous.</span>
        </p>
      </div>
      <ul className="home-service-proof">
        <li><strong>30+</strong><span>PLATEFORMES MAÎTRISÉES</span></li>
        <li><strong>100%</strong><span>GÉRÉ À DISTANCE</span></li>
        <li><strong>A→Z</strong><span>CYCLE COMPLET DÉLÉGUÉ</span></li>
      </ul>
    </section>
  );
}

export function SmilePecServices() {
  return (
    <>
      <nav className="home-content-nav" aria-label="Découvrir l’accompagnement SmilePec">
        {[
          ["preuve", "Offres"],
          ["optimisation", "Optimisation"],
          ["avantages", "Avantages"],
          ["reprise", "Reprise"],
          ["temoignages", "Avis"],
          ["contact", "Contact"],
        ].map(([id, label]) => <a href={"#" + id} key={id}>{label}</a>)}
      </nav>
      {offers.map((offer) => (
        <section id={offer.id} className="public-section home-service-detail" aria-labelledby={offer.id + "-heading"} key={offer.id}>
          <div className="home-service-copy">
            <div className="eyebrow">{offer.label}{offer.tag ? " · " + offer.eyebrow : ""}</div>
            <h2 id={offer.id + "-heading"}>{offer.detailTitle}</h2>
            {!offer.tag && <p className="home-service-tag">{offer.eyebrow}</p>}
            <p>{offer.intro}</p>
            {offer.quote && <blockquote>{offer.quote}</blockquote>}
            {offer.extra && <p className="home-service-emphasis">{offer.extra}</p>}
            <ServiceActions label={offer.action} message={offer.message} subject={offer.subject} />
          </div>
          <ServiceProcess label={offer.process} steps={offer.steps} />
        </section>
      ))}
      <section id="avantages" className="public-section home-advantages" aria-labelledby="advantages-heading">
        <header className="home-section-head">
          <div className="eyebrow">NOTRE MÉTHODE</div>
          <h2 id="advantages-heading">Ce qui nous différencie</h2>
        </header>
        <div className="home-advantages-grid">
          {advantages.map(([title, text]) => (
            <article key={title}>
              <Check size={21} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{text}</p>
            </article>
          ))}
        </div>
        <p className="home-report-note">Le suivi chiffré des optimisations reste géré par SmilePec. Vos bilans vous sont transmis dans votre espace SmilePec et/ou par e-mail en fin de mois.</p>
      </section>
      <section id="reprise" className="public-section home-service-detail home-recovery" aria-labelledby="recovery-heading">
        <div className="home-service-copy">
          <div className="eyebrow">PRESTATION PONCTUELLE · DÉMARRAGE DE COLLABORATION</div>
          <h2 id="recovery-heading">Reprise de portefeuille</h2>
          <p>Récupérer les dossiers Tiers Payant laissés en souffrance avant notre collaboration. Une prestation ponctuelle, distincte du forfait mensuel de gestion courante. C'est d'ailleurs sur cette reprise que repose l'analyse gratuite de vos 5 dossiers, pour identifier ensemble ce qui peut encore être récupéré avant de nous engager.</p>
          <aside className="home-recovery-value">
            <span className="eyebrow">ORDRE DE GRANDEUR</span>
            <p>Un seul dossier prothétique récupéré représente <strong>500 à 1 500 €</strong> pour votre cabinet, selon l'acte concerné.</p>
          </aside>
          <ul className="home-recovery-terms">
            <li>Les 6 derniers mois</li>
            <li>Volume établi ensemble</li>
            <li>Exclusivement sur devis</li>
          </ul>
          <ServiceActions label="ANALYSE GRATUITE DE DOSSIERS IMPAYÉS" message={analyseMessage} subject={analyseSubject} />
        </div>
        <ServiceProcess label="LE DÉROULEMENT" steps={recoverySteps} />
      </section>
      <section id="temoignages" className="public-section home-testimonials" aria-labelledby="testimonials-heading">
        <header className="home-section-head">
          <div className="eyebrow">ILS DÉLÈGUENT DÉJÀ</div>
          <h2 id="testimonials-heading">Ce qu'ils en disent</h2>
        </header>
        <div className="home-testimonials-grid">
          {testimonials.map((t) => (
            <figure key={t.name}>
              <blockquote>{t.quote}</blockquote>
              <figcaption><strong>{t.name}</strong><span>{t.role}</span></figcaption>
            </figure>
          ))}
        </div>
      </section>
      <section id="contact" className="public-section home-contact" aria-labelledby="contact-heading">
        <div>
          <div className="eyebrow">SMILEPEC · À VOTRE ÉCOUTE</div>
          <h2 id="contact-heading">Nous contacter</h2>
          <p>Vos dossiers impayés recèlent souvent des sommes récupérables. Envoyez-nous 5 dossiers — sans engagement, nous vous indiquons ce qui peut être récupéré.</p>
          <ServiceActions label="ANALYSE GRATUITE DE DOSSIERS IMPAYÉS" message={analyseMessage} subject={analyseSubject} />
        </div>
        <div className="home-contact-details">
          <a href="tel:+33745134481">
            <Phone size={20} aria-hidden="true" />
            <span><small>TÉLÉPHONE</small><strong>07 45 13 44 81</strong></span>
          </a>
          <a href="mailto:contact@smilepec.fr">
            <Mail size={20} aria-hidden="true" />
            <span><small>E-MAIL</small><strong>contact@smilepec.fr</strong></span>
          </a>
          <p>SIRET 939 310 371 00017 · 100 % à distance · Toute la France</p>
        </div>
      </section>
    </>
  );
}
