import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { createApiHandler, verifyJwtHs256 } from '../workers/api.mjs';
import { publishedPortfolio, quoteContactLink } from '../src/portfolio.mjs';
import { publicMenu } from '../src/public-menu.mjs';
import { compilePublicStorefront } from '../src/publication-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const distDir = resolve(root, 'dist');
const migrationsDir = resolve(root, 'supabase/migrations');

const TENANT_A_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_B_ID = '22222222-2222-4222-8222-222222222222';
const COLLABORATOR_ID = '33333333-3333-4333-8333-333333333333';
const STRANGER_ID = '44444444-4444-4444-8444-444444444444';

const SITE_A1_ID = 'aaaa1111-1111-4111-8111-111111111111';
const SITE_A2_ID = 'aaaa2222-2222-4222-8222-222222222222';
const SITE_B1_ID = 'bbbb1111-1111-4111-8111-111111111111';

const AUDIT_JWT_SECRET = 'vitrine-security-audit-hs256-secret-key-2026';
const AUDIT_SUPABASE_URL = 'https://audit-pglite.supabase.local';
const AUDIT_SUPABASE_ANON_KEY = 'sb_publishable_audit_anon_key_vitrine';

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function createSignedJwt(payload, secret = AUDIT_JWT_SECRET) {
  const encoder = new TextEncoder();
  const headerB64 = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const input = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(input));
  return `${input}.${toBase64Url(new Uint8Array(sig))}`;
}

function decodeSubFromBearer(authHeader) {
  if (typeof authHeader !== 'string') return '';
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return '';
  const parts = match[1].trim().split('.');
  if (parts.length !== 3) return '';
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof payload.sub === 'string' ? payload.sub : '';
  } catch {
    return '';
  }
}

