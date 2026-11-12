import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  PORTAL_CSP_HEADER,
  PORTAL_ORIGIN,
  PORTAL_STORAGE_CSP_HEADER,
  PUBLIC_SITE_ORIGIN,
  STOREFRONT_STORAGE_CSP_HEADER,
  STRICT_CSP_HEADER,
  SUPABASE_PUBLIC_PROJECT_URL,
  clearPublicationsCache,
  createApiHandler
} from '../workers/api.mjs';
import {
  ALLOWED_CATALOG_TYPES,
  ALLOWED_CUSTOMIZATION_STATUSES,
  ALLOWED_PROFILE_INTERESTS,
  ALLOWED_STOREFRONT_TYPES,
  ALLOWED_TEMPLATES,
  ALLOWED_WHATSAPP_VARIABLES,
  REQUIRED_PROFILE_FIELDS,
  RESERVED_SLUGS,
  assertProfileComplete,
  buildCustomizationWhatsappUrl,
  createInitialDraftContent,
  getMissingRequiredProfileFields,
  isProfileComplete,
  migrateLegacyDraftContent,
  validateCatalogImagePath,
  validateCustomizationRequestInput,
  validateDraftContent,
  validateProfileInput,
  validateSiteInput,
  validateSlug
} from '../src/portal-validation.mjs';
import {
  FORBIDDEN_PUBLIC_KEYS,
  compilePublicStorefront,
  projectPublicStorefrontMenu,
  renderStorefrontHtml
} from '../src/publication-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const migrationsDir = resolve(root, 'supabase/migrations');

const USER_A = '10000000-0000-0000-0000-000000000001';
const USER_B = '10000000-0000-0000-0000-000000000002';
const USER_STRANGER = '10000000-0000-0000-0000-000000000003';
const SITE_A = '20000000-0000-0000-0000-000000000001';
const SITE_B = '20000000-0000-0000-0000-000000000002';

async function setupPgliteWithMigrations() {
  const db = new PGlite();
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

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), 'utf8');
    await db.exec(sql);
  }

  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [
    USER_A,
    USER_B,
    USER_STRANGER
  ]);
  return db;
}

async function asRole(db, userId, fn, role = 'authenticated', commitTransaction = false) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    if (commitTransaction) {
      await db.exec('commit');
    } else {
      await db.exec('rollback');
    }
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

