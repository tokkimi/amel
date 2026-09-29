// Feature flag resolution for one workspace: per-cabinet override > rollout (off | internal | pilot | all).
// "internal" = Amelib team accounts only, "pilot" = cabinets tagged « pilote » in the CRM.
export async function resolveFlags(sql, { workspaceId, isAdmin }) {
  const rows = await sql`SELECT f.key,f.rollout,o.enabled AS override,coalesce(crm.tags,'[]'::jsonb) ? 'pilote' AS pilot
    FROM feature_flags f LEFT JOIN feature_flag_overrides o ON o.flag_key=f.key AND o.cabinet_id=${workspaceId} LEFT JOIN cabinet_crm crm ON crm.cabinet_id=${workspaceId}`;
  return Object.fromEntries(rows.map((f) => [f.key, f.override ?? (f.rollout === 'all' || (f.rollout === 'internal' && isAdmin) || (f.rollout === 'pilot' && f.pilot))]));
}
