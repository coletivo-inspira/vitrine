// Rotas da AutoResposta (specs/019-autoresposta/contracts/). workers/api.mjs só chama
// matchAutoReplyRoute, handleAutoReplyRoute e runAutoReplyMaintenance.
import { PortalValidationError } from '../portal-validation.mjs';
import {
  AUTO_REPLY_DEFAULT_FREQUENCY,
  AUTO_REPLY_DEFAULT_MESSAGE,
  AUTO_REPLY_MAX_BYTES,
  normalizeAutoReplyFrequency,
  renderAutoReplyMessage,
  validateAutoReplyTemplate
} from '../../web/assets/auto-reply-message.mjs';
import {
  AUTO_REPLY_KEY_ENV,
  decryptChannelToken,
  encryptChannelToken,
  fromBase64Url,
  hasAutoReplyKey,
  randomToken,
  recipientHash,
  sha256Hex,
  verifyHmacSha256
} from './crypto.mjs';
import { REQUIRED_SCOPES, createInstagramAdapter, hasMetaConfig, metaConfig } from './instagram-adapter.mjs';
import {
  MAX_WEBHOOK_BYTES,
  SIGNATURE_HEADER,
  normalizeInstagramWebhook,
  summarizeIgnored,
  verifyMetaSignature,
  verifyWebhookChallenge
} from './instagram-webhook.mjs';
import { logAutoReply, processClaimedEvent } from './processor.mjs';
import { resolveAutoReplyPublicUrl } from './public-url.mjs';
import { blockingReason } from './rules.mjs';
import { autoReplyUnavailableError } from './store.mjs';

export const AUTO_REPLY_MANAGER_ROLES = Object.freeze(['owner', 'admin']);
export const AUTO_REPLY_VIEWER_ROLES = Object.freeze(['owner', 'admin', 'editor', 'viewer']);
export const OAUTH_CALLBACK_PATH = '/api/instagram/oauth/callback';
export const WEBHOOK_PATH = '/api/webhooks/meta/instagram';
export const DEAUTHORIZE_PATH = '/api/instagram/deauthorize';
export const DATA_DELETION_PATH = '/api/instagram/data-deletion';
export const OAUTH_STATE_TTL_SECONDS = 600;
export const MAX_EVENTS_PER_REQUEST = 5;
export const MAX_CLAIM_ATTEMPTS_PER_REQUEST = 12;
const SITE_PATH = /^\/api\/sites\/([^/]+)\/auto-reply(?:\/instagram\/(connect|connection))?\/?$/;
const ADMIN_PATH = /^\/api\/admin\/auto-reply(?:\/(controls|sites\/([^/]+)|connections\/([^/]+)\/suspend))?\/?$/;
const NO_STORE = Object.freeze({ 'cache-control': 'no-store' });
const PROVIDER = 'instagram';

export function matchAutoReplyRoute(pathname) {
  const site = SITE_PATH.exec(pathname);
  if (site) return { kind: 'site', siteId: decodeURIComponent(site[1]), action: site[2] ?? null };
  if (pathname === OAUTH_CALLBACK_PATH) return { kind: 'oauth_callback' };
  if (pathname === WEBHOOK_PATH) return { kind: 'webhook' };
  if (pathname === DEAUTHORIZE_PATH) return { kind: 'deauthorize' };
  if (pathname === DATA_DELETION_PATH) return { kind: 'data_deletion' };
  const admin = ADMIN_PATH.exec(pathname);
  if (admin) {
    if (!admin[1]) return { kind: 'admin', action: 'overview' };
    if (admin[1] === 'controls') return { kind: 'admin', action: 'controls' };
    if (admin[2]) return { kind: 'admin', action: 'site', siteId: decodeURIComponent(admin[2]) };
    return { kind: 'admin', action: 'suspend', connectionId: decodeURIComponent(admin[3]) };
  }
  return null;
}

