import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  renderStorefrontHtml,
  renderStorefrontItemHtml
} from '../src/publication-engine.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';
import {
  MAX_PUBLIC_MANIFEST_BYTES,
  customDomainPath,
  customDomainPublicPaths,
  matchItemPagePath
} from '../src/item-page.mjs';
import {
  assignItemSlugs,
  detailsFromText,
  detailsToText,
  hasItemPageContent,
  normalizeItemPageFields
} from '../web/assets/item-page-fields.mjs';
import { LINK_COPIED_MESSAGE, resolveItemBasePath, setupItemShare } from '../web/assets/item-page.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { bootStorefront } from '../web/vitrine/vitrine.js';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';

const OWNER = '10000000-0000-0000-0000-000000000001';
const AUTH = { authorization: 'Bearer token-owner' };
const PHOTO = 'https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/vitrine/pizza-a/aula.webp';
const GALLERY = [
  'https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/vitrine/pizza-a/aula-2.webp',
  'https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/vitrine/pizza-a/aula-3.webp'
];

function itemWithPage(extra = {}) {
  return {
    id: 'aula-pizza',
    name: 'Aula de pizza napolitana',
    description: 'Três horas de mão na massa.',
    priceCents: 18000,
    active: true,
    imageUrl: PHOTO,
    gallery: GALLERY,
    details: ['Duração: 3 horas', 'Vagas: 8 por turma'],
    longDescription: 'Você aprende a fermentação natural.\n\nNo fim, cada pessoa leva duas pizzas.',
    faq: [{ q: 'Preciso levar algo?', a: 'Só vontade de aprender. Avental e ingredientes estão inclusos.' }],
    internalNotes: 'custo 40 reais',
    ...extra
  };
}

function draft(items, extra = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    catalogType: 'products',
    slug: 'pizza-a',
    businessName: 'Pizza A',
    whatsapp: '5511987654321',
    ownerEmail: 'dono@example.com',
    components: { name: true, description: true, photo: true, price: true, quantitySelector: false },
    categories: [{ id: 'cursos', name: 'Cursos', items }],
    ...extra
  };
}

const compile = (content, options = {}) =>
  compilePublicStorefront(content, { slug: 'pizza-a', name: 'Pizza A', template: 'pizzeria-v1' }, { maxActiveItems: 100, ...options });

function meta(html, property) {
  return html.match(new RegExp(`<meta (?:property|name)="${property}" content="([^"]*)">`))?.[1];
}

const otherItems = [
  { id: 'margherita', name: 'Margherita', priceCents: 4500, active: true },
  { id: 'calabresa', name: 'Calabresa', priceCents: 4800, active: true },
  { id: 'quatro-queijos', name: 'Quatro queijos', priceCents: 5200, active: true },
  { id: 'portuguesa', name: 'Portuguesa', priceCents: 5000, active: true }
];

