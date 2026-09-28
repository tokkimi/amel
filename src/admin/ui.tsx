import { ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info, OctagonAlert, RefreshCw, X } from "lucide-react";
import { api } from "../client";

// ── Data loading ────────────────────────────────────────────────────────────────────────────────
export function useApi<T = any>(action: string | null, params: Record<string, string | number | undefined> = {}) {
  const query = Object.entries(params).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `&${k}=${encodeURIComponent(String(v))}`).join("");
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(!!action);
  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!action) return;
    const id = ++seq.current;
    setLoading(true); setError("");
    try { const result = await api<T>(action + query); if (id === seq.current) setData(result); }
    catch (e) { if (id === seq.current) setError((e as Error).message); }
    finally { if (id === seq.current) setLoading(false); }
  }, [action, query]);
  useEffect(() => { load(); }, [load]);
  return { data, error, loading, reload: load, setData };
}

// URL-synced parameter (drawers, sub-tabs): keeps list state mounted and supports the back button.
export function useUrlParam(name: string) {
  const read = () => new URLSearchParams(location.search).get(name) || "";
  const [value, setValue] = useState(read);
  useEffect(() => { const pop = () => setValue(read()); addEventListener("popstate", pop); addEventListener("cc:url", pop); return () => { removeEventListener("popstate", pop); removeEventListener("cc:url", pop); }; }, []);
  const set = useCallback((next: string, replace = false) => {
    const url = new URL(location.href);
    if (next) url.searchParams.set(name, next); else url.searchParams.delete(name);
    if (url.search === location.search) return;
    history[replace ? "replaceState" : "pushState"]({}, "", url.pathname + url.search);
    setValue(next);
    dispatchEvent(new Event("cc:url"));
  }, [name]);
  return [value, set] as const;
}
export function openParam(name: string, value: string) {
  const url = new URL(location.href);
  url.searchParams.set(name, value);
  history.pushState({}, "", url.pathname + url.search);
  dispatchEvent(new Event("cc:url"));
}

