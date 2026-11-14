import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';
import {
  LINKTREE_MAX_BYTES,
  LINKTREE_TIMEOUT_MS,
  buildLinktreeDemoDraft,
  fetchLinktreePage,
  parseLinktreeHtml,
  purgeExpiredLinktreeDemos,
  validateLinktreeUsername
} from '../src/linktree-import.mjs';

const origin = 'https://painel.test';
const adminId = '10000000-0000-0000-0000-000000000001';
const demoId = '20000000-0000-0000-0000-0000000000d1';

function nextData(pageProps) {
  const json = JSON.stringify({ props: { pageProps } }).replace(/</g, '\\u003c');
  return `<!doctype html><html><head><title>x</title></head><body><script id="__NEXT_DATA__" type="application/json">${json}</script></body></html>`;
}

const SAMPLE = nextData({
  account: {
    pageTitle: 'Ana Doces',
    description: 'Bolos e tortas por encomenda',
    profilePictureUrl: 'https://ugc.production.linktr.ee/ana.jpg',
    socialLinks: [{ type: 'INSTAGRAM', url: 'https://www.instagram.com/ana.doces/' }]
  },
  links: [
    { title: 'Peça no WhatsApp', url: 'https://wa.me/5531999998888' },
    { title: 'Cardápio de bolos', url: 'https://ana.example.com/bolos' },
    { title: 'Conteúdo bloqueado', url: 'https://ana.example.com/vip', locked: true }
  ]
});

function htmlResponse(body, { status = 200, headers = {}, url = '' } = {}) {
  const response = new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8', ...headers } });
  if (url) Object.defineProperty(response, 'url', { value: url });
  return response;
}

function mockFetch(handler) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    return handler(String(url), init, calls.length);
  };
  fetchImpl.calls = calls;
  return fetchImpl;
}

function refusesNetwork() {
  return mockFetch(() => {
    throw new Error('nenhuma requisição deveria acontecer');
  });
}

async function rejectsWith(promise, code) {
  await assert.rejects(promise, error => error?.code === code || assert.fail(`esperado ${code}, veio ${error?.code ?? error}`));
}

test('nome de usuário: regex da issue e recusa de /, .. e @ antes de qualquer requisição', async () => {
  assert.equal(validateLinktreeUsername('ana.doces_01'), 'ana.doces_01');
  for (const bad of ['', 'a/b', '../admin', 'ana..doces', '..', '.', '@ana', 'ana@evil.com', 'x'.repeat(31),
    'ana doces', '%2e%2e', 'http://169.254.169.254', 'localhost:8080', 'ana\n', null, 42]) {
    const fetchImpl = refusesNetwork();
    await rejectsWith(fetchLinktreePage(bad, { fetch: fetchImpl }), 'INVALID_LINKTREE_USERNAME');
    assert.equal(fetchImpl.calls.length, 0);
  }
});

test('busca só https://linktr.ee/<usuário>, sem seguir redirecionamento automático e com limites padrão', async () => {
  assert.equal(LINKTREE_TIMEOUT_MS, 5000);
  assert.equal(LINKTREE_MAX_BYTES, 1048576);
  const fetchImpl = mockFetch(() => htmlResponse(SAMPLE));
  const page = await fetchLinktreePage('ana.doces', { fetch: fetchImpl });
  assert.equal(page.html, SAMPLE);
  assert.equal(fetchImpl.calls.length, 1);
  assert.equal(fetchImpl.calls[0].url, 'https://linktr.ee/ana.doces');
  assert.equal(fetchImpl.calls[0].init.redirect, 'manual');
  assert.equal(fetchImpl.calls[0].init.method, 'GET');
  assert.ok(fetchImpl.calls[0].init.signal instanceof AbortSignal);
  assert.equal(fetchImpl.calls[0].init.headers.cookie, undefined);
  assert.equal(fetchImpl.calls[0].init.headers.authorization, undefined);
});

