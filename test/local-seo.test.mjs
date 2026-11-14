import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LOCAL_BUSINESS_TYPES,
  buildLocalBusinessJsonLd,
  canonicalUrlFor,
  publicationSeoOptions,
  serializeJsonLd,
  shareMetaFor,
  validateLocalSeo
} from '../src/local-seo.mjs';
import { normalizeEntitlements } from '../src/entitlements.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';
import {
  FORBIDDEN_PUBLIC_KEYS,
  assertNoPrivateLeakage,
  compilePublicStorefront,
  renderStorefrontHtml
} from '../src/publication-engine.mjs';
import { createApiHandler, createMemoryStore, hydratePublicationRecord } from '../workers/api.mjs';

const OWNER = '10000000-0000-0000-0000-000000000001';
const ESSENCIAL = normalizeEntitlements({ plan_code: 'essencial' });
const FREE = normalizeEntitlements({ plan_code: 'free' });
const ADDRESS = { street: 'Rua Augusta, 1500', district: 'Consolação', city: 'São Paulo', uf: 'SP', postalCode: '01304-001' };
const WEEK = { fri: [{ opens: '18:00', closes: '02:00', overnight: true }], sat: [{ opens: '11:00', closes: '15:00' }] };
const ACTIVE_DOMAIN = { hostname: 'pizzariadoze.com.br', status: 'active', ssl_status: 'active' };

function draft(extra = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    catalogType: 'products',
    slug: 'pizza-a',
    businessName: 'Pizza A',
    whatsapp: '5511987654321',
    messages: { welcomeText: 'Pizza no forno a lenha, entrega na Consolação.' },
    categories: [{ id: 'pizzas', name: 'Pizzas', items: [{ id: 'mussarela', name: 'Mussarela', priceCents: 4500 }] }],
    ...extra
  };
}

const compile = (content, entitlements, domains = []) => compilePublicStorefront(content, { slug: 'pizza-a' }, {
  ...publicationSeoOptions({ slug: 'pizza-a', entitlements, domains })
});

function jsonLdBlocks(html) {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
}

