import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, CornerDownLeft, FileText, Inbox, LifeBuoy, ListTodo, Search, ShieldCheck, User } from "lucide-react";
import { api } from "../client";
import { Section, useCC } from "./context";

type Item = { id: string; group: string; label: string; hint?: string; icon: any; run: () => void };
// ⌘K / Ctrl K: search anything or run a safe action. Sensitive actions are not exposed here;
// they stay behind confirmations on their own screens.
export default function CommandPalette({ open, close }: { open: boolean; close: () => void }) {
  const cc = useCC();
  const [q, setQ] = useState(""), [results, setResults] = useState<any[]>([]), [active, setActive] = useState(0), [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => { if (open) { setQ(""); setResults([]); setActive(0); setTimeout(() => input.current?.focus(), 10); } }, [open]);
  useEffect(() => {
    if (q.trim().length < 2) { setResults([]); return; }
    setBusy(true);
    const t = setTimeout(() => api("cc-search&q=" + encodeURIComponent(q.trim())).then((r) => setResults(r.groups)).catch(() => setResults([])).finally(() => setBusy(false)), 180);
    return () => clearTimeout(t);
  }, [q]);
  const nav = (label: string, section: Section, sub?: string, icon = ArrowRight, perm?: string): Item | null => (perm && !cc.can(perm) ? null : { id: "nav-" + label, group: "Actions", label, icon, run: () => cc.go(section, sub) });
  const actions = ([
    nav("Ouvrir l’accueil", "Accueil"), nav("Ouvrir l’Inbox", "Inbox", undefined, Inbox), nav("Tickets urgents", "Inbox", "urgent", LifeBuoy),
    nav("Mes tâches", "Inbox", "mine", ListTodo), nav("Vérifications en attente", "Réseau", "Vérifications", ShieldCheck, "verification.read"),
    nav("Ouvrir Finance", "Finance", undefined, FileText, "billing.read"), nav("Support Center", "Support", undefined, LifeBuoy, "support.read"),
    nav("Cabinets à relancer", "Cabinets", "relancer", Building2, "cabinet.read"), nav("Nouveaux cabinets", "Cabinets", "new", Building2, "cabinet.read"),
    nav("Onboarding bloqué", "Réseau", "Onboarding", Building2, "cabinet.read"), nav("Analytics", "Analytics", undefined, ArrowRight, "analytics.read"),
    nav("Journal d’audit", "Sécurité & Audit", undefined, ShieldCheck, "audit.read"),
    cc.can("inbox.manage") ? { id: "create-task", group: "Actions", label: "Créer une tâche", icon: ListTodo, run: () => cc.createTask() } : null,
  ].filter(Boolean) as Item[]);
  const items = useMemo(() => {
    const text = q.trim().toLowerCase();
    const acts = text ? actions.filter((a) => a.label.toLowerCase().includes(text)) : actions;
    const found: Item[] = results.flatMap((g) => g.items.map((x: any) => ({
      id: g.key + x.id, group: g.label, label: x.title, hint: x.subtitle,
      icon: g.key === "cabinets" ? Building2 : g.key === "support" ? LifeBuoy : g.key === "finance" ? FileText : g.key === "inbox" ? Inbox : User,
      run: () => g.key === "cabinets" ? cc.open("cabinet", x.id) : g.key === "support" ? cc.open("ticket", x.id) : g.key === "finance" ? cc.open("cabinet", x.owner_id) : g.key === "inbox" ? cc.open("event", x.id) : cc.go("Réseau", "Comptes:" + x.title),
    })));
    return [...found, ...acts];
  }, [q, results, cc.me]);
  useEffect(() => setActive(0), [items.length]);
  if (!open) return null;
  const run = (item?: Item) => { if (!item) return; close(); item.run(); };
  let lastGroup = "";
  return <div className="cc-modal-backdrop top" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}>
    <div className="cc-palette" role="dialog" aria-modal="true" aria-label="Rechercher ou effectuer une action">
      <label className="cc-palette-input"><Search size={18} aria-hidden /><input ref={input} role="combobox" aria-expanded aria-controls="cc-palette-list" aria-activedescendant={items[active]?.id} placeholder="Rechercher dans SmilePec ou effectuer une action…" value={q} onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(items.length - 1, a + 1)); } if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); } if (e.key === "Enter") run(items[active]); if (e.key === "Escape") close(); }} /><kbd>Échap</kbd></label>
      <ul id="cc-palette-list" role="listbox">
        {items.map((item, i) => { const header = item.group !== lastGroup ? (lastGroup = item.group) : null; const I = item.icon; return [
          header && <li key={"h" + item.group} className="cc-palette-group" role="presentation">{header}</li>,
          <li key={item.id} id={item.id} role="option" aria-selected={i === active} className={i === active ? "active" : ""} onMouseEnter={() => setActive(i)} onClick={() => run(item)}><I size={15} aria-hidden /><span>{item.label}{item.hint && <small>{item.hint}</small>}</span>{i === active && <CornerDownLeft size={13} aria-hidden />}</li>,
        ]; })}
        {!items.length && <li className="cc-palette-empty">{busy ? "Recherche…" : "Aucun résultat autorisé pour cette recherche."}</li>}
      </ul>
    </div>
  </div>;
}
