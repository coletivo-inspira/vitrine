import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import {
  assertPublishableSocialProof, projectShowcaseManifest, resolveShowcaseManifest
} from '../src/showcase-structure.mjs';
import { FAQ_SERVICE_SUGGESTIONS, renderFaqBlock } from '../web/assets/faq-block.mjs';
import { TESTIMONIAL_CONSENT_LABEL, renderStructureFields } from '../web/portal/showcase-structure.js';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';

const loja1 = JSON.parse(await readFile(new URL('../content/vitrines/loja1.json', import.meta.url), 'utf8'));
const css = await readFile(new URL('../web/vitrine/vitrine.css', import.meta.url), 'utf8');

const testimonial = (name, extra = {}) => ({
  name, quote: `A aula com a Laura mudou meu jeito de trabalhar o barro, ${name}.`,
  context: 'Turma de cerâmica de sábado', consent: true, ...extra
});

function draftWith(...sections) {
  return {
    ...loja1,
    slug: 'atelie-depoimentos',
    structure: { pages: [{ slug: 'home', title: 'Início', sections: [
      { id: 'abertura', moduleCode: 'hero', config: { headline: 'Ateliê Barro Vivo' } },
      { id: 'itens', moduleCode: 'catalog_grid', config: {} },
      ...sections
    ] }] }
  };
}

const publish = async (draft) => (await compilePublicStorefront(draft, { slug: draft.slug, name: draft.businessName, template: draft.template }, {
  revision: 1, publishedAt: '2026-11-14T00:00:00.000Z'
})).menu;

const depoimentos = (items) => ({ id: 'depoimentos', moduleCode: 'testimonials', config: { items } });
const perguntas = (config) => ({ id: 'perguntas', moduleCode: 'faq', config });

test('depoimento sem consentimento é recusado na publicação, com o campo apontado', async () => {
  const draft = draftWith(depoimentos([testimonial('Ana'), testimonial('Bia', { consent: false }), testimonial('Caio', { consent: undefined })]));
  await assert.rejects(publish(draft), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.code, 'TESTIMONIAL_CONSENT_REQUIRED');
    assert.deepEqual(error.toJSON().error.missingFields, ['depoimentos.items.1.consent', 'depoimentos.items.2.consent']);
    assert.match(error.message, /Tenho autorização desta pessoa para publicar o depoimento/);
    return true;
  });
});

