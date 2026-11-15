import { PortalValidationError } from './portal-validation.mjs';

export const SPONSOR_MIN_GROUP_SIZE = 5;
export const SPONSOR_IMPACT_MONTHS = 12;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

function fail(status, code, message) {
  return new PortalValidationError(status, code, message);
}

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.floor(number) : 0;
}

function month(entry) {
  return {
    month: String(entry?.month ?? ''),
    visits: count(entry?.visits),
    whatsappClicks: count(entry?.whatsappClicks)
  };
}

function months(list) {
  return (Array.isArray(list) ? list : []).map(month).filter(entry => MONTH_PATTERN.test(entry.month));
}

// Projeção explícita: só os campos agregados saem do Worker, mesmo que a função do
// banco passe a devolver mais coisa no futuro.
export function normalizeSponsorImpact(raw) {
  const minGroupSize = Math.max(SPONSOR_MIN_GROUP_SIZE, count(raw?.minGroupSize));
  const base = {
    minGroupSize,
    firstMonth: MONTH_PATTERN.test(raw?.firstMonth) ? raw.firstMonth : null,
    lastMonth: MONTH_PATTERN.test(raw?.lastMonth) ? raw.lastMonth : null
  };
  const cities = (Array.isArray(raw?.cities) ? raw.cities : [])
    .map(city => ({
      city: city?.others ? 'Outras cidades' : String(city?.city ?? '').slice(0, 80),
      others: city?.others === true,
      sites: count(city?.sites),
      visits: count(city?.visits),
      whatsappClicks: count(city?.whatsappClicks),
      months: months(city?.months)
    }))
    .filter(city => city.city && city.sites >= minGroupSize);
  const activeSites = count(raw?.activeSites);
  if (raw?.suppressed === true || activeSites < minGroupSize) {
    return { ...base, suppressed: true, activeSites: null, months: [], cities: [] };
  }
  return { ...base, suppressed: false, activeSites, months: months(raw?.months), cities };
}

export function matchSponsorRoute(pathname) {
  if (/^\/api\/sponsor\/impact\/?$/.test(pathname)) return { admin: false, action: 'impact' };
  if (/^\/api\/admin\/sponsors\/?$/.test(pathname)) return { admin: true, action: 'sponsors' };
  const member = pathname.match(/^\/api\/admin\/sponsors\/([^/]+)\/?$/);
  if (member) return { admin: true, action: 'sponsor', userId: decodeURIComponent(member[1]) };
  return null;
}

const ROUTE_METHODS = { impact: ['GET'], sponsors: ['GET', 'POST'], sponsor: ['DELETE'] };

export function sponsorRouteNeedsGuard(route, method) {
  return route.admin && method !== 'GET';
}

export async function handleSponsorRoute(route, method, payload, { repository, options }) {
  if (!ROUTE_METHODS[route.action]?.includes(method)) {
    throw fail(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para o patrocínio.');
  }
  if (route.action === 'impact') {
    return { status: 200, body: { impact: normalizeSponsorImpact(await repository.readSponsorImpact(options)) } };
  }
  if (route.action === 'sponsors' && method === 'GET') {
    return { status: 200, body: { sponsors: await repository.listSponsors(options) } };
  }
  const userId = route.action === 'sponsor' ? route.userId : payload?.userId;
  if (typeof userId !== 'string' || !UUID_PATTERN.test(userId.trim())) {
    throw fail(422, 'INVALID_SPONSOR_USER', 'Informe o identificador da conta (UUID), o mesmo usado na equipe da vitrine.');
  }
  if (route.action === 'sponsors') {
    return { status: 201, body: { sponsor: await repository.grantSponsor(userId.trim().toLowerCase(), options) } };
  }
  const removed = await repository.revokeSponsor(userId.trim().toLowerCase(), options);
  if (!removed) throw fail(404, 'SPONSOR_NOT_FOUND', 'Essa conta não tem o papel de patrocinador.');
  return { status: 200, body: { removed: true } };
}

async function rpc(baseUrl, anonKey, fetchImpl, token, name, body = {}) {
  return fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function rpcError(response, fallback) {
  const error = await response.json().catch(() => null);
  if (error?.message === 'FORBIDDEN_SPONSOR') {
    return fail(403, 'FORBIDDEN_SPONSOR', 'Acesso restrito a patrocinadores e operadores da plataforma.');
  }
  if (error?.message === 'SPONSOR_USER_NOT_FOUND') {
    return fail(404, 'SPONSOR_USER_NOT_FOUND', 'Nenhuma conta com esse identificador. A pessoa precisa entrar no painel uma vez antes.');
  }
  if (error?.message === 'OPERATOR_ROLE_CONFLICT') {
    return fail(409, 'OPERATOR_ROLE_CONFLICT', 'Essa conta já é operadora da plataforma; o papel dela não muda por aqui.');
  }
  if (error?.code === '42501' || response.status === 403) {
    return fail(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
  }
  return new Error(fallback);
}

function sponsorRow(row) {
  return { userId: row.user_id, since: row.created_at };
}

export function createSponsorSupabaseRepository({ supabaseUrl, supabaseAnonKey, fetch: fetchImpl = globalThis.fetch }) {
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  return {
    async readSponsorImpact({ token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'read_sponsor_impact', {
        month_count: SPONSOR_IMPACT_MONTHS
      });
      if (!response.ok) throw await rpcError(response, 'Falha ao consultar o impacto agregado.');
      return response.json();
    },
    async listSponsors({ token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'list_sponsors');
      if (!response.ok) throw await rpcError(response, 'Falha ao listar patrocinadores.');
      const rows = await response.json();
      return (Array.isArray(rows) ? rows : []).map(sponsorRow);
    },
    async grantSponsor(userId, { token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'grant_sponsor_role', { target_user: userId });
      if (!response.ok) throw await rpcError(response, 'Falha ao atribuir o papel de patrocinador.');
      const rows = await response.json();
      return sponsorRow((Array.isArray(rows) ? rows[0] : rows) ?? { user_id: userId, created_at: null });
    },
    async revokeSponsor(userId, { token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'revoke_sponsor_role', { target_user: userId });
      if (!response.ok) throw await rpcError(response, 'Falha ao retirar o papel de patrocinador.');
      return (await response.json()) === true;
    }
  };
}

export function resolveSponsorRepository(store, env = {}, fetchImpl) {
  if (typeof store?.readSponsorImpact === 'function') return store;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return createSponsorSupabaseRepository({
      supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY, fetch: fetchImpl ?? globalThis.fetch
    });
  }
  throw fail(503, 'SPONSOR_IMPACT_UNAVAILABLE', 'O impacto agregado exige o banco configurado.');
}
