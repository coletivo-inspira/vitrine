import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { projectShowcaseManifest, resolveShowcaseManifest } from '../src/showcase-structure.mjs';
import { MILA_WHATSAPP, buildMilaRelayCode } from '../web/assets/mila-relay.mjs';
import { renderStructureFields } from '../web/portal/showcase-structure.js';
import { heroPhotoDraft } from './fixtures/hero-photo-storefront.mjs';
import { STOREFRONT_STORAGE_CSP_HEADER, createApiHandler, createMemoryStore } from '../workers/api.mjs';

const site = (draft) => ({ slug: draft.slug, name: draft.businessName, template: draft.template });
const publish = async (draft) => (await compilePublicStorefront(draft, site(draft), {
  revision: 1, publishedAt: '2026-11-14T00:00:00.000Z'
})).menu;

function homeWith(...sections) {
  return { pages: [{ slug: 'home', title: 'Início', sections }] };
}

function hero(config) {
  return { id: 'abertura', moduleCode: 'hero', config };
}

function expectRejected(structure, pattern = /./) {
  assert.throws(() => resolveShowcaseManifest(structure), (error) => {
    assert.equal(error.status, 422);
    assert.match(`${error.code} ${error.message}`, pattern);
    return true;
  });
}

test('hero: foto sem descrição é recusada com erro apontando o campo imageAlt', () => {
  assert.throws(() => resolveShowcaseManifest(homeWith(hero({ imageUrl: 'https://cdn.exemplo.com/foto.webp' }))), (error) => {
    assert.equal(error.code, 'HERO_IMAGE_ALT_REQUIRED');
    assert.deepEqual(error.toJSON().error.missingFields, ['abertura.imageAlt']);
    return true;
  });
});

test('hero: publicar a vitrine com foto sem descrição também é recusado', async () => {
  const draft = await heroPhotoDraft();
  delete draft.structure.pages[0].sections[0].config.imageAlt;
  await assert.rejects(publish(draft), { code: 'HERO_IMAGE_ALT_REQUIRED' });
});

test('hero: limites de texto, WebP e destinos das ações', () => {
  expectRejected(homeWith(hero({ eyebrow: 'x'.repeat(41) })));
  expectRejected(homeWith(hero({ primaryAction: { label: 'x'.repeat(29), target: 'selecao' } })));
  expectRejected(homeWith(hero({ primaryAction: { label: 'Ver', target: 'https://exemplo.com' } })));
  expectRejected(homeWith(hero({ primaryAction: { label: 'Ver' } })));
  expectRejected(homeWith(hero({ secondaryAction: { label: '', target: 'whatsapp' } })));
  expectRejected(homeWith(hero({ imageUrl: 'https://cdn.exemplo.com/foto.jpg', imageAlt: 'Foto' })));
  expectRejected(homeWith(hero({ imageUrl: 'http://cdn.exemplo.com/foto.webp', imageAlt: 'Foto' })));
  expectRejected(homeWith(hero({ imageUrl: '/assets/../segredo.webp', imageAlt: 'Foto' })));
  expectRejected(homeWith(hero({ imageAlt: '<script>alert(1)</script>', imageUrl: '/a.webp' })));

  const { pages } = resolveShowcaseManifest(homeWith(hero({
    eyebrow: '', imageUrl: '/assets/pizza-demo.webp', imageAlt: 'Pizza',
    primaryAction: { label: 'x'.repeat(28), target: 'pagina:sobre' },
    secondaryAction: { label: 'Ver depoimentos', target: '#depoimentos' }
  })));
  assert.equal(pages[0].sections[0].config.eyebrow, '');
  assert.equal(pages[0].sections[0].config.primaryAction.target, 'pagina:sobre');
});

test('destaques: de 2 a 4 itens, ícones da lista fechada e até 60 caracteres', () => {
  const highlights = (items) => homeWith({ id: 'destaques', moduleCode: 'highlights', config: { items } });
  const item = (text = 'Turmas pequenas', icon = 'pessoas') => ({ icon, text });
  expectRejected(highlights([item()]), /INVALID_HIGHLIGHTS/);
  expectRejected(highlights([item(), item(), item(), item(), item()]), /INVALID_HIGHLIGHTS/);
  expectRejected(highlights([item(), item('Ok', 'foguete')]));
  expectRejected(highlights([item(), item('x'.repeat(61))]));
  expectRejected(highlights([item(), item('')]), /INVALID_HIGHLIGHTS/);
  assert.doesNotThrow(() => resolveShowcaseManifest(highlights([])));
  assert.doesNotThrow(() => resolveShowcaseManifest(highlights([item(), item('x'.repeat(60), 'estrela')])));
});

