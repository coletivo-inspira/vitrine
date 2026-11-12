import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  LIKE_VISITOR_COOKIE_NAME,
  clearPublicationsCache,
  createApiHandler,
  createSupabaseRestStore
} from '../workers/api.mjs';
import {
  ITEM_LIKE_LIMITS,
  computeStorefrontInsights,
  resolveInsightsPeriodStart,
  validateItemLikePayload
} from '../src/portal-validation.mjs';
import { renderStorefrontHtml } from '../src/publication-engine.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { createStorefrontLikesClient } from '../web/vitrine/vitrine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const migrationsDir = resolve(root, 'supabase/migrations');

const OWNER = '10000000-0000-0000-0000-000000000001';
const MEMBER = '10000000-0000-0000-0000-000000000002';
const STRANGER = '10000000-0000-0000-0000-000000000003';
const SITE_A = '20000000-0000-0000-0000-000000000001';
const SITE_B = '20000000-0000-0000-0000-000000000002';
const PUBLIC_ORIGIN = 'https://vitrine.inspira.dev.br';
const BROWSER_UA = 'Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/128.0';

const visitorKey = (n) => createHash('sha256').update(`visitante-${n}`).digest('hex');

async function setupDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    await db.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [OWNER, MEMBER, STRANGER]);
  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'pizzaria-a', 'Pizzaria A', 'food', 'products-v1')",
    [SITE_A, OWNER]
  );
  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'loja-b', 'Loja B', 'art', 'products-v1')",
    [SITE_B, STRANGER]
  );
  await db.query('insert into public.site_memberships (site_id, user_id) values ($1, $2)', [SITE_A, MEMBER]);
  const menu = {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    slug: 'pizzaria-a',
    name: 'Pizzaria A',
    whatsapp: '5551999999999',
    currency: 'BRL',
    items: [
      { id: 'margherita', name: 'Margherita', priceCents: 4800 },
      { id: 'refrigerante', name: 'Refrigerante', priceCents: 700 }
    ]
  };
  await db.query(
    `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu)
     values ($1, 'pizzaria-a', 1, 'active', $2, $3::jsonb)`,
    [SITE_A, 'a'.repeat(64), JSON.stringify(menu)]
  );
  return db;
}

