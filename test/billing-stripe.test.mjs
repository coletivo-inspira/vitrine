import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from '../workers/api.mjs';
import {
  STRIPE_API_BASE,
  STRIPE_API_VERSION,
  createStripeProvider,
  encodeStripeForm,
  parseStripeWebhookEvent,
  resolveStripeConfig,
  signStripePayload,
  verifyStripeSignature
} from '../src/billing/stripe.mjs';
import { assertBillingProvider, subscriptionChangeFor, validateBillingDetails } from '../src/billing/provider.mjs';

// Valores fictícios óbvios: nada aqui é chave ou segredo real.
const FAKE_KEY = 'sk_test_CHAVE_FICTICIA_DE_TESTE_000';
const FAKE_LIVE_KEY = 'sk_live_CHAVE_FICTICIA_DE_TESTE_000';
const FAKE_SECRET = 'whsec_segredo_ficticio_de_teste';
const FAKE_ASAAS_KEY = '$aact_hmlg_CHAVE_FICTICIA_DE_TESTE_000';
const ORIGIN = 'https://vitrine.inspira.dev.br';
const OWNER = '80000000-0000-0000-0000-00000000000a';
const OTHER = '80000000-0000-0000-0000-00000000000b';
const TENANT = '81000000-0000-0000-0000-00000000000a';
const REF = 'vtr_0123456789abcdef0123456789abcdef';
const NOW = new Date('2026-11-14T12:00:00Z');
const NOW_S = Math.floor(NOW.getTime() / 1000);
const ENV = { STRIPE_SECRET_KEY: FAKE_KEY, STRIPE_WEBHOOK_SECRET: FAKE_SECRET };
const BILLING = { name: 'Customer Abroad', email: 'cliente@example.com' };

function response(status, body) {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' }
  });
}

// Simula a API do Stripe (e o Asaas, para os testes de troca de meio).
function fakeStripe({ overrides = {}, subscriptions = [], sessions = [] } = {}) {
  const calls = [];
  let seq = 0;
  const fetch = async (url, init = {}) => {
    const parsed = new URL(url);
    const method = init.method ?? 'GET';
    const body = typeof init.body === 'string' ? Object.fromEntries(new URLSearchParams(init.body)) : null;
    calls.push({ url: String(url), hostname: parsed.hostname, pathname: parsed.pathname, search: parsed.searchParams, method, headers: init.headers ?? {}, body });
    if (parsed.hostname.includes('asaas')) {
      if (parsed.pathname.endsWith('/customers')) return response(200, { id: 'cus_asaas1' });
      if (method === 'POST' && parsed.pathname.endsWith('/subscriptions')) return response(200, { id: 'sub_asaas1' });
      if (parsed.pathname.endsWith('/payments')) return response(200, { data: [{ invoiceUrl: 'https://sandbox.asaas.com/i/sub_asaas1' }] });
      return response(200, { deleted: true });
    }
    const key = `${method} ${parsed.pathname.replace(/^\/v1/, '')}`;
    if (overrides[key]) return overrides[key](calls.at(-1));
    if (key === 'POST /customers') return response(200, { id: `cus_test${++seq}` });
    if (key === 'POST /checkout/sessions') return response(200, { id: `cs_test_${++seq}`, url: `https://checkout.stripe.com/c/pay/cs_test_${seq}` });
    if (key === 'GET /checkout/sessions') return response(200, { data: sessions });
    if (/^POST \/checkout\/sessions\/[^/]+\/expire$/.test(key)) return response(200, { status: 'expired' });
    if (key === 'GET /subscriptions') return response(200, { data: subscriptions });
    if (/^DELETE \/subscriptions\//.test(key)) return response(200, { status: 'canceled' });
    if (key === 'POST /billing_portal/sessions') return response(200, { url: 'https://billing.stripe.com/p/session/test_1' });
    return response(404, { error: { type: 'invalid_request_error', code: 'resource_missing' } });
  };
  return { fetch, calls };
}

function memoryBillingStore({ owner = OWNER, subscription = null } = {}) {
  const events = new Set();
  const state = { subscription, updates: 0 };
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
    async cancelByOwner() {
      state.subscription = { ...state.subscription, status: 'canceled' };
      return state.subscription;
    },
    async applyEvent({ provider, event, change }) {
      const key = `${provider}:${event.id}`;
      if (events.has(key)) return 'duplicate';
      events.add(key);
      const sub = state.subscription;
      if (!sub || sub.provider !== provider || sub.provider_subscription_id !== event.subscriptionId) return 'unmatched';
      if (!change || sub.status === 'canceled' || (change.status === 'past_due' && sub.status === 'pending')) return 'ignored';
      sub.status = change.status;
      if (change.periodMode === 'extend') {
        sub.current_period_end = [sub.current_period_end, change.periodEnd].filter(Boolean).sort().at(-1);
      }
      state.updates += 1;
      return 'applied';
    }
  };
}