test('redirecionamento para outro host é recusado (SSRF)', async () => {
  for (const location of [
    'https://evil.example/ana', 'http://linktr.ee/ana', 'https://linktr.ee@evil.example/ana',
    'https://linktr.ee:8443/ana', 'https://evil.linktr.ee/ana', 'http://169.254.169.254/latest/meta-data',
    'https://linktr.ee/a/b', 'https://linktr.ee/a..b', '//evil.example/ana', 'javascript:alert(1)'
  ]) {
    const fetchImpl = mockFetch(() => new Response(null, { status: 302, headers: { location } }));
    await rejectsWith(fetchLinktreePage('ana', { fetch: fetchImpl }), 'LINKTREE_REDIRECT_REFUSED');
    assert.equal(fetchImpl.calls.length, 1, location);
  }
  const missing = mockFetch(() => new Response(null, { status: 301 }));
  await rejectsWith(fetchLinktreePage('ana', { fetch: missing }), 'LINKTREE_REDIRECT_REFUSED');

  const followed = mockFetch(() => htmlResponse(SAMPLE, { url: 'https://evil.example/ana' }));
  await rejectsWith(fetchLinktreePage('ana', { fetch: followed }), 'LINKTREE_REDIRECT_REFUSED');
});

test('redirecionamento no próprio linktr.ee é seguido com limite de saltos', async () => {
  const fetchImpl = mockFetch((url, _init, count) => count === 1
    ? new Response(null, { status: 301, headers: { location: '/Ana.Doces' } })
    : htmlResponse(SAMPLE));
  await fetchLinktreePage('ana.doces', { fetch: fetchImpl });
  assert.deepEqual(fetchImpl.calls.map(call => call.url), ['https://linktr.ee/ana.doces', 'https://linktr.ee/Ana.Doces']);
  assert.ok(fetchImpl.calls.every(call => call.init.redirect === 'manual'));

  const loop = mockFetch(() => new Response(null, { status: 302, headers: { location: 'https://linktr.ee/ana' } }));
  await rejectsWith(fetchLinktreePage('ana', { fetch: loop }), 'LINKTREE_REDIRECT_REFUSED');
  assert.equal(loop.calls.length, 3);
});

test('página acima de 1 MB é cortada lendo o stream, sem ler tudo', async () => {
  let pulled = 0;
  const chunk = new Uint8Array(64 * 1024).fill(97);
  const endless = new ReadableStream({
    pull(controller) {
      pulled += chunk.byteLength;
      controller.enqueue(chunk);
    }
  });
  const fetchImpl = mockFetch(() => htmlResponse(endless));
  await rejectsWith(fetchLinktreePage('ana', { fetch: fetchImpl }), 'LINKTREE_TOO_LARGE');
  assert.ok(pulled <= LINKTREE_MAX_BYTES + 3 * chunk.byteLength, `leu ${pulled} bytes`);

  const declared = mockFetch(() => htmlResponse('pequeno', { headers: { 'content-length': String(LINKTREE_MAX_BYTES + 1) } }));
  await rejectsWith(fetchLinktreePage('ana', { fetch: declared }), 'LINKTREE_TOO_LARGE');

  const exact = mockFetch(() => htmlResponse('a'.repeat(LINKTREE_MAX_BYTES)));
  assert.equal((await fetchLinktreePage('ana', { fetch: exact })).html.length, LINKTREE_MAX_BYTES);
});

test('tempo limite aborta a requisição e também o corpo lento', async () => {
  let aborted = false;
  const hanging = mockFetch((_url, init) => new Promise((_resolve, reject) => {
    init.signal.addEventListener('abort', () => {
      aborted = true;
      reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
    });
  }));
  await rejectsWith(fetchLinktreePage('ana', { fetch: hanging, timeoutMs: 30 }), 'LINKTREE_TIMEOUT');
  assert.equal(aborted, true);

  const ignoresSignal = mockFetch(() => new Promise(() => {}));
  await rejectsWith(fetchLinktreePage('ana', { fetch: ignoresSignal, timeoutMs: 30 }), 'LINKTREE_TIMEOUT');

  const slowBody = mockFetch(() => htmlResponse(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('<html>'));
    }
  })));
  await rejectsWith(fetchLinktreePage('ana', { fetch: slowBody, timeoutMs: 30 }), 'LINKTREE_TIMEOUT');
});

test('erros do Linktree viram mensagens claras', async () => {
  await rejectsWith(fetchLinktreePage('ana', { fetch: mockFetch(() => htmlResponse('', { status: 404 })) }), 'LINKTREE_NOT_FOUND');
  await rejectsWith(fetchLinktreePage('ana', { fetch: mockFetch(() => htmlResponse('', { status: 503 })) }), 'LINKTREE_UNAVAILABLE');
  await rejectsWith(fetchLinktreePage('ana', {
    fetch: mockFetch(() => new Response('{}', { headers: { 'content-type': 'application/json' } }))
  }), 'LINKTREE_UNEXPECTED_CONTENT');
  await rejectsWith(fetchLinktreePage('ana', { fetch: mockFetch(() => { throw new TypeError('rede'); }) }), 'LINKTREE_UNAVAILABLE');
});