test('Spec 008 PR (a) - Backend: Migração 202611120002, RLS, Rotas Worker e Catálogo por Componentes', async (t) => {
  await t.test('1. PGlite RLS & Constraints: profiles e profile_interests isolados por auth.uid()', async () => {
    const db = await setupPgliteWithMigrations();
    t.after(() => db.close());

    // User A insere perfil e interesses
    await asRole(
      db,
      USER_A,
      async () => {
        const insProfile = await db.query(
          `insert into public.profiles (user_id, display_name, business_name, city, whatsapp)
           values ($1, 'Maria Silva', 'Ateliê Maria', 'Porto Alegre, RS', '5551999999999')
           returning user_id, display_name, business_name, city, whatsapp`,
          [USER_A]
        );
        assert.equal(insProfile.rows.length, 1);
        assert.equal(insProfile.rows[0].display_name, 'Maria Silva');

        await db.query(
          `insert into public.profile_interests (user_id, interest)
           values ($1, 'cardapio-digital'), ($1, 'identidade-visual')`,
          [USER_A]
        );
      },
      'authenticated',
      true
    );

    // User B não vê nem altera perfil ou interesses de User A
    await asRole(db, USER_B, async () => {
      const readOther = await db.query('select * from public.profiles');
      assert.equal(readOther.rows.length, 0);

      const readOtherInterests = await db.query('select * from public.profile_interests');
      assert.equal(readOtherInterests.rows.length, 0);

      const updateOther = await db.query(
        "update public.profiles set display_name = 'Invadido' where user_id = $1 returning user_id",
        [USER_A]
      );
      assert.equal(updateOther.rows.length, 0);

      const deleteOtherInterests = await db.query(
        'delete from public.profile_interests where user_id = $1 returning interest',
        [USER_A]
      );
      assert.equal(deleteOtherInterests.rows.length, 0);
    });

    // User B não pode inserir perfil em nome de User A (42501 RLS violation)
    await assert.rejects(
      () =>
        asRole(db, USER_B, () =>
          db.query(
            "insert into public.profiles (user_id, display_name) values ($1, 'Falsificado')",
            [USER_A]
          )
        ),
      (err) => err.code === '42501'
    );

    // Rejeita WhatsApp inválido e interesse fora da lista permitida (23514 check constraint)
    await assert.rejects(
      () =>
        asRole(db, USER_B, () =>
          db.query(
            "insert into public.profiles (user_id, whatsapp) values ($1, '0123-invalido')",
            [USER_B]
          )
        ),
      (err) => err.code === '23514'
    );

    await assert.rejects(
      () =>
        asRole(db, USER_A, () =>
          db.query(
            "insert into public.profile_interests (user_id, interest) values ($1, 'interesse-inexistente')",
            [USER_A]
          )
        ),
      (err) => err.code === '23514'
    );

    // Anon é totalmente bloqueado em profiles e profile_interests
    await assert.rejects(
      () => asRole(db, null, () => db.query('select * from public.profiles'), 'anon'),
      (err) => err.code === '42501'
    );
    await assert.rejects(
      () => asRole(db, null, () => db.query('select * from public.profile_interests'), 'anon'),
      (err) => err.code === '42501'
    );
  });

  await t.test('2. PGlite RLS & Constraints: customization_requests e status inicial novo', async () => {
    const db = await setupPgliteWithMigrations();
    t.after(() => db.close());

    await db.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'clinica-a', 'Clínica A', 'health', 'booking-v1')",
      [SITE_A, USER_A]
    );
    await db.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'loja-b', 'Loja B', 'art', 'quote-v1')",
      [SITE_B, USER_B]
    );

    // User A cria pedido de customização válido
    await asRole(
      db,
      USER_A,
      async () => {
        const res = await db.query(
          `insert into public.customization_requests (
             user_id, site_id, storefront_type, template_interest, goal, reference_urls, desired_deadline
           ) values ($1, $2, 'health', 'clinica-integrada', 'Preciso de páginas por especialidade médica.', '["https://exemplo.com/ref"]'::jsonb, 'Dezembro/2026')
           returning id, status, storefront_type`,
          [USER_A, SITE_A]
        );
        assert.equal(res.rows.length, 1);
        assert.equal(res.rows[0].status, 'novo');
        assert.equal(res.rows[0].storefront_type, 'health');
      },
      'authenticated',
      true
    );

    // User B não vê pedidos de User A
    await asRole(db, USER_B, async () => {
      const list = await db.query('select * from public.customization_requests');
      assert.equal(list.rows.length, 0);
    });

    // User A não pode associar site_id pertencente a User B (42501 RLS check)
    await assert.rejects(
      () =>
        asRole(db, USER_A, () =>
          db.query(
            `insert into public.customization_requests (
               user_id, site_id, storefront_type, template_interest, goal
             ) values ($1, $2, 'art', 'portfolio', 'Tentando vincular vitrine alheia ao pedido.')`,
            [USER_A, SITE_B]
          )
        ),
      (err) => err.code === '42501'
    );

    // A política RLS reserva a alteração de status aos operadores da plataforma.
    const update = await asRole(db, USER_A, () =>
      db.query("update public.customization_requests set status = 'respondido' returning id")
    );
    assert.equal(update.rows.length, 0);
  });

  await t.test('3. PGlite: sites.storefront_type, novos templates, catálogo por componentes, migração sem perda de pizzeria-v1 e bucket catalog-images RLS', async () => {
    const db = new PGlite();
    t.after(() => db.close());

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

    // Aplica migrações até 202611120001 primeiro para testar migração de dados legados pizzeria-v1
    await db.exec(await readFile(resolve(migrationsDir, '202611070001_site_access.sql'), 'utf8'));
    await db.exec(await readFile(resolve(migrationsDir, '202611110001_portal_schema.sql'), 'utf8'));

    await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [
      USER_A,
      USER_B,
      USER_STRANGER
    ]);

    const legacyDraft = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'forno-antigo',
      businessName: 'Forno Antigo Pizzaria',
      whatsapp: '5511988887777',
      categories: [
        {
          id: 'tradicionais',
          name: 'Pizzas Tradicionais',
          items: [
            {
              id: 'marg-1',
              name: 'Margherita Clássica',
              description: 'Molho de tomate e manjericão.',
              priceCents: 4700,
              active: true
            }
          ]
        }
      ]
    };

    await db.query(
      "insert into public.sites (id, owner_user_id, slug, name, template) values ($1, $2, 'forno-antigo', 'Forno Antigo Pizzaria', 'pizzeria-v1')",
      [SITE_A, USER_A]
    );
    await db.query(
      'insert into public.drafts (site_id, revision, content) values ($1, 4, $2::jsonb)',
      [SITE_A, JSON.stringify(legacyDraft)]
    );

    await db.exec(await readFile(resolve(migrationsDir, '202611120001_public_publications.sql'), 'utf8'));
    await db.exec(await readFile(resolve(migrationsDir, '202611120002_portal_profiles.sql'), 'utf8'));

    // Verifica que o rascunho e a publicação legados foram migrados sem perder itens/preços nem incrementar revision
    const migratedDraftRes = await db.query(
      'select revision, content from public.drafts where site_id = $1',
      [SITE_A]
    );
    assert.equal(migratedDraftRes.rows[0].revision, 4);
    const migratedContent = migratedDraftRes.rows[0].content;
    assert.equal(migratedContent.catalogType, 'products');
    assert.equal(migratedContent.storefrontType, 'food');
    assert.equal(migratedContent.components.price, true);
    assert.equal(migratedContent.orderFields.deliveryOrPickup, true);
    assert.match(migratedContent.messages.whatsappTemplate, /\{itens\}/);
    assert.equal(migratedContent.categories[0].items[0].id, 'marg-1');
    assert.equal(migratedContent.categories[0].items[0].priceCents, 4700);

    const migratedPubRes = await db.query(
      'select revision, menu from public.publications where site_id = $1',
      [SITE_A]
    );
    assert.equal(migratedPubRes.rows[0].revision, 4);
    assert.equal(migratedPubRes.rows[0].menu.catalogType, 'products');
    assert.equal(migratedPubRes.rows[0].menu.items[0].id, 'marg-1');
    assert.equal(migratedPubRes.rows[0].menu.items[0].priceCents, 4700);

    // Verifica bucket catalog-images e RLS por membro da vitrine
    const bucketRes = await db.query("select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'catalog-images'");
    assert.equal(bucketRes.rows.length, 1);
    assert.equal(bucketRes.rows[0].public, true);
    assert.equal(Number(bucketRes.rows[0].file_size_limit), 262144);
    assert.deepEqual(bucketRes.rows[0].allowed_mime_types, ['image/webp']);

    await db.query('insert into public.site_memberships (site_id, user_id) values ($1, $2)', [
      SITE_A,
      USER_B
    ]);

    // Owner (USER_A) e Member (USER_B) conseguem inserir objeto WebP sob <SITE_A>/<item>.webp
    await asRole(
      db,
      USER_B,
      async () => {
        const insObj = await db.query(
          "insert into storage.objects (bucket_id, name) values ('catalog-images', $1) returning name",
          [`${SITE_A}/marg-1-a1b2c3.webp`]
        );
        assert.equal(insObj.rows.length, 1);
      },
      'authenticated',
      true
    );

    // Stranger (USER_STRANGER) é bloqueado ao tentar subir imagem na pasta de SITE_A
    await assert.rejects(
      () =>
        asRole(db, USER_STRANGER, () =>
          db.query(
            "insert into storage.objects (bucket_id, name) values ('catalog-images', $1)",
            [`${SITE_A}/hack.webp`]
          )
        ),
      (err) => err.code === '42501'
    );

    // Extensão diferente de .webp é bloqueada pela policy
    await assert.rejects(
      () =>
        asRole(db, USER_A, () =>
          db.query(
            "insert into storage.objects (bucket_id, name) values ('catalog-images', $1)",
            [`${SITE_A}/payload.svg`]
          )
        ),
      (err) => err.code === '42501'
    );

    // Leitura pública (anon) permitida para exibir imagens nas vitrines publicadas
    await asRole(
      db,
      null,
      async () => {
        const objs = await db.query(
          "select name from storage.objects where bucket_id = 'catalog-images'"
        );
        assert.equal(objs.rows.length, 1);
        assert.equal(objs.rows[0].name, `${SITE_A}/marg-1-a1b2c3.webp`);
      },
      'anon'
    );

    // Simula Supabase hospedado onde schema storage pertence a supabase_storage_admin (sem CREATE em storage)
    // 3.a Quando o papel de migração tem permissão para criar policies em storage.objects -> policies são criadas
    const hostedDbAllowed = new PGlite();
    t.after(() => hostedDbAllowed.close());
    await hostedDbAllowed.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role supabase_storage_admin nologin;
      create role postgres_migration_runner login;
      grant anon, authenticated, supabase_storage_admin to postgres_migration_runner;

      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon, postgres_migration_runner;
      grant execute on function auth.uid() to authenticated, anon, postgres_migration_runner;
      grant references on auth.users to postgres_migration_runner;

      create schema storage authorization supabase_storage_admin;
      grant usage on schema storage to anon, authenticated, postgres_migration_runner;
      revoke create on schema storage from public, postgres_migration_runner, supabase_storage_admin;

      create table storage.buckets (
        id text primary key,
        name text not null,
        owner uuid null,
        public boolean not null default false,
        file_size_limit bigint null,
        allowed_mime_types text[] null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table storage.buckets owner to supabase_storage_admin;

      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text null references storage.buckets(id),
        name text null,
        owner uuid null default auth.uid(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_accessed_at timestamptz not null default now(),
        metadata jsonb null,
        unique (bucket_id, name)
      );
      alter table storage.objects owner to supabase_storage_admin;
      alter table storage.objects enable row level security;

      create function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      set search_path = ''
      as $$
        select string_to_array(coalesce(name, ''), '/');
      $$;
      alter function storage.foldername(text) owner to supabase_storage_admin;
      grant execute on function storage.foldername(text) to anon, authenticated, postgres_migration_runner;

      grant all on storage.buckets, storage.objects to postgres_migration_runner;
      grant select on storage.buckets, storage.objects to anon, authenticated;
      grant insert, update, delete on storage.objects to authenticated;

      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('catalog-images', 'catalog-images', true, 262144, array['image/webp']);

      grant create, usage on schema public to postgres_migration_runner;
      grant create on database postgres to postgres_migration_runner;
      set role postgres_migration_runner;
    `);

    const allowedNotices = [];
    for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()) {
      await hostedDbAllowed.exec(await readFile(resolve(migrationsDir, file), 'utf8'), {
        onNotice: (n) => allowedNotices.push(n)
      });
    }
    assert.equal(
      allowedNotices.some((n) => String(n.message || '').includes('catalog-images storage policies NOT created')),
      false
    );

    const hostedBucket = await hostedDbAllowed.query(
      "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'catalog-images'"
    );
    assert.equal(hostedBucket.rows.length, 1);
    assert.equal(hostedBucket.rows[0].public, true);
    const hostedPolicies = await hostedDbAllowed.query(
      "select policyname from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'catalog_images_%' order by policyname"
    );
    assert.deepEqual(
      hostedPolicies.rows.map((r) => r.policyname),
      [
        'catalog_images_member_delete',
        'catalog_images_member_insert',
        'catalog_images_member_update',
        'catalog_images_public_select'
      ]
    );

    // 3.b Quando o papel de migração NÃO tem privilégio para criar policies em storage.objects -> emite WARNING alto e claro e a migração conclui de forma atômica
    const hostedDbDenied = new PGlite();
    t.after(() => hostedDbDenied.close());
    await hostedDbDenied.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role supabase_storage_admin nologin;
      create role postgres_migration_runner login;
      grant anon, authenticated to postgres_migration_runner;

      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon, postgres_migration_runner;
      grant execute on function auth.uid() to authenticated, anon, postgres_migration_runner;
      grant references on auth.users to postgres_migration_runner;

      create schema storage authorization supabase_storage_admin;
      grant usage on schema storage to anon, authenticated, postgres_migration_runner;
      revoke create on schema storage from public, postgres_migration_runner, supabase_storage_admin;

      create table storage.buckets (
        id text primary key,
        name text not null,
        owner uuid null,
        public boolean not null default false,
        file_size_limit bigint null,
        allowed_mime_types text[] null,
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now()
      );
      alter table storage.buckets owner to supabase_storage_admin;

      create table storage.objects (
        id uuid primary key default gen_random_uuid(),
        bucket_id text null references storage.buckets(id),
        name text null,
        owner uuid null default auth.uid(),
        created_at timestamptz not null default now(),
        updated_at timestamptz not null default now(),
        last_accessed_at timestamptz not null default now(),
        metadata jsonb null,
        unique (bucket_id, name)
      );
      alter table storage.objects owner to supabase_storage_admin;
      alter table storage.objects enable row level security;

      create function storage.foldername(name text)
      returns text[]
      language sql
      immutable
      set search_path = ''
      as $$
        select string_to_array(coalesce(name, ''), '/');
      $$;
      alter function storage.foldername(text) owner to supabase_storage_admin;
      grant execute on function storage.foldername(text) to anon, authenticated, postgres_migration_runner;

      grant all on storage.buckets, storage.objects to postgres_migration_runner;
      grant select on storage.buckets, storage.objects to anon, authenticated;
      grant insert, update, delete on storage.objects to authenticated;

      insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      values ('catalog-images', 'catalog-images', true, 262144, array['image/webp']);

      grant create, usage on schema public to postgres_migration_runner;
      grant create on database postgres to postgres_migration_runner;
      set role postgres_migration_runner;
    `);

    const deniedNotices = [];
    for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()) {
      await hostedDbDenied.exec(await readFile(resolve(migrationsDir, file), 'utf8'), {
        onNotice: (n) => deniedNotices.push(n)
      });
    }

    const policyWarning = deniedNotices.find(
      (n) =>
        n.severity === 'WARNING' &&
        String(n.message || '').includes('catalog-images storage policies NOT created:')
    );
    assert.ok(policyWarning, 'Deve emitir WARNING explícito quando insufficient_privilege impedir criação das policies');
    assert.match(policyWarning.message, /42501/);

    const deniedBucket = await hostedDbDenied.query(
      "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'catalog-images'"
    );
    assert.equal(deniedBucket.rows.length, 1);
    assert.equal(deniedBucket.rows[0].public, true);
    const profilesExists = await hostedDbDenied.query(
      "select to_regclass('public.profiles') as reg"
    );
    assert.equal(profilesExists.rows[0].reg, 'profiles');
  });

  await t.test('4. Rotas HTTP no Worker: GET/PUT /api/profile, GET/POST /api/customization-requests e POST /api/sites estendido (Sessão, Origin, JSON e Isolamento)', async () => {
    clearPublicationsCache();
    const api = createApiHandler();
    const origin = 'https://painel.inspira.dev.br';

    // 4.1 Sem sessão -> 401 UNAUTHORIZED
    for (const [method, path] of [
      ['GET', '/api/profile'],
      ['PUT', '/api/profile'],
      ['GET', '/api/customization-requests'],
      ['POST', '/api/customization-requests'],
      ['POST', '/api/sites']
    ]) {
      const res = await api.fetch(new Request(`${origin}${path}`, { method }));
      assert.equal(res.status, 401, `Esperado 401 para ${method} ${path} sem sessão`);
      assert.equal((await res.json()).error.code, 'UNAUTHORIZED');
    }

    // 4.2 Sem Origin ou Origin divergente -> 403 FORBIDDEN_ORIGIN
    for (const badOrigin of [null, 'https://evil.example.com']) {
      const headers = new Headers({
        Authorization: 'Bearer token-owner',
        'Content-Type': 'application/json'
      });
      if (badOrigin) headers.set('Origin', badOrigin);

      const putProfileRes = await api.fetch(
        new Request(`${origin}/api/profile`, {
          method: 'PUT',
          headers,
          body: JSON.stringify({ displayName: 'Maria' })
        })
      );
      assert.equal(putProfileRes.status, 403);
      assert.equal((await putProfileRes.json()).error.code, 'FORBIDDEN_ORIGIN');

      const postReqRes = await api.fetch(
        new Request(`${origin}/api/customization-requests`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            storefrontType: 'health',
            templateInterest: 'clinica',
            goal: 'Objetivo detalhado com mais de dez caracteres.'
          })
        })
      );
      assert.equal(postReqRes.status, 403);
      assert.equal((await postReqRes.json()).error.code, 'FORBIDDEN_ORIGIN');

      const postSiteRes = await api.fetch(
        new Request(`${origin}/api/sites`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            name: 'Barbearia Dom Pedro',
            slug: 'barbearia-dom-pedro',
            storefrontType: 'health',
            template: 'booking-v1',
            catalogType: 'booking'
          })
        })
      );
      assert.equal(postSiteRes.status, 403);
      assert.equal((await postSiteRes.json()).error.code, 'FORBIDDEN_ORIGIN');
    }

    // 4.3 Content-Type diferente de application/json -> 415 UNSUPPORTED_MEDIA_TYPE
    for (const [method, path] of [
      ['PUT', '/api/profile'],
      ['POST', '/api/customization-requests'],
      ['POST', '/api/sites']
    ]) {
      const res = await api.fetch(
        new Request(`${origin}${path}`, {
          method,
          headers: {
            Authorization: 'Bearer token-owner',
            Origin: origin,
            'Content-Type': 'text/plain'
          },
          body: '{}'
        })
      );
      assert.equal(res.status, 415);
      assert.equal((await res.json()).error.code, 'UNSUPPORTED_MEDIA_TYPE');
    }

    // 4.4 Fluxo completo de Perfil e Interesses (GET default 0% -> PUT 100% -> isolamento por conta)
    const initialProfileRes = await api.fetch(
      new Request(`${origin}/api/profile`, {
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(initialProfileRes.status, 200);
    const initialProfileBody = await initialProfileRes.json();
    assert.equal(initialProfileBody.profile.completeness.percent, 0);
    assert.equal(initialProfileBody.profile.interests.length, 0);

    const saveProfileRes = await api.fetch(
      new Request(`${origin}/api/profile`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: 'Maria Silva',
          businessName: 'Ateliê Maria',
          city: 'Porto Alegre, RS',
          whatsapp: '5551999999999',
          interests: ['cardapio-digital', 'identidade-visual']
        })
      })
    );
    assert.equal(saveProfileRes.status, 200);
    const savedProfileBody = await saveProfileRes.json();
    assert.equal(savedProfileBody.profile.displayName, 'Maria Silva');
    assert.equal(savedProfileBody.profile.completeness.percent, 100);
    assert.deepEqual(savedProfileBody.profile.completeness.missingFields, []);
    assert.deepEqual(savedProfileBody.profile.interests, [
      'cardapio-digital',
      'identidade-visual'
    ]);

    // Outro usuário (token-stranger) enxerga seu próprio perfil vazio, nunca o de token-owner
    const strangerProfileRes = await api.fetch(
      new Request(`${origin}/api/profile`, {
        headers: { Authorization: 'Bearer token-stranger' }
      })
    );
    assert.equal(strangerProfileRes.status, 200);
    const strangerProfile = (await strangerProfileRes.json()).profile;
    assert.equal(strangerProfile.displayName, '');
    assert.equal(strangerProfile.completeness.percent, 0);

    // 4.5 Fluxo completo de Pedidos de Customização
    const createReqRes = await api.fetch(
      new Request(`${origin}/api/customization-requests`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          siteId: null,
          storefrontType: 'health',
          templateInterest: 'clinica-integrada',
          goal: 'Preciso de uma vitrine para clínica multidisciplinar com páginas por especialidade.',
          referenceUrls: ['https://nexaenfermagem.hudilabs.com/'],
          desiredDeadline: 'Dezembro/2026'
        })
      })
    );
    assert.equal(createReqRes.status, 201);
    const createdReq = (await createReqRes.json()).request;
    assert.equal(createdReq.status, 'novo');
    assert.equal(createdReq.storefrontType, 'health');
    assert.equal(createdReq.templateInterest, 'clinica-integrada');

    const waUrl = buildCustomizationWhatsappUrl(createdReq, '5551999999999');
    assert.match(waUrl, /^https:\/\/wa\.me\/5551999999999\?text=/);

    const listReqOwner = await api.fetch(
      new Request(`${origin}/api/customization-requests`, {
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(listReqOwner.status, 200);
    assert.equal((await listReqOwner.json()).requests.length, 1);

    const listReqStranger = await api.fetch(
      new Request(`${origin}/api/customization-requests`, {
        headers: { Authorization: 'Bearer token-stranger' }
      })
    );
    assert.equal(listReqStranger.status, 200);
    assert.equal((await listReqStranger.json()).requests.length, 0);

    // 4.6 Criação de Vitrine com storefrontType, template e catalogType (booking e quote) + publicação com foto no Supabase Storage
    const createBookingSiteRes = await api.fetch(
      new Request(`${origin}/api/sites`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Barbearia Dom Pedro',
          slug: 'barbearia-dom-pedro',
          storefrontType: 'health',
          template: 'booking-v1',
          catalogType: 'booking',
          whatsapp: '5551988887777'
        })
      })
    );
    assert.equal(createBookingSiteRes.status, 201);
    const bookingCreated = await createBookingSiteRes.json();
    assert.equal(bookingCreated.site.storefrontType, 'health');
    assert.equal(bookingCreated.site.template, 'booking-v1');
    assert.equal(bookingCreated.draft.content.catalogType, 'booking');
    assert.equal(bookingCreated.draft.content.components.durationMinutes, true);
    assert.equal(bookingCreated.draft.content.orderFields.date, true);

    const imagePath = validateCatalogImagePath(
      `${bookingCreated.site.id}/corte-classico.webp`,
      bookingCreated.site.id
    );
    const imageUrl = `${SUPABASE_PUBLIC_PROJECT_URL}/storage/v1/object/public/catalog-images/${imagePath}`;

    const bookingDraftContent = {
      ...bookingCreated.draft.content,
      categories: [
        {
          id: 'servicos',
          name: 'Serviços de Barbearia',
          items: [
            {
              id: 'corte-classico',
              name: 'Corte Clássico',
              description: 'Corte na tesoura e máquina com lavagem.',
              imageUrl,
              priceCents: 4500,
              durationMinutes: 45,
              active: true
            }
          ]
        }
      ]
    };

    const putBookingDraftRes = await api.fetch(
      new Request(`${origin}/api/sites/${bookingCreated.site.id}/draft`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          revision: 1,
          content: bookingDraftContent
        })
      })
    );
    assert.equal(putBookingDraftRes.status, 200);

    const publishBookingRes = await api.fetch(
      new Request(`${origin}/api/sites/${bookingCreated.site.id}/publish`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin
        }
      })
    );
    assert.equal(publishBookingRes.status, 200);
    const { publication: bookingPub } = await publishBookingRes.json();
    assert.equal(bookingPub.menu.template, 'booking-v1');
    assert.equal(bookingPub.menu.catalogType, 'booking');
    assert.equal(bookingPub.menu.storefrontType, 'health');
    assert.equal(bookingPub.menu.items[0].imageUrl, imageUrl);
    assert.equal(bookingPub.menu.items[0].durationMinutes, 45);
    for (const forbidden of FORBIDDEN_PUBLIC_KEYS) {
      assert.equal(forbidden in bookingPub.menu, false);
    }

    // Vitrine pública com imagem no Supabase Storage serve img-src permitindo o domínio do Supabase
    const publicBookingPageRes = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/barbearia-dom-pedro')
    );
    assert.equal(publicBookingPageRes.status, 200);
    assert.equal(
      publicBookingPageRes.headers.get('content-security-policy'),
      STOREFRONT_STORAGE_CSP_HEADER
    );
    assert.match(PORTAL_STORAGE_CSP_HEADER, /img-src 'self' https:\/\/qawlpsrfewosxsfgmmpm\.supabase\.co data: blob:/);

    // Regressão de segurança (Constituição Princípio III): /api/auth/session jamais expõe token no JSON
    const sessionCheckRes = await api.fetch(
      new Request(`${origin}/api/auth/session`, {
        method: 'GET',
        headers: { Cookie: '__Host-vitrine_session=token-owner' }
      })
    );
    assert.equal(sessionCheckRes.status, 200);
    const sessionCheckBody = await sessionCheckRes.json();
    assert.equal(sessionCheckBody.authenticated, true);
    assert.equal('token' in sessionCheckBody, false);
    assert.equal('accessToken' in sessionCheckBody, false);
    assert.equal('access_token' in sessionCheckBody, false);

    // Helper para gerar binário WebP mínimo com assinatura RIFF....WEBP
    function makeWebpBuffer(byteLength = 1024) {
      const bytes = new Uint8Array(byteLength);
      // 'RIFF'
      bytes[0] = 0x52;
      bytes[1] = 0x49;
      bytes[2] = 0x46;
      bytes[3] = 0x46;
      // 'WEBP'
      bytes[8] = 0x57;
      bytes[9] = 0x45;
      bytes[10] = 0x42;
      bytes[11] = 0x50;
      return bytes.buffer;
    }

    // Teste 4.x: POST /api/sites/:siteId/upload (proxy autenticado por cookie HttpOnly)
    const uploadPath = `/api/sites/${bookingCreated.site.id}/upload`;

    // 4.x.1: Sem autenticação -> 401
    const uploadNoAuthRes = await api.fetch(
      new Request(`${origin}${uploadPath}`, {
        method: 'POST'
      })
    );
    assert.equal(uploadNoAuthRes.status, 401);

    // 4.x.2: Sem Origin ou Origin inválido -> 403
    for (const badOrigin of [null, 'https://evil.com']) {
      const headers = new Headers({
        Cookie: '__Host-vitrine_session=token-owner',
        'Content-Type': 'image/webp'
      });
      if (badOrigin) headers.set('Origin', badOrigin);
      const uploadBadOriginRes = await api.fetch(
        new Request(`${origin}${uploadPath}`, {
          method: 'POST',
          headers,
          body: makeWebpBuffer(64)
        })
      );
      assert.equal(uploadBadOriginRes.status, 403);
    }

    // 4.x.3: Usuário estranho tentando upload na vitrine de outro tenant -> 404 SITE_NOT_FOUND
    const uploadStrangerRes = await api.fetch(
      new Request(`${origin}${uploadPath}`, {
        method: 'POST',
        headers: {
          Cookie: '__Host-vitrine_session=token-stranger',
          Origin: origin,
          'Content-Type': 'image/webp'
        },
        body: makeWebpBuffer(64)
      })
    );
    assert.equal(uploadStrangerRes.status, 404);

    // 4.x.4: Content-Type inválido -> 415
    const uploadBadTypeRes = await api.fetch(
      new Request(`${origin}${uploadPath}`, {
        method: 'POST',
        headers: {
          Cookie: '__Host-vitrine_session=token-owner',
          Origin: origin,
          'Content-Type': 'image/png'
        },
        body: makeWebpBuffer(64)
      })
    );
    assert.equal(uploadBadTypeRes.status, 415);

    // 4.x.5: Arquivo > 200 KB (204801 bytes) -> 413
    const uploadTooLargeRes = await api.fetch(
      new Request(`${origin}${uploadPath}`, {
        method: 'POST',
        headers: {
          Cookie: '__Host-vitrine_session=token-owner',
          Origin: origin,
          'Content-Type': 'image/webp'
        },
        body: makeWebpBuffer(204801)
      })
    );
    assert.equal(uploadTooLargeRes.status, 413);

    // 4.x.6: Binário sem assinatura RIFF/WEBP (ex.: SVG disfarçado) -> 422 INVALID_IMAGE
    const spoofedSvgBytes = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const uploadSpoofedRes = await api.fetch(
      new Request(`${origin}${uploadPath}`, {
        method: 'POST',
        headers: {
          Cookie: '__Host-vitrine_session=token-owner',
          Origin: origin,
          'Content-Type': 'image/webp'
        },
        body: spoofedSvgBytes
      })
    );
    assert.equal(uploadSpoofedRes.status, 422);
    assert.equal((await uploadSpoofedRes.json()).error.code, 'INVALID_IMAGE');

    // 4.x.7: Path traversal em itemId -> 422 INVALID_IMAGE_PATH
    const uploadTraversalRes = await api.fetch(
      new Request(`${origin}${uploadPath}?itemId=../../outro-site/evil`, {
        method: 'POST',
        headers: {
          Cookie: '__Host-vitrine_session=token-owner',
          Origin: origin,
          'Content-Type': 'image/webp'
        },
        body: makeWebpBuffer(64)
      })
    );
    assert.equal(uploadTraversalRes.status, 422);
    assert.equal((await uploadTraversalRes.json()).error.code, 'INVALID_IMAGE_PATH');

    // 4.x.8: Upload válido via cookie HttpOnly -> 200 encaminhando Bearer server-side ao bucket catalog-images
    let capturedStorageCall = null;
    const mockFetch = async (urlStr, options) => {
      if (urlStr.includes('/storage/v1/object/catalog-images/')) {
        capturedStorageCall = { url: urlStr, headers: options.headers };
        return {
          ok: true,
          status: 200,
          text: async () => '{"Key":"catalog-images/ok.webp"}'
        };
      }
      return { ok: false, status: 404 };
    };

    const apiWithMockFetch = createApiHandler({ store: api.store, fetch: mockFetch });
    const uploadValidRes = await apiWithMockFetch.fetch(
      new Request(`${origin}${uploadPath}?itemId=item-123`, {
        method: 'POST',
        headers: {
          Cookie: '__Host-vitrine_session=token-owner',
          Origin: origin,
          'Content-Type': 'image/webp'
        },
        body: makeWebpBuffer(1024)
      })
    );
    assert.equal(uploadValidRes.status, 200);
    const uploadJson = await uploadValidRes.json();
    assert.ok(
      uploadJson.imageUrl.startsWith(
        `${SUPABASE_PUBLIC_PROJECT_URL}/storage/v1/object/public/catalog-images/${bookingCreated.site.id}/item-123-`
      )
    );
    assert.equal(uploadJson.bytes, 1024);
    assert.ok(capturedStorageCall);
    assert.equal(capturedStorageCall.headers.Authorization, 'Bearer token-owner');
    assert.equal(capturedStorageCall.headers['Content-Type'], 'image/webp');
  });

  await t.test('5. Validação de catálogo no modo quote (preço opcional/zero), variáveis do WhatsApp e migração de pizzeria-v1', async () => {
    assert.deepEqual(ALLOWED_TEMPLATES, [
      'pizzeria-v1',
      'products-v1',
      'booking-v1',
      'quote-v1'
    ]);
    assert.deepEqual(ALLOWED_STOREFRONT_TYPES, ['food', 'art', 'photo', 'health', 'tech']);
    assert.deepEqual(ALLOWED_CATALOG_TYPES, ['products', 'booking', 'quote']);
    assert.equal(ALLOWED_PROFILE_INTERESTS.length, 8);
    assert.equal(ALLOWED_CUSTOMIZATION_STATUSES.length, 4);
    assert.equal(ALLOWED_WHATSAPP_VARIABLES.length, 6);

    const quoteDraft = createInitialDraftContent({
      slug: 'atelie-orcamento',
      name: 'Ateliê Orçamento',
      storefrontType: 'art',
      template: 'quote-v1',
      catalogType: 'quote',
      whatsapp: '5551999998888'
    });
    quoteDraft.categories = [
      {
        id: 'encomendas',
        name: 'Peças sob Encomenda',
        items: [
          {
            id: 'escultura-ceramica',
            name: 'Escultura em Cerâmica',
            description: 'Peça autoral sob medida.',
            priceCents: 0,
            minQuantity: 1,
            active: true
          }
        ]
      }
    ];

    const validatedQuote = validateDraftContent(quoteDraft);
    assert.equal(validatedQuote.activeItems, 1);

    const compiledQuote = await compilePublicStorefront(quoteDraft, {
      slug: 'atelie-orcamento',
      name: 'Ateliê Orçamento',
      storefrontType: 'art',
      template: 'quote-v1'
    });
    assert.equal(compiledQuote.menu.catalogType, 'quote');
    assert.equal(compiledQuote.menu.items[0].priceCents, 0);

    // Variável desconhecida no template de WhatsApp deve ser rejeitada com 422 INVALID_MESSAGES
    assert.throws(
      () =>
        validateDraftContent({
          ...quoteDraft,
          messages: {
            ...quoteDraft.messages,
            whatsappTemplate: 'Olá {variavel_inexistente}'
          }
        }),
      (err) => err.status === 422 && err.code === 'INVALID_MESSAGES'
    );

    // Migração de rascunho legado pizzeria-v1 preserva todos os itens, descrições e preços
    const legacy = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'pizzaria-legada',
      businessName: 'Pizzaria Legada',
      whatsapp: '5511999999999',
      categories: [
        {
          id: 'pizzas',
          name: 'Pizzas',
          items: [
            {
              id: 'calabresa',
              name: 'Calabresa',
              description: 'Cebola roxa e azeitonas.',
              priceCents: 4990,
              active: true
            }
          ]
        }
      ]
    };
    const migrated = migrateLegacyDraftContent(legacy);
    assert.equal(migrated.catalogType, 'products');
    assert.equal(migrated.storefrontType, 'food');
    assert.equal(migrated.components.quantitySelector, true);
    assert.equal(migrated.orderFields.deliveryOrPickup, true);
    const projectedLegacy = projectPublicStorefrontMenu(legacy, {
      slug: 'pizzaria-legada',
      name: 'Pizzaria Legada',
      template: 'pizzeria-v1'
    });
    assert.equal(projectedLegacy.items.length, 1);
    assert.equal(projectedLegacy.items[0].id, 'calabresa');
    assert.equal(projectedLegacy.items[0].priceCents, 4990);

    // Rejeições de validação em validateProfileInput, validateCustomizationRequestInput e validateSiteInput
    assert.throws(
      () => validateProfileInput({ whatsapp: 'invalido' }),
      (err) => err.code === 'INVALID_WHATSAPP'
    );
    assert.throws(
      () =>
        validateCustomizationRequestInput({
          storefrontType: 'food',
          templateInterest: 'cardapio',
          goal: 'curto'
        }),
      (err) => err.code === 'INVALID_GOAL'
    );
    assert.throws(
      () =>
        validateSiteInput({
          name: 'Loja',
          slug: 'loja-teste',
          storefrontType: 'invalido'
        }),
      (err) => err.code === 'INVALID_STOREFRONT_TYPE'
    );
  });

  await t.test('6. Regressão de produção: PostgREST upsert (resolution=merge-duplicates) em publications/profiles, fallback sem grant de PK e logs seguros em wrangler tail', async () => {
    clearPublicationsCache();
    const origin = 'https://painel.inspira.dev.br';

    // 6.1 Com todas as migrações (incluindo 202611120004), o SQL exato do PostgREST (incluindo site_id/user_id no DO UPDATE SET) passa sem 42501
    const fullDb = await setupPgliteWithMigrations();
    t.after(() => fullDb.close());

    await fullDb.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'vitrine-19-itens', 'Vitrine 19 Itens', 'food', 'products-v1')",
      [SITE_A, USER_A]
    );

    const items19 = Array.from({ length: 19 }, (_, idx) => ({
      id: `item-${idx + 1}`,
      name: `Produto Artesanal ${idx + 1}`,
      description: `Descrição do produto ${idx + 1}`,
      priceCents: 2500 + idx * 100,
      active: true
    }));

    const draft19 = createInitialDraftContent({
      slug: 'vitrine-19-itens',
      name: 'Vitrine 19 Itens',
      storefrontType: 'food',
      template: 'products-v1',
      catalogType: 'products',
      whatsapp: '5511999999999'
    });
    draft19.categories = [{ id: 'cat-principal', name: 'Destaques', items: items19 }];

    await fullDb.query(
      'insert into public.drafts (site_id, revision, content) values ($1, 1, $2::jsonb)',
      [SITE_A, JSON.stringify(draft19)]
    );

    function createPostgrestSimulator(db) {
      return async (urlStr, init = {}) => {
        const u = new URL(urlStr);
        const method = (init.method || 'GET').toUpperCase();
        const prefer = String(init.headers?.prefer || init.headers?.Prefer || '');
        const body = init.body ? JSON.parse(init.body) : null;

        try {
          if (u.pathname === '/rest/v1/drafts' && method === 'GET') {
            const siteId = (u.searchParams.get('site_id') || '').replace(/^eq\./, '');
            const rows = await asRole(db, USER_A, async () => {
              const res = await db.query(
                'select site_id, revision, updated_at, content from public.drafts where site_id = $1',
                [siteId]
              );
              return res.rows;
            });
            return new Response(JSON.stringify(rows), { status: 200 });
          }

          if (u.pathname === '/rest/v1/sites' && method === 'GET') {
            const siteId = (u.searchParams.get('id') || '').replace(/^eq\./, '');
            const rows = await asRole(db, USER_A, async () => {
              const res = await db.query(
                'select id, owner_user_id, slug, name, storefront_type, template, created_at, updated_at from public.sites where id = $1',
                [siteId]
              );
              return res.rows;
            });
            return new Response(JSON.stringify(rows), { status: 200 });
          }

          if (u.pathname === '/rest/v1/publications' && method === 'POST') {
            const isMergeDuplicates = prefer.includes('resolution=merge-duplicates');
            const rows = await asRole(
              db,
              USER_A,
              async () => {
                if (isMergeDuplicates) {
                  // SQL exato emitido pelo PostgREST quando Prefer: resolution=merge-duplicates inclui todas as colunas do JSON no DO UPDATE SET
                  const res = await db.query(
                    `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu, published_at)
                     values ($1, $2, $3, $4, $5, $6::jsonb, $7)
                     on conflict (site_id) do update set
                       site_id = excluded.site_id,
                       slug = excluded.slug,
                       revision = excluded.revision,
                       status = excluded.status,
                       artifact_hash = excluded.artifact_hash,
                       menu = excluded.menu,
                       published_at = excluded.published_at
                     returning site_id, slug, revision, status, artifact_hash, menu, published_at`,
                    [
                      body.site_id,
                      body.slug,
                      body.revision,
                      body.status,
                      body.artifact_hash,
                      JSON.stringify(body.menu),
                      body.published_at
                    ]
                  );
                  return res.rows;
                }
                const res = await db.query(
                  `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu, published_at)
                   values ($1, $2, $3, $4, $5, $6::jsonb, $7)
                   returning site_id, slug, revision, status, artifact_hash, menu, published_at`,
                  [
                    body.site_id,
                    body.slug,
                    body.revision,
                    body.status,
                    body.artifact_hash,
                    JSON.stringify(body.menu),
                    body.published_at
                  ]
                );
                return res.rows;
              },
              'authenticated',
              true
            );
            return new Response(JSON.stringify(rows), { status: 201 });
          }

          if (u.pathname === '/rest/v1/publications' && method === 'PATCH') {
            const siteId = (u.searchParams.get('site_id') || '').replace(/^eq\./, '');
            if ('site_id' in body) {
              throw Object.assign(new Error('permission denied for table publications'), {
                code: '42501'
              });
            }
            const rows = await asRole(
              db,
              USER_A,
              async () => {
                const res = await db.query(
                  `update public.publications
                      set slug = $1,
                          revision = $2,
                          status = $3,
                          artifact_hash = $4,
                          menu = $5::jsonb,
                          published_at = $6
                    where site_id = $7
                    returning site_id, slug, revision, status, artifact_hash, menu, published_at`,
                  [
                    body.slug,
                    body.revision,
                    body.status,
                    body.artifact_hash,
                    JSON.stringify(body.menu),
                    body.published_at,
                    siteId
                  ]
                );
                return res.rows;
              },
              'authenticated',
              true
            );
            return new Response(JSON.stringify(rows), { status: 200 });
          }

          return new Response(JSON.stringify({ message: 'Not found' }), { status: 404 });
        } catch (err) {
          const status = err?.code === '42501' ? 403 : err?.code === '23505' ? 409 : 400;
          return new Response(
            JSON.stringify({
              code: err?.code || 'DB_ERROR',
              message: err?.message || 'Database error',
              details: null,
              hint: null
            }),
            { status, headers: { 'content-type': 'application/json' } }
          );
        }
      };
    }

    const apiFull = createApiHandler({
      authVerifier: async () => ({ id: USER_A }),
      fetch: createPostgrestSimulator(fullDb)
    });

    const pubFullRes = await apiFull.fetch(
      new Request(`${origin}/api/sites/${SITE_A}/publish`, {
        method: 'POST',
        headers: {
          Cookie: '__Host-vitrine_session=token-owner',
          Origin: origin
        }
      }),
      {
        SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
        SUPABASE_ANON_KEY: 'sb_publishable_test_key_1234567890'
      }
    );
    assert.equal(pubFullRes.status, 200);
    const pubFullBody = await pubFullRes.json();
    assert.equal(pubFullBody.publication.slug, 'vitrine-19-itens');
    assert.equal(pubFullBody.publication.menu.items.length, 19);

    // 6.2 Mesmo em banco sem a migração 202611120004 (onde UPDATE(site_id) dá 42501 no ON CONFLICT DO UPDATE), o fallback PATCH + POST publica e republica com 200 OK
    const preFixDb = new PGlite();
    t.after(() => preFixDb.close());
    await preFixDb.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    const preFixFiles = (await readdir(migrationsDir))
      .filter((f) => f.endsWith('.sql') && f <= '202611120003_site_metrics_daily.sql')
      .sort();
    for (const file of preFixFiles) {
      await preFixDb.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
    }
    await preFixDb.query('insert into auth.users (id) values ($1)', [USER_A]);
    await preFixDb.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'vitrine-19-itens', 'Vitrine 19 Itens', 'food', 'products-v1')",
      [SITE_A, USER_A]
    );
    await preFixDb.query(
      'insert into public.drafts (site_id, revision, content) values ($1, 1, $2::jsonb)',
      [SITE_A, JSON.stringify(draft19)]
    );

    const apiPreFix = createApiHandler({
      authVerifier: async () => ({ id: USER_A }),
      fetch: createPostgrestSimulator(preFixDb)
    });

    // Primeira publicação (INSERT via fallback) e segunda publicação (UPDATE via fallback PATCH)
    for (const attempt of [1, 2]) {
      const res = await apiPreFix.fetch(
        new Request(`${origin}/api/sites/${SITE_A}/publish`, {
          method: 'POST',
          headers: {
            Cookie: '__Host-vitrine_session=token-owner',
            Origin: origin
          }
        }),
        {
          SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
          SUPABASE_ANON_KEY: 'sb_publishable_test_key_1234567890'
        }
      );
      assert.equal(res.status, 200, `Tentativa ${attempt} de publicação deveria retornar 200`);
    }

    // 6.3 Quando o upstream PostgREST falha de forma irrecuperável, console.error registra código/mensagem/rota sem vazar tokens
    const loggedErrors = [];
    const origConsoleError = console.error;
    console.error = (...args) => {
      loggedErrors.push(args.join(' '));
    };
    try {
      const apiBrokenUpstream = createApiHandler({
        authVerifier: async () => ({ id: USER_A }),
        fetch: async (urlStr, init = {}) => {
          const u = new URL(urlStr);
          if (u.pathname === '/rest/v1/publications') {
            return new Response(
              JSON.stringify({
                code: '42501',
                message: 'permission denied for table publications (Bearer eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.sig)',
                details: 'contato@exemplo.com',
                hint: 'Check column grants'
              }),
              { status: 500, headers: { 'content-type': 'application/json' } }
            );
          }
          return createPostgrestSimulator(fullDb)(urlStr, init);
        }
      });

      const failRes = await apiBrokenUpstream.fetch(
        new Request(`${origin}/api/sites/${SITE_A}/publish`, {
          method: 'POST',
          headers: {
            Cookie: '__Host-vitrine_session=eyJhbGciOiJFUzI1NiJ9.eyJzdWIiOiIxIn0.secret',
            Origin: origin
          }
        }),
        {
          SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
          SUPABASE_ANON_KEY: 'sb_publishable_test_key_1234567890'
        }
      );
      assert.equal(failRes.status, 500);
      assert.ok(loggedErrors.length >= 2);
      const joinedLogs = loggedErrors.join('\n');
      assert.match(joinedLogs, /"code":"42501"/);
      assert.match(joinedLogs, /"operation":"savePublication"/);
      assert.match(joinedLogs, /\/api\/sites\/20000000-0000-0000-0000-000000000001\/publish/);
      assert.doesNotMatch(joinedLogs, /eyJhbGciOiJFUzI1NiJ9/);
      assert.doesNotMatch(joinedLogs, /contato@exemplo\.com/);
    } finally {
      console.error = origConsoleError;
    }
  });
});


