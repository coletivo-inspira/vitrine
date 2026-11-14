import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, createMemoryStore, createSupabaseRestStore } from '../../workers/api.mjs';
import { assertNoPrivateLeakage, compilePublicStorefront } from '../../src/publication-engine.mjs';
import {
  FREE_ENTITLEMENTS,
  PLAN_FEATURE_REQUIRED,
  assertItemBlocksAllowed,
  loadSiteEntitlements,
  normalizeEntitlements,
  planFeatureRequiredError,
  requirePlanFeature
} from '../../src/entitlements.mjs';

const OWNER_A = '70000000-0000-0000-0000-00000000000a';
const OWNER_B = '70000000-0000-0000-0000-00000000000b';
const ADMIN = '70000000-0000-0000-0000-0000000000ad';
const TENANT_A = '71000000-0000-0000-0000-00000000000a';
const TENANT_B = '71000000-0000-0000-0000-00000000000b';
const SITE_A = '72000000-0000-0000-0000-00000000000a';
const SITE_B = '72000000-0000-0000-0000-00000000000b';
const SITE_LOOSE = '72000000-0000-0000-0000-0000000000ff';
const MIGRATION = '20261115000100_plans_subscriptions.sql';
const ORIGIN = 'https://vitrine.inspira.dev.br';
const MEMORY_SITE = '20000000-0000-0000-0000-000000000001';

async function setupDb({ legacyPlans = null } = {}) {
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
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const dir = resolve(root, 'supabase/migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.includes(MIGRATION));
  const seed = async () => {
    await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [OWNER_A, OWNER_B, ADMIN]);
    await db.query("insert into public.platform_operators (user_id, role) values ($1, 'platform_admin')", [ADMIN]);
    await db.query(
      "insert into public.tenants (id, owner_user_id, slug, name, plan) values ($1, $2, 'cliente-a', 'Cliente A', $3), ($4, $5, 'cliente-b', 'Cliente B', $6)",
      [TENANT_A, OWNER_A, legacyPlans?.a ?? 'free', TENANT_B, OWNER_B, legacyPlans?.b ?? 'free']
    );
    await db.query(
      `insert into public.sites (id, owner_user_id, slug, name, tenant_id) values
        ($1, $2, 'loja-a', 'Loja A', $3), ($4, $5, 'loja-b', 'Loja B', $6), ($7, $2, 'loja-solta', 'Loja Solta', null)`,
      [SITE_A, OWNER_A, TENANT_A, SITE_B, OWNER_B, TENANT_B, SITE_LOOSE]
    );
  };
  for (const file of files) {
    if (file === MIGRATION) await seed();
    await db.exec(await readFile(resolve(dir, file), 'utf8'));
  }
  return db;
}

