import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import {
  MILA_WHATSAPP,
  buildMilaForwardMessage,
  buildMilaRelayCode,
  isMilaRelayCode,
  normalizeMilaRelayCode,
  withMilaRelayPrefix
} from '../web/assets/mila-relay.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  renderStorefrontHtml
} from '../src/publication-engine.mjs';
import {
  clearPublicationsCache,
  createApiHandler,
  createMemoryStore,
  createSupabaseRestStore
} from '../workers/api.mjs';

const root = resolve(import.meta.dirname, '..');
const OWNER_PHONE = '5531987654321';
const origin = 'https://vitrine.test';
const siteId = '20000000-0000-0000-0000-000000000001';
const ownerId = '10000000-0000-0000-0000-000000000001';

function relayDraft(overrides = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    slug: 'pizzaria-do-ze',
    businessName: 'Pizzaria do Zé',
    whatsapp: OWNER_PHONE,
    orderRelay: 'mila',
    items: [{ id: 'calabresa', name: 'Calabresa', priceCents: 4500, active: true }],
    ...overrides
  };
}

const site = { id: '30000000-0000-0000-0000-000000000001', slug: 'pizzaria-do-ze', name: 'Pizzaria do Zé' };

function decodedWaLinks(html) {
  return [...html.matchAll(/https:\/\/wa\.me\/[^"'\s<]+/g)].map(([href]) => {
    const url = new URL(href.replace(/&amp;/g, '&'));
    return { phone: url.pathname.slice(1), text: url.searchParams.get('text') ?? '' };
  });
}

test('Código da Mila: formato, determinismo e nenhum dígito do dono', () => {
  const code = buildMilaRelayCode('pizzaria-do-ze');
  assert.match(code, /^VI-PIZZAR-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(buildMilaRelayCode('pizzaria-do-ze'), code);
  assert.notEqual(buildMilaRelayCode('pizzaria-do-zeca'), code);
  assert.ok(isMilaRelayCode(code));
  assert.ok(!code.includes(OWNER_PHONE.slice(-4)));
  assert.throws(() => buildMilaRelayCode('Slug Inválido'), /Invalid slug/);

  assert.equal(normalizeMilaRelayCode(`oi\n#${code.toLowerCase()} · Pedido para X`), code);
  assert.equal(normalizeMilaRelayCode('sem código'), null);

  const prefixed = withMilaRelayPrefix('Olá!', { via: 'mila', code }, 'Pizzaria do Zé');
  assert.equal(prefixed, `#${code} · Pedido para Pizzaria do Zé\n\nOlá!`);
  assert.equal(withMilaRelayPrefix('Olá!', null, 'X'), 'Olá!');

  const forward = buildMilaForwardMessage({
    businessName: 'Pizzaria do Zé', code, order: prefixed, customerPhone: '+55 (31) 99999-0000'
  });
  assert.match(forward, /Aqui é a Mila/);
  assert.match(forward, /Contato do cliente: https:\/\/wa\.me\/5531999990000/);
});

test('Número da Mila é o mesmo do atendimento do site de divulgação', async () => {
  const contact = JSON.parse(await readFile(resolve(root, 'content/contact.json'), 'utf8'));
  assert.equal(MILA_WHATSAPP, contact.teamWhatsapp);
});

test('Rascunho só aceita orderRelay "direct" ou "mila"', () => {
  assert.doesNotThrow(() => validateDraftContent(relayDraft()));
  assert.doesNotThrow(() => validateDraftContent(relayDraft({ orderRelay: 'direct' })));
  assert.throws(
    () => validateDraftContent(relayDraft({ orderRelay: 'robo' })),
    (error) => error.code === 'INVALID_ORDER_RELAY' && error.status === 422
  );
});

test('Com a chave ligada, o número do dono não vai para o artefato nem para o HTML publicado', async () => {
  const { json, menu } = await compilePublicStorefront(relayDraft(), site);
  const code = buildMilaRelayCode('pizzaria-do-ze');
  assert.equal(menu.whatsapp, MILA_WHATSAPP);
  assert.deepEqual(menu.orderRelay, { via: 'mila', code });
  assert.ok(!json.includes(OWNER_PHONE));

  const html = renderStorefrontHtml(menu);
  assert.ok(!html.includes(OWNER_PHONE));
  assert.match(html, /chegam à Mila/);
  const links = decodedWaLinks(html);
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.equal(link.phone, MILA_WHATSAPP);
    assert.ok(link.text.startsWith(`#${code} · Pedido para Pizzaria do Zé\n\n`));
  }

  const direct = await compilePublicStorefront(relayDraft({ orderRelay: undefined }), site);
  assert.equal(direct.menu.whatsapp, OWNER_PHONE);
  assert.equal(direct.menu.orderRelay, undefined);
  assert.ok(!renderStorefrontHtml(direct.menu).includes('chegam à Mila'));
});

test('Guarda de vazamento recusa relay com número do dono ou código forjado', async () => {
  const { menu } = await compilePublicStorefront(relayDraft(), site);
  const leaked = { ...structuredClone(menu), whatsapp: OWNER_PHONE };
  assert.throws(() => assertNoPrivateLeakage(leaked), (error) => error.code === 'PRIVATE_FIELD_LEAKAGE');
  const forged = { ...structuredClone(menu), orderRelay: { via: 'mila', code: 'VI-OUTRA-0000' } };
  assert.throws(() => assertNoPrivateLeakage(forged), (error) => error.code === 'PRIVATE_FIELD_LEAKAGE');
  const extra = { ...structuredClone(menu), orderRelay: { ...menu.orderRelay, ownerWhatsapp: OWNER_PHONE } };
  assert.throws(() => assertNoPrivateLeakage(extra), (error) => error.code === 'PRIVATE_FIELD_LEAKAGE');
});

test('Mensagem montada na vitrine começa com o código da Mila', async () => {
  const { menu } = await compilePublicStorefront(relayDraft(), site);
  const renderer = new StorefrontRenderer(null, structuredClone(menu), { targetWhatsapp: menu.whatsapp });
  renderer.cart.set('calabresa', 1);
  const message = renderer.buildOrderMessage();
  assert.ok(message.startsWith(`#${menu.orderRelay.code} · Pedido para Pizzaria do Zé\n\n`));
  assert.match(message, /Calabresa/);

  const directRenderer = new StorefrontRenderer(null, { ...structuredClone(menu), orderRelay: undefined }, {});
  directRenderer.cart.set('calabresa', 1);
  assert.ok(!directRenderer.buildOrderMessage().startsWith('#VI-'));
});

test('Worker: nenhuma resposta pública da vitrine com Mila contém o número do dono', async () => {
  clearPublicationsCache();
  const api = createApiHandler();
  const env = { PREVIEW_HMAC_SECRET: 'segredo-exclusivo-do-teste' };
  const send = (path, { method = 'GET', payload } = {}) =>
    api(new Request(origin + path, {
      method,
      headers: {
        authorization: 'Bearer token-owner',
        origin,
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {})
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
    }), env);

  const { draft } = await (await send(`/api/sites/${siteId}/draft`)).json();
  draft.content.whatsapp = OWNER_PHONE;
  draft.content.orderRelay = 'mila';
  assert.equal((await send(`/api/sites/${siteId}/draft`, { method: 'PUT', payload: draft })).status, 200);
  const published = await send(`/api/sites/${siteId}/publish`, { method: 'POST' });
  assert.equal(published.status, 200);
  const { publication } = await published.json();
  assert.equal(publication.menu.whatsapp, MILA_WHATSAPP);

  const { url: previewUrl } = await (await send(`/api/sites/${siteId}/preview-token`, { method: 'POST', payload: {} })).json();
  const responses = [
    ...await Promise.all([
      '/data/vitrines/pizza-a/menu.json',
      `/data/vitrines/pizza-a/releases/${publication.hash}.json`,
      '/pizza-a'
    ].map(async (path) => [path, await api(new Request(origin + path), env)])),
    [previewUrl, await send(previewUrl)]
  ];
  for (const [path, response] of responses) {
    assert.equal(response.status, 200, path);
    const body = await response.text();
    assert.ok(!body.includes(OWNER_PHONE), `${path} não pode conter o número do dono`);
    assert.ok(body.includes(MILA_WHATSAPP), `${path} deve usar o número da Mila`);
  }
  clearPublicationsCache();
});

test('Worker: publicação recarregada do Supabase mantém a Mila e o código', async () => {
  clearPublicationsCache();
  const { menu, hash } = await compilePublicStorefront(relayDraft(), site, { revision: 2 });
  const store = createSupabaseRestStore({
    supabaseUrl: 'https://example.supabase.co',
    supabaseAnonKey: 'sb_publishable_teste',
    fetch: async () => Response.json([{
      slug: 'pizzaria-do-ze', revision: 2, artifact_hash: hash, menu, published_at: '2026-11-12T00:00:00.000Z'
    }])
  });
  const hydrated = await store.getPublicationBySlug('pizzaria-do-ze');
  assert.equal(hydrated.menu.whatsapp, MILA_WHATSAPP);
  assert.deepEqual(hydrated.menu.orderRelay, menu.orderRelay);
  assert.equal(hydrated.hash, hash);
  clearPublicationsCache();
});

test('Worker: só operadores da plataforma localizam a vitrine pelo código', async () => {
  clearPublicationsCache();
  const store = createMemoryStore();
  store.isPlatformAdmin = (id) => id === ownerId;
  const api = createApiHandler({ store });
  const owner = (path, init = {}) => api(new Request(origin + path, {
    ...init,
    headers: { authorization: 'Bearer token-owner', origin, ...(init.headers ?? {}) }
  }));

  const { draft } = await (await owner(`/api/sites/${siteId}/draft`)).json();
  draft.content.whatsapp = OWNER_PHONE;
  draft.content.orderRelay = 'mila';
  await owner(`/api/sites/${siteId}/draft`, {
    method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(draft)
  });
  assert.equal((await owner(`/api/sites/${siteId}/publish`, { method: 'POST' })).status, 200);

  const code = buildMilaRelayCode('pizza-a');
  const lookup = (token, query) => api(new Request(`${origin}/api/admin/mila-relay?code=${encodeURIComponent(query)}`, {
    headers: { authorization: `Bearer ${token}` }
  }));
  assert.equal((await lookup('token-member', code)).status, 403);
  assert.equal((await lookup('token-owner', 'nada')).status, 422);

  const found = await lookup('token-owner', `#${code.toLowerCase()} · Pedido para Pizza A`);
  assert.equal(found.status, 200);
  assert.equal(found.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await found.json(), {
    code,
    matches: [{ slug: 'pizza-a', name: 'Pizza A', whatsapp: OWNER_PHONE }]
  });
  clearPublicationsCache();
});

test('SQL: lookup_mila_relay só responde a operador e registra auditoria', async (t) => {
  const db = new PGlite();
  t.after(() => db.close());
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
  const migrationsDir = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(migrationsDir)).filter((name) => name.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
  }

  const operatorId = '40000000-0000-0000-0000-000000000001';
  const strangerId = '40000000-0000-0000-0000-000000000002';
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [ownerId, operatorId, strangerId]);
  await db.query("insert into public.platform_operators (user_id, role) values ($1, 'platform_admin')", [operatorId]);
  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name, template) values ($1, $2, 'pizzaria-do-ze', 'Pizzaria do Zé', 'pizzeria-v1')",
    [site.id, ownerId]
  );
  await db.query('insert into public.drafts (site_id, content) values ($1, $2::jsonb)', [site.id, JSON.stringify(relayDraft())]);
  const { menu, hash } = await compilePublicStorefront(relayDraft(), site);
  await db.query(
    'insert into public.publications (site_id, slug, revision, artifact_hash, menu) values ($1, $2, 1, $3, $4::jsonb)',
    [site.id, 'pizzaria-do-ze', hash, JSON.stringify(menu)]
  );

  const asUser = async (userId, sql, params) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${userId}', false);`);
    try {
      return await db.query(sql, params);
    } finally {
      await db.exec('reset role;');
    }
  };

  await assert.rejects(
    asUser(strangerId, 'select * from public.lookup_mila_relay($1)', [menu.orderRelay.code]),
    /FORBIDDEN_PLATFORM_ADMIN/
  );
  await assert.rejects(
    asUser(operatorId, 'select * from public.lookup_mila_relay($1)', ['VI-XX']),
    /INVALID_MILA_CODE/
  );
  const { rows } = await asUser(operatorId, 'select * from public.lookup_mila_relay($1)', [
    menu.orderRelay.code.toLowerCase()
  ]);
  assert.deepEqual(rows, [{ slug: 'pizzaria-do-ze', name: 'Pizzaria do Zé', whatsapp: OWNER_PHONE }]);

  const audit = await db.query("select site_id, actor_user_id, summary from public.audit_logs where action = 'mila_relay_lookup'");
  assert.equal(audit.rows.length, 1);
  assert.equal(audit.rows[0].site_id, site.id);
  assert.equal(audit.rows[0].actor_user_id, operatorId);
  assert.deepEqual(audit.rows[0].summary, { code: menu.orderRelay.code });

  const anonymous = await db.query('select has_function_privilege($1, $2, $3) as allowed', [
    'anon', 'public.lookup_mila_relay(text)', 'execute'
  ]);
  assert.equal(anonymous.rows[0].allowed, false);
});
