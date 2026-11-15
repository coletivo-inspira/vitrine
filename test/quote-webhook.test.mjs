import test from 'node:test';
import assert from 'node:assert/strict';
import { clearPublicationsCache, createApiHandler, createMemoryStore } from '../workers/api.mjs';
import {
  DELIVERY_MAX_ATTEMPTS,
  createLeadRateLimiter,
  decryptWebhookSecret,
  deliverQuoteWebhook,
  encryptWebhookSecret,
  presentQuoteWebhookStatus,
  readQuoteWebhookStatus,
  signQuoteWebhook,
  validateLeadPayload,
  validateQuoteWebhookUrl,
  verifyQuoteWebhookSignature
} from '../src/quote-webhook.mjs';
import { assertNoPrivateLeakage } from '../src/publication-engine.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';
import { FREE_ENTITLEMENTS, normalizeEntitlements } from '../src/entitlements.mjs';
import {
  buildQuoteLeadRequest,
  quoteLeadConsentText,
  quoteLeadMessageLines,
  sendQuoteLead
} from '../web/assets/quote-lead.mjs';
import { describeLastDelivery, renderQuoteWebhookPanel } from '../web/portal/quote-webhook.mjs';

const SITE_A = '20000000-0000-0000-0000-00000000000a';
const SITE_B = '20000000-0000-0000-0000-00000000000b';
const OWNER_A = '10000000-0000-0000-0000-000000000001';
const OWNER_B = '10000000-0000-0000-0000-000000000003';
const PANEL = 'https://painel.inspira.dev.br';
const PUBLIC = 'https://vitrine.inspira.dev.br';
const PRO = { plan_code: 'profissional', features: ['quote_webhook', 'conversion_reports'] };

const envKey = () => `${crypto.randomUUID()}${crypto.randomUUID()}`;

function draft(siteId, slug, name, items) {
  return {
    siteId,
    revision: 1,
    content: {
      schemaVersion: 1, template: 'pizzeria-v1', slug, businessName: name, whatsapp: '5551999990000',
      categories: [], items
    }
  };
}

function seededStore() {
  return createMemoryStore({
    sites: [
      { id: SITE_A, owner_user_id: OWNER_A, slug: 'vitrine-a', name: 'Foto Ana', template: 'pizzeria-v1' },
      { id: SITE_B, owner_user_id: OWNER_B, slug: 'vitrine-b', name: 'Reforma Rui', template: 'pizzeria-v1' }
    ],
    memberships: [{ site_id: SITE_A, user_id: '10000000-0000-0000-0000-000000000002', role: 'editor' }],
    drafts: [
      draft(SITE_A, 'vitrine-a', 'Foto Ana', [
        { id: 'ensaio', name: 'Ensaio externo', priceCents: 30000, active: true, available: true }
      ]),
      draft(SITE_B, 'vitrine-b', 'Reforma Rui', [
        { id: 'pintura', name: 'Pintura', priceCents: 50000, active: true, available: true }
      ])
    ]
  });
}

function recordingFetch(handler = () => new Response('ok', { status: 200 })) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init, body: init?.body, headers: init?.headers });
    return handler(calls.length, url, init);
  };
  return { calls, fetchImpl };
}

function panelRequest(path, { method = 'GET', token = 'token-owner', body } = {}) {
  return new Request(`${PANEL}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Origin: PANEL,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

function leadRequest(slug, body, ip = '203.0.113.7') {
  return new Request(`${PUBLIC}/api/sites/${slug}/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: PUBLIC, 'cf-connecting-ip': ip },
    body: JSON.stringify(body)
  });
}

function waitUntilCollector() {
  const pending = [];
  return { ctx: { waitUntil: (promise) => pending.push(promise) }, settle: () => Promise.all(pending), pending };
}

async function configure(api, env, siteId, url) {
  const saved = await api.fetch(panelRequest(`/api/sites/${siteId}/quote-webhook`, {
    method: 'PUT', token: siteId === SITE_A ? 'token-owner' : 'token-stranger', body: { url }
  }), env);
  assert.equal(saved.status, 200);
  const generated = await api.fetch(panelRequest(`/api/sites/${siteId}/quote-webhook/secret`, {
    method: 'POST', token: siteId === SITE_A ? 'token-owner' : 'token-stranger', body: {}
  }), env);
  assert.equal(generated.status, 201);
  return (await generated.json()).secret;
}