test('RBAC por vitrine protege a equipe e registra alterações no banco', async (t) => {
  const db = await setupPgliteWithMigrations();
  t.after(() => db.close());
  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, 'equipe-a', 'Equipe A'), ($3, $2, 'equipe-b', 'Equipe B')",
    [SITE_A, USER_A, SITE_B]
  );
  await asRole(db, USER_A, () => db.query(
    "select public.set_showcase_member($1, $2, 'editor')", [SITE_A, USER_B]
  ), 'authenticated', true);
  const visible = await asRole(db, USER_B, () => db.query('select id from public.sites'));
  assert.deepEqual(visible.rows, [{ id: SITE_A }]);
  await assert.rejects(() => asRole(db, USER_B, () => db.query(
    "select public.set_showcase_member($1, $2, 'admin')", [SITE_A, USER_B]
  )), { code: '42501' });
  await assert.rejects(() => asRole(db, USER_A, () => db.query(
    "select public.set_showcase_member($1, $2, 'viewer')", [SITE_A, USER_A]
  )), { code: '42501' });
  const audit = await asRole(db, USER_A, () => db.query(
    "select action, actor_user_id, entity_id, summary from public.audit_logs"
  ));
  assert.deepEqual(audit.rows, [{
    action: 'insert', actor_user_id: USER_A, entity_id: USER_B, summary: { role: 'editor' }
  }]);
  await assert.rejects(() => asRole(db, USER_B, () => db.query(
    "delete from public.audit_logs"
  )), { code: '42501' });
});


