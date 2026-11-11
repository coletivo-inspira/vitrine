import {
  DEFAULT_TEMPLATE,
  MAX_DRAFT_BYTES,
  PortalValidationError,
  RESERVED_SLUGS,
  createInitialDraftContent,
  isValidSlug,
  measureDraftBytes,
  validateDraftContent,
  validateRevision,
  validateSiteInput
} from '../src/portal-validation.mjs';
import {
  compilePublicStorefront,
  renderStorefrontHtml
} from '../src/publication-engine.mjs';

const SESSION_COOKIE_NAME = '__Host-vitrine_session';
const LOGOUT_COOKIE_HEADER = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
export const SUPABASE_PUBLIC_PROJECT_URL = 'https://qawlpsrfewosxsfgmmpm.supabase.co';
export const STRICT_CSP_HEADER =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
export const PORTAL_CSP_HEADER =
  `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' ${SUPABASE_PUBLIC_PROJECT_URL}; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`;
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
      { slug: 'loja1', name: 'Forno & Praça Pizzaria Artesanal', template: 'pizzeria-v1' },
      { revision: 1, publishedAt: '2026-11-11T00:00:00.000Z' }
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
  const publicationsBySlug = new Map();
  const publicationsByHash = new Map();

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
      template: site.template ?? DEFAULT_TEMPLATE,
      role,
      updatedAt: site.updatedAt ?? site.updated_at ?? site.createdAt ?? site.created_at
    };
  }

  return {
    sites,
    drafts,
    memberships,
    publicationsBySlug,
    publicationsByHash,

    addMembership(siteId, userId, role = 'collaborator') {
      const exists = memberships.some(m => m.siteId === siteId && m.userId === userId);
      if (!exists) {
        memberships.push({ siteId, userId, role });
      }
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

    async createSite({ userId, name, slug, template = DEFAULT_TEMPLATE, content }) {
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
              template
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
      return structuredClone(draft);
    },

    async updateDraft({ siteId, userId, revision, content }) {
      const site = sites.get(siteId);
      const role = getRoleForSite(site, userId);
      if (role !== 'owner') {
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
        content: structuredClone(content)
      };
      drafts.set(siteId, nextDraft);
      site.updatedAt = now;
      return {
        status: 'ok',
        draft: structuredClone(nextDraft)
      };
    }
  };
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

  return {
    async listSites(userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/sites?select=id,owner_user_id,slug,name,template,created_at,updated_at&order=created_at.asc`,
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
        template: row.template ?? DEFAULT_TEMPLATE,
        role: row.owner_user_id === userId ? 'owner' : 'collaborator',
        updatedAt: row.updated_at ?? row.created_at
      }));
    },

    async getSite(siteId, userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/sites?id=eq.${encodeURIComponent(siteId)}&select=id,owner_user_id,slug,name,template,created_at,updated_at`,
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
        template: row.template ?? DEFAULT_TEMPLATE,
        role: row.owner_user_id === userId ? 'owner' : 'collaborator',
        updatedAt: row.updated_at ?? row.created_at
      };
    },

    async createSite({ userId, name, slug, template = DEFAULT_TEMPLATE, content }, { token } = {}) {
      const siteRes = await fetchImpl(`${baseUrl}/rest/v1/sites`, {
        method: 'POST',
        headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({
          owner_user_id: userId,
          slug,
          name,
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
          template
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
          template: siteRow.template ?? DEFAULT_TEMPLATE,
          role: 'owner',
          updatedAt
        },
        draft: {
          siteId: draftRow.site_id,
          revision: draftRow.revision,
          updatedAt: draftRow.updated_at ?? updatedAt,
          content: draftRow.content
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
        content: row.content
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
      const updateRes = await fetchImpl(
        `${baseUrl}/rest/v1/drafts?site_id=eq.${encodeURIComponent(siteId)}&revision=eq.${encodeURIComponent(String(revision))}`,
        {
          method: 'PATCH',
          headers: authHeaders(token, { prefer: 'return=representation' }),
          body: JSON.stringify({ content })
        }
      );
      if (!updateRes.ok) {
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
          content: row.content
        }
      };
    },

    async savePublication(publication) {
      return sharedPublicPublications.savePublication(publication);
    },

    async getPublicationBySlug(slug) {
      return sharedPublicPublications.getPublicationBySlug(slug);
    },

    async getPublicationByHash(slug, hash) {
      return sharedPublicPublications.getPublicationByHash(slug, hash);
    }
  };
}

const sharedPublicPublications = createMemoryStore({ sites: [], drafts: [], memberships: [] });

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
      return new Response(method === 'HEAD' ? null : html, {
        status: 200,
        headers: {
          ...PUBLIC_SECURITY_HEADERS,
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

    return new Response(
      method === 'HEAD' ? null : 'Vitrine pública não encontrada.',
      {
        status: 404,
        headers: {
          ...PUBLIC_SECURITY_HEADERS,
          'content-type': 'text/plain; charset=utf-8',
          'cache-control': 'no-store'
        }
      }
    );
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
      return errorResponse(404, 'NOT_FOUND', 'Recurso não encontrado.');
    }

    try {
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
        if (method !== 'GET') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/auth/session.');
        }
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
          const { parsed } = await parseJsonRequest(request);
          const { name, slug, template, whatsapp } = validateSiteInput(parsed);
          const content = createInitialDraftContent({
            slug,
            name,
            template,
            whatsapp
          });
          const created = await store.createSite(
            {
              userId: user.id,
              name,
              slug,
              template,
              content
            },
            { token: user.token, env }
          );
          return jsonResponse(201, created);
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/sites.');
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
          let site = null;
          if (typeof store.getSite === 'function') {
            site = await store.getSite(siteId, user.id, { token: user.token, env });
          }
          if (site && site.role && site.role !== 'owner') {
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
        if (!site || (site.role && site.role !== 'owner')) {
          return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
        }

        // Atomic compilation: if compilePublicStorefront throws, previous publication in store remains untouched.
        const compiled = await compilePublicStorefront(draft.content, site, {
          revision: draft.revision,
          siteId: site.id
        });

        if (typeof store.savePublication === 'function') {
          await store.savePublication(compiled.publication);
        }
        await sharedPublicPublications.savePublication(compiled.publication);

        return jsonResponse(200, { publication: compiled.publication });
      }

      return errorResponse(404, 'NOT_FOUND', 'Endpoint da API não encontrado.');
    } catch (err) {
      if (err instanceof PortalValidationError) {
        return jsonResponse(err.status, err.toJSON());
      }
      return errorResponse(500, 'INTERNAL_ERROR', 'Erro interno ao processar a requisição.');
    }
  };

  handler.fetch = handler;
  handler.store = defaultStore;
  return handler;
}

const defaultApiHandler = createApiHandler();

export default {
  async fetch(request, env = {}, ctx = {}) {
    return defaultApiHandler(request, env, ctx);
  }
};
