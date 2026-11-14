import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compilePublicStorefront } from '../src/publication-engine.mjs';
import { createInitialDraftContent } from '../src/portal-validation.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import {
  SELECTION_STORAGE_PREFIX,
  createSelectionDrawer,
  createSelectionStore,
  formatDiscardNotice
} from '../web/assets/selection-drawer.mjs';
import { SELECTION_OPEN_EVENT, bootStorefront } from '../web/vitrine/vitrine.js';

const root = fileURLToPath(new URL('../', import.meta.url));

// DOM mínimo, sem dependências: seletores ".classe" e "[atributo]", eventos e <dialog>.
class Node {
  constructor(tag, doc) {
    this.tagName = String(tag).toUpperCase();
    this.ownerDocument = doc;
    this.childNodes = [];
    this.parentNode = null;
    this.attributes = {};
    this.dataset = {};
    this.listeners = {};
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this._text = '';
    this.classList = {
      add: (...t) => { this.className = [...new Set([...this.className.split(/\s+/), ...t])].filter(Boolean).join(' '); },
      remove: (...t) => { this.className = this.className.split(/\s+/).filter((c) => c && !t.includes(c)).join(' '); },
      contains: (t) => this.className.split(/\s+/).includes(t),
      toggle: (t, force) => { const on = force ?? !this.classList.contains(t); if (on) this.classList.add(t); else this.classList.remove(t); return on; }
    };
  }
  get id() { return this.attributes.id ?? ''; }
  set id(value) { this.attributes.id = String(value); }
  get textContent() { return this._text + this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(value) { this.childNodes = []; this._text = value == null ? '' : String(value); }
  appendChild(child) { child.parentNode?.removeChild(child); child.parentNode = this; this.childNodes.push(child); return child; }
  append(...nodes) { for (const n of nodes) this.appendChild(n); }
  removeChild(child) { this.childNodes = this.childNodes.filter((n) => n !== child); child.parentNode = null; }
  replaceChildren(...nodes) { for (const n of this.childNodes) n.parentNode = null; this.childNodes = []; this._text = ''; this.append(...nodes.flat()); }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return k in this.attributes ? this.attributes[k] : null; }
  hasAttribute(k) { return k in this.attributes; }
  removeAttribute(k) { delete this.attributes[k]; }
  toggleAttribute(k, force) { const on = force ?? !this.hasAttribute(k); if (on) this.setAttribute(k, ''); else this.removeAttribute(k); return on; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  dispatch(type, init = {}) {
    const event = { type, target: this, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...init };
    for (let n = this; n; n = n.parentNode) for (const fn of n.listeners[type] ?? []) fn(event);
    return event;
  }
  click() { if (!this.disabled) this.dispatch('click'); }
  focus() { this.ownerDocument.activeElement = this; }
  contains(node) { for (let n = node; n; n = n.parentNode) if (n === this) return true; return false; }
  matches(selector) {
    return selector.split(',').some((part) => {
      const s = part.trim();
      if (s.startsWith('.')) return this.classList.contains(s.slice(1));
      const attr = s.match(/^\[([a-z-]+)\]$/);
      if (attr) return attr[1].startsWith('data-') ? attr[1].slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase()) in this.dataset : this.hasAttribute(attr[1]);
      return false;
    });
  }
  closest(selector) { for (let n = this; n && n.matches; n = n.parentNode) if (n.matches(selector)) return n; return null; }
  querySelectorAll(selector) {
    const found = [];
    const walk = (n) => { for (const c of n.childNodes) { if (c.matches?.(selector)) found.push(c); walk(c); } };
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  showModal() { this.open = true; }
  close() { if (this.open) { this.open = false; this.dispatch('close'); } }
}

function createDocument() {
  const doc = {
    activeElement: null,
    listeners: {},
    createElement: (tag) => new Node(tag, doc),
    createElementNS: (_ns, tag) => new Node(tag, doc),
    addEventListener(type, fn) { (doc.listeners[type] ??= []).push(fn); },
    dispatchEvent(event) { for (const fn of doc.listeners[event.type] ?? []) fn(event); return !event.defaultPrevented; },
    querySelector: (selector) => doc.body.querySelector(selector),
    getElementById: (id) => doc.body.querySelectorAll('[id]').find((n) => n.id === id) ?? null
  };
  doc.body = new Node('body', doc);
  return doc;
}

function createStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (k) => (data.has(k) ? data.get(k) : null),
    setItem: (k, v) => data.set(k, String(v)),
    removeItem: (k) => data.delete(k)
  };
}

async function withDocument(doc, fn) {
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
}

async function compile(draft) {
  const { menu } = await compilePublicStorefront(draft, { slug: draft.slug, name: draft.businessName, template: draft.template }, {
    revision: 1,
    publishedAt: '2026-11-14T00:00:00.000Z'
  });
  return menu;
}

