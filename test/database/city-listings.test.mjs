import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildListingSortKey, projectCityListings } from '../../src/city-listings.mjs';

const owner = '10000000-0000-0000-0000-000000000001';
const stranger = '10000000-0000-0000-0000-000000000003';
const siteA = '20000000-0000-0000-0000-000000000001';
const siteB = '20000000-0000-0000-0000-000000000002';

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
  const migrationsDir = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
  }
  await db.query('insert into auth.users (id) values ($1), ($2)', [owner, stranger]);
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'bazar-ana', 'Bazar da Ana']);
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteB, stranger, 'sebo-rui', 'Sebo do Rui']);
  return db;
}

async function asRole(db, role, userId, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

function menuFor(slug, name, { locality, items } = {}) {
  const menuItems = items ?? [
    { id: 'bike', name: 'Bicicleta aro 26', priceMode: 'offer', priceCents: 15000 },
    { id: 'cadeira', name: 'Cadeira de madeira', priceCents: 9000 },
    { id: 'livros', name: 'Caixa de livros', priceMode: 'donation', priceCents: 0, conditions: 'Retirar no centro' },
    { id: 'violao', name: 'Violão', priceMode: 'trade', priceCents: 0, tradeFor: 'Teclado' }
  ];
  return {
    schemaVersion: 1,
    template: 'products-v1',
    catalogType: 'products',
    slug,
    name,
    whatsapp: '5551999999999',
    currency: 'BRL',
    items: menuItems,
    categories: [{ id: 'itens', name: 'Itens', items: menuItems }],
    ...(locality === null ? {} : { locality: locality ?? { city: 'Porto Alegre', uf: 'RS', citySlug: 'porto-alegre-rs' } })
  };
}

async function publish(db, siteId, slug, menu, publishedAt = '2026-11-12T10:00:00.000Z', revision = 1) {
  await db.query(
    `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu, published_at)
     values ($1, $2, $3, 'active', $4, $5, $6)
     on conflict (site_id) do update set revision = excluded.revision, artifact_hash = excluded.artifact_hash,
       menu = excluded.menu, published_at = excluded.published_at`,
    [siteId, slug, revision, String(revision).repeat(64).slice(0, 64).replace(/[^a-f0-9]/g, 'a'), JSON.stringify(menu), publishedAt]
  );
}

test('Spec 012 — city_listings derivada das publicações', async (t) => {
  await t.test('publicação com cidade autorizada gera só lance, doação e troca', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    const menu = menuFor('bazar-ana', 'Bazar da Ana');
    await publish(db, siteA, 'bazar-ana', menu);

    const { rows } = await db.query('select item_id, price_mode, price_cents, conditions, trade_for, sort_key, city, uf from public.city_listings order by sort_key desc');
    assert.deepEqual(rows.map((r) => r.item_id), ['bike', 'livros', 'violao']);
    assert.equal(rows[0].price_mode, 'offer');
    assert.equal(Number(rows[0].price_cents), 15000);
    assert.equal(rows[1].conditions, 'Retirar no centro');
    assert.equal(rows[2].trade_for, 'Teclado');
    assert.equal(rows[0].city, 'Porto Alegre');

    const jsRows = projectCityListings(menu, '2026-11-12T10:00:00.000Z');
    assert.deepEqual(rows.map((r) => r.sort_key), jsRows.map((r) => r.sort_key), 'sort_key igual no SQL e no JS');
    assert.equal(rows[0].sort_key, buildListingSortKey('2026-11-12T10:00:00.000Z', 'bazar-ana', 1));
  });

  await t.test('republicar sem cidade remove os itens; reverter com cidade traz de volta', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await publish(db, siteA, 'bazar-ana', menuFor('bazar-ana', 'Bazar da Ana'));
    await publish(db, siteA, 'bazar-ana', menuFor('bazar-ana', 'Bazar da Ana', { locality: null }), '2026-11-12T11:00:00.000Z', 2);
    assert.equal((await db.query('select count(*)::int as n from public.city_listings')).rows[0].n, 0);
    await publish(db, siteA, 'bazar-ana', menuFor('bazar-ana', 'Bazar da Ana'), '2026-11-12T12:00:00.000Z', 3);
    assert.equal((await db.query('select count(*)::int as n from public.city_listings')).rows[0].n, 3);
  });

  await t.test('localidade inválida não bloqueia a publicação e não lista nada', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await publish(db, siteA, 'bazar-ana', menuFor('bazar-ana', 'Bazar da Ana', {
      locality: { city: '<script>', uf: 'RS', citySlug: 'script-rs' }
    }));
    await publish(db, siteB, 'sebo-rui', menuFor('sebo-rui', 'Sebo do Rui', {
      locality: { city: 'Porto Alegre', uf: 'XX', citySlug: 'porto-alegre-sp' }
    }));
    assert.equal((await db.query('select count(*)::int as n from public.publications')).rows[0].n, 2);
    assert.equal((await db.query('select count(*)::int as n from public.city_listings')).rows[0].n, 0);
  });

  await t.test('anon lê a projeção pública, nunca site_id, e não escreve', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await publish(db, siteA, 'bazar-ana', menuFor('bazar-ana', 'Bazar da Ana'));
    await publish(db, siteB, 'sebo-rui', menuFor('sebo-rui', 'Sebo do Rui'), '2026-11-12T09:00:00.000Z');

    await asRole(db, 'anon', null, async () => {
      const { rows } = await db.query("select site_slug, site_name, item_name from public.city_listings where city_slug = 'porto-alegre-rs' order by sort_key desc limit 4");
      assert.equal(rows.length, 4);
      assert.equal(rows[0].site_slug, 'bazar-ana');
      const cities = await db.query('select city_slug, city, uf, offer_count, donation_count, trade_count, total_count from public.city_listing_cities');
      assert.deepEqual(cities.rows.map((r) => [r.city_slug, Number(r.offer_count), Number(r.donation_count), Number(r.trade_count), Number(r.total_count)]), [
        ['porto-alegre-rs', 2, 2, 2, 6]
      ]);
    });
    await asRole(db, 'anon', null, async () => {
      await assert.rejects(db.query('select site_id from public.city_listings'), /permission denied/);
    });
    await asRole(db, 'authenticated', stranger, async () => {
      await assert.rejects(db.query('select site_id from public.city_listings'), /permission denied/);
    });
    await asRole(db, 'authenticated', stranger, async () => {
      await assert.rejects(db.query("delete from public.city_listings where site_slug = 'bazar-ana'"), /permission denied/);
    });
    await asRole(db, 'anon', null, async () => {
      await assert.rejects(
        db.query("insert into public.city_listings (site_id, item_position, city_slug, city, uf, site_slug, site_name, item_id, item_name, price_mode, published_at, sort_key) values ($1, 9, 'porto-alegre-rs', 'Porto Alegre', 'RS', 'x', 'X', 'i', 'I', 'trade', now(), '0000000000000001~x~990')", [siteA]),
        /permission denied/
      );
    });
  });

  await t.test('proprietário publica pela RLS e o trigger lista; excluir a vitrine remove', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await db.exec('begin');
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [owner]);
    await publish(db, siteA, 'bazar-ana', menuFor('bazar-ana', 'Bazar da Ana'));
    await db.exec('commit');
    assert.equal((await db.query('select count(*)::int as n from public.city_listings')).rows[0].n, 3);
    await db.query('delete from public.sites where id = $1', [siteA]);
    assert.equal((await db.query('select count(*)::int as n from public.city_listings')).rows[0].n, 0);
  });

  await t.test('endereço por-cidade é reservado', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await assert.rejects(
      db.query("insert into public.sites(owner_user_id, slug, name) values ($1, 'por-cidade', 'X')", [owner]),
      /sites_slug_not_por_cidade|violates check constraint/
    );
  });
});