test('Worker: salvar a estrutura com depoimento sem consentimento devolve 422 e missingFields', async () => {
  const store = createMemoryStore();
  const site = [...store.sites.values()][0];
  const api = createApiHandler({ store });
  const origin = 'https://vitrine.inspira.dev.br';
  const send = (method, body) => api(new Request(`${origin}/api/sites/${site.id}/structure`, {
    method,
    headers: { origin, authorization: 'Bearer token-owner', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  const { revision } = await (await send('GET')).json();
  const pages = [{ slug: 'home', title: 'Início', sections: [depoimentos([{ name: 'Ana', quote: 'Ótimo.' }])] }];
  const refused = await send('PUT', { expectedRevision: revision, pages });
  assert.equal(refused.status, 422);
  const { error } = await refused.json();
  assert.equal(error.code, 'TESTIMONIAL_CONSENT_REQUIRED');
  assert.deepEqual(error.missingFields, ['depoimentos.items.0.consent']);

  pages[0].sections[0].config.items[0].consent = true;
  const saved = await send('PUT', { expectedRevision: revision, pages });
  assert.equal(saved.status, 200);
});

test('limites: até 12 depoimentos e perguntas, contexto de até 60 caracteres e pergunta com resposta', () => {
  const home = (...sections) => ({ pages: [{ slug: 'home', title: 'Início', sections }] });
  const twelve = Array.from({ length: 12 }, (_, index) => testimonial(`Pessoa ${index}`));
  assert.doesNotThrow(() => assertPublishableSocialProof(resolveShowcaseManifest(home(depoimentos(twelve))).pages));
  assert.throws(() => assertPublishableSocialProof(resolveShowcaseManifest(home(depoimentos([...twelve, testimonial('Mais')]))).pages),
    { code: 'INVALID_TESTIMONIALS' });
  assert.throws(() => resolveShowcaseManifest(home(depoimentos([testimonial('Ana', { context: 'x'.repeat(61) })]))),
    { code: 'INVALID_STRUCTURE' });
  assert.throws(() => resolveShowcaseManifest(home(depoimentos([testimonial('Ana', { photoUrl: 'https://cdn.exemplo.com/a.jpg' })]))),
    { code: 'INVALID_STRUCTURE' });
  assert.throws(() => assertPublishableSocialProof([{ sections: [depoimentos([testimonial('', {})])] }]), { code: 'INVALID_TESTIMONIALS' });
  const faqItems = Array.from({ length: 13 }, (_, index) => ({ q: `Pergunta ${index}?`, a: 'Sim.' }));
  assert.throws(() => assertPublishableSocialProof([{ sections: [perguntas({ items: faqItems })] }]), { code: 'INVALID_FAQ' });
  assert.throws(() => assertPublishableSocialProof([{ sections: [perguntas({ items: [{ q: 'Tem garantia?', a: '' }] })] }]), { code: 'INVALID_FAQ' });
  assert.throws(() => resolveShowcaseManifest(home(perguntas({ title: 'x'.repeat(81), items: [] }))), { code: 'INVALID_STRUCTURE' });
});

test('3 depoimentos viram cartões com citação, nome e contexto; foto com alt vazio e dimensões', async () => {
  const menu = await publish(draftWith(depoimentos([
    testimonial('Marina Souza', { photoUrl: '/assets/pizza-demo.webp' }), testimonial('Rui'), { name: 'Zé', quote: 'Recomendo.', consent: true }
  ])));
  const section = menu.structure.pages[0].sections.find((entry) => entry.id === 'depoimentos');
  assert.ok(section.config.items.every((item) => !('consent' in item)), 'o consentimento não vai para o artefato público');

  const html = renderStorefrontHtml(menu);
  const block = html.match(/<section id="depoimentos" class="storefront-module storefront-testimonials" aria-labelledby="depoimentos-titulo">[\s\S]*?<\/section>/)[0];
  assert.match(block, /<h2 id="depoimentos-titulo">Depoimentos<\/h2>/);
  assert.match(block, /<ul class="storefront-testimonials-list" data-count="3">/);
  assert.equal(block.match(/<li class="storefront-testimonial">/g).length, 3);
  assert.equal(block.match(/<blockquote><p>/g).length, 3);
  assert.match(block, /<img src="\/assets\/pizza-demo\.webp" alt="" width="56" height="56" loading="lazy" decoding="async">/);
  assert.equal(block.match(/<img /g).length, 1, 'sem foto, sem imagem vazia');
  assert.match(block, /<span class="storefront-testimonial-name">Marina Souza<\/span><span class="storefront-testimonial-context">Turma de cerâmica de sábado<\/span>/);
  assert.match(block, /<span class="storefront-testimonial-name">Zé<\/span><\/span>/);
  assert.doesNotMatch(html, /carrossel|autoplay|setInterval/i);
});

test('perguntas frequentes: details nativo, título editável, ícone decorativo e componente reaproveitável', async () => {
  const html = renderStorefrontHtml(await publish(draftWith(perguntas({
    title: 'Dúvidas sobre as aulas',
    items: [{ q: 'Quais são as formas de pagamento?', a: 'Pix ou cartão.' }, { q: 'E se eu faltar?', a: 'Você repõe em outra turma.' }]
  }))));
  const block = html.match(/<section id="perguntas" class="storefront-module storefront-faq" aria-labelledby="perguntas-titulo">[\s\S]*?<\/section>/)[0];
  assert.match(block, /<h2 id="perguntas-titulo">Dúvidas sobre as aulas<\/h2>/);
  assert.equal(block.match(/<details class="storefront-faq-item">/g).length, 2);
  assert.match(block, /<summary><span class="storefront-faq-question">Quais são as formas de pagamento\?<\/span><svg class="storefront-faq-icon"[^>]*aria-hidden="true"/);
  assert.doesNotMatch(block, /<details[^>]* open/, 'começam fechadas');

  const itemPage = renderFaqBlock({ items: [{ q: 'Tem garantia?', a: '90 dias.' }, { q: 'Sem resposta', a: ' ' }] },
    { id: 'item-perguntas', headingLevel: 3, className: 'item-section' });
  assert.match(itemPage, /^<section id="item-perguntas" class="item-section storefront-faq" aria-labelledby="item-perguntas-titulo">/);
  assert.match(itemPage, /<h3 id="item-perguntas-titulo">Perguntas frequentes<\/h3>/);
  assert.equal(itemPage.match(/<details/g).length, 1);
  assert.equal(renderFaqBlock({ items: [] }), '');
  assert.match(renderFaqBlock({ items: [{ q: '<b>?', a: '"x"' }] }), /&lt;b&gt;\?[\s\S]*&quot;x&quot;/);
});

test('vitrines já publicadas com testimonials e faq renderizam sem os campos novos', () => {
  const legacy = {
    slug: 'antiga', name: 'Vitrine antiga', whatsapp: '5511999999999', currency: 'BRL', items: [], categories: [],
    structure: projectShowcaseManifest({ pages: [{ slug: 'home', title: 'Início', sections: [
      { id: 'dep', moduleCode: 'testimonials', config: { items: [{ name: 'Ana', quote: 'Peça linda.' }] } },
      { id: 'faq', moduleCode: 'faq', config: { items: [{ q: 'Qual o prazo?', a: 'Até 20 dias.' }] } }
    ] }] })
  };
  const html = renderStorefrontHtml(legacy);
  assert.match(html, /<span class="storefront-testimonial-name">Ana<\/span><\/span>/);
  assert.match(html, /<h2 id="faq-titulo">Perguntas frequentes<\/h2>/);
  assert.match(html, /Até 20 dias\./);
});

function cssBlock(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return css.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]*)\\}`))?.[1] ?? '';
}

function luminance(hex) {
  const [r, g, b] = hex.slice(1).match(/.{2}/g).map((part) => parseInt(part, 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('CSS: 1 coluna no celular e 3 no desktop, alvo ≥ 44 px, ícone sem animação com movimento reduzido', () => {
  assert.match(cssBlock('.storefront-testimonials-list'), /grid-template-columns: minmax\(0, 1fr\);/);
  assert.match(css, /@media \(min-width: 900px\) \{\s*\.storefront-testimonials-list:not\(\[data-count="1"\], \[data-count="2"\], \[data-count="4"\]\) \{\s*grid-template-columns: repeat\(3, minmax\(0, 1fr\)\);/);
  const minHeight = Number(cssBlock('.storefront-faq-item summary').match(/min-height: (\d+)px/)[1]);
  assert.ok(minHeight >= 44);
  assert.match(cssBlock('.storefront-faq-item[open] .storefront-faq-icon'), /transform: rotate\(45deg\);/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.storefront-faq-icon \{\s*transition: none;/);
  assert.doesNotMatch(css, /storefront-testimonial[^{]*\{[^}]*animation/);
});

test('CSS: contraste ≥ 4,5:1 do texto dos cartões e das respostas nos dois temas', () => {
  const tokens = (block) => Object.fromEntries([...block.matchAll(/--([a-z-]+): (#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2]]));
  const light = tokens(css.match(/:root \{([^}]*)\}/)[1]);
  const dark = tokens(css.match(/html\[data-theme="dark"\] \{([^}]*)\}/)[1]);
  assert.match(cssBlock('.storefront-testimonial'), /background-color: var\(--surface\);[\s\S]*color: var\(--ink\);/);
  for (const theme of [light, dark]) {
    for (const text of ['ink', 'ink-soft']) {
      assert.ok(contrast(theme[text], theme.surface) >= 4.5, `${text} sobre surface`);
      assert.ok(contrast(theme[text], theme.paper) >= 4.5, `${text} sobre paper`);
    }
  }
});

class Node {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.classes = new Set();
    this.classList = { add: (...names) => names.forEach((name) => this.classes.add(name)), contains: (name) => this.classes.has(name) };
    this.value = '';
    this.text = '';
    this.hidden = false;
    this.checked = false;
  }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this.children = []; this.text = String(value ?? ''); }
  get textContent() { return this.text + this.children.map((child) => child.textContent ?? '').join(''); }
  set innerHTML(value) { this.html = value; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(node)); }
  replaceChildren(...nodes) { this.children = []; this.append(...nodes); }
  remove() { this.parentNode.children = this.parentNode.children.filter((child) => child !== this); }
  insertBefore(node) { this.appendChild(node); }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  dispatchEvent(event) {
    for (let node = this; node; node = event.bubbles ? node.parentNode : null) {
      (node.listeners[event.type] ?? []).forEach((listener) => listener(event));
    }
  }
  focus() { this.ownerDocument.activeElement = this; }
  click() { (this.listeners.click ?? []).forEach((listener) => listener({})); }
  *walk() { yield this; for (const child of this.children) yield* child.walk(); }
}

function fieldsByLabel(root, caption) {
  const nodes = [...root.walk()];
  return nodes.filter((node) => node.tagName === 'LABEL' && node.text === caption)
    .map((label) => nodes.find((node) => node.id === label.attributes.for));
}

test('editor: consentimento obrigatório com erro no campo, sugestões de perguntas e nada novo sem mudança', async () => {
  const doc = { createElement: (tag) => new Node(tag, doc) };
  const root = new Node('div', doc);
  const saved = [];
  renderStructureFields(root, { pages: [{ slug: 'home', title: 'Início', sections: [
    depoimentos([{ name: 'Ana', quote: 'Peça linda.' }]),
    perguntas({ items: [{ q: 'Qual o prazo?', a: 'Até 20 dias.' }] })
  ] }] }, async (payload) => saved.push(payload));
  const form = root.children[0];
  const submit = () => form.listeners.submit[0]({ preventDefault() {} });
  const nodes = () => [...root.walk()];

  const consentLabels = nodes().filter((node) => node.tagName === 'LABEL' && node.textContent === TESTIMONIAL_CONSENT_LABEL);
  assert.equal(consentLabels.length, 1);
  const consent = nodes().find((node) => node.id === consentLabels[0].attributes.for);
  assert.equal(consent.type, 'checkbox');
  assert.equal(consent.checked, false, 'depoimento antigo começa sem autorização marcada');

  await submit();
  assert.equal(saved.length, 0, 'sem autorização não salva');
  assert.equal(consent.getAttribute('aria-invalid'), 'true');
  assert.equal(doc.activeElement, consent);
  const errorId = consent.getAttribute('aria-describedby').split(' ').at(-1);
  const error = nodes().find((node) => node.id === errorId);
  assert.equal(error.hidden, false);
  assert.equal(error.getAttribute('role'), 'alert');

  consent.checked = true;
  await submit();
  assert.equal(saved.length, 1);
  assert.deepEqual(saved[0].pages[0].sections[0].config, { items: [{ name: 'Ana', quote: 'Peça linda.', consent: true }] });
  assert.deepEqual(saved[0].pages[0].sections[1].config, { items: [{ q: 'Qual o prazo?', a: 'Até 20 dias.' }] },
    'sem mudança, a FAQ não ganha título');
  assert.doesNotThrow(() => assertPublishableSocialProof(resolveShowcaseManifest(saved[0]).pages));

  const [context] = fieldsByLabel(root, 'Serviço ou turma');
  assert.equal(context.maxLength, 60);
  context.value = 'Turma de sábado';
  const suggestions = nodes().filter((node) => node.classes.has('structure-faq-suggestion'));
  assert.deepEqual(suggestions.map((node) => node.getAttribute('data-question')), FAQ_SERVICE_SUGGESTIONS);
  suggestions[0].click();
  assert.equal(suggestions[0].hidden, true, 'pergunta usada sai das sugestões');
  const answers = fieldsByLabel(root, 'Resposta');
  assert.equal(answers.length, 2);
  assert.equal(doc.activeElement, answers[1]);
  await submit();
  assert.equal(saved.length, 1, 'sugestão sem resposta não salva');
  assert.equal(answers[1].getAttribute('aria-invalid'), 'true');
  answers[1].value = 'Pix, cartão ou boleto.';
  fieldsByLabel(root, 'Título da seção')[0].value = 'Dúvidas comuns';
  await submit();
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[1].pages[0].sections[0].config.items[0], { name: 'Ana', quote: 'Peça linda.', context: 'Turma de sábado', consent: true });
  assert.deepEqual(saved[1].pages[0].sections[1].config, {
    title: 'Dúvidas comuns',
    items: [{ q: 'Qual o prazo?', a: 'Até 20 dias.' }, { q: FAQ_SERVICE_SUGGESTIONS[0], a: 'Pix, cartão ou boleto.' }]
  });

  consent.checked = false;
  assert.equal(form.showFieldErrors(['depoimentos.items.0.consent']), true, 'erro do servidor volta ao campo');
  assert.equal(consent.getAttribute('aria-invalid'), 'true');
  assert.equal(form.showFieldErrors(['outra.items.0.consent']), false);
});