test('CMS publica uma revisão consistente e mantém rascunhos privados', async (t) => {
  const db = await setupPgliteWithMigrations();
  t.after(() => db.close());
  await db.query('insert into public.platform_operators (user_id) values ($1)', [USER_A]);
  const snapshot = async () => Object.fromEntries((await db.query(
    'select section_key, draft_content, draft_visible, draft_order from public.platform_cms'
  )).rows.map(row => [row.section_key, {
    content: row.draft_content, visible: row.draft_visible, displayOrder: row.draft_order
  }]));

  await assert.rejects(() => asRole(db, null, () => db.query('select draft_content from public.platform_cms'), 'anon'), {
    code: '42501'
  });
  const privateRows = await asRole(db, USER_B, () => db.query('select draft_content from public.platform_cms'));
  assert.deepEqual(privateRows.rows, []);
  const oldSnapshot = await snapshot();
  await asRole(db, USER_A, () => db.query(
    "update public.platform_cms set draft_content = '{\"headline\":\"Título publicado\"}' where section_key = 'hero'"
  ), 'authenticated', true);

  const publish = expected => db.query('select public.publish_platform_cms($1) as ok', [JSON.stringify(expected)]);
  const stale = await asRole(db, USER_A, () => publish(oldSnapshot));
  assert.equal(stale.rows[0].ok, false);
  const current = await snapshot();
  await assert.rejects(() => asRole(db, USER_B, () => publish(current)), { code: '42501' });
  const updated = await asRole(db, USER_A, () => publish(current), 'authenticated', true);
  assert.equal(updated.rows[0].ok, true);
  const publicRows = await asRole(db, null, () => db.query('select * from public.read_platform_cms()'), 'anon');
  const hero = publicRows.rows.find(row => row.section_key === 'hero');
  assert.deepEqual(hero.content, { headline: 'Título publicado' });
  assert.deepEqual(publicRows.rows.find(row => row.section_key === 'announcements').content, {});
  assert.equal(Object.hasOwn(hero, 'draft_content'), false);
});


