import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, createMemoryStore, createSupabaseRestStore } from '../workers/api.mjs';
import { assertNoPrivateLeakage, compilePublicStorefront } from '../src/publication-engine.mjs';
import { whatsappLink } from '../src/public-menu.mjs';
import {
  VITRINE_JSON_CACHE_CONTROL,
  buildVitrineJson,
  forgetVitrineJsonState,
  vitrineJsonPublicationOptions
} from '../src/vitrine-json.mjs';
import { normalizeEntitlements } from '../src/entitlements.mjs';
import { MILA_WHATSAPP } from '../web/assets/mila-relay.mjs';

const ORIGIN = 'https://vitrine.inspira.dev.br';
const SITE_A = '20000000-0000-0000-0000-000000000001';
const SITE_B = '20000000-0000-0000-0000-000000000002';
const OWNER_PHONE = '5511912345678';
const HOST = 'pizza.exemplo.com.br';

function harness({ plans = { [SITE_A]: 'profissional' } } = {}) {
  const store = createMemoryStore();
  const calls = { entitlements: 0, publication: 0 };
  store.getSiteEntitlements = async (siteId) => {
    calls.entitlements += 1;
    return { plan_code: plans[siteId] ?? 'free' };
  };
  const getPublication = store.getPublicationBySlug.bind(store);
  store.getPublicationBySlug = async (slug) => {
    calls.publication += 1;
    return getPublication(slug);
  };
  const api = createApiHandler({ store });
  const send = (path, { method = 'GET', payload, headers = {}, host = ORIGIN, env = {} } = {}) =>
    api(new Request(host + path, {
      method,
      headers: {
        authorization: 'Bearer token-owner',
        origin: host,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
    }), env, { waitUntil() {} });
  const publicGet = (path, { method = 'GET', headers = {}, host = ORIGIN, env = {} } = {}) =>
    api(new Request(host + path, { method, headers }), env, { waitUntil() {} });
  const editDraft = async (siteId, change) => {
    const { draft } = await (await send(`/api/sites/${siteId}/draft`)).json();
    change(draft.content);
    const saved = await send(`/api/sites/${siteId}/draft`, { method: 'PUT', payload: draft });
    assert.equal(saved.status, 200);
  };
  const publish = async (siteId = SITE_A) => {
    const response = await send(`/api/sites/${siteId}/publish`, { method: 'POST' });
    assert.equal(response.status, 200);
    return (await response.json()).publication;
  };
  return { api, store, plans, calls, send, publicGet, editDraft, publish };
}

function withFakeEdgeCache(t) {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const entries = new Map();
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    value: {
      default: {
        match: async (key) => entries.get(key.url)?.clone(),
        put: async (key, response) => { entries.set(key.url, response.clone()); },
        delete: async (key) => entries.delete(typeof key === 'string' ? key : key.url)
      }
    }
  });
  t.after(() => {
    if (original) Object.defineProperty(globalThis, 'caches', original);
    else delete globalThis.caches;
  });
  return entries;
}

test('Issue #120 — vitrine Profissional responde 200 com o contrato schemaVersion 1', async (t) => {
  const h = harness();
  t.after(() => forgetVitrineJsonState('pizza-a'));
  await h.editDraft(SITE_A, (content) => {
    content.messages = { welcomeText: 'Pizza no forno a lenha.' };
    content.businessHours = { week: { mon: [{ opens: '18:00', closes: '23:00' }] } };
    content.publicAddress = { street: 'Rua Augusta, 1500', district: 'Consolação', city: 'São Paulo', uf: 'SP' };
  });
  const publication = await h.publish();
  assert.deepEqual(publication.menu.features, { publicJson: true });

  const response = await h.publicGet('/pizza-a/vitrine.json');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'application/json; charset=utf-8');
  assert.equal(response.headers.get('cache-control'), VITRINE_JSON_CACHE_CONTROL);
  assert.equal(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('etag'), `W/"${publication.hash}"`);
  const body = await response.json();
  assert.equal(body.schemaVersion, 1);
  assert.equal(body.slug, 'pizza-a');
  assert.equal(body.name, 'Pizza A');
  assert.equal(body.url, `${ORIGIN}/pizza-a`);
  assert.equal(body.description, 'Pizza no forno a lenha.');
  assert.equal(body.updatedAt, publication.publishedAt);
  assert.equal(body.whatsapp.number, '5511999999999');
  assert.equal(body.whatsapp.via, 'direct');
  assert.match(body.whatsapp.url, /^https:\/\/wa\.me\/5511999999999\?text=/);
  assert.equal(body.address.city, 'São Paulo');
  assert.match(body.address.routeUrl, /^https:\/\/www\.google\.com\/maps\/dir\//);
  assert.deepEqual(body.businessHours.week.mon, [{ opens: '18:00', closes: '23:00' }]);
  assert.equal(typeof body.openNow.open, 'boolean');
  assert.ok(Date.parse(body.openNow.computedAt));
  assert.deepEqual(body.items.map(({ id, name, priceCents }) => ({ id, name, priceCents })), [
    { id: 'margherita', name: 'Margherita', priceCents: 4500 }
  ]);
  assert.equal(body.items[0].url, whatsappLink(publication.menu, 'margherita'));
  for (const forbidden of ['siteId', 'site_id', 'owner_user_id', 'features', 'plan', 'planCode', 'entitlements', 'hash']) {
    assert.equal(JSON.stringify(body).includes(`"${forbidden}"`), false, `sem ${forbidden}`);
  }
});

