import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeEntitlements } from '../src/entitlements.mjs';
import { assertNoPrivateLeakage, compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { getDefaultMessages } from '../src/portal-validation.mjs';
import {
  DEFAULT_WELCOME_TEXTS,
  PRIVACY_URL,
  PROMO_SITE_URL,
  SUPPORT_BADGE_LABEL,
  publicationFooterOptions,
  renderStorefrontFooterHtml,
  summarizeWeek
} from '../src/storefront-footer.mjs';
import { MILA_WHATSAPP, buildMilaRelayCode } from '../web/assets/mila-relay.mjs';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const OWNER = '10000000-0000-0000-0000-000000000001';
const OWNER_PHONE = '5567999887766';
const FREE = normalizeEntitlements({ plan_code: 'free' });
const ESSENCIAL = normalizeEntitlements({ plan_code: 'essencial' });
const WEEK = {
  mon: [{ opens: '18:00', closes: '23:00' }],
  tue: [{ opens: '18:00', closes: '23:00' }],
  wed: [{ opens: '18:00', closes: '23:00' }],
  thu: [{ opens: '18:00', closes: '23:00' }],
  fri: [{ opens: '18:00', closes: '23:00' }],
  sat: [{ opens: '11:00', closes: '15:00' }, { opens: '18:00', closes: '23:00' }]
};
const ADDRESS = { street: 'Rua 14 de Julho, 1200', district: 'Centro', city: 'Campo Grande', uf: 'MS' };

function draft(extra = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    catalogType: 'products',
    slug: 'casa-guavira',
    businessName: 'Casa Guavira',
    whatsapp: OWNER_PHONE,
    messages: { welcomeText: 'Pizza de fermentação natural no Centro.' },
    categories: [{ id: 'pizzas', name: 'Pizzas', items: [{ id: 'mussarela', name: 'Mussarela', priceCents: 4500 }] }],
    ...extra
  };
}

const compile = async (content, entitlements = FREE) => (await compilePublicStorefront(content, { slug: 'casa-guavira' }, {
  ...publicationFooterOptions({ entitlements })
})).menu;

function footerOf(html) {
  const match = html.match(/<footer class="storefront-footer"[\s\S]*?<\/footer>/);
  assert.ok(match, 'a página deve ter o rodapé da vitrine');
  return match[0];
}

