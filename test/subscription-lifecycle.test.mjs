import test from 'node:test';
import assert from 'node:assert/strict';
import worker, { createApiHandler, createMemoryStore } from '../workers/api.mjs';
import {
  GRACE_DAYS,
  PAID_FEATURE_GONE_CACHE_CONTROL,
  nextLifecycleState,
  paidFeatureGoneResponse,
  pickSubscriptionNotice,
  resolveShowcaseRoute,
  runSubscriptionLifecycle,
  subscriptionNotice
} from '../src/billing/lifecycle.mjs';
import { FREE_ENTITLEMENTS, normalizeEntitlements, requirePlanFeature } from '../src/entitlements.mjs';
import { billingNoticeCopy } from '../web/portal/billing-notice.mjs';

// Valores fictícios óbvios: nada aqui é chave real.
const FAKE_SERVICE_KEY = 'service-role-ficticia-de-teste';
const FAKE_KEY = '$aact_hmlg_CHAVE_FICTICIA_DE_TESTE_000';
const ORIGIN = 'https://vitrine.inspira.dev.br';
const OWNER = '80000000-0000-0000-0000-00000000000a';
const OTHER = '80000000-0000-0000-0000-00000000000b';
const TENANT = '81000000-0000-0000-0000-00000000000a';
const DAY = 24 * 60 * 60 * 1000;
const DUE = Date.parse('2026-12-01T03:00:00Z'); // meia-noite de Brasília
const at = (days) => new Date(DUE + days * DAY);
const sub = (status, extra = {}) => ({
  tenant_id: TENANT, plan_code: 'essencial', plan_name: 'Essencial', status,
  current_period_end: new Date(DUE).toISOString(), grace_until: null, ...extra
});

test('relógio simulado: vencimento + 6 dias fica em tolerância, + 8 dias suspende', () => {
  assert.equal(nextLifecycleState(sub('active'), at(-1)), null);
  const graced = nextLifecycleState(sub('active'), at(6));
  assert.deepEqual(graced, { status: 'grace', graceUntil: new Date(DUE + GRACE_DAYS * DAY).toISOString() });
  assert.equal(nextLifecycleState(sub('grace', { grace_until: graced.graceUntil }), at(6)), null);
  assert.equal(nextLifecycleState(sub('grace', { grace_until: graced.graceUntil }), at(8)).status, 'suspended');
  assert.equal(nextLifecycleState(sub('past_due'), at(8)).status, 'suspended');
  for (const status of ['suspended', 'canceled', 'pending']) assert.equal(nextLifecycleState(sub(status), at(30)), null);
  assert.equal(nextLifecycleState(sub('active', { current_period_end: null }), at(30)), null);
});

test('aviso do Início: 3 dias antes, na tolerância e na suspensão', () => {
  assert.equal(subscriptionNotice(sub('active'), at(-4)), null);
  assert.deepEqual(
    { kind: subscriptionNotice(sub('active'), at(-3)).kind, daysLeft: subscriptionNotice(sub('active'), at(-3)).daysLeft },
    { kind: 'due_soon', daysLeft: 3 }
  );
  assert.equal(subscriptionNotice(sub('active'), at(-0.5)).daysLeft, 1);
  const grace = subscriptionNotice(sub('grace', { grace_until: at(7).toISOString() }), at(6));
  assert.equal(grace.kind, 'grace');
  assert.equal(grace.daysLeft, 1);
  assert.equal(subscriptionNotice(sub('active'), at(2)).kind, 'grace', 'antes do Cron, vencida já mostra a tolerância');
  assert.equal(subscriptionNotice(sub('grace'), at(8)).kind, 'suspended');
  assert.equal(subscriptionNotice(sub('suspended'), at(8)).kind, 'suspended');
  assert.equal(subscriptionNotice(sub('canceled'), at(-1)), null);
  assert.equal(subscriptionNotice(sub('active', { current_period_end: null }), at(0)), null);
  assert.equal(
    pickSubscriptionNotice([sub('active'), sub('suspended')], at(-1)).kind,
    'suspended',
    'o aviso mais grave vem primeiro'
  );
});

test('texto da faixa fala de vitrine, com datas em Brasília, e nunca de catálogo', () => {
  const due = billingNoticeCopy(subscriptionNotice(sub('active'), at(-2)));
  assert.equal(due.title, 'Sua assinatura vence em 2 dias');
  assert.match(due.text, /vence em 1 de dezembro/);
  const grace = billingNoticeCopy(subscriptionNotice(sub('active'), at(1)));
  assert.match(grace.title, /6 dias de tolerância/);
  assert.match(grace.text, /continuam até 7 de dezembro/);
  const suspended = billingNoticeCopy(subscriptionNotice(sub('suspended'), at(9)));
  assert.equal(suspended.title, 'Recursos pagos suspensos');
  assert.match(suspended.text, /vitrine continua no ar em vitrine\.inspira\.dev\.br/);
  assert.match(suspended.text, /Nada foi apagado/);
  for (const copy of [due, grace, suspended]) assert.doesNotMatch(`${copy.title} ${copy.text}`, /cat[aá]logo|card[aá]pio/i);
  assert.equal(billingNoticeCopy(null), null);
});

