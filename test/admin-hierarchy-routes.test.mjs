import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';
import { matchAdminHierarchyRoute, normalizeCouponReport, validateCouponInput } from '../src/admin/routes.mjs';
import { canManageRole, hasAdminArea, hasCapability } from '../src/admin/platform-roles.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://painel.test';
const OWNER = '30000000-0000-0000-0000-000000000001';
const ADMIN = '30000000-0000-0000-0000-000000000002';
const LICENSER = '30000000-0000-0000-0000-000000000003';
const SPONSOR = '30000000-0000-0000-0000-000000000004';
const MERCHANT = '30000000-0000-0000-0000-000000000005';
const OTHER = '30000000-0000-0000-0000-000000000006';
const SITE = '31000000-0000-0000-0000-000000000001';
const OTHER_SITE = '31000000-0000-0000-0000-000000000002';
const TOKENS = {
  'token-owner': OWNER, 'token-admin': ADMIN, 'token-licenser': LICENSER,
  'token-sponsor': SPONSOR, 'token-merchant': MERCHANT, 'token-other': OTHER
};
const ROLES = { [OWNER]: 'platform_owner', [ADMIN]: 'platform_admin', [LICENSER]: 'license_manager', [SPONSOR]: 'sponsor' };

function sender(api, env) {
  return (path, { method = 'GET', payload, token, sameOrigin = true } = {}) => api(new Request(origin + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(sameOrigin ? { origin } : {}),
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  }), env, {});
}

test('matriz de capacidades e rotas', () => {
  assert.equal(hasCapability('platform_owner', 'admins.manage'), true);
  assert.equal(hasCapability('platform_admin', 'admins.manage'), false);
  assert.equal(hasCapability('license_manager', 'platform.operate'), false);
  assert.equal(canManageRole('platform_admin', 'license_manager'), true);
  assert.equal(canManageRole('platform_admin', 'platform_admin'), false);
  assert.equal(canManageRole('platform_owner', 'platform_owner'), false);
  assert.deepEqual(['platform_owner', 'license_manager', 'sponsor', null].map(hasAdminArea), [true, true, false, false]);
  assert.deepEqual(matchAdminHierarchyRoute('/api/admin/coupons/report'), { action: 'couponReport' });
  assert.deepEqual(matchAdminHierarchyRoute(`/api/admin/sites/${SITE}/limits/`), { action: 'limits', id: SITE });
  assert.deepEqual(matchAdminHierarchyRoute(`/api/sites/${SITE}/coupon`), { action: 'redeem', id: SITE });
  assert.equal(matchAdminHierarchyRoute('/api/admin/cms'), null);
  assert.equal(validateCouponInput({ planCode: 'profissional', months: 12, code: ' vitrine-2027 ' }).code, 'VITRINE-2027');
  assert.throws(() => validateCouponInput({ planCode: 'free', months: 12 }), /plano pago/);
  assert.throws(() => validateCouponInput({ planCode: 'essencial', months: 1, expiresAt: '2000-01-01' }), /data futura/);
  assert.deepEqual(normalizeCouponReport({ valueCents: '213600', activeLicenses: { coupon: 2, hack: 9 } }).activeLicenses, { manual: 0, coupon: 2, courtesy: 0 });
});

function memoryApi() {
  const store = createMemoryStore();
  const calls = [];
  store.isPlatformAdmin = (id) => ['platform_owner', 'platform_admin'].includes(ROLES[id]);
  Object.assign(store, {
    async readPlatformOperations() { return []; },
    async listPlatformTemplates() { return []; },
    async listCms() { return []; },
    async readSponsorImpact() { return {}; },
    async listSponsors() { return []; },
    async readPlatformAccess(id) { return { role: ROLES[id] ?? null }; },
    async listAdminUsers(query) { calls.push(['users', query]); return { users: [{ id: MERCHANT, email: 'rita@doces.com' }], total: 1 }; },
    async readAdminUser(id) { calls.push(['user', id]); return { user: { id }, sites: [] }; },
    async listPlatformOperators() { calls.push(['operators']); return []; },
    async grantPlatformRole(id, role) { calls.push(['grant', id, role]); return { userId: id, role }; },
    async revokePlatformRole(id) { calls.push(['revoke', id]); return id === MERCHANT; },
    async grantLicense(input) { calls.push(['license', input]); return { id: 'l1', ...input }; },
    async revokeLicense(id) { calls.push(['revokeLicense', id]); return true; },
    async listCoupons() { return []; },
    async createCoupon(input) { calls.push(['coupon', input]); return { id: 'c1', code: input.code ?? 'ABCD-EFGH-JKLM' }; },
    async setCouponDisabled(id, disabled) { calls.push(['disable', id, disabled]); return { id, disabledAt: disabled ? 'agora' : null }; },
    async readCouponReport() { return normalizeCouponReport({ redemptions: 1 }); },
    async setSiteLimits(id, limits) { calls.push(['limits', id, limits]); return limits; },
    async clearSiteLimits(id) { calls.push(['clear', id]); return true; },
    async redeemCoupon(siteId, code) {
      calls.push(['redeem', siteId, code]);
      if (code === 'BOM-CUPOM') return { status: 'redeemed', planCode: 'profissional', planName: 'Profissional', months: 12, endsAt: '2027-11-28T00:00:00.000Z' };
      return { status: { VENCIDO: 'expired', ESGOTADO: 'exhausted', USADO: 'already_redeemed', MUITOS: 'rate_limited' }[code] ?? 'invalid' };
    }
  });
  const api = createApiHandler({ store, authVerifier: (token) => TOKENS[token] ?? null });
  return { send: sender(api), calls };
}

