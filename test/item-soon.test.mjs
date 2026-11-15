import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  renderStorefrontCatalogMarkup,
  renderStorefrontItemHtml
} from '../src/publication-engine.mjs';
import { ALLOWED_METRIC_EVENT_TYPES, validateDraftContent } from '../src/portal-validation.mjs';
import { summarizeOriginMetrics } from '../src/insights-by-origin.mjs';
import {
  applyItemVisibilityState,
  buildNotifyHref,
  itemVisibilityState
} from '../web/assets/item-availability.mjs';
import { MILA_WHATSAPP, buildMilaRelayCode } from '../web/assets/mila-relay.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { createStorefrontMetricsCollector } from '../web/vitrine/vitrine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const SITE_ID = '20000000-0000-0000-0000-000000000001';
const OWNER = '10000000-0000-0000-0000-000000000001';

function draft(extra = {}) {
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
      items: [
        { id: 'margherita', name: 'Margherita', priceCents: 4500, active: true },
        { id: 'aula', name: 'Aula de pizza', priceCents: 18000, active: true, availability: 'soon', availabilityLabel: '  Próxima turma   em março ' },
        { id: 'oficina', name: 'Oficina de massa', priceCents: 9000, active: true, availability: 'soon' },
        { id: 'calzone', name: 'Calzone', priceCents: 5200, active: false, availability: 'soon', availabilityLabel: 'Volta logo' }
      ]
    }],
    ...extra
  };
}

const compile = (content) =>
  compilePublicStorefront(content, { slug: 'pizza-a', name: 'Pizza A', template: 'pizzeria-v1' }, { maxActiveItems: 100 });

const textOf = (href) => decodeURIComponent(new URL(href).searchParams.get('text'));

test('Issue #133 — publicação: "Em breve" no snapshot, oculto fora e `available` continua bloqueado', async () => {
  const { menu } = await compile(draft());
  const byId = new Map(menu.items.map((item) => [item.id, item]));
  assert.equal(byId.has('calzone'), false, 'item oculto não aparece');
  assert.equal(byId.get('margherita').availability, undefined, 'Disponível é o padrão e não ocupa o snapshot');
  assert.equal(byId.get('aula').availability, 'soon');
  assert.equal(byId.get('aula').availabilityLabel, 'Próxima turma em março');
  assert.equal(byId.get('oficina').availabilityLabel, undefined);
  assert.equal(menu.categories[0].items.find((item) => item.id === 'aula').availability, 'soon');

  const clone = structuredClone(menu);
  assert.doesNotThrow(() => assertNoPrivateLeakage(clone));
  const leak = (mutate) => {
    const copy = structuredClone(menu);
    mutate(copy);
    assert.throws(() => assertNoPrivateLeakage(copy), { code: 'PRIVATE_FIELD_LEAKAGE' });
  };
  leak((copy) => { copy.items[0].available = true; });
  leak((copy) => { copy.categories[0].items[0].available = false; });
  leak((copy) => { copy.items[0].availability = 'hidden'; });
  leak((copy) => { copy.items[0].availabilityLabel = 'Sem estado'; });
  leak((copy) => { copy.items.find((item) => item.id === 'aula').availabilityLabel = 'x'.repeat(25); });
});

test('Issue #133 — rascunho: texto do selo até 24 caracteres e estado fechado', () => {
  const withItem = (item) => draft({ categories: [{ id: 'c', name: 'C', items: [{ id: 'a', name: 'A', priceCents: 100, active: true, ...item }] }] });
  assert.doesNotThrow(() => validateDraftContent(withItem({ availability: 'soon', availabilityLabel: 'x'.repeat(24) })));
  assert.throws(() => validateDraftContent(withItem({ availabilityLabel: 'x'.repeat(25) })), { code: 'INVALID_ITEM_AVAILABILITY' });
  assert.throws(() => validateDraftContent(withItem({ availability: 'later' })), { code: 'INVALID_ITEM_AVAILABILITY' });
  assert.throws(() => validateDraftContent(withItem({ availability: 'soon', availabilityLabel: 'Sorteio em março' })), { code: 'RAFFLE_NOT_ALLOWED' });
});

test('Issue #133 — editor: seletor único, rascunhos antigos viram Disponível ou Oculto sem perda', () => {
  assert.equal(itemVisibilityState({ active: true }), 'available');
  assert.equal(itemVisibilityState({}), 'available');
  assert.equal(itemVisibilityState({ available: false }), 'hidden');
  assert.equal(itemVisibilityState({ active: false, availability: 'soon' }), 'hidden');
  assert.equal(itemVisibilityState({ active: true, availability: 'soon' }), 'soon');

  const item = { id: 'a', name: 'A', active: true, available: true, availabilityLabel: 'Em março' };
  applyItemVisibilityState(item, 'soon');
  assert.deepEqual(item, { id: 'a', name: 'A', active: true, available: true, availabilityLabel: 'Em março', availability: 'soon' });
  applyItemVisibilityState(item, 'hidden');
  assert.equal(item.active, false);
  assert.equal(item.available, false);
  applyItemVisibilityState(item, 'available');
  assert.deepEqual(item, { id: 'a', name: 'A', active: true, available: true, availabilityLabel: 'Em março' });
});

