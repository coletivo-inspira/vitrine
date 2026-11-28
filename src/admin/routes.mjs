// Rotas da hierarquia da administração, licenças, cupons e limites por vitrine (spec 022).
// O Worker confere a capacidade antes de chamar o banco; o banco confere de novo em cada função.
import { PortalValidationError } from '../portal-validation.mjs';
import { PLAN_CODES } from '../plans.mjs';
import { MANAGEABLE_ROLES, PLATFORM_ROLES, canManageRole, capabilitiesOf, hasCapability } from './platform-roles.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COUPON_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{4,22}[A-Z0-9]$/;
const PAID_PLANS = PLAN_CODES.filter(code => code !== 'free');
export const ADMIN_USERS_PAGE_SIZE = 25;

function fail(status, code, message) {
  return new PortalValidationError(status, code, message);
}

const invalid = message => fail(422, 'INVALID_ADMIN_PAYLOAD', message);

export function matchAdminHierarchyRoute(pathname) {
  const path = pathname.replace(/\/+$/, '');
  if (path === '/api/admin/me') return { action: 'me' };
  if (path === '/api/admin/users') return { action: 'users' };
  if (path === '/api/admin/operators') return { action: 'operators' };
  if (path === '/api/admin/licenses') return { action: 'licenses' };
  if (path === '/api/admin/coupons') return { action: 'coupons' };
  if (path === '/api/admin/coupons/report') return { action: 'couponReport' };
  let match = path.match(/^\/api\/admin\/users\/([^/]+)$/);
  if (match) return { action: 'user', id: decodeURIComponent(match[1]) };
  match = path.match(/^\/api\/admin\/operators\/([^/]+)$/);
  if (match) return { action: 'operator', id: decodeURIComponent(match[1]) };
  match = path.match(/^\/api\/admin\/licenses\/([^/]+)$/);
  if (match) return { action: 'license', id: decodeURIComponent(match[1]) };
  match = path.match(/^\/api\/admin\/coupons\/([^/]+)$/);
  if (match) return { action: 'coupon', id: decodeURIComponent(match[1]) };
  match = path.match(/^\/api\/admin\/sites\/([^/]+)\/limits$/);
  if (match) return { action: 'limits', id: decodeURIComponent(match[1]) };
  match = path.match(/^\/api\/sites\/([^/]+)\/coupon$/);
  if (match) return { action: 'redeem', id: decodeURIComponent(match[1]) };
  return null;
}

const ROUTES = {
  me: { GET: null },
  users: { GET: 'users.read' },
  user: { GET: 'users.read' },
  operators: { GET: 'staff.manage', POST: 'staff.manage' },
  operator: { DELETE: 'staff.manage' },
  licenses: { POST: 'licenses.manage' },
  license: { DELETE: 'licenses.manage' },
  coupons: { GET: 'licenses.manage', POST: 'licenses.manage' },
  couponReport: { GET: 'licenses.manage' },
  coupon: { PATCH: 'licenses.manage' },
  limits: { PUT: 'licenses.manage', DELETE: 'licenses.manage' },
  redeem: { POST: null }
};

export function adminRouteNeedsGuard(route, method) {
  return method !== 'GET' && Boolean(ROUTES[route.action]);
}

export function adminRouteNeedsJson(route, method) {
  return method === 'POST' || method === 'PUT' || method === 'PATCH';
}

export function normalizePlatformAccess(role) {
  const known = PLATFORM_ROLES.includes(role) ? role : null;
  return { role: known, capabilities: [...capabilitiesOf(known)] };
}

// Papel pela função do banco; sem ela (armazenamento em memória), o portão antigo vale como Administrador.
export async function resolvePlatformAccess(repository, store, userId, options) {
  if (typeof repository?.readPlatformAccess === 'function') {
    const access = await repository.readPlatformAccess(userId, options);
    if (access?.role) return normalizePlatformAccess(access.role);
  }
  if (await store?.isPlatformAdmin?.(userId, options)) return normalizePlatformAccess('platform_admin');
  return normalizePlatformAccess(null);
}