function api({ store = memoryBillingStore(), stripe = fakeStripe() } = {}) {
  const handler = createApiHandler({
    billingStore: store,
    fetch: stripe.fetch,
    billingSleep: async () => {},
    now: () => NOW,
    authVerifier: (token) => ({ 'sessao-dono': { id: OWNER }, 'sessao-outra': { id: OTHER } })[token] ?? null
  });
  return { handler, store, stripe };
}

function post(path, body, { token = 'sessao-dono', origin = ORIGIN } = {}) {
  return new Request(`${ORIGIN}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin ? { origin } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });
}

function invoiceEvent(id, type, { ref = REF, livemode = false, legacy = false, end = NOW_S + 30 * 86400 } = {}) {
  const details = { metadata: { vitrine_subscription: ref, tenant_id: TENANT } };
  return {
    id, object: 'event', type, livemode, created: NOW_S,
    data: {
      object: {
        object: 'invoice', id: 'in_test1', customer: 'cus_test1',
        period_end: NOW_S,
        ...(legacy ? { subscription: 'sub_test1', subscription_details: details } : { parent: { type: 'subscription_details', subscription_details: { subscription: 'sub_test1', ...details } } }),
        lines: { data: [{ period: { start: NOW_S, end } }] }
      }
    }
  };
}

function subscriptionDeleted(id, { ref = REF } = {}) {
  return {
    id, object: 'event', type: 'customer.subscription.deleted', livemode: false,
    data: { object: { object: 'subscription', id: 'sub_test1', status: 'canceled', metadata: { vitrine_subscription: ref } } }
  };
}

async function signedWebhook(payload, { secret = FAKE_SECRET, timestamp = NOW_S, header } = {}) {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const signature = header !== undefined ? header : `t=${timestamp},v1=${await signStripePayload(secret, timestamp, text)}`;
  return new Request(`${ORIGIN}/api/billing/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(signature === null ? {} : { 'stripe-signature': signature }) },
    body: text
  });
}

test('configuração: modo de teste por padrão; live só com STRIPE_ENV=live e chave live', () => {
  assert.deepEqual(resolveStripeConfig({}), { configured: false, mode: 'test', reason: 'missing_api_key' });
  const testMode = resolveStripeConfig({ STRIPE_SECRET_KEY: FAKE_KEY });
  assert.deepEqual({ ...testMode, apiKey: undefined }, { configured: true, mode: 'test', apiBase: STRIPE_API_BASE, apiKey: undefined });
  assert.equal(resolveStripeConfig({ STRIPE_SECRET_KEY: 'rk_test_CHAVE_RESTRITA_FICTICIA' }).configured, true);
  assert.equal(resolveStripeConfig({ STRIPE_SECRET_KEY: FAKE_LIVE_KEY }).reason, 'live_key_in_test');
  assert.equal(resolveStripeConfig({ STRIPE_SECRET_KEY: FAKE_LIVE_KEY, STRIPE_ENV: 'production' }).reason, 'live_key_in_test');
  assert.equal(resolveStripeConfig({ STRIPE_SECRET_KEY: 'pk_test_PUBLICA_FICTICIA' }).reason, 'invalid_api_key');
  assert.equal(resolveStripeConfig({ STRIPE_ENV: 'live' }).reason, 'missing_api_key');
  assert.equal(resolveStripeConfig({ STRIPE_ENV: 'live', STRIPE_SECRET_KEY: FAKE_KEY }).reason, 'test_key_in_live');
  const live = resolveStripeConfig({ STRIPE_ENV: 'live', STRIPE_SECRET_KEY: FAKE_LIVE_KEY });
  assert.equal(live.configured, true);
  assert.equal(live.mode, 'live');
  for (const env of [{ STRIPE_SECRET_KEY: FAKE_LIVE_KEY }, { STRIPE_ENV: 'live', STRIPE_SECRET_KEY: FAKE_KEY }]) {
    assert.ok(!JSON.stringify(resolveStripeConfig(env)).includes('CHAVE'));
  }
});