const statusOf = async (promise) => (await promise).status;

test('Worker: /api/admin/me devolve papel e capacidades da sessão', async () => {
  const { send } = memoryApi();
  assert.equal(await statusOf(send('/api/admin/me')), 401);
  const owner = await (await send('/api/admin/me', { token: 'token-owner' })).json();
  assert.equal(owner.access.role, 'platform_owner');
  assert.ok(owner.access.capabilities.includes('admins.manage'));
  const merchant = await send('/api/admin/me', { token: 'token-merchant' });
  assert.equal(merchant.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await merchant.json()).access, { role: null, capabilities: [] });
});

test('Worker: cada rota nova responde 401, 403 e sucesso pelo papel', async () => {
  const { send, calls } = memoryApi();
  const cases = [
    ['/api/admin/users?q=rita', 'GET', undefined, ['token-owner', 'token-admin', 'token-licenser'], ['token-sponsor', 'token-merchant'], 200],
    [`/api/admin/users/${MERCHANT}`, 'GET', undefined, ['token-licenser'], ['token-sponsor'], 200],
    ['/api/admin/operators', 'GET', undefined, ['token-owner', 'token-admin'], ['token-licenser', 'token-merchant'], 200],
    ['/api/admin/operators', 'POST', { userId: MERCHANT, role: 'license_manager' }, ['token-owner', 'token-admin'], ['token-licenser', 'token-sponsor'], 201],
    [`/api/admin/operators/${MERCHANT}`, 'DELETE', undefined, ['token-admin'], ['token-licenser'], 200],
    ['/api/admin/licenses', 'POST', { siteId: SITE, planCode: 'profissional', months: 12 }, ['token-owner', 'token-admin', 'token-licenser'], ['token-sponsor', 'token-merchant'], 201],
    ['/api/admin/licenses/11111111-1111-1111-1111-111111111111', 'DELETE', undefined, ['token-licenser'], ['token-merchant'], 200],
    ['/api/admin/coupons', 'GET', undefined, ['token-licenser'], ['token-sponsor'], 200],
    ['/api/admin/coupons', 'POST', { planCode: 'profissional', months: 12, maxRedemptions: 10 }, ['token-licenser'], ['token-merchant'], 201],
    ['/api/admin/coupons/22222222-2222-2222-2222-222222222222', 'PATCH', { disabled: true }, ['token-admin'], ['token-sponsor'], 200],
    ['/api/admin/coupons/report', 'GET', undefined, ['token-owner'], ['token-merchant'], 200],
    [`/api/admin/sites/${SITE}/limits`, 'PUT', { maxActiveItems: 30 }, ['token-licenser'], ['token-sponsor'], 200],
    [`/api/admin/sites/${SITE}/limits`, 'DELETE', undefined, ['token-licenser'], ['token-merchant'], 200]
  ];
  for (const [path, method, payload, allowed, denied, success] of cases) {
    assert.equal(await statusOf(send(path, { method, payload })), 401, `${method} ${path} sem sessão`);
    for (const token of denied) {
      const response = await send(path, { method, payload, token });
      assert.equal(response.status, 403, `${method} ${path} ${token}`);
      assert.equal((await response.json()).error.code, 'FORBIDDEN_PLATFORM_ROLE');
    }
    for (const token of allowed) {
      const response = await send(path, { method, payload, token });
      assert.equal(response.status, success, `${method} ${path} ${token}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
    }
    if (method !== 'GET') {
      assert.equal(await statusOf(send(path, { method, payload, token: allowed[0], sameOrigin: false })), 403, `${method} ${path} outra origem`);
    }
  }
  assert.deepEqual(calls.find(([name]) => name === 'users'), ['users', { search: 'rita', offset: 0, pageSize: 25 }]);
  assert.deepEqual(calls.find(([name]) => name === 'limits'), ['limits', SITE, { maxActiveItems: 30, maxItemBlocks: null, note: '' }]);
});

test('Worker: hierarquia e validação antes do banco', async () => {
  const { send, calls } = memoryApi();
  const before = calls.length;
  const adminPromotes = await send('/api/admin/operators', { method: 'POST', payload: { userId: MERCHANT, role: 'platform_admin' }, token: 'token-admin' });
  assert.equal(adminPromotes.status, 403);
  assert.equal((await adminPromotes.json()).error.code, 'ADMINS_MANAGED_BY_OWNER');
  assert.equal(await statusOf(send('/api/admin/operators', { method: 'POST', payload: { userId: MERCHANT, role: 'platform_owner' }, token: 'token-owner' })), 422);
  assert.equal(await statusOf(send('/api/admin/operators', { method: 'POST', payload: { userId: 'fulano', role: 'license_manager' }, token: 'token-owner' })), 422);
  assert.equal(await statusOf(send('/api/admin/licenses', { method: 'POST', payload: { siteId: SITE, planCode: 'free', months: 1 }, token: 'token-licenser' })), 422);
  assert.equal(await statusOf(send('/api/admin/licenses', { method: 'POST', payload: { siteId: SITE, planCode: 'essencial', months: 40 }, token: 'token-licenser' })), 422);
  assert.equal(await statusOf(send(`/api/admin/sites/${SITE}/limits`, { method: 'PUT', payload: { maxItemBlocks: 6 }, token: 'token-licenser' })), 422);
  assert.equal(await statusOf(send(`/api/admin/sites/${SITE}/limits`, { method: 'PUT', payload: {}, token: 'token-licenser' })), 422);
  assert.equal(await statusOf(send('/api/admin/coupons/22222222-2222-2222-2222-222222222222', { method: 'PATCH', payload: {}, token: 'token-licenser' })), 422);
  assert.equal(calls.length, before, 'nada chega ao banco');
  assert.equal(await statusOf(send('/api/admin/operators', { method: 'POST', payload: { userId: MERCHANT, role: 'platform_admin' }, token: 'token-owner' })), 201);
  assert.equal(await statusOf(send(`/api/admin/operators/${OTHER}`, { method: 'DELETE', token: 'token-owner' })), 404);
  assert.equal(await statusOf(send('/api/admin/coupons', { method: 'PUT', payload: {}, token: 'token-owner' })), 405);
});

test('Worker: resgate de cupom traduz o resultado do banco', async () => {
  const { send, calls } = memoryApi();
  const path = `/api/sites/${SITE}/coupon`;
  assert.equal(await statusOf(send(path, { method: 'POST', payload: { code: 'BOM-CUPOM' } })), 401);
  assert.equal(await statusOf(send(path, { method: 'POST', payload: { code: 'BOM-CUPOM' }, token: 'token-merchant', sameOrigin: false })), 403);
  assert.equal(await statusOf(send(path, { method: 'POST', payload: { code: '' }, token: 'token-merchant' })), 422);
  const ok = await send(path, { method: 'POST', payload: { code: ' bom-cupom ' }, token: 'token-merchant' });
  assert.equal(ok.status, 200);
  assert.deepEqual((await ok.json()).redemption, { planCode: 'profissional', planName: 'Profissional', months: 12, endsAt: '2027-11-28T00:00:00.000Z' });
  assert.deepEqual(calls.at(-1), ['redeem', SITE, 'BOM-CUPOM']);
  for (const [code, status, error] of [
    ['NAO-EXISTE', 404, 'COUPON_INVALID'], ['VENCIDO', 409, 'COUPON_EXPIRED'], ['ESGOTADO', 409, 'COUPON_EXHAUSTED'],
    ['USADO', 409, 'COUPON_ALREADY_REDEEMED'], ['MUITOS', 429, 'COUPON_RATE_LIMITED']
  ]) {
    const response = await send(path, { method: 'POST', payload: { code }, token: 'token-merchant' });
    assert.equal(response.status, status, code);
    assert.equal((await response.json()).error.code, error);
  }
});

test('Worker: as rotas antigas da administração aceitam o Dono e recusam o Gestor de licenças', async () => {
  const { send } = memoryApi();
  for (const path of ['/api/admin/overview', '/api/admin/templates', '/api/admin/sponsors', '/api/admin/cms']) {
    const denied = await send(path, { token: 'token-licenser' });
    assert.equal(denied.status, 403, path);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN_PLATFORM_ADMIN');
    assert.equal((await send(path, { token: 'token-owner' })).status, 200, path);
  }
});

// Ponta a ponta: repositório Supabase do Worker sobre o banco migrado (PostgREST mínimo).
async function migratedDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key, email varchar(255), created_at timestamptz default now(), last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
  `);
  const dir = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(dir, file), 'utf8'));
  }
  for (const [token, id] of Object.entries(TOKENS)) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [id, `${token.slice(6)}@exemplo.com`]);
  }
  await db.query("insert into public.platform_operators (user_id, role) values ($1, 'platform_admin'), ($2, 'license_manager'), ($3, 'sponsor')", [ADMIN, LICENSER, SPONSOR]);
  await db.query('select private.bootstrap_platform_owner($1)', ['owner@exemplo.com']);
  await db.query('insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, $3, $4), ($5, $6, $7, $8)',
    [SITE, MERCHANT, 'doces-da-rita', 'Doces da Rita', OTHER_SITE, OTHER, 'bar-do-joao', 'Bar do João']);
  return db;
}

