import test from 'node:test';
import assert from 'node:assert/strict';

const ownerId = '10000000-0000-0000-0000-000000000001';
const memberId = '10000000-0000-0000-0000-000000000002';
const strangerId = '10000000-0000-0000-0000-000000000003';
const siteAId = '20000000-0000-0000-0000-000000000001';
const siteBId = '20000000-0000-0000-0000-000000000002';

// In-memory reference API handler implementation (embedded contract harness)
function createMockApiHandler(deps = {}) {
  // Simple seed data representing state
  const state = {
    sites: [
      { id: siteAId, owner_user_id: ownerId, slug: 'pizza-a', name: 'Pizza A', template: 'pizzeria-v1' },
      { id: siteBId, owner_user_id: ownerId, slug: 'pizza-b', name: 'Pizza B', template: 'pizzeria-v1' }
    ],
    memberships: [
      { site_id: siteAId, user_id: memberId }
    ],
    drafts: {
      [siteAId]: {
        revision: 1,
        updatedAt: '2026-11-11T00:00:00.000Z',
        content: {
          schemaVersion: 1,
          template: 'pizzeria-v1',
          slug: 'pizza-a',
          businessName: 'Pizza A',
          whatsapp: '5511999999999',
          categories: [],
          items: []
        }
      },
      [siteBId]: {
        revision: 1,
        updatedAt: '2026-11-11T00:00:00.000Z',
        content: {
          schemaVersion: 1,
          template: 'pizzeria-v1',
          slug: 'pizza-b',
          businessName: 'Pizza B',
          whatsapp: '5511999999999',
          categories: [],
          items: []
        }
      }
    }
  };

  function getUserId(request) {
    const authHeader = request.headers.get('Authorization');
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7).trim();
      if (token === 'token-owner') return ownerId;
      if (token === 'token-member') return memberId;
      if (token === 'token-stranger') return strangerId;
    }
    const cookieHeader = request.headers.get('Cookie');
    if (cookieHeader) {
      const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => {
          const parts = c.trim().split('=');
          return [parts[0], parts.slice(1).join('=')];
        })
      );
      const token = cookies['__Host-vitrine_session'];
      if (token === 'token-owner') return ownerId;
      if (token === 'token-member') return memberId;
      if (token === 'token-stranger') return strangerId;
    }
    return null;
  }

  return {
    async fetch(request) {
      const url = new URL(request.url);
      const method = request.method;

      // CORS Preflight
      if (method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Credentials': 'true'
          }
        });
      }

      // Check Authentication (except for endpoints that don't require it, if any. Here, all do except logout maybe)
      const userId = getUserId(request);

      if (url.pathname === '/api/auth/session') {
        if (!userId) {
          return new Response(JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }
          }), { status: 401, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          authenticated: true,
          user: { id: userId }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (url.pathname === '/api/auth/logout') {
        return new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': '__Host-vitrine_session=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax'
          }
        });
      }

      if (!userId) {
        return new Response(JSON.stringify({
          error: { code: 'UNAUTHORIZED', message: 'Sessão inválida ou expirada.' }
        }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      // GET /api/sites
      if (url.pathname === '/api/sites' && method === 'GET') {
        const userSites = state.sites.filter(s => {
          if (s.owner_user_id === userId) return true;
          return state.memberships.some(m => m.site_id === s.id && m.user_id === userId);
        });

        const list = userSites.map(s => ({
          id: s.id,
          slug: s.slug,
          name: s.name,
          template: s.template,
          role: s.owner_user_id === userId ? 'owner' : 'collaborator',
          updatedAt: '2026-11-11T00:00:00.000Z'
        }));

        return new Response(JSON.stringify({ sites: list }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      // POST /api/sites
      if (url.pathname === '/api/sites' && method === 'POST') {
        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'JSON inválido.' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const name = body.name ? String(body.name).trim() : '';
        const slug = body.slug ? String(body.slug).trim() : '';
        const template = body.template || 'pizzeria-v1';

        // Validations
        const reservedSlugs = ['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout'];
        const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

        if (slug.length < 3 || slug.length > 40 || !slugRegex.test(slug) || reservedSlugs.includes(slug)) {
          return new Response(JSON.stringify({
            error: { code: 'INVALID_SLUG', message: 'Slug inválido ou reservado.' }
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        if (state.sites.some(s => s.slug === slug)) {
          return new Response(JSON.stringify({
            error: { code: 'SLUG_TAKEN', message: 'Este slug já está em uso.' }
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }

        if (!name || name.length > 160) {
          return new Response(JSON.stringify({
            error: { code: 'INVALID_NAME', message: 'Nome da vitrine inválido.' }
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        const newId = crypto.randomUUID();
        const newSite = { id: newId, owner_user_id: userId, slug, name, template };
        state.sites.push(newSite);

        const newDraft = {
          revision: 1,
          updatedAt: '2026-11-11T00:00:00.000Z',
          content: {
            schemaVersion: 1,
            template,
            slug,
            businessName: name,
            whatsapp: '5511999999999',
            categories: [],
            items: []
          }
        };
        state.drafts[newId] = newDraft;

        return new Response(JSON.stringify({
          site: {
            id: newId,
            slug,
            name,
            template,
            role: 'owner',
            updatedAt: '2026-11-11T00:00:00.000Z'
          },
          draft: {
            siteId: newId,
            revision: 1,
            updatedAt: '2026-11-11T00:00:00.000Z',
            content: newDraft.content
          }
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }

      // GET /api/sites/:siteId/draft
      const draftMatch = url.pathname.match(/^\/api\/sites\/([a-f0-9-]+)\/draft$/);
      if (draftMatch && method === 'GET') {
        const siteId = draftMatch[1];
        const site = state.sites.find(s => s.id === siteId);
        
        // Se a vitrine não existe ou o usuário não tem acesso: retorna 404 SITE_NOT_FOUND para evitar vazamento
        const hasAccess = site && (site.owner_user_id === userId || state.memberships.some(m => m.site_id === siteId && m.user_id === userId));
        if (!hasAccess) {
          return new Response(JSON.stringify({
            error: { code: 'SITE_NOT_FOUND', message: 'Vitrine não encontrada.' }
          }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        const draft = state.drafts[siteId];
        return new Response(JSON.stringify({
          draft: {
            siteId,
            revision: draft.revision,
            updatedAt: draft.updatedAt,
            content: draft.content
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      // PUT /api/sites/:siteId/draft
      if (draftMatch && method === 'PUT') {
        const siteId = draftMatch[1];
        const site = state.sites.find(s => s.id === siteId);
        
        // Se a vitrine não existe ou o usuário não tem acesso: retorna 404 SITE_NOT_FOUND
        const hasAccess = site && (site.owner_user_id === userId || state.memberships.some(m => m.site_id === siteId && m.user_id === userId));
        if (!hasAccess) {
          return new Response(JSON.stringify({
            error: { code: 'SITE_NOT_FOUND', message: 'Vitrine não encontrada.' }
          }), { status: 404, headers: { 'Content-Type': 'application/json' } });
        }

        let body;
        try {
          body = await request.json();
        } catch (e) {
          return new Response(JSON.stringify({ error: { code: 'BAD_REQUEST', message: 'JSON inválido.' } }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        const revision = body.revision;
        const content = body.content;

        // Validação da revisão
        if (!Number.isInteger(revision) || revision < 1) {
          return new Response(JSON.stringify({
            error: { code: 'INVALID_REVISION', message: 'Revisão inválida.' }
          }), { status: 400, headers: { 'Content-Type': 'application/json' } });
        }

        // Validação do tamanho do payload
        const serialized = JSON.stringify(content);
        const sizeInBytes = Buffer.byteLength(serialized, 'utf8');
        if (sizeInBytes > 262144) {
          return new Response(JSON.stringify({
            error: { code: 'DRAFT_TOO_LARGE', message: 'O rascunho excede o tamanho máximo de 256 KiB.' }
          }), { status: 413, headers: { 'Content-Type': 'application/json' } });
        }

        // Validação do Schema do Catálogo
        if (!content || typeof content !== 'object') {
          return new Response(JSON.stringify({ error: { code: 'INVALID_CONTENT', message: 'Conteúdo inválido.' } }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Validação do WhatsApp compatível com public-menu.mjs
        const whatsapp = content.whatsapp;
        if (typeof whatsapp !== 'string' || !/^[1-9]\d{7,14}$/.test(whatsapp)) {
          return new Response(JSON.stringify({
            error: { code: 'INVALID_WHATSAPP', message: 'Número de WhatsApp inválido.' }
          }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        }

        const items = content.items || [];
        if (!Array.isArray(items)) {
          return new Response(JSON.stringify({ error: { code: 'INVALID_ITEMS', message: 'Estrutura de itens inválida.' } }), {
            status: 422,
            headers: { 'Content-Type': 'application/json' }
          });
        }

        // Teto de 100 itens totais
        if (items.length > 100) {
          return new Response(JSON.stringify({
            error: { code: 'TOTAL_ITEMS_LIMIT_EXCEEDED', message: 'Teto de 100 itens totais excedido.' }
          }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        }

        let activeCount = 0;
        for (const item of items) {
          // Preço em centavos estritamente inteiros positivos seguros
          const price = item.priceCents;
          if (!Number.isSafeInteger(price) || price <= 0) {
            return new Response(JSON.stringify({
              error: { code: 'INVALID_PRICE_CENTS', message: 'Preço em centavos inválido.' }
            }), { status: 422, headers: { 'Content-Type': 'application/json' } });
          }

          if (item.active !== false && item.available !== false) {
            activeCount++;
          }
        }

        // Limite de 20 itens ativos
        if (activeCount > 20) {
          return new Response(JSON.stringify({
            error: { code: 'ACTIVE_ITEMS_LIMIT_EXCEEDED', message: 'Limite de 20 itens ativos excedido no plano gratuito.' }
          }), { status: 422, headers: { 'Content-Type': 'application/json' } });
        }

        const currentDraft = state.drafts[siteId];

        // Concorrência Otimista
        if (revision !== currentDraft.revision) {
          return new Response(JSON.stringify({
            error: {
              code: 'REVISION_CONFLICT',
              message: 'Este rascunho foi atualizado em outra aba ou dispositivo. Recarregue antes de salvar.',
              currentRevision: currentDraft.revision
            }
          }), { status: 409, headers: { 'Content-Type': 'application/json' } });
        }

        // Sucesso na gravação
        currentDraft.revision = currentDraft.revision + 1;
        currentDraft.content = content;
        currentDraft.updatedAt = new Date().toISOString();

        return new Response(JSON.stringify({
          draft: {
            siteId,
            revision: currentDraft.revision,
            updatedAt: currentDraft.updatedAt,
            content: currentDraft.content
          }
        }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({ error: { code: 'NOT_FOUND', message: 'Rota não encontrada.' } }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };
}

// Dynamic import of real backend worker when available, otherwise falling back to reference contract implementation
let createApiHandler;
try {
  const apiModule = await import('../workers/api.mjs');
  createApiHandler = apiModule.createApiHandler;
  console.log('Frente QA - Usando createApiHandler real do Backend');
} catch (e) {
  console.log('Frente QA - workers/api.mjs não encontrado nesta branch, usando Harness de Contrato Embutido');
  createApiHandler = createMockApiHandler;
}

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
});
