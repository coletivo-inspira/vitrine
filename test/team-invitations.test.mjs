import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';
import { createLeadRateLimiter } from '../src/quote-webhook.mjs';
import { INVITATION_PAGE_CSP } from '../src/team-invitations.mjs';

const origin = 'https://painel.inspira.dev.br';
const ids = {
  owner: '10000000-0000-0000-0000-0000000000c1',
  admin: '10000000-0000-0000-0000-0000000000c2',
  editor: '10000000-0000-0000-0000-0000000000c3',
  viewer: '10000000-0000-0000-0000-0000000000c4',
  invitee: '10000000-0000-0000-0000-0000000000c5',
  stranger: '10000000-0000-0000-0000-0000000000c6'
};
const siteId = '20000000-0000-0000-0000-0000000000c1';
const otherSiteId = '20000000-0000-0000-0000-0000000000c2';
const authVerifier = (token) => (token?.startsWith('t-') ? { id: ids[token.slice(2)] ?? null } : null);
const sha256 = (value) => createHash('sha256').update(value).digest('hex');

function newStore() {
  return createMemoryStore({
    sites: [
      { id: siteId, owner_user_id: ids.owner, slug: 'pizza-equipe', name: 'Pizza Equipe', template: 'pizzeria-v1' },
      { id: otherSiteId, owner_user_id: ids.owner, slug: 'pizza-outra', name: 'Pizza Outra', template: 'pizzeria-v1' }
    ],
    memberships: [
      { site_id: siteId, user_id: ids.admin, role: 'admin' },
      { site_id: siteId, user_id: ids.editor, role: 'editor' },
      { site_id: siteId, user_id: ids.viewer, role: 'viewer' }
    ],
    drafts: [],
    profiles: [{ user_id: ids.owner, display_name: 'Ana Dona', whatsapp: '5511911111111' }]
  });
}

function setup({ limit = 1000 } = {}) {
  const store = newStore();
  const rateLimiter = createLeadRateLimiter({ limit, windowMs: 10 * 60 * 1000, maxKeys: 100 });
  const api = createApiHandler({ store, authVerifier, invitationRateLimiter: rateLimiter });
  return { store, api };
}