test('Issue #130 — campos do item: rascunho tolerante, publicação estrita e "Ver detalhes"', async (t) => {
  await t.test('limites e formato', () => {
    assert.equal(normalizeItemPageFields({ details: ['Duração'] }).error, null, 'rascunho aceita linha incompleta');
    assert.equal(normalizeItemPageFields({ details: ['Duração'] }, { strict: true }).error.code, 'INVALID_ITEM_DETAILS');
    assert.match(normalizeItemPageFields({ details: Array(7).fill('a: b') }).error.message, /6 linhas/);
    assert.match(normalizeItemPageFields({ longDescription: 'x'.repeat(2001) }).error.message, /2\.000 caracteres/);
    assert.match(normalizeItemPageFields({ faq: Array(7).fill({ q: 'a', a: 'b' }) }).error.message, /6 perguntas/);
    assert.match(normalizeItemPageFields({ faq: [{ q: 'a', a: 'b'.repeat(301) }] }).error.message, /300/);
    assert.equal(normalizeItemPageFields({ faq: [{ q: 'Só pergunta', a: '' }] }, { strict: true }).error.code, 'INVALID_ITEM_FAQ');
    assert.match(normalizeItemPageFields({ gallery: ['a', 'b', 'c', 'd', 'e'] }).error.message, /até 4 fotos/);
    assert.deepEqual(normalizeItemPageFields({ details: ['Duração: 1 hora', { label: 'Local', value: 'On-line' }] }, { strict: true }).fields,
      { details: [{ label: 'Duração', value: '1 hora' }, { label: 'Local', value: 'On-line' }] });
    assert.equal(detailsToText(detailsFromText(' Duração: 1 hora \n\n Local: on-line ')), 'Duração: 1 hora\nLocal: on-line');
  });

  await t.test('validação do rascunho barra script, rifa e galeria fora de https', () => {
    assert.doesNotThrow(() => validateDraftContent(draft([itemWithPage()]), { maxActiveItems: 100 }));
    assert.throws(() => validateDraftContent(draft([itemWithPage({ longDescription: '<script>alert(1)</script>' })])), { code: 'INVALID_ITEM' });
    assert.throws(() => validateDraftContent(draft([itemWithPage({ faq: [{ q: 'Tem sorteio?', a: 'Sim, um sorteio no fim.' }] })])), { code: 'RAFFLE_NOT_ALLOWED' });
    assert.throws(() => validateDraftContent(draft([itemWithPage({ gallery: ['http://exemplo.com/a.webp'] })])));
  });

  await t.test('endereço do item: gerado do nome, único e estável', () => {
    const slugs = assignItemSlugs([
      { id: 'a', name: 'Pão de Queijo' }, { id: 'b', name: 'Pão de queijo' }, { id: 'c', name: '!!!' }, { id: 'd', name: 'Café', slug: 'cafe-especial' }
    ]);
    assert.deepEqual([...slugs.values()], ['pao-de-queijo', 'pao-de-queijo-2', 'item-3', 'cafe-especial']);
  });

  await t.test('cartão ganha "Ver detalhes" só com campo novo', async () => {
    const { menu } = await compile(draft([itemWithPage(), ...otherItems]));
    assert.equal(hasItemPageContent(menu.items[0]), true);
    assert.equal(hasItemPageContent(menu.items[1]), false);
    const html = renderStorefrontHtml(menu);
    assert.equal((html.match(/class="sf-item-details-link"/g) ?? []).length, 1);
    assert.match(html, /href="\/pizza-a\/item\/aula-de-pizza-napolitana" aria-label="Ver detalhes de Aula de pizza napolitana"/);
    assert.match(renderStorefrontHtml(menu, undefined, { basePath: '' }), /href="\/item\/aula-de-pizza-napolitana"/);
  });
});

