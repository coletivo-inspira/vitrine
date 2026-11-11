import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../workers/api.mjs';
import {
  STRICT_CSP_HEADER,
  SUPABASE_PUBLIC_PROJECT_URL,
  isPublishableAnonKey
} from '../workers/api.mjs';
import { fetchAuthConfig, startGoogleLogin } from '../web/portal/portal.js';

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
});