test('wrangler.jsonc deixa o Stripe em modo de teste e não guarda segredos', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const config = JSON.parse(await readFile(resolve(root, 'wrangler.jsonc'), 'utf8'));
  assert.equal(config.vars.STRIPE_ENV, 'test');
  assert.equal(config.vars.STRIPE_SECRET_KEY, undefined);
  assert.equal(config.vars.STRIPE_WEBHOOK_SECRET, undefined);
});

test('Stripe-Signature: HMAC-SHA256 do corpo bruto, tolerância de 5 minutos e várias v1', async () => {
  const body = JSON.stringify(invoiceEvent('evt_test1', 'invoice.paid'));
  const valid = await signStripePayload(FAKE_SECRET, NOW_S, body);
  const at = { now: NOW.getTime() };
  assert.equal(await verifyStripeSignature(`t=${NOW_S},v1=${valid}`, body, FAKE_SECRET, at), true);
  assert.equal(await verifyStripeSignature(`t=${NOW_S},v1=${'0'.repeat(64)},v1=${valid},v0=abc`, body, FAKE_SECRET, at), true);
  assert.equal(await verifyStripeSignature(`t=${NOW_S},v1=${valid}`, `${body} `, FAKE_SECRET, at), false);
  assert.equal(await verifyStripeSignature(`t=${NOW_S},v1=${valid}`, body, `${FAKE_SECRET}x`, at), false);
  assert.equal(await verifyStripeSignature(`t=${NOW_S},v1=${valid}`, body, '', at), false);
  assert.equal(await verifyStripeSignature(`t=${NOW_S + 1},v1=${valid}`, body, FAKE_SECRET, at), false);
  const old = NOW_S - 301;
  assert.equal(await verifyStripeSignature(`t=${old},v1=${await signStripePayload(FAKE_SECRET, old, body)}`, body, FAKE_SECRET, at), false);
  const future = NOW_S + 301;
  assert.equal(await verifyStripeSignature(`t=${future},v1=${await signStripePayload(FAKE_SECRET, future, body)}`, body, FAKE_SECRET, at), false);
  const edge = NOW_S - 300;
  assert.equal(await verifyStripeSignature(`t=${edge},v1=${await signStripePayload(FAKE_SECRET, edge, body)}`, body, FAKE_SECRET, at), true);
  for (const header of [null, '', `v1=${valid}`, `t=${NOW_S}`, `t=abc,v1=${valid}`, `t=${NOW_S},v1=${valid.toUpperCase()}`]) {
    assert.equal(await verifyStripeSignature(header, body, FAKE_SECRET, at), false);
  }
});