function usesMemoryStore(store) {
  return Boolean(store?.autoReply);
}

/** Ambiente pronto: app Meta, chave de cifragem e acesso de serviço ao banco. */
export function autoReplyEnvironmentReady(env = {}, store = null) {
  return hasMetaConfig(env) && hasAutoReplyKey(env) && (usesMemoryStore(store) || Boolean(env.SUPABASE_SERVICE_ROLE_KEY));
}

function portalOriginFrom(env, fallback) {
  return String(env.PORTAL_ORIGIN ?? fallback ?? 'https://painel.inspira.dev.br').replace(/\/+$/, '');
}

function redirectUriFrom(env, portalOrigin) {
  return `${portalOriginFrom(env, portalOrigin)}${OAUTH_CALLBACK_PATH}`;
}

function notFound() {
  return new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
}

/** Resposta do painel: estado, mensagem atual, endereço e prévia; nunca token. */
export function presentAutoReply(raw, { role, env = {}, ready = true } = {}) {
  const connection = raw?.connection ?? null;
  const settings = raw?.settings ?? {
    enabled: false, message: AUTO_REPLY_DEFAULT_MESSAGE, frequency: AUTO_REPLY_DEFAULT_FREQUENCY, version: 0,
    enabledAt: null, lastSentAt: null
  };
  const resolved = resolveAutoReplyPublicUrl(raw?.site, env);
  const controls = raw?.controls ?? {};
  const availability = !ready
    ? 'unconfigured'
    : !(controls.enabled && controls.instagramEnabled)
      ? 'platform_disabled'
      : raw?.siteAllowed
        ? 'available'
        : 'not_allowed';
  const enableBlocker = availability !== 'available'
    ? availability
    : !connection
      ? 'not_connected'
      : blockingReason({ ...raw, status: connection?.status, scopes: connection?.scopes, settings: { enabled: true } })
      ?? (resolved.url ? null : resolved.reason);
  return {
    role,
    canManage: AUTO_REPLY_MANAGER_ROLES.includes(role),
    availability,
    connection: connection && {
      provider: connection.provider,
      username: connection.username ?? null,
      displayName: connection.displayName ?? null,
      status: connection.status,
      statusReason: connection.statusReason ?? null,
      hasMessagingPermission: Array.isArray(connection.scopes) && connection.scopes.includes('instagram_manage_messages'),
      webhookSubscribed: connection.webhookSubscribed === true,
      connectedAt: connection.connectedAt ?? null,
      expiresAt: connection.expiresAt ?? null,
      lastEventAt: connection.lastEventAt ?? null
    },
    settings: {
      enabled: settings.enabled === true,
      message: settings.message,
      frequency: settings.frequency ?? AUTO_REPLY_DEFAULT_FREQUENCY,
      version: settings.version ?? 0,
      enabledAt: settings.enabledAt ?? null,
      lastSentAt: settings.lastSentAt ?? null
    },
    publicUrl: resolved.url ?? null,
    publicUrlReason: resolved.url ? null : resolved.reason,
    preview: resolved.url ? renderAutoReplyMessage(settings.message, { name: raw?.site?.name ?? '', url: resolved.url }).text : null,
    enableBlocker,
    limits: { maxBytes: AUTO_REPLY_MAX_BYTES }
  };
}

async function requireSite(store, siteId, user, roles) {
  const site = await store.getSite(siteId, user.id, { token: user.token });
  if (!site || !roles.includes(site.role)) throw notFound();
  return site;
}

async function readPresented(store, siteId, user, role, env) {
  const raw = await store.readAutoReply(siteId, { token: user.token, env, userId: user.id });
  return { autoReply: presentAutoReply(raw, { role, env, ready: autoReplyEnvironmentReady(env, store) }) };
}

