import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const OWNER_A = '93000000-0000-0000-0000-00000000000a';
const OWNER_B = '93000000-0000-0000-0000-00000000000b';
const TENANT_A = '94000000-0000-0000-0000-00000000000a';
const TENANT_B = '94000000-0000-0000-0000-00000000000b';
const SITE_A = '95000000-0000-0000-0000-00000000000a';
const HOST = 'loja.exemplo.com.br';
const MIGRATION = '20261115000300_subscription_lifecycle.sql';

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
  await db.query("insert into public.drafts (site_id, content) values ($1, '{\"name\":\"Loja A\"}'::jsonb)", [SITE_A]);
  await db.query(
    `insert into public.custom_domains (site_id, hostname, status, ssl_status, cf_hostname_id, verification_txt_name, verification_txt_value)
     values ($1, $2, 'active', 'active', 'cf-1', '_vitrine-verify.${HOST}', 'vitrine=teste')`,
    [SITE_A, HOST]
  );
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

// "Vencimento há N dias": o relógio é o do banco; a data de vencimento é deslocada.
async function subscribe(db, { tenant = TENANT_A, status = 'active', daysSinceDue = 0, sub = 'sub_a', plan = 'essencial' } = {}) {
  await db.query(
    `insert into public.subscriptions (tenant_id, plan_code, status, provider, provider_customer_id, provider_subscription_id, current_period_end)
     values ($1, $2, $3, 'asaas', 'cus_a', $4, now() - make_interval(days => $5))
     on conflict (tenant_id) do update set status = excluded.status, current_period_end = excluded.current_period_end,
       grace_until = null, provider_subscription_id = excluded.provider_subscription_id, plan_code = excluded.plan_code`,
    [tenant, plan, status, sub, daysSinceDue]
  );
}

const tick = (db, maxRows = 200) =>
  asService(db, async () => (await db.query('select public.billing_lifecycle_tick($1) as result', [maxRows])).rows[0].result);

async function route(db) {
  return asRole(db, { role: 'anon' }, async () =>
    (await db.query('select * from public.resolve_showcase_host($1)', [HOST])).rows[0] ?? null);
}

async function planOf(db) {
  return asService(db, async () =>
    (await db.query('select plan_code from public.service_site_entitlements($1)', [SITE_A])).rows[0].plan_code);
}

async function statusOf(db, tenant = TENANT_A) {
  return (await db.query('select status, grace_until, current_period_end from public.subscriptions where tenant_id = $1', [tenant])).rows[0];
}

async function contentCounts(db) {
  const { rows } = await db.query(`select
    (select count(*)::int from public.sites where id = $1) as sites,
    (select count(*)::int from public.drafts where site_id = $1) as drafts,
    (select count(*)::int from public.publications where site_id = $1) as publications,
    (select count(*)::int from public.site_memberships where site_id = $1) as memberships,
    (select count(*)::int from public.custom_domains where site_id = $1) as domains`, [SITE_A]);
  return rows[0];
}