async function asRole(db, { role = 'anon', userId = null, commit = false }, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    await db.exec(commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const denied = (pattern = /permission denied/) => (error) => {
  assert.match(error.message, pattern);
  return true;
};

function setSubscription(db, tenant, plan, status, extra = {}) {
  return asRole(db, { role: 'authenticated', userId: ADMIN, commit: true }, () => db.query(
    'select * from public.set_tenant_subscription($1, $2, $3, $4, $5)',
    [tenant, plan, status, extra.periodEnd ?? null, extra.graceUntil ?? null]
  ));
}

async function entitlementsOf(db, site) {
  return (await db.query('select * from private.site_entitlements($1)', [site])).rows[0];
}

function menuFor(slug, count) {
  return {
    schemaVersion: 1,
    template: 'products-v1',
    catalogType: 'products',
    slug,
    name: 'Loja',
    whatsapp: '5551988887777',
    currency: 'BRL',
    items: Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}`, priceCents: 1000 })),
    categories: []
  };
}

function draftItems(count, extra = {}) {
  return Array.from({ length: count }, (_, i) => ({
    id: `item-${i + 1}`, name: `Item ${i + 1}`, priceCents: 1000 + i, active: true, available: true, ...extra
  }));
}

test('tabela public.plans é a semente fiel de content/plans.json', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const table = JSON.parse(await readFile(new URL('../../content/plans.json', import.meta.url), 'utf8'));
  const { rows } = await db.query(
    'select code, name, monthly_price_cents, max_vitrines, max_active_items, max_item_blocks, features from public.plans order by monthly_price_cents'
  );
  assert.deepEqual(rows, table.plans.map((plan) => ({
    code: plan.code,
    name: plan.name,
    monthly_price_cents: plan.monthlyPriceCents,
    max_vitrines: plan.limits.vitrines,
    max_active_items: plan.limits.activeItemsPerVitrine,
    max_item_blocks: plan.limits.itemBlocks,
    features: plan.features
  })));
  await assert.rejects(
    db.query("update public.plans set max_active_items = 101 where code = 'equipe'"),
    /check constraint/
  );
});

test('isolamento: A não lê a assinatura de B, nem por chamada direta; anon não lê nada', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await setSubscription(db, TENANT_A, 'essencial', 'active');
  await setSubscription(db, TENANT_B, 'profissional', 'active');

  const own = await asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('select tenant_id, plan_code, status from public.subscriptions'));
  assert.deepEqual(own.rows, [{ tenant_id: TENANT_A, plan_code: 'essencial', status: 'active' }]);

  const other = await asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('select * from public.subscriptions where tenant_id = $1', [TENANT_B]));
  assert.equal(other.rows.length, 0);

  const rpcOther = await asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('select * from public.read_site_entitlements($1)', [SITE_B]));
  assert.equal(rpcOther.rows.length, 0);
  const rpcOwn = await asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('select plan_code from public.read_site_entitlements($1)', [SITE_A]));
  assert.deepEqual(rpcOwn.rows, [{ plan_code: 'essencial' }]);

  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('select * from private.site_entitlements($1)', [SITE_B])), denied());
  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('select * from public.service_site_entitlements($1)', [SITE_B])), denied());

  for (const sql of [
    'select * from public.subscriptions',
    'select * from public.plans',
    `select * from public.read_site_entitlements('${SITE_A}')`,
    `select * from public.service_site_entitlements('${SITE_A}')`
  ]) {
    await assert.rejects(asRole(db, { role: 'anon' }, () => db.query(sql)), denied(), sql);
  }

  const service = await asRole(db, { role: 'service_role' }, () =>
    db.query('select plan_code from public.service_site_entitlements($1)', [SITE_B]));
  assert.deepEqual(service.rows, [{ plan_code: 'profissional' }]);
});

test('o dono não muda plan_code nem status da própria assinatura', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await setSubscription(db, TENANT_A, 'essencial', 'past_due');

  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query("update public.subscriptions set plan_code = 'equipe' where tenant_id = $1", [TENANT_A])), denied());
  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query("update public.subscriptions set status = 'active' where tenant_id = $1", [TENANT_A])), denied());
  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_B }, () =>
    db.query("insert into public.subscriptions (tenant_id, plan_code, status) values ($1, 'equipe', 'active')", [TENANT_B])), denied());
  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('delete from public.subscriptions where tenant_id = $1', [TENANT_A])), denied());
  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query("select public.set_tenant_subscription($1, 'equipe', 'active')", [TENANT_A])), /SUBSCRIPTION_WRITE_FORBIDDEN/);
  await assert.rejects(asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query("update public.tenants set plan = 'bespoke' where id = $1", [TENANT_A])), /CANNOT_CHANGE_TENANT_PLAN/);

  const { rows } = await db.query('select plan_code, status from public.subscriptions where tenant_id = $1', [TENANT_A]);
  assert.deepEqual(rows, [{ plan_code: 'essencial', status: 'past_due' }]);
});

test('direitos: sem tenant ou sem assinatura que valha recebe free; tolerância de 7 dias', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  assert.equal((await entitlementsOf(db, SITE_LOOSE)).plan_code, 'free');
  assert.equal((await entitlementsOf(db, SITE_A)).plan_code, 'free');
  assert.equal(await entitlementsOf(db, '72000000-0000-0000-0000-000000000000'), undefined);

  const day = 86400_000;
  const iso = (offset) => new Date(Date.now() + offset).toISOString();
  const cases = [
    ['pending', {}, 'free'],
    ['active', {}, 'essencial'],
    ['past_due', { graceUntil: iso(day) }, 'essencial'],
    ['grace', { periodEnd: iso(-6 * day) }, 'essencial'],
    ['grace', { periodEnd: iso(-8 * day) }, 'free'],
    ['past_due', { graceUntil: iso(-1000) }, 'free'],
    ['past_due', {}, 'free'],
    ['suspended', {}, 'free'],
    ['canceled', {}, 'free']
  ];
  for (const [status, extra, expected] of cases) {
    await setSubscription(db, TENANT_A, 'essencial', status, extra);
    assert.equal((await entitlementsOf(db, SITE_A)).plan_code, expected, `${status} ${JSON.stringify(extra)}`);
  }
  await setSubscription(db, TENANT_A, 'profissional', 'active');
  const row = await entitlementsOf(db, SITE_A);
  assert.equal(row.max_active_items, 100);
  assert.equal(row.max_item_blocks, 5);
  assert.ok(row.features.includes('quote_webhook'));
  assert.equal((await entitlementsOf(db, SITE_LOOSE)).max_active_items, 20);
});

test('migração: custom_domain vira essencial e bespoke recebe profissional', async (t) => {
  const db = await setupDb({ legacyPlans: { a: 'custom_domain', b: 'bespoke' } });
  t.after(() => db.close());
  const { rows } = await db.query('select tenant_id, plan_code, status, provider from public.subscriptions order by tenant_id');
  assert.deepEqual(rows, [
    { tenant_id: TENANT_A, plan_code: 'essencial', status: 'active', provider: 'manual' },
    { tenant_id: TENANT_B, plan_code: 'profissional', status: 'active', provider: 'manual' }
  ]);
  assert.equal((await entitlementsOf(db, SITE_B)).plan_code, 'profissional');
  const audit = await db.query("select actor_user_id, summary->>'source' as source from public.audit_logs where entity_type = 'subscription'");
  assert.deepEqual(audit.rows, [
    { actor_user_id: null, source: 'migration' },
    { actor_user_id: null, source: 'migration' }
  ]);
});

test('toda mudança de assinatura vai para audit_logs com autor e valores antigo e novo', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await setSubscription(db, TENANT_A, 'essencial', 'pending');
  await setSubscription(db, TENANT_A, 'essencial', 'active');
  await setSubscription(db, TENANT_A, 'essencial', 'active');
  await asRole(db, { role: 'service_role', commit: true }, () => db.query(
    "update public.subscriptions set status = 'past_due', provider = 'asaas', provider_subscription_id = 'sub_teste' where tenant_id = $1",
    [TENANT_A]
  ));
  await db.query('delete from public.tenants where id = $1', [TENANT_A]);

  const { rows } = await db.query(
    "select action, actor_user_id, entity_id, site_id, summary from public.audit_logs where entity_type = 'subscription' order by created_at, action"
  );
  assert.deepEqual(rows.map((row) => [row.action, row.actor_user_id, row.summary.source]), [
    ['subscription.insert', ADMIN, 'platform_admin'],
    ['subscription.update', ADMIN, 'platform_admin'],
    ['subscription.update', ADMIN, 'service_role'],
    ['subscription.delete', ADMIN, 'migration']
  ]);
  assert.ok(rows.every((row) => row.entity_id === TENANT_A && row.site_id === null));
  assert.deepEqual(rows[1].summary.old.status, 'pending');
  assert.deepEqual(rows[1].summary.new.status, 'active');
  assert.deepEqual(rows[2].summary.old, { plan_code: 'essencial', status: 'active', provider: 'manual', current_period_end: null, grace_until: null });
  assert.equal(rows[2].summary.new.provider, 'asaas');
  assert.doesNotMatch(JSON.stringify(rows), /sub_teste/);

  const ownerView = await asRole(db, { role: 'authenticated', userId: OWNER_B }, () =>
    db.query("select * from public.audit_logs where entity_type = 'subscription'"));
  assert.equal(ownerView.rows.length, 0);
});

test('publicação no banco respeita os itens ativos do plano e recusa campos de cobrança', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const publish = (site, slug, menu) => db.query(
    "insert into public.publications (site_id, slug, revision, status, artifact_hash, menu) values ($1, $2, 1, 'active', $3, $4::jsonb) on conflict (site_id) do update set menu = excluded.menu",
    [site, slug, 'e'.repeat(64), JSON.stringify(menu)]
  );
  await publish(SITE_A, 'loja-a', menuFor('loja-a', 20));
  await assert.rejects(publish(SITE_A, 'loja-a', menuFor('loja-a', 21)), /ACTIVE_ITEMS_LIMIT_EXCEEDED/);
  await setSubscription(db, TENANT_A, 'essencial', 'active');
  await publish(SITE_A, 'loja-a', menuFor('loja-a', 100));
  await assert.rejects(publish(SITE_A, 'loja-a', menuFor('loja-a', 101)), /check constraint|ACTIVE_ITEMS_LIMIT_EXCEEDED/);
  for (const key of ['plan', 'subscriptionStatus', 'providerCustomerId', 'provider_subscription_id', 'entitlements']) {
    await assert.rejects(publish(SITE_A, 'loja-a', { ...menuFor('loja-a', 1), [key]: 'x' }), /check constraint/, key);
  }
});

test('assertNoPrivateLeakage recusa plano, situação de pagamento e identificador do provedor', async () => {
  const { menu } = await compilePublicStorefront({
    schemaVersion: 1, template: 'products-v1', slug: 'loja-a', businessName: 'Loja A',
    whatsapp: '5551988887777', categories: [], items: draftItems(1)
  }, { slug: 'loja-a' });
  assert.doesNotThrow(() => assertNoPrivateLeakage(menu));
  for (const key of ['plan', 'planCode', 'subscription', 'subscriptionStatus', 'paymentStatus', 'provider',
    'providerCustomerId', 'providerSubscriptionId', 'graceUntil', 'currentPeriodEnd', 'entitlements']) {
    assert.throws(() => assertNoPrivateLeakage({ ...menu, [key]: 'x' }), { code: 'PRIVATE_FIELD_LEAKAGE' }, key);
    assert.throws(() => assertNoPrivateLeakage({ ...menu, items: [{ ...menu.items[0], [key]: 'x' }] }), { code: 'PRIVATE_FIELD_LEAKAGE' }, key);
  }
});

test('helpers de direitos: PLAN_FEATURE_REQUIRED indica o plano que libera', () => {
  assert.equal(normalizeEntitlements(null), FREE_ENTITLEMENTS);
  assert.equal(normalizeEntitlements({ plan_code: 'bespoke' }), FREE_ENTITLEMENTS);
  const forged = normalizeEntitlements({ plan_code: 'essencial', max_active_items: 500, features: ['custom_domain', 'root'] });
  assert.equal(forged.maxActiveItems, 100);
  assert.deepEqual(forged.features, ['custom_domain']);

  const error = planFeatureRequiredError('public_json');
  assert.equal(error.status, 403);
  assert.deepEqual(error.toJSON().error, {
    code: PLAN_FEATURE_REQUIRED,
    message: 'Este recurso faz parte do plano Profissional.',
    feature: 'public_json',
    requiredPlan: { code: 'profissional', name: 'Profissional' }
  });
  assert.throws(() => requirePlanFeature(FREE_ENTITLEMENTS, 'quote_webhook'), (err) =>
    err.code === PLAN_FEATURE_REQUIRED && err.requiredPlan.code === 'profissional');
  assert.doesNotThrow(() => requirePlanFeature(normalizeEntitlements({ plan_code: 'profissional' }), 'quote_webhook'));

  const page = (blocks) => [{ slug: 'home', sections: Array.from({ length: blocks }, (_, i) => ({ id: `b${i}`, moduleCode: 'catalog_grid' })) }];
  assert.throws(() => assertItemBlocksAllowed(FREE_ENTITLEMENTS, page(2), page(1)), (err) =>
    err.code === PLAN_FEATURE_REQUIRED && err.requiredPlan.code === 'profissional');
  assert.doesNotThrow(() => assertItemBlocksAllowed(FREE_ENTITLEMENTS, page(2), page(3)));
  assert.doesNotThrow(() => assertItemBlocksAllowed(normalizeEntitlements({ plan_code: 'equipe' }), page(5), []));
});

test('store Supabase lê os direitos pela RPC certa e cai em free se a função não existir', async () => {
  const calls = [];
  const fetchMock = async (url, init) => {
    calls.push([new URL(url).pathname, init.headers.authorization]);
    if (calls.length === 3) return new Response('{}', { status: 404 });
    return Response.json([{ plan_code: 'essencial', features: ['custom_domain'] }]);
  };
  const store = createSupabaseRestStore({ supabaseUrl: 'https://db.invalid', supabaseAnonKey: 'anon-key', fetch: fetchMock });
  assert.equal((await loadSiteEntitlements(store, SITE_A, { token: 'user-jwt' })).planCode, 'essencial');
  assert.equal((await loadSiteEntitlements(store, SITE_A, { env: { SUPABASE_SERVICE_ROLE_KEY: 'service-key' } })).planCode, 'essencial');
  assert.equal(await loadSiteEntitlements(store, SITE_A, { token: 'user-jwt' }), FREE_ENTITLEMENTS);
  assert.equal(await loadSiteEntitlements(store, SITE_A, {}), FREE_ENTITLEMENTS);
  assert.deepEqual(calls, [
    ['/rest/v1/rpc/read_site_entitlements', 'Bearer user-jwt'],
    ['/rest/v1/rpc/service_site_entitlements', 'Bearer service-key'],
    ['/rest/v1/rpc/read_site_entitlements', 'Bearer user-jwt']
  ]);
});

async function workerWithPlan(db, pgSite) {
  const store = createMemoryStore();
  store.getSiteEntitlements = async () => (await asRole(db, { role: 'authenticated', userId: OWNER_A }, () =>
    db.query('select * from public.read_site_entitlements($1)', [pgSite]))).rows[0] ?? null;
  const api = createApiHandler({ store });
  const call = (path, method, body) => api(new Request(`${ORIGIN}/api/sites/${MEMORY_SITE}${path}`, {
    method,
    headers: { authorization: 'Bearer token-owner', 'content-type': 'application/json', origin: ORIGIN },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  const saveDraft = async (content) => {
    const { draft } = await (await call('/draft', 'GET')).json();
    return call('/draft', 'PUT', { revision: draft.revision, content: { ...draft.content, ...content } });
  };
  return { store, api, call, saveDraft };
}

test('Worker: sem tenant publica até 20 itens ativos; com essencial, até 100', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const loose = await workerWithPlan(db, SITE_LOOSE);
  assert.equal((await loose.saveDraft({ items: draftItems(20) })).status, 200);
  assert.equal((await loose.call('/publish', 'POST')).status, 200);
  const over = await loose.saveDraft({ items: draftItems(21) });
  assert.equal(over.status, 422);
  assert.equal((await over.json()).error.code, 'ACTIVE_ITEMS_LIMIT_EXCEEDED');

  await setSubscription(db, TENANT_A, 'essencial', 'active');
  const paid = await workerWithPlan(db, SITE_A);
  assert.equal((await paid.saveDraft({
    items: draftItems(100), plan: 'equipe', subscriptionStatus: 'active', providerCustomerId: 'cus_teste'
  })).status, 200);
  const published = await paid.call('/publish', 'POST');
  assert.equal(published.status, 200);
  const { publication } = await published.json();
  assert.equal(publication.menu.items.length, 100);
  assert.doesNotThrow(() => assertNoPrivateLeakage(publication.menu));
  assert.doesNotMatch(JSON.stringify(publication), /essencial|equipe|cus_teste|subscription|provider/i);
  const tooMany = await paid.saveDraft({ items: draftItems(101) });
  assert.equal(tooMany.status, 422);
  assert.equal((await tooMany.json()).error.code, 'ACTIVE_ITEMS_LIMIT_EXCEEDED');

  await setSubscription(db, TENANT_A, 'essencial', 'suspended');
  const lapsed = await paid.call('/publish', 'POST');
  assert.equal(lapsed.status, 422);
  assert.equal((await lapsed.json()).error.code, 'ACTIVE_ITEMS_LIMIT_EXCEEDED');
});

test('Worker: mais de 1 bloco de itens exige o Profissional', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const structure = (blocks) => ({
    pages: [{
      slug: 'home', title: 'Início',
      sections: Array.from({ length: blocks }, (_, i) => ({ id: `sec-catalog-${i}`, moduleCode: 'catalog_grid' }))
    }]
  });
  const free = await workerWithPlan(db, SITE_A);
  assert.equal((await free.saveDraft({ structure: structure(1) })).status, 200);
  const blocked = await free.saveDraft({ structure: structure(2) });
  assert.equal(blocked.status, 403);
  const body = (await blocked.json()).error;
  assert.equal(body.code, 'PLAN_FEATURE_REQUIRED');
  assert.deepEqual(body.requiredPlan, { code: 'profissional', name: 'Profissional' });

  await setSubscription(db, TENANT_A, 'profissional', 'active');
  assert.equal((await free.saveDraft({ structure: structure(5) })).status, 200);
  const six = await free.saveDraft({ structure: structure(6) });
  assert.equal(six.status, 403);
  assert.equal((await six.json()).error.requiredPlan, null);
});

test('Worker: domínio próprio exige essencial e a trava de 95 domínios vale para todo plano', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const hostname = 'menu.example.com';
  const target = 'saas.inspira.dev.br';
  const env = {
    CF_SAAS_CNAME_TARGET: target, CF_SAAS_ZONE_ID: '1'.repeat(32),
    CF_SAAS_API_TOKEN: 'mock-token', SUPABASE_SERVICE_ROLE_KEY: 'mock-key'
  };
  const domainId = '73000000-0000-0000-0000-000000000001';

  async function attempt() {
    const store = createMemoryStore();
    store.getSiteEntitlements = async () => (await entitlementsOf(db, SITE_A)) ?? null;
    let row = null;
    store.listDomains = async () => row ? [row] : [];
    store.addDomain = async (_site, challenge) => (row = {
      ...challenge, id: domainId, site_id: MEMORY_SITE, status: 'pending_dns', ssl_status: 'pending',
      verification_txt_name: '_vitrine-verify.' + hostname, verification_txt_value: 'vitrine=plano'
    });
    store.changeDomain = async (_domain, change) => (row = row && { ...row, ...change });
    const created = [];
    const fetchMock = async (input, options) => {
      const url = new URL(input);
      if (url.hostname === 'cloudflare-dns.com') {
        const txt = url.searchParams.get('type') === 'TXT';
        return Response.json({ Status: 0, Answer: [txt
          ? { name: row.verification_txt_name, type: 16, data: JSON.stringify(row.verification_txt_value) }
          : { name: hostname, type: 5, data: target }] });
      }
      if (options.method === 'POST') created.push(url.pathname);
      return Response.json({ success: true, result: [], result_info: { total_count: 95 } });
    };
    const api = createApiHandler({ store, fetch: fetchMock });
    const send = (suffix, body = {}) => api(new Request(`${ORIGIN}/api/sites/${MEMORY_SITE}/domains${suffix}`, {
      method: 'POST', body: JSON.stringify(body),
      headers: { origin: ORIGIN, authorization: 'Bearer token-owner', 'content-type': 'application/json' }
    }), env);
    return { send, created, row: () => row };
  }

  const free = await attempt();
  const refused = await free.send('', { hostname });
  assert.equal(refused.status, 403);
  const refusedBody = (await refused.json()).error;
  assert.equal(refusedBody.code, 'PLAN_FEATURE_REQUIRED');
  assert.deepEqual(refusedBody.requiredPlan, { code: 'essencial', name: 'Essencial' });
  assert.equal(free.row(), null);

  for (const plan of ['essencial', 'equipe']) {
    await setSubscription(db, TENANT_A, plan, 'active');
    const paid = await attempt();
    assert.equal((await paid.send('', { hostname })).status, 201, plan);
    const verify = await paid.send(`/${domainId}/verify`);
    assert.equal(verify.status, 403, plan);
    assert.equal((await verify.json()).error.code, 'DOMAIN_QUOTA_REACHED', plan);
    assert.deepEqual(paid.created, [], plan);
    assert.equal(paid.row().status, 'pending_dns', plan);
  }
});
