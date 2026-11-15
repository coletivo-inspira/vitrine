// Pré-orçamento com webhook assinado (issue #121). Segue o padrão HMAC do contrato do
// feed (docs/instagram/interface-publica-feed.md): `X-Vitrine-Signature: sha256=<hex>`
// sobre `${timestamp}.${corpo}`. O segredo é gerado aqui, mostrado uma vez e guardado
// cifrado (AES-GCM, chave de ambiente QUOTE_WEBHOOK_ENCRYPTION_KEY, dados associados =
// id da vitrine). Nada do pré-orçamento é gravado: só o último status e contadores.
// workers/api.mjs só chama as funções exportadas daqui.
import { hasPlanFeature, loadSiteEntitlements, planFeatureRequiredError, requirePlanFeature } from './entitlements.mjs';
import { paidFeatureGoneResponse } from './billing/lifecycle.mjs';
import { readPublicSiteState } from './site-lifecycle.mjs';
import { PortalValidationError, assertNoDangerousTextPayload, validateSafePublicHttpsUrl } from './portal-validation.mjs';
import {
  QUOTE_LEAD_FIELDS,
  QUOTE_LEAD_MAX_ITEMS,
  QUOTE_LEAD_MAX_QUANTITY,
  QUOTE_LEAD_TEXT_MAX,
  isValidLeadDate,
  quoteLeadConsentText,
  quoteLeadFields,
  validateQuoteLeadConfig
} from '../web/assets/quote-lead.mjs';

export * from '../web/assets/quote-lead.mjs';

export const QUOTE_WEBHOOK_FEATURE = 'quote_webhook';
export const QUOTE_WEBHOOK_ROLES = Object.freeze(['owner', 'admin']);
export const QUOTE_WEBHOOK_PATH = /^\/api\/sites\/([^/]+)\/quote-webhook(?:\/(secret|test))?\/?$/;
export const LEADS_PATH = /^\/api\/sites\/([a-z0-9]+(?:-[a-z0-9]+)*)\/leads\/?$/;
export const LEAD_EVENT = 'quote.lead.created';
export const TEST_EVENT = 'quote.lead.test';
export const MAX_LEAD_BYTES = 4096;
export const DELIVERY_MAX_ATTEMPTS = 3;
export const DELIVERY_TIMEOUT_MS = 5000;
export const DELIVERY_BACKOFF_MS = Object.freeze([500, 1500]);
export const LEAD_RATE_LIMIT = Object.freeze({ limit: 5, windowMs: 10 * 60 * 1000, maxKeys: 5000 });
export const SIGNATURE_HEADER = 'X-Vitrine-Signature';
export const TIMESTAMP_HEADER = 'X-Vitrine-Timestamp';
export const ENCRYPTION_KEY_ENV = 'QUOTE_WEBHOOK_ENCRYPTION_KEY';
export const MIN_ENCRYPTION_KEY_LENGTH = 32;

const PUBLIC_SITE_ORIGIN = 'https://vitrine.inspira.dev.br';
const PLATFORM_DOMAIN = 'inspira.dev.br';
const BLOCKED_SUFFIXES = Object.freeze(['.localhost', '.local', '.internal', '.lan', '.home.arpa', '.intranet']);
const NO_STORE = Object.freeze({ 'cache-control': 'no-store' });
const utf8 = new TextEncoder();

function webhookUrlError() {
  return new PortalValidationError(
    422,
    'INVALID_WEBHOOK_URL',
    'Use um endereço HTTPS público, sem IP privado, localhost ou endereços da plataforma.',
    { field: 'quoteWebhook.url' }
  );
}

function unavailableError(message = 'O pré-orçamento com webhook ainda não está disponível neste ambiente.') {
  return new PortalValidationError(503, 'QUOTE_WEBHOOK_UNAVAILABLE', message);
}

