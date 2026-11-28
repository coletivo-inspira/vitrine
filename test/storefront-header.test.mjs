import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePublicStorefront, renderStorefrontHeader, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { createInitialDraftContent } from '../src/portal-validation.mjs';
import { staticStorefrontLimits } from '../src/static-storefronts.mjs';
import {
  SELECTION_OPEN_EVENT,
  formatSelectionLabel,
  setupStorefrontHeader
} from '../web/vitrine/vitrine.js';

const root = fileURLToPath(new URL('../', import.meta.url));

function headerOf(html) {
  const match = html.match(/<header class="storefront-topbar">[\s\S]*?<\/header>/);
  assert.ok(match, 'a página deve ter o cabeçalho da vitrine');
  return match[0];
}

function visibleText(fragment) {
  return fragment.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function compile(draft) {
  const { menu } = await compilePublicStorefront(draft, { slug: draft.slug, name: draft.businessName, template: draft.template }, {
    revision: 1,
    publishedAt: '2026-11-14T00:00:00.000Z'
  });
  return menu;
}

function modularDraft(sections, header = []) {
  const draft = createInitialDraftContent({
    slug: 'atelie-barro',
    name: 'Ateliê Barro Vivo',
    storefrontType: 'art',
    template: 'products-v1',
    catalogType: 'products',
    whatsapp: '5551999998888'
  });
  draft.categories = [{ id: 'pecas', name: 'Peças', items: [{ id: 'vaso', name: 'Vaso torneado', priceCents: 12000, active: true }] }];
  draft.structure = { navigationMenus: { header, footer: [] }, pages: [{ slug: 'home', title: 'Início', sections }] };
  return draft;
}

test('Cabeçalho: mostra o nome do negócio e não mostra o selo "Vitrine /<endereço>"', async () => {
  const loja1 = JSON.parse(await readFile(resolve(root, 'content/vitrines/loja1.json'), 'utf8'));
  const menu = await compile(loja1);
  const template = await readFile(resolve(root, 'web/vitrine/index.html'), 'utf8');
  for (const html of [renderStorefrontHtml(menu, template), renderStorefrontHtml(menu), renderStorefrontHtml(menu, undefined, { interactive: false })]) {
    const header = headerOf(html);
    assert.match(header, new RegExp(`class="storefront-identity-name">${menu.name.replace('&', '&amp;')}<`));
    assert.match(header, /<a class="storefront-identity" href="#vitrine-principal">/);
    assert.doesNotMatch(html, /storefront-slug-pill|storefront-template-tag/);
    assert.doesNotMatch(visibleText(header), /\/loja1/);
    assert.match(header, /<a class="storefront-selection" href="#storefront-catalog" aria-label="Sua seleção">/);
    assert.match(header, /aria-live="polite"/);
    assert.match(header, /class="storefront-menu-toggle"[^>]*aria-expanded="false"[^>]*aria-controls="storefront-header-menu"[^>]*hidden/);
    assert.equal((html.match(/class="theme-toggle"/g) ?? []).length, 1, 'um único controle de tema, dentro do menu');
    assert.doesNotMatch(visibleText(header), /cat[aá]logo|card[aá]pio|\bloja\b|carrinho/i);
  }
});

test('Cabeçalho: até 5 links de navigation.header, Instagram válido e logo com dimensões', async () => {
  const links = ['Peças', 'Sobre', 'Perguntas', 'Prazos', 'Ateliê', 'Contato'].map((label, index) => ({ label, href: `#secao-${index}` }));
  const menu = await compile(modularDraft([{ id: 'itens', moduleCode: 'catalog_grid', config: {} }], links));
  const header = headerOf(renderStorefrontHtml(menu));
  assert.equal((header.match(/<li><a href="#secao-/g) ?? []).length, 5);
  assert.doesNotMatch(header, /Contato/);
  assert.doesNotMatch(header, /Instagram/);

  const withChannels = renderStorefrontHeader(
    { ...menu, instagramUrl: 'https://www.instagram.com/atelie.barro', logoUrl: 'https://vitrine.inspira.dev.br/assets/pizza-demo.webp' },
    { navigation: { header: [] }, pages: [{ slug: 'home', sections: [{ moduleCode: 'catalog_grid' }] }] }
  );
  assert.match(withChannels, /href="https:\/\/www\.instagram\.com\/atelie\.barro" target="_blank" rel="noopener noreferrer" aria-label="Instagram de Ateliê Barro Vivo">Instagram</);
  assert.match(withChannels, /<img class="storefront-identity-logo" src="https:\/\/vitrine\.inspira\.dev\.br\/assets\/pizza-demo\.webp" width="160" height="40" alt="Ateliê Barro Vivo">/);
  assert.doesNotMatch(withChannels, /storefront-identity-name/);

  for (const instagramUrl of ['http://instagram.com/x', 'https://instagram.com.golpe.example/x', 'javascript:alert(1)']) {
    assert.doesNotMatch(renderStorefrontHeader({ ...menu, instagramUrl }), /Instagram/);
  }
  assert.doesNotMatch(renderStorefrontHeader({ ...menu, logoUrl: 'javascript:alert(1)' }), /<img/);
});

test('Cabeçalho: logo do tema (structure.themeOverrides.logoUrl) é publicada e aceita só WebP', async () => {
  const draft = modularDraft([{ id: 'itens', moduleCode: 'catalog_grid', config: {} }]);
  draft.structure.themeOverrides = { logoUrl: '/assets/forno-de-minas-logo.webp' };
  const menu = await compile(draft);
  assert.equal(menu.structure.theme.logoUrl, '/assets/forno-de-minas-logo.webp');
  assert.match(headerOf(renderStorefrontHtml(menu)), /<img class="storefront-identity-logo" src="\/assets\/forno-de-minas-logo\.webp"[^>]*alt="Ateliê Barro Vivo">/);

  for (const logoUrl of ['javascript:alert(1)', '/assets/logo.png', 'http://exemplo.com/logo.webp']) {
    draft.structure.themeOverrides = { logoUrl };
    await assert.rejects(compile(draft), { status: 422 }, logoUrl);
  }
});

test('Vitrine da Pizzaria Forno de Minas: 25 sabores, logo e mensagem de pizzaria no build', async () => {
  const draft = JSON.parse(await readFile(resolve(root, 'content/vitrines/forno-de-minas.json'), 'utf8'));
  const { menu } = await compilePublicStorefront(draft, { slug: draft.slug, name: draft.businessName, template: draft.template }, {
    revision: 1,
    publishedAt: '2026-11-28T05:00:00.000Z',
    ...staticStorefrontLimits(draft.slug)
  });
  const pizzas = menu.categories.filter((category) => category.id.startsWith('pizzas-')).flatMap((category) => category.items);
  assert.equal(pizzas.length, 25);
  assert.equal(menu.structure.theme.logoUrl, '/assets/forno-de-minas-logo.webp');
  assert.match(menu.messages.whatsappTemplate, /\{endereco\}/);
  assert.ok((await readFile(resolve(root, 'web/assets/forno-de-minas-logo.webp'))).byteLength < 40 * 1024);
});

test('Cabeçalho: vitrine sem bloco de itens não mostra "Sua seleção"', async () => {
  const menu = await compile(modularDraft([
    { id: 'abertura', moduleCode: 'hero', config: { headline: 'Ateliê Barro Vivo' } },
    { id: 'sobre', moduleCode: 'about_story', config: { bio: 'Cerâmica desde 2010.' } }
  ]));
  const header = headerOf(renderStorefrontHtml(menu));
  assert.doesNotMatch(header, /storefront-selection/);
  assert.match(header, /storefront-menu-toggle/);
});

class FakeElement {
  constructor(name, doc) {
    this.name = name;
    this.doc = doc;
    this.attributes = new Map();
    this.listeners = new Map();
    this.children = [];
    this.parent = null;
    this.hidden = false;
    this.textContent = '';
  }
  append(...nodes) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
    return this;
  }
  setAttribute(key, value) { this.attributes.set(key, String(value)); }
  getAttribute(key) { return this.attributes.has(key) ? this.attributes.get(key) : null; }
  hasAttribute(key) { return this.attributes.has(key); }
  toggleAttribute(key, force) {
    if (force) this.attributes.set(key, ''); else this.attributes.delete(key);
    return Boolean(force);
  }
  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(handler);
  }
  dispatch(type, extra = {}) {
    let prevented = false;
    const event = { type, target: this, preventDefault: () => { prevented = true; }, ...extra };
    for (let node = this; node; node = node.parent) {
      for (const handler of node.listeners.get(type) ?? []) handler(event);
    }
    for (const handler of this.doc.listeners.get(type) ?? []) handler(event);
    return !prevented;
  }
  contains(node) {
    for (let current = node; current; current = current.parent) if (current === this) return true;
    return false;
  }
  closest(selector) {
    for (let node = this; node; node = node.parent) if (node.name === selector) return node;
    return null;
  }
  focus() { this.doc.activeElement = this; }
  querySelector(selector) {
    for (const child of this.children) {
      if (child.name === selector) return child;
      const found = child.querySelector(selector);
      if (found) return found;
    }
    return null;
  }
}

function createHeaderDom() {
  const doc = { listeners: new Map(), activeElement: null, dispatched: [] };
  const el = (name) => new FakeElement(name, doc);
  const header = el('.storefront-topbar');
  const panel = el('.storefront-header-menu');
  const link = el('a');
  const selection = el('.storefront-selection');
  const counter = el('.storefront-selection-count');
  const status = el('.storefront-selection-status');
  const toggle = el('.storefront-menu-toggle');
  const outside = el('main');
  counter.hidden = true;
  toggle.hidden = true;
  selection.append(counter);
  panel.append(link);
  header.append(panel, selection, status, toggle);
  doc.querySelector = (selector) => (selector === '.storefront-topbar' ? header : null);
  doc.addEventListener = (type, handler) => {
    if (!doc.listeners.has(type)) doc.listeners.set(type, []);
    doc.listeners.get(type).push(handler);
  };
  doc.dispatchEvent = (event) => {
    doc.dispatched.push(event);
    for (const handler of doc.listeners.get(event.type) ?? []) handler(event);
    return !event.defaultPrevented;
  };
  doc.key = (key) => { for (const handler of doc.listeners.get('keydown') ?? []) handler({ key }); };
  return { doc, header, panel, link, selection, counter, status, toggle, outside };
}

class FakeCustomEvent {
  constructor(type, init = {}) {
    this.type = type;
    this.detail = init.detail;
    this.cancelable = Boolean(init.cancelable);
    this.defaultPrevented = false;
  }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
}

test('Cabeçalho: contador de "Sua seleção" e nome acessível dinâmico', () => {
  const dom = createHeaderDom();
  const header = setupStorefrontHeader(dom.doc, { CustomEvent: FakeCustomEvent });
  assert.equal(formatSelectionLabel(0), 'Sua seleção');
  assert.equal(formatSelectionLabel(2), 'Sua seleção, 2 itens');

  header.setCount(0);
  assert.equal(dom.status.textContent, '', 'sem anúncio no carregamento');
  header.setCount(1);
  assert.equal(dom.selection.getAttribute('aria-label'), 'Sua seleção, 1 item');
  assert.equal(dom.counter.hidden, false);
  assert.equal(dom.counter.textContent, '1');
  assert.equal(dom.status.textContent, 'Sua seleção, 1 item.');
  header.setCount(2);
  assert.equal(dom.selection.getAttribute('aria-label'), 'Sua seleção, 2 itens');
  header.setCount(0);
  assert.equal(dom.selection.getAttribute('aria-label'), 'Sua seleção');
  assert.equal(dom.counter.hidden, true);
  assert.equal(dom.status.textContent, 'Sua seleção está vazia.');
});

test('Cabeçalho: "Sua seleção" segue para as etapas, salvo quando uma gaveta assume', () => {
  const dom = createHeaderDom();
  setupStorefrontHeader(dom.doc, { CustomEvent: FakeCustomEvent });
  assert.equal(dom.selection.dispatch('click'), true, 'sem ouvinte, o link âncora segue normalmente');
  assert.equal(dom.doc.dispatched.at(-1).type, SELECTION_OPEN_EVENT);

  dom.doc.addEventListener(SELECTION_OPEN_EVENT, (event) => event.preventDefault());
  assert.equal(dom.selection.dispatch('click'), false, 'a gaveta cancela a navegação do link');
});

test('Cabeçalho: menu do celular abre e fecha por botão, Esc, link e clique fora', () => {
  const dom = createHeaderDom();
  const header = setupStorefrontHeader(dom.doc, { CustomEvent: FakeCustomEvent });
  assert.equal(dom.toggle.hidden, false);
  assert.equal(dom.header.hasAttribute('data-menu-ready'), true);

  dom.toggle.dispatch('click');
  assert.equal(header.isMenuOpen(), true);
  assert.equal(dom.toggle.getAttribute('aria-expanded'), 'true');
  assert.equal(dom.toggle.getAttribute('aria-label'), 'Fechar menu');
  assert.equal(dom.header.hasAttribute('data-menu-open'), true);

  dom.doc.key('Escape');
  assert.equal(header.isMenuOpen(), false);
  assert.equal(dom.toggle.getAttribute('aria-expanded'), 'false');
  assert.equal(dom.toggle.getAttribute('aria-label'), 'Abrir menu');
  assert.equal(dom.doc.activeElement, dom.toggle, 'o foco volta ao botão do menu');

  dom.toggle.dispatch('click');
  dom.toggle.dispatch('click');
  assert.equal(header.isMenuOpen(), false, 'o mesmo botão fecha o menu');

  dom.toggle.dispatch('click');
  dom.link.dispatch('click');
  assert.equal(header.isMenuOpen(), false, 'escolher um link fecha o menu');

  dom.toggle.dispatch('click');
  dom.outside.dispatch('click');
  assert.equal(header.isMenuOpen(), false, 'clicar fora fecha o menu');
});