test('Cron faz uma única chamada para qualquer número de assinaturas', async () => {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return Response.json({ grace: 50, suspended: 50, hasMore: false });
  };
  const env = { SUPABASE_URL: 'https://projeto.supabase.co/', SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY };
  assert.deepEqual(await runSubscriptionLifecycle(env, { fetch }), { grace: 50, suspended: 50, hasMore: false });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://projeto.supabase.co/rest/v1/rpc/billing_lifecycle_tick');
  assert.deepEqual(JSON.parse(calls[0].init.body), { max_rows: 200 });
  assert.deepEqual(await runSubscriptionLifecycle({}, { fetch }), { skipped: true });
  assert.deepEqual(await runSubscriptionLifecycle(env, { fetch: async () => new Response(null, { status: 404 }) }), { skipped: true });
  await assert.rejects(runSubscriptionLifecycle(env, { fetch: async () => new Response(null, { status: 500 }) }), /500/);
  assert.equal(calls.length, 1);
});

test('scheduled(): domínios e assinaturas são independentes e cabem nos subrequests do Workers Free', async (t) => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  const env = {
    SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_ANON_KEY: 'anon-ficticia',
    SUPABASE_SERVICE_ROLE_KEY: FAKE_SERVICE_KEY, CF_SAAS_API_TOKEN: 'cf-ficticio', CF_SAAS_ZONE_ID: '1'.repeat(32)
  };
  const subscriptions = Array.from({ length: 100 }, (_, i) => i);
  let calls = [];
  let domainsFail = false;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    calls.push(url.pathname);
    if (url.pathname.endsWith('/rpc/billing_lifecycle_tick')) {
      return Response.json({ grace: 0, suspended: subscriptions.length, hasMore: false });
    }
    if (url.pathname.endsWith('/custom_domains')) {
      return domainsFail ? new Response(null, { status: 500 }) : Response.json([]);
    }
    return new Response(null, { status: 404 });
  };

  await worker.scheduled({}, env, {});
  assert.equal(calls.filter((path) => path.endsWith('/billing_lifecycle_tick')).length, 1);
  assert.ok(calls.length <= 50, `subrequests: ${calls.length}`);

  calls = [];
  domainsFail = true;
  await assert.rejects(worker.scheduled({}, env, {}), /domínios pendentes/);
  assert.equal(calls.filter((path) => path.endsWith('/billing_lifecycle_tick')).length, 1, 'falha dos domínios não impede o ciclo');
});

test('domínio próprio de vitrine suspensa redireciona para o endereço da plataforma', async (t) => {
  const store = createMemoryStore();
  const api = createApiHandler({ store });
  const [site] = await store.listSites('10000000-0000-0000-0000-000000000001');
  const publish = await api(new Request(`${ORIGIN}/api/sites/${site.id}/publish`, {
    method: 'POST', headers: { authorization: 'Bearer token-owner' }
  }));
  assert.equal(publish.status, 200);
  const host = 'menu.example.com';
  let canonical = true;
  store.resolveDomainRoute = async (hostname) => (hostname === host ? { slug: site.slug, canonical } : null);
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const entries = new Map();
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: { default: {
    match: async (key) => entries.get(key.url)?.clone(),
    put: async (key, response) => entries.set(key.url, response.clone())
  } } });
  t.after(() => {
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  });
  const env = { CF_SAAS_CNAME_TARGET: 'saas.inspira.dev.br' };
  const get = (path) => api(new Request(`https://${host}${path}`), env, { waitUntil() {} });

  assert.equal((await get('/')).status, 200);
  canonical = false;
  const suspended = await get('/');
  assert.equal(suspended.status, 302, 'a cópia em cache não é servida no domínio suspenso');
  assert.equal(suspended.headers.get('location'), `${ORIGIN}/${site.slug}`);
  assert.equal(suspended.headers.get('cache-control'), 'no-store');
  assert.equal((await get(`/data/vitrines/${site.slug}/menu.json`)).headers.get('location'), `${ORIGIN}/data/vitrines/${site.slug}/menu.json`);
  assert.equal((await get('/api/sites')).status, 404);
  canonical = true;
  assert.equal((await get('/')).status, 200, 'reativada, volta sem ação manual');
});

