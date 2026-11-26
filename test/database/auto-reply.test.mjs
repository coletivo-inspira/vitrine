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
const operator = '10000000-0000-0000-0000-000000000005';
const siteA = '20000000-0000-0000-0000-000000000001';
const siteB = '20000000-0000-0000-0000-000000000002';
const CIPHER = 'v1.aXY.Y2lmcmE';
const HASH = 'a'.repeat(64);
const MESSAGE = 'Olá! Acesse nossa vitrine: {{vitrine.url}}';
const SCOPES = ['instagram_basic', 'instagram_manage_messages'];

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
  for (const id of [owner, admin, editor, ownerB, operator]) await db.query('insert into auth.users (id) values ($1)', [id]);
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'vitrine-a', 'A']);
  await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteB, ownerB, 'vitrine-b', 'B']);
  await db.query(
    "insert into public.site_memberships(site_id, user_id, role) values ($1, $2, 'admin'), ($1, $3, 'editor')",
    [siteA, admin, editor]
  );
  await db.query("insert into public.platform_operators(user_id, role) values ($1, 'platform_admin')", [operator]);
  return db;
}

async function as(db, role, userId, fn) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

const rpc = (db, role, userId, sql, params) => as(db, role, userId, () => db.query(sql, params));
const service = (db, sql, params) => rpc(db, 'service_role', null, sql, params);

async function publish(db, siteId, slug) {
  await db.query(
    "insert into public.publications(site_id, slug, revision, artifact_hash, menu) values ($1, $2, 1, $3, '{}'::jsonb)",
    [siteId, slug, 'b'.repeat(64)]
  );
}

async function connect(db, siteId, accountId = '17841400000000001', actor = owner) {
  return service(db, `select public.service_save_channel_connection($1, $2, 'instagram', $3, '900000000000001',
    'negocio.exemplo', 'Negócio Exemplo', $4, $5, null, true) as status`, [siteId, actor, accountId, SCOPES, CIPHER]);
}

async function openAll(db, siteId) {
  await rpc(db, 'authenticated', operator, 'select public.admin_set_auto_reply_controls(true, true)');
  await rpc(db, 'authenticated', operator, 'select public.admin_set_auto_reply_site_access($1, true)', [siteId]);
}

test('auto_reply: tabelas privadas fechadas para anon e authenticated', async () => {
  const db = await setupDb();
  for (const table of ['channel_connections', 'channel_credentials', 'auto_reply_settings', 'auto_reply_deliveries',
    'auto_reply_recipient_windows', 'channel_oauth_states', 'auto_reply_controls', 'auto_reply_site_access']) {
    await assert.rejects(rpc(db, 'authenticated', owner, `select * from private.${table}`), /permission denied/);
    await assert.rejects(rpc(db, 'anon', null, `select * from private.${table}`), /permission denied/);
  }
  for (const fn of ['service_auto_reply_target(\'instagram\', \'1\')', 'service_consume_channel_oauth_state(\'x\')',
    'service_channel_credential(\'' + siteA + '\', \'instagram\')']) {
    await assert.rejects(rpc(db, 'authenticated', owner, `select public.${fn}`), /permission denied/);
  }
});

test('auto_reply: equipe lê sem token; editor e outra vitrine não alteram', async () => {
  const db = await setupDb();
  await connect(db, siteA);
  const read = await rpc(db, 'authenticated', editor, 'select public.read_auto_reply($1) as s', [siteA]);
  assert.equal(read.rows[0].s.connection.username, 'negocio.exemplo');
  assert.ok(!JSON.stringify(read.rows[0].s).includes(CIPHER));
  await assert.rejects(rpc(db, 'authenticated', ownerB, 'select public.read_auto_reply($1)', [siteA]), /SITE_NOT_FOUND/);
  await assert.rejects(
    rpc(db, 'authenticated', editor, 'select public.save_auto_reply_settings($1, false, $2, \'daily\', 0)', [siteA, MESSAGE]),
    /SITE_NOT_FOUND/
  );
  const saved = await rpc(db, 'authenticated', admin,
    'select public.save_auto_reply_settings($1, false, $2, \'daily\', 0) as s', [siteA, MESSAGE]);
  assert.equal(saved.rows[0].s.settings.enabled, false);
  assert.equal(saved.rows[0].s.settings.version, 1);
});

