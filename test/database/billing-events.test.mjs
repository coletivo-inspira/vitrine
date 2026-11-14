import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const OWNER_A = '90000000-0000-0000-0000-00000000000a';
const OWNER_B = '90000000-0000-0000-0000-00000000000b';
const TENANT_A = '91000000-0000-0000-0000-00000000000a';
const TENANT_B = '91000000-0000-0000-0000-00000000000b';
const SITE_A = '92000000-0000-0000-0000-00000000000a';
const MIGRATION = '20261115000200_billing_events.sql';

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
    "insert into public.tenants (id, owner_user_id, slug, name) values ($1, $2, 'cliente-a', 'Cliente A'), ($3, $4, 'cliente-b', 'Cliente B')",
    [TENANT_A, OWNER_A, TENANT_B, OWNER_B]
  );
  await db.query("insert into public.sites (id, owner_user_id, slug, name, tenant_id) values ($1, $2, 'loja-a', 'Loja A', $3)", [SITE_A, OWNER_A, TENANT_A]);
  return db;
}

async function asRole(db, { role = 'anon', userId = null } = {}, fn) {
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

const asService = (db, fn) => asRole(db, { role: 'service_role' }, fn);

function attach(db, { tenant = TENANT_A, user = OWNER_A, plan = 'essencial', sub = 'sub_1' } = {}) {
  return asService(db, async () => (await db.query(
    'select public.billing_attach_checkout($1, $2, $3, $4, $5, $6) as previous',
    [tenant, user, plan, 'asaas', 'cus_1', sub]
  )).rows[0].previous);
}

function apply(db, id, type, { sub = 'sub_1', status = null, periodEnd = null, mode = 'keep' } = {}) {
  return asService(db, async () => (await db.query(
    'select public.billing_apply_event($1, $2, $3, $4, $5, $6, $7, $8) as outcome',
    ['asaas', id, type, sub, 'pay_1', status, periodEnd, mode]
  )).rows[0].outcome);
}

async function subscriptionOf(db, tenant = TENANT_A) {
  return (await db.query('select * from public.subscriptions where tenant_id = $1', [tenant])).rows[0];
}

test('checkout grava só identificadores do Asaas e deixa a assinatura pendente', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  assert.equal(await attach(db), null);
  const sub = await subscriptionOf(db);
  assert.deepEqual(
    { plan: sub.plan_code, status: sub.status, provider: sub.provider, customer: sub.provider_customer_id, id: sub.provider_subscription_id, by: sub.updated_by },
    { plan: 'essencial', status: 'pending', provider: 'asaas', customer: 'cus_1', id: 'sub_1', by: OWNER_A }
  );
  const entitlements = (await db.query('select plan_code from private.site_entitlements($1)', [SITE_A])).rows[0];
  assert.equal(entitlements.plan_code, 'free');

  assert.equal(await attach(db, { plan: 'equipe', sub: 'sub_2' }), 'sub_1');
  await assert.rejects(attach(db, { user: OWNER_B, sub: 'sub_3' }), /BILLING_TENANT_FORBIDDEN/);
  await assert.rejects(attach(db, { plan: 'free', sub: 'sub_3' }), /BILLING_PLAN_INVALID/);
  await assert.rejects(attach(db, { plan: 'ouro', sub: 'sub_3' }), /BILLING_PLAN_INVALID/);
  await assert.rejects(attach(db, { sub: '../x' }), /BILLING_PROVIDER_IDS_INVALID/);

  assert.equal(await apply(db, 'evt_a', 'PAYMENT_CONFIRMED', { sub: 'sub_2', status: 'active', periodEnd: '2026-12-14T03:00:00Z', mode: 'extend' }), 'applied');
  await assert.rejects(attach(db, { sub: 'sub_4' }), /SUBSCRIPTION_ALREADY_ACTIVE/);
});

test('anon e authenticated não executam as RPCs nem leem private.billing_events', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  for (const role of [{ role: 'anon' }, { role: 'authenticated', userId: OWNER_A }]) {
    await assert.rejects(asRole(db, role, () => db.query(
      "select public.billing_attach_checkout($1, $2, 'essencial', 'asaas', 'cus_1', 'sub_1')", [TENANT_A, OWNER_A]
    )), /permission denied/);
    await assert.rejects(asRole(db, role, () => db.query(
      "select public.billing_apply_event('asaas', 'evt_1', 'PAYMENT_CONFIRMED', 'sub_1', null, 'active', null, 'keep')"
    )), /permission denied/);
    await assert.rejects(asRole(db, role, () => db.query('select * from private.billing_events')), /permission denied/);
  }
});