async function asRole(db, role, userId, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

const setLike = (db, item, key, liked = true, slug = 'pizzaria-a') =>
  asRole(db, 'anon', null, async () =>
    (await db.query('select public.set_item_like($1, $2, $3, $4) as r', [slug, item, key, liked])).rows[0].r
  );

test('Spec 011 - banco: unicidade por visitante, tetos por hora e isolamento por vitrine', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());

  assert.deepEqual(await setLike(db, 'margherita', visitorKey(1)), { itemId: 'margherita', liked: true, count: 1 });
  assert.equal((await setLike(db, 'margherita', visitorKey(1))).count, 1, 'repetir curtir não soma');
  await Promise.all([setLike(db, 'margherita', visitorKey(1)), setLike(db, 'margherita', visitorKey(1))]);
  assert.equal((await setLike(db, 'margherita', visitorKey(2))).count, 2);

  const publicView = await asRole(db, 'anon', null, async () =>
    (await db.query('select public.get_item_likes($1, $2) as r', ['pizzaria-a', visitorKey(2)])).rows[0].r
  );
  assert.deepEqual(publicView, { counts: { margherita: 2 }, liked: ['margherita'] });

  assert.equal((await setLike(db, 'margherita', visitorKey(2), false)).count, 1, 'descurtir remove');
  assert.equal((await setLike(db, 'margherita', visitorKey(2), false)).count, 1, 'descurtir é idempotente');

  await assert.rejects(() => setLike(db, 'item-fantasma', visitorKey(1)), (err) => err.code === '23514');
  await assert.rejects(() => setLike(db, 'margherita', visitorKey(1), true, 'loja-b'), (err) => err.code === 'P0002');
  await assert.rejects(() => setLike(db, 'margherita', 'nao-e-hash'), (err) => err.code === '22023');

  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(
      () => asRole(db, role, OWNER, () => db.query('select * from public.item_likes')),
      (err) => err.code === '42501'
    );
    await assert.rejects(
      () =>
        asRole(db, role, OWNER, () =>
          db.query("insert into public.item_likes (site_id, item_key, visitor_hash) values ($1, 'margherita', $2)", [
            SITE_A,
            visitorKey(99)
          ])
        ),
      (err) => err.code === '42501'
    );
  }
  await assert.rejects(
    () => asRole(db, 'anon', null, () => db.query('select * from public.site_item_like_stats($1, now())', [SITE_A])),
    (err) => err.code === '42501'
  );

  const stats = (userId) =>
    asRole(db, 'authenticated', userId, async () =>
      (await db.query("select * from public.site_item_like_stats($1, now() - interval '7 days')", [SITE_A])).rows
    );
  for (const authorized of [OWNER, MEMBER]) {
    assert.deepEqual(await stats(authorized), [{ item_key: 'margherita', total_likes: 1, period_likes: 1 }]);
  }
  assert.deepEqual(await stats(STRANGER), []);

  const storedHashes = (await db.query('select visitor_hash from public.item_likes')).rows.map((r) => r.visitor_hash);
  assert.ok(storedHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash)));

  for (let i = 0; i < ITEM_LIKE_LIMITS.perItemPerHour - 1; i += 1) {
    await setLike(db, 'refrigerante', visitorKey(1000 + i));
  }
  assert.equal((await setLike(db, 'refrigerante', visitorKey(2000))).count, ITEM_LIKE_LIMITS.perItemPerHour);
  await assert.rejects(() => setLike(db, 'refrigerante', visitorKey(2001)), (err) => err.code === 'PT429');
  assert.equal((await setLike(db, 'refrigerante', visitorKey(2000))).count, ITEM_LIKE_LIMITS.perItemPerHour, 'curtida existente não esbarra no teto');
  assert.equal((await setLike(db, 'refrigerante', visitorKey(2000), false)).count, ITEM_LIKE_LIMITS.perItemPerHour - 1, 'remoção não tem teto');

  await db.query("update public.item_likes set created_at = now() - interval '2 hours'");
  assert.equal((await setLike(db, 'refrigerante', visitorKey(2001))).count, ITEM_LIKE_LIMITS.perItemPerHour, 'janela de 1 hora libera');

  const bulk = [];
  for (let i = 0; i < ITEM_LIKE_LIMITS.perSitePerHour - 1; i += 1) bulk.push(`('${SITE_A}', 'margherita', '${visitorKey(5000 + i)}')`);
  await db.exec(`insert into public.item_likes (site_id, item_key, visitor_hash) values ${bulk.join(',')}`);
  await assert.rejects(() => setLike(db, 'margherita', visitorKey(9999)), (err) => err.code === 'PT429');

  await db.query(
    "update public.publications set menu = jsonb_set(menu, '{items}', '[{\"id\":\"refrigerante\",\"name\":\"Refrigerante\",\"priceCents\":700}]') where site_id = $1",
    [SITE_A]
  );
  const afterRemoval = await asRole(db, 'anon', null, async () =>
    (await db.query('select public.get_item_likes($1) as r', ['pizzaria-a'])).rows[0].r
  );
  assert.deepEqual(Object.keys(afterRemoval.counts), ['refrigerante'], 'item removido sai da contagem pública');
  assert.deepEqual(afterRemoval.liked, []);
});