test('provedor Stripe: chave só no cabeçalho, Checkout em modo assinatura e portal do cliente', async () => {
  const stripe = fakeStripe();
  const provider = assertBillingProvider(createStripeProvider(resolveStripeConfig(ENV), { fetch: stripe.fetch, sleep: async () => {} }));
  const { customerId } = await provider.createCustomer({ name: 'Customer Abroad', email: 'cliente@example.com', cpfCnpj: '52998224725', reference: TENANT });
  assert.equal(customerId, 'cus_test1');
  const result = await provider.createSubscription({
    customerId, plan: { code: 'essencial', name: 'Essencial', monthlyPriceCents: 3900 }, reference: TENANT,
    successUrl: 'https://painel.inspira.dev.br/?cobranca=concluida#inicio', cancelUrl: 'https://painel.inspira.dev.br/?cobranca=cancelada#inicio'
  });
  assert.match(result.subscriptionId, /^vtr_[a-f0-9]{32}$/);
  assert.equal(result.checkoutUrl, 'https://checkout.stripe.com/c/pay/cs_test_2');
  const [customer, session] = stripe.calls;
  assert.equal(customer.url, `${STRIPE_API_BASE}/customers`);
  assert.equal(customer.headers.authorization, `Bearer ${FAKE_KEY}`);
  assert.equal(customer.headers['stripe-version'], STRIPE_API_VERSION);
  assert.match(customer.headers['idempotency-key'], /^vtr-[a-f0-9]{32}$/);
  assert.equal(customer.body['metadata[tenant_id]'], TENANT);
  assert.ok(!Object.values(customer.body).includes('52998224725'), 'CPF não vai ao Stripe');
  assert.deepEqual({
    mode: session.body.mode,
    customer: session.body.customer,
    method: session.body['payment_method_types[0]'],
    currency: session.body['line_items[0][price_data][currency]'],
    amount: session.body['line_items[0][price_data][unit_amount]'],
    interval: session.body['line_items[0][price_data][recurring][interval]'],
    ref: session.body['subscription_data[metadata][vitrine_subscription]'],
    sessionRef: session.body['metadata[vitrine_subscription]'],
    client: session.body.client_reference_id
  }, {
    mode: 'subscription', customer: 'cus_test1', method: 'card', currency: 'brl', amount: '3900',
    interval: 'month', ref: result.subscriptionId, sessionRef: result.subscriptionId, client: TENANT
  });
  assert.notEqual(customer.headers['idempotency-key'], session.headers['idempotency-key']);
  for (const call of stripe.calls) assert.ok(!call.url.includes(FAKE_KEY));

  assert.deepEqual(await provider.createPortalSession({ customerId, returnUrl: 'https://painel.inspira.dev.br/#inicio' }),
    { portalUrl: 'https://billing.stripe.com/p/session/test_1' });
  await assert.rejects(provider.cancelSubscription('../customers', { customerId }), (error) => error.kind === 'invalid_id');
  await assert.rejects(provider.cancelSubscription(REF, {}), (error) => error.kind === 'invalid_id');

  const unconfigured = createStripeProvider(resolveStripeConfig({}), { fetch: stripe.fetch });
  await assert.rejects(unconfigured.createCustomer({}), (error) => error.kind === 'not_configured');

  const hostile = fakeStripe({ overrides: { 'POST /checkout/sessions': () => response(200, { id: 'cs_test_x', url: 'https://evil.example/pay' }) } });
  const badUrl = createStripeProvider(resolveStripeConfig(ENV), { fetch: hostile.fetch });
  await assert.rejects(badUrl.createSubscription({ customerId: 'cus_test1', plan: { name: 'Essencial', monthlyPriceCents: 3900 } }),
    (error) => error.kind === 'missing_checkout_url');
  assert.ok(hostile.calls.some((call) => call.pathname === '/v1/checkout/sessions/cs_test_x/expire'));

  const rejecting = fakeStripe({ overrides: { 'POST /customers': () => response(400, { error: { type: 'invalid_request_error', code: 'email_invalid', message: 'x' } }) } });
  await assert.rejects(createStripeProvider(resolveStripeConfig(ENV), { fetch: rejecting.fetch }).createCustomer({}), (error) => {
    assert.equal(error.status, 400);
    assert.equal(error.providerCode, 'email_invalid');
    assert.ok(!JSON.stringify(error).includes(FAKE_KEY) && !error.message.includes(FAKE_KEY));
    return true;
  });
});

