import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from '../workers/api.mjs';
import {
  ASAAS_PRODUCTION_API_BASE,
  ASAAS_SANDBOX_API_BASE,
  createAsaasProvider,
  parseAsaasWebhookEvent,
  resolveAsaasConfig
} from '../src/billing/asaas.mjs';
import {
  BillingProviderError,
  assertBillingProvider,
  fetchWithRetry,
  normalizeTaxId,
  subscriptionChangeFor,
  timingSafeEqualText,
  validateBillingDetails
} from '../src/billing/provider.mjs';
import { createSupabaseBillingStore } from '../src/billing/routes.mjs';

// Valores fictícios óbvios: nada aqui é chave ou token real.
const FAKE_KEY = '$aact_hmlg_CHAVE_FICTICIA_DE_TESTE_000';
const FAKE_PROD_KEY = '$aact_prod_CHAVE_FICTICIA_DE_TESTE_000';
const FAKE_TOKEN = 'token-ficticio-do-webhook-de-teste';
const FAKE_SERVICE_KEY = 'service-role-ficticia-de-teste';
const ORIGIN = 'https://vitrine.inspira.dev.br';
const OWNER = '80000000-0000-0000-0000-00000000000a';
const OTHER = '80000000-0000-0000-0000-00000000000b';
const TENANT = '81000000-0000-0000-0000-00000000000a';
const TEST_CPF = '529.982.247-25';
const BILLING = { name: 'Pessoa de Teste', cpfCnpj: TEST_CPF, email: 'cliente@example.com' };
const ENV = { ASAAS_API_KEY: FAKE_KEY, ASAAS_WEBHOOK_TOKEN: FAKE_TOKEN };

function response(status, body, headers = {}) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json', ...headers }
  });
}