test('Issue #120 — vitrine free e vitrine suspensa respondem 404 com cache curto', async (t) => {
  const h = harness({ plans: { [SITE_A]: 'free' } });
  t.after(() => forgetVitrineJsonState('pizza-a'));
  const freePublication = await h.publish();
  assert.equal(freePublication.menu.features, undefined, 'sem o recurso o snapshot não ganha o indicador');
  const free = await h.publicGet('/pizza-a/vitrine.json');
  assert.equal(free.status, 404);
  assert.equal(free.headers.get('cache-control'), 'public, max-age=60');
  assert.equal(free.headers.get('access-control-allow-origin'), '*');
  assert.equal(h.calls.entitlements, 1, 'só a publicação leu os direitos; a rota decidiu pelo snapshot');

  h.plans[SITE_A] = 'profissional';
  await h.publish();
  forgetVitrineJsonState('pizza-a');
  assert.equal((await h.publicGet('/pizza-a/vitrine.json')).status, 200);

  h.plans[SITE_A] = 'free';
  forgetVitrineJsonState('pizza-a');
  const suspended = await h.publicGet('/pizza-a/vitrine.json');
  assert.equal(suspended.status, 404, 'suspensa: o snapshot ainda tem o indicador, mas o direito caiu');
  assert.equal(suspended.headers.get('cache-control'), 'public, max-age=60');

  assert.equal((await h.publicGet('/pizza-b/vitrine.json')).status, 404, 'sem publicação');
  assert.equal((await h.publicGet('/nao-existe/vitrine.json')).status, 404);
});

