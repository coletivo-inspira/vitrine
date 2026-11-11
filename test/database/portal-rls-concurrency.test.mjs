import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';

const owner = '10000000-0000-0000-0000-000000000001';
const member = '10000000-0000-0000-0000-000000000002';
const stranger = '10000000-0000-0000-0000-000000000003';
const siteA = '20000000-0000-0000-0000-000000000001';
const siteB = '20000000-0000-0000-0000-000000000002';
const siteC = '20000000-0000-0000-0000-000000000003';

async function setupDb() {
  const db = new PGlite();
  // Shim Supabase schema / auth roles
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
  const files = await readdir(migrationsDir);
  const migrationFiles = files
    .filter(f => f.endsWith('.sql'))
    .sort();

  for (const file of migrationFiles) {
    const content = await readFile(resolve(migrationsDir, file), 'utf8');
    await db.exec(content);
  }

  // Seed standard users
  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [owner, member, stranger]);
  return db;
}

async function asUser(db, userId, fn, role = 'authenticated') {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    if (userId) {
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId]);
    } else {
      await db.query("select set_config('request.jwt.claim.sub', '', true)");
    }
    return await fn();
  } finally {
    await db.exec('rollback');
  }
}

test('Frente QA - RLS e Concorrência de Portal no Banco de Dados', async (t) => {

  await t.test('Cenário 1: Proprietário com múltiplas vitrines isoladas', async () => {
    const db = await setupDb();
    t.after(() => db.close());

    // Cadastra sites do proprietário e do stranger
    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'pizza-a', 'Pizza A']);
    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteB, owner, 'pizza-b', 'Pizza B']);
    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteC, stranger, 'pizza-c', 'Pizza C']);

    await asUser(db, owner, async () => {
      // Proprietário deve listar e visualizar apenas as suas próprias vitrines
      const listRes = await db.query('select id, name from public.sites order by id');
      assert.equal(listRes.rows.length, 2);
      assert.deepEqual(listRes.rows.map(r => r.id), [siteA, siteB]);

      // Proprietário pode atualizar sua vitrine
      const updateRes = await db.query("update public.sites set name = 'Pizza A Atualizada' where id = $1 returning id", [siteA]);
      assert.equal(updateRes.rows.length, 1);

      // Proprietário não consegue atualizar vitrine alheia
      const updateStrangerRes = await db.query("update public.sites set name = 'Hacked' where id = $1 returning id", [siteC]);
      assert.equal(updateStrangerRes.rows.length, 0);
    });

    // Validar isolamento do stranger também
    await asUser(db, stranger, async () => {
      const listRes = await db.query('select id, name from public.sites');
      assert.equal(listRes.rows.length, 1);
      assert.equal(listRes.rows[0].id, siteC);
    });
  });

  await t.test('Cenário 2: Rejeição de slugs duplicados e reservados', async () => {
    const db = await setupDb();
    t.after(() => db.close());

    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'pizza-a', 'Pizza A']);

    // Tentativa de slug duplicado deve falhar com a constraint de unicidade (erro 23505)
    await assert.rejects(
      () => asUser(db, owner, () => db.query('insert into public.sites(owner_user_id, slug, name) values ($1, $2, $3)', [owner, 'pizza-a', 'Pizza A Duplicada'])),
      (err) => err.code === '23505'
    );

    // Tentativa de slugs reservados deve falhar com a constraint de check (erro 23514)
    const reservedSlugs = ['admin', 'api', 'auth', 'app', 'www'];
    for (const slug of reservedSlugs) {
      await assert.rejects(
        () => asUser(db, owner, () => db.query('insert into public.sites(owner_user_id, slug, name) values ($1, $2, $3)', [owner, slug, 'Site Reservado'])),
        (err) => err.code === '23514',
        `Esperado falha para slug reservado: ${slug}`
      );
    }
  });

  await t.test('Cenário 3: Colaborador com acesso restrito via site_memberships', async () => {
    const db = await setupDb();
    t.after(() => db.close());

    // Cria sites do proprietário
    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'pizza-a', 'Pizza A']);
    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteB, owner, 'pizza-b', 'Pizza B']);

    // Cria rascunhos para ambas as vitrines
    await db.query('insert into public.drafts(site_id, content) values ($1, $2)', [siteA, JSON.stringify({ name: 'A' })]);
    await db.query('insert into public.drafts(site_id, content) values ($1, $2)', [siteB, JSON.stringify({ name: 'B' })]);

    // Vincula o colaborador apenas à vitrine A
    await db.query('insert into public.site_memberships(site_id, user_id) values ($1, $2)', [siteA, member]);

    await asUser(db, member, async () => {
      // Colaborador deve listar apenas a vitrine A (sem herança horizontal para vitrine B do mesmo proprietário)
      const listSites = await db.query('select id from public.sites');
      assert.equal(listSites.rows.length, 1);
      assert.equal(listSites.rows[0].id, siteA);

      // Colaborador não consegue ver a vitrine B diretamente
      const querySiteB = await db.query('select id from public.sites where id = $1', [siteB]);
      assert.equal(querySiteB.rows.length, 0);

      // Colaborador deve consultar apenas o draft da vitrine vinculada A
      const listDrafts = await db.query('select site_id, content from public.drafts');
      assert.equal(listDrafts.rows.length, 1);
      assert.equal(listDrafts.rows[0].site_id, siteA);

      // Consulta direta de rascunhos alheios (vitrine B) deve retornar zero linhas
      const queryDraftB = await db.query('select site_id from public.drafts where site_id = $1', [siteB]);
      assert.equal(queryDraftB.rows.length, 0);
    });
  });

  await t.test('Cenário 4: Colaborador não pode alterar site_memberships', async () => {
    const db = await setupDb();
    t.after(() => db.close());

    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'pizza-a', 'Pizza A']);
    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteB, owner, 'pizza-b', 'Pizza B']);
    await db.query('insert into public.site_memberships(site_id, user_id) values ($1, $2)', [siteA, member]);

    // Tentativas de inserção/mutação por colaborador ou qualquer usuário autenticado devem falhar com 42501 (insufficient privilege)
    await assert.rejects(
      () => asUser(db, member, () => db.query('insert into public.site_memberships(site_id, user_id) values ($1, $2)', [siteB, member])),
      (err) => err.code === '42501'
    );

    await assert.rejects(
      () => asUser(db, member, () => db.query('delete from public.site_memberships where site_id = $1', [siteA])),
      (err) => err.code === '42501'
    );
  });

  await t.test('Cenário 5: Requisições anon para sites, memberships e drafts falham', async () => {
    const db = await setupDb();
    t.after(() => db.close());

    for (const table of ['public.sites', 'public.site_memberships', 'public.drafts']) {
      await assert.rejects(
        () => asUser(db, null, () => db.query(`select * from ${table}`), 'anon'),
        (err) => err.code === '42501',
        `Esperado bloqueio de select anon para ${table}`
      );
    }
  });

  await t.test('Cenário 6: Concorrência otimista e limites de payload em drafts', async () => {
    const db = await setupDb();
    t.after(() => db.close());

    await db.query('insert into public.sites(id, owner_user_id, slug, name) values ($1, $2, $3, $4)', [siteA, owner, 'pizza-a', 'Pizza A']);
    await db.query('insert into public.drafts(site_id, content) values ($1, $2)', [siteA, JSON.stringify({ name: 'Pizza A' })]);

    await asUser(db, owner, async () => {
      // 1. Incremento atômico de revision via trigger private.bump_draft_revision()
      const update1 = await db.query(
        "update public.drafts set content = '{\"name\":\"A1\"}' where site_id = $1 returning revision",
        [siteA]
      );
      assert.equal(update1.rows.length, 1);
      assert.equal(update1.rows[0].revision, 2);

      // 2. Rejeição (0 rows updated) de where revision = 1 obsoleto
      const updateObsolete = await db.query(
        "update public.drafts set content = '{\"name\":\"A2\"}' where site_id = $1 and revision = 1 returning revision",
        [siteA]
      );
      assert.equal(updateObsolete.rows.length, 0);

      // O draft ainda deve estar intacto com a revisão 2 e conteúdo "A1"
      const currentDraft = await db.query('select revision, content from public.drafts where site_id = $1', [siteA]);
      assert.equal(currentDraft.rows[0].revision, 2);
      const contentObj = typeof currentDraft.rows[0].content === 'string'
        ? JSON.parse(currentDraft.rows[0].content)
        : currentDraft.rows[0].content;
      assert.deepEqual(contentObj, { name: 'A1' });
    });

    // 3. Rejeição de JSONB > 256 KiB
    const largeContent = { name: 'A'.repeat(270000) }; // > 256 KiB
    await assert.rejects(
      () => asUser(db, owner, () => db.query("update public.drafts set content = $1 where site_id = $2", [JSON.stringify(largeContent), siteA])),
      (err) => err.code === '23514'
    );
  });
});
