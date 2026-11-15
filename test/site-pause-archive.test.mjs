import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../workers/api.mjs';
import {
  PLAN_SITE_COUNT_CRITERION,
  countPlanSites,
  createRestSiteLifecycle,
  describeLifecycleDialogs,
  lifecyclePermissions,
  pausedShowcaseResponse,
  storefrontCacheUrls
} from '../src/site-lifecycle.mjs';

const siteId = '20000000-0000-0000-0000-000000000001';
const memberId = '10000000-0000-0000-0000-000000000002';
const origin = 'https://vitrine.test';

function harness(env = {}, apiOrigin = origin) {
  const api = createApiHandler();
  const send = (path, { method = 'GET', payload, token = 'token-owner', host = apiOrigin, ctx } = {}) =>
    api(new Request(host + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        origin: host,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {})
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
    }), env, ctx);
  const act = (action, extra = {}) => send(`/api/sites/${siteId}/lifecycle`, {
    method: 'POST', payload: { action, ...extra.payload }, token: extra.token ?? 'token-owner'
  });
  const setMemberRole = (role) => {
    api.store.memberships.find(entry => entry.userId === memberId).role = role;
  };
  return { api, send, act, setMemberRole };
}

test('Issue #126 — pausar e retomar pelo Worker', async () => {
  const { api, send, act, setMemberRole } = harness();
  assert.equal((await send(`/api/sites/${siteId}/publish`, { method: 'POST' })).status, 200);
  const live = await send('/pizza-a');
  assert.equal(live.status, 200);
  const hashBefore = live.headers.get('etag');
  const draftRevision = (await (await send(`/api/sites/${siteId}/draft`)).json()).draft.revision;
  const releasesBefore = (await (await send(`/api/sites/${siteId}/releases`)).json()).releases;

  for (const role of ['editor', 'viewer']) {
    setMemberRole(role);
    const view = await (await send(`/api/sites/${siteId}/lifecycle`, { token: 'token-member' })).json();
    assert.equal(view.lifecycle.permissions.canPause, false, `${role} não vê Pausar`);
    assert.equal(view.lifecycle.permissions.canArchive, false, `${role} não vê Arquivar`);
    assert.equal((await act('pause', { token: 'token-member' })).status, 403);
    assert.equal((await act('archive', { token: 'token-member' })).status, 403);
  }
  assert.equal((await act('pause', { token: 'token-stranger' })).status, 404);

  setMemberRole('admin');
  const pause = await act('pause', { token: 'token-member' });
  assert.equal(pause.status, 200);
  const paused = (await pause.json()).lifecycle;
  assert.equal(paused.state.paused, true);
  assert.equal(paused.permissions.canResume, true);
  assert.equal(paused.permissions.canArchive, false, 'admin não arquiva');
  assert.equal((await act('pause')).status, 409);

  const page = await send('/pizza-a');
  assert.equal(page.status, 503);
  assert.equal(page.headers.get('x-robots-tag'), 'noindex');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const html = await page.text();
  assert.match(html, /Esta vitrine está pausada/);
  assert.doesNotMatch(html, /Pizza A|Margherita|5511999999999|wa\.me/);
  for (const path of ['/data/vitrines/pizza-a/menu.json', `/data/vitrines/pizza-a/releases/${hashBefore.replaceAll('"', '')}.json`]) {
    const response = await send(path);
    assert.equal(response.status, 503, path);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex');
    assert.equal((await response.json()).error.code, 'SHOWCASE_PAUSED');
  }
  assert.equal((await send('/pizza-a', { method: 'HEAD' })).status, 503);

  const publishWhilePaused = await send(`/api/sites/${siteId}/publish`, { method: 'POST' });
  assert.equal(publishWhilePaused.status, 409);
  assert.equal((await publishWhilePaused.json()).error.code, 'SITE_PAUSED');
  assert.equal((await (await send(`/api/sites/${siteId}/draft`)).json()).draft.revision, draftRevision);
  assert.deepEqual((await (await send(`/api/sites/${siteId}/releases`)).json()).releases, releasesBefore);

  assert.equal((await act('resume', { token: 'token-member' })).status, 200);
  const back = await send('/pizza-a');
  assert.equal(back.status, 200);
  assert.equal(back.headers.get('etag'), hashBefore, 'Retomar serve o mesmo artifact_hash');

  const { logs } = await (await send(`/api/sites/${siteId}/audit-logs`)).json();
  const actions = logs.filter(entry => entry.entityType === 'site').map(entry => entry.action);
  assert.deepEqual(actions, ['resume', 'pause']);
  assert.equal(logs.find(entry => entry.action === 'pause').summary.artifactHash, hashBefore.replaceAll('"', ''));
});