test('Issue #130 — página do item: um h1, og:image da foto, canonical, sem campos privados', async () => {
  const { menu } = await compile(draft([itemWithPage(), ...otherItems]));
  assert.doesNotThrow(() => assertNoPrivateLeakage(menu));
  const item = menu.items[0];
  assert.equal(item.slug, 'aula-de-pizza-napolitana');
  assert.deepEqual(item.details, [{ label: 'Duração', value: '3 horas' }, { label: 'Vagas', value: '8 por turma' }]);
  assert.equal(item.internalNotes, undefined);

  const html = renderStorefrontItemHtml(menu, item.slug);
  const h1s = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((match) => match[1]);
  assert.deepEqual(h1s, ['Aula de pizza napolitana']);
  assert.equal(meta(html, 'og:image'), PHOTO);
  assert.equal(meta(html, 'og:url'), 'https://vitrine.inspira.dev.br/pizza-a/item/aula-de-pizza-napolitana');
  assert.match(html, /<link rel="canonical" href="https:\/\/vitrine\.inspira\.dev\.br\/pizza-a\/item\/aula-de-pizza-napolitana">/);
  assert.match(html, /<title>Aula de pizza napolitana — Pizza A<\/title>/);
  assert.equal(meta(html, 'description'), 'Três horas de mão na massa.');
  assert.equal((html.match(/property="og:image"/g) ?? []).length, 1, 'um único gerador de metadados');

  assert.match(html, /<nav class="item-page-trail" aria-label="Trilha"><ol><li><a href="\/pizza-a">Pizza A<\/a><\/li><li><a href="\/pizza-a#cat-cursos">Cursos<\/a><\/li><li aria-current="page">/);
  assert.equal((html.match(/class="item-page-thumb"/g) ?? []).length, 3, 'foto principal + 2 da galeria');
  assert.match(html, /<dt>Duração<\/dt><dd>3 horas<\/dd>/);
  assert.match(html, /<h2 id="item-page-sobre">Sobre este item<\/h2>[\s\S]*<p>Você aprende a fermentação natural\.<\/p><p>No fim, cada pessoa leva duas pizzas\.<\/p>/);
  assert.match(html, /<details class="storefront-faq-item">\s*<summary><span class="storefront-faq-question">Preciso levar algo\?<\/span>/);
  assert.match(html, /<div class="storefront-faq-answer"><p>Só vontade de aprender\./);
  assert.equal((html.match(/class="item-page-related-card"/g) ?? []).length, 3, 'até 3 relacionados da mesma categoria');
  assert.match(html, /class="sf-secondary-button item-page-share-button"[^>]*data-share-url="https:\/\/vitrine\.inspira\.dev\.br\/pizza-a\/item\/aula-de-pizza-napolitana"/);
  assert.match(html, /<div id="storefront-catalog" class="item-page-select" data-item-select><a class="whatsapp-order-button" href="https:\/\/wa\.me\/5511987654321/);
  assert.match(html, /<body data-storefront-slug="pizza-a" data-storefront-item="aula-pizza"/);
  assert.match(html, /<header class="storefront-topbar">/, 'mesmo cabeçalho da vitrine');
  assert.match(html, /<footer class="storefront-footer"[^>]*>/, 'mesmo rodapé da vitrine');
  assert.match(html, /class="storefront-identity" href="\/pizza-a"/);

  for (const secret of ['custo 40 reais', 'dono@example.com', 'internalNotes', 'ownerEmail']) {
    assert.ok(!html.includes(secret), `vazou ${secret}`);
  }
  assert.doesNotMatch(html.replace(/<head>[\s\S]*<\/head>/, ''), /cat[aá]logo|card[aá]pio/i);
  assert.equal(renderStorefrontItemHtml(menu, 'nao-existe'), null);
  assert.ok(renderStorefrontItemHtml(menu, 'aula-pizza'), 'aceita o identificador (orçamento da vitrine)');
  assert.equal(renderStorefrontItemHtml(menu, 'aula-pizza', { bySlugOnly: true }), null, 'a rota pública só aceita o endereço');
});

test('Issue #130 — manifesto acima de 256 KiB é recusado dizendo quantos itens cabem', async () => {
  const long = 'Texto longo da página do item com acentuação: ção. '.repeat(39).slice(0, 2000);
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: `item-${index + 1}`,
    name: `Item ${index + 1}`,
    priceCents: 1000,
    active: true,
    longDescription: long
  }));
  await assert.rejects(compile(draft(items)), (error) => {
    assert.equal(error.code, 'PUBLIC_MANIFEST_TOO_LARGE');
    assert.equal(error.status, 422);
    assert.match(error.message, /acima do limite de 256 KiB/);
    const fits = Number(error.message.match(/cabem (\d+) itens com descrição longa/)?.[1]);
    assert.ok(fits > 0 && fits < 100, error.message);
    assert.match(error.message, /hoje são 100/);
    return true;
  });
  const fits = Number((await compile(draft(items)).catch((error) => error)).message.match(/cabem (\d+)/)[1]);
  const { json } = await compile(draft(items.slice(0, fits)));
  assert.ok(Buffer.byteLength(json) <= MAX_PUBLIC_MANIFEST_BYTES, 'a quantidade anunciada cabe de fato');
});

