import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  latToWorldY,
  lonToWorldX,
  mapsPointLink,
  normalizeGeoQuery,
  panCenter,
  photonFeatureToResult,
  rankGeoResults,
  typedHouseNumber,
  visibleTiles,
  worldXToLon,
  worldYToLat
} from '../web/assets/geo.mjs';
import { GEO_USER_AGENT, handleGeoRequest } from '../src/geo-proxy.mjs';
import { STOREFRONT_PERMISSIONS_POLICY, createApiHandler } from '../workers/api.mjs';
import { compilePublicStorefront } from '../src/publication-engine.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { staticStorefrontLimits } from '../src/static-storefronts.mjs';
import { buildDispatchMessage, parseOrderMessage } from '../web/portal/dispatch.mjs';
import { deliveryDraftErrors, deliverySearchArea, normalizeDeliveryArea } from '../web/assets/delivery.mjs';
import { withDomMock } from './fixtures/dom-mock.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const BH = { lat: -19.924502, lon: -43.935238 };

const photonFeature = {
  geometry: { coordinates: [BH.lon, BH.lat] },
  properties: { street: 'Rua da Bahia', housenumber: '1000', district: 'Centro', city: 'Belo Horizonte', state: 'Minas Gerais', countrycode: 'BR' }
};

test('Mapa: projeção ida e volta, blocos visíveis e arraste do centro', () => {
  const zoom = 17;
  const x = lonToWorldX(BH.lon, zoom);
  const y = latToWorldY(BH.lat, zoom);
  assert.ok(Math.abs(worldXToLon(x, zoom) - BH.lon) < 1e-9);
  assert.ok(Math.abs(worldYToLat(y, zoom) - BH.lat) < 1e-9);

  const tiles = visibleTiles({ ...BH, zoom, width: 320, height: 220 });
  assert.ok(tiles.length >= 2 && tiles.length <= 6);
  assert.ok(tiles.every((tile) => tile.z === zoom && Number.isInteger(tile.x) && Number.isInteger(tile.y)));
  assert.ok(tiles.some((tile) => tile.left <= 160 && tile.left + 256 >= 160 && tile.top <= 110 && tile.top + 256 >= 110));

  const moved = panCenter({ ...BH, zoom }, 256, 0);
  assert.ok(moved.lon < BH.lon, 'arrastar para a direita mostra o oeste');
  assert.ok(Math.abs(moved.lat - BH.lat) < 1e-9);
  assert.equal(mapsPointLink(BH.lat, BH.lon), 'https://maps.google.com/?q=-19.924502,-43.935238');
  assert.equal(mapsPointLink(NaN, 1), '');
});

test('Mapa: endereço legível a partir do Photon e consulta com limites', () => {
  assert.deepEqual(photonFeatureToResult(photonFeature), {
    label: 'Rua da Bahia, 1000 - Centro, Belo Horizonte - Minas Gerais',
    lat: BH.lat,
    lon: BH.lon
  });
  assert.equal(photonFeatureToResult({ geometry: { coordinates: [200, 0] }, properties: { name: 'X' } }), null);
  assert.equal(normalizeGeoQuery('  rua   da bahia '), 'rua da bahia');
  assert.deepEqual(rankGeoResults('Rua da Bahia 1000 Belo Horizonte', [
    { label: 'Rua Belo Horizonte, 1000 - Shangrilá, Bom Jesus da Lapa - Bahia' },
    { label: 'Rua da Bahia, 1000 - Lourdes, Belo Horizonte - Minas Gerais' }
  ]).map((r) => r.label)[0], 'Rua da Bahia, 1000 - Lourdes, Belo Horizonte - Minas Gerais');
  assert.equal(normalizeGeoQuery('ab'), null);
  assert.equal(normalizeGeoQuery('x'.repeat(121)), null);
});