function oauthRedirect(env, portalOrigin, result, siteId) {
  const target = new URL(`${portalOriginFrom(env, portalOrigin)}/`);
  target.searchParams.set('autoResposta', result);
  if (siteId) target.searchParams.set('vitrine', siteId);
  return new Response(null, {
    status: 302,
    headers: { location: target.href, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' }
  });
}

async function handleSite({ route, request, url, method, store, env, deps }) {
  const user = await deps.resolveUser();
  if (!user) throw new PortalValidationError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  const { siteId } = route;

  if (!route.action) {
    if (method === 'GET') {
      const site = await requireSite(store, siteId, user, AUTO_REPLY_VIEWER_ROLES);
      return deps.respond(200, await readPresented(store, siteId, user, site.role, env), NO_STORE);
    }
    if (method !== 'PUT') throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Use GET ou PUT.');
    const guard = deps.guardMutation(request, url, { requireOrigin: true, requireJson: true });
    if (guard) return guard;
    const site = await requireSite(store, siteId, user, AUTO_REPLY_MANAGER_ROLES);
    const { parsed } = await deps.readJson(request);
    const frequency = normalizeAutoReplyFrequency(parsed?.frequency ?? AUTO_REPLY_DEFAULT_FREQUENCY);
    if (!frequency) {
      throw new PortalValidationError(422, 'AUTO_REPLY_FREQUENCY_INVALID', 'Escolha uma das frequências.', { field: 'frequency' });
    }
    const message = String(parsed?.message ?? '').replace(/\r\n?/g, '\n').trim();
    const raw = await store.readAutoReply(siteId, { token: user.token, env, userId: user.id });
    const resolved = resolveAutoReplyPublicUrl(raw?.site, env);
    const errors = validateAutoReplyTemplate(message, {
      name: raw?.site?.name ?? site.name ?? '',
      url: resolved.url ?? `https://vitrine.inspira.dev.br/${site.slug ?? ''}`
    });
    if (errors.length) {
      throw new PortalValidationError(422, errors[0].code, errors[0].message, { field: 'message', fieldErrors: errors });
    }
    if (parsed?.enabled === true && !autoReplyEnvironmentReady(env, store)) throw autoReplyUnavailableError();
    await store.saveAutoReplySettings(siteId, {
      enabled: parsed?.enabled === true,
      message,
      frequency,
      expectedVersion: Number.isInteger(parsed?.version) ? parsed.version : 0
    }, { token: user.token, env, userId: user.id });
    return deps.respond(200, await readPresented(store, siteId, user, site.role, env), NO_STORE);
  }

  if (route.action === 'connect') {
    if (method !== 'POST') throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Use POST para conectar.');
    const guard = deps.guardMutation(request, url, { requireOrigin: true, requireJson: true });
    if (guard) return guard;
    await requireSite(store, siteId, user, AUTO_REPLY_MANAGER_ROLES);
    if (!autoReplyEnvironmentReady(env, store)) throw autoReplyUnavailableError();
    const raw = await store.readAutoReply(siteId, { token: user.token, env, userId: user.id });
    const availability = presentAutoReply(raw, { env }).availability;
    if (availability !== 'available') {
      throw new PortalValidationError(409, 'AUTO_REPLY_NOT_AVAILABLE', 'A resposta automática ainda não está liberada para esta vitrine.');
    }
    const nonce = randomToken(32);
    await store.createOAuthState({
      nonceHash: await sha256Hex(nonce), siteId, userId: user.id, provider: PROVIDER, purpose: 'auto_reply',
      ttlSeconds: OAUTH_STATE_TTL_SECONDS
    }, { env });
    const adapter = deps.adapterFor(env);
    return deps.respond(200, {
      authorizeUrl: adapter.buildAuthorizeUrl({ state: nonce, redirectUri: redirectUriFrom(env, deps.portalOrigin) }),
      expiresInSeconds: OAUTH_STATE_TTL_SECONDS
    }, NO_STORE);
  }

  if (method !== 'DELETE') throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Use DELETE para desconectar.');
  const guard = deps.guardMutation(request, url, { requireOrigin: true, requireJson: false });
  if (guard) return guard;
  const site = await requireSite(store, siteId, user, AUTO_REPLY_MANAGER_ROLES);
  if (!usesMemoryStore(store) && !env.SUPABASE_SERVICE_ROLE_KEY) throw autoReplyUnavailableError();
  const credential = await store.getChannelCredential(siteId, PROVIDER, { env });
  let webhookRemoved = null;
  if (credential && hasMetaConfig(env) && hasAutoReplyKey(env)) {
    try {
      const token = await decryptChannelToken(credential.tokenCiphertext, {
        siteId, provider: PROVIDER, accountId: credential.accountId
      }, env[AUTO_REPLY_KEY_ENV]);
      webhookRemoved = await deps.adapterFor(env).unsubscribeWebhooks(credential.accountId, token);
    } catch {
      webhookRemoved = false;
    }
  }
  await store.disconnectChannel(siteId, PROVIDER, user.id, 'owner_disconnect', { env });
  logAutoReply('auto_reply_disconnected', { provider: PROVIDER, webhookRemoved });
  return deps.respond(200, { ...(await readPresented(store, siteId, user, site.role, env)), webhookRemoved }, NO_STORE);
}

function pickAccount(accounts, currentAccountId) {
  if (currentAccountId) {
    const same = accounts.find((account) => account.id === currentAccountId);
    if (same) return { account: same };
    return accounts.length ? { error: 'account_mismatch' } : { error: 'no_account' };
  }
  if (accounts.length === 1) return { account: accounts[0] };
  return { error: accounts.length ? 'multiple_accounts' : 'no_account' };
}

async function handleOAuthCallback({ url, method, store, env, deps }) {
  if (method !== 'GET') throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
  const redirect = (result, siteId) => {
    logAutoReply('auto_reply_oauth_result', { provider: PROVIDER, result });
    return oauthRedirect(env, deps.portalOrigin, result, siteId);
  };
  const state = url.searchParams.get('state') ?? '';
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(state) || !autoReplyEnvironmentReady(env, store)) return redirect('invalid_state');
  const row = await store.consumeOAuthState(await sha256Hex(state), { env });
  if (!row || row.provider !== PROVIDER || row.purpose !== 'auto_reply') return redirect('invalid_state');
  const user = await deps.resolveUser();
  if (!user || user.id !== row.userId) return redirect('invalid_state');
  const site = await store.getSite(row.siteId, user.id, { token: user.token });
  if (!site || !AUTO_REPLY_MANAGER_ROLES.includes(site.role)) return redirect('invalid_state');
  if (url.searchParams.has('error')) {
    return redirect(url.searchParams.get('error_reason') === 'user_denied' || url.searchParams.get('error') === 'access_denied'
      ? 'cancelled' : 'meta_error', row.siteId);
  }
  const code = url.searchParams.get('code') ?? '';
  if (!code || code.length > 2048) return redirect('invalid_callback', row.siteId);

  const adapter = deps.adapterFor(env);
  const redirectUri = redirectUriFrom(env, deps.portalOrigin);
  let accessToken;
  let inspection;
  let accounts;
  try {
    ({ accessToken } = await adapter.exchangeCode({ code, redirectUri }));
    inspection = await adapter.inspectToken(accessToken);
    if (!inspection.valid || !inspection.appMatches) return redirect('meta_error', row.siteId);
    if (!REQUIRED_SCOPES.every((scope) => inspection.scopes.includes(scope))) return redirect('permission_missing', row.siteId);
    accounts = await adapter.listAssignedAccounts(accessToken);
  } catch {
    return redirect('meta_error', row.siteId);
  }
  const current = await store.readAutoReply(row.siteId, { token: user.token, env, userId: user.id });
  const picked = pickAccount(accounts, current?.connection?.accountId ?? null);
  if (picked.error) return redirect(picked.error, row.siteId);

  let webhookSubscribed = false;
  try {
    webhookSubscribed = await adapter.subscribeWebhooks(picked.account.id, accessToken);
  } catch {
    webhookSubscribed = false;
  }
  try {
    await store.saveChannelConnection({
      siteId: row.siteId,
      actor: user.id,
      provider: PROVIDER,
      accountId: picked.account.id,
      businessId: inspection.businessId,
      username: picked.account.username,
      displayName: picked.account.name,
      scopes: inspection.scopes,
      tokenCiphertext: await encryptChannelToken(accessToken, {
        siteId: row.siteId, provider: PROVIDER, accountId: picked.account.id
      }, env[AUTO_REPLY_KEY_ENV]),
      expiresAt: inspection.expiresAt,
      webhookSubscribed
    }, { env });
  } catch (error) {
    if (error?.code === 'CHANNEL_ACCOUNT_IN_USE') return redirect('account_in_use', row.siteId);
    if (error?.code === 'CHANNEL_ACCOUNT_MISMATCH') return redirect('account_mismatch', row.siteId);
    throw error;
  }
  return redirect(webhookSubscribed ? 'connected' : 'connected_without_webhook', row.siteId);
}