function likeRequest(body, { cookie, origin = PUBLIC_ORIGIN, url = `${PUBLIC_ORIGIN}/api/likes`, headers = {} } = {}) {
  return new Request(url, {
    method: 'POST',
    headers: {
      origin,
      'content-type': 'application/json',
      'user-agent': BROWSER_UA,
      ...(cookie ? { cookie } : {}),
      ...headers
    },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

test('Spec 011 - Worker: /api/likes com cookie funcional, validação e insights do dono', async () => {
  clearPublicationsCache();
  const nowSeconds = Math.floor(Date.parse('2026-11-12T19:30:00.000Z') / 1000);
  const api = createApiHandler({ nowSeconds: () => nowSeconds });
  const like = { slug: 'loja1', itemId: 'margherita-verace', liked: true };

  const initial = await api.fetch(new Request(`${PUBLIC_ORIGIN}/api/likes?slug=loja1`));
  assert.equal(initial.status, 200);
  assert.equal(initial.headers.get('cache-control'), 'private, no-store');
  assert.equal(initial.headers.get('set-cookie'), null, 'GET não cria cookie');
  assert.deepEqual(await initial.json(), { slug: 'loja1', counts: {}, liked: [] });

  const first = await api.fetch(likeRequest(like));
  assert.equal(first.status, 200);
  assert.deepEqual(await first.json(), { itemId: 'margherita-verace', liked: true, count: 1 });
  const setCookie = first.headers.get('set-cookie');
  assert.match(setCookie, new RegExp(`^${LIKE_VISITOR_COOKIE_NAME}=[a-f0-9]{32}; `));
  for (const attr of ['Path=/api/likes', 'Max-Age=31536000', 'HttpOnly', 'Secure', 'SameSite=Lax']) {
    assert.ok(setCookie.includes(attr), `cookie deve ter ${attr}`);
  }
  const cookie = setCookie.split(';')[0];
  const token = cookie.split('=')[1];

  const repeated = await Promise.all([1, 2, 3].map(() => api.fetch(likeRequest(like, { cookie }))));
  for (const res of repeated) {
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('set-cookie'), null);
    assert.equal((await res.json()).count, 1);
  }

  const stored = [...api.store.itemLikes.values()];
  assert.equal(stored.length, 1);
  assert.equal(
    stored[0].visitor_hash,
    createHash('sha256').update(`vitrine-curtidas:v1:${token}`).digest('hex'),
    'somente o hash do token é persistido'
  );
  assert.ok(!JSON.stringify(stored).includes(token));

  const second = await api.fetch(likeRequest(like));
  assert.equal((await second.json()).count, 2);

  const mine = await api.fetch(new Request(`${PUBLIC_ORIGIN}/api/likes?slug=loja1`, { headers: { cookie } }));
  assert.deepEqual(await mine.json(), { slug: 'loja1', counts: { 'margherita-verace': 2 }, liked: ['margherita-verace'] });

  const forged = await api.fetch(
    new Request(`${PUBLIC_ORIGIN}/api/likes?slug=loja1`, { headers: { cookie: `${LIKE_VISITOR_COOKIE_NAME}=nao-hex` } })
  );
  assert.deepEqual((await forged.json()).liked, [], 'cookie inválido é ignorado');

  const unlike = await api.fetch(likeRequest({ ...like, liked: false }, { cookie }));
  assert.deepEqual(await unlike.json(), { itemId: 'margherita-verace', liked: false, count: 1 });

  const rejections = [
    [likeRequest(like, { origin: 'https://ataque.example' }), 403, 'FORBIDDEN_ORIGIN'],
    [likeRequest(like, { headers: { 'content-type': 'text/plain' } }), 415, 'UNSUPPORTED_MEDIA_TYPE'],
    [likeRequest(like, { headers: { 'user-agent': 'curl/8.5.0' } }), 403, 'LIKE_NOT_ALLOWED'],
    [likeRequest({ ...like, padding: 'x'.repeat(1100) }), 400, 'INVALID_LIKE_REQUEST'],
    [likeRequest('{nao-json'), 400, 'INVALID_LIKE_REQUEST'],
    [likeRequest({ ...like, liked: 'sim' }), 400, 'INVALID_LIKE_REQUEST'],
    [likeRequest({ ...like, itemId: 'item-fantasma' }), 422, 'INVALID_LIKE_ITEM'],
    [likeRequest({ ...like, slug: 'vitrine-inexistente' }), 404, 'PUBLICATION_NOT_FOUND'],
    [new Request(`${PUBLIC_ORIGIN}/api/likes?slug=AB`), 400, 'INVALID_SLUG'],
    [new Request(`${PUBLIC_ORIGIN}/api/likes`, { method: 'DELETE' }), 405, 'METHOD_NOT_ALLOWED']
  ];
  for (const [request, status, code] of rejections) {
    const res = await api.fetch(request);
    assert.equal(res.status, status, code);
    assert.equal((await res.json()).error.code, code);
  }

  const itemId = 'quatro-queijos';
  for (let i = 0; i < ITEM_LIKE_LIMITS.perItemPerHour; i += 1) {
    assert.equal((await api.fetch(likeRequest({ ...like, itemId }))).status, 200);
  }
  const limited = await api.fetch(likeRequest({ ...like, itemId }));
  assert.equal(limited.status, 429);
  assert.equal((await limited.json()).error.code, 'LIKE_RATE_LIMITED');

  const customDomainApi = createApiHandler({ nowSeconds: () => nowSeconds });
  const customOrigin = 'https://pizzaria.exemplo.com.br';
  const customRes = await customDomainApi.fetch(
    likeRequest(like, { origin: customOrigin, url: `${customOrigin}/api/likes` }),
    { CF_SAAS_CNAME_TARGET: 'vitrine.inspira.dev.br' }
  );
  assert.equal(customRes.status, 200, 'domínio próprio atende /api/likes');

  const portalOrigin = 'https://painel.inspira.dev.br';
  const publishRes = await api.fetch(
    new Request(`${portalOrigin}/api/sites/${SITE_A}/publish`, {
      method: 'POST',
      headers: { Authorization: 'Bearer token-owner', Origin: portalOrigin }
    })
  );
  assert.equal(publishRes.status, 200);
  const published = (await api.store.getPublicationBySlug('pizza-a')).menu.items.map((item) => item.id);
  assert.ok(published.length >= 1);
  for (let i = 0; i < 3; i += 1) {
    await api.fetch(likeRequest({ slug: 'pizza-a', itemId: published[0], liked: true }));
  }

  const insightsFor = (token) =>
    api.fetch(
      new Request(`${portalOrigin}/api/sites/${SITE_A}/insights?period=7d`, {
        headers: { Authorization: `Bearer ${token}` }
      })
    );
  for (const token of ['token-owner', 'token-member']) {
    const res = await insightsFor(token);
    assert.equal(res.status, 200);
    const { insights } = await res.json();
    assert.equal(insights.likes.total, 3);
    assert.equal(insights.likes.periodNew, 3);
    assert.equal(insights.likes.items[0].itemId, published[0]);
    assert.equal(insights.likes.items[0].likes, 3);
    assert.ok(insights.highlights.some((h) => /mais curtido da vitrine, com 3 curtidas/.test(h)));
  }
  assert.equal((await insightsFor('token-stranger')).status, 404);
});

test('Spec 011 - store Supabase: RPC recebe só o hash e erros viram respostas honestas', async () => {
  clearPublicationsCache();
  const calls = [];
  let mode = 'ok';
  const fakeFetch = async (url, init = {}) => {
    const target = String(url);
    calls.push({ url: target, body: init.body ? JSON.parse(init.body) : null });
    const json = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    if (target.endsWith('/rpc/get_item_likes')) {
      if (mode === 'missing') return json(404, { code: 'PGRST202', message: 'Could not find the function' });
      return json(200, { counts: { margherita: 4 }, liked: [] });
    }
    if (target.endsWith('/rpc/set_item_like')) {
      if (mode === 'limited') return json(429, { code: 'PT429', message: 'LIKE_RATE_LIMITED' });
      return json(200, { itemId: 'margherita', liked: true, count: 5 });
    }
    return json(404, {});
  };
  const store = createSupabaseRestStore({
    supabaseUrl: 'https://exemplo.supabase.co',
    supabaseAnonKey: 'sb_publishable_teste',
    fetch: fakeFetch
  });
  const api = createApiHandler({ store });
  const like = { slug: 'pizzaria-a', itemId: 'margherita', liked: true };

  const ok = await api.fetch(likeRequest(like));
  assert.deepEqual(await ok.json(), { itemId: 'margherita', liked: true, count: 5 });
  const token = ok.headers.get('set-cookie').split(';')[0].split('=')[1];
  const rpcBody = calls.find((c) => c.url.endsWith('/rpc/set_item_like')).body;
  assert.match(rpcBody.visitor_key, /^[a-f0-9]{64}$/);
  assert.ok(!JSON.stringify(rpcBody).includes(token), 'o token bruto não sai do Worker');

  mode = 'limited';
  const limited = await api.fetch(likeRequest(like));
  assert.equal(limited.status, 429);

  mode = 'missing';
  const missing = await api.fetch(new Request(`${PUBLIC_ORIGIN}/api/likes?slug=pizzaria-a`));
  assert.equal(missing.status, 503);
  assert.equal((await missing.json()).error.code, 'LIKES_UNAVAILABLE');
});

test('Spec 011 - cliente da vitrine: atualização otimista, confirmação e reversão', async () => {
  const queue = [];
  const requests = [];
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    const next = await queue.shift();
    if (next instanceof Error) throw next;
    return { ok: next.status === 200, status: next.status, json: async () => next.body };
  };
  const client = createStorefrontLikesClient({ slug: 'loja1', fetchImpl });
  const events = [];
  client.subscribe((itemId, message) => events.push({ itemId, message }));

  assert.equal(client.getState('a').available, false);
  queue.push({ status: 200, body: { counts: { a: 2 }, liked: ['b'] } });
  assert.equal(await client.load(), true);
  assert.equal(requests[0].url, '/api/likes?slug=loja1');
  assert.deepEqual(client.getState('a'), { available: true, count: 2, liked: false, pending: false });
  assert.equal(client.getState('b').liked, true);

  let release;
  queue.push(new Promise((resolveResponse) => (release = resolveResponse)));
  const pendingToggle = client.toggle('a');
  assert.deepEqual(client.getState('a'), { available: true, count: 3, liked: true, pending: true });
  await client.toggle('a');
  assert.equal(client.getState('a').count, 3, 'toque duplo durante a requisição é ignorado');
  release({ status: 200, body: { itemId: 'a', liked: true, count: 7 } });
  await pendingToggle;
  assert.deepEqual(client.getState('a'), { available: true, count: 7, liked: true, pending: false });
  assert.deepEqual(JSON.parse(requests.at(-1).init.body), { slug: 'loja1', itemId: 'a', liked: true });

  queue.push({ status: 429, body: { error: { code: 'LIKE_RATE_LIMITED' } } });
  await client.toggle('a');
  assert.deepEqual(client.getState('a'), { available: true, count: 7, liked: true, pending: false });
  assert.match(events.at(-1).message, /Muitas curtidas/);

  queue.push(new Error('offline'));
  await client.toggle('b');
  assert.equal(client.getState('b').liked, true);
  assert.match(events.at(-1).message, /Não foi possível/);

  const unavailable = createStorefrontLikesClient({
    slug: 'loja1',
    fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) })
  });
  assert.equal(await unavailable.load(), false);
  assert.equal(unavailable.getState('a').available, false);
});