function visibleText(fragment) {
  return fragment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

test('Rodapé: WhatsApp, Instagram e horário preenchidos aparecem juntos', async () => {
  const menu = await compile(draft({ businessHours: { week: WEEK }, publicAddress: ADDRESS }));
  const footer = renderStorefrontFooterHtml({ ...menu, instagramUrl: 'https://www.instagram.com/casaguavira', publicEmail: 'oi@casaguavira.com.br' });
  const text = visibleText(footer);
  assert.match(footer, /<h2 id="storefront-footer-name" class="storefront-footer-name">Casa Guavira<\/h2>/);
  assert.match(text, /Pizza de fermentação natural no Centro\./);
  assert.match(footer, new RegExp(`class="storefront-footer-whatsapp" href="https://wa\\.me/${OWNER_PHONE}\\?text=[^"]+"[^>]*>Conversar no WhatsApp<`));
  assert.match(text, /Horário Seg a sex: 18h às 23h Sáb: 11h às 15h e 18h às 23h/);
  assert.match(text, /Cidade Campo Grande – MS/);
  assert.match(footer, /href="https:\/\/www\.instagram\.com\/casaguavira"[^>]*rel="noopener noreferrer"[^>]*aria-label="Instagram de Casa Guavira \(abre em nova aba\)"/);
  assert.match(footer, /href="mailto:oi@casaguavira\.com\.br" aria-label="E-mail de Casa Guavira: oi@casaguavira\.com\.br"/);
});

test('Rodapé: campos vazios não deixam rótulos soltos', async () => {
  const menu = await compile(draft({ messages: {} }));
  const footer = footerOf(renderStorefrontHtml(menu));
  for (const loose of ['storefront-footer-facts', 'storefront-footer-channels', 'storefront-footer-tagline', '<dt>', 'Instagram', 'mailto:']) {
    assert.ok(!footer.includes(loose), `não deveria ter ${loose}`);
  }
  assert.ok(!footer.includes('storefront-footer-links'), 'sem links de rodapé, sem coluna vazia');
  assert.match(footer, /storefront-footer-grid is-single/);
  const unsafe = renderStorefrontFooterHtml({ ...menu, instagramUrl: 'javascript:alert(1)', publicEmail: 'sem-arroba' });
  assert.doesNotMatch(unsafe, /Instagram|mailto:|javascript:/);
  const long = renderStorefrontFooterHtml({ ...menu, messages: { welcomeText: 'x'.repeat(161) } });
  assert.doesNotMatch(long, /storefront-footer-tagline/);
});

test('Rodapé: textos padrão de boas-vindas não viram frase do negócio', () => {
  const defaults = new Set(['products', 'booking', 'quote'].flatMap((type) =>
    ['pizzeria-v1', 'products-v1'].map((template) => getDefaultMessages(type, 'X', template).welcomeText)));
  assert.deepEqual([...defaults].sort(), [...DEFAULT_WELCOME_TEXTS].sort());
});

test('Rodapé: links de navigation.footer e página por cidade na segunda coluna', async () => {
  const menu = await compile(draft({
    locality: { listed: true, city: 'Campo Grande', uf: 'MS' },
    categories: [{ id: 'bazar', name: 'Bazar', items: [{ id: 'cadeira', name: 'Cadeira', priceCents: 0, priceMode: 'donation' }] }],
    structure: {
      navigationMenus: { header: [], footer: [{ label: 'Perguntas frequentes', href: '#faq' }] },
      pages: [{ slug: 'home', title: 'Início', sections: [{ id: 'catalogo', moduleCode: 'catalog_grid', config: {} }] }]
    }
  }));
  const footer = footerOf(renderStorefrontHtml(menu));
  assert.match(footer, /<nav class="storefront-footer-links" aria-label="Links do rodapé"><ul><li><a href="#faq">Perguntas frequentes<\/a><\/li><\/ul>/);
  assert.match(footer, /class="storefront-city-link" href="\/por-cidade\/campo-grande-ms"/);
  assert.match(visibleText(footer), /Cidade Campo Grande – MS/);
});

test('Rodapé: "Privacidade" leva a /privacidade/ e o crédito ao site de divulgação', async () => {
  const menu = await compile(draft());
  const template = await readFile(resolve(root, 'web/vitrine/index.html'), 'utf8');
  for (const html of [renderStorefrontHtml(menu), renderStorefrontHtml(menu, template), renderStorefrontHtml(menu, undefined, { interactive: false })]) {
    const footer = footerOf(html);
    assert.equal(html.match(/<footer\b/g).length, 1);
    assert.match(footer, new RegExp(`<a href="${PRIVACY_URL}">Privacidade</a>`));
    assert.ok(PRIVACY_URL.endsWith('/privacidade/'));
    assert.match(footer, new RegExp(`class="storefront-footer-credit" href="${PROMO_SITE_URL}"[^>]*aria-label="Vitrine feita com Vitrine Inspira`));
    assert.match(visibleText(footer), /Vitrine feita com/);
    assert.match(footer, /Preços em Reais \(BRL\)/);
    assert.match(footer, /sem cookies de rastreamento nem coleta de endereço IP ou dados pessoais/);
    assert.doesNotMatch(visibleText(footer), /\/casa-guavira|Vitrine \//);
  }
  const staticFooter = footerOf(template);
  assert.match(staticFooter, /<a href="\/privacidade\/">Privacidade<\/a>/);
});

test('Rodapé: modo Mila usa o número da Mila e o código, sem o número do dono no HTML', async () => {
  const menu = await compile(draft({ orderRelay: 'mila', businessHours: { week: WEEK } }));
  const html = renderStorefrontHtml(menu);
  const footer = footerOf(html);
  const href = footer.match(/class="storefront-footer-whatsapp" href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  assert.ok(href.startsWith(`https://wa.me/${MILA_WHATSAPP}?text=`));
  assert.match(decodeURIComponent(href.split('text=')[1]), new RegExp(`^#${buildMilaRelayCode('casa-guavira')} · Pedido para Casa Guavira`));
  assert.match(footer, />Conversar pela Mila no WhatsApp</);
  assert.match(footer, /chegam à Mila/);
  assert.ok(!html.includes(OWNER_PHONE), 'o número do dono não pode aparecer no HTML');
});

test('Rodapé: plano Gratuito mostra o selo de apoio; plano pago o dispensa', async () => {
  const free = await compile(draft(), FREE);
  assert.equal('supportBadge' in free, false);
  assert.match(footerOf(renderStorefrontHtml(free)), new RegExp(`class="storefront-support-badge"[^>]*>${SUPPORT_BADGE_LABEL}<`));

  const paid = await compile(draft(), ESSENCIAL);
  assert.equal(paid.supportBadge, false);
  assert.doesNotMatch(renderStorefrontHtml(paid), /storefront-support-badge|Apoio Coletivo Me Inspira/);

  assert.deepEqual(publicationFooterOptions({}), { supportBadge: true });
  assert.throws(() => assertNoPrivateLeakage({ ...free, supportBadge: true }), /supportBadge/);
});

test('Rodapé: horário resumido agrupa dias iguais e omite os fechados', () => {
  assert.deepEqual(summarizeWeek({ week: WEEK }), ['Seg a sex: 18h às 23h', 'Sáb: 11h às 15h e 18h às 23h']);
  assert.deepEqual(summarizeWeek({ week: { sat: [{ opens: '09:00', closes: '13:00' }], sun: [{ opens: '09:00', closes: '13:00' }] } }), ['Sáb e dom: 9h às 13h']);
  assert.deepEqual(summarizeWeek(undefined), []);
});

test('Rodapé: a publicação pela API decide o selo pelo plano, sem gravar o plano no snapshot', async () => {
  const store = createMemoryStore();
  const api = createApiHandler({ store });
  const [site] = await store.listSites(OWNER);
  const auth = { authorization: 'Bearer token-owner' };
  const publish = () => api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/publish`, { method: 'POST', headers: auth }));
  const page = async () => (await api(new Request(`https://vitrine.inspira.dev.br/${site.slug}`))).text();
  const menuJson = async () => (await api(new Request(`https://vitrine.inspira.dev.br/data/vitrines/${site.slug}/menu.json`))).json();

  assert.equal((await publish()).status, 200);
  assert.match(footerOf(await page()), /storefront-support-badge/);
  assert.equal((await menuJson()).supportBadge, undefined);

  store.getSiteEntitlements = async () => ({ plan_code: 'essencial', features: ['support_badge_optional'] });
  assert.equal((await publish()).status, 200);
  assert.doesNotMatch(await page(), /storefront-support-badge/);
  const paidMenu = await menuJson();
  assert.equal(paidMenu.supportBadge, false);
  assert.equal(paidMenu.plan, undefined);
  assert.equal(paidMenu.planCode, undefined);
});