test('auto_reply: ativar exige controles, liberação, conexão com mensagens e publicação', async () => {
  const db = await setupDb();
  const enable = (version) => rpc(db, 'authenticated', owner,
    'select public.save_auto_reply_settings($1, true, $2, \'daily\', $3) as s', [siteA, MESSAGE, version]);
  await assert.rejects(enable(0), /AUTO_REPLY_NOT_AVAILABLE/);
  await openAll(db, siteA);
  await assert.rejects(enable(0), /AUTO_REPLY_CONNECTION_REQUIRED/);
  await connect(db, siteA);
  await assert.rejects(enable(0), /AUTO_REPLY_SITE_NOT_PUBLISHED/);
  await publish(db, siteA, 'vitrine-a');
  const on = await enable(0);
  assert.equal(on.rows[0].s.settings.enabled, true);
  assert.ok(on.rows[0].s.settings.enabledAt);
  await assert.rejects(enable(0), /AUTO_REPLY_VERSION_CONFLICT/);
  await assert.rejects(rpc(db, 'authenticated', owner,
    'select public.save_auto_reply_settings($1, false, $2, \'daily\', 1)', [siteA, 'x'.repeat(1001)]), /check constraint/);
  const audit = await db.query("select count(*)::int as n from public.audit_logs where action = 'auto_reply_settings'");
  assert.equal(audit.rows[0].n, 1);
});

test('auto_reply: conta em outra vitrine e troca de conta na reconexão são recusadas', async () => {
  const db = await setupDb();
  await connect(db, siteA, '17841400000000001');
  await assert.rejects(connect(db, siteB, '17841400000000001', ownerB), /CHANNEL_ACCOUNT_IN_USE/);
  await assert.rejects(connect(db, siteA, '17841400000000002'), /CHANNEL_ACCOUNT_MISMATCH/);
  const again = await connect(db, siteA, '17841400000000001');
  assert.equal(again.rows[0].status.connection.status, 'connected');
  const audit = await db.query("select action from public.audit_logs where entity_type = 'auto_reply' order by created_at");
  assert.deepEqual(audit.rows.map((r) => r.action), ['channel_connect', 'channel_reconnect']);
});

test('auto_reply: state OAuth é de uso único e vence', async () => {
  const db = await setupDb();
  await service(db, "select public.service_create_channel_oauth_state($1, $2, $3, 'instagram', 'auto_reply', 600)",
    [HASH, siteA, owner]);
  const first = await service(db, 'select * from public.service_consume_channel_oauth_state($1)', [HASH]);
  assert.equal(first.rows[0].site_id, siteA);
  const second = await service(db, 'select * from public.service_consume_channel_oauth_state($1)', [HASH]);
  assert.equal(second.rows.length, 0);
  const expired = 'c'.repeat(64);
  await service(db, "select public.service_create_channel_oauth_state($1, $2, $3, 'instagram', 'auto_reply', 60)",
    [expired, siteA, owner]);
  await db.query("update private.channel_oauth_states set expires_at = now() - interval '1 minute' where nonce_hash = $1", [expired]);
  assert.equal((await service(db, 'select * from public.service_consume_channel_oauth_state($1)', [expired])).rows.length, 0);
});

