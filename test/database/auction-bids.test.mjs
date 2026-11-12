import { PGlite } from '@electric-sql/pglite';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const OWNER = '30000000-0000-0000-0000-000000000001';
const ADMIN = '30000000-0000-0000-0000-000000000002';
const EDITOR = '30000000-0000-0000-0000-000000000003';
const STRANGER = '30000000-0000-0000-0000-000000000004';
const SITE = '40000000-0000-0000-0000-000000000001';
const OTHER_SITE = '40000000-0000-0000-0000-000000000002';
const CHANNEL_KEY = 'segredo-de-teste-do-canal-de-lances';
const VISITOR_A = 'a'.repeat(32);
const VISITOR_B = 'b'.repeat(32);
const VISITOR_C = 'c'.repeat(32);

function auctionMenu(slug, endsAt, extra = {}) {
  return {
    schemaVersion: 1,
    template: 'products-v1',
    catalogType: 'products',
    slug,
    name: 'Brechó Aurora',
    whatsapp: '5551988887777',
    currency: 'BRL',
    items: [
      {
        id: 'vaso-raro',
        name: 'Vaso Raro',
        priceMode: 'offer',
        priceCents: 5000,
        bidIncrementCents: 500,
        auctionEndsAt: endsAt,
        ...extra
      },
      { id: 'cadeira', name: 'Cadeira', priceCents: 12000 }
    ],
    categories: [{ id: 'pecas', name: 'Peças', items: [] }]
  };
}

async function setupDb() {
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
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const dir = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(dir, file), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4)', [OWNER, ADMIN, EDITOR, STRANGER]);
  await db.query("insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, 'brecho-aurora', 'Brechó Aurora')", [SITE, OWNER]);
  await db.query("insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, 'outra-loja', 'Outra Loja')", [OTHER_SITE, STRANGER]);
  await db.query("insert into public.site_memberships (site_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'editor')", [SITE, ADMIN, EDITOR]);
  const endsAt = new Date(Date.now() + 2 * 86400_000).toISOString();
  await db.query(
    "insert into public.publications (site_id, slug, revision, status, artifact_hash, menu) values ($1, 'brecho-aurora', 1, 'active', $2, $3::jsonb)",
    [SITE, 'd'.repeat(64), JSON.stringify(auctionMenu('brecho-aurora', endsAt))]
  );
  return db;
}

async function configureChannel(db) {
  const hash = createHash('sha256').update(CHANNEL_KEY).digest('hex');
  await db.query('insert into private.auction_settings (id, bid_key_sha256) values (true, $1)', [hash]);
}

