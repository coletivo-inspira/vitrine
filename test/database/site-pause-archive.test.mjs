import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const owner = '10000000-0000-0000-0000-000000000001';
const admin = '10000000-0000-0000-0000-000000000002';
const editor = '10000000-0000-0000-0000-000000000003';
const viewer = '10000000-0000-0000-0000-000000000004';
const stranger = '10000000-0000-0000-0000-000000000005';
const siteA = '20000000-0000-0000-0000-000000000001';
const siteB = '20000000-0000-0000-0000-000000000002';
const hashA = 'a'.repeat(64);

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
  for (const id of [owner, admin, editor, viewer, stranger]) {
    await db.query('insert into auth.users (id) values ($1)', [id]);
  }
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'bazar-ana', 'Bazar da Ana']);
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteB, stranger, 'sebo-rui', 'Sebo do Rui']);
  await db.query('insert into public.drafts(site_id, content) values ($1, $2)', [siteA, '{}']);
  await db.query(
    `insert into public.site_memberships(site_id, user_id, role) values
     ($1, $2, 'admin'), ($1, $3, 'editor'), ($1, $4, 'viewer')`,
    [siteA, admin, editor, viewer]
  );
  const items = [{ id: 'bike', name: 'Bicicleta', priceMode: 'offer', priceCents: 15000 }];
  const menu = {
    schemaVersion: 1, template: 'pizzeria-v1', slug: 'bazar-ana', name: 'Bazar da Ana', currency: 'BRL',
    items, categories: [{ id: 'itens', name: 'Itens', items }],
    locality: { city: 'Porto Alegre', uf: 'RS', citySlug: 'porto-alegre-rs' }
  };
  await db.query(
    `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu)
     values ($1, 'bazar-ana', 1, 'active', $2, $3)`,
    [siteA, hashA, JSON.stringify(menu)]
  );
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

async function commitAs(db, userId, sql, params = []) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await db.query(sql, params);
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const anonCounts = (db) => asRole(db, 'anon', null, async () => ({
  publications: (await db.query("select artifact_hash from public.publications where slug = 'bazar-ana'")).rows,
  releases: (await db.query("select count(*)::int as n from public.publication_releases where slug = 'bazar-ana'")).rows[0].n,
  listings: (await db.query("select count(*)::int as n from public.city_listings where site_slug = 'bazar-ana'")).rows[0].n,
  state: (await db.query("select public.public_site_state('bazar-ana') as state")).rows[0].state
}));

