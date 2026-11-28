import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import * as engine from '../src/publication-engine.mjs';
import { ALLOWED_TEMPLATES, createInitialDraftContent } from '../src/portal-validation.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { heroPhotoDraft } from './fixtures/hero-photo-storefront.mjs';
import { staticStorefrontLimits } from '../src/static-storefronts.mjs';
import { STOREFRONT_PALETTES_CSS } from '../web/assets/storefront-palettes.mjs';

const { compilePublicStorefront, renderStorefrontHtml } = engine;

// Orçamento documentado em docs/development.md ("Orçamento da vitrine pública").
const STOREFRONT_BUDGET = Object.freeze({
  ownOrigin: 'https://vitrine.inspira.dev.br',
  allowedHosts: Object.freeze(['vitrine.inspira.dev.br', 'sandbox.inspira.dev.br']),
  maxModuleEntries: 1,
  maxClassicScripts: 1,
  maxStylesheets: 1,
  maxGzipBytes: 120 * 1024,
  englishTerms: Object.freeze(['Cart', 'Checkout', 'Close', 'Search', 'Shop'])
});

const root = fileURLToPath(new URL('../', import.meta.url));
const webRoot = resolve(root, 'web');

const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

function decodeEntities(text) {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&amp;/g, '&');
}

function parseAttributes(source = '') {
  const attrs = {};
  const pattern = /([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g;
  for (const match of source.matchAll(pattern)) {
    attrs[match[1].toLowerCase()] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}

function tagsOf(html, tagName) {
  const pattern = new RegExp(`<${tagName}(?=[\\s>/])([^>]*)>`, 'gi');
  return [...html.matchAll(pattern)].map((match) => ({ raw: match[0], attrs: parseAttributes(match[1]) }));
}

function stripNonContent(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
}

function textOf(fragment) {
  return decodeEntities(fragment.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
}

function accessibleName(attrs, inner, html) {
  if (attrs['aria-label']?.trim()) return attrs['aria-label'].trim();
  if (attrs['aria-labelledby']?.trim()) {
    const ids = attrs['aria-labelledby'].trim().split(/\s+/);
    const names = ids.map((id) => {
      const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const match = html.match(new RegExp(`<([a-z0-9]+)[^>]*\\bid="${escaped}"[^>]*>([\\s\\S]*?)</\\1>`, 'i'));
      return match ? textOf(match[2]) : '';
    });
    if (names.join(' ').trim()) return names.join(' ').trim();
  }
  const visible = textOf(inner.replace(/<[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/[^>]+>/gi, ''));
  if (visible) return visible;
  const alts = tagsOf(inner, 'img').map((img) => img.attrs.alt?.trim()).filter(Boolean);
  if (alts.length) return alts.join(' ');
  return attrs.title?.trim() ?? '';
}

function isOwnOrAllowedUrl(rawUrl) {
  const url = new URL(rawUrl, `${STOREFRONT_BUDGET.ownOrigin}/`);
  if (url.protocol === 'data:') return true;
  return url.protocol === 'https:' && STOREFRONT_BUDGET.allowedHosts.includes(url.hostname);
}

/**
 * Verifica um HTML de vitrine contra o orçamento. `fragment: true` aplica só as
 * regras de conteúdo (imagens, nomes acessíveis, termos em inglês), usadas para a
 * marcação desenhada no navegador pelo renderizador.
 */
function auditStorefrontHtml(html, { fragment = false } = {}) {
  const violations = [];
  const clean = html.replace(/<!--[\s\S]*?-->/g, '');

  if (!fragment) {
    for (const { attrs, raw } of tagsOf(clean, 'script')) {
      if (attrs.src) {
        if (!isOwnOrAllowedUrl(attrs.src)) violations.push(`script de terceiro: ${raw}`);
      } else if (attrs.type !== 'application/ld+json') {
        violations.push(`script inline: ${raw}`);
      }
    }
    for (const tag of ['link', 'iframe']) {
      for (const { attrs, raw } of tagsOf(clean, tag)) {
        const href = tag === 'link' ? attrs.href : attrs.src;
        if (href && !isOwnOrAllowedUrl(href)) violations.push(`${tag} de terceiro: ${raw}`);
      }
    }

    const scripts = tagsOf(clean, 'script').filter(({ attrs }) => attrs.src);
    const modules = scripts.filter(({ attrs }) => attrs.type === 'module');
    const classic = scripts.filter(({ attrs }) => attrs.type !== 'module');
    // A folha das paletas só entra em vitrines com paleta não padrão e não conta no limite.
    const stylesheets = tagsOf(clean, 'link').filter(({ attrs }) =>
      /\bstylesheet\b/i.test(attrs.rel ?? '') && attrs.href !== STOREFRONT_PALETTES_CSS);
    if (modules.length > STOREFRONT_BUDGET.maxModuleEntries) {
      violations.push(`${modules.length} módulos JS de entrada (máximo ${STOREFRONT_BUDGET.maxModuleEntries})`);
    }
    if (classic.length > STOREFRONT_BUDGET.maxClassicScripts) {
      violations.push(`${classic.length} scripts clássicos (máximo ${STOREFRONT_BUDGET.maxClassicScripts})`);
    }
    if (stylesheets.length > STOREFRONT_BUDGET.maxStylesheets) {
      violations.push(`${stylesheets.length} folhas de estilo (máximo ${STOREFRONT_BUDGET.maxStylesheets})`);
    }

    const h1Count = tagsOf(stripNonContent(clean), 'h1').length;
    if (h1Count !== 1) violations.push(`${h1Count} h1 na página (esperado exatamente 1)`);
  }

  const content = stripNonContent(clean);
  for (const { attrs, raw } of tagsOf(content, 'img')) {
    for (const required of ['alt', 'width', 'height']) {
      if (!(required in attrs)) violations.push(`img sem ${required}: ${raw}`);
    }
  }

  for (const match of content.matchAll(/<(a|button)(?=[\s>])([^>]*)>([\s\S]*?)<\/\1>/gi)) {
    const attrs = parseAttributes(match[2]);
    if (!accessibleName(attrs, match[3], content)) {
      violations.push(`${match[1]} sem nome acessível: ${match[0].slice(0, 160)}`);
    }
  }

  const body = content.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, (head) =>
    (head.match(/<title\b[^>]*>[\s\S]*?<\/title>/i) ?? [''])[0]
  );
  const announced = [];
  for (const match of body.matchAll(/<[a-z][^>]*>/gi)) {
    const attrs = parseAttributes(match[0].replace(/^<[a-z0-9-]+|\/?>$/gi, ''));
    for (const key of ['aria-label', 'alt', 'title', 'placeholder']) {
      if (attrs[key]) announced.push(attrs[key]);
    }
  }
  const interfaceText = `${textOf(body)} ${announced.join(' ')}`;
  // `\b` do JavaScript trata letras acentuadas como fronteira ("cartão" casaria "cart").
  const englishPattern = new RegExp(`(?<![\\p{L}\\p{N}_])(${STOREFRONT_BUDGET.englishTerms.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');
  const found = new Set([...interfaceText.matchAll(englishPattern)].map((match) => match[1]));
  for (const term of found) violations.push(`texto de interface em inglês: "${term}"`);

  return violations;
}

function urlToWebFile(urlPath) {
  const { pathname } = new URL(urlPath, `${STOREFRONT_BUDGET.ownOrigin}/`);
  const file = resolve(webRoot, `.${decodeURIComponent(pathname)}`);
  if (!file.startsWith(webRoot)) throw new Error(`Recurso fora de web/: ${urlPath}`);
  return file;
}

async function collectOwnResources(html) {
  const files = new Map();
  const visit = async (file, kind) => {
    if (files.has(file)) return;
    const source = await readFile(file, 'utf8');
    files.set(file, { kind, source });
    if (kind === 'js') {
      const specifiers = [
        ...source.matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"]([^'"]+)['"]/gm),
        ...source.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm),
        ...source.matchAll(/\bimport\(\s*['"]([^'"]+)['"]\s*\)/g)
      ].map((match) => match[1]);
      for (const specifier of specifiers) {
        await visit(fileURLToPath(new URL(specifier, `file://${file}`)), 'js');
      }
    } else {
      for (const match of source.matchAll(/@import\s+(?:url\()?['"]?([^'")\s]+)['"]?\)?/g)) {
        await visit(fileURLToPath(new URL(match[1], `file://${file}`)), 'css');
      }
    }
  };

  for (const { attrs } of tagsOf(html, 'script')) {
    if (attrs.src && isOwnOrAllowedUrl(attrs.src) && !new URL(attrs.src, `${STOREFRONT_BUDGET.ownOrigin}/`).hostname.startsWith('sandbox.')) {
      await visit(urlToWebFile(attrs.src), 'js');
    }
  }
  for (const { attrs } of tagsOf(html, 'link')) {
    if (/\bstylesheet\b/i.test(attrs.rel ?? '') && attrs.href) await visit(urlToWebFile(attrs.href), 'css');
  }
  return files;
}

async function measureStorefrontBytes(html) {
  const files = await collectOwnResources(html);
  let raw = 0;
  let gzip = 0;
  let brotli = 0;
  for (const { source } of files.values()) {
    const buffer = Buffer.from(source);
    raw += buffer.byteLength;
    gzip += gzipSync(buffer, { level: 9 }).byteLength;
    brotli += brotliCompressSync(buffer).byteLength;
  }
  return { files: [...files.keys()].map((file) => file.slice(webRoot.length)), raw, gzip, brotli };
}

// DOM mínimo que serializa a marcação do renderizador, sem dependências externas.
const REFLECTED = ['id', 'href', 'src', 'alt', 'type', 'title', 'placeholder', 'name', 'role', 'loading', 'width', 'height', 'min', 'max', 'step', 'for', 'autocomplete', 'inputMode', 'rows', 'maxLength', 'pattern'];

function escapeText(value) {
  return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function escapeAttr(value) {
  return escapeText(value).replace(/"/g, '&quot;');
}

class MockText {
  constructor(text) {
    this.nodeType = 3;
    this.data = String(text);
  }
  get textContent() {
    return this.data;
  }
  serialize() {
    return escapeText(this.data);
  }
}

class MockElement {
  constructor(tag, ownerDocument) {
    this.nodeType = 1;
    this.tagName = String(tag).toUpperCase();
    this.localName = String(tag).toLowerCase();
    this.ownerDocument = ownerDocument;
    this.attributes = {};
    this.childNodes = [];
    this.parentNode = null;
    this.dataset = {};
    this.style = { setProperty() {}, removeProperty() {} };
    this.className = '';
    this.hidden = false;
    this.disabled = false;
    this.checked = false;
    this.value = '';
    this.classList = {
      add: (...tokens) => { this.className = [...new Set([...this.className.split(/\s+/), ...tokens])].filter(Boolean).join(' '); },
      remove: (...tokens) => { this.className = this.className.split(/\s+/).filter((t) => t && !tokens.includes(t)).join(' '); },
      toggle: (token, force) => {
        const has = this.className.split(/\s+/).includes(token);
        const next = force ?? !has;
        if (next) this.classList.add(token); else this.classList.remove(token);
        return next;
      },
      contains: (token) => this.className.split(/\s+/).includes(token)
    };
  }
  get children() {
    return this.childNodes.filter((node) => node.nodeType === 1);
  }
  get firstChild() {
    return this.childNodes[0] ?? null;
  }
  get textContent() {
    return this.childNodes.map((node) => node.textContent).join('');
  }
  set textContent(value) {
    this.childNodes = value === '' || value == null ? [] : [new MockText(value)];
  }
  set innerHTML(value) {
    if (value) throw new Error('innerHTML com conteúdo não é suportado pelo DOM de teste');
    this.childNodes = [];
  }
  get innerHTML() {
    return this.childNodes.map((node) => node.serialize()).join('');
  }
  set htmlFor(value) {
    this.attributes.for = String(value);
  }
  appendChild(child) {
    if (child?.isFragment) {
      for (const node of child.childNodes) this.appendChild(node);
      child.childNodes = [];
      return child;
    }
    child.parentNode?.removeChild?.(child);
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }
  append(...nodes) {
    for (const node of nodes) this.appendChild(typeof node === 'string' ? new MockText(node) : node);
  }
  prepend(...nodes) {
    const current = this.childNodes;
    this.childNodes = [];
    this.append(...nodes);
    this.childNodes.push(...current);
  }
  insertBefore(child, reference) {
    this.appendChild(child);
    if (reference) {
      this.childNodes.pop();
      const index = this.childNodes.indexOf(reference);
      this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    }
    return child;
  }
  removeChild(child) {
    this.childNodes = this.childNodes.filter((node) => node !== child);
    child.parentNode = null;
    return child;
  }
  remove() {
    this.parentNode?.removeChild(this);
  }
  replaceChildren(...nodes) {
    this.childNodes = [];
    this.append(...nodes.flat());
  }
  replaceWith(node) {
    if (!this.parentNode) return;
    const index = this.parentNode.childNodes.indexOf(this);
    this.parentNode.childNodes.splice(index, 1, node);
    node.parentNode = this.parentNode;
  }
  setAttribute(key, value) {
    this.attributes[String(key).toLowerCase()] = String(value);
  }
  getAttribute(key) {
    return this.attributes[String(key).toLowerCase()] ?? null;
  }
  hasAttribute(key) {
    return String(key).toLowerCase() in this.attributes;
  }
  removeAttribute(key) {
    delete this.attributes[String(key).toLowerCase()];
  }
  toggleAttribute(key, force) {
    const next = force ?? !this.hasAttribute(key);
    if (next) this.setAttribute(key, ''); else this.removeAttribute(key);
    return next;
  }
  addEventListener() {}
  removeEventListener() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  contains(node) { return node === this; }
  focus() {}
  blur() {}
  scrollIntoView() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  getBoundingClientRect() { return { top: 0, left: 0, width: 0, height: 0 }; }
  serialize() {
    const attrs = { ...this.attributes };
    for (const key of REFLECTED) {
      const value = this[key];
      if (value !== undefined && value !== null && value !== '' && !(key.toLowerCase() in attrs)) attrs[key.toLowerCase()] = value;
    }
    if (this.className) attrs.class = this.className;
    if (this.hidden) attrs.hidden = '';
    if (this.disabled) attrs.disabled = '';
    for (const [key, value] of Object.entries(this.dataset)) {
      attrs[`data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`] = value;
    }
    const attrText = Object.entries(attrs)
      .map(([key, value]) => (value === '' ? ` ${key}` : ` ${key}="${escapeAttr(value)}"`))
      .join('');
    if (VOID_TAGS.has(this.localName)) return `<${this.localName}${attrText}>`;
    return `<${this.localName}${attrText}>${this.innerHTML}</${this.localName}>`;
  }
}

function createMockDocument() {
  const doc = {
    body: null,
    createElement: (tag) => new MockElement(tag, doc),
    createElementNS: (_ns, tag) => new MockElement(tag, doc),
    createTextNode: (text) => new MockText(text),
    createDocumentFragment: () => Object.assign(new MockElement('fragment', doc), { isFragment: true }),
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener() {},
    removeEventListener() {}
  };
  doc.body = new MockElement('body', doc);
  return doc;
}

/** Desenha as três etapas do renderizador público e devolve a marcação serializada. */
function renderClientStages(menu) {
  const previousDocument = globalThis.document;
  const doc = createMockDocument();
  globalThis.document = doc;
  try {
    const container = doc.createElement('div');
    container.id = 'storefront-catalog';
    const renderer = new StorefrontRenderer(container, menu, { isPublicPage: true, targetWhatsapp: menu.whatsapp });
    const stages = [];
    renderer.render();
    stages.push(container.serialize() + doc.body.innerHTML);
    const first = menu.items?.find((item) => item.active !== false);
    if (first) renderer.cart.set(first.id, 1);
    for (const stage of [1, 2, 3]) {
      renderer.stage = stage;
      renderer.render();
      stages.push(container.serialize() + doc.body.innerHTML);
    }
    return stages;
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
  }
}

const PHOTO_URL = 'https://vitrine.inspira.dev.br/assets/pizza-demo.webp';

function quoteDraft() {
  const draft = createInitialDraftContent({
    slug: 'atelie-orcamento',
    name: 'Ateliê Orçamento',
    storefrontType: 'art',
    template: 'quote-v1',
    catalogType: 'quote',
    whatsapp: '5551999998888'
  });
  draft.categories = [
    {
      id: 'encomendas',
      name: 'Peças sob encomenda',
      items: [
        { id: 'escultura', name: 'Escultura em cerâmica', description: 'Peça autoral sob medida.', priceCents: 0, imageUrl: PHOTO_URL, active: true },
        { id: 'vaso', name: 'Vaso torneado', description: 'Esmalte à escolha.', priceCents: 0, active: true }
      ]
    }
  ];
  return draft;
}

function servicesDraft() {
  return {
    ...quoteDraft(),
    template: SERVICES_TEMPLATE,
    catalogType: 'products',
    slug: 'servicos-exemplo',
    businessName: 'Serviços de exemplo'
  };
}

const templateHtmlPromise = readFile(resolve(webRoot, 'vitrine/index.html'), 'utf8');

const SERVICES_TEMPLATE = 'servicos-produtos-v1';

async function contentExamples() {
  const dir = resolve(root, 'content/vitrines');
  const names = (await readdir(dir)).filter((name) => name.endsWith('.json')).sort();
  return Promise.all(names.map(async (name) => JSON.parse(await readFile(resolve(dir, name), 'utf8'))));
}

async function exampleStorefronts() {
  const examples = await contentExamples();
  const quote = quoteDraft();
  const modular = {
    ...quoteDraft(),
    slug: 'atelie-modular',
    structure: {
      pages: [{
        slug: 'home',
        title: 'Início',
        sections: [
          { id: 'abertura', moduleCode: 'hero', config: { headline: 'Ateliê Orçamento', subtitle: 'Peças feitas à mão.' } },
          { id: 'itens', moduleCode: 'catalog_grid', config: { columns: 2 } },
          { id: 'sobre', moduleCode: 'about_story', config: { bio: 'Cerâmica desde 2010.' } },
          { id: 'depoimentos', moduleCode: 'testimonials', config: { items: [
            { quote: 'Peça linda.', name: 'Ana', consent: true },
            // Foto decorativa com alt="" explícito: o verificador exige o atributo, não um texto.
            { quote: 'Chegou no prazo.', name: 'Bia', context: 'Vaso sob encomenda', photoUrl: '/assets/pizza-demo.webp', consent: true }
          ] } },
          { id: 'perguntas', moduleCode: 'faq', config: { title: 'Dúvidas comuns', items: [{ q: 'Qual o prazo?', a: 'Até 20 dias.' }] } }
        ]
      }]
    }
  };
  const asCandidate = (label, draft) => ({
    label,
    draft,
    site: { slug: draft.slug, name: draft.businessName, template: draft.template }
  });
  const candidates = [
    ...examples.map((draft) => asCandidate(`${draft.template} (${draft.slug})`, draft)),
    asCandidate('quote-v1', quote),
    asCandidate('quote-v1 com seções', modular),
    asCandidate('pizzeria-v1 com foto no hero e destaques', await heroPhotoDraft())
  ];
  const servicesExample = examples.some((draft) => draft.template === SERVICES_TEMPLATE);
  if (!servicesExample && ALLOWED_TEMPLATES.includes(SERVICES_TEMPLATE)) {
    candidates.push(asCandidate(SERVICES_TEMPLATE, servicesDraft()));
  }

  const storefronts = [];
  for (const candidate of candidates) {
    const { menu } = await compilePublicStorefront(candidate.draft, candidate.site, {
      revision: 1,
      publishedAt: '2026-11-14T00:00:00.000Z',
      ...staticStorefrontLimits(candidate.draft.slug)
    });
    storefronts.push({ ...candidate, menu });
  }
  if (!servicesExample && !ALLOWED_TEMPLATES.includes(SERVICES_TEMPLATE)) {
    storefronts.push({ label: SERVICES_TEMPLATE, skipped: 'modelo ainda não existe (issue 26); entra sozinho quando existir' });
  }
  return storefronts;
}

async function publishedPages({ label, menu }) {
  const templateHtml = await templateHtmlPromise;
  const pages = [
    { name: `${label}: página estática (build)`, html: renderStorefrontHtml(menu, templateHtml) },
    { name: `${label}: página do Worker`, html: renderStorefrontHtml(menu) },
    { name: `${label}: prévia sem JS`, html: renderStorefrontHtml(menu, undefined, { interactive: false }) }
  ];
  const renderItemPage = engine.renderStorefrontItemHtml ?? engine.renderItemPageHtml;
  if (typeof renderItemPage === 'function') {
    for (const item of menu.items ?? []) {
      pages.push({ name: `${label}: página do item ${item.id}`, html: renderItemPage(menu, item.id) });
    }
  }
  return pages;
}

test('Orçamento da vitrine pública: vitrines de exemplo publicadas respeitam terceiros, h1, imagens, nomes e idioma', async (t) => {
  for (const storefront of await exampleStorefronts()) {
    if (storefront.skipped) {
      await t.test(storefront.label, (st) => st.skip(storefront.skipped));
      continue;
    }
    await t.test(storefront.label, async () => {
      for (const page of await publishedPages(storefront)) {
        assert.deepEqual(auditStorefrontHtml(page.html), [], page.name);
      }
      renderClientStages(storefront.menu).forEach((html, index) => {
        assert.deepEqual(auditStorefrontHtml(html, { fragment: true }), [], `${storefront.label}: renderizador, passo ${index}`);
      });
    });
  }
});

test('Orçamento da vitrine pública: JS + CSS próprios cabem em 120 KB comprimidos', async (t) => {
  const [storefront] = await exampleStorefronts();
  const html = renderStorefrontHtml(storefront.menu, await templateHtmlPromise);
  const measured = await measureStorefrontBytes(html);
  const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
  const report = `Orçamento da vitrine (JS + CSS próprios, ${measured.files.length} arquivos): ` +
    `gzip ${kb(measured.gzip)} (${measured.gzip} B) de ${kb(STOREFRONT_BUDGET.maxGzipBytes)}; ` +
    `brotli ${kb(measured.brotli)}; sem compressão ${kb(measured.raw)}`;
  console.log(report);
  t.diagnostic(report);
  t.diagnostic(`arquivos: ${measured.files.join(', ')}`);
  assert.ok(measured.files.includes('/vitrine/vitrine.js'));
  assert.ok(measured.files.includes('/assets/storefront-renderer.mjs'));
  assert.ok(measured.files.includes('/vitrine/vitrine.css'));
  assert.ok(measured.gzip <= STOREFRONT_BUDGET.maxGzipBytes, report);
});

test('Orçamento da vitrine pública: o verificador acusa defeitos injetados no modelo', async (t) => {
  const [storefront] = await exampleStorefronts();
  const html = renderStorefrontHtml(storefront.menu, await templateHtmlPromise);
  assert.deepEqual(auditStorefrontHtml(html), []);
  const inject = (marker, extra) => html.replace(marker, `${extra}${marker}`);
  const expectViolation = (mutated, pattern) => {
    const violations = auditStorefrontHtml(mutated);
    assert.ok(violations.some((v) => pattern.test(v)), `esperado ${pattern}, obtido ${JSON.stringify(violations)}`);
  };

  await t.test('script do Google Tag Manager', () => {
    expectViolation(inject('</head>', '<script async src="https://www.googletagmanager.com/gtag/js?id=G-TESTE"></script>'), /script de terceiro/);
  });
  await t.test('folha de estilo e fonte de CDN externa', () => {
    expectViolation(inject('</head>', '<link rel="preconnect" href="https://fonts.googleapis.com">'), /link de terceiro/);
  });
  await t.test('script inline (Pixel)', () => {
    expectViolation(inject('</head>', '<script>fbq("init","1")</script>'), /script inline/);
  });
  await t.test('segundo módulo JS e segunda folha de estilo', () => {
    const mutated = inject('</head>', '<script type="module" src="/vitrine/extra.js"></script><link rel="stylesheet" href="/vitrine/extra.css">');
    expectViolation(mutated, /2 módulos JS/);
    expectViolation(mutated, /2 folhas de estilo/);
  });
  await t.test('img sem alt', () => {
    expectViolation(inject('</main>', '<img src="/assets/pizza-demo.webp" width="640" height="360">'), /img sem alt/);
  });
  await t.test('img sem width e height', () => {
    expectViolation(inject('</main>', '<img src="/assets/pizza-demo.webp" alt="Pizza">'), /img sem width/);
  });
  await t.test('dois h1', () => {
    expectViolation(inject('</main>', '<h1>Outro título</h1>'), /2 h1/);
  });
  await t.test('nenhum h1', () => {
    expectViolation(html.replace(/<h1\b[^>]*>[\s\S]*?<\/h1>/, '<p>Sem título</p>'), /0 h1/);
  });
  await t.test('link e botão sem nome acessível', () => {
    expectViolation(inject('</main>', '<a href="https://instagram.com/x"><svg aria-hidden="true"></svg></a>'), /a sem nome acessível/);
    expectViolation(inject('</main>', '<button type="button"></button>'), /button sem nome acessível/);
  });
  await t.test('"Cart" em texto visível', () => {
    expectViolation(inject('</main>', '<p>Cart</p>'), /"Cart"/);
  });
  await t.test('"Close" como nome acessível', () => {
    expectViolation(inject('</main>', '<button type="button" aria-label="Close">×</button>'), /"Close"/);
  });
  await t.test('img do renderizador sem dimensões', () => {
    const fragment = '<div><img src="/a.webp" alt="Foto" loading="lazy"></div>';
    assert.ok(auditStorefrontHtml(fragment, { fragment: true }).some((v) => /img sem width/.test(v)));
  });
});

test('Orçamento da vitrine pública: foto do hero é WebP de até 200 KB, com dimensões e prioridade alta', async () => {
  const draft = await heroPhotoDraft();
  const { menu } = await compilePublicStorefront(draft, { slug: draft.slug, name: draft.businessName, template: draft.template }, {
    revision: 1,
    publishedAt: '2026-11-14T00:00:00.000Z'
  });
  const html = renderStorefrontHtml(menu);
  const [heroImg, ...others] = tagsOf(stripNonContent(html), 'img').filter(({ attrs }) => !/brand-logo/.test(attrs.class ?? ''));
  assert.ok(heroImg, 'a vitrine de exemplo precisa ter foto no hero');
  assert.match(heroImg.attrs.src, /\.webp$/);
  assert.equal(heroImg.attrs.fetchpriority, 'high');
  assert.ok(!('loading' in heroImg.attrs), 'a foto do hero não pode ser lazy');
  assert.ok(Number(heroImg.attrs.width) > 0 && Number(heroImg.attrs.height) > 0);
  for (const img of others) assert.equal(img.attrs.loading, 'lazy', img.raw);
  const bytes = (await readFile(urlToWebFile(heroImg.attrs.src))).byteLength;
  assert.ok(bytes <= 200 * 1024, `foto do hero com ${bytes} B (máximo 200 KB, ADR 0011)`);
});