// Simula o Asaas: registra cada chamada e responde pelo caminho.
function fakeAsaas({ overrides = {} } = {}) {
  const calls = [];
  let seq = 0;
  const fetch = async (url, init = {}) => {
    const { pathname, hostname } = new URL(url);
    calls.push({ url: String(url), hostname, pathname, method: init.method ?? 'GET', headers: init.headers ?? {}, body: init.body ? JSON.parse(init.body) : null });
    const key = `${init.method ?? 'GET'} ${pathname.replace(/\/v3/, '')}`;
    if (overrides[key]) return overrides[key](calls.at(-1));
    if (key === 'POST /customers') return response(200, { id: `cus_${++seq}` });
    if (key === 'POST /subscriptions') return response(200, { id: `sub_${++seq}`, status: 'ACTIVE' });
    const payments = pathname.match(/\/subscriptions\/([^/]+)\/payments$/);
    if (payments) return response(200, { data: [{ id: 'pay_1', invoiceUrl: `https://sandbox.asaas.com/i/${payments[1]}` }] });
    if (/^DELETE \/subscriptions\//.test(key)) return response(200, { deleted: true });
    if (/^GET \/subscriptions\//.test(key)) return response(200, { id: 'sub_9', status: 'ACTIVE', nextDueDate: '2026-12-14' });
    return response(404, { errors: [{ code: 'not_found' }] });
  };
  return { fetch, calls };
}

// Mesmo contrato das RPCs billing_apply_event e billing_attach_checkout (as regras
// de banco estão em test/database/billing-events.test.mjs).
function memoryBillingStore({ owner = OWNER, subscription = null } = {}) {
  const events = new Set();
  const state = { subscription, updates: 0, applied: [] };
  return {
    state,
    async getTenantOwner(tenantId) { return tenantId === TENANT ? owner : null; },
    async getSubscription() { return state.subscription; },
    async attachCheckout({ tenantId, userId, planCode, provider, customerId, subscriptionId }) {
      const previous = state.subscription;
      state.subscription = {
        tenant_id: tenantId, plan_code: planCode, status: 'pending', provider,
        provider_customer_id: customerId, provider_subscription_id: subscriptionId,
        current_period_end: null, updated_by: userId
      };
      return { previousSubscriptionId: previous?.provider === provider ? previous.provider_subscription_id : null };
    },
    async applyEvent({ provider, event, change }) {
      const key = `${provider}:${event.id}`;
      if (events.has(key)) return 'duplicate';
      events.add(key);
      const sub = state.subscription;
      if (!sub || sub.provider_subscription_id !== event.subscriptionId) return 'unmatched';
      if (!change || sub.status === 'canceled' || (change.status === 'past_due' && sub.status === 'pending')) return 'ignored';
      sub.status = change.status;
      if (change.periodMode === 'extend') {
        sub.current_period_end = [sub.current_period_end, change.periodEnd].filter(Boolean).sort().at(-1);
      }
      if (change.periodMode === 'clamp') {
        sub.current_period_end = [sub.current_period_end, change.periodEnd].filter(Boolean).sort()[0];
      }
      state.updates += 1;
      state.applied.push(event.id);
      return 'applied';
    }
  };
}

function api({ store = memoryBillingStore(), asaas = fakeAsaas(), sleeps = [] } = {}) {
  const handler = createApiHandler({
    billingStore: store,
    fetch: asaas.fetch,
    billingSleep: async (ms) => { sleeps.push(ms); },
    authVerifier: (token) => ({ 'sessao-dono': { id: OWNER }, 'sessao-outra': { id: OTHER } })[token] ?? null
  });
  return { handler, store, asaas, sleeps };
}

function checkout(body, { token = 'sessao-dono', origin = ORIGIN } = {}) {
  return new Request(`${ORIGIN}/api/billing/checkout`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function webhook(payload, token = FAKE_TOKEN) {
  return new Request(`${ORIGIN}/api/billing/asaas/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token === null ? {} : { 'asaas-access-token': token }) },
    body: JSON.stringify(payload)
  });
}

function paymentEvent(id, event, extra = {}) {
  return {
    id, event, dateCreated: '2026-11-14 10:00:00',
    payment: { object: 'payment', id: 'pay_1', subscription: 'sub_2', customer: 'cus_1', dueDate: '2026-11-14', status: 'CONFIRMED', ...extra }
  };
}

function captureConsole(t) {
  const lines = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    t.mock.method(console, level, (...args) => { lines.push(args.map(String).join(' ')); });
  }
  return lines;
}

test('configuração: sandbox por padrão e produção só com ASAAS_ENV=production', () => {
  assert.deepEqual(resolveAsaasConfig({}), { configured: false, mode: 'sandbox', reason: 'missing_api_key' });
  const sandbox = resolveAsaasConfig({ ASAAS_API_KEY: FAKE_KEY });
  assert.equal(sandbox.configured, true);
  assert.equal(sandbox.apiBase, ASAAS_SANDBOX_API_BASE);
  assert.equal(resolveAsaasConfig({ ASAAS_API_KEY: FAKE_KEY, ASAAS_API_BASE: ASAAS_PRODUCTION_API_BASE }).reason, 'api_base_not_allowed');
  assert.equal(resolveAsaasConfig({ ASAAS_API_KEY: FAKE_KEY, ASAAS_ENV: 'prod' }).mode, 'sandbox');
  assert.equal(resolveAsaasConfig({ ASAAS_API_KEY: FAKE_PROD_KEY }).reason, 'production_key_in_sandbox');
  assert.equal(resolveAsaasConfig({ ASAAS_API_KEY: FAKE_KEY, ASAAS_API_BASE: 'https://evil.example/v3' }).reason, 'api_base_not_allowed');
  assert.equal(resolveAsaasConfig({ ASAAS_API_KEY: FAKE_KEY, ASAAS_API_BASE: 'http://api-sandbox.asaas.com/v3' }).reason, 'api_base_not_allowed');
  const production = resolveAsaasConfig({ ASAAS_ENV: 'production', ASAAS_API_KEY: FAKE_PROD_KEY });
  assert.equal(production.apiBase, ASAAS_PRODUCTION_API_BASE);
  assert.equal(resolveAsaasConfig({ ASAAS_ENV: 'production', ASAAS_API_KEY: FAKE_PROD_KEY, ASAAS_API_BASE: ASAAS_SANDBOX_API_BASE }).reason, 'api_base_not_allowed');
  assert.equal(resolveAsaasConfig({ ASAAS_ENV: 'production', ASAAS_API_KEY: FAKE_KEY }).reason, 'sandbox_key_in_production');
  for (const result of [sandbox, resolveAsaasConfig({ ASAAS_API_KEY: FAKE_PROD_KEY })]) {
    assert.ok(!JSON.stringify({ ...result, apiKey: undefined }).includes('aact'));
  }
});

test('wrangler.jsonc aponta o Asaas para o sandbox e não guarda segredos', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.vars.ASAAS_ENV, 'sandbox');
  assert.equal(config.vars.ASAAS_API_BASE, ASAAS_SANDBOX_API_BASE);
  assert.equal(config.vars.ASAAS_API_KEY, undefined);
  assert.equal(config.vars.ASAAS_WEBHOOK_TOKEN, undefined);
});

test('nova tentativa: 503 gera no máximo 3 chamadas; 400 e falha de rede, uma só', async () => {
  let calls = 0;
  const sleeps = [];
  const sleep = async (ms) => { sleeps.push(ms); };
  const res = await fetchWithRetry(async () => { calls += 1; return response(503, {}); }, 'https://api-sandbox.asaas.com/v3/x', {}, { sleep });
  assert.equal(res.status, 503);
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [300, 600]);

  calls = 0;
  assert.equal((await fetchWithRetry(async () => { calls += 1; return response(400, {}); }, 'u', {}, { sleep })).status, 400);
  assert.equal(calls, 1);

  calls = 0;
  const statuses = [429, 200];
  assert.equal((await fetchWithRetry(async () => response(statuses[calls++], {}), 'u', {}, { sleep })).status, 200);
  assert.equal(calls, 2);

  calls = 0;
  sleeps.length = 0;
  const limited = await fetchWithRetry(async () => { calls += 1; return response(429, {}, { 'ratelimit-reset': '30' }); }, 'u', {}, { sleep });
  assert.equal(limited.status, 429);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);

  calls = 0;
  await assert.rejects(
    fetchWithRetry(async () => { calls += 1; throw new TypeError('network down'); }, 'u', {}, { sleep }),
    (error) => error instanceof BillingProviderError && error.kind === 'network'
  );
  assert.equal(calls, 1);

  await assert.rejects(
    fetchWithRetry((_u, init) => new Promise((_r, reject) => {
      init.signal.addEventListener('abort', () => reject(init.signal.reason));
    }), 'u', {}, { sleep, timeoutMs: 5 }),
    (error) => error.kind === 'timeout'
  );
});

test('provedor Asaas: chave só no cabeçalho, assinatura mensal e página de pagamento', async () => {
  const asaas = fakeAsaas();
  const provider = assertBillingProvider(createAsaasProvider(resolveAsaasConfig(ENV), { fetch: asaas.fetch, sleep: async () => {} }));
  const { customerId } = await provider.createCustomer({ name: 'Pessoa de Teste', cpfCnpj: '52998224725', email: 'cliente@example.com', reference: TENANT });
  const result = await provider.createSubscription({
    customerId, plan: { code: 'essencial', name: 'Essencial', monthlyPriceCents: 3900 }, reference: TENANT,
    now: new Date('2026-11-15T01:00:00Z')
  });
  assert.equal(result.checkoutUrl, `https://sandbox.asaas.com/i/${result.subscriptionId}`);
  const [customer, subscription] = asaas.calls;
  assert.equal(customer.url, `${ASAAS_SANDBOX_API_BASE}/customers`);
  assert.equal(customer.headers.access_token, FAKE_KEY);
  assert.equal(customer.body.externalReference, TENANT);
  assert.deepEqual(
    { billingType: subscription.body.billingType, cycle: subscription.body.cycle, value: subscription.body.value, nextDueDate: subscription.body.nextDueDate },
    { billingType: 'UNDEFINED', cycle: 'MONTHLY', value: 39, nextDueDate: '2026-11-14' }
  );
  for (const call of asaas.calls) assert.ok(!call.url.includes(FAKE_KEY));

  assert.deepEqual(await provider.getSubscription('sub_9'), { subscriptionId: 'sub_9', status: 'ACTIVE', nextDueDate: '2026-12-14' });
  assert.deepEqual(await provider.cancelSubscription('sub_9'), { canceled: true });
  await assert.rejects(provider.cancelSubscription('../customers'), (error) => error.kind === 'invalid_id');

  const unconfigured = createAsaasProvider(resolveAsaasConfig({}), { fetch: asaas.fetch });
  await assert.rejects(unconfigured.createCustomer({}), (error) => error.kind === 'not_configured');

  const failing = fakeAsaas({ overrides: { 'POST /customers': () => response(400, { errors: [{ code: 'invalid_cpfCnpj', description: 'CPF inválido' }] }) } });
  const rejecting = createAsaasProvider(resolveAsaasConfig(ENV), { fetch: failing.fetch, sleep: async () => {} });
  await assert.rejects(rejecting.createCustomer({}), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.providerCode, 'invalid_cpfCnpj');
    assert.ok(!JSON.stringify(error).includes(FAKE_KEY) && !error.message.includes(FAKE_KEY));
    return true;
  });
  assert.equal(failing.calls.length, 1);
});

test('eventos do Asaas viram mudanças de assinatura', () => {
  const confirmed = parseAsaasWebhookEvent(paymentEvent('evt_1', 'PAYMENT_CONFIRMED', { dueDate: '2026-01-31' }));
  assert.deepEqual(confirmed, {
    id: 'evt_1', providerType: 'PAYMENT_CONFIRMED', kind: 'payment_confirmed',
    subscriptionId: 'sub_2', paymentId: 'pay_1', periodEnd: '2026-02-28T03:00:00.000Z'
  });
  assert.deepEqual(subscriptionChangeFor(confirmed), { status: 'active', periodEnd: '2026-02-28T03:00:00.000Z', periodMode: 'extend' });
  const now = new Date('2026-11-20T12:00:00Z');
  assert.deepEqual(subscriptionChangeFor(parseAsaasWebhookEvent(paymentEvent('evt_2', 'PAYMENT_REFUNDED')), now),
    { status: 'past_due', periodEnd: now.toISOString(), periodMode: 'clamp' });
  assert.equal(subscriptionChangeFor(parseAsaasWebhookEvent(paymentEvent('evt_3', 'PAYMENT_OVERDUE'))).status, 'past_due');
  assert.equal(subscriptionChangeFor(parseAsaasWebhookEvent(paymentEvent('evt_4', 'PAYMENT_CREATED'))), null);
  const canceled = parseAsaasWebhookEvent({ id: 'evt_5', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_2' } });
  assert.equal(canceled.subscriptionId, 'sub_2');
  assert.equal(subscriptionChangeFor(canceled).status, 'canceled');
  assert.equal(parseAsaasWebhookEvent({ event: 'PAYMENT_CONFIRMED' }), null);
  assert.equal(parseAsaasWebhookEvent({ id: 'evt 6; drop', event: 'PAYMENT_CONFIRMED' }), null);
});

test('dados de cobrança: CPF, CNPJ (inclusive alfanumérico) e e-mail', async () => {
  assert.equal(normalizeTaxId(TEST_CPF), '52998224725');
  assert.equal(normalizeTaxId('52998224724'), null);
  assert.equal(normalizeTaxId('111.111.111-11'), null);
  assert.equal(normalizeTaxId('11.222.333/0001-81'), '11222333000181');
  assert.equal(normalizeTaxId('12.ABC.345/01DE-35'), '12ABC34501DE35');
  assert.equal(normalizeTaxId('12.ABC.345/01DE-36'), null);
  assert.deepEqual(validateBillingDetails({ name: ' x', cpfCnpj: '1', email: 'nada' }), { ok: false, fields: ['name', 'cpfCnpj', 'email'] });
  assert.equal(await timingSafeEqualText(FAKE_TOKEN, FAKE_TOKEN), true);
  assert.equal(await timingSafeEqualText(FAKE_TOKEN.slice(0, -1), FAKE_TOKEN), false);
  assert.equal(await timingSafeEqualText('', ''), false);
});

test('webhook sem token ou com token errado responde 401 e não altera nada', async () => {
  const { handler, store } = api({ store: memoryBillingStore({ subscription: { provider: 'asaas', provider_subscription_id: 'sub_2', status: 'pending' } }) });
  for (const token of [null, '', 'token-errado', FAKE_TOKEN.slice(0, -1), `${FAKE_TOKEN}x`]) {
    const res = await handler(webhook(paymentEvent('evt_1', 'PAYMENT_CONFIRMED'), token), ENV);
    assert.equal(res.status, 401);
    assert.equal((await res.json()).error.code, 'INVALID_WEBHOOK_TOKEN');
  }
  const unconfigured = await handler(webhook(paymentEvent('evt_1', 'PAYMENT_CONFIRMED'), ''), {});
  assert.equal(unconfigured.status, 401);
  assert.equal(store.state.updates, 0);
  assert.equal(store.state.subscription.status, 'pending');
});

test('webhook: confirmação ativa com período do evento, repetido aplica uma vez, estorno deixa past_due', async (t) => {
  const logs = captureConsole(t);
  const store = memoryBillingStore({ subscription: { provider: 'asaas', provider_subscription_id: 'sub_2', status: 'pending', current_period_end: null } });
  const { handler } = api({ store });

  const first = await handler(webhook(paymentEvent('evt_ok', 'PAYMENT_CONFIRMED')), ENV);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true, outcome: 'applied' });
  assert.equal(store.state.subscription.status, 'active');
  assert.equal(store.state.subscription.current_period_end, '2026-12-14T03:00:00.000Z');

  const again = await handler(webhook(paymentEvent('evt_ok', 'PAYMENT_CONFIRMED')), ENV);
  assert.deepEqual(await again.json(), { received: true, outcome: 'duplicate' });
  assert.equal(store.state.updates, 1);

  const refund = await handler(webhook(paymentEvent('evt_refund', 'PAYMENT_REFUNDED')), ENV);
  assert.equal((await refund.json()).outcome, 'applied');
  assert.equal(store.state.subscription.status, 'past_due');

  const unknown = await handler(webhook(paymentEvent('evt_other', 'PAYMENT_CONFIRMED', { subscription: 'sub_de_outro' })), ENV);
  assert.equal((await unknown.json()).outcome, 'unmatched');

  const bad = await handler(new Request(`${ORIGIN}/api/billing/asaas/webhook`, {
    method: 'POST', headers: { 'asaas-access-token': FAKE_TOKEN }, body: '{nada'
  }), ENV);
  assert.equal(bad.status, 400);

  const failingStore = { ...store, applyEvent: async () => { throw new Error('db down'); } };
  const retry = await api({ store: failingStore }).handler(webhook(paymentEvent('evt_x', 'PAYMENT_RECEIVED')), ENV);
  assert.equal(retry.status, 503);

  assert.equal((await handler(new Request(`${ORIGIN}/api/billing/asaas/webhook`), ENV)).status, 405);
  assert.ok(logs.every((line) => !line.includes(FAKE_TOKEN) && !line.includes(FAKE_KEY)));
});

test('checkout: dono do tenant recebe a página de pagamento do Asaas; dados pessoais não vão ao banco', async (t) => {
  const logs = captureConsole(t);
  const { handler, store, asaas } = api();
  const res = await handler(checkout({ tenantId: TENANT, planCode: 'profissional', billing: BILLING }), ENV);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.checkoutUrl, /^https:\/\/sandbox\.asaas\.com\/i\/sub_\d+$/);
  assert.deepEqual(body.subscription, { planCode: 'profissional', status: 'pending', provider: 'asaas' });
  assert.equal(asaas.calls[0].body.cpfCnpj, '52998224725');
  assert.equal(asaas.calls[1].body.value, 89);
  const saved = JSON.stringify(store.state.subscription);
  for (const personal of ['52998224725', 'cliente@example.com', 'Pessoa de Teste']) assert.ok(!saved.includes(personal));
  assert.equal(store.state.subscription.provider_customer_id, 'cus_1');
  assert.ok(!JSON.stringify(body).includes(FAKE_KEY));
  assert.ok(logs.every((line) => !line.includes(FAKE_KEY) && !line.includes('52998224725')));
});

test('checkout recusa quem não é dono (403), plano inexistente ou gratuito (400) e assinatura em vigor (409)', async () => {
  const { handler, asaas } = api();
  const forbidden = await handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }, { token: 'sessao-outra' }), ENV);
  assert.equal(forbidden.status, 403);
  assert.equal((await forbidden.json()).error.code, 'FORBIDDEN_TENANT_OWNER');
  const otherTenant = await handler(checkout({ tenantId: '81000000-0000-0000-0000-0000000000ff', planCode: 'essencial', billing: BILLING }), ENV);
  assert.equal(otherTenant.status, 403);
  for (const planCode of ['ouro', 'free', undefined]) {
    const res = await handler(checkout({ tenantId: TENANT, planCode, billing: BILLING }), ENV);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_PLAN');
  }
  const invalid = await handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: { ...BILLING, cpfCnpj: '123' } }), ENV);
  assert.equal(invalid.status, 422);
  assert.deepEqual((await invalid.json()).error.fields, ['cpfCnpj']);
  assert.equal((await handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }, { token: null }), ENV)).status, 401);
  assert.equal((await handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }, { origin: 'https://evil.example' }), ENV)).status, 403);
  assert.equal(asaas.calls.length, 0);

  const active = api({ store: memoryBillingStore({ subscription: { provider: 'asaas', provider_subscription_id: 'sub_1', status: 'active' } }) });
  const conflict = await active.handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }), ENV);
  assert.equal(conflict.status, 409);
  assert.equal(active.asaas.calls.length, 0);
});