test('URL do webhook: só HTTPS pública; http, loopback, rede privada e domínio da plataforma são recusados', () => {
  for (const url of [
    'http://hooks.example.com/x',
    'https://127.0.0.1/x',
    'https://10.0.0.1/x',
    'https://192.168.0.10/x',
    'https://172.20.1.1/x',
    'https://169.254.169.254/latest/meta-data',
    'https://100.64.0.1/x',
    'https://0x7f.1/x',
    'https://[::1]/x',
    'https://localhost/x',
    'https://intranet/x',
    'https://servidor.local/x',
    'https://painel.inspira.dev.br/api',
    'https://inspira.dev.br/x',
    'https://hooks.example.com:8443/x',
    'https://user:senha@hooks.example.com/x',
    'javascript:alert(1)',
    ''
  ]) {
    assert.throws(() => validateQuoteWebhookUrl(url), { code: 'INVALID_WEBHOOK_URL' }, url);
  }
  assert.equal(validateQuoteWebhookUrl('https://hooks.example.com/vitrine?x=1#frag'), 'https://hooks.example.com/vitrine?x=1');
  assert.equal(
    validateQuoteWebhookUrl('https://script.google.com/macros/s/abc/exec'),
    'https://script.google.com/macros/s/abc/exec'
  );
});

test('assinatura: o corpo valida com o segredo e falha com outro, com corpo alterado ou fora da janela', async () => {
  const secret = 'a'.repeat(64);
  const body = JSON.stringify({ event: 'quote.lead.created', lead: { category: 'Casamento' } });
  const timestamp = '1794495600';
  const signature = await signQuoteWebhook(secret, timestamp, body);
  assert.match(signature, /^sha256=[a-f0-9]{64}$/);
  const nowSeconds = 1794495700;
  assert.equal(await verifyQuoteWebhookSignature(secret, { timestamp, body, signature }, { nowSeconds }), true);
  assert.equal(await verifyQuoteWebhookSignature('b'.repeat(64), { timestamp, body, signature }, { nowSeconds }), false);
  assert.equal(await verifyQuoteWebhookSignature(secret, { timestamp, body: `${body} `, signature }, { nowSeconds }), false);
  assert.equal(await verifyQuoteWebhookSignature(secret, { timestamp, body, signature }, { nowSeconds: nowSeconds + 600 }), false);
});

test('segredo cifrado: abre só com a mesma chave e a mesma vitrine', async () => {
  const key = envKey();
  const ciphertext = await encryptWebhookSecret('segredo-de-teste', SITE_A, key);
  assert.match(ciphertext, /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.ok(!ciphertext.includes('segredo-de-teste'));
  assert.equal(await decryptWebhookSecret(ciphertext, SITE_A, key), 'segredo-de-teste');
  await assert.rejects(decryptWebhookSecret(ciphertext, SITE_B, key), { code: 'QUOTE_WEBHOOK_UNAVAILABLE' });
  await assert.rejects(decryptWebhookSecret(ciphertext, SITE_A, envKey()), { code: 'QUOTE_WEBHOOK_UNAVAILABLE' });
  await assert.rejects(encryptWebhookSecret('x', SITE_A, 'curta'), { code: 'QUOTE_WEBHOOK_UNAVAILABLE' });
});

test('entrega: no máximo 3 tentativas para 5xx e erro de rede; 4xx e 3xx não repetem', async () => {
  const waits = [];
  const wait = async (ms) => { waits.push(ms); };
  const base = { url: 'https://hooks.example.com/v', secret: 's'.repeat(64), event: 'quote.lead.test', payload: { a: 1 }, wait };

  const failing = recordingFetch(() => new Response('erro', { status: 503 }));
  const result = await deliverQuoteWebhook({ ...base, fetch: failing.fetchImpl });
  assert.equal(failing.calls.length, DELIVERY_MAX_ATTEMPTS);
  assert.deepEqual(result, { ok: false, httpStatus: 503, attempts: 3, deliveryId: result.deliveryId });
  assert.deepEqual(waits, [500, 1500]);
  assert.equal(failing.calls[0].init.redirect, 'manual');
  const deliveries = new Set(failing.calls.map((call) => call.headers['x-vitrine-delivery']));
  assert.equal(deliveries.size, 1, 'mesma entrega em todas as tentativas');

  const network = recordingFetch((n) => {
    if (n < 3) throw new TypeError('rede');
    return new Response(null, { status: 204 });
  });
  assert.deepEqual(
    (({ ok, httpStatus, attempts }) => ({ ok, httpStatus, attempts }))(await deliverQuoteWebhook({ ...base, fetch: network.fetchImpl })),
    { ok: true, httpStatus: 204, attempts: 3 }
  );

  for (const [status, ok] of [[400, false], [410, false], [302, true]]) {
    const once = recordingFetch(() => new Response(null, { status }));
    const outcome = await deliverQuoteWebhook({ ...base, fetch: once.fetchImpl });
    assert.equal(once.calls.length, 1, `HTTP ${status} não repete`);
    assert.equal(outcome.ok, ok, `HTTP ${status}`);
    assert.equal(once.calls[0].init.redirect, 'manual', 'redirecionamento nunca é seguido');
  }
  await assert.rejects(deliverQuoteWebhook({ ...base, url: 'https://10.0.0.1/x', fetch: failing.fetchImpl }));
});

test('editor: sem quote_webhook o painel mostra o plano exigido e salvar responde 403', async () => {
  clearPublicationsCache();
  const store = seededStore();
  const api = createApiHandler({ store });
  const env = { QUOTE_WEBHOOK_ENCRYPTION_KEY: envKey() };

  const read = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook`), env);
  assert.equal(read.status, 200);
  const { quoteWebhook } = await read.json();
  assert.equal(quoteWebhook.available, false);
  assert.equal(quoteWebhook.state, 'locked');
  assert.deepEqual(quoteWebhook.requiredPlan, { code: 'profissional', name: 'Profissional' });

  for (const [suffix, method, body] of [['', 'PUT', { url: 'https://hooks.example.com/v' }], ['/secret', 'POST', {}], ['/test', 'POST', {}]]) {
    const res = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook${suffix}`, { method, body }), env);
    assert.equal(res.status, 403, suffix || 'PUT');
    const error = (await res.json()).error;
    assert.equal(error.code, 'PLAN_FEATURE_REQUIRED');
    assert.equal(error.requiredPlan.name, 'Profissional');
  }
});

