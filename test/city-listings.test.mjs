import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PortalValidationError,
  RESERVED_SLUGS,
  slugifyCity,
  validateDraftContent,
  validateLocality,
  validateSlug
} from '../src/portal-validation.mjs';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  projectPublicStorefrontMenu,
  renderStorefrontHtml
} from '../src/publication-engine.mjs';
import {
  CITY_PAGE_SIZE,
  describeListingPrice,
  parseCityListingQuery,
  projectCityListings,
  toPublicListing
} from '../src/city-listings.mjs';
import { createApiHandler, createMemoryStore, createSupabaseRestStore } from '../workers/api.mjs';

const siteAId = '20000000-0000-0000-0000-000000000001';
const PORTO_ALEGRE = { listed: true, city: 'Porto Alegre', uf: 'RS' };

function draft({ slug = 'bazar-ana', name = 'Bazar da Ana', locality = PORTO_ALEGRE, items } = {}) {
  return {
    schemaVersion: 1,
    template: 'products-v1',
    catalogType: 'products',
    slug,
    businessName: name,
    whatsapp: '5551987654321',
    ...(locality ? { locality } : {}),
    categories: [{
      id: 'itens',
      name: 'Itens',
      items: items ?? [
        { id: 'bike', name: 'Bicicleta aro 26', priceMode: 'offer', priceCents: 15000, description: 'Pouco uso.' },
        { id: 'cadeira', name: 'Cadeira de madeira', priceCents: 9000 },
        { id: 'livros', name: 'Caixa de livros', priceMode: 'donation', priceCents: 0, conditions: 'Retirar no centro' },
        { id: 'violao', name: 'Violão', priceMode: 'trade', priceCents: 0, tradeFor: 'Teclado' },
        { id: 'oculto', name: 'Item oculto', priceMode: 'trade', priceCents: 0, active: false }
      ]
    }]
  };
}

async function publishInto(store, content, publishedAt) {
  const { publication } = await compilePublicStorefront(content, { slug: content.slug, name: content.businessName, template: content.template }, { publishedAt });
  await store.savePublication(publication);
  return publication;
}

async function apiWith(drafts) {
  const store = createMemoryStore({ sites: [], drafts: [], memberships: [] });
  let minute = 0;
  for (const content of drafts) {
    minute += 1;
    await publishInto(store, content, `2026-11-12T10:${String(minute).padStart(2, '0')}:00.000Z`);
  }
  return { api: createApiHandler({ store }), store };
}

test('Spec 012 — localidade da vitrine no rascunho', async (t) => {
  await t.test('padrão desligado, normaliza espaços e UF', () => {
    assert.deepEqual(validateLocality(undefined), { listed: false, city: '', uf: '' });
    assert.deepEqual(validateLocality({ listed: true, city: '  São   Paulo ', uf: 'sp' }), { listed: true, city: 'São Paulo', uf: 'SP' });
    assert.equal(slugifyCity('São Paulo', 'SP'), 'sao-paulo-sp');
    assert.equal(slugifyCity("Sant'Ana do Livramento", 'RS'), 'sant-ana-do-livramento-rs');
    assert.equal(slugifyCity('Sao Paulo', 'sp'), slugifyCity('SÃO PAULO', 'SP'));
  });

  await t.test('autorizar exige cidade e UF válidas', () => {
    assert.throws(() => validateLocality({ listed: true, city: 'Porto Alegre' }), { code: 'INCOMPLETE_LOCALITY' });
    assert.throws(() => validateLocality({ listed: true, city: 'Porto Alegre', uf: 'XX' }), { code: 'INVALID_LOCALITY_UF' });
    assert.throws(() => validateLocality({ listed: false, city: '<script>', uf: 'RS' }), { code: 'INVALID_LOCALITY_CITY' });
    assert.throws(() => validateLocality({ listed: false, city: 'Rua A, 123', uf: 'RS' }), { code: 'INVALID_LOCALITY_CITY' });
    assert.throws(() => validateLocality('Porto Alegre'), PortalValidationError);
    assert.throws(() => validateDraftContent(draft({ locality: { listed: true, city: '', uf: 'RS' } })), { code: 'INCOMPLETE_LOCALITY' });
    assert.doesNotThrow(() => validateDraftContent(draft({ locality: { listed: false, city: '', uf: '' } })));
  });

  await t.test('endereço por-cidade fica reservado para vitrines', () => {
    assert.ok(RESERVED_SLUGS.includes('por-cidade'));
    assert.throws(() => validateSlug('por-cidade'), PortalValidationError);
  });
});

