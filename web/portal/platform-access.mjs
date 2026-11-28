// Papel e capacidades na administração (spec 022). O servidor decide em GET /api/admin/me;
// aqui só escolhemos o que mostrar. A matriz completa fica em src/admin/platform-roles.mjs.
export const ROLE_LABELS = Object.freeze({
  platform_owner: 'Dono da plataforma',
  platform_admin: 'Administrador',
  license_manager: 'Gestor de licenças',
  support_operator: 'Suporte',
  sponsor: 'Patrocinador'
});

export const PLAN_NAMES = Object.freeze({
  free: 'Gratuito/Social',
  essencial: 'Essencial',
  profissional: 'Profissional',
  equipe: 'Equipe/Multi-Vitrine'
});

export const LICENSE_SOURCES = Object.freeze({ manual: 'manual', coupon: 'cupom', courtesy: 'cortesia' });

export const NO_ACCESS = Object.freeze({ role: null, capabilities: [] });

export function normalizeAccess(raw) {
  const capabilities = Array.isArray(raw?.capabilities) ? raw.capabilities.filter(cap => typeof cap === 'string') : [];
  return { role: typeof raw?.role === 'string' ? raw.role : null, capabilities };
}

export function can(access, capability) {
  return Boolean(access?.capabilities?.includes(capability));
}

export function manageableRoles(access) {
  return [
    ...(can(access, 'admins.manage') ? ['platform_admin'] : []),
    ...(can(access, 'staff.manage') ? ['license_manager', 'support_operator'] : [])
  ];
}

export function canManageRole(access, role) {
  return manageableRoles(access).includes(role);
}

export function formatMoney(cents) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(cents ?? 0) / 100);
}

export function formatDay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' });
}

export function element(tag, className, text) {
  const node = globalThis.document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export function actionButton(text, variant = 'button-secondary') {
  const node = element('button', `button button-small ${variant} button-pill`.replace(/\s+/g, ' '), text);
  node.type = 'button';
  return node;
}

export async function adminRequest(path, method = 'GET', payload) {
  const response = await fetch(path, {
    method,
    ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw Object.assign(new Error(data?.error?.message ?? 'Não foi possível concluir a operação.'), {
      status: response.status, code: data?.error?.code
    });
  }
  return data;
}

export async function copyText(text) {
  try {
    await globalThis.navigator?.clipboard?.writeText(text);
    return true;
  } catch {
    return false;
  }
}
