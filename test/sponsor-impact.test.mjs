import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';
import { matchSponsorRoute, normalizeSponsorImpact } from '../src/sponsor-impact.mjs';
import { formatImpactMonth, impactCityRows, summarizeImpact } from '../web/portal/sponsor-impact.mjs';
import { validateSponsorUserInput } from '../web/portal/sponsor-admin.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const origin = 'https://painel.test';
const ADMIN = '10000000-0000-0000-0000-000000000001';
const SPONSOR = '10000000-0000-0000-0000-000000000002';
const MERCHANT = '10000000-0000-0000-0000-000000000003';
const TOKENS = { 'token-admin': ADMIN, 'token-sponsor': SPONSOR, 'token-merchant': MERCHANT };

const SAMPLE = {
  minGroupSize: 5,
  firstMonth: '2025-12',
  lastMonth: '2026-11',
  suppressed: false,
  activeSites: 11,
  months: [
    { month: '2026-10', visits: 7, whatsappClicks: 1 },
    { month: '2026-11', visits: 173, whatsappClicks: 19 }
  ],
  cities: [
    {
      city: 'Campo Grande (MS)', others: false, sites: 6, visits: 157, whatsappClicks: 16,
      months: [{ month: '2026-10', visits: 7, whatsappClicks: 1 }, { month: '2026-11', visits: 150, whatsappClicks: 15 }],
      slug: 'vazou', name: 'Negócio Secreto'
    },
    {
      city: 'Outras cidades', others: true, sites: 5, visits: 23, whatsappClicks: 4,
      months: [{ month: '2026-10', visits: 0, whatsappClicks: 0 }, { month: '2026-11', visits: 23, whatsappClicks: 4 }]
    },
    { city: 'Cidade Pequena (MS)', others: false, sites: 2, visits: 99, whatsappClicks: 9, months: [] }
  ],
  siteIds: ['20000000-0000-0000-0000-000000000001']
};

test('rotas do patrocínio: só /api/sponsor/impact é do patrocinador; o resto é administração', () => {
  assert.deepEqual(matchSponsorRoute('/api/sponsor/impact'), { admin: false, action: 'impact' });
  assert.deepEqual(matchSponsorRoute('/api/admin/sponsors'), { admin: true, action: 'sponsors' });
  assert.deepEqual(matchSponsorRoute(`/api/admin/sponsors/${SPONSOR}`), { admin: true, action: 'sponsor', userId: SPONSOR });
  assert.equal(matchSponsorRoute('/api/sponsor/sites'), null);
});

test('projeção do Worker: só agregados, grupos < 5 descartados e supressão total quando faltam vitrines', () => {
  const impact = normalizeSponsorImpact(SAMPLE);
  assert.deepEqual(Object.keys(impact).sort(), ['activeSites', 'cities', 'firstMonth', 'lastMonth', 'minGroupSize', 'months', 'suppressed']);
  assert.deepEqual(impact.cities.map((city) => city.city), ['Campo Grande (MS)', 'Outras cidades']);
  assert.deepEqual(Object.keys(impact.cities[0]).sort(), ['city', 'months', 'others', 'sites', 'visits', 'whatsappClicks']);
  const text = JSON.stringify(impact);
  assert.ok(!text.includes('Negócio Secreto') && !text.includes('vazou') && !text.includes('20000000-'));

  const few = normalizeSponsorImpact({ ...SAMPLE, activeSites: 4 });
  assert.deepEqual([few.suppressed, few.activeSites, few.months, few.cities], [true, null, [], []]);
  assert.equal(normalizeSponsorImpact({ ...SAMPLE, minGroupSize: 1 }).minGroupSize, 5, 'o limite nunca cai abaixo de 5');
});

test('tela Impacto: indicadores, linhas por cidade no período e meses em português', () => {
  const impact = normalizeSponsorImpact(SAMPLE);
  assert.deepEqual(summarizeImpact(impact).map((metric) => [metric.label, metric.value]), [
    ['Vitrines sociais ativas', '11'],
    ['Visitas', '180'],
    ['Cliques para enviar no WhatsApp', '20'],
    ['Visitas neste mês', '173']
  ]);
  assert.deepEqual(impactCityRows(impact, '2026-10').map((row) => [row.city, row.sites, row.visits]), [
    ['Campo Grande (MS)', 6, 7],
    ['Outras cidades', 5, 0]
  ]);
  assert.equal(impactCityRows(impact)[1].visits, 23);
  assert.equal(formatImpactMonth('2026-11'), 'nov. 2026');
  assert.equal(formatImpactMonth('2026-03', { long: true }), 'março de 2026');
  assert.deepEqual(summarizeImpact(normalizeSponsorImpact({ ...SAMPLE, suppressed: true })), []);
  assert.equal(validateSponsorUserInput(''), 'Informe o identificador da conta.');
  assert.match(validateSponsorUserInput('fulano@exemplo.com'), /identificador completo/);
  assert.equal(validateSponsorUserInput(` ${SPONSOR} `), '');
});