test('Banco preserva as cinco versões recentes e restaura somente versões da própria vitrine', async (t) => {
  const db = await setupPgliteWithMigrations();
  t.after(() => db.close());
  await db.query("insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, 'versoes-a', 'Versões')", [
    SITE_A, USER_A
  ]);
  let targetHash;
  for (let revision = 1; revision <= 6; revision++) {
    const { menu, hash } = await compilePublicStorefront({
      businessName: `Versão ${revision}`, whatsapp: '5511999999999',
      items: [{ id: 'produto', name: 'Produto', priceCents: 1000 }]
    }, { slug: 'versoes-a' }, { revision });
    if (revision === 2) targetHash = hash;
    await db.query(
      `insert into public.publications (site_id, slug, revision, artifact_hash, menu, published_at)
       values ($1, 'versoes-a', $2, $3, $4, $5)
       on conflict (site_id) do update set revision = excluded.revision,
         artifact_hash = excluded.artifact_hash, menu = excluded.menu, published_at = excluded.published_at`,
      [SITE_A, revision, hash, JSON.stringify(menu), `2026-11-0${revision}T00:00:00Z`]
    );
  }
  const versions = await db.query('select revision from public.publication_releases order by revision');
  assert.deepEqual(versions.rows.map(row => row.revision), [2, 3, 4, 5, 6]);
  const rollback = () => db.query('select revision from public.rollback_showcase($1, 2, $2)', [SITE_A, targetHash]);
  await assert.rejects(() => asRole(db, USER_STRANGER, rollback), { code: '42501' });
  const restored = await asRole(db, USER_A, rollback, 'authenticated', true);
  assert.equal(restored.rows[0].revision, 2);
  const audit = await db.query("select action, actor_user_id from public.audit_logs where entity_type = 'publication'");
  assert.deepEqual(audit.rows, [{ action: 'rollback', actor_user_id: USER_A }]);
});

