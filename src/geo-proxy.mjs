// Proxy do endereço com mapa (spec 021, US5): busca e endereço reverso pelo Photon
// (photon.komoot.io) e blocos do mapa do OpenStreetMap, servidos pela própria origem para
// a CSP da vitrine continuar `img-src 'self'; connect-src 'self'`. Respeita as regras de
// uso dos dois serviços: User-Agent próprio, blocos em cache e só pedidos da própria vitrine.
import {
  BRAZIL_BBOX,
  GEO_RESULTS_MAX,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  isValidLatLon,
  normalizeGeoQuery,
  photonFeatureToResult,
  rankGeoResults,
  typedHouseNumber
} from '../web/assets/geo.mjs';

export const GEO_USER_AGENT = 'VitrineInspira/1.0 (+https://vitrine.inspira.dev.br)';
export const PHOTON_BASE = 'https://photon.komoot.io';
export const OSM_TILE_BASE = 'https://tile.openstreetmap.org';
const TILE_PATH = /^\/api\/geo\/tile\/(\d{1,2})\/(\d{1,7})\/(\d{1,7})\.png$/;
// Endereços digitados não ficam em cache; só os blocos do mapa, que são públicos.
const PRIVATE_NO_STORE = 'private, no-store';
const TILE_CACHE = 'public, max-age=604800, stale-while-revalidate=86400';

function json(status, body, cacheControl = 'no-store') {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': cacheControl, 'x-content-type-options': 'nosniff' }
  });
}

function geoError(status, code, message) {
  return json(status, { error: { code, message } });
}

/** Aceita só pedidos da própria página: navegadores mandam `Sec-Fetch-Site`. */
function isCrossSite(request) {
  const site = request.headers.get('sec-fetch-site');
  return Boolean(site) && site !== 'same-origin' && site !== 'same-site';
}

async function cached(request, cache, produce) {
  const key = new Request(request.url, { method: 'GET' });
  const hit = cache ? await cache.match(key).catch(() => null) : null;
  if (hit) return hit;
  const response = await produce();
  if (cache && response.ok) await cache.put(key, response.clone()).catch(() => {});
  return response;
}

function parseCoord(url, name) {
  const raw = url.searchParams.get(name);
  return raw === null || raw.trim() === '' ? NaN : Number(raw);
}

async function photon(fetchImpl, path, houseNumber = '') {
  const response = await fetchImpl(`${PHOTON_BASE}${path}`, {
    headers: { 'user-agent': GEO_USER_AGENT, accept: 'application/json' }
  });
  if (!response?.ok) throw new Error(`photon ${response?.status}`);
  const data = await response.json();
  return (Array.isArray(data?.features) ? data.features : [])
    .filter((feature) => feature?.properties?.countrycode === undefined || feature.properties.countrycode === 'BR')
    .map((feature) => photonFeatureToResult(feature, houseNumber))
    .filter(Boolean)
    .filter((result, index, all) => all.findIndex((other) => other.label === result.label) === index);
}

function normalizeNear(value) {
  const match = String(value ?? '').trim().match(/^(.{2,60}?)\s*-\s*([A-Za-z]{2})$/);
  return match && !/[<>{}]/.test(match[1]) ? { city: match[1].trim(), uf: match[2].toUpperCase() } : null;
}

/** Centro da cidade das entregas, em cache: é um dado público da vitrine, não da pessoa. */
async function cityCenter(request, near, { fetchImpl, cache }) {
  const key = new URL(`/api/geo/city?near=${encodeURIComponent(`${near.city} - ${near.uf}`)}`, request.url);
  const response = await cached(new Request(key), cache, async () => {
    try {
      const [city] = await photon(fetchImpl, `/api/?q=${encodeURIComponent(`${near.city}, ${near.uf}`)}&limit=1&layer=city&bbox=${BRAZIL_BBOX.join(',')}`);
      return json(city ? 200 : 404, { city: city ?? null }, TILE_CACHE);
    } catch {
      return json(502, { city: null });
    }
  }).catch(() => null);
  const data = response?.ok ? await response.json().catch(() => null) : null;
  return data?.city ? { lat: data.city.lat, lon: data.city.lon } : null;
}