test('Spec 012 — projeção pública da localidade', async (t) => {
  await t.test('só entra no manifesto quando autorizada, com cidade, UF e slug', () => {
    const listed = projectPublicStorefrontMenu(draft(), { slug: 'bazar-ana' });
    assert.deepEqual(listed.locality, { city: 'Porto Alegre', uf: 'RS', citySlug: 'porto-alegre-rs' });
    const notListed = projectPublicStorefrontMenu(draft({ locality: { listed: false, city: 'Porto Alegre', uf: 'RS' } }), { slug: 'bazar-ana' });
    assert.equal('locality' in notListed, false);
    assert.equal('locality' in projectPublicStorefrontMenu(draft({ locality: null }), { slug: 'bazar-ana' }), false);
  });

  await t.test('bloco locality adulterado é recusado como vazamento', () => {
    const menu = structuredClone(projectPublicStorefrontMenu(draft(), { slug: 'bazar-ana' }));
    assert.throws(() => assertNoPrivateLeakage({ ...menu, locality: { ...menu.locality, street: 'Rua A' } }), { code: 'PRIVATE_FIELD_LEAKAGE' });
    assert.throws(() => assertNoPrivateLeakage({ ...menu, locality: { ...menu.locality, citySlug: 'outra-rs' } }), { code: 'PRIVATE_FIELD_LEAKAGE' });
  });

  await t.test('vitrine listada ganha link para a página da cidade no rodapé', () => {
    const html = renderStorefrontHtml(projectPublicStorefrontMenu(draft(), { slug: 'bazar-ana' }));
    assert.match(html, /href="\/por-cidade\/porto-alegre-rs"/);
    const fixedOnly = projectPublicStorefrontMenu(draft({ items: [{ id: 'x', name: 'Só venda', priceCents: 100 }] }), { slug: 'bazar-ana' });
    assert.doesNotMatch(renderStorefrontHtml(fixedOnly), /por-cidade/);
  });

  await t.test('itens de cota (spec 014) não entram na página por cidade nem geram o link do rodapé', () => {
    const quota = { id: 'cota', name: 'Cotas para a reforma', priceMode: 'quota', priceCents: 2000, quotaTotal: 50, quotaFilled: 5, quotaReward: 'Nome no mural' };
    const mixed = projectPublicStorefrontMenu(draft({ items: [quota, { id: 'v', name: 'Violão', priceMode: 'trade', priceCents: 0 }] }), { slug: 'bazar-ana' });
    assert.deepEqual(projectCityListings(mixed, '2026-11-12T10:00:00.000Z').map((row) => row.item_id), ['v']);
    const quotaOnly = projectPublicStorefrontMenu(draft({ items: [quota] }), { slug: 'bazar-ana' });
    assert.equal(quotaOnly.items[0].priceMode, 'quota');
    assert.deepEqual(projectCityListings(quotaOnly, '2026-11-12T10:00:00.000Z'), []);
    assert.doesNotMatch(renderStorefrontHtml(quotaOnly), /por-cidade/);
  });

  await t.test('linhas derivadas ignoram venda e itens ocultos e preservam a ordem da vitrine', () => {
    const menu = projectPublicStorefrontMenu(draft(), { slug: 'bazar-ana' });
    const rows = projectCityListings(menu, '2026-11-12T10:00:00.000Z');
    assert.deepEqual(rows.map((row) => row.item_id), ['bike', 'livros', 'violao']);
    assert.ok(rows[0].sort_key > rows[1].sort_key && rows[1].sort_key > rows[2].sort_key);
    for (const row of rows) {
      assert.equal('whatsapp' in row, false);
      assert.equal('site_id' in row, false);
    }
  });
});