test('hero com foto: imagem com dimensões e prioridade alta, depois do texto, e duas ações', async () => {
  const html = renderStorefrontHtml(await publish(await heroPhotoDraft()));
  const heroHtml = html.match(/<section id="abertura" class="storefront-hero has-photo"[\s\S]*?<\/section>/)[0];
  assert.ok(heroHtml.indexOf('storefront-hero-copy') < heroHtml.indexOf('storefront-hero-media'),
    'o texto vem antes da foto no HTML (à esquerda no desktop; o CSS sobe a foto no celular)');
  assert.match(heroHtml, /<img src="\/assets\/pizza-demo-hero\.webp" alt="Pizza margherita[^"]*" width="800" height="1000" fetchpriority="high" decoding="async">/);
  assert.match(heroHtml, /<p class="storefront-eyebrow">Pizzaria de bairro desde 2012<\/p>/);
  assert.match(heroHtml, /<a class="storefront-hero-primary" href="#storefront-catalog">Ver a vitrine<\/a>/);
  const whatsapp = heroHtml.match(/<a class="storefront-hero-secondary" href="([^"]+)" target="_blank" rel="noopener noreferrer">Conversar no WhatsApp<\/a>/);
  assert.ok(whatsapp, 'link secundário para o WhatsApp');
  const url = new URL(whatsapp[1].replace(/&amp;/g, '&'));
  assert.equal(url.origin + url.pathname, 'https://wa.me/5511999999999');
  assert.equal(url.searchParams.get('text'), 'Olá! Vi a vitrine Forno & Praça Pizzaria Artesanal e gostaria de conversar.');
  assert.ok(html.includes('id="storefront-catalog"'), 'o destino "selecao" existe na página');
  assert.ok(!html.includes('as="font"'), 'com foto no hero, as fontes não disputam banda com o LCP');
});

test('hero: "whatsapp" respeita o modo Mila (ADR 0012) e "pagina:" e âncoras levam à seção certa', async () => {
  const draft = await heroPhotoDraft();
  draft.orderRelay = 'mila';
  draft.structure.pages[0].sections[0].config.primaryAction = { label: 'Sobre nós', target: 'pagina:sobre' };
  draft.structure.pages[0].sections[0].config.secondaryAction = { label: 'Destaques', target: '#destaques' };
  draft.structure.pages.push({ slug: 'sobre', title: 'Sobre', sections: [{ id: 'historia', moduleCode: 'about_story', config: { bio: 'Desde 2012.' } }] });
  let html = renderStorefrontHtml(await publish(draft));
  assert.match(html, /class="storefront-hero-primary" href="#pagina-sobre"/);
  assert.ok(html.includes('id="pagina-sobre"'));
  assert.match(html, /class="storefront-hero-secondary" href="#destaques"/);

  draft.structure.pages[0].sections[0].config.secondaryAction = { label: 'Falar conosco', target: 'whatsapp' };
  html = renderStorefrontHtml(await publish(draft));
  const href = html.match(/class="storefront-hero-secondary" href="([^"]+)"/)[1].replace(/&amp;/g, '&');
  const url = new URL(href);
  assert.equal(url.pathname, `/${MILA_WHATSAPP}`);
  assert.ok(!href.includes('5511999999999'), 'o número do dono não aparece no modo Mila');
  assert.ok(url.searchParams.get('text').startsWith(`#${buildMilaRelayCode(draft.slug)}`));
});

test('destaques: 4 itens com ícone aria-hidden e texto legível', async () => {
  const html = renderStorefrontHtml(await publish(await heroPhotoDraft()));
  const block = html.match(/<section id="destaques" class="storefront-highlights" aria-label="Destaques">[\s\S]*?<\/section>/)[0];
  assert.match(block, /data-count="4"/);
  assert.equal(block.match(/<li class="storefront-highlight">/g).length, 4);
  assert.equal(block.match(/<svg[^>]*aria-hidden="true"/g).length, 4);
  assert.match(block, /<span>Entrega no bairro em até 40 minutos<\/span>/);
});

