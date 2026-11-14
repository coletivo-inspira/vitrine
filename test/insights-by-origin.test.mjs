import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import { clearPublicationsCache, createApiHandler, createMemoryStore } from '../workers/api.mjs';
import {
  ALLOWED_METRIC_EVENT_TYPES,
  ITEM_METRIC_EVENT_TYPES,
  validateEventsBatchPayload
} from '../src/portal-validation.mjs';
import { applyOriginEntitlement, summarizeOriginMetrics } from '../src/insights-by-origin.mjs';
import {
  METRIC_SOURCES,
  bindRouteClickMetric,
  normalizeMetricSource,
  resolveVisitOrigin
} from '../web/assets/metrics-source.mjs';
import { createStorefrontMetricsCollector } from '../web/vitrine/vitrine.js';
import { renderInsightsOrigin } from '../web/portal/insights-origin.mjs';
import { FREE_ENTITLEMENTS, normalizeEntitlements } from '../src/entitlements.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const migrationsDir = resolve(root, 'supabase/migrations');
const SITE = '20000000-0000-0000-0000-000000000001';
const OWNER = '10000000-0000-0000-0000-000000000001';
const LONG_SOURCE = 'a'.repeat(200);

async function migratedDb() {
  const db = new PGlite();
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
  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) await db.exec(await readFile(resolve(migrationsDir, file), 'utf8'));
  await db.query('insert into auth.users (id) values ($1)', [OWNER]);
  await db.query(
    "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'pizzaria-a', 'Pizzaria A', 'food', 'products-v1')",
    [SITE, OWNER]
  );
  const menu = { slug: 'pizzaria-a', items: [{ id: 'margherita', name: 'Margherita', priceCents: 4800 }] };
  await db.query(
    `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu)
     values ($1, 'pizzaria-a', 1, 'active', $2, $3::jsonb)`,
    [SITE, 'a'.repeat(64), JSON.stringify(menu)]
  );
  return db;
}