test('checkout sem ASAAS_API_KEY responde "cobrança não configurada" e o resto do Worker segue', async () => {
  const { handler, asaas } = api();
  const res = await handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }), {});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, 'BILLING_NOT_CONFIGURED');
  const prodKey = await handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }), { ASAAS_API_KEY: FAKE_PROD_KEY });
  assert.equal(prodKey.status, 503);
  assert.equal(asaas.calls.length, 0);
  const noStore = createApiHandler({ authVerifier: () => ({ id: OWNER }), fetch: asaas.fetch });
  assert.equal((await noStore(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }), ENV)).status, 503);
  const other = await handler(new Request(`${ORIGIN}/api/auth/config`), {});
  assert.notEqual(other.status, 500);
});

test('checkout: 503 do Asaas tenta 3 vezes e responde 502; 400 do Asaas não repete e responde 422', async () => {
  const unavailable = fakeAsaas({ overrides: { 'POST /customers': () => response(503, {}) } });
  const run = api({ asaas: unavailable });
  const res = await run.handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }), ENV);
  assert.equal(res.status, 502);
  assert.equal(unavailable.calls.length, 3);
  assert.deepEqual(run.sleeps, [300, 600]);
  assert.equal(run.store.state.subscription, null);

  const rejected = fakeAsaas({ overrides: { 'POST /customers': () => response(400, { errors: [{ code: 'invalid_email' }] }) } });
  const second = api({ asaas: rejected });
  const body = await (await second.handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }), ENV)).json();
  assert.equal(body.error.code, 'BILLING_DATA_REJECTED');
  assert.equal(body.error.providerCode, 'invalid_email');
  assert.equal(rejected.calls.length, 1);
});

