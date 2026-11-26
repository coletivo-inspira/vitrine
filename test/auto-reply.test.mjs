import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';
import { hmacSha256Hex, encryptChannelToken, decryptChannelToken, recipientHash, toBase64Url } from '../src/auto-reply/crypto.mjs';
import { MetaApiError, classifyGraphError, createInstagramAdapter } from '../src/auto-reply/instagram-adapter.mjs';
import { normalizeInstagramWebhook, verifyMetaSignature, verifyWebhookChallenge } from '../src/auto-reply/instagram-webhook.mjs';
import { resolveAutoReplyPublicUrl } from '../src/auto-reply/public-url.mjs';
import { evaluateEvent, frequencyAllows } from '../src/auto-reply/rules.mjs';
import { parseSignedRequest, runAutoReplyMaintenance } from '../src/auto-reply/routes.mjs';
import {
  AUTO_REPLY_DEFAULT_MESSAGE,
  autoReplyCounter,
  renderAutoReplyMessage,
  validateAutoReplyTemplate
} from '../web/assets/auto-reply-message.mjs';
import { BUSINESS_ID, CONSUMER_ID, fixtures, messageEvent } from './fixtures/meta-instagram-webhooks.mjs';

const SITE_A = '20000000-0000-0000-0000-00000000000a';
const SITE_B = '20000000-0000-0000-0000-00000000000b';
const OWNER_A = '10000000-0000-0000-0000-000000000001';
const OPERATOR = '10000000-0000-0000-0000-000000000003';
const PANEL = 'https://painel.inspira.dev.br';
const ACCESS_TOKEN = 'TESTE-token-de-usuario-do-sistema-ficticio';
const APP_SECRET = 'segredo-de-teste-nao-real';

function baseEnv(overrides = {}) {
  return {
    META_APP_ID: '1000000000000001',
    META_APP_SECRET: APP_SECRET,
    META_IG_AUTOREPLY_CONFIG_ID: '2000000000000002',
    META_WEBHOOK_VERIFY_TOKEN: 'verificacao-teste',
    AUTO_REPLY_ENCRYPTION_KEY: `${crypto.randomUUID()}${crypto.randomUUID()}`,
    ...overrides
  };
}

