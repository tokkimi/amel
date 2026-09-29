// Internal (Amelib team) RBAC. Layered on top of accounts.role='admin', which stays the entry gate.
// An admin account without an admin_members row is treated as platform_owner (backward compatible).
export const PERMISSIONS = [
  'pec.manage', 'cabinet.read', 'cabinet.update', 'verification.read', 'verification.approve', 'verification.reject',
  'support.read', 'support.reply', 'support.assign', 'billing.read', 'billing.manage',
  'account.read', 'account.suspend', 'audit.read', 'analytics.read', 'impersonation.readonly',
  'settings.read', 'settings.update', 'inbox.manage', 'export.bulk', 'rbac.manage', 'appointment.manage',
];
const read = ['cabinet.read', 'verification.read', 'support.read', 'billing.read', 'account.read', 'analytics.read', 'settings.read'];
export const INTERNAL_ROLES = {
  platform_owner: { label: 'Platform Owner', permissions: PERMISSIONS },
  operations_admin: { label: 'Operations Admin', permissions: [...read, 'pec.manage', 'cabinet.update', 'verification.approve', 'verification.reject', 'support.reply', 'support.assign', 'account.suspend', 'audit.read', 'impersonation.readonly', 'inbox.manage', 'export.bulk', 'appointment.manage'] },
  support_agent: { label: 'Support Agent', permissions: ['cabinet.read', 'support.read', 'support.reply', 'support.assign', 'account.read', 'inbox.manage', 'impersonation.readonly'] },
  finance_admin: { label: 'Finance Admin', permissions: ['cabinet.read', 'billing.read', 'billing.manage', 'account.read', 'analytics.read', 'inbox.manage', 'export.bulk'] },
  verification_agent: { label: 'Verification Agent', permissions: ['cabinet.read', 'account.read', 'verification.read', 'verification.approve', 'verification.reject', 'inbox.manage'] },
  read_only_analyst: { label: 'Read-only Analyst', permissions: [...read, 'audit.read'] },
};
// Legacy admin actions keep their behaviour but are now guarded by the matching permission.
export const LEGACY_ACTION_PERMISSION = {
  admin: 'account.read', 'admin-verify': 'verification.approve', 'admin-suspend': 'account.suspend',
  'admin-unpublish': 'account.suspend', 'admin-settings': 'settings.update', 'support-update': 'support.reply',
  'admin-cabinets': 'cabinet.read', 'admin-account-update': 'cabinet.update',
};
export function permissionsFor(internalRole) {
  return new Set((INTERNAL_ROLES[internalRole] || INTERNAL_ROLES.platform_owner).permissions);
}
export async function adminContext(sql, account) {
  if (account?.role !== 'admin') return null;
  const [member] = await sql`SELECT internal_role FROM admin_members WHERE account_id=${account.id}`.catch(() => []);
  const role = member?.internal_role && INTERNAL_ROLES[member.internal_role] ? member.internal_role : 'platform_owner';
  return { role, label: INTERNAL_ROLES[role].label, permissions: permissionsFor(role) };
}