test('Issue #126 — arquivar, filtro, restaurar e excluir digitando o endereço', async () => {
  const { send, act, setMemberRole } = harness();
  await send(`/api/sites/${siteId}/publish`, { method: 'POST' });
  const sitesBefore = (await (await send('/api/sites')).json()).sites;
  assert.equal(countPlanSites(sitesBefore), 2);

  setMemberRole('admin');
  assert.equal((await act('archive', { token: 'token-member' })).status, 403);
  assert.equal((await act('delete', { payload: { confirmSlug: 'pizza-a' } })).status, 409, 'excluir exige arquivada');

  const archived = await act('archive');
  assert.equal(archived.status, 200);
  const { lifecycle } = await archived.json();
  assert.equal(lifecycle.state.archived, true);
  assert.equal(lifecycle.state.paused, true);
  assert.equal(lifecycle.permissions.canDelete, true);
  assert.equal(lifecycle.dialogs.delete.requiresSlug, 'pizza-a');
  const days = (Date.parse(lifecycle.state.restorableUntil) - Date.parse(lifecycle.state.archivedAt)) / 86_400_000;
  assert.equal(days, 90);
  assert.equal((await send('/pizza-a')).status, 503);
  assert.equal((await act('resume')).status, 409, 'arquivada só volta restaurando');

  const sitesArchived = (await (await send('/api/sites')).json()).sites;
  assert.ok(sitesArchived.find(site => site.id === siteId).archivedAt);
  assert.equal(countPlanSites(sitesArchived), 1, 'arquivada não ocupa vaga do plano');

  assert.equal((await act('restore')).status, 200);
  assert.equal((await send('/pizza-a')).status, 503, 'restaurada continua pausada');
  assert.equal((await act('archive')).status, 200);

  const mismatch = await act('delete', { payload: { confirmSlug: 'pizza' } });
  assert.equal(mismatch.status, 422);
  assert.equal((await mismatch.json()).error.code, 'CONFIRMATION_MISMATCH');
  assert.equal((await act('delete', { payload: { confirmSlug: 'pizza-a' }, token: 'token-member' })).status, 403);
  const deleted = await act('delete', { payload: { confirmSlug: 'pizza-a' } });
  assert.equal(deleted.status, 200);
  assert.deepEqual(await deleted.json(), { deleted: true, slug: 'pizza-a' });
  assert.equal((await send(`/api/sites/${siteId}/lifecycle`)).status, 404);
  assert.equal((await send('/pizza-a')).status, 404);
  assert.equal((await (await send('/api/sites')).json()).sites.length, 1);
});

test('Issue #126 — ações exigem mesma origem, JSON e ação válida', async () => {
  const { api, send } = harness();
  const crossOrigin = await api(new Request(`${origin}/api/sites/${siteId}/lifecycle`, {
    method: 'POST',
    headers: { authorization: 'Bearer token-owner', 'content-type': 'application/json', origin: 'https://outro.test' },
    body: JSON.stringify({ action: 'pause' })
  }));
  assert.equal(crossOrigin.status, 403);
  assert.equal((await send(`/api/sites/${siteId}/lifecycle`, { method: 'POST', payload: { action: 'apagar' } })).status, 422);
  assert.equal((await send(`/api/sites/${siteId}/lifecycle`, { token: '' })).status, 401);
});

test('Issue #126 — domínio próprio não fica preso no cache depois da pausa', async () => {
  const entries = new Map();
  const previous = globalThis.caches;
  globalThis.caches = {
    default: {
      async match(request) { return entries.get(typeof request === 'string' ? request : request.url)?.clone(); },
      async put(request, response) { entries.set(typeof request === 'string' ? request : request.url, response.clone()); },
      async delete(request) { return entries.delete(typeof request === 'string' ? request : request.url); }
    }
  };
  try {
    const env = { CF_SAAS_CNAME_TARGET: 'vitrine.inspira.dev.br' };
    const { api, send, act } = harness(env, 'https://painel.inspira.dev.br');
    api.store.resolveDomain = async () => 'pizza-a';
    await send(`/api/sites/${siteId}/publish`, { method: 'POST' });
    const host = 'https://loja.exemplo.com.br';
    assert.equal((await send('/', { host })).status, 200);
    assert.ok(entries.has(`${host}/pizza-a`));

    const stale = entries.get(`${host}/pizza-a`);
    const headers = new Headers(stale.headers);
    headers.set('x-vitrine-cached-at', String(Date.now() - 301_000));
    entries.set(`${host}/pizza-a`, new Response(await stale.text(), { headers }));

    assert.equal((await act('pause')).status, 200);
    const pending = [];
    const servedStale = await send('/', { host, ctx: { waitUntil: promise => pending.push(promise) } });
    assert.equal(servedStale.status, 200);
    await Promise.all(pending);
    assert.equal(entries.has(`${host}/pizza-a`), false, 'resposta 503 remove a cópia antiga');
    const fresh = await send('/', { host });
    assert.equal(fresh.status, 503);
    assert.equal(fresh.headers.get('x-robots-tag'), 'noindex');
  } finally {
    globalThis.caches = previous;
  }
});