test('portal: "Impacto" e "Patrocinadores" ficam ocultos até o servidor confirmar; sem "catálogo" nem "cardápio"', async () => {
  const html = await readFile(resolve(root, 'web/portal/index.html'), 'utf8');
  assert.equal((html.match(/<li class="nav-sponsor-item" hidden>/g) ?? []).length, 2);
  assert.match(html, /<section id="sponsor-impact-section"[^>]*hidden>/);
  assert.match(html, /id="platform-tab-sponsors"[^>]*>Patrocinadores</);
  const start = html.indexOf('id="sponsor-impact-section"');
  const impactHtml = html.slice(start, html.indexOf('</section>', start));
  const sponsorPanel = html.slice(html.indexOf('id="platform-sponsors"'), html.indexOf('id="platform-templates" class="admin-panel"'));
  for (const text of [impactHtml, sponsorPanel]) {
    assert.ok(!/cat[aá]logo|card[aá]pio/i.test(text));
  }
  for (const file of ['web/portal/sponsor-impact.mjs', 'web/portal/sponsor-admin.mjs', 'src/sponsor-impact.mjs']) {
    assert.ok(!/cat[aá]logo|card[aá]pio/i.test(await readFile(resolve(root, file), 'utf8')), file);
  }
});

function memoryApi() {
  const store = createMemoryStore();
  const calls = [];
  store.isPlatformAdmin = (id) => id === ADMIN;
  Object.assign(store, {
    async readSponsorImpact(options) {
      calls.push(['impact', options.token]);
      return SAMPLE;
    },
    async listSponsors() { calls.push(['list']); return []; },
    async grantSponsor(userId) { calls.push(['grant', userId]); return { userId, since: '2026-11-14T12:00:00.000Z' }; },
    async revokeSponsor(userId) { calls.push(['revoke', userId]); return userId === SPONSOR; }
  });
  const api = createApiHandler({ store, authVerifier: (token) => TOKENS[token] ?? null });
  const send = (path, { method = 'GET', payload, token, sameOrigin = true } = {}) => api(new Request(origin + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(sameOrigin ? { origin } : {}),
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  }));
  return { send, calls };
}

test('Worker: atribuir e retirar o papel exige platform_admin, mesma origem e UUID', async () => {
  const { send, calls } = memoryApi();
  assert.equal((await send('/api/admin/sponsors', { method: 'POST', payload: { userId: SPONSOR } })).status, 401);
  for (const token of ['token-sponsor', 'token-merchant']) {
    const response = await send('/api/admin/sponsors', { method: 'POST', payload: { userId: SPONSOR }, token });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN_PLATFORM_ADMIN');
  }
  assert.equal((await send('/api/admin/sponsors', { method: 'POST', payload: { userId: SPONSOR }, token: 'token-admin', sameOrigin: false })).status, 403);
  assert.equal((await send('/api/admin/sponsors', { method: 'POST', payload: { userId: 'fulano' }, token: 'token-admin' })).status, 422);
  assert.equal(calls.length, 0);

  const granted = await send('/api/admin/sponsors', { method: 'POST', payload: { userId: SPONSOR.toUpperCase() }, token: 'token-admin' });
  assert.equal(granted.status, 201);
  assert.equal(granted.headers.get('cache-control'), 'no-store');
  assert.deepEqual(calls.at(-1), ['grant', SPONSOR]);
  assert.equal((await send(`/api/admin/sponsors/${SPONSOR}`, { method: 'DELETE', token: 'token-admin', sameOrigin: false })).status, 403);
  assert.equal((await send(`/api/admin/sponsors/${SPONSOR}`, { method: 'DELETE', token: 'token-admin' })).status, 200);
  assert.equal((await send(`/api/admin/sponsors/${MERCHANT}`, { method: 'DELETE', token: 'token-admin' })).status, 404);
  assert.equal((await send('/api/admin/sponsors', { method: 'PUT', payload: {}, token: 'token-admin' })).status, 405);
});