test('Issue #126 — pausar, arquivar e excluir no banco', async (t) => {
  await t.test('pausa esconde a vitrine do público sem tocar rascunho nem publicações', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    const before = await anonCounts(db);
    assert.equal(before.publications[0].artifact_hash, hashA);
    assert.equal(before.listings, 1);
    assert.equal(before.state, null);

    const counts = async () => (await db.query(
      'select (select count(*) from public.drafts)::int as drafts, (select count(*) from public.publications)::int as pubs'
    )).rows[0];
    const totalsBefore = await counts();

    const snapshot = (await commitAs(db, admin, 'select public.pause_site($1) as s', [siteA])).rows[0].s;
    assert.equal(snapshot.publication.artifactHash, hashA);
    assert.equal(snapshot.publication.itemCount, 1);

    const paused = await anonCounts(db);
    assert.deepEqual(paused.publications, []);
    assert.equal(paused.releases, 0);
    assert.equal(paused.listings, 0);
    assert.equal(paused.state, 'paused');
    assert.deepEqual(await counts(), totalsBefore);

    const memberView = await asRole(db, 'authenticated', viewer, async () =>
      (await db.query('select artifact_hash from public.publications where site_id = $1', [siteA])).rows);
    assert.equal(memberView[0].artifact_hash, hashA, 'equipe continua vendo a publicação');

    await assert.rejects(
      db.query("update public.publications set revision = 2 where site_id = $1", [siteA]),
      /SITE_PAUSED/
    );

    await commitAs(db, owner, 'select public.resume_site($1)', [siteA]);
    const resumed = await anonCounts(db);
    assert.equal(resumed.publications[0].artifact_hash, hashA);
    assert.equal(resumed.state, null);

    const logs = (await db.query(
      "select action, summary from public.audit_logs where entity_type = 'site' order by created_at, action"
    )).rows;
    assert.deepEqual(logs.map((row) => row.action).sort(), ['pause', 'resume']);
    assert.equal(logs[0].summary.artifactHash, hashA);
  });

  await t.test('editor, viewer e estranhos não pausam; só o dono arquiva', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    for (const user of [editor, viewer, stranger]) {
      await assert.rejects(commitAs(db, user, 'select public.pause_site($1)', [siteA]), /FORBIDDEN_SITE_ROLE/);
    }
    for (const user of [admin, editor, viewer]) {
      await assert.rejects(commitAs(db, user, 'select public.archive_site($1)', [siteA]), /FORBIDDEN_SITE_ROLE/);
    }
    await assert.rejects(
      commitAs(db, owner, 'update public.sites set paused_at = now() where id = $1', [siteA]),
      /permission denied/
    );
  });

  await t.test('arquivar libera a vaga, restaura em 90 dias e exclui só com o endereço', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    const planCount = async () => (await db.query('select private.count_plan_sites($1) as n', [owner])).rows[0].n;
    assert.equal(await planCount(), 1);

    await assert.rejects(
      commitAs(db, owner, 'select public.delete_archived_site($1, $2)', [siteA, 'bazar-ana']),
      /SITE_NOT_ARCHIVED/
    );
    await commitAs(db, owner, 'select public.archive_site($1)', [siteA]);
    assert.equal(await planCount(), 0);
    assert.equal((await anonCounts(db)).state, 'paused');
    await assert.rejects(commitAs(db, admin, 'select public.resume_site($1)', [siteA]), /SITE_ARCHIVED/);

    await commitAs(db, owner, 'select public.restore_site($1)', [siteA]);
    assert.equal(await planCount(), 1);
    assert.equal((await anonCounts(db)).state, 'paused', 'restaurar mantém pausada até retomar');

    await commitAs(db, owner, 'select public.archive_site($1)', [siteA]);
    await db.query("update public.sites set archived_at = now() - interval '91 days' where id = $1", [siteA]);
    await assert.rejects(commitAs(db, owner, 'select public.restore_site($1)', [siteA]), /RESTORE_WINDOW_EXPIRED/);

    await assert.rejects(
      commitAs(db, owner, 'select public.delete_archived_site($1, $2)', [siteA, 'bazar']),
      /CONFIRMATION_MISMATCH/
    );
    await db.query(
      `insert into public.custom_domains (site_id, hostname) values ($1, 'loja.exemplo.com.br')`, [siteA]
    );
    await assert.rejects(
      commitAs(db, owner, 'select public.delete_archived_site($1, $2)', [siteA, 'bazar-ana']),
      /DOMAINS_CONNECTED/
    );
    await db.query('delete from public.custom_domains where site_id = $1', [siteA]);
    await assert.rejects(
      commitAs(db, admin, 'select public.delete_archived_site($1, $2)', [siteA, 'bazar-ana']),
      /FORBIDDEN_SITE_ROLE/
    );
    await commitAs(db, owner, 'select public.delete_archived_site($1, $2)', [siteA, 'bazar-ana']);
    assert.equal((await db.query('select count(*)::int as n from public.sites where id = $1', [siteA])).rows[0].n, 0);
    const deletion = (await db.query("select site_id, entity_id, summary from public.audit_logs where action = 'delete'")).rows;
    assert.equal(deletion.length, 1);
    assert.equal(deletion[0].site_id, null);
    assert.equal(deletion[0].entity_id, siteA);
    assert.equal(deletion[0].summary.slug, 'bazar-ana');
  });

  await t.test('domínio desconectado fica em quarentena e a desconexão é auditada', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    await db.query(`insert into public.custom_domains (site_id, hostname) values ($1, 'loja.exemplo.com.br')`, [siteA]);
    await db.query(`delete from public.custom_domains where hostname = 'loja.exemplo.com.br'`);
    await assert.rejects(
      db.query(`insert into public.custom_domains (site_id, hostname) values ($1, 'loja.exemplo.com.br')`, [siteB]),
      /HOSTNAME_QUARANTINED/
    );
    await assert.rejects(
      commitAs(db, editor, 'select public.record_domain_disconnect($1, $2)', [siteA, 'loja.exemplo.com.br']),
      /FORBIDDEN_SITE_ROLE/
    );
    const recorded = (await commitAs(db, admin, 'select public.record_domain_disconnect($1, $2) as r', [siteA, 'loja.exemplo.com.br'])).rows[0].r;
    assert.equal(recorded.hostname, 'loja.exemplo.com.br');
    await assert.rejects(
      commitAs(db, admin, 'select public.record_domain_disconnect($1, $2)', [siteA, 'loja.exemplo.com.br']),
      /DOMAIN_NOT_RELEASED/
    );
    const log = (await db.query("select actor_user_id from public.audit_logs where action = 'domain_disconnect'")).rows;
    assert.deepEqual(log.map((row) => row.actor_user_id), [admin]);
    await db.query(`insert into public.custom_domains (site_id, hostname) values ($1, 'loja.exemplo.com.br')`, [siteA]);
  });

  await t.test('resumo do impacto exige acesso à vitrine', async () => {
    const db = await setupDb();
    t.after(() => db.close());
    const summary = await asRole(db, 'authenticated', viewer, async () =>
      (await db.query('select public.read_site_lifecycle($1) as s', [siteA])).rows[0].s);
    assert.equal(summary.slug, 'bazar-ana');
    assert.equal(summary.memberCount, 3);
    assert.equal(summary.releaseCount, 1);
    await assert.rejects(
      asRole(db, 'authenticated', stranger, () => db.query('select public.read_site_lifecycle($1)', [siteA])),
      /SITE_NOT_FOUND/
    );
  });
});