test('vitrines publicadas antes da mudança renderizam o hero igual', async () => {
  const draft = await heroPhotoDraft();
  draft.structure.pages[0].sections = [
    { id: 'abertura', moduleCode: 'hero', config: { headline: 'Forno & Praça', subtitle: 'Pizza na lenha.' } },
    { id: 'itens', moduleCode: 'catalog_grid', config: {} }
  ];
  const html = renderStorefrontHtml(await publish(draft));
  assert.ok(html.includes(`<section id="abertura" class="storefront-hero" aria-labelledby="storefront-name">
      <div class="storefront-hero-copy">
        <p class="storefront-eyebrow">Atendimento direto no WhatsApp</p>
        <h1 id="storefront-name">Forno &amp; Praça</h1>
        <p id="storefront-subtitle" class="storefront-subtitle">Pizza na lenha.</p>
      </div>
      
    </section>`));
  assert.ok(!html.includes('storefront-hero-actions') && !html.includes('<figure'));

  const legacy = JSON.parse(await readFile(new URL('../content/vitrines/loja1.json', import.meta.url), 'utf8'));
  const legacyHtml = renderStorefrontHtml(await publish(legacy));
  assert.ok(legacyHtml.includes('<p class="storefront-eyebrow">Atendimento direto no WhatsApp</p>'));
  assert.ok(!legacyHtml.includes('has-photo'));
  assert.equal(html.match(/rel="preload" href="\/assets\/fonts\/[a-z-]+\.ttf" as="font"/g).length, 2,
    'sem foto no hero, as fontes continuam pré-carregadas');
});

test('projeção pública mantém os campos novos e o artefato passa na checagem de vazamento', async () => {
  const menu = await publish(await heroPhotoDraft());
  const projected = projectShowcaseManifest({ themeOverrides: menu.structure.theme, navigationMenus: menu.structure.navigation, pages: menu.structure.pages });
  assert.deepEqual(projected, menu.structure);
  assert.equal(menu.structure.pages[0].sections[1].config.items.length, 4);
});

test('Worker: foto do hero no armazenamento libera só a origem do Supabase em img-src', async () => {
  const draft = await heroPhotoDraft();
  draft.structure.pages[0].sections[0].config.imageUrl =
    'https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/catalog-images/foto-hero.webp';
  const { publication } = await compilePublicStorefront(draft, site(draft), { revision: 1, publishedAt: '2026-11-14T00:00:00.000Z' });
  const store = createMemoryStore();
  await store.savePublication(publication);
  const api = createApiHandler({ store });
  const response = await api.fetch(new Request(`https://vitrine.inspira.dev.br/${draft.slug}`));
  assert.equal(response.status, 200);
  assert.ok(response.headers.get('content-security-policy').startsWith(STOREFRONT_STORAGE_CSP_HEADER));
  assert.match(await response.text(), /fetchpriority="high"/);
});