test('extrai nome, descrição, foto e links; WhatsApp e Instagram viram botões diretos', () => {
  const profile = parseLinktreeHtml(SAMPLE, 'ana.doces');
  assert.deepEqual(profile, {
    username: 'ana.doces',
    name: 'Ana Doces',
    description: 'Bolos e tortas por encomenda',
    photoUrl: 'https://ugc.production.linktr.ee/ana.jpg',
    whatsapp: '5531999998888',
    instagram: 'ana.doces',
    links: [{ title: 'Cardápio de bolos', url: 'https://ana.example.com/bolos' }],
    skipped: 0
  });
  const draft = buildLinktreeDemoDraft(profile, { importedAt: '2026-11-14T12:00:00.000Z' });
  assert.equal(draft.slug, 'ana-doces');
  assert.equal(draft.content.whatsapp, '5531999998888');
  assert.equal(draft.content.instagram, 'ana.doces');
  assert.equal(draft.content.messages.welcomeText, 'Bolos e tortas por encomenda');
  assert.deepEqual(draft.content.categories[0].items, [
    { id: 'link-1', name: 'Cardápio de bolos', url: 'https://ana.example.com/bolos', active: true }
  ]);
  assert.deepEqual(draft.content.demo, {
    source: 'linktree', username: 'ana.doces', importedAt: '2026-11-14T12:00:00.000Z',
    photoUrl: 'https://ugc.production.linktr.ee/ana.jpg'
  });
});

test('HTML malicioso é lido sem executar nada e a saída sai sanitizada', () => {
  const html = nextData({
    __proto__: { polluted: true },
    account: {
      pageTitle: '<img src=x onerror=alert(1)>Loja <b>Boa</b>\u202e',
      description: '<script>fetch("https://evil.example")</script>Feito à mão',
      profilePictureUrl: 'https://evil.example/tracker.gif'
    },
    links: [
      { title: 'JS', url: 'javascript:alert(1)' },
      { title: 'Dados', url: 'data:text/html,<script>alert(1)</script>' },
      { title: 'Sem TLS', url: 'http://ana.example.com' },
      { title: 'Credencial', url: 'https://user:senha@ana.example.com' },
      { title: 'IP interno', url: 'https://169.254.169.254/latest' },
      { title: 'Local', url: 'https://localhost/admin' },
      { title: 'onclick=alert(1)', url: 'https://ok.example.com/a' },
      { title: '<svg onload=alert(1)>', url: 'https://ok.example.com/b' },
      { title: 'Grupo', url: 'https://chat.whatsapp.com/AbCdEf' },
      { title: 'Post', url: 'https://instagram.com/p/xyz' },
      ...Array.from({ length: 30 }, (_, index) => ({ title: `Link ${index}`, url: `https://ok.example.com/${index}` }))
    ]
  }) + '<script>globalThis.__linktreeExecuted = true</script>';
  const profile = parseLinktreeHtml(html, 'loja');
  assert.equal(globalThis.__linktreeExecuted, undefined);
  assert.equal({}.polluted, undefined);
  assert.equal(profile.name, 'Loja Boa');
  assert.equal(profile.description, 'Feito à mão');
  assert.equal(profile.photoUrl, null);
  assert.equal(profile.whatsapp, null);
  assert.equal(profile.instagram, null);
  assert.equal(profile.links.length, 20);
  for (const link of profile.links) {
    assert.match(link.url, /^https:\/\/(ok\.example\.com|chat\.whatsapp\.com|instagram\.com)\//);
    assert.doesNotMatch(link.title, /[<>]|onclick|onload|javascript/i);
  }
  assert.deepEqual(profile.links.slice(0, 2).map(link => link.title), ['ok.example.com', 'ok.example.com']);
  assert.ok(profile.skipped >= 6);
  buildLinktreeDemoDraft(profile);
});

test('sem __NEXT_DATA__ usa as metatags públicas, decodificando entidades com segurança', () => {
  const html = `<html><head>
    <meta property="og:title" content="Ateli&ecirc; &amp; Cia | Linktree">
    <meta property="og:description" content="&lt;b&gt;Arte&lt;/b&gt; em papel">
    <meta property="og:image" content="https://ugc.production.linktr.ee/a.png">
    <script id="__NEXT_DATA__" type="application/json">{quebrado</script></head></html>`;
  const profile = parseLinktreeHtml(html, 'atelie');
  assert.equal(profile.description, 'Arte em papel');
  assert.match(profile.name, /Cia$/);
  assert.equal(profile.photoUrl, 'https://ugc.production.linktr.ee/a.png');
  assert.deepEqual(profile.links, []);
});

function createRepository() {
  const calls = [];
  return {
    calls,
    async importLinktreeDemo(draft, options) {
      calls.push(['import', draft, options]);
      return { id: demoId, slug: draft.slug, name: draft.name, demoExpiresAt: '2026-12-14T12:00:00.000Z' };
    },
    async inviteLinktreeDemoOwner(siteId, userId) {
      calls.push(['invite', siteId, userId]);
      return siteId === demoId ? { siteId, userId, demoExpiresAt: '2026-12-14T12:00:00.000Z' } : null;
    },
    async listLinktreeDemoInvitations() {
      calls.push(['list']);
      return [{ siteId: demoId, slug: 'ana-doces', name: 'Ana Doces', demoExpiresAt: '2026-12-14T12:00:00.000Z' }];
    },
    async acceptLinktreeDemo(siteId) {
      calls.push(['accept', siteId]);
      return siteId === demoId ? { id: siteId, slug: 'ana-doces', name: 'Ana Doces' } : null;
    }
  };
}

function createApi(linktreeFetch) {
  const store = createMemoryStore();
  store.isPlatformAdmin = id => id === adminId;
  const repository = createRepository();
  Object.assign(store, repository);
  const api = createApiHandler({ store, linktreeFetch });
  const send = (path, { method = 'POST', payload, token = 'token-owner', sameOrigin = true } = {}) => api(new Request(origin + path, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(sameOrigin ? { origin } : {}),
      ...(payload !== undefined ? { 'content-type': 'application/json' } : {})
    },
    ...(payload !== undefined ? { body: JSON.stringify(payload) } : {})
  }));
  return { api, send, repository };
}