test('Banco emite o desafio DNS e reserva até 95 domínios entre ativos e em verificação', async (t) => {
  const db = await setupPgliteWithMigrations();
  t.after(() => db.close());
  await db.query("insert into public.sites (id, owner_user_id, slug, name) values ($1, $2, 'dominios-a', 'Domínios')", [
    SITE_A, USER_A
  ]);
  const { rows: [pending] } = await asRole(db, USER_A, () => db.query(
    "insert into public.custom_domains (site_id, hostname) values ($1, 'menu.example.com') returning *",
    [SITE_A]
  ), 'authenticated', true);
  assert.equal(pending.verification_txt_name, '_vitrine-verify.menu.example.com');
  assert.match(pending.verification_txt_value, /^vitrine=[a-f0-9-]{36}$/);
  await assert.rejects(() => asRole(db, USER_A, () => db.query(
    "insert into public.custom_domains (site_id, hostname, verification_txt_value) values ($1, 'unsafe.example.com', 'chosen')",
    [SITE_A]
  )), { code: '42501' });
  await db.query(
    "insert into public.custom_domains (site_id, hostname, status) select $1, 'menu-' || n || '.example.com', 'verifying' from generate_series(1,95) n",
    [SITE_A]
  );
  const reserve = () => db.query("update public.custom_domains set status = 'verifying' where id = $1", [pending.id]);
  await assert.rejects(reserve, /DOMAIN_QUOTA_REACHED/);
  await db.query("delete from public.custom_domains where hostname = 'menu-95.example.com'");
  assert.equal((await reserve()).affectedRows, 1);
});