test('Issue #120 — com o modo Mila o telefone do dono não aparece no JSON', async (t) => {
  const h = harness();
  t.after(() => forgetVitrineJsonState('pizza-a'));
  await h.editDraft(SITE_A, (content) => {
    content.whatsapp = OWNER_PHONE;
    content.orderRelay = 'mila';
  });
  await h.publish();
  const response = await h.publicGet('/pizza-a/vitrine.json');
  assert.equal(response.status, 200);
  const text = await response.text();
  assert.equal(text.includes(OWNER_PHONE), false);
  const body = JSON.parse(text);
  assert.equal(body.whatsapp.number, MILA_WHATSAPP);
  assert.equal(body.whatsapp.via, 'mila');
  assert.match(decodeURIComponent(body.items[0].url), /#VI-/);
});

test('Issue #120 — itens ocultos e rascunhos não publicados não aparecem', async (t) => {
  const h = harness();
  t.after(() => forgetVitrineJsonState('pizza-a'));
  await h.editDraft(SITE_A, (content) => {
    content.items.push({ id: 'oculta', name: 'Pizza oculta', priceCents: 100, active: false });
  });
  await h.publish();
  await h.editDraft(SITE_A, (content) => {
    content.items.push({ id: 'rascunho', name: 'Pizza do rascunho', priceCents: 200, active: true });
  });
  const text = await (await h.publicGet('/pizza-a/vitrine.json')).text();
  assert.equal(text.includes('Pizza oculta'), false);
  assert.equal(text.includes('Pizza do rascunho'), false);
  assert.deepEqual(JSON.parse(text).items.map((item) => item.id), ['margherita']);
});

test('Issue #120 — If-None-Match responde 304, HEAD sem corpo, POST 405', async (t) => {
  const h = harness();
  t.after(() => forgetVitrineJsonState('pizza-a'));
  const publication = await h.publish();
  const etag = `W/"${publication.hash}"`;
  for (const candidate of [etag, `"${publication.hash}"`, `"outro", ${etag}`]) {
    const notModified = await h.publicGet('/pizza-a/vitrine.json', { headers: { 'if-none-match': candidate } });
    assert.equal(notModified.status, 304, candidate);
    assert.equal(await notModified.text(), '');
    assert.equal(notModified.headers.get('etag'), etag);
  }
  assert.equal((await h.publicGet('/pizza-a/vitrine.json', { headers: { 'if-none-match': '"antigo"' } })).status, 200);

  const head = await h.publicGet('/pizza-a/vitrine.json', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');

  for (const method of ['POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const refused = await h.publicGet('/pizza-a/vitrine.json', { method });
    assert.equal(refused.status, 405, method);
    assert.equal(refused.headers.get('allow'), 'GET, HEAD');
  }
});

test('Issue #120 — CORS aberto só nesta rota', async (t) => {
  const h = harness();
  t.after(() => forgetVitrineJsonState('pizza-a'));
  const publication = await h.publish();
  assert.equal((await h.publicGet('/pizza-a/vitrine.json')).headers.get('access-control-allow-origin'), '*');
  for (const path of [
    '/pizza-a',
    '/data/vitrines/pizza-a/menu.json',
    `/data/vitrines/pizza-a/releases/${publication.hash}.json`,
    '/cidade/sao-paulo-sp.json',
    '/api/sites'
  ]) {
    const response = await h.publicGet(path);
    assert.equal(response.headers.get('access-control-allow-origin'), null, path);
  }
});

test('Issue #120 — vitrine pausada segue a #144 (503 SHOWCASE_PAUSED)', async (t) => {
  const h = harness();
  t.after(() => forgetVitrineJsonState('pizza-a'));
  await h.publish();
  assert.equal((await h.publicGet('/pizza-a/vitrine.json')).status, 200);
  assert.equal((await h.send(`/api/sites/${SITE_A}/lifecycle`, { method: 'POST', payload: { action: 'pause' } })).status, 200);
  const paused = await h.publicGet('/pizza-a/vitrine.json');
  assert.equal(paused.status, 503);
  assert.equal((await paused.json()).error.code, 'SHOWCASE_PAUSED');
  assert.equal(paused.headers.get('access-control-allow-origin'), '*');
  assert.equal((await h.send(`/api/sites/${SITE_A}/lifecycle`, { method: 'POST', payload: { action: 'resume' } })).status, 200);
  assert.equal((await h.publicGet('/pizza-a/vitrine.json')).status, 200);
});

test('Issue #120 — no domínio próprio, /vitrine.json; suspenso, 404', async (t) => {
  const h = harness();
  t.after(() => forgetVitrineJsonState('pizza-a'));
  await h.publish();
  let canonical = true;
  h.store.resolveDomainRoute = async (hostname) => (hostname === HOST ? { slug: 'pizza-a', canonical } : null);
  const env = { CF_SAAS_CNAME_TARGET: 'saas.inspira.dev.br' };
  const ok = await h.publicGet('/vitrine.json', { host: `https://${HOST}`, env });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('access-control-allow-origin'), '*');
  assert.equal((await ok.json()).slug, 'pizza-a');
  assert.equal((await h.publicGet('/vitrine.json', { host: `https://${HOST}`, env, method: 'POST' })).status, 405);
  assert.equal((await h.publicGet('/vitrine.json', { host: 'https://outro.exemplo.com', env })).status, 404);
  assert.equal((await h.publicGet('/', { host: `https://${HOST}`, env })).headers.get('access-control-allow-origin'), null);

  canonical = false;
  const suspended = await h.publicGet('/vitrine.json', { host: `https://${HOST}`, env });
  assert.equal(suspended.status, 404);
  assert.equal(suspended.headers.get('cache-control'), 'public, max-age=60');
});

test('Issue #120 — acerto no cache da borda não consulta o banco e é isolado por vitrine', async (t) => {
  const entries = withFakeEdgeCache(t);
  const h = harness({ plans: { [SITE_A]: 'profissional', [SITE_B]: 'free' } });
  t.after(() => { forgetVitrineJsonState('pizza-a'); forgetVitrineJsonState('pizza-b'); });
  const publication = await h.publish(SITE_A);
  await h.editDraft(SITE_B, (content) => {
    content.items = [{ id: 'calabresa', name: 'Calabresa', priceCents: 3900, active: true }];
  });
  await h.publish(SITE_B);

  const first = await h.publicGet('/pizza-a/vitrine.json');
  assert.equal(first.status, 200);
  const before = { ...h.calls };
  const hit = await h.publicGet('/pizza-a/vitrine.json');
  assert.equal(hit.status, 200);
  assert.deepEqual(h.calls, before, 'acerto no cache: nenhuma leitura de publicação ou de direitos');
  const revalidated = await h.publicGet('/pizza-a/vitrine.json', { headers: { 'if-none-match': `W/"${publication.hash}"` } });
  assert.equal(revalidated.status, 304);
  assert.deepEqual(h.calls, before);

  assert.equal((await h.publicGet('/pizza-b/vitrine.json')).status, 404, 'vitrine-b free não herda o cache da vitrine-a');
  assert.ok(entries.has(`${ORIGIN}/pizza-a/vitrine.json`));
  assert.ok(entries.has(`${ORIGIN}/pizza-b/vitrine.json`));
  assert.equal((await h.publicGet('/pizza-a/vitrine.json')).status, 200);

  assert.equal((await h.send(`/api/sites/${SITE_A}/lifecycle`, { method: 'POST', payload: { action: 'pause' } })).status, 200);
  assert.equal(entries.has(`${ORIGIN}/pizza-a/vitrine.json`), false, 'pausar apaga a cópia da borda');
  assert.equal((await h.publicGet('/pizza-a/vitrine.json')).status, 503);
});

test('Issue #120 — snapshot: indicador mínimo e projeção sem dados privados', async () => {
  const content = {
    schemaVersion: 1, template: 'pizzeria-v1', catalogType: 'products', slug: 'pizza-a', businessName: 'Pizza A',
    whatsapp: '5511987654321',
    items: [{ id: 'mussarela', name: 'Mussarela', priceCents: 4500 }],
    structure: {
      pages: [{
        slug: 'home', title: 'Início',
        sections: [{
          id: 'links', moduleCode: 'links_bio',
          config: { links: [
            { label: 'Instagram', href: 'https://instagram.com/pizza-a' },
            { label: 'Seleção', href: '#storefront-catalog' },
            { label: 'Instagram de novo', href: 'https://instagram.com/pizza-a' }
          ] }
        }]
      }]
    }
  };
  const profissional = vitrineJsonPublicationOptions(normalizeEntitlements({ plan_code: 'profissional' }));
  const essencial = vitrineJsonPublicationOptions(normalizeEntitlements({ plan_code: 'essencial' }));
  assert.deepEqual(profissional, { publicJson: true });
  assert.deepEqual(essencial, { publicJson: false });
  const withFlag = await compilePublicStorefront(content, { slug: 'pizza-a' }, profissional);
  const without = await compilePublicStorefront(content, { slug: 'pizza-a' }, essencial);
  assert.deepEqual(withFlag.menu.features, { publicJson: true });
  assert.equal('features' in without.menu, false);

  for (const features of [{ publicJson: false }, { publicJson: true, plan: 'profissional' }, ['publicJson'], 'sim']) {
    assert.throws(() => assertNoPrivateLeakage({ ...without.menu, features }), /features inválido/);
  }

  const body = buildVitrineJson(withFlag.publication, { now: new Date('2026-11-16T12:00:00Z') });
  assert.deepEqual(body.links, [{ label: 'Instagram', url: 'https://instagram.com/pizza-a' }]);
  assert.equal(body.openNow, null, 'sem horário cadastrado, sem "aberto agora"');
  assert.equal(body.address, null);
  assert.equal(body.description, withFlag.menu.messages.welcomeText);
});

test('Issue #120 — "aberto agora" é calculado no momento da resposta', async () => {
  const content = {
    schemaVersion: 1, template: 'pizzeria-v1', catalogType: 'products', slug: 'pizza-a', businessName: 'Pizza A',
    whatsapp: '5511987654321', items: [{ id: 'mussarela', name: 'Mussarela', priceCents: 4500 }],
    businessHours: { week: { mon: [{ opens: '18:00', closes: '23:00' }] } }
  };
  const { publication } = await compilePublicStorefront(content, { slug: 'pizza-a' }, { publicJson: true });
  // 2026-11-16 é segunda-feira; 22:00 UTC = 19:00 em São Paulo.
  const open = buildVitrineJson(publication, { now: new Date('2026-11-16T22:00:00Z') }).openNow;
  assert.equal(open.open, true);
  assert.equal(open.closesAt, '23:00');
  assert.equal(open.computedAt, '2026-11-16T22:00:00.000Z');
  const closed = buildVitrineJson(publication, { now: new Date('2026-11-17T15:00:00Z') }).openNow;
  assert.equal(closed.open, false);
  assert.equal(closed.opensAt, '18:00');
});

test('Issue #120 — PostgREST: public_json_enabled com a chave anônima', async () => {
  const requests = [];
  const store = createSupabaseRestStore({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'anon-ficticia',
    fetch: async (url, init) => {
      requests.push({ url: String(url), init });
      const body = JSON.parse(init.body);
      if (body.target_slug === 'sem-migracao') return new Response(null, { status: 404 });
      if (body.target_slug === 'quebrada') return new Response(null, { status: 500 });
      return Response.json(body.target_slug === 'pizza-a');
    }
  });
  assert.equal(await store.isPublicJsonEnabled('pizza-a'), true);
  assert.equal(await store.isPublicJsonEnabled('pizza-b'), false);
  assert.equal(await store.isPublicJsonEnabled('sem-migracao'), false);
  await assert.rejects(store.isPublicJsonEnabled('quebrada'));
  assert.equal(requests[0].url, 'https://example.supabase.co/rest/v1/rpc/public_json_enabled');
  assert.equal(requests[0].init.method, 'POST');
  assert.equal(requests[0].init.headers.apikey, 'anon-ficticia');
});
