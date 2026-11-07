import { PGlite } from '@electric-sql/pglite';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import assert from 'node:assert/strict';

const owner = '10000000-0000-0000-0000-000000000001';
const member = '10000000-0000-0000-0000-000000000002';
const stranger = '10000000-0000-0000-0000-000000000003';
const siteA = '20000000-0000-0000-0000-000000000001';
const siteB = '20000000-0000-0000-0000-000000000002';

test('Postgres RLS and privileges isolate each site', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  // Local shim only. Production auth schema and role are managed by Supabase.
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
  await db.exec(await readFile(new URL('../../supabase/migrations/202611070001_site_access.sql', import.meta.url), 'utf8'));
  await db.query('insert into auth.users values ($1),($2),($3)', [owner, member, stranger]);
  await db.query(`insert into public.sites(id,owner_user_id,slug,name) values
    ($1,$3,'pizza-a','Pizza A'),($2,$3,'pizza-b','Pizza B')`, [siteA, siteB, owner]);
  await db.query('insert into public.site_memberships(site_id,user_id) values ($1,$2)', [siteA, member]);
  await db.query(`insert into public.drafts(site_id,content) values ($1,'{"name":"A"}'),($2,'{"name":"B"}')`, [siteA, siteB]);

  async function asUser(userId, fn, role = 'authenticated') {
    await db.exec('begin');
    try {
      await db.exec(`set local role ${role}`);
      await db.query("select set_config('request.jwt.claim.sub',$1,true)", [userId ?? '']);
      return await fn();
    } finally {
      await db.exec('rollback');
    }
  }

  await t.test('owner sees both sites; stranger and missing identity see no rows', async () => {
    const list = () => db.query('select id from public.sites order by id');
    assert.equal((await asUser(owner, list)).rows.length, 2);
    assert.equal((await asUser(stranger, list)).rows.length, 0);
    assert.equal((await asUser(null, list)).rows.length, 0);
  });
  await t.test('member sees only A, including direct queries and drafts', async () => {
    await asUser(member, async () => {
      assert.deepEqual((await db.query('select id from public.sites')).rows, [{ id: siteA }]);
      assert.equal((await db.query('select * from public.sites where id=$1', [siteB])).rows.length, 0);
      assert.deepEqual((await db.query('select site_id from public.drafts')).rows, [{ site_id: siteA }]);
    });
  });
  await t.test('member cannot update either draft; stranger cannot update sites', async () => {
    for (const id of [siteA, siteB]) {
      const result = await asUser(member, () => db.query("update public.drafts set content='{}' where site_id=$1 returning site_id", [id]));
      assert.equal(result.rows.length, 0);
    }
    assert.equal((await asUser(stranger, () => db.query("update public.sites set name='Bad' returning id"))).rows.length, 0);
  });
  await t.test('owner edit is isolated and stale revision cannot overwrite', async () => {
    await asUser(owner, async () => {
      const edit = () => db.query(`update public.drafts set content='{"name":"Changed"}'
        where site_id=$1 and revision=1 returning revision`, [siteA]);
      assert.deepEqual((await edit()).rows, [{ revision: 2 }]);
      assert.equal((await edit()).rows.length, 0);
      assert.equal((await db.query('select content from public.drafts where site_id=$1', [siteB])).rows[0].content.name, 'B');
    });
  });
  await t.test('owner/id/site reassignment and revision forgery are denied', async () => {
    const statements = [
      ['update public.sites set owner_user_id=$1 where id=$2', [member, siteA]],
      ['update public.sites set id=$1 where id=$2', [siteB, siteA]],
      ['update public.drafts set site_id=$1 where site_id=$2', [siteB, siteA]],
      ['update public.drafts set revision=99 where site_id=$1', [siteA]],
    ];
    for (const [sql, args] of statements) {
      await assert.rejects(asUser(owner, () => db.query(sql, args)), e => e.code === '42501');
    }
  });
  await t.test('membership self-grants and deletes are denied', async () => {
    await assert.rejects(asUser(member, () => db.query('insert into public.site_memberships values ($1,$2)', [siteB, member])), e => e.code === '42501');
    await assert.rejects(asUser(owner, () => db.query('delete from public.site_memberships')), e => e.code === '42501');
  });
  await t.test('creation binds owner to session and rejects invalid data', async () => {
    await assert.rejects(asUser(member, () => db.query(`insert into public.sites(owner_user_id,slug,name)
      values ($1,'stolen','Stolen')`, [owner])), e => e.code === '42501');
    await asUser(member, async () => {
      assert.equal((await db.query(`insert into public.sites(owner_user_id,slug,name)
        values ($1,'own-site','Own') returning id`, [member])).rows.length, 1);
    });
    for (const slug of ['admin', '../a', 'UPPER']) {
      await assert.rejects(asUser(owner, () => db.query('insert into public.sites(owner_user_id,slug,name) values ($1,$2,\'Bad\')', [owner, slug])), e => e.code === '23514');
    }
    await assert.rejects(asUser(owner, () => db.query(`insert into public.sites(owner_user_id,slug,name)
      values ($1,'pizza-a','Duplicate')`, [owner])), e => e.code === '23505');
  });
  await t.test('anonymous access and helper execution are denied', async () => {
    for (const sql of ['select * from public.sites', 'select * from public.drafts', 'select private.accessible_site_ids()']) {
      await assert.rejects(asUser(null, () => db.query(sql), 'anon'), e => e.code === '42501');
    }
  });
  await t.test('draft creation requires ownership and object content; deletion is denied', async () => {
    // Prepare a new site without a draft using the migration administrator.
    const siteC = '20000000-0000-0000-0000-000000000003';
    await db.query(`insert into public.sites(id,owner_user_id,slug,name) values ($1,$2,'pizza-c','C')`, [siteC, owner]);
    await assert.rejects(asUser(member, () => db.query('insert into public.drafts(site_id,content) values ($1,\'{}\')', [siteC])), e => e.code === '42501');
    await assert.rejects(asUser(owner, () => db.query('insert into public.drafts(site_id,content) values ($1,\'[]\')', [siteC])), e => e.code === '23514');
    await asUser(owner, async () => {
      assert.equal((await db.query('insert into public.drafts(site_id,content) values ($1,\'{}\') returning revision', [siteC])).rows[0].revision, 1);
    });
    await assert.rejects(asUser(owner, () => db.query('delete from public.sites where id=$1', [siteC])), e => e.code === '42501');
    assert.equal((await asUser(stranger, () => db.query('select * from public.site_memberships'))).rows.length, 0);
  });
  await t.test('revoked membership is absent on next query', async () => {
    await db.query('delete from public.site_memberships where site_id=$1 and user_id=$2', [siteA, member]);
    assert.equal((await asUser(member, () => db.query('select * from public.sites'))).rows.length, 0);
    assert.equal((await asUser(member, () => db.query('select * from public.drafts'))).rows.length, 0);
  });
});