test('cancelamento no Stripe expira o Checkout aberto e cancela só a assinatura da referência', async () => {
  const stripe = fakeStripe({
    sessions: [
      { id: 'cs_test_aberta', metadata: { vitrine_subscription: REF } },
      { id: 'cs_test_outra', metadata: { vitrine_subscription: 'vtr_ffffffffffffffffffffffffffffffff' } }
    ],
    subscriptions: [
      { id: 'sub_test1', status: 'active', metadata: { vitrine_subscription: REF }, items: { data: [{ current_period_end: NOW_S + 86400 }] } },
      { id: 'sub_test_velha', status: 'canceled', metadata: { vitrine_subscription: REF } },
      { id: 'sub_test_outra', status: 'active', metadata: {} }
    ]
  });
  const provider = createStripeProvider(resolveStripeConfig(ENV), { fetch: stripe.fetch });
  assert.deepEqual(await provider.getSubscription(REF, { customerId: 'cus_test1' }),
    { subscriptionId: REF, status: 'active', nextDueDate: '2026-11-15' });
  stripe.calls.length = 0;
  assert.deepEqual(await provider.cancelSubscription(REF, { customerId: 'cus_test1' }), { canceled: true });
  const writes = stripe.calls.filter((call) => call.method !== 'GET').map((call) => `${call.method} ${call.pathname}`);
  assert.deepEqual(writes, ['POST /v1/checkout/sessions/cs_test_aberta/expire', 'DELETE /v1/subscriptions/sub_test1']);
  assert.equal(stripe.calls[0].search.get('customer'), 'cus_test1');
});

test('eventos do Stripe viram as mesmas mudanças de assinatura do Asaas', () => {
  const end = Math.floor(Date.parse('2026-12-14T12:00:00Z') / 1000);
  const paid = parseStripeWebhookEvent(invoiceEvent('evt_test1', 'invoice.paid', { end }));
  assert.deepEqual(paid, {
    id: 'evt_test1', providerType: 'invoice.paid', kind: 'payment_received', subscriptionId: REF,
    paymentId: 'in_test1', periodEnd: '2026-12-14T12:00:00.000Z', livemode: false
  });
  assert.deepEqual(subscriptionChangeFor(paid), { status: 'active', periodEnd: '2026-12-14T12:00:00.000Z', periodMode: 'extend' });
  assert.equal(parseStripeWebhookEvent(invoiceEvent('evt_test2', 'invoice.paid', { legacy: true })).subscriptionId, REF);
  const failed = parseStripeWebhookEvent(invoiceEvent('evt_test3', 'invoice.payment_failed'));
  assert.equal(failed.periodEnd, null);
  assert.equal(subscriptionChangeFor(failed).status, 'past_due');
  const deleted = parseStripeWebhookEvent(subscriptionDeleted('evt_test4'));
  assert.equal(deleted.subscriptionId, REF);
  assert.equal(subscriptionChangeFor(deleted).status, 'canceled');
  const other = parseStripeWebhookEvent({ ...invoiceEvent('evt_test5', 'invoice.created') });
  assert.equal(other.kind, 'other');
  assert.equal(other.subscriptionId, null);
  assert.equal(subscriptionChangeFor(other), null);
  assert.equal(parseStripeWebhookEvent(invoiceEvent('evt_test6', 'invoice.paid', { ref: 'sub_qualquer' })).subscriptionId, null);
  assert.equal(parseStripeWebhookEvent({ type: 'invoice.paid', object: 'event', livemode: false }), null);
  assert.equal(parseStripeWebhookEvent({ id: 'evt x; drop', type: 'invoice.paid', object: 'event', livemode: false }), null);
  assert.equal(parseStripeWebhookEvent({ id: 'evt_test7', type: 'invoice.paid', object: 'event' }), null);
});

test('webhook com assinatura inválida responde 400 e não altera nada', async () => {
  const { handler, store } = api({ store: memoryBillingStore({ subscription: { provider: 'stripe', provider_subscription_id: REF, status: 'pending' } }) });
  const payload = invoiceEvent('evt_test1', 'invoice.paid');
  const requests = [
    await signedWebhook(payload, { header: null }),
    await signedWebhook(payload, { header: '' }),
    await signedWebhook(payload, { secret: 'whsec_outro_segredo_ficticio' }),
    await signedWebhook(payload, { timestamp: NOW_S - 600 }),
    await signedWebhook(payload, { header: `t=${NOW_S},v1=${'a'.repeat(64)}` })
  ];
  for (const request of requests) {
    const res = await handler(request, ENV);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error.code, 'INVALID_WEBHOOK_SIGNATURE');
  }
  const tampered = await signedWebhook(payload);
  const altered = new Request(tampered.url, {
    method: 'POST', headers: tampered.headers, body: JSON.stringify({ ...payload, id: 'evt_test_trocado' })
  });
  assert.equal((await handler(altered, ENV)).status, 400);
  assert.equal((await handler(await signedWebhook(payload), { STRIPE_SECRET_KEY: FAKE_KEY })).status, 400, 'sem segredo do webhook');
  assert.equal(store.state.updates, 0);
  assert.equal(store.state.subscription.status, 'pending');
});