function fakeAdapter(script = {}) {
  const calls = { sent: [], subscribed: [], unsubscribed: [], exchanged: [] };
  const adapter = {
    provider: 'instagram',
    buildAuthorizeUrl: ({ state, redirectUri }) =>
      `https://www.facebook.com/v27.0/dialog/oauth?config_id=x&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
    async exchangeCode({ code }) {
      calls.exchanged.push(code);
      if (script.exchangeFails) throw new MetaApiError('rejected');
      return { accessToken: ACCESS_TOKEN };
    },
    async inspectToken() {
      return {
        valid: script.tokenValid ?? true,
        appMatches: true,
        scopes: script.scopes ?? ['instagram_basic', 'instagram_manage_messages'],
        expiresAt: null,
        businessId: '900000000000001'
      };
    },
    async listAssignedAccounts() {
      return script.accounts ?? [{ id: BUSINESS_ID, username: 'pizzaria.exemplo', name: 'Pizzaria Exemplo' }];
    },
    async subscribeWebhooks(accountId) {
      calls.subscribed.push(accountId);
      return script.subscribe ?? true;
    },
    async unsubscribeWebhooks(accountId) {
      calls.unsubscribed.push(accountId);
      return true;
    },
    async sendText(payload) {
      calls.sent.push(payload);
      const next = script.sendResults?.shift?.();
      if (next instanceof Error) throw next;
      if (typeof next === 'function') return next(payload);
      return { messageId: `m-${calls.sent.length}` };
    }
  };
  return { adapter, calls };
}

function setup({ script, env: envOverrides } = {}) {
  const store = createMemoryStore({
    sites: [
      { id: SITE_A, owner_user_id: OWNER_A, slug: 'pizzaria-exemplo', name: 'Pizzaria Exemplo', template: 'pizzeria-v1' },
      { id: SITE_B, owner_user_id: OPERATOR, slug: 'outra-vitrine', name: 'Outra', template: 'pizzeria-v1' }
    ],
    memberships: [{ site_id: SITE_A, user_id: '10000000-0000-0000-0000-000000000002', role: 'editor' }],
    drafts: []
  });
  store.isPlatformAdmin = async (userId) => userId === OPERATOR;
  const { adapter, calls } = fakeAdapter(script);
  const api = createApiHandler({ store, autoReplyAdapterFor: () => adapter, autoReplyWait: async () => {} });
  return { api, store, env: baseEnv(envOverrides), adapter, calls };
}

function request(path, { method = 'GET', token = 'token-owner', body, origin = PANEL } = {}) {
  return new Request(`${PANEL}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(origin ? { Origin: origin } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

async function signedWebhook(payload, secret = APP_SECRET) {
  const body = JSON.stringify(payload);
  return new Request(`${PANEL}/api/webhooks/meta/instagram`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${await hmacSha256Hex(secret, body)}` },
    body
  });
}

function collector() {
  const pending = [];
  return { ctx: { waitUntil: (promise) => pending.push(promise) }, settle: () => Promise.all(pending) };
}

function publish(store, slug = 'pizzaria-exemplo') {
  store.publicationsBySlug.set(slug, { slug, hash: 'a'.repeat(64), menu: { name: 'Pizzaria Exemplo' } });
}

async function openPlatform(api, env) {
  await api.fetch(request('/api/admin/auto-reply/controls', { method: 'PUT', token: 'token-stranger', body: { enabled: true, instagramEnabled: true } }), env);
  await api.fetch(request(`/api/admin/auto-reply/sites/${SITE_A}`, { method: 'PUT', token: 'token-stranger', body: { allowed: true } }), env);
}

async function connect(api, env, { token = 'token-owner', siteId = SITE_A } = {}) {
  const started = await api.fetch(request(`/api/sites/${siteId}/auto-reply/instagram/connect`, { method: 'POST', token, body: {} }), env);
  assert.equal(started.status, 200);
  const { authorizeUrl } = await started.json();
  const state = new URL(authorizeUrl).searchParams.get('state');
  return { state, authorizeUrl };
}

async function callback(api, env, query, token = 'token-owner') {
  const res = await api.fetch(request(`/api/instagram/oauth/callback?${new URLSearchParams(query)}`, { token, origin: null }), env);
  assert.equal(res.status, 302);
  return new URL(res.headers.get('location'));
}

async function ready({ script, env: envOverrides, frequency = 'daily', message = AUTO_REPLY_DEFAULT_MESSAGE } = {}) {
  const ctx = setup({ script, env: envOverrides });
  publish(ctx.store);
  await openPlatform(ctx.api, ctx.env);
  const { state } = await connect(ctx.api, ctx.env);
  const location = await callback(ctx.api, ctx.env, { state, code: 'codigo-ficticio' });
  assert.equal(location.searchParams.get('autoResposta'), 'connected');
  const saved = await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, {
    method: 'PUT', body: { enabled: true, message, frequency, version: 0 }
  }), ctx.env);
  assert.equal(saved.status, 200, await saved.clone().text());
  ctx.status = (await saved.json()).autoReply;
  ctx.deliver = async (payload) => {
    const { ctx: runtime, settle } = collector();
    const res = await ctx.api.fetch(await signedWebhook(payload), ctx.env, runtime);
    await settle();
    return res;
  };
  return ctx;
}

// --- Unidades -----------------------------------------------------------------

test('mensagem: variáveis, URL anexada sem duplicar e limite de 1000 bytes', () => {
  const url = 'https://vitrine.inspira.dev.br/pizzaria-exemplo';
  const withVar = renderAutoReplyMessage(AUTO_REPLY_DEFAULT_MESSAGE, { name: 'Pizzaria', url });
  assert.ok(withVar.text.endsWith(url));
  assert.equal(withVar.text.split(url).length, 2);
  const noVar = renderAutoReplyMessage('Olá da {{vitrine.nome}}!', { name: 'Pizzaria', url });
  assert.equal(noVar.text, `Olá da Pizzaria!\n\n${url}`);
  assert.equal(noVar.appendedUrl, true);
  const already = renderAutoReplyMessage(`Veja ${url} agora`, { url });
  assert.equal(already.appendedUrl, false);
  assert.equal(already.text.split(url).length, 2);
  assert.deepEqual(validateAutoReplyTemplate('Oi {{cliente.nome}}', { url }).map((e) => e.code), ['AUTO_REPLY_MESSAGE_VARIABLE']);
  assert.equal(validateAutoReplyTemplate('ç'.repeat(501), { url })[0].code, 'AUTO_REPLY_MESSAGE_TOO_LONG');
  assert.equal(validateAutoReplyTemplate('a'.repeat(980), { url })[0].code, 'AUTO_REPLY_MESSAGE_TOO_LONG');
  assert.equal(validateAutoReplyTemplate('   ', { url })[0].code, 'AUTO_REPLY_MESSAGE_EMPTY');
  assert.equal(autoReplyCounter('Oi', { url }).remaining, 1000 - new TextEncoder().encode(`Oi\n\n${url}`).length);
});

test('endereço: domínio próprio só com recurso e SSL; despublicada, pausada e demonstração não geram link', () => {
  const base = { slug: 'pizzaria-exemplo', published: true, paused: false, archived: false, demo: false, domains: [] };
  assert.equal(resolveAutoReplyPublicUrl(base).url, 'https://vitrine.inspira.dev.br/pizzaria-exemplo');
  const domain = [{ hostname: 'www.pizzaria.com.br', status: 'active', ssl_status: 'active' }];
  assert.equal(resolveAutoReplyPublicUrl({ ...base, domains: domain, customDomainAllowed: true }).url, 'https://www.pizzaria.com.br');
  assert.equal(resolveAutoReplyPublicUrl({ ...base, domains: domain, customDomainAllowed: false }).url,
    'https://vitrine.inspira.dev.br/pizzaria-exemplo');
  assert.equal(resolveAutoReplyPublicUrl({ ...base, domains: [{ hostname: 'admin..x', status: 'active', ssl_status: 'active' }], customDomainAllowed: true }).url,
    'https://vitrine.inspira.dev.br/pizzaria-exemplo');
  assert.equal(resolveAutoReplyPublicUrl({ ...base, published: false }).reason, 'site_not_published');
  assert.equal(resolveAutoReplyPublicUrl({ ...base, paused: true }).reason, 'site_paused');
  assert.equal(resolveAutoReplyPublicUrl({ ...base, demo: true }).reason, 'site_demo');
  assert.equal(resolveAutoReplyPublicUrl({ ...base, slug: '../admin' }).reason, 'public_url_invalid');
  assert.equal(resolveAutoReplyPublicUrl(base, { PUBLIC_SITE_ORIGIN: 'http://evil.example' }).url,
    'https://vitrine.inspira.dev.br/pizzaria-exemplo');
});

test('webhook: só mensagem nova de consumidor é elegível; eco, leitura, reação, edição e afins são ignorados', () => {
  const eligible = normalizeInstagramWebhook(fixtures.message());
  assert.equal(eligible.length, 1);
  assert.equal(eligible[0].eligible, true);
  assert.equal(eligible[0].senderId, CONSUMER_ID);
  assert.ok(!('text' in eligible[0]));
  const reasons = Object.fromEntries(['echo', 'read', 'reaction', 'edit', 'deleted', 'unsupported', 'selfTest', 'postback', 'referral']
    .map((name) => [name, normalizeInstagramWebhook(fixtures[name]())[0]]));
  for (const event of Object.values(reasons)) assert.equal(event.eligible, false);
  assert.equal(reasons.echo.reason, 'echo');
  assert.equal(reasons.read.reason, 'read');
  assert.equal(reasons.selfTest.reason, 'self_test');
  assert.equal(normalizeInstagramWebhook(fixtures.attachmentOnly())[0].eligible, true);
  assert.equal(normalizeInstagramWebhook({ object: 'instagram', entry: [{ id: BUSINESS_ID, messaging: [messageEvent({ sender: BUSINESS_ID })] }] })[0].reason, 'echo');
  assert.equal(normalizeInstagramWebhook({ object: 'page', entry: [] })[0].reason, 'unsupported_object');
});

test('webhook: challenge e assinatura em tempo constante sobre o corpo bruto', async () => {
  const params = new URLSearchParams({ 'hub.mode': 'subscribe', 'hub.verify_token': 'abc', 'hub.challenge': '1158201444' });
  assert.equal(verifyWebhookChallenge(params, 'abc'), '1158201444');
  assert.equal(verifyWebhookChallenge(params, 'outro'), null);
  const body = new TextEncoder().encode('{"object":"instagram"}');
  const good = `sha256=${await hmacSha256Hex(APP_SECRET, body)}`;
  assert.equal(await verifyMetaSignature(body, good, APP_SECRET), true);
  assert.equal(await verifyMetaSignature(body, good, 'outra-chave'), false);
  assert.equal(await verifyMetaSignature(new TextEncoder().encode('{"object":"instagram" }'), good, APP_SECRET), false);
  assert.equal(await verifyMetaSignature(body, 'sha1=abc', APP_SECRET), false);
});

test('regras: janela de 23 h, antes da ativação e frequência', () => {
  const now = Date.parse('2026-11-26T12:00:00Z');
  const target = {
    controls: { enabled: true, instagramEnabled: true }, siteAllowed: true, status: 'connected',
    scopes: ['instagram_manage_messages'], settings: { enabled: true, enabledAt: '2026-11-26T10:00:00Z' }
  };
  assert.deepEqual(evaluateEvent(target, { eventAt: '2026-11-26T11:59:00Z' }, { now }), { ok: true });
  assert.equal(evaluateEvent(target, { eventAt: '2026-11-26T09:00:00Z' }, { now }).reason, 'before_activation');
  assert.equal(evaluateEvent({ ...target, settings: { enabled: true } }, { eventAt: '2026-11-25T12:00:00Z' }, { now }).reason, 'window_expired');
  assert.equal(evaluateEvent({ ...target, controls: { enabled: false } }, { eventAt: '2026-11-26T11:59:00Z' }, { now }).reason, 'platform_disabled');
  assert.equal(frequencyAllows('daily', now - 3 * 3600_000, now), false);
  assert.equal(frequencyAllows('daily', now - 25 * 3600_000, now), true);
  assert.equal(frequencyAllows('once', now - 300 * 24 * 3600_000, now), false);
  assert.equal(frequencyAllows('weekly', now - 8 * 24 * 3600_000, now), true);
});

test('criptografia: token só abre na mesma vitrine e conta; hash do consumidor muda por conexão', async () => {
  const key = baseEnv().AUTO_REPLY_ENCRYPTION_KEY;
  const ctx = { siteId: SITE_A, provider: 'instagram', accountId: BUSINESS_ID };
  const cipher = await encryptChannelToken(ACCESS_TOKEN, ctx, key);
  assert.ok(!cipher.includes(ACCESS_TOKEN));
  assert.equal(await decryptChannelToken(cipher, ctx, key), ACCESS_TOKEN);
  await assert.rejects(decryptChannelToken(cipher, { ...ctx, siteId: SITE_B }, key), /UNREADABLE/);
  const a = await recipientHash('conn-a', CONSUMER_ID, key);
  assert.match(a, /^[a-f0-9]{64}$/);
  assert.notEqual(a, await recipientHash('conn-b', CONSUMER_ID, key));
});

test('adaptador: URL de login sem scope nem segredo; envio e erros classificados', async () => {
  const env = baseEnv();
  const seen = [];
  const adapter = createInstagramAdapter({
    env,
    fetch: async (url, init) => {
      seen.push({ url: String(url), init });
      if (String(url).includes('/messages')) return new Response(JSON.stringify({ recipient_id: CONSUMER_ID, message_id: 'mid-x' }), { status: 200 });
      return new Response('{}', { status: 200 });
    }
  });
  const login = new URL(adapter.buildAuthorizeUrl({ state: 'S'.repeat(43), redirectUri: `${PANEL}/api/instagram/oauth/callback` }));
  assert.equal(login.origin, 'https://www.facebook.com');
  assert.equal(login.searchParams.get('config_id'), env.META_IG_AUTOREPLY_CONFIG_ID);
  assert.equal(login.searchParams.get('prompt'), 'login');
  assert.equal(login.searchParams.get('scope'), null);
  assert.ok(!login.href.includes(APP_SECRET));
  const sent = await adapter.sendText({ accountId: BUSINESS_ID, recipientId: CONSUMER_ID, text: 'Oi', accessToken: ACCESS_TOKEN });
  assert.equal(sent.messageId, 'mid-x');
  assert.equal(seen[0].url, `https://graph.facebook.com/v27.0/${BUSINESS_ID}/messages`);
  assert.equal(seen[0].init.headers.authorization, `Bearer ${ACCESS_TOKEN}`);
  assert.deepEqual(JSON.parse(seen[0].init.body), { recipient: { id: CONSUMER_ID }, message: { text: 'Oi' } });
  assert.equal(classifyGraphError(400, { error: { code: 190 } }).kind, 'token_invalid');
  assert.equal(classifyGraphError(403, { error: { code: 10, message: 'App is missing the instagram_manage_messages permission' } }).kind, 'permission_missing');
  assert.equal(classifyGraphError(403, { error: { code: 200, message: 'The account owner has disabled access to Instagram Direct Messaging' } }).kind, 'messaging_disabled');
  assert.equal(classifyGraphError(429, { error: { code: 4 } }).kind, 'rate_limited');
  assert.equal(classifyGraphError(500, {}).kind, 'unavailable');
  const timeout = createInstagramAdapter({ env, fetch: async () => { throw new DOMException('timeout', 'TimeoutError'); } });
  await assert.rejects(timeout.sendText({ accountId: BUSINESS_ID, recipientId: CONSUMER_ID, text: 'x', accessToken: 'y' }), { kind: 'uncertain' });
});

test('signed_request: assinatura válida aceita; adulterada recusada', async () => {
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '900000000000001' })));
  const signature = toBase64Url(Uint8Array.from((await hmacSha256Hex(APP_SECRET, payload)).match(/../g), (h) => parseInt(h, 16)));
  assert.equal((await parseSignedRequest(`${signature}.${payload}`, APP_SECRET)).user_id, '900000000000001');
  assert.equal(await parseSignedRequest(`${signature}.${payload}x`, APP_SECRET), null);
  assert.equal(await parseSignedRequest(`${signature}.${payload}`, 'outra'), null);
});