test('auto_reply: evento repetido não é reclamado duas vezes; frequência é atômica e liberável', async () => {
  const db = await setupDb();
  const status = await connect(db, siteA);
  const conn = (await db.query('select id from private.channel_connections where site_id = $1', [siteA])).rows[0].id;
  assert.ok(status.rows[0].status.connection);
  const claim = () => service(db, "select public.service_claim_auto_reply_event('instagram', 'mid.1', $1, $2, $3, now(), 'corr-12345678') as id",
    [siteA, conn, HASH]);
  assert.ok((await claim()).rows[0].id);
  assert.equal((await claim()).rows[0].id, null);

  const win = (freq) => service(db, 'select public.service_claim_recipient_window($1, $2, $3) as w', [conn, HASH, freq]);
  const firstWin = (await win('daily')).rows[0].w;
  assert.equal(firstWin.claimed, true);
  assert.equal(firstWin.previous, null);
  assert.equal((await win('daily')).rows[0].w.claimed, false);
  await db.query("update private.auto_reply_recipient_windows set last_sent_at = now() - interval '25 hours'");
  const after = (await win('daily')).rows[0].w;
  assert.equal(after.claimed, true);
  await service(db, 'select public.service_release_recipient_window($1, $2, $3)', [conn, HASH, after.previous]);
  assert.equal((await win('once')).rows[0].w.claimed, false);
  await db.query('delete from private.auto_reply_recipient_windows');
  assert.equal((await win('once')).rows[0].w.claimed, true);
  await service(db, 'select public.service_release_recipient_window($1, $2, null)', [conn, HASH]);
  assert.equal((await db.query('select count(*)::int as n from private.auto_reply_recipient_windows')).rows[0].n, 0);
});

test('auto_reply: token inválido desliga; desconexão apaga credencial, janelas e cancela pendentes', async () => {
  const db = await setupDb();
  await openAll(db, siteA);
  await publish(db, siteA, 'vitrine-a');
  await connect(db, siteA);
  const conn = (await db.query('select id from private.channel_connections where site_id = $1', [siteA])).rows[0].id;
  await rpc(db, 'authenticated', owner, 'select public.save_auto_reply_settings($1, true, $2, \'daily\', 0)', [siteA, MESSAGE]);
  await service(db, "select public.service_mark_channel_connection($1, 'reconnect_required', 'token_invalid')", [conn]);
  const after = (await rpc(db, 'authenticated', owner, 'select public.read_auto_reply($1) as s', [siteA])).rows[0].s;
  assert.equal(after.connection.status, 'reconnect_required');
  assert.equal(after.settings.enabled, false);

  await service(db, "select public.service_claim_auto_reply_event('instagram', 'mid.2', $1, $2, $3, now(), null)", [siteA, conn, HASH]);
  await service(db, "select public.service_claim_recipient_window($1, $2, 'daily')", [conn, HASH]);
  await service(db, "select public.service_disconnect_channel($1, 'instagram', $2, 'owner_disconnect')", [siteA, owner]);
  assert.equal((await db.query('select count(*)::int as n from private.channel_credentials')).rows[0].n, 0);
  assert.equal((await db.query('select count(*)::int as n from private.auto_reply_recipient_windows')).rows[0].n, 0);
  const delivery = (await db.query("select status, reason from private.auto_reply_deliveries where provider_event_id = 'mid.2'")).rows[0];
  assert.deepEqual(delivery, { status: 'cancelled', reason: 'disconnected' });
});

test('auto_reply: administração só para platform_admin, sem tokens; suspender desliga', async () => {
  const db = await setupDb();
  await assert.rejects(rpc(db, 'authenticated', owner, 'select public.admin_read_auto_reply()'), /FORBIDDEN/);
  await assert.rejects(rpc(db, 'authenticated', owner, 'select public.admin_set_auto_reply_controls(true, true)'), /FORBIDDEN/);
  await openAll(db, siteA);
  await publish(db, siteA, 'vitrine-a');
  await connect(db, siteA);
  await rpc(db, 'authenticated', owner, 'select public.save_auto_reply_settings($1, true, $2, \'weekly\', 0)', [siteA, MESSAGE]);
  const overview = (await rpc(db, 'authenticated', operator, 'select public.admin_read_auto_reply() as o')).rows[0].o;
  assert.equal(overview.connections.length, 1);
  assert.ok(!JSON.stringify(overview).includes(CIPHER));
  const conn = overview.connections[0].connectionId;
  await rpc(db, 'authenticated', operator, 'select public.admin_suspend_channel_connection($1)', [conn]);
  const target = (await service(db, "select public.service_auto_reply_target('instagram', '17841400000000001') as t")).rows[0].t;
  assert.equal(target.status, 'suspended');
  assert.equal(target.settings.enabled, false);
  assert.equal(target.tokenCiphertext, CIPHER);
});