test('webhook: fatura paga ativa, evento repetido aplica uma vez, falha deixa past_due e exclusão cancela', async (t) => {
  const lines = [];
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) t.mock.method(console, level, (...args) => { lines.push(args.map(String).join(' ')); });
  const store = memoryBillingStore({ subscription: { provider: 'stripe', provider_subscription_id: REF, status: 'pending', current_period_end: null } });
  const { handler } = api({ store });
  const end = Math.floor(Date.parse('2026-12-14T12:00:00Z') / 1000);

  const first = await handler(await signedWebhook(invoiceEvent('evt_test_ok', 'invoice.paid', { end })), ENV);
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { received: true, outcome: 'applied' });
  assert.equal(store.state.subscription.status, 'active');
  assert.equal(store.state.subscription.current_period_end, '2026-12-14T12:00:00.000Z');

  const again = await handler(await signedWebhook(invoiceEvent('evt_test_ok', 'invoice.paid', { end })), ENV);
  assert.deepEqual(await again.json(), { received: true, outcome: 'duplicate' });
  assert.equal(store.state.updates, 1);

  const failed = await handler(await signedWebhook(invoiceEvent('evt_test_fail', 'invoice.payment_failed')), ENV);
  assert.equal((await failed.json()).outcome, 'applied');
  assert.equal(store.state.subscription.status, 'past_due');

  const unknown = await handler(await signedWebhook(invoiceEvent('evt_test_other', 'invoice.paid', { ref: 'vtr_ffffffffffffffffffffffffffffffff' })), ENV);
  assert.equal((await unknown.json()).outcome, 'unmatched');

  const deleted = await handler(await signedWebhook(subscriptionDeleted('evt_test_del')), ENV);
  assert.equal((await deleted.json()).outcome, 'applied');
  assert.equal(store.state.subscription.status, 'canceled');

  const live = await handler(await signedWebhook(invoiceEvent('evt_test_live', 'invoice.paid', { livemode: true })), ENV);
  assert.equal(live.status, 400);
  assert.equal((await live.json()).error.code, 'STRIPE_MODE_MISMATCH');
  const testInLive = await handler(await signedWebhook(invoiceEvent('evt_test_t', 'invoice.paid')),
    { STRIPE_ENV: 'live', STRIPE_SECRET_KEY: FAKE_LIVE_KEY, STRIPE_WEBHOOK_SECRET: FAKE_SECRET });
  assert.equal(testInLive.status, 400);

  assert.equal((await handler(await signedWebhook('{nada'), ENV)).status, 400);
  const failingStore = { ...store, applyEvent: async () => { throw new Error('db down'); } };
  assert.equal((await api({ store: failingStore }).handler(await signedWebhook(invoiceEvent('evt_test_x', 'invoice.paid')), ENV)).status, 503);
  const huge = await handler(await signedWebhook(JSON.stringify({ pad: 'x'.repeat(70 * 1024) })), ENV);
  assert.equal(huge.status, 413);
  assert.equal((await handler(new Request(`${ORIGIN}/api/billing/stripe/webhook`), ENV)).status, 405);
  assert.ok(lines.every((line) => !line.includes(FAKE_SECRET) && !line.includes(FAKE_KEY)));
});