function meta(html, property) {
  const match = html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`));
  return match?.[1];
}

test('Issue #117 — campos de SEO local do rascunho', async (t) => {
  await t.test('tipo de lista fechada e área atendida com limite', () => {
    assert.ok(LOCAL_BUSINESS_TYPES.some((entry) => entry.value === 'Restaurant'));
    assert.ok(LOCAL_BUSINESS_TYPES.some((entry) => entry.value === 'ProfessionalService'));
    assert.deepEqual(validateLocalSeo({ businessType: 'Restaurant', areaServed: '  Zona  Sul ' }).value, {
      businessType: 'Restaurant', areaServed: 'Zona Sul'
    });
    assert.equal(validateLocalSeo({}).value, undefined);
    assert.equal(validateLocalSeo({ businessType: 'Organization' }).errors[0].field, 'localSeo.businessType');
    assert.equal(validateLocalSeo({ areaServed: 'x'.repeat(121) }).errors[0].field, 'localSeo.areaServed');
    assert.equal(validateLocalSeo({ areaServed: '<b>' }).errors[0].field, 'localSeo.areaServed');
    assert.equal(validateLocalSeo({ ownerEmail: 'a@b.c' }).errors[0].field, 'localSeo.ownerEmail');
  });

  await t.test('rascunho com tipo inválido é recusado no campo', () => {
    assert.throws(
      () => validateDraftContent(draft({ localSeo: { businessType: 'Hacker' } })),
      (error) => error.code === 'INVALID_LOCAL_SEO' && error.field === 'localSeo.businessType'
    );
  });
});

test('Issue #117 — JSON-LD só para vitrines com local_seo', async (t) => {
  const content = draft({ localSeo: { businessType: 'Restaurant', areaServed: 'Centro de São Paulo' }, publicAddress: ADDRESS, businessHours: { week: WEEK } });

  await t.test('free não recebe JSON-LD nem os campos no snapshot', async () => {
    const { menu } = await compile(content, FREE);
    assert.equal(menu.localBusiness, undefined);
    assert.deepEqual(jsonLdBlocks(renderStorefrontHtml(menu)), []);
  });

  await t.test('essencial recebe LocalBusiness válido montado com campos públicos', async () => {
    const { menu } = await compile(content, ESSENCIAL);
    assert.deepEqual(menu.localBusiness, { type: 'Restaurant', areaServed: 'Centro de São Paulo' });
    const [block] = jsonLdBlocks(renderStorefrontHtml(menu));
    const data = JSON.parse(block);
    assert.deepEqual(data, {
      '@context': 'https://schema.org',
      '@type': 'Restaurant',
      '@id': 'https://vitrine.inspira.dev.br/pizza-a#negocio',
      name: 'Pizza A',
      url: 'https://vitrine.inspira.dev.br/pizza-a',
      image: 'https://vitrine.inspira.dev.br/assets/brand/og-vitrine.png',
      description: 'Pizza no forno a lenha, entrega na Consolação.',
      telephone: '+5511987654321',
      address: {
        '@type': 'PostalAddress',
        streetAddress: 'Rua Augusta, 1500, Consolação',
        addressLocality: 'São Paulo',
        addressRegion: 'SP',
        postalCode: '01304-001',
        addressCountry: 'BR'
      },
      areaServed: 'Centro de São Paulo',
      openingHoursSpecification: [
        { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Friday', opens: '18:00', closes: '02:00' },
        { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Saturday', opens: '11:00', closes: '15:00' }
      ]
    });
  });

  await t.test('sem tipo escolhido vale LocalBusiness e a cidade da página por cidade', async () => {
    const { menu } = await compile(draft({ locality: { listed: true, city: 'Porto Alegre', uf: 'RS' } }), ESSENCIAL);
    const data = buildLocalBusinessJsonLd(menu);
    assert.equal(data['@type'], 'LocalBusiness');
    assert.deepEqual(data.address, { '@type': 'PostalAddress', addressLocality: 'Porto Alegre', addressRegion: 'RS', addressCountry: 'BR' });
  });

  await t.test('snapshot não aceita bloco localBusiness forjado', async () => {
    const { menu } = await compile(content, ESSENCIAL);
    const forged = { ...menu, localBusiness: { ...menu.localBusiness, email: 'dono@exemplo.com' } };
    assert.throws(() => assertNoPrivateLeakage(forged), { code: 'PRIVATE_FIELD_LEAKAGE' });
    assert.throws(() => assertNoPrivateLeakage({ ...menu, canonicalUrl: 'http://pizzariadoze.com.br/' }), { code: 'PRIVATE_FIELD_LEAKAGE' });
    assert.throws(() => assertNoPrivateLeakage({ ...menu, canonicalUrl: 'https://vitrine.inspira.dev.br/outra' }), { code: 'PRIVATE_FIELD_LEAKAGE' });
  });
});

test('Issue #117 — nome com </script><script> não quebra o HTML', async () => {
  const name = 'Pizza </script><script>alert(1)</script> & Cia';
  await assert.rejects(compile(draft({ businessName: name }), ESSENCIAL), { status: 422 });
  // Defesa em profundidade: snapshot antigo ou forjado com o nome cru.
  const { menu: safe } = await compile(draft({ localSeo: { areaServed: 'Centro' } }), ESSENCIAL);
  const menu = { ...safe, name };
  const html = renderStorefrontHtml(menu);
  const blocks = jsonLdBlocks(html);
  assert.equal(blocks.length, 1);
  assert.doesNotMatch(blocks[0], /[<>]/);
  assert.equal(JSON.parse(blocks[0]).name, name);
  assert.doesNotMatch(html, /<script>alert/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>/g)].map((match) => match[1]);
  assert.ok(scripts.every((attrs) => /type="application\/ld\+json"/.test(attrs) || /\bsrc="\//.test(attrs)), scripts.join(' | '));
  assert.equal(meta(html, 'og:title'), 'Pizza &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; &amp; Cia — Vitrine');
  assert.equal(serializeJsonLd({ a: '\u2028</script>&' }), '{"a":"\\u2028\\u003c/script\\u003e\\u0026"}');
});

test('Issue #117 — nenhum campo privado no JSON-LD (modo Mila)', async () => {
  const { menu } = await compile(draft({ orderRelay: 'mila', publicAddress: ADDRESS }), ESSENCIAL);
  assertNoPrivateLeakage(menu);
  const data = buildLocalBusinessJsonLd(menu);
  const text = JSON.stringify(data);
  assert.equal(data.telephone, undefined);
  assert.doesNotMatch(text, /11987654321/);
  for (const key of FORBIDDEN_PUBLIC_KEYS) assert.ok(!text.includes(`"${key}"`), key);
  assert.doesNotMatch(text, /essencial|plano|[\w.+-]+@[\w-]+\./i);
});

test('Issue #117 — endereço canônico e cartão de prévia', async (t) => {
  await t.test('canonicalUrlFor: domínio ativo, plano sem domínio e suspensão', () => {
    assert.equal(canonicalUrlFor({ slug: 'pizza-a' }), 'https://vitrine.inspira.dev.br/pizza-a');
    assert.equal(canonicalUrlFor({ slug: 'pizza-a', domains: [ACTIVE_DOMAIN] }), 'https://pizzariadoze.com.br/');
    assert.equal(canonicalUrlFor({ slug: 'pizza-a', domains: [{ ...ACTIVE_DOMAIN, ssl_status: 'pending' }] }), 'https://vitrine.inspira.dev.br/pizza-a');
    assert.equal(canonicalUrlFor({ slug: 'pizza-a', domains: [{ ...ACTIVE_DOMAIN, status: 'verifying' }] }), 'https://vitrine.inspira.dev.br/pizza-a');
    assert.equal(canonicalUrlFor({ slug: 'pizza-a', domains: [ACTIVE_DOMAIN], allowCustomDomain: false }), 'https://vitrine.inspira.dev.br/pizza-a');
    assert.equal(canonicalUrlFor({ slug: 'pizza-a', domains: [{ ...ACTIVE_DOMAIN, hostname: 'x.inspira.dev.br' }] }), 'https://vitrine.inspira.dev.br/pizza-a');
    assert.equal(publicationSeoOptions({ slug: 'pizza-a', entitlements: FREE, domains: [ACTIVE_DOMAIN] }).canonicalUrl, 'https://vitrine.inspira.dev.br/pizza-a');
  });

  await t.test('og:url muda para o domínio próprio quando ele é canônico', async () => {
    const basic = renderStorefrontHtml((await compile(draft(), ESSENCIAL)).menu);
    assert.equal(meta(basic, 'og:url'), 'https://vitrine.inspira.dev.br/pizza-a');
    const { menu } = await compile(draft(), ESSENCIAL, [ACTIVE_DOMAIN]);
    assert.equal(menu.canonicalUrl, 'https://pizzariadoze.com.br/');
    const html = renderStorefrontHtml(menu);
    assert.equal(meta(html, 'og:url'), 'https://pizzariadoze.com.br/');
    assert.match(html, /<link rel="canonical" href="https:\/\/pizzariadoze\.com\.br\/">/);
    assert.equal(JSON.parse(jsonLdBlocks(html)[0]).url, 'https://pizzariadoze.com.br/');
  });

  await t.test('cartão completo: imagem da vitrine, tipo, locale e twitter:card', async () => {
    const photo = 'https://example.supabase.co/storage/v1/object/public/catalog-images/a/pizza.webp';
    const content = draft({ categories: [{ id: 'pizzas', name: 'Pizzas', items: [{ id: 'mussarela', name: 'Mussarela', priceCents: 4500, imageUrl: photo }] }] });
    const html = renderStorefrontHtml((await compile(content, FREE)).menu);
    assert.equal(meta(html, 'og:type'), 'website');
    assert.equal(meta(html, 'og:locale'), 'pt_BR');
    assert.equal(meta(html, 'twitter:card'), 'summary_large_image');
    assert.equal(meta(html, 'og:image'), photo);
    assert.equal(meta(html, 'og:image:width'), undefined, 'a foto do item não tem 1200×630 garantido');
    assert.equal(meta(html, 'description'), 'Pizza no forno a lenha, entrega na Consolação.');
  });

  await t.test('capa (foto do hero) vem antes da foto do item; caminho próprio vira URL absoluta', () => {
    const hero = { moduleCode: 'hero', config: { imageUrl: '/assets/showcase/capa.webp' } };
    const menu = {
      slug: 'pizza-a', name: 'Pizza A',
      structure: { pages: [{ slug: 'home', sections: [hero] }] },
      items: [{ id: 'm', name: 'M', priceCents: 1, imageUrl: 'https://example.com/m.webp' }]
    };
    assert.equal(shareMetaFor(menu).image, 'https://vitrine.inspira.dev.br/assets/showcase/capa.webp');
    const inactive = { ...menu, structure: { pages: [{ slug: 'home', sections: [{ ...hero, active: false }] }] } };
    assert.equal(shareMetaFor(inactive).image, 'https://example.com/m.webp');
    assert.equal(shareMetaFor({ ...menu, structure: undefined, items: [{ imageUrl: 'http://inseguro.com/a.webp' }] }).image,
      'https://vitrine.inspira.dev.br/assets/brand/og-vitrine.png');
  });

  await t.test('metadados por item reaproveitáveis pela página do item', async () => {
    const { menu } = await compile(draft(), FREE);
    const item = { name: 'Mussarela', description: 'Molho de tomate e mussarela.', imageUrl: 'https://example.com/m.webp' };
    const share = shareMetaFor(menu, { item, itemUrl: 'https://vitrine.inspira.dev.br/pizza-a/item/mussarela' });
    assert.equal(share.title, 'Mussarela — Pizza A');
    assert.equal(share.description, 'Molho de tomate e mussarela.');
    assert.equal(share.image, 'https://example.com/m.webp');
    assert.equal(share.url, 'https://vitrine.inspira.dev.br/pizza-a/item/mussarela');
  });

  await t.test('template /loja1 recebe o mesmo bloco de metadados', async () => {
    const template = await readFile(new URL('../web/vitrine/index.html', import.meta.url), 'utf8');
    const { menu } = await compile(draft({ localSeo: { businessType: 'Restaurant' } }), ESSENCIAL, [ACTIVE_DOMAIN]);
    const html = renderStorefrontHtml(menu, template);
    assert.equal(meta(html, 'og:url'), 'https://pizzariadoze.com.br/');
    assert.equal(meta(html, 'og:title'), 'Pizza A — Vitrine');
    assert.equal((html.match(/property="og:url"/g) ?? []).length, 1);
    assert.equal(jsonLdBlocks(html).length, 1);
    assert.ok(html.indexOf('application/ld+json') < html.indexOf('</head>'));
  });
});

test('Issue #117 — fluxo pela API: plano e domínio decididos na publicação; CSP sem unsafe-inline', async () => {
  const store = createMemoryStore();
  const api = createApiHandler({ store });
  const [site] = await store.listSites(OWNER);
  const auth = { authorization: 'Bearer token-owner' };
  const getDraft = await api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/draft`, { headers: auth }));
  const { draft: current } = await getDraft.json();
  const content = { ...current.content, localSeo: { businessType: 'Restaurant', areaServed: 'Bairro Centro' } };
  const saved = await api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/draft`, {
    method: 'PUT', headers: { ...auth, 'content-type': 'application/json' },
    body: JSON.stringify({ revision: current.revision, content })
  }));
  assert.equal(saved.status, 200);
  const publish = () => api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/publish`, { method: 'POST', headers: auth }));
  const page = () => api(new Request(`https://vitrine.inspira.dev.br/${site.slug}`));

  assert.equal((await publish()).status, 200);
  const freePage = await page();
  assert.deepEqual(jsonLdBlocks(await freePage.text()), []);

  store.getSiteEntitlements = async () => ({ plan_code: 'essencial', features: ['custom_domain', 'local_seo'] });
  store.listDomains = async () => [ACTIVE_DOMAIN];
  assert.equal((await publish()).status, 200);
  const paidPage = await page();
  const csp = paidPage.headers.get('content-security-policy');
  const scriptSrc = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('script-src'));
  assert.equal(scriptSrc, "script-src 'self'");
  const html = await paidPage.text();
  const data = JSON.parse(jsonLdBlocks(html)[0]);
  assert.equal(data['@type'], 'Restaurant');
  assert.equal(data.areaServed, 'Bairro Centro');
  assert.equal(meta(html, 'og:url'), 'https://pizzariadoze.com.br/');
  const menu = await (await api(new Request(`https://vitrine.inspira.dev.br/data/vitrines/${site.slug}/menu.json`))).json();
  assert.equal(menu.plan, undefined);
  assert.equal(menu.planCode, undefined);
});