test('Spec 012 — apresentação de lance, doação e troca', () => {
  const [offer, donation, trade] = projectCityListings(projectPublicStorefrontMenu(draft(), { slug: 'bazar-ana' }), '2026-11-12T10:00:00.000Z').map(toPublicListing);
  assert.deepEqual(describeListingPrice(offer), { modeLabel: 'Lance', headline: 'Faça sua oferta', detail: 'a partir de R$ 150,00' });
  assert.deepEqual(describeListingPrice(donation), { modeLabel: 'Doação', headline: 'Sem custo', detail: 'Condições: Retirar no centro' });
  assert.deepEqual(describeListingPrice(trade), { modeLabel: 'Troca', headline: 'Para trocar', detail: 'Aceito em troca: Teclado' });
  assert.equal(offer.auction, null, 'campo reservado para a spec 013');
  assert.equal(describeListingPrice({ item: { priceMode: 'offer', priceCents: 0 } }).detail, '');
});

test('Spec 012 — consulta de filtros e cursor', () => {
  assert.deepEqual(parseCityListingQuery(new URLSearchParams('modo=troca')), { modeKey: 'troca', priceMode: 'trade', cursor: null });
  assert.deepEqual(parseCityListingQuery(new URLSearchParams('modo=venda&depois=../../x')), { modeKey: 'todos', priceMode: null, cursor: null });
  const cursor = '0001794477600000~bazar-ana~998';
  assert.equal(parseCityListingQuery(new URLSearchParams(`depois=${cursor}`)).cursor, cursor);
});

