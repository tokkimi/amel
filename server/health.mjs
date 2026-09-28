// Deterministic cabinet health score (0–100). No AI, no hidden weights — every point is explained.
//
// Dimension   Max  Rule
// Activation   20  onboarding completion ratio × 20
// Utilisation  25  activity over the last 14 days vs the 14 before: none → 0, drop > 30 % → 12, otherwise 25
// Finance      20  overdue cabinet invoices: none → 20, 1–2 (all < 60 days) → 12, otherwise 5
// Support      20  tickets opened in 14 days: 0 → 20, 1–2 → 14, 3+ → 6, any open critical ticket caps at 4
// Engagement   15  last activity (login or data): ≤ 7 days → 15, ≤ 14 → 9, ≤ 30 → 4, otherwise 0
// Status: ≥ 75 « Stable », 50–74 « À surveiller », < 50 « À risque ».
export const ONBOARDING_STEPS = [
  ['account', 'Compte créé'], ['profile', 'Informations cabinet complétées'], ['team', 'Équipe invitée'],
  ['agenda', 'Agenda configuré'], ['patient', 'Premier patient'], ['quote', 'Premier devis'], ['training', 'Formation terminée'],
];
export function onboarding(s) {
  const done = {
    account: true,
    profile: !!(s.clinic_name && s.city && s.address && s.identifier && s.phone),
    team: Number(s.team_count || 0) + Number(s.pending_invites || 0) > 0,
    agenda: !!s.agenda_configured,
    patient: Number(s.patient_count || 0) > 0,
    quote: Number(s.quote_count || 0) > 0,
    training: !!s.training_done_at,
  };
  const steps = ONBOARDING_STEPS.map(([key, label]) => ({ key, label, done: done[key] }));
  const completed = steps.filter((x) => x.done).length;
  return { steps, completed, total: steps.length, percent: Math.round((completed / steps.length) * 100) };
}
const days = (value, now) => (value ? Math.floor((now - new Date(value).getTime()) / 86400000) : null);
export function healthScore(s, now = Date.now()) {
  const ob = onboarding(s);
  const reasons = [];
  const dimensions = [];
  const push = (key, label, score, max, why) => { dimensions.push({ key, label, score, max, ok: score >= max * 0.7, why }); reasons.push(why); };
  push('activation', 'Activation', Math.round((ob.completed / ob.total) * 20), 20, `Onboarding complété à ${ob.percent} % (${ob.completed}/${ob.total} étapes).`);
  const recent = Number(s.activity_14d || 0), previous = Number(s.activity_prev_14d || 0);
  const trend = previous > 0 ? Math.round(((recent - previous) / previous) * 100) : null;
  if (!recent) push('usage', 'Utilisation', 0, 25, 'Aucune activité enregistrée sur les 14 derniers jours.');
  else if (trend !== null && trend < -30) push('usage', 'Utilisation', 12, 25, `Activité en baisse de ${Math.abs(trend)} % sur 14 jours (${recent} contre ${previous}).`);
  else push('usage', 'Utilisation', 25, 25, trend === null ? `${recent} action(s) sur 14 jours.` : `Activité ${trend >= 0 ? 'en hausse' : 'en baisse'} de ${Math.abs(trend)} % sur 14 jours (${recent} action(s)).`);
  const overdue = Number(s.overdue_count || 0), oldest = Number(s.overdue_max_days || 0);
  if (!overdue) push('finance', 'Finance', 20, 20, 'Aucun impayé en retard.');
  else if (overdue <= 2 && oldest < 60) push('finance', 'Finance', 12, 20, `${overdue} facture(s) en retard (jusqu’à ${oldest} j).`);
  else push('finance', 'Finance', 5, 20, `${overdue} facture(s) en retard, dont la plus ancienne depuis ${oldest} j.`);
  const tickets = Number(s.tickets_14d || 0), critical = Number(s.critical_open || 0);
  let support = tickets === 0 ? 20 : tickets <= 2 ? 14 : 6;
  if (critical > 0) support = Math.min(support, 4);
  push('support', 'Support', support, 20, critical > 0 ? `${critical} ticket(s) critique(s) ouvert(s).` : `${tickets} ticket(s) support sur les 14 derniers jours.`);
  const idle = days(s.last_activity_at, now);
  const engagement = idle === null ? 0 : idle <= 7 ? 15 : idle <= 14 ? 9 : idle <= 30 ? 4 : 0;
  push('engagement', 'Engagement', engagement, 15, idle === null ? 'Aucune activité connue.' : idle === 0 ? 'Équipe active aujourd’hui.' : `Dernière activité il y a ${idle} jour(s).`);
  const score = dimensions.reduce((sum, d) => sum + d.score, 0);
  return { score, status: score >= 75 ? 'stable' : score >= 50 ? 'watch' : 'risk', label: score >= 75 ? 'Stable' : score >= 50 ? 'À surveiller' : 'À risque', dimensions, reasons, trend, onboarding: ob };
}
// Support SLA targets (first response), in hours, by priority.
export const SLA_HOURS = { critical: 4, high: 24, normal: 48, low: 96 };
export function slaState(ticket, now = Date.now()) {
  const target = SLA_HOURS[ticket.priority] || SLA_HOURS.normal;
  const due = ticket.due_at ? new Date(ticket.due_at).getTime() : new Date(ticket.created_at).getTime() + target * 3600000;
  if (['resolved', 'closed'].includes(ticket.status)) return { due: new Date(due).toISOString(), state: 'done' };
  if (ticket.first_response_at && !ticket.due_at) return { due: new Date(due).toISOString(), state: 'answered' };
  const left = due - now;
  return { due: new Date(due).toISOString(), state: left < 0 ? 'breached' : left < 0.25 * target * 3600000 ? 'at_risk' : 'ok' };
}
// Receivable aging buckets (days past due date).
export function agingBucket(daysLate) {
  if (daysLate <= 30) return '0-30';
  if (daysLate <= 60) return '31-60';
  if (daysLate <= 90) return '61-90';
  return '90+';
}
