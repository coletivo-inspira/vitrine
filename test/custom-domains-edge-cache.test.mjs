import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CloudflareHostnames, createDomainChallenge, validateCustomHostname, verifyDomainDns
} from '../src/custom-domains.mjs';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';

test('Domínio exige TXT da própria vitrine e CNAME apontado ao alvo configurado', async () => {
  const hostname = validateCustomHostname(' Menu.Exemplo.com.br. ');
  assert.equal(hostname, 'menu.exemplo.com.br');
  for (const invalid of ['127.0.0.1', 'localhost', '-menu.example.com', 'sandbox.inspira.dev.br', 'a'.repeat(64) + '.com']) {
    assert.throws(() => validateCustomHostname(invalid), { code: 'INVALID_HOSTNAME' });
  }
  const challenge = {
    ...createDomainChallenge(hostname, 'saas.inspira.dev.br'),
    verification_txt_name: '_vitrine-verify.' + hostname,
    verification_txt_value: 'vitrine=teste'
  };
  assert.equal(challenge.is_apex, false);
  assert.equal(createDomainChallenge('exemplo.com.br', challenge.cname_target).is_apex, true);
  const dns = cname => async url => Response.json({
    Status: 0,
    Answer: url.searchParams.get('type') === 'TXT'
      ? [{ type: 16, name: challenge.verification_txt_name + '.', data: JSON.stringify(challenge.verification_txt_value) }]
      : [{ type: 5, name: hostname + '.', data: cname }]
  });
  assert.equal(await verifyDomainDns(challenge, dns('saas.inspira.dev.br.')), true);
  assert.equal(await verifyDomainDns(challenge, dns('outra.example.com.')), false);
});

test('Provedor recusa criação quando a zona alcança 95 hostnames ou a contagem é desconhecida', async () => {
  for (const total_count of [95, 100, undefined]) {
    const requests = [];
    const provider = new CloudflareHostnames('1'.repeat(32), 'test-token', async (_url, options) => {
      requests.push(options.method);
      return Response.json({ success: true, result: [], result_info: { total_count } });
    });
    await assert.rejects(provider.create('menu.example.com'), { code: 'DOMAIN_QUOTA_REACHED' });
    assert.deepEqual(requests, ['GET']);
  }
});

test('Worker entrega somente a vitrine associada ao hostname e revalida cache antigo', async () => {
  const store = createMemoryStore();
  const api = createApiHandler({ store });
  const [site] = await store.listSites('10000000-0000-0000-0000-000000000001');
  const publish = await api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/publish`, {
    method: 'POST', headers: { authorization: 'Bearer token-owner' }
  }));
  assert.equal(publish.status, 200);
  const host = 'menu.example.com';
  let linked = true;
  store.resolveDomain = hostname => hostname === host && linked ? site.slug : null;
  const entries = new Map();
  const originalCaches = Object.getOwnPropertyDescriptor(globalThis, 'caches');
  const background = [];
  Object.defineProperty(globalThis, 'caches', { configurable: true, value: {
    default: {
      match: async key => entries.get(key.url)?.clone(),
      put: async (key, response) => entries.set(key.url, response.clone())
    }
  } });
  const env = { CF_SAAS_CNAME_TARGET: 'saas.inspira.dev.br' };
  const request = path => api(new Request(`https://${host}${path}`), env, {
    waitUntil: task => background.push(task)
  });
  try {
    const first = await request('/');
    assert.equal(first.status, 200);
    assert.match(first.headers.get('cache-control'), /stale-while-revalidate=86400/);
    assert.match(await first.text(), /Pizza A/);
    const key = `https://${host}/${site.slug}`;
    entries.set(key, new Response('Versão em cache', { headers: { 'x-vitrine-cached-at': '1' } }));
    assert.equal(await (await request('/')).text(), 'Versão em cache');
    assert.equal(background.length, 1);
    await Promise.all(background);
    assert.match(await entries.get(key).clone().text(), /Pizza A/);
    assert.equal((await request('/api/sites')).status, 404);
    linked = false;
    assert.equal((await request('/')).status, 404);
  } finally {
    if (originalCaches) Object.defineProperty(globalThis, 'caches', originalCaches);
    else delete globalThis.caches;
  }
});

test('Worker avança DNS para TLS ativo e desvincula somente o ID registrado', async () => {
  const origin = 'https://vitrine.inspira.dev.br';
  const siteId = '20000000-0000-0000-0000-000000000001';
  const domainId = '50000000-0000-0000-0000-000000000001';
  const remoteId = '60000000-0000-0000-0000-000000000001';
  const hostname = 'menu.example.com';
  const target = 'saas.inspira.dev.br';
  const store = createMemoryStore();
  let row;
  let remote;
  store.listDomains = async () => row ? [row] : [];
  store.addDomain = async (_site, challenge) => (row = {
    ...challenge, id: domainId, site_id: siteId, status: 'pending_dns',
    ssl_status: 'pending', verification_txt_name: '_vitrine-verify.' + hostname,
    verification_txt_value: 'vitrine=server-test'
  });
  store.changeDomain = async (_domain, change, { remove }) => {
    if (remove) {
      const deleted = row;
      row = null;
      return deleted;
    }
    if (!row) return null;
    return row = { ...row, ...change };
  };
  let dnsReady = false;
  const fetchMock = async (input, options) => {
    const url = new URL(input);
    if (url.hostname === 'cloudflare-dns.com') {
      const txt = url.searchParams.get('type') === 'TXT';
      return Response.json({ Status: 0, Answer: dnsReady ? [
        txt
          ? { name: row.verification_txt_name, type: 16, data: JSON.stringify(row.verification_txt_value) }
          : { name: hostname, type: 5, data: target }
      ] : [] });
    }
    if (options.method === 'POST') {
      assert.deepEqual(JSON.parse(options.body), { hostname, ssl: { method: 'http', type: 'dv' } });
      remote = { id: remoteId, hostname, status: 'active', ssl: { status: 'active' } };
      return Response.json({ success: true, result: remote });
    }
    if (options.method === 'DELETE') {
      assert.ok(url.pathname.endsWith('/' + remoteId));
      remote = null;
      return Response.json({ success: true });
    }
    return Response.json({ success: true, result: remote ? [remote] : [], result_info: { total_count: 0 } });
  };
  const api = createApiHandler({ store, fetch: fetchMock });
  const env = {
    CF_SAAS_CNAME_TARGET: target, CF_SAAS_ZONE_ID: '1'.repeat(32),
    CF_SAAS_API_TOKEN: 'mock-token', SUPABASE_SERVICE_ROLE_KEY: 'mock-key'
  };
  const path = `/api/sites/${siteId}/domains`;
  const send = (suffix, method, body = {}, token = 'token-owner') => api(new Request(origin + path + suffix, {
    method, body: JSON.stringify(body),
    headers: { origin, authorization: 'Bearer ' + token, 'content-type': 'application/json' }
  }), env);
  assert.equal((await send('', 'POST', { hostname }, 'token-member')).status, 404);
  assert.equal((await send('', 'POST', { hostname })).status, 201);
  assert.equal((await send(`/${domainId}/verify`, 'POST')).status, 409);
  dnsReady = true;
  const verified = await send(`/${domainId}/verify`, 'POST');
  assert.equal(verified.status, 200);
  assert.equal((await verified.json()).domain.sslStatus, 'active');
  assert.equal(row.cf_hostname_id, remoteId);
  assert.equal((await send(`/${domainId}`, 'DELETE')).status, 204);
  assert.equal(remote, null);
  assert.equal(row, null);
});