async function setupAuditDatabase() {
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
    const sql = await readFile(resolve(migrationsDir, file), 'utf8');
    await db.exec(sql);
  }

  await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4)', [
    TENANT_A_ID,
    TENANT_B_ID,
    COLLABORATOR_ID,
    STRANGER_ID
  ]);

  await db.query(
    `insert into public.sites (id, owner_user_id, slug, name, template) values
      ($1, $4, 'pizzaria-tenant-a1', 'Pizzaria Tenant A1', 'pizzeria-v1'),
      ($2, $4, 'pizzaria-tenant-a2', 'Pizzaria Tenant A2', 'pizzeria-v1'),
      ($3, $5, 'pizzaria-tenant-b1', 'Pizzaria Tenant B1', 'pizzeria-v1')`,
    [SITE_A1_ID, SITE_A2_ID, SITE_B1_ID, TENANT_A_ID, TENANT_B_ID]
  );

  // Colaborador restrito vinculado apenas à vitrine SITE_A1_ID
  await db.query('insert into public.site_memberships (site_id, user_id) values ($1, $2)', [
    SITE_A1_ID,
    COLLABORATOR_ID
  ]);

  const draftA1 = {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    slug: 'pizzaria-tenant-a1',
    businessName: 'Pizzaria Tenant A1',
    whatsapp: '5511911111111',
    items: [{ id: 'calabresa-a1', name: 'Calabresa A1', priceCents: 4500, active: true }]
  };
  const draftA2 = {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    slug: 'pizzaria-tenant-a2',
    businessName: 'Pizzaria Tenant A2',
    whatsapp: '5511922222222',
    items: [{ id: 'marg-a2', name: 'Margherita A2', priceCents: 4800, active: true }]
  };
  const draftB1 = {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    slug: 'pizzaria-tenant-b1',
    businessName: 'Pizzaria Tenant B1',
    whatsapp: '5511933333333',
    items: [{ id: 'portuguesa-b1', name: 'Portuguesa B1', priceCents: 5100, active: true }]
  };

  await db.query(
    `insert into public.drafts (site_id, content) values
      ($1, $4::jsonb),
      ($2, $5::jsonb),
      ($3, $6::jsonb)`,
    [
      SITE_A1_ID,
      SITE_A2_ID,
      SITE_B1_ID,
      JSON.stringify(draftA1),
      JSON.stringify(draftA2),
      JSON.stringify(draftB1)
    ]
  );

  async function asRole(role, userId, fn) {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
      const res = await fn();
      await db.exec('commit');
      return res;
    } catch (err) {
      await db.exec('rollback');
      throw err;
    }
  }

  async function postgrestFetch(input, init = {}) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = (request.method || 'GET').toUpperCase();
    const sub = decodeSubFromBearer(request.headers.get('authorization'));
    const role = sub ? 'authenticated' : 'anon';

    try {
      if (url.pathname === '/rest/v1/sites') {
        if (method === 'GET') {
          const idFilter = url.searchParams.get('id');
          const rows = await asRole(role, sub, async () => {
            if (idFilter?.startsWith('eq.')) {
              const siteId = idFilter.slice(3);
              return (
                await db.query(
                  'select id, owner_user_id, slug, name, template, created_at, updated_at from public.sites where id = $1',
                  [siteId]
                )
              ).rows;
            }
            return (
              await db.query(
                'select id, owner_user_id, slug, name, template, created_at, updated_at from public.sites order by created_at asc'
              )
            ).rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          const rows = await asRole(role, sub, async () => {
            return (
              await db.query(
                'insert into public.sites (owner_user_id, slug, name, template) values ($1, $2, $3, $4) returning id, owner_user_id, slug, name, template, created_at, updated_at',
                [body.owner_user_id, body.slug, body.name, body.template ?? 'pizzeria-v1']
              )
            ).rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 201,
            headers: { 'content-type': 'application/json' }
          });
        }
      }

      if (url.pathname === '/rest/v1/drafts') {
        if (method === 'GET') {
          const siteIdFilter = url.searchParams.get('site_id');
          const siteId = siteIdFilter?.startsWith('eq.') ? siteIdFilter.slice(3) : null;
          const rows = await asRole(role, sub, async () => {
            return (
              await db.query(
                'select site_id, revision, updated_at, content from public.drafts where site_id = $1',
                [siteId]
              )
            ).rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = await request.json();
          const rows = await asRole(role, sub, async () => {
            return (
              await db.query(
                'insert into public.drafts (site_id, content) values ($1, $2::jsonb) returning site_id, revision, updated_at, content',
                [body.site_id, JSON.stringify(body.content)]
              )
            ).rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 201,
            headers: { 'content-type': 'application/json' }
          });
        }
        if (method === 'PATCH') {
          const siteIdFilter = url.searchParams.get('site_id');
          const revFilter = url.searchParams.get('revision');
          const siteId = siteIdFilter?.startsWith('eq.') ? siteIdFilter.slice(3) : null;
          const revision = revFilter?.startsWith('eq.') ? Number(revFilter.slice(3)) : null;
          const body = await request.json();
          const rows = await asRole(role, sub, async () => {
            return (
              await db.query(
                'update public.drafts set content = $1::jsonb where site_id = $2 and revision = $3 returning site_id, revision, updated_at, content',
                [JSON.stringify(body.content), siteId, revision]
              )
            ).rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
      }

      return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
    } catch (err) {
      const status = err?.code === '23505' ? 409 : err?.code === '42501' ? 403 : 400;
      return new Response(
        JSON.stringify({ code: err?.code || 'DB_ERROR', message: err?.message || 'Error' }),
        { status, headers: { 'content-type': 'application/json' } }
      );
    }
  }

  return { db, asRole, postgrestFetch };
}

test('Fase 5 - Auditoria de Penetração RLS/API e Auditoria Estrita de CSP/HTML/Bundle', async (t) => {
  const { db, asRole, postgrestFetch } = await setupAuditDatabase();
  t.after(async () => {
    await db.close();
  });

  const api = createApiHandler({ fetch: postgrestFetch });
  const env = {
    SUPABASE_URL: AUDIT_SUPABASE_URL,
    SUPABASE_ANON_KEY: AUDIT_SUPABASE_ANON_KEY,
    SUPABASE_JWT_SECRET: AUDIT_JWT_SECRET
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const jwtTenantA = await createSignedJwt({ sub: TENANT_A_ID, exp: nowSec + 3600 });
  const jwtTenantB = await createSignedJwt({ sub: TENANT_B_ID, exp: nowSec + 3600 });
  const jwtCollaborator = await createSignedJwt({ sub: COLLABORATOR_ID, exp: nowSec + 3600 });
  const jwtStranger = await createSignedJwt({ sub: STRANGER_ID, exp: nowSec + 3600 });
  const jwtExpired = await createSignedJwt({ sub: TENANT_A_ID, exp: nowSec - 60 });
  const jwtWrongSecret = await createSignedJwt({ sub: TENANT_A_ID, exp: nowSec + 3600 }, 'wrong-secret');

  await t.test('1. Ataques de Autenticação: JWT expirado, assinatura adulterada, alg:none e anônimo são bloqueados (401)', async () => {
    const algNoneToken = `${toBase64Url(Buffer.from('{"alg":"none","typ":"JWT"}'))}.${toBase64Url(
      Buffer.from(JSON.stringify({ sub: TENANT_A_ID }))
    )}.`;
    assert.equal(await verifyJwtHs256(algNoneToken, AUDIT_JWT_SECRET), null);
    assert.equal(await verifyJwtHs256(jwtExpired, AUDIT_JWT_SECRET), null);
    assert.equal(await verifyJwtHs256(jwtWrongSecret, AUDIT_JWT_SECRET), null);

    for (const badToken of [algNoneToken, jwtExpired, jwtWrongSecret, 'malformed.token']) {
      const res = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${SITE_A1_ID}/draft`, {
          headers: { Authorization: `Bearer ${badToken}` }
        }),
        env
      );
      assert.equal(res.status, 401);
      assert.equal((await res.json()).error.code, 'UNAUTHORIZED');
    }
  });

  await t.test('2. Ataques IDOR Cross-Tenant (Tenant B, Colaborador restrito e Stranger contra Tenant A)', async () => {
    // Tenant B tentando ler, editar e publicar vitrines de Tenant A
    for (const targetSiteId of [SITE_A1_ID, SITE_A2_ID]) {
      const getRes = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${targetSiteId}/draft`, {
          headers: { Authorization: `Bearer ${jwtTenantB}` }
        }),
        env
      );
      assert.equal(getRes.status, 404);
      assert.equal((await getRes.json()).error.code, 'SITE_NOT_FOUND');

      const putRes = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${targetSiteId}/draft`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${jwtTenantB}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            revision: 1,
            content: {
              schemaVersion: 1,
              template: 'pizzeria-v1',
              slug: 'pizzaria-tenant-a1',
              businessName: 'Invadido por Tenant B',
              whatsapp: '5511999999999',
              items: [{ id: 'hack', name: 'Hack', priceCents: 100, active: true }]
            }
          })
        }),
        env
      );
      assert.equal(putRes.status, 404);
      assert.equal((await putRes.json()).error.code, 'SITE_NOT_FOUND');

      const pubRes = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${targetSiteId}/publish`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${jwtTenantB}` }
        }),
        env
      );
      assert.equal(pubRes.status, 404);
      assert.equal((await pubRes.json()).error.code, 'SITE_NOT_FOUND');
    }

    // Colaborador restrito de A1: lê A1 (200), mas é bloqueado em escrita/publicação de A1 e totalmente bloqueado em A2 e B1
    const collabGetA1 = await api.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${SITE_A1_ID}/draft`, {
        headers: { Authorization: `Bearer ${jwtCollaborator}` }
      }),
      env
    );
    assert.equal(collabGetA1.status, 200);

    const collabPutA1 = await api.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${SITE_A1_ID}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${jwtCollaborator}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          revision: 1,
          content: {
            schemaVersion: 1,
            template: 'pizzeria-v1',
            slug: 'pizzaria-tenant-a1',
            businessName: 'Colaborador Tentando Alterar',
            whatsapp: '5511911111111',
            items: [{ id: 'calabresa-a1', name: 'Calabresa', priceCents: 4500, active: true }]
          }
        })
      }),
      env
    );
    assert.equal(collabPutA1.status, 404);

    const collabPublishA1 = await api.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${SITE_A1_ID}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${jwtCollaborator}` }
      }),
      env
    );
    assert.equal(collabPublishA1.status, 404);

    for (const forbiddenSiteId of [SITE_A2_ID, SITE_B1_ID]) {
      const collabGetOther = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${forbiddenSiteId}/draft`, {
          headers: { Authorization: `Bearer ${jwtCollaborator}` }
        }),
        env
      );
      assert.equal(collabGetOther.status, 404);
    }

    // Tentativa de Tenant B forjar owner_user_id = TENANT_A_ID no POST /api/sites
    const spoofCreateRes = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/sites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${jwtTenantB}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          owner_user_id: TENANT_A_ID,
          ownerUserId: TENANT_A_ID,
          id: SITE_A1_ID,
          name: 'Pizzaria Criada por B',
          slug: 'pizzaria-criada-por-b'
        })
      }),
      env
    );
    assert.equal(spoofCreateRes.status, 201);
    const spoofCreated = await spoofCreateRes.json();
    assert.notEqual(spoofCreated.site.id, SITE_A1_ID);

    // Verifica no banco PostgreSQL que owner_user_id foi vinculado a TENANT_B_ID, jamais a TENANT_A_ID
    const dbCheck = await db.query('select owner_user_id from public.sites where id = $1', [
      spoofCreated.site.id
    ]);
    assert.equal(dbCheck.rows[0].owner_user_id, TENANT_B_ID);

    // Tentativa de Tenant B sequestrar o slug público de Tenant A via PUT /api/sites/:id/draft
    const hijackSlugRes = await api.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${SITE_B1_ID}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${jwtTenantB}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          revision: 1,
          content: {
            schemaVersion: 1,
            template: 'pizzeria-v1',
            slug: 'pizzaria-tenant-a1',
            businessName: 'Sequestro de Slug',
            whatsapp: '5511933333333',
            items: [{ id: 'p1', name: 'Pizza', priceCents: 4000, active: true }]
          }
        })
      }),
      env
    );
    assert.equal(hijackSlugRes.status, 422);
    assert.equal((await hijackSlugRes.json()).error.code, 'INVALID_SLUG');

    await assert.rejects(
      () =>
        compilePublicStorefront(
          {
            schemaVersion: 1,
            template: 'pizzeria-v1',
            slug: 'pizzaria-tenant-a1',
            businessName: 'Sequestro Direto',
            whatsapp: '5511933333333',
            items: [{ id: 'p1', name: 'Pizza', priceCents: 4000, active: true }]
          },
          { id: SITE_B1_ID, slug: 'pizzaria-tenant-b1', name: 'Pizzaria Tenant B1' }
        ),
      (err) => err.status === 422 && err.code === 'INVALID_SLUG'
    );
  });

  await t.test('3. SQL Injection, XSS, URLs maliciosas (javascript:, data:, http://, user:pass@), escalonamento 42501 e bypass de revision', async () => {
    const sqlAndPathPayloads = [
      "pizzaria'; DROP TABLE public.sites;--",
      "pizza' OR '1'='1",
      '../admin',
      'admin',
      'portal',
      'assets',
      'data',
      'login',
      'logout',
      'javascript:alert(1)'
    ];

    for (const badSlug of sqlAndPathPayloads) {
      const res = await api.fetch(
        new Request('https://painel.inspira.dev.br/api/sites', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${jwtTenantA}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ name: 'Pizzaria Segura', slug: badSlug })
        }),
        env
      );
      assert.equal(res.status, 400);
      assert.equal((await res.json()).error.code, 'INVALID_SLUG');
    }

    const dangerousNamesAndUrls = [
      { businessName: '<script>alert("xss")</script>' },
      { businessName: 'javascript:alert(1)' },
      { businessName: 'Pizzaria <img src=x onerror=alert(1)>' },
      { url: 'javascript:alert(1)' },
      { url: 'data:text/html,<script>alert(1)</script>' },
      { url: 'http://pizzaria-insegura.example.com/' },
      { url: 'https://admin:senha123@pizzaria.example.com/' }
    ];

    for (const maliciousPatch of dangerousNamesAndUrls) {
      const res = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${SITE_A1_ID}/draft`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${jwtTenantA}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            revision: 1,
            content: {
              schemaVersion: 1,
              template: 'pizzeria-v1',
              slug: 'pizzaria-tenant-a1',
              businessName: 'Pizzaria Tenant A1',
              whatsapp: '5511911111111',
              items: [{ id: 'calabresa-a1', name: 'Calabresa', priceCents: 4500, active: true }],
              ...maliciousPatch
            }
          })
        }),
        env
      );
      assert.equal(res.status, 422, `Payload malicioso deve ser rejeitado com 422: ${JSON.stringify(maliciousPatch)}`);
    }

    // Também verifica src/portfolio.mjs e src/public-menu.mjs contra URLs e protocolos maliciosos
    for (const badPortfolioUrl of [
      'javascript:alert(1)',
      'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
      'http://example.com/',
      'https://user:pass@example.com/'
    ]) {
      assert.throws(() =>
        publishedPortfolio({
          schemaVersion: 1,
          entries: [
            {
              id: 'case-teste',
              title: 'Case',
              url: badPortfolioUrl,
              summary: 'Resumo',
              category: 'Alimentação',
              tags: ['Pizza'],
              order: 1,
              published: true
            }
          ]
        })
      );
    }
    assert.throws(() => quoteContactLink('5511999999999?text=injected'));
    assert.throws(() =>
      publicMenu({
        template: 'pizzeria-v1',
        slug: 'pizza-ok',
        name: 'Pizza OK',
        whatsapp: '5511999999999& evil=1',
        items: [{ id: '1', name: 'Item', priceCents: 1000, active: true }]
      })
    );

    // Tentativas de escalonamento de privilégio direto no PostgreSQL (SQLSTATE 42501)
    const privilegeEscalations = [
      () =>
        asRole('authenticated', COLLABORATOR_ID, () =>
          db.query('insert into public.site_memberships (site_id, user_id) values ($1, $2)', [
            SITE_A2_ID,
            COLLABORATOR_ID
          ])
        ),
      () =>
        asRole('authenticated', STRANGER_ID, () =>
          db.query('insert into public.site_memberships (site_id, user_id) values ($1, $2)', [
            SITE_A1_ID,
            STRANGER_ID
          ])
        ),
      () =>
        asRole('authenticated', TENANT_B_ID, () =>
          db.query('update public.sites set owner_user_id = $1 where id = $2', [
            TENANT_B_ID,
            SITE_A1_ID
          ])
        ),
      () =>
        asRole('authenticated', TENANT_A_ID, () =>
          db.query('update public.drafts set revision = 999 where site_id = $1', [SITE_A1_ID])
        ),
      () =>
        asRole('anon', null, () => db.query('select * from public.sites')),
      () =>
        asRole('anon', null, () => db.query('select * from public.drafts')),
      () =>
        asRole('anon', null, () => db.query('select * from public.site_memberships'))
    ];

    for (const attackFn of privilegeEscalations) {
      await assert.rejects(attackFn, (err) => err.code === '42501');
    }

    // Tentativas de bypass de revision na API (null, 0, -1, 1.5, "1", NaN)
    for (const badRevision of [null, undefined, 0, -1, 1.5, '1', '1 OR 1=1']) {
      const revRes = await api.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${SITE_A1_ID}/draft`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${jwtTenantA}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            revision: badRevision,
            content: {
              schemaVersion: 1,
              template: 'pizzeria-v1',
              slug: 'pizzaria-tenant-a1',
              businessName: 'Pizzaria Tenant A1',
              whatsapp: '5511911111111',
              items: [{ id: 'calabresa-a1', name: 'Calabresa', priceCents: 4500, active: true }]
            }
          })
        }),
        env
      );
      assert.equal(revRes.status, 400);
      assert.equal((await revRes.json()).error.code, 'INVALID_REVISION');
    }
  });

  await t.test('4. Auditoria Estrita de CSP, HTML Estático, Formulários e Bundle em dist/', async () => {
    await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });

    const allRelativeFiles = await readdir(distDir, { recursive: true });
    const distFiles = [];
    for (const rel of allRelativeFiles) {
      const fullPath = resolve(distDir, rel);
      const info = await stat(fullPath);
      if (info.isFile()) {
        distFiles.push({ rel: rel.replace(/\\/g, '/'), fullPath });
      }
    }

    assert.ok(distFiles.length > 0, 'dist/ deve conter arquivos compilados');

    // Presença obrigatória das superfícies principais em dist/
    const requiredSurfacePaths = [
      'index.html',
      '404.html',
      '_headers',
      'portal/index.html',
      'portal/portal.js',
      'portal/editor.js',
      'portal/portal.css',
      'vitrine/index.html',
      'vitrine/vitrine.js',
      'vitrine/vitrine.css',
      'loja1/index.html',
      'data/portfolio.json',
      'data/contact.json',
      'data/vitrines/loja1/menu.json'
    ];
    for (const reqPath of requiredSurfacePaths) {
      assert.ok(
        distFiles.some((f) => f.rel === reqPath),
        `Arquivo obrigatório ausente em dist/: ${reqPath}`
      );
    }

    // 4.1 Zero arquivos privados (.sql, .env, supabase/, test/, scripts/, workers/, node_modules/)
    for (const { rel } of distFiles) {
      assert.doesNotMatch(
        rel,
        /(?:^|\/)(?:node_modules|supabase|test|scripts|workers|\.env|\.git|\.specify)(?:$|\/|\.)/i,
        `Diretório ou arquivo privado vazou para dist/: ${rel}`
      );
      assert.ok(!rel.endsWith('.sql'), `Arquivo SQL jamais pode existir em dist/: ${rel}`);
    }

    const jsContentsByPath = new Map();
    for (const { rel, fullPath } of distFiles) {
      const ext = extname(rel).toLowerCase();
      if (!['.html', '.js', '.mjs', '.css', '.json', '.svg'].includes(ext)) continue;

      const content = await readFile(fullPath, 'utf8');
      if (ext === '.js' || ext === '.mjs') {
        jsContentsByPath.set(rel, content);
      }

      // Zero chaves secretas / service_role em qualquer arquivo de texto do bundle
      assert.doesNotMatch(
        content,
        /SUPABASE_SERVICE_ROLE_KEY|service_role\b|\bsb_secret_[A-Za-z0-9_-]+|\bsbp_[A-Za-z0-9_-]+/,
        `Vazamento de segredo/service_role detectado em dist/${rel}`
      );

      // Zero CDNs externas ou Google Fonts em HTML, CSS, JS e MJS
      if (['.html', '.css', '.js', '.mjs'].includes(ext)) {
        assert.doesNotMatch(
          content,
          /https?:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.|unpkg\.com|jsdelivr\.net|cdnjs\.cloudflare\.com|www\.googletagmanager\.com|www\.google-analytics\.com)/i,
          `Referência proibida a CDN/fonte/tracker externo em dist/${rel}`
        );
      }

      if (ext === '.html') {
        // Zero <script> inline: toda tag <script> deve possuir src="..." e corpo vazio
        const scriptTags = [...content.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
        for (const [, attrs, innerBody] of scriptTags) {
          assert.match(
            attrs,
            /\bsrc\s*=\s*["'][^"']+["']/i,
            `Tag <script> sem atributo src local encontrada em dist/${rel}`
          );
          assert.equal(
            innerBody.trim(),
            '',
            `Código JavaScript inline encontrado dentro de <script> em dist/${rel}`
          );
        }

        // Zero atributos inline de evento (onclick=, onload=, onerror=, onsubmit=, etc.) e zero style= inline em HTML
        assert.doesNotMatch(
          content,
          /\s+on[a-z]+\s*=\s*["']/i,
          `Atributo de evento inline (on*=) encontrado em dist/${rel}`
        );
        assert.doesNotMatch(
          content,
          /\s+style\s*=\s*["']/i,
          `Atributo style= inline encontrado em dist/${rel}`
        );
        assert.doesNotMatch(
          content,
          /<style\b/i,
          `Bloco <style> inline encontrado em dist/${rel}`
        );

        // Inspeciona todos os <form> garantindo ausência de action remota e presença de handler JS com preventDefault()
        const formTags = [...content.matchAll(/<form\b([^>]*)>/gi)];
        for (const [, formAttrs] of formTags) {
          assert.doesNotMatch(
            formAttrs,
            /\baction\s*=\s*["'][^"']+["']/i,
            `Formulário em dist/${rel} não pode definir action= nativo sob form-action 'none'`
          );
          const idMatch = formAttrs.match(/\bid\s*=\s*["']([^"']+)["']/i);
          assert.ok(idMatch, `Todo <form> em dist/${rel} deve possuir um id para binding JS`);
        }
      }
    }

    // Verifica que todos os formulários de dist/portal/index.html possuem listener 'submit' com preventDefault()
    const portalHtml = await readFile(resolve(distDir, 'portal/index.html'), 'utf8');
    const portalCombinedJs =
      (jsContentsByPath.get('portal/portal.js') || '') +
      '\n' +
      (jsContentsByPath.get('portal/editor.js') || '');
    const portalForms = [...portalHtml.matchAll(/<form\b[^>]*\bid=["']([^"']+)["'][^>]*>/gi)];
    assert.ok(portalForms.length >= 2, 'dist/portal/index.html deve conter os formulários do portal');
    for (const [, formId] of portalForms) {
      assert.ok(
        portalCombinedJs.includes(`getElementById('${formId}')`) ||
          portalCombinedJs.includes(`#${formId}`),
        `Formulário #${formId} deve ser referenciado pelo JS do portal`
      );
    }
    const submitListeners = [
      ...portalCombinedJs.matchAll(
        /(\w+)\.addEventListener\(\s*['"]submit['"]\s*,\s*(?:async\s*)?\(\s*(\w+)\s*\)\s*=>\s*\{[\s\S]*?\2\.preventDefault\(\)/g
      )
    ];
    assert.equal(
      submitListeners.length,
      portalForms.length,
      `Cada <form> de dist/portal/index.html (${portalForms.length}) deve ter listener submit com preventDefault()`
    );

    // Verifica ausência de mutações inline .style.* nos scripts do portal e da vitrine pública
    for (const scriptRel of ['portal/portal.js', 'portal/editor.js', 'vitrine/vitrine.js', 'app.js']) {
      const code = jsContentsByPath.get(scriptRel) || '';
      assert.doesNotMatch(
        code,
        /\.style\./,
        `Script dist/${scriptRel} não deve injetar estilos inline via element.style.*`
      );
    }

    // Verifica separação estrita de CSP entre /portal/* (connect-src com projeto Supabase público) e rotas públicas (connect-src 'self')
    const distHeadersText = await readFile(resolve(distDir, '_headers'), 'utf8');
    assert.match(
      distHeadersText,
      /\/\*\s+Content-Security-Policy:[^\n]*connect-src 'self';/,
      'Regra global /* em dist/_headers deve manter estritamente connect-src \'self\''
    );
    assert.match(
      distHeadersText,
      /\/portal\*\s+Content-Security-Policy:[^\n]*connect-src 'self' https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co;|\/portal\/?\*\s+Content-Security-Policy:[^\n]*connect-src 'self' https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co;/,
      'Regra /portal/* em dist/_headers deve liberar connect-src para https://qawlpsrfewosxsfgmmpm.supabase.co'
    );
    assert.match(
      jsContentsByPath.get('portal/portal.js') || '',
      /https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co/,
      'dist/portal/portal.js deve referenciar a URL pública canônica do projeto Supabase'
    );
    for (const publicOnlyRel of ['app.js', 'vitrine/vitrine.js']) {
      assert.doesNotMatch(
        jsContentsByPath.get(publicOnlyRel) || '',
        /supabase\.co/i,
        `Script público dist/${publicOnlyRel} jamais deve referenciar o Supabase`
      );
    }
  });

  await t.test('5. Auditoria Forense de Integridade da Suíte de Testes (test/**/*.test.mjs)', async () => {
    const testRoot = resolve(root, 'test');
    const relEntries = await readdir(testRoot, { recursive: true });
    const testFiles = relEntries
      .map((r) => r.replace(/\\/g, '/'))
      .filter((r) => r.endsWith('.test.mjs'))
      .sort();

    assert.ok(testFiles.length >= 10, `Esperados ao menos 10 arquivos de teste, encontrados: ${testFiles.length}`);

    const mockFnPattern = new RegExp('\\bcreateMock' + 'ApiHandler\\b');
    const skipTodoPattern = new RegExp(
      '\\btest\\.(?:skip|todo)\\s*\\(|\\bt\\.(?:skip|todo)\\s*\\(|\\{\\s*(?:skip|todo)\\s*:\\s*true\\s*\\}'
    );
    const tautologyPattern = new RegExp('\\bassert\\.ok\\(\\s*' + 'true\\s*\\)');

    for (const rel of testFiles) {
      const fullPath = resolve(testRoot, rel);
      const source = await readFile(fullPath, 'utf8');

      // Nenhum fallback mock silencioso de createApiHandler
      assert.doesNotMatch(
        source,
        mockFnPattern,
        `Fallback mock silencioso proibido em test/${rel}`
      );

      // Nenhum teste pulado ou todo oculto
      assert.doesNotMatch(
        source,
        skipTodoPattern,
        `Uso proibido de skip/todo oculto em test/${rel}`
      );

      // Nenhuma asserção vazia tautológica
      assert.doesNotMatch(
        source,
        tautologyPattern,
        `Asserção tautológica vazia proibida em test/${rel}`
      );

      // Todo arquivo de teste deve conter asserções reais de node:assert/strict
      assert.match(
        source,
        /\bassert\.(?:equal|deepEqual|ok|match|doesNotMatch|throws|rejects|notEqual)\b/,
        `Arquivo test/${rel} deve conter asserções reais`
      );
    }

    // Confirma que test/portal-api-contract.test.mjs importa diretamente createApiHandler de ../workers/api.mjs
    const contractTestSource = await readFile(resolve(testRoot, 'portal-api-contract.test.mjs'), 'utf8');
    assert.match(
      contractTestSource,
      /import\s*\{\s*createApiHandler\s*\}\s*from\s*['"]\.\.\/workers\/api\.mjs['"]/
    );
  });
});