test('Spec 012 — rotas públicas /por-cidade no Worker', async (t) => {
  await t.test('índice lista cidades por UF com contagem, CSP estrita e cache de borda', async () => {
    const { api } = await apiWith([
      draft(),
      draft({ slug: 'sebo-rui', name: 'Sebo do Rui', locality: { listed: true, city: 'porto alegre', uf: 'RS' } }),
      draft({ slug: 'casa-sp', name: 'Casa SP', locality: { listed: true, city: 'São Paulo', uf: 'SP' } }),
      draft({ slug: 'sem-cidade', name: 'Sem cidade', locality: { listed: false, city: 'Recife', uf: 'PE' } })
    ]);
    const res = await api.fetch(new Request('http://localhost/por-cidade'));
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
    assert.match(res.headers.get('content-security-policy'), /img-src 'self';/);
    assert.equal(res.headers.get('cache-control'), 'public, max-age=300, stale-while-revalidate=86400');
    const html = await res.text();
    assert.match(html, /Rio Grande do Sul/);
    assert.match(html, /href="\/por-cidade\/porto-alegre-rs"/);
    assert.match(html, /6 itens/);
    assert.match(html, /href="\/por-cidade\/sao-paulo-sp"/);
    assert.doesNotMatch(html, /Recife/);

    const json = await (await api.fetch(new Request('http://localhost/data/por-cidade/index.json'))).json();
    assert.deepEqual(json.cities.map((city) => [city.citySlug, city.counts.total]), [['porto-alegre-rs', 6], ['sao-paulo-sp', 3]]);
  });

  await t.test('página da cidade mostra só lance, doação e troca, sem dados privados', async () => {
    const { api } = await apiWith([draft()]);
    const res = await api.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs'));
    assert.equal(res.status, 200);
    const html = await res.text();
    assert.match(html, /Bicicleta aro 26/);
    assert.match(html, /a partir de R\$ 150,00/);
    assert.match(html, /Aceito em troca: Teclado/);
    assert.match(html, /Condições: Retirar no centro/);
    assert.match(html, /href="\/bazar-ana"/);
    assert.doesNotMatch(html, /Cadeira de madeira/);
    assert.doesNotMatch(html, /Item oculto/);
    assert.doesNotMatch(html, /5551987654321|wa\.me/);
    assert.doesNotMatch(html, /<script>(?!<\/script>)/);
    assert.equal((html.match(/<script /g) ?? []).length, 2, 'só theme.js e app.js');
  });

  await t.test('filtro por modo e estado vazio', async () => {
    const { api } = await apiWith([draft()]);
    const troca = await (await api.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs?modo=troca'))).text();
    assert.match(troca, /Violão/);
    assert.doesNotMatch(troca, /Bicicleta/);
    assert.match(troca, /class="city-filter is-current" href="\/por-cidade\/porto-alegre-rs\?modo=troca" aria-current="page"/);

    const { api: onlyTrade } = await apiWith([draft({ items: [{ id: 'v', name: 'Violão', priceMode: 'trade', priceCents: 0 }] })]);
    const empty = await (await onlyTrade.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs?modo=lance'))).text();
    assert.match(empty, /Nenhum item de lance por enquanto/);
  });

  await t.test('paginação por cursor: 24 + restantes, sem repetir, cursor adulterado volta ao início', async () => {
    const tradeItems = (prefix) => Array.from({ length: 15 }, (_, index) => ({
      id: `${prefix}-${index + 1}`, name: `Troca ${prefix} ${index + 1}`, priceMode: 'trade', priceCents: 0
    }));
    const { api } = await apiWith([
      draft({ slug: 'loja-a', name: 'Loja A', items: tradeItems('a') }),
      draft({ slug: 'loja-b', name: 'Loja B', items: tradeItems('b') })
    ]);
    const first = await (await api.fetch(new Request('http://localhost/data/por-cidade/porto-alegre-rs.json'))).json();
    assert.equal(first.items.length, CITY_PAGE_SIZE);
    assert.equal(first.items[0].vitrine.slug, 'loja-b', 'publicação mais recente primeiro');
    assert.equal(first.items[0].item.id, 'b-1', 'ordem da vitrine preservada');
    assert.ok(first.nextCursor);
    const second = await (await api.fetch(new Request(`http://localhost/data/por-cidade/porto-alegre-rs.json?depois=${first.nextCursor}`))).json();
    assert.equal(second.items.length, 6);
    assert.equal(second.nextCursor, null);
    const ids = [...first.items, ...second.items].map((listing) => listing.item.id);
    assert.equal(new Set(ids).size, 30);

    const html = await (await api.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs'))).text();
    assert.ok(html.includes(`href="/por-cidade/porto-alegre-rs?depois=${first.nextCursor.replaceAll('~', '%7E')}"`));
    const page2 = await api.fetch(new Request(`http://localhost/por-cidade/porto-alegre-rs?depois=${first.nextCursor}`));
    assert.match(await page2.text(), /noindex, follow/);

    const tampered = await (await api.fetch(new Request('http://localhost/data/por-cidade/porto-alegre-rs.json?depois=%27%3Bdrop'))).json();
    assert.deepEqual(tampered.items.map((l) => l.item.id), first.items.map((l) => l.item.id));
  });

  await t.test('JSON público não expõe campos privados e reserva auction', async () => {
    const { api } = await apiWith([draft()]);
    const body = await (await api.fetch(new Request('http://localhost/data/por-cidade/porto-alegre-rs.json'))).text();
    for (const forbidden of ['whatsapp', 'siteId', 'site_id', 'owner', 'email', '5551987654321']) {
      assert.equal(body.includes(forbidden), false, `não pode conter ${forbidden}`);
    }
    const json = JSON.parse(body);
    assert.equal(json.mode, 'todos');
    assert.deepEqual(json.city, { citySlug: 'porto-alegre-rs', city: 'Porto Alegre', uf: 'RS', counts: { offer: 1, donation: 1, trade: 1, total: 3 } });
    assert.equal(json.items[0].auction, null);
  });

  await t.test('cidade desconhecida, método inválido, HEAD e fotos', async () => {
    const withPhoto = draft({ items: [{ id: 'p', name: 'Com foto', priceMode: 'donation', priceCents: 0, imageUrl: 'https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/catalog-images/x.webp' }] });
    const { api } = await apiWith([withPhoto]);
    const missing = await api.fetch(new Request('http://localhost/por-cidade/atlantida-rs'));
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('cache-control'), 'no-store');
    assert.match(await missing.text(), /noindex/);
    assert.equal((await api.fetch(new Request('http://localhost/data/por-cidade/atlantida-rs.json'))).status, 404);
    assert.equal((await api.fetch(new Request('http://localhost/por-cidade', { method: 'POST' }))).status, 405);
    const head = await api.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs', { method: 'HEAD' }));
    assert.equal(head.status, 200);
    assert.equal(await head.text(), '');
    const photo = await api.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs'));
    assert.match(photo.headers.get('content-security-policy'), /img-src 'self' https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co/);
  });

  await t.test('fluxo completo: salvar rascunho com cidade, publicar e aparecer; desmarcar e sumir', async () => {
    const api = createApiHandler();
    const put = async (content, revision) => api.fetch(new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, content })
    }));
    const publish = () => api.fetch(new Request(`http://localhost/api/sites/${siteAId}/publish`, {
      method: 'POST', headers: { Authorization: 'Bearer token-owner' }
    }));
    const base = { ...draft({ slug: 'pizza-a', name: 'Pizza A' }), template: 'pizzeria-v1', catalogType: 'products' };
    const saved = await put(base, 1);
    assert.equal(saved.status, 200);
    assert.equal((await publish()).status, 200);
    assert.match(await (await api.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs'))).text(), /Pizza A/);

    const savedJson = await saved.json();
    const unlisted = await put({ ...base, locality: { listed: false, city: 'Porto Alegre', uf: 'RS' } }, savedJson.draft.revision);
    assert.equal(unlisted.status, 200);
    assert.equal((await publish()).status, 200);
    assert.equal((await api.fetch(new Request('http://localhost/por-cidade/porto-alegre-rs'))).status, 404);

    const invalid = await put({ ...base, locality: { listed: true, city: '', uf: 'RS' } }, (await unlisted.json()).draft.revision);
    assert.equal(invalid.status, 422);
  });

  await t.test('índice sem cidades mostra o estado inicial', async () => {
    const { api } = await apiWith([]);
    const res = await api.fetch(new Request('http://localhost/por-cidade'));
    assert.equal(res.status, 200);
    assert.match(await res.text(), /Ainda não há cidades por aqui/);
  });
});

