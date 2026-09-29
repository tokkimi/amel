import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity, ArrowRight, BarChart3, Briefcase, CalendarDays, Building2, Check, Euro, Eye, Home as HomeIcon, Inbox as InboxIcon, LifeBuoy,
  LogOut, Menu, RefreshCw, Search, Settings, ShieldCheck, Users, Workflow, X,
} from "lucide-react";
import { api, Account } from "./client";
import { CC, CommandContext, Me, Section } from "./admin/context";
import { ConfirmDialog, ConfirmRequest, ErrorState, Skeleton, useUrlParam } from "./admin/ui";
import { CreateTaskDialog, EventDrawer } from "./admin/events";
import Home from "./admin/Home";
import Inbox from "./admin/Inbox";
import Cabinets from "./admin/Cabinets";
import Cabinet360 from "./admin/Cabinet360";
import Operations from "./admin/Operations";
import Finance from "./admin/Finance";
import Support, { TicketDrawer } from "./admin/Support";
import Network from "./admin/Network";
import Analytics from "./admin/Analytics";
import Security from "./admin/Security";
import Config from "./admin/Config";
import CommandPalette from "./admin/CommandPalette";
import Notifications from "./admin/Notifications";
import AssistMode from "./admin/AssistMode";
import "./admin/command-center.css";

// SmilePec Command Center — the central admin (Amel) back-office. Public pages and cabinet spaces are untouched.
const NAV: { key: Section; icon: typeof HomeIcon; perm?: string; badge?: "inbox" | "support" }[] = [
  { key: "Accueil", icon: HomeIcon }, { key: "Inbox", icon: InboxIcon, badge: "inbox" }, { key: "Cabinets", icon: Building2, perm: "cabinet.read" },
  { key: "Opérations", icon: Workflow, perm: "cabinet.read" }, { key: "Finance", icon: Euro, perm: "billing.read" }, { key: "Support", icon: LifeBuoy, perm: "support.read", badge: "support" },
  { key: "Réseau", icon: Users, perm: "account.read" }, { key: "Analytics", icon: BarChart3, perm: "analytics.read" },
];
const ADMIN_NAV: { key: Section; icon: typeof HomeIcon; perm?: string }[] = [{ key: "Sécurité & Audit", icon: ShieldCheck, perm: "audit.read" }, { key: "Configuration", icon: Settings, perm: "settings.read" }];
// Amel's original admin menu (same names, same order), each entry now opening the improved page.
type MenuItem = { label: string; section: Section; sub?: string; icon: typeof HomeIcon; perm?: string; badge?: "inbox" | "support"; isNew?: boolean };
const MENU: MenuItem[] = [
  { label: "Vue d’ensemble", section: "Accueil", icon: HomeIcon },
  { label: "À traiter", section: "Inbox", icon: InboxIcon, badge: "inbox", isNew: true },
  { label: "Comptes", section: "Réseau", icon: Users, perm: "account.read" },
  { label: "Vérifications", section: "Réseau", sub: "Vérifications", icon: ShieldCheck, perm: "verification.read" },
  { label: "Rendez-vous", section: "Opérations", sub: "Rendez-vous", icon: CalendarDays, perm: "cabinet.read" },
  { label: "Journal d’actions", section: "Sécurité & Audit", icon: Activity, perm: "audit.read" },
  { label: "Paramètres", section: "Configuration", icon: Settings, perm: "settings.read" },
  { label: "Cabinets & équipes", section: "Cabinets", icon: Building2, perm: "cabinet.read" },
  { label: "Demandes SmilePec", section: "Support", icon: LifeBuoy, perm: "support.read", badge: "support" },
  { label: "Priorités opérationnelles", section: "Opérations", icon: Workflow, perm: "cabinet.read" },
  { label: "Bilan comptable", section: "Finance", icon: Euro, perm: "billing.read" },
  { label: "Analytics", section: "Analytics", icon: BarChart3, perm: "analytics.read", isNew: true },
];
const menuActive = (m: MenuItem, section: string, sub: string) => m.section === section && (m.sub ? sub.startsWith(m.sub) : !MENU.some((x) => x !== m && x.section === section && x.sub && sub.startsWith(x.sub)));
const SECTIONS = [...NAV, ...ADMIN_NAV].map((n) => n.key) as string[];
// Old ?tab= values keep working (bookmarks, notifications).
const LEGACY: Record<string, [Section, string?]> = {
  "Vue d’ensemble": ["Accueil"], Comptes: ["Réseau"], Vérifications: ["Réseau", "Vérifications"], "Rendez-vous": ["Opérations", "Rendez-vous"],
  "Journal d’actions": ["Sécurité & Audit"], Paramètres: ["Configuration"], "Cabinets & équipes": ["Cabinets"], "Demandes SmilePec": ["Support"],
  "Priorités opérationnelles": ["Opérations", "Poses à venir"], "Bilan comptable": ["Finance"],
};