function postgrestOver(db) {
  async function run(userId, sql, params) {
    await db.exec('begin');
    try {
      await db.exec('set local role authenticated');
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
      const result = await db.query(sql, params);
      await db.exec('commit');
      return result;
    } catch (error) {
      await db.exec('rollback');
      throw error;
    }
  }
  return async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const token = String(new Headers(init.headers).get('authorization') ?? '').replace(/^Bearer /, '');
    const userId = TOKENS[token] ?? '';
    try {
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (rpc) {
        const { rows: [shape] } = await db.query(
          "select p.proretset as set, t.typtype from pg_proc p join pg_type t on t.oid = p.prorettype where p.proname = $1 and p.pronamespace = 'public'::regnamespace",
          [rpc[1]]
        );
        if (!shape) return Response.json({ message: 'não simulado' }, { status: 404 });
        const args = Object.entries(JSON.parse(init.body || '{}'));
        const call = `public.${rpc[1]}(${args.map(([name], i) => `${name} => $${i + 1}`).join(', ')})`;
        const values = args.map(([, value]) => value);
        if (shape.set || shape.typtype === 'c') {
          const { rows } = await run(userId, `select * from ${call}`, values);
          return Response.json(rows);
        }
        const { rows } = await run(userId, `select ${call} as value`, values);
        return Response.json(rows[0].value);
      }
      if (url.pathname === '/rest/v1/platform_operators') {
        const user = (url.searchParams.get('user_id') ?? '').replace(/^eq\./, '');
        const roles = (url.searchParams.get('role') ?? '').replace(/^in\.\(|\)$/g, '').split(',');
        const { rows } = await run(userId, 'select role from public.platform_operators where user_id = $1 and role = any($2)', [user, roles]);
        return Response.json(rows);
      }
      return Response.json({ message: 'não simulado' }, { status: 501 });
    } catch (error) {
      return Response.json({ code: error.code, message: error.message }, { status: error.code === '42501' ? 403 : 400 });
    }
  };
}

