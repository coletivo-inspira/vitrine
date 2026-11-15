// Leitura pública da vitrine para robôs de conversa (issue #120, contrato em
// docs/vitrine-json.md). Servida do snapshot publicado (ADR 0008): o direito
// `public_json` é decidido na publicação e gravado como `features.publicJson`; só a
// suspensão do plano é conferida depois, uma vez por falta no cache da borda.
import { paidFeatureGoneResponse } from './billing/lifecycle.mjs';
import { buildRouteUrl, formatPublicAddress, getOpenStatus } from './business-hours.mjs';
import { hasPlanFeature, loadSiteEntitlements } from './entitlements.mjs';
import { canonicalUrlOf } from './local-seo.mjs';
import { PortalValidationError } from './portal-validation.mjs';
import { respondIfShowcasePaused } from './site-lifecycle.mjs';
import { ORDER_RELAY_DIRECT, ORDER_RELAY_MILA, withMilaRelayPrefix } from '../web/assets/mila-relay.mjs';

export const VITRINE_JSON_SCHEMA_VERSION = 1;
export const VITRINE_JSON_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400';
export const VITRINE_JSON_PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/vitrine\.json$/;
export const PUBLIC_JSON_FEATURE = 'public_json';
const ENTITLEMENT_MEMO_TTL_MS = 60_000;
const ENTITLEMENT_MEMO_MAX = 500;
const MAX_LINKS = 20;

export const VITRINE_JSON_HEADERS = Object.freeze({
  'access-control-allow-origin': '*',
  'access-control-expose-headers': 'etag',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
});

/** Opção de publicação derivada do plano (entra em compilePublicStorefront). */
export function vitrineJsonPublicationOptions(entitlements) {
  return { publicJson: hasPlanFeature(entitlements, PUBLIC_JSON_FEATURE) };
}

/** Indicador público mínimo no snapshot; ausente sem o recurso (o hash não muda). */
export function projectPublicFeatures({ publicJson = false } = {}) {
  return publicJson === true ? { features: { publicJson: true } } : {};
}

export function assertPublicFeatures(menu) {
  if (menu.features === undefined) return;
  const block = menu.features;
  const keys = block && typeof block === 'object' && !Array.isArray(block) ? Object.keys(block) : null;
  if (!keys || keys.length !== 1 || block.publicJson !== true) {
    throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Bloco features inválido.');
  }
}

export function snapshotAllowsPublicJson(menu) {
  return menu?.features?.publicJson === true;
}

export function matchVitrineJsonPath(pathname) {
  return pathname.match(VITRINE_JSON_PATH)?.[1] ?? null;
}

