import { useEffect, useRef, useState } from "react";
import { Bell, CheckCheck, ChevronDown } from "lucide-react";
import { api } from "../client";
import { ago, Chips } from "./ui";

const CATS = [{ key: "all", label: "Tout" }, { key: "action", label: "Action requise" }, { key: "info", label: "Information" }, { key: "finance", label: "Finance" }, { key: "security", label: "Sécurité" }, { key: "support", label: "Support" }];
// Admin notifications grouped by cabinet: « Cabinet République — 4 nouveaux événements », expandable.
export default function Notifications({ unread, onChange }: { unread: number; onChange: () => void }) {
  const [open, setOpen] = useState(false), [data, setData] = useState<any>(null), [cat, setCat] = useState("all"), [expanded, setExpanded] = useState<string>("");
  const ref = useRef<HTMLDivElement>(null);
  const load = () => api("cc-notifications").then(setData).catch(() => {});
  useEffect(() => { if (open) load(); }, [open]);
  useEffect(() => { if (!open) return; const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); }; addEventListener("mousedown", close); return () => removeEventListener("mousedown", close); }, [open]);
  const go = async (n: any) => {
    if (!n.read_at) await api("notification-read", { id: n.id }).catch(() => {});
    onChange(); setOpen(false);
    if (n.href?.startsWith("/admin")) { history.pushState({}, "", n.href); dispatchEvent(new PopStateEvent("popstate")); } else if (n.href) location.assign(n.href);
  };
  const groups = (data?.groups || []).filter((g: any) => cat === "all" || g.categories.includes(cat));
  return <div className="cc-notif" ref={ref}>
    <button className="cc-icon" aria-label={`Notifications${unread ? ` (${unread} non lues)` : ""}`} aria-expanded={open} onClick={() => setOpen(!open)}><Bell size={18} />{unread > 0 && <span className="cc-dot-count">{unread > 9 ? "9+" : unread}</span>}</button>
    {open && <section className="cc-notif-panel" aria-label="Notifications">
      <header><strong>Notifications</strong>{unread > 0 && <button className="cc-link" onClick={async () => { await api("notification-read", {}); load(); onChange(); }}><CheckCheck size={14} />Tout lire</button>}</header>
      <Chips label="Catégories" items={CATS} value={cat} onChange={setCat} />
      <div className="cc-notif-list">
        {!data ? <p className="cc-muted">Chargement…</p> : !groups.length ? <p className="cc-empty-line">Aucune notification 🎉</p> : groups.map((g: any) => g.items.length === 1
          ? <button key={g.key} className={"cc-notif-item" + (g.items[0].read_at ? "" : " unread")} onClick={() => go(g.items[0])}><strong>{g.items[0].title}</strong><span>{g.items[0].body}</span><small>{ago(g.items[0].created_at)}</small></button>
          : <div key={g.key} className={"cc-notif-group" + (g.unread ? " unread" : "")}>
            <button className="cc-notif-item" aria-expanded={expanded === g.key} onClick={() => setExpanded(expanded === g.key ? "" : g.key)}><strong>{g.title} — {g.items.length} événements{g.unread ? ` (${g.unread} non lus)` : ""}</strong><small>{ago(g.latest)}</small><ChevronDown size={14} /></button>
            {expanded === g.key && g.items.map((n: any) => <button key={n.id} className={"cc-notif-item sub" + (n.read_at ? "" : " unread")} onClick={() => go(n)}><strong>{n.title}</strong><span>{n.body}</span><small>{ago(n.created_at)}</small></button>)}
          </div>)}
      </div>
    </section>}
  </div>;
}
