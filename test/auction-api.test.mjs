import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiHandler, createMemoryStore, deriveAuctionVisitorKey } from '../workers/api.mjs';
import { compilePublicStorefront } from '../src/publication-engine.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';

const OWNER = '50000000-0000-0000-0000-000000000001';
const ADMIN = '50000000-0000-0000-0000-000000000002';
const EDITOR = '50000000-0000-0000-0000-000000000003';
const STRANGER = '50000000-0000-0000-0000-000000000004';
const SITE = '60000000-0000-0000-0000-000000000001';
const TOKENS = { 'tk-owner': OWNER, 'tk-admin': ADMIN, 'tk-editor': EDITOR, 'tk-stranger': STRANGER };
const ORIGIN = 'https://vitrine.inspira.dev.br';
const ENV = { AUCTION_BID_SECRET: 'segredo-local-de-teste-1234567890' };
const START_MS = Date.parse('2026-11-12T12:00:00.000Z');
const ENDS_AT = '2026-11-14T21:00:00.000Z';

function draftContent(endsAt = ENDS_AT) {
  return {
    schemaVersion: 1,
    template: 'products-v1',
    catalogType: 'products',
    slug: 'brecho-aurora',
    businessName: 'Brechó Aurora',
    whatsapp: '5551988887777',
    categories: [
      {
        id: 'pecas',
        name: 'Peças únicas',
        items: [
          {
            id: 'vaso-raro',
            name: 'Vaso Raro',
            priceMode: 'offer',
            priceCents: 5000,
            bidIncrementCents: 500,
            auctionEndsAt: endsAt,
            active: true
          },
          { id: 'cadeira', name: 'Cadeira', priceCents: 12000, active: true },
          {
            id: 'quadro',
            name: 'Quadro',
            priceMode: 'donation',
            priceCents: 0,
            auctionEndsAt: endsAt,
            active: true
          }
        ]
      }
    ]
  };
}

async function setup() {
  let clock = START_MS;
  const store = createMemoryStore({
    sites: [{ id: SITE, owner_user_id: OWNER, slug: 'brecho-aurora', name: 'Brechó Aurora', template: 'products-v1' }],
    memberships: [
      { site_id: SITE, user_id: ADMIN, role: 'admin' },
      { site_id: SITE, user_id: EDITOR, role: 'editor' }
    ],
    drafts: [{ siteId: SITE, revision: 1, content: draftContent() }]
  });
  const compiled = await compilePublicStorefront(
    draftContent(),
    { id: SITE, slug: 'brecho-aurora', name: 'Brechó Aurora', template: 'products-v1' },
    { revision: 1, siteId: SITE }
  );
  await store.savePublication(compiled.publication);
  const handler = createApiHandler({
    store,
    authVerifier: (token) => TOKENS[token] ?? null,
    nowMs: () => clock
  });
  return {
    store,
    compiled,
    advance(ms) {
      clock += ms;
    },
    call(path, { method = 'GET', body, token, ip = '203.0.113.10', origin = ORIGIN, headers = {}, env = ENV } = {}) {
      const init = { method, headers: { 'cf-connecting-ip': ip, 'user-agent': 'Mozilla/5.0 Teste', ...headers } };
      if (origin) init.headers.origin = origin;
      if (token) init.headers.authorization = `Bearer ${token}`;
      if (body !== undefined) {
        init.headers['content-type'] = 'application/json';
        init.body = JSON.stringify(body);
      }
      return handler(new Request(`${ORIGIN}${path}`, init), env);
    }
  };
}

function bid(overrides = {}) {
  return {
    itemId: 'vaso-raro',
    amountCents: 5000,
    name: 'Ana Souza',
    whatsapp: '(51) 91111-2222',
    consent: true,
    website: '',
    ...overrides
  };
}