function uuid(value, message) {
  if (typeof value !== 'string' || !UUID_PATTERN.test(value.trim())) throw invalid(message);
  return value.trim().toLowerCase();
}

function note(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string' || value.trim().length > 280) throw invalid('A observação aceita até 280 caracteres.');
  return value.trim();
}

function plan(value) {
  if (!PAID_PLANS.includes(value)) throw invalid('Escolha um plano pago: Essencial, Profissional ou Equipe.');
  return value;
}

function months(value) {
  if (!Number.isInteger(value) || value < 1 || value > 36) throw invalid('Informe de 1 a 36 meses.');
  return value;
}

function optionalInt(value, min, max, message) {
  if (value === undefined || value === null || value === '') return null;
  if (!Number.isInteger(value) || value < min || value > max) throw invalid(message);
  return value;
}

export function validateCouponInput(payload) {
  const code = payload?.code === undefined || payload?.code === null || payload?.code === ''
    ? null
    : String(payload.code).trim().toUpperCase();
  if (code !== null && !COUPON_CODE_PATTERN.test(code)) {
    throw invalid('O código aceita de 6 a 24 letras, números e hífens, sem hífen nas pontas.');
  }
  let expiresAt = null;
  if (payload?.expiresAt) {
    const date = new Date(payload.expiresAt);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) throw invalid('A validade precisa ser uma data futura.');
    expiresAt = date.toISOString();
  }
  return {
    planCode: plan(payload?.planCode),
    months: months(payload?.months),
    maxRedemptions: optionalInt(payload?.maxRedemptions, 1, 1000, 'Informe de 1 a 1.000 usos.') ?? 1,
    expiresAt,
    note: note(payload?.note),
    code
  };
}

export function validateLimitsInput(payload) {
  const maxActiveItems = optionalInt(payload?.maxActiveItems, 1, 100, 'Itens ativos: de 1 a 100.');
  const maxItemBlocks = optionalInt(payload?.maxItemBlocks, 1, 5, 'Blocos de itens: de 1 a 5.');
  if (maxActiveItems === null && maxItemBlocks === null) throw invalid('Informe ao menos um limite.');
  return { maxActiveItems, maxItemBlocks, note: note(payload?.note) };
}

const REDEEM_ERRORS = {
  invalid: [404, 'COUPON_INVALID', 'Cupom não encontrado. Confira o código.'],
  expired: [409, 'COUPON_EXPIRED', 'Este cupom venceu.'],
  exhausted: [409, 'COUPON_EXHAUSTED', 'Este cupom já foi usado o máximo de vezes.'],
  already_redeemed: [409, 'COUPON_ALREADY_REDEEMED', 'Este cupom já foi usado nesta conta.'],
  rate_limited: [429, 'COUPON_RATE_LIMITED', 'Muitas tentativas. Tente de novo mais tarde.']
};