test('rota de importação: 401 sem sessão, 403 para conta comum e para quem não é platform_admin, sem tocar a rede', async () => {
  const fetchImpl = refusesNetwork();
  const { send, repository } = createApi(fetchImpl);
  assert.equal((await send('/api/admin/linktree-demos', { payload: { username: 'ana' }, token: null })).status, 401);
  for (const token of ['token-member', 'token-stranger']) {
    const response = await send('/api/admin/linktree-demos', { payload: { username: 'ana' }, token });
    assert.equal(response.status, 403);
    assert.equal((await response.json()).error.code, 'FORBIDDEN_PLATFORM_ADMIN');
  }
  assert.equal((await send(`/api/admin/linktree-demos/${demoId}/invite`, {
    payload: { userId: adminId }, token: 'token-member'
  })).status, 403);
  assert.equal((await send('/api/admin/linktree-demos', { payload: { username: 'ana' }, sameOrigin: false })).status, 403);
  assert.equal((await send('/api/admin/linktree-demos', { method: 'GET' })).status, 405);
  for (const username of ['a/b', '..', 'ana@evil.com']) {
    const response = await send('/api/admin/linktree-demos', { payload: { username } });
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error.code, 'INVALID_LINKTREE_USERNAME');
  }
  assert.equal((await send('/api/admin/linktree-demos', { payload: { username: 'ana', slug: 'API' } })).status, 422);
  assert.equal(fetchImpl.calls.length, 0);
  assert.equal(repository.calls.length, 0);
});

test('rota de importação cria o rascunho de demonstração e responde sem publicação; /<endereço> segue 404', async () => {
  const fetchImpl = mockFetch(() => htmlResponse(SAMPLE));
  const { send, repository } = createApi(fetchImpl);
  const response = await send('/api/admin/linktree-demos', { payload: { username: 'ana.doces' } });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { demo } = await response.json();
  assert.equal(demo.slug, 'ana-doces');
  assert.equal(demo.published, false);
  assert.equal(demo.extracted.whatsapp, '5531999998888');
  assert.equal(demo.extracted.instagram, 'ana.doces');
  assert.equal(fetchImpl.calls[0].url, 'https://linktr.ee/ana.doces');
  const [[action, draft, options]] = repository.calls;
  assert.equal(action, 'import');
  assert.equal(options.token, 'token-owner');
  assert.equal(draft.username, 'ana.doces');
  assert.equal(draft.content.demo.source, 'linktree');
  assert.deepEqual(draft.summary, { username: 'ana.doces', slug: 'ana-doces', links: 1, whatsapp: true, instagram: true });

  const custom = await send('/api/admin/linktree-demos', { payload: { username: 'ana.doces', slug: 'demo-ana' } });
  assert.equal((await custom.json()).demo.slug, 'demo-ana');

  const publicPage = await send('/ana-doces', { method: 'GET', token: null, sameOrigin: false });
  assert.equal(publicPage.status, 404);
});