test('Publicação leva prazo e incremento só para itens de lance', async () => {
  const { compiled } = await setup();
  const items = compiled.menu.items;
  const vaso = items.find((item) => item.id === 'vaso-raro');
  assert.equal(vaso.auctionEndsAt, ENDS_AT);
  assert.equal(vaso.bidIncrementCents, 500);
  const quadro = items.find((item) => item.id === 'quadro');
  assert.equal('auctionEndsAt' in quadro, false);

  const invalid = draftContent('amanhã às 18h');
  assert.throws(() => validateDraftContent(invalid), (err) => err.code === 'INVALID_AUCTION_ENDS_AT');
  const tooFar = draftContent(new Date(Date.now() + 61 * 86_400_000).toISOString());
  assert.throws(() => validateDraftContent(tooFar), (err) => err.code === 'INVALID_AUCTION_ENDS_AT');
  const badIncrement = draftContent();
  badIncrement.categories[0].items[0].bidIncrementCents = 50;
  assert.throws(() => validateDraftContent(badIncrement), (err) => err.code === 'INVALID_BID_INCREMENT');
});

test('Quadro público e lance registrado sem expor dados pessoais', async () => {
  const api = await setup();
  const boardRes = await api.call('/api/public/auctions/brecho-aurora');
  assert.equal(boardRes.status, 200);
  assert.equal(boardRes.headers.get('cache-control'), 'no-store');
  const board = await boardRes.json();
  assert.equal(board.lots.length, 1);
  assert.deepEqual(
    { status: board.lots[0].status, startCents: board.lots[0].startCents, nextMinCents: board.lots[0].nextMinCents },
    { status: 'open', startCents: 5000, nextMinCents: 5000 }
  );

  const placed = await api.call('/api/public/auctions/brecho-aurora/bids', { method: 'POST', body: bid() });
  assert.equal(placed.status, 201);
  const placedBody = await placed.json();
  assert.equal(placedBody.bid.amountCents, 5000);
  assert.equal(placedBody.lot.currentCents, 5000);
  assert.equal(placedBody.lot.leadingRef, placedBody.bid.ref);

  api.advance(20_000);
  const low = await api.call('/api/public/auctions/brecho-aurora/bids', {
    method: 'POST',
    ip: '198.51.100.7',
    body: bid({ amountCents: 5400, whatsapp: '51933334444', name: 'Bruno' })
  });
  assert.equal(low.status, 422);
  const lowBody = await low.json();
  assert.equal(lowBody.error.code, 'BID_TOO_LOW');
  assert.equal(lowBody.error.requiredCents, 5500);

  const afterBoard = await (await api.call('/api/public/auctions/brecho-aurora')).json();
  const text = JSON.stringify(afterBoard);
  assert.equal(text.includes('Ana Souza'), false);
  assert.equal(text.includes('5551911112222'), false);
  assert.equal(afterBoard.lots[0].bidCount, 1);
});

test('Borda recusa origem externa, robôs, campo isca e ausência do segredo', async () => {
  const api = await setup();
  const path = '/api/public/auctions/brecho-aurora/bids';
  assert.equal((await api.call(path, { method: 'POST', body: bid(), origin: 'https://golpe.example' })).status, 403);
  assert.equal((await api.call(path, { method: 'POST', body: bid(), origin: null })).status, 403);
  const noSecret = await api.call(path, { method: 'POST', body: bid(), env: {} });
  assert.equal(noSecret.status, 503);
  assert.equal((await noSecret.json()).error.code, 'AUCTIONS_UNAVAILABLE');
  const honeypot = await api.call(path, { method: 'POST', body: bid({ website: 'http://spam' }) });
  assert.equal(honeypot.status, 202);
  const bot = await api.call(path, { method: 'POST', body: bid(), headers: { 'user-agent': 'curl/8.0 bot' } });
  assert.equal(bot.status, 202);
  const noConsent = await api.call(path, { method: 'POST', body: bid({ consent: false }) });
  assert.equal(noConsent.status, 400);
  const notAuction = await api.call(path, { method: 'POST', body: bid({ itemId: 'cadeira' }) });
  assert.equal((await notAuction.json()).error.code, 'AUCTION_NOT_FOUND');
  const owner = await api.call(path, { method: 'POST', body: bid({ whatsapp: '5551988887777' }) });
  assert.equal((await owner.json()).error.code, 'BIDDER_IS_OWNER');
  const big = await api.call(path, {
    method: 'POST',
    body: { ...bid(), name: 'x'.repeat(3000) },
    headers: { 'content-length': '3100' }
  });
  assert.equal(big.status, 400);
  const board = await (await api.call('/api/public/auctions/brecho-aurora')).json();
  assert.equal(board.lots[0].bidCount, 0);
});