test('checkout: Asaas continua padrão; provider stripe abre o Checkout do Stripe sem exigir CPF', async () => {
  const { handler, store, stripe } = api();
  const res = await handler(post('/api/billing/checkout', { tenantId: TENANT, planCode: 'profissional', provider: 'stripe', billing: BILLING }), ENV);
  assert.equal(res.status, 201);
  const body = await res.json();
  assert.match(body.checkoutUrl, /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_\d+$/);
  assert.deepEqual(body.subscription, { planCode: 'profissional', status: 'pending', provider: 'stripe' });
  assert.equal(store.state.subscription.provider, 'stripe');
  assert.equal(store.state.subscription.provider_customer_id, 'cus_test1');
  assert.match(store.state.subscription.provider_subscription_id, /^vtr_[a-f0-9]{32}$/);
  const session = stripe.calls.find((call) => call.pathname === '/v1/checkout/sessions');
  assert.equal(session.body['line_items[0][price_data][unit_amount]'], '8900');
  assert.equal(session.body.success_url, 'https://painel.inspira.dev.br/?cobranca=concluida#inicio');
  const saved = JSON.stringify(store.state.subscription);
  for (const personal of ['cliente@example.com', 'Customer Abroad']) assert.ok(!saved.includes(personal));
  assert.ok(!JSON.stringify(body).includes(FAKE_KEY));

  const invalid = await handler(post('/api/billing/checkout', { tenantId: TENANT, planCode: 'essencial', provider: 'paypal', billing: BILLING }), ENV);
  assert.equal(invalid.status, 400);
  assert.equal((await invalid.json()).error.code, 'INVALID_PROVIDER');

  const asaasDefault = api();
  const noCpf = await asaasDefault.handler(post('/api/billing/checkout', { tenantId: TENANT, planCode: 'essencial', billing: BILLING }), { ...ENV, ASAAS_API_KEY: FAKE_ASAAS_KEY });
  assert.equal(noCpf.status, 422, 'sem provider, vale o Asaas, que exige CPF ou CNPJ');
  assert.deepEqual((await noCpf.json()).error.fields, ['cpfCnpj']);
  assert.deepEqual(validateBillingDetails({ ...BILLING, cpfCnpj: '123' }, { requireTaxId: false }),
    { ok: true, value: { name: 'Customer Abroad', email: 'cliente@example.com' } });
});

test('checkout pelo Stripe sem chave responde "cobrança Stripe não configurada" e o Asaas segue', async () => {
  const { handler, stripe } = api();
  const env = { ASAAS_API_KEY: FAKE_ASAAS_KEY };
  for (const extra of [{}, { STRIPE_SECRET_KEY: FAKE_LIVE_KEY }, { STRIPE_ENV: 'live', STRIPE_SECRET_KEY: FAKE_KEY }]) {
    const res = await handler(post('/api/billing/checkout', { tenantId: TENANT, planCode: 'essencial', provider: 'stripe', billing: BILLING }), { ...env, ...extra });
    assert.equal(res.status, 503);
    const { error } = await res.json();
    assert.equal(error.code, 'BILLING_NOT_CONFIGURED');
    assert.equal(error.provider, 'stripe');
    assert.match(error.message, /Stripe/);
  }
  assert.equal(stripe.calls.length, 0);
  const asaas = await handler(post('/api/billing/checkout', {
    tenantId: TENANT, planCode: 'essencial', billing: { ...BILLING, cpfCnpj: '529.982.247-25' }
  }), env);
  assert.equal(asaas.status, 201);
  assert.equal((await asaas.json()).subscription.provider, 'asaas');
  assert.notEqual((await handler(new Request(`${ORIGIN}/api/auth/config`), {})).status, 500);
});

test('checkout pelo Stripe cancela no Asaas a assinatura pendente anterior', async () => {
  const stripe = fakeStripe();
  const store = memoryBillingStore({ subscription: { provider: 'asaas', provider_customer_id: 'cus_asaas', provider_subscription_id: 'sub_antiga', status: 'pending' } });
  const res = await api({ store, stripe }).handler(post('/api/billing/checkout', { tenantId: TENANT, planCode: 'equipe', provider: 'stripe', billing: BILLING }), { ...ENV, ASAAS_API_KEY: FAKE_ASAAS_KEY });
  assert.equal(res.status, 201);
  assert.ok(stripe.calls.some((call) => call.hostname.includes('asaas') && call.method === 'DELETE' && call.pathname.endsWith('/subscriptions/sub_antiga')));

  const failing = fakeStripe();
  const broken = { ...memoryBillingStore(), attachCheckout: async () => { throw new Error('db down'); } };
  const rollback = await api({ store: broken, stripe: failing }).handler(post('/api/billing/checkout', { tenantId: TENANT, planCode: 'essencial', provider: 'stripe', billing: BILLING }), ENV);
  assert.equal(rollback.status, 503);
  assert.ok(failing.calls.some((call) => call.method === 'GET' && call.pathname === '/v1/checkout/sessions'));
});

