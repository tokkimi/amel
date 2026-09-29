import { useEffect, useState } from "react";
import { Play, RefreshCw } from "lucide-react";
import { api } from "../client";
import { useCC } from "./context";
import { ago, Badge, Card, Empty, Loadable, Tabs, useApi, useUrlParam } from "./ui";

const SUBS = ["Plateforme", "Automatisations", "Feature flags", "Équipe & rôles", "Santé système"];
export default function Config() {
  const cc = useCC();
  const { data, error, loading, reload } = useApi<any>("cc-config", { v: cc.version });
  const [sub, setSub] = useUrlParam("sub");
  const tab = SUBS.includes(sub) ? sub : "Plateforme";
  return <div className="cc-stack">
    <header className="cc-page-head"><div><h1>Paramètres</h1><p>Paramètres publics, règles automatiques, fonctionnalités, rôles internes et santé technique.</p></div></header>
    <Tabs label="Configuration" tabs={SUBS.map((s) => ({ key: s, label: s }))} value={tab} onChange={(s) => setSub(s === "Plateforme" ? "" : s, true)} />
    <Loadable loading={loading && !data} error={error} retry={reload} rows={8}>
      {data && <>
        {tab === "Plateforme" && <Platform settings={data.settings} />}
        {tab === "Automatisations" && <Automations data={data} />}
        {tab === "Feature flags" && <Flags flags={data.flags} />}
        {tab === "Équipe & rôles" && <Roles data={data} />}
        {tab === "Santé système" && <SystemHealth />}
      </>}
    </Loadable>
  </div>;
}

function Platform({ settings: initial }: { settings: any }) {
  const cc = useCC();
  const [s, setS] = useState(initial), [busy, setBusy] = useState(false), [err, setErr] = useState("");
  useEffect(() => setS(initial), [initial]);
  const edit = cc.can("settings.update");
  return <Card title="Informations publiques">
    <form className="cc-form" onSubmit={async (e) => { e.preventDefault(); setBusy(true); setErr(""); try { await api("admin-settings", s); cc.toast("Paramètres enregistrés dans le journal."); cc.bump(); } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); } }}>
      <p className="cc-muted">Visibles sur le site public et journalisées.</p>
      <label>Nom de la plateforme<input required maxLength={60} value={s.name} disabled={!edit} onChange={(e) => setS({ ...s, name: e.target.value })} /></label>
      <label>E-mail de contact public<input type="email" maxLength={254} value={s.support_email} disabled={!edit} onChange={(e) => setS({ ...s, support_email: e.target.value })} /></label>
      <label>Bandeau d’annonce<textarea rows={3} maxLength={300} value={s.announcement} disabled={!edit} onChange={(e) => setS({ ...s, announcement: e.target.value })} /><small>Laissez vide pour afficher le message d’accueil par défaut.</small></label>
      {err && <p className="cc-form-error" role="alert">{err}</p>}
      {edit && <button className="cc-btn is-primary" disabled={busy}>Enregistrer</button>}
      <p className="cc-muted">L’attribution du rôle administrateur est effectuée en base, séparément. Aucun compte public ne peut s’octroyer ce rôle.</p>
    </form>
  </Card>;
}