async function recordAsAnon(db, events) {
  await db.exec('begin');
  try {
    await db.exec('set local role anon');
    const res = await db.query('select public.record_site_metric_batch($1, $2::jsonb) as accepted', [
      'pizzaria-a',
      JSON.stringify(events)
    ]);
    await db.exec('commit');
    return res.rows[0].accepted;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

test('origem da visita: UTM lido só da URL, lista fechada, desconhecido vira outro', () => {
  assert.deepEqual(resolveVisitOrigin('?utm_source=ig_comment&utm_campaign=reel_01'), {
    source: 'ig_comment',
    campaign: 'reel_01'
  });
  assert.deepEqual(resolveVisitOrigin(''), { source: 'direto', campaign: '' });
  assert.deepEqual(resolveVisitOrigin('?utm_campaign=reel_01'), { source: 'direto', campaign: '' });
  assert.deepEqual(resolveVisitOrigin('?utm_source=QR'), { source: 'qr', campaign: '' });
  assert.deepEqual(resolveVisitOrigin(`?utm_source=${LONG_SOURCE}`), { source: 'outro', campaign: '' });
  assert.deepEqual(resolveVisitOrigin('?utm_source=maria%40email.com&utm_campaign=x'), { source: 'outro', campaign: '' });
  assert.equal(resolveVisitOrigin('?utm_source=ig_bio&utm_campaign=joao%40email.com').campaign, '');
  assert.equal(resolveVisitOrigin('?utm_source=ig_bio&utm_campaign=5551999999999').campaign, '');
  assert.equal(resolveVisitOrigin('?utm_source=ig_bio&utm_campaign=Jo%C3%A3o%20Silva').campaign, '');
  assert.equal(normalizeMetricSource('newsletter'), 'outro');
});

test('lote de eventos: origem normalizada no Worker e ausente nas métricas por item', () => {
  const { events } = validateEventsBatchPayload({
    slug: 'pizzaria-a',
    events: [
      { type: 'visit', source: 'ig_comment', campaign: 'reel_01' },
      { type: 'visit', source: LONG_SOURCE, campaign: 'reel_01' },
      { type: 'visit' },
      { type: 'qr_visit', source: 'qr' },
      { type: 'route_click', source: 'qr' },
      { type: 'item_view', itemId: 'margherita', source: 'ig_comment', campaign: 'reel_01' }
    ]
  }, { now: new Date('2026-11-14T12:00:00Z') });
  assert.deepEqual(events.map(({ type, source, campaign }) => [type, source, campaign]), [
    ['visit', 'ig_comment', 'reel_01'],
    ['visit', 'outro', ''],
    ['visit', '', ''],
    ['qr_visit', 'qr', ''],
    ['route_click', 'qr', ''],
    ['item_view', '', '']
  ]);
});

test('coletor: origem só na memória da página, qr_visit junto da visita e clique em "Traçar rota"', () => {
  const sent = [];
  const navigatorObj = { sendBeacon: (_url, blob) => { sent.push(blob); return true; } };
  const collector = createStorefrontMetricsCollector({
    slug: 'pizzaria-a',
    navigatorObj,
    fetchImpl: null,
    origin: resolveVisitOrigin('?utm_source=qr')
  });
  collector.record('visit', { hour: 10 });
  assert.deepEqual(collector.getQueue(), [
    { type: 'visit', hour: 10, source: 'qr' },
    { type: 'qr_visit', hour: 10, source: 'qr' }
  ]);

  let clickHandler = null;
  const doc = { addEventListener: (type, fn) => { if (type === 'click') clickHandler = fn; } };
  assert.equal(bindRouteClickMetric(doc, (type) => collector.record(type, { hour: 11 })), true);
  clickHandler({ target: { closest: (selector) => (selector === '.storefront-route-button' ? {} : null) } });
  clickHandler({ target: { closest: () => null } });
  assert.equal(sent.length, 1, 'route_click envia o lote na hora, como o WhatsApp');
  assert.deepEqual(collector.getQueue(), []);

  const plain = createStorefrontMetricsCollector({ slug: 'pizzaria-a', navigatorObj: null, fetchImpl: null, origin: resolveVisitOrigin('') });
  plain.record('visit', { hour: 9 });
  assert.deepEqual(plain.getQueue(), [{ type: 'visit', hour: 9, source: 'direto' }]);

  const source = String(createStorefrontMetricsCollector);
  assert.doesNotMatch(source, /localStorage|sessionStorage|document\.cookie/);
});

test('PGlite: migração 20261116000200 grava origem, rota e QR sem dados pessoais', async () => {
  const db = await migratedDb();
  try {
    const sqlNames = (await db.query('select private.site_metric_names() as v')).rows[0].v;
    const sqlItemNames = (await db.query('select private.site_item_metric_names() as v')).rows[0].v;
    const sqlSources = (await db.query('select private.site_metric_sources() as v')).rows[0].v;
    assert.deepEqual(sqlNames, [...ALLOWED_METRIC_EVENT_TYPES]);
    assert.deepEqual(sqlItemNames, [...ITEM_METRIC_EVENT_TYPES]);
    assert.deepEqual(sqlSources, [...METRIC_SOURCES]);

    const accepted = await recordAsAnon(db, [
      { type: 'visit', hour: 19, source: 'ig_comment', campaign: 'reel_01' },
      { type: 'visit', hour: 19, source: 'ig_comment', campaign: 'reel_01' },
      { type: 'visit', hour: 19, source: 'direto' },
      { type: 'visit', hour: 19, source: LONG_SOURCE, campaign: 'reel_01' },
      { type: 'visit', hour: 19, source: 'joao@email.com' },
      { type: 'visit', hour: 19, source: 'ig_bio', campaign: '51999998888' },
      { type: 'visit', hour: 19, source: 'qr' },
      { type: 'qr_visit', hour: 19, source: 'qr' },
      { type: 'route_click', hour: 19, source: 'qr' },
      { type: 'whatsapp_order', hour: 19, source: 'ig_comment', campaign: 'reel_01', estimatedCents: 4800 },
      { type: 'item_view', hour: 19, itemId: 'margherita', source: 'ig_comment', campaign: 'reel_01' },
      { type: 'visit', hour: 19, ip: '203.0.113.9', userAgent: 'Mozilla/5.0', cookie: 'sid=1', name: 'Maria' }
    ]);
    assert.equal(accepted, 12);

    const rows = (await db.query(
      `select metric_name, source, campaign, item_key, count_value::int as n
         from public.site_metrics_daily where site_id = $1
        order by metric_name, source, campaign`,
      [SITE]
    )).rows;
    const find = (name, source, campaign = '') =>
      rows.find((r) => r.metric_name === name && r.source === source && r.campaign === campaign)?.n ?? 0;
    assert.equal(find('visit', 'ig_comment', 'reel_01'), 2);
    assert.equal(find('visit', 'direto'), 1);
    assert.equal(find('visit', 'outro'), 2, '200 caracteres e e-mail viram outro');
    assert.equal(find('visit', 'ig_bio'), 1, 'campanha com telefone é descartada');
    assert.equal(find('visit', ''), 1, 'sem campo source, a linha fica sem origem registrada');
    assert.equal(find('qr_visit', 'qr'), 1);
    assert.equal(find('route_click', 'qr'), 1);
    assert.equal(find('whatsapp_order', 'ig_comment', 'reel_01'), 1);
    assert.equal(rows.find((r) => r.metric_name === 'item_view').source, '');

    const columns = (await db.query(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'site_metrics_daily' order by ordinal_position`
    )).rows.map((r) => r.column_name);
    assert.deepEqual(columns, [
      'site_id', 'metric_date', 'metric_hour', 'item_key', 'metric_name',
      'count_value', 'estimated_cents', 'updated_at', 'source', 'campaign'
    ]);
    const allText = JSON.stringify((await db.query('select * from public.site_metrics_daily')).rows);
    assert.doesNotMatch(allText, /203\.0\.113|Mozilla|sid=|Maria|@|5199999/);

    await assert.rejects(
      db.query(
        `insert into public.site_metrics_daily (site_id, metric_date, metric_hour, metric_name, source)
         values ($1, current_date, 1, 'visit', 'Texto livre')`,
        [SITE]
      ),
      /site_metrics_daily_source_valid_check/
    );
    await assert.rejects(
      db.query(
        `insert into public.site_metrics_daily (site_id, metric_date, metric_hour, metric_name)
         values ($1, current_date, 1, 'notify_click')`,
        [SITE]
      ),
      /site_metrics_daily_metric_name_check/
    );
    await assert.rejects(recordAsAnon(db, [{ type: 'notify_click' }]), /INVALID_EVENTS_BATCH/);

    await db.query(
      `insert into public.site_metrics_daily (site_id, metric_date, metric_hour, metric_name, source, count_value)
       values ($1, (current_date - interval '14 months')::date, 3, 'visit', 'qr', 9)`,
      [SITE]
    );
    await recordAsAnon(db, [{ type: 'visit', source: 'qr' }]);
    const old = await db.query(
      "select count(*)::int as n from public.site_metrics_daily where metric_date < (current_date - interval '13 months')::date"
    );
    assert.equal(old.rows[0].n, 0, 'retenção de 13 meses continua');
  } finally {
    await db.close();
  }
});

test('resumo por origem: funil visitas → cliques no WhatsApp e contagem de rota e QR', () => {
  const rows = [
    { metric_date: '2026-11-14', metric_name: 'visit', source: 'ig_comment', campaign: 'reel_01', count_value: 8 },
    { metric_date: '2026-11-13', metric_name: 'visit', source: 'qr', campaign: '', count_value: 4 },
    { metric_date: '2026-11-13', metric_name: 'whatsapp_order', source: 'ig_comment', campaign: 'reel_01', count_value: 2 },
    { metric_date: '2026-11-13', metric_name: 'qr_visit', source: 'qr', campaign: '', count_value: 4 },
    { metric_date: '2026-11-12', metric_name: 'route_click', source: 'qr', campaign: '', count_value: 3 },
    { metric_date: '2026-11-05', metric_name: 'route_click', source: 'direto', campaign: '', count_value: 1 }
  ];
  const summary = summarizeOriginMetrics(rows, { period: '7d', referenceDate: '2026-11-14' });
  assert.deepEqual(summary.reach, { routeClicks: 3, previousRouteClicks: 1, qrVisits: 4, previousQrVisits: 0 });
  assert.deepEqual(summary.origins.sources.map((s) => [s.source, s.visits, s.orders, s.conversionPercent]), [
    ['ig_comment', 8, 2, 25],
    ['qr', 4, 0, 0]
  ]);
  assert.equal(summary.origins.campaigns[0].campaign, 'reel_01');
  assert.equal(summary.origins.totalVisits, 12);

  const locked = applyOriginEntitlement(summary, FREE_ENTITLEMENTS);
  assert.deepEqual(locked.origins, {
    available: false,
    feature: 'conversion_reports',
    requiredPlan: { code: 'profissional', name: 'Profissional' }
  });
  assert.deepEqual(locked.reach, summary.reach, 'rota e QR ficam em todos os planos');
  const open = applyOriginEntitlement(summary, normalizeEntitlements({ plan_code: 'profissional' }));
  assert.equal(open.origins.available, true);
  assert.equal(open.origins.sources.length, 2);
});

async function postEvents(api, events) {
  const res = await api.fetch(new Request('https://vitrine.inspira.dev.br/api/events', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' },
    body: JSON.stringify({ slug: 'pizza-a', events })
  }));
  assert.equal(res.status, 202);
}

test('Worker: Insights mostram rota e QR para todos e a origem só no Profissional; estranho recebe 404', async () => {
  clearPublicationsCache();
  const nowSeconds = Math.floor(Date.parse('2026-11-14T19:30:00.000Z') / 1000);
  const store = createMemoryStore();
  const api = createApiHandler({ store, nowSeconds: () => nowSeconds });
  const origin = 'https://painel.inspira.dev.br';
  const publish = await api.fetch(new Request(`${origin}/api/sites/${SITE}/publish`, {
    method: 'POST',
    headers: { Authorization: 'Bearer token-owner', Origin: origin }
  }));
  assert.equal(publish.status, 200);

  await postEvents(api, [
    { type: 'visit', hour: 19, source: 'ig_comment', campaign: 'reel_01' },
    { type: 'visit', hour: 19, source: 'qr' },
    { type: 'qr_visit', hour: 19, source: 'qr' },
    { type: 'route_click', hour: 19, source: 'qr' },
    { type: 'whatsapp_order', hour: 19, source: 'ig_comment', campaign: 'reel_01', estimatedCents: 4800 }
  ]);

  const insights = async (token) => api.fetch(new Request(`${origin}/api/sites/${SITE}/insights?period=7d`, {
    headers: { Authorization: `Bearer ${token}` }
  }));

  const stranger = await insights('token-stranger');
  assert.equal(stranger.status, 404);

  const free = (await (await insights('token-owner')).json()).insights;
  assert.deepEqual(free.reach, { routeClicks: 1, previousRouteClicks: 0, qrVisits: 1, previousQrVisits: 0 });
  assert.equal(free.origins.available, false);
  assert.equal(free.origins.requiredPlan.name, 'Profissional');
  assert.equal(free.origins.sources, undefined, 'plano free não recebe o detalhe por origem');
  assert.equal(free.summary.visits, 2);

  store.getSiteEntitlements = async () => ({ plan_code: 'profissional', features: ['conversion_reports'] });
  const pro = (await (await insights('token-owner')).json()).insights;
  assert.equal(pro.origins.available, true);
  const igComment = pro.origins.sources.find((s) => s.source === 'ig_comment');
  assert.deepEqual([igComment.visits, igComment.orders, igComment.conversionPercent], [1, 1, 100]);
  assert.equal(pro.origins.campaigns[0].campaign, 'reel_01');
});

function fakeDocument() {
  const make = (tag) => {
    const node = {
      tag,
      className: '',
      id: '',
      textContent: '',
      style: {},
      attrs: {},
      children: [],
      setAttribute(name, value) { this.attrs[name] = String(value); },
      append(...nodes) { this.children.push(...nodes); },
      replaceChildren() { this.children = []; }
    };
    return node;
  };
  return { createElement: make, createTextNode: (text) => ({ textContent: text, children: [] }) };
}

function allText(node) {
  return [node.textContent ?? '', ...(node.children ?? []).map(allText)].join(' ');
}

test('painel: plano free vê o quadro por origem bloqueado com "Disponível no Profissional"', () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  renderInsightsOrigin(container, {
    reach: { routeClicks: 3, previousRouteClicks: 0, qrVisits: 5, previousQrVisits: 1 },
    origins: { available: false, feature: 'conversion_reports', requiredPlan: { code: 'profissional', name: 'Profissional' } }
  }, doc);
  const text = allText(container);
  assert.match(text, /Disponível no Profissional/);
  assert.match(text, /Visitas pelo QR Code/);
  assert.match(text, /Traçar rota/);
  assert.doesNotMatch(text, /catálogo|cardápio/i);

  const open = doc.createElement('section');
  renderInsightsOrigin(open, {
    reach: { routeClicks: 0, qrVisits: 0 },
    origins: {
      available: true,
      sources: [{ source: 'ig_comment', label: 'Comentário no Instagram', visits: 8, orders: 2, conversionPercent: 25 }],
      campaigns: []
    }
  }, doc);
  const openText = allText(open);
  assert.match(openText, /Comentário no Instagram/);
  assert.match(openText, /2 cliques para enviar no WhatsApp · 25,0% das visitas/);
  assert.doesNotMatch(openText, /Disponível no/);
});