test('Limites por visitante, quem lidera e encerramento', async () => {
  const api = await setup();
  const path = '/api/public/auctions/brecho-aurora/bids';
  assert.equal((await api.call(path, { method: 'POST', body: bid() })).status, 201);
  const burst = await api.call(path, { method: 'POST', body: bid({ amountCents: 5500, whatsapp: '51900000002' }) });
  assert.equal(burst.status, 429);
  assert.equal((await burst.json()).error.code, 'BID_RATE_LIMITED');
  api.advance(16_000);
  const leading = await api.call(path, { method: 'POST', ip: '198.51.100.9', body: bid({ amountCents: 6000 }) });
  assert.equal((await leading.json()).error.code, 'ALREADY_LEADING');

  api.advance(16_000);
  assert.equal((await api.call(path, { method: 'POST', body: bid({ amountCents: 5500, whatsapp: '51900000002' }) })).status, 201);
  api.advance(16_000);
  assert.equal((await api.call(path, { method: 'POST', body: bid({ amountCents: 6000, whatsapp: '51900000003' }) })).status, 201);
  api.advance(16_000);
  const identities = await api.call(path, { method: 'POST', body: bid({ amountCents: 6500, whatsapp: '51900000004' }) });
  assert.equal((await identities.json()).error.code, 'TOO_MANY_IDENTITIES');

  const tooHigh = await api.call(path, { method: 'POST', ip: '192.0.2.1', body: bid({ amountCents: 65_001, whatsapp: '51955556666' }) });
  assert.equal((await tooHigh.json()).error.code, 'BID_TOO_HIGH');

  api.advance(3 * 86_400_000);
  const closed = await api.call(path, { method: 'POST', ip: '192.0.2.2', body: bid({ amountCents: 9000, whatsapp: '51977776666' }) });
  assert.equal(closed.status, 409);
  assert.equal((await closed.json()).error.code, 'AUCTION_CLOSED');
  const board = await (await api.call('/api/public/auctions/brecho-aurora')).json();
  assert.equal(board.lots[0].status, 'closed');
  assert.equal(board.lots[0].currentCents, 6000);
});

test('Painel: só proprietário e administrador veem o vencedor e desconsideram lances', async () => {
  const api = await setup();
  const path = '/api/public/auctions/brecho-aurora/bids';
  await api.call(path, { method: 'POST', body: bid() });
  api.advance(20_000);
  await api.call(path, { method: 'POST', ip: '198.51.100.20', body: bid({ amountCents: 9000, name: 'Perfil Falso', whatsapp: '51933334444' }) });

  assert.equal((await api.call(`/api/sites/${SITE}/auctions`)).status, 401);
  for (const token of ['tk-editor', 'tk-stranger']) {
    const res = await api.call(`/api/sites/${SITE}/auctions`, { token });
    assert.equal(res.status, 404);
  }
  const ownerRes = await api.call(`/api/sites/${SITE}/auctions`, { token: 'tk-owner' });
  assert.equal(ownerRes.status, 200);
  const [auction] = (await ownerRes.json()).auctions;
  assert.equal(auction.itemName, 'Vaso Raro');
  assert.equal(auction.winner.name, 'Perfil Falso');
  assert.equal(auction.winner.whatsapp, '5551933334444');
  assert.equal(auction.bids.length, 2);

  const fakeBid = auction.winner.bidId;
  const voidPath = `/api/sites/${SITE}/auctions/bids/${fakeBid}/void`;
  assert.equal((await api.call(voidPath, { method: 'POST', token: 'tk-editor', body: { reason: 'Falso', block: true } })).status, 404);
  assert.equal((await api.call(voidPath, { method: 'POST', token: 'tk-admin', body: { reason: 'x' } })).status, 422);
  assert.equal((await api.call(voidPath, { method: 'POST', token: 'tk-admin', origin: 'https://golpe.example', body: { reason: 'Falso' } })).status, 403);
  const voided = await api.call(voidPath, { method: 'POST', token: 'tk-admin', body: { reason: 'Número não existe', block: true } });
  assert.equal(voided.status, 200);
  const voidedAuction = (await voided.json()).auction;
  assert.equal(voidedAuction.winner.name, 'Ana Souza');
  assert.equal(voidedAuction.currentCents, 5000);
  assert.equal(voidedAuction.bids.find((entry) => entry.id === fakeBid).voidReason, 'Número não existe');
  assert.equal((await api.call(voidPath, { method: 'POST', token: 'tk-owner', body: { reason: 'De novo' } })).status, 409);

  api.advance(20_000);
  const blocked = await api.call(path, { method: 'POST', ip: '198.51.100.21', body: bid({ amountCents: 9000, whatsapp: '51933334444' }) });
  assert.equal((await blocked.json()).error.code, 'BIDDER_BLOCKED');

  const logs = await api.store.listAuditLogs(SITE);
  assert.equal(logs[0].action, 'auction.bid_void');
  assert.equal(JSON.stringify(logs).includes('5551933334444'), false);
});