test('resolveShowcaseRoute cai no resolveDomain quando a migração ainda não existe', async () => {
  assert.deepEqual(await resolveShowcaseRoute({ resolveDomain: async () => 'loja' }, 'x.com'), { slug: 'loja', canonical: true });
  assert.deepEqual(
    await resolveShowcaseRoute({ resolveDomainRoute: async () => undefined, resolveDomain: async () => 'loja' }, 'x.com'),
    { slug: 'loja', canonical: true }
  );
  assert.equal(await resolveShowcaseRoute({ resolveDomainRoute: async () => null, resolveDomain: async () => 'loja' }, 'x.com'), null);
});

test('vitrine.json e pré-orçamento de vitrine suspensa: 404 com cache curto', async () => {
  const suspended = normalizeEntitlements({ plan_code: 'free' });
  assert.deepEqual(suspended, FREE_ENTITLEMENTS);
  for (const feature of ['public_json', 'quote_webhook', 'custom_domain']) {
    assert.throws(() => requirePlanFeature(suspended, feature), { code: 'PLAN_FEATURE_REQUIRED' });
  }
  const response = paidFeatureGoneResponse();
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('cache-control'), PAID_FEATURE_GONE_CACHE_CONTROL);
  assert.match(PAID_FEATURE_GONE_CACHE_CONTROL, /max-age=60$/);
});

function noticeStore(rows, { owner = OWNER, subscription = null } = {}) {
  const state = { canceled: [], subscription };
  return {
    state,
    async readNotices({ userId }) { return userId === OWNER ? rows : []; },
    async getTenantOwner(tenantId) { return tenantId === TENANT ? owner : null; },
    async getSubscription() { return state.subscription; },
    async cancelByOwner({ tenantId, userId }) {
      state.canceled.push({ tenantId, userId });
      return { ...state.subscription, status: 'canceled' };
    }
  };
}

function handlerWith(store, { now = at(1), providerCalls = [] } = {}) {
  return createApiHandler({
    billingStore: store,
    now: () => now,
    fetch: async (url, init = {}) => {
      providerCalls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`);
      return Response.json({ deleted: true });
    },
    authVerifier: (token) => ({ 'sessao-dono': { id: OWNER }, 'sessao-outra': { id: OTHER } })[token] ?? null
  });
}

test('GET /api/billing/notice devolve o aviso só para a pessoa dona', async () => {
  const handler = handlerWith(noticeStore([sub('active')]));
  const get = (token) => handler(new Request(`${ORIGIN}/api/billing/notice`, {
    headers: token ? { authorization: `Bearer ${token}` } : {}
  }), {});
  assert.equal((await get(null)).status, 401);
  const owner = await get('sessao-dono');
  assert.equal(owner.status, 200);
  assert.equal(owner.headers.get('cache-control'), 'no-store');
  const body = await owner.json();
  assert.equal(body.notice.kind, 'grace');
  assert.equal(body.notice.planName, 'Essencial');
  assert.deepEqual(await (await get('sessao-outra')).json(), { notice: null });
  assert.equal((await handler(new Request(`${ORIGIN}/api/billing/notice`, {
    method: 'POST', headers: { authorization: 'Bearer sessao-dono' }
  }), {})).status, 405);
});

test('POST /api/billing/cancel cancela no Asaas e mantém o acesso até o fim do período', async () => {
  const periodEnd = at(20).toISOString();
  const store = noticeStore([], {
    subscription: { plan_code: 'essencial', status: 'active', provider: 'asaas', provider_subscription_id: 'sub_9', current_period_end: periodEnd }
  });
  const providerCalls = [];
  const handler = handlerWith(store, { providerCalls });
  const env = { ASAAS_API_KEY: FAKE_KEY };
  const cancel = (body, token = 'sessao-dono') => handler(new Request(`${ORIGIN}/api/billing/cancel`, {
    method: 'POST',
    headers: { origin: ORIGIN, 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  }), env);

  assert.equal((await cancel({ tenantId: 'x' })).status, 400);
  assert.equal((await cancel({ tenantId: TENANT }, 'sessao-outra')).status, 403);
  const ok = await cancel({ tenantId: TENANT });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { subscription: { planCode: 'essencial', status: 'canceled', accessUntil: periodEnd } });
  assert.deepEqual(providerCalls, ['DELETE /v3/subscriptions/sub_9']);
  assert.deepEqual(store.state.canceled, [{ tenantId: TENANT, userId: OWNER }]);

  store.state.subscription = { ...store.state.subscription, status: 'canceled' };
  assert.equal((await cancel({ tenantId: TENANT })).status, 409);
  store.state.subscription = { plan_code: 'essencial', status: 'active', provider: 'manual', provider_subscription_id: null };
  assert.equal((await cancel({ tenantId: TENANT })).status, 409, 'assinatura manual é do operador');
  assert.equal(providerCalls.length, 1);
});