async function readRawBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_WEBHOOK_BYTES) return null;
  const buffer = new Uint8Array(await request.arrayBuffer());
  return buffer.byteLength > MAX_WEBHOOK_BYTES ? null : buffer;
}

async function handleWebhook({ request, url, method, store, env, ctx, deps }) {
  const text = (status, body) => new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', ...NO_STORE } });
  if (method === 'GET') {
    const challenge = verifyWebhookChallenge(url.searchParams, env.META_WEBHOOK_VERIFY_TOKEN);
    return challenge ? text(200, challenge) : text(403, 'forbidden');
  }
  if (method !== 'POST') return text(405, 'method not allowed');
  const raw = await readRawBody(request);
  if (!raw) return text(413, 'payload too large');
  const { appSecret } = metaConfig(env);
  if (!(await verifyMetaSignature(raw, request.headers.get(SIGNATURE_HEADER), appSecret))) {
    logAutoReply('auto_reply_webhook_rejected', { reason: 'invalid_signature' });
    return text(401, 'invalid signature');
  }
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    logAutoReply('auto_reply_webhook_rejected', { reason: 'invalid_json' });
    return text(400, 'invalid json');
  }
  const correlationId = crypto.randomUUID();
  const events = normalizeInstagramWebhook(payload);
  const eligible = events.filter((event) => event.eligible);
  if (!autoReplyEnvironmentReady(env, store)) {
    logAutoReply('auto_reply_webhook_received', { correlationId, events: events.length, eligible: eligible.length, ready: false });
    return text(200, 'EVENT_RECEIVED');
  }

  const targets = new Map();
  const claims = [];
  let duplicates = 0;
  let unknownAccounts = 0;
  let attempted = 0;
  try {
    for (const event of eligible) {
      if (claims.length >= MAX_EVENTS_PER_REQUEST || attempted >= MAX_CLAIM_ATTEMPTS_PER_REQUEST) break;
      attempted += 1;
      if (!targets.has(event.accountId)) targets.set(event.accountId, await store.getAutoReplyTarget(PROVIDER, event.accountId, { env }));
      const target = targets.get(event.accountId);
      if (!target?.connectionId) {
        unknownAccounts += 1;
        continue;
      }
      const hash = await recipientHash(target.connectionId, event.senderId, env[AUTO_REPLY_KEY_ENV]);
      const deliveryId = await store.claimAutoReplyEvent({
        provider: PROVIDER, eventId: event.eventId, siteId: target.siteId, connectionId: target.connectionId,
        recipientHash: hash, eventAt: event.eventAt, correlationId
      }, { env });
      if (!deliveryId) {
        duplicates += 1;
        continue;
      }
      claims.push({ deliveryId, provider: PROVIDER, event, target, recipientHash: hash, correlationId });
    }
  } catch {
    logAutoReply('auto_reply_webhook_store_failed', { correlationId });
    return text(500, 'retry later');
  }
  const deferred = attempted < eligible.length;

  logAutoReply('auto_reply_webhook_received', {
    correlationId, events: events.length, eligible: eligible.length, claimed: claims.length, duplicates,
    unknownAccounts, deferred, ignored: summarizeIgnored(events)
  });
  const adapter = deps.adapterFor(env);
  const work = Promise.allSettled(claims.map((claim) =>
    processClaimedEvent({ store, adapter, env, claim, wait: deps.wait }).catch(() => {
      logAutoReply('auto_reply_process_failed', { correlationId });
    })
  ));
  if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(work);
  else await work;
  return deferred ? text(503, 'partial; retry') : text(200, 'EVENT_RECEIVED');
}