test('editor: URL http, 127.0.0.1 e 10.0.0.1 são recusadas ao salvar; editor e estranhos recebem 404', async () => {
  clearPublicationsCache();
  const store = seededStore();
  store.getSiteEntitlements = async () => PRO;
  const api = createApiHandler({ store });
  const env = { QUOTE_WEBHOOK_ENCRYPTION_KEY: envKey() };
  for (const url of ['http://hooks.example.com/v', 'https://127.0.0.1/v', 'https://10.0.0.1/v']) {
    const res = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook`, { method: 'PUT', body: { url } }), env);
    assert.equal(res.status, 422, url);
    assert.equal((await res.json()).error.code, 'INVALID_WEBHOOK_URL');
  }
  for (const token of ['token-member', 'token-stranger']) {
    const res = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook`, { token }), env);
    assert.equal(res.status, 404, token);
  }
  const noOrigin = await api.fetch(new Request(`${PANEL}/api/sites/${SITE_A}/quote-webhook`, {
    method: 'PUT', headers: { Authorization: 'Bearer token-owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://hooks.example.com/v' })
  }), env);
  assert.equal(noOrigin.status, 403);
});

test('editor: segredo aparece uma vez; "Enviar teste" chega assinado e o status fica no editor', async () => {
  clearPublicationsCache();
  const store = seededStore();
  store.getSiteEntitlements = async () => PRO;
  const destination = recordingFetch(() => new Response('{"ok":true}', { status: 200 }));
  const api = createApiHandler({ store, fetch: destination.fetchImpl });
  const env = { QUOTE_WEBHOOK_ENCRYPTION_KEY: envKey() };
  const logs = [];
  const original = { error: console.error, log: console.log, warn: console.warn };
  console.error = console.log = console.warn = (...args) => logs.push(args.join(' '));
  try {
    const secret = await configure(api, env, SITE_A, 'https://hooks.example.com/crm?token=abc');
    assert.match(secret, /^[a-f0-9]{64}$/);

    const after = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook`), env);
    const afterText = await after.text();
    assert.ok(!afterText.includes(secret), 'o segredo não volta em leituras');
    const status = JSON.parse(afterText).quoteWebhook;
    assert.equal(status.hasSecret, true);
    assert.equal(status.state, 'ready');
    assert.equal(status.url, 'https://hooks.example.com/crm?token=abc');

    const stored = JSON.stringify([...store.quoteWebhooks.values()]);
    assert.ok(!stored.includes(secret), 'o banco guarda só o texto cifrado');

    const sent = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook/test`, { method: 'POST', body: {} }), env);
    assert.equal(sent.status, 200);
    const sentText = await sent.text();
    assert.ok(!sentText.includes(secret));
    const result = JSON.parse(sentText);
    assert.deepEqual(result.delivery, { ok: true, httpStatus: 200, attempts: 1 });
    assert.equal(result.quoteWebhook.lastDelivery.kind, 'test');
    assert.equal(result.quoteWebhook.totals.delivered, 0, 'teste não conta como pré-orçamento');

    assert.equal(destination.calls.length, 1);
    const call = destination.calls[0];
    assert.equal(call.url, 'https://hooks.example.com/crm?token=abc');
    assert.equal(call.headers['x-vitrine-event'], 'quote.lead.test');
    const signed = { timestamp: call.headers['x-vitrine-timestamp'], body: call.body, signature: call.headers['x-vitrine-signature'] };
    assert.equal(await verifyQuoteWebhookSignature(secret, signed), true);
    assert.equal(await verifyQuoteWebhookSignature('0'.repeat(64), signed), false);
    assert.equal(JSON.parse(call.body).test, true);
  } finally {
    Object.assign(console, original);
  }
  const joined = logs.join('\n');
  assert.ok(!joined.includes('hooks.example.com') && !/[a-f0-9]{64}/.test(joined), 'nada de URL ou segredo nos logs');
});