test('Issue #130 — Worker: 200 no endereço do item, 404 da vitrine, renomear, domínio próprio e pausa', async () => {
  const store = createMemoryStore();
  const api = createApiHandler({ store });
  const [site] = await store.listSites(OWNER);
  const { draft: current } = await (await api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/draft`, { headers: AUTH }))).json();
  const save = async (items) => {
    const { draft: latest } = await (await api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/draft`, { headers: AUTH }))).json();
    const response = await api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/draft`, {
      method: 'PUT', headers: { ...AUTH, 'content-type': 'application/json' },
      body: JSON.stringify({ revision: latest.revision, content: { ...current.content, components: { ...current.content.components, photo: true }, items } })
    }));
    assert.equal(response.status, 200, await response.clone().text());
  };
  const publish = async () => {
    const response = await api(new Request(`https://vitrine.inspira.dev.br/api/sites/${site.id}/publish`, { method: 'POST', headers: AUTH }));
    assert.equal(response.status, 200, await response.clone().text());
  };
  const env = { CF_SAAS_CNAME_TARGET: 'saas.inspira.dev.br' };
  const get = (path, host = 'vitrine.inspira.dev.br') => api(new Request(`https://${host}${path}`), env, {});

  const { internalNotes, ...publicItem } = itemWithPage();
  await save([publicItem, ...current.content.items]);
  await publish();

  const page = await get('/pizza-a/item/aula-de-pizza-napolitana');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /script-src 'self'(;|$)/);
  assert.match(csp, /img-src[^;]*qawlpsrfewosxsfgmmpm\.supabase\.co/);
  const html = await page.text();
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1);
  assert.equal(meta(html, 'og:image'), PHOTO);
  assert.equal((await get('/pizza-a/item/nao-existe')).status, 404);
  assert.equal((await get('/pizza-a/item/aula-pizza')).status, 404, 'identificador interno não é endereço');
  assert.equal((await get('/sem-vitrine/item/aula-de-pizza-napolitana')).status, 404);
  const storefront = await (await get('/pizza-a')).text();
  assert.match(storefront, /href="\/pizza-a\/item\/aula-de-pizza-napolitana"/);

  await save([{ ...publicItem, name: 'Oficina de pizza' }, ...current.content.items]);
  assert.equal((await get('/pizza-a/item/aula-de-pizza-napolitana')).status, 200, 'renomear no rascunho não muda o publicado');
  assert.equal((await get('/pizza-a/item/oficina-de-pizza')).status, 404);
  await publish();
  assert.equal((await get('/pizza-a/item/oficina-de-pizza')).status, 200, 'novo endereço depois da publicação');
  assert.equal((await get('/pizza-a/item/aula-de-pizza-napolitana')).status, 404, 'endereço antigo responde 404');

  store.resolveDomain = async (hostname) => (hostname === 'pizzariadoze.com.br' ? 'pizza-a' : null);
  const custom = await get('/item/oficina-de-pizza', 'pizzariadoze.com.br');
  assert.equal(custom.status, 200);
  const customHtml = await custom.text();
  assert.equal(meta(customHtml, 'og:url'), 'https://pizzariadoze.com.br/item/oficina-de-pizza');
  assert.match(customHtml, /<a href="\/">Pizza A<\/a>/, 'trilha volta para a raiz do domínio próprio');
  assert.equal((await get('/item/nao-existe', 'pizzariadoze.com.br')).status, 404);
  assert.equal((await get('/outra/item/oficina-de-pizza', 'pizzariadoze.com.br')).status, 404);

  const pausedStore = createMemoryStore();
  const pausedApi = createApiHandler({ store: pausedStore });
  pausedStore.getPublicSiteState = async () => 'paused';
  const pausedStorefront = await pausedApi(new Request('https://vitrine.inspira.dev.br/pizza-a'));
  const pausedItem = await pausedApi(new Request('https://vitrine.inspira.dev.br/pizza-a/item/margherita'));
  assert.equal(pausedItem.status, pausedStorefront.status, 'página do item pausada como a vitrine');
  assert.equal(await pausedItem.text(), await pausedStorefront.text());
});

test('Issue #130 — resolução e HTML da página do item cabem em 1,5 ms de CPU (ADR 0008), com 100 itens', async () => {
  const items = Array.from({ length: 100 }, (_, index) => ({
    id: `item-${index + 1}`, name: `Item ${index + 1}`, priceCents: 1000 + index, active: true,
    description: 'Descrição curta.', details: ['Duração: 1 hora'], longDescription: 'Texto da página. '.repeat(60),
    faq: [{ q: 'Pergunta?', a: 'Resposta.' }]
  }));
  const { menu } = await compile(draft(items));
  const run = () => {
    const route = matchItemPagePath('/pizza-a/item/item-77');
    return renderStorefrontItemHtml(menu, route.itemSlug, { bySlugOnly: true });
  };
  for (let i = 0; i < 20; i += 1) run();
  const times = [];
  for (let i = 0; i < 60; i += 1) {
    const start = performance.now();
    assert.ok(run());
    times.push(performance.now() - start);
  }
  const median = times.sort((a, b) => a - b)[Math.floor(times.length / 2)];
  assert.ok(median < 1.5, `mediana de ${median.toFixed(3)} ms`);
});

