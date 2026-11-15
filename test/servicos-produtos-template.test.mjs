import { PGlite } from '@electric-sql/pglite';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  BUSINESS_PAGE_SLUG,
  SERVICES_PRODUCTS_TEMPLATE,
  SERVICES_PRODUCTS_TEMPLATE_CODE,
  servicesProductsStructureDefaults
} from '../src/servicos-produtos-template.mjs';
import { resolveShowcaseManifest, projectShowcaseManifest } from '../src/showcase-structure.mjs';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { ALLOWED_TEMPLATES, createInitialDraftContent } from '../src/portal-validation.mjs';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const migrationsDir = resolve(root, 'supabase/migrations');
const MIGRATION = '20261116001800_template_servicos_produtos.sql';
const HOME_ORDER = ['hero', 'highlights', 'catalog_grid', 'about_story', 'testimonials', 'faq', 'hero'];
const FORBIDDEN = /(?<![\p{L}\p{N}])(cat[aá]logos?|card[aá]pios?|rifas?|sorteios?|carrinho|checkout)(?![\p{L}\p{N}])/giu;

function collectStrings(value, out = []) {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach(entry => collectStrings(entry, out));
  else if (value && typeof value === 'object') Object.values(value).forEach(entry => collectStrings(entry, out));
  return out;
}

async function migratedDb() {
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
  for (const file of (await readdir(migrationsDir)).filter(f => f.endsWith('.sql')).sort()) {
    await db.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
  }
  return db;
}