// --- Fluxos (CT-001 a CT-030 do briefing) ----------------------------------------

test('CT-030/US5: com os controles desligados (padrão), a seção mostra indisponível e não conecta', async () => {
  const { api, env, store } = setup();
  publish(store);
  const read = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply`), env);
  const { autoReply } = await read.json();
  assert.equal(autoReply.availability, 'platform_disabled');
  assert.equal(autoReply.settings.message, AUTO_REPLY_DEFAULT_MESSAGE);
  assert.equal(autoReply.settings.frequency, 'daily');
  const connectRes = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply/instagram/connect`, { method: 'POST', body: {} }), env);
  assert.equal(connectRes.status, 409);
  const missingEnv = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply`), {});
  assert.equal((await missingEnv.json()).autoReply.availability, 'unconfigured');
});

test('CT-001/RN-003: conectar conta elegível grava a conexão desligada, sem token na resposta', async () => {
  const { api, env, store, calls } = setup();
  publish(store);
  await openPlatform(api, env);
  const { state, authorizeUrl } = await connect(api, env);
  assert.ok(new URL(authorizeUrl).searchParams.get('redirect_uri').endsWith('/api/instagram/oauth/callback'));
  const location = await callback(api, env, { state, code: 'codigo-ficticio' });
  assert.equal(location.origin, PANEL);
  assert.equal(location.searchParams.get('autoResposta'), 'connected');
  assert.deepEqual(calls.subscribed, [BUSINESS_ID]);
  const read = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply`), env);
  const text = await read.text();
  assert.ok(!text.includes(ACCESS_TOKEN));
  const { autoReply } = JSON.parse(text);
  assert.equal(autoReply.connection.username, 'pizzaria.exemplo');
  assert.equal(autoReply.connection.status, 'connected');
  assert.equal(autoReply.settings.enabled, false);
  assert.equal(autoReply.enableBlocker, null);
  const stored = [...store.autoReply.credentials.values()][0].tokenCiphertext;
  assert.ok(stored.startsWith('v1.') && !stored.includes(ACCESS_TOKEN));
});

