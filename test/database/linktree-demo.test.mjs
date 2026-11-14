import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLinktreeDemoDraft } from '../../src/linktree-import.mjs';

const admin = '10000000-0000-0000-0000-0000000000a1';
const support = '10000000-0000-0000-0000-0000000000a2';
const common = '10000000-0000-0000-0000-0000000000a3';
const invited = '10000000-0000-0000-0000-0000000000a4';

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
  await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4)', [admin, support, common, invited]);
  await db.query(`insert into public.platform_operators (user_id, role) values ($1, 'platform_admin'), ($2, 'support_operator')`, [admin, support]);
  return db;
}

async function as(db, userId, fn) {
  await db.exec('begin');
  try {
    await db.exec('set local role authenticated');
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const draft = buildLinktreeDemoDraft({
  username: 'ana.doces', name: 'Ana Doces', description: 'Bolos', photoUrl: null,
  whatsapp: '5531999998888', instagram: 'ana.doces', links: [{ title: 'Loja', url: 'https://ana.example.com/' }], skipped: 0
}, { importedAt: '2026-11-14T12:00:00.000Z' });

function importDemo(db, slug = draft.slug) {
  return db.query(
    'select public.import_linktree_demo($1, $2, $3, $4, $5, $6, $7) as demo',
    [slug, draft.name, draft.storefrontType, draft.template, JSON.stringify(draft.content), 'ana.doces', JSON.stringify({ links: 1 })]
  ).then(result => result.rows[0].demo);
}

test('Demonstração do Linktree: só platform_admin cria, sem dono, sem publicação e com auditoria', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());

  for (const user of [common, support]) {
    await assert.rejects(as(db, user, () => importDemo(db)), /FORBIDDEN_PLATFORM_ADMIN/);
  }
  assert.equal((await db.query('select count(*)::int as n from public.sites')).rows[0].n, 0);

  const demo = await as(db, admin, () => importDemo(db));
  assert.equal(demo.slug, 'ana-doces');
  const { rows: [site] } = await db.query(
    `select owner_user_id, demo_source, demo_expires_at - now() > interval '29 days' as month
     from public.sites where id = $1`, [demo.id]);
  assert.deepEqual(site, { owner_user_id: null, demo_source: 'linktree', month: true });
  const { rows: [savedDraft] } = await db.query('select content from public.drafts where site_id = $1', [demo.id]);
  assert.equal(savedDraft.content.demo.source, 'linktree');

  const { rows: logs } = await db.query(
    `select site_id, actor_user_id, action, entity_id, summary from public.audit_logs where action = 'linktree_imported'`);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].site_id, null);
  assert.equal(logs[0].actor_user_id, admin);
  assert.equal(logs[0].entity_id, demo.id);
  assert.equal(logs[0].summary.username, 'ana.doces');
  assert.equal((await as(db, admin, () => db.query(`select id from public.audit_logs where action = 'linktree_imported'`))).rows.length, 1);
  assert.equal((await as(db, common, () => db.query('select id from public.audit_logs'))).rows.length, 0);

  assert.equal((await as(db, common, () => db.query('select id from public.sites where id = $1', [demo.id]))).rows.length, 0);
  assert.equal((await db.query('select count(*)::int as n from public.publications where site_id = $1', [demo.id])).rows[0].n, 0);
  await assert.rejects(db.query(
    `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu, published_at)
     values ($1, $2, 1, 'active', $3, '{}'::jsonb, now())`, [demo.id, demo.slug, 'a'.repeat(64)]
  ), /DEMO_NOT_PUBLISHABLE/);

  await assert.rejects(as(db, admin, () => importDemo(db)), error => error.code === '23505');
  await assert.rejects(as(db, common, () => db.query(
    `insert into public.sites (owner_user_id, slug, name) values (null, 'sem-dono', 'Sem dono')`)));
});

test('Convite, aceite pelo dono e limpeza das demonstrações vencidas', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const demo = await as(db, admin, () => importDemo(db));
  const invite = (user, target = invited) => as(db, user, () => db.query(
    'select public.invite_linktree_demo_owner($1, $2) as row', [demo.id, target]).then(r => r.rows[0].row));
  const list = user => as(db, user, () => db.query('select * from public.list_my_linktree_demo_invitations()').then(r => r.rows));
  const accept = user => as(db, user, () => db.query('select public.accept_linktree_demo($1) as row', [demo.id]).then(r => r.rows[0].row));

  await assert.rejects(invite(support), /FORBIDDEN_PLATFORM_ADMIN/);
  await assert.rejects(invite(common), /FORBIDDEN_PLATFORM_ADMIN/);
  assert.equal(await invite(admin, '10000000-0000-0000-0000-0000000000ff'), null);
  assert.equal((await invite(admin)).invited_user_id, invited);
  assert.equal((await list(common)).length, 0);
  assert.deepEqual((await list(invited)).map(row => row.slug), ['ana-doces']);
  assert.equal(await accept(common), null);
  assert.equal((await accept(invited)).slug, 'ana-doces');
  const { rows: [site] } = await db.query(
    'select owner_user_id, demo_source, demo_expires_at, demo_invited_user_id from public.sites where id = $1', [demo.id]);
  assert.deepEqual(site, { owner_user_id: invited, demo_source: null, demo_expires_at: null, demo_invited_user_id: null });
  assert.equal(await accept(invited), null);
  assert.equal(await invite(admin), null);
  assert.equal((await as(db, invited, () => db.query('select id from public.sites where id = $1', [demo.id]))).rows.length, 1);

  const stale = await as(db, admin, () => importDemo(db, 'ana-doces-2'));
  const fresh = await as(db, admin, () => importDemo(db, 'ana-doces-3'));
  await db.query(`update public.sites set demo_expires_at = now() - interval '1 minute' where id = $1`, [stale.id]);
  await assert.rejects(as(db, admin, () => db.query('select public.purge_expired_linktree_demos()')));
  assert.equal((await db.query('select public.purge_expired_linktree_demos() as n')).rows[0].n, 1);
  assert.deepEqual((await db.query('select slug from public.sites order by slug')).rows.map(row => row.slug), ['ana-doces', 'ana-doces-3']);
  assert.equal((await db.query('select count(*)::int as n from public.drafts where site_id = $1', [stale.id])).rows[0].n, 0);
  assert.equal((await db.query(`select count(*)::int as n from public.audit_logs where action = 'linktree_imported'`)).rows[0].n, 3);
  assert.ok(fresh.id);
});