function menuFor(slug, count) {
  return {
    schemaVersion: 1, template: 'products-v1', catalogType: 'products', slug, name: 'Loja',
    whatsapp: '5551988887777', currency: 'BRL', categories: [],
    items: Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}`, priceCents: 1000 }))
  };
}

const publish = (db, count) => db.query(
  "insert into public.publications (site_id, slug, revision, status, artifact_hash, menu) values ($1, 'loja-a', 1, 'active', $2, $3::jsonb) on conflict (site_id) do update set menu = excluded.menu",
  [SITE_A, 'e'.repeat(64), JSON.stringify(menuFor('loja-a', count))]
);

test('vencimento + 6 dias continua em tolerância com domínio canônico; + 8 dias suspende', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());

  await subscribe(db, { daysSinceDue: 6 });
  assert.deepEqual(await tick(db), { grace: 1, suspended: 0, hasMore: false });
  const grace = await statusOf(db);
  assert.equal(grace.status, 'grace');
  assert.equal(grace.grace_until.getTime() - grace.current_period_end.getTime(), 7 * 24 * 3600 * 1000);
  assert.deepEqual(await route(db), { slug: 'loja-a', canonical: true });
  assert.equal(await planOf(db), 'essencial');
  assert.deepEqual(await tick(db), { grace: 0, suspended: 0, hasMore: false }, 'tolerância não muda até grace_until');

  await subscribe(db, { status: 'grace', daysSinceDue: 8 });
  assert.deepEqual(await tick(db), { grace: 0, suspended: 1, hasMore: false });
  assert.equal((await statusOf(db)).status, 'suspended');
  assert.deepEqual(await route(db), { slug: 'loja-a', canonical: false });
  assert.equal(await planOf(db), 'free');
});

test('atrasada além da tolerância vai direto para suspended se o Cron não rodou', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await subscribe(db, { status: 'past_due', daysSinceDue: 8 });
  assert.equal(await planOf(db), 'free', 'os direitos já seguem grace_until mesmo antes do Cron');
  assert.deepEqual(await tick(db), { grace: 0, suspended: 1, hasMore: false });
});

test('suspensão não apaga nem altera conteúdo e novas publicações seguem o free', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await subscribe(db, { daysSinceDue: 1 });
  await publish(db, 60);
  const before = await contentCounts(db);
  const publicationBefore = (await db.query('select menu, revision from public.publications where site_id = $1', [SITE_A])).rows[0];

  await subscribe(db, { status: 'grace', daysSinceDue: 8 });
  await tick(db);
  assert.equal((await statusOf(db)).status, 'suspended');
  assert.deepEqual(await contentCounts(db), before);
  assert.deepEqual(
    (await db.query('select menu, revision from public.publications where site_id = $1', [SITE_A])).rows[0],
    publicationBefore,
    'a publicação atual continua no ar como estava'
  );
  await assert.rejects(publish(db, 21), /ACTIVE_ITEMS_LIMIT_EXCEEDED/);
  await publish(db, 20);
});

test('pagamento confirmado depois da suspensão reativa e devolve o domínio canônico', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await subscribe(db, { status: 'grace', daysSinceDue: 9 });
  await tick(db);
  assert.equal((await route(db)).canonical, false);

  const nextPeriod = new Date(Date.now() + 20 * 24 * 3600 * 1000).toISOString();
  const outcome = await asService(db, async () => (await db.query(
    "select public.billing_apply_event('asaas', 'evt_pago', 'PAYMENT_CONFIRMED', 'sub_a', 'pay_1', 'active', $1, 'extend') as outcome",
    [nextPeriod]
  )).rows[0].outcome);
  assert.equal(outcome, 'applied');
  const sub = await statusOf(db);
  assert.equal(sub.status, 'active');
  assert.equal(sub.grace_until, null);
  assert.deepEqual(await route(db), { slug: 'loja-a', canonical: true });
  assert.equal(await planOf(db), 'essencial');
  assert.deepEqual(await tick(db), { grace: 0, suspended: 0, hasMore: false });
});

test('um único RPC move 100 assinaturas; o lote limita e sinaliza o restante', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await db.query(`insert into auth.users (id) select ('96000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid from generate_series(1, 100) i`);
  await db.query(`insert into public.tenants (id, owner_user_id, slug, name)
    select ('97000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
           ('96000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'lote-' || i, 'Lote ' || i
    from generate_series(1, 100) i`);
  await db.query(`insert into public.subscriptions (tenant_id, plan_code, status, provider, current_period_end)
    select ('97000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid, 'essencial',
           case when i % 2 = 0 then 'active' else 'grace' end, 'asaas',
           now() - make_interval(days => case when i % 2 = 0 then 2 else 10 end)
    from generate_series(1, 100) i`);

  assert.deepEqual(await tick(db, 30), { grace: 0, suspended: 30, hasMore: true });
  assert.deepEqual(await tick(db), { grace: 50, suspended: 20, hasMore: false });
  const { rows } = await db.query("select status, count(*)::int as n from public.subscriptions where tenant_id::text like '97%' group by status order by status");
  assert.deepEqual(rows, [{ status: 'grace', n: 50 }, { status: 'suspended', n: 50 }]);
});