test('Spec 012 — store Supabase consulta por cursor com 1 requisição por página', async (t) => {
  await t.test('monta filtros PostgREST e memoriza o índice', async () => {
    const calls = [];
    const fetchMock = async (url) => {
      calls.push(String(url));
      if (String(url).includes('/city_listing_cities')) {
        return new Response(JSON.stringify([{ city_slug: 'porto-alegre-rs', city: 'Porto Alegre', uf: 'RS', offer_count: 1, donation_count: 0, trade_count: 0, total_count: 1 }]), { status: 200 });
      }
      return new Response(JSON.stringify([]), { status: 200 });
    };
    const store = createSupabaseRestStore({ supabaseUrl: 'https://example.supabase.co', supabaseAnonKey: 'anon-key', fetch: fetchMock });
    const { clearPublicationsCache } = await import('../workers/api.mjs');
    clearPublicationsCache();
    const cities = await store.listCityIndex();
    await store.listCityIndex();
    assert.equal(calls.filter((url) => url.includes('city_listing_cities')).length, 1);
    assert.equal(cities[0].counts.offer, 1);

    await store.listCityListings({ citySlug: 'porto-alegre-rs', priceMode: 'trade', cursor: '0001794477600000~bazar-ana~998', limit: 24 });
    const url = new URL(calls.at(-1));
    assert.equal(url.pathname, '/rest/v1/city_listings');
    assert.equal(url.searchParams.get('city_slug'), 'eq.porto-alegre-rs');
    assert.equal(url.searchParams.get('price_mode'), 'eq.trade');
    assert.equal(url.searchParams.get('sort_key'), 'lt.0001794477600000~bazar-ana~998');
    assert.equal(url.searchParams.get('order'), 'sort_key.desc');
    assert.equal(url.searchParams.get('limit'), '25');
    assert.doesNotMatch(url.searchParams.get('select'), /site_id/);
    clearPublicationsCache();
  });

  await t.test('falha no banco vira 503 sem cache', async () => {
    const failing = {
      ...createMemoryStore({ sites: [], drafts: [], memberships: [] }),
      async listCityIndex() { throw new Error('boom'); }
    };
    const api = createApiHandler({ store: failing });
    const res = await api.fetch(new Request('http://localhost/por-cidade'));
    assert.equal(res.status, 503);
    assert.equal(res.headers.get('cache-control'), 'no-store');
  });
});