test('CT-002/CT-003: cancelar ou recusar a permissão de mensagens não grava conexão', async () => {
  const { api, env, store } = setup({ script: { scopes: ['instagram_basic'] } });
  publish(store);
  await openPlatform(api, env);
  let { state } = await connect(api, env);
  assert.equal((await callback(api, env, { state, error: 'access_denied', error_reason: 'user_denied' })).searchParams.get('autoResposta'), 'cancelled');
  ({ state } = await connect(api, env));
  assert.equal((await callback(api, env, { state, code: 'c' })).searchParams.get('autoResposta'), 'permission_missing');
  assert.equal(store.autoReply.connections.size, 0);
  const enable = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, {
    method: 'PUT', body: { enabled: true, message: AUTO_REPLY_DEFAULT_MESSAGE, frequency: 'daily', version: 0 }
  }), env);
  assert.equal(enable.status, 409);
  assert.equal((await enable.json()).error.code, 'AUTO_REPLY_CONNECTION_REQUIRED');
});

test('CT-004/CT-005/CT-019: state inválido, reutilizado ou de outra pessoa é recusado antes da Meta', async () => {
  const { api, env, store, calls } = setup();
  publish(store);
  await openPlatform(api, env);
  assert.equal((await callback(api, env, { state: 'x'.repeat(43), code: 'c' })).searchParams.get('autoResposta'), 'invalid_state');
  const { state } = await connect(api, env);
  assert.equal((await callback(api, env, { state, code: 'c' }, 'token-stranger')).searchParams.get('autoResposta'), 'invalid_state');
  assert.equal((await callback(api, env, { state, code: 'c' })).searchParams.get('autoResposta'), 'invalid_state');
  assert.deepEqual(calls.exchanged, []);
  for (const token of ['token-member', 'token-stranger']) {
    const res = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply/instagram/connect`, { method: 'POST', token, body: {} }), env);
    assert.equal(res.status, 404, token);
  }
  const outsider = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, { token: 'token-stranger' }), env);
  assert.equal(outsider.status, 404);
  const editorRead = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, { token: 'token-member' }), env);
  assert.equal((await editorRead.json()).autoReply.canManage, false);
  const editorSave = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, {
    method: 'PUT', token: 'token-member', body: { enabled: false, message: 'x', frequency: 'daily', version: 0 }
  }), env);
  assert.equal(editorSave.status, 404);
  const noOrigin = await api.fetch(request(`/api/sites/${SITE_A}/auto-reply/instagram/connect`, { method: 'POST', body: {}, origin: 'https://evil.example' }), env);
  assert.equal(noOrigin.status, 403);
});

test('CT-006/CT-007/CT-009/CT-010: mensagem elegível gera uma resposta; reentrega, eco e leitura não', async () => {
  const ctx = await ready();
  const res = await ctx.deliver(fixtures.message({ mid: 'mid-1' }));
  assert.equal(res.status, 200);
  assert.equal(ctx.calls.sent.length, 1);
  assert.equal(ctx.calls.sent[0].recipientId, CONSUMER_ID);
  assert.equal(ctx.calls.sent[0].accessToken, ACCESS_TOKEN);
  assert.ok(ctx.calls.sent[0].text.endsWith('https://vitrine.inspira.dev.br/pizzaria-exemplo'));
  await ctx.deliver(fixtures.message({ mid: 'mid-1' }));
  await ctx.deliver(fixtures.echo());
  await ctx.deliver(fixtures.read());
  await ctx.deliver(fixtures.reaction());
  assert.equal(ctx.calls.sent.length, 1);
  const deliveries = [...ctx.store.autoReply.deliveries.values()];
  assert.equal(deliveries.length, 1);
  assert.equal(deliveries[0].status, 'sent');
  assert.ok(!JSON.stringify(deliveries).includes(CONSUMER_ID));
  assert.ok(!JSON.stringify(deliveries).includes('cardápio'));
  const status = (await (await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`), ctx.env)).json()).autoReply;
  assert.ok(status.settings.lastSentAt);
});