async function asRole(db, { role = 'anon', userId = null, channelKey = null, commit = false }, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const headers = channelKey ? JSON.stringify({ 'x-vitrine-bid-key': channelKey }) : '';
    await db.query("select set_config('request.headers', $1, true)", [headers]);
    const result = await fn();
    await db.exec(commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

function placeBid(db, { amount, whatsapp = '5551911112222', name = 'Ana Souza', visitor = VISITOR_A, item = 'vaso-raro', channelKey = CHANNEL_KEY }) {
  return asRole(db, { channelKey, commit: true }, async () => {
    const { rows } = await db.query(
      'select public.place_auction_bid($1, $2, $3, $4, $5, $6) as result',
      ['brecho-aurora', item, name, whatsapp, amount, visitor]
    );
    return rows[0].result;
  });
}

async function rewindVisitorBids(db, seconds = 20) {
  await db.query(`update public.auction_bids set created_at = created_at - interval '${Number(seconds)} seconds'`);
}

function rejectsWith(code) {
  return (err) => {
    assert.match(err.message, new RegExp(code));
    return true;
  };
}

test('Leilão no banco - canal secreto, regras de lance e quadro público', async (t) => {
  await t.test('recusa lances sem configuração ou sem a chave do canal (falha fechada)', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await assert.rejects(() => placeBid(db, { amount: 5000 }), rejectsWith('AUCTIONS_UNAVAILABLE'));
    await configureChannel(db);
    await assert.rejects(() => placeBid(db, { amount: 5000, channelKey: null }), rejectsWith('BID_CHANNEL_FORBIDDEN'));
    await assert.rejects(() => placeBid(db, { amount: 5000, channelKey: 'chave-forjada' }), rejectsWith('BID_CHANNEL_FORBIDDEN'));
    const { rows } = await db.query('select count(*)::int as n from public.auction_bids');
    assert.equal(rows[0].n, 0);
  });

  await t.test('aplica lance inicial, incremento, teto e quem já lidera', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await configureChannel(db);

    await assert.rejects(() => placeBid(db, { amount: 4900 }), (err) => {
      assert.match(err.message, /BID_TOO_LOW/);
      assert.equal(err.detail, '5000');
      return true;
    });
    const first = await placeBid(db, { amount: 5000 });
    assert.equal(first.lot.currentCents, 5000);
    assert.equal(first.lot.nextMinCents, 5500);
    assert.equal(first.lot.bidCount, 1);
    assert.equal(first.bid.ref.length, 8);
    assert.equal(first.lot.leadingRef, first.bid.ref);

    await rewindVisitorBids(db);
    await assert.rejects(() => placeBid(db, { amount: 6000 }), rejectsWith('ALREADY_LEADING'));
    await assert.rejects(
      () => placeBid(db, { amount: 5400, whatsapp: '5551933334444', visitor: VISITOR_B }),
      rejectsWith('BID_TOO_LOW')
    );
    await assert.rejects(
      () => placeBid(db, { amount: 55001, whatsapp: '5551933334444', visitor: VISITOR_B }),
      rejectsWith('BID_TOO_HIGH')
    );
    const second = await placeBid(db, { amount: 5500, whatsapp: '5551933334444', name: 'Bruno Lima', visitor: VISITOR_B });
    assert.equal(second.lot.currentCents, 5500);
    assert.equal(second.lot.bidCount, 2);

    await assert.rejects(
      () => placeBid(db, { amount: 9000, whatsapp: '5551988887777', visitor: VISITOR_C }),
      rejectsWith('BIDDER_IS_OWNER')
    );
    await assert.rejects(() => placeBid(db, { amount: 9000, item: 'cadeira', visitor: VISITOR_C }), rejectsWith('AUCTION_NOT_FOUND'));
    await db.query('insert into public.drafts (site_id, content) values ($1, $2::jsonb)', [
      SITE,
      JSON.stringify({ schemaVersion: 1, template: 'products-v1', whatsapp: '5551900009999', items: [] })
    ]);
    await assert.rejects(
      () => placeBid(db, { amount: 9000, whatsapp: '5551900009999', visitor: VISITOR_C }),
      rejectsWith('BIDDER_IS_OWNER')
    );
    await assert.rejects(() => placeBid(db, { amount: 9000, name: '<b>x</b>', visitor: VISITOR_C }), rejectsWith('INVALID_BID'));

    const board = await asRole(db, {}, async () => (await db.query("select public.read_auction_board('brecho-aurora') as b")).rows[0].b);
    assert.equal(board.lots.length, 1);
    const lot = board.lots[0];
    assert.equal(lot.itemId, 'vaso-raro');
    assert.equal(lot.status, 'open');
    assert.equal(lot.currentCents, 5500);
    assert.equal(lot.recentBids.length, 2);
    assert.deepEqual(Object.keys(lot.recentBids[0]).sort(), ['amountCents', 'placedAt']);
    const serialized = JSON.stringify(board);
    assert.equal(serialized.includes('Ana Souza'), false);
    assert.equal(serialized.includes('5551911112222'), false);
    assert.equal(serialized.includes(VISITOR_A), false);
  });

  await t.test('limita rajadas, identidades por visitante e prazo encerrado', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await configureChannel(db);

    await placeBid(db, { amount: 5000, whatsapp: '5551900000001' });
    await assert.rejects(
      () => placeBid(db, { amount: 5500, whatsapp: '5551900000002' }),
      rejectsWith('BID_RATE_LIMITED')
    );
    await rewindVisitorBids(db);
    await placeBid(db, { amount: 5500, whatsapp: '5551900000002' });
    await rewindVisitorBids(db);
    await placeBid(db, { amount: 6000, whatsapp: '5551900000003' });
    await rewindVisitorBids(db);
    await assert.rejects(
      () => placeBid(db, { amount: 6500, whatsapp: '5551900000004' }),
      rejectsWith('TOO_MANY_IDENTITIES')
    );

    const past = new Date(Date.now() - 3600_000).toISOString();
    await db.query('update public.auction_lots set scheduled_ends_at = $1, ends_at = $1', [past]);
    await db.query('update public.publications set menu = $1::jsonb where site_id = $2', [
      JSON.stringify(auctionMenu('brecho-aurora', past)),
      SITE
    ]);
    await assert.rejects(
      () => placeBid(db, { amount: 9000, whatsapp: '5551977776666', visitor: VISITOR_B }),
      rejectsWith('AUCTION_CLOSED')
    );
    const board = await asRole(db, {}, async () => (await db.query("select public.read_auction_board('brecho-aurora') as b")).rows[0].b);
    assert.equal(board.lots[0].status, 'closed');
    assert.equal(board.lots[0].currentCents, 6000);
  });

  await t.test('prorroga lances nos minutos finais até 60 minutos além do prazo', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await configureChannel(db);
    const endsSoon = new Date(Date.now() + 60_000).toISOString();
    await db.query("update public.publications set menu = $1::jsonb where site_id = $2", [
      JSON.stringify(auctionMenu('brecho-aurora', endsSoon)),
      SITE
    ]);
    const result = await placeBid(db, { amount: 5000 });
    const extendedMs = Date.parse(result.lot.endsAt);
    assert.ok(extendedMs >= Date.now() + 170_000, 'encerramento prorrogado para ~3 minutos após o lance');
    assert.equal(result.lot.scheduledEndsAt, new Date(endsSoon).toISOString());
  });

  await t.test('congela os termos no primeiro lance mesmo após republicação', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await configureChannel(db);
    await placeBid(db, { amount: 5000 });
    const later = new Date(Date.now() + 5 * 86400_000).toISOString();
    await db.query("update public.publications set menu = $1::jsonb where site_id = $2", [
      JSON.stringify(auctionMenu('brecho-aurora', later, { priceCents: 1000, bidIncrementCents: 100 })),
      SITE
    ]);
    const board = await asRole(db, {}, async () => (await db.query("select public.read_auction_board('brecho-aurora') as b")).rows[0].b);
    assert.equal(board.lots[0].incrementCents, 500);
    assert.equal(board.lots[0].nextMinCents, 5500);
  });
});

