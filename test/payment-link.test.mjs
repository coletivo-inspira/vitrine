import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  renderStorefrontItemHtml
} from '../src/publication-engine.mjs';
import {
  ALLOWED_METRIC_EVENT_TYPES,
  PAYMENT_LINK_HOSTS,
  validateDraftContent
} from '../src/portal-validation.mjs';
import { summarizeOriginMetrics } from '../src/insights-by-origin.mjs';
import {
  PAYMENT_LINK_NOTICE,
  bindPaymentLinkClickMetric,
  checkPaymentLinkUrl,
  paymentLinkHosts,
  publicPaymentLink
} from '../web/assets/payment-link.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { createStorefrontMetricsCollector } from '../web/vitrine/vitrine.js';
import {
  PAYMENT_LINK_DOMAINS_URL,
  describePaymentLinkProblem,
  loadPaymentLinkDomains,
  renderPaymentLinkField,
  showPaymentLinkServerErrors
} from '../web/portal/payment-link-field.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = JSON.parse(await readFile(resolve(root, 'content/payment-link-domains.json'), 'utf8'));
const SITE_ID = '20000000-0000-0000-0000-000000000001';
const OWNER = '10000000-0000-0000-0000-000000000001';

function draft(items, extra = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    catalogType: 'products',
    slug: 'pizza-a',
    businessName: 'Pizza A',
    whatsapp: '5511987654321',
    components: { name: true, description: true, photo: true, price: true, quantitySelector: true },
    categories: [{
      id: 'cursos',
      name: 'Cursos',
      items: items ?? [
        { id: 'curso', name: 'Curso de massa', priceCents: 19000, active: true, paymentLink: { url: 'https://pay.hotmart.com/A1B2C3?off=x', label: '  Pagar   com cartão ' } },
        { id: 'pizza', name: 'Margherita', priceCents: 4500, active: true, paymentLink: { url: 'https://mpago.la/2xYz' } },
        { id: 'aula', name: 'Aula ao vivo', priceCents: 9000, active: true, availability: 'soon', paymentLink: { url: 'https://mpago.la/aula' } },
        { id: 'leilao', name: 'Forno antigo', priceCents: 10000, active: true, priceMode: 'offer', paymentLink: { url: 'https://mpago.la/forno' } },
        { id: 'troca', name: 'Pá de pizza', priceCents: 0, active: true, priceMode: 'trade', paymentLink: { url: 'https://mpago.la/pa' } },
        { id: 'semlink', name: 'Calzone', priceCents: 5200, active: true }
      ]
    }],
    ...extra
  };
}

const compile = (content) =>
  compilePublicStorefront(content, { slug: 'pizza-a', name: 'Pizza A', template: 'pizzeria-v1' }, { maxActiveItems: 100 });

const withLink = (paymentLink) => draft([{ id: 'a', name: 'A', priceCents: 100, active: true, paymentLink }]);

test('Issue #134 — lista única de domínios: um arquivo, hosts exatos, sem curinga', async () => {
  const hosts = config.domains.map((entry) => entry.host);
  assert.deepEqual([...PAYMENT_LINK_HOSTS], hosts, 'o servidor lê content/payment-link-domains.json');
  for (const host of [
    'mpago.la', 'mpago.li', 'link.mercadopago.com.br', 'www.mercadopago.com.br', 'pay.hotmart.com', 'www.asaas.com',
    'sandbox.asaas.com', 'pag.ae', 'pagseguro.uol.com.br', 'picpay.me', 'buy.stripe.com', 'pay.kiwify.com.br', 'www.sympla.com.br'
  ]) {
    assert.ok(hosts.includes(host), `lista proposta na issue: ${host}`);
  }
  assert.ok(hosts.every((host) => !host.includes('*') && !host.startsWith('.') && host === host.toLowerCase()));
  assert.throws(() => paymentLinkHosts({ domains: ['*.mpago.la'] }));
  assert.throws(() => paymentLinkHosts({ domains: ['mpago.la', 'mpago.la'] }));

  const build = await readFile(resolve(root, 'scripts/build.mjs'), 'utf8');
  assert.match(build, /content\/payment-link-domains\.json/);
  assert.match(build, /assets\/payment-link-domains\.json/);
  assert.equal(PAYMENT_LINK_DOMAINS_URL, '/assets/payment-link-domains.json', 'o editor lê a cópia do build');
});