// ── Formatting ──────────────────────────────────────────────────────────────────────────────────
export const eur = (n: number | string | null | undefined, digits = 0) => Number(n || 0).toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: digits, minimumFractionDigits: digits });
export const num = (n: number | string | null | undefined) => Number(n || 0).toLocaleString("fr-FR");
export function ago(value?: string | null) {
  if (!value) return "—";
  const diff = Date.now() - new Date(value).getTime();
  const future = diff < 0, abs = Math.abs(diff), m = Math.round(abs / 60000);
  const text = m < 1 ? "à l’instant" : m < 60 ? `${m} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} j`;
  return m < 1 ? text : future ? `dans ${text}` : `il y a ${text}`;
}
export const day = (value?: string | null) => (value ? new Date(value).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: new Date(value).getFullYear() === new Date().getFullYear() ? undefined : "numeric", timeZone: "Europe/Paris" }) : "—");
export const time = (value?: string | null) => (value ? new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" }) : "");
export const initials = (name = "") => name.split(/\s+/).filter(Boolean).map((x) => x[0]).slice(0, 2).join("").toUpperCase() || "?";

// ── Labels ──────────────────────────────────────────────────────────────────────────────────────
export const SEVERITY: Record<string, { label: string; tone: string }> = {
  critical: { label: "Critique", tone: "critical" }, high: { label: "Urgent", tone: "critical" }, medium: { label: "À suivre", tone: "warn" },
  low: { label: "Faible", tone: "info" }, info: { label: "Info", tone: "info" },
};
export const EVENT_TYPE: Record<string, string> = {
  verification: "Vérification", finance: "Finance", support: "Support", document: "Document", onboarding: "Onboarding",
  appointment: "Pose / RDV", operational: "Opérationnel", security: "Sécurité",
};
export const EVENT_STATUS: Record<string, string> = { open: "Ouvert", in_progress: "En cours", resolved: "Résolu", dismissed: "Classé" };
export const TICKET_STATUS: Record<string, string> = { new: "Nouveau", open: "Ouvert", in_progress: "En cours", waiting_customer: "En attente cabinet", resolved: "Résolu", closed: "Clôturé" };
export const TICKET_PRIORITY: Record<string, string> = { low: "Basse", normal: "Normale", high: "Haute", critical: "Critique" };
export const TICKET_CATEGORY: Record<string, string> = { general: "Général", access: "Accès", billing: "Facturation", tiers_payant: "Tiers payant", bug: "Anomalie", onboarding: "Onboarding", data: "Données", other: "Autre" };
export const LIFECYCLE: Record<string, string> = { lead: "Lead", contacted: "Contacté", demo: "Démo", onboarding: "Onboarding", active: "Actif", at_risk: "À risque", churned: "Perdu" };
export const VERIFICATION: Record<string, string> = { new: "Nouveau", documents_received: "Documents reçus", reviewing: "En revue", missing_information: "Infos manquantes", approved: "Approuvé", rejected: "Refusé" };
export const ROLE: Record<string, string> = { patient: "Patient", professional: "Praticien", worker: "Assistant", admin: "Amelib" };

// ── Primitives ──────────────────────────────────────────────────────────────────────────────────
const toneIcon = { critical: OctagonAlert, warn: AlertTriangle, ok: CheckCircle2, info: Info } as const;
export function Badge({ tone = "neutral", children, icon = false }: { tone?: string; children: ReactNode; icon?: boolean }) {
  const I = icon ? toneIcon[tone as keyof typeof toneIcon] : null;
  return <span className={"cc-badge tone-" + tone}>{I && <I size={12} aria-hidden />}{children}</span>;
}
export function SeverityBadge({ severity }: { severity: string }) {
  const s = SEVERITY[severity] || SEVERITY.info;
  return <Badge tone={s.tone} icon>{s.label}</Badge>;
}
export function HealthBadge({ score, status, label }: { score: number; status: string; label: string }) {
  const tone = status === "stable" ? "ok" : status === "watch" ? "warn" : "critical";
  return <span className={"cc-health tone-" + tone} title={`Santé ${score}/100 — ${label}`}><b>{score}</b><small>{label}</small></span>;
}
export function Avatar({ name, size = 28 }: { name: string; size?: number }) {
  return <span className="cc-avatar" style={{ width: size, height: size, fontSize: size * 0.38 }} aria-hidden>{initials(name)}</span>;
}
export function Skeleton({ rows = 4, height = 18 }: { rows?: number; height?: number }) {
  return <div className="cc-skeleton" aria-busy="true" aria-label="Chargement…">{Array.from({ length: rows }, (_, i) => <span key={i} style={{ height, width: `${92 - ((i * 17) % 35)}%` }} />)}</div>;
}
export function ErrorState({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="cc-error" role="alert"><AlertTriangle size={18} /><div><strong>{message}</strong><small>Vérifiez votre connexion puis réessayez.</small></div>{retry && <button className="cc-btn" onClick={retry}><RefreshCw size={14} />Réessayer</button>}</div>;
}
export function Empty({ title, text, action, icon = "✓" }: { title: string; text?: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="cc-empty"><span aria-hidden className={icon === "✓" ? "" : "neutral"}>{icon}</span><strong>{title}</strong>{text && <p>{text}</p>}{action}</div>;
}
export function Loadable({ loading, error, retry, children, rows }: { loading: boolean; error: string; retry?: () => void; children: ReactNode; rows?: number }) {
  if (error) return <ErrorState message={error} retry={retry} />;
  if (loading) return <Skeleton rows={rows} />;
  return <>{children}</>;
}
export function Card({ title, action, children, className = "" }: { title?: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={"cc-card " + className}>{(title || action) && <header>{title && <h2>{title}</h2>}{action}</header>}{children}</section>;
}
export function Kpi({ label, value, hint, tone = "neutral", onClick, icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: string; onClick?: () => void; icon?: ReactNode }) {
  const Tag = onClick ? "button" : "div";
  return <Tag className={"cc-kpi tone-" + tone} onClick={onClick}>{icon}<strong>{value}</strong><span>{label}</span>{hint && <small>{hint}</small>}</Tag>;
}
export function Tabs({ tabs, value, onChange, label }: { tabs: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void; label: string }) {
  return <div className="cc-tabs" role="tablist" aria-label={label}>{tabs.map((t) => <button key={t.key} role="tab" aria-selected={value === t.key} className={value === t.key ? "active" : ""} onClick={() => onChange(t.key)}>{t.label}{t.count !== undefined && <span>{t.count}</span>}</button>)}</div>;
}
export function Chips({ items, value, onChange, label }: { items: { key: string; label: string; count?: number }[]; value: string; onChange: (k: string) => void; label: string }) {
  return <div className="cc-chips" role="group" aria-label={label}>{items.map((c) => <button key={c.key} aria-pressed={value === c.key} className={value === c.key ? "active" : ""} onClick={() => onChange(c.key)}>{c.label}{c.count !== undefined && <span>{c.count}</span>}</button>)}</div>;
}

// Side drawer (level 3 navigation). The underlying list stays mounted, so filters and scroll are kept.
// Stacked drawers (e.g. a ticket opened from a cabinet) close one at a time with Escape.
const drawerStack: symbol[] = [];
export function Drawer({ open, onClose, title, subtitle, actions, children, wide = false }: { open: boolean; onClose: () => void; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const me = Symbol("drawer");
    drawerStack.push(me);
    ref.current?.focus();
    const key = (e: KeyboardEvent) => { if (e.key === "Escape" && drawerStack[drawerStack.length - 1] === me && !document.querySelector(".cc-modal, .cc-palette")) { e.stopImmediatePropagation(); onClose(); } };
    addEventListener("keydown", key);
    document.body.classList.add("cc-lock");
    return () => { removeEventListener("keydown", key); drawerStack.splice(drawerStack.indexOf(me), 1); if (!drawerStack.length) document.body.classList.remove("cc-lock"); previous?.focus?.(); };
  }, [open]);
  if (!open) return null;
  return <div className="cc-drawer-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <aside ref={ref} tabIndex={-1} className={"cc-drawer" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Détail"}>
      <header className="cc-drawer-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div><div className="cc-drawer-actions">{actions}<button className="cc-icon" aria-label="Fermer" onClick={onClose}><X size={18} /></button></div></header>
      <div className="cc-drawer-body">{children}</div>
    </aside>
  </div>;
}

// Confirmation for sensitive actions: always shows a summary; optionally requires a reason.
export type ConfirmRequest = { title: string; summary: ReactNode; confirmLabel?: string; danger?: boolean; reason?: boolean | "optional"; run: (reason: string) => Promise<unknown> };
export function ConfirmDialog({ request, close }: { request: ConfirmRequest | null; close: () => void }) {
  const [reason, setReason] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { setReason(""); setError(""); }, [request]);
  if (!request) return null;
  const needs = request.reason === true;
  return <div className="cc-modal-backdrop"><form className="cc-modal" role="alertdialog" aria-modal="true" aria-label={request.title} onSubmit={async (e) => {
    e.preventDefault(); if (needs && !reason.trim()) return setError("Le motif est obligatoire.");
    setBusy(true); setError("");
    try { await request.run(reason.trim()); close(); } catch (err) { setError((err as Error).message); } finally { setBusy(false); }
  }}>
    <h2>{request.title}</h2>
    <div className="cc-modal-summary">{request.summary}</div>
    {request.reason && <label>Motif{needs ? " (obligatoire)" : " (facultatif)"}<textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={3} required={needs} /></label>}
    {error && <p className="cc-form-error" role="alert">{error}</p>}
    <div className="cc-modal-actions"><button type="button" className="cc-btn" onClick={close} disabled={busy}>Annuler</button><button className={"cc-btn " + (request.danger ? "is-danger" : "is-primary")} disabled={busy} autoFocus={!request.reason}>{busy ? "…" : request.confirmLabel || "Confirmer"}</button></div>
  </form></div>;
}

// Universal timeline, grouped by day.
export type TimelineItem = { at: string; label: string; actor?: string | null; kind?: string; code?: string };
export function Timeline({ items, empty = "Aucun événement pour le moment." }: { items: TimelineItem[]; empty?: string }) {
  if (!items?.length) return <Empty title={empty} icon="·" />;
  const groups: [string, TimelineItem[]][] = [];
  for (const item of items) {
    const d = new Date(item.at), today = new Date(), yesterday = new Date(Date.now() - 86400000);
    const key = d.toDateString() === today.toDateString() ? "Aujourd’hui" : d.toDateString() === yesterday.toDateString() ? "Hier" : d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });
    const last = groups[groups.length - 1];
    if (last && last[0] === key) last[1].push(item); else groups.push([key, [item]]);
  }
  return <div className="cc-timeline">{groups.map(([label, list]) => <section key={label}><h4>{label}</h4><ol>{list.map((item, i) => <li key={i} className={"kind-" + (item.kind || "audit")}><time>{time(item.at)}</time><div><span>{item.label || AUDIT_LABEL[item.code || ""] || item.code}</span>{item.actor && <small>{item.actor}</small>}</div></li>)}</ol></section>)}</div>;
}
export const AUDIT_LABEL: Record<string, string> = {
  profile_verified: "Profil vérifié", verification_removed: "Vérification retirée", verification_rejected: "Vérification refusée", verification_status_changed: "Statut de vérification modifié",
  account_suspended: "Compte suspendu", account_reactivated: "Compte réactivé", profile_unpublished: "Profil retiré", settings_updated: "Paramètres modifiés",
  event_created: "Tâche créée", event_updated: "Élément mis à jour", bulk_events_updated: "Modification groupée", bulk_cabinets_updated: "Cabinets modifiés en masse",
  internal_note_added: "Note interne", support_replied: "Réponse support", support_internal_note: "Note interne support", support_updated: "Ticket mis à jour",
  cabinet_crm_updated: "Suivi commercial modifié", assist_started: "Mode assistance démarré", assist_ended: "Mode assistance terminé", automation_run: "Automatisations exécutées",
  automation_rule_updated: "Règle modifiée", feature_flag_saved: "Feature flag", feature_flag_override: "Feature flag cabinet", admin_role_assigned: "Rôle interne modifié",
  bulk_export: "Export", team_access_updated: "Droits d’équipe", patient_created: "Fiche patient créée", account_details_updated: "Coordonnées modifiées",
};