test('checkout cancela no Asaas a assinatura que o banco não registrou e a pendente anterior', async () => {
  const asaas = fakeAsaas();
  const failing = { ...memoryBillingStore(), attachCheckout: async () => { throw new Error('db down'); } };
  const res = await api({ store: failing, asaas }).handler(checkout({ tenantId: TENANT, planCode: 'essencial', billing: BILLING }), ENV);
  assert.equal(res.status, 503);
  assert.equal(asaas.calls.at(-1).method, 'DELETE');

  const pending = fakeAsaas();
  const store = memoryBillingStore({ subscription: { provider: 'asaas', provider_subscription_id: 'sub_antiga', status: 'pending' } });
  const ok = await api({ store, asaas: pending }).handler(checkout({ tenantId: TENANT, planCode: 'equipe', billing: BILLING }), ENV);
  assert.equal(ok.status, 201);
  assert.ok(pending.calls.some((call) => call.method === 'DELETE' && call.pathname.endsWith('/subscriptions/sub_antiga')));
});

test('store do Supabase: service_role só em cabeçalho e posse lida com o token da pessoa', async () => {
  const calls = [];
  const fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/rest/v1/tenants')) return response(200, [{ owner_user_id: OWNER }]);
    if (String(url).includes('billing_attach_checkout')) return response(400, { message: 'SUBSCRIPTION_ALREADY_ACTIVE' });
    return response(200, 'applied');
  };
  const store = createSupabaseBillingStore({ supabaseUrl: 'https://exemplo.supabase.co', anonKey: 'anon-ficticia', serviceRoleKey: FAKE_SERVICE_KEY, fetch });
  assert.equal(await store.getTenantOwner(TENANT, { token: 'jwt-ficticio' }), OWNER);
  assert.equal(calls[0].init.headers.authorization, 'Bearer jwt-ficticio');
  const event = parseAsaasWebhookEvent(paymentEvent('evt_1', 'PAYMENT_CONFIRMED'));
  assert.equal(await store.applyEvent({ provider: 'asaas', event, change: subscriptionChangeFor(event) }), 'applied');
  assert.deepEqual(JSON.parse(calls[1].init.body), {
    target_provider: 'asaas', target_event_id: 'evt_1', target_event_type: 'PAYMENT_CONFIRMED',
    target_subscription: 'sub_2', target_payment: 'pay_1', next_status: 'active',
    next_period_end: '2026-12-14T03:00:00.000Z', period_mode: 'extend'
  });
  await assert.rejects(store.attachCheckout({ tenantId: TENANT }), (error) => error.code === 'SUBSCRIPTION_ALREADY_ACTIVE');
  for (const call of calls) assert.ok(!call.url.includes(FAKE_SERVICE_KEY));
});

test('nenhum arquivo versionado de código ou dist/ contém chave do Asaas', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const files = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = resolve(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else if (/\.(m?js|json|jsonc|html|sql|toml)$/.test(entry.name)) files.push(path);
    }
  }
  for (const dir of ['src', 'workers', 'web', 'dist', 'supabase']) await walk(resolve(root, dir));
  files.push(resolve(root, 'wrangler.jsonc'));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.ok(!/\$aact_(?:prod|hmlg)_[A-Za-z0-9]/.test(text), `${file} parece conter uma chave do Asaas`);
  }
});