test('Proxy do mapa: busca no Brasil sem cache, blocos com User-Agent e cache, e só a própria origem', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, ua: init?.headers?.['user-agent'] });
    if (url.includes('tile.openstreetmap.org')) return new Response(new Uint8Array([137, 80, 78, 71]), { status: 200 });
    return Response.json({ features: [photonFeature, { ...photonFeature, properties: { ...photonFeature.properties, countrycode: 'AR' } }] });
  };
  const stored = new Map();
  const cache = {
    match: async (request) => stored.get(request.url)?.clone() ?? null,
    put: async (request, response) => { stored.set(request.url, response); }
  };
  const call = (path, headers = {}) => {
    const url = new URL(path, 'https://vitrine.inspira.dev.br');
    return handleGeoRequest(new Request(url, { headers }), url, { fetchImpl, cache });
  };

  const search = await call('/api/geo/search?q=rua%20da%20bahia%201000&lat=-19.9&lon=-43.9', { 'sec-fetch-site': 'same-origin' });
  assert.equal(search.status, 200);
  assert.equal(search.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual((await search.json()).results.map((r) => r.label), ['Rua da Bahia, 1000 - Centro, Belo Horizonte - Minas Gerais']);
  assert.match(calls[0].url, /^https:\/\/photon\.komoot\.io\/api\/\?q=rua%20da%20bahia%201000&limit=5&bbox=-74\.1,-33\.9,-34\.7,5\.4&lat=-19\.900&lon=-43\.900&zoom=12&location_bias_scale=0\.5$/);
  assert.equal(calls[0].ua, GEO_USER_AGENT);
  assert.equal(stored.size, 0, 'endereço digitado não vai para o cache');

  const reverse = await call(`/api/geo/reverse?lat=${BH.lat}&lon=${BH.lon}`);
  assert.equal((await reverse.json()).result.label, 'Rua da Bahia, 1000 - Centro, Belo Horizonte - Minas Gerais');

  const tile = await call('/api/geo/tile/17/48760/71000.png');
  assert.equal(tile.status, 200);
  assert.equal(tile.headers.get('content-type'), 'image/png');
  assert.match(tile.headers.get('cache-control'), /max-age=604800/);
  assert.equal(calls.at(-1).url, 'https://tile.openstreetmap.org/17/48760/71000.png');
  const before = calls.length;
  assert.equal((await call('/api/geo/tile/17/48760/71000.png')).status, 200);
  assert.equal(calls.length, before, 'o segundo pedido do mesmo bloco vem do cache');

  assert.equal((await call('/api/geo/search?q=ab')).status, 400);
  assert.equal((await call('/api/geo/reverse?lat=abc&lon=1')).status, 400);
  assert.equal((await call('/api/geo/tile/2/1/1.png')).status, 400);
  assert.equal((await call('/api/geo/tile/17/999999/1.png')).status, 400);
  assert.equal((await call('/api/geo/search?q=rua%20da%20bahia', { 'sec-fetch-site': 'cross-site' })).status, 403);
  const post = new URL('/api/geo/search?q=rua', 'https://vitrine.inspira.dev.br');
  assert.equal((await handleGeoRequest(new Request(post, { method: 'POST' }), post, { fetchImpl, cache })).status, 405);

  const failing = async () => new Response('erro', { status: 503 });
  const down = new URL('/api/geo/search?q=rua%20da%20bahia', 'https://vitrine.inspira.dev.br');
  assert.equal((await handleGeoRequest(new Request(down), down, { fetchImpl: failing, cache })).status, 502);
});

test('Worker: /api/geo/ atende pelo proxy e a vitrine libera geolocalização só para a própria origem', async () => {
  const api = createApiHandler({
    geoFetch: async () => Response.json({ features: [photonFeature] }),
    geoCache: null
  });
  const response = await api.fetch(new Request('https://vitrine.inspira.dev.br/api/geo/search?q=rua%20da%20bahia'));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).results.length, 1);
  assert.equal(STOREFRONT_PERMISSIONS_POLICY, 'camera=(), microphone=(), geolocation=(self)');
  const page = await api.fetch(new Request('https://vitrine.inspira.dev.br/loja1'));
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('permissions-policy'), STOREFRONT_PERMISSIONS_POLICY);
});