test('Identificador do visitante é irreversível e estável por endereço', async () => {
  const a = await deriveAuctionVisitorKey(ENV.AUCTION_BID_SECRET, '203.0.113.10');
  const b = await deriveAuctionVisitorKey(ENV.AUCTION_BID_SECRET, '203.0.113.10');
  const c = await deriveAuctionVisitorKey(ENV.AUCTION_BID_SECRET, '203.0.113.11');
  assert.match(a, /^[a-f0-9]{32}$/);
  assert.equal(a, b);
  assert.notEqual(a, c);
  assert.equal(a.includes('203'), false);
});

test('Store Supabase envia a chave do canal só ao banco e traduz erros da função', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    if (String(url).endsWith('/rest/v1/rpc/place_auction_bid')) {
      return new Response(JSON.stringify({ code: 'P0001', message: 'BID_TOO_LOW', details: '5500' }), {
        status: 400,
        headers: { 'content-type': 'application/json' }
      });
    }
    if (String(url).endsWith('/rest/v1/rpc/read_auction_board')) {
      return new Response(JSON.stringify({ code: '42501', message: 'BID_CHANNEL_FORBIDDEN' }), { status: 403 });
    }
    return new Response('[]', { status: 200 });
  };
  const handler = createApiHandler({ fetch: fakeFetch });
  const env = { ...ENV, SUPABASE_URL: 'https://exemplo.supabase.co', SUPABASE_ANON_KEY: 'sb_publishable_teste' };
  const res = await handler(
    new Request(`${ORIGIN}/api/public/auctions/brecho-aurora/bids`, {
      method: 'POST',
      headers: { origin: ORIGIN, 'content-type': 'application/json', 'cf-connecting-ip': '203.0.113.5', 'user-agent': 'Mozilla/5.0' },
      body: JSON.stringify(bid())
    }),
    env
  );
  assert.equal(res.status, 422);
  const body = await res.json();
  assert.equal(body.error.code, 'BID_TOO_LOW');
  assert.equal(body.error.requiredCents, 5500);
  const rpc = calls.find((call) => call.url.endsWith('/rpc/place_auction_bid'));
  assert.equal(rpc.init.headers['x-vitrine-bid-key'], ENV.AUCTION_BID_SECRET);
  const payload = JSON.parse(rpc.init.body);
  assert.equal(payload.bidder_whatsapp, '5551911112222');
  assert.match(payload.visitor_key, /^[a-f0-9]{32}$/);
  assert.equal(JSON.stringify(body).includes(ENV.AUCTION_BID_SECRET), false);

  const boardRes = await handler(new Request(`${ORIGIN}/api/public/auctions/brecho-aurora`), env);
  assert.equal(boardRes.status, 503);
  const boardCall = calls.find((call) => call.url.endsWith('/rpc/read_auction_board'));
  assert.equal('x-vitrine-bid-key' in boardCall.init.headers, false);
});