test('CSS: foto à direita a partir de 800 px e acima do texto no celular; destaques em 4 e 2 colunas', async () => {
  const css = await readFile(new URL('../web/vitrine/vitrine.css', import.meta.url), 'utf8');
  assert.match(css, /\.storefront-hero-media \{\s*order: -1;/);
  assert.match(css, /@media \(min-width: 800px\) \{\s*\.storefront-hero\.has-photo \{\s*grid-template-columns: minmax\(0, 1\.1fr\) minmax\(0, \.9fr\);[\s\S]*?\.storefront-hero-media \{\s*order: 0;/);
  assert.match(css, /\.storefront-highlights-list \{[^}]*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /\.storefront-highlights-list\[data-count="4"\] \{\s*grid-template-columns: repeat\(4, minmax\(0, 1fr\)\);/);
  const primary = css.match(/\.storefront-hero-primary \{[^}]*\}/)[0];
  assert.match(primary, /overflow-wrap: normal;/);
  assert.match(primary, /word-break: normal;/);
  assert.match(primary, /min-height: 48px;/);
});

class Node {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase();
    this.ownerDocument = doc;
    this.children = [];
    this.attributes = {};
    this.listeners = {};
    this.classes = new Set();
    this.classList = {
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name)),
      contains: (name) => this.classes.has(name)
    };
    this.value = '';
    this.text = '';
    this.hidden = false;
  }
  set className(value) { this.classes = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get className() { return [...this.classes].join(' '); }
  set textContent(value) { this.children = []; this.text = String(value ?? ''); }
  get textContent() { return this.text + this.children.map((child) => child.textContent ?? '').join(''); }
  set innerHTML(value) { this.html = value; }
  get lastElementChild() { return this.children.at(-1) ?? null; }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  append(...nodes) { nodes.forEach((node) => this.appendChild(typeof node === 'string' ? Object.assign(new Node('#text', this.ownerDocument), { text: node }) : node)); }
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
  click() {}
  *walk() { yield this; for (const child of this.children) yield* child.walk(); }
}

function fieldByLabel(root, caption) {
  const nodes = [...root.walk()];
  const label = nodes.find((node) => node.tagName === 'LABEL' && node.text === caption);
  assert.ok(label, `campo "${caption}"`);
  return nodes.find((node) => node.id === label.attributes.for);
}

test('editor: campos do hero e dos destaques, prévia e erro no campo da descrição da foto', async () => {
  const doc = { createElement: (tag) => new Node(tag, doc) };
  const root = new Node('div', doc);
  const saved = [];
  renderStructureFields(root, homeWith(
    hero({ headline: 'Forno & Praça', subtitle: 'Pizza na lenha.' }),
    { id: 'destaques', moduleCode: 'highlights', config: {} },
    { id: 'itens', moduleCode: 'catalog_grid', config: {} }
  ), async (payload) => saved.push(payload));
  const form = root.children[0];
  const submit = () => form.listeners.submit[0]({ preventDefault() {} });

  const eyebrow = fieldByLabel(root, 'Rótulo acima do título');
  assert.equal(eyebrow.value, 'Atendimento direto no WhatsApp');
  assert.equal(eyebrow.maxLength, 40);
  assert.equal(fieldByLabel(root, 'Botão principal: texto').maxLength, 28);
  assert.equal(fieldByLabel(root, 'Texto do destaque 1').maxLength, 60);
  const targets = [...fieldByLabel(root, 'Botão principal: destino').children].map((option) => option.value);
  assert.deepEqual(targets, ['', 'selecao', 'whatsapp', '#destaques', '#itens']);

  await submit();
  assert.equal(saved.length, 1);
  const untouched = saved[0].pages[0].sections[0].config;
  assert.ok(!('eyebrow' in untouched) && !('imageUrl' in untouched) && !('primaryAction' in untouched),
    'sem mudança, o hero continua sem os campos novos');
  assert.deepEqual(saved[0].pages[0].sections[1].config, { items: [] });

  const image = fieldByLabel(root, 'Foto do cabeçalho (endereço WebP)');
  image.value = '/assets/pizza-demo.webp';
  image.dispatchEvent({ type: 'input', bubbles: true });
  const preview = [...root.walk()].find((node) => node.classes.has('structure-hero-preview'));
  assert.ok(preview.classes.has('has-photo'));
  await submit();
  assert.equal(saved.length, 1, 'foto sem descrição não salva');
  const alt = fieldByLabel(root, 'Descrição da foto (para leitores de tela)');
  assert.equal(alt.getAttribute('aria-invalid'), 'true');
  assert.equal(doc.activeElement, alt);

  alt.value = 'Pizza margherita sobre a mesa';
  eyebrow.value = '';
  fieldByLabel(root, 'Botão principal: texto').value = 'Ver a vitrine';
  fieldByLabel(root, 'Botão principal: destino').value = 'selecao';
  fieldByLabel(root, 'Texto do destaque 1').value = 'Entrega em 40 minutos';
  await submit();
  assert.equal(saved.length, 1, 'um destaque sozinho não salva');
  fieldByLabel(root, 'Ícone do destaque 2').value = 'local';
  fieldByLabel(root, 'Texto do destaque 2').value = 'Retirada no balcão';
  await submit();
  assert.equal(saved.length, 2);
  assert.deepEqual(saved[1].pages[0].sections[0].config, {
    headline: 'Forno & Praça', subtitle: 'Pizza na lenha.', eyebrow: '',
    imageUrl: '/assets/pizza-demo.webp', imageAlt: 'Pizza margherita sobre a mesa',
    primaryAction: { label: 'Ver a vitrine', target: 'selecao' }
  });
  assert.deepEqual(saved[1].pages[0].sections[1].config.items, [
    { icon: 'estrela', text: 'Entrega em 40 minutos' },
    { icon: 'local', text: 'Retirada no balcão' }
  ]);
  assert.doesNotThrow(() => resolveShowcaseManifest(saved[1]));
});
