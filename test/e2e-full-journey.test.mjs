import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import worker, {
  IMMUTABLE_CACHE_CONTROL,
  PORTAL_CSP_HEADER,
  STOREFRONT_CACHE_CONTROL,
  STRICT_CSP_HEADER,
  clearJwksCache,
  clearPublicationsCache,
  evaluateHeadersForPath,
  parseHeadersRules
} from '../workers/api.mjs';
import { publicMenu, whatsappLink } from '../src/public-menu.mjs';
import { computeSha256Hex, FORBIDDEN_PUBLIC_KEYS } from '../src/publication-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const distDir = resolve(root, 'dist');
const migrationsDir = resolve(root, 'supabase/migrations');

const E2E_SUPABASE_URL = 'https://pglite.supabase.local';
const E2E_SUPABASE_ANON_KEY = 'sb_publishable_e2e_anon_key_vitrine_inspira';
const E2E_JWT_SECRET = 'vitrine-e2e-hs256-jwt-secret-key-2026-inspira';

const USER_AURORA_ID = 'a0000000-0000-4000-8000-000000000001';

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8'
});

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function signHs256Jwt(payload, secret = E2E_JWT_SECRET) {
  const encoder = new TextEncoder();
  const headerB64 = toBase64Url(encoder.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(sig))}`;
}

async function generateEs256KeyPair(kid = 'e2e-es256-kid-1') {
  const keyPair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const publicJwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  return {
    kid,
    privateKey: keyPair.privateKey,
    publicKey: keyPair.publicKey,
    jwk: {
      kty: publicJwk.kty,
      crv: publicJwk.crv,
      x: publicJwk.x,
      y: publicJwk.y,
      kid,
      use: 'sig',
      alg: 'ES256'
    }
  };
}

async function signEs256Jwt(payload, privateKey, kid = 'e2e-es256-kid-1') {
  const encoder = new TextEncoder();
  const headerB64 = toBase64Url(
    encoder.encode(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid }))
  );
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(signingInput)
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(sig))}`;
}

