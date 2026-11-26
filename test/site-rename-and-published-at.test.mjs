import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';

const origin = 'https://painel.inspira.dev.br';
const ids = {
  owner: '10000000-0000-0000-0000-0000000000d1',
  admin: '10000000-0000-0000-0000-0000000000d2',
  editor: '10000000-0000-0000-0000-0000000000d3',
  viewer: '10000000-0000-0000-0000-0000000000d4',
  stranger: '10000000-0000-0000-0000-0000000000d5'
};
const siteAId = '20000000-0000-0000-0000-0000000000d1';
const siteBId = '20000000-0000-0000-0000-0000000000d2';
const authVerifier = (token) => (token?.startsWith('t-') ? { id: ids[token.slice(2)] ?? null } : null);

const draftFor = (siteId, slug, name) => ({
  siteId,
  revision: 1,
  content: {
    schemaVersion: 1, template: 'pizzeria-v1', slug, businessName: name, whatsapp: '5511999999999', categories: [],
    items: [{ id: 'margherita', name: 'Margherita', priceCents: 4500, active: true, available: true }]
  }
});

function setup() {
  const store = createMemoryStore({
    sites: [
      { id: siteAId, owner_user_id: ids.owner, slug: 'pizza-renomear', name: 'Pizza A', template: 'pizzeria-v1' },
      { id: siteBId, owner_user_id: ids.owner, slug: 'pizza-rascunho', name: 'Pizza B', template: 'pizzeria-v1' }
    ],
    memberships: [
      { site_id: siteAId, user_id: ids.admin, role: 'admin' },
      { site_id: siteAId, user_id: ids.editor, role: 'editor' },
      { site_id: siteAId, user_id: ids.viewer, role: 'viewer' }
    ],
    drafts: [draftFor(siteAId, 'pizza-renomear', 'Pizza A'), draftFor(siteBId, 'pizza-rascunho', 'Pizza B')]
  });
  return { store, api: createApiHandler({ store, authVerifier }) };
}

function call(api, path, { method = 'GET', user, body, headers } = {}) {
  const init = { method, headers: { ...(headers ?? {}) } };
  if (headers === undefined && method !== 'GET') {
    init.headers.origin = origin;
    init.headers['content-type'] = 'application/json';
  }
  if (user) init.headers.authorization = `Bearer t-${user}`;
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return api(new Request(`${origin}${path}`, init));
}

async function expectError(res, status, code) {
  assert.equal(res.status, status);
  const body = await res.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
}

const listSites = async (api, user) => (await (await call(api, '/api/sites', { user })).json()).sites;
const rename = (api, user, body, headers) => call(api, `/api/sites/${siteAId}`, { method: 'PATCH', user, body, headers });

test('publishedAt na lista e em GET /api/sites/:id: nulo no rascunho, data depois de publicar', async () => {
  const { api } = setup();
  assert.deepEqual((await listSites(api, 'owner')).map((site) => [site.id, site.publishedAt]), [[siteAId, null], [siteBId, null]]);

  const published = await call(api, `/api/sites/${siteAId}/publish`, { method: 'POST', user: 'owner' });
  assert.equal(published.status, 200);
  const { publication } = await published.json();
  assert.match(publication.publishedAt, /^\d{4}-\d{2}-\d{2}T/);

  const ownerSites = await listSites(api, 'owner');
  assert.equal(ownerSites.find((site) => site.id === siteAId).publishedAt, publication.publishedAt);
  assert.equal(ownerSites.find((site) => site.id === siteBId).publishedAt, null);
  assert.deepEqual((await listSites(api, 'viewer')).map((site) => [site.id, site.role, site.publishedAt]), [
    [siteAId, 'viewer', publication.publishedAt]
  ]);

  const detail = await call(api, `/api/sites/${siteAId}`, { user: 'editor' });
  assert.equal(detail.status, 200);
  const { site } = await detail.json();
  assert.equal(site.id, siteAId);
  assert.equal(site.role, 'editor');
  assert.equal(site.publishedAt, publication.publishedAt);
  assert.equal((await (await call(api, `/api/sites/${siteBId}`, { user: 'owner' })).json()).site.publishedAt, null);
  await expectError(await call(api, `/api/sites/${siteBId}`, { user: 'editor' }), 404, 'SITE_NOT_FOUND');
  await expectError(await call(api, `/api/sites/${siteAId}`), 401, 'UNAUTHORIZED');
  await expectError(await call(api, '/api/sites/nao-e-uuid', { user: 'owner' }), 404, 'SITE_NOT_FOUND');
});