test('falha de tamanho, tempo ou redirecionamento não cria rascunho pela metade', async () => {
  const cases = [
    [mockFetch(() => htmlResponse('a'.repeat(LINKTREE_MAX_BYTES + 1))), 502, 'LINKTREE_TOO_LARGE'],
    [mockFetch(() => new Response(null, { status: 302, headers: { location: 'https://evil.example/' } })), 502, 'LINKTREE_REDIRECT_REFUSED'],
    [mockFetch(() => htmlResponse('', { status: 404 })), 404, 'LINKTREE_NOT_FOUND']
  ];
  for (const [fetchImpl, status, code] of cases) {
    const { send, repository } = createApi(fetchImpl);
    const response = await send('/api/admin/linktree-demos', { payload: { username: 'ana' } });
    assert.equal(response.status, status);
    const body = await response.json();
    assert.equal(body.error.code, code);
    assert.ok(body.error.message.length > 10);
    assert.equal(repository.calls.length, 0);
  }
});

test('rota de importação: Linktree acima de 5 s responde 504 sem criar rascunho', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let called;
  const reached = new Promise(resolve => { called = resolve; });
  const fetchImpl = mockFetch(() => {
    called();
    return new Promise(() => {});
  });
  const { send, repository } = createApi(fetchImpl);
  const pending = send('/api/admin/linktree-demos', { payload: { username: 'ana' } });
  await reached;
  t.mock.timers.tick(4999);
  await Promise.resolve();
  t.mock.timers.tick(1);
  const response = await pending;
  assert.equal(response.status, 504);
  assert.equal((await response.json()).error.code, 'LINKTREE_TIMEOUT');
  assert.equal(repository.calls.length, 0);
});

test('convite pelo platform_admin e aceite pelo dono convidado', async () => {
  const { send, repository } = createApi(refusesNetwork());
  assert.equal((await send(`/api/admin/linktree-demos/${demoId}/invite`, { payload: { userId: 'nao-e-uuid' } })).status, 422);
  assert.equal((await send('/api/admin/linktree-demos/abc/invite', { payload: { userId: adminId } })).status, 404);
  const invited = await send(`/api/admin/linktree-demos/${demoId}/invite`, {
    payload: { userId: '10000000-0000-0000-0000-000000000002' }
  });
  assert.equal(invited.status, 200);
  assert.equal((await invited.json()).invitation.userId, '10000000-0000-0000-0000-000000000002');

  const list = await send('/api/linktree-demos/invitations', { method: 'GET', token: 'token-member' });
  assert.equal(list.status, 200);
  assert.equal((await list.json()).invitations[0].slug, 'ana-doces');
  assert.equal((await send('/api/linktree-demos/invitations', { method: 'GET', token: null })).status, 401);
  assert.equal((await send(`/api/linktree-demos/${demoId}/accept`, { payload: {}, token: 'token-member', sameOrigin: false })).status, 403);
  const accepted = await send(`/api/linktree-demos/${demoId}/accept`, { payload: {}, token: 'token-member' });
  assert.equal(accepted.status, 200);
  assert.equal((await accepted.json()).site.slug, 'ana-doces');
  assert.equal((await send(`/api/linktree-demos/${'2'.repeat(8)}-0000-0000-0000-000000000000/accept`, {
    payload: {}, token: 'token-member'
  })).status, 404);
  assert.deepEqual(repository.calls.map(call => call[0]), ['invite', 'list', 'accept', 'accept']);
});

test('limpeza agendada chama só a função do banco com a chave de serviço', async () => {
  const none = refusesNetwork();
  assert.equal(await purgeExpiredLinktreeDemos({}, none), null);
  assert.equal(none.calls.length, 0);
  const fetchImpl = mockFetch(() => Response.json(2));
  const purged = await purgeExpiredLinktreeDemos({
    SUPABASE_URL: 'https://projeto-ficticio.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'chave-de-servico-ficticia'
  }, fetchImpl);
  assert.equal(purged, 2);
  assert.equal(fetchImpl.calls[0].url, 'https://projeto-ficticio.supabase.co/rest/v1/rpc/purge_expired_linktree_demos');
  assert.equal(fetchImpl.calls[0].init.method, 'POST');
  assert.equal(fetchImpl.calls[0].init.headers.authorization, 'Bearer chave-de-servico-ficticia');
});