async function publishWithLead(api, store, siteId, token, fields = ['category', 'date', 'neighborhood']) {
  store.drafts.get(siteId).content.quoteLead = { fields };
  const res = await api.fetch(new Request(`${PANEL}/api/sites/${siteId}/publish`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, Origin: PANEL }
  }));
  assert.equal(res.status, 200);
  return (await res.json()).publication;
}

test('vitrine pública: com consentimento responde 202 sem esperar o destino; sem consentimento nada é enviado', async () => {
  clearPublicationsCache();
  const store = seededStore();
  store.getSiteEntitlements = async () => PRO;
  let release;
  const hanging = new Promise((resolve) => { release = resolve; });
  const destination = recordingFetch(async (n, url) => {
    if (String(url).includes('/teste-pendurado')) {
      await hanging;
      return new Response(null, { status: 200 });
    }
    return new Response(null, { status: 200 });
  });
  const api = createApiHandler({ store, fetch: destination.fetchImpl });
  const env = { QUOTE_WEBHOOK_ENCRYPTION_KEY: envKey() };
  const secret = await configure(api, env, SITE_A, 'https://hooks.example.com/teste-pendurado');

  const publication = await publishWithLead(api, store, SITE_A, 'token-owner');
  assert.deepEqual(publication.menu.quoteLead, { fields: ['category', 'date', 'neighborhood'] });
  assert.doesNotThrow(() => assertNoPrivateLeakage(publication.menu));
  const menuText = JSON.stringify(publication.menu);
  assert.ok(!menuText.includes('hooks.example.com') && !menuText.includes(secret));

  const noConsent = await api.fetch(leadRequest('vitrine-a', { consent: false, fields: { category: 'Casamento' } }), env);
  assert.equal(noConsent.status, 422);
  assert.equal((await noConsent.json()).error.code, 'CONSENT_REQUIRED');
  const missingConsent = await api.fetch(leadRequest('vitrine-a', { fields: { category: 'Casamento' } }), env);
  assert.equal(missingConsent.status, 422);
  assert.equal(destination.calls.length, 0, 'sem consentimento nenhum webhook sai');

  const collector = waitUntilCollector();
  const started = performance.now();
  const accepted = await api.fetch(leadRequest('vitrine-a', {
    consent: true,
    fields: { category: 'Casamento', date: '2027-03-20', neighborhood: 'Cidade Baixa' },
    items: [{ id: 'ensaio', quantity: 2 }, { id: 'inexistente', quantity: 1 }]
  }), env, collector.ctx);
  const elapsed = performance.now() - started;
  assert.equal(accepted.status, 202);
  assert.deepEqual(await accepted.json(), { accepted: true });
  assert.equal(collector.pending.length, 1, 'entrega vai para ctx.waitUntil');
  assert.ok(elapsed < 1000, `resposta não espera o destino (${elapsed.toFixed(1)} ms)`);

  release();
  await collector.settle();
  assert.equal(destination.calls.length, 1);
  const call = destination.calls[0];
  const payload = JSON.parse(call.body);
  assert.equal(payload.event, 'quote.lead.created');
  assert.deepEqual(payload.lead, {
    category: 'Casamento', date: '2027-03-20', neighborhood: 'Cidade Baixa',
    items: [{ id: 'ensaio', name: 'Ensaio externo', quantity: 2 }]
  });
  assert.equal(payload.vitrine.slug, 'vitrine-a');
  assert.equal(payload.consent.text, quoteLeadConsentText('Foto Ana'));
  assert.equal(await verifyQuoteWebhookSignature(secret, {
    timestamp: call.headers['x-vitrine-timestamp'], body: call.body, signature: call.headers['x-vitrine-signature']
  }), true);

  const status = await readQuoteWebhookStatus(store, SITE_A, { entitlements: normalizeEntitlements(PRO) });
  assert.deepEqual(status.totals, { delivered: 1, failed: 0 });
  assert.equal(status.lastDelivery.kind, 'lead');
  assert.ok(!JSON.stringify([...store.quoteWebhooks.values()]).includes('Cidade Baixa'), 'nenhum dado do pré-orçamento no banco');
});

