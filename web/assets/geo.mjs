// Endereço com mapa (spec 021, US5). Módulo puro: projeção do mapa (Web Mercator, blocos
// de 256 px do OpenStreetMap), link do ponto no Google Maps e formatação dos resultados da
// busca (Photon). Usado pelo Worker, pela vitrine e pelo despacho do painel.

export const TILE_SIZE = 256;
export const MAP_MIN_ZOOM = 4;
export const MAP_MAX_ZOOM = 19;
export const MAP_DEFAULT_ZOOM = 17;
export const GEO_QUERY_MIN = 3;
export const GEO_QUERY_MAX = 120;
export const GEO_RESULTS_MAX = 5;
// Caixa do Brasil (oeste, sul, leste, norte) para a busca não sugerir endereços de fora.
export const BRAZIL_BBOX = Object.freeze([-74.1, -33.9, -34.7, 5.4]);

const MAX_LAT = 85.05112878;

export function isValidLatLon(lat, lon) {
  return Number.isFinite(lat) && Number.isFinite(lon) && lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
}

export function roundCoord(value) {
  return Math.round(value * 1e6) / 1e6;
}

/** Link que abre o ponto no Google Maps (app no celular), sem chave nem API. */
export function mapsPointLink(lat, lon) {
  if (!isValidLatLon(lat, lon)) return '';
  return `https://maps.google.com/?q=${roundCoord(lat)},${roundCoord(lon)}`;
}

export function worldSize(zoom) {
  return TILE_SIZE * 2 ** zoom;
}

export function lonToWorldX(lon, zoom) {
  return ((lon + 180) / 360) * worldSize(zoom);
}

export function latToWorldY(lat, zoom) {
  const clamped = Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
  const rad = (clamped * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * worldSize(zoom);
}

export function worldXToLon(x, zoom) {
  return (x / worldSize(zoom)) * 360 - 180;
}

export function worldYToLat(y, zoom) {
  const n = Math.PI - (2 * Math.PI * y) / worldSize(zoom);
  return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

/** Blocos visíveis para um centro e um tamanho de tela: `[{ z, x, y, left, top }]` em px da tela. */
export function visibleTiles({ lat, lon, zoom, width, height }) {
  const centerX = lonToWorldX(lon, zoom);
  const centerY = latToWorldY(lat, zoom);
  const originX = centerX - width / 2;
  const originY = centerY - height / 2;
  const count = 2 ** zoom;
  const tiles = [];
  for (let ty = Math.floor(originY / TILE_SIZE); ty <= Math.floor((originY + height) / TILE_SIZE); ty += 1) {
    if (ty < 0 || ty >= count) continue;
    for (let tx = Math.floor(originX / TILE_SIZE); tx <= Math.floor((originX + width) / TILE_SIZE); tx += 1) {
      const wrapped = ((tx % count) + count) % count;
      tiles.push({ z: zoom, x: wrapped, y: ty, left: tx * TILE_SIZE - originX, top: ty * TILE_SIZE - originY });
    }
  }
  return tiles;
}

/** Novo centro depois de arrastar o mapa `dx`, `dy` px na tela. */
export function panCenter({ lat, lon, zoom }, dx, dy) {
  const x = lonToWorldX(lon, zoom) - dx;
  const y = latToWorldY(lat, zoom) - dy;
  const size = worldSize(zoom);
  const wrappedX = ((x % size) + size) % size;
  return { lat: worldYToLat(Math.max(0, Math.min(size, y)), zoom), lon: worldXToLon(wrappedX, zoom) };
}

export function normalizeGeoQuery(value) {
  const query = String(value ?? '').replace(/\s+/g, ' ').trim();
  return query.length >= GEO_QUERY_MIN && query.length <= GEO_QUERY_MAX ? query : null;
}

/** Número da casa digitado na busca (`Rua da Bahia 1000` → `1000`), para não se perder ao escolher a rua. */
export function typedHouseNumber(query) {
  return String(query ?? '').match(/(?:^|[\s,])(\d{1,5}[A-Za-z]?)(?=$|[\s,])/)?.[1] ?? '';
}

/**
 * Endereço legível a partir de um resultado do Photon, como
 * `Rua da Bahia, 1000 - Centro, Belo Horizonte - Minas Gerais`. Sem número no resultado,
 * usa o número digitado.
 */
export function photonFeatureToResult(feature, houseNumber = '') {
  const [lon, lat] = Array.isArray(feature?.geometry?.coordinates) ? feature.geometry.coordinates : [];
  if (!isValidLatLon(lat, lon)) return null;
  const p = feature.properties ?? {};
  const text = (value) => (typeof value === 'string' ? value.trim() : '');
  const street = text(p.street) || (p.type === 'street' || p.osm_key === 'highway' ? text(p.name) : '');
  const number = text(p.housenumber) || (street ? houseNumber : '');
  const streetLine = street ? `${street}${number ? `, ${number}` : ''}` : '';
  const name = text(p.name);
  const first = [name && name !== street ? name : '', streetLine].filter(Boolean).join(', ');
  const area = text(p.district) || text(p.locality) || text(p.suburb);
  const city = text(p.city) || text(p.county);
  const state = text(p.state);
  const place = [city, state].filter(Boolean).join(' - ');
  const label = [first ? `${first}${area ? ` - ${area}` : ''}` : area, place].filter(Boolean).join(', ');
  if (!label) return null;
  return { label: label.slice(0, 200), lat: roundCoord(lat), lon: roundCoord(lon) };
}

function words(text) {
  return String(text ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Ordena as sugestões pelo que a pessoa digitou: palavras em comum e, com peso maior,
 * pares de palavras na mesma ordem ("rua da bahia" antes de "rua belo horizonte, bahia").
 */
export function rankGeoResults(query, results) {
  const typed = words(query);
  const pairs = typed.slice(1).map((word, index) => `${typed[index]} ${word}`);
  const score = (label) => {
    const labelWords = words(label);
    const set = new Set(labelWords);
    const joined = ` ${labelWords.join(' ')} `;
    return typed.filter((word) => set.has(word)).length + 2 * pairs.filter((pair) => joined.includes(` ${pair} `)).length;
  };
  return results
    .map((result, index) => ({ result, index, score: score(result.label) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.result);
}
