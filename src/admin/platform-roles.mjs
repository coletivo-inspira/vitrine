// Matriz de capacidades da administração (spec 022). Espelhada em
// private.platform_capabilities(); test/database/platform-hierarchy.test.mjs compara as duas.
export const PLATFORM_ROLES = ['platform_owner', 'platform_admin', 'license_manager', 'support_operator', 'sponsor'];

export const PLATFORM_CAPABILITIES = Object.freeze({
  platform_owner: ['platform.operate', 'users.read', 'licenses.manage', 'staff.manage', 'admins.manage'],
  platform_admin: ['platform.operate', 'users.read', 'licenses.manage', 'staff.manage'],
  license_manager: ['users.read', 'licenses.manage'],
  support_operator: [],
  sponsor: []
});

export const PLATFORM_ROLE_LABELS = Object.freeze({
  platform_owner: 'Dono da plataforma',
  platform_admin: 'Administrador',
  license_manager: 'Gestor de licenças',
  support_operator: 'Suporte',
  sponsor: 'Patrocinador'
});

export const MANAGEABLE_ROLES = ['platform_admin', 'license_manager', 'support_operator'];

export function capabilitiesOf(role) {
  return PLATFORM_CAPABILITIES[role] ?? [];
}

export function hasCapability(role, capability) {
  return capabilitiesOf(role).includes(capability);
}

export function canManageRole(actorRole, targetRole) {
  if (targetRole === 'platform_admin') return hasCapability(actorRole, 'admins.manage');
  if (targetRole === 'license_manager' || targetRole === 'support_operator') return hasCapability(actorRole, 'staff.manage');
  return false;
}

export function hasAdminArea(role) {
  return capabilitiesOf(role).length > 0;
}
