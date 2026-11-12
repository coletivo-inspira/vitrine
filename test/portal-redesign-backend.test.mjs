import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  PORTAL_STORAGE_CSP_HEADER,
  STOREFRONT_STORAGE_CSP_HEADER,
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
  buildCustomizationWhatsappUrl,
  createInitialDraftContent,
  migrateLegacyDraftContent,
  validateCatalogImagePath,
  validateCustomizationRequestInput,
  validateDraftContent,
  validateProfileInput,
  validateSiteInput
} from '../src/portal-validation.mjs';
import {
  FORBIDDEN_PUBLIC_KEYS,
  compilePublicStorefront,
  projectPublicStorefrontMenu
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

    // Usuário autenticado não tem permissão para alterar status diretamente (42501 column privilege)
    await assert.rejects(
      () =>
        asRole(db, USER_A, () =>
          db.query("update public.customization_requests set status = 'respondido'")
        ),
      (err) => err.code === '42501'
    );
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
    const hostedDb = new PGlite();
    t.after(() => hostedDb.close());
    await hostedDb.exec(`
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

    for (const file of (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort()) {
      await hostedDb.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
    }

    const hostedBucket = await hostedDb.query(
      "select id, public, file_size_limit, allowed_mime_types from storage.buckets where id = 'catalog-images'"
    );
    assert.equal(hostedBucket.rows.length, 1);
    assert.equal(hostedBucket.rows[0].public, true);
    const hostedPolicies = await hostedDb.query(
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
});