async function pizzeriaMenu() {
  return compile(JSON.parse(await readFile(resolve(root, 'content/vitrines/loja1.json'), 'utf8')));
}

async function quoteMenu() {
  const draft = createInitialDraftContent({
    slug: 'atelie-orcamento', name: 'Ateliê Orçamento', storefrontType: 'art', template: 'quote-v1', catalogType: 'quote', whatsapp: '5551999998888'
  });
  draft.categories = [{ id: 'encomendas', name: 'Peças sob encomenda', items: [
    { id: 'escultura', name: 'Escultura em cerâmica', priceCents: 0, active: true },
    { id: 'vaso', name: 'Vaso torneado', priceCents: 0, active: true }
  ] }];
  return compile(draft);
}

async function mixedMenu() {
  return compile({
    schemaVersion: 1, template: 'products-v1', catalogType: 'products', storefrontType: 'art',
    slug: 'bazar-arte', businessName: 'Bazar & Arte', whatsapp: '5511999999999',
    categories: [{ id: 'geral', name: 'Geral', items: [
      { id: 'quadro', name: 'Quadro Aquarela', priceMode: 'fixed', priceCents: 12000, active: true },
      { id: 'vaso', name: 'Vaso Raro', priceMode: 'offer', priceCents: 5000, active: true },
      { id: 'mudas', name: 'Mudas de Suculenta', priceMode: 'donation', priceCents: 0, active: true },
      { id: 'vinis', name: 'Coleção de Vinis', priceMode: 'trade', priceCents: 0, active: true }
    ] }]
  });
}

function textsOf(node) {
  const texts = [];
  const walk = (n) => {
    if (n._text) texts.push(n._text);
    for (const key of ['aria-label', 'alt', 'title', 'placeholder']) if (n.attributes?.[key]) texts.push(n.attributes[key]);
    for (const c of n.childNodes) walk(c);
  };
  walk(node);
  return texts.join(' ');
}

const FORBIDDEN = /\b(carrinho|checkout|finalizar compra|cat[aá]logo|card[aá]pio|Cart|Close|Shop|Search|Continue|Remove)\b/i;

test('Seleção: gaveta e barra usam o mesmo resumo; total ignora lances, doações e trocas', async () => {
  const menu = await mixedMenu();
  await withDocument(createDocument(), () => {
    const renderer = new StorefrontRenderer(document.createElement('div'), menu, { isPublicPage: true });
    renderer.setQuantity(menu.items[0], 1);
    renderer.setQuantity(menu.items[0], 1);
    assert.equal(renderer.submitOffer(menu.items[1], 'R$ 80,00'), true);
    renderer.toggleSingleSelect(menu.items[2]);
    assert.equal(renderer.submitTrade(menu.items[3], 'Dois livros'), true);
    const summary = renderer.getSelectionSummary();
    assert.equal(summary.countText, '5 itens selecionados');
    assert.equal(summary.totalText, 'R$ 240,00 (sem os lances)');
    const bar = renderer.container.querySelector('.storefront-cart-bar');
    assert.match(bar.textContent, /5 itens selecionados/);
    assert.match(bar.textContent, /R\$ 240,00 \(sem os lances\)/);

    assert.deepEqual(renderer.getPersistableSelection(), { quadro: 2, mudas: 1 }, 'lance e troca têm valor digitado e ficam só na memória');
  });
});

test('Seleção: restaurar descarta itens que saíram da publicação ou mudaram de modalidade', async () => {
  const menu = await mixedMenu();
  await withDocument(createDocument(), () => {
    const renderer = new StorefrontRenderer(document.createElement('div'), menu, { isPublicPage: true });
    const result = renderer.restoreSelection({ quadro: 3, mudas: 4, vaso: 1, 'item-que-saiu': 2, vinis: 'x' });
    assert.deepEqual(result, { restored: 2, discarded: 3 });
    assert.deepEqual([...renderer.cart.entries()], [['quadro', 3], ['mudas', 1]]);
    assert.deepEqual(renderer.restoreSelection(null), { restored: 0, discarded: 0 });
    assert.deepEqual(renderer.restoreSelection(['quadro']), { restored: 0, discarded: 0 });
  });
  assert.equal(formatDiscardNotice(0), '');
  assert.equal(formatDiscardNotice(1), '1 item da sua seleção saiu da vitrine e foi removido.');
  assert.equal(formatDiscardNotice(2), '2 itens da sua seleção saíram da vitrine e foram removidos.');
});