export async function handleAdminHierarchyRoute(route, method, payload, { repository, access, options, url }) {
  const capabilities = ROUTES[route.action];
  if (!capabilities || !(method in capabilities)) {
    throw fail(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para a administração.');
  }
  const needed = capabilities[method];
  if (needed && !hasCapability(access.role, needed)) {
    throw fail(403, 'FORBIDDEN_PLATFORM_ROLE', 'Seu papel na plataforma não permite esta ação.');
  }
  if (route.action !== 'me' && !repository) {
    throw fail(503, 'ADMIN_UNAVAILABLE', 'A administração exige o banco configurado.');
  }

  switch (route.action) {
    case 'me':
      return { status: 200, body: { access } };
    case 'users': {
      const search = String(url?.searchParams.get('q') ?? '').trim().slice(0, 120);
      const offset = Math.max(0, Math.min(10000, Number.parseInt(url?.searchParams.get('offset') ?? '0', 10) || 0));
      const { users, total } = await repository.listAdminUsers({ search, offset, pageSize: ADMIN_USERS_PAGE_SIZE }, options);
      return { status: 200, body: { users, total, offset, pageSize: ADMIN_USERS_PAGE_SIZE } };
    }
    case 'user': {
      const detail = await repository.readAdminUser(uuid(route.id, 'Conta inválida.'), options);
      return { status: 200, body: detail };
    }
    case 'operators': {
      if (method === 'GET') return { status: 200, body: { operators: await repository.listPlatformOperators(options) } };
      const userId = uuid(payload?.userId, 'Informe o identificador da conta.');
      if (!MANAGEABLE_ROLES.includes(payload?.role)) throw invalid('Escolha Administrador, Gestor de licenças ou Suporte.');
      if (!canManageRole(access.role, payload.role)) {
        throw fail(403, 'ADMINS_MANAGED_BY_OWNER', 'Só o Dono da plataforma muda administradores.');
      }
      return { status: 201, body: { operator: await repository.grantPlatformRole(userId, payload.role, options) } };
    }
    case 'operator': {
      const removed = await repository.revokePlatformRole(uuid(route.id, 'Conta inválida.'), options);
      if (!removed) throw fail(404, 'OPERATOR_NOT_FOUND', 'Essa conta não tem papel na plataforma.');
      return { status: 200, body: { removed: true } };
    }
    case 'licenses': {
      const license = await repository.grantLicense({
        siteId: uuid(payload?.siteId, 'Informe a vitrine.'),
        planCode: plan(payload?.planCode),
        months: months(payload?.months),
        note: note(payload?.note)
      }, options);
      return { status: 201, body: { license } };
    }
    case 'license': {
      if (!await repository.revokeLicense(uuid(route.id, 'Licença inválida.'), options)) {
        throw fail(404, 'LICENSE_NOT_FOUND', 'Licença não encontrada ou já retirada.');
      }
      return { status: 200, body: { revoked: true } };
    }
    case 'coupons':
      if (method === 'GET') return { status: 200, body: { coupons: await repository.listCoupons(options) } };
      return { status: 201, body: { coupon: await repository.createCoupon(validateCouponInput(payload), options) } };
    case 'couponReport':
      return { status: 200, body: { report: await repository.readCouponReport(options) } };
    case 'coupon': {
      if (typeof payload?.disabled !== 'boolean') throw invalid('Informe se o cupom fica desativado.');
      return { status: 200, body: { coupon: await repository.setCouponDisabled(uuid(route.id, 'Cupom inválido.'), payload.disabled, options) } };
    }
    case 'limits': {
      const siteId = uuid(route.id, 'Vitrine inválida.');
      if (method === 'DELETE') {
        await repository.clearSiteLimits(siteId, options);
        return { status: 200, body: { cleared: true } };
      }
      return { status: 200, body: { limits: await repository.setSiteLimits(siteId, validateLimitsInput(payload), options) } };
    }
    case 'redeem': {
      const siteId = uuid(route.id, 'Vitrine inválida.');
      const code = typeof payload?.code === 'string' ? payload.code.trim().toUpperCase() : '';
      if (!code || code.length > 24) throw invalid('Digite o código do cupom.');
      const result = await repository.redeemCoupon(siteId, code, options);
      if (result?.status !== 'redeemed') {
        const [status, errorCode, message] = REDEEM_ERRORS[result?.status] ?? REDEEM_ERRORS.invalid;
        throw fail(status, errorCode, message);
      }
      return {
        status: 200,
        body: { redemption: { planCode: result.planCode, planName: result.planName, months: result.months, endsAt: result.endsAt } }
      };
    }
    default:
      throw fail(404, 'NOT_FOUND', 'Endpoint da API não encontrado.');
  }
}

const DB_ERRORS = {
  FORBIDDEN_PLATFORM_ROLE: [403, 'Seu papel na plataforma não permite esta ação.'],
  ADMINS_MANAGED_BY_OWNER: [403, 'Só o Dono da plataforma muda administradores.'],
  PLATFORM_USER_NOT_FOUND: [404, 'Nenhuma conta com esse identificador. A pessoa precisa entrar no painel uma vez antes.'],
  OPERATOR_ROLE_CONFLICT: [409, 'O papel dessa conta não muda por aqui (Dono da plataforma ou patrocinador).'],
  CANNOT_CHANGE_OWN_ROLE: [409, 'Você não pode mudar o seu próprio papel.'],
  INVALID_PLATFORM_ROLE: [422, 'Papel inválido.'],
  SITE_NOT_FOUND: [404, 'Vitrine não encontrada.'],
  SITE_WITHOUT_OWNER: [409, 'Demonstrações sem dona não recebem licença.'],
  INVALID_LICENSE_PLAN: [422, 'Escolha um plano pago.'],
  INVALID_LICENSE_MONTHS: [422, 'Informe de 1 a 36 meses.'],
  INVALID_LICENSE_NOTE: [422, 'A observação aceita até 280 caracteres.'],
  INVALID_COUPON: [422, 'Confira plano, meses, usos, validade e código do cupom.'],
  COUPON_CODE_TAKEN: [409, 'Já existe um cupom com esse código.'],
  COUPON_NOT_FOUND: [404, 'Cupom não encontrado.'],
  INVALID_SITE_LIMITS: [422, 'Itens ativos de 1 a 100 e blocos de 1 a 5.']
};

async function rpcError(response, fallback) {
  const error = await response.json().catch(() => null);
  const known = DB_ERRORS[error?.message];
  if (known) {
    const code = error.message === 'FORBIDDEN_PLATFORM_ROLE' || error.message === 'ADMINS_MANAGED_BY_OWNER'
      ? error.message
      : error.message.startsWith('INVALID_') ? 'INVALID_ADMIN_PAYLOAD' : error.message;
    return fail(known[0], code, known[1]);
  }
  if (error?.code === '42501' || response.status === 403) {
    return fail(403, 'FORBIDDEN_PLATFORM_ROLE', DB_ERRORS.FORBIDDEN_PLATFORM_ROLE[1]);
  }
  return new Error(fallback);
}

function first(rows) {
  return Array.isArray(rows) ? rows[0] ?? null : rows;
}

function licenseRow(row) {
  return row && {
    id: row.id, planCode: row.plan_code, source: row.source, startsAt: row.starts_at,
    endsAt: row.ends_at, revokedAt: row.revoked_at ?? null, note: row.note ?? ''
  };
}

function couponRow(row) {
  return row && {
    id: row.id, code: row.code, planCode: row.plan_code, months: row.duration_months,
    maxRedemptions: row.max_redemptions, redemptions: row.redemption_count,
    expiresAt: row.expires_at ?? null, note: row.note ?? '', disabledAt: row.disabled_at ?? null,
    createdAt: row.created_at, valueCents: Number(row.value_cents ?? 0)
  };
}

function userRow(row) {
  return {
    id: row.user_id, email: row.email ?? '', displayName: row.display_name ?? '', businessName: row.business_name ?? '',
    city: row.city ?? '', platformRole: row.platform_role ?? null, siteCount: Number(row.site_count ?? 0),
    createdAt: row.created_at ?? null, lastSignInAt: row.last_sign_in_at ?? null
  };
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

export function normalizeCouponReport(raw) {
  return {
    coupons: count(raw?.coupons),
    activeCoupons: count(raw?.activeCoupons),
    redemptions: count(raw?.redemptions),
    monthsGranted: count(raw?.monthsGranted),
    valueCents: count(raw?.valueCents),
    byPlan: (Array.isArray(raw?.byPlan) ? raw.byPlan : []).map(entry => ({
      planCode: String(entry?.planCode ?? ''),
      redemptions: count(entry?.redemptions),
      monthsGranted: count(entry?.monthsGranted),
      valueCents: count(entry?.valueCents)
    })),
    activeLicenses: Object.fromEntries(['manual', 'coupon', 'courtesy'].map(source => [source, count(raw?.activeLicenses?.[source])]))
  };
}

export function createAdminSupabaseRepository({ supabaseUrl, supabaseAnonKey, fetch: fetchImpl = globalThis.fetch }) {
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  async function rpc(token, name, body, fallback) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: supabaseAnonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body ?? {})
    });
    if (!response.ok) throw await rpcError(response, fallback);
    return response.json();
  }
  return {
    async readPlatformAccess(_userId, { token }) {
      const row = first(await rpc(token, 'read_my_platform_access', {}, 'Falha ao consultar o papel na plataforma.'));
      return { role: row?.role ?? null };
    },
    async listAdminUsers({ search, offset, pageSize }, { token }) {
      const rows = await rpc(token, 'admin_list_users', { search, page_size: pageSize, page_offset: offset }, 'Falha ao listar usuários.');
      const list = Array.isArray(rows) ? rows : [];
      return { users: list.map(userRow), total: count(list[0]?.total_count) };
    },
    async readAdminUser(userId, { token }) {
      return rpc(token, 'admin_user_detail', { target_user: userId }, 'Falha ao consultar a conta.');
    },
    async listPlatformOperators({ token }) {
      const rows = await rpc(token, 'list_platform_operators', {}, 'Falha ao listar a equipe da plataforma.');
      return (Array.isArray(rows) ? rows : []).map(row => ({
        userId: row.user_id, role: row.role, email: row.email ?? '', displayName: row.display_name ?? '', since: row.created_at
      }));
    },
    async grantPlatformRole(userId, role, { token }) {
      const row = first(await rpc(token, 'grant_platform_role', { target_user: userId, target_role: role }, 'Falha ao dar o papel.'));
      return { userId: row?.user_id ?? userId, role: row?.role ?? role, since: row?.created_at ?? null };
    },
    async revokePlatformRole(userId, { token }) {
      return (await rpc(token, 'revoke_platform_role', { target_user: userId }, 'Falha ao retirar o papel.')) === true;
    },
    async grantLicense({ siteId, planCode, months: total, note: text }, { token }) {
      return licenseRow(first(await rpc(token, 'grant_license', {
        target_site: siteId, target_plan: planCode, target_months: total, target_note: text
      }, 'Falha ao conceder a licença.')));
    },
    async revokeLicense(id, { token }) {
      return (await rpc(token, 'revoke_license', { target_grant: id }, 'Falha ao retirar a licença.')) === true;
    },
    async listCoupons({ token }) {
      const rows = await rpc(token, 'list_coupons', {}, 'Falha ao listar cupons.');
      return (Array.isArray(rows) ? rows : []).map(couponRow);
    },
    async createCoupon(input, { token }) {
      return couponRow(first(await rpc(token, 'create_coupon', {
        target_plan: input.planCode, target_months: input.months, target_max: input.maxRedemptions,
        target_expires: input.expiresAt, target_note: input.note, target_code: input.code
      }, 'Falha ao criar o cupom.')));
    },
    async setCouponDisabled(id, disabled, { token }) {
      return couponRow(first(await rpc(token, 'set_coupon_disabled', { target_coupon: id, target_disabled: disabled }, 'Falha ao atualizar o cupom.')));
    },
    async readCouponReport({ token }) {
      return normalizeCouponReport(await rpc(token, 'read_coupon_report', {}, 'Falha ao consultar o relatório de cupons.'));
    },
    async setSiteLimits(siteId, limits, { token }) {
      const row = first(await rpc(token, 'set_site_limits', {
        target_site: siteId, target_items: limits.maxActiveItems, target_blocks: limits.maxItemBlocks, target_note: limits.note
      }, 'Falha ao salvar os limites.'));
      return { maxActiveItems: row?.max_active_items ?? null, maxItemBlocks: row?.max_item_blocks ?? null, note: row?.note ?? '' };
    },
    async clearSiteLimits(siteId, { token }) {
      return (await rpc(token, 'clear_site_limits', { target_site: siteId }, 'Falha ao voltar aos limites do plano.')) === true;
    },
    async redeemCoupon(siteId, code, { token }) {
      return rpc(token, 'redeem_coupon', { target_site: siteId, target_code: code }, 'Falha ao resgatar o cupom.');
    }
  };
}

export function resolveAdminRepository(store, env = {}, fetchImpl) {
  if (typeof store?.listAdminUsers === 'function') return store;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return createAdminSupabaseRepository({
      supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY, fetch: fetchImpl ?? globalThis.fetch
    });
  }
  return null;
}