test('ponta a ponta com o banco: Dono, Administrador, Gestor de licenças, cupom e limites', async (t) => {
  const db = await migratedDb();
  t.after(() => db.close());
  const api = createApiHandler({ fetch: postgrestOver(db), authVerifier: (token) => TOKENS[token] ?? null });
  const send = sender(api, { SUPABASE_URL: 'https://banco.test', SUPABASE_ANON_KEY: 'chave-anon-de-teste' });
  const json = async (promise) => (await promise).json();

  assert.deepEqual((await json(send('/api/admin/me', { token: 'token-licenser' }))).access, {
    role: 'license_manager', capabilities: ['users.read', 'licenses.manage']
  });
  assert.equal((await json(send('/api/admin/me', { token: 'token-owner' }))).access.role, 'platform_owner');
  assert.equal((await json(send('/api/admin/me', { token: 'token-merchant' }))).access.role, null);

  const users = await json(send('/api/admin/users?q=doces', { token: 'token-licenser' }));
  assert.deepEqual(users.users.map((user) => [user.id, user.siteCount]), [[MERCHANT, 1]]);
  assert.equal(users.total, 1);

  const promote = await send('/api/admin/operators', { method: 'POST', payload: { userId: OTHER, role: 'license_manager' }, token: 'token-admin' });
  assert.equal(promote.status, 201);
  const ownerRevoke = await send(`/api/admin/operators/${OWNER}`, { method: 'DELETE', token: 'token-admin' });
  assert.equal(ownerRevoke.status, 409);
  assert.equal((await ownerRevoke.json()).error.code, 'OPERATOR_ROLE_CONFLICT');
  const operators = await json(send('/api/admin/operators', { token: 'token-owner' }));
  assert.deepEqual(operators.operators.map((entry) => entry.role), ['platform_owner', 'platform_admin', 'license_manager', 'license_manager']);
  assert.equal(await statusOf(send(`/api/admin/operators/${OTHER}`, { method: 'DELETE', token: 'token-admin' })), 200);

  const license = await send('/api/admin/licenses', { method: 'POST', payload: { siteId: SITE, planCode: 'essencial', months: 2, note: 'Parceria' }, token: 'token-licenser' });
  assert.equal(license.status, 201);
  const { license: granted } = await license.json();
  assert.equal(granted.planCode, 'essencial');
  const afterLicense = await json(send(`/api/admin/users/${MERCHANT}`, { token: 'token-licenser' }));
  assert.equal(afterLicense.sites[0].entitlements.planCode, 'essencial');

  const created = await json(send('/api/admin/coupons', { method: 'POST', payload: { planCode: 'profissional', months: 12, maxRedemptions: 1 }, token: 'token-licenser' }));
  assert.match(created.coupon.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  const taken = await send('/api/admin/coupons', { method: 'POST', payload: { planCode: 'essencial', months: 1, code: created.coupon.code }, token: 'token-licenser' });
  assert.equal(taken.status, 409);
  assert.equal((await taken.json()).error.code, 'COUPON_CODE_TAKEN');

  const stranger = await send(`/api/sites/${SITE}/coupon`, { method: 'POST', payload: { code: created.coupon.code }, token: 'token-other' });
  assert.equal(stranger.status, 404);
  const redeemed = await send(`/api/sites/${SITE}/coupon`, { method: 'POST', payload: { code: created.coupon.code.toLowerCase() }, token: 'token-merchant' });
  assert.equal(redeemed.status, 200);
  assert.equal((await redeemed.json()).redemption.planCode, 'profissional');
  const again = await send(`/api/sites/${OTHER_SITE}/coupon`, { method: 'POST', payload: { code: created.coupon.code }, token: 'token-other' });
  assert.equal(again.status, 409);
  assert.equal((await again.json()).error.code, 'COUPON_EXHAUSTED');

  const report = await json(send('/api/admin/coupons/report', { token: 'token-owner' }));
  assert.deepEqual([report.report.redemptions, report.report.monthsGranted, report.report.valueCents], [1, 12, 106800]);
  assert.deepEqual(report.report.activeLicenses, { manual: 1, coupon: 1, courtesy: 0 });

  const limits = await json(send(`/api/admin/sites/${SITE}/limits`, { method: 'PUT', payload: { maxActiveItems: 7, note: 'Teste' }, token: 'token-licenser' }));
  assert.deepEqual(limits.limits, { maxActiveItems: 7, maxItemBlocks: null, note: 'Teste' });
  const detail = await json(send(`/api/admin/users/${MERCHANT}`, { token: 'token-admin' }));
  assert.equal(detail.sites[0].entitlements.planCode, 'profissional');
  assert.equal(detail.sites[0].entitlements.maxActiveItems, 7);
  assert.equal(detail.sites[0].licenses.length, 2);
  assert.equal(await statusOf(send(`/api/admin/licenses/${granted.id}`, { method: 'DELETE', token: 'token-admin' })), 200);
  assert.equal(await statusOf(send(`/api/admin/licenses/${granted.id}`, { method: 'DELETE', token: 'token-admin' })), 404);
  assert.equal(await statusOf(send('/api/admin/users', { token: 'token-sponsor' })), 403);
  assert.equal(await statusOf(send('/api/admin/cms', { token: 'token-licenser' })), 403);
});