test('CT-008/CT-016/CT-017: simultâneas respeitam a frequência; nova interação após 24 h gera nova resposta', async () => {
  const ctx = await ready();
  const { ctx: runtime, settle } = collector();
  await Promise.all([
    ctx.api.fetch(await signedWebhook(fixtures.message({ mid: 'sim-1' })), ctx.env, runtime),
    ctx.api.fetch(await signedWebhook(fixtures.message({ mid: 'sim-2' })), ctx.env, runtime)
  ]);
  await settle();
  assert.equal(ctx.calls.sent.length, 1);
  const reasons = [...ctx.store.autoReply.deliveries.values()].map((d) => d.reason ?? d.status).sort();
  assert.deepEqual(reasons, ['frequency', 'sent']);
  await ctx.deliver(fixtures.message({ mid: 'later-3h' }));
  assert.equal(ctx.calls.sent.length, 1);
  for (const [key, value] of ctx.store.autoReply.windows) ctx.store.autoReply.windows.set(key, value - 25 * 3600_000);
  await ctx.deliver(fixtures.message({ mid: 'after-25h' }));
  assert.equal(ctx.calls.sent.length, 2);
});

test('CT-011/CT-022/CT-029: desligada não envia; desligar durante o processamento cancela antes do envio', async () => {
  const ctx = await ready();
  const settings = ctx.store.autoReply.settings.get(SITE_A);
  const realTarget = ctx.store.getAutoReplyTarget;
  let reads = 0;
  ctx.store.getAutoReplyTarget = async (...args) => {
    reads += 1;
    if (reads === 2) settings.enabled = false;
    return realTarget.apply(ctx.store, args);
  };
  await ctx.deliver(fixtures.message({ mid: 'race-1' }));
  assert.equal(ctx.calls.sent.length, 0);
  const row = [...ctx.store.autoReply.deliveries.values()].find((d) => d.eventId === 'race-1');
  assert.deepEqual([row.status, row.reason], ['cancelled', 'auto_reply_disabled']);
  assert.equal(ctx.store.autoReply.windows.size, 0);
  ctx.store.getAutoReplyTarget = realTarget;
  await ctx.deliver(fixtures.message({ mid: 'off-2' }));
  assert.equal(ctx.calls.sent.length, 0);
});

