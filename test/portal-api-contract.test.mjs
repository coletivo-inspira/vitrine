import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../workers/api.mjs';
import {
  STRICT_CSP_HEADER,
  SUPABASE_PUBLIC_PROJECT_URL,
  clearJwksCache,
  isPublishableAnonKey
} from '../workers/api.mjs';
import {
  checkSession,
  exchangePkceCode,
  fetchAuthConfig,
  startGoogleLogin
} from '../web/portal/portal.js';

const ownerId = '10000000-0000-0000-0000-000000000001';
const siteAId = '20000000-0000-0000-0000-000000000001';
const siteBId = '20000000-0000-0000-0000-000000000002';

test('Frente QA - Contratos HTTP das APIs do Portal', async (t) => {
  const api = createApiHandler();

  await t.test('Valida 401 UNAUTHORIZED sem token válido', async () => {
    const req = new Request('http://localhost/api/sites');
    const res = await api.fetch(req);
    assert.equal(res.status, 401);
    const body = await res.json();
    assert.equal(body.error.code, 'UNAUTHORIZED');
  });

  await t.test('Valida login com cookie Host-only e sessao de usuario', async () => {
    const req = new Request('http://localhost/api/auth/session', {
      headers: {
        'Cookie': '__Host-vitrine_session=token-owner'
      }
    });
    const res = await api.fetch(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.authenticated, true);
    assert.equal(body.user.id, ownerId);
  });

  await t.test('Valida logout limpando cookie', async () => {
    const req = new Request('http://localhost/api/auth/logout', { method: 'POST' });
    const res = await api.fetch(req);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.ok(res.headers.get('Set-Cookie').includes('Max-Age=0'));
  });

  await t.test('GET /api/sites - owner vê duas, collaborator vê uma, stranger vê zero', async () => {
    // Owner
    const reqOwner = new Request('http://localhost/api/sites', {
      headers: { 'Authorization': 'Bearer token-owner' }
    });
    const resOwner = await api.fetch(reqOwner);
    assert.equal(resOwner.status, 200);
    const bodyOwner = await resOwner.json();
    assert.equal(bodyOwner.sites.length, 2);
    assert.equal(bodyOwner.sites[0].role, 'owner');

    // Collaborator (Member)
    const reqMember = new Request('http://localhost/api/sites', {
      headers: { 'Authorization': 'Bearer token-member' }
    });
    const resMember = await api.fetch(reqMember);
    assert.equal(resMember.status, 200);
    const bodyMember = await resMember.json();
    assert.equal(bodyMember.sites.length, 1);
    assert.equal(bodyMember.sites[0].id, siteAId);
    assert.equal(bodyMember.sites[0].role, 'collaborator');

    // Stranger
    const reqStranger = new Request('http://localhost/api/sites', {
      headers: { 'Authorization': 'Bearer token-stranger' }
    });
    const resStranger = await api.fetch(reqStranger);
    assert.equal(resStranger.status, 200);
    const bodyStranger = await resStranger.json();
    assert.equal(bodyStranger.sites.length, 0);
  });

  await t.test('POST /api/sites - rejeita slugs invalidos/reservados', async () => {
    const invalidSlugs = ['ab', 'a'.repeat(45), 'admin', 'www', 'assets', 'pizza_grande'];
    for (const slug of invalidSlugs) {
      const req = new Request('http://localhost/api/sites', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer token-owner',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: 'Nova Pizzaria', slug })
      });
      const res = await api.fetch(req);
      assert.equal(res.status, 400);
      const body = await res.json();
      assert.equal(body.error.code, 'INVALID_SLUG');
    }
  });

  await t.test('POST /api/sites - rejeita slug já em uso', async () => {
    const req = new Request('http://localhost/api/sites', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token-owner',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Pizzaria A Duplicada', slug: 'pizza-a' })
    });
    const res = await api.fetch(req);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.error.code, 'SLUG_TAKEN');
  });

  await t.test('POST /api/sites - cria com sucesso nova vitrine e rascunho', async () => {
    const req = new Request('http://localhost/api/sites', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer token-owner',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ name: 'Pizzaria Imperial', slug: 'pizza-imperial' })
    });
    const res = await api.fetch(req);
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.ok(body.site.id);
    assert.equal(body.site.slug, 'pizza-imperial');
    assert.equal(body.site.role, 'owner');
    assert.equal(body.draft.revision, 1);
    assert.equal(body.draft.content.businessName, 'Pizzaria Imperial');
  });

  await t.test('GET /api/sites/:siteId/draft - isolamento do colaborador', async () => {
    // Membro tem acesso à vitrine A
    const reqOk = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      headers: { 'Authorization': 'Bearer token-member' }
    });
    const resOk = await api.fetch(reqOk);
    assert.equal(resOk.status, 200);
    const bodyOk = await resOk.json();
    assert.equal(bodyOk.draft.siteId, siteAId);

    // Membro NÃO tem acesso à vitrine B, deve retornar 404 SITE_NOT_FOUND para evitar vazamento
    const reqForbidden = new Request(`http://localhost/api/sites/${siteBId}/draft`, {
      headers: { 'Authorization': 'Bearer token-member' }
    });
    const resForbidden = await api.fetch(reqForbidden);
    assert.equal(resForbidden.status, 404);
    const bodyForbidden = await resForbidden.json();
    assert.equal(bodyForbidden.error.code, 'SITE_NOT_FOUND');
  });

  await t.test('PUT /api/sites/:siteId/draft - validações e concorrência', async () => {
    const validContent = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pizza-a',
      businessName: 'Pizza A',
      whatsapp: '5511999999999',
      items: [
        { id: '1', name: 'Pizza', priceCents: 4500, active: true, available: true }
      ]
    };

    // 1. Rejeição de revisão inválida
    const reqRevInvalid = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 0, content: validContent })
    });
    const resRevInvalid = await api.fetch(reqRevInvalid);
    assert.equal(resRevInvalid.status, 400);
    assert.equal((await resRevInvalid.json()).error.code, 'INVALID_REVISION');

    // 2. Rejeição de payload muito grande (>256 KiB)
    const largeContent = { ...validContent, items: [] };
    for (let i = 0; i < 90; i++) {
      largeContent.items.push({ id: `item-${i}`, name: 'A'.repeat(3000), priceCents: 1000, active: false });
    }
    const reqTooLarge = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, content: largeContent })
    });
    const resTooLarge = await api.fetch(reqTooLarge);
    assert.equal(resTooLarge.status, 413);
    assert.equal((await resTooLarge.json()).error.code, 'DRAFT_TOO_LARGE');

    // 3. Rejeição de preço inválido
    const badPriceContent = {
      ...validContent,
      items: [{ id: '1', name: 'Pizza', priceCents: 0, active: true }]
    };
    const reqBadPrice = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, content: badPriceContent })
    });
    const resBadPrice = await api.fetch(reqBadPrice);
    assert.equal(resBadPrice.status, 422);
    assert.equal((await resBadPrice.json()).error.code, 'INVALID_PRICE_CENTS');

    // 4. Rejeição de WhatsApp inválido
    const badWaContent = { ...validContent, whatsapp: '1?text=evil' };
    const reqBadWa = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, content: badWaContent })
    });
    const resBadWa = await api.fetch(reqBadWa);
    assert.equal(resBadWa.status, 422);
    assert.equal((await resBadWa.json()).error.code, 'INVALID_WHATSAPP');

    // 5. Rejeição de limite de itens ativos excedido (> 20)
    const tooManyActive = { ...validContent, items: [] };
    for (let i = 1; i <= 21; i++) {
      tooManyActive.items.push({ id: `p${i}`, name: `Pizza ${i}`, priceCents: 1000, active: true, available: true });
    }
    const reqTooManyActive = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, content: tooManyActive })
    });
    const resTooManyActive = await api.fetch(reqTooManyActive);
    assert.equal(resTooManyActive.status, 422);
    assert.equal((await resTooManyActive.json()).error.code, 'ACTIVE_ITEMS_LIMIT_EXCEEDED');

    // 6. Rejeição de limite de itens totais excedido (> 100)
    const tooManyTotal = { ...validContent, items: [] };
    for (let i = 1; i <= 101; i++) {
      tooManyTotal.items.push({ id: `p${i}`, name: `Pizza ${i}`, priceCents: 1000, active: false });
    }
    const reqTooManyTotal = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, content: tooManyTotal })
    });
    const resTooManyTotal = await api.fetch(reqTooManyTotal);
    assert.equal(resTooManyTotal.status, 422);
    assert.equal((await resTooManyTotal.json()).error.code, 'TOTAL_ITEMS_LIMIT_EXCEEDED');

    // 7. Sucesso no salvamento com incremento de revision para revision + 1 (2)
    const reqOk = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, content: validContent })
    });
    const resOk = await api.fetch(reqOk);
    assert.equal(resOk.status, 200);
    const bodyOk = await resOk.json();
    assert.equal(bodyOk.draft.revision, 2);

    // 8. Rejeição de conflito de revisão (tentar enviar revision=1 novamente após incremento para 2)
    const reqConflict = new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { 'Authorization': 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: 1, content: validContent })
    });
    const resConflict = await api.fetch(reqConflict);
    assert.equal(resConflict.status, 409);
    const bodyConflict = await resConflict.json();
    assert.equal(bodyConflict.error.code, 'REVISION_CONFLICT');
    assert.equal(bodyConflict.error.currentRevision, 2);
  });

  await t.test('GET /api/auth/config - serve apenas chave pública/anon com no-store e recusa segredos', async () => {
    const b64url = (obj) =>
      Buffer.from(JSON.stringify(obj))
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');
    const anonJwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role: 'anon', iss: 'supabase' })}.sig`;
    const serviceRoleJwt = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ role: 'service_role', iss: 'supabase' })}.sig`;

    assert.equal(isPublishableAnonKey('sb_publishable_live_key_12345'), true);
    assert.equal(isPublishableAnonKey(anonJwt), true);
    assert.equal(isPublishableAnonKey(''), false);
    assert.equal(isPublishableAnonKey('sb_secret_live_key_12345'), false);
    assert.equal(isPublishableAnonKey('sbp_personal_access_token'), false);
    assert.equal(isPublishableAnonKey(serviceRoleJwt), false);

    // 1. Sucesso com publishable key (sb_publishable_...)
    const resPub = await api.fetch(new Request('http://localhost/api/auth/config'), {
      SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
      SUPABASE_ANON_KEY: 'sb_publishable_vitrine_public_123'
    });
    assert.equal(resPub.status, 200);
    assert.equal(resPub.headers.get('cache-control'), 'no-store');
    assert.equal(resPub.headers.get('content-security-policy'), STRICT_CSP_HEADER);
    assert.equal(resPub.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(resPub.headers.get('x-frame-options'), 'DENY');
    const bodyPub = await resPub.json();
    assert.deepEqual(bodyPub, {
      supabaseUrl: SUPABASE_PUBLIC_PROJECT_URL,
      publishableKey: 'sb_publishable_vitrine_public_123'
    });

    // 2. Sucesso com chave anon JWT legada (role=anon)
    const resAnonJwt = await api.fetch(new Request('http://localhost/api/auth/config'), {
      SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
      SUPABASE_ANON_KEY: anonJwt
    });
    assert.equal(resAnonJwt.status, 200);
    assert.equal((await resAnonJwt.json()).publishableKey, anonJwt);

    // 3. Recusa quando SUPABASE_ANON_KEY está ausente, sb_secret_ ou JWT service_role
    for (const forbiddenKey of ['', 'sb_secret_do_not_expose_999', 'sbp_token_999', serviceRoleJwt]) {
      const resRejected = await api.fetch(new Request('http://localhost/api/auth/config'), {
        SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
        SUPABASE_ANON_KEY: forbiddenKey
      });
      assert.equal(resRejected.status, 503);
      assert.equal(resRejected.headers.get('cache-control'), 'no-store');
      const rawText = await resRejected.text();
      if (forbiddenKey) {
        assert.equal(rawText.includes(forbiddenKey), false, 'Jamais deve vazar chave recusada na resposta');
      }
      const errBody = JSON.parse(rawText);
      assert.equal(errBody.error.code, 'AUTH_CONFIG_UNAVAILABLE');
    }

    // 4. Método diferente de GET retorna 405
    const resMethod = await api.fetch(
      new Request('http://localhost/api/auth/config', { method: 'POST' }),
      { SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL, SUPABASE_ANON_KEY: 'sb_publishable_vitrine_public_123' }
    );
    assert.equal(resMethod.status, 405);
  });

  await t.test('portal.js startGoogleLogin - busca /api/auth/config antes de montar OAuth PKCE e exibe erro claro sem entrar no modo demo quando ausente', async () => {
    const storageMap = new Map();
    const mockSessionStorage = {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    };

    // 1. Quando /api/auth/config retorna configuração válida, monta URL OAuth PKCE e redireciona
    const navigatedUrls = [];
    const feedbackCalls = [];
    const authUrl = await startGoogleLogin({
      origin: 'https://vitrine-inspira.vitrineinspira.workers.dev',
      sessionStorage: mockSessionStorage,
      navigate: (url) => navigatedUrls.push(url),
      showFeedback: (msg, type) => feedbackCalls.push({ msg, type }),
      fetch: (input) =>
        api.fetch(new Request(new URL(input, 'http://localhost')), {
          SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
          SUPABASE_ANON_KEY: 'sb_publishable_portal_login_key'
        })
    });

    assert.equal(feedbackCalls.length, 0);
    assert.equal(navigatedUrls.length, 1);
    assert.equal(authUrl, navigatedUrls[0]);
    const parsedOAuth = new URL(authUrl);
    assert.equal(parsedOAuth.origin, SUPABASE_PUBLIC_PROJECT_URL);
    assert.equal(parsedOAuth.pathname, '/auth/v1/authorize');
    assert.equal(parsedOAuth.searchParams.get('provider'), 'google');
    assert.equal(parsedOAuth.searchParams.get('code_challenge_method'), 's256');
    assert.ok((parsedOAuth.searchParams.get('code_challenge') || '').length >= 40);
    assert.equal(
      parsedOAuth.searchParams.get('redirect_to'),
      'https://vitrine-inspira.vitrineinspira.workers.dev/portal/'
    );
    assert.ok((storageMap.get('pkce_verifier') || '').length >= 40);
    assert.equal(storageMap.get('supabase_publishable_key'), 'sb_publishable_portal_login_key');
    assert.equal(storageMap.has('portal_local_authenticated'), false);

    // 2. Quando /api/auth/config está indisponível (sem SUPABASE_ANON_KEY), exibe erro claro e NÃO entra no modo demo local
    storageMap.clear();
    const missingNavigated = [];
    const missingFeedback = [];
    const resultMissing = await startGoogleLogin({
      origin: 'https://vitrine-inspira.vitrineinspira.workers.dev',
      sessionStorage: mockSessionStorage,
      navigate: (url) => missingNavigated.push(url),
      showFeedback: (msg, type) => missingFeedback.push({ msg, type }),
      fetch: (input) => api.fetch(new Request(new URL(input, 'http://localhost')), {})
    });

    assert.equal(resultMissing, null);
    assert.equal(missingNavigated.length, 0);
    assert.equal(missingFeedback.length, 1);
    assert.equal(missingFeedback[0].type, 'error');
    assert.match(missingFeedback[0].msg, /Configuração de autenticação do Supabase ausente ou indisponível/i);
    assert.doesNotMatch(missingFeedback[0].msg, /Redirecionando para o modo local/i);
    assert.equal(storageMap.has('portal_local_authenticated'), false);

    // 3. fetchAuthConfig retorna null quando o endpoint recusa chave secreta
    const refusedConfig = await fetchAuthConfig((input) =>
      api.fetch(new Request(new URL(input, 'http://localhost')), {
        SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
        SUPABASE_ANON_KEY: 'sb_secret_never_expose'
      })
    );
    assert.equal(refusedConfig, null);
  });

  await t.test('POST /api/auth/session e callback PKCE (?code=...) em portal.js - troca código por token, valida ES256/JWKS, grava cookie __Host-vitrine_session, limpa verifier/URL e abre dashboard', async () => {
    clearJwksCache();
    const b64url = (input) =>
      Buffer.from(input)
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/g, '');

    const { publicKey, privateKey } = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify']
    );
    const publicJwk = await crypto.subtle.exportKey('jwk', publicKey);
    const kid = 'pkce-es256-key-1';
    const jwks = {
      keys: [
        {
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          kid,
          x: publicJwk.x,
          y: publicJwk.y
        }
      ]
    };

    async function signEs256(payload, signingKey = privateKey, headerKid = kid) {
      const headerPart = b64url(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: headerKid }));
      const payloadPart = b64url(JSON.stringify(payload));
      const signingInput = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
      const sigBuffer = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        signingKey,
        signingInput
      );
      return `${headerPart}.${payloadPart}.${b64url(new Uint8Array(sigBuffer))}`;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const validAccessToken = await signEs256({
      sub: ownerId,
      iss: `${SUPABASE_PUBLIC_PROJECT_URL}/auth/v1`,
      aud: 'authenticated',
      role: 'authenticated',
      exp: nowSec + 1800
    });
    const expiredAccessToken = await signEs256({
      sub: ownerId,
      iss: `${SUPABASE_PUBLIC_PROJECT_URL}/auth/v1`,
      aud: 'authenticated',
      role: 'authenticated',
      exp: nowSec - 60
    });

    const envWithJwks = {
      SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
      SUPABASE_ANON_KEY: 'sb_publishable_portal_pkce_key',
      SUPABASE_JWKS: jwks
    };

    // 1. POST /api/auth/session bloqueia Login CSRF exigindo Origin igual à própria origem da requisição (403 sem Set-Cookie)
    for (const badOrigin of [
      null,
      '',
      'null',
      'https://attacker.example.com',
      'http://vitrine-inspira.vitrineinspira.workers.dev',
      'https://vitrine-inspira.vitrineinspira.workers.dev:8443'
    ]) {
      const headers = new Headers({ 'Content-Type': 'application/json' });
      if (badOrigin !== null) {
        headers.set('Origin', badOrigin);
      }
      const csrfRes = await api.fetch(
        new Request('https://vitrine-inspira.vitrineinspira.workers.dev/api/auth/session', {
          method: 'POST',
          headers,
          body: JSON.stringify({ accessToken: validAccessToken })
        }),
        envWithJwks
      );
      assert.equal(csrfRes.status, 403, `Origin ${String(badOrigin)} deve ser rejeitado com 403`);
      assert.equal(csrfRes.headers.get('set-cookie'), null, 'Jamais deve definir cookie em tentativa de Login CSRF');
      const csrfBody = await csrfRes.json();
      assert.equal(csrfBody.error.code, 'FORBIDDEN_ORIGIN');
    }

    // 2. POST /api/auth/session exige Content-Type: application/json e rejeita text/plain ou form bodies com 415 sem Set-Cookie
    for (const badContentType of [
      null,
      '',
      'text/plain',
      'text/plain; charset=utf-8',
      'application/x-www-form-urlencoded',
      'multipart/form-data; boundary=---123'
    ]) {
      const headers = new Headers({
        Origin: 'https://vitrine-inspira.vitrineinspira.workers.dev'
      });
      if (badContentType !== null) {
        headers.set('Content-Type', badContentType);
      }
      const mediaRes = await api.fetch(
        new Request('https://vitrine-inspira.vitrineinspira.workers.dev/api/auth/session', {
          method: 'POST',
          headers,
          body: JSON.stringify({ accessToken: validAccessToken })
        }),
        envWithJwks
      );
      assert.equal(mediaRes.status, 415, `Content-Type ${String(badContentType)} deve ser rejeitado com 415`);
      assert.equal(mediaRes.headers.get('set-cookie'), null, 'Jamais deve definir cookie quando Content-Type é inválido');
      const mediaBody = await mediaRes.json();
      assert.equal(mediaBody.error.code, 'UNSUPPORTED_MEDIA_TYPE');
    }

    // 3. POST /api/auth/session rejeita tokens inválidos/expirados sem definir Set-Cookie
    for (const badBody of [{}, { accessToken: '' }, { accessToken: 'invalid.jwt.token' }, { accessToken: expiredAccessToken }]) {
      const badRes = await api.fetch(
        new Request('https://vitrine-inspira.vitrineinspira.workers.dev/api/auth/session', {
          method: 'POST',
          headers: {
            Origin: 'https://vitrine-inspira.vitrineinspira.workers.dev',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(badBody)
        }),
        envWithJwks
      );
      assert.equal(badRes.status, 401);
      assert.equal(badRes.headers.get('set-cookie'), null, 'Jamais deve definir cookie para token inválido');
    }

    // 4. POST /api/auth/session aceita ES256 válido com Origin correspondente e Content-Type application/json (incluindo charset) e define __Host-vitrine_session
    const establishRes = await api.fetch(
      new Request('https://vitrine-inspira.vitrineinspira.workers.dev/api/auth/session', {
        method: 'POST',
        headers: {
          Origin: 'https://vitrine-inspira.vitrineinspira.workers.dev',
          'Content-Type': 'application/json; charset=utf-8'
        },
        body: JSON.stringify({ accessToken: validAccessToken })
      }),
      envWithJwks
    );
    assert.equal(establishRes.status, 200);
    const establishBody = await establishRes.json();
    assert.deepEqual(establishBody, {
      authenticated: true,
      user: { id: ownerId }
    });
    const setCookieHeader = establishRes.headers.get('set-cookie') || '';
    assert.match(setCookieHeader, /^__Host-vitrine_session=[^;]+;/);
    assert.match(setCookieHeader, /Path=\//);
    assert.match(setCookieHeader, /HttpOnly/);
    assert.match(setCookieHeader, /Secure/);
    assert.match(setCookieHeader, /SameSite=Lax/);
    assert.doesNotMatch(setCookieHeader, /Domain=/i);

    // 3. Fluxo completo no portal.js: startGoogleLogin -> redirect ?code=... -> checkSession troca código, envia ao Worker, limpa verifier e URL, e carrega o dashboard
    const storageMap = new Map();
    const mockSessionStorage = {
      getItem: (k) => storageMap.get(k) ?? null,
      setItem: (k, v) => storageMap.set(k, String(v)),
      removeItem: (k) => storageMap.delete(k)
    };

    await startGoogleLogin({
      origin: 'https://vitrine-inspira.vitrineinspira.workers.dev',
      sessionStorage: mockSessionStorage,
      navigate: () => {},
      showFeedback: () => {},
      fetch: (input, init) =>
        api.fetch(new Request(new URL(input, 'https://vitrine-inspira.vitrineinspira.workers.dev'), init), envWithJwks)
    });
    const savedVerifier = storageMap.get('pkce_verifier');
    assert.ok(savedVerifier && savedVerifier.length >= 40);

    const tokenExchangeRequests = [];
    const replaceStateCalls = [];
    const sectionChanges = [];
    const feedbackMessages = [];
    let activeCookie = '';
    let sitesLoadedCount = 0;

    const pkceFetch = async (input, init = {}) => {
      const reqUrl = new URL(
        input instanceof Request ? input.url : String(input),
        'https://vitrine-inspira.vitrineinspira.workers.dev'
      );
      if (reqUrl.origin === SUPABASE_PUBLIC_PROJECT_URL && reqUrl.pathname === '/auth/v1/token') {
        const headers = new Headers(init.headers || {});
        const body = JSON.parse(String(init.body || '{}'));
        tokenExchangeRequests.push({
          url: reqUrl.toString(),
          method: init.method || 'GET',
          apikey: headers.get('apikey'),
          body
        });
        return new Response(
          JSON.stringify({
            access_token: validAccessToken,
            refresh_token: 'ephemeral-refresh-token-never-persist',
            token_type: 'bearer',
            expires_in: 1800
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        );
      }

      const headers = new Headers(init.headers || {});
      if ((init.method || 'GET').toUpperCase() === 'POST' && !headers.has('origin')) {
        headers.set('origin', reqUrl.origin);
      }
      if (activeCookie && !headers.has('cookie')) {
        headers.set('cookie', activeCookie);
      }
      const workerReq = new Request(reqUrl.toString(), {
        method: init.method || 'GET',
        headers,
        body: init.body
      });
      const workerRes = await api.fetch(workerReq, envWithJwks);
      const sc = workerRes.headers.get('set-cookie');
      if (sc) {
        activeCookie = sc.split(';')[0];
      }
      return workerRes;
    };

    const callbackResult = await checkSession({
      locationHref: 'https://vitrine-inspira.vitrineinspira.workers.dev/portal/?code=9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      sessionStorage: mockSessionStorage,
      history: {
        replaceState: (state, title, url) => replaceStateCalls.push({ state, title, url })
      },
      showSection: (sec) => sectionChanges.push(sec),
      showFeedback: (msg, type) => feedbackMessages.push({ msg, type }),
      loadSites: async () => {
        sitesLoadedCount += 1;
      },
      fetch: pkceFetch
    });

    assert.equal(callbackResult.ok, true);
    assert.equal(callbackResult.user.id, ownerId);
    assert.equal(tokenExchangeRequests.length, 1);
    assert.equal(
      tokenExchangeRequests[0].url,
      `${SUPABASE_PUBLIC_PROJECT_URL}/auth/v1/token?grant_type=pkce`
    );
    assert.equal(tokenExchangeRequests[0].method, 'POST');
    assert.equal(tokenExchangeRequests[0].apikey, 'sb_publishable_portal_pkce_key');
    assert.deepEqual(tokenExchangeRequests[0].body, {
      auth_code: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
      code_verifier: savedVerifier
    });
    assert.equal(activeCookie, `__Host-vitrine_session=${validAccessToken}`);
    assert.equal(storageMap.has('pkce_verifier'), false, 'pkce_verifier deve ser removido após a troca');
    for (const [k, v] of storageMap.entries()) {
      assert.doesNotMatch(k, /refresh/i);
      assert.doesNotMatch(String(v), /ephemeral-refresh-token-never-persist/);
    }
    assert.equal(replaceStateCalls.length, 1);
    assert.equal(replaceStateCalls[0].url, '/portal/');
    assert.deepEqual(sectionChanges, ['dashboard']);
    assert.equal(sitesLoadedCount, 1);
    assert.equal(feedbackMessages.length, 0);

    // 4. Falha quando pkce_verifier está ausente/expirado: limpa URL, exibe erro claro e NÃO entra em modo demo
    storageMap.clear();
    replaceStateCalls.length = 0;
    sectionChanges.length = 0;
    feedbackMessages.length = 0;
    let tokenEndpointCalledOnMissingVerifier = false;

    const missingVerifierResult = await checkSession({
      locationHref: 'https://vitrine-inspira.vitrineinspira.workers.dev/portal/?code=code-sem-verifier',
      sessionStorage: mockSessionStorage,
      history: {
        replaceState: (state, title, url) => replaceStateCalls.push({ state, title, url })
      },
      showSection: (sec) => sectionChanges.push(sec),
      showFeedback: (msg, type) => feedbackMessages.push({ msg, type }),
      fetch: async () => {
        tokenEndpointCalledOnMissingVerifier = true;
        return new Response('Should not be called', { status: 500 });
      }
    });

    assert.equal(missingVerifierResult.ok, false);
    assert.equal(tokenEndpointCalledOnMissingVerifier, false);
    assert.equal(replaceStateCalls.length, 1);
    assert.equal(replaceStateCalls[0].url, '/portal/');
    assert.deepEqual(sectionChanges, ['auth']);
    assert.equal(feedbackMessages.length, 1);
    assert.equal(feedbackMessages[0].type, 'error');
    assert.match(feedbackMessages[0].msg, /verificador PKCE ausente|expirada/i);
    assert.equal(storageMap.has('portal_local_authenticated'), false);

    // 5. Falha quando a troca de token no Supabase falha (400 invalid_grant): limpa verifier e URL, exibe erro e NÃO entra em modo demo
    storageMap.clear();
    storageMap.set('pkce_verifier', 'verifier-para-codigo-expirado');
    replaceStateCalls.length = 0;
    sectionChanges.length = 0;
    feedbackMessages.length = 0;

    const failedExchangeResult = await exchangePkceCode('codigo-expirado-400', {
      locationHref: 'https://vitrine-inspira.vitrineinspira.workers.dev/portal/?code=codigo-expirado-400',
      sessionStorage: mockSessionStorage,
      history: {
        replaceState: (state, title, url) => replaceStateCalls.push({ state, title, url })
      },
      showSection: (sec) => sectionChanges.push(sec),
      showFeedback: (msg, type) => feedbackMessages.push({ msg, type }),
      fetch: async (input, init = {}) => {
        const reqUrl = new URL(
          input instanceof Request ? input.url : String(input),
          'https://vitrine-inspira.vitrineinspira.workers.dev'
        );
        if (reqUrl.pathname === '/auth/v1/token') {
          return new Response(JSON.stringify({ error: 'invalid_grant' }), {
            status: 400,
            headers: { 'content-type': 'application/json' }
          });
        }
        return api.fetch(new Request(reqUrl.toString(), init), envWithJwks);
      }
    });

    assert.equal(failedExchangeResult.ok, false);
    assert.equal(storageMap.has('pkce_verifier'), false);
    assert.equal(replaceStateCalls.length, 1);
    assert.equal(replaceStateCalls[0].url, '/portal/');
    assert.deepEqual(sectionChanges, ['auth']);
    assert.equal(feedbackMessages.length, 1);
    assert.equal(feedbackMessages[0].type, 'error');
    assert.match(feedbackMessages[0].msg, /Não foi possível trocar o código de autorização PKCE/i);
    assert.equal(storageMap.has('portal_local_authenticated'), false);
  });
});