test('Operações globais exigem operador e gravam a transição do pedido no banco', async (t) => {
  const db = await setupPgliteWithMigrations();
  t.after(() => db.close());
  await db.query('insert into public.platform_operators (user_id) values ($1)', [USER_A]);
  const overview = () => db.query('select public.read_platform_overview() as overview');
  await assert.rejects(() => asRole(db, USER_B, overview), { code: '42501' });
  const info = (await asRole(db, USER_A, overview)).rows[0].overview;
  assert.equal(info.domainLimit, 95);
  assert.ok(info.databaseBytes > 0);
  const request = (await db.query(
    "insert into public.customization_requests (user_id, storefront_type, template_interest, goal) values ($1, 'art', 'portfolio', 'Criar portfólio online') returning id",
    [USER_B]
  )).rows[0];
  const move = status => db.query('update public.customization_requests set status = $1 where id = $2 returning status', [status, request.id]);
  await assert.rejects(() => asRole(db, USER_A, () => move('respondido')), /INVALID_CUSTOMIZATION_TRANSITION/);
  assert.equal((await asRole(db, USER_B, () => move('em_analise'))).rows.length, 0);
  assert.equal((await asRole(db, USER_A, () => move('em_analise'), 'authenticated', true)).rows[0].status, 'em_analise');
  const audit = await db.query("select action, summary from public.audit_logs where entity_id = $1", [request.id]);
  assert.deepEqual(audit.rows, [{ action: 'status_changed', summary: { from: 'novo', to: 'em_analise' } }]);
});