test('auto_reply: manutenção marca execuções presas como inconclusivas e lista conexões a verificar', async () => {
  const db = await setupDb();
  await connect(db, siteA);
  const conn = (await db.query('select id from private.channel_connections where site_id = $1', [siteA])).rows[0].id;
  await service(db, "select public.service_claim_auto_reply_event('instagram', 'mid.3', $1, $2, $3, now(), null)", [siteA, conn, HASH]);
  await db.query("update private.auto_reply_deliveries set received_at = now() - interval '1 hour'");
  await db.query("update private.channel_connections set last_verified_at = now() - interval '2 days'");
  const result = (await service(db, 'select public.service_auto_reply_maintenance(15, 90, 10) as r')).rows[0].r;
  assert.equal(result.stale, 1);
  assert.equal(result.verify.length, 1);
  const row = (await db.query("select status from private.auto_reply_deliveries where provider_event_id = 'mid.3'")).rows[0];
  assert.equal(row.status, 'uncertain');
});

test('auto_reply: recifragem troca só credenciais de versão antiga e não sobrescreve reconexão concorrente', async () => {
  const db = await setupDb();
  await connect(db, siteA);
  const conn = (await db.query('select id from private.channel_connections where site_id = $1', [siteA])).rows[0].id;
  const pending = (await service(db, 'select * from public.service_auto_reply_credentials_to_rotate(2, 10)')).rows;
  assert.equal(pending.length, 1);
  assert.equal(pending[0].key_version, 1);
  await assert.rejects(rpc(db, 'authenticated', owner, 'select * from public.service_auto_reply_credentials_to_rotate(2, 10)'), /permission denied/);
  const stale = (await service(db, 'select public.service_rotate_channel_credential($1, $2, $3, 2) as ok', [conn, 'v1.b3V0cmE.Y2lmcmE', 'v1.bm92YQ.Y2lmcmE'])).rows[0].ok;
  assert.equal(stale, false);
  const ok = (await service(db, 'select public.service_rotate_channel_credential($1, $2, $3, 2) as ok', [conn, CIPHER, 'v1.bm92YQ.Y2lmcmE'])).rows[0].ok;
  assert.equal(ok, true);
  const row = (await db.query('select token_ciphertext, key_version from private.channel_credentials')).rows[0];
  assert.deepEqual(row, { token_ciphertext: 'v1.bm92YQ.Y2lmcmE', key_version: 2 });
  assert.equal((await service(db, 'select * from public.service_auto_reply_credentials_to_rotate(2, 10)')).rows.length, 0);
  await service(db, `select public.service_save_channel_connection($1, $2, 'instagram', '17841400000000001', null,
    'negocio.exemplo', null, $3, $4, null, true, 3)`, [siteA, owner, SCOPES, CIPHER]);
  assert.equal((await db.query('select key_version from private.channel_credentials')).rows[0].key_version, 3);
});

test('auto_reply: pedido de exclusão guarda só o hash do código; leitura só pelo serviço', async () => {
  const db = await setupDb();
  await service(db, "select public.service_record_data_deletion($1, 'instagram', 1)", [HASH]);
  await service(db, "select public.service_record_data_deletion($1, 'instagram', 0)", ['d'.repeat(64)]);
  const done = (await service(db, 'select public.service_read_data_deletion($1) as r', [HASH])).rows[0].r;
  assert.equal(done.status, 'completed');
  assert.ok(done.completedAt);
  assert.equal((await service(db, 'select public.service_read_data_deletion($1) as r', ['d'.repeat(64)])).rows[0].r.status, 'pending_review');
  assert.equal((await service(db, 'select public.service_read_data_deletion($1) as r', ['e'.repeat(64)])).rows[0].r, null);
  await assert.rejects(rpc(db, 'anon', null, 'select public.service_read_data_deletion($1)', [HASH]), /permission denied/);
  await assert.rejects(rpc(db, 'authenticated', owner, 'select * from private.data_deletion_requests'), /permission denied/);
  const overview = (await rpc(db, 'authenticated', operator, 'select public.admin_read_auto_reply() as o')).rows[0].o;
  assert.deepEqual(overview.deletionRequests, { pendingReview: 1, completed: 1 });
  assert.equal(overview.last7Days.processing, 0);
});