test('Issue #133 — "Avise-me": nome do item no wa.me; no modo Mila, número e código da Mila', async () => {
  const { menu } = await compile(draft());
  const aula = menu.items.find((item) => item.id === 'aula');
  const direct = buildNotifyHref(menu, aula);
  assert.match(direct, /^https:\/\/wa\.me\/5511987654321\?text=/);
  assert.equal(textOf(direct), 'Olá! Quero ser avisado(a) quando Aula de pizza estiver disponível.');

  const { menu: viaMila } = await compile(draft({ orderRelay: 'mila' }));
  const milaHref = buildNotifyHref(viaMila, viaMila.items.find((item) => item.id === 'aula'));
  assert.ok(milaHref.startsWith(`https://wa.me/${MILA_WHATSAPP}?text=`));
  assert.ok(textOf(milaHref).startsWith(`#${buildMilaRelayCode('pizza-a')}`));
  assert.match(textOf(milaHref), /Aula de pizza estiver disponível\.$/);
  assert.doesNotMatch(milaHref, /5511987654321/);
  assert.equal(buildNotifyHref({ whatsapp: '123' }, aula), '', 'sem número válido não há link');
});

test('Issue #133 — HTML sem JavaScript: selo e "Avise-me" na grade e na página do item', async () => {
  const { menu } = await compile(draft());
  const { sectionsHtml } = renderStorefrontCatalogMarkup(menu);
  const aulaCard = sectionsHtml.match(/<article class="menu-item-card is-soon" data-item-id="aula">[\s\S]*?<\/article>/)?.[0];
  assert.ok(aulaCard, 'cartão "Em breve" na grade');
  assert.match(aulaCard, /<p class="sf-soon-badge">Próxima turma em março<\/p>/);
  assert.match(aulaCard, /Avise-me pelo WhatsApp/);
  assert.doesNotMatch(aulaCard, /Pedir no WhatsApp/);
  assert.match(sectionsHtml, /data-item-id="oficina">[\s\S]*?sf-soon-badge">Em breve</);

  const html = renderStorefrontItemHtml(menu, 'aula-de-pizza');
  const main = html.match(/<main[\s\S]*<\/main>/)[0];
  assert.match(main, /<span class="sf-soon-badge">Próxima turma em março<\/span>/);
  assert.match(main, /class="whatsapp-order-button sf-notify-button" href="https:\/\/wa\.me\/5511987654321\?text=[^"]*Aula%20de%20pizza/);
  assert.doesNotMatch(main, /Pedir no WhatsApp/);
  assert.equal((main.match(/<h1/g) ?? []).length, 1);
});

test('Issue #133 — seleção: item "Em breve" não entra por clique, sessionStorage manipulado, total ou mensagem', async () => {
  const { menu } = await compile(draft());
  const renderer = new StorefrontRenderer(null, menu, { isPublicPage: true });
  const aula = menu.items.find((item) => item.id === 'aula');
  const margherita = menu.items.find((item) => item.id === 'margherita');

  renderer.setQuantity(aula, 1);
  renderer.toggleSingleSelect(aula);
  assert.equal(renderer.submitOffer(aula, '50,00'), false);
  assert.equal(renderer.submitTrade(aula, 'livros'), false);
  assert.equal(renderer.cart.has('aula'), false);

  const result = renderer.restoreSelection({ aula: 2, oficina: 1, margherita: 1 });
  assert.deepEqual(result, { restored: 1, discarded: 2 });
  renderer.cart.set('aula', 3);
  assert.equal(renderer.getCartTotal(), margherita.priceCents);
  assert.deepEqual(renderer.getSelectedEntries().map((entry) => entry.item.id), ['margherita']);
  assert.deepEqual(renderer.getPersistableSelection(), { margherita: 1 });
});