function call(api, path, { method = 'GET', user, body, headers, base = origin } = {}) {
  const init = { method, headers: { 'cf-connecting-ip': '203.0.113.7', ...(headers ?? {}) } };
  if (headers === undefined && method !== 'GET') {
    init.headers.origin = origin;
    if (body !== undefined) init.headers['content-type'] = 'application/json';
  }
  if (user) init.headers.authorization = `Bearer t-${user}`;
  if (body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  return api(new Request(`${base}${path}`, init));
}

function assertInvitationHeaders(res) {
  assert.equal(res.headers.get('cache-control'), 'private, no-store');
  assert.equal(res.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
}

async function expectError(res, status, code) {
  assert.equal(res.status, status);
  assertInvitationHeaders(res);
  const body = await res.json();
  assert.equal(body.error.code, code);
  assert.equal(typeof body.error.message, 'string');
  return body;
}

async function invite(api, user, role) {
  const res = await call(api, `/api/sites/${siteId}/invitations`, { method: 'POST', user, body: { role } });
  assert.equal(res.status, 201);
  const body = await res.json();
  return { ...body, token: body.url.split('/convite/')[1] };
}

const consoleLines = [];
for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
  const original = console[level];
  console[level] = (...args) => {
    consoleLines.push(args.map(String).join(' '));
    original.apply(console, args);
  };
}
const issuedTokens = [];

test('equipe: 401 sem sessão, 403 para editor e viewer, 404 para quem não é da vitrine', async () => {
  const { api } = setup();
  const team = `/api/sites/${siteId}/team`;
  const invitations = `/api/sites/${siteId}/invitations`;

  await expectError(await call(api, team), 401, 'UNAUTHORIZED');
  await expectError(await call(api, invitations, { method: 'POST', body: { role: 'viewer' } }), 401, 'UNAUTHORIZED');
  await expectError(await call(api, `${invitations}/30000000-0000-0000-0000-000000000001`, { method: 'DELETE' }), 401, 'UNAUTHORIZED');
  await expectError(await call(api, '/api/invitations/accept', { method: 'POST', body: { token: 'a'.repeat(43) } }), 401, 'UNAUTHORIZED');

  for (const user of ['editor', 'viewer']) {
    await expectError(await call(api, team, { user }), 403, 'FORBIDDEN');
    await expectError(await call(api, invitations, { method: 'POST', user, body: { role: 'viewer' } }), 403, 'FORBIDDEN');
    await expectError(await call(api, `${invitations}/30000000-0000-0000-0000-000000000001`, { method: 'DELETE', user }), 403, 'FORBIDDEN');
  }
  await expectError(await call(api, team, { user: 'stranger' }), 404, 'SITE_NOT_FOUND');
  await expectError(await call(api, invitations, { method: 'POST', user: 'stranger', body: { role: 'viewer' } }), 404, 'SITE_NOT_FOUND');
  await expectError(await call(api, '/api/sites/20000000-0000-0000-0000-0000000000ff/team', { user: 'owner' }), 404, 'SITE_NOT_FOUND');
  await expectError(await call(api, '/api/sites/nao-e-uuid/team', { user: 'owner' }), 404, 'SITE_NOT_FOUND');
  await expectError(await call(api, team, { method: 'PUT', user: 'owner', body: {} }), 405, 'METHOD_NOT_ALLOWED');

  await expectError(await call(api, invitations, {
    method: 'POST', user: 'owner', body: { role: 'viewer' }, headers: { 'content-type': 'application/json' }
  }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await call(api, invitations, {
    method: 'POST', user: 'owner', body: { role: 'viewer' }, headers: { origin: 'https://evil.example', 'content-type': 'application/json' }
  }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await call(api, invitations, { method: 'POST', user: 'owner', body: '{ruim' }), 400, 'INVALID_JSON');
  await expectError(await call(api, invitations, { method: 'POST', user: 'owner', body: { role: 'owner' } }), 422, 'INVALID_ROLE');
});

test('criação: link só na resposta 201, só o hash fica guardado e admin não convida admin', async () => {
  const { api, store } = setup();
  await expectError(await call(api, `/api/sites/${siteId}/invitations`, {
    method: 'POST', user: 'admin', body: { role: 'admin' }
  }), 403, 'ADMIN_INVITE_OWNER_ONLY');

  const res = await call(api, `/api/sites/${siteId}/invitations`, { method: 'POST', user: 'admin', body: { role: 'editor' } });
  assert.equal(res.status, 201);
  assertInvitationHeaders(res);
  const body = await res.json();
  assert.deepEqual(Object.keys(body).sort(), ['invitation', 'message', 'url']);
  assert.deepEqual(Object.keys(body.invitation).sort(), ['expiresAt', 'id', 'role']);
  assert.equal(body.invitation.role, 'editor');
  const days = (Date.parse(body.invitation.expiresAt) - Date.now()) / 86_400_000;
  assert.ok(days > 6.99 && days <= 7);
  assert.match(body.url, /^https:\/\/painel\.inspira\.dev\.br\/convite\/[A-Za-z0-9_-]{43}$/);
  const token = body.url.split('/convite/')[1];
  issuedTokens.push(token);
  assert.equal(
    body.message,
    `Oi! Estou chamando você para a equipe da vitrine Pizza Equipe na Vitrine Inspira, como Funcionário. Entre por este link: ${body.url}`
  );

  assert.equal(store.invitations.length, 1);
  assert.equal(store.invitations[0].tokenHash, sha256(token));
  assert.ok(!JSON.stringify(store.invitations).includes(token));
  const created = store.listAuditLogs ? await store.listAuditLogs(siteId) : [];
  assert.ok(created.some((entry) => entry.action === 'invitation_created'));
  assert.ok(!JSON.stringify(created).includes(token));
  assert.ok(!JSON.stringify(created).includes(sha256(token)));

  const teamRes = await call(api, `/api/sites/${siteId}/team`, { user: 'owner' });
  assert.equal(teamRes.status, 200);
  assertInvitationHeaders(teamRes);
  const teamText = await teamRes.text();
  assert.ok(!teamText.includes(token));
  assert.ok(!teamText.includes(sha256(token)));
  assert.doesNotMatch(teamText, /5511911111111|url|token|hash|email/i);
  const team = JSON.parse(teamText);
  assert.deepEqual(team.members, [
    { userId: ids.owner, displayName: 'Ana Dona', role: 'owner' },
    { userId: ids.admin, displayName: null, role: 'admin' },
    { userId: ids.editor, displayName: null, role: 'editor' },
    { userId: ids.viewer, displayName: null, role: 'viewer' }
  ]);
  assert.deepEqual(team.invitations, [body.invitation]);

  for (let index = 1; index < 20; index += 1) await invite(api, 'owner', 'viewer');
  await expectError(await call(api, `/api/sites/${siteId}/invitations`, {
    method: 'POST', user: 'owner', body: { role: 'viewer' }
  }), 409, 'TEAM_INVITATIONS_LIMIT');
  assert.equal((await (await call(api, `/api/sites/${siteId}/team`, { user: 'admin' })).json()).invitations.length, 20);
});

test('abertura e aceite: página curta, confirmação, uso único e quem já é da equipe', async () => {
  const { api, store } = setup();
  const created = await invite(api, 'owner', 'editor');
  issuedTokens.push(created.token);

  const page = await call(api, `/convite/${created.token}`);
  assert.equal(page.status, 200);
  assertInvitationHeaders(page);
  assert.equal(page.headers.get('content-security-policy'), INVITATION_PAGE_CSP);
  assert.doesNotMatch(INVITATION_PAGE_CSP, /unsafe-inline|script-src/);
  const html = await page.text();
  assert.match(html, /Pizza Equipe convidou você para a equipe como Funcionário/);
  assert.ok(html.includes(`href="/#/convite/${created.token}"`));
  assert.match(html, />Entrar e aceitar</);
  assert.doesNotMatch(html, /<script|style=/i);
  assert.equal(html.split(created.token).length, 2);

  const localPage = await call(api, `/convite/${created.token}`, { base: 'http://localhost:8787' });
  assert.ok((await localPage.text()).includes(`href="/portal/#/convite/${created.token}"`));
  const publicHost = await call(api, `/convite/${created.token}`, { base: 'https://vitrine.inspira.dev.br' });
  assert.equal(publicHost.status, 302);
  assertInvitationHeaders(publicHost);
  assert.equal(publicHost.headers.get('location'), `${origin}/convite/${created.token}`);

  const opened = (await store.listAuditLogs(siteId)).filter((entry) => entry.action === 'invitation_opened');
  assert.equal(opened.length, 1);

  const lookup = await call(api, '/api/invitations/lookup', { method: 'POST', body: { token: created.token } });
  assert.equal(lookup.status, 200);
  assertInvitationHeaders(lookup);
  assert.deepEqual(await lookup.json(), {
    kind: 'team', siteName: 'Pizza Equipe', role: 'editor', expiresAt: created.invitation.expiresAt
  });
  assert.equal((await store.listAuditLogs(siteId)).filter((entry) => entry.action === 'invitation_opened').length, 1);

  await expectError(await call(api, '/api/invitations/accept', { method: 'POST', user: 'editor', body: { token: created.token } }), 409, 'ALREADY_MEMBER');
  await expectError(await call(api, '/api/invitations/accept', { method: 'POST', user: 'owner', body: { token: created.token } }), 409, 'ALREADY_MEMBER');

  const accepted = await call(api, '/api/invitations/accept', { method: 'POST', user: 'invitee', body: { token: created.token } });
  assert.equal(accepted.status, 200);
  assertInvitationHeaders(accepted);
  assert.deepEqual(await accepted.json(), { siteId, slug: 'pizza-equipe', role: 'editor' });
  const mySites = (await (await call(api, '/api/sites', { user: 'invitee' })).json()).sites;
  assert.deepEqual(mySites.map((site) => [site.id, site.role]), [[siteId, 'editor']]);

  await expectError(await call(api, '/api/invitations/accept', { method: 'POST', user: 'stranger', body: { token: created.token } }), 404, 'INVITATION_UNAVAILABLE');
  await expectError(await call(api, '/api/invitations/lookup', { method: 'POST', body: { token: created.token } }), 404, 'INVITATION_UNAVAILABLE');
  await expectError(await call(api, '/api/invitations/lookup', {
    method: 'POST', body: { token: created.token }, headers: { 'content-type': 'application/json' }
  }), 403, 'FORBIDDEN_ORIGIN');
  await expectError(await call(api, '/api/invitations/lookup', { user: 'owner' }), 405, 'METHOD_NOT_ALLOWED');

  const members = await call(api, `/api/sites/${siteId}/members`, { user: 'owner' });
  assert.equal(members.status, 200);
  assert.ok((await members.json()).members.some((member) => member.userId === ids.invitee && member.role === 'editor'));
});

test('convite indisponível tem sempre a mesma resposta, na página e na API', async () => {
  const { api, store } = setup();
  const used = await invite(api, 'owner', 'viewer');
  const revoked = await invite(api, 'owner', 'viewer');
  const expired = await invite(api, 'owner', 'viewer');
  issuedTokens.push(used.token, revoked.token, expired.token);
  assert.equal((await call(api, '/api/invitations/accept', { method: 'POST', user: 'invitee', body: { token: used.token } })).status, 200);
  const revokeRes = await call(api, `/api/sites/${siteId}/invitations/${revoked.invitation.id}`, { method: 'DELETE', user: 'admin' });
  assert.equal(revokeRes.status, 204);
  assertInvitationHeaders(revokeRes);
  store.invitations.find((entry) => entry.id === expired.invitation.id).expiresAt = new Date(Date.now() - 1000).toISOString();

  const tokens = ['curto', 'x'.repeat(43), used.token, revoked.token, expired.token];
  const pages = [];
  const lookups = [];
  for (const token of tokens) {
    const page = await call(api, `/convite/${token}`);
    pages.push({ status: page.status, headers: [...page.headers.entries()], body: await page.text() });
    const lookup = await call(api, '/api/invitations/lookup', { method: 'POST', body: { token } });
    lookups.push({ status: lookup.status, headers: [...lookup.headers.entries()], body: await lookup.text() });
  }
  assert.equal(pages[0].status, 404);
  assert.match(pages[0].body, /Este convite não está mais disponível/);
  assert.deepEqual(Object.fromEntries(pages[0].headers)['referrer-policy'], 'no-referrer');
  for (const entry of pages) assert.deepEqual(entry, pages[0]);
  assert.equal(lookups[0].status, 404);
  assert.equal(JSON.parse(lookups[0].body).error.code, 'INVITATION_UNAVAILABLE');
  for (const entry of lookups) assert.deepEqual(entry, lookups[0]);
  for (const entry of pages) {
    for (const token of tokens.slice(2)) assert.ok(!entry.body.includes(token));
  }

  await expectError(await call(api, `/api/sites/${siteId}/invitations/${revoked.invitation.id}`, { method: 'DELETE', user: 'owner' }), 404, 'INVITATION_NOT_FOUND');
  await expectError(await call(api, `/api/sites/${siteId}/invitations/nao-e-uuid`, { method: 'DELETE', user: 'owner' }), 404, 'INVITATION_NOT_FOUND');
  const adminInvite = await invite(api, 'owner', 'admin');
  issuedTokens.push(adminInvite.token);
  await expectError(await call(api, `/api/sites/${siteId}/invitations/${adminInvite.invitation.id}`, { method: 'DELETE', user: 'admin' }), 403, 'FORBIDDEN');
  await expectError(await call(api, `/api/sites/${otherSiteId}/invitations/${adminInvite.invitation.id}`, { method: 'DELETE', user: 'owner' }), 404, 'INVITATION_NOT_FOUND');
  assert.equal((await call(api, `/api/sites/${siteId}/invitations/${adminInvite.invitation.id}`, { method: 'DELETE', user: 'owner' })).status, 204);
});

test('tentativas inválidas acima do limite recebem 429 com os mesmos cabeçalhos', async () => {
  const { api } = setup({ limit: 2 });
  const bad = 'y'.repeat(43);
  assert.equal((await call(api, `/convite/${bad}`)).status, 404);
  await expectError(await call(api, '/api/invitations/lookup', { method: 'POST', body: { token: bad } }), 404, 'INVITATION_UNAVAILABLE');
  const limited = await call(api, '/api/invitations/lookup', { method: 'POST', body: { token: bad } });
  await expectError(limited, 429, 'TOO_MANY_ATTEMPTS');
  assert.ok(Number(limited.headers.get('retry-after')) > 0);
  const limitedPage = await call(api, `/convite/${bad}`);
  assert.equal(limitedPage.status, 429);
  assertInvitationHeaders(limitedPage);
  await expectError(await call(api, '/api/invitations/accept', { method: 'POST', user: 'invitee', body: { token: bad } }), 429, 'TOO_MANY_ATTEMPTS');

  const other = await call(api, '/api/invitations/lookup', {
    method: 'POST', body: { token: bad }, headers: { origin, 'content-type': 'application/json', 'cf-connecting-ip': '198.51.100.9' }
  });
  assert.equal(other.status, 404);
});

test('caminho Supabase: só o hash vai ao banco e a abertura usa a chave de serviço', async () => {
  const env = {
    SUPABASE_URL: 'https://projeto.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_teste', SUPABASE_SERVICE_ROLE_KEY: 'chave-servico'
  };
  const calls = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const fetchMock = async (input, init = {}) => {
    const url = new URL(input);
    calls.push({ path: url.pathname, auth: init.headers?.authorization, body: init.body });
    if (url.pathname === '/rest/v1/sites') {
      return json(200, [{ id: siteId, owner_user_id: ids.owner, slug: 'pizza-equipe', name: 'Pizza Equipe', site_memberships: [] }]);
    }
    if (url.pathname === '/rest/v1/rpc/create_team_invitation') {
      return json(200, { id: '30000000-0000-0000-0000-0000000000c1', role: 'viewer', expires_at: '2026-12-03T13:00:00+00:00' });
    }
    if (url.pathname === '/rest/v1/rpc/service_read_invitation') {
      return json(200, { kind: 'team', site_name: 'Pizza Equipe', role: 'viewer', expires_at: '2026-12-03T13:00:00+00:00' });
    }
    if (url.pathname === '/rest/v1/rpc/accept_invitation') {
      return json(409, { code: '23505', message: 'ALREADY_MEMBER' });
    }
    if (url.pathname === '/rest/v1/rpc/list_site_team') {
      return json(200, {
        members: [{ user_id: ids.owner, display_name: 'Ana Dona', role: 'owner' }],
        invitations: [{ id: '30000000-0000-0000-0000-0000000000c1', role: 'viewer', expires_at: '2026-12-03T13:00:00+00:00' }]
      });
    }
    return json(404, { message: 'não simulado' });
  };
  const api = createApiHandler({
    fetch: fetchMock, authVerifier, invitationRateLimiter: createLeadRateLimiter({ limit: 100, windowMs: 60_000, maxKeys: 10 })
  });
  const send = (path, options) => call((request) => api(request, env), path, options);

  const created = await send(`/api/sites/${siteId}/invitations`, { method: 'POST', user: 'owner', body: { role: 'viewer' } });
  assert.equal(created.status, 201);
  const { url: inviteUrl, invitation } = await created.json();
  const token = inviteUrl.split('/convite/')[1];
  issuedTokens.push(token);
  assert.deepEqual(invitation, { id: '30000000-0000-0000-0000-0000000000c1', role: 'viewer', expiresAt: '2026-12-03T13:00:00.000Z' });
  const rpcCall = calls.find((entry) => entry.path === '/rest/v1/rpc/create_team_invitation');
  assert.equal(rpcCall.auth, 'Bearer t-owner');
  assert.deepEqual(JSON.parse(rpcCall.body), { target_site: siteId, target_role: 'viewer', target_token_hash: sha256(token) });
  assert.ok(calls.every((entry) => !String(entry.body ?? '').includes(token)));

  const lookup = await send('/api/invitations/lookup', { method: 'POST', body: { token } });
  assert.equal(lookup.status, 200);
  assert.equal(calls.find((entry) => entry.path === '/rest/v1/rpc/service_read_invitation').auth, 'Bearer chave-servico');
  await expectError(await send('/api/invitations/accept', { method: 'POST', user: 'editor', body: { token } }), 409, 'ALREADY_MEMBER');

  const team = await (await send(`/api/sites/${siteId}/team`, { user: 'owner' })).json();
  assert.deepEqual(team, {
    members: [{ userId: ids.owner, displayName: 'Ana Dona', role: 'owner' }],
    invitations: [{ id: '30000000-0000-0000-0000-0000000000c1', role: 'viewer', expiresAt: '2026-12-03T13:00:00.000Z' }]
  });
  assert.ok(calls.every((entry) => !String(entry.body ?? '').includes(token)));
});

test('nenhuma linha de console contém um token de convite', () => {
  assert.ok(issuedTokens.length > 5);
  for (const line of consoleLines) {
    for (const token of issuedTokens) assert.ok(!line.includes(token));
  }
});
