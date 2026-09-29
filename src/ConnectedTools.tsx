import { SiCalendly, SiGooglecalendar, SiCaldotcom } from "@icons-pack/react-simple-icons";

export default function ConnectedTools() {
  return <section className="connected-tools public-section" aria-labelledby="connected-tools-title">
    <div className="eyebrow">VOTRE CABINET, VOS HABITUDES</div>
    <h2 id="connected-tools-title">Vos outils connectés à votre profil</h2>
    <p>Gardez vos outils de prise de rendez-vous. Ajoutez le lien de votre agenda à votre profil SmilePec pour le retrouver facilement.</p>
    <ul className="connected-tool-logos" aria-label="Plateformes disponibles dans votre profil">
      <li><img src="/logos/doctolib.svg" alt="Doctolib" width="125" height="38" loading="lazy" /></li>
      <li><SiGooglecalendar color="#4285F4" aria-hidden="true" />Google Agenda</li>
      <li><SiCalendly color="#006BFF" aria-hidden="true" />Calendly</li>
      <li><SiCaldotcom color="#292929" aria-hidden="true" />Cal.com</li>
      <li><img className="tool-icon" src="/logos/outlook.svg" alt="" width="34" height="34" loading="lazy" />Outlook</li>
    </ul>
    <p><small>Les liens d’agenda sont disponibles depuis votre profil. La synchronisation automatique dépend des intégrations autorisées pour votre cabinet.</small></p>
    <a className="secondary" href="/pro">Configurer mon profil</a>
  </section>;
}