function Automations({ data }: { data: any }) {
  const cc = useCC();
  const edit = cc.can("settings.update");
  const state = data.automation_state?.value;
  const save = async (rule: any, patch: Record<string, unknown>) => { try { await api("cc-rule-update", { key: rule.key, enabled: rule.enabled, params: rule.params, ...patch }); cc.toast("Règle enregistrée (journalisée)."); cc.bump(); } catch (e) { cc.toast((e as Error).message); } };
  return <div className="cc-stack">
    <Card title="Moteur de règles" action={edit && <button className="cc-btn" onClick={async () => { await api("cc-automations-run", {}); cc.toast("Règles exécutées."); cc.bump(); }}><Play size={14} />Exécuter maintenant</button>}>
      <p className="cc-muted">Règles déterministes, exécutées à chaque ouverture de l’accueil ou de l’Inbox (au plus une fois par minute). Chaque élément créé indique la règle qui l’a produit ; il se résout automatiquement quand la condition disparaît. Les exécutions qui modifient quelque chose sont journalisées.</p>
      {state && <p className="cc-inline">Dernière exécution : {ago(data.automation_state.updated_at)} {state.ok ? <Badge tone="ok">OK · {state.duration_ms} ms</Badge> : <Badge tone="critical">Échec</Badge>}</p>}
    </Card>
    {data.rules.map((r: any) => <Card key={r.key} className="cc-rule" title={<span className="cc-inline">{r.label}<Badge tone={r.enabled ? "ok" : "neutral"}>{r.enabled ? "Active" : "Désactivée"}</Badge></span>}
      action={edit && <label className="cc-switch"><input type="checkbox" checked={r.enabled} onChange={(e) => save(r, { enabled: e.target.checked })} /><span>Activer</span></label>}>
      <p className="cc-rule-text"><b>{r.condition}</b><br />{r.action}</p>
      {state?.rules?.[r.key] && <small className="cc-muted">Dernier passage : {state.rules[r.key].created ?? 0} créé(s), {state.rules[r.key].resolved ?? 0} résolu(s){state.rules[r.key].notified !== undefined ? `, ${state.rules[r.key].notified} notification(s)` : ""}.</small>}
      {edit && <div className="cc-inline">
        {Object.entries(r.params).filter(([k]) => k !== "assign_to").map(([k, v]) => <label key={k} className="cc-param">{({ escalate_hours: "Escalade après (h)", days: "Seuil (jours)" } as Record<string, string>)[k] || k}<input type="number" min={0} defaultValue={Number(v)} onBlur={(e) => Number(e.target.value) !== Number(v) && save(r, { params: { ...r.params, [k]: Number(e.target.value) } })} /></label>)}
        {r.key !== "support_critical_notify" && <label className="cc-param">Assigner à<select value={r.params.assign_to || ""} onChange={(e) => save(r, { params: { ...r.params, assign_to: e.target.value } })}><option value="">Personne</option>{cc.me.team.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>}
      </div>}
    </Card>)}
  </div>;
}

function Flags({ flags }: { flags: any[] }) {
  const cc = useCC();
  const edit = cc.can("settings.update");
  const [busy, setBusy] = useState(false);
  const ROLLOUT: Record<string, string> = { off: "Désactivé", internal: "SmilePec uniquement", pilot: "Cabinets pilotes (tag « pilote » ou forçage)", all: "Tous les cabinets" };
  return <div className="cc-stack">
    <Card title="Feature flags">
      <p className="cc-muted">Déploiement progressif : désactivé, équipe SmilePec, cabinets pilotes, tous — avec forçage ON/OFF par cabinet depuis sa fiche 360°.</p>
      {flags.length ? <ul className="cc-list">{flags.map((f) => <li key={f.key}><span><strong>{f.label}</strong><small>{f.key}{f.description ? " · " + f.description : ""} · {f.overrides_on} forcé(s) ON, {f.overrides_off} OFF</small></span>
        {edit ? <select aria-label={"Déploiement " + f.label} value={f.rollout} onChange={async (e) => { await api("cc-flag-save", { ...f, rollout: e.target.value }); cc.toast("Feature flag enregistré."); cc.bump(); }}>{Object.entries(ROLLOUT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <Badge>{ROLLOUT[f.rollout]}</Badge>}</li>)}</ul>
        : <Empty title="Aucun feature flag." text="Créez le premier ci-dessous." icon="·" />}
    </Card>
    {edit && <Card title="Nouveau feature flag"><form className="cc-form-grid" onSubmit={async (e) => { e.preventDefault(); const form = e.currentTarget; const f = Object.fromEntries(new FormData(form)); setBusy(true); try { await api("cc-flag-save", f); form.reset(); cc.toast("Feature flag créé."); cc.bump(); } catch (err) { cc.toast((err as Error).message); } finally { setBusy(false); } }}>
      <label>Clé<input name="key" required pattern="[a-z0-9_]{2,60}" placeholder="new_calendar" /></label>
      <label>Libellé<input name="label" required maxLength={80} placeholder="Nouveau calendrier" /></label>
      <label>Description<input name="description" maxLength={300} /></label>
      <label>Déploiement<select name="rollout" defaultValue="off">{Object.entries(ROLLOUT).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
      <button className="cc-btn is-primary" disabled={busy}>Créer</button>
    </form></Card>}
  </div>;
}

function Roles({ data }: { data: any }) {
  const cc = useCC();
  const manage = cc.can("rbac.manage");
  return <div className="cc-stack">
    <Card title="Équipe SmilePec">
      <p className="cc-muted">Les comptes administrateurs existants sans rôle interne conservent tous les droits (Platform Owner) : la migration est progressive et rétrocompatible.</p>
      <ul className="cc-list">{data.team.map((m: any) => <li key={m.id}><span><strong>{m.name}</strong><small>{m.email}{m.legacy ? " · rôle hérité" : ""}</small></span>
        {manage ? <select aria-label={"Rôle de " + m.name} value={m.internal_role} onChange={(e) => { const role = e.target.value; const label = data.roles.find((r: any) => r.key === role)?.label; cc.confirm({ title: "Changer les permissions", reason: true, danger: true, summary: <p><b>{m.name}</b> passera au rôle <b>{label}</b>. Ce changement est journalisé.</p>, run: async (reason) => { await api("cc-role-assign", { account_id: m.id, internal_role: role, reason }); cc.toast("Rôle mis à jour."); cc.bump(); } }); }}>{data.roles.map((r: any) => <option key={r.key} value={r.key}>{r.label}</option>)}</select> : <Badge>{data.roles.find((r: any) => r.key === m.internal_role)?.label}</Badge>}</li>)}</ul>
    </Card>
    <Card title="Matrice des permissions">
      <div className="cc-matrix-wrap"><table className="cc-table plain cc-matrix"><thead><tr><th>Permission</th>{data.roles.map((r: any) => <th key={r.key}>{r.label}</th>)}</tr></thead>
        <tbody>{data.permissions.map((p: string) => <tr key={p}><td><code>{p}</code></td>{data.roles.map((r: any) => <td key={r.key} aria-label={r.permissions.includes(p) ? "autorisé" : "refusé"}>{r.permissions.includes(p) ? "✓" : "·"}</td>)}</tr>)}</tbody></table></div>
    </Card>
  </div>;
}

function SystemHealth() {
  const { data, error, loading, reload } = useApi<any>("cc-system");
  const tone: Record<string, [string, string]> = { ok: ["ok", "Opérationnel"], down: ["critical", "Incident"], unknown: ["neutral", "Inconnu"], not_configured: ["neutral", "Non configuré"] };
  return <Card title="Santé système" action={<button className="cc-btn" onClick={reload}><RefreshCw size={14} />Mesurer</button>}>
    <p className="cc-muted">Uniquement des contrôles réellement mesurés par l’application ; rien n’est affiché « opérationnel » par défaut.</p>
    <Loadable loading={loading && !data} error={error} retry={reload}>
      <ul className="cc-list">{data?.checks.map((c: any) => <li key={c.key}><span><strong>{c.label}</strong><small>{c.detail}</small></span><Badge tone={tone[c.state][0]} icon>{tone[c.state][1]}</Badge></li>)}</ul>
      {data && <small className="cc-muted">Mesuré {ago(data.measured_at)}.</small>}
    </Loadable>
  </Card>;
}