test('Issue #117 — painel: campos "Google e WhatsApp", prévia simulada e ajuda', async () => {
  const html = await readFile(new URL('../web/portal/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('id="editor-seo-group"');
  const group = html.slice(start, html.indexOf('</fieldset>', start));
  assert.ok(start > 0);
  assert.match(group, /<label for="editor-seo-type">Tipo de negócio<\/label>/);
  assert.match(group, /<label for="editor-seo-area">Área atendida \(opcional\)<\/label>/);
  assert.match(group, /id="editor-share-preview"/);
  assert.match(group, /<summary class="seo-help-summary">O que aparece no Google e no WhatsApp<\/summary>/);
  assert.doesNotMatch(group, /catálogo|cardápio/i);
  assert.doesNotMatch(group, /\son[a-z]+=/i);
  const editor = await readFile(new URL('../web/portal/editor.js', import.meta.url), 'utf8');
  assert.match(editor, /mountSeoPanel\(/);
  assert.match(editor, /showSeoServerErrors\(/);
});

test('Issue #117 — reidratar a publicação lida do Supabase preserva SEO local, canônico e hash', async () => {
  const content = draft({ localSeo: { businessType: 'Restaurant', areaServed: 'Centro de São Paulo' }, publicAddress: ADDRESS, businessHours: { week: WEEK } });
  const { publication } = await compile(content, ESSENCIAL, [ACTIVE_DOMAIN]);
  assert.equal(publication.menu.canonicalUrl, 'https://pizzariadoze.com.br/');
  assert.equal(publication.menu.localBusiness.type, 'Restaurant');
  const hydrated = await hydratePublicationRecord({
    slug: 'pizza-a',
    menu: publication.menu,
    revision: publication.revision,
    published_at: publication.publishedAt
  });
  assert.deepEqual(hydrated.menu.localBusiness, publication.menu.localBusiness);
  assert.equal(hydrated.menu.canonicalUrl, publication.menu.canonicalUrl);
  assert.equal(hydrated.hash, publication.hash);
});