test('CT-012/CT-013: token expirado ou revogado suspende e pede reconexão; reconectar a mesma conta volta a conectar', async () => {
  const ctx = await ready({ script: { sendResults: [new MetaApiError('token_invalid', { status: 400, code: 190 })] } });
  await ctx.deliver(fixtures.message({ mid: 'tok-1' }));
  const read = (await (await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`), ctx.env)).json()).autoReply;
  assert.equal(read.connection.status, 'reconnect_required');
  assert.equal(read.settings.enabled, false);
  assert.equal(ctx.store.autoReply.windows.size, 0);
  const { state } = await connect(ctx.api, ctx.env);
  assert.equal((await callback(ctx.api, ctx.env, { state, code: 'novo' })).searchParams.get('autoResposta'), 'connected');
  const after = (await (await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`), ctx.env)).json()).autoReply;
  assert.equal(after.connection.status, 'connected');
  assert.equal(after.settings.enabled, false);
});

test('CT-014/CT-015/CT-024: domínio novo reflete no envio; despublicada não envia', async () => {
  const ctx = await ready();
  const site = ctx.store.sites.get(SITE_A);
  site.customDomainAllowed = true;
  ctx.store.autoReply.customDomains.set(SITE_A, [{ hostname: 'www.pizzariaexemplo.com.br', status: 'active', ssl_status: 'active' }]);
  await ctx.deliver(fixtures.message({ mid: 'dom-1' }));
  assert.ok(ctx.calls.sent[0].text.endsWith('https://www.pizzariaexemplo.com.br'));
  ctx.store.autoReply.customDomains.set(SITE_A, [{ hostname: 'www.pizzariaexemplo.com.br', status: 'active', ssl_status: 'pending' }]);
  ctx.store.autoReply.windows.clear();
  await ctx.deliver(fixtures.message({ mid: 'dom-2' }));
  assert.ok(ctx.calls.sent[1].text.endsWith('https://vitrine.inspira.dev.br/pizzaria-exemplo'));
  ctx.store.publicationsBySlug.delete('pizzaria-exemplo');
  ctx.store.autoReply.windows.clear();
  await ctx.deliver(fixtures.message({ mid: 'unpub-3' }));
  assert.equal(ctx.calls.sent.length, 2);
  const row = [...ctx.store.autoReply.deliveries.values()].find((d) => d.eventId === 'unpub-3');
  assert.deepEqual([row.status, row.reason], ['skipped', 'site_not_published']);
  assert.equal(ctx.store.autoReply.windows.size, 0);
});

test('CT-018: assinatura inválida é rejeitada sem gravar nada', async () => {
  const ctx = await ready();
  const res = await ctx.api.fetch(await signedWebhook(fixtures.message({ mid: 'forjada' }), 'chave-errada'), ctx.env);
  assert.equal(res.status, 401);
  assert.equal(ctx.store.autoReply.deliveries.size, 0);
  const challenge = await ctx.api.fetch(new Request(`${PANEL}/api/webhooks/meta/instagram?hub.mode=subscribe&hub.verify_token=verificacao-teste&hub.challenge=42`), ctx.env);
  assert.equal(await challenge.text(), '42');
  const wrong = await ctx.api.fetch(new Request(`${PANEL}/api/webhooks/meta/instagram?hub.mode=subscribe&hub.verify_token=x&hub.challenge=42`), ctx.env);
  assert.equal(wrong.status, 403);
});