test('Seleção: sessionStorage guarda só identificadores, quantidades e a versão da publicação', async () => {
  const menu = await pizzeriaMenu();
  const storage = createStorage();
  await withDocument(createDocument(), () => {
    const renderer = new StorefrontRenderer(document.createElement('div'), menu, { isPublicPage: true });
    const store = createSelectionStore({ slug: 'loja1', storage, version: '"abc123"' });
    renderer.setQuantity(menu.items[0], 1);
    renderer.setQuantity(menu.items[1], 1);
    renderer.setQuantity(menu.items[1], 1);
    renderer.customerDetails.customerName = 'Mariana Costa';
    renderer.customerDetails.address = 'Rua das Flores, 123';
    renderer.customerDetails.notes = 'Telefone 51 99999-8888';
    store.save(renderer.getPersistableSelection());

    assert.deepEqual([...storage.data.keys()], [`${SELECTION_STORAGE_PREFIX}loja1`]);
    const raw = storage.getItem('vitrine-selecao:loja1');
    assert.deepEqual(JSON.parse(raw), { versao: '"abc123"', itens: { [menu.items[0].id]: 1, [menu.items[1].id]: 2 } });
    assert.doesNotMatch(raw, /Mariana|Flores|9999|Telefone/);
    assert.deepEqual(store.load(), { versao: '"abc123"', itens: { [menu.items[0].id]: 1, [menu.items[1].id]: 2 } });

    store.save({});
    assert.equal(storage.getItem('vitrine-selecao:loja1'), null, 'seleção vazia apaga a chave');
  });

  storage.setItem('vitrine-selecao:loja1', '{quebrado');
  assert.equal(createSelectionStore({ slug: 'loja1', storage }).load(), null);
  const blocked = { getItem() { throw new Error('bloqueado'); }, setItem() { throw new Error('bloqueado'); }, removeItem() {} };
  assert.equal(createSelectionStore({ slug: 'loja1', storage: blocked }).load(), null);
  assert.equal(createSelectionStore({ slug: 'loja1', storage: blocked }).save({ a: 1 }), false);
  assert.equal(createSelectionStore({ slug: 'loja1', storage: null }).save({ a: 1 }), false);
});

test('Gaveta: ícone abre, mostra os itens, altera a quantidade e continua para a etapa certa', async () => {
  const menu = await pizzeriaMenu();
  const doc = createDocument();
  await withDocument(doc, () => {
    const trigger = doc.createElement('a');
    trigger.className = 'storefront-selection';
    doc.body.appendChild(trigger);
    const container = doc.createElement('div');
    doc.body.appendChild(container);
    let drawer = null;
    const renderer = new StorefrontRenderer(container, menu, { isPublicPage: true, onRender: () => drawer?.refresh() });
    drawer = createSelectionDrawer({ doc, win: {}, renderer, openEvent: SELECTION_OPEN_EVENT, trigger });
    renderer.render();

    const request = { type: SELECTION_OPEN_EVENT, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } };
    assert.equal(doc.dispatchEvent(request), false, 'a gaveta cancela o evento do ícone');
    assert.equal(drawer.isOpen(), true);
    assert.equal(doc.activeElement?.id, 'selection-drawer-title', 'foco no título ao abrir');
    const dialog = drawer.element;
    assert.equal(dialog.getAttribute('aria-labelledby'), 'selection-drawer-title');
    assert.match(dialog.textContent, /Sua seleção está vazia/);
    assert.equal(dialog.querySelector('.selection-drawer-browse').href, '#storefront-catalog');

    dialog.querySelector('.selection-drawer-close').click();
    assert.equal(drawer.isOpen(), false);
    assert.equal(doc.activeElement, trigger, 'fechar devolve o foco ao ícone');

    renderer.setQuantity(menu.items[0], 1);
    renderer.setQuantity(menu.items[1], 1);
    drawer.open();
    const rows = dialog.querySelectorAll('.selection-drawer-item');
    assert.equal(rows.length, 2);
    const inc = rows[1].querySelectorAll('[data-focus-key]').find((n) => n.dataset.focusKey.startsWith('inc:'));
    inc.focus();
    inc.click();
    assert.equal(renderer.cart.get(menu.items[1].id), 2, 'a gaveta altera o mesmo estado da barra e do cartão');
    assert.equal(doc.activeElement.dataset.focusKey, inc.dataset.focusKey, 'o foco continua no "+" depois de redesenhar');
    assert.match(dialog.querySelector('.selection-drawer-live').textContent, /: 2\.$/);
    const barTotal = container.querySelector('.storefront-cart-bar').querySelector('.cart-bar-total').textContent;
    assert.equal(dialog.querySelector('.selection-drawer-total').textContent, `Total estimado${barTotal}`);
    assert.doesNotMatch(textsOf(dialog), FORBIDDEN);

    const removeFirst = dialog.querySelectorAll('.selection-drawer-remove')[0];
    assert.equal(removeFirst.getAttribute('aria-label'), `Remover ${menu.items[0].name} da sua seleção`);
    removeFirst.focus();
    removeFirst.click();
    assert.equal(renderer.cart.has(menu.items[0].id), false);
    assert.ok(dialog.contains(doc.activeElement), 'o foco fica na gaveta depois de remover');

    dialog.querySelector('.selection-drawer-continue').click();
    assert.equal(drawer.isOpen(), false);
    assert.equal(renderer.stage, 2, 'pizzeria-v1 pede dados: vai para a etapa 2');
    assert.equal(doc.activeElement?.className, 'sf-stage-title');
  });
});