function createMiniDom() {
  const makeEl = (tag) => {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: '',
      textContent: '',
      hidden: false,
      children: [],
      attributes: {},
      listeners: {},
      classList: {
        add: (...tokens) => {
          el.className = [...new Set([...el.className.split(/\s+/).filter(Boolean), ...tokens])].join(' ');
        },
        remove: (...tokens) => {
          el.className = el.className.split(/\s+/).filter((c) => c && !tokens.includes(c)).join(' ');
        },
        contains: (token) => el.className.split(/\s+/).includes(token)
      },
      appendChild(child) {
        el.children.push(child);
        return child;
      },
      replaceChildren(...nodes) {
        el.children = nodes;
      },
      setAttribute(key, value) {
        el.attributes[key] = String(value);
      },
      addEventListener(event, handler) {
        (el.listeners[event] ??= []).push(handler);
      }
    };
    return el;
  };
  return { createElement: makeEl, createElementNS: (_ns, tag) => makeEl(tag) };
}

test('Spec 011 - renderizador: botão acessível só na página pública e após o servidor responder', async () => {
  const previousDocument = globalThis.document;
  globalThis.document = createMiniDom();
  try {
    const menu = {
      catalogType: 'products',
      categories: [{ id: 'pizzas', name: 'Pizzas', items: [{ id: 'm', name: 'Margherita', priceCents: 4800 }] }]
    };
    let fetchCount = 0;
    const likes = createStorefrontLikesClient({
      slug: 'loja1',
      fetchImpl: async () => {
        fetchCount += 1;
        return fetchCount === 1
          ? { ok: true, status: 200, json: async () => ({ counts: { m: 1 }, liked: [] }) }
          : { ok: true, status: 200, json: async () => ({ itemId: 'm', liked: true, count: 2 }) };
      }
    });

    const preview = new StorefrontRenderer(globalThis.document.createElement('div'), menu, { isPreview: true, likes });
    preview.render();
    assert.equal(preview.likeButtons.length, 0, 'prévia do editor não mostra curtidas');

    const renderer = new StorefrontRenderer(globalThis.document.createElement('div'), menu, { isPublicPage: true, likes });
    renderer.render();
    assert.equal(renderer.likeButtons.length, 1);
    const [{ button, countSpan }] = renderer.likeButtons;
    assert.equal(button.hidden, true, 'oculto até a contagem chegar');

    await likes.load();
    assert.equal(button.hidden, false);
    assert.equal(button.attributes['aria-pressed'], 'false');
    assert.equal(button.attributes['aria-label'], 'Curtir Margherita (1 curtida)');
    assert.equal(countSpan.textContent, '1');

    await button.listeners.click[0]();
    await new Promise((r) => setTimeout(r, 0));
    assert.equal(button.attributes['aria-pressed'], 'true');
    assert.ok(button.classList.contains('is-liked'));
    assert.equal(countSpan.textContent, '2');

    renderer.render();
    assert.equal(renderer.likeButtons[0].button.attributes['aria-pressed'], 'true', 'estado sobrevive à nova renderização');
  } finally {
    globalThis.document = previousDocument;
  }
});

