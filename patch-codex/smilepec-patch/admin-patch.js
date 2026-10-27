// Correctifs administration SmilePec (ajout autonome, ne modifie aucun composant existant) :
// 1. « Agendas connectés » (Google Agenda / Calendly) déplacés dans Paramètres › Plateforme, ouverts par défaut.
// 2. Barre d'onglets de l'admin utilisable au doigt sur mobile (passage à la ligne au lieu du défilement).

const style = document.createElement("style");
style.textContent = `
details.cc-calendar-settings { display: none !important; }
@media (max-width: 850px) {
  .cc-tabs { flex-wrap: wrap; overflow-x: visible; row-gap: 4px; }
  .cc-tabs button { flex: 0 0 auto; }
}
.sp-agendas { margin-top: 8px; padding: 22px; border: 1px solid var(--cc-border, #ebe3d8); border-radius: 18px; background: var(--cc-surface, #fff); }
.sp-agendas h2 { margin: 0 0 6px; font-size: 18px; }
.sp-agendas > p { margin: 6px 0; color: var(--cc-muted, #7d6d5f); line-height: 1.6; }
.sp-agenda { display: grid; gap: 8px; padding: 16px; margin: 14px 0 0; border: 1px solid #dfd2bf; border-radius: 14px; }
.sp-agenda h3 { margin: 0; font-size: 15px; }
.sp-agenda .sp-state { margin: 0; font-weight: 600; }
.sp-agenda .sp-state.ok { color: #4f7a5a; }
.sp-agenda .sp-actions { display: flex; flex-wrap: wrap; gap: 8px; }
.sp-agenda select { max-width: 100%; }
.sp-agenda code { overflow-wrap: anywhere; font-size: 12px; }
.sp-agendas [role=alert] { color: #a2452c; }
`;
document.head.appendChild(style);

const PLATFORM_TAB = "Plateforme";
const NAMES = { google: "Google Agenda", calendly: "Calendly" };

async function api(action, body) {
  const res = await fetch("/api?action=" + action, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Le service est indisponible.");
  return data;
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith("on")) node.addEventListener(key.slice(2), value);
    else if (key === "className") node.className = value;
    else node.setAttribute(key, value === true ? "" : value);
  }
  for (const child of children.flat()) if (child !== null && child !== undefined && child !== false) node.append(child);
  return node;
}

function createAgendaPanel() {
  const root = el("section", { className: "sp-agendas", "aria-labelledby": "sp-agendas-title" });
  let busy = false;
  let error = "";
  let connections = null;
  const flag = new URLSearchParams(location.search).get("calendar");

  async function run(action, provider, extra = {}) {
    busy = true; error = ""; render();
    try {
      const result = await api(action, { provider, ...extra });
      if (result.url) { location.assign(result.url); return; }
      await load();
    } catch (e) { error = e.message; }
    busy = false; render();
  }

  async function load() {
    try { connections = (await api("cc-calendar-status")).connections || []; }
    catch (e) { error = e.message; connections = connections || []; }
    render();
  }

  function card(c) {
    const name = NAMES[c.provider] || c.provider;
    const state = c.connected ? "Connecté à votre compte SmilePec" : c.configured ? "Prêt à connecter" : "Configuration de l’application requise";
    return el("div", { className: "sp-agenda" },
      el("h3", {}, name),
      el("p", { className: "sp-state" + (c.connected ? " ok" : "") }, state),
      c.last_sync && el("small", {}, "Dernière synchronisation : " + new Date(c.last_sync).toLocaleString("fr-FR")),
      c.error && el("p", { role: "alert" }, c.error + " Les créneaux concernés sont masqués tant que la synchronisation échoue."),
      !c.configured && el("p", {}, "La connexion sera disponible dès que l’application " + name + " aura été configurée pour SmilePec."),
      el("div", { className: "sp-actions" },
        el("button", { type: "button", className: "cc-btn is-primary", disabled: !c.configured || busy, onclick: () => run("cc-calendar-connect", c.provider) },
          c.connected ? "Reconnecter" : "Connecter " + name),
        c.connected && el("button", { type: "button", className: "cc-btn", disabled: busy, onclick: () => run("cc-calendar-sync", c.provider) }, "Synchroniser maintenant"),
        c.connected && el("button", { type: "button", className: "cc-btn", disabled: busy, onclick: () => {
          if (window.confirm("Retirer cette connexion de SmilePec ? Les rendez-vous déjà enregistrés seront conservés.")) run("cc-calendar-disconnect", c.provider);
        } }, "Déconnecter"),
      ),
      c.connected && c.provider === "calendly" && el("label", {},
        "Type Calendly pour les créneaux SmilePec (30 minutes)",
        (() => {
          const select = el("select", { disabled: busy, onchange: (e) => run("cc-calendar-type", c.provider, { event_type: e.target.value }) },
            el("option", { value: "", disabled: true }, "Choisir un type de rendez-vous"),
            (c.event_types || []).map((t) => el("option", { value: t.uri }, t.name)));
          select.value = c.event_type || "";
          return select;
        })(),
      ),
      c.redirect_uri && el("details", {},
        el("summary", {}, "Configuration technique"),
        el("p", {}, "Adresse de retour à déclarer :"),
        el("code", {}, c.redirect_uri)),
    );
  }

  function render() {
    root.replaceChildren(...[
      el("h2", { id: "sp-agendas-title" }, "Agendas connectés"),
      el("p", {}, "Chaque membre de SmilePec connecte son propre Google Agenda ou Calendly. Les créneaux ouverts dans SmilePec sont vérifiés contre ses disponibilités avant leur affichage et avant réservation. Aucun agenda n’est modifié."),
      flag === "connected" && el("p", { role: "status" }, "Votre compte est connecté. Vérifiez la date de synchronisation ci-dessous."),
      flag === "failed" && el("p", { role: "alert" }, "La connexion n’a pas abouti. Restez connectée à SmilePec et acceptez les autorisations demandées."),
      error && el("p", { role: "alert" }, error),
      connections === null ? el("p", {}, "Chargement…") : connections.map(card),
      el("p", {}, "Google vérifie l’agenda principal ; Calendly, les calendriers activés pour les conflits. Le contrôle porte sur les sept prochains jours."),
    ].flat().filter(Boolean));
  }

  render();
  load();
  return root;
}

let panel = null;

function sync() {
  if (location.pathname !== "/admin") return;
  const tabs = document.querySelector('.cc-tabs[aria-label="Configuration"]');
  const active = tabs && tabs.querySelector('[role="tab"][aria-selected="true"]');
  const onPlatform = !!active && active.textContent.trim() === PLATFORM_TAB;
  if (!onPlatform) {
    if (panel) { panel.remove(); panel = null; }
    return;
  }
  const page = tabs.parentElement;
  if (panel && panel.parentElement === page) {
    if (page.lastElementChild !== panel) page.append(panel);
    return;
  }
  if (panel) panel.remove();
  panel = createAgendaPanel();
  page.append(panel);
}

// Après la connexion Google / Calendly, revenir sur Paramètres › Plateforme.
if (location.pathname === "/admin") {
  const params = new URLSearchParams(location.search);
  if (params.get("calendar") && params.get("tab") !== "Configuration") {
    location.replace("/admin?tab=Configuration&calendar=" + encodeURIComponent(params.get("calendar")));
  }
}

let queued = false;
new MutationObserver(() => {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; sync(); });
}).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-selected"] });

sync();