test('POST /api/billing/cancel cancela no Stripe a assinatura do Stripe', async () => {
  const stripe = fakeStripe({ subscriptions: [{ id: 'sub_test1', status: 'active', metadata: { vitrine_subscription: REF } }] });
  const periodEnd = '2026-12-14T12:00:00.000Z';
  const store = memoryBillingStore({ subscription: { plan_code: 'essencial', status: 'active', provider: 'stripe', provider_customer_id: 'cus_test1', provider_subscription_id: REF, current_period_end: periodEnd } });
  const { handler } = api({ store, stripe });
  const unconfigured = await handler(post('/api/billing/cancel', { tenantId: TENANT }), { ASAAS_API_KEY: FAKE_ASAAS_KEY });
  assert.equal(unconfigured.status, 503);
  assert.equal(stripe.calls.length, 0);
  const res = await handler(post('/api/billing/cancel', { tenantId: TENANT }), ENV);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { subscription: { planCode: 'essencial', status: 'canceled', accessUntil: periodEnd } });
  assert.ok(stripe.calls.some((call) => call.method === 'DELETE' && call.pathname === '/v1/subscriptions/sub_test1'));
});

test('portal do cliente do Stripe: só o dono e só para assinatura do Stripe', async () => {
  const subscription = { plan_code: 'essencial', status: 'active', provider: 'stripe', provider_customer_id: 'cus_test1', provider_subscription_id: REF };
  const { handler, store, stripe } = api({ store: memoryBillingStore({ subscription }) });
  const ok = await handler(post('/api/billing/stripe/portal', { tenantId: TENANT }), ENV);
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { portalUrl: 'https://billing.stripe.com/p/session/test_1' });
  const portal = stripe.calls.find((call) => call.pathname === '/v1/billing_portal/sessions');
  assert.equal(portal.body.customer, 'cus_test1');
  assert.equal(portal.body.return_url, 'https://painel.inspira.dev.br/#inicio');

  assert.equal((await handler(post('/api/billing/stripe/portal', { tenantId: TENANT }, { token: 'sessao-outra' }), ENV)).status, 403);
  assert.equal((await handler(post('/api/billing/stripe/portal', { tenantId: TENANT }, { token: null }), ENV)).status, 401);
  assert.equal((await handler(post('/api/billing/stripe/portal', { tenantId: TENANT }, { origin: 'https://evil.example' }), ENV)).status, 403);
  assert.equal((await handler(post('/api/billing/stripe/portal', { tenantId: TENANT }), {})).status, 503);
  store.state.subscription = { ...subscription, provider: 'asaas', provider_customer_id: 'cus_asaas' };
  const asaas = await handler(post('/api/billing/stripe/portal', { tenantId: TENANT }), ENV);
  assert.equal(asaas.status, 409);
  assert.equal((await asaas.json()).error.code, 'STRIPE_PORTAL_UNAVAILABLE');
});

test('formulário do Stripe aninha objetos e listas', () => {
  assert.equal(
    decodeURIComponent(encodeStripeForm({ a: 1, b: { c: 'x y' }, d: [{ e: 2 }], f: undefined })),
    'a=1&b[c]=x+y&d[0][e]=2'
  );
});

test('nenhum arquivo versionado de código ou dist/ contém chave ou segredo do Stripe', async () => {
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
      else if (/\.(m?js|json|jsonc|html|sql|toml|md)$/.test(entry.name)) files.push(path);
    }
  }
  for (const dir of ['src', 'workers', 'web', 'dist', 'supabase', 'docs']) await walk(resolve(root, dir));
  files.push(resolve(root, 'wrangler.jsonc'));
  for (const file of files) {
    const text = await readFile(file, 'utf8');
    assert.ok(!/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}/.test(text), `${file} parece conter uma chave do Stripe`);
    assert.ok(!/\bwhsec_[A-Za-z0-9]{16,}/.test(text), `${file} parece conter um segredo de webhook do Stripe`);
  }
});