test('Spec 011 - insights, validação e aviso de privacidade', () => {
  assert.deepEqual(validateItemLikePayload({ slug: ' Loja1 ', itemId: ' m ', liked: false }), {
    slug: 'loja1',
    itemId: 'm',
    liked: false
  });
  assert.throws(() => validateItemLikePayload({ slug: 'loja1', itemId: 'm' }), /liked/);
  assert.throws(() => validateItemLikePayload({ slug: 'loja1', itemId: 'javascript:alert(1)', liked: true }));

  assert.equal(resolveInsightsPeriodStart('7d', '2026-11-12'), '2026-11-06');
  assert.equal(resolveInsightsPeriodStart('30d', '2026-11-12'), '2026-10-14');

  const insights = computeStorefrontInsights({
    siteId: SITE_A,
    period: '7d',
    referenceDate: '2026-11-12',
    catalogSource: {
      categories: [
        { id: 'pizzas', name: 'Pizzas', items: [{ id: 'm', name: 'Margherita' }, { id: 'c', name: 'Calabresa' }] }
      ]
    },
    likeRows: [
      { item_key: 'c', total_likes: 2, period_likes: 2 },
      { item_key: 'm', total_likes: 5, period_likes: 1 },
      { item_key: 'removido', total_likes: 40, period_likes: 40 }
    ]
  });
  assert.deepEqual(insights.likes, {
    total: 7,
    periodNew: 3,
    items: [
      { itemId: 'm', name: 'Margherita', categoryName: 'Pizzas', likes: 5, periodLikes: 1 },
      { itemId: 'c', name: 'Calabresa', categoryName: 'Pizzas', likes: 2, periodLikes: 2 }
    ]
  });
  assert.ok(insights.highlights.includes('Margherita é o item mais curtido da vitrine, com 5 curtidas.'));

  const empty = computeStorefrontInsights({ siteId: SITE_A, period: '7d', referenceDate: '2026-11-12' });
  assert.deepEqual(empty.likes, { total: 0, periodNew: 0, items: [] });

  const html = renderStorefrontHtml({ slug: 'loja1', name: 'Loja', items: [], categories: [] });
  assert.match(html, /cookie funcional e anônimo guarda sua curtida/);
  assert.match(html, /sem cookies de rastreamento nem coleta de endereço IP/);
});