test('CT-020/CT-021: Meta indisponível e limite de requisições: 3 tentativas controladas e frequência liberada', async () => {
  const limited = new MetaApiError('rate_limited', { status: 429, code: 4 });
  const ctx = await ready({ script: { sendResults: [limited, limited, limited] } });
  await ctx.deliver(fixtures.message({ mid: 'rl-1' }));
  assert.equal(ctx.calls.sent.length, 3);
  const row = [...ctx.store.autoReply.deliveries.values()][0];
  assert.deepEqual([row.status, row.reason, row.attempts], ['failed', 'rate_limited', 3]);
  assert.equal(ctx.store.autoReply.windows.size, 0);
  const flaky = await ready({ script: { sendResults: [new MetaApiError('unavailable', { status: 503 })] } });
  await flaky.deliver(fixtures.message({ mid: 'flaky-1' }));
  assert.equal(flaky.calls.sent.length, 2);
  assert.equal([...flaky.store.autoReply.deliveries.values()][0].status, 'sent');
});

test('CT-026: resultado incerto não é reenviado e mantém a vaga de frequência', async () => {
  const ctx = await ready({ script: { sendResults: [new MetaApiError('uncertain')] } });
  await ctx.deliver(fixtures.message({ mid: 'unc-1' }));
  await ctx.deliver(fixtures.message({ mid: 'unc-1' }));
  assert.equal(ctx.calls.sent.length, 1);
  const row = [...ctx.store.autoReply.deliveries.values()][0];
  assert.deepEqual([row.status, row.reason], ['uncertain', 'send_uncertain']);
  assert.equal(ctx.store.autoReply.windows.size, 1);
});