/** `signed_request` da Meta: `<assinatura>.<payload>` em base64url, HMAC-SHA256 com a chave do app. */
export async function parseSignedRequest(signedRequest, appSecret) {
  const [signaturePart, payloadPart, extra] = String(signedRequest ?? '').split('.');
  if (!signaturePart || !payloadPart || extra !== undefined || !appSecret) return null;
  let signature;
  let payload;
  try {
    signature = fromBase64Url(signaturePart);
    payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadPart)));
  } catch {
    return null;
  }
  if (String(payload?.algorithm ?? '').toUpperCase() !== 'HMAC-SHA256') return null;
  if (!(await verifyHmacSha256(appSecret, payloadPart, signature))) return null;
  return payload;
}

async function handleMetaCallback({ route, request, method, store, env, deps }) {
  if (method !== 'POST') throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Use POST.');
  const form = await request.formData().catch(() => null);
  const payload = await parseSignedRequest(form?.get('signed_request'), metaConfig(env).appSecret);
  if (!payload) return deps.respond(400, { error: { code: 'INVALID_SIGNED_REQUEST', message: 'Pedido inválido.' } }, NO_STORE);
  const externalId = /^[0-9]{1,32}$/.test(String(payload.user_id ?? '')) ? String(payload.user_id) : null;
  let matched = 0;
  if (externalId && (usesMemoryStore(store) || env.SUPABASE_SERVICE_ROLE_KEY)) {
    for (const connection of await store.findChannelConnections(PROVIDER, externalId, { env })) {
      await store.disconnectChannel(connection.siteId, PROVIDER, null,
        route.kind === 'deauthorize' ? 'meta_deauthorize' : 'meta_data_deletion', { env });
      matched += 1;
    }
  }
  logAutoReply('auto_reply_meta_callback', { kind: route.kind, matched });
  if (route.kind === 'deauthorize') return deps.respond(200, { ok: true }, NO_STORE);
  const confirmationCode = randomToken(12);
  const publicOrigin = String(env.PUBLIC_SITE_ORIGIN ?? 'https://vitrine.inspira.dev.br').replace(/\/+$/, '');
  return deps.respond(200, {
    url: `${publicOrigin}/privacidade/?codigo=${confirmationCode}#exclusao-dados`,
    confirmation_code: confirmationCode
  }, NO_STORE);
}