test('Forno de Minas: ponto do mapa entra na mensagem e o despacho usa o link exato', async () => {
  const source = JSON.parse(await readFile(resolve(root, 'content/vitrines/forno-de-minas.json'), 'utf8'));
  const { menu } = await compilePublicStorefront(source, { slug: source.slug, name: source.businessName, template: source.template }, {
    revision: 1,
    ...staticStorefrontLimits(source.slug)
  });
  assert.equal(menu.orderFields.addressMap, true);

  const message = withDomMock(({ byId }) => {
    const renderer = new StorefrontRenderer(byId.get('storefront-catalog'), menu, { isPublicPage: true });
    renderer.render();
    renderer.setQuantity(menu.items.find((item) => item.id === 'calabresa'), 1);
    Object.assign(renderer.customerDetails, {
      customerName: 'Joana',
      deliveryOrPickup: 'delivery',
      address: 'Rua da Bahia, 1000 - Centro',
      location: BH,
      paymentMethod: 'pix'
    });
    renderer.goToStage(2);
    renderer.goToStage(3);
    const text = renderer.buildOrderMessage();
    renderer.customerDetails.deliveryOrPickup = 'pickup';
    assert.doesNotMatch(renderer.buildOrderMessage(), /Localização/);
    return text;
  });
  assert.match(message, /Entrega: Rua da Bahia, 1000 - Centro\nLocalização: https:\/\/maps\.google\.com\/\?q=-19\.924502,-43\.935238/);

  const order = parseOrderMessage(message);
  assert.equal(order.location, 'https://maps.google.com/?q=-19.924502,-43.935238');
  assert.match(buildDispatchMessage(order), /Mapa: https:\/\/maps\.google\.com\/\?q=-19\.924502,-43\.935238/);
});

test('Cidade das entregas: orienta a busca pelo centro da cidade e mantém o número digitado', async () => {
  assert.deepEqual(normalizeDeliveryArea({ city: ' Belo  Horizonte ', uf: 'mg' }), { city: 'Belo Horizonte', uf: 'MG' });
  assert.equal(normalizeDeliveryArea({ city: 'B', uf: 'MG' }), null);
  assert.equal(normalizeDeliveryArea({ city: 'Belo Horizonte', uf: 'Minas' }), null);
  assert.equal(deliveryDraftErrors({ deliveryArea: { city: '<b>', uf: 'MG' } })[0].code, 'INVALID_DELIVERY_AREA');
  assert.deepEqual(deliverySearchArea({ publicAddress: { street: 'Rua X', city: 'Contagem', uf: 'MG' } }), { city: 'Contagem', uf: 'MG' });
  assert.equal(typedHouseNumber('Rua da Bahia 1000'), '1000');
  assert.equal(typedHouseNumber('Rua 7 de Setembro, 45B'), '7');
  assert.equal(typedHouseNumber('Rua da Bahia'), '');

  const urls = [];
  const fetchImpl = async (url) => {
    urls.push(url);
    if (url.includes('layer=city')) {
      return Response.json({ features: [{ geometry: { coordinates: [-43.94, -19.92] }, properties: { name: 'Belo Horizonte', type: 'city', state: 'Minas Gerais', countrycode: 'BR' } }] });
    }
    return Response.json({ features: [{ geometry: { coordinates: [-43.93, -19.92] }, properties: { name: 'Rua da Bahia', type: 'street', district: 'Centro', city: 'Belo Horizonte', state: 'Minas Gerais', countrycode: 'BR' } }] });
  };
  const url = new URL('https://vitrine.inspira.dev.br/api/geo/search?q=Rua%20da%20Bahia%201000&near=Belo%20Horizonte%20-%20MG');
  const response = await handleGeoRequest(new Request(url), url, { fetchImpl, cache: null });
  assert.deepEqual((await response.json()).results.map((r) => r.label), ['Rua da Bahia, 1000 - Centro, Belo Horizonte - Minas Gerais']);
  assert.match(urls[0], /q=Belo%20Horizonte%2C%20MG&limit=1&layer=city/);
  assert.match(urls[1], /q=Rua%20da%20Bahia%201000%2C%20Belo%20Horizonte&.*&lat=-19\.920&lon=-43\.940&zoom=12&location_bias_scale=0\.5$/);

  const { menu } = await compilePublicStorefront({
    schemaVersion: 1, template: 'pizzeria-v1', slug: 'pizzaria-teste', businessName: 'Pizzaria Teste', whatsapp: '5531999998888',
    deliveryArea: { city: 'Belo Horizonte', uf: 'MG' },
    categories: [{ id: 'pizzas', name: 'Pizzas', items: [{ id: 'calabresa', name: 'Calabresa', priceCents: 3990, active: true }] }]
  }, { slug: 'pizzaria-teste', name: 'Pizzaria Teste', template: 'pizzeria-v1' }, { revision: 1 });
  assert.deepEqual(menu.deliveryArea, { city: 'Belo Horizonte', uf: 'MG' });
});