/**
 * Atende `/api/geo/search`, `/api/geo/reverse` e `/api/geo/tile/:z/:x/:y.png`.
 * Devolve `null` para outros caminhos.
 */
export async function handleGeoRequest(request, url, { fetchImpl = globalThis.fetch, cache = globalThis.caches?.default } = {}) {
  const { pathname } = url;
  if (!pathname.startsWith('/api/geo/')) return null;
  if ((request.method || 'GET').toUpperCase() !== 'GET') {
    return geoError(405, 'METHOD_NOT_ALLOWED', 'Use GET para o endereço com mapa.');
  }
  if (isCrossSite(request)) return geoError(403, 'GEO_CROSS_SITE', 'O mapa só atende a própria vitrine.');

  if (pathname === '/api/geo/search') {
    const query = normalizeGeoQuery(url.searchParams.get('q'));
    if (!query) return geoError(400, 'INVALID_GEO_QUERY', 'Digite de 3 a 120 caracteres do endereço.');
    let lat = parseCoord(url, 'lat');
    let lon = parseCoord(url, 'lon');
    const near = normalizeNear(url.searchParams.get('near'));
    let text = query;
    if (near) {
      if (!query.toLowerCase().includes(near.city.toLowerCase())) text = `${query}, ${near.city}`;
      if (!isValidLatLon(lat, lon)) {
        const center = await cityCenter(request, near, { fetchImpl, cache });
        if (center) ({ lat, lon } = center);
      }
    }
    const bias = isValidLatLon(lat, lon) ? `&lat=${lat.toFixed(3)}&lon=${lon.toFixed(3)}&zoom=12&location_bias_scale=0.5` : '';
    try {
      const results = await photon(fetchImpl,
        `/api/?q=${encodeURIComponent(text)}&limit=${GEO_RESULTS_MAX}&bbox=${BRAZIL_BBOX.join(',')}${bias}`,
        typedHouseNumber(query));
      return json(200, { results: rankGeoResults(query, results).slice(0, GEO_RESULTS_MAX) }, PRIVATE_NO_STORE);
    } catch {
      return geoError(502, 'GEO_UNAVAILABLE', 'A busca de endereço não respondeu. Digite o endereço completo.');
    }
  }

  if (pathname === '/api/geo/reverse') {
    const lat = parseCoord(url, 'lat');
    const lon = parseCoord(url, 'lon');
    if (!isValidLatLon(lat, lon)) return geoError(400, 'INVALID_GEO_POINT', 'Ponto do mapa inválido.');
    try {
      const [result = null] = await photon(fetchImpl, `/reverse?lat=${lat.toFixed(6)}&lon=${lon.toFixed(6)}&limit=1`);
      return json(200, { result }, PRIVATE_NO_STORE);
    } catch {
      return geoError(502, 'GEO_UNAVAILABLE', 'Não foi possível achar o endereço deste ponto.');
    }
  }

  const tile = pathname.match(TILE_PATH);
  if (tile) {
    const [z, x, y] = tile.slice(1).map(Number);
    const count = 2 ** z;
    if (z < MAP_MIN_ZOOM || z > MAP_MAX_ZOOM || x >= count || y >= count) {
      return geoError(400, 'INVALID_GEO_TILE', 'Bloco do mapa inválido.');
    }
    return cached(request, cache, async () => {
      const upstream = await fetchImpl(`${OSM_TILE_BASE}/${z}/${x}/${y}.png`, { headers: { 'user-agent': GEO_USER_AGENT } })
        .catch(() => null);
      if (!upstream?.ok) return geoError(502, 'GEO_UNAVAILABLE', 'O mapa não respondeu.');
      return new Response(await upstream.arrayBuffer(), {
        status: 200,
        headers: { 'content-type': 'image/png', 'cache-control': TILE_CACHE, 'x-content-type-options': 'nosniff' }
      });
    });
  }

  return geoError(404, 'NOT_FOUND', 'Rota do mapa não encontrada.');
}