test('Leilão no banco - RLS, desconsideração, bloqueio e retenção', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await configureChannel(db);
  await placeBid(db, { amount: 5000, whatsapp: '5551911112222', name: 'Ana Souza', visitor: VISITOR_A });
  const top = await placeBid(db, { amount: 7000, whatsapp: '5551933334444', name: 'Troll', visitor: VISITOR_B });
  assert.equal(top.lot.currentCents, 7000);

  await t.test('anônimo e outras vitrines não leem lances; editor também não', async () => {
    await assert.rejects(
      () => asRole(db, {}, () => db.query('select bidder_whatsapp from public.auction_bids')),
      (err) => err.code === '42501'
    );
    for (const userId of [STRANGER, EDITOR]) {
      const rows = await asRole(db, { role: 'authenticated', userId }, async () =>
        (await db.query('select id, bidder_name, bidder_whatsapp from public.auction_bids')).rows
      );
      assert.equal(rows.length, 0);
      const lots = await asRole(db, { role: 'authenticated', userId }, async () =>
        (await db.query('select id from public.auction_lots')).rows
      );
      assert.equal(lots.length, 0);
    }
    await assert.rejects(
      () => asRole(db, { role: 'authenticated', userId: OWNER }, () => db.query('select visitor_key from public.auction_bids')),
      (err) => err.code === '42501'
    );
    await assert.rejects(
      () => asRole(db, { role: 'authenticated', userId: OWNER }, () => db.query("update public.auction_bids set amount_cents = 100000")),
      (err) => err.code === '42501'
    );
    await assert.rejects(
      () => asRole(db, { role: 'authenticated', userId: OWNER }, () => db.query("insert into public.auction_lots (site_id, item_id, item_name, start_cents, increment_cents, scheduled_ends_at, ends_at) values ($1, 'x', 'x', 100, 100, now(), now())", [SITE])),
      (err) => err.code === '42501'
    );
  });

  await t.test('proprietário e administrador veem nome e WhatsApp dos licitantes', async () => {
    for (const userId of [OWNER, ADMIN]) {
      const rows = await asRole(db, { role: 'authenticated', userId }, async () =>
        (await db.query('select bidder_name, bidder_whatsapp, amount_cents from public.auction_bids order by amount_cents')).rows
      );
      assert.deepEqual(rows.map((r) => r.bidder_name), ['Ana Souza', 'Troll']);
    }
  });

  await t.test('desconsiderar exige papel, recalcula vencedor, bloqueia e audita', async () => {
    const trollBid = (await db.query("select id from public.auction_bids where bidder_name = 'Troll'")).rows[0].id;
    for (const userId of [EDITOR, STRANGER]) {
      await assert.rejects(
        () => asRole(db, { role: 'authenticated', userId }, () => db.query('select public.void_auction_bid($1, $2, true)', [trollBid, 'Lance falso'])),
        rejectsWith('BID_NOT_FOUND')
      );
    }
    await assert.rejects(
      () => asRole(db, {}, () => db.query('select public.void_auction_bid($1, $2, true)', [trollBid, 'Lance falso'])),
      (err) => err.code === '42501'
    );
    await assert.rejects(
      () => asRole(db, { role: 'authenticated', userId: OWNER }, () => db.query('select public.void_auction_bid($1, $2, true)', [trollBid, 'x'])),
      rejectsWith('INVALID_VOID_REASON')
    );
    await asRole(db, { role: 'authenticated', userId: ADMIN, commit: true }, () =>
      db.query('select public.void_auction_bid($1, $2, true)', [trollBid, 'Não respondeu em 48 h'])
    );
    const lot = (await db.query('select highest_cents, bid_count from public.auction_lots')).rows[0];
    assert.equal(Number(lot.highest_cents), 5000);
    assert.equal(lot.bid_count, 1);
    const audit = (await db.query("select action, actor_user_id, summary from public.audit_logs where action = 'auction.bid_void'")).rows;
    assert.equal(audit.length, 1);
    assert.equal(audit[0].actor_user_id, ADMIN);
    assert.equal(JSON.stringify(audit[0].summary).includes('5551933334444'), false);

    await rewindVisitorBids(db);
    await assert.rejects(
      () => placeBid(db, { amount: 9000, whatsapp: '5551933334444', visitor: VISITOR_C }),
      rejectsWith('BIDDER_BLOCKED')
    );
    await assert.rejects(
      () => placeBid(db, { amount: 9000, whatsapp: '5551955556666', visitor: VISITOR_B }),
      rejectsWith('BIDDER_BLOCKED')
    );
    await assert.rejects(
      () => asRole(db, { role: 'authenticated', userId: OWNER }, () => db.query('select public.void_auction_bid($1, $2, false)', [trollBid, 'De novo'])),
      rejectsWith('BID_ALREADY_VOID')
    );
  });

  await t.test('apaga dados pessoais 90 dias após o encerramento e mantém os totais', async () => {
    await db.query("update public.auction_lots set scheduled_ends_at = now() - interval '100 days', ends_at = now() - interval '100 days'");
    await db.query("update public.publications set menu = $1::jsonb where site_id = $2", [
      JSON.stringify(auctionMenu('brecho-aurora', new Date(Date.now() + 86400_000).toISOString())),
      SITE
    ]);
    await placeBid(db, { amount: 5000, whatsapp: '5551977778888', name: 'Carla Dias', visitor: VISITOR_C });
    const bids = (await db.query('select bidder_name from public.auction_bids order by created_at')).rows;
    assert.deepEqual(bids.map((b) => b.bidder_name), ['Carla Dias']);
    const old = (await db.query("select highest_cents, personal_data_purged_at from public.auction_lots where ends_at < now() - interval '90 days'")).rows[0];
    assert.equal(Number(old.highest_cents), 5000);
    assert.ok(old.personal_data_purged_at);
  });
});