test('Issue #134 — servidor recusa http, javascript:, fora da lista, subdomínio, porta e credenciais com erro no campo', () => {
  assert.doesNotThrow(() => validateDraftContent(withLink({ url: 'https://mpago.la/abc' })));
  assert.doesNotThrow(() => validateDraftContent(withLink({ url: 'https://www.asaas.com/c/123', label: 'x'.repeat(32) })));
  assert.doesNotThrow(() => validateDraftContent(withLink(null)));

  const refused = [
    ['http://mpago.la/abc', 'INVALID_PAYMENT_LINK'],
    ['javascript:alert(1)', 'INVALID_PAYMENT_LINK'],
    ['JAVASCRIPT:alert(1)//https://mpago.la', 'INVALID_PAYMENT_LINK'],
    ['https://evil.example/pay', 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED'],
    ['https://x.mpago.la/abc', 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED'],
    ['https://mpago.la.evil.example/abc', 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED'],
    ['https://mpago.la./abc', 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED'],
    ['https://asaas.com/c/1', 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED'],
    ['https://mpago.la:443/abc', 'INVALID_PAYMENT_LINK'],
    ['https://mpago.la:8443/abc', 'INVALID_PAYMENT_LINK'],
    ['https://user:senha@mpago.la/abc', 'INVALID_PAYMENT_LINK'],
    ['https://evil.example@mpago.la/abc', 'INVALID_PAYMENT_LINK'],
    ['https://mpago.la\\@evil.example/', 'INVALID_PAYMENT_LINK'],
    ['https://mpago.la/a b', 'INVALID_PAYMENT_LINK'],
    ['', 'INVALID_PAYMENT_LINK']
  ];
  for (const [url, code] of refused) {
    let error;
    try {
      validateDraftContent(withLink({ url }));
    } catch (caught) {
      error = caught;
    }
    assert.ok(error, `deveria recusar ${url}`);
    assert.equal(error.code, code, url);
    assert.equal(error.status, 422);
    const body = error.toJSON().error;
    assert.equal(body.field, 'paymentLink.url');
    assert.deepEqual(body.fieldErrors.map((entry) => [entry.field, entry.itemId]), [['paymentLink.url', 'a']]);
  }
  const outside = (() => { try { validateDraftContent(withLink({ url: 'https://evil.example/pay' })); } catch (e) { return e; } })();
  assert.match(outside.message, /Fale com a equipe Vitrine Inspira/);

  assert.throws(() => validateDraftContent(withLink({ url: 'https://mpago.la/a', label: 'x'.repeat(33) })), (error) =>
    error.code === 'INVALID_PAYMENT_LINK' && error.toJSON().error.field === 'paymentLink.label');
  assert.throws(() => validateDraftContent(withLink({ url: 'https://mpago.la/a', extra: 1 })), { code: 'INVALID_PAYMENT_LINK' });
  assert.throws(() => validateDraftContent(withLink('https://mpago.la/a')), { code: 'INVALID_PAYMENT_LINK' });
  assert.throws(() => validateDraftContent(withLink({ url: 'https://mpago.la/a', label: 'Concorra a um sorteio' })), { code: 'RAFFLE_NOT_ALLOWED' });
});

test('Issue #134 — publicação: só itens com link aceito, sem "Em breve", lance ou troca, e sem parâmetros novos', async () => {
  const { menu } = await compile(draft());
  const byId = new Map(menu.items.map((item) => [item.id, item]));
  assert.deepEqual(byId.get('curso').paymentLink, { url: 'https://pay.hotmart.com/A1B2C3?off=x', label: 'Pagar com cartão' });
  assert.deepEqual(byId.get('pizza').paymentLink, { url: 'https://mpago.la/2xYz' });
  for (const id of ['aula', 'leilao', 'troca', 'semlink']) assert.equal(byId.get(id).paymentLink, undefined, id);
  assert.deepEqual(menu.categories[0].items.find((item) => item.id === 'curso').paymentLink, byId.get('curso').paymentLink);

  assert.doesNotThrow(() => assertNoPrivateLeakage(structuredClone(menu)));
  const leak = (mutate) => {
    const copy = structuredClone(menu);
    mutate(copy.items.find((item) => item.id === 'pizza'));
    assert.throws(() => assertNoPrivateLeakage(copy), { code: 'PRIVATE_FIELD_LEAKAGE' });
  };
  leak((item) => { item.paymentLink.url = 'https://evil.example/x'; });
  leak((item) => { item.paymentLink.url = 'https://mpago.la/2xYz?utm_source=vitrine&x=1 '; });
  leak((item) => { item.paymentLink.token = 'x'; });
  leak((item) => { item.paymentLink.label = ''; });
  leak((item) => { item.availability = 'soon'; });

  await assert.rejects(compile(withLink({ url: 'https://evil.example/pay' })), { code: 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED' });
});

test('Issue #134 — página do item: link abaixo da seleção, nova aba, noopener e aviso; nada no "Em breve"', async () => {
  const { menu } = await compile(draft());
  const main = renderStorefrontItemHtml(menu, 'curso-de-massa').match(/<main[\s\S]*<\/main>/)[0];
  const select = main.indexOf('data-item-select');
  const payment = main.indexOf('sf-payment-link-box');
  assert.ok(select > 0 && payment > select, 'abaixo do controle de seleção');
  assert.ok(main.indexOf('Pedir no WhatsApp') < payment, 'o WhatsApp vem antes (ação principal)');
  const link = main.match(/<a class="sf-secondary-button sf-payment-link"[^>]*>/)[0];
  assert.match(link, /href="https:\/\/pay\.hotmart\.com\/A1B2C3\?off=x"/);
  assert.match(link, /target="_blank"/);
  assert.match(link, /rel="noopener noreferrer"/);
  assert.match(link, /data-payment-link/);
  assert.match(main, /Pagar com cartão<svg[\s\S]*?\(abre em nova aba\)/);
  assert.ok(main.includes(PAYMENT_LINK_NOTICE));
  assert.equal(PAYMENT_LINK_NOTICE, 'O pagamento é feito no site do negócio. A Vitrine Inspira não recebe nem guarda dados de pagamento.');

  const pizza = renderStorefrontItemHtml(menu, 'margherita').match(/<main[\s\S]*<\/main>/)[0];
  assert.match(pizza, />Pagar no site do negócio</, 'texto padrão');

  for (const slug of ['aula-ao-vivo', 'forno-antigo', 'calzone']) {
    const other = renderStorefrontItemHtml(menu, slug).match(/<main[\s\S]*<\/main>/)[0];
    assert.doesNotMatch(other, /sf-payment-link|data-payment-link/, slug);
  }
  assert.equal(publicPaymentLink({ availability: 'soon', paymentLink: { url: 'https://mpago.la/a' } }), null);
  assert.equal(publicPaymentLink({ paymentLink: { url: 'javascript:alert(1)' } }), null);
  for (const word of [/checkout/i, /carrinho/i, /finalizar compra/i]) assert.doesNotMatch(main, word);
});

// DOM mínimo para a etapa "Revisar e enviar" e para o campo do editor.
class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.listeners = {};
    this.dataset = {};
    this.className = '';
    this._text = '';
    this.value = '';
    this.isConnected = true;
    this.classList = { add: (...t) => { this.className = [...this.className.split(' '), ...t].filter(Boolean).join(' '); } };
  }
  get textContent() { return this._text + this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(value) { this.childNodes = []; this._text = String(value ?? ''); }
  appendChild(child) { this.childNodes.push(child); return child; }
  append(...nodes) { nodes.forEach((n) => this.appendChild(typeof n === 'string' ? Object.assign(new Node('#text'), { _text: n }) : n)); }
  replaceChildren() { this.childNodes = []; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  focus() { this.focused = true; }
  all() { return this.childNodes.flatMap((n) => [n, ...n.all()]); }
  byClass(name) { return this.all().filter((n) => String(n.className).split(' ').includes(name)); }
}

function withFakeDocument(run) {
  const previous = globalThis.document;
  const rootNode = new Node('body');
  globalThis.document = {
    createElement: (tag) => new Node(tag),
    createElementNS: (_ns, tag) => new Node(tag),
    createTextNode: (text) => Object.assign(new Node('#text'), { _text: text }),
    getElementById: (id) => rootNode.all().find((n) => n.id === id) ?? null
  };
  return Promise.resolve()
    .then(() => run(rootNode))
    .finally(() => { globalThis.document = previous; });
}

test('Issue #134 — "Revisar e enviar": link dos itens escolhidos, fora do total e da mensagem', async () => {
  const { menu } = await compile(draft());
  await withFakeDocument(() => {
    const renderer = new StorefrontRenderer(null, menu, { isPublicPage: true });
    const curso = menu.items.find((item) => item.id === 'curso');
    const semlink = menu.items.find((item) => item.id === 'semlink');
    renderer.setQuantity(curso, 1);
    renderer.setQuantity(semlink, 1);
    const totalBefore = renderer.getCartTotal();
    const card = new Node('section');
    renderer.renderReviewPaymentLinks(card);
    const box = card.byClass('review-payment-links')[0];
    assert.ok(box, 'seção de pagamento na revisão');
    const links = box.byClass('sf-payment-link');
    assert.equal(links.length, 1, 'só o item escolhido com link');
    assert.equal(links[0].href, 'https://pay.hotmart.com/A1B2C3?off=x');
    assert.equal(links[0].target, '_blank');
    assert.equal(links[0].rel, 'noopener noreferrer');
    assert.equal(links[0].getAttribute('aria-label'), 'Pagar com cartão: Curso de massa (abre em nova aba)');
    assert.ok(box.textContent.includes(PAYMENT_LINK_NOTICE));
    assert.equal(renderer.getCartTotal(), totalBefore, 'o link não muda o total');
    assert.equal(totalBefore, 19000 + 5200);
    assert.doesNotMatch(renderer.buildOrderMessage(), /hotmart|mpago/, 'o link não entra na mensagem');

    const empty = new Node('section');
    const onlyPlain = new StorefrontRenderer(null, menu, { isPublicPage: true });
    onlyPlain.setQuantity(semlink, 1);
    onlyPlain.renderReviewPaymentLinks(empty);
    assert.equal(empty.childNodes.length, 0, 'sem itens com link, sem seção');
  });
});

test('Issue #134 — editor: renderizar não altera o item, erro local e do servidor no campo', async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, '/assets/payment-link-domains.json');
    return { ok: true, json: async () => ({ domains: config.domains }) };
  };
  await withFakeDocument(async (body) => {
    const domains = await loadPaymentLinkDomains(fetchImpl);
    assert.equal(domains.length, config.domains.length);
    assert.equal(describePaymentLinkProblem('https://mpago.la/x'), '');
    assert.match(describePaymentLinkProblem('https://evil.example/x'), /não está na lista/);
    assert.match(describePaymentLinkProblem('http://mpago.la/x'), /https:\/\//);
    assert.equal(describePaymentLinkProblem('https://evil.example/x', null), '', 'sem a lista, o servidor decide o domínio');

    const item = { id: 'a1', name: 'Curso', paymentLink: { url: 'https://evil.example/pay', label: 'Pagar' } };
    const before = JSON.stringify(item);
    let changes = 0;
    renderPaymentLinkField(item, body, { onChange: () => { changes += 1; } });
    assert.equal(JSON.stringify(item), before, 'renderizar não muda o rascunho (sem PUT no carregamento)');
    assert.equal(changes, 0);
    const url = document.getElementById('item-payment-url-a1');
    const problem = document.getElementById(url.dataset.problemId);
    assert.match(problem.textContent, /evil\.example não está na lista/);
    assert.equal(url.getAttribute('aria-invalid'), 'true');
    assert.ok(body.byClass('item-fields-full').length >= 1, 'campo em largura total');
    assert.ok(body.all().some((n) => n.textContent === 'Sites de pagamento aceitos'));

    url.value = 'https://mpago.la/certo';
    url.listeners.input.forEach((fn) => fn({}));
    assert.deepEqual(item.paymentLink, { url: 'https://mpago.la/certo', label: 'Pagar' });
    assert.equal(changes, 1);
    assert.equal(problem.textContent, '');

    url.value = '   ';
    url.listeners.input.forEach((fn) => fn({}));
    assert.equal(item.paymentLink, undefined, 'apagar o endereço remove o link');

    const serverError = {
      code: 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED',
      field: 'paymentLink.url',
      fieldErrors: [{ field: 'paymentLink.url', itemId: 'a1', message: 'O site x não está na lista.' }]
    };
    assert.equal(showPaymentLinkServerErrors(serverError), 'a1');
    assert.equal(problem.textContent, 'O site x não está na lista.');
    assert.equal(url.focused, true);
    assert.equal(showPaymentLinkServerErrors({ fieldErrors: [{ field: 'localSeo.city' }] }), '');
  });
});

test('Issue #134 — métrica payment_link_click: clique, coletor, resumo e lista única JS × SQL', async () => {
  assert.ok(ALLOWED_METRIC_EVENT_TYPES.includes('payment_link_click'));
  assert.ok(ALLOWED_METRIC_EVENT_TYPES.includes('notify_click'), 'mantém a métrica do #133');

  const recorded = [];
  const listeners = [];
  bindPaymentLinkClickMetric({ addEventListener: (type, fn) => listeners.push([type, fn]) }, (type) => recorded.push(type));
  const click = (matches) => listeners[0][1]({ target: { closest: (selector) => (matches && selector === '[data-payment-link]' ? {} : null) } });
  click(true);
  click(false);
  assert.deepEqual(recorded, ['payment_link_click'], 'só a contagem, sem dado do visitante');

  const sent = [];
  const collector = createStorefrontMetricsCollector({
    slug: 'pizza-a',
    validItemIds: ['curso'],
    navigatorObj: { sendBeacon: (_url, blob) => { sent.push(blob); return true; } },
    fetchImpl: async () => ({ ok: true }),
    origin: { source: 'ig_bio', campaign: '' }
  });
  assert.equal(collector.record('payment_link_click'), true);

  const summary = summarizeOriginMetrics([
    { metric_date: '2026-11-14', metric_name: 'payment_link_click', source: 'direto', count_value: 4 },
    { metric_date: '2026-11-03', metric_name: 'payment_link_click', source: 'direto', count_value: 2 }
  ], { period: '7d', referenceDate: '2026-11-14' });
  assert.equal(summary.reach.paymentLinkClicks, 4);
  assert.equal(summary.reach.previousPaymentLinkClicks, 2);

  const db = new PGlite();
  try {
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
    const dir = resolve(root, 'supabase/migrations');
    for (const file of (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()) {
      await db.exec(await readFile(resolve(dir, file), 'utf8'));
    }
    const sqlNames = (await db.query('select private.site_metric_names() as v')).rows[0].v;
    assert.deepEqual(sqlNames, [...ALLOWED_METRIC_EVENT_TYPES]);
    const itemNames = (await db.query('select private.site_item_metric_names() as v')).rows[0].v;
    assert.equal(itemNames.includes('payment_link_click'), false, 'métrica da vitrine, sem item');

    await db.query('insert into auth.users (id) values ($1)', [OWNER]);
    await db.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'pizza-a', 'Pizza A', 'food', 'products-v1')",
      [SITE_ID, OWNER]
    );
    await db.query(
      `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu)
       values ($1, 'pizza-a', 1, 'active', $2, $3::jsonb)`,
      [SITE_ID, 'a'.repeat(64), JSON.stringify({ slug: 'pizza-a', items: [{ id: 'curso', name: 'Curso', priceCents: 19000 }] })]
    );
    await db.exec('begin');
    await db.exec('set local role anon');
    await db.query('select public.record_site_metric_batch($1, $2::jsonb)', [
      'pizza-a',
      JSON.stringify([{ type: 'payment_link_click', source: 'ig_bio' }, { type: 'notify_click', source: 'ig_bio' }])
    ]);
    await db.exec('commit');
    const rows = (await db.query(
      "select metric_name, item_key, source, count_value from public.site_metrics_daily order by metric_name"
    )).rows;
    assert.deepEqual(rows, [
      { metric_name: 'notify_click', item_key: '', source: 'ig_bio', count_value: 1 },
      { metric_name: 'payment_link_click', item_key: '', source: 'ig_bio', count_value: 1 }
    ]);
  } finally {
    await db.close();
  }
});

test('Issue #134 — termos de uso: pagamento fora da plataforma, sem intermediação, comissão ou estornos', async () => {
  const html = await readFile(resolve(root, 'web/termos/index.html'), 'utf8');
  const section = html.match(/<h2 id="vendas">Vendas do seu negócio<\/h2>[\s\S]*?<\/section>/)?.[0];
  assert.ok(section);
  const paragraph = section.match(/<p id="link-de-pagamento">([\s\S]*?)<\/p>/)?.[1] ?? '';
  for (const phrase of [/link de pagamento/, /fora da Vitrine Inspira/, /não intermedeia/, /não cobra comissão/, /estornos/, /provedor que ele escolheu/]) {
    assert.match(paragraph, phrase);
  }
});

test('Issue #134 — vocabulário: nada de "checkout", "carrinho", "finalizar compra", "catálogo" ou "cardápio" nas telas novas', async () => {
  for (const file of ['web/assets/payment-link.mjs', 'web/portal/payment-link-field.mjs']) {
    const source = await readFile(resolve(root, file), 'utf8');
    const strings = [...source.matchAll(/'([^'\n]*)'|`([^`]*)`/g)].map((m) => m[1] ?? m[2]).join('\n');
    for (const word of [/checkout/i, /carrinho/i, /finalizar compra/i, /catálogo/i, /cardápio/i]) {
      assert.doesNotMatch(strings, word, `${file}: ${word}`);
    }
  }
  assert.equal(checkPaymentLinkUrl('https://buy.stripe.com/test_123', PAYMENT_LINK_HOSTS).url, 'https://buy.stripe.com/test_123');
});