test('Issue #130 — rotas do domínio próprio', () => {
  assert.deepEqual(matchItemPagePath('/loja/item/pao-de-queijo'), { slug: 'loja', itemSlug: 'pao-de-queijo' });
  assert.equal(matchItemPagePath('/loja/item/Pao'), null);
  assert.equal(matchItemPagePath('/item/pao'), null);
  assert.equal(customDomainPath('loja', '/'), '/loja');
  assert.equal(customDomainPath('loja', '/item/pao'), '/loja/item/pao');
  assert.ok(customDomainPublicPaths('loja', '/loja/item/pao').has('/loja/item/pao'));
  assert.ok(!customDomainPublicPaths('loja', '/outra/item/pao').has('/outra/item/pao'));
  assert.equal(resolveItemBasePath('loja', '/loja/item/pao'), '/loja');
  assert.equal(resolveItemBasePath('loja', '/item/pao'), '');
});

function fakeShareRoot() {
  const status = { textContent: '' };
  const listeners = [];
  const button = {
    hidden: true,
    dataset: { shareUrl: 'https://vitrine.inspira.dev.br/pizza-a/item/margherita', shareTitle: 'Margherita — Pizza A' },
    addEventListener: (_type, fn) => listeners.push(fn)
  };
  return {
    button,
    status,
    click: () => Promise.all(listeners.map((fn) => fn())),
    querySelector: (selector) => (selector === '.item-page-share-button' ? button : selector === '.item-page-share-status' ? status : null)
  };
}

test('Issue #130 — "Compartilhar": navigator.share quando existe; senão copia e anuncia', async () => {
  const shared = [];
  const root = fakeShareRoot();
  const withShare = setupItemShare(root, { navigatorObj: { share: async (data) => shared.push(data) } });
  assert.equal(root.button.hidden, false);
  assert.equal(await withShare.share(), 'shared');
  assert.deepEqual(shared, [{ title: 'Margherita — Pizza A', url: 'https://vitrine.inspira.dev.br/pizza-a/item/margherita' }]);
  assert.equal(root.status.textContent, '');

  const copied = [];
  const root2 = fakeShareRoot();
  const withCopy = setupItemShare(root2, { navigatorObj: { clipboard: { writeText: async (text) => copied.push(text) } } });
  assert.equal(await withCopy.share(), 'copied');
  assert.deepEqual(copied, ['https://vitrine.inspira.dev.br/pizza-a/item/margherita']);
  assert.equal(root2.status.textContent, LINK_COPIED_MESSAGE);
  assert.equal(LINK_COPIED_MESSAGE, 'Link copiado');

  const root3 = fakeShareRoot();
  const cancelled = setupItemShare(root3, {
    navigatorObj: { share: async () => { throw Object.assign(new Error('x'), { name: 'AbortError' }); }, clipboard: { writeText: async () => {} } }
  });
  assert.equal(await cancelled.share(), 'cancelled', 'cancelar a folha de compartilhar não copia');

  const root4 = fakeShareRoot();
  assert.equal(setupItemShare(root4, { navigatorObj: {} }), null);
  assert.equal(root4.button.hidden, true, 'sem share nem área de transferência, o botão fica oculto');
});

// DOM mínimo para a vitrine no navegador: ".classe", "[atributo]", eventos e <dialog>.
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
    this.style = {};
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
    createTextNode: (text) => Object.assign(new Node('#text', doc), { _text: String(text) }),
    addEventListener(type, fn) { (doc.listeners[type] ??= []).push(fn); },
    dispatchEvent(event) { for (const fn of doc.listeners[event.type] ?? []) fn(event); return !event.defaultPrevented; },
    querySelector: (selector) => doc.body.querySelector(selector),
    querySelectorAll: (selector) => doc.body.querySelectorAll(selector),
    getElementById: (id) => doc.body.querySelectorAll('[id]').find((n) => n.id === id) ?? null
  };
  doc.body = new Node('body', doc);
  return doc;
}

