import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateLegacyDraftContent } from '../src/portal-validation.mjs';
import { compilePublicStorefront } from '../src/publication-engine.mjs';
import {
  StorefrontRenderer,
  interpolateWhatsappTemplate
} from '../src/storefront-renderer.mjs';
import { bootStorefront } from '../web/vitrine/vitrine.js';

const root = fileURLToPath(new URL('../', import.meta.url));

function createDomMock() {
  const created = [];
  const byId = new Map();

  function makeEl(tag = 'div') {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: '',
      id: '',
      textContent: '',
      hidden: false,
      value: '',
      href: '',
      disabled: false,
      children: [],
      attributes: {},
      dataset: {},
      listeners: {},
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      replaceChildren(...nodes) {
        this.children = nodes.flat();
      },
      setAttribute(key, val) {
        this.attributes[key] = String(val);
        if (key === 'id') {
          this.id = String(val);
          byId.set(this.id, this);
        }
        if (key === 'data-item-id') {
          this.dataset.itemId = String(val);
        }
      },
      addEventListener(event, handler) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
      }
    };
    created.push(el);
    return el;
  }

  const ids = [
    'storefront-status',
    'storefront-name',
    'storefront-page-title',
    'storefront-slug-pill',
    'storefront-subtitle',
    'category-nav',
    'storefront-catalog'
  ];
  for (const id of ids) {
    const el = makeEl(id === 'storefront-page-title' ? 'title' : 'div');
    el.id = id;
    byId.set(id, el);
  }

  const hero = makeEl('section');
  hero.className = 'storefront-hero';
  const templateTag = makeEl('span');
  templateTag.className = 'storefront-template-tag';

  const documentMock = {
    createElement: (tag) => makeEl(tag),
    getElementById: (id) => byId.get(id) || null,
    querySelector: (selector) => {
      if (selector === '.storefront-hero') return hero;
      if (selector === '.storefront-template-tag') return templateTag;
      return null;
    }
  };

  return { documentMock, created, byId, hero };
}

test('storefront-staged-flow - interpola variáveis do WhatsApp', () => {
  const template =
    'Olá! Meu nome é {nome}. Gostaria de:\n{itens}\nTotal: {total}\nEntrega/Retirada: {endereco}';
  const result = interpolateWhatsappTemplate(template, {
    nome: 'Carlos',
    itens: '- 2x Picanha (R$ 178,00)',
    total: 'R$ 178,00',
    endereco: 'Rua das Flores, 123'
  });
  assert.match(result, /Carlos/);
  assert.match(result, /178,00/);
  assert.match(result, /Flores/);
});

test('storefront-staged-flow - migra pizzeria-v1 sem perder itens', () => {
  const legacyDraft = {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    whatsapp: '5511999999999',
    businessName: 'Pizzaria Bella',
    categories: [
      {
        name: 'Tradicionais',
        items: [
          { id: '1', name: 'Margherita', description: 'Molho e muçarela', priceCents: 4500, active: true }
        ]
      }
    ]
  };

  const migrated = migrateLegacyDraftContent(legacyDraft);
  assert.equal(migrated.template, 'pizzeria-v1');
  assert.equal(migrated.catalogType, 'products');
  assert.equal(migrated.storefrontType, 'food');
  assert.equal(migrated.businessName, 'Pizzaria Bella');
  assert.equal(migrated.components.photo, false);
  assert.equal(migrated.components.price, true);
  assert.equal(migrated.components.quantitySelector, true);
  assert.equal(migrated.orderFields.deliveryOrPickup, true);
  assert.equal(migrated.orderFields.customerName, true);
  assert.equal(migrated.messages.heroTitle, 'Pizzaria Bella');
  assert.ok(migrated.messages.welcomeText);
  assert.equal(migrated.categories[0].items[0].priceCents, 4500);
});

test('storefront-staged-flow - a página pública renderiza os itens do menu compilado', async () => {
  const loja1Source = JSON.parse(
    await readFile(resolve(root, 'content/vitrines/loja1.json'), 'utf8')
  );
  const compiled = await compilePublicStorefront(
    loja1Source,
    {
      slug: loja1Source.slug,
      name: loja1Source.businessName,
      template: loja1Source.template
    },
    { revision: 1, publishedAt: '2026-11-11T00:00:00.000Z' }
  );
  const menu = JSON.parse(compiled.json);
  assert.ok(menu.items.length >= 6);
  assert.ok(menu.categories.length >= 3);

  const { documentMock, created, byId, hero } = createDomMock();
  const previousDocument = globalThis.document;
  globalThis.document = documentMock;
  let renderer;
  try {
  renderer = await bootStorefront({
    document: documentMock,
    slug: 'loja1',
    fetch: async (url) => {
      assert.match(String(url), /\/data\/vitrines\/loja1\/menu\.json$/);
      return {
        ok: true,
        json: async () => menu
      };
    }
  });

  assert.ok(renderer, 'bootStorefront deve devolver o renderizador compartilhado');
  assert.equal(byId.get('storefront-status').hidden, true);
  assert.equal(byId.get('storefront-name').textContent, menu.messages.heroTitle);
  assert.equal(byId.get('storefront-slug-pill').textContent, '/loja1');
  assert.equal(hero.hidden, false);

  const catalog = byId.get('storefront-catalog');
  assert.ok(catalog.children.length > 0);

  const renderedText = created.map((el) => el.textContent).join('\n');
  for (const item of menu.items) {
    assert.ok(
      renderedText.includes(item.name),
      `A vitrine pública deve renderizar o item "${item.name}" do menu compilado`
    );
  }
  assert.doesNotMatch(renderedText, /Não foi possível carregar o cardápio/);
  assert.doesNotMatch(renderedText, /Pizza Sazonal de Inverno/);

  const rendererDirect = new StorefrontRenderer(catalog, menu, { isPublicPage: true });
  assert.equal(rendererDirect.getCartCount(), 0);
  } finally {
    if (previousDocument === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previousDocument;
    }
  }
});