export default function AdminConsole({ account, logout }: { account: Account; logout: () => void }) {
  const [me, setMe] = useState<Me | null>(null), [meError, setMeError] = useState("");
  const [tab, setTab] = useUrlParam("tab");
  const [sub, setSub] = useUrlParam("sub");
  const [cabinet, setCabinet] = useUrlParam("cabinet"), [ticket, setTicket] = useUrlParam("ticket"), [event, setEvent] = useUrlParam("event");
  const [version, setVersion] = useState(0), [menu, setMenu] = useState(false), [palette, setPalette] = useState(false);
  const [confirmReq, setConfirmReq] = useState<ConfirmRequest | null>(null), [task, setTask] = useState<{ cabinet_id?: string; cabinet_name?: string; title?: string } | null>(null);
  const [toasts, setToasts] = useState<{ id: number; text: string }[]>([]);
  const [badges, setBadges] = useState({ inbox: 0, urgent: 0, support: 0, notifications: 0 });
  const loadMe = useCallback(() => api<Me>("cc-me").then(setMe).catch((e) => setMeError(e.message)), []);
  useEffect(() => { loadMe(); }, [loadMe]);
  const loadBadges = useCallback(() => api("cc-badges").then(setBadges).catch(() => {}), []);
  useEffect(() => { loadBadges(); const t = setInterval(loadBadges, 60000); return () => clearInterval(t); }, [loadBadges, version]);
  useEffect(() => { if (LEGACY[tab]) { const [s, sub] = LEGACY[tab]; setTab(s === "Accueil" ? "" : s, true); if (sub) setSub(sub, true); } }, [tab]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => { if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); setPalette((p) => !p); } if (e.key === "Escape") setMenu(false); };
    addEventListener("keydown", key); return () => removeEventListener("keydown", key);
  }, []);
  const section = (SECTIONS.includes(tab) ? tab : "Accueil") as Section;
  const cc: CC | null = useMemo(() => me && ({
    me, version,
    can: (p: string) => me.permissions.includes(p),
    go: (s, sub) => {
      const url = new URL(location.href);
      ["sub", "cabinet", "ticket", "event"].forEach((k) => url.searchParams.delete(k));
      if (s === "Accueil") url.searchParams.delete("tab"); else url.searchParams.set("tab", s);
      if (sub) url.searchParams.set("sub", sub);
      history.pushState({}, "", url.pathname + url.search); dispatchEvent(new Event("cc:url"));
      setMenu(false); document.querySelector(".cc-main")?.scrollTo({ top: 0 }); window.scrollTo({ top: 0 });
    },
    open: (kind, id) => { if (kind === "cabinet") setCabinet(id); if (kind === "ticket") setTicket(id); if (kind === "event") setEvent(id); },
    confirm: setConfirmReq,
    toast: (text) => { const id = Date.now() + Math.random(); setToasts((t) => [...t.slice(-2), { id, text }]); setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4200); },
    createTask: (preset = {}) => setTask(preset),
    startAssist: (c) => setConfirmReq({
      title: "Voir comme cabinet", reason: true, confirmLabel: "Démarrer en lecture seule",
      summary: <><p>Vous allez consulter l’espace de <b>{c.name}</b> tel que le cabinet le voit, <b>en lecture seule</b>.</p><p>Le début, la fin et le motif sont journalisés. Aucune action ne peut être effectuée au nom du cabinet.</p></>,
      run: async (reason) => { await api("cc-assist-start", { cabinet_id: c.id, reason }); await loadMe(); setCabinet(""); },
    }),
    bump: () => setVersion((v) => v + 1),
  }), [me, version]);
  if (meError) return <div className="cc-app cc-center"><ErrorState message={meError} retry={() => { setMeError(""); loadMe(); }} /></div>;
  if (!me || !cc) return <div className="cc-app cc-center" aria-busy="true"><Skeleton rows={6} height={24} /></div>;
  if (me.assist) return <CommandContext.Provider value={cc}><AssistMode session={me.assist} exit={async () => { await api("cc-assist-end", {}); await loadMe(); cc.toast("Mode assistance terminé et journalisé."); }} /></CommandContext.Provider>;
  const allowed = (perm?: string) => !perm || cc.can(perm);
  const badge = (b?: "inbox" | "support") => (b === "inbox" ? badges.inbox : b === "support" ? badges.support : 0);
  const Page = { Accueil: Home, Inbox, Cabinets, Opérations: Operations, Finance, Support, Réseau: Network, Analytics, "Sécurité & Audit": Security, Configuration: Config }[section];
  return <CommandContext.Provider value={cc}>
    <div className="cc-app">
      <aside className={"cc-sidebar" + (menu ? " open" : "")} aria-label="Navigation administration">
        <a className="cc-brand" href="/admin"><img src="/smilepec-logo.png" alt="SmilePec" /></a>
        <span className="cc-nav-label">Administration générale</span>
        <nav>{MENU.filter((m) => allowed(m.perm)).map((m) => { const on = menuActive(m, section, sub); const I = m.icon; return <button key={m.label} className={on ? "active" : ""} aria-current={on ? "page" : undefined} onClick={() => cc.go(m.section, m.sub)}><I size={17} aria-hidden />{m.label}{!!badge(m.badge) && <span className={"cc-nav-badge" + (m.badge === "inbox" && badges.urgent ? " urgent" : "")} aria-label={`${badge(m.badge)} en attente`}>{badge(m.badge)}</span>}</button>; })}</nav>
        <span className="cc-nav-label">SmilePec</span>
        <nav><a className="cc-nav-link" href="/pro"><Briefcase size={17} aria-hidden />Espace SmilePec<small>tâches, dossiers, équipe</small></a></nav>
        <div className="cc-identity"><span className="cc-avatar">{account.name[0]}</span><div><strong>{account.name}</strong><small>{me.role_label}</small></div></div>
        <button className="cc-btn is-ghost" onClick={logout}><LogOut size={15} />Se déconnecter</button>
      </aside>
      {menu && <div className="cc-scrim" onClick={() => setMenu(false)} />}
      <div className="cc-main">
        <header className="cc-topbar">
          <button className="cc-icon cc-menu-btn" aria-label="Menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>{menu ? <X size={18} /> : <Menu size={18} />}</button>
          <span className="cc-crumb"><Activity size={13} aria-hidden /> SmilePec <span>/</span> <strong>{MENU.find((m) => menuActive(m, section, sub))?.label || section}</strong></span>
          <button className="cc-searchbar" onClick={() => setPalette(true)} aria-label="Rechercher dans SmilePec (Ctrl K)"><Search size={15} aria-hidden /><span>Rechercher dans SmilePec…</span><kbd>{navigator.platform.includes("Mac") ? "⌘" : "Ctrl"} K</kbd></button>
          <Notifications unread={badges.notifications} onChange={loadBadges} />
          <button className="cc-icon" aria-label="Actualiser" onClick={() => { cc.bump(); loadMe(); }}><RefreshCw size={17} /></button>
          <a href="/pro" className="cc-link">Espace SmilePec <ArrowRight size={13} /></a>
          <a href="/" className="cc-link hide-sm">Voir le site <Eye size={13} /></a>
        </header>
        <main className="cc-content" id="main"><Page /></main>
        <nav className="cc-dock" aria-label="Navigation rapide">
          {([["Accueil", HomeIcon, "Accueil"], ["Inbox", InboxIcon, "À traiter"], ["Cabinets", Building2, "Cabinets"], ["Support", LifeBuoy, "Demandes"]] as const).filter(([k]) => allowed(NAV.find((n) => n.key === k)?.perm)).map(([k, I, label]) => <button key={k} className={section === k ? "active" : ""} onClick={() => cc.go(k)}><I size={20} />{label}{k === "Inbox" && !!badges.inbox && <span className="cc-nav-badge">{badges.inbox}</span>}</button>)}
          <button className={menu ? "active" : ""} onClick={() => setMenu(!menu)}><Menu size={20} />Plus</button>
        </nav>
      </div>
      <Cabinet360 id={cabinet} close={() => setCabinet("")} />
      <TicketDrawer id={ticket} close={() => setTicket("")} />
      <EventDrawer id={event} close={() => setEvent("")} />
      <CommandPalette open={palette} close={() => setPalette(false)} />
      <CreateTaskDialog preset={task} close={() => setTask(null)} />
      <ConfirmDialog request={confirmReq} close={() => setConfirmReq(null)} />
      <div className="cc-toasts" role="status" aria-live="polite">{toasts.map((t) => <div key={t.id} className="cc-toast"><Check size={15} />{t.text}</div>)}</div>
    </div>
  </CommandContext.Provider>;
}