test('CT-023/US4: desconectar cancela a assinatura, apaga credencial e barra envios', async () => {
  const ctx = await ready();
  const res = await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply/instagram/connection`, { method: 'DELETE' }), ctx.env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.webhookRemoved, true);
  assert.equal(body.autoReply.connection, null);
  assert.equal(body.autoReply.settings.enabled, false);
  assert.deepEqual(ctx.calls.unsubscribed, [BUSINESS_ID]);
  assert.equal(ctx.store.autoReply.credentials.size, 0);
  await ctx.deliver(fixtures.message({ mid: 'after-disconnect' }));
  assert.equal(ctx.calls.sent.length, 0);
  assert.ok(ctx.store.autoReply.audit.some((entry) => entry.action === 'channel_disconnect' && entry.actor === OWNER_A));
});

test('CT-025/RN-009: a mesma conta não responde por duas vitrines', async () => {
  const ctx = await ready();
  publish(ctx.store, 'outra-vitrine');
  await ctx.api.fetch(request(`/api/admin/auto-reply/sites/${SITE_B}`, { method: 'PUT', token: 'token-stranger', body: { allowed: true } }), ctx.env);
  const { state } = await connect(ctx.api, ctx.env, { token: 'token-stranger', siteId: SITE_B });
  const location = await callback(ctx.api, ctx.env, { state, code: 'c' }, 'token-stranger');
  assert.equal(location.searchParams.get('autoResposta'), 'account_in_use');
  assert.equal(ctx.store.autoReply.connections.size, 1);
});

test('CT-027/CT-028: mensagem sem variável recebe o link uma vez; com o link escrito, não duplica', async () => {
  const ctx = await ready({ message: 'Oi! Somos a {{vitrine.nome}}.' });
  assert.equal(ctx.status.preview, 'Oi! Somos a Pizzaria Exemplo.\n\nhttps://vitrine.inspira.dev.br/pizzaria-exemplo');
  await ctx.deliver(fixtures.message({ mid: 'var-1' }));
  assert.equal(ctx.calls.sent[0].text, ctx.status.preview);
  const save = await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, {
    method: 'PUT', body: { enabled: true, message: 'Veja https://vitrine.inspira.dev.br/pizzaria-exemplo', frequency: 'daily', version: ctx.status.settings.version }
  }), ctx.env);
  const preview = (await save.json()).autoReply.preview;
  assert.equal(preview.split('https://vitrine.inspira.dev.br/pizzaria-exemplo').length, 2);
});

test('versão antiga não sobrescreve; mensagem inválida e frequência desconhecida são recusadas', async () => {
  const ctx = await ready();
  const stale = await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, {
    method: 'PUT', body: { enabled: false, message: 'Oi', frequency: 'daily', version: 0 }
  }), ctx.env);
  assert.equal(stale.status, 409);
  assert.equal((await stale.json()).error.code, 'AUTO_REPLY_VERSION_CONFLICT');
  const longMsg = await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, {
    method: 'PUT', body: { enabled: false, message: 'a'.repeat(1001), frequency: 'daily', version: ctx.status.settings.version }
  }), ctx.env);
  assert.equal(longMsg.status, 422);
  const freq = await ctx.api.fetch(request(`/api/sites/${SITE_A}/auto-reply`, {
    method: 'PUT', body: { enabled: false, message: 'Oi', frequency: 'hourly', version: ctx.status.settings.version }
  }), ctx.env);
  assert.equal((await freq.json()).error.code, 'AUTO_REPLY_FREQUENCY_INVALID');
});

test('US5: administração só para platform_admin; suspender e desligar global barram envios na hora', async () => {
  const ctx = await ready();
  const denied = await ctx.api.fetch(request('/api/admin/auto-reply'), ctx.env);
  assert.equal(denied.status, 403);
  await ctx.deliver(fixtures.message({ mid: 'adm-1' }));
  const overview = (await (await ctx.api.fetch(request('/api/admin/auto-reply', { token: 'token-stranger' }), ctx.env)).json()).autoReply;
  assert.equal(overview.connections.length, 1);
  assert.equal(overview.last7Days.sent, 1);
  assert.ok(!JSON.stringify(overview).includes(ACCESS_TOKEN));
  await ctx.api.fetch(request('/api/admin/auto-reply/controls', { method: 'PUT', token: 'token-stranger', body: { enabled: false } }), ctx.env);
  ctx.store.autoReply.windows.clear();
  await ctx.deliver(fixtures.message({ mid: 'adm-2' }));
  assert.equal(ctx.calls.sent.length, 1);
  assert.equal([...ctx.store.autoReply.deliveries.values()].find((d) => d.eventId === 'adm-2').reason, 'platform_disabled');
  await ctx.api.fetch(request('/api/admin/auto-reply/controls', { method: 'PUT', token: 'token-stranger', body: { enabled: true } }), ctx.env);
  const suspend = await ctx.api.fetch(request(`/api/admin/auto-reply/connections/${overview.connections[0].connectionId}/suspend`, {
    method: 'POST', token: 'token-stranger', body: {}
  }), ctx.env);
  assert.equal(suspend.status, 200);
  await ctx.deliver(fixtures.message({ mid: 'adm-3' }));
  assert.equal(ctx.calls.sent.length, 1);
});

test('lote grande: até 5 eventos por requisição e 503 para a Meta reentregar o resto', async () => {
  const ctx = await ready();
  const first = await ctx.deliver(fixtures.batch(7));
  assert.equal(first.status, 503);
  assert.equal(ctx.store.autoReply.deliveries.size, 5);
  const second = await ctx.deliver(fixtures.batch(7));
  assert.equal(second.status, 200);
  assert.equal(ctx.store.autoReply.deliveries.size, 7);
  assert.equal(ctx.calls.sent.length, 7);
});

test('desautorização e exclusão de dados da Meta desconectam e devolvem código de confirmação', async () => {
  const ctx = await ready();
  const payload = toBase64Url(new TextEncoder().encode(JSON.stringify({ algorithm: 'HMAC-SHA256', user_id: '900000000000001' })));
  const signature = toBase64Url(Uint8Array.from((await hmacSha256Hex(APP_SECRET, payload)).match(/../g), (h) => parseInt(h, 16)));
  const res = await ctx.api.fetch(new Request(`${PANEL}/api/instagram/data-deletion`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ signed_request: `${signature}.${payload}` })
  }), ctx.env);
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.match(body.confirmation_code, /^[A-Za-z0-9_-]{16}$/);
  assert.ok(body.url.startsWith('https://vitrine.inspira.dev.br/privacidade/'));
  assert.equal(ctx.store.autoReply.connections.size, 0);
  const bad = await ctx.api.fetch(new Request(`${PANEL}/api/instagram/deauthorize`, {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ signed_request: `${signature}.x${payload}` })
  }), ctx.env);
  assert.equal(bad.status, 400);
});

test('manutenção: token inválido na verificação periódica pede reconexão', async () => {
  const ctx = await ready();
  const conn = [...ctx.store.autoReply.connections.values()][0];
  ctx.store.autoReplyMaintenance = async () => ({
    stale: 0, purged: 0, windows: 0,
    verify: [{ connectionId: conn.id, siteId: SITE_A, provider: 'instagram', accountId: BUSINESS_ID,
      tokenCiphertext: ctx.store.autoReply.credentials.get(conn.id).tokenCiphertext }]
  });
  const result = await runAutoReplyMaintenance({
    store: ctx.store, env: ctx.env,
    adapter: { inspectToken: async (token) => ({ valid: token !== ACCESS_TOKEN, scopes: [], expiresAt: null }) }
  });
  assert.equal(result.revoked, 1);
  assert.equal(conn.status, 'reconnect_required');
});

test('logs: nenhum token, segredo, texto ou identificador de consumidor', async () => {
  const lines = [];
  const original = { log: console.log, error: console.error };
  console.log = (...args) => lines.push(args.join(' '));
  console.error = (...args) => lines.push(args.join(' '));
  try {
    const ctx = await ready({ script: { sendResults: [new MetaApiError('token_invalid', { status: 400, code: 190 })] } });
    await ctx.deliver(fixtures.message({ mid: 'log-1' }));
    await ctx.api.fetch(await signedWebhook(fixtures.message({ mid: 'log-2' }), 'errada'), ctx.env);
  } finally {
    console.log = original.log;
    console.error = original.error;
  }
  const all = lines.join('\n');
  assert.ok(lines.some((line) => line.includes('auto_reply_processed')));
  for (const secret of [ACCESS_TOKEN, APP_SECRET, CONSUMER_ID, 'cardápio', 'codigo-ficticio']) {
    assert.ok(!all.includes(secret), secret);
  }
});
