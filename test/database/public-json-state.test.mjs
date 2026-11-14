import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const OWNER_A = '98000000-0000-0000-0000-00000000000a';
const OWNER_B = '98000000-0000-0000-0000-00000000000b';
const TENANT_A = '99000000-0000-0000-0000-00000000000a';
const TENANT_B = '99000000-0000-0000-0000-00000000000b';
const SITE_A = '9a000000-0000-0000-0000-00000000000a';
const SITE_B = '9a000000-0000-0000-0000-00000000000b';
const MIGRATION = '20261116000500_public_json_state.sql';

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
  const dir = resolve(root, 'supabase/migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  assert.ok(files.includes(MIGRATION));
  for (const file of files) await db.exec(await readFile(resolve(dir, file), 'utf8'));
  await db.query('insert into auth.users (id) values ($1), ($2)', [OWNER_A, OWNER_B]);
  await db.query(
    "insert into public.tenants (id, owner_user_id, slug, name) values ($1, $2, 'vitrine-a', 'A'), ($3, $4, 'vitrine-b', 'B')",
    [TENANT_A, OWNER_A, TENANT_B, OWNER_B]
  );
  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name, tenant_id) values ($1, $2, 'vitrine-a', 'A', $3), ($4, $5, 'vitrine-b', 'B', $6)",
    [SITE_A, OWNER_A, TENANT_A, SITE_B, OWNER_B, TENANT_B]
  );
  return db;
}

async function asAnon(db, fn) {
  await db.exec('begin');
  try {
    await db.exec('set local role anon');
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const enabled = (db, slug) => asAnon(db, async () =>
  (await db.query('select public.public_json_enabled($1) as on', [slug])).rows[0].on);

async function subscribe(db, { tenant = TENANT_A, plan = 'profissional', status = 'active', daysSinceDue = -10 } = {}) {
  await db.query(
    `insert into public.subscriptions (tenant_id, plan_code, status, provider, current_period_end)
     values ($1, $2, $3, 'asaas', now() - make_interval(days => $4))
     on conflict (tenant_id) do update set plan_code = excluded.plan_code, status = excluded.status,
       current_period_end = excluded.current_period_end, grace_until = null`,
    [tenant, plan, status, daysSinceDue]
  );
}

test('public_json_enabled: só Profissional/Equipe em dia, sem pausa; isolado por vitrine', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());

  assert.equal(await enabled(db, 'vitrine-a'), false, 'free');
  assert.equal(await enabled(db, 'nao-existe'), false);

  await subscribe(db, { plan: 'essencial' });
  assert.equal(await enabled(db, 'vitrine-a'), false, 'Essencial não tem public_json');

  await subscribe(db);
  assert.equal(await enabled(db, 'vitrine-a'), true);
  assert.equal(await enabled(db, 'vitrine-b'), false, 'a assinatura da vitrine-a não vale para a vitrine-b');

  await subscribe(db, { tenant: TENANT_B, plan: 'equipe' });
  assert.equal(await enabled(db, 'vitrine-b'), true);

  await subscribe(db, { status: 'grace', daysSinceDue: 8 });
  assert.equal(await enabled(db, 'vitrine-a'), false, 'suspensa depois da tolerância');
  await subscribe(db, { status: 'grace', daysSinceDue: 3 });
  assert.equal(await enabled(db, 'vitrine-a'), true, 'na tolerância continua');

  await db.query('update public.sites set paused_at = now() where id = $1', [SITE_A]);
  assert.equal(await enabled(db, 'vitrine-a'), false, 'pausada');
});

test('public_json_enabled devolve só um booleano e não abre as tabelas privadas ao anon', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await subscribe(db);
  const { fields } = await asAnon(db, () => db.query('select public.public_json_enabled($1)', ['vitrine-a']));
  assert.equal(fields.length, 1);
  await assert.rejects(
    asAnon(db, () => db.query('select * from private.site_entitlements($1)', [SITE_A])),
    /permission denied/
  );
  await assert.rejects(asAnon(db, () => db.query('select * from public.subscriptions')), /permission denied/);
});
