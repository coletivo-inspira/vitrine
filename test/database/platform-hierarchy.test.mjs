import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import { PLATFORM_CAPABILITIES, PLATFORM_ROLES } from '../../src/admin/platform-roles.mjs';

const MIGRATION = '20261128001000_platform_hierarchy_licenses.sql';
const OWNER = '91000000-0000-0000-0000-0000000000a1';
const ADMIN = '91000000-0000-0000-0000-0000000000a2';
const LICENSER = '91000000-0000-0000-0000-0000000000a3';
const SPONSOR = '91000000-0000-0000-0000-0000000000a4';
const MERCHANT = '91000000-0000-0000-0000-0000000000b1';
const MERCHANT_2 = '91000000-0000-0000-0000-0000000000b2';
const MERCHANT_3 = '91000000-0000-0000-0000-0000000000b3';
const NEWCOMER = '91000000-0000-0000-0000-0000000000c1';
const SITE = '92000000-0000-0000-0000-000000000001';
const SITE_2 = '92000000-0000-0000-0000-000000000002';
const SITE_3 = '92000000-0000-0000-0000-000000000003';
const DEMO = '92000000-0000-0000-0000-000000000009';

const USERS = [
  [OWNER, 'felipe@exemplo.com'], [ADMIN, 'ana@exemplo.com'], [LICENSER, 'leo@exemplo.com'],
  [SPONSOR, 'patrocinio@exemplo.com'], [MERCHANT, 'rita@doces.com'], [MERCHANT_2, 'joao@bar.com'],
  [MERCHANT_3, 'bia@arte.com'], [NEWCOMER, 'novo@exemplo.com']
];

async function setupDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin bypassrls;
    create schema auth;
    create table auth.users (
      id uuid primary key,
      email varchar(255),
      created_at timestamptz default now(),
      last_sign_in_at timestamptz
    );
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
  for (const [id, email] of USERS) await db.query('insert into auth.users (id, email) values ($1, $2)', [id, email]);
  await db.query("insert into public.platform_operators (user_id, role) values ($1, 'platform_admin'), ($2, 'license_manager'), ($3, 'sponsor')", [ADMIN, LICENSER, SPONSOR]);
  await db.query("insert into public.profiles (user_id, display_name, business_name, city) values ($1, 'Rita', 'Doces da Rita', 'Corumbá')", [MERCHANT]);
  for (const [id, owner, slug] of [[SITE, MERCHANT, 'doces-da-rita'], [SITE_2, MERCHANT_2, 'bar-do-joao'], [SITE_3, MERCHANT_3, 'arte-da-bia']]) {
    await db.query('insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [id, owner, slug, `Vitrine ${slug}`]);
    await db.query('insert into public.drafts (site_id, content) values ($1, $2)', [id, '{}']);
  }
  await db.query('select private.bootstrap_platform_owner($1)', ['Felipe@Exemplo.com ']);
  return db;
}

async function asRole(db, { role = 'authenticated', userId = null, commit = true }, fn) {
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

const as = (db, userId, sql, params = [], options = {}) => asRole(db, { userId, ...options }, () => db.query(sql, params));
const message = (text) => (error) => error?.message === text;

async function entitlements(db, site) {
  const { rows } = await db.query('select * from private.site_entitlements($1)', [site]);
  return rows[0];
}

function menuFor(slug, count) {
  return {
    schemaVersion: 1, template: 'products-v1', catalogType: 'products', slug, name: 'Loja',
    whatsapp: '5551988887777', currency: 'BRL', categories: [],
    items: Array.from({ length: count }, (_, i) => ({ id: `item-${i}`, name: `Item ${i}`, priceCents: 1000 }))
  };
}

test('matriz de capacidades do banco é a mesma de src/admin/platform-roles.mjs', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  for (const role of [...PLATFORM_ROLES, 'desconhecido']) {
    const { rows } = await db.query('select private.platform_capabilities($1) as caps', [role]);
    assert.deepEqual(rows[0].caps, PLATFORM_CAPABILITIES[role] ?? [], role);
  }
});