test('Gaveta: modo quote usa "Seu pré-orçamento" e vitrine sem campos vai direto para revisar', async () => {
  const menu = await quoteMenu();
  const doc = createDocument();
  await withDocument(doc, () => {
    const renderer = new StorefrontRenderer(doc.createElement('div'), menu, { isPublicPage: true });
    const drawer = createSelectionDrawer({ doc, win: {}, renderer });
    renderer.setQuantity(menu.items[0], 1);
    drawer.open();
    assert.equal(drawer.element.querySelector('.selection-drawer-title').textContent, 'Seu pré-orçamento');
    assert.match(drawer.element.textContent, /Sob consulta/);
    assert.doesNotMatch(drawer.element.textContent, /Total estimado/, 'sem preço fixo, sem total');
    drawer.element.querySelector('.selection-drawer-continue').click();
    assert.equal(renderer.stage, 2);

    const noFields = new StorefrontRenderer(doc.createElement('div'), {
      ...menu,
      orderFields: { customerName: false, date: false, timeSlots: [], deliveryOrPickup: false, notes: false }
    }, { isPublicPage: true });
    const drawer2 = createSelectionDrawer({ doc, win: {}, renderer: noFields });
    noFields.setQuantity(menu.items[1], 1);
    drawer2.open();
    drawer2.element.querySelector('.selection-drawer-continue').click();
    assert.equal(noFields.stage, 3, 'sem campos de pedido, vai para "Revisar e enviar"');
  });
});

test('Gaveta: sem <dialog> ou sem documento completo, o ícone segue como âncora', () => {
  const doc = createDocument();
  doc.createElement = (tag) => Object.assign(new Node(tag, doc), { showModal: undefined });
  assert.equal(createSelectionDrawer({ doc, renderer: {} }), null);
  assert.equal(createSelectionDrawer({ doc: { body: null }, renderer: {} }), null);
});

test('Vitrine: recarregar restaura a seleção, descarta o que saiu e avisa', async () => {
  const menu = await pizzeriaMenu();
  const [first, second] = menu.items;
  const storage = createStorage({
    'vitrine-selecao:loja1': JSON.stringify({ versao: '"antiga"', itens: { [first.id]: 2, 'item-que-saiu': 1 } })
  });
  const doc = createDocument();
  for (const id of ['storefront-catalog', 'storefront-status', 'storefront-name']) {
    const node = doc.createElement('div');
    node.id = id;
    doc.body.appendChild(node);
  }
  const counts = [];
  const header = { setCount: (count, options = {}) => counts.push({ count, ...options }) };
  const renderer = await withDocument(doc, () => bootStorefront({
    document: doc,
    window: {},
    slug: 'loja1',
    header,
    storage,
    fetch: async (url) => String(url).includes('/menu.json')
      ? { ok: true, headers: { get: (name) => (name === 'etag' ? '"nova"' : null) }, json: async () => menu }
      : { ok: false }
  }));

  assert.ok(renderer);
  assert.equal(renderer.cart.get(first.id), 2);
  assert.deepEqual(counts[0], { count: 2, silent: true }, 'sem anúncio da quantidade restaurada');
  assert.ok(counts.some((c) => c.message === '1 item da sua seleção saiu da vitrine e foi removido.'), 'aviso anunciado');
  const notice = doc.body.querySelector('.selection-drawer-notice');
  assert.equal(notice.hidden, false, 'aviso visível na gaveta');
  assert.equal(doc.body.querySelector('.selection-toast').hidden, false, 'aviso visível na página');
  assert.deepEqual(JSON.parse(storage.getItem('vitrine-selecao:loja1')), { versao: '"nova"', itens: { [first.id]: 2 } });

  await withDocument(doc, () => renderer.setQuantity(second, 1));
  assert.deepEqual(counts.at(-1), { count: 3, message: 'Adicionado à sua seleção.' });
  assert.equal(doc.body.querySelector('.selection-toast').textContent, 'Adicionado à sua seleção');
  assert.equal(doc.body.querySelector('.selection-drawer').open, undefined, 'adicionar não abre a gaveta');
});
