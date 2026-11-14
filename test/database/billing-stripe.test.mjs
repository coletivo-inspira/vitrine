import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseAsaasWebhookEvent } from '../../src/billing/asaas.mjs';
import { parseStripeWebhookEvent } from '../../src/billing/stripe.mjs';
import { subscriptionChangeFor } from '../../src/billing/provider.mjs';

const OWNER_A = '93000000-0000-0000-0000-00000000000a';
const OWNER_B = '93000000-0000-0000-0000-00000000000b';
const TENANT_A = '94000000-0000-0000-0000-00000000000a';
const TENANT_B = '94000000-0000-0000-0000-00000000000b';
const SITE_A = '95000000-0000-0000-0000-00000000000a';
const SITE_B = '95000000-0000-0000-0000-00000000000b';
const REF = 'vtr_0123456789abcdef0123456789abcdef';

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
  for (const file of files) await db.exec(await readFile(resolve(dir, file), 'utf8'));
  await db.query('insert into auth.users (id) values ($1), ($2)', [OWNER_A, OWNER_B]);
  await db.query(
    "insert into public.tenants (id, owner_user_id, slug, name) values ($1, $2, 'cliente-asaas', 'Cliente Asaas'), ($3, $4, 'cliente-stripe', 'Cliente Stripe')",
    [TENANT_A, OWNER_A, TENANT_B, OWNER_B]
  );
  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name, tenant_id) values ($1, $2, 'loja-asaas', 'Loja Asaas', $3), ($4, $5, 'loja-stripe', 'Loja Stripe', $6)",
    [SITE_A, OWNER_A, TENANT_A, SITE_B, OWNER_B, TENANT_B]
  );
  return db;
}

async function asService(db, fn) {
  await db.exec('begin');
  try {
    await db.exec('set local role service_role');
    const result = await fn();
    await db.exec('commit');
    return result;
  } catch (error) {
    await db.exec('rollback');
    throw error;
  }
}

function attach(db, tenant, user, provider, customer, sub) {
  return asService(db, () => db.query(
    'select public.billing_attach_checkout($1, $2, $3, $4, $5, $6)',
    [tenant, user, 'profissional', provider, customer, sub]
  ));
}

// O mesmo caminho da rota: evento normalizado -> subscriptionChangeFor -> RPC.
function apply(db, provider, event) {
  const change = subscriptionChangeFor(event);
  return asService(db, async () => (await db.query(
    'select public.billing_apply_event($1, $2, $3, $4, $5, $6, $7, $8) as outcome',
    [provider, event.id, event.providerType, event.subscriptionId, event.paymentId,
      change?.status ?? null, change?.periodEnd ?? null, change?.periodMode ?? 'keep']
  )).rows[0].outcome);
}

async function entitlements(db, site) {
  const row = (await db.query('select * from private.site_entitlements($1)', [site])).rows[0];
  const { site_id: _site, ...rest } = row;
  return rest;
}

function stripeInvoice(id, type, end) {
  return parseStripeWebhookEvent({
    id, object: 'event', type, livemode: false,
    data: {
      object: {
        object: 'invoice', id: 'in_test1',
        parent: { subscription_details: { subscription: 'sub_test1', metadata: { vitrine_subscription: REF } } },
        lines: { data: [{ period: { start: end - 30 * 86400, end } }] }
      }
    }
  });
}

test('assinatura paga pelo Stripe libera os mesmos recursos que a do Asaas', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await attach(db, TENANT_A, OWNER_A, 'asaas', 'cus_1', 'sub_1');
  await attach(db, TENANT_B, OWNER_B, 'stripe', 'cus_test1', REF);
  assert.equal((await entitlements(db, SITE_B)).plan_code, 'free', 'pendente no Stripe ainda é free');

  const dueDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  assert.equal(await apply(db, 'asaas', parseAsaasWebhookEvent({
    id: 'evt_asaas_1', event: 'PAYMENT_CONFIRMED',
    payment: { id: 'pay_1', subscription: 'sub_1', dueDate }
  })), 'applied');
  const end = Math.floor(Date.now() / 1000) + 29 * 86400;
  const paid = stripeInvoice('evt_test_1', 'invoice.paid', end);
  assert.equal(await apply(db, 'stripe', paid), 'applied');
  assert.equal(await apply(db, 'stripe', paid), 'duplicate');

  const asaas = await entitlements(db, SITE_A);
  const stripe = await entitlements(db, SITE_B);
  assert.equal(stripe.plan_code, 'profissional');
  assert.deepEqual(stripe, asaas);

  const sub = (await db.query('select status, provider, current_period_end from public.subscriptions where tenant_id = $1', [TENANT_B])).rows[0];
  assert.equal(sub.status, 'active');
  assert.equal(sub.provider, 'stripe');
  assert.equal(sub.current_period_end.toISOString(), new Date(end * 1000).toISOString());
  const audits = (await db.query(
    "select count(*)::int as n from public.audit_logs where entity_type = 'subscription' and action = 'subscription.update' and entity_id = $1::text",
    [TENANT_B]
  )).rows[0].n;
  assert.equal(audits, 1, 'evento repetido não gera nova auditoria');

  const events = (await db.query("select provider, event_id, event_type, outcome, tenant_id from private.billing_events where provider = 'stripe'")).rows;
  assert.deepEqual(events, [{ provider: 'stripe', event_id: 'evt_test_1', event_type: 'invoice.paid', outcome: 'applied', tenant_id: TENANT_B }]);
});

test('Stripe: falha de pagamento deixa past_due, exclusão cancela e o mesmo id do Asaas não colide', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await attach(db, TENANT_B, OWNER_B, 'stripe', 'cus_test1', REF);
  const end = Math.floor(Date.now() / 1000) + 29 * 86400;
  assert.equal(await apply(db, 'stripe', stripeInvoice('evt_shared', 'invoice.paid', end)), 'applied');
  assert.equal(await apply(db, 'asaas', { id: 'evt_shared', providerType: 'PAYMENT_CONFIRMED', kind: 'payment_confirmed', subscriptionId: REF, paymentId: null, periodEnd: null }), 'unmatched');
  assert.equal(await apply(db, 'stripe', stripeInvoice('evt_test_fail', 'invoice.payment_failed', end)), 'applied');
  assert.equal((await db.query('select status from public.subscriptions where tenant_id = $1', [TENANT_B])).rows[0].status, 'past_due');
  assert.equal(await apply(db, 'stripe', parseStripeWebhookEvent({
    id: 'evt_test_del', object: 'event', type: 'customer.subscription.deleted', livemode: false,
    data: { object: { object: 'subscription', id: 'sub_test1', metadata: { vitrine_subscription: REF } } }
  })), 'applied');
  assert.equal((await db.query('select status from public.subscriptions where tenant_id = $1', [TENANT_B])).rows[0].status, 'canceled');
});