function isPrivateIpv4(host) {
  const parts = host.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return null;
  const [a, b, c] = parts;
  return (
    a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

/**
 * URL do webhook: só `https://` na porta 443, sem credenciais, com host público.
 * Recusa localhost, nomes sem ponto, sufixos internos, IPv4 privado ou reservado,
 * qualquer IPv6 literal e o próprio domínio da plataforma (`inspira.dev.br`).
 * O navegador do Worker normaliza formas como `0x7f.1` para `127.0.0.1` antes da checagem.
 */
export function validateQuoteWebhookUrl(rawUrl) {
  let href;
  try {
    href = validateSafePublicHttpsUrl(rawUrl);
  } catch {
    throw webhookUrlError();
  }
  const parsed = new URL(href);
  const host = parsed.hostname.toLowerCase().replace(/\.+$/, '');
  if (parsed.port && parsed.port !== '443') throw webhookUrlError();
  if (!host || host.startsWith('[') || host.includes(':')) throw webhookUrlError();
  const ipv4 = isPrivateIpv4(host);
  if (ipv4 === true) throw webhookUrlError();
  if (ipv4 === null) {
    if (!host.includes('.') || host === 'localhost') throw webhookUrlError();
    if (BLOCKED_SUFFIXES.some((suffix) => host.endsWith(suffix))) throw webhookUrlError();
    if (host === PLATFORM_DOMAIN || host.endsWith(`.${PLATFORM_DOMAIN}`)) throw webhookUrlError();
  }
  parsed.hash = '';
  return parsed.href;
}

function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function toBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text) {
  const padded = text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (text.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** 32 bytes aleatórios em hexadecimal; o destino usa este texto como chave do HMAC. */
export function generateWebhookSecret() {
  return toHex(crypto.getRandomValues(new Uint8Array(32)));
}

export function hasEncryptionKey(env = {}) {
  return typeof env[ENCRYPTION_KEY_ENV] === 'string' && env[ENCRYPTION_KEY_ENV].length >= MIN_ENCRYPTION_KEY_LENGTH;
}

async function deriveEncryptionKey(envKey) {
  if (typeof envKey !== 'string' || envKey.length < MIN_ENCRYPTION_KEY_LENGTH) {
    throw unavailableError('A chave de cifragem do webhook ainda não foi configurada.');
  }
  const material = await crypto.subtle.importKey('raw', utf8.encode(envKey), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8.encode('vitrine-quote-webhook'), info: utf8.encode('secret-v1') },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** `v1.<iv>.<cifra>`; o id da vitrine entra como dado associado, então a cifra não serve em outra vitrine. */
export async function encryptWebhookSecret(secret, siteId, envKey) {
  const key = await deriveEncryptionKey(envKey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: utf8.encode(String(siteId)) },
    key,
    utf8.encode(secret)
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(cipher)}`;
}

export async function decryptWebhookSecret(ciphertext, siteId, envKey) {
  const match = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(ciphertext ?? ''));
  if (!match) throw unavailableError('Segredo do webhook ilegível; gere um novo.');
  const key = await deriveEncryptionKey(envKey);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(match[1]), additionalData: utf8.encode(String(siteId)) },
      key,
      fromBase64Url(match[2])
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw unavailableError('Segredo do webhook ilegível; gere um novo.');
  }
}

async function hmacKey(secret, usage) {
  return crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [usage]);
}

/** `sha256=<hex>` do HMAC-SHA256 de `${timestamp}.${corpo}`. */
export async function signQuoteWebhook(secret, timestamp, body) {
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret, 'sign'), utf8.encode(`${timestamp}.${body}`));
  return `sha256=${toHex(signature)}`;
}

/** Verificação do lado do destino (guia e testes): tempo constante e janela de 5 minutos. */
export async function verifyQuoteWebhookSignature(
  secret, { timestamp, body, signature }, { nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300 } = {}
) {
  const ts = Number(timestamp);
  if (!Number.isSafeInteger(ts) || Math.abs(nowSeconds - ts) > toleranceSeconds) return false;
  const match = /^sha256=([a-f0-9]{64})$/.exec(String(signature ?? ''));
  if (!match) return false;
  const expected = Uint8Array.from(match[1].match(/../g), (pair) => parseInt(pair, 16));
  return crypto.subtle.verify('HMAC', await hmacKey(secret, 'verify'), expected, utf8.encode(`${ts}.${body}`));
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

/**
 * Até 3 tentativas, só para `5xx` e erro de rede, com espera de 0,5 s e 1,5 s. Não segue
 * redirecionamentos, para que o destino não desvie para a rede interna; um `3xx` conta
 * como entregue porque o Apps Script responde 302 depois de rodar o `doPost`. Cada
 * tentativa assina com um timestamp novo e o mesmo `X-Vitrine-Delivery`.
 */
export async function deliverQuoteWebhook({
  url, secret, event, payload, fetch: customFetch, now = () => Date.now(),
  wait = sleep, timeoutMs = DELIVERY_TIMEOUT_MS
}) {
  const fetchImpl = customFetch ?? globalThis.fetch.bind(globalThis);
  const target = validateQuoteWebhookUrl(url);
  const body = JSON.stringify(payload);
  const deliveryId = payload?.deliveryId ?? crypto.randomUUID();
  let httpStatus = null;
  for (let attempt = 1; attempt <= DELIVERY_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await wait(DELIVERY_BACKOFF_MS[attempt - 2] ?? 1500);
    const timestamp = String(Math.floor(now() / 1000));
    try {
      const response = await fetchImpl(target, {
        method: 'POST',
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'user-agent': 'VitrineInspira-Webhook/1.0',
          'x-vitrine-event': event,
          'x-vitrine-delivery': deliveryId,
          'x-vitrine-timestamp': timestamp,
          'x-vitrine-signature': await signQuoteWebhook(secret, timestamp, body)
        },
        body
      });
      httpStatus = response.status;
      await response.body?.cancel?.().catch?.(() => {});
      if (httpStatus >= 500 && httpStatus <= 599) continue;
      return { ok: httpStatus >= 200 && httpStatus < 400, httpStatus, attempts: attempt, deliveryId };
    } catch {
      httpStatus = null;
    }
  }
  return { ok: false, httpStatus, attempts: DELIVERY_MAX_ATTEMPTS, deliveryId };
}

function logDelivery(slug, kind, result) {
  if (result.ok) return;
  console.error(JSON.stringify({
    event: 'quote_webhook_delivery_failed',
    slug,
    kind,
    httpStatus: result.httpStatus,
    attempts: result.attempts
  }));
}

async function recordDelivery(store, siteId, kind, result, options) {
  if (typeof store?.recordQuoteWebhookDelivery !== 'function') return;
  try {
    await store.recordQuoteWebhookDelivery(siteId, {
      kind, ok: result.ok, httpStatus: result.httpStatus, attempts: result.attempts
    }, options);
  } catch {
    console.error(JSON.stringify({ event: 'quote_webhook_status_failed', kind }));
  }
}

function showcaseUrl(menu, slug) {
  return typeof menu?.canonicalUrl === 'string' && menu.canonicalUrl.startsWith('https://')
    ? menu.canonicalUrl
    : `${PUBLIC_SITE_ORIGIN}/${slug}`;
}

export function buildLeadPayload({ menu, slug, lead, event = LEAD_EVENT, at = new Date() }) {
  const createdAt = at.toISOString();
  const name = menu?.name ?? menu?.businessName ?? slug;
  return {
    event,
    deliveryId: crypto.randomUUID(),
    createdAt,
    test: event === TEST_EVENT,
    vitrine: { slug, name, url: showcaseUrl(menu, slug) },
    lead,
    consent: { text: quoteLeadConsentText(name), acceptedAt: createdAt }
  };
}

const TEST_LEAD = Object.freeze({
  category: 'Teste da Vitrine',
  date: '2026-12-31',
  neighborhood: 'Centro',
  items: [{ id: 'teste', name: 'Item de teste', quantity: 1 }]
});

function menuItems(menu) {
  const flat = Array.isArray(menu?.items) ? menu.items : [];
  const nested = Array.isArray(menu?.categories) ? menu.categories.flatMap((category) => category?.items ?? []) : [];
  const names = new Map();
  for (const item of [...flat, ...nested]) {
    if (typeof item?.id === 'string' && typeof item.name === 'string') names.set(item.id, item.name);
  }
  return names;
}

function leadError(code, message) {
  return new PortalValidationError(422, code, message);
}

/** Valida o corpo público contra os campos que a vitrine publicada pede. */
export function validateLeadPayload(parsed, menu) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw leadError('INVALID_LEAD', 'Pré-orçamento inválido.');
  }
  if (Object.keys(parsed).some((key) => !['consent', 'fields', 'items'].includes(key))) {
    throw leadError('INVALID_LEAD', 'Pré-orçamento com campos não permitidos.');
  }
  if (parsed.consent !== true) {
    throw leadError('CONSENT_REQUIRED', 'Sem o consentimento marcado, o pedido segue só pelo WhatsApp.');
  }
  const allowed = quoteLeadFields(menu?.quoteLead);
  const rawFields = parsed.fields ?? {};
  if (!rawFields || typeof rawFields !== 'object' || Array.isArray(rawFields)) {
    throw leadError('INVALID_LEAD', 'Campos do pré-orçamento inválidos.');
  }
  const lead = {};
  for (const [field, raw] of Object.entries(rawFields)) {
    if (!allowed.includes(field) || typeof raw !== 'string') {
      throw leadError('INVALID_LEAD', 'Campo de pré-orçamento não permitido nesta vitrine.');
    }
    const value = raw.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!value) continue;
    if (field === 'date' ? !isValidLeadDate(value) : value.length > QUOTE_LEAD_TEXT_MAX) {
      throw leadError('INVALID_LEAD', field === 'date' ? 'Data inválida.' : `Use até ${QUOTE_LEAD_TEXT_MAX} caracteres.`);
    }
    assertNoDangerousTextPayload(value, 422, 'INVALID_LEAD');
    lead[field] = value;
  }
  const rawItems = parsed.items ?? [];
  if (!Array.isArray(rawItems) || rawItems.length > QUOTE_LEAD_MAX_ITEMS) {
    throw leadError('INVALID_LEAD', 'Itens do pré-orçamento inválidos.');
  }
  const names = menuItems(menu);
  const items = [];
  for (const entry of rawItems) {
    const quantity = entry?.quantity;
    if (typeof entry?.id !== 'string' || !Number.isInteger(quantity) || quantity < 1 || quantity > QUOTE_LEAD_MAX_QUANTITY) {
      throw leadError('INVALID_LEAD', 'Itens do pré-orçamento inválidos.');
    }
    if (names.has(entry.id)) items.push({ id: entry.id, name: names.get(entry.id), quantity });
  }
  if (!Object.keys(lead).length && !items.length) {
    throw leadError('INVALID_LEAD', 'Preencha ao menos um campo do pré-orçamento.');
  }
  return { ...lead, items };
}

/**
 * Limite por endereço em memória do isolate. A chave é o SHA-256 do endereço com um sal
 * aleatório do próprio isolate: nem o IP em claro fica guardado, e nada vai para o banco.
 */
export function createLeadRateLimiter({ limit, windowMs, maxKeys } = LEAD_RATE_LIMIT, now = () => Date.now()) {
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const buckets = new Map();
  return {
    get size() {
      return buckets.size;
    },
    async take(address, slug) {
      const digest = await crypto.subtle.digest('SHA-256', utf8.encode(`${salt}|${address}|${slug}`));
      const key = toHex(digest);
      const at = now();
      const bucket = buckets.get(key);
      if (bucket && at - bucket.start < windowMs) {
        if (bucket.count >= limit) return { allowed: false, retryAfter: Math.ceil((bucket.start + windowMs - at) / 1000) };
        bucket.count += 1;
        return { allowed: true };
      }
      buckets.delete(key);
      if (buckets.size >= maxKeys) {
        for (const [oldKey, entry] of buckets) {
          if (at - entry.start >= windowMs || buckets.size >= maxKeys) buckets.delete(oldKey);
          if (buckets.size < maxKeys) break;
        }
      }
      buckets.set(key, { start: at, count: 1 });
      return { allowed: true };
    }
  };
}

const sharedRateLimiter = createLeadRateLimiter();

function presentLastDelivery(raw) {
  if (!raw || typeof raw !== 'object' || !raw.at) return null;
  return {
    kind: raw.kind === 'test' ? 'test' : 'lead',
    ok: raw.ok === true,
    httpStatus: Number.isInteger(raw.httpStatus) ? raw.httpStatus : null,
    attempts: Number.isInteger(raw.attempts) ? raw.attempts : null,
    at: new Date(raw.at).toISOString()
  };
}

/** Status sem segredo, para o editor e para a central de canais (#125). */
export function presentQuoteWebhookStatus(raw, entitlements) {
  const available = hasPlanFeature(entitlements, QUOTE_WEBHOOK_FEATURE);
  const url = typeof raw?.url === 'string' ? raw.url : null;
  const hasSecret = raw?.hasSecret === true;
  const lastDelivery = presentLastDelivery(raw?.lastDelivery);
  const state = !available
    ? 'locked'
    : !url || !hasSecret
      ? 'not_configured'
      : lastDelivery && !lastDelivery.ok
        ? 'failing'
        : 'ready';
  return {
    feature: QUOTE_WEBHOOK_FEATURE,
    available,
    ...(available ? {} : { requiredPlan: planFeatureRequiredError(QUOTE_WEBHOOK_FEATURE).requiredPlan }),
    state,
    url,
    hasSecret,
    secretCreatedAt: raw?.secretCreatedAt ? new Date(raw.secretCreatedAt).toISOString() : null,
    lastDelivery,
    totals: {
      delivered: Number(raw?.totals?.delivered) || 0,
      failed: Number(raw?.totals?.failed) || 0
    }
  };
}

/**
 * Leitura reutilizável do status da integração (dono ou admin, com a sessão). Devolve
 * `null` quando o ambiente não tem a tabela; nunca inclui o segredo.
 */
export async function readQuoteWebhookStatus(store, siteId, { token, env, entitlements } = {}) {
  if (typeof store?.readQuoteWebhook !== 'function') return null;
  const [raw, rights] = await Promise.all([
    store.readQuoteWebhook(siteId, { token, env }),
    entitlements ?? loadSiteEntitlements(store, siteId, { token, env })
  ]);
  return presentQuoteWebhookStatus(raw, rights);
}

/** Opção de publicação: os campos só entram no snapshot com o recurso e a integração pronta. */
export async function quoteLeadPublicationOptions(store, siteId, { token, env, entitlements } = {}) {
  if (!hasPlanFeature(entitlements, QUOTE_WEBHOOK_FEATURE)) return { quoteLead: false };
  try {
    const status = await readQuoteWebhookStatus(store, siteId, { token, env, entitlements });
    return { quoteLead: Boolean(status?.url && status.hasSecret) };
  } catch {
    return { quoteLead: false };
  }
}

/** Campo do snapshot: `{ quoteLead: { fields } }` ou nada. */
export function projectPublicQuoteLead(content, { quoteLead = false } = {}) {
  const fields = quoteLead ? quoteLeadFields(content?.quoteLead) : [];
  return fields.length ? { quoteLead: { fields } } : {};
}

export function assertPublicQuoteLead(menu) {
  if (menu.quoteLead === undefined) return;
  const fields = quoteLeadFields(menu.quoteLead);
  if (!fields.length || JSON.stringify(menu.quoteLead) !== JSON.stringify({ fields })) {
    throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Bloco quoteLead inválido.');
  }
}

/** Erros `quoteLead.*` do rascunho, para validateDraftContent. */
export function quoteLeadDraftErrors(content) {
  return validateQuoteLeadConfig(content?.quoteLead).errors;
}

async function readLeadBody(request) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > MAX_LEAD_BYTES) {
    throw leadError('INVALID_LEAD', 'Pré-orçamento acima de 4 KiB.');
  }
  let text = '';
  try {
    text = await request.text();
  } catch {
    throw leadError('INVALID_LEAD', 'Não foi possível ler o pré-orçamento.');
  }
  if (!text.trim() || utf8.encode(text).byteLength > MAX_LEAD_BYTES) {
    throw leadError('INVALID_LEAD', 'Pré-orçamento vazio ou acima de 4 KiB.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw leadError('INVALID_LEAD', 'O corpo da requisição não contém JSON válido.');
  }
}

/**
 * `POST /api/sites/:slug/leads`. Responde `202` sem esperar o destino: a entrega roda em
 * `ctx.waitUntil`. Sem o recurso, sem integração pronta, com a vitrine pausada ou sem os
 * campos publicados, responde `404` (paidFeatureGoneResponse) e o visitante segue só
 * pelo WhatsApp.
 */
export async function handleLeadRequest({
  request, url, slug, store, env = {}, ctx = {}, respond, guardMutation, loadPublication,
  fetch: fetchImpl, rateLimiter = sharedRateLimiter, now = () => Date.now()
}) {
  if (request.method !== 'POST') {
    throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Use POST para enviar o pré-orçamento.');
  }
  const guardError = guardMutation(request, url, { requireOrigin: true, requireJson: true });
  if (guardError) return guardError;
  const parsed = await readLeadBody(request);
  if (parsed?.consent !== true) {
    throw leadError('CONSENT_REQUIRED', 'Sem o consentimento marcado, o pedido segue só pelo WhatsApp.');
  }

  const address = (request.headers.get('cf-connecting-ip') || 'sem-endereco').trim();
  const limited = await rateLimiter.take(address, slug);
  if (!limited.allowed) {
    return respond(429, {
      error: { code: 'LEAD_RATE_LIMITED', message: 'Muitos envios seguidos. O pedido continua pelo WhatsApp.' }
    }, { 'retry-after': String(limited.retryAfter) });
  }

  if ((await readPublicSiteState(store, slug)) === 'paused') return paidFeatureGoneResponse();
  const publication = await loadPublication(slug);
  const menu = publication?.menu;
  if (!menu || !quoteLeadFields(menu.quoteLead).length) return paidFeatureGoneResponse();
  if (typeof store.getQuoteWebhookTarget !== 'function' || !hasEncryptionKey(env)) return paidFeatureGoneResponse();
  const target = await store.getQuoteWebhookTarget(slug, { env });
  if (!target?.siteId || !target.url || !target.secretCiphertext) return paidFeatureGoneResponse();
  try {
    requirePlanFeature(await loadSiteEntitlements(store, target.siteId, { env }), QUOTE_WEBHOOK_FEATURE);
  } catch (error) {
    if (error?.code === 'PLAN_FEATURE_REQUIRED') return paidFeatureGoneResponse();
    throw error;
  }

  const lead = validateLeadPayload(parsed, menu);
  const payload = buildLeadPayload({ menu, slug, lead, at: new Date(now()) });
  const delivery = (async () => {
    const secret = await decryptWebhookSecret(target.secretCiphertext, target.siteId, env[ENCRYPTION_KEY_ENV]);
    const result = await deliverQuoteWebhook({ url: target.url, secret, event: LEAD_EVENT, payload, fetch: fetchImpl, now });
    logDelivery(slug, 'lead', result);
    await recordDelivery(store, target.siteId, 'lead', result, { env });
  })().catch(() => {
    console.error(JSON.stringify({ event: 'quote_webhook_delivery_failed', slug, kind: 'lead' }));
  });
  if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(delivery);
  return respond(202, { accepted: true }, NO_STORE);
}

/**
 * Rotas do editor (dono ou admin): `GET|PUT|DELETE /api/sites/:id/quote-webhook`,
 * `POST .../secret` (gera e mostra o segredo uma vez) e `POST .../test` (envia um evento
 * de teste e espera o resultado).
 */
export async function handleQuoteWebhookRequest({
  request, url, method, store, user, siteId, action, env = {}, respond, guardMutation, readJson,
  fetch: fetchImpl, now = () => Date.now()
}) {
  const options = { token: user.token, env };
  const site = await store.getSite(siteId, user.id, options);
  if (!site || !QUOTE_WEBHOOK_ROLES.includes(site.role)) {
    throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
  }
  if (typeof store.readQuoteWebhook !== 'function') throw unavailableError();
  const entitlements = await loadSiteEntitlements(store, siteId, options);
  const present = (raw) => ({ quoteWebhook: presentQuoteWebhookStatus(raw, entitlements) });

  if (!action && method === 'GET') {
    return respond(200, present(await store.readQuoteWebhook(siteId, options)), NO_STORE);
  }
  const allowed = action ? method === 'POST' : method === 'PUT' || method === 'DELETE';
  if (!allowed) throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para o webhook.');
  const guardError = guardMutation(request, url, { requireOrigin: true, requireJson: method !== 'DELETE' });
  if (guardError) return guardError;

  if (method === 'DELETE') return respond(200, present(await store.deleteQuoteWebhook(siteId, options)), NO_STORE);
  requirePlanFeature(entitlements, QUOTE_WEBHOOK_FEATURE);

  if (!action) {
    const { parsed } = await readJson(request);
    const target = validateQuoteWebhookUrl(parsed?.url);
    return respond(200, present(await store.saveQuoteWebhookUrl(siteId, target, options)), NO_STORE);
  }

  if (action === 'secret') {
    const secret = generateWebhookSecret();
    const ciphertext = await encryptWebhookSecret(secret, siteId, env[ENCRYPTION_KEY_ENV]);
    const raw = await store.saveQuoteWebhookSecret(siteId, ciphertext, options);
    return respond(201, { secret, ...present(raw) }, NO_STORE);
  }

  if (!hasEncryptionKey(env)) throw unavailableError('A chave de cifragem do webhook ainda não foi configurada.');
  const target = await store.getQuoteWebhookTarget(site.slug, options);
  if (!target?.url || !target.secretCiphertext) {
    throw new PortalValidationError(409, 'QUOTE_WEBHOOK_NOT_CONFIGURED', 'Salve o endereço e gere o segredo antes de enviar o teste.');
  }
  const secret = await decryptWebhookSecret(target.secretCiphertext, target.siteId ?? siteId, env[ENCRYPTION_KEY_ENV]);
  const payload = buildLeadPayload({
    menu: { name: site.name }, slug: site.slug, lead: { ...TEST_LEAD, items: [...TEST_LEAD.items] },
    event: TEST_EVENT, at: new Date(now())
  });
  const result = await deliverQuoteWebhook({ url: target.url, secret, event: TEST_EVENT, payload, fetch: fetchImpl, now });
  logDelivery(site.slug, 'test', result);
  await recordDelivery(store, siteId, 'test', result, options);
  return respond(200, {
    delivery: { ok: result.ok, httpStatus: result.httpStatus, attempts: result.attempts },
    ...present(await store.readQuoteWebhook(siteId, options))
  }, NO_STORE);
}

function emptyStatus() {
  return { url: null, hasSecret: false, secretCreatedAt: null, lastDelivery: null, totals: { delivered: 0, failed: 0 } };
}

/** Adaptador em memória (testes e ambiente sem Supabase). */
export function createMemoryQuoteWebhooks({ sites, now = () => new Date() }) {
  const hooks = new Map();
  const status = (siteId) => {
    const hook = hooks.get(siteId);
    if (!hook) return emptyStatus();
    return {
      url: hook.url ?? null,
      hasSecret: Boolean(hook.secretCiphertext),
      secretCreatedAt: hook.secretCreatedAt ?? null,
      lastDelivery: hook.lastDelivery ? { ...hook.lastDelivery } : null,
      totals: { ...hook.totals }
    };
  };
  const ensure = (siteId) => {
    if (!sites.has(siteId)) throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
    if (!hooks.has(siteId)) hooks.set(siteId, { url: null, secretCiphertext: null, totals: { delivered: 0, failed: 0 } });
    return hooks.get(siteId);
  };
  return {
    quoteWebhooks: hooks,
    async readQuoteWebhook(siteId) {
      return status(siteId);
    },
    async saveQuoteWebhookUrl(siteId, url) {
      ensure(siteId).url = url;
      return status(siteId);
    },
    async saveQuoteWebhookSecret(siteId, ciphertext) {
      const hook = ensure(siteId);
      hook.secretCiphertext = ciphertext;
      hook.secretCreatedAt = now().toISOString();
      return status(siteId);
    },
    async deleteQuoteWebhook(siteId) {
      hooks.delete(siteId);
      return status(siteId);
    },
    async getQuoteWebhookTarget(slug) {
      for (const site of sites.values()) {
        if (site.slug !== slug) continue;
        const hook = hooks.get(site.id);
        return hook?.url && hook.secretCiphertext
          ? { siteId: site.id, url: hook.url, secretCiphertext: hook.secretCiphertext }
          : null;
      }
      return null;
    },
    async recordQuoteWebhookDelivery(siteId, { kind, ok, httpStatus, attempts }) {
      const hook = hooks.get(siteId);
      if (!hook) return;
      hook.lastDelivery = { kind, ok, httpStatus, attempts, at: now().toISOString() };
      if (kind === 'lead') hook.totals[ok ? 'delivered' : 'failed'] += 1;
    }
  };
}

/** Adaptador PostgREST para a migração 20261116001000_quote_webhooks.sql. */
export function createRestQuoteWebhooks({ baseUrl, fetchImpl, authHeaders }) {
  function serviceHeaders(env) {
    const key = env?.SUPABASE_SERVICE_ROLE_KEY;
    return key ? { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' } : null;
  }

  async function call(name, body, headers) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST', headers, body: JSON.stringify(body)
    });
    if (response.status === 404) throw unavailableError();
    if (response.status === 401 || response.status === 403) {
      throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
    }
    if (!response.ok) throw new Error(`Falha na integração de pré-orçamento (${response.status}).`);
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  return {
    async readQuoteWebhook(siteId, { token } = {}) {
      return call('read_quote_webhook', { target_site: siteId }, authHeaders(token));
    },
    async saveQuoteWebhookUrl(siteId, url, { token } = {}) {
      return call('save_quote_webhook_url', { target_site: siteId, target_url: url }, authHeaders(token));
    },
    async saveQuoteWebhookSecret(siteId, ciphertext, { token } = {}) {
      return call('save_quote_webhook_secret', { target_site: siteId, target_ciphertext: ciphertext }, authHeaders(token));
    },
    async deleteQuoteWebhook(siteId, { token } = {}) {
      return call('delete_quote_webhook', { target_site: siteId }, authHeaders(token));
    },
    async getQuoteWebhookTarget(slug, { env } = {}) {
      const headers = serviceHeaders(env);
      if (!headers) return null;
      const rows = await call('service_quote_webhook_target', { target_slug: slug }, headers);
      const row = Array.isArray(rows) ? rows[0] : null;
      return row?.site_id ? { siteId: row.site_id, url: row.url, secretCiphertext: row.secret_ciphertext } : null;
    },
    async recordQuoteWebhookDelivery(siteId, { kind, ok, httpStatus, attempts }, { env } = {}) {
      const headers = serviceHeaders(env);
      if (!headers) return;
      await call('service_record_quote_webhook_delivery', {
        target_site: siteId,
        delivery_kind: kind,
        delivery_ok: ok,
        delivery_http_status: httpStatus,
        delivery_attempts: attempts
      }, headers);
    }
  };
}