function apiFor(store) {
  const api = createApiHandler({ store });
  const origin = 'https://vitrine.inspira.dev.br';
  return (path, method = 'GET', body) => api(new Request(origin + path, {
    method,
    headers: { origin, authorization: 'Bearer token-owner', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
}

test('Receita do modelo: sete seções na ordem e "Para empresas" desligada', () => {
  const { template } = servicesProductsStructureDefaults();
  const manifest = resolveShowcaseManifest({}, template);
  const [home, business] = manifest.pages;
  assert.equal(home.slug, 'home');
  assert.deepEqual(home.sections.map(section => section.moduleCode), HOME_ORDER);
  assert.equal(home.sections[0].config.primaryAction.target, 'selecao');
  assert.equal(home.sections[0].config.secondaryAction.target, 'whatsapp');
  assert.deepEqual(home.sections.find(s => s.moduleCode === 'testimonials').config.items, []);
  assert.equal(business.slug, BUSINESS_PAGE_SLUG);
  assert.equal(business.active, false);
  assert.deepEqual(business.sections.map(section => section.moduleCode), ['hero', 'quote_request', 'faq']);
  assert.deepEqual(projectShowcaseManifest(manifest).pages.map(page => page.slug), ['home']);
  assert.deepEqual(manifest.theme, SERVICES_PRODUCTS_TEMPLATE.defaultTokens);
  assert.equal(manifest.theme.buttonStyle, 'rounded');
});

test('Textos do modelo e da migração não usam termos proibidos', async () => {
  const sql = await readFile(resolve(migrationsDir, MIGRATION), 'utf8');
  const strings = [sql, ...collectStrings(SERVICES_PRODUCTS_TEMPLATE)];
  const found = strings.flatMap(text => [...text.matchAll(FORBIDDEN)].map(match => match[1]));
  assert.deepEqual(found, []);
});

test('Migração cadastra o modelo igual à receita, o módulo de destaques e os campos novos', async () => {
  const db = await migratedDb();
  const { rows: [row] } = await db.query(
    `select name, storefront_type, catalog_type, schema_version, default_tokens,
            default_sections, default_pages, is_custom_only, active
       from public.templates where code = $1`,
    [SERVICES_PRODUCTS_TEMPLATE_CODE]
  );
  assert.ok(row, 'modelo cadastrado');
  assert.equal(row.name, SERVICES_PRODUCTS_TEMPLATE.name);
  assert.equal(row.storefront_type, 'services');
  assert.equal(row.catalog_type, 'products');
  assert.equal(row.is_custom_only, false);
  assert.equal(row.active, true);
  assert.deepEqual(row.default_tokens, SERVICES_PRODUCTS_TEMPLATE.defaultTokens);
  assert.deepEqual(row.default_sections, SERVICES_PRODUCTS_TEMPLATE.defaultSections);
  assert.deepEqual(row.default_pages, SERVICES_PRODUCTS_TEMPLATE.defaultPages);

  const { rows: modules } = await db.query(
    `select code, config_schema from public.modules where code in ('highlights', 'hero', 'testimonials', 'faq') order by code`
  );
  const schemas = Object.fromEntries(modules.map(entry => [entry.code, entry.config_schema]));
  assert.deepEqual(Object.keys(schemas).sort(), ['faq', 'hero', 'highlights', 'testimonials']);
  for (const field of ['eyebrow', 'imageUrl', 'imageAlt', 'primaryAction', 'secondaryAction']) {
    assert.ok(Object.hasOwn(schemas.hero, field), `hero.${field}`);
  }
  assert.equal(schemas.testimonials.items[0].consent, 'boolean');
  assert.deepEqual(schemas.faq.items[0], { q: 'string', a: 'string' });

  const { rows: [{ count }] } = await db.query(
    `select count(*)::int as count from public.templates where default_pages <> '[]'::jsonb`
  );
  assert.equal(count, 1);
  await db.query('insert into auth.users (id) values ($1)', ['10000000-0000-0000-0000-000000000001']);
  await db.query(
    'insert into public.sites(owner_user_id, slug, name, template) values ($1, $2, $3, $4)',
    ['10000000-0000-0000-0000-000000000001', 'atelie-teste', 'Ateliê Teste', SERVICES_PRODUCTS_TEMPLATE_CODE]
  );
  await assert.rejects(db.query(
    `update public.templates set default_pages = '{}'::jsonb where code = $1`,
    [SERVICES_PRODUCTS_TEMPLATE_CODE]
  ));
  await db.close();
});

test('Nova vitrine com o modelo nasce com a receita e sem entrega no pedido', () => {
  assert.ok(ALLOWED_TEMPLATES.includes(SERVICES_PRODUCTS_TEMPLATE_CODE));
  const content = createInitialDraftContent({
    slug: 'atelie-teste', name: 'Ateliê Teste', storefrontType: 'art',
    template: SERVICES_PRODUCTS_TEMPLATE_CODE, catalogType: 'products', whatsapp: '5511999999999'
  });
  assert.deepEqual(content.structure, {});
  assert.equal(content.template, SERVICES_PRODUCTS_TEMPLATE_CODE);
  assert.doesNotMatch(JSON.stringify(content), FORBIDDEN);
});

test('Worker cria rascunho com o modelo e publica a receita sem a página de empresas', async () => {
  const store = createMemoryStore();
  store.getStructureDefaults = async code => code === SERVICES_PRODUCTS_TEMPLATE_CODE
    ? servicesProductsStructureDefaults()
    : null;
  const send = apiFor(store);
  await send('/api/profile', 'PUT', {
    displayName: 'Ana Clara', businessName: 'Ateliê Teste', city: 'Campinas, SP', whatsapp: '5519999999999'
  });
  const created = await send('/api/sites', 'POST', {
    name: 'Ateliê Teste', slug: 'atelie-teste', storefrontType: 'art',
    template: SERVICES_PRODUCTS_TEMPLATE_CODE, catalogType: 'products'
  });
  assert.equal(created.status, 201);
  const { site } = await created.json();
  assert.equal(site.template, SERVICES_PRODUCTS_TEMPLATE_CODE);

  const { resolved } = await (await send(`/api/sites/${site.id}/structure`)).json();
  assert.deepEqual(resolved.pages[0].sections.map(section => section.moduleCode), HOME_ORDER);
  assert.equal(resolved.pages[1].slug, BUSINESS_PAGE_SLUG);
  assert.equal(resolved.pages[1].active, false);
});

test('Ligar "Para empresas" publica hero, pedido de orçamento e perguntas na página', async () => {
  const store = createMemoryStore();
  const [site] = [...store.sites.values()];
  const draft = await store.getDraft(site.id, site.owner_user_id);
  const { template } = servicesProductsStructureDefaults();
  const manifest = resolveShowcaseManifest({}, template);
  const pages = manifest.pages.map(page => ({ ...page, active: true }));
  const { menu } = await compilePublicStorefront({
    ...draft.content, structure: { templateCode: SERVICES_PRODUCTS_TEMPLATE_CODE, pages }
  }, site);
  const html = renderStorefrontHtml(menu, undefined, { interactive: false });
  const business = html.slice(html.indexOf('id="pagina-empresas"'));
  assert.match(html, /id="pagina-empresas"[^>]*><h2>Para empresas<\/h2>/);
  assert.ok(business.indexOf('sec-empresas-abertura') < business.indexOf('sec-empresas-orcamento'));
  assert.ok(business.indexOf('sec-empresas-orcamento') < business.indexOf('sec-empresas-perguntas'));
  assert.match(business, /Pedir orçamento pelo WhatsApp/);
  assert.match(business, /href="https:\/\/wa\.me\/\d+\?text=/);
  assert.equal((html.match(/<h1[\s>]/g) ?? []).length, 1);
  assert.doesNotMatch(business, FORBIDDEN);

  const { menu: offMenu } = await compilePublicStorefront({
    ...draft.content, structure: { templateCode: SERVICES_PRODUCTS_TEMPLATE_CODE, pages: manifest.pages }
  }, site);
  assert.doesNotMatch(renderStorefrontHtml(offMenu, undefined, { interactive: false }), /pagina-empresas/);
});

test('Trocar uma vitrine existente para o modelo preserva itens e contato (spec 009 US4)', async () => {
  const store = createMemoryStore();
  const [site] = [...store.sites.values()];
  const before = await store.getDraft(site.id, site.owner_user_id);
  const original = {
    catalogType: before.content.catalogType ?? 'products',
    template: { defaultTokens: { accentColor: '#C74414' }, defaultSections: [] }
  };
  store.getStructureDefaults = async code => code === SERVICES_PRODUCTS_TEMPLATE_CODE
    ? { ...servicesProductsStructureDefaults(), catalogType: original.catalogType }
    : original;
  store.listStructureTemplates = async () => [{ code: SERVICES_PRODUCTS_TEMPLATE_CODE, name: 'Serviços e produtos' }];
  const send = apiFor(store);
  const path = `/api/sites/${site.id}`;
  const { revision, templates } = await (await send(path + '/structure')).json();
  assert.equal(templates[0].code, SERVICES_PRODUCTS_TEMPLATE_CODE);
  const change = await send(path + '/structure', 'PUT', {
    expectedRevision: revision, templateCode: SERVICES_PRODUCTS_TEMPLATE_CODE
  });
  assert.equal(change.status, 200);
  const { draft, resolved } = await change.json();
  assert.deepEqual(resolved.pages[0].sections.map(section => section.moduleCode), HOME_ORDER);
  assert.deepEqual(draft.content.categories, before.content.categories);
  assert.equal(draft.content.whatsapp, before.content.whatsapp);

  const { publication } = await (await send(path + '/publish', 'POST')).json();
  assert.ok(publication.menu.items.length > 0);
  assert.equal(publication.menu.whatsapp ?? publication.menu.contact?.whatsapp, before.content.whatsapp);
  assert.deepEqual(publication.menu.structure.pages.map(page => page.slug), ['home']);
});

test('Painel oferece o modelo no assistente de criação', async () => {
  const html = await readFile(resolve(root, 'web/portal/index.html'), 'utf8');
  const portal = await readFile(resolve(root, 'web/portal/portal.js'), 'utf8');
  assert.match(html, /name="wizard-model" value="services"[\s\S]{0,200}<h3>Serviços e produtos<\/h3>/);
  assert.match(portal, /model === 'services'\) \{\s*template = 'servicos-produtos-v1';\s*catalogType = 'products';/);
});
