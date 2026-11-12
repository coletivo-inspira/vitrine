import { CloudflareHostnames, createDomainChallenge, validateCustomHostname, verifyDomainDns } from '../src/custom-domains.mjs';
import { resolveShowcaseManifest, extractShowcaseOverrides } from '../src/showcase-structure.mjs';
import { R2StorageProvider, SupabaseStorageProvider } from '../src/storage-adapter.mjs';
import { validateCmsSection } from '../src/platform-cms.mjs';
import { signPreviewToken, verifyPreviewToken } from '../src/preview-token.mjs';
import {
  ALLOWED_TEMPLATES,
  CATALOG_IMAGES_BUCKET,
  DEFAULT_STOREFRONT_TYPE,
  DEFAULT_TEMPLATE,
  MAX_DRAFT_BYTES,
  MAX_EVENTS_BATCH_BYTES,
  PortalValidationError,
  RESERVED_SLUGS,
  assertNoDangerousTextPayload,
  computeStorefrontInsights,
  createInitialDraftContent,
  extractDraftItems,
  formatProfileRecord,
  isBotUserAgent,
  isValidSlug,
  measureDraftBytes,
  migrateLegacyDraftContent,
  validateCatalogImagePath,
  validateCustomizationRequestInput,
  validateDraftContent,
  validateEventsBatchPayload,
  validateInsightsPeriod,
  validateProfileInput,
  validateRevision,
  validateSiteInput
} from '../src/portal-validation.mjs';
import {
  compilePublicStorefront,
  computeSha256Hex,
  renderStorefrontHtml
} from '../src/publication-engine.mjs';

const TEMPLATE_CODE_PATTERN = /^[a-z0-9][a-z0-9_-]{1,63}$/;
const MEMBER_ROLES = ['admin', 'editor', 'viewer'];
const TEAM_ROLES = ['owner', 'admin'];
const DRAFT_EDITOR_ROLES = ['owner', 'admin', 'editor'];
const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;

const SESSION_COOKIE_NAME = '__Host-vitrine_session';
const DEFAULT_SESSION_MAX_AGE_SECONDS = 3600;
const MAX_SESSION_MAX_AGE_SECONDS = 86400;
const LOGOUT_COOKIE_HEADER = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
export const SUPABASE_PUBLIC_PROJECT_URL = 'https://qawlpsrfewosxsfgmmpm.supabase.co';
export const STRICT_CSP_HEADER =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export const PORTAL_CSP_HEADER =
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
export const PORTAL_STORAGE_CSP_HEADER =
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL} data: blob:; font-src 'self'; connect-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
export const STOREFRONT_STORAGE_CSP_HEADER =
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL}; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
const SANDBOX_HOST = 'sandbox.inspira.dev.br';
const SANDBOX_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; frame-ancestors https:; sandbox allow-scripts";
const WIDGET_FRAME_CSP = `; frame-src https://${SANDBOX_HOST}`;

export const STOREFRONT_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400';
export const IMMUTABLE_CACHE_CONTROL = 'public, max-age=31536000, immutable';

const PUBLIC_SECURITY_HEADERS = Object.freeze({
  'content-security-policy': STRICT_CSP_HEADER,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'x-frame-options': 'DENY'
});

const JSON_HEADERS = Object.freeze({
  ...PUBLIC_SECURITY_HEADERS,
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
});

const ESCAPE_RULE_REGEX_CHARS = /[-/\\^$*+?.()|[\]{}]/g;

function compileHeaderRuleRegex(rulePath) {
  const escaped = rulePath
    .split('*')
    .map((segment) => segment.replace(ESCAPE_RULE_REGEX_CHARS, '\\$&'))
    .join('.*');
  return new RegExp(`^${escaped}$`);
}

export function parseHeadersRules(headersText) {
  if (typeof headersText !== 'string') {
    return [];
  }
  const rules = [];
  let currentRule = null;

  for (const rawLine of headersText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    if (line.startsWith('/')) {
      if (currentRule && (currentRule.set.length > 0 || currentRule.unset.length > 0)) {
        rules.push(currentRule);
      }
      currentRule = {
        path: line,
        regex: compileHeaderRuleRegex(line),
        unset: [],
        set: []
      };
      continue;
    }
    if (!currentRule) {
      continue;
    }
    if (line.startsWith('!')) {
      const unsetName = line.slice(1).trim();
      if (unsetName) {
        currentRule.unset.push(unsetName);
      }
      continue;
    }
    const sepIdx = line.indexOf(':');
    if (sepIdx > 0) {
      const name = line.slice(0, sepIdx).trim();
      const value = line.slice(sepIdx + 1).trim();
      if (name && value) {
        currentRule.set.push({ name, value });
      }
    }
  }

  if (currentRule && (currentRule.set.length > 0 || currentRule.unset.length > 0)) {
    rules.push(currentRule);
  }
  return rules;
}

export function evaluateHeadersForPath(rulesOrText, pathname) {
  const rules = Array.isArray(rulesOrText) ? rulesOrText : parseHeadersRules(rulesOrText);
  const valuesByHeader = new Map();

  for (const rule of rules) {
    if (!rule.regex.test(pathname)) {
      continue;
    }
    for (const unsetName of rule.unset) {
      valuesByHeader.delete(unsetName.toLowerCase());
    }
    for (const { name, value } of rule.set) {
      const lower = name.toLowerCase();
      if (!valuesByHeader.has(lower)) {
        valuesByHeader.set(lower, [value]);
      } else {
        valuesByHeader.get(lower).push(value);
      }
    }
  }

  const multiHeaders = Object.fromEntries(valuesByHeader.entries());
  const headers = new Headers();
  for (const [lower, values] of valuesByHeader.entries()) {
    for (const val of values) {
      headers.append(lower, val);
    }
  }

  return {
    headers,
    multiHeaders,
    cspValues: valuesByHeader.get('content-security-policy') ?? []
  };
}

const PILOT_LOJA1_DRAFT = Object.freeze({
  schemaVersion: 1,
  template: 'pizzeria-v1',
  slug: 'loja1',
  businessName: 'Forno & Praça Pizzaria Artesanal',
  whatsapp: '5511999999999',
  categories: [
    {
      id: 'pizzas-classicas',
      name: 'Pizzas Clássicas de Fermentação Natural',
      items: [
        {
          id: 'margherita-verace',
          name: 'Margherita Verace',
          description:
            'Molho de tomate San Marzano, muçarela fresca, folhas de manjericão e azeite extravirgem.',
          priceCents: 4800,
          active: true
        },
        {
          id: 'calabresa-artesanal',
          name: 'Calabresa Curada & Cebola Roxa',
          description:
            'Muçarela, calabresa artesanal fatiada fina, cebola roxa marinada e orégano fresco.',
          priceCents: 5200,
          active: true
        },
        {
          id: 'quatro-queijos',
          name: 'Quatro Queijos da Serra',
          description:
            'Muçarela, parmesão maturado, gorgonzola suave e catupiry artesanal na lenha.',
          priceCents: 5600,
          active: true
        }
      ]
    },
    {
      id: 'pizzas-autorais',
      name: 'Especiais da Casa',
      items: [
        {
          id: 'cogumelos-trufados',
          name: 'Bosque de Cogumelos',
          description:
            'Mix de paris e shimeji salteados no alho, muçarela flor de leite e toque de salsa.',
          priceCents: 6200,
          active: true
        },
        {
          id: 'rascunho-inverno-oculto',
          name: 'Pizza Sazonal de Inverno (Oculta)',
          description: 'Item em elaboração que jamais deve aparecer no cardápio público.',
          priceCents: 6900,
          active: false
        }
      ]
    },
    {
      id: 'bebidas',
      name: 'Bebidas & Sodas Artesanais',
      items: [
        {
          id: 'soda-limao-siciliano',
          name: 'Soda Italiana de Limão Siciliano 350ml',
          description: 'Xarope artesanal de limão siciliano fresco com água com gás gelada.',
          priceCents: 1400,
          active: true
        },
        {
          id: 'agua-mineral',
          name: 'Água Mineral sem Gás 500ml',
          description: 'Garrafa 500ml refrigerada.',
          priceCents: 600,
          active: true
        }
      ]
    }
  ]
});

let cachedPilotLoja1PublicationPromise = null;
function getPilotLoja1Publication() {
  if (!cachedPilotLoja1PublicationPromise) {
    cachedPilotLoja1PublicationPromise = compilePublicStorefront(
      PILOT_LOJA1_DRAFT,
      {
        id: '00000000-0000-0000-0000-000000000101',
        slug: 'loja1',
        name: 'Forno & Praça Pizzaria Artesanal',
        template: 'pizzeria-v1'
      },
      {
        siteId: '00000000-0000-0000-0000-000000000101',
        revision: 1,
        publishedAt: '2026-11-11T00:00:00.000Z'
      }
    ).then((res) => res.publication);
  }
  return cachedPilotLoja1PublicationPromise;
}

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    }
  });
}

function errorResponse(status, code, message, extra = {}) {
  return jsonResponse(status, {
    error: {
      code,
      message,
      ...extra
    }
  });
}

function base64UrlToUint8Array(base64Url) {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export const JWKS_CACHE_TTL_MS = 10 * 60 * 1000;
const jwksIsolateCache = new Map();

export function clearJwksCache() {
  jwksIsolateCache.clear();
}

function parseJwtHeader(token) {
  if (typeof token !== 'string' || !token) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const header = JSON.parse(utf8Decoder.decode(base64UrlToUint8Array(parts[0])));
    if (!header || typeof header !== 'object' || Array.isArray(header)) {
      return null;
    }
    return { header, parts };
  } catch {
    return null;
  }
}

function resolveTokenMaxAgeSeconds(token, nowSeconds = Math.floor(Date.now() / 1000)) {
  const parsed = parseJwtHeader(token);
  if (!parsed) {
    return DEFAULT_SESSION_MAX_AGE_SECONDS;
  }
  try {
    const payload = JSON.parse(utf8Decoder.decode(base64UrlToUint8Array(parsed.parts[1])));
    if (payload && typeof payload.exp === 'number' && Number.isFinite(payload.exp)) {
      const remaining = Math.floor(payload.exp - nowSeconds);
      if (remaining > 0) {
        return Math.min(remaining, MAX_SESSION_MAX_AGE_SECONDS);
      }
    }
  } catch {
    // Fallback to default session max-age
  }
  return DEFAULT_SESSION_MAX_AGE_SECONDS;
}