test('Issue #130 — adicionar pela página do item: contador, gaveta e mensagem do WhatsApp', async () => {
  const { menu } = await compile(draft([itemWithPage({ internalNotes: undefined }), ...otherItems]));
  const item = menu.items[0];
  const doc = createDocument();
  doc.body.dataset.storefrontItem = item.id;
  const main = doc.createElement('main');
  main.className = 'item-page-main';
  const slot = doc.createElement('div');
  slot.id = 'storefront-catalog';
  main.appendChild(slot);
  doc.body.appendChild(main);
  const counts = [];
  const header = { setCount: (count, options = {}) => counts.push({ count, ...options }) };
  const previous = globalThis.document;
  globalThis.document = doc;
  try {
    const renderer = await bootStorefront({
      document: doc,
      window: {},
      slug: 'pizza-a',
      pathname: '/pizza-a/item/aula-de-pizza-napolitana',
      header,
      storage: null,
      navigator: {},
      fetch: async (url) => String(url).includes('/menu.json')
        ? { ok: true, headers: { get: () => '"v1"' }, json: async () => menu }
        : { ok: false }
    });
    assert.ok(renderer);
    assert.equal(slot.querySelectorAll('.sf-focus-item').length, 1, 'só o controle do item em foco');
    assert.equal(slot.querySelectorAll('.menu-item-card').length, 0, 'sem a grade inteira');
    assert.equal(slot.querySelectorAll('.sf-stepper').length, 0, 'sem etapas antes de escolher');
    const select = slot.querySelector('.whatsapp-order-button');
    assert.equal(select.textContent, 'Selecionar', 'mesmo controle do cartão');
    select.click();
    assert.equal(renderer.cart.get(item.id), 1);
    assert.deepEqual(counts.at(-1), { count: 1, message: 'Adicionado à sua seleção.' });
    const drawer = doc.body.querySelector('.selection-drawer');
    assert.ok(drawer, 'gaveta montada na página do item');
    assert.match(drawer.textContent, /Aula de pizza napolitana/);
    assert.match(renderer.buildOrderMessage(), /Aula de pizza napolitana/);
    assert.ok(slot.querySelector('.storefront-cart-bar'), 'barra da seleção aparece');
    renderer.goToStage(3);
    assert.equal(main.hasAttribute('data-flow'), true, 'etapas ocupam a página do item');
    renderer.goToStage(1);
    assert.equal(main.hasAttribute('data-flow'), false);

    const grid = new StorefrontRenderer(doc.createElement('div'), menu, {
      isPublicPage: true,
      itemHref: (entry) => `/pizza-a/item/${entry.slug}`
    });
    grid.render();
    const links = grid.container.querySelectorAll('.sf-item-details-link');
    assert.equal(links.length, 1, '"Ver detalhes" só no item com página');
    assert.equal(links[0].href, '/pizza-a/item/aula-de-pizza-napolitana');
    assert.equal(links[0].getAttribute('aria-label'), 'Ver detalhes de Aula de pizza napolitana');
  } finally {
    if (previous === undefined) delete globalThis.document;
    else globalThis.document = previous;
  }
});

test('Issue #130 — painel: seção "Página do item" sem handlers inline nem termos proibidos', async () => {
  const source = await readFile(new URL('../web/portal/item-page-fields.mjs', import.meta.url), 'utf8');
  const editor = await readFile(new URL('../web/portal/editor.js', import.meta.url), 'utf8');
  const index = await readFile(new URL('../web/portal/index.html', import.meta.url), 'utf8');
  assert.match(editor, /renderItemPageFields\(item, fields, \{/);
  assert.match(index, /<link rel="stylesheet" href="\.\/item-page-fields\.css">/);
  assert.doesNotMatch(source, /innerHTML|\son[a-z]+=/);
  assert.doesNotMatch(source, /cat[aá]logo|card[aá]pio/i);
  for (const label of ['Página do item (opcional)', 'Detalhes (opcional)', 'Descrição longa (opcional)', 'Adicionar pergunta', 'Adicionar foto']) {
    assert.ok(source.includes(label), label);
  }
});