test('evento repetido altera a assinatura uma vez; confirmação ativa com o período do evento; estorno deixa past_due', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await attach(db);
  const confirm = { status: 'active', periodEnd: '2026-12-14T03:00:00Z', mode: 'extend' };
  assert.equal(await apply(db, 'evt_1', 'PAYMENT_CONFIRMED', confirm), 'applied');
  assert.equal(await apply(db, 'evt_1', 'PAYMENT_CONFIRMED', confirm), 'duplicate');
  let sub = await subscriptionOf(db);
  assert.equal(sub.status, 'active');
  assert.equal(sub.current_period_end.toISOString(), '2026-12-14T03:00:00.000Z');
  assert.equal((await db.query('select plan_code from private.site_entitlements($1)', [SITE_A])).rows[0].plan_code, 'essencial');

  const audits = (await db.query(
    "select action, actor_user_id, summary from public.audit_logs where entity_type = 'subscription' order by created_at, id"
  )).rows;
  const updates = audits.filter((row) => row.action === 'subscription.update');
  assert.equal(updates.length, 1);
  assert.equal(updates[0].summary.source, 'service_role');
  assert.equal(updates[0].actor_user_id, null);
  assert.equal(updates[0].summary.new.status, 'active');

  assert.equal(await apply(db, 'evt_2', 'PAYMENT_RECEIVED', { ...confirm, periodEnd: '2026-11-30T03:00:00Z' }), 'applied');
  assert.equal((await subscriptionOf(db)).current_period_end.toISOString(), '2026-12-14T03:00:00.000Z');

  assert.equal(await apply(db, 'evt_3', 'PAYMENT_REFUNDED', { status: 'past_due', periodEnd: '2026-11-20T12:00:00Z', mode: 'clamp' }), 'applied');
  sub = await subscriptionOf(db);
  assert.equal(sub.status, 'past_due');
  assert.equal(sub.current_period_end.toISOString(), '2026-11-20T12:00:00.000Z');

  const events = (await db.query('select event_id, outcome, tenant_id from private.billing_events order by event_id')).rows;
  assert.deepEqual(events.map((e) => [e.event_id, e.outcome, e.tenant_id]), [
    ['evt_1', 'applied', TENANT_A], ['evt_2', 'applied', TENANT_A], ['evt_3', 'applied', TENANT_A]
  ]);
});

test('cancelamento é final, atraso não vale para pendente e evento de outra assinatura fica sem efeito', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await attach(db);
  assert.equal(await apply(db, 'evt_overdue', 'PAYMENT_OVERDUE', { status: 'past_due' }), 'ignored');
  assert.equal((await subscriptionOf(db)).status, 'pending');
  assert.equal(await apply(db, 'evt_created', 'PAYMENT_CREATED'), 'ignored');
  assert.equal(await apply(db, 'evt_unknown', 'PAYMENT_CONFIRMED', { sub: 'sub_de_outro', status: 'active' }), 'unmatched');
  assert.equal(await apply(db, 'evt_cancel', 'SUBSCRIPTION_DELETED', { status: 'canceled' }), 'applied');
  assert.equal(await apply(db, 'evt_late', 'PAYMENT_RECEIVED', { status: 'active', periodEnd: '2026-12-14T03:00:00Z', mode: 'extend' }), 'ignored');
  assert.equal((await subscriptionOf(db)).status, 'canceled');
  await assert.rejects(apply(db, 'evt_bad', 'PAYMENT_CONFIRMED', { status: 'suspended' }), /BILLING_EVENT_INVALID_STATUS/);
  assert.equal((await db.query("select count(*)::int as n from private.billing_events where event_id = 'evt_bad'")).rows[0].n, 0);

  assert.equal(await attach(db, { sub: 'sub_2' }), 'sub_1');
  assert.equal((await subscriptionOf(db)).status, 'pending');
});

test('nenhuma coluna de cobrança guarda CPF, CNPJ, e-mail ou cartão', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const columns = (await db.query(`
    select table_schema || '.' || table_name || '.' || column_name as name
    from information_schema.columns
    where (table_schema, table_name) in (('private', 'billing_events'), ('public', 'subscriptions'))
  `)).rows.map((row) => row.name);
  assert.ok(columns.includes('private.billing_events.event_id'));
  for (const column of columns) assert.doesNotMatch(column, /cpf|cnpj|tax|email|card|cartao|document|payload|name$/i);
});