test('vitrine pública: sem o recurso quote_webhook a rota responde 404 e não envia', async () => {
  clearPublicationsCache();
  const store = seededStore();
  store.getSiteEntitlements = async () => PRO;
  const destination = recordingFetch();
  const api = createApiHandler({ store, fetch: destination.fetchImpl });
  const env = { QUOTE_WEBHOOK_ENCRYPTION_KEY: envKey() };
  await configure(api, env, SITE_A, 'https://hooks.example.com/v');
  await publishWithLead(api, store, SITE_A, 'token-owner');

  store.getSiteEntitlements = async () => ({ plan_code: 'free' });
  const collector = waitUntilCollector();
  const gone = await api.fetch(leadRequest('vitrine-a', { consent: true, fields: { category: 'Casamento' } }, '198.51.100.20'), env, collector.ctx);
  assert.equal(gone.status, 404);
  assert.equal(gone.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(collector.pending.length, 0);
  assert.equal(destination.calls.length, 0);

  store.getSiteEntitlements = async () => PRO;
  const republished = await publishWithLead(api, store, SITE_A, 'token-owner', []);
  assert.equal(republished.menu.quoteLead, undefined, 'sem campos ligados nada vai para o snapshot');
  const off = await api.fetch(leadRequest('vitrine-a', { consent: true, fields: { category: 'x' } }, '198.51.100.21'), env);
  assert.equal(off.status, 404);
});

test('vitrine pública: sem integração pronta, os campos não entram no snapshot mesmo no Profissional', async () => {
  clearPublicationsCache();
  const store = seededStore();
  store.getSiteEntitlements = async () => PRO;
  const api = createApiHandler({ store });
  const publication = await publishWithLead(api, store, SITE_A, 'token-owner');
  assert.equal(publication.menu.quoteLead, undefined);
});

test('isolamento: vitrine-b não lê a integração da vitrine-a e cada pré-orçamento usa o próprio destino', async () => {
  clearPublicationsCache();
  const store = seededStore();
  store.getSiteEntitlements = async () => PRO;
  const destination = recordingFetch();
  const api = createApiHandler({ store, fetch: destination.fetchImpl });
  const env = { QUOTE_WEBHOOK_ENCRYPTION_KEY: envKey() };
  const secretA = await configure(api, env, SITE_A, 'https://a.example.com/hook');
  const secretB = await configure(api, env, SITE_B, 'https://b.example.com/hook');
  assert.notEqual(secretA, secretB);

  const crossRead = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook`, { token: 'token-stranger' }), env);
  assert.equal(crossRead.status, 404);
  const crossWrite = await api.fetch(panelRequest(`/api/sites/${SITE_A}/quote-webhook`, {
    method: 'PUT', token: 'token-stranger', body: { url: 'https://evil.example.com/x' }
  }), env);
  assert.equal(crossWrite.status, 404);

  await publishWithLead(api, store, SITE_A, 'token-owner');
  await publishWithLead(api, store, SITE_B, 'token-stranger');
  const collector = waitUntilCollector();
  const res = await api.fetch(leadRequest('vitrine-b', { consent: true, fields: { neighborhood: 'Centro' } }, '192.0.2.50'), env, collector.ctx);
  assert.equal(res.status, 202);
  await collector.settle();
  assert.equal(destination.calls.length, 1);
  const call = destination.calls[0];
  assert.equal(call.url, 'https://b.example.com/hook');
  const signed = { timestamp: call.headers['x-vitrine-timestamp'], body: call.body, signature: call.headers['x-vitrine-signature'] };
  assert.equal(await verifyQuoteWebhookSignature(secretB, signed), true);
  assert.equal(await verifyQuoteWebhookSignature(secretA, signed), false);

  const hookA = store.quoteWebhooks.get(SITE_A);
  const hookB = store.quoteWebhooks.get(SITE_B);
  await assert.rejects(decryptWebhookSecret(hookA.secretCiphertext, SITE_B, env.QUOTE_WEBHOOK_ENCRYPTION_KEY));
  assert.equal(await decryptWebhookSecret(hookB.secretCiphertext, SITE_B, env.QUOTE_WEBHOOK_ENCRYPTION_KEY), secretB);
});

test('limite por IP em memória: sexto envio em 10 minutos recebe 429 e o IP não fica guardado', async () => {
  let now = 1_000_000;
  const limiter = createLeadRateLimiter({ limit: 5, windowMs: 600_000, maxKeys: 3 }, () => now);
  for (let i = 0; i < 5; i += 1) assert.equal((await limiter.take('203.0.113.7', 'vitrine-a')).allowed, true);
  const blocked = await limiter.take('203.0.113.7', 'vitrine-a');
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 600);
  assert.equal((await limiter.take('203.0.113.8', 'vitrine-a')).allowed, true, 'outro endereço não é afetado');
  await limiter.take('203.0.113.9', 'vitrine-a');
  await limiter.take('203.0.113.10', 'vitrine-a');
  assert.ok(limiter.size <= 3, 'memória limitada');
  now += 600_000;
  assert.equal((await limiter.take('203.0.113.7', 'vitrine-a')).allowed, true, 'janela renova');

  clearPublicationsCache();
  const store = seededStore();
  store.getSiteEntitlements = async () => PRO;
  const api = createApiHandler({ store, fetch: recordingFetch().fetchImpl });
  const env = { QUOTE_WEBHOOK_ENCRYPTION_KEY: envKey() };
  await configure(api, env, SITE_A, 'https://hooks.example.com/v');
  await publishWithLead(api, store, SITE_A, 'token-owner');
  const statuses = [];
  for (let i = 0; i < 6; i += 1) {
    const res = await api.fetch(leadRequest('vitrine-a', { consent: true, fields: { category: `c${i}` } }, '203.0.113.99'), env, {});
    statuses.push(res.status);
    if (res.status === 429) assert.ok(Number(res.headers.get('retry-after')) > 0);
  }
  assert.deepEqual(statuses, [202, 202, 202, 202, 202, 429]);
});

test('validação do pré-orçamento: campos fora da vitrine, data inválida e texto longo são recusados', () => {
  const menu = { quoteLead: { fields: ['category', 'date'] }, items: [{ id: 'a', name: 'A' }] };
  assert.throws(() => validateLeadPayload({ consent: true, fields: { neighborhood: 'Centro' } }, menu), { code: 'INVALID_LEAD' });
  assert.throws(() => validateLeadPayload({ consent: true, fields: { date: '2026-02-30' } }, menu), { code: 'INVALID_LEAD' });
  assert.throws(() => validateLeadPayload({ consent: true, fields: { category: 'x'.repeat(81) } }, menu), { code: 'INVALID_LEAD' });
  assert.throws(() => validateLeadPayload({ consent: true, fields: { category: '<script>x</script>' } }, menu), { code: 'INVALID_LEAD' });
  assert.throws(() => validateLeadPayload({ consent: true, fields: {}, items: [] }, menu), { code: 'INVALID_LEAD' });
  assert.throws(() => validateLeadPayload({ consent: true, fields: {}, extra: 1 }, menu), { code: 'INVALID_LEAD' });
  assert.deepEqual(
    validateLeadPayload({ consent: true, fields: { category: '  Festa \n infantil ' }, items: [{ id: 'a', quantity: 3 }] }, menu),
    { category: 'Festa infantil', items: [{ id: 'a', name: 'A', quantity: 3 }] }
  );
});

test('rascunho: configuração quoteLead inválida é recusada', () => {
  const base = { schemaVersion: 1, template: 'pizzeria-v1', businessName: 'X', whatsapp: '5511999999999', items: [] };
  assert.doesNotThrow(() => validateDraftContent({ ...base, quoteLead: { fields: ['category', 'neighborhood'] } }));
  for (const quoteLead of [{ fields: ['telefone'] }, { fields: ['date', 'date'] }, { fields: 'category' }, { fields: [], url: 'https://x.com' }]) {
    assert.throws(() => validateDraftContent({ ...base, quoteLead }), { code: 'INVALID_QUOTE_LEAD' });
  }
});

function fakeRenderer(overrides = {}) {
  return {
    menu: { slug: 'vitrine-a', name: 'Foto Ana', quoteLead: { fields: ['category', 'date', 'neighborhood'] } },
    quoteLead: { values: { category: 'Casamento', date: '', neighborhood: 'Centro' }, consent: false },
    cart: new Map([['ensaio', 2]]),
    customerDetails: { date: '2027-01-10' },
    getResolvedOrderFields: () => ({ date: true }),
    ...overrides
  };
}

test('navegador: sem consentimento nada sai; com consentimento o envio não bloqueia o WhatsApp', () => {
  const calls = [];
  const fetchImpl = (url, init) => {
    calls.push({ url, init });
    return new Promise(() => {});
  };
  const renderer = fakeRenderer();
  assert.equal(buildQuoteLeadRequest(renderer), null);
  assert.equal(sendQuoteLead(renderer, fetchImpl), false);
  assert.equal(calls.length, 0);

  renderer.quoteLead.consent = true;
  assert.equal(sendQuoteLead(renderer, fetchImpl), true, 'retorna na hora, mesmo com a requisição pendente');
  assert.equal(calls[0].url, '/api/sites/vitrine-a/leads');
  assert.equal(calls[0].init.keepalive, true);
  assert.deepEqual(JSON.parse(calls[0].init.body), {
    consent: true,
    fields: { category: 'Casamento', date: '2027-01-10', neighborhood: 'Centro' },
    items: [{ id: 'ensaio', quantity: 2 }]
  });

  assert.deepEqual(
    quoteLeadMessageLines(renderer.menu, renderer.quoteLead.values, { skipDate: true }),
    ['Categoria: Casamento', 'Bairro: Centro']
  );
  assert.equal(sendQuoteLead(fakeRenderer({ menu: { slug: 'x' } }), fetchImpl), false, 'vitrine sem quoteLead não envia');
});

function fakeDocument() {
  const make = (tag) => ({
    tag, className: '', id: '', textContent: '', attrs: {}, children: [], listeners: {},
    setAttribute(name, value) { this.attrs[name] = String(value); },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  return { createElement: make, createTextNode: (text) => ({ textContent: text, children: [] }) };
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

test('painel: plano sem o recurso mostra "Disponível no Profissional" e os campos bloqueados', () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  renderQuoteWebhookPanel(container, presentQuoteWebhookStatus(null, FREE_ENTITLEMENTS), doc);
  const texts = [];
  const disabled = [];
  walk(container, (node) => {
    texts.push(node.textContent);
    if ((node.tag === 'input' || node.tag === 'button' || node.tag === 'fieldset') && node.disabled) disabled.push(node.tag);
  });
  assert.ok(texts.includes('Disponível no Profissional'));
  assert.ok(disabled.includes('fieldset') && disabled.includes('input') && disabled.includes('button'));

  const ready = presentQuoteWebhookStatus({
    url: 'https://hooks.example.com/v', hasSecret: true, secretCreatedAt: '2026-11-14T23:00:00Z',
    lastDelivery: { kind: 'lead', ok: false, httpStatus: 500, attempts: 3, at: '2026-11-14T23:10:00Z' },
    totals: { delivered: 4, failed: 1 }
  }, normalizeEntitlements(PRO));
  assert.equal(ready.state, 'failing');
  assert.match(describeLastDelivery(ready.lastDelivery), /^Falhou · HTTP 500 · 3 tentativas · /);
  const readyContainer = doc.createElement('section');
  renderQuoteWebhookPanel(readyContainer, ready, doc);
  const readyTexts = [];
  walk(readyContainer, (node) => readyTexts.push(node.textContent));
  assert.ok(readyTexts.includes('Enviar teste') && readyTexts.includes('Gerar novo segredo'));
  assert.ok(!readyTexts.includes('Disponível no Profissional'));
});