test('Issue #126 — regras puras, diálogos e adaptador REST', async () => {
  assert.equal(PLAN_SITE_COUNT_CRITERION, 'archived_at is null');
  assert.deepEqual(lifecyclePermissions('editor', {}), {
    canPause: false, canResume: false, canArchive: false, canRestore: false, canDelete: false
  });
  assert.equal(lifecyclePermissions('admin', {}).canPause, true);
  assert.equal(lifecyclePermissions('owner', { pausedAt: 'x', archivedAt: 'x' }).canResume, false);

  const dialogs = describeLifecycleDialogs('loja-ana', {
    publication: { revision: 3, itemCount: 12 }, releaseCount: 4, memberCount: 2,
    domains: [{ id: 'd1', hostname: 'loja.exemplo.com.br', status: 'active' }]
  });
  assert.ok(dialogs.pause.items.some(item => item.includes('versão 3, com 12 itens')));
  assert.ok(dialogs.pause.items.some(item => item.includes('loja.exemplo.com.br')));
  assert.match(dialogs.domains[0].message, /continua em vitrine\.inspira\.dev\.br\/loja-ana.*quarentena/);
  assert.match(dialogs.delete.blockedReason, /loja\.exemplo\.com\.br/);
  for (const dialog of [dialogs.pause, dialogs.resume, dialogs.archive, dialogs.restore, dialogs.delete, ...dialogs.domains]) {
    const text = [dialog.title, dialog.message, ...dialog.items].join(' ');
    assert.doesNotMatch(text, /cat[aá]logo|card[aá]pio/i);
  }

  assert.deepEqual(storefrontCacheUrls('loja', ['https://vitrine.inspira.dev.br/'], ['loja.com.br']), [
    'https://vitrine.inspira.dev.br/loja', 'https://vitrine.inspira.dev.br/loja/',
    'https://vitrine.inspira.dev.br/data/vitrines/loja/menu.json', 'https://vitrine.inspira.dev.br/loja/vitrine.json',
    'https://loja.com.br/loja', 'https://loja.com.br/loja/', 'https://loja.com.br/data/vitrines/loja/menu.json',
    'https://loja.com.br/loja/vitrine.json'
  ]);

  const page = pausedShowcaseResponse('GET');
  assert.equal(page.status, 503);
  assert.match(page.headers.get('content-security-policy'), /default-src 'none'/);
  assert.doesNotMatch(await page.text(), /<script/i);

  const calls = [];
  const rest = createRestSiteLifecycle({
    baseUrl: 'https://db.test',
    fetchImpl: async (url, init = {}) => {
      calls.push({ url: String(url), body: init.body });
      if (String(url).includes('pause_site')) {
        return new Response(JSON.stringify({ message: 'FORBIDDEN_SITE_ROLE' }), { status: 403 });
      }
      if (String(url).includes('public_site_state')) return new Response('"paused"');
      return new Response('true');
    },
    authHeaders: () => ({}),
    anonHeaders: () => ({})
  });
  await assert.rejects(rest.changeSiteLifecycle(siteId, 'pause', {}, { token: 't' }), error => error.status === 403);
  assert.equal(await rest.getPublicSiteState('loja'), 'paused');
  await rest.changeSiteLifecycle(siteId, 'delete', { confirmSlug: 'loja' }, { token: 't' });
  assert.deepEqual(JSON.parse(calls.at(-1).body), { target_site: siteId, confirm_slug: 'loja' });
});

test('Issue #126 — painel usa o diálogo padronizado e o filtro "Arquivadas"', async () => {
  const { readFile } = await import('node:fs/promises');
  const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
  const [html, portal, editor, ui] = await Promise.all([
    read('web/portal/index.html'), read('web/portal/portal.js'), read('web/portal/editor.js'), read('web/portal/site-lifecycle.js')
  ]);
  assert.match(html, /href="\.\/site-lifecycle\.css"/);
  assert.match(portal, /decorateSiteItem\(site, info, actions/);
  assert.match(portal, /createSiteViewFilter\(sites, renderSites\)/);
  assert.match(editor, /await confirmDomainDisconnect\(site, domain\)/);
  assert.doesNotMatch(editor, /window\.confirm\(`Desvincular/);
  assert.match(ui, /archived: 'Arquivadas'/);
  assert.match(ui, /aria-pressed/);
  assert.doesNotMatch(ui, /cat[aá]logo|card[aá]pio/i);
});