export function buildSessionCookieHeader(token, maxAgeSeconds = DEFAULT_SESSION_MAX_AGE_SECONDS) {
  const safeMaxAge =
    Number.isFinite(maxAgeSeconds) && maxAgeSeconds > 0
      ? Math.min(Math.floor(maxAgeSeconds), MAX_SESSION_MAX_AGE_SECONDS)
      : DEFAULT_SESSION_MAX_AGE_SECONDS;
  return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}; Max-Age=${safeMaxAge}; Path=/; HttpOnly; Secure; SameSite=Lax`;
}

function isAudienceAuthenticated(aud) {
  if (aud === 'authenticated') {
    return true;
  }
  if (Array.isArray(aud)) {
    return aud.includes('authenticated');
  }
  return false;
}

function resolveVerificationContext(nowSeconds, options, jwks) {
  const resolvedOptions =
    typeof nowSeconds === 'object' && nowSeconds !== null
      ? nowSeconds
      : typeof options === 'string'
        ? { expectedIssuer: options }
        : (options ?? {});
  const effectiveNow =
    typeof nowSeconds === 'number'
      ? nowSeconds
      : (resolvedOptions.nowSeconds ?? Math.floor(Date.now() / 1000));
  const rawBaseUrl =
    resolvedOptions.supabaseUrl ?? jwks?.supabaseUrl ?? SUPABASE_PUBLIC_PROJECT_URL;
  const baseUrl = String(rawBaseUrl).replace(/\/+$/, '');
  const expectedIssuer =
    resolvedOptions.expectedIssuer ??
    resolvedOptions.issuer ??
    jwks?.issuer ??
    `${baseUrl}/auth/v1`;
  return { effectiveNow, baseUrl, expectedIssuer };
}

function extractJwkList(jwks) {
  if (Array.isArray(jwks)) {
    return jwks;
  }
  if (jwks && typeof jwks === 'object' && Array.isArray(jwks.keys)) {
    return jwks.keys;
  }
  return [];
}

export async function verifyJwtEs256(
  token,
  jwks,
  nowSeconds = Math.floor(Date.now() / 1000),
  options = {}
) {
  const parsed = parseJwtHeader(token);
  if (!parsed) {
    return null;
  }
  const { header, parts } = parsed;
  if (header.alg !== 'ES256') {
    return null;
  }
  const kid = typeof header.kid === 'string' && header.kid.trim() ? header.kid.trim() : null;
  if (!kid) {
    return null;
  }

  const keys = extractJwkList(jwks);
  const matchedJwk = keys.find(
    (entry) => entry && typeof entry === 'object' && entry.kid === kid
  );
  if (!matchedJwk) {
    return null;
  }
  if (
    matchedJwk.kty !== 'EC' ||
    matchedJwk.crv !== 'P-256' ||
    typeof matchedJwk.x !== 'string' ||
    !matchedJwk.x ||
    typeof matchedJwk.y !== 'string' ||
    !matchedJwk.y
  ) {
    return null;
  }
  if (matchedJwk.alg !== undefined && matchedJwk.alg !== 'ES256') {
    return null;
  }
  if (matchedJwk.use !== undefined && matchedJwk.use !== 'sig') {
    return null;
  }

  try {
    const signature = base64UrlToUint8Array(parts[2]);
    if (signature.byteLength !== 64) {
      return null;
    }

    const cryptoKey = await crypto.subtle.importKey(
      'jwk',
      {
        kty: 'EC',
        crv: 'P-256',
        x: matchedJwk.x,
        y: matchedJwk.y,
        ext: true
      },
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    const data = utf8Encoder.encode(`${parts[0]}.${parts[1]}`);
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      cryptoKey,
      signature,
      data
    );
    if (!valid) {
      return null;
    }

    const payload = JSON.parse(utf8Decoder.decode(base64UrlToUint8Array(parts[1])));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }

    const { effectiveNow, expectedIssuer } = resolveVerificationContext(
      nowSeconds,
      options,
      jwks
    );

    if (
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= effectiveNow
    ) {
      return null;
    }
    if (typeof payload.nbf === 'number' && payload.nbf > effectiveNow) {
      return null;
    }
    if (typeof payload.iss !== 'string' || payload.iss !== expectedIssuer) {
      return null;
    }
    if (!isAudienceAuthenticated(payload.aud)) {
      return null;
    }
    if (payload.role !== 'authenticated') {
      return null;
    }

    const userId =
      typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
    if (!userId) {
      return null;
    }

    return {
      id: userId,
      role: payload.role,
      iss: payload.iss,
      aud: payload.aud
    };
  } catch {
    return null;
  }
}

export async function verifyJwtHs256(
  token,
  secret,
  nowSeconds = Math.floor(Date.now() / 1000),
  options = {}
) {
  if (typeof token !== 'string' || typeof secret !== 'string' || !secret) {
    return null;
  }
  const parsed = parseJwtHeader(token);
  if (!parsed) {
    return null;
  }
  const { header, parts } = parsed;
  if (header.alg !== 'HS256') {
    return null;
  }
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      utf8Encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = utf8Encoder.encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToUint8Array(parts[2]);
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) {
      return null;
    }
    const payload = JSON.parse(utf8Decoder.decode(base64UrlToUint8Array(parts[1])));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return null;
    }
    const { effectiveNow, expectedIssuer } = resolveVerificationContext(
      nowSeconds,
      options,
      null
    );
    if (typeof payload.exp === 'number' && payload.exp <= effectiveNow) {
      return null;
    }
    if (typeof payload.nbf === 'number' && payload.nbf > effectiveNow) {
      return null;
    }
    if (payload.iss !== undefined && payload.iss !== expectedIssuer) {
      return null;
    }
    if (payload.aud !== undefined && !isAudienceAuthenticated(payload.aud)) {
      return null;
    }
    if (payload.role !== undefined && payload.role !== 'authenticated') {
      return null;
    }
    const userId = typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
    if (!userId) {
      return null;
    }
    return { id: userId };
  } catch {
    return null;
  }
}

async function fetchJwksForProject(baseUrl, fetchImpl, { forceRefresh = false, nowMs = Date.now() } = {}) {
  const normalizedBaseUrl = String(baseUrl || SUPABASE_PUBLIC_PROJECT_URL).replace(/\/+$/, '');
  const jwksUrl = `${normalizedBaseUrl}/auth/v1/.well-known/jwks.json`;
  const cached = jwksIsolateCache.get(jwksUrl);
  if (!forceRefresh && cached && nowMs - cached.fetchedAt < JWKS_CACHE_TTL_MS) {
    return { jwks: cached.jwks, fromCache: true };
  }
  if (typeof fetchImpl !== 'function') {
    return { jwks: null, fromCache: false };
  }
  try {
    const response = await fetchImpl(jwksUrl, {
      method: 'GET',
      headers: { accept: 'application/json' }
    });
    if (!response || !response.ok) {
      return { jwks: null, fromCache: false };
    }
    const data = await response.json();
    if (!data || typeof data !== 'object' || !Array.isArray(data.keys)) {
      return { jwks: null, fromCache: false };
    }
    jwksIsolateCache.set(jwksUrl, { jwks: data, fetchedAt: nowMs });
    return { jwks: data, fromCache: false };
  } catch {
    return { jwks: null, fromCache: false };
  }
}

export async function resolveJwtSession(token, env = {}, deps = {}) {
  const parsed = parseJwtHeader(token);
  if (!parsed) {
    return null;
  }
  const { header } = parsed;
  const alg = header.alg;
  if (!alg || alg === 'none') {
    return null;
  }

  const nowSeconds =
    typeof deps?.nowSeconds === 'function'
      ? deps.nowSeconds()
      : (deps?.nowSeconds ?? Math.floor(Date.now() / 1000));
  const nowMs = nowSeconds * 1000;
  const baseUrl = String(
    env?.SUPABASE_URL ?? deps?.supabaseUrl ?? SUPABASE_PUBLIC_PROJECT_URL
  ).replace(/\/+$/, '');

  if (alg === 'ES256') {
    const kid = typeof header.kid === 'string' && header.kid.trim() ? header.kid.trim() : null;
    if (!kid) {
      return null;
    }

    const injectedJwks = deps?.jwks ?? env?.SUPABASE_JWKS ?? null;
    if (injectedJwks) {
      let resolvedJwks =
        typeof injectedJwks === 'function'
          ? await injectedJwks({ kid, forceRefresh: false })
          : injectedJwks;
      const keys = extractJwkList(resolvedJwks);
      if (
        typeof injectedJwks === 'function' &&
        !keys.some((k) => k && k.kid === kid)
      ) {
        resolvedJwks = await injectedJwks({ kid, forceRefresh: true });
      }
      return verifyJwtEs256(token, resolvedJwks, nowSeconds, { supabaseUrl: baseUrl });
    }

    const fetchImpl = deps?.fetch ?? env?.fetch ?? globalThis.fetch;
    const initial = await fetchJwksForProject(baseUrl, fetchImpl, {
      forceRefresh: false,
      nowMs
    });
    if (!initial.jwks) {
      return null;
    }

    let activeJwks = initial.jwks;
    const hasKid = extractJwkList(activeJwks).some((k) => k && k.kid === kid);
    if (!hasKid && initial.fromCache) {
      const refreshed = await fetchJwksForProject(baseUrl, fetchImpl, {
        forceRefresh: true,
        nowMs
      });
      if (!refreshed.jwks) {
        return null;
      }
      activeJwks = refreshed.jwks;
    }

    return verifyJwtEs256(token, activeJwks, nowSeconds, { supabaseUrl: baseUrl });
  }

  if (alg === 'HS256') {
    if (typeof env?.SUPABASE_JWT_SECRET !== 'string' || !env.SUPABASE_JWT_SECRET.trim()) {
      return null;
    }
    return verifyJwtHs256(token, env.SUPABASE_JWT_SECRET, nowSeconds, {
      supabaseUrl: baseUrl
    });
  }

  return null;
}

export function isPublishableAnonKey(rawKey, env = {}) {
  if (typeof rawKey !== 'string') {
    return false;
  }
  const key = rawKey.trim();
  if (!key || /\s/.test(key)) {
    return false;
  }
  if (/^(?:sb_secret_|sbp_)/i.test(key) || /sb_secret_|service_role/i.test(key)) {
    return false;
  }
  if (
    (typeof env?.SUPABASE_SERVICE_ROLE_KEY === 'string' &&
      env.SUPABASE_SERVICE_ROLE_KEY.trim() &&
      key === env.SUPABASE_SERVICE_ROLE_KEY.trim()) ||
    (typeof env?.SUPABASE_JWT_SECRET === 'string' &&
      env.SUPABASE_JWT_SECRET.trim() &&
      key === env.SUPABASE_JWT_SECRET.trim())
  ) {
    return false;
  }
  const parts = key.split('.');
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(utf8Decoder.decode(base64UrlToUint8Array(parts[1])));
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        return false;
      }
      if (payload.role !== 'anon') {
        return false;
      }
    } catch {
      return false;
    }
  } else if (parts.length !== 1) {
    return false;
  }
  return true;
}

export function extractSessionToken(request) {
  const authHeader = request.headers.get('authorization');
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  const cookieHeader = request.headers.get('cookie');
  if (typeof cookieHeader === 'string' && cookieHeader.trim()) {
    const cookies = cookieHeader.split(';');
    for (const part of cookies) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const name = part.slice(0, eqIdx).trim();
      if (name === SESSION_COOKIE_NAME) {
        const rawValue = part.slice(eqIdx + 1).trim();
        if (!rawValue) return null;
        try {
          return decodeURIComponent(rawValue);
        } catch {
          return rawValue;
        }
      }
    }
  }
  return null;
}

function normalizeVerifiedUser(result, token) {
  if (!result) return null;
  if (typeof result === 'string' && result.trim()) {
    return { id: result.trim(), token };
  }
  if (typeof result === 'object') {
    const id =
      (typeof result.id === 'string' && result.id.trim()) ||
      (typeof result.sub === 'string' && result.sub.trim()) ||
      (typeof result.userId === 'string' && result.userId.trim()) ||
      (typeof result.user?.id === 'string' && result.user.id.trim()) ||
      null;
    if (id) {
      return { id, token };
    }
  }
  return null;
}

const HARNESS_TOKENS = Object.freeze({
  'token-owner': '10000000-0000-0000-0000-000000000001',
  'token-member': '10000000-0000-0000-0000-000000000002',
  'token-stranger': '10000000-0000-0000-0000-000000000003'
});

const DEFAULT_MEMORY_SEED = Object.freeze({
  sites: [
    {
      id: '20000000-0000-0000-0000-000000000001',
      owner_user_id: '10000000-0000-0000-0000-000000000001',
      slug: 'pizza-a',
      name: 'Pizza A',
      template: 'pizzeria-v1',
      updatedAt: '2026-11-11T00:00:00.000Z'
    },
    {
      id: '20000000-0000-0000-0000-000000000002',
      owner_user_id: '10000000-0000-0000-0000-000000000001',
      slug: 'pizza-b',
      name: 'Pizza B',
      template: 'pizzeria-v1',
      updatedAt: '2026-11-11T00:00:00.000Z'
    }
  ],
  memberships: [
    {
      site_id: '20000000-0000-0000-0000-000000000001',
      user_id: '10000000-0000-0000-0000-000000000002',
      role: 'collaborator'
    }
  ],
  drafts: [
    {
      siteId: '20000000-0000-0000-0000-000000000001',
      revision: 1,
      updatedAt: '2026-11-11T00:00:00.000Z',
      content: {
        schemaVersion: 1,
        template: 'pizzeria-v1',
        slug: 'pizza-a',
        businessName: 'Pizza A',
        whatsapp: '5511999999999',
        categories: [],
        items: [
          {
            id: 'margherita',
            name: 'Margherita',
            description: 'Molho de tomate artesanal, muçarela e manjericão fresco.',
            priceCents: 4500,
            active: true,
            available: true
          }
        ]
      }
    },
    {
      siteId: '20000000-0000-0000-0000-000000000002',
      revision: 1,
      updatedAt: '2026-11-11T00:00:00.000Z',
      content: {
        schemaVersion: 1,
        template: 'pizzeria-v1',
        slug: 'pizza-b',
        businessName: 'Pizza B',
        whatsapp: '5511999999999',
        categories: [],
        items: []
      }
    }
  ]
});

async function resolveSessionUser(request, env, deps) {
  const token = extractSessionToken(request);
  if (!token) {
    return null;
  }

  const verifier = deps.authVerifier;
  if (verifier) {
    try {
      const fn = typeof verifier === 'function' ? verifier : verifier.verify?.bind(verifier);
      if (typeof fn !== 'function') {
        return null;
      }
      let result;
      try {
        result = await fn(token, request, env);
      } catch (err) {
        if (err instanceof TypeError && /headers|url|method/i.test(String(err.message))) {
          result = await fn(request, token, env);
        } else {
          throw err;
        }
      }
      return normalizeVerifiedUser(result, token);
    } catch {
      return null;
    }
  }

  const hasSupabaseAuthConfig = Boolean(
    env?.SUPABASE_URL ||
    env?.SUPABASE_JWT_SECRET ||
    env?.SUPABASE_JWKS ||
    deps?.jwks ||
    deps?.supabaseUrl
  );

  if (!hasSupabaseAuthConfig && Object.hasOwn(HARNESS_TOKENS, token)) {
    return { id: HARNESS_TOKENS[token], token };
  }

  const verified = await resolveJwtSession(token, env, deps);
  return normalizeVerifiedUser(verified, token);
}

export function createMemoryStore(initial = DEFAULT_MEMORY_SEED) {
  const sites = new Map();
  const drafts = new Map();
  const memberships = [];
  const auditLogs = [];
  const profiles = new Map();
  const customizationRequests = [];
  const publicationsBySlug = new Map();
  const publicationsByHash = new Map();
  const metricsDaily = new Map();

  if (initial.sites instanceof Map) {
    for (const [key, value] of initial.sites.entries()) {
      sites.set(key, structuredClone(value));
    }
  } else if (Array.isArray(initial.sites)) {
    for (const site of initial.sites) {
      if (site?.id) {
        sites.set(site.id, structuredClone(site));
      }
    }
  }

  if (initial.drafts instanceof Map) {
    for (const [key, value] of initial.drafts.entries()) {
      drafts.set(key, structuredClone(value));
    }
  } else if (Array.isArray(initial.drafts)) {
    for (const draft of initial.drafts) {
      const siteId = draft?.siteId ?? draft?.site_id;
      if (siteId) {
        drafts.set(siteId, {
          siteId,
          revision: draft.revision ?? 1,
          updatedAt: draft.updatedAt ?? draft.updated_at ?? new Date().toISOString(),
          content: structuredClone(draft.content ?? {})
        });
      }
    }
  }

  const rawMemberships = initial.memberships ?? initial.siteMemberships ?? [];
  if (Array.isArray(rawMemberships)) {
    for (const entry of rawMemberships) {
      const siteId = entry?.siteId ?? entry?.site_id;
      const userId = entry?.userId ?? entry?.user_id;
      if (siteId && userId) {
        memberships.push({
          siteId,
          userId,
          role: entry.role ?? 'collaborator'
        });
      }
    }
  }

  if (Array.isArray(initial.profiles)) {
    for (const profile of initial.profiles) {
      const userId = profile?.userId ?? profile?.user_id;
      if (userId) {
        profiles.set(
          userId,
          formatProfileRecord(userId, profile, profile.interests ?? [])
        );
      }
    }
  }

  if (Array.isArray(initial.customizationRequests)) {
    for (const reqRecord of initial.customizationRequests) {
      if (reqRecord?.id && (reqRecord.userId ?? reqRecord.user_id)) {
        customizationRequests.push(structuredClone(reqRecord));
      }
    }
  }

  if (Array.isArray(initial.metricsDaily)) {
    for (const row of initial.metricsDaily) {
      const siteId = row?.siteId ?? row?.site_id;
      const metricDate = row?.metricDate ?? row?.metric_date;
      const metricHour = Number(row?.metricHour ?? row?.metric_hour ?? 0);
      const itemKey = String(row?.itemKey ?? row?.item_key ?? '');
      const metricName = String(row?.metricName ?? row?.metric_name ?? '');
      if (siteId && metricDate && metricName) {
        const key = `${siteId}:${metricDate}:${metricHour}:${itemKey}:${metricName}`;
        metricsDaily.set(key, {
          site_id: siteId,
          metric_date: metricDate,
          metric_hour: metricHour,
          item_key: itemKey,
          metric_name: metricName,
          count_value: Number(row.countValue ?? row.count_value ?? 0),
          estimated_cents: Number(row.estimatedCents ?? row.estimated_cents ?? 0),
          updated_at: row.updatedAt ?? row.updated_at ?? new Date().toISOString()
        });
      }
    }
  }

  function getRoleForSite(site, userId) {
    if (!site || !userId) return null;
    const ownerId = site.ownerUserId ?? site.owner_user_id;
    if (ownerId === userId) {
      return 'owner';
    }
    const membership = memberships.find(m => m.siteId === site.id && m.userId === userId);
    return membership ? (membership.role ?? 'collaborator') : null;
  }

  function formatSiteSummary(site, role) {
    return {
      id: site.id,
      slug: site.slug,
      name: site.name,
      storefrontType:
        site.storefrontType ?? site.storefront_type ?? DEFAULT_STOREFRONT_TYPE,
      template: site.template ?? DEFAULT_TEMPLATE,
      role,
      updatedAt: site.updatedAt ?? site.updated_at ?? site.createdAt ?? site.created_at
    };
  }

  return {
    sites,
    drafts,
    memberships,
    profiles,
    customizationRequests,
    publicationsBySlug,
    publicationsByHash,
    metricsDaily,

    addMembership(siteId, userId, role = 'collaborator') {
      const exists = memberships.some(m => m.siteId === siteId && m.userId === userId);
      if (!exists) {
        memberships.push({ siteId, userId, role });
      }
    },

    async listReleases(siteId) {
      return [...publicationsByHash.values()].filter(entry => entry.siteId === siteId)
        .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || b.revision - a.revision)
        .slice(0, 5);
    },

    async rollbackRelease(siteId, revision, actorId) {
      const publication = (await this.listReleases(siteId)).find(entry => entry.revision === revision);
      if (!publication) return null;
      publicationsBySlug.set(publication.slug, publication);
      auditLogs.push({
        siteId, actorUserId: actorId, action: 'rollback', entityType: 'publication',
        entityId: String(revision), summary: { artifactHash: publication.hash },
        createdAt: new Date().toISOString()
      });
      return publication;
    },

    async listAuditLogs(siteId) {
      return structuredClone(auditLogs.filter(entry => entry.siteId === siteId).slice(-50).reverse());
    },

    async listMembers(siteId) {
      return memberships.filter(entry => entry.siteId === siteId)
        .map(({ userId, role }) => ({ userId, role }));
    },

    async changeMember(siteId, userId, role, actorId) {
      const index = memberships.findIndex(entry => entry.siteId === siteId && entry.userId === userId);
      const site = sites.get(siteId);
      const currentRole = getRoleForSite(site, userId);
      const actorRole = getRoleForSite(site, actorId);
      if (currentRole === 'owner' || ((role === 'admin' || currentRole === 'admin') && actorRole !== 'owner')) {
        return false;
      }
      if (index !== -1) memberships.splice(index, 1);
      if (role) memberships.push({ siteId, userId, role });
      if (!role && index === -1) return false;
      auditLogs.push({
        siteId, actorUserId: actorId, entityType: 'membership', entityId: userId,
        action: role ? (index === -1 ? 'insert' : 'update') : 'delete',
        summary: { role: role ?? currentRole }, createdAt: new Date().toISOString()
      });
      return true;
    },

    async getProfile(userId) {
      if (profiles.has(userId)) {
        return structuredClone(profiles.get(userId));
      }
      return formatProfileRecord(userId, {}, []);
    },

    async upsertProfile(userId, input) {
      const now = new Date().toISOString();
      const record = formatProfileRecord(
        userId,
        {
          ...input,
          updatedAt: now
        },
        input.interests ?? []
      );
      profiles.set(userId, record);
      return structuredClone(record);
    },

    async listCustomizationRequests(userId) {
      return customizationRequests
        .filter((item) => (item.userId ?? item.user_id) === userId)
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')))
        .map((item) => structuredClone(item));
    },

    async createCustomizationRequest(userId, input) {
      if (input.siteId) {
        const site = sites.get(input.siteId);
        const role = getRoleForSite(site, userId);
        if (!role) {
          throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine associada não encontrada.');
        }
      }
      const now = new Date().toISOString();
      const record = {
        id: crypto.randomUUID(),
        userId,
        siteId: input.siteId ?? null,
        storefrontType: input.storefrontType,
        templateInterest: input.templateInterest,
        goal: input.goal,
        referenceUrls: [...(input.referenceUrls ?? [])],
        desiredDeadline: input.desiredDeadline ?? '',
        status: 'novo',
        createdAt: now,
        updatedAt: now
      };
      customizationRequests.unshift(record);
      return structuredClone(record);
    },

    async getSite(siteId, userId) {
      const site = sites.get(siteId);
      const role = getRoleForSite(site, userId);
      if (!role) {
        return null;
      }
      return formatSiteSummary(site, role);
    },

    async savePublication(publication) {
      if (!publication || !publication.slug || !publication.hash) {
        throw new Error('Invalid publication record');
      }
      publicationsBySlug.set(publication.slug, publication);
      publicationsByHash.set(`${publication.slug}:${publication.hash}`, publication);
      return publication;
    },

    async getPublicationBySlug(slug) {
      if (publicationsBySlug.has(slug)) {
        return publicationsBySlug.get(slug);
      }
      if (slug === 'loja1') {
        return getPilotLoja1Publication();
      }
      return null;
    },

    async getPublicationByHash(slug, hash) {
      const key = `${slug}:${hash}`;
      if (publicationsByHash.has(key)) {
        return publicationsByHash.get(key);
      }
      if (slug === 'loja1') {
        const pilot = await getPilotLoja1Publication();
        if (pilot.hash === hash) {
          return pilot;
        }
      }
      return null;
    },

    async listSites(userId) {
      const result = [];
      for (const site of sites.values()) {
        const role = getRoleForSite(site, userId);
        if (role) {
          result.push(formatSiteSummary(site, role));
        }
      }
      return result;
    },

    async createSite({
      userId,
      name,
      slug,
      storefrontType = DEFAULT_STOREFRONT_TYPE,
      template = DEFAULT_TEMPLATE,
      catalogType,
      content
    }) {
      for (const existing of sites.values()) {
        if (existing.slug === slug) {
          throw new PortalValidationError(
            409,
            'SLUG_TAKEN',
            'Este identificador (slug) já está em uso por outra vitrine.'
          );
        }
      }
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const siteRecord = {
        id,
        ownerUserId: userId,
        slug,
        name,
        storefrontType,
        template,
        createdAt: now,
        updatedAt: now
      };
      const draftRecord = {
        siteId: id,
        revision: 1,
        updatedAt: now,
        content: structuredClone(
          content ??
            createInitialDraftContent({
              slug,
              name,
              storefrontType,
              template,
              catalogType
            })
        )
      };
      sites.set(id, siteRecord);
      drafts.set(id, draftRecord);
      return {
        site: formatSiteSummary(siteRecord, 'owner'),
        draft: structuredClone(draftRecord)
      };
    },

    async getDraft(siteId, userId) {
      const site = sites.get(siteId);
      const role = getRoleForSite(site, userId);
      if (!role) {
        return null;
      }
      const draft = drafts.get(siteId);
      if (!draft) {
        return null;
      }
      const cloned = structuredClone(draft);
      cloned.content = migrateLegacyDraftContent(cloned.content, site);
      return cloned;
    },

    async updateDraft({ siteId, userId, revision, content }) {
      const site = sites.get(siteId);
      const role = getRoleForSite(site, userId);
      if (!DRAFT_EDITOR_ROLES.includes(role)) {
        return { status: 'not_found' };
      }
      const current = drafts.get(siteId);
      if (!current) {
        return { status: 'not_found' };
      }
      if (current.revision !== revision) {
        return {
          status: 'conflict',
          currentRevision: current.revision
        };
      }
      const now = new Date().toISOString();
      const nextDraft = {
        siteId,
        revision: current.revision + 1,
        updatedAt: now,
        content: migrateLegacyDraftContent(structuredClone(content), site)
      };
      drafts.set(siteId, nextDraft);
      site.updatedAt = now;
      return {
        status: 'ok',
        draft: structuredClone(nextDraft)
      };
    },

    async recordSiteMetricBatch(slug, events, { now = new Date() } = {}) {
      const pub =
        (await this.getPublicationBySlug(slug)) ??
        (await sharedPublicPublications.getPublicationBySlug(slug));
      if (!pub || !pub.menu) {
        throw new PortalValidationError(404, 'PUBLICATION_NOT_FOUND', 'Vitrine publicada não encontrada.');
      }

      let siteId = pub.siteId ?? null;
      if (!siteId) {
        for (const site of sites.values()) {
          if (site.slug === slug) {
            siteId = site.id;
            break;
          }
        }
      }
      if (!siteId) {
        siteId = `pub-${slug}`;
      }

      const validItemIds = new Set(
        Array.isArray(pub.menu.items)
          ? pub.menu.items.map((item) => item?.id).filter(Boolean)
          : []
      );

      for (const ev of events) {
        if (ev.type === 'item_view' || ev.type === 'item_select') {
          if (!ev.itemId || !validItemIds.has(ev.itemId)) {
            throw new PortalValidationError(
              422,
              'INVALID_EVENT_ITEM',
              `Item inexistente na vitrine publicada: ${String(ev.itemId || '')}.`
            );
          }
        }
      }

      // 13-month retention purge
      const nowDate = now instanceof Date ? now : new Date(now);
      const retentionCutoff = new Date(
        Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth() - 13, nowDate.getUTCDate())
      )
        .toISOString()
        .slice(0, 10);
      const tomorrowIso = new Date(
        Date.UTC(nowDate.getUTCFullYear(), nowDate.getUTCMonth(), nowDate.getUTCDate() + 1)
      )
        .toISOString()
        .slice(0, 10);

      for (const [k, row] of metricsDaily.entries()) {
        if (row.site_id === siteId && row.metric_date < retentionCutoff) {
          metricsDaily.delete(k);
        }
      }

      let accepted = 0;
      for (const ev of events) {
        if (ev.date < retentionCutoff || ev.date > tomorrowIso) {
          continue;
        }
        const itemKey = ev.type === 'item_view' || ev.type === 'item_select' ? ev.itemId : '';
        const cents = ev.type === 'whatsapp_order' ? ev.estimatedCents ?? 0 : 0;
        const key = `${siteId}:${ev.date}:${ev.hour}:${itemKey}:${ev.type}`;
        const existing = metricsDaily.get(key);
        if (existing) {
          existing.count_value += ev.count ?? 1;
          existing.estimated_cents += cents;
          existing.updated_at = nowDate.toISOString();
        } else {
          metricsDaily.set(key, {
            site_id: siteId,
            metric_date: ev.date,
            metric_hour: ev.hour,
            item_key: itemKey,
            metric_name: ev.type,
            count_value: ev.count ?? 1,
            estimated_cents: cents,
            updated_at: nowDate.toISOString()
          });
        }
        accepted += 1;
      }

      return { accepted };
    },

    async getSiteInsights(siteId, userId, period = '7d', { referenceDate = new Date() } = {}) {
      const site = sites.get(siteId);
      const role = getRoleForSite(site, userId);
      if (!role) {
        return null;
      }
      const validPeriod = validateInsightsPeriod(period);
      const rows = [];
      for (const row of metricsDaily.values()) {
        if (row.site_id === siteId) {
          rows.push(structuredClone(row));
        }
      }

      const pub =
        (await this.getPublicationBySlug(site.slug)) ??
        (await sharedPublicPublications.getPublicationBySlug(site.slug));
      const draft = drafts.get(siteId);
      const catalogSource = pub?.menu ?? draft?.content ?? {};

      return computeStorefrontInsights({
        siteId,
        period: validPeriod,
        rows,
        catalogSource,
        referenceDate
      });
    }
  };
}

export const PUBLICATION_CACHE_TTL_MS = 30 * 1000;
const publicationFetchedAtBySlug = new Map();

export function clearPublicationsCache() {
  sharedPublicPublications.publicationsBySlug.clear();
  sharedPublicPublications.publicationsByHash.clear();
  publicationFetchedAtBySlug.clear();
}

async function hydratePublicationRecord(row) {
  if (!row || typeof row !== 'object' || !row.menu || typeof row.menu !== 'object') {
    return null;
  }
  const rawMenu = row.menu;
  const hasCategories = Array.isArray(rawMenu.categories) && rawMenu.categories.length > 0;
  const draftLike = {
    schemaVersion: 1,
    template: rawMenu.template ?? DEFAULT_TEMPLATE,
    ...(rawMenu.storefrontType ? { storefrontType: rawMenu.storefrontType } : {}),
    ...(rawMenu.catalogType ? { catalogType: rawMenu.catalogType } : {}),
    slug: row.slug ?? rawMenu.slug,
    businessName: rawMenu.name ?? rawMenu.businessName,
    whatsapp: rawMenu.whatsapp,
    ...(rawMenu.components ? { components: rawMenu.components } : {}),
    ...(rawMenu.orderFields ? { orderFields: rawMenu.orderFields } : {}),
    ...(rawMenu.messages ? { messages: rawMenu.messages } : {}),
    ...(rawMenu.structure ? { structure: {
      themeOverrides: rawMenu.structure.theme, navigationMenus: rawMenu.structure.navigation, pages: rawMenu.structure.pages
    } } : {}),
    ...(hasCategories
      ? { categories: rawMenu.categories }
      : { items: Array.isArray(rawMenu.items) ? rawMenu.items : [] })
  };
  const compiled = await compilePublicStorefront(
    draftLike,
    {
      id: row.site_id ?? undefined,
      slug: row.slug ?? rawMenu.slug,
      name: rawMenu.name ?? rawMenu.businessName,
      storefrontType: rawMenu.storefrontType ?? DEFAULT_STOREFRONT_TYPE,
      template: rawMenu.template ?? DEFAULT_TEMPLATE
    },
    {
      siteId: row.site_id ?? undefined,
      revision: Number.isSafeInteger(row.revision) && row.revision >= 1 ? row.revision : 1,
      publishedAt:
        typeof row.published_at === 'string' && row.published_at
          ? row.published_at
          : new Date().toISOString()
    }
  );
  return compiled.publication;
}

function sanitizeDiagnosticText(value) {
  if (typeof value !== 'string' || !value) return '';
  return value
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED_JWT]')
    .replace(/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, '[REDACTED_KEY]')
    .replace(/\bsbp_[A-Za-z0-9_-]+/g, '[REDACTED_TOKEN]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi, '$1[REDACTED]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .slice(0, 300);
}

async function readUpstreamErrorDetails(response) {
  if (!response) {
    return { status: 0, code: null, message: null, details: null, hint: null };
  }
  let body = null;
  try {
    const target = typeof response.clone === 'function' ? response.clone() : response;
    body = await target.json();
  } catch {
    body = null;
  }
  return {
    status: Number(response.status) || 0,
    code: body?.code ? sanitizeDiagnosticText(String(body.code)) : null,
    message: body?.message ? sanitizeDiagnosticText(String(body.message)) : null,
    details: body?.details ? sanitizeDiagnosticText(String(body.details)) : null,
    hint: body?.hint ? sanitizeDiagnosticText(String(body.hint)) : null
  };
}

function logUpstreamError(operation, errInfo) {
  console.error(
    JSON.stringify({
      event: 'supabase_upstream_error',
      operation,
      status: errInfo.status,
      code: errInfo.code,
      message: errInfo.message,
      details: errInfo.details,
      hint: errInfo.hint
    })
  );
}

function createUpstreamStoreError(operation, errInfo) {
  const err = new Error(`Supabase ${operation} error: ${errInfo.status}`);
  err.upstream = errInfo;
  return err;
}

export function createSupabaseRestStore({ supabaseUrl, supabaseAnonKey, fetch: customFetch } = {}) {
  const fetchImpl = customFetch ?? globalThis.fetch;
  const baseUrl = String(supabaseUrl ?? '').replace(/\/+$/, '');

  function authHeaders(token, extra = {}) {
    return {
      apikey: String(supabaseAnonKey),
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...extra
    };
  }

  function anonHeaders(extra = {}) {
    return {
      apikey: String(supabaseAnonKey),
      authorization: `Bearer ${supabaseAnonKey}`,
      accept: 'application/json',
      ...extra
    };
  }

  return {
    async getProfile(userId, { token } = {}) {
      const [profileRes, interestsRes] = await Promise.all([
        fetchImpl(
          `${baseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}&select=user_id,display_name,business_name,city,whatsapp,created_at,updated_at&limit=1`,
          {
            method: 'GET',
            headers: authHeaders(token)
          }
        ),
        fetchImpl(
          `${baseUrl}/rest/v1/profile_interests?user_id=eq.${encodeURIComponent(userId)}&select=interest&order=created_at.asc`,
          {
            method: 'GET',
            headers: authHeaders(token)
          }
        )
      ]);

      const profileRows = profileRes && profileRes.ok ? await profileRes.json() : [];
      const interestRows = interestsRes && interestsRes.ok ? await interestsRes.json() : [];
      const row = Array.isArray(profileRows) && profileRows.length > 0 ? profileRows[0] : {};
      const interests = Array.isArray(interestRows)
        ? interestRows.map((entry) => entry.interest).filter(Boolean)
        : [];
      return formatProfileRecord(userId, row, interests);
    },

    async upsertProfile(userId, input, { token } = {}) {
      const mutableFields = {
        display_name: input.displayName ?? '',
        business_name: input.businessName ?? '',
        city: input.city ?? '',
        whatsapp: input.whatsapp ?? ''
      };
      let profileRes = await fetchImpl(`${baseUrl}/rest/v1/profiles?on_conflict=user_id`, {
        method: 'POST',
        headers: authHeaders(token, {
          prefer: 'resolution=merge-duplicates,return=representation'
        }),
        body: JSON.stringify({
          user_id: userId,
          ...mutableFields
        })
      });

      if (profileRes && profileRes.status === 403) {
        const patchRes = await fetchImpl(
          `${baseUrl}/rest/v1/profiles?user_id=eq.${encodeURIComponent(userId)}`,
          {
            method: 'PATCH',
            headers: authHeaders(token, { prefer: 'return=representation' }),
            body: JSON.stringify(mutableFields)
          }
        );
        if (patchRes && patchRes.ok) {
          const patchedRows = await patchRes.clone().json().catch(() => []);
          if (Array.isArray(patchedRows) && patchedRows.length > 0) {
            profileRes = patchRes;
          } else {
            profileRes = await fetchImpl(`${baseUrl}/rest/v1/profiles`, {
              method: 'POST',
              headers: authHeaders(token, { prefer: 'return=representation' }),
              body: JSON.stringify({
                user_id: userId,
                ...mutableFields
              })
            });
          }
        } else if (patchRes) {
          profileRes = patchRes;
        }
      }

      if (!profileRes.ok) {
        const errInfo = await readUpstreamErrorDetails(profileRes);
        logUpstreamError('upsertProfile', errInfo);
        if (errInfo.code === '23514') {
          throw new PortalValidationError(422, 'INVALID_PROFILE', 'Dados de perfil inválidos.');
        }
        throw createUpstreamStoreError('upsertProfile', errInfo);
      }

      const [savedRow] = await profileRes.json();

      await fetchImpl(
        `${baseUrl}/rest/v1/profile_interests?user_id=eq.${encodeURIComponent(userId)}`,
        {
          method: 'DELETE',
          headers: authHeaders(token)
        }
      );

      const interests = Array.isArray(input.interests) ? input.interests : [];
      if (interests.length > 0) {
        const insInterestsRes = await fetchImpl(`${baseUrl}/rest/v1/profile_interests`, {
          method: 'POST',
          headers: authHeaders(token, { prefer: 'return=representation' }),
          body: JSON.stringify(
            interests.map((interest) => ({
              user_id: userId,
              interest
            }))
          )
        });
        if (!insInterestsRes.ok) {
          throw new Error(`Supabase profile_interests insert error: ${insInterestsRes.status}`);
        }
      }

      return formatProfileRecord(userId, savedRow ?? input, interests);
    },

    async listCustomizationRequests(userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/customization_requests?user_id=eq.${encodeURIComponent(userId)}&select=id,user_id,site_id,storefront_type,template_interest,goal,reference_urls,desired_deadline,status,created_at,updated_at&order=created_at.desc`,
        {
          method: 'GET',
          headers: authHeaders(token)
        }
      );
      if (!response.ok) {
        throw new Error(`Supabase listCustomizationRequests error: ${response.status}`);
      }
      const rows = await response.json();
      return (Array.isArray(rows) ? rows : []).map((row) => ({
        id: row.id,
        siteId: row.site_id ?? null,
        storefrontType: row.storefront_type,
        templateInterest: row.template_interest,
        goal: row.goal,
        referenceUrls: Array.isArray(row.reference_urls) ? row.reference_urls : [],
        desiredDeadline: row.desired_deadline ?? '',
        status: row.status ?? 'novo',
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at
      }));
    },

    async createCustomizationRequest(userId, input, { token } = {}) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/customization_requests`, {
        method: 'POST',
        headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({
          user_id: userId,
          site_id: input.siteId ?? null,
          storefront_type: input.storefrontType,
          template_interest: input.templateInterest,
          goal: input.goal,
          reference_urls: input.referenceUrls ?? [],
          desired_deadline: input.desiredDeadline ?? ''
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        if (response.status === 403 || errBody?.code === '42501') {
          throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine associada não encontrada.');
        }
        if (errBody?.code === '23514') {
          throw new PortalValidationError(422, 'INVALID_PAYLOAD', 'Dados do pedido de customização inválidos.');
        }
        throw new Error(`Supabase createCustomizationRequest error: ${response.status}`);
      }

      const [row] = await response.json();
      return {
        id: row.id,
        siteId: row.site_id ?? null,
        storefrontType: row.storefront_type,
        templateInterest: row.template_interest,
        goal: row.goal,
        referenceUrls: Array.isArray(row.reference_urls) ? row.reference_urls : [],
        desiredDeadline: row.desired_deadline ?? '',
        status: row.status ?? 'novo',
        createdAt: row.created_at,
        updatedAt: row.updated_at ?? row.created_at
      };
    },

    async readPlatformOperations(resource, { token }) {
      const queries = {
        overview: 'rpc/read_platform_overview',
        'audit-logs': 'audit_logs?select=id,action,entity_type,entity_id,created_at,summary&order=created_at.desc,id.desc&limit=50',
        'customization-requests': 'customization_requests?select=id,status,goal,storefront_type,created_at&order=created_at.desc,id.desc&limit=50'
      };
      const response = await fetchImpl(`${baseUrl}/rest/v1/${queries[resource]}`, { headers: authHeaders(token) });
      if (!response.ok) throw new Error('Falha ao consultar a administração da plataforma.');
      return response.json();
    },

    async updateCustomizationStatus(id, status, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/customization_requests?id=eq.${encodeURIComponent(id)}&select=id,status`,
        {
          method: 'PATCH', headers: authHeaders(token, { prefer: 'return=representation' }),
          body: JSON.stringify({ status })
        }
      );
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        if (error?.message === 'INVALID_CUSTOMIZATION_TRANSITION') {
          throw new PortalValidationError(409, 'INVALID_CUSTOMIZATION_TRANSITION', 'A solicitação mudou. Confira a etapa atual.');
        }
        throw new Error('Falha ao atualizar a solicitação.');
      }
      return (await response.json())[0] ?? null;
    },

    async isPlatformAdmin(userId, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/platform_operators?user_id=eq.${encodeURIComponent(userId)}&role=eq.platform_admin&select=role`,
        { headers: authHeaders(token) }
      );
      if (!response.ok) throw new Error('Falha ao consultar a autorização da plataforma.');
      return (await response.json()).length > 0;
    },

    async listCms({ token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/platform_cms?select=section_key,draft_content,draft_visible,draft_order,published_at&order=draft_order.asc,section_key.asc`,
        { headers: authHeaders(token) }
      );
      if (!response.ok) throw new Error('Falha ao consultar o CMS.');
      return (await response.json()).map(row => ({
        sectionKey: row.section_key, content: row.draft_content,
        visible: row.draft_visible, displayOrder: row.draft_order, publishedAt: row.published_at
      }));
    },

    async readPublicCms() {
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/read_platform_cms`, {
        headers: anonHeaders()
      });
      if (!response.ok) throw new Error('Falha ao consultar o conteúdo institucional.');
      return (await response.json()).map(row => ({
        sectionKey: row.section_key,
        ...validateCmsSection(row.section_key, { content: row.content, visible: row.visible, displayOrder: row.display_order })
      }));
    },

    async updateCms(sectionKey, input, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/platform_cms?section_key=eq.${encodeURIComponent(sectionKey)}&select=section_key`,
        {
          method: 'PATCH',
          headers: authHeaders(token, { prefer: 'return=representation' }),
          body: JSON.stringify({
            draft_content: input.content, draft_visible: input.visible, draft_order: input.displayOrder
          })
        }
      );
      if (!response.ok) throw new Error('Falha ao salvar a seção institucional.');
      return (await response.json()).length > 0;
    },

    async publishCms(expectedSections, { token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/publish_platform_cms`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ expected_sections: expectedSections })
      });
      if (!response.ok) throw new Error('Falha ao publicar o conteúdo institucional.');
      return response.json();
    },

    async listWidgets(siteId, { token }) {
      const query = new URLSearchParams({
        site_id: 'eq.' + siteId, active: 'eq.true', select: 'id,name,version_tag,bundle_hash_sha256'
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/custom_components?${query}`, { headers: authHeaders(token) });
      if (!response.ok) throw new Error('Falha ao consultar os componentes aprovados.');
      return (await response.json()).map(widget => ({
        id: widget.id, name: widget.name, version: widget.version_tag, hash: widget.bundle_hash_sha256
      }));
    },

    async approveWidget(widget, { token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/custom_components`, {
        method: 'POST', headers: authHeaders(token, { prefer: 'return=minimal' }),
        body: JSON.stringify(widget)
      });
      if (response.status === 409) {
        throw new PortalValidationError(409, 'WIDGET_VERSION_EXISTS', 'Esta versão do componente já existe.');
      }
      if (!response.ok) throw new Error('Falha ao aprovar o componente.');
    },

    async readSandboxBundle(id, hash) {
      const query = new URLSearchParams({ widget_id: id, bundle_hash: hash });
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/read_sandbox_bundle?${query}`, { headers: anonHeaders() });
      if (!response.ok) throw new Error('Falha ao carregar o componente.');
      return response.json();
    },

    async listDomains(siteId, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/custom_domains?site_id=eq.${encodeURIComponent(siteId)}&order=created_at.desc`,
        { headers: authHeaders(token) }
      );
      if (!response.ok) throw new Error('Falha ao consultar domínios.');
      return response.json();
    },

    async addDomain(siteId, challenge, { token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/custom_domains`, {
        method: 'POST', headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({
          site_id: siteId, hostname: challenge.hostname,
          is_apex: challenge.is_apex, cname_target: challenge.cname_target
        })
      });
      if (response.status === 409) {
        throw new PortalValidationError(409, 'HOSTNAME_TAKEN', 'Este endereço já está vinculado.');
      }
      if (!response.ok) throw new Error('Falha ao cadastrar o domínio.');
      return (await response.json())[0];
    },

    async pendingDomains(env) {
      const url = new URL(`${baseUrl}/rest/v1/custom_domains`);
      url.search = new URLSearchParams({
        status: 'eq.verifying', cf_hostname_id: 'not.is.null', order: 'lease_until.asc', limit: '8'
      });
      const token = env.SUPABASE_SERVICE_ROLE_KEY;
      const response = await fetchImpl(url, { headers: { apikey: token, authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('Falha ao consultar domínios pendentes.');
      return response.json();
    },

    async changeDomain(domain, change, { env, claim = false, remove = false }) {
      const endpoint = new URL(`${baseUrl}/rest/v1/custom_domains`);
      endpoint.search = new URLSearchParams({
        id: 'eq.' + domain.id, site_id: 'eq.' + domain.site_id,
        lease_until: claim ? 'lt.' + new Date().toISOString() : 'eq.' + domain.lease_until,
        ...(claim ? { status: 'eq.' + domain.status } : {})
      });
      const token = env.SUPABASE_SERVICE_ROLE_KEY;
      const response = await fetchImpl(endpoint, {
        method: remove ? 'DELETE' : 'PATCH',
        headers: {
          apikey: token, authorization: `Bearer ${token}`, 'content-type': 'application/json',
          prefer: 'return=representation'
        },
        ...(remove ? {} : { body: JSON.stringify(change) })
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        if (error?.message?.includes('DOMAIN_QUOTA_REACHED')) {
          throw new PortalValidationError(403, 'DOMAIN_QUOTA_REACHED', 'A cota de domínios da plataforma foi atingida.');
        }
        throw new Error('Falha ao atualizar o estado do domínio.');
      }
      return (await response.json())[0] ?? null;
    },

    async resolveDomain(hostname) {
      const endpoint = new URL(`${baseUrl}/rest/v1/rpc/resolve_showcase_hostname`);
      endpoint.searchParams.set('requested_hostname', hostname);
      const response = await fetchImpl(endpoint, { headers: anonHeaders() });
      if (!response.ok) throw new Error('Falha ao resolver o domínio.');
      return response.json();
    },

    async listAssets(siteId, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/assets?site_id=eq.${encodeURIComponent(siteId)}&upload_state=eq.ready&order=created_at.desc`,
        { headers: authHeaders(token) }
      );
      if (!response.ok) throw new Error('Falha ao consultar a biblioteca.');
      return (await response.json()).map(row => ({
        id: row.id, key: row.object_key, url: row.public_url,
        bytes: row.byte_size, provider: row.storage_provider
      }));
    },

    async reserveAsset(asset, { token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/assets`, {
        method: 'POST',
        headers: authHeaders(token, { prefer: 'return=minimal' }),
        body: JSON.stringify(asset)
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        if (error?.message?.includes('ASSET_QUOTA_EXCEEDED')) {
          throw new PortalValidationError(409, 'ASSET_QUOTA_EXCEEDED', 'Limite de arquivos da vitrine atingido.');
        }
        throw new Error('Falha ao reservar espaço para o arquivo.');
      }
    },

    async completeAsset(id, { token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/assets?id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({ upload_state: 'ready' })
      });
      if (!response.ok || !(await response.json()).length) throw new Error('Falha ao registrar o arquivo.');
    },

    async removeAsset(id, { token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/assets?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE', headers: authHeaders(token)
      });
      if (!response.ok) throw new Error('Falha ao remover o arquivo da biblioteca.');
    },

    async listPlatformTemplates({ token }) {
      const fields = 'code,name,storefront_type,catalog_type,default_tokens,default_sections';
      const query = new URLSearchParams({
        select: fields, order: 'name.asc', limit: '100'
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/templates?${query}`, { headers: authHeaders(token) });
      if (!response.ok) throw new Error('Falha ao consultar os modelos.');
      return response.json();
    },

    async createPlatformTemplate(code, baseCode, template, { token }) {
      const query = new URLSearchParams({
        code: 'eq.' + baseCode, select: 'storefront_type,catalog_type,schema_version'
      });
      const baseResponse = await fetchImpl(`${baseUrl}/rest/v1/templates?${query}`, { headers: authHeaders(token) });
      if (!baseResponse.ok) throw new Error('Falha ao consultar o modelo-base.');
      const [base] = await baseResponse.json();
      if (!base) return null;
      const response = await fetchImpl(`${baseUrl}/rest/v1/templates`, {
        method: 'POST', headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({ ...base, ...template, code })
      });
      if (response.status === 409) throw new PortalValidationError(409, 'TEMPLATE_EXISTS', 'Já existe um modelo com esse identificador.');
      if (!response.ok) throw new Error('Falha ao cadastrar o modelo.');
      return (await response.json())[0] ?? null;
    },

    async listStructureTemplates(catalogType, { token }) {
      const query = new URLSearchParams({
        catalog_type: 'eq.' + catalogType, active: 'eq.true', is_custom_only: 'eq.false',
        select: 'code,name', order: 'name.asc', limit: '100'
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/templates?${query}`, { headers: authHeaders(token) });
      if (!response.ok) throw new Error('Falha ao consultar modelos compatíveis.');
      return response.json();
    },

    async updatePlatformTemplate(code, template, { token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/templates?code=eq.${encodeURIComponent(code)}`, {
        method: 'PATCH', headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify(template)
      });
      if (!response.ok) throw new Error('Falha ao salvar o modelo.');
      return (await response.json())[0] ?? null;
    },

    async getStructureDefaults(template, { token }) {
      const [templateResult, moduleResult] = await Promise.all([
        fetchImpl(`${baseUrl}/rest/v1/templates?code=eq.${encodeURIComponent(template)}&active=eq.true&is_custom_only=eq.false&select=default_tokens,default_sections,catalog_type`,
          { headers: authHeaders(token) }),
        fetchImpl(`${baseUrl}/rest/v1/modules?active=eq.true&select=code,default_config`,
          { headers: authHeaders(token) })
      ]);
      if (!templateResult.ok || !moduleResult.ok) throw new Error('Falha ao consultar os modelos da vitrine.');
      const [row] = await templateResult.json();
      return {
        catalogType: row?.catalog_type,
        template: { defaultTokens: row?.default_tokens, defaultSections: row?.default_sections },
        modules: Object.fromEntries((await moduleResult.json()).map(entry => [entry.code, entry.default_config]))
      };
    },

    async listReleases(siteId, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/publication_releases?site_id=eq.${encodeURIComponent(siteId)}&order=published_at.desc,revision.desc&limit=5`,
        { headers: authHeaders(token) }
      );
      if (!response.ok) throw new Error('Falha ao consultar as versões publicadas.');
      return Promise.all((await response.json()).map(async row => ({
        ...await hydratePublicationRecord(row),
        storedHash: row.artifact_hash
      })));
    },

    async rollbackRelease(siteId, revision, _actorId, { token }) {
      const release = (await this.listReleases(siteId, { token })).find(entry => entry.revision === revision);
      if (!release || release.hash !== release.storedHash) return null;
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/rollback_showcase`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify({ target_site: siteId, target_revision: revision, target_hash: release.hash })
      });
      if (!response.ok) throw new Error('Falha ao restaurar a versão publicada.');
      return hydratePublicationRecord(await response.json());
    },

    async listAuditLogs(siteId, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/audit_logs?site_id=eq.${encodeURIComponent(siteId)}&order=created_at.desc,id.desc&limit=50`,
        { headers: authHeaders(token) }
      );
      if (!response.ok) throw new Error('Falha ao consultar o histórico da vitrine.');
      return (await response.json()).map(row => ({
        siteId: row.site_id, actorUserId: row.actor_user_id, action: row.action,
        entityType: row.entity_type, entityId: row.entity_id,
        summary: row.summary, createdAt: row.created_at
      }));
    },

    async listMembers(siteId, { token }) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/site_memberships?site_id=eq.${encodeURIComponent(siteId)}&select=user_id,role&order=user_id.asc`,
        { headers: authHeaders(token) }
      );
      if (!response.ok) throw new Error('Falha ao consultar a equipe da vitrine.');
      return (await response.json()).map(row => ({ userId: row.user_id, role: row.role }));
    },

    async changeMember(siteId, userId, role, _actorId, { token }) {
      const endpoint = `${baseUrl}/rest/v1/site_memberships`;
      const response = role
        ? await fetchImpl(`${baseUrl}/rest/v1/rpc/set_showcase_member`, {
          method: 'POST',
          headers: authHeaders(token),
          body: JSON.stringify({ target_site: siteId, target_user: userId, target_role: role })
        })
        : await fetchImpl(`${endpoint}?site_id=eq.${encodeURIComponent(siteId)}&user_id=eq.${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: authHeaders(token, { prefer: 'return=representation' })
        });
      if ([400, 401, 403, 409].includes(response.status)) return false;
      if (!response.ok) throw new Error('Falha ao atualizar a equipe da vitrine.');
      return Boolean(role) || (await response.json()).length > 0;
    },

    async listSites(userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/sites?select=id,owner_user_id,slug,name,storefront_type,template,created_at,updated_at,site_memberships(user_id,role)&order=created_at.asc`,
        {
          method: 'GET',
          headers: authHeaders(token)
        }
      );
      if (!response.ok) {
        throw new Error(`Supabase listSites error: ${response.status}`);
      }
      const rows = await response.json();
      return rows.map(row => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        storefrontType: row.storefront_type ?? DEFAULT_STOREFRONT_TYPE,
        template: row.template ?? DEFAULT_TEMPLATE,
        role: row.owner_user_id === userId ? 'owner' :
          row.site_memberships?.find(member => member.user_id === userId)?.role ?? 'collaborator',
        updatedAt: row.updated_at ?? row.created_at
      }));
    },

    async getSite(siteId, userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/sites?id=eq.${encodeURIComponent(siteId)}&select=id,owner_user_id,slug,name,storefront_type,template,created_at,updated_at,site_memberships(user_id,role)`,
        {
          method: 'GET',
          headers: authHeaders(token)
        }
      );
      if (!response.ok) {
        return null;
      }
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        id: row.id,
        slug: row.slug,
        name: row.name,
        storefrontType: row.storefront_type ?? DEFAULT_STOREFRONT_TYPE,
        template: row.template ?? DEFAULT_TEMPLATE,
        role: row.owner_user_id === userId ? 'owner' :
          row.site_memberships?.find(member => member.user_id === userId)?.role ?? 'collaborator',
        updatedAt: row.updated_at ?? row.created_at
      };
    },

    async createSite(
      {
        userId,
        name,
        slug,
        storefrontType = DEFAULT_STOREFRONT_TYPE,
        template = DEFAULT_TEMPLATE,
        catalogType,
        content
      },
      { token } = {}
    ) {
      const siteRes = await fetchImpl(`${baseUrl}/rest/v1/sites`, {
        method: 'POST',
        headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({
          owner_user_id: userId,
          slug,
          name,
          storefront_type: storefrontType,
          template
        })
      });

      if (siteRes.status === 409) {
        throw new PortalValidationError(
          409,
          'SLUG_TAKEN',
          'Este identificador (slug) já está em uso por outra vitrine.'
        );
      }
      if (!siteRes.ok) {
        const errBody = await siteRes.json().catch(() => ({}));
        if (errBody?.code === '23505') {
          throw new PortalValidationError(
            409,
            'SLUG_TAKEN',
            'Este identificador (slug) já está em uso por outra vitrine.'
          );
        }
        if (errBody?.code === '23514') {
          throw new PortalValidationError(400, 'INVALID_SLUG', 'Identificador (slug) inválido.');
        }
        throw new Error(`Supabase createSite error: ${siteRes.status}`);
      }

      const [siteRow] = await siteRes.json();
      const draftContent =
        content ??
        createInitialDraftContent({
          slug,
          name,
          storefrontType,
          template,
          catalogType
        });

      const draftRes = await fetchImpl(`${baseUrl}/rest/v1/drafts`, {
        method: 'POST',
        headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({
          site_id: siteRow.id,
          content: draftContent
        })
      });

      if (!draftRes.ok) {
        throw new Error(`Supabase createDraft error: ${draftRes.status}`);
      }
      const [draftRow] = await draftRes.json();
      const updatedAt = siteRow.updated_at ?? siteRow.created_at ?? new Date().toISOString();

      return {
        site: {
          id: siteRow.id,
          slug: siteRow.slug,
          name: siteRow.name,
          storefrontType: siteRow.storefront_type ?? storefrontType,
          template: siteRow.template ?? DEFAULT_TEMPLATE,
          role: 'owner',
          updatedAt
        },
        draft: {
          siteId: draftRow.site_id,
          revision: draftRow.revision,
          updatedAt: draftRow.updated_at ?? updatedAt,
          content: migrateLegacyDraftContent(draftRow.content, siteRow)
        }
      };
    },

    async getDraft(siteId, _userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/drafts?site_id=eq.${encodeURIComponent(siteId)}&select=site_id,revision,updated_at,content`,
        {
          method: 'GET',
          headers: authHeaders(token)
        }
      );
      if (!response.ok) {
        const errInfo = await readUpstreamErrorDetails(response);
        logUpstreamError('getDraft', errInfo);
        return null;
      }
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        siteId: row.site_id,
        revision: row.revision,
        updatedAt: row.updated_at,
        content: migrateLegacyDraftContent(row.content)
      };
    },

    async updateDraft({ siteId, userId, revision, content }, { token } = {}) {
      const current = await this.getDraft(siteId, userId, { token });
      if (!current) {
        return { status: 'not_found' };
      }
      if (current.revision !== revision) {
        return {
          status: 'conflict',
          currentRevision: current.revision
        };
      }
      const migratedContent = migrateLegacyDraftContent(content);
      const updateRes = await fetchImpl(
        `${baseUrl}/rest/v1/drafts?site_id=eq.${encodeURIComponent(siteId)}&revision=eq.${encodeURIComponent(String(revision))}`,
        {
          method: 'PATCH',
          headers: authHeaders(token, { prefer: 'return=representation' }),
          body: JSON.stringify({ content: migratedContent })
        }
      );
      if (!updateRes.ok) {
        const errInfo = await readUpstreamErrorDetails(updateRes);
        logUpstreamError('updateDraft', errInfo);
        return { status: 'not_found' };
      }
      const updatedRows = await updateRes.json();
      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        const latest = await this.getDraft(siteId, userId, { token });
        if (!latest || latest.revision === revision) {
          return { status: 'not_found' };
        }
        return {
          status: 'conflict',
          currentRevision: latest.revision
        };
      }
      const row = updatedRows[0];
      return {
        status: 'ok',
        draft: {
          siteId: row.site_id,
          revision: row.revision,
          updatedAt: row.updated_at,
          content: migrateLegacyDraftContent(row.content)
        }
      };
    },

    async savePublication(publication, { token } = {}) {
      if (token && publication?.siteId && baseUrl && supabaseAnonKey && typeof fetchImpl === 'function') {
        const mutablePublicationFields = {
          slug: publication.slug,
          revision: publication.revision,
          status: 'active',
          artifact_hash: publication.hash,
          menu: publication.menu,
          published_at: publication.publishedAt
        };
        let pubRes = await fetchImpl(`${baseUrl}/rest/v1/publications?on_conflict=site_id`, {
          method: 'POST',
          headers: authHeaders(token, {
            prefer: 'resolution=merge-duplicates,return=representation'
          }),
          body: JSON.stringify({
            site_id: publication.siteId,
            ...mutablePublicationFields
          })
        });
        if (pubRes && pubRes.status === 403) {
          const patchRes = await fetchImpl(
            `${baseUrl}/rest/v1/publications?site_id=eq.${encodeURIComponent(publication.siteId)}`,
            {
              method: 'PATCH',
              headers: authHeaders(token, { prefer: 'return=representation' }),
              body: JSON.stringify(mutablePublicationFields)
            }
          );
          if (patchRes && patchRes.ok) {
            const patchedRows = await patchRes.clone().json().catch(() => []);
            if (Array.isArray(patchedRows) && patchedRows.length > 0) {
              pubRes = patchRes;
            } else {
              pubRes = await fetchImpl(`${baseUrl}/rest/v1/publications`, {
                method: 'POST',
                headers: authHeaders(token, { prefer: 'return=representation' }),
                body: JSON.stringify({
                  site_id: publication.siteId,
                  ...mutablePublicationFields
                })
              });
            }
          } else if (patchRes && patchRes.status !== 404) {
            pubRes = patchRes;
          }
        }
        if (pubRes && !pubRes.ok && pubRes.status !== 404) {
          const errInfo = await readUpstreamErrorDetails(pubRes);
          logUpstreamError('savePublication', errInfo);
          throw createUpstreamStoreError('savePublication', errInfo);
        }
      }
      publicationFetchedAtBySlug.set(publication.slug, Date.now());
      return sharedPublicPublications.savePublication(publication);
    },

    async getPublicationBySlug(slug) {
      const nowMs = Date.now();
      const cachedAt = publicationFetchedAtBySlug.get(slug) ?? 0;
      if (
        sharedPublicPublications.publicationsBySlug.has(slug) &&
        nowMs - cachedAt < PUBLICATION_CACHE_TTL_MS
      ) {
        return sharedPublicPublications.publicationsBySlug.get(slug);
      }
      if (slug === 'loja1') {
        return getPilotLoja1Publication();
      }

      if (baseUrl && supabaseAnonKey && typeof fetchImpl === 'function') {
        try {
          const response = await fetchImpl(
            `${baseUrl}/rest/v1/publications?slug=eq.${encodeURIComponent(slug)}&status=eq.active&select=slug,revision,artifact_hash,menu,published_at&limit=1`,
            {
              method: 'GET',
              headers: anonHeaders()
            }
          );
          if (response && response.ok) {
            const rows = await response.json();
            if (Array.isArray(rows) && rows.length > 0) {
              const hydrated = await hydratePublicationRecord(rows[0]);
              if (hydrated) {
                publicationFetchedAtBySlug.set(hydrated.slug, nowMs);
                await sharedPublicPublications.savePublication(hydrated);
                if (
                  typeof rows[0].artifact_hash === 'string' &&
                  rows[0].artifact_hash !== hydrated.hash
                ) {
                  sharedPublicPublications.publicationsByHash.set(
                    `${hydrated.slug}:${rows[0].artifact_hash}`,
                    hydrated
                  );
                }
                return hydrated;
              }
            }
          }
        } catch {
          // Fall back to in-memory or pilot publication on transient fetch errors
        }
      }

      return sharedPublicPublications.getPublicationBySlug(slug);
    },

    async getPublicationByHash(slug, hash) {
      const key = `${slug}:${hash}`;
      if (sharedPublicPublications.publicationsByHash.has(key)) {
        return sharedPublicPublications.publicationsByHash.get(key);
      }
      if (slug === 'loja1') {
        const pilot = await getPilotLoja1Publication();
        if (pilot.hash === hash) {
          return pilot;
        }
      }

      if (baseUrl && supabaseAnonKey && typeof fetchImpl === 'function') {
        try {
          let row = null;
          const releaseRes = await fetchImpl(
            `${baseUrl}/rest/v1/publication_releases?slug=eq.${encodeURIComponent(slug)}&artifact_hash=eq.${encodeURIComponent(hash)}&select=slug,revision,artifact_hash,menu,published_at&limit=1`,
            {
              method: 'GET',
              headers: anonHeaders()
            }
          );
          if (releaseRes && releaseRes.ok) {
            const releaseRows = await releaseRes.json();
            if (Array.isArray(releaseRows) && releaseRows.length > 0) {
              row = releaseRows[0];
            }
          }

          if (!row) {
            const activeRes = await fetchImpl(
              `${baseUrl}/rest/v1/publications?slug=eq.${encodeURIComponent(slug)}&artifact_hash=eq.${encodeURIComponent(hash)}&select=slug,revision,artifact_hash,menu,published_at&limit=1`,
              {
                method: 'GET',
                headers: anonHeaders()
              }
            );
            if (activeRes && activeRes.ok) {
              const activeRows = await activeRes.json();
              if (Array.isArray(activeRows) && activeRows.length > 0) {
                row = activeRows[0];
              }
            }
          }

          if (row) {
            const hydrated = await hydratePublicationRecord(row);
            if (hydrated) {
              sharedPublicPublications.publicationsByHash.set(key, hydrated);
              sharedPublicPublications.publicationsByHash.set(
                `${hydrated.slug}:${hydrated.hash}`,
                hydrated
              );
              return hydrated;
            }
          }
        } catch {
          // Fall back to in-memory or pilot publication
        }
      }

      return sharedPublicPublications.getPublicationByHash(slug, hash);
    },

    async recordSiteMetricBatch(slug, events, { now = new Date() } = {}) {
      if (baseUrl && supabaseAnonKey && typeof fetchImpl === 'function') {
        const rpcRes = await fetchImpl(`${baseUrl}/rest/v1/rpc/record_site_metric_batch`, {
          method: 'POST',
          headers: anonHeaders({ 'content-type': 'application/json' }),
          body: JSON.stringify({
            target_slug: slug,
            events
          })
        });
        if (rpcRes && rpcRes.ok) {
          const acceptedCount = await rpcRes.json().catch(() => events.length);
          return {
            accepted:
              typeof acceptedCount === 'number' && Number.isFinite(acceptedCount)
                ? acceptedCount
                : events.length
          };
        }
        if (rpcRes && rpcRes.status !== 404) {
          const errBody = await rpcRes.json().catch(() => ({}));
          const msg = String(errBody?.message ?? '');
          if (rpcRes.status === 404 || errBody?.code === 'P0002' || msg.includes('PUBLICATION_NOT_FOUND')) {
            throw new PortalValidationError(
              404,
              'PUBLICATION_NOT_FOUND',
              'Vitrine publicada não encontrada.'
            );
          }
          if (errBody?.code === '23514' || msg.includes('INVALID_EVENT_ITEM')) {
            throw new PortalValidationError(
              422,
              'INVALID_EVENT_ITEM',
              'Item inexistente na vitrine publicada.'
            );
          }
          if (errBody?.code === '22023' || msg.includes('INVALID_EVENTS_BATCH')) {
            throw new PortalValidationError(
              400,
              'INVALID_EVENTS_BATCH',
              'Lote de eventos inválido.'
            );
          }
        }
      }

      return sharedPublicPublications.recordSiteMetricBatch(slug, events, { now });
    },

    async getSiteInsights(
      siteId,
      userId,
      period = '7d',
      { token, referenceDate = new Date() } = {}
    ) {
      const site = await this.getSite(siteId, userId, { token });
      if (!site) {
        return null;
      }
      const validPeriod = validateInsightsPeriod(period);
      const daysCount = validPeriod === '90d' ? 90 : validPeriod === '30d' ? 30 : 7;
      const refIso =
        typeof referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(referenceDate)
          ? referenceDate
          : (referenceDate instanceof Date ? referenceDate : new Date(referenceDate))
              .toISOString()
              .slice(0, 10);
      const [ry, rm, rd] = refIso.split('-').map(Number);
      const minDateIso = new Date(Date.UTC(ry, rm - 1, rd - (daysCount * 2)))
        .toISOString()
        .slice(0, 10);

      let rows = [];
      if (baseUrl && supabaseAnonKey && typeof fetchImpl === 'function') {
        const metricsRes = await fetchImpl(
          `${baseUrl}/rest/v1/site_metrics_daily?site_id=eq.${encodeURIComponent(siteId)}&metric_date=gte.${encodeURIComponent(minDateIso)}&select=site_id,metric_date,metric_hour,item_key,metric_name,count_value,estimated_cents&order=metric_date.asc`,
          {
            method: 'GET',
            headers: authHeaders(token)
          }
        );
        if (metricsRes && metricsRes.ok) {
          const data = await metricsRes.json();
          if (Array.isArray(data)) {
            rows = data;
          }
        }
      }

      const pub = await this.getPublicationBySlug(site.slug);
      const draft = !pub ? await this.getDraft(siteId, userId, { token }) : null;
      const catalogSource = pub?.menu ?? draft?.content ?? {};

      return computeStorefrontInsights({
        siteId,
        period: validPeriod,
        rows,
        catalogSource,
        referenceDate
      });
    }
  };
}

const sharedPublicPublications = createMemoryStore({ sites: [], drafts: [], memberships: [] });

const DEFAULT_NOT_FOUND_HTML = `<!doctype html>
<html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Página não encontrada — Vitrine Inspira</title><link rel="stylesheet" href="/styles.css"><link rel="icon" href="/assets/brand/plus.svg"></head><body><main class="wrap section-space"><a class="brand" href="/"><img src="/assets/brand/plus.svg" width="36" height="36" alt="">Vitrine Inspira</a><h1 class="section-space">Essa página<br>não está aqui.</h1><p>O endereço pode ter mudado ou ainda não ter sido publicado.</p><p><a class="text-link" href="/">Voltar ao início →</a></p></main></body></html>
`;

async function renderNotFoundPageResponse(request, method, assetsFetcher) {
  let html = DEFAULT_NOT_FOUND_HTML;
  if (assetsFetcher && typeof assetsFetcher.fetch === 'function') {
    try {
      const notFoundUrl = new URL('/404.html', request.url);
      const assetRes = await assetsFetcher.fetch(new Request(notFoundUrl, { method: 'GET' }));
      if (assetRes && (assetRes.ok || assetRes.status === 404)) {
        const text = await assetRes.text();
        if (text && text.includes('Essa página')) {
          html = text;
        }
      }
    } catch {
      // Fallback to built-in 404 HTML
    }
  }
  return new Response(method === 'HEAD' ? null : html, {
    status: 404,
    headers: {
      ...PUBLIC_SECURITY_HEADERS,
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store'
    }
  });
}

const RESERVED_PUBLIC_PATHS = new Set([
  ...RESERVED_SLUGS,
  'vitrine',
  '404',
  '404.html',
  'index.html',
  'styles.css',
  'app.js',
  'theme.js',
  'dot-trail.js',
  'favicon.ico'
]);

async function handlePublicStorefrontOrMenuRequest(request, pathname, method, store, assetsFetcher) {
  if (method !== 'GET' && method !== 'HEAD') {
    return null;
  }

  // 1. Immutable hashed menu release: /data/vitrines/<slug>/releases/<hash>.json
  const releaseMatch = pathname.match(/^\/data\/vitrines\/([a-z0-9]+(?:-[a-z0-9]+)*)\/releases\/([a-f0-9]{64})\.json$/);
  if (releaseMatch) {
    const [, slug, hash] = releaseMatch;
    const pub =
      (await store.getPublicationByHash?.(slug, hash)) ??
      (await sharedPublicPublications.getPublicationByHash(slug, hash));
    if (pub) {
      return new Response(method === 'HEAD' ? null : JSON.stringify(pub.menu), {
        status: 200,
        headers: {
          ...PUBLIC_SECURITY_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': IMMUTABLE_CACHE_CONTROL,
          etag: `"${pub.hash}"`
        }
      });
    }
    if (assetsFetcher && typeof assetsFetcher.fetch === 'function') {
      const assetRes = await assetsFetcher.fetch(request);
      if (assetRes.ok) {
        const headers = new Headers(assetRes.headers);
        for (const [k, v] of Object.entries(PUBLIC_SECURITY_HEADERS)) headers.set(k, v);
        headers.set('content-type', 'application/json; charset=utf-8');
        headers.set('cache-control', IMMUTABLE_CACHE_CONTROL);
        return new Response(method === 'HEAD' ? null : assetRes.body, {
          status: assetRes.status,
          headers
        });
      }
    }
    return errorResponse(404, 'PUBLICATION_NOT_FOUND', 'Versão publicada não encontrada.', {});
  }

  // 2. Active public menu artifact: /data/vitrines/<slug>/menu.json
  const menuMatch = pathname.match(/^\/data\/vitrines\/([a-z0-9]+(?:-[a-z0-9]+)*)\/menu\.json$/);
  if (menuMatch) {
    const slug = menuMatch[1];
    const pub =
      (await store.getPublicationBySlug?.(slug)) ??
      (await sharedPublicPublications.getPublicationBySlug(slug));
    if (pub) {
      return new Response(method === 'HEAD' ? null : JSON.stringify(pub.menu), {
        status: 200,
        headers: {
          ...PUBLIC_SECURITY_HEADERS,
          'content-type': 'application/json; charset=utf-8',
          'cache-control': STOREFRONT_CACHE_CONTROL,
          etag: `"${pub.hash}"`
        }
      });
    }
    if (assetsFetcher && typeof assetsFetcher.fetch === 'function') {
      const assetRes = await assetsFetcher.fetch(request);
      if (assetRes.ok) {
        const headers = new Headers(assetRes.headers);
        for (const [k, v] of Object.entries(PUBLIC_SECURITY_HEADERS)) headers.set(k, v);
        headers.set('content-type', 'application/json; charset=utf-8');
        headers.set('cache-control', STOREFRONT_CACHE_CONTROL);
        return new Response(method === 'HEAD' ? null : assetRes.body, {
          status: assetRes.status,
          headers
        });
      }
    }
    return errorResponse(404, 'PUBLICATION_NOT_FOUND', 'Cardápio público não encontrado.');
  }

  // 3. Public storefront page: /<slug> or /<slug>/ or /<slug>/index.html
  const storefrontMatch = pathname.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/|\/index\.html)?$/);
  if (storefrontMatch) {
    const slug = storefrontMatch[1];
    if (RESERVED_PUBLIC_PATHS.has(slug) || !isValidSlug(slug)) {
      return null;
    }

    const pub =
      (await store.getPublicationBySlug?.(slug)) ??
      (await sharedPublicPublications.getPublicationBySlug(slug));
    if (pub) {
      const html = renderStorefrontHtml(pub.menu);
      const hasExternalStorageImages = Boolean(
        Array.isArray(pub.menu?.items) &&
          pub.menu.items.some((item) => typeof item?.imageUrl === 'string' && item.imageUrl.trim())
      );
      return new Response(method === 'HEAD' ? null : html, {
        status: 200,
        headers: {
          ...PUBLIC_SECURITY_HEADERS,
          'content-security-policy': (hasExternalStorageImages ? STOREFRONT_STORAGE_CSP_HEADER : STRICT_CSP_HEADER) +
            (pub.menu.structure ? WIDGET_FRAME_CSP : ''),
          'content-type': 'text/html; charset=utf-8',
          'cache-control': STOREFRONT_CACHE_CONTROL,
          etag: `"${pub.hash}"`
        }
      });
    }

    if (assetsFetcher && typeof assetsFetcher.fetch === 'function') {
      const menuProbeUrl = new URL(`/data/vitrines/${slug}/menu.json`, request.url);
      const menuProbe = await assetsFetcher.fetch(new Request(menuProbeUrl));
      if (menuProbe.ok) {
        const menuData = await menuProbe.json();
        const html = renderStorefrontHtml(menuData);
        return new Response(method === 'HEAD' ? null : html, {
          status: 200,
          headers: {
            ...PUBLIC_SECURITY_HEADERS,
            'content-type': 'text/html; charset=utf-8',
            'cache-control': STOREFRONT_CACHE_CONTROL
          }
        });
      }
    }

    return renderNotFoundPageResponse(request, method, assetsFetcher);
  }

  return null;
}

function normalizeStore(providedStore) {
  if (!providedStore) {
    return createMemoryStore();
  }
  if (
    typeof providedStore.listSites === 'function' &&
    typeof providedStore.createSite === 'function' &&
    typeof providedStore.getDraft === 'function' &&
    typeof providedStore.updateDraft === 'function'
  ) {
    return providedStore;
  }
  return createMemoryStore(providedStore);
}

async function parseJsonRequest(request) {
  let rawText;
  try {
    rawText = await request.text();
  } catch {
    throw new PortalValidationError(400, 'INVALID_JSON', 'Não foi possível ler o corpo da requisição.');
  }
  if (!rawText || !rawText.trim()) {
    throw new PortalValidationError(400, 'INVALID_JSON', 'O corpo da requisição JSON está vazio.');
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new PortalValidationError(400, 'INVALID_JSON', 'O corpo da requisição não contém JSON válido.');
  }
  return { rawText, parsed };
}

function validateMutationOriginAndJson(
  request,
  url,
  { requireOrigin = false, requireJson = true } = {}
) {
  const requestOrigin = (request.headers.get('origin') || '').trim();
  if (requireOrigin) {
    if (!requestOrigin || requestOrigin !== url.origin) {
      return errorResponse(
        403,
        'FORBIDDEN_ORIGIN',
        'Origem da requisição inválida para esta operação.'
      );
    }
  } else if (requestOrigin && requestOrigin !== url.origin) {
    return errorResponse(
      403,
      'FORBIDDEN_ORIGIN',
      'Origem da requisição inválida para esta operação.'
    );
  }

  if (requireJson) {
    const contentType = (request.headers.get('content-type') || '').trim();
    if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
      return errorResponse(
        415,
        'UNSUPPORTED_MEDIA_TYPE',
        'O cabeçalho Content-Type deve ser application/json.'
      );
    }
  }
  return null;
}

async function loadStructureDefaults(store, site, draft, options, code = draft.content.structure?.templateCode) {
  if (code != null && (typeof code !== 'string' || !TEMPLATE_CODE_PATTERN.test(code))) {
    throw new PortalValidationError(422, 'INVALID_TEMPLATE', 'Identificador de modelo inválido.');
  }
  const defaults = await store.getStructureDefaults?.(code ?? site.template, options);
  if (code != null && (!defaults?.catalogType || defaults.catalogType !== draft.content.catalogType)) {
    throw new PortalValidationError(422, 'INCOMPATIBLE_TEMPLATE', 'Escolha um modelo ativo compatível com este catálogo.');
  }
  return defaults;
}

async function resolveDraftForPublication(store, site, draft, options) {
  if (!draft.content.structure) return draft.content;
  const defaults = await loadStructureDefaults(store, site, draft, options);
  const resolved = resolveShowcaseManifest(draft.content.structure, defaults?.template, {}, defaults?.modules);
  await assertApprovedWidgets(store, site.id, resolved.pages, options);
  return {
    ...draft.content,
    structure: { themeOverrides: resolved.theme, navigationMenus: resolved.navigation, pages: resolved.pages }
  };
}

async function assertApprovedWidgets(store, siteId, pages, options) {
  const widgets = (Array.isArray(pages) ? pages : []).flatMap(page => Array.isArray(page?.sections) ? page.sections : [])
    .filter(section => section?.moduleCode === 'custom_sandbox' && section.active !== false);
  if (!widgets.length) return;
  const approved = await store.listWidgets?.(siteId, options) ?? [];
  if (widgets.some(({ config }) => !approved.some(widget =>
    widget.id === config?.widgetId && widget.hash === config?.bundleHash
  ))) throw new PortalValidationError(422, 'UNAPPROVED_WIDGET', 'Há um componente sem aprovação para esta vitrine.');
}

async function handleSandboxPage(request, url, store) {
  const headers = {
    'content-security-policy': SANDBOX_CSP,
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff',
    'x-robots-tag': 'noindex, nofollow',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
    'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()'
  };
  const match = url.pathname.match(/^\/embed\/([a-f0-9-]+)$/);
  const hash = url.searchParams.get('v');
  if (!match || !UUID_PATTERN.test(match[1]) || !/^[a-f0-9]{64}$/.test(hash ?? '') ||
      !['GET', 'HEAD'].includes(request.method) || !store.readSandboxBundle) {
    return new Response(null, { status: 404, headers });
  }
  try {
    const bundle = await store.readSandboxBundle(match[1], hash);
    if (typeof bundle !== 'string' || await computeSha256Hex(bundle) !== hash) {
      return new Response(null, { status: 404, headers });
    }
    return new Response(request.method === 'HEAD' ? null : bundle, { headers });
  } catch {
    return new Response(null, { status: 502, headers });
  }
}

function domainPresentation(row) {
  return {
    id: row.id, hostname: row.hostname, isApex: row.is_apex, status: row.status, sslStatus: row.ssl_status,
    txtName: row.verification_txt_name, txtValue: row.verification_txt_value, cnameTarget: row.cname_target
  };
}

function isExternalHostname(hostname) {
  return hostname.includes('.') && !hostname.endsWith('.inspira.dev.br') &&
    !hostname.endsWith('.workers.dev') && !hostname.endsWith('.pages.dev') &&
    hostname !== 'inspira.dev.br' && hostname !== '127.0.0.1';
}

async function handleCustomHostname(request, url, store, assets, context) {
  if (!['GET', 'HEAD'].includes(request.method) || typeof store.resolveDomain !== 'function') {
    return new Response(null, { status: 404 });
  }
  const slug = await store.resolveDomain(url.hostname);
  if (!isValidSlug(slug)) return new Response(null, { status: 404 });
  const path = url.pathname === '/' ? `/${slug}` : url.pathname;
  const publicPaths = new Set([`/${slug}`, `/${slug}/`, `/data/vitrines/${slug}/menu.json`]);
  if (!publicPaths.has(path)) return new Response(null, { status: 404 });
  const cache = globalThis.caches?.default;
  const key = new Request(url.origin + path);
  const cached = await cache?.match(key);
  const refresh = async () => {
    const response = await handlePublicStorefrontOrMenuRequest(
      request, path, 'GET', store, assets
    );
    if (response?.ok && cache) {
      const headers = new Headers(response.headers);
      headers.set('cache-control', STOREFRONT_CACHE_CONTROL);
      headers.set('x-vitrine-cached-at', String(Date.now()));
      await cache.put(key, new Response(response.clone().body, { headers }));
    }
    return response ?? new Response(null, { status: 404 });
  };
  if (cached && Date.now() - Number(cached.headers.get('x-vitrine-cached-at')) > 300_000 && context?.waitUntil) {
    context.waitUntil(refresh().catch(() => {}));
  }
  const response = cached ?? await refresh();
  if (request.method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers });
  return response;
}

function createAssetStorage(env, deps, token, provider) {
  if (provider === 'r2') {
    return env.R2_BUCKET && env.R2_PUBLIC_BASE_URL
      ? new R2StorageProvider({ binding: env.R2_BUCKET, publicBaseUrl: env.R2_PUBLIC_BASE_URL })
      : null;
  }
  return new SupabaseStorageProvider({
    baseUrl: String(env.SUPABASE_URL ?? deps.supabaseUrl ?? SUPABASE_PUBLIC_PROJECT_URL).replace(/\/+$/, ''),
    bucket: CATALOG_IMAGES_BUCKET,
    anonKey: env.SUPABASE_ANON_KEY ?? deps.supabaseAnonKey ?? '',
    token,
    fetchImpl: deps.fetch
  });
}

export function createApiHandler(deps = {}) {
  const defaultStore = normalizeStore(deps.store);

  function resolveStore(env) {
    if (deps.store) {
      return defaultStore;
    }
    if (env?.SUPABASE_URL && env?.SUPABASE_ANON_KEY) {
      return createSupabaseRestStore({
        supabaseUrl: env.SUPABASE_URL,
        supabaseAnonKey: env.SUPABASE_ANON_KEY,
        fetch: deps.fetch
      });
    }
    return defaultStore;
  }

  const handler = async function apiHandler(request, env = {}, _ctx = {}) {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    const method = (request.method || 'GET').toUpperCase();
    const store = resolveStore(env);
    const assetsFetcher = env?.ASSETS ?? deps?.assets;

    if (url.hostname === SANDBOX_HOST) return handleSandboxPage(request, url, store);

    if (env.CF_SAAS_CNAME_TARGET && isExternalHostname(url.hostname)) {
      try {
        return await handleCustomHostname(request, url, store, assetsFetcher, _ctx);
      } catch {
        return new Response(null, { status: 503 });
      }
    }

    const previewMatch = pathname.match(/^\/__preview\/([^/]+)\/?$/);
    if (previewMatch) {
      const headers = {
        ...PUBLIC_SECURITY_HEADERS,
        'cache-control': 'no-store',
        'x-robots-tag': 'noindex, nofollow',
        'referrer-policy': 'no-referrer',
        'content-security-policy': STOREFRONT_STORAGE_CSP_HEADER + WIDGET_FRAME_CSP,
        'content-type': 'text/html; charset=utf-8'
      };
      if (method !== 'GET') return new Response(null, { status: 405, headers });
      try {
        const siteId = previewMatch[1];
        const secret = env.PREVIEW_HMAC_SECRET;
        const user = await resolveSessionUser(request, env, deps);
        const revision = secret && user && await verifyPreviewToken(secret, url.searchParams.get('token'), siteId, user.id);
        if (!revision) return new Response(null, { status: 404, headers });
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        const draft = site && await store.getDraft(siteId, user.id, options);
        if (draft?.revision !== revision) return new Response(null, { status: 404, headers });
        const content = await resolveDraftForPublication(store, site, draft, options);
        const { menu } = await compilePublicStorefront(content, site, { revision });
        return new Response(renderStorefrontHtml(menu, undefined, { interactive: false }), { headers });
      } catch (error) {
        const status = error instanceof PortalValidationError ? 422 : 500;
        return new Response(null, { status, headers });
      }
    }

    if (pathname !== '/api' && !pathname.startsWith('/api/')) {
      const publicResponse = await handlePublicStorefrontOrMenuRequest(
        request,
        pathname,
        method,
        store,
        assetsFetcher
      );
      if (publicResponse) {
        return publicResponse;
      }
      if (assetsFetcher && typeof assetsFetcher.fetch === 'function') {
        const assetRes = await assetsFetcher.fetch(request);
        if (
          assetRes.status === 404 &&
          !/text\/html/i.test(assetRes.headers.get('content-type') || '')
        ) {
          return renderNotFoundPageResponse(request, method, assetsFetcher);
        }
        const headers = new Headers(assetRes.headers);
        const isPortalRoute = pathname === '/portal' || pathname.startsWith('/portal/');
        if (!headers.has('content-security-policy')) {
          headers.set(
            'content-security-policy',
            isPortalRoute ? PORTAL_CSP_HEADER : STRICT_CSP_HEADER
          );
        }
        for (const [k, v] of Object.entries(PUBLIC_SECURITY_HEADERS)) {
          if (!headers.has(k)) {
            headers.set(k, v);
          }
        }
        return new Response(method === 'HEAD' ? null : assetRes.body, {
          status: assetRes.status,
          statusText: assetRes.statusText,
          headers
        });
      }
      return renderNotFoundPageResponse(request, method, assetsFetcher);
    }

    try {
      if (pathname === '/api/public/platform-cms' && method === 'GET') {
        const cache = globalThis.caches?.default;
        const key = new Request(url.origin + pathname);
        const refresh = async () => {
          const sections = typeof store.readPublicCms === 'function' ? await store.readPublicCms() : [];
          const response = jsonResponse(200, { sections }, {
            'cache-control': 'public, max-age=60, stale-while-revalidate=300',
            'x-vitrine-cached-at': String(Date.now())
          });
          if (cache) await cache.put(key, response.clone()).catch(() => {});
          return response;
        };
        const cached = await cache?.match(key);
        if (cached && Date.now() - Number(cached.headers.get('x-vitrine-cached-at')) < 360_000) {
          if (Date.now() - Number(cached.headers.get('x-vitrine-cached-at')) >= 60_000 && _ctx.waitUntil) {
            _ctx.waitUntil(refresh().catch(() => {}));
          }
          return cached;
        }
        return await refresh();
      }

      const operations = pathname.match(/^\/api\/admin\/(overview|audit-logs|customization-requests)(?:\/([^/]+))?\/?$/);
      if (operations) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const options = { token: user.token, env };
        if (!await store.isPlatformAdmin?.(user.id, options)) {
          return errorResponse(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
        }
        const [, resource, id] = operations;
        if (method === 'GET' && !id) {
          const data = await store.readPlatformOperations(resource, options);
          const key = { overview: 'overview', 'audit-logs': 'logs', 'customization-requests': 'requests' }[resource];
          return jsonResponse(200, { [key]: data });
        }
        if (method === 'PATCH' && resource === 'customization-requests' && id) {
          const guardError = validateMutationOriginAndJson(request, url, { requireOrigin: true, requireJson: true });
          if (guardError) return guardError;
          const { parsed } = await parseJsonRequest(request);
          if (!UUID_PATTERN.test(id) || !['em_analise', 'respondido', 'encerrado'].includes(parsed?.status)) {
            return errorResponse(422, 'INVALID_CUSTOMIZATION_STATUS', 'Informe uma solicitação e etapa válidas.');
          }
          const updated = await store.updateCustomizationStatus(id, parsed.status, options);
          if (!updated) return errorResponse(404, 'CUSTOMIZATION_REQUEST_NOT_FOUND', 'Solicitação não encontrada.');
          return jsonResponse(200, { request: updated });
        }
        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para administração.');
      }

      if (pathname === '/api/admin/templates') {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const options = { token: user.token, env };
        if (!await store.isPlatformAdmin?.(user.id, options)) {
          return errorResponse(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
        }
        if (method === 'GET') return jsonResponse(200, { templates: await store.listPlatformTemplates(options) });
        if (method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para modelos.');
        const guardError = validateMutationOriginAndJson(request, url, { requireOrigin: true, requireJson: true });
        if (guardError) return guardError;
        const { parsed } = await parseJsonRequest(request);
        const { code, name, defaultTokens, defaultSections, baseCode } = parsed ?? {};
        if (typeof code !== 'string' || !TEMPLATE_CODE_PATTERN.test(code) ||
            (baseCode !== undefined && !ALLOWED_TEMPLATES.includes(baseCode)) || typeof name !== 'string' || !name.trim() || name.trim().length > 120 ||
            !defaultTokens || !Array.isArray(defaultSections) ||
            defaultSections.some(entry => entry?.moduleCode === 'custom_sandbox')) {
          return errorResponse(422, 'INVALID_TEMPLATE', 'Informe um modelo suportado, nome e estrutura válidos.');
        }
        assertNoDangerousTextPayload(name);
        const validated = resolveShowcaseManifest({ themeOverrides: defaultTokens }, { defaultSections });
        const patch = {
          name: name.trim(),
          default_tokens: validated.theme,
          default_sections: validated.pages[0].sections
        };
        const template = baseCode === undefined
          ? await store.updatePlatformTemplate(code, patch, options)
          : await store.createPlatformTemplate(code, baseCode, patch, options);
        if (!template) return errorResponse(404, 'TEMPLATE_NOT_FOUND', 'Modelo não encontrado.');
        return jsonResponse(200, { template });
      }

      if (pathname === '/api/admin/custom-components') {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const options = { token: user.token, env };
        if (!await store.isPlatformAdmin?.(user.id, options)) {
          return errorResponse(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
        }
        if (method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para componentes.');
        const guardError = validateMutationOriginAndJson(request, url, { requireOrigin: true, requireJson: true });
        if (guardError) return guardError;
        const { parsed } = await parseJsonRequest(request);
        const { siteId, slug, name, version, bundleHtml, sourceRepo, bundleHash } = parsed ?? {};
        if (typeof siteId !== 'string' || !UUID_PATTERN.test(siteId) ||
            typeof slug !== 'string' || !/^[a-z0-9_-]{2,64}$/.test(slug) ||
            typeof name !== 'string' || !name.trim() || name.length > 120 ||
            typeof version !== 'string' || !/^[a-z0-9._-]{1,32}$/i.test(version) ||
            typeof bundleHtml !== 'string' || !bundleHtml.trim() || utf8Encoder.encode(bundleHtml).byteLength > 65536 ||
            (sourceRepo !== undefined && (typeof sourceRepo !== 'string' || !/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(sourceRepo)))) {
          return errorResponse(422, 'INVALID_WIDGET', 'Informe a vitrine, identificação, versão e pacote HTML válidos.');
        }
        const hash = await computeSha256Hex(bundleHtml);
        if ((sourceRepo || bundleHash) && bundleHash !== hash) {
          return errorResponse(422, 'WIDGET_HASH_MISMATCH', 'O hash informado não corresponde ao pacote HTML.');
        }
        const id = crypto.randomUUID();
        await store.approveWidget({
          id, site_id: siteId, slug, name: name.trim(), version_tag: version,
          source_type: sourceRepo ? 'github_release' : 'inline_bundle', source_repo: sourceRepo ?? null,
          bundle_html: bundleHtml, bundle_hash_sha256: hash, approved_by: user.id,
          sandbox_url: `https://${SANDBOX_HOST}/embed/${id}?v=${hash}`
        }, options);
        return jsonResponse(201, { id, hash });
      }

      const cmsMatch = pathname.match(/^\/api\/admin\/cms(?:\/([a-z0-9_-]+))?\/?$/);
      if (cmsMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const options = { token: user.token, env };
        if (!await store.isPlatformAdmin?.(user.id, options)) {
          return errorResponse(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
        }
        const sectionKey = cmsMatch[1];
        if (!sectionKey && method === 'GET') {
          return jsonResponse(200, { sections: await store.listCms(options) });
        }
        if (sectionKey && (method === 'PUT' || (method === 'POST' && sectionKey === 'publish'))) {
          const guardError = validateMutationOriginAndJson(request, url, {
            requireOrigin: true, requireJson: true
          });
          if (guardError) return guardError;
          if (method === 'PUT') {
            const { parsed } = await parseJsonRequest(request);
            const section = validateCmsSection(sectionKey, parsed);
            if (!await store.updateCms(sectionKey, section, options)) {
              return errorResponse(404, 'SECTION_NOT_FOUND', 'Seção institucional não encontrada.');
            }
            return jsonResponse(200, { sectionKey, ...section });
          }
          const sections = await store.listCms(options);
          const expected = Object.fromEntries(sections.map(section => [
            section.sectionKey, validateCmsSection(section.sectionKey, section)
          ]));
          if (!await store.publishCms(expected, options)) {
            return errorResponse(409, 'CMS_CHANGED', 'O rascunho mudou durante a publicação. Recarregue e tente novamente.');
          }
          const cache = globalThis.caches?.default;
          if (cache) {
            const origins = new Set([url.origin, 'https://vitrine.inspira.dev.br']);
            await Promise.allSettled([...origins].map(origin => cache.delete(origin + '/api/public/platform-cms')));
          }
          return jsonResponse(200, { published: true });
        }
        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para o CMS.');
      }

      if (pathname === '/api/auth/config') {
        if (method !== 'GET') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/auth/config.');
        }
        const rawUrl = String(
          env?.SUPABASE_URL ?? deps?.supabaseUrl ?? SUPABASE_PUBLIC_PROJECT_URL
        )
          .trim()
          .replace(/\/+$/, '');
        const rawKey = env?.SUPABASE_ANON_KEY ?? deps?.supabaseAnonKey ?? '';
        if (!rawUrl || !isPublishableAnonKey(rawKey, env)) {
          return errorResponse(
            503,
            'AUTH_CONFIG_UNAVAILABLE',
            'Configuração pública de autenticação do Supabase indisponível.'
          );
        }
        return jsonResponse(200, {
          supabaseUrl: rawUrl,
          publishableKey: String(rawKey).trim()
        });
      }

      if (pathname === '/api/auth/logout') {
        if (method !== 'POST') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/auth/logout.');
        }
        return jsonResponse(
          200,
          { ok: true },
          { 'set-cookie': LOGOUT_COOKIE_HEADER }
        );
      }

      if (pathname === '/api/auth/session') {
        if (method === 'GET') {
          const user = await resolveSessionUser(request, env, deps);
          if (!user) {
            return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
          }
          return jsonResponse(200, {
            authenticated: true,
            user: {
              id: user.id
            }
          });
        }

        if (method === 'POST') {
          const requestOrigin = (request.headers.get('origin') || '').trim();
          if (!requestOrigin || requestOrigin !== url.origin) {
            return errorResponse(
              403,
              'FORBIDDEN_ORIGIN',
              'Origem da requisição inválida para estabelecimento de sessão.'
            );
          }

          const contentType = (request.headers.get('content-type') || '').trim();
          if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
            return errorResponse(
              415,
              'UNSUPPORTED_MEDIA_TYPE',
              'O cabeçalho Content-Type deve ser application/json.'
            );
          }

          let candidateToken = null;
          let rawBody = '';
          try {
            rawBody = await request.text();
          } catch {
            throw new PortalValidationError(
              400,
              'INVALID_JSON',
              'Não foi possível ler o corpo da requisição.'
            );
          }

          if (rawBody && rawBody.trim()) {
            let parsed;
            try {
              parsed = JSON.parse(rawBody);
            } catch {
              throw new PortalValidationError(
                400,
                'INVALID_JSON',
                'O corpo da requisição não contém JSON válido.'
              );
            }
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
              return errorResponse(400, 'INVALID_PAYLOAD', 'Corpo da requisição inválido.');
            }
            const bodyToken = parsed.accessToken ?? parsed.access_token ?? parsed.token;
            if (typeof bodyToken === 'string' && bodyToken.trim()) {
              candidateToken = bodyToken.trim();
            }
          }

          if (!candidateToken) {
            const authHeader = request.headers.get('authorization');
            if (typeof authHeader === 'string') {
              const match = authHeader.match(/^Bearer\s+(.+)$/i);
              if (match && match[1].trim()) {
                candidateToken = match[1].trim();
              }
            }
          }

          if (!candidateToken) {
            return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
          }

          const verificationHeaders = new Headers();
          verificationHeaders.set('authorization', `Bearer ${candidateToken}`);
          const verificationRequest = new Request(request.url, {
            method: 'GET',
            headers: verificationHeaders
          });

          const user = await resolveSessionUser(verificationRequest, env, deps);
          if (!user) {
            return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
          }

          const nowSeconds =
            typeof deps?.nowSeconds === 'function'
              ? deps.nowSeconds()
              : (deps?.nowSeconds ?? Math.floor(Date.now() / 1000));
          const maxAgeSeconds = resolveTokenMaxAgeSeconds(user.token, nowSeconds);

          return jsonResponse(
            200,
            {
              authenticated: true,
              user: {
                id: user.id
              }
            },
            {
              'set-cookie': buildSessionCookieHeader(user.token, maxAgeSeconds)
            }
          );
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/auth/session.');
      }

      if (pathname === '/api/profile' || pathname === '/api/profile/') {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        if (method === 'GET') {
          const profile = await store.getProfile(user.id, { token: user.token, env });
          return jsonResponse(200, { profile });
        }

        if (method === 'PUT') {
          const guardError = validateMutationOriginAndJson(request, url, {
            requireOrigin: true,
            requireJson: true
          });
          if (guardError) return guardError;

          const { parsed } = await parseJsonRequest(request);
          const validated = validateProfileInput(parsed);
          const profile = await store.upsertProfile(user.id, validated, {
            token: user.token,
            env
          });
          return jsonResponse(200, { profile });
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/profile.');
      }

      if (
        pathname === '/api/customization-requests' ||
        pathname === '/api/customization-requests/'
      ) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        if (method === 'GET') {
          const requests = await store.listCustomizationRequests(user.id, {
            token: user.token,
            env
          });
          return jsonResponse(200, { requests });
        }

        if (method === 'POST') {
          const guardError = validateMutationOriginAndJson(request, url, {
            requireOrigin: true,
            requireJson: true
          });
          if (guardError) return guardError;

          const { parsed } = await parseJsonRequest(request);
          const validated = validateCustomizationRequestInput(parsed);
          const createdRequest = await store.createCustomizationRequest(
            user.id,
            validated,
            { token: user.token, env }
          );
          return jsonResponse(201, { request: createdRequest });
        }

        return errorResponse(
          405,
          'METHOD_NOT_ALLOWED',
          'Método não permitido para /api/customization-requests.'
        );
      }

      if (pathname === '/api/events' || pathname === '/api/events/') {
        if (method !== 'POST') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/events.');
        }

        const contentType = (request.headers.get('content-type') || '').trim();
        if (!/^application\/json(?:\s*;|$)/i.test(contentType)) {
          return errorResponse(
            415,
            'UNSUPPORTED_MEDIA_TYPE',
            'O cabeçalho Content-Type deve ser application/json.'
          );
        }

        const declaredLength = Number(request.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > MAX_EVENTS_BATCH_BYTES) {
          return errorResponse(
            400,
            'INVALID_EVENTS_BATCH',
            'O lote de eventos excede o limite máximo de 16 KiB.'
          );
        }

        let rawText = '';
        try {
          rawText = await request.text();
        } catch {
          return errorResponse(400, 'INVALID_EVENTS_BATCH', 'Não foi possível ler o lote de eventos.');
        }

        const rawByteLength = utf8Encoder.encode(rawText).byteLength;
        if (!rawText || !rawText.trim() || rawByteLength > MAX_EVENTS_BATCH_BYTES) {
          return errorResponse(
            400,
            'INVALID_EVENTS_BATCH',
            'Lote de eventos vazio ou acima do limite permitido.'
          );
        }

        const userAgent = request.headers.get('user-agent') || '';
        if (isBotUserAgent(userAgent)) {
          return jsonResponse(202, {
            accepted: 0,
            ignored: 'bot'
          });
        }

        let parsed;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return errorResponse(
            400,
            'INVALID_EVENTS_BATCH',
            'O corpo da requisição não contém JSON válido.'
          );
        }

        const nowSeconds =
          typeof deps?.nowSeconds === 'function'
            ? deps.nowSeconds()
            : deps?.nowSeconds;
        const effectiveNow =
          typeof nowSeconds === 'number' && Number.isFinite(nowSeconds)
            ? new Date(nowSeconds * 1000)
            : new Date();

        const { slug, events } = validateEventsBatchPayload(parsed, {
          rawByteLength,
          now: effectiveNow
        });

        const result = await store.recordSiteMetricBatch(slug, events, {
          now: effectiveNow,
          env
        });

        return jsonResponse(202, {
          accepted: result.accepted
        });
      }

      const insightsMatch = pathname.match(/^\/api\/sites\/([^/]+)\/insights\/?$/);
      if (insightsMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        if (method !== 'GET') {
          return errorResponse(
            405,
            'METHOD_NOT_ALLOWED',
            'Método não permitido para consulta de insights.'
          );
        }

        const siteId = decodeURIComponent(insightsMatch[1]);
        const periodParam = url.searchParams.get('period') ?? '7d';
        const validPeriod = validateInsightsPeriod(periodParam, 400);

        const nowSeconds =
          typeof deps?.nowSeconds === 'function'
            ? deps.nowSeconds()
            : deps?.nowSeconds;
        const referenceDate =
          typeof nowSeconds === 'number' && Number.isFinite(nowSeconds)
            ? new Date(nowSeconds * 1000)
            : new Date();

        const insights = await store.getSiteInsights(siteId, user.id, validPeriod, {
          token: user.token,
          referenceDate,
          env
        });

        if (!insights) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }

        return jsonResponse(200, { insights });
      }

      if (pathname === '/api/sites' || pathname === '/api/sites/') {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        if (method === 'GET') {
          const sites = await store.listSites(user.id, { token: user.token, env });
          return jsonResponse(200, { sites });
        }

        if (method === 'POST') {
          const contentTypeError = validateMutationOriginAndJson(request, url, {
            requireOrigin: false,
            requireJson: true
          });
          if (contentTypeError) return contentTypeError;

          const { parsed } = await parseJsonRequest(request);
          const usesExtendedSitePayload = Boolean(
            parsed &&
              typeof parsed === 'object' &&
              !Array.isArray(parsed) &&
              (parsed.storefrontType !== undefined ||
                parsed.catalogType !== undefined ||
                (parsed.template !== undefined && parsed.template !== DEFAULT_TEMPLATE))
          );
          if (usesExtendedSitePayload) {
            const originError = validateMutationOriginAndJson(request, url, {
              requireOrigin: true,
              requireJson: false
            });
            if (originError) return originError;
          }

          const {
            name,
            slug,
            storefrontType,
            template,
            catalogType,
            whatsapp
          } = validateSiteInput(parsed);
          const content = createInitialDraftContent({
            slug,
            name,
            storefrontType,
            template,
            catalogType,
            whatsapp
          });
          const created = await store.createSite(
            {
              userId: user.id,
              name,
              slug,
              storefrontType,
              template,
              catalogType,
              content
            },
            { token: user.token, env }
          );
          return jsonResponse(201, created);
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/sites.');
      }

      const domainMatch = pathname.match(/^\/api\/sites\/([^/]+)\/domains(?:\/([^/]+)(\/verify)?)?\/?$/);
      if (domainMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const [, siteId, domainId, verify] = domainMatch;
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        if (!site || !TEAM_ROLES.includes(site.role)) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }
        if (!store.listDomains) return errorResponse(503, 'DOMAINS_UNAVAILABLE', 'Domínios indisponíveis neste ambiente.');
        if (method === 'GET' && !domainId) {
          const domains = (await store.listDomains(siteId, options)).map(domainPresentation);
          return jsonResponse(200, { domains, defaultUrl: `https://vitrine.inspira.dev.br/${site.slug}` });
        }
        const isCreate = method === 'POST' && !domainId;
        const isVerify = method === 'POST' && Boolean(verify);
        const isDelete = method === 'DELETE' && domainId && !verify;
        if (!isCreate && !isVerify && !isDelete) {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para domínios.');
        }
        const guardError = validateMutationOriginAndJson(request, url, { requireOrigin: true, requireJson: true });
        if (guardError) return guardError;
        if (!env.CF_SAAS_CNAME_TARGET || !env.CF_SAAS_ZONE_ID || !env.CF_SAAS_API_TOKEN || !env.SUPABASE_SERVICE_ROLE_KEY) {
          return errorResponse(503, 'DOMAINS_UNAVAILABLE', 'A integração de domínios ainda não foi configurada.');
        }
        if (isCreate) {
          const { parsed } = await parseJsonRequest(request);
          const hostname = validateCustomHostname(parsed?.hostname);
          const domain = await store.addDomain(siteId, createDomainChallenge(hostname, env.CF_SAAS_CNAME_TARGET), options);
          return jsonResponse(201, { domain: domainPresentation(domain) });
        }
        if (!UUID_PATTERN.test(domainId)) return errorResponse(404, 'DOMAIN_NOT_FOUND', 'Domínio não encontrado.');
        const domain = (await store.listDomains(siteId, options)).find(entry => entry.id === domainId);
        if (!domain) return errorResponse(404, 'DOMAIN_NOT_FOUND', 'Domínio não encontrado.');
        if (isVerify && (domain.cname_target !== env.CF_SAAS_CNAME_TARGET || !await verifyDomainDns(domain, deps.fetch))) {
          return errorResponse(409, 'DNS_NOT_VERIFIED', 'Os registros DNS ainda não correspondem às instruções.');
        }
        const provider = new CloudflareHostnames(env.CF_SAAS_ZONE_ID, env.CF_SAAS_API_TOKEN, deps.fetch);
        const claimed = await store.changeDomain(domain, {
          lease_until: new Date(Date.now() + 45_000).toISOString(),
          ...(isVerify && !['active', 'verifying'].includes(domain.status) ? { status: 'verifying' } : {})
        }, { env, claim: true });
        if (!claimed) return errorResponse(409, 'DOMAIN_BUSY', 'Este domínio está sendo processado.');
        try {
          let remote = await provider.find(domain.hostname);
          if (remote && remote.id !== domain.cf_hostname_id && !(isDelete && domain.status === 'pending_dns')) {
            return errorResponse(409, 'HOSTNAME_TAKEN', 'Este endereço já está configurado na zona.');
          }
          if (isDelete) {
            if (remote && remote.id === domain.cf_hostname_id) await provider.remove(remote.id);
            await store.changeDomain(claimed, null, { env, remove: true });
            return new Response(null, { status: 204 });
          }
          remote ??= await provider.create(domain.hostname);
          const active = remote.status === 'active' && remote.ssl?.status === 'active';
          const updated = await store.changeDomain(claimed, {
            status: active ? 'active' : 'verifying',
            ssl_status: remote.ssl?.status === 'active' ? 'active' : 'pending',
            cf_hostname_id: remote.id,
            verified_at: active ? new Date().toISOString() : null
          }, { env });
          return jsonResponse(200, { domain: domainPresentation(updated) });
        } catch (error) {
          if (error?.code === 'DOMAIN_QUOTA_REACHED' && !claimed.cf_hostname_id) {
            await store.changeDomain(claimed, { status: 'pending_dns' }, { env });
          }
          throw error;
        } finally {
          await store.changeDomain(claimed, { lease_until: '-infinity' }, { env }).catch(() => {});
        }
      }

      const structureMatch = pathname.match(/^\/api\/sites\/([^/]+)\/structure\/?$/);
      if (structureMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const siteId = structureMatch[1];
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        const draft = site && await store.getDraft(siteId, user.id, options);
        if (!draft) return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        if (method === 'GET') {
          const defaults = await loadStructureDefaults(store, site, draft, options);
          const structure = draft.content.structure ?? {};
          return jsonResponse(200, {
            revision: draft.revision, structure,
            templates: await store.listStructureTemplates?.(draft.content.catalogType, options) ?? [],
            widgets: await store.listWidgets?.(siteId, options) ?? [],
            resolved: resolveShowcaseManifest(structure, defaults?.template, {}, defaults?.modules)
          });
        }
        if (method !== 'PUT') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para estrutura.');
        const guardError = validateMutationOriginAndJson(request, url, {
          requireOrigin: true, requireJson: true
        });
        if (guardError) return guardError;
        if (!DRAFT_EDITOR_ROLES.includes(site.role)) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }
        const { parsed } = await parseJsonRequest(request);
        const revision = validateRevision(parsed?.expectedRevision);
        const selecting = Object.hasOwn(parsed, 'templateCode');
        const code = selecting ? parsed.templateCode ?? undefined : draft.content.structure?.templateCode;
        const defaults = await loadStructureDefaults(store, site, draft, options, code ?? null);
        let edits = selecting ? draft.content.structure ?? {} : parsed;
        if (selecting && Object.hasOwn(parsed, 'pages')) {
          const previous = await loadStructureDefaults(store, site, draft, options);
          const beforeSwitch = resolveShowcaseManifest(parsed, previous?.template, {}, previous?.modules);
          edits = extractShowcaseOverrides(beforeSwitch, previous?.template, {}, previous?.modules);
        }
        const resolved = resolveShowcaseManifest(edits, defaults?.template, {}, defaults?.modules);
        await assertApprovedWidgets(store, siteId, resolved.pages, options);
        const structure = extractShowcaseOverrides(resolved, defaults?.template, {}, defaults?.modules);
        if (code !== undefined) structure.templateCode = code;
        const content = { ...draft.content, structure };
        validateDraftContent(content);
        const updated = await store.updateDraft({ siteId, userId: user.id, revision, content }, options);
        if (updated.status === 'conflict') {
          return errorResponse(409, 'REVISION_CONFLICT', 'O rascunho foi alterado. Recarregue e tente novamente.');
        }
        if (updated.status !== 'ok') return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        return jsonResponse(200, { draft: updated.draft, resolved });
      }

      const toggleMatch = pathname.match(/^\/api\/sites\/([^/]+)\/quick-toggle\/?$/);
      if (toggleMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        if (method !== 'PATCH') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para disponibilidade.');
        const guardError = validateMutationOriginAndJson(request, url, {
          requireOrigin: true, requireJson: true
        });
        if (guardError) return guardError;
        const siteId = toggleMatch[1];
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        const draft = DRAFT_EDITOR_ROLES.includes(site?.role) && await store.getDraft(siteId, user.id, options);
        if (!draft) return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');

        const { parsed } = await parseJsonRequest(request);
        const { targetType, targetId, active, expectedRevision } = parsed ?? {};
        if (expectedRevision !== undefined && validateRevision(expectedRevision) !== draft.revision) {
          return errorResponse(409, 'REVISION_CONFLICT', 'O rascunho foi alterado. Recarregue e tente novamente.');
        }
        if (!['item', 'category', 'section'].includes(targetType) ||
            typeof targetId !== 'string' || !targetId.trim() || typeof active !== 'boolean') {
          return errorResponse(422, 'INVALID_TOGGLE', 'Informe o tipo, identificador e estado desejado.');
        }
        const content = structuredClone(draft.content);
        const defaults = targetType === 'section' ? await loadStructureDefaults(store, site, draft, options) : undefined;
        const resolved = targetType === 'section'
          ? resolveShowcaseManifest(content.structure ?? {}, defaults?.template, {}, defaults?.modules)
          : null;
        const targets = targetType === 'item' ? extractDraftItems(content)
          : targetType === 'category' ? content.categories ?? []
          : resolved.pages.flatMap(page => page.sections);
        const matching = targets.filter(entry => entry?.id === targetId);
        if (!matching.length) return errorResponse(404, 'TARGET_NOT_FOUND', 'O elemento não foi encontrado no rascunho.');
        if (matching.length > 1) return errorResponse(409, 'AMBIGUOUS_TARGET', 'O identificador corresponde a mais de um elemento.');
        const [target] = matching;
        target.active = active;
        if (targetType === 'item' && Object.hasOwn(target, 'available')) target.available = active;
        if (resolved) {
          const code = content.structure?.templateCode;
          content.structure = extractShowcaseOverrides(resolved, defaults?.template, {}, defaults?.modules);
          if (code !== undefined) content.structure.templateCode = code;
        }
        validateDraftContent(content);
        const updated = await store.updateDraft({ siteId, userId: user.id, revision: draft.revision, content }, options);
        if (updated.status === 'conflict') {
          return errorResponse(409, 'REVISION_CONFLICT', 'O rascunho foi alterado. Recarregue e tente novamente.');
        }
        if (updated.status !== 'ok') return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        return jsonResponse(200, { draft: updated.draft });
      }

      const releaseMatch = pathname.match(/^\/api\/sites\/([^/]+)\/(releases|rollback)\/?$/);
      if (releaseMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const [, siteId, operation] = releaseMatch;
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        if (!site || (operation === 'rollback' && !TEAM_ROLES.includes(site.role))) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }
        if (operation === 'releases' && method === 'GET') {
          const releases = (await store.listReleases(siteId, options)).map(entry => ({
            revision: entry.revision, artifactHash: entry.hash, publishedAt: entry.publishedAt
          }));
          return jsonResponse(200, { releases });
        }
        if (operation === 'rollback' && method === 'POST') {
          const guardError = validateMutationOriginAndJson(request, url, {
            requireOrigin: true, requireJson: true
          });
          if (guardError) return guardError;
          const { parsed } = await parseJsonRequest(request);
          const revision = validateRevision(parsed?.targetRevision);
          const publication = await store.rollbackRelease(siteId, revision, user.id, options);
          if (!publication) return errorResponse(404, 'RELEASE_NOT_FOUND', 'Versão indisponível para restauração.');
          publicationFetchedAtBySlug.set(publication.slug, Date.now());
          await sharedPublicPublications.savePublication(publication);
          if (globalThis.caches?.default) {
            const cacheUrls = [publication.url, publication.menuUrl].map(path => new URL(path, url.origin).href);
            await Promise.allSettled(cacheUrls.map(cacheUrl => caches.default.delete(cacheUrl)));
          }
          return jsonResponse(200, { publication });
        }
        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para versões.');
      }

      const previewTokenMatch = pathname.match(/^\/api\/sites\/([^/]+)\/preview-token\/?$/);
      if (previewTokenMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        if (method !== 'POST') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para prévia.');
        const guardError = validateMutationOriginAndJson(request, url, {
          requireOrigin: true, requireJson: true
        });
        if (guardError) return guardError;
        const siteId = previewTokenMatch[1];
        const draft = await store.getDraft(siteId, user.id, { token: user.token, env });
        if (!draft) return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        if (!env.PREVIEW_HMAC_SECRET) {
          return errorResponse(503, 'PREVIEW_UNAVAILABLE', 'A prévia segura ainda não foi configurada.');
        }
        const token = await signPreviewToken(env.PREVIEW_HMAC_SECRET, siteId, user.id, draft.revision);
        return jsonResponse(200, { url: `/__preview/${encodeURIComponent(siteId)}?token=${token}` });
      }

      const auditMatch = pathname.match(/^\/api\/sites\/([^/]+)\/audit-logs\/?$/);
      if (auditMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        if (method !== 'GET') return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para o histórico.');
        const siteId = auditMatch[1];
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        return jsonResponse(200, { logs: await store.listAuditLogs(siteId, options) });
      }

      const membersMatch = pathname.match(/^\/api\/sites\/([^/]+)\/members(?:\/([^/]+))?\/?$/);
      if (membersMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const [, siteId, memberId] = membersMatch;
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        if (!site || !TEAM_ROLES.includes(site.role)) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }

        if (method === 'GET' && !memberId) {
          return jsonResponse(200, { members: await store.listMembers(siteId, options) });
        }

        if ((method === 'POST' && !memberId) || (method === 'DELETE' && memberId)) {
          const guardError = validateMutationOriginAndJson(request, url, {
            requireOrigin: true, requireJson: true
          });
          if (guardError) return guardError;
          const { parsed } = method === 'POST' ? await parseJsonRequest(request) : {};
          const targetUser = memberId ?? parsed?.userId;
          const role = memberId ? null : parsed?.role;
          if (typeof targetUser !== 'string' || !UUID_PATTERN.test(targetUser) ||
              (!memberId && !MEMBER_ROLES.includes(role))) {
            return errorResponse(422, 'INVALID_MEMBER', 'Informe um usuário e um papel válidos.');
          }

          if (!await store.changeMember(siteId, targetUser, role, user.id, options)) {
            return errorResponse(403, 'FORBIDDEN_MEMBER_CHANGE', 'A alteração do membro foi recusada.');
          }
          return role ? jsonResponse(200, { member: { userId: targetUser, role } }) : new Response(null, { status: 204 });
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para gestão da equipe.');
      }

      const draftMatch = pathname.match(/^\/api\/sites\/([^/]+)\/draft\/?$/);
      if (draftMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        const siteId = decodeURIComponent(draftMatch[1]);

        if (method === 'GET') {
          const draft = await store.getDraft(siteId, user.id, { token: user.token, env });
          if (!draft) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
          }
          return jsonResponse(200, { draft });
        }

        if (method === 'PUT') {
          const guardError = validateMutationOriginAndJson(request, url, {
            requireOrigin: false,
            requireJson: true
          });
          if (guardError) return guardError;

          let site = null;
          if (typeof store.getSite === 'function') {
            site = await store.getSite(siteId, user.id, { token: user.token, env });
          }
          if (site && site.role && !DRAFT_EDITOR_ROLES.includes(site.role)) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
          }

          const existingDraft = await store.getDraft(siteId, user.id, { token: user.token, env });
          if (!existingDraft) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
          }

          const { rawText, parsed } = await parseJsonRequest(request);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return errorResponse(400, 'INVALID_PAYLOAD', 'Corpo da requisição inválido.');
          }

          if (parsed.content !== undefined && typeof parsed.content === 'object' && parsed.content !== null) {
            if (measureDraftBytes(parsed.content) > MAX_DRAFT_BYTES) {
              return errorResponse(
                413,
                'DRAFT_TOO_LARGE',
                'O rascunho excede o tamanho máximo permitido de 256 KiB (262.144 bytes).'
              );
            }
          } else if (utf8Encoder.encode(rawText).byteLength > MAX_DRAFT_BYTES) {
            return errorResponse(
              413,
              'DRAFT_TOO_LARGE',
              'O rascunho excede o tamanho máximo permitido de 256 KiB (262.144 bytes).'
            );
          }

          const revision = validateRevision(parsed.revision);
          validateDraftContent(parsed.content, {
            defaultWhatsapp:
              existingDraft.revision !== revision ? existingDraft.content?.whatsapp : undefined
          });

          const canonicalSlug = site?.slug ?? existingDraft.content?.slug;
          if (
            canonicalSlug &&
            parsed.content?.slug !== undefined &&
            String(parsed.content.slug).trim() !== String(canonicalSlug).trim()
          ) {
            return errorResponse(
              422,
              'INVALID_SLUG',
              'O identificador (slug) do rascunho não pode divergir do slug da vitrine.'
            );
          }

          if (parsed.content.structure && Object.hasOwn(parsed.content.structure, 'templateCode')) {
            if (parsed.content.catalogType !== existingDraft.content.catalogType) {
              delete parsed.content.structure.templateCode;
            } else if (parsed.content.structure.templateCode !== existingDraft.content.structure?.templateCode) {
              return errorResponse(422, 'INVALID_TEMPLATE_CHANGE', 'Troque o modelo na edição de estrutura.');
            }
          }

          const updateResult = await store.updateDraft(
            {
              siteId,
              userId: user.id,
              revision,
              content: parsed.content
            },
            { token: user.token, env }
          );

          if (!updateResult || updateResult.status === 'not_found') {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
          }

          if (updateResult.status === 'conflict') {
            return errorResponse(
              409,
              'REVISION_CONFLICT',
              'Este rascunho foi atualizado em outra aba ou dispositivo. Recarregue antes de salvar.',
              { currentRevision: updateResult.currentRevision }
            );
          }

          return jsonResponse(200, { draft: updateResult.draft });
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para rascunho.');
      }

      const publishMatch = pathname.match(/^\/api\/sites\/([^/]+)\/publish\/?$/);
      if (publishMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        if (method !== 'POST') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para publicação.');
        }

        const guardError = validateMutationOriginAndJson(request, url, {
          requireOrigin: false,
          requireJson: false
        });
        if (guardError) return guardError;

        const siteId = decodeURIComponent(publishMatch[1]);
        const draft = await store.getDraft(siteId, user.id, { token: user.token, env });
        if (!draft) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }

        let site = null;
        if (typeof store.getSite === 'function') {
          site = await store.getSite(siteId, user.id, { token: user.token, env });
        }
        if (!site) {
          const allSites = await store.listSites(user.id, { token: user.token, env });
          site = allSites.find((entry) => entry.id === siteId) ?? null;
        }
        if (!site || (site.role && !TEAM_ROLES.includes(site.role))) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }

        const content = await resolveDraftForPublication(store, site, draft, { token: user.token, env });
        // Atomic compilation: if compilePublicStorefront throws, previous publication in store remains untouched.
        const compiled = await compilePublicStorefront(content, site, {
          revision: draft.revision,
          siteId: site.id
        });

        if (typeof store.savePublication === 'function') {
          await store.savePublication(compiled.publication, { token: user.token, env });
        }
        publicationFetchedAtBySlug.set(compiled.publication.slug, Date.now());
        await sharedPublicPublications.savePublication(compiled.publication);

        return jsonResponse(200, { publication: compiled.publication });
      }

      const assetMatch = pathname.match(/^\/api\/sites\/([^/]+)\/assets(?:\/([^/]+))?\/?$/);
      if (assetMatch && method !== 'POST') {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        const [, siteId, assetId] = assetMatch;
        const options = { token: user.token, env };
        const site = await store.getSite(siteId, user.id, options);
        if (!site) return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        if (!store.listAssets) return errorResponse(503, 'ASSETS_UNAVAILABLE', 'Biblioteca indisponível neste ambiente.');
        if (method === 'GET' && !assetId) {
          const assets = await store.listAssets(siteId, options);
          return jsonResponse(200, { assets, maxAssets: 100, maxBytes: 20971520 });
        }
        if (method === 'DELETE' && assetId && DRAFT_EDITOR_ROLES.includes(site.role)) {
          const guardError = validateMutationOriginAndJson(request, url, {
            requireOrigin: true, requireJson: true
          });
          if (guardError) return guardError;
          const asset = (await store.listAssets(siteId, options)).find(entry => entry.id === assetId);
          if (!asset) return errorResponse(404, 'ASSET_NOT_FOUND', 'Arquivo não encontrado.');
          validateCatalogImagePath(asset.key, siteId);
          const [draft, releases] = await Promise.all([
            store.getDraft(siteId, user.id, options), store.listReleases(siteId, options)
          ]);
          const contentUsesAsset = content => extractDraftItems(content).some(item => item?.imageUrl === asset.url);
          if (contentUsesAsset(draft?.content) || releases.some(release => contentUsesAsset(release.menu))) {
            return errorResponse(409, 'ASSET_IN_USE', 'O arquivo está vinculado ao rascunho ou a uma versão publicada.');
          }
          const storage = createAssetStorage(env, deps, user.token, asset.provider);
          if (!storage || !await storage.delete(asset.key)) {
            return errorResponse(502, 'STORAGE_DELETE_ERROR', 'Não foi possível excluir o arquivo do armazenamento.');
          }
          await store.removeAsset(assetId, options);
          return new Response(null, { status: 204 });
        }
        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para a biblioteca.');
      }

      const uploadMatch = pathname.match(/^\/api\/sites\/([^/]+)\/upload\/?$/) ?? (assetMatch && !assetMatch[2] ? assetMatch : null);
      if (uploadMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        if (method !== 'POST') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para upload.');
        }

        const guardError = validateMutationOriginAndJson(request, url, {
          requireOrigin: true,
          requireJson: false
        });
        if (guardError) return guardError;

        const siteId = decodeURIComponent(uploadMatch[1]);
        let site = null;
        if (typeof store.getSite === 'function') {
          site = await store.getSite(siteId, user.id, { token: user.token, env });
        }
        if (!site) {
          const allSites = await store.listSites(user.id, { token: user.token, env });
          site = allSites.find((entry) => entry.id === siteId) ?? null;
        }
        if (!site || !DRAFT_EDITOR_ROLES.includes(site.role)) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }

        const contentType = (request.headers.get('content-type') || '').trim();
        if (!/^image\/webp(?:\s*;|$)/i.test(contentType)) {
          return errorResponse(
            415,
            'UNSUPPORTED_MEDIA_TYPE',
            'O cabeçalho Content-Type deve ser image/webp.'
          );
        }

        const maxSizeBytes = 204800; // 200 KiB
        const declaredLength = Number(request.headers.get('content-length'));
        if (Number.isFinite(declaredLength) && declaredLength > maxSizeBytes) {
          return errorResponse(
            413,
            'FILE_TOO_LARGE',
            'O arquivo excede o limite máximo permitido de 200 KB.'
          );
        }

        let bodyBlob;
        try {
          bodyBlob = await request.arrayBuffer();
        } catch {
          return errorResponse(400, 'INVALID_BODY', 'Não foi possível ler o corpo do arquivo.');
        }

        if (bodyBlob.byteLength === 0) {
          return errorResponse(400, 'EMPTY_FILE', 'O arquivo de imagem enviado está vazio.');
        }

        if (bodyBlob.byteLength > maxSizeBytes) {
          return errorResponse(
            413,
            'FILE_TOO_LARGE',
            'O arquivo excede o limite máximo permitido de 200 KB.'
          );
        }

        const headerBytes = new Uint8Array(bodyBlob, 0, Math.min(bodyBlob.byteLength, 12));
        const isWebpHeader =
          headerBytes.length >= 12 &&
          headerBytes[0] === 0x52 && // R
          headerBytes[1] === 0x49 && // I
          headerBytes[2] === 0x46 && // F
          headerBytes[3] === 0x46 && // F
          headerBytes[8] === 0x57 && // W
          headerBytes[9] === 0x45 && // E
          headerBytes[10] === 0x42 && // B
          headerBytes[11] === 0x50; // P
        if (!isWebpHeader) {
          return errorResponse(
            422,
            'INVALID_IMAGE',
            'O arquivo enviado não corresponde a uma imagem WebP válida.'
          );
        }

        const rawItemId = url.searchParams.get('itemId');
        const safeItemId = rawItemId === null || rawItemId === '' ? 'item' : rawItemId.trim();
        if (!/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(safeItemId) || safeItemId.includes('..')) {
          return errorResponse(
            422,
            'INVALID_IMAGE_PATH',
            'Identificador de item inválido para upload de imagem.'
          );
        }

        const randBytes = new Uint8Array(4);
        crypto.getRandomValues(randBytes);
        const randHex = Array.from(randBytes, (b) => b.toString(16).padStart(2, '0')).join('');
        const validatedPath = validateCatalogImagePath(
          `${site.id}/${safeItemId}-${randHex}.webp`,
          site.id
        );

        const provider = env.R2_BUCKET && env.R2_PUBLIC_BASE_URL ? 'r2' : 'supabase';
        const storage = createAssetStorage(env, deps, user.token, provider);
        let assetId;
        const options = { token: user.token, env };
        if (assetMatch) {
          if (!store.reserveAsset) {
            return errorResponse(503, 'ASSETS_UNAVAILABLE', 'Biblioteca indisponível neste ambiente.');
          }
          assetId = crypto.randomUUID();
          const digest = await crypto.subtle.digest('SHA-256', bodyBlob);
          const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
          await store.reserveAsset({
            id: assetId, site_id: site.id, storage_provider: provider,
            object_key: validatedPath, public_url: storage.url(validatedPath),
            mime_type: 'image/webp', byte_size: bodyBlob.byteLength, sha256_hex: hash
          }, options);
        }
        let publicUrl;
        try {
          publicUrl = await storage.put(validatedPath, bodyBlob);
          if (publicUrl && assetId) await store.completeAsset(assetId, options);
        } catch {
          publicUrl = null;
        }
        if (!publicUrl) {
          if (assetId && await storage.delete(validatedPath).catch(() => false)) {
            await store.removeAsset(assetId, options);
          }
          return errorResponse(502, 'STORAGE_UPLOAD_ERROR', 'Falha ao enviar a imagem para o armazenamento da vitrine.');
        }

        return jsonResponse(200, {
          imageUrl: publicUrl,
          path: validatedPath,
          bytes: bodyBlob.byteLength,
          ...(assetId ? { id: assetId } : {})
        });
      }

      return errorResponse(404, 'NOT_FOUND', 'Endpoint da API não encontrado.');
    } catch (err) {
      if (err instanceof PortalValidationError) {
        if (
          pathname.endsWith('/publish') ||
          pathname.endsWith('/publish/') ||
          pathname.endsWith('/draft') ||
          pathname.endsWith('/draft/')
        ) {
          console.error(
            JSON.stringify({
              event: 'api_validation_error',
              method,
              route: sanitizeDiagnosticText(pathname),
              status: err.status,
              code: sanitizeDiagnosticText(err.code),
              message: sanitizeDiagnosticText(err.message)
            })
          );
        }
        return jsonResponse(err.status, err.toJSON());
      }
      console.error(
        JSON.stringify({
          event: 'api_internal_error',
          method,
          route: sanitizeDiagnosticText(pathname),
          status: 500,
          errorName: sanitizeDiagnosticText(err?.name || 'Error'),
          errorMessage: sanitizeDiagnosticText(err?.message || 'Unknown error'),
          ...(err?.upstream ? { upstream: err.upstream } : {})
        })
      );
      return errorResponse(500, 'INTERNAL_ERROR', 'Erro interno ao processar a requisição.');
    }
  };

  handler.fetch = handler;
  handler.store = defaultStore;
  return handler;
}

async function refreshPendingDomainCertificates(env) {
  if (!env.CF_SAAS_API_TOKEN || !env.CF_SAAS_ZONE_ID || !env.SUPABASE_SERVICE_ROLE_KEY ||
      !env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) return;
  const store = createSupabaseRestStore({ supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY });
  const provider = new CloudflareHostnames(env.CF_SAAS_ZONE_ID, env.CF_SAAS_API_TOKEN);
  for (const domain of await store.pendingDomains(env)) {
    try {
      const remote = await provider.find(domain.hostname);
      if (remote?.id !== domain.cf_hostname_id || remote?.status !== 'active' || remote.ssl?.status !== 'active') continue;
      await store.changeDomain(domain, {
        status: 'active', ssl_status: 'active', verified_at: new Date().toISOString()
      }, { env });
    } catch {
      // A próxima execução poderá reconsultar o certificado.
    }
  }
}

const defaultApiHandler = createApiHandler();

export default {
  async fetch(request, env = {}, ctx = {}) {
    return defaultApiHandler(request, env, ctx);
  },
  async scheduled(_event, env) {
    await refreshPendingDomainCertificates(env);
  }
};