test('Dono único: definido só pelo bootstrap, uma vez, sem papel pelo painel', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const { rows } = await db.query("select user_id from public.platform_operators where role = 'platform_owner'");
  assert.deepEqual(rows.map((row) => row.user_id), [OWNER]);
  await assert.rejects(db.query('select private.bootstrap_platform_owner($1)', ['ana@exemplo.com']), message('PLATFORM_OWNER_EXISTS'));
  await assert.rejects(db.query("insert into public.platform_operators (user_id, role) values ($1, 'platform_owner')", [NEWCOMER]), /unique/);
  await assert.rejects(as(db, OWNER, 'select private.bootstrap_platform_owner($1)', ['novo@exemplo.com']), /permission denied/);
  await assert.rejects(as(db, OWNER, "select * from public.grant_platform_role($1, 'platform_owner')", [NEWCOMER]), message('INVALID_PLATFORM_ROLE'));

  const access = await as(db, OWNER, 'select * from public.read_my_platform_access()');
  assert.equal(access.rows[0].role, 'platform_owner');
  assert.ok(access.rows[0].capabilities.includes('admins.manage'));
  const none = await as(db, MERCHANT, 'select * from public.read_my_platform_access()');
  assert.deepEqual([none.rows[0].role, none.rows[0].capabilities], [null, []]);
  const admin = await as(db, OWNER, 'select private.is_platform_admin() as yes');
  assert.equal(admin.rows[0].yes, true, 'o Dono passa nos portões atuais');
  const bootstrapLog = await db.query("select actor_user_id, entity_id from public.audit_logs where action = 'platform_owner_bootstrapped'");
  assert.deepEqual(bootstrapLog.rows, [{ actor_user_id: null, entity_id: OWNER }]);
});