// DOM mínimo para conferir o cartão e o clique em "Avise-me".
class Node {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase();
    this.childNodes = [];
    this.attributes = {};
    this.listeners = {};
    this.className = '';
    this._text = '';
    this.classList = { add: (...t) => { this.className = [...this.className.split(' '), ...t].filter(Boolean).join(' '); } };
  }
  get textContent() { return this._text + this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(value) { this.childNodes = []; this._text = String(value ?? ''); }
  appendChild(child) { this.childNodes.push(child); return child; }
  append(...nodes) { nodes.forEach((n) => this.appendChild(n)); }
  replaceChildren() { this.childNodes = []; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  getAttribute(k) { return this.attributes[k] ?? null; }
  addEventListener(type, fn) { (this.listeners[type] ??= []).push(fn); }
  all() { return this.childNodes.flatMap((n) => [n, ...n.all()]); }
  byClass(name) { return this.all().filter((n) => String(n.className).split(' ').includes(name)); }
}

test('Issue #133 — grade e página do item com JavaScript: selo, sem quantidade e notify_click', async () => {
  const { menu } = await compile(draft());
  const previous = globalThis.document;
  const previousRecord = globalThis.recordStorefrontEvent;
  const events = [];
  globalThis.document = { createElement: (tag) => new Node(tag), createElementNS: (_ns, tag) => new Node(tag) };
  globalThis.recordStorefrontEvent = (type, payload) => events.push([type, payload]);
  try {
    const container = new Node('div');
    new StorefrontRenderer(container, menu, { isPublicPage: true }).render();
    const card = container.all().find((n) => n.attributes['data-item-id'] === 'aula' && n.tagName === 'ARTICLE');
    assert.match(card.className, /is-soon/);
    assert.equal(card.byClass('sf-soon-badge')[0].textContent, 'Próxima turma em março');
    assert.equal(card.byClass('qty-selector').length, 0);
    const notify = card.byClass('sf-notify-button')[0];
    assert.equal(notify.textContent, 'Avise-me pelo WhatsApp');
    assert.equal(notify.getAttribute('aria-label'), 'Avise-me pelo WhatsApp: Aula de pizza');
    notify.listeners.click.forEach((fn) => fn({}));
    assert.deepEqual(events, [['notify_click', undefined]], 'só a contagem, sem dado pessoal');

    const focus = new Node('div');
    new StorefrontRenderer(focus, menu, { isPublicPage: true, focusItemId: 'aula' }).render();
    assert.equal(focus.byClass('sf-notify-button').length, 1);
    assert.equal(focus.byClass('sf-soon-note').length, 1);
    assert.equal(focus.byClass('storefront-catalog').length, 0, 'página do item não desenha a grade');
  } finally {
    globalThis.document = previous;
    if (previousRecord === undefined) delete globalThis.recordStorefrontEvent;
    else globalThis.recordStorefrontEvent = previousRecord;
  }
});

test('Issue #133 — métrica notify_click: coletor, resumo e lista única JS × SQL', async () => {
  assert.ok(ALLOWED_METRIC_EVENT_TYPES.includes('notify_click'));
  const collector = createStorefrontMetricsCollector({
    slug: 'pizza-a',
    validItemIds: ['aula'],
    navigatorObj: { sendBeacon: () => true },
    fetchImpl: async () => ({ ok: true }),
    origin: { source: 'ig_bio', campaign: '' }
  });
  assert.equal(collector.record('notify_click'), true);

  const summary = summarizeOriginMetrics([
    { metric_date: '2026-11-14', metric_name: 'notify_click', source: 'direto', count_value: 3 },
    { metric_date: '2026-11-03', metric_name: 'notify_click', source: 'direto', count_value: 1 }
  ], { period: '7d', referenceDate: '2026-11-14' });
  assert.equal(summary.reach.notifyClicks, 3);
  assert.equal(summary.reach.previousNotifyClicks, 1);

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
    assert.equal(itemNames.includes('notify_click'), false, 'métrica da vitrine, sem item');

    await db.query('insert into auth.users (id) values ($1)', [OWNER]);
    await db.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'pizza-a', 'Pizza A', 'food', 'products-v1')",
      [SITE_ID, OWNER]
    );
    await db.query(
      `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu)
       values ($1, 'pizza-a', 1, 'active', $2, $3::jsonb)`,
      [SITE_ID, 'a'.repeat(64), JSON.stringify({ slug: 'pizza-a', items: [{ id: 'aula', name: 'Aula de pizza', priceCents: 18000 }] })]
    );
    await db.exec('begin');
    await db.exec('set local role anon');
    await db.query('select public.record_site_metric_batch($1, $2::jsonb)', [
      'pizza-a',
      JSON.stringify([{ type: 'notify_click', source: 'ig_bio' }])
    ]);
    await db.exec('commit');
    const rows = (await db.query(
      "select item_key, source, count_value from public.site_metrics_daily where metric_name = 'notify_click'"
    )).rows;
    assert.deepEqual(rows, [{ item_key: '', source: 'ig_bio', count_value: 1 }]);
  } finally {
    await db.close();
  }
});
