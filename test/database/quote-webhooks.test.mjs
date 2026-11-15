import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const owner = '10000000-0000-0000-0000-000000000001';
const admin = '10000000-0000-0000-0000-000000000002';
const editor = '10000000-0000-0000-0000-000000000003';
const ownerB = '10000000-0000-0000-0000-000000000004';
const siteA = '20000000-0000-0000-0000-000000000001';
const siteB = '20000000-0000-0000-0000-000000000002';
const CIPHER = 'v1.aXY.Y2lmcmE';

async function setupDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;
  `);
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const migrationsDir = resolve(root, 'supabase/migrations');
  for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
  }
  for (const id of [owner, admin, editor, ownerB]) await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'vitrine-a', 'A']);
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteB, ownerB, 'vitrine-b', 'B']);
  await db.query(
    "insert into public.site_memberships(site_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'editor')",
    [siteA, admin, editor]
  );
  return db;
}

async function as(db, role, userId, fn, commit = true) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    await db.exec(commit ? 'commit' : 'rollback');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const rpc = (db, role, userId, sql, params) => as(db, role, userId, () => db.query(sql, params));

test('quote_webhooks: dono e admin configuram; editor, outra vitrine e anônimo não leem nem alteram', async () => {
  const db = await setupDb();
  const saved = await rpc(db, 'authenticated', owner,
    'select public.save_quote_webhook_url($1, $2) as s', [siteA, 'https://hooks.example.com/crm?token=abc']);
  assert.equal(saved.rows[0].s.url, 'https://hooks.example.com/crm?token=abc');
  assert.equal(saved.rows[0].s.hasSecret, false);

  const secret = await rpc(db, 'authenticated', admin, 'select public.save_quote_webhook_secret($1, $2) as s', [siteA, CIPHER]);
  assert.equal(secret.rows[0].s.hasSecret, true);
  assert.ok(!JSON.stringify(secret.rows[0].s).includes(CIPHER), 'a leitura nunca devolve o texto cifrado');

  for (const [role, user] of [['authenticated', editor], ['authenticated', ownerB]]) {
    await assert.rejects(rpc(db, role, user, 'select public.read_quote_webhook($1)', [siteA]), /SITE_NOT_FOUND/);
    await assert.rejects(rpc(db, role, user, 'select public.save_quote_webhook_url($1, $2)', [siteA, 'https://evil.example.com/x']), /SITE_NOT_FOUND/);
  }
  await assert.rejects(rpc(db, 'anon', null, 'select public.read_quote_webhook($1)', [siteA]), /permission denied/);
  await assert.rejects(rpc(db, 'authenticated', owner, 'select * from private.quote_webhooks', []), /permission denied/);
  await assert.rejects(rpc(db, 'authenticated', owner, 'select * from public.service_quote_webhook_target($1)', ['vitrine-a']), /permission denied/);

  await assert.rejects(
    rpc(db, 'authenticated', owner, 'select public.save_quote_webhook_url($1, $2)', [siteA, 'http://hooks.example.com']),
    /check constraint/
  );

  const audit = await db.query("select action, summary from public.audit_logs where entity_type = 'quote_webhook' order by created_at");
  assert.deepEqual(audit.rows.map((row) => row.action), ['quote_webhook_url', 'quote_webhook_secret']);
  assert.deepEqual(audit.rows[0].summary, { host: 'hooks.example.com' }, 'auditoria guarda só o host');
});

test('quote_webhooks: service_role lê o destino e grava só status e contadores', async () => {
  const db = await setupDb();
  await rpc(db, 'authenticated', owner, 'select public.save_quote_webhook_url($1, $2)', [siteA, 'https://hooks.example.com/v']);
  const none = await rpc(db, 'service_role', null, 'select * from public.service_quote_webhook_target($1)', ['vitrine-a']);
  assert.equal(none.rows.length, 0, 'sem segredo não há destino');
  await rpc(db, 'authenticated', owner, 'select public.save_quote_webhook_secret($1, $2)', [siteA, CIPHER]);
  const target = await rpc(db, 'service_role', null, 'select * from public.service_quote_webhook_target($1)', ['vitrine-a']);
  assert.deepEqual(target.rows[0], { site_id: siteA, url: 'https://hooks.example.com/v', secret_ciphertext: CIPHER });
  const other = await rpc(db, 'service_role', null, 'select * from public.service_quote_webhook_target($1)', ['vitrine-b']);
  assert.equal(other.rows.length, 0);

  const record = 'select public.service_record_quote_webhook_delivery($1, $2, $3, $4, $5)';
  await rpc(db, 'service_role', null, record, [siteA, 'lead', true, 200, 1]);
  await rpc(db, 'service_role', null, record, [siteA, 'lead', false, 503, 3]);
  await rpc(db, 'service_role', null, record, [siteA, 'test', true, 204, 1]);
  await assert.rejects(rpc(db, 'authenticated', owner, record, [siteA, 'lead', true, 200, 1]), /permission denied/);
  await assert.rejects(rpc(db, 'service_role', null, record, [siteA, 'lead', false, 503, 4]), /check constraint/);

  const status = (await rpc(db, 'authenticated', owner, 'select public.read_quote_webhook($1) as s', [siteA])).rows[0].s;
  assert.deepEqual(status.totals, { delivered: 1, failed: 1 });
  assert.equal(status.lastDelivery.kind, 'test');
  assert.equal(status.lastDelivery.httpStatus, 204);

  const columns = await db.query(
    "select column_name from information_schema.columns where table_schema = 'private' and table_name = 'quote_webhooks'"
  );
  assert.deepEqual(columns.rows.map((row) => row.column_name).sort(), [
    'delivered_count', 'failed_count', 'last_attempts', 'last_delivery_at', 'last_http_status', 'last_kind', 'last_ok',
    'secret_ciphertext', 'secret_created_at', 'site_id', 'updated_at', 'url'
  ], 'nenhuma coluna com dado do pré-orçamento ou do visitante');

  await rpc(db, 'authenticated', owner, 'select public.delete_quote_webhook($1)', [siteA]);
  assert.equal((await db.query('select count(*)::int as n from private.quote_webhooks')).rows[0].n, 0);
});