test('PR A - Roteamento por Host, Domínios Canônicos, Slugs Reservados, Perfil Obrigatório e Seção por Item', async (t) => {
  await t.test('1. Slugs reservados incluem como-funciona, possibilidades, planos e orcamento', () => {
    for (const slug of ['como-funciona', 'possibilidades', 'planos', 'orcamento']) {
      assert.ok(RESERVED_SLUGS.includes(slug), `${slug} deve estar em RESERVED_SLUGS`);
      assert.throws(() => validateSlug(slug), (err) => err.code === 'INVALID_SLUG');
      assert.throws(
        () => validateSiteInput({ name: 'Teste', slug }),
        (err) => err.code === 'INVALID_SLUG'
      );
    }
  });

  await t.test('2. Perfil obrigatório no primeiro acesso: POST /api/sites retorna 409 PROFILE_INCOMPLETE até preencher os 4 campos obrigatórios (interests opcional)', async () => {
    const api = createApiHandler();
    const origin = 'https://painel.inspira.dev.br';

    assert.deepEqual(REQUIRED_PROFILE_FIELDS, [
      'displayName',
      'businessName',
      'city',
      'whatsapp'
    ]);
    assert.equal(isProfileComplete({}), false);
    assert.deepEqual(getMissingRequiredProfileFields({ displayName: 'Ana' }), [
      'businessName',
      'city',
      'whatsapp'
    ]);
    assert.throws(
      () => assertProfileComplete({ displayName: 'Ana' }),
      (err) => err.status === 409 && err.code === 'PROFILE_INCOMPLETE'
    );

    // Tentativa inicial sem perfil -> 409 PROFILE_INCOMPLETE
    const resEmpty = await api.fetch(
      new Request(`${origin}/api/sites`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Padaria da Ana',
          slug: 'padaria-da-ana',
          storefrontType: 'food',
          template: 'products-v1',
          catalogType: 'products'
        })
      })
    );
    assert.equal(resEmpty.status, 409);
    const bodyEmpty = await resEmpty.json();
    assert.equal(bodyEmpty.error.code, 'PROFILE_INCOMPLETE');
    assert.deepEqual(bodyEmpty.error.missingFields, [
      'displayName',
      'businessName',
      'city',
      'whatsapp'
    ]);

    // Salva perfil parcial (sem whatsapp) -> continua 409 PROFILE_INCOMPLETE
    await api.fetch(
      new Request(`${origin}/api/profile`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: 'Ana Clara',
          businessName: 'Padaria da Ana',
          city: 'Belo Horizonte, MG',
          whatsapp: ''
        })
      })
    );

    const resPartial = await api.fetch(
      new Request(`${origin}/api/sites`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Padaria da Ana',
          slug: 'padaria-da-ana'
        })
      })
    );
    assert.equal(resPartial.status, 409);
    const bodyPartial = await resPartial.json();
    assert.equal(bodyPartial.error.code, 'PROFILE_INCOMPLETE');
    assert.deepEqual(bodyPartial.error.missingFields, ['whatsapp']);

    // Salva os 4 campos obrigatórios (sem interests, que é opcional) -> POST /api/sites retorna 201 e herda o WhatsApp do perfil
    await api.fetch(
      new Request(`${origin}/api/profile`, {
        method: 'PUT',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          displayName: 'Ana Clara',
          businessName: 'Padaria da Ana',
          city: 'Belo Horizonte, MG',
          whatsapp: '5531988887777',
          interests: []
        })
      })
    );

    const resCreated = await api.fetch(
      new Request(`${origin}/api/sites`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'Padaria da Ana',
          slug: 'padaria-da-ana',
          storefrontType: 'food',
          template: 'products-v1',
          catalogType: 'products'
        })
      })
    );
    assert.equal(resCreated.status, 201);
    const createdBody = await resCreated.json();
    assert.equal(createdBody.site.slug, 'padaria-da-ana');
    assert.equal(createdBody.draft.content.whatsapp, '5531988887777');
  });

  await t.test('3. Campo opcional section por item (como no Google Forms): validação, publicação e retrocompatibilidade sem seções', async () => {
    const draftWithSections = {
      schemaVersion: 1,
      template: 'products-v1',
      storefrontType: 'food',
      catalogType: 'products',
      slug: 'padaria-artesanal',
      businessName: 'Padaria Artesanal',
      whatsapp: '5531988887777',
      items: [
        {
          id: 'pao-fermentacao',
          name: 'Pão de Fermentação Natural',
          description: 'Casca crocante e miolo alveolado.',
          section: 'Pães',
          priceCents: 2400,
          active: true
        },
        {
          id: 'baguete-tradicional',
          name: 'Baguete Francesa',
          section: 'Pães',
          priceCents: 1600,
          active: true
        },
        {
          id: 'sonho-creme',
          name: 'Sonho de Creme de Baunilha',
          section: 'Doces',
          priceCents: 1200,
          active: true
        }
      ]
    };

    const validated = validateDraftContent(draftWithSections);
    assert.equal(validated.activeItems, 3);

    // Rejeita section inválida (> 160 caracteres ou payload perigoso)
    assert.throws(
      () =>
        validateDraftContent({
          ...draftWithSections,
          items: [
            {
              ...draftWithSections.items[0],
              section: 'S'.repeat(161)
            }
          ]
        }),
      (err) => err.status === 422 && err.code === 'INVALID_ITEM'
    );
    assert.throws(
      () =>
        validateDraftContent({
          ...draftWithSections,
          items: [
            {
              ...draftWithSections.items[0],
              section: '<script>alert(1)</script>'
            }
          ]
        }),
      (err) => err.status === 422 && err.code === 'INVALID_ITEM'
    );

    const compiledWithSections = await compilePublicStorefront(draftWithSections, {
      slug: 'padaria-artesanal',
      name: 'Padaria Artesanal',
      storefrontType: 'food',
      template: 'products-v1'
    });
    assert.equal(compiledWithSections.menu.items[0].section, 'Pães');
    assert.equal(compiledWithSections.menu.items[2].section, 'Doces');
    assert.deepEqual(
      compiledWithSections.menu.categories.map((c) => c.name),
      ['Pães', 'Doces']
    );
    const htmlWithSections = renderStorefrontHtml(compiledWithSections.menu);
    assert.match(htmlWithSections, /<h2 class="menu-category-title">Pães<\/h2>/);
    assert.match(htmlWithSections, /<h2 class="menu-category-title">Doces<\/h2>/);

    // Vitrine sem section nos itens continua funcionando exatamente como antes
    const draftWithoutSections = {
      ...draftWithSections,
      items: [
        {
          id: 'pao-fermentacao',
          name: 'Pão de Fermentação Natural',
          priceCents: 2400,
          active: true
        }
      ]
    };
    const compiledWithoutSections = await compilePublicStorefront(draftWithoutSections, {
      slug: 'padaria-artesanal',
      name: 'Padaria Artesanal',
      storefrontType: 'food',
      template: 'products-v1'
    });
    assert.equal('section' in compiledWithoutSections.menu.items[0], false);
    assert.equal(compiledWithoutSections.menu.categories.length, 1);
    assert.equal(compiledWithoutSections.menu.categories[0].name, 'Cardápio');
  });

  await t.test('4. Tabela de roteamento por host (vitrine.inspira.dev.br, painel.inspira.dev.br e *.workers.dev)', async () => {
    clearPublicationsCache();
    const api = createApiHandler();
    const env = {
      SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
      SUPABASE_ANON_KEY: 'sb_publishable_routing_test_key',
      PUBLIC_SITE_ORIGIN,
      PORTAL_ORIGIN
    };

    // Publica vitrine pizza-a (que já vem semeada em createMemoryStore) para testar /{slug real}
    const pubPizzaARes = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/sites/20000000-0000-0000-0000-000000000001/publish', {
        method: 'POST',
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(pubPizzaARes.status, 200);

    // 4.1 painel.inspira.dev.br
    // / serve o portal (200) sem redirect e com PORTAL_CSP_HEADER
    const painelRootRes = await api.fetch(new Request('https://painel.inspira.dev.br/'), env);
    assert.equal(painelRootRes.status, 200);
    assert.equal(painelRootRes.headers.get('location'), null);
    assert.equal(painelRootRes.headers.get('content-security-policy'), PORTAL_CSP_HEADER);
    assert.match(await painelRootRes.text(), /Painel Administrativo/);

    // Roteamento também funciona via cabeçalho Host
    const painelHostHeaderRes = await api.fetch(
      new Request('http://localhost/', {
        headers: { Host: 'painel.inspira.dev.br' }
      }),
      env
    );
    assert.equal(painelHostHeaderRes.status, 200);
    assert.equal(painelHostHeaderRes.headers.get('content-security-policy'), PORTAL_CSP_HEADER);

    // /portal e /portal/ redirecionam 301 para https://painel.inspira.dev.br/ (preservando query string como ?code=...)
    for (const [path, expectedLoc] of [
      ['/portal', 'https://painel.inspira.dev.br/'],
      ['/portal/', 'https://painel.inspira.dev.br/'],
      ['/portal/index.html', 'https://painel.inspira.dev.br/'],
      ['/portal/?code=pkce123', 'https://painel.inspira.dev.br/?code=pkce123']
    ]) {
      const res = await api.fetch(new Request(`https://painel.inspira.dev.br${path}`), env);
      assert.equal(res.status, 301, `Esperado 301 para painel.inspira.dev.br${path}`);
      assert.equal(res.headers.get('location'), expectedLoc);
    }

    // /vitrine em painel. redireciona 301 para https://vitrine.inspira.dev.br/
    for (const path of ['/vitrine', '/vitrine/']) {
      const res = await api.fetch(new Request(`https://painel.inspira.dev.br${path}`), env);
      assert.equal(res.status, 301);
      assert.equal(res.headers.get('location'), 'https://vitrine.inspira.dev.br/');
    }

    // Rotas de marketing e vitrines em painel. redirecionam 301 para vitrine.inspira.dev.br no mesmo caminho
    for (const path of [
      '/loja1',
      '/pizza-a',
      '/como-funciona',
      '/como-funciona/',
      '/possibilidades',
      '/possibilidades/',
      '/planos',
      '/planos/',
      '/orcamento',
      '/orcamento/'
    ]) {
      const res = await api.fetch(new Request(`https://painel.inspira.dev.br${path}`), env);
      assert.equal(res.status, 301, `Esperado 301 para painel.inspira.dev.br${path}`);
      assert.equal(res.headers.get('location'), `https://vitrine.inspira.dev.br${path}`);
    }

    // /404 em painel. retorna 404
    const painel404Res = await api.fetch(new Request('https://painel.inspira.dev.br/404'), env);
    assert.equal(painel404Res.status, 404);

    // /api/auth/config funciona em painel.
    const painelAuthCfg = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/config'),
      env
    );
    assert.equal(painelAuthCfg.status, 200);
    const painelAuthJson = await painelAuthCfg.json();
    assert.equal(painelAuthJson.PUBLIC_SITE_ORIGIN, 'https://vitrine.inspira.dev.br');
    assert.equal(painelAuthJson.PORTAL_ORIGIN, 'https://painel.inspira.dev.br');

    // 4.2 vitrine.inspira.dev.br
    // / e novas páginas de marketing servem 200 com STRICT_CSP_HEADER
    for (const path of ['/', '/como-funciona', '/possibilidades', '/planos', '/orcamento']) {
      const res = await api.fetch(new Request(`https://vitrine.inspira.dev.br${path}`), env);
      assert.equal(res.status, 200, `Esperado 200 em vitrine.inspira.dev.br${path}`);
      assert.equal(res.headers.get('content-security-policy'), STRICT_CSP_HEADER);
    }

    // /portal* em vitrine. redireciona 301 para https://painel.inspira.dev.br/
    for (const [path, expectedLoc] of [
      ['/portal', 'https://painel.inspira.dev.br/'],
      ['/portal/', 'https://painel.inspira.dev.br/'],
      ['/portal/?code=abc', 'https://painel.inspira.dev.br/?code=abc']
    ]) {
      const res = await api.fetch(new Request(`https://vitrine.inspira.dev.br${path}`), env);
      assert.equal(res.status, 301, `Esperado 301 em vitrine.inspira.dev.br${path}`);
      assert.equal(res.headers.get('location'), expectedLoc);
    }

    // /vitrine e /vitrine/ em vitrine. redirecionam 301 para https://vitrine.inspira.dev.br/
    for (const path of ['/vitrine', '/vitrine/']) {
      const res = await api.fetch(new Request(`https://vitrine.inspira.dev.br${path}`), env);
      assert.equal(res.status, 301);
      assert.equal(res.headers.get('location'), 'https://vitrine.inspira.dev.br/');
    }

    // /loja1 e /pizza-a servem 200 em vitrine.inspira.dev.br
    for (const slug of ['/loja1', '/pizza-a']) {
      const res = await api.fetch(new Request(`https://vitrine.inspira.dev.br${slug}`), env);
      assert.equal(res.status, 200);
    }

    // /404 e slug não publicado retornam 404 em vitrine.inspira.dev.br
    for (const notFoundPath of ['/404', '/slug-inexistente']) {
      const res = await api.fetch(
        new Request(`https://vitrine.inspira.dev.br${notFoundPath}`),
        env
      );
      assert.equal(res.status, 404);
    }

    // /api/auth/config funciona em vitrine.inspira.dev.br
    const vitrineAuthCfg = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/api/auth/config'),
      env
    );
    assert.equal(vitrineAuthCfg.status, 200);

    // 4.3 *.workers.dev
    // /portal* redireciona 301 para https://painel.inspira.dev.br/
    for (const [path, expectedLoc] of [
      ['/portal', 'https://painel.inspira.dev.br/'],
      ['/portal/', 'https://painel.inspira.dev.br/'],
      ['/portal/?code=xyz', 'https://painel.inspira.dev.br/?code=xyz']
    ]) {
      const res = await api.fetch(
        new Request(`https://vitrine-inspira.vitrineinspira.workers.dev${path}`),
        env
      );
      assert.equal(res.status, 301);
      assert.equal(res.headers.get('location'), expectedLoc);
    }

    // Demais rotas públicas em *.workers.dev redirecionam 301 para https://vitrine.inspira.dev.br
    for (const [path, expectedLoc] of [
      ['/', 'https://vitrine.inspira.dev.br/'],
      ['/vitrine', 'https://vitrine.inspira.dev.br/'],
      ['/loja1', 'https://vitrine.inspira.dev.br/loja1'],
      ['/pizza-a', 'https://vitrine.inspira.dev.br/pizza-a'],
      ['/como-funciona', 'https://vitrine.inspira.dev.br/como-funciona'],
      ['/possibilidades', 'https://vitrine.inspira.dev.br/possibilidades'],
      ['/planos', 'https://vitrine.inspira.dev.br/planos'],
      ['/orcamento', 'https://vitrine.inspira.dev.br/orcamento']
    ]) {
      const res = await api.fetch(
        new Request(`https://vitrine-inspira.vitrineinspira.workers.dev${path}`),
        env
      );
      assert.equal(res.status, 301, `Esperado 301 em workers.dev${path}`);
      assert.equal(res.headers.get('location'), expectedLoc);
    }

    // /api/* permanece em *.workers.dev (sem redirect) para o smoke check do deploy
    const workersAuthCfg = await api.fetch(
      new Request('https://vitrine-inspira.vitrineinspira.workers.dev/api/auth/config'),
      env
    );
    assert.equal(workersAuthCfg.status, 200);
    assert.equal(workersAuthCfg.headers.get('location'), null);
  });
});
