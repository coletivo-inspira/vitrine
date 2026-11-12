import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler } from '../workers/api.mjs';
import { signPreviewToken, verifyPreviewToken } from '../src/preview-token.mjs';

const siteId = '20000000-0000-0000-0000-000000000001';
const ownerId = '10000000-0000-0000-0000-000000000001';
const memberId = '10000000-0000-0000-0000-000000000002';
const origin = 'https://vitrine.test';
const env = { PREVIEW_HMAC_SECRET: 'segredo-exclusivo-do-teste' };

test('Token de prévia vincula sessão, vitrine, revisão e validade', async () => {
  const token = await signPreviewToken(env.PREVIEW_HMAC_SECRET, siteId, ownerId, 3, 0);
  assert.equal(await verifyPreviewToken(env.PREVIEW_HMAC_SECRET, token, siteId, ownerId, 1_799_000), 3);
  assert.equal(await verifyPreviewToken(env.PREVIEW_HMAC_SECRET, token, siteId, ownerId, 1_800_000), null);
  assert.equal(await verifyPreviewToken(env.PREVIEW_HMAC_SECRET, token, siteId, memberId, 0), null);
  assert.equal(await verifyPreviewToken('outra-chave', token, siteId, ownerId, 0), null);
});

test('Equipe, prévia privada e rollback pelo Worker', async () => {
  const api = createApiHandler();
  const route = `/api/sites/${siteId}`;
  const send = (path, { method = 'GET', payload, token = 'token-owner', sameOrigin = true } = {}) =>
    api(new Request(origin + path, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(sameOrigin ? { origin } : {}),
        ...(payload !== undefined ? { 'content-type': 'application/json' } : {})
      },
      ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
    }), env);

  assert.equal((await send(route + '/members', {
    method: 'POST', payload: { userId: memberId, role: 'viewer' }, sameOrigin: false
  })).status, 403);
  assert.equal((await send(route + '/members', {
    method: 'POST', payload: { userId: memberId, role: 'viewer' }
  })).status, 200);
  assert.equal((await send(route + '/members', { token: 'token-member' })).status, 404);
  const { logs } = await (await send(route + '/audit-logs')).json();
  assert.equal(logs[0].entityId, memberId);

  const preview = await send(route + '/preview-token', { method: 'POST', payload: {} });
  assert.equal(preview.status, 200);
  const { url } = await preview.json();
  assert.equal((await send(url, { token: 'token-member' })).status, 404);
  const page = await send(url);
  assert.equal(page.status, 200);
  assert.equal(page.headers.get('cache-control'), 'no-store');
  assert.equal(page.headers.get('x-robots-tag'), 'noindex, nofollow');

  const initial = (await (await send(route + '/draft')).json()).draft;
  const items = initial.content.items?.length
    ? initial.content.items
    : initial.content.categories.flatMap(category => category.items);
  const toggle = { targetType: 'item', targetId: items[0].id, active: false };
  assert.equal((await send(route + '/quick-toggle', {
    method: 'PATCH', payload: toggle, token: 'token-member'
  })).status, 404);
  assert.equal((await send(route + '/quick-toggle', { method: 'PATCH', payload: toggle })).status, 200);
  assert.equal((await send(url)).status, 404);
  assert.equal((await send(route + '/quick-toggle', {
    method: 'PATCH', payload: { ...toggle, active: true }
  })).status, 200);

  const published = await send(route + '/publish', { method: 'POST' });
  assert.equal(published.status, 200);
  const { draft } = await (await send(route + '/draft')).json();
  draft.content.businessName = 'Segunda versão';
  assert.equal((await send(route + '/draft', { method: 'PUT', payload: draft })).status, 200);
  assert.equal((await send(url)).status, 404);
  assert.equal((await send(route + '/publish', { method: 'POST' })).status, 200);

  const { releases } = await (await send(route + '/releases')).json();
  assert.deepEqual(releases.map(entry => entry.revision), [4, 3]);
  const restored = await send(route + '/rollback', { method: 'POST', payload: { targetRevision: 3 } });
  assert.equal(restored.status, 200);
  assert.equal((await restored.json()).publication.revision, 3);
});