function decodeJwtSub(authHeader) {
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

async function createPgliteSupabaseHarness() {
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

  await db.query('insert into auth.users (id) values ($1)', [USER_AURORA_ID]);

  const es256Primary = await generateEs256KeyPair('supabase-e2e-es256-kid-1');
  let activeJwks = { keys: [es256Primary.jwk] };
  let dbQueryCount = 0;

  async function runAsJwtRole(request, fn) {
    dbQueryCount += 1;
    const sub = decodeJwtSub(request.headers.get('authorization'));
    const role = sub ? 'authenticated' : 'anon';
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [sub]);
      const result = await fn();
      await db.exec('commit');
      return result;
    } catch (err) {
      await db.exec('rollback');
      throw err;
    }
  }

  async function postgrestFetch(input, init = {}) {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = (request.method || 'GET').toUpperCase();

    try {
      if (url.pathname === '/auth/v1/.well-known/jwks.json' && method === 'GET') {
        return new Response(JSON.stringify(activeJwks), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (url.pathname === '/rest/v1/sites') {
        if (method === 'GET') {
          const idFilter = url.searchParams.get('id');
          const rows = await runAsJwtRole(request, async () => {
            if (idFilter?.startsWith('eq.')) {
              const siteId = idFilter.slice(3);
              const res = await db.query(
                'select id, owner_user_id, slug, name, template, created_at, updated_at from public.sites where id = $1',
                [siteId]
              );
              return res.rows;
            }
            const res = await db.query(
              'select id, owner_user_id, slug, name, template, created_at, updated_at from public.sites order by created_at asc'
            );
            return res.rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (method === 'POST') {
          const body = await request.json();
          const rows = await runAsJwtRole(request, async () => {
            const res = await db.query(
              'insert into public.sites (owner_user_id, slug, name, template) values ($1, $2, $3, $4) returning id, owner_user_id, slug, name, template, created_at, updated_at',
              [body.owner_user_id, body.slug, body.name, body.template ?? 'pizzeria-v1']
            );
            return res.rows;
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
          const rows = await runAsJwtRole(request, async () => {
            const res = await db.query(
              'select site_id, revision, updated_at, content from public.drafts where site_id = $1',
              [siteId]
            );
            return res.rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (method === 'POST') {
          const body = await request.json();
          const rows = await runAsJwtRole(request, async () => {
            const res = await db.query(
              'insert into public.drafts (site_id, content) values ($1, $2::jsonb) returning site_id, revision, updated_at, content',
              [body.site_id, JSON.stringify(body.content)]
            );
            return res.rows;
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
          const rows = await runAsJwtRole(request, async () => {
            const res = await db.query(
              'update public.drafts set content = $1::jsonb where site_id = $2 and revision = $3 returning site_id, revision, updated_at, content',
              [JSON.stringify(body.content), siteId, revision]
            );
            return res.rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }
      }

      if (url.pathname === '/rest/v1/publications') {
        if (method === 'GET') {
          const slugFilter = url.searchParams.get('slug');
          const hashFilter = url.searchParams.get('artifact_hash');
          const slug = slugFilter?.startsWith('eq.') ? slugFilter.slice(3) : null;
          const hash = hashFilter?.startsWith('eq.') ? hashFilter.slice(3) : null;
          const rows = await runAsJwtRole(request, async () => {
            if (slug && hash) {
              const res = await db.query(
                'select slug, revision, status, artifact_hash, menu, published_at from public.publications where slug = $1 and artifact_hash = $2 limit 1',
                [slug, hash]
              );
              return res.rows;
            }
            const res = await db.query(
              'select slug, revision, status, artifact_hash, menu, published_at from public.publications where slug = $1 and status = $2 limit 1',
              [slug, 'active']
            );
            return res.rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 200,
            headers: { 'content-type': 'application/json' }
          });
        }

        if (method === 'POST') {
          const body = await request.json();
          const rows = await runAsJwtRole(request, async () => {
            const res = await db.query(
              `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu, published_at)
               values ($1, $2, $3, $4, $5, $6::jsonb, $7)
               on conflict (site_id) do update
                 set slug = excluded.slug,
                     revision = excluded.revision,
                     status = excluded.status,
                     artifact_hash = excluded.artifact_hash,
                     menu = excluded.menu,
                     published_at = excluded.published_at
               returning site_id, slug, revision, status, artifact_hash, menu, published_at`,
              [
                body.site_id,
                body.slug,
                body.revision,
                body.status ?? 'active',
                body.artifact_hash,
                JSON.stringify(body.menu),
                body.published_at ?? new Date().toISOString()
              ]
            );
            return res.rows;
          });
          return new Response(JSON.stringify(rows), {
            status: 201,
            headers: { 'content-type': 'application/json' }
          });
        }
      }

      if (url.pathname === '/rest/v1/publication_releases') {
        if (method === 'GET') {
          const slugFilter = url.searchParams.get('slug');
          const hashFilter = url.searchParams.get('artifact_hash');
          const slug = slugFilter?.startsWith('eq.') ? slugFilter.slice(3) : null;
          const hash = hashFilter?.startsWith('eq.') ? hashFilter.slice(3) : null;
          const rows = await runAsJwtRole(request, async () => {
            const res = await db.query(
              'select slug, revision, artifact_hash, menu, published_at from public.publication_releases where slug = $1 and artifact_hash = $2 limit 1',
              [slug, hash]
            );
            return res.rows;
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

  return {
    db,
    es256Primary,
    setJwks(nextJwks) {
      activeJwks = nextJwks;
    },
    postgrestFetch,
    getQueryCount: () => dbQueryCount,
    resetQueryCount: () => {
      dbQueryCount = 0;
    }
  };
}

function createDistAssetsBinding() {
  const lockPath = resolve(root, '.build.lock');
  let cachedRules = null;

  async function waitForBuildLock() {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      try {
        await stat(lockPath);
        await new Promise((r) => setTimeout(r, 20));
      } catch {
        return;
      }
    }
  }

  async function getRules() {
    if (!cachedRules) {
      await waitForBuildLock();
      const raw = await readFile(resolve(distDir, '_headers'), 'utf8');
      cachedRules = parseHeadersRules(raw);
    }
    return cachedRules;
  }

  return {
    async fetch(input) {
      const req = input instanceof Request ? input : new Request(input);
      const url = new URL(req.url, 'http://localhost');
      const requestPathname = decodeURIComponent(url.pathname);
      let pathname = requestPathname;
      if (pathname === '/') pathname = '/index.html';
      else if (pathname === '/portal' || pathname === '/portal/') pathname = '/portal/index.html';
      else if (pathname === '/vitrine' || pathname === '/vitrine/') pathname = '/vitrine/index.html';
      else if (pathname.endsWith('/')) pathname = `${pathname}index.html`;

      const target = resolve(distDir, `.${pathname}`);
      if (!target.startsWith(distDir.endsWith(sep) ? distDir : `${distDir}${sep}`)) {
        return new Response('Not Found', { status: 404 });
      }
      for (let attempt = 0; attempt < 3; attempt += 1) {
        await waitForBuildLock();
        try {
          const info = await stat(target);
          if (!info.isFile()) return new Response('Not Found', { status: 404 });
          const body = await readFile(target);
          const ext = extname(target);
          const rules = await getRules();
          const evaluated = evaluateHeadersForPath(rules, requestPathname);
          const headers = new Headers(evaluated.headers);
          headers.set('content-type', MIME_TYPES[ext] || 'application/octet-stream');
          if (!headers.has('cache-control')) {
            headers.set('cache-control', 'public, max-age=0, must-revalidate');
          }
          return new Response(body, {
            status: 200,
            headers
          });
        } catch {
          if (attempt < 2) {
            await new Promise((r) => setTimeout(r, 25));
            continue;
          }
        }
      }
      return new Response('Not Found', { status: 404 });
    }
  };
}

test('Fase 5 - Suíte E2E Opaque-Box de Ponta a Ponta (Worker + Static Assets dist/ + PGlite RLS)', async (t) => {
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });

  const pgHarness = await createPgliteSupabaseHarness();
  const assetsBinding = createDistAssetsBinding();
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (input, init) => {
    const urlStr = input instanceof Request ? input.url : String(input);
    if (urlStr.startsWith(E2E_SUPABASE_URL)) {
      return pgHarness.postgrestFetch(input, init);
    }
    return originalFetch(input, init);
  };

  t.after(async () => {
    clearJwksCache();
    globalThis.fetch = originalFetch;
    await pgHarness.db.close();
  });

  clearJwksCache();
  const env = {
    SUPABASE_URL: E2E_SUPABASE_URL,
    SUPABASE_ANON_KEY: E2E_SUPABASE_ANON_KEY,
    ASSETS: assetsBinding
  };
  const envWithLegacyHs256 = {
    ...env,
    SUPABASE_JWT_SECRET: E2E_JWT_SECRET
  };

  const nowSec = Math.floor(Date.now() / 1000);
  const expectedIssuer = `${E2E_SUPABASE_URL}/auth/v1`;
  const auroraJwt = await signEs256Jwt(
    {
      sub: USER_AURORA_ID,
      iss: expectedIssuer,
      aud: 'authenticated',
      role: 'authenticated',
      exp: nowSec + 3600
    },
    pgHarness.es256Primary.privateKey,
    pgHarness.es256Primary.kid
  );
  const auroraLegacyHs256Jwt = await signHs256Jwt({
    sub: USER_AURORA_ID,
    role: 'authenticated',
    exp: nowSec + 3600
  });

  let createdSiteId = null;
  let publishedRecord = null;

  await t.test('1. Acesso à página institucional / e dist/data/portfolio.json com CSP e zero vazamentos', async () => {
    pgHarness.resetQueryCount();

    const homeRes = await worker.fetch(new Request('https://vitrine.inspira.dev.br/'), env);
    assert.equal(homeRes.status, 200);
    assert.match(homeRes.headers.get('content-type') || '', /text\/html/i);
    const csp = homeRes.headers.get('content-security-policy') || '';
    assert.equal(csp, STRICT_CSP_HEADER);
    assert.match(csp, /default-src 'self'/);
    assert.match(csp, /script-src 'self'/);
    assert.match(csp, /connect-src 'self';/);
    assert.doesNotMatch(csp, /qawlpsrfewosxsfgmmpm\.supabase\.co/);
    assert.doesNotMatch(csp, /script-src[^;]*unsafe-inline/);
    assert.match(csp, /frame-ancestors 'none'/);
    assert.match(csp, /form-action 'none'/);
    assert.equal(homeRes.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(homeRes.headers.get('x-frame-options'), 'DENY');

    const portalPageRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/portal/'),
      env
    );
    assert.equal(portalPageRes.status, 200);
    assert.equal(portalPageRes.headers.get('content-security-policy'), PORTAL_CSP_HEADER);
    assert.match(
      portalPageRes.headers.get('content-security-policy') || '',
      /connect-src 'self' https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co;/
    );

    const homeHtml = await homeRes.text();
    assert.match(homeHtml, /Vitrine Inspira/);
    assert.doesNotMatch(homeHtml, /service_role|SUPABASE_SERVICE_ROLE/i);

    const portfolioRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/data/portfolio.json'),
      env
    );
    assert.equal(portfolioRes.status, 200);
    assert.match(portfolioRes.headers.get('content-security-policy') || '', /script-src 'self'/);
    const portfolioData = await portfolioRes.json();
    assert.ok(Array.isArray(portfolioData));
    for (const item of portfolioData) {
      assert.equal('internalNotes' in item, false);
      assert.equal('published' in item, false);
      assert.match(item.url, /^https:\/\//);
    }

    assert.equal(pgHarness.getQueryCount(), 0, 'Leitura institucional jamais deve consultar o banco');
  });

  await t.test('2. Login/sessão Google OAuth PKCE via GET /api/auth/session com cookie __Host-vitrine_session e Bearer token', async () => {
    const unauthRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session'),
      env
    );
    assert.equal(unauthRes.status, 401);
    assert.equal((await unauthRes.json()).error.code, 'UNAUTHORIZED');

    const cookieRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Cookie: `__Host-vitrine_session=${encodeURIComponent(auroraJwt)}` }
      }),
      env
    );
    assert.equal(cookieRes.status, 200);
    const cookieBody = await cookieRes.json();
    assert.equal(cookieBody.authenticated, true);
    assert.equal(cookieBody.user.id, USER_AURORA_ID);
    assert.equal('email' in cookieBody.user, false);

    const bearerRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Authorization: `Bearer ${auroraJwt}` }
      }),
      env
    );
    assert.equal(bearerRes.status, 200);
    const bearerBody = await bearerRes.json();
    assert.equal(bearerBody.authenticated, true);
    assert.equal(bearerBody.user.id, USER_AURORA_ID);

    // Casos negativos ES256: kid desconhecido, assinatura adulterada, expirado, iss/aud errados e alg:none
    const attackerKeyPair = await generateEs256KeyPair(pgHarness.es256Primary.kid);
    const unknownKidJwt = await signEs256Jwt(
      {
        sub: USER_AURORA_ID,
        iss: expectedIssuer,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 3600
      },
      pgHarness.es256Primary.privateKey,
      'kid-inexistente-e2e'
    );
    const tamperedEs256Jwt = await signEs256Jwt(
      {
        sub: USER_AURORA_ID,
        iss: expectedIssuer,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 3600
      },
      attackerKeyPair.privateKey,
      pgHarness.es256Primary.kid
    );
    const expiredEs256Jwt = await signEs256Jwt(
      {
        sub: USER_AURORA_ID,
        iss: expectedIssuer,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec - 120
      },
      pgHarness.es256Primary.privateKey,
      pgHarness.es256Primary.kid
    );
    const wrongIssEs256Jwt = await signEs256Jwt(
      {
        sub: USER_AURORA_ID,
        iss: 'https://outro-projeto.supabase.co/auth/v1',
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 3600
      },
      pgHarness.es256Primary.privateKey,
      pgHarness.es256Primary.kid
    );
    const wrongAudEs256Jwt = await signEs256Jwt(
      {
        sub: USER_AURORA_ID,
        iss: expectedIssuer,
        aud: 'anon',
        role: 'authenticated',
        exp: nowSec + 3600
      },
      pgHarness.es256Primary.privateKey,
      pgHarness.es256Primary.kid
    );
    const algNoneJwt = `${toBase64Url(Buffer.from('{"alg":"none","typ":"JWT"}'))}.${toBase64Url(
      Buffer.from(
        JSON.stringify({
          sub: USER_AURORA_ID,
          iss: expectedIssuer,
          aud: 'authenticated',
          role: 'authenticated',
          exp: nowSec + 3600
        })
      )
    )}.`;

    for (const invalidJwt of [
      unknownKidJwt,
      tamperedEs256Jwt,
      expiredEs256Jwt,
      wrongIssEs256Jwt,
      wrongAudEs256Jwt,
      algNoneJwt
    ]) {
      const badRes = await worker.fetch(
        new Request('https://painel.inspira.dev.br/api/auth/session', {
          headers: { Authorization: `Bearer ${invalidJwt}` }
        }),
        env
      );
      assert.equal(badRes.status, 401);
    }

    // Caminho HS256 legado: continua passando quando SUPABASE_JWT_SECRET está configurado
    const legacyHs256Res = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Authorization: `Bearer ${auroraLegacyHs256Jwt}` }
      }),
      envWithLegacyHs256
    );
    assert.equal(legacyHs256Res.status, 200);
    assert.equal((await legacyHs256Res.json()).user.id, USER_AURORA_ID);
  });

  await t.test('3. Criação de Vitrine (pizzaria-aurora), listagem, edição de cardápio com centavos inteiros, revisão 1 -> 2 e conflito 409', async () => {
    const createRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/sites', {
        method: 'POST',
        headers: {
          Cookie: `__Host-vitrine_session=${auroraJwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Pizzaria Aurora Artesanal',
          slug: 'pizzaria-aurora',
          template: 'pizzeria-v1',
          whatsapp: '5511977776666'
        })
      }),
      env
    );
    assert.equal(createRes.status, 201);
    const createdBody = await createRes.json();
    assert.ok(createdBody.site.id);
    createdSiteId = createdBody.site.id;
    assert.equal(createdBody.site.slug, 'pizzaria-aurora');
    assert.equal(createdBody.site.name, 'Pizzaria Aurora Artesanal');
    assert.equal(createdBody.site.role, 'owner');
    assert.equal(createdBody.draft.siteId, createdSiteId);
    assert.equal(createdBody.draft.revision, 1);

    const listRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/sites', {
        headers: { Authorization: `Bearer ${auroraJwt}` }
      }),
      env
    );
    assert.equal(listRes.status, 200);
    const listBody = await listRes.json();
    assert.equal(listBody.sites.length, 1);
    assert.equal(listBody.sites[0].id, createdSiteId);
    assert.equal(listBody.sites[0].slug, 'pizzaria-aurora');

    const catalogDraft = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pizzaria-aurora',
      businessName: 'Pizzaria Aurora Artesanal',
      whatsapp: '5511977776666',
      categories: [
        {
          id: 'pizzas-aurora',
          name: 'Pizzas de Fermentação Lenta',
          items: [
            {
              id: 'aurora-margherita',
              name: 'Margherita Aurora',
              description: 'Molho de tomates assados, muçarela de búfala e manjericão.',
              priceCents: 5490,
              active: true
            },
            {
              id: 'aurora-pepperoni',
              name: 'Pepperoni & Mel Picante',
              description: 'Muçarela flor de leite, pepperoni crocante e fio de mel.',
              priceCents: 6150,
              active: true
            },
            {
              id: 'aurora-teste-oculto',
              name: 'Sabor Secreto de Inverno',
              description: 'Item desativado que não deve ser publicado.',
              priceCents: 7200,
              active: false
            }
          ]
        },
        {
          id: 'bebidas-aurora',
          name: 'Bebidas Artesanais',
          items: [
            {
              id: 'limonada-aurora',
              name: 'Limonada Siciliana com Hortelã',
              description: 'Garrafa 400ml preparada na hora.',
              priceCents: 1500,
              active: true
            }
          ]
        }
      ]
    };

    const updateRes = await worker.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${createdSiteId}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${auroraJwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          revision: 1,
          content: catalogDraft
        })
      }),
      env
    );
    assert.equal(updateRes.status, 200);
    const updatedBody = await updateRes.json();
    assert.equal(updatedBody.draft.siteId, createdSiteId);
    assert.equal(updatedBody.draft.revision, 2);
    assert.equal(updatedBody.draft.content.categories.length, 2);

    const staleRes = await worker.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${createdSiteId}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${auroraJwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          revision: 1,
          content: {
            ...catalogDraft,
            businessName: 'Tentativa Sobrescrita Obsoleta'
          }
        })
      }),
      env
    );
    assert.equal(staleRes.status, 409);
    const staleBody = await staleRes.json();
    assert.equal(staleBody.error.code, 'REVISION_CONFLICT');
    assert.equal(staleBody.error.currentRevision, 2);
  });

  await t.test('4. Publicação imutável (POST /api/sites/:id/publish) com hash SHA-256 determinístico e preservação em falha subsequente', async () => {
    const publishRes = await worker.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${createdSiteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auroraJwt}` }
      }),
      env
    );
    assert.equal(publishRes.status, 200);
    const { publication } = await publishRes.json();
    publishedRecord = publication;

    assert.equal(publication.siteId, createdSiteId);
    assert.equal(publication.slug, 'pizzaria-aurora');
    assert.equal(publication.revision, 2);
    assert.match(publication.hash, /^[a-f0-9]{64}$/);
    assert.equal(publication.url, '/pizzaria-aurora');
    assert.equal(publication.menuUrl, '/data/vitrines/pizzaria-aurora/menu.json');
    assert.equal(
      publication.immutableMenuUrl,
      `/data/vitrines/pizzaria-aurora/releases/${publication.hash}.json`
    );

    const expectedSha256 = await computeSha256Hex(JSON.stringify(publication.menu));
    assert.equal(publication.hash, expectedSha256);
    assert.equal(publication.menu.items.length, 3);
    assert.ok(!publication.menu.items.some((item) => item.id === 'aurora-teste-oculto'));
    for (const forbidden of FORBIDDEN_PUBLIC_KEYS) {
      assert.equal(forbidden in publication.menu, false);
    }

    // Salva revisão 3 com todos os itens ocultos (rascunho válido para salvar, mas inválido para publicar)
    const allHiddenDraft = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pizzaria-aurora',
      businessName: 'Pizzaria Aurora Artesanal',
      whatsapp: '5511977776666',
      categories: [
        {
          id: 'pizzas-aurora',
          name: 'Pizzas de Fermentação Lenta',
          items: [
            {
              id: 'aurora-margherita',
              name: 'Margherita Aurora',
              priceCents: 5490,
              active: false
            }
          ]
        }
      ]
    };

    const saveRev3 = await worker.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${createdSiteId}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${auroraJwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ revision: 2, content: allHiddenDraft })
      }),
      env
    );
    assert.equal(saveRev3.status, 200);
    assert.equal((await saveRev3.json()).draft.revision, 3);

    const failedPublish = await worker.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${createdSiteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auroraJwt}` }
      }),
      env
    );
    assert.equal(failedPublish.status, 422);
    assert.equal((await failedPublish.json()).error.code, 'EMPTY_PUBLIC_MENU');
  });

  await t.test('5. Consumo da Vitrine Pública em /pizzaria-aurora e /loja1 (zero queries no banco, < 100 KB, Cache-Control/CSP e links wa.me exatos)', async () => {
    pgHarness.resetQueryCount();

    // 5.1 Vitrine recém-publicada (/pizzaria-aurora) permanece íntegra na revisão 2 publicada
    const auroraHtmlRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/pizzaria-aurora'),
      env
    );
    assert.equal(auroraHtmlRes.status, 200);
    assert.equal(auroraHtmlRes.headers.get('cache-control'), STOREFRONT_CACHE_CONTROL);
    assert.equal(auroraHtmlRes.headers.get('content-security-policy'), STRICT_CSP_HEADER);
    assert.equal(auroraHtmlRes.headers.get('etag'), `"${publishedRecord.hash}"`);
    const auroraHtml = await auroraHtmlRes.text();
    assert.match(auroraHtml, /Pizzaria Aurora Artesanal/);
    assert.match(auroraHtml, /Margherita Aurora/);
    assert.match(auroraHtml, /R\$\s*54,90/);
    assert.doesNotMatch(auroraHtml, /Sabor Secreto de Inverno/);

    const auroraMenuRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/data/vitrines/pizzaria-aurora/menu.json'),
      env
    );
    assert.equal(auroraMenuRes.status, 200);
    assert.equal(auroraMenuRes.headers.get('cache-control'), STOREFRONT_CACHE_CONTROL);
    assert.equal(auroraMenuRes.headers.get('content-security-policy'), STRICT_CSP_HEADER);
    const auroraMenu = await auroraMenuRes.json();
    assert.deepEqual(auroraMenu, publishedRecord.menu);

    for (const item of auroraMenu.items) {
      const expectedLink = whatsappLink(auroraMenu, item.id);
      assert.match(expectedLink, /^https:\/\/wa\.me\/5511977776666\?text=/);
      assert.ok(
        auroraHtml.includes(expectedLink.replace(/&/g, '&amp;')),
        `HTML de /pizzaria-aurora deve conter o link exato de whatsappLink para ${item.id}`
      );
    }

    const immutableRes = await worker.fetch(
      new Request(`https://vitrine.inspira.dev.br${publishedRecord.immutableMenuUrl}`),
      env
    );
    assert.equal(immutableRes.status, 200);
    assert.equal(immutableRes.headers.get('cache-control'), IMMUTABLE_CACHE_CONTROL);
    assert.deepEqual(await immutableRes.json(), publishedRecord.menu);

    // 5.2 Vitrine piloto (/loja1)
    const loja1HtmlRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/loja1'),
      env
    );
    assert.equal(loja1HtmlRes.status, 200);
    assert.equal(loja1HtmlRes.headers.get('cache-control'), STOREFRONT_CACHE_CONTROL);
    assert.equal(loja1HtmlRes.headers.get('content-security-policy'), STRICT_CSP_HEADER);
    const loja1Html = await loja1HtmlRes.text();
    assert.match(loja1Html, /Forno &amp; Praça Pizzaria Artesanal/);

    const loja1MenuRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/data/vitrines/loja1/menu.json'),
      env
    );
    assert.equal(loja1MenuRes.status, 200);
    assert.equal(loja1MenuRes.headers.get('cache-control'), STOREFRONT_CACHE_CONTROL);
    const loja1Menu = await loja1MenuRes.json();
    const validatedLoja1 = publicMenu({
      ...loja1Menu,
      items: loja1Menu.items.map((item) => ({ ...item, active: true }))
    });
    assert.equal(validatedLoja1.slug, 'loja1');
    for (const item of loja1Menu.items) {
      const expectedWa = whatsappLink(loja1Menu, item.id).replace(/&/g, '&amp;');
      assert.ok(loja1Html.includes(expectedWa));
    }

    // Peso estático < 100 KB
    const storefrontAssets = [
      resolve(distDir, 'vitrine/index.html'),
      resolve(distDir, 'vitrine/vitrine.css'),
      resolve(distDir, 'vitrine/vitrine.js'),
      resolve(distDir, 'loja1/index.html'),
      resolve(distDir, 'data/vitrines/loja1/menu.json')
    ];
    let totalBytes = 0;
    for (const file of storefrontAssets) {
      totalBytes += (await stat(file)).size;
    }
    assert.ok(
      totalBytes < 102400,
      `Peso estático total da vitrine pública (${totalBytes} bytes) deve ser < 100 KB (102400 bytes)`
    );

    assert.equal(
      pgHarness.getQueryCount(),
      0,
      'Nenhuma consulta ao banco PostgreSQL administrativo pode ocorrer no consumo público'
    );
  });

  await t.test('5.1. Persistência entre isolates (cold start) para slug publicado (ex.: pipira rev 6) em vitrine/painel/workers.dev e página 404 para slugs desconhecidos/não publicados', async () => {
    // Cria a vitrine pipira e avança até a revisão 6 antes de publicar
    const createPipiraRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/sites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${auroraJwt}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Pipira Forno & Brasa',
          slug: 'pipira',
          template: 'pizzeria-v1',
          whatsapp: '5511966665555'
        })
      }),
      env
    );
    assert.equal(createPipiraRes.status, 201);
    const pipiraSiteId = (await createPipiraRes.json()).site.id;

    // Antes de publicar, acessar /pipira deve retornar a página 404 HTML com status 404 e CSP estrita
    clearPublicationsCache();
    const unpubRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/pipira'),
      env
    );
    assert.equal(unpubRes.status, 404);
    assert.match(unpubRes.headers.get('content-type') || '', /text\/html/i);
    assert.equal(unpubRes.headers.get('content-security-policy'), STRICT_CSP_HEADER);
    const unpubHtml = await unpubRes.text();
    assert.match(unpubHtml, /Essa página<br>não está aqui\./);

    const pipiraCatalog = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pipira',
      businessName: 'Pipira Forno & Brasa',
      whatsapp: '5511966665555',
      categories: [
        {
          name: 'Pizzas Artesanais Pipira',
          items: [
            {
              id: 'pipira-especial',
              name: 'Pipira Especial da Casa',
              description: 'Queijo coalho tostado, tomate confit e manjericão.',
              priceCents: 5890,
              active: true
            }
          ]
        }
      ]
    };

    for (let rev = 1; rev < 6; rev += 1) {
      const saveRes = await worker.fetch(
        new Request(`https://painel.inspira.dev.br/api/sites/${pipiraSiteId}/draft`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${auroraJwt}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            revision: rev,
            content: pipiraCatalog
          })
        }),
        env
      );
      assert.equal(saveRes.status, 200);
    }

    const publishPipiraRes = await worker.fetch(
      new Request(`https://painel.inspira.dev.br/api/sites/${pipiraSiteId}/publish`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${auroraJwt}` }
      }),
      env
    );
    assert.equal(publishPipiraRes.status, 200);
    const { publication: pipiraPub } = await publishPipiraRes.json();
    assert.equal(pipiraPub.slug, 'pipira');
    assert.equal(pipiraPub.revision, 6);
    assert.equal(pipiraPub.url, '/pipira');

    // Simula novo isolate (cold start) limpando a memória do Worker
    clearPublicationsCache();

    for (const host of [
      'https://vitrine.inspira.dev.br',
      'https://painel.inspira.dev.br',
      'https://vitrine-inspira.inspira.workers.dev'
    ]) {
      clearPublicationsCache();
      const pageRes = await worker.fetch(new Request(`${host}/pipira`), env);
      assert.equal(pageRes.status, 200, `GET ${host}/pipira deve retornar 200`);
      assert.match(pageRes.headers.get('content-type') || '', /text\/html/i);
      assert.equal(pageRes.headers.get('cache-control'), STOREFRONT_CACHE_CONTROL);
      assert.equal(pageRes.headers.get('content-security-policy'), STRICT_CSP_HEADER);
      assert.equal(pageRes.headers.get('x-content-type-options'), 'nosniff');
      assert.equal(pageRes.headers.get('x-frame-options'), 'DENY');
      const html = await pageRes.text();
      assert.match(html, /Pipira Forno &amp; Brasa/);
      assert.match(html, /\/pipira/);
      assert.match(html, /Pipira Especial da Casa/);
      assert.match(html, /R\$\s*58,90/);
      assert.doesNotMatch(html, /Essa página<br>não está aqui\./);
    }

    // Verifica leitura cold-start de /data/vitrines/pipira/menu.json e release imutável por hash
    clearPublicationsCache();
    const pipiraMenuRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/data/vitrines/pipira/menu.json'),
      env
    );
    assert.equal(pipiraMenuRes.status, 200);
    assert.deepEqual(await pipiraMenuRes.json(), pipiraPub.menu);

    clearPublicationsCache();
    const pipiraReleaseRes = await worker.fetch(
      new Request(`https://vitrine.inspira.dev.br${pipiraPub.immutableMenuUrl}`),
      env
    );
    assert.equal(pipiraReleaseRes.status, 200);
    assert.equal(pipiraReleaseRes.headers.get('cache-control'), IMMUTABLE_CACHE_CONTROL);
    assert.deepEqual(await pipiraReleaseRes.json(), pipiraPub.menu);

    // Slug desconhecido continua retornando 404 com a página 404 HTML e cabeçalhos de segurança
    const unknownRes = await worker.fetch(
      new Request('https://vitrine.inspira.dev.br/slug-totalmente-inexistente'),
      env
    );
    assert.equal(unknownRes.status, 404);
    assert.match(unknownRes.headers.get('content-type') || '', /text\/html/i);
    assert.equal(unknownRes.headers.get('content-security-policy'), STRICT_CSP_HEADER);
    assert.match(await unknownRes.text(), /Essa página<br>não está aqui\./);
  });

  await t.test('6. Logout (POST /api/auth/logout) revogando/expurgando o cookie __Host-vitrine_session', async () => {
    const logoutRes = await worker.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/logout', {
        method: 'POST',
        headers: { Cookie: `__Host-vitrine_session=${auroraJwt}` }
      }),
      env
    );
    assert.equal(logoutRes.status, 200);
    const logoutBody = await logoutRes.json();
    assert.equal(logoutBody.ok, true);

    const setCookie = logoutRes.headers.get('set-cookie') || '';
    assert.match(setCookie, /^__Host-vitrine_session=;/);
    assert.match(setCookie, /Max-Age=0/);
    assert.match(setCookie, /Path=\//);
    assert.match(setCookie, /HttpOnly/);
    assert.match(setCookie, /Secure/);
    assert.match(setCookie, /SameSite=Lax/);
  });
});