test('hierarquia: Dono muda administradores; Administrador só gestores; ninguém muda a si nem o Dono', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const grant = (actor, target, role) => as(db, actor, 'select * from public.grant_platform_role($1, $2)', [target, role]);
  const revoke = (actor, target) => as(db, actor, 'select public.revoke_platform_role($1) as removed', [target]);

  await grant(OWNER, NEWCOMER, 'platform_admin');
  await assert.rejects(grant(ADMIN, MERCHANT, 'platform_admin'), message('ADMINS_MANAGED_BY_OWNER'));
  await assert.rejects(revoke(ADMIN, NEWCOMER), message('ADMINS_MANAGED_BY_OWNER'));
  await assert.rejects(grant(ADMIN, NEWCOMER, 'license_manager'), message('ADMINS_MANAGED_BY_OWNER'), 'rebaixar administrador também é do Dono');
  await grant(ADMIN, MERCHANT, 'license_manager');
  assert.equal((await revoke(ADMIN, MERCHANT)).rows[0].removed, true);
  assert.equal((await revoke(ADMIN, MERCHANT)).rows[0].removed, false);

  await assert.rejects(grant(LICENSER, MERCHANT, 'license_manager'), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(grant(SPONSOR, MERCHANT, 'license_manager'), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(grant(MERCHANT, MERCHANT, 'license_manager'), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(revoke(ADMIN, OWNER), message('OPERATOR_ROLE_CONFLICT'));
  await assert.rejects(grant(OWNER, OWNER, 'platform_admin'), message('CANNOT_CHANGE_OWN_ROLE'));
  await assert.rejects(revoke(ADMIN, ADMIN), message('CANNOT_CHANGE_OWN_ROLE'));
  await assert.rejects(grant(OWNER, SPONSOR, 'license_manager'), message('OPERATOR_ROLE_CONFLICT'));
  await assert.rejects(grant(OWNER, '91000000-0000-0000-0000-0000000000ff', 'license_manager'), message('PLATFORM_USER_NOT_FOUND'));
  await assert.rejects(grant(OWNER, NEWCOMER, 'sponsor'), message('INVALID_PLATFORM_ROLE'));

  assert.equal((await revoke(OWNER, NEWCOMER)).rows[0].removed, true);
  const list = await as(db, ADMIN, 'select user_id, role, email from public.list_platform_operators()');
  assert.deepEqual(list.rows.map((row) => [row.role, row.email]), [
    ['platform_owner', 'felipe@exemplo.com'], ['platform_admin', 'ana@exemplo.com'], ['license_manager', 'leo@exemplo.com']
  ]);
  await assert.rejects(as(db, LICENSER, 'select * from public.list_platform_operators()'), message('FORBIDDEN_PLATFORM_ROLE'));

  const logs = await db.query("select action, actor_user_id, summary from public.audit_logs where entity_type = 'platform_operator' and action like 'platform_role_%' order by created_at, id");
  assert.deepEqual(logs.rows.map((row) => [row.action, row.summary.role]), [
    ['platform_role_granted', 'platform_admin'], ['platform_role_granted', 'license_manager'],
    ['platform_role_revoked', 'license_manager'], ['platform_role_revoked', 'platform_admin']
  ]);
});

test('licença manual: cria a organização, soma meses do mesmo plano, retira e vale o maior plano', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  assert.equal((await entitlements(db, SITE)).plan_code, 'free');
  await assert.rejects(as(db, MERCHANT, "select * from public.grant_license($1, 'profissional', 12)", [SITE]), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(as(db, SPONSOR, "select * from public.grant_license($1, 'profissional', 12)", [SITE]), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(as(db, LICENSER, "select * from public.grant_license($1, 'free', 12)", [SITE]), message('INVALID_LICENSE_PLAN'));
  await assert.rejects(as(db, LICENSER, "select * from public.grant_license($1, 'profissional', 37)", [SITE]), message('INVALID_LICENSE_MONTHS'));

  const first = (await as(db, LICENSER, "select * from public.grant_license($1, 'profissional', 12, 'Parceria')", [SITE])).rows[0];
  const site = (await db.query('select tenant_id from public.sites where id = $1', [SITE])).rows[0];
  assert.ok(site.tenant_id, 'a organização foi criada');
  const tenant = (await db.query('select owner_user_id, slug from public.tenants where id = $1', [site.tenant_id])).rows[0];
  assert.deepEqual(tenant, { owner_user_id: MERCHANT, slug: 'doces-da-rita' });
  assert.equal((await entitlements(db, SITE)).plan_code, 'profissional');

  const second = (await as(db, ADMIN, "select * from public.grant_license($1, 'profissional', 1)", [SITE])).rows[0];
  assert.equal(new Date(second.starts_at).getTime(), new Date(first.ends_at).getTime(), 'começa quando a anterior termina');

  await db.query("insert into public.subscriptions (tenant_id, plan_code, status, provider) values ($1, 'equipe', 'active', 'manual')", [site.tenant_id]);
  assert.equal((await entitlements(db, SITE)).plan_code, 'equipe', 'assinatura maior vence');
  await db.query("update public.subscriptions set plan_code = 'essencial' where tenant_id = $1", [site.tenant_id]);
  assert.equal((await entitlements(db, SITE)).plan_code, 'profissional', 'licença maior vence');

  assert.equal((await as(db, LICENSER, 'select public.revoke_license($1) as ok', [first.id])).rows[0].ok, true);
  assert.equal((await as(db, LICENSER, 'select public.revoke_license($1) as ok', [first.id])).rows[0].ok, false);
  await db.query('update public.license_grants set starts_at = now() - interval \'2 days\', ends_at = now() - interval \'1 day\' where id = $1', [second.id]);
  assert.equal((await entitlements(db, SITE)).plan_code, 'essencial', 'licença vencida não vale, sem tolerância');

  const ownerView = await as(db, MERCHANT, 'select id from public.license_grants');
  assert.equal(ownerView.rows.length, 2, 'a dona lê as licenças da própria organização');
  assert.equal((await as(db, MERCHANT_2, 'select id from public.license_grants')).rows.length, 0);
  await assert.rejects(as(db, null, 'select id from public.license_grants', [], { role: 'anon' }), /permission denied/);

  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name, demo_source, demo_expires_at) values ($1, null, 'demo-salao', 'Salão', 'linktree', now() + interval '30 days')",
    [DEMO]
  );
  await assert.rejects(as(db, LICENSER, "select * from public.grant_license($1, 'profissional', 1)", [DEMO]), message('SITE_WITHOUT_OWNER'));

  const logs = await db.query("select action, site_id from public.audit_logs where entity_type = 'license_grant' order by created_at, id");
  assert.deepEqual(logs.rows.map((row) => [row.action, row.site_id]), [
    ['license_granted', SITE], ['license_granted', SITE], ['license_revoked', SITE]
  ]);
});

test('cupom: criação, resgate pela dona, uma vez por organização, limite de usos, validade e relatório', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await assert.rejects(as(db, MERCHANT, "select * from public.create_coupon('profissional', 12)"), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(as(db, LICENSER, "select * from public.create_coupon('profissional', 12, 0)"), message('INVALID_COUPON'));
  await assert.rejects(as(db, LICENSER, "select * from public.create_coupon('profissional', 12, 1, null, '', 'ab')"), message('INVALID_COUPON'));

  const coupon = (await as(db, LICENSER, "select * from public.create_coupon('profissional', 12, 2, null, 'Feira de novembro')")).rows[0];
  assert.match(coupon.code, /^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
  const custom = (await as(db, ADMIN, "select * from public.create_coupon('essencial', 1, 5, null, '', ' vitrine-2027 ')")).rows[0];
  assert.equal(custom.code, 'VITRINE-2027');
  await assert.rejects(as(db, ADMIN, "select * from public.create_coupon('essencial', 1, 5, null, '', 'VITRINE-2027')"), message('COUPON_CODE_TAKEN'));

  const redeem = (user, site, code) => as(db, user, 'select public.redeem_coupon($1, $2) as result', [site, code]).then((r) => r.rows[0].result);
  await assert.rejects(redeem(MERCHANT_2, SITE, coupon.code), message('SITE_NOT_FOUND'), 'só a dona da vitrine resgata');
  assert.deepEqual(await redeem(MERCHANT, SITE, 'NAO-EXISTE'), { status: 'invalid' });

  const ok = await redeem(MERCHANT, SITE, coupon.code.toLowerCase());
  assert.equal(ok.status, 'redeemed');
  assert.equal(ok.planCode, 'profissional');
  assert.equal(ok.months, 12);
  assert.equal((await entitlements(db, SITE)).plan_code, 'profissional');
  assert.deepEqual(await redeem(MERCHANT, SITE, coupon.code), { status: 'already_redeemed' });
  assert.equal((await redeem(MERCHANT_2, SITE_2, coupon.code)).status, 'redeemed');
  assert.deepEqual(await redeem(MERCHANT_3, SITE_3, coupon.code), { status: 'exhausted' });

  await as(db, LICENSER, 'select * from public.set_coupon_disabled($1, true)', [custom.id]);
  assert.deepEqual(await redeem(MERCHANT_3, SITE_3, custom.code), { status: 'invalid' });
  await as(db, LICENSER, 'select * from public.set_coupon_disabled($1, false)', [custom.id]);
  await db.query("update public.coupons set expires_at = now() - interval '1 minute' where id = $1", [custom.id]);
  assert.deepEqual(await redeem(MERCHANT_3, SITE_3, custom.code), { status: 'expired' });

  const report = (await as(db, LICENSER, 'select public.read_coupon_report() as report')).rows[0].report;
  assert.equal(report.coupons, 2);
  assert.equal(report.activeCoupons, 0);
  assert.equal(report.redemptions, 2);
  assert.equal(report.monthsGranted, 24);
  assert.equal(report.valueCents, 8900 * 24);
  assert.deepEqual(report.byPlan, [{ planCode: 'profissional', redemptions: 2, monthsGranted: 24, valueCents: 213600 }]);
  assert.deepEqual(report.activeLicenses, { coupon: 2 });
  const list = (await as(db, ADMIN, 'select code, redemption_count, value_cents from public.list_coupons()')).rows;
  assert.deepEqual(list.find((row) => row.code === coupon.code), { code: coupon.code, redemption_count: 2, value_cents: 213600 });
  await assert.rejects(as(db, MERCHANT, 'select public.read_coupon_report()'), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(as(db, MERCHANT, 'select code from public.coupons'), /permission denied/);

  const logs = await db.query("select action from public.audit_logs where entity_type = 'coupon' order by created_at, id");
  assert.deepEqual(logs.rows.map((row) => row.action), [
    'coupon_created', 'coupon_created', 'coupon_redeemed', 'coupon_redeemed', 'coupon_disabled', 'coupon_enabled'
  ]);
  assert.doesNotMatch(JSON.stringify((await db.query('select summary from public.audit_logs')).rows), new RegExp(coupon.code));
});

test('cupom: 10 tentativas por hora por conta, gravadas mesmo com código inválido', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const coupon = (await as(db, LICENSER, "select * from public.create_coupon('essencial', 1)")).rows[0];
  for (let i = 0; i < 10; i += 1) {
    const { rows } = await as(db, MERCHANT, 'select public.redeem_coupon($1, $2) as result', [SITE, `ERRADO-${i}`]);
    assert.equal(rows[0].result.status, 'invalid');
  }
  const blocked = await as(db, MERCHANT, 'select public.redeem_coupon($1, $2) as result', [SITE, coupon.code]);
  assert.deepEqual(blocked.rows[0].result, { status: 'rate_limited' });
  await db.query("update private.coupon_attempts set attempted_at = now() - interval '2 hours'");
  const later = await as(db, MERCHANT, 'select public.redeem_coupon($1, $2) as result', [SITE, coupon.code]);
  assert.equal(later.rows[0].result.status, 'redeemed');
});

test('limites por vitrine valem nos direitos e no gatilho de publicação', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const publish = (count) => db.query(
    "insert into public.publications (site_id, slug, revision, status, artifact_hash, menu) values ($1, 'doces-da-rita', 1, 'active', $2, $3::jsonb) on conflict (site_id) do update set menu = excluded.menu",
    [SITE, 'e'.repeat(64), JSON.stringify(menuFor('doces-da-rita', count))]
  );
  await assert.rejects(as(db, ADMIN, 'select * from public.set_site_limits($1, null, null)', [SITE]), message('INVALID_SITE_LIMITS'));
  await assert.rejects(as(db, ADMIN, 'select * from public.set_site_limits($1, 101, null)', [SITE]), message('INVALID_SITE_LIMITS'));
  await assert.rejects(as(db, SPONSOR, 'select * from public.set_site_limits($1, 3, null)', [SITE]), message('FORBIDDEN_PLATFORM_ROLE'));
  await as(db, LICENSER, "select * from public.set_site_limits($1, 3, 2, 'Teste de limite')", [SITE]);
  const limited = await entitlements(db, SITE);
  assert.deepEqual([limited.plan_code, limited.max_active_items, limited.max_item_blocks], ['free', 3, 2]);
  const viaRead = await as(db, MERCHANT, 'select max_active_items from public.read_site_entitlements($1)', [SITE]);
  assert.equal(viaRead.rows[0].max_active_items, 3);
  await publish(3);
  await assert.rejects(publish(4), /ACTIVE_ITEMS_LIMIT_EXCEEDED/);
  assert.equal((await as(db, MERCHANT, 'select site_id from public.site_limit_overrides')).rows.length, 0);
  assert.equal((await as(db, LICENSER, 'select public.clear_site_limits($1) as ok', [SITE])).rows[0].ok, true);
  await publish(4);
  const logs = await db.query("select action from public.audit_logs where entity_type = 'site' and action like 'site_limits_%' order by created_at, id");
  assert.deepEqual(logs.rows.map((row) => row.action), ['site_limits_set', 'site_limits_cleared']);
});

test('usuários: lista com busca e detalhe só com users.read', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  await as(db, LICENSER, "select * from public.grant_license($1, 'essencial', 2)", [SITE]);
  const all = await as(db, LICENSER, 'select * from public.admin_list_users()');
  assert.equal(all.rows.length, USERS.length);
  assert.equal(Number(all.rows[0].total_count), USERS.length);
  const bySlug = await as(db, ADMIN, "select user_id, email, business_name, site_count, platform_role from public.admin_list_users('doces')");
  assert.deepEqual(bySlug.rows, [{ user_id: MERCHANT, email: 'rita@doces.com', business_name: 'Doces da Rita', site_count: 1, platform_role: null }]);
  const byEmail = await as(db, OWNER, "select user_id from public.admin_list_users('ANA@')");
  assert.deepEqual(byEmail.rows.map((row) => row.user_id), [ADMIN]);
  const wildcard = await as(db, OWNER, "select user_id from public.admin_list_users('%')");
  assert.equal(wildcard.rows.length, 0, 'curinga é tratado como texto');
  const paged = await as(db, OWNER, 'select user_id, total_count from public.admin_list_users($1, 3, 6)', ['']);
  assert.equal(paged.rows.length, 2);

  const detail = (await as(db, LICENSER, 'select public.admin_user_detail($1) as detail', [MERCHANT])).rows[0].detail;
  assert.equal(detail.user.email, 'rita@doces.com');
  assert.equal(detail.sites.length, 1);
  assert.equal(detail.sites[0].role, 'owner');
  assert.equal(detail.sites[0].entitlements.planCode, 'essencial');
  assert.equal(detail.sites[0].licenses.length, 1);
  assert.equal(detail.sites[0].limits, null);

  await assert.rejects(as(db, SPONSOR, 'select * from public.admin_list_users()'), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(as(db, MERCHANT, 'select public.admin_user_detail($1)', [MERCHANT]), message('FORBIDDEN_PLATFORM_ROLE'));
  await assert.rejects(as(db, OWNER, 'select public.admin_user_detail($1)', ['91000000-0000-0000-0000-0000000000ff']), message('PLATFORM_USER_NOT_FOUND'));
});

test('Gestor de licenças não passa nos portões da operação da plataforma', async (t) => {
  const db = await setupDb();
  t.after(() => db.close());
  const gate = await as(db, LICENSER, 'select private.is_platform_admin() as yes');
  assert.equal(gate.rows[0].yes, false);
  assert.equal((await as(db, LICENSER, 'select id from public.audit_logs')).rows.length, 0);
  await assert.rejects(as(db, LICENSER, 'select * from public.list_sponsors()'), message('FORBIDDEN_PLATFORM_ADMIN'));
  const ownerSponsors = await as(db, OWNER, 'select * from public.list_sponsors()');
  assert.deepEqual(ownerSponsors.rows.map((row) => row.user_id), [SPONSOR]);
});
