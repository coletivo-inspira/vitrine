import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const MIGRATION = '20261116001500_sponsor_role.sql';
const ADMIN = '81000000-0000-0000-0000-0000000000a1';
const SPONSOR = '81000000-0000-0000-0000-0000000000b1';
const OWNER = '81000000-0000-0000-0000-0000000000c1';
const PAID_OWNER = '81000000-0000-0000-0000-0000000000c2';
const NEWCOMER = '81000000-0000-0000-0000-0000000000d1';
const PAID_TENANT = '82000000-0000-0000-0000-0000000000e1';

function siteId(n) {
  return `83000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
}

function currentMonthDay(day) {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function previousMonthDay(day) {
  const now = new Date();
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, day));
  return date.toISOString().slice(0, 10);
}

function monthKey(isoDate) {
  return isoDate.slice(0, 7);
}

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
  await db.query('insert into auth.users (id) values ($1), ($2), ($3), ($4), ($5)', [ADMIN, SPONSOR, OWNER, PAID_OWNER, NEWCOMER]);
  await db.query("insert into public.platform_operators (user_id, role) values ($1, 'platform_admin')", [ADMIN]);
  await db.query(
    "insert into public.profiles (user_id, display_name, business_name, city, whatsapp) values ($1, 'Rita', 'Doces da Rita', 'Corumbá', '5567999990000')",
    [OWNER]
  );
  return db;
}

async function addSite(db, n, { city, uf, owner = OWNER, tenant = null, archived = false, visits = 0, clicks = 0, day } = {}) {
  const id = siteId(n);
  const slug = `vitrine-secreta-${n}`;
  await db.query(
    'insert into public.sites (id, owner_user_id, slug, name, tenant_id) values ($1, $2, $3, $4, $5)',
    [id, owner, slug, `Negócio Secreto ${n}`, tenant]
  );
  await db.query('insert into public.drafts (site_id, content) values ($1, $2)', [id, '{}']);
  if (city !== undefined) {
    const items = [{ id: 'item-secreto', name: 'Item Secreto', priceCents: 1000 }];
    const menu = {
      schemaVersion: 1, template: 'pizzeria-v1', slug, name: `Negócio Secreto ${n}`, currency: 'BRL',
      items, categories: [{ id: 'itens', name: 'Itens', items }],
      ...(city ? { locality: { city, uf, citySlug: `${city.toLowerCase().replace(/[^a-z]+/g, '-')}-${uf.toLowerCase()}` } } : {})
    };
    await db.query(
      `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu)
       values ($1, $2, 1, 'active', $3, $4)`,
      [id, slug, 'b'.repeat(64), JSON.stringify(menu)]
    );
  }
  const metricDay = day ?? currentMonthDay(1);
  for (const [name, count] of [['visit', visits], ['whatsapp_order', clicks]]) {
    if (!count) continue;
    await db.query(
      `insert into public.site_metrics_daily (site_id, metric_date, metric_hour, item_key, metric_name, count_value)
       values ($1, $2, 10, '', $3, $4)`,
      [id, metricDay, name, count]
    );
  }
  if (archived) {
    await db.query('update public.sites set paused_at = now(), archived_at = now() where id = $1', [id]);
  }
  return id;
}

async function asRole(db, { role = 'authenticated', userId = null, commit = false }, fn) {
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

async function readImpact(db, userId) {
  const { rows } = await asRole(db, { userId }, () => db.query('select public.read_sponsor_impact() as impact'));
  return rows[0].impact;
}

async function grantSponsor(db, target = SPONSOR) {
  return asRole(db, { userId: ADMIN, commit: true }, () =>
    db.query('select * from public.grant_sponsor_role($1)', [target]));
}

const denied = (code) => (error) => error?.code === code;

test('só platform_admin atribui e retira o papel sponsor, com auditoria; o próprio patrocinador não se promove', async () => {
  const db = await setupDb();
  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query('select * from public.grant_sponsor_role($1)', [SPONSOR])), denied('42501'));
  await assert.rejects(asRole(db, { userId: OWNER }, () =>
    db.query('select * from public.grant_sponsor_role($1)', [SPONSOR])), denied('42501'));
  await assert.rejects(asRole(db, { role: 'anon' }, () =>
    db.query('select * from public.grant_sponsor_role($1)', [SPONSOR])), denied('42501'));
  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query("insert into public.platform_operators (user_id, role) values ($1, 'sponsor')", [SPONSOR])), denied('42501'));

  const granted = await grantSponsor(db);
  assert.equal(granted.rows[0].user_id, SPONSOR);
  assert.equal((await grantSponsor(db)).rows.length, 1, 'atribuir de novo não duplica');

  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query("update public.platform_operators set role = 'platform_admin' where user_id = $1", [SPONSOR])), denied('42501'));
  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query('select * from public.grant_sponsor_role($1)', [NEWCOMER])), denied('42501'));
  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query('select * from public.list_sponsors()')), denied('42501'));

  await assert.rejects(grantSponsor(db, ADMIN), (error) => error?.message === 'OPERATOR_ROLE_CONFLICT');
  await assert.rejects(grantSponsor(db, '81000000-0000-0000-0000-0000000000ff'), (error) => error?.message === 'SPONSOR_USER_NOT_FOUND');

  const listed = await asRole(db, { userId: ADMIN }, () => db.query('select * from public.list_sponsors()'));
  assert.deepEqual(listed.rows.map((row) => row.user_id), [SPONSOR]);

  const revoked = await asRole(db, { userId: ADMIN, commit: true }, () =>
    db.query('select public.revoke_sponsor_role($1) as removed', [SPONSOR]));
  assert.equal(revoked.rows[0].removed, true);
  const adminKept = await asRole(db, { userId: ADMIN, commit: true }, () =>
    db.query('select public.revoke_sponsor_role($1) as removed', [ADMIN]));
  assert.equal(adminKept.rows[0].removed, false, 'retirar patrocinador nunca remove um platform_admin');

  const { rows: audit } = await db.query(
    "select action, entity_type, entity_id, actor_user_id from public.audit_logs where entity_type = 'platform_operator' order by created_at, action"
  );
  assert.deepEqual(audit.map((row) => [row.action, row.entity_id, row.actor_user_id]), [
    ['sponsor_granted', SPONSOR, ADMIN],
    ['sponsor_revoked', SPONSOR, ADMIN]
  ]);
});

test('sponsor não lê nenhuma linha de sites, drafts, profiles nem site_metrics_daily (publicações só como visitante) nem funções internas', async () => {
  const db = await setupDb();
  await addSite(db, 1, { city: 'Campo Grande', uf: 'MS', visits: 30, clicks: 4 });
  await grantSponsor(db);

  for (const table of ['public.sites', 'public.drafts', 'public.site_metrics_daily', 'public.profiles', 'public.tenants', 'public.subscriptions']) {
    const { rows } = await asRole(db, { userId: SPONSOR }, () => db.query(`select count(*)::int as n from ${table}`));
    assert.equal(rows[0].n, 0, `${table} não pode devolver linhas ao patrocinador`);
  }
  const direct = await asRole(db, { userId: SPONSOR }, () =>
    db.query('select site_id, count_value from public.site_metrics_daily where site_id = $1', [siteId(1)]));
  assert.equal(direct.rows.length, 0, 'leitura direta filtrada pela vitrine também volta vazia');
  const publicationsQuery = () => db.query('select slug, revision, status, menu from public.publications order by slug');
  const asSponsor = await asRole(db, { userId: SPONSOR }, publicationsQuery);
  const asVisitor = await asRole(db, { role: 'anon' }, publicationsQuery);
  assert.deepEqual(asSponsor.rows, asVisitor.rows, 'publicações: nada além do que qualquer visitante já vê');

  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query('select * from private.site_entitlements($1)', [siteId(1)])), denied('42501'));
  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query('select private.is_sponsor()')), denied('42501'));
  await assert.rejects(asRole(db, { userId: SPONSOR }, () =>
    db.query('select public.read_platform_overview()')), denied('42501'));
  const updated = await asRole(db, { userId: SPONSOR }, () =>
    db.query("update public.sites set name = 'x' where id = $1 returning id", [siteId(1)]));
  assert.equal(updated.rows.length, 0);
});

test('Impacto: só agregados de vitrines sociais não arquivadas, por mês e por cidade; cidade com 4 vitrines vira "Outras cidades"', async () => {
  const db = await setupDb();
  for (let n = 1; n <= 5; n += 1) await addSite(db, n, { city: 'Campo Grande', uf: 'MS', visits: 10 * n, clicks: n });
  await addSite(db, 6, { city: 'Campo Grande', uf: 'MS', visits: 7, clicks: 1, day: previousMonthDay(15) });
  for (let n = 7; n <= 10; n += 1) await addSite(db, n, { city: 'Dourados', uf: 'MS', visits: 5, clicks: 1 });
  await addSite(db, 11, { visits: 3 });
  await addSite(db, 12, { city: 'Campo Grande', uf: 'MS', archived: true, visits: 9000, clicks: 900 });
  await db.query("insert into public.tenants (id, owner_user_id, slug, name, plan) values ($1, $2, 'cliente-pago', 'Cliente Pago', 'free')", [PAID_TENANT, PAID_OWNER]);
  await db.query("insert into public.subscriptions (tenant_id, plan_code, status, current_period_end) values ($1, 'essencial', 'active', now() + interval '20 days')", [PAID_TENANT]);
  await addSite(db, 13, { city: 'Campo Grande', uf: 'MS', owner: PAID_OWNER, tenant: PAID_TENANT, visits: 8000, clicks: 800 });
  await grantSponsor(db);

  await assert.rejects(asRole(db, { userId: OWNER }, () => db.query('select public.read_sponsor_impact()')), denied('42501'));
  await assert.rejects(asRole(db, { role: 'anon' }, () => db.query('select public.read_sponsor_impact()')), denied('42501'));

  const impact = await readImpact(db, SPONSOR);
  assert.equal(impact.suppressed, false);
  assert.equal(impact.minGroupSize, 5);
  assert.equal(impact.activeSites, 11, 'exclui a vitrine arquivada e a do plano pago');
  assert.equal(impact.months.length, 12);
  const current = impact.months.at(-1);
  const previous = impact.months.at(-2);
  assert.equal(current.month, monthKey(currentMonthDay(1)));
  assert.deepEqual(current, { month: current.month, visits: 150 + 20 + 3, whatsappClicks: 15 + 4 });
  assert.deepEqual(previous, { month: monthKey(previousMonthDay(15)), visits: 7, whatsappClicks: 1 });

  assert.deepEqual(impact.cities.map((city) => [city.city, city.sites, city.others, city.visits, city.whatsappClicks]), [
    ['Campo Grande (MS)', 6, false, 157, 16],
    ['Outras cidades', 5, true, 23, 4]
  ]);
  assert.ok(impact.cities.every((city) => city.sites >= impact.minGroupSize));
  assert.equal(impact.cities[0].months.length, 12);

  const text = JSON.stringify(impact);
  for (const secret of ['Negócio Secreto', 'vitrine-secreta', 'Item Secreto', 'Dourados', 'Corumbá', 'Doces da Rita', siteId(1), OWNER]) {
    assert.ok(!text.includes(secret), `a resposta não pode conter ${secret}`);
  }

  const asAdmin = await readImpact(db, ADMIN);
  assert.deepEqual(asAdmin, impact, 'platform_admin vê a mesma tela, sem dados a mais');
});

test('supressão < 5: "Outras cidades" pequena absorve a menor cidade visível; menos de 5 vitrines no total não mostra nada', async () => {
  const db = await setupDb();
  for (let n = 1; n <= 5; n += 1) await addSite(db, n, { city: 'Campo Grande', uf: 'MS', visits: 10, clicks: 1 });
  for (let n = 6; n <= 11; n += 1) await addSite(db, n, { city: 'Três Lagoas', uf: 'MS', visits: 1 });
  for (let n = 12; n <= 14; n += 1) await addSite(db, n, { city: 'Dourados', uf: 'MS', visits: 2 });
  await grantSponsor(db);

  const folded = await readImpact(db, SPONSOR);
  assert.deepEqual(folded.cities.map((city) => [city.city, city.sites]), [
    ['Três Lagoas (MS)', 6],
    ['Outras cidades', 8]
  ], 'Dourados (3) sozinha seria um grupo pequeno; Campo Grande (5, a menor visível) entra em Outras cidades');
  assert.equal(folded.cities.reduce((sum, city) => sum + city.sites, 0), folded.activeSites);
  assert.equal(folded.cities.find((city) => city.others).visits, 50 + 6);

  const small = await setupDb();
  for (let n = 1; n <= 4; n += 1) await addSite(small, n, { city: 'Campo Grande', uf: 'MS', visits: 10, clicks: 2 });
  await grantSponsor(small);
  const suppressed = await readImpact(small, SPONSOR);
  assert.equal(suppressed.suppressed, true);
  assert.equal(suppressed.activeSites, null);
  assert.deepEqual(suppressed.months, []);
  assert.deepEqual(suppressed.cities, []);
});