async function migratedDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
  `);
  const dir = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(dir, file), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [ADMIN, SPONSOR, MERCHANT]);
  await db.query("insert into public.platform_operators (user_id, role) values ($1, 'platform_admin')", [ADMIN]);
  const today = new Date().toISOString().slice(0, 10);
  for (let n = 1; n <= 6; n += 1) {
    const id = `20000000-0000-0000-0000-00000000000${n}`;
    await db.query('insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [id, MERCHANT, `loja-${n}`, `Loja ${n}`]);
    const menu = { slug: `loja-${n}`, name: `Loja ${n}`, items: [{ id: 'item', name: 'Item', priceCents: 100 }], locality: { city: n <= 5 ? 'Campo Grande' : 'Dourados', uf: 'MS', citySlug: n <= 5 ? 'campo-grande-ms' : 'dourados-ms' } };
    await db.query(
      "insert into public.publications (site_id, slug, revision, status, artifact_hash, menu) values ($1, $2, 1, 'active', $3, $4)",
      [id, `loja-${n}`, 'c'.repeat(64), JSON.stringify(menu)]
    );
    await db.query(
      "insert into public.site_metrics_daily (site_id, metric_date, metric_hour, item_key, metric_name, count_value) values ($1, $2, 9, '', 'visit', 10), ($1, $2, 9, '', 'whatsapp_order', 1)",
      [id, today]
    );
  }
  return db;
}

// PostgREST mínimo: executa a RPC ou a consulta como `authenticated`, com o usuário do token.
function postgrestOver(db) {
  const tables = {
    read_sponsor_impact: (args) => ['select public.read_sponsor_impact($1) as value', [args.month_count ?? 12], 'value'],
    list_sponsors: () => ['select * from public.list_sponsors()', [], 'rows'],
    grant_sponsor_role: (args) => ['select * from public.grant_sponsor_role($1)', [args.target_user], 'rows'],
    revoke_sponsor_role: (args) => ['select public.revoke_sponsor_role($1) as value', [args.target_user], 'value']
  };
  const requests = [];
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
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url);
    const token = String(new Headers(init.headers).get('authorization') ?? '').replace(/^Bearer /, '');
    const userId = TOKENS[token] ?? '';
    requests.push(url.pathname + url.search);
    try {
      const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)$/);
      if (rpc && tables[rpc[1]]) {
        const [sql, params, shape] = tables[rpc[1]](JSON.parse(init.body || '{}'));
        const { rows } = await run(userId, sql, params);
        return Response.json(shape === 'value' ? rows[0].value : rows);
      }
      if (url.pathname === '/rest/v1/platform_operators') {
        const user = (url.searchParams.get('user_id') ?? '').replace(/^eq\./, '');
        const role = (url.searchParams.get('role') ?? '').replace(/^eq\./, '');
        const { rows } = await run(userId, 'select role from public.platform_operators where user_id = $1 and role = $2', [user, role]);
        return Response.json(rows);
      }
      if (url.pathname === '/rest/v1/rpc/read_platform_overview') {
        const { rows } = await run(userId, 'select public.read_platform_overview() as value', []);
        return Response.json(rows[0].value);
      }
      return Response.json({ message: 'não simulado' }, { status: 501 });
    } catch (error) {
      return Response.json({ code: error.code, message: error.message }, { status: error.code === '42501' ? 403 : 400 });
    }
  };
  return { fetchImpl, requests };
}

test('ponta a ponta com o banco: o patrocinador vê Impacto e nenhuma outra rota de administração', async () => {
  const db = await migratedDb();
  const { fetchImpl } = postgrestOver(db);
  const api = createApiHandler({ fetch: fetchImpl, authVerifier: (token) => TOKENS[token] ?? null });
  const env = { SUPABASE_URL: 'https://banco.test', SUPABASE_ANON_KEY: 'chave-anon-de-teste' };
  const send = (path, { method = 'GET', payload, token } = {}) => api(new Request(origin + path, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      origin,
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  }), env, {});

  const before = await send('/api/sponsor/impact', { token: 'token-sponsor' });
  assert.equal(before.status, 403);
  assert.equal((await before.json()).error.code, 'FORBIDDEN_SPONSOR');

  assert.equal((await send('/api/admin/sponsors', { method: 'POST', payload: { userId: SPONSOR }, token: 'token-sponsor' })).status, 403);
  const granted = await send('/api/admin/sponsors', { method: 'POST', payload: { userId: SPONSOR }, token: 'token-admin' });
  assert.equal(granted.status, 201);
  assert.equal((await granted.json()).sponsor.userId, SPONSOR);
  const conflict = await send('/api/admin/sponsors', { method: 'POST', payload: { userId: ADMIN }, token: 'token-admin' });
  assert.equal(conflict.status, 409);
  const listed = await (await send('/api/admin/sponsors', { token: 'token-admin' })).json();
  assert.deepEqual(listed.sponsors.map((entry) => entry.userId), [SPONSOR]);

  const response = await send('/api/sponsor/impact', { token: 'token-sponsor' });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { impact } = await response.json();
  assert.equal(impact.activeSites, 6);
  assert.deepEqual(
    impact.cities.map((city) => [city.city, city.sites, city.visits, city.whatsappClicks]),
    [['Outras cidades', 6, 60, 6]],
    'Dourados (1) sozinha deixaria "Outras cidades" com 1 vitrine: Campo Grande entra junto'
  );
  assert.ok(!JSON.stringify(impact).includes('Loja'));

  assert.equal((await send('/api/sponsor/impact', { token: 'token-merchant' })).status, 403);
  for (const path of ['/api/admin/overview', '/api/admin/audit-logs', '/api/admin/customization-requests', '/api/admin/cms', '/api/admin/templates', '/api/admin/sponsors', '/api/admin/mila-relay?code=%23VI-ABCDEF-1234']) {
    const denied = await send(path, { token: 'token-sponsor' });
    assert.equal(denied.status, 403, path);
    assert.equal((await denied.json()).error.code, 'FORBIDDEN_PLATFORM_ADMIN', path);
  }

  const revoked = await send(`/api/admin/sponsors/${SPONSOR}`, { method: 'DELETE', token: 'token-admin' });
  assert.equal(revoked.status, 200);
  assert.equal((await send('/api/sponsor/impact', { token: 'token-sponsor' })).status, 403);
});
