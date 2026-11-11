import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../workers/api.mjs';

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
});