async function handleAdmin({ route, request, url, method, store, deps }) {
  const user = await deps.resolveUser();
  if (!user) throw new PortalValidationError(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  const options = { token: user.token };
  if (!(await store.isPlatformAdmin?.(user.id, options))) {
    throw new PortalValidationError(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
  }
  if (route.action === 'overview') {
    if (method !== 'GET') throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Use GET.');
    return deps.respond(200, { autoReply: await store.readAutoReplyAdmin(options) }, NO_STORE);
  }
  const expected = route.action === 'suspend' ? 'POST' : 'PUT';
  if (method !== expected) throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', `Use ${expected}.`);
  const guard = deps.guardMutation(request, url, { requireOrigin: true, requireJson: true });
  if (guard) return guard;
  const { parsed } = await deps.readJson(request);
  let result;
  if (route.action === 'controls') {
    result = await store.setAutoReplyControls({
      enabled: typeof parsed?.enabled === 'boolean' ? parsed.enabled : undefined,
      instagramEnabled: typeof parsed?.instagramEnabled === 'boolean' ? parsed.instagramEnabled : undefined
    }, options);
  } else if (route.action === 'site') {
    if (typeof parsed?.allowed !== 'boolean') {
      throw new PortalValidationError(422, 'INVALID_ALLOWED', 'Informe allowed: true ou false.');
    }
    result = await store.setAutoReplySiteAccess(route.siteId, parsed.allowed, options);
  } else {
    result = await store.suspendChannelConnection(route.connectionId, options);
  }
  logAutoReply('auto_reply_admin_action', { action: route.action });
  return deps.respond(200, { autoReply: result }, NO_STORE);
}

/**
 * `deps`: `resolveUser`, `respond`, `guardMutation`, `readJson`, `portalOrigin`,
 * `fetch` (Meta) e, nos testes, `adapterFor` e `wait`.
 */
export async function handleAutoReplyRoute({ route, request, url, method, store, env = {}, ctx = {}, deps }) {
  const full = {
    adapterFor: (currentEnv) => createInstagramAdapter({ env: currentEnv, fetch: deps.fetch }),
    ...deps
  };
  if (typeof store?.readAutoReply !== 'function') {
    if (route.kind === 'webhook' && method === 'GET') return handleWebhook({ request, url, method, store, env, ctx, deps: full });
    throw autoReplyUnavailableError();
  }
  if (route.kind === 'site') return handleSite({ route, request, url, method, store, env, deps: full });
  if (route.kind === 'oauth_callback') return handleOAuthCallback({ url, method, store, env, deps: full });
  if (route.kind === 'webhook') return handleWebhook({ request, url, method, store, env, ctx, deps: full });
  if (route.kind === 'deauthorize' || route.kind === 'data_deletion') {
    return handleMetaCallback({ route, request, method, store, env, deps: full });
  }
  return handleAdmin({ route, request, url, method, store, deps: full });
}

/** Cron: execuções presas → inconclusivas, retenção e verificação de tokens em lote pequeno. */
export async function runAutoReplyMaintenance({ store, env = {}, fetch: fetchImpl, adapter } = {}) {
  if (typeof store?.autoReplyMaintenance !== 'function' || !autoReplyEnvironmentReady(env, store)) return null;
  const result = await store.autoReplyMaintenance({ env });
  const provider = adapter ?? createInstagramAdapter({ env, fetch: fetchImpl });
  let verified = 0;
  let revoked = 0;
  for (const item of Array.isArray(result?.verify) ? result.verify : []) {
    try {
      const token = await decryptChannelToken(item.tokenCiphertext, {
        siteId: item.siteId, provider: item.provider ?? PROVIDER, accountId: item.accountId
      }, env[AUTO_REPLY_KEY_ENV]);
      const inspection = await provider.inspectToken(token);
      if (!inspection.valid) {
        await store.markChannelConnection(item.connectionId, 'reconnect_required', 'token_invalid', { env });
        revoked += 1;
      } else if (!REQUIRED_SCOPES.every((scope) => inspection.scopes.includes(scope))) {
        await store.markChannelConnection(item.connectionId, 'reconnect_required', 'permission_missing', { env });
        revoked += 1;
      } else {
        await store.touchChannelConnection(item.connectionId, { expiresAt: inspection.expiresAt, scopes: inspection.scopes }, { env });
        verified += 1;
      }
    } catch {
      // A próxima execução tenta de novo.
    }
  }
  logAutoReply('auto_reply_maintenance', { stale: result?.stale ?? 0, purged: result?.purged ?? 0, verified, revoked });
  return { ...result, verify: undefined, verified, revoked };
}