function whatsappUrl(menu, message) {
  const phone = String(menu.whatsapp ?? '').replace(/\D/g, '');
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(withMilaRelayPrefix(message, menu.orderRelay, menu.name))}`;
}

function publicLinks(structure) {
  const links = [];
  const seen = new Set();
  for (const page of structure?.pages ?? []) {
    for (const section of page?.sections ?? []) {
      if (section?.moduleCode !== 'links_bio' || section.active === false) continue;
      for (const link of section.config?.links ?? []) {
        const url = typeof link?.href === 'string' ? link.href.trim() : '';
        if (!/^https:\/\//i.test(url) || seen.has(url) || links.length >= MAX_LINKS) continue;
        seen.add(url);
        links.push({ label: String(link.label ?? '').trim() || url, url });
      }
    }
  }
  return links;
}

function publicItems(menu) {
  const fromCategories = (menu.categories ?? []).flatMap((category) =>
    (category.items ?? []).map((item) => ({ item, category: category.name })));
  const entries = fromCategories.length ? fromCategories : (menu.items ?? []).map((item) => ({ item, category: null }));
  return entries.map(({ item, category }) => ({
    id: item.id,
    name: item.name,
    priceCents: item.priceCents,
    ...(item.priceMode ? { priceMode: item.priceMode } : {}),
    ...(category ? { category } : {}),
    url: whatsappUrl(menu, `Olá! Tenho interesse em ${item.name}. Pode confirmar preço e disponibilidade?`)
  }));
}

function openNowOf(hours, now) {
  const status = hours ? getOpenStatus(hours, now) : null;
  if (!status) return null;
  return {
    open: status.open,
    label: status.label,
    ...(status.closesAt ? { closesAt: status.closesAt } : {}),
    ...(status.opensAt ? { opensAt: status.opensAt } : {}),
    computedAt: now.toISOString()
  };
}

/** Corpo de `vitrine.json` a partir do snapshot publicado, sem nenhum dado privado. */
export function buildVitrineJson(publication, { now = new Date() } = {}) {
  const menu = publication.menu;
  const address = menu.publicAddress ?? null;
  return {
    schemaVersion: VITRINE_JSON_SCHEMA_VERSION,
    slug: menu.slug,
    name: menu.name,
    url: canonicalUrlOf(menu),
    description: menu.messages?.welcomeText ?? null,
    whatsapp: menu.whatsapp
      ? {
          number: String(menu.whatsapp).replace(/\D/g, ''),
          via: menu.orderRelay?.via === ORDER_RELAY_MILA ? ORDER_RELAY_MILA : ORDER_RELAY_DIRECT,
          url: whatsappUrl(menu, `Olá! Vi a vitrine ${menu.name} e gostaria de conversar.`)
        }
      : null,
    businessHours: menu.businessHours ?? null,
    openNow: openNowOf(menu.businessHours, now),
    address: address
      ? { ...address, formatted: formatPublicAddress(address), routeUrl: buildRouteUrl(address) || null }
      : null,
    links: publicLinks(menu.structure),
    currency: menu.currency ?? 'BRL',
    items: publicItems(menu),
    updatedAt: publication.publishedAt
  };
}

function withVitrineJsonHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(VITRINE_JSON_HEADERS)) headers.set(key, value);
  return new Response(response.body, { status: response.status, headers });
}

export function vitrineJsonMethodNotAllowed() {
  return new Response(null, {
    status: 405,
    headers: { ...VITRINE_JSON_HEADERS, allow: 'GET, HEAD', 'cache-control': 'no-store' }
  });
}

export function vitrineJsonGone() {
  return withVitrineJsonHeaders(paidFeatureGoneResponse());
}

function etagMatches(ifNoneMatch, etag) {
  if (!ifNoneMatch || !etag) return false;
  const bare = (value) => value.trim().replace(/^W\//, '');
  return ifNoneMatch.split(',').some((candidate) => candidate.trim() === '*' || bare(candidate) === bare(etag));
}

function finalize(response, request, method) {
  const etag = response.headers.get('etag');
  if (response.status === 200 && etagMatches(request.headers.get('if-none-match'), etag)) {
    const headers = new Headers(response.headers);
    headers.delete('content-type');
    headers.delete('content-length');
    return new Response(null, { status: 304, headers });
  }
  if (method === 'HEAD') return new Response(null, { status: response.status, headers: response.headers });
  return response;
}

const entitlementMemo = new Map();

// Suspensão: public.public_json_enabled(slug) pelo PostgREST; no armazenamento em
// memória (testes), os direitos do siteId. Sem nenhum dos dois, falha fechada.
async function readPublicJsonEnabled(store, publication, env) {
  if (typeof store?.isPublicJsonEnabled === 'function') {
    const enabled = await store.isPublicJsonEnabled(publication.slug, { env });
    if (enabled !== undefined) return enabled === true;
  }
  if (!publication.siteId) return false;
  return hasPlanFeature(await loadSiteEntitlements(store, publication.siteId, { env }), PUBLIC_JSON_FEATURE);
}

async function siteStillHasPublicJson(store, publication, env, nowMs) {
  const memo = entitlementMemo.get(publication.slug);
  if (memo && memo.store === store && nowMs - memo.at < ENTITLEMENT_MEMO_TTL_MS) return memo.allowed;
  const allowed = await readPublicJsonEnabled(store, publication, env);
  if (entitlementMemo.size >= ENTITLEMENT_MEMO_MAX) entitlementMemo.clear();
  entitlementMemo.set(publication.slug, { allowed, at: nowMs, store });
  return allowed;
}

export function forgetVitrineJsonState(slug) {
  entitlementMemo.delete(slug);
}

async function renderVitrineJson({ slug, store, env, loadPublication, now }) {
  const paused = await respondIfShowcasePaused(store, slug, 'GET', { json: true });
  if (paused) return { response: withVitrineJsonHeaders(paused), cacheable: false };
  const publication = await loadPublication(slug);
  if (!publication?.menu || !snapshotAllowsPublicJson(publication.menu)) {
    return { response: vitrineJsonGone(), cacheable: true };
  }
  if (!(await siteStillHasPublicJson(store, publication, env, now.getTime()))) {
    return { response: vitrineJsonGone(), cacheable: true };
  }
  const body = JSON.stringify(buildVitrineJson(publication, { now }));
  return {
    response: new Response(body, {
      status: 200,
      headers: {
        ...VITRINE_JSON_HEADERS,
        'content-type': 'application/json; charset=utf-8',
        'cache-control': VITRINE_JSON_CACHE_CONTROL,
        // Fraco: `openNow` é recalculado, o resto vem do hash da publicação.
        etag: `W/"${publication.hash}"`
      }
    }),
    cacheable: true
  };
}

/**
 * `GET|HEAD /<endereço>/vitrine.json` (e `/vitrine.json` no domínio próprio).
 * `cacheUrl` é a chave no `caches.default`: `<origem>/<endereço>/vitrine.json`, a mesma
 * que `storefrontCacheUrls` apaga ao pausar.
 */
export async function handleVitrineJsonRequest(request, { slug, store, env = {}, loadPublication, cacheUrl, now = () => new Date() }) {
  const method = (request.method || 'GET').toUpperCase();
  if (method !== 'GET' && method !== 'HEAD') return vitrineJsonMethodNotAllowed();
  const cache = globalThis.caches?.default;
  const key = new Request(cacheUrl);
  const cached = await cache?.match(key).catch(() => null);
  if (cached) return finalize(cached, request, method);
  let rendered;
  try {
    rendered = await renderVitrineJson({ slug, store, env, loadPublication, now: now() });
  } catch {
    return new Response(
      JSON.stringify({ error: { code: 'VITRINE_JSON_UNAVAILABLE', message: 'Vitrine indisponível no momento.' } }),
      { status: 503, headers: { ...VITRINE_JSON_HEADERS, 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } }
    );
  }
  if (rendered.cacheable && cache) {
    await cache.put(key, rendered.response.clone()).catch(() => {});
  }
  return finalize(rendered.response, request, method);
}