test('PATCH /api/sites/:id renomeia para proprietário e admin; editor e viewer recebem 403', async () => {
  const { api } = setup();
  await expectError(await rename(api, undefined, { name: 'Nova' }), 401, 'UNAUTHORIZED');
  await expectError(await rename(api, 'owner', { name: 'Nova' }, { 'content-type': 'application/json' }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await rename(api, 'owner', { name: 'Nova' }, { origin: 'https://evil.example', 'content-type': 'application/json' }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await rename(api, 'owner', 'name=Nova', { origin, 'content-type': 'text/plain' }), 415, 'UNSUPPORTED_MEDIA_TYPE');
  await expectError(await rename(api, 'owner', '{nao json'), 400, 'INVALID_JSON');
  await expectError(await rename(api, 'owner', ['Nova']), 400, 'INVALID_PAYLOAD');
  for (const body of [{}, { name: '' }, { name: '   ' }, { name: 42 }, { name: 'x'.repeat(161) }, { name: '<script>alert(1)</script>' }]) {
    await expectError(await rename(api, 'owner', body), 400, 'INVALID_NAME');
  }
  await expectError(await call(api, `/api/sites/${siteAId}`, { method: 'DELETE', user: 'owner' }), 405, 'METHOD_NOT_ALLOWED');

  for (const user of ['editor', 'viewer']) {
    await expectError(await rename(api, user, { name: 'Equipe' }), 403, 'FORBIDDEN');
  }
  await expectError(await rename(api, 'stranger', { name: 'Intruso' }), 404, 'SITE_NOT_FOUND');
  assert.equal((await listSites(api, 'owner')).find((site) => site.id === siteAId).name, 'Pizza A');

  const byOwner = await rename(api, 'owner', { name: '  Pizzaria da Praça  ' });
  assert.equal(byOwner.status, 200);
  assert.equal(byOwner.headers.get('cache-control'), 'no-store');
  const { site } = await byOwner.json();
  assert.deepEqual([site.id, site.name, site.role, site.slug], [siteAId, 'Pizzaria da Praça', 'owner', 'pizza-renomear']);

  const byAdmin = await rename(api, 'admin', { name: 'Pizzaria do Admin' });
  assert.equal(byAdmin.status, 200);
  assert.equal((await byAdmin.json()).site.role, 'admin');
  assert.equal((await listSites(api, 'viewer')).find((entry) => entry.id === siteAId).name, 'Pizzaria do Admin');
});

test('caminho Supabase: lista embute publications(published_at) e o PATCH usa o JWT da pessoa', async () => {
  const env = { SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_teste' };
  const calls = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const row = {
    id: siteAId, owner_user_id: ids.owner, slug: 'pizza-renomear', name: 'Pizza A', template: 'pizzeria-v1',
    created_at: '2026-11-11T00:00:00Z', updated_at: '2026-11-12T00:00:00Z', paused_at: null, archived_at: null,
    site_memberships: [{ user_id: ids.admin, role: 'admin' }, { user_id: ids.viewer, role: 'viewer' }]
  };
  let patchResponse = (init) => json(200, [{ ...row, name: JSON.parse(init.body).name, updated_at: '2026-11-26T12:00:00Z' }]);
  const fetchMock = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, search: decodeURIComponent(url.search), method: init.method ?? 'GET', auth: init.headers?.authorization, body: init.body });
    if (url.pathname === '/rest/v1/publications') return json(200, [{ published_at: '2026-11-20T15:00:00Z' }]);
    if (url.pathname !== '/rest/v1/sites') return json(404, { message: 'não simulado' });
    if (init.method === 'PATCH') return patchResponse(init);
    if (url.searchParams.has('id')) return json(200, [row]);
    return json(200, [
      { ...row, publications: { published_at: '2026-11-20T15:00:00Z' } },
      { ...row, id: siteBId, slug: 'pizza-rascunho', name: 'Pizza B', publications: null },
      { ...row, id: '20000000-0000-0000-0000-0000000000d3', slug: 'pizza-c', name: 'Pizza C', publications: [{ published_at: '2026-11-21T15:00:00Z' }] }
    ]);
  };
  const api = createApiHandler({ fetch: fetchMock, authVerifier });
  const send = (path, options) => call((request) => api(request, env), path, options);

  const sites = (await (await send('/api/sites', { user: 'owner' })).json()).sites;
  assert.deepEqual(sites.map((site) => site.publishedAt), ['2026-11-20T15:00:00Z', null, '2026-11-21T15:00:00Z']);
  assert.ok(sites.every((site) => !('publications' in site)));
  assert.match(calls.find((entry) => entry.path === '/rest/v1/sites').search, /publications\(published_at\)/);

  const detail = await (await send(`/api/sites/${siteAId}`, { user: 'viewer' })).json();
  assert.equal(detail.site.publishedAt, '2026-11-20T15:00:00Z');
  assert.equal(detail.site.role, 'viewer');

  calls.length = 0;
  const renamed = await send(`/api/sites/${siteAId}`, { method: 'PATCH', user: 'admin', body: { name: ' Pizzaria Nova ' } });
  assert.equal(renamed.status, 200);
  const { site } = await renamed.json();
  assert.deepEqual([site.name, site.role, site.updatedAt], ['Pizzaria Nova', 'admin', '2026-11-26T12:00:00Z']);
  const patch = calls.find((entry) => entry.method === 'PATCH');
  assert.equal(patch.auth, 'Bearer t-admin');
  assert.match(patch.search, new RegExp(`id=eq\\.${siteAId}`));
  assert.deepEqual(JSON.parse(patch.body), { name: 'Pizzaria Nova' });

  calls.length = 0;
  await expectError(await send(`/api/sites/${siteAId}`, { method: 'PATCH', user: 'viewer', body: { name: 'Leitura' } }), 403, 'FORBIDDEN');
  assert.equal(calls.filter((entry) => entry.method === 'PATCH').length, 0);

  patchResponse = () => json(200, []);
  await expectError(await send(`/api/sites/${siteAId}`, { method: 'PATCH', user: 'owner', body: { name: 'Nova' } }), 404, 'SITE_NOT_FOUND');
  patchResponse = () => json(400, { code: '23514', message: 'check violation' });
  await expectError(await send(`/api/sites/${siteAId}`, { method: 'PATCH', user: 'owner', body: { name: 'Nova' } }), 400, 'INVALID_NAME');
});