test('cada mudança de estado grava audit_logs com a origem', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await subscribe(db, { daysSinceDue: 1 });
  await tick(db);
  await db.query("update public.subscriptions set grace_until = now() - interval '1 minute' where tenant_id = $1", [TENANT_A]);
  await tick(db);
  const { rows } = await db.query(
    "select actor_user_id, action, summary from public.audit_logs where entity_type = 'subscription' and entity_id = $1 order by created_at",
    [TENANT_A]
  );
  const lifecycle = rows.filter((row) => row.summary.source === 'lifecycle');
  assert.deepEqual(lifecycle.map((row) => [row.summary.old.status, row.summary.new.status]), [
    ['active', 'grace'], ['grace', 'suspended']
  ]);
  assert.ok(lifecycle.every((row) => row.action === 'subscription.update' && row.actor_user_id === null));
  assert.equal((await db.query("select current_setting('vitrine.subscription_source', true) as v")).rows[0].v || '', '');
});

test('cancelada a pedido do dono mantém o plano até o fim do período pago', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await subscribe(db, { daysSinceDue: -10 });

  await assert.rejects(
    asService(db, () => db.query('select public.billing_cancel_by_owner($1, $2)', [TENANT_A, OWNER_B])),
    /BILLING_TENANT_FORBIDDEN/
  );
  await asService(db, () => db.query('select public.billing_cancel_by_owner($1, $2)', [TENANT_A, OWNER_A]));
  assert.equal((await statusOf(db)).status, 'canceled');
  assert.equal(await planOf(db), 'essencial');
  assert.equal((await route(db)).canonical, true);
  await assert.rejects(
    asService(db, () => db.query('select public.billing_cancel_by_owner($1, $2)', [TENANT_A, OWNER_A])),
    /SUBSCRIPTION_NOT_CANCELABLE/
  );
  const audit = (await db.query(
    "select actor_user_id, summary from public.audit_logs where entity_type = 'subscription' and summary->>'source' = 'owner_cancel'"
  )).rows;
  assert.equal(audit.length, 1);
  assert.equal(audit[0].actor_user_id, OWNER_A);

  assert.deepEqual(await tick(db), { grace: 0, suspended: 0, hasMore: false }, 'cancelada não entra no ciclo');
  await db.query("update public.subscriptions set current_period_end = now() - interval '1 second' where tenant_id = $1", [TENANT_A]);
  assert.equal(await planOf(db), 'free');
  assert.equal((await route(db)).canonical, false);
});

test('aviso do painel: só a pessoa dona lê a própria assinatura; funções do Cron são do service_role', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await subscribe(db, { daysSinceDue: -2 });
  await subscribe(db, { tenant: TENANT_B, daysSinceDue: 3, sub: 'sub_b' });

  const notices = (userId) => asRole(db, { role: 'authenticated', userId }, async () =>
    (await db.query('select tenant_id, plan_name, status from public.read_subscription_notices()')).rows);
  assert.deepEqual(await notices(OWNER_A), [{ tenant_id: TENANT_A, plan_name: 'Essencial', status: 'active' }]);
  assert.deepEqual((await notices(OWNER_B)).map((row) => row.tenant_id), [TENANT_B]);
  await assert.rejects(asRole(db, { role: 'anon' }, () => db.query('select * from public.read_subscription_notices()')), /permission denied/);
  for (const role of ['anon', 'authenticated']) {
    await assert.rejects(
      asRole(db, { role, userId: OWNER_A }, () => db.query('select public.billing_lifecycle_tick()')),
      /permission denied/
    );
    await assert.rejects(
      asRole(db, { role, userId: OWNER_A }, () => db.query('select public.billing_cancel_by_owner($1, $2)', [TENANT_A, OWNER_A])),
      /permission denied/
    );
  }
});