// Minimal CSS bar chart (no dependency). Values are labelled, not colour-only.
export function Bars({ data, format = num, height = 120 }: { data: { label: string; value: number; secondary?: number }[]; format?: (n: number) => string; height?: number }) {
  if (!data.length) return <Empty title="Pas encore de données sur la période." icon="·" />;
  const max = Math.max(1, ...data.map((d) => Math.max(d.value, d.secondary || 0)));
  return <div className="cc-bars" style={{ height: height + 34 }} role="img" aria-label={data.map((d) => `${d.label} : ${format(d.value)}`).join(", ")}>
    {data.map((d) => <div key={d.label} title={`${d.label} : ${format(d.value)}${d.secondary !== undefined ? ` / ${format(d.secondary)}` : ""}`}>
      <div className="cc-bar-stack" style={{ height }}><i style={{ height: `${(d.value / max) * 100}%` }} />{d.secondary !== undefined && <i className="alt" style={{ height: `${(d.secondary / max) * 100}%` }} />}</div>
      <small>{d.label}</small>
    </div>)}
  </div>;
}
export function Meter({ value, max = 100, tone }: { value: number; max?: number; tone?: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return <span className={"cc-meter tone-" + (tone || (pct >= 75 ? "ok" : pct >= 50 ? "warn" : "critical"))} role="meter" aria-valuenow={value} aria-valuemin={0} aria-valuemax={max}><i style={{ width: pct + "%" }} /></span>;
}

// Snooze presets: tomorrow 8:00, next Monday 8:00, +7 days, custom date.
export function snoozeDate(kind: "tomorrow" | "monday" | "week") {
  const d = new Date(); d.setHours(8, 0, 0, 0);
  if (kind === "tomorrow") d.setDate(d.getDate() + 1);
  if (kind === "monday") d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  if (kind === "week") d.setDate(d.getDate() + 7);
  return d.toISOString();
}

export function csvDownload(name: string, rows: (string | number | null | undefined)[][]) {
  const safe = (s: string) => (/^[=+\-@\t\r]/.test(s) ? "'" + s : s);
  const text = "﻿" + rows.map((row) => row.map((v) => '"' + safe(String(v ?? "")).replace(/"/g, '""') + '"').join(";")).join("\r\n");
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a"); a.href = url; a.download = name + ".csv"; a.click(); URL.revokeObjectURL(url);
}
