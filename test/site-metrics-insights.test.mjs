import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';
import {
  clearPublicationsCache,
  createApiHandler
} from '../workers/api.mjs';
import {
  ALLOWED_INSIGHTS_PERIODS,
  ALLOWED_METRIC_EVENT_TYPES,
  MAX_EVENTS_BATCH_SIZE,
  computeStorefrontInsights,
  isBotUserAgent,
  validateEventsBatchPayload,
  validateInsightsPeriod
} from '../src/portal-validation.mjs';
import { renderStorefrontHtml } from '../src/publication-engine.mjs';
import { createStorefrontMetricsCollector } from '../web/vitrine/vitrine.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const migrationsDir = resolve(root, 'supabase/migrations');

const USER_OWNER_A = '10000000-0000-0000-0000-000000000001';
const USER_MEMBER_A = '10000000-0000-0000-0000-000000000002';
const USER_STRANGER = '10000000-0000-0000-0000-000000000003';
const SITE_A = '20000000-0000-0000-0000-000000000001';
const SITE_B = '20000000-0000-0000-0000-000000000002';

async function setupPgliteWithMigrations() {
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
  for (const file of files) {
    const sql = await readFile(resolve(migrationsDir, file), 'utf8');
    await db.exec(sql);
  }

  await db.query('insert into auth.users (id) values ($1), ($2), ($3)', [
    USER_OWNER_A,
    USER_MEMBER_A,
    USER_STRANGER
  ]);
  return db;
}

async function asRole(db, userId, fn, role = 'authenticated', commitTransaction = false) {
  await db.exec('begin');
  try {
    await db.exec(`set local role ${role}`);
    await db.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? '']);
    const result = await fn();
    if (commitTransaction) {
      await db.exec('commit');
    } else {
      await db.exec('rollback');
    }
    return result;
  } catch (err) {
    await db.exec('rollback');
    throw err;
  }
}

test('Spec 008 PR (e) - Métricas Agregadas sem Dados Pessoais e Painel de Insights', async (t) => {
  await t.test('1. PGlite: migração 202611120003_site_metrics_daily.sql, SECURITY DEFINER upsert, retenção de 13 meses e RLS restrito a membros', async () => {
    const db = await setupPgliteWithMigrations();
    t.after(() => db.close());

    await db.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'pizzaria-a', 'Pizzaria A', 'food', 'products-v1')",
      [SITE_A, USER_OWNER_A]
    );
    await db.query(
      "insert into public.sites (id, owner_user_id, slug, name, storefront_type, template) values ($1, $2, 'loja-b', 'Loja B', 'art', 'products-v1')",
      [SITE_B, USER_STRANGER]
    );
    await db.query(
      'insert into public.site_memberships (site_id, user_id) values ($1, $2)',
      [SITE_A, USER_MEMBER_A]
    );

    const activeMenu = {
      schemaVersion: 1,
      template: 'pizzeria-v1',
      storefrontType: 'food',
      catalogType: 'products',
      slug: 'pizzaria-a',
      name: 'Pizzaria A',
      whatsapp: '5551999999999',
      currency: 'BRL',
      items: [
        { id: 'refrigerante', name: 'Refrigerante', priceCents: 700 },
        { id: 'margherita', name: 'Margherita', priceCents: 4800 }
      ],
      categories: [
        {
          id: 'bebidas',
          name: 'Bebidas',
          items: [{ id: 'refrigerante', name: 'Refrigerante', priceCents: 700 }]
        },
        {
          id: 'pizzas',
          name: 'Pizzas',
          items: [{ id: 'margherita', name: 'Margherita', priceCents: 4800 }]
        }
      ]
    };

    await db.query(
      `insert into public.publications (site_id, slug, revision, status, artifact_hash, menu)
       values ($1, 'pizzaria-a', 1, 'active', $2, $3::jsonb)`,
      [SITE_A, 'a'.repeat(64), JSON.stringify(activeMenu)]
    );

    // Semear registro antigo (> 13 meses atrás) para testar expurgo automático
    await db.query(
      `insert into public.site_metrics_daily (
         site_id, metric_date, metric_hour, item_key, metric_name, count_value, estimated_cents
       ) values ($1, (current_date - interval '14 months')::date, 19, '', 'visit', 50, 0)`,
      [SITE_A]
    );

    // Anon chama public.record_site_metric_batch para vitrine publicada
    await asRole(
      db,
      null,
      async () => {
        const batch = [
          { type: 'visit', hour: 19 },
          { type: 'item_view', itemId: 'refrigerante', hour: 19 },
          { type: 'item_select', itemId: 'refrigerante', count: 2, hour: 19 },
          { type: 'whatsapp_order', estimatedCents: 5500, hour: 19 }
        ];
        const res = await db.query(
          'select public.record_site_metric_batch($1, $2::jsonb) as accepted',
          ['pizzaria-a', JSON.stringify(batch)]
        );
        assert.equal(res.rows[0].accepted, 4);

        // Segunda chamada no mesmo dia/hora faz upsert acumulando contagens e centavos
        const res2 = await db.query(
          'select public.record_site_metric_batch($1, $2::jsonb) as accepted',
          [
            'pizzaria-a',
            JSON.stringify([
              { type: 'item_select', itemId: 'refrigerante', count: 3, hour: 19 },
              { type: 'whatsapp_order', estimatedCents: 4800, hour: 19 }
            ])
          ]
        );
        assert.equal(res2.rows[0].accepted, 2);
      },
      'anon',
      true
    );

    // Registro > 13 meses foi expurgado automaticamente
    const oldRows = await db.query(
      "select * from public.site_metrics_daily where site_id = $1 and metric_date < (current_date - interval '13 months')::date",
      [SITE_A]
    );
    assert.equal(oldRows.rows.length, 0);

    // Rejeita vitrine não publicada (loja-b não está em public.publications)
    await assert.rejects(
      () =>
        asRole(
          db,
          null,
          () =>
            db.query('select public.record_site_metric_batch($1, $2::jsonb)', [
              'loja-b',
              JSON.stringify([{ type: 'visit', hour: 12 }])
            ]),
          'anon'
        ),
      (err) => err.code === 'P0002' || String(err.message).includes('PUBLICATION_NOT_FOUND')
    );

    // Rejeita item inexistente na vitrine publicada
    await assert.rejects(
      () =>
        asRole(
          db,
          null,
          () =>
            db.query('select public.record_site_metric_batch($1, $2::jsonb)', [
              'pizzaria-a',
              JSON.stringify([{ type: 'item_select', itemId: 'item-fantasma', hour: 19 }])
            ]),
          'anon'
        ),
      (err) => err.code === '23514' || String(err.message).includes('INVALID_EVENT_ITEM')
    );

    // Anon não tem SELECT nem INSERT direto na tabela site_metrics_daily
    await assert.rejects(
      () => asRole(db, null, () => db.query('select * from public.site_metrics_daily'), 'anon'),
      (err) => err.code === '42501'
    );
    await assert.rejects(
      () =>
        asRole(
          db,
          null,
          () =>
            db.query(
              "insert into public.site_metrics_daily (site_id, metric_date, metric_hour, item_key, metric_name, count_value) values ($1, current_date, 10, '', 'visit', 1)",
              [SITE_A]
            ),
          'anon'
        ),
      (err) => err.code === '42501'
    );

    // Owner (USER_OWNER_A) e Member (USER_MEMBER_A) conseguem ler os contadores de SITE_A
    for (const authorizedUser of [USER_OWNER_A, USER_MEMBER_A]) {
      await asRole(db, authorizedUser, async () => {
        const rows = await db.query(
          'select metric_name, item_key, count_value, estimated_cents from public.site_metrics_daily where site_id = $1 order by metric_name',
          [SITE_A]
        );
        assert.equal(rows.rows.length, 4);
        const selectRow = rows.rows.find((r) => r.metric_name === 'item_select');
        assert.equal(Number(selectRow.count_value), 5);
        const orderRow = rows.rows.find((r) => r.metric_name === 'whatsapp_order');
        assert.equal(Number(orderRow.count_value), 2);
        assert.equal(Number(orderRow.estimated_cents), 10300);
      });
    }

    // Stranger (USER_STRANGER) não enxerga nenhuma linha de SITE_A via RLS
    await asRole(db, USER_STRANGER, async () => {
      const strangerRows = await db.query('select * from public.site_metrics_daily');
      assert.equal(strangerRows.rows.length, 0);
    });
  });

  await t.test('2. Worker HTTP: POST /api/events (JSON-only, filtro de bots, limite de lote, vitrines publicadas e itens existentes) e GET /api/sites/:id/insights?period=7d|30d|90d', async () => {
    clearPublicationsCache();
    const fixedNowSeconds = Math.floor(Date.parse('2026-11-12T19:30:00.000Z') / 1000);
    const api = createApiHandler({ nowSeconds: () => fixedNowSeconds });
    const origin = 'https://painel.inspira.dev.br';

    // Publica SITE_A (pizza-a) primeiro
    const publishRes = await api.fetch(
      new Request(`${origin}/api/sites/${SITE_A}/publish`, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer token-owner',
          Origin: origin
        }
      })
    );
    assert.equal(publishRes.status, 200);

    // 2.1 POST /api/events com Content-Type não-JSON -> 415 UNSUPPORTED_MEDIA_TYPE
    const nonJsonRes = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"slug":"pizza-a","events":[{"type":"visit"}]}'
      })
    );
    assert.equal(nonJsonRes.status, 415);
    assert.equal((await nonJsonRes.json()).error.code, 'UNSUPPORTED_MEDIA_TYPE');

    // 2.2 POST /api/events de bot/crawler -> 202 ignored: "bot" sem poluir métricas
    for (const botUa of [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'WhatsApp/2.23.20.0',
      'facebookexternalhit/1.1',
      'curl/8.5.0',
      'HeadlessChrome/120.0'
    ]) {
      const botRes = await api.fetch(
        new Request('https://vitrine.inspira.dev.br/api/events', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': botUa
          },
          body: JSON.stringify({
            slug: 'pizza-a',
            events: [{ type: 'visit', hour: 19 }]
          })
        })
      );
      assert.equal(botRes.status, 202);
      const botBody = await botRes.json();
      assert.equal(botBody.accepted, 0);
      assert.equal(botBody.ignored, 'bot');
    }

    // 2.3 POST /api/events para vitrine não publicada (pizza-b) -> 404 PUBLICATION_NOT_FOUND
    const unpubRes = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'
        },
        body: JSON.stringify({
          slug: 'pizza-b',
          events: [{ type: 'visit', hour: 19 }]
        })
      })
    );
    assert.equal(unpubRes.status, 404);
    assert.equal((await unpubRes.json()).error.code, 'PUBLICATION_NOT_FOUND');

    // 2.4 POST /api/events com itemId inexistente na publicação -> 422 INVALID_EVENT_ITEM
    const badItemRes = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
        },
        body: JSON.stringify({
          slug: 'pizza-a',
          events: [{ type: 'item_select', itemId: 'item-inexistente', hour: 19 }]
        })
      })
    );
    assert.equal(badItemRes.status, 422);
    assert.equal((await badItemRes.json()).error.code, 'INVALID_EVENT_ITEM');

    // 2.5 POST /api/events acima do limite de 25 eventos -> 400 INVALID_EVENTS_BATCH
    const oversizedBatch = Array.from({ length: MAX_EVENTS_BATCH_SIZE + 1 }, () => ({
      type: 'visit',
      hour: 19
    }));
    const oversizedRes = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
        },
        body: JSON.stringify({
          slug: 'pizza-a',
          events: oversizedBatch
        })
      })
    );
    assert.equal(oversizedRes.status, 400);
    assert.equal((await oversizedRes.json()).error.code, 'INVALID_EVENTS_BATCH');

    // 2.6 POST /api/events válido na semana anterior e na semana atual
    const prevWeekRes = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
        },
        body: JSON.stringify({
          slug: 'pizza-a',
          events: [
            { type: 'visit', date: '2026-11-02', hour: 19, count: 10 },
            { type: 'item_select', itemId: 'margherita', date: '2026-11-02', hour: 19, count: 5 },
            { type: 'whatsapp_order', estimatedCents: 22500, date: '2026-11-02', hour: 19, count: 5 }
          ]
        })
      })
    );
    assert.equal(prevWeekRes.status, 202);
    assert.equal((await prevWeekRes.json()).accepted, 3);

    const currWeekRes = await api.fetch(
      new Request('https://vitrine.inspira.dev.br/api/events', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)'
        },
        body: JSON.stringify({
          slug: 'pizza-a',
          events: [
            { type: 'visit', date: '2026-11-11', hour: 18, count: 12 },
            { type: 'visit', date: '2026-11-12', hour: 19, count: 8 },
            { type: 'item_view', itemId: 'margherita', date: '2026-11-12', hour: 19, count: 15 },
            { type: 'item_select', itemId: 'margherita', date: '2026-11-12', hour: 19, count: 7 },
            { type: 'whatsapp_order', estimatedCents: 31500, date: '2026-11-12', hour: 19, count: 7 }
          ]
        })
      })
    );
    assert.equal(currWeekRes.status, 202);
    assert.equal((await currWeekRes.json()).accepted, 5);

    // 2.7 GET /api/sites/:id/insights sem autenticação -> 401
    const unauthInsights = await api.fetch(
      new Request(`${origin}/api/sites/${SITE_A}/insights?period=7d`)
    );
    assert.equal(unauthInsights.status, 401);

    // 2.8 GET /api/sites/:id/insights por usuário estranho -> 404 SITE_NOT_FOUND
    const strangerInsights = await api.fetch(
      new Request(`${origin}/api/sites/${SITE_A}/insights?period=7d`, {
        headers: { Authorization: 'Bearer token-stranger' }
      })
    );
    assert.equal(strangerInsights.status, 404);
    assert.equal((await strangerInsights.json()).error.code, 'SITE_NOT_FOUND');

    // 2.9 GET /api/sites/:id/insights com período inválido -> 400 INVALID_PERIOD
    const badPeriodRes = await api.fetch(
      new Request(`${origin}/api/sites/${SITE_A}/insights?period=365d`, {
        headers: { Authorization: 'Bearer token-owner' }
      })
    );
    assert.equal(badPeriodRes.status, 400);
    assert.equal((await badPeriodRes.json()).error.code, 'INVALID_PERIOD');

    // 2.10 GET /api/sites/:id/insights por owner e member -> 200 OK com dados completos e frases pt-BR
    for (const token of ['token-owner', 'token-member']) {
      const okRes = await api.fetch(
        new Request(`${origin}/api/sites/${SITE_A}/insights?period=7d`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      );
      assert.equal(okRes.status, 200);
      const { insights } = await okRes.json();
      assert.equal(insights.siteId, SITE_A);
      assert.equal(insights.period, '7d');
      assert.equal(insights.summary.visits, 20);
      assert.equal(insights.summary.previousVisits, 10);
      assert.equal(insights.summary.orders, 7);
      assert.equal(insights.summary.previousOrders, 5);
      assert.equal(insights.summary.conversionPercent, 35.0);
      assert.equal(insights.summary.estimatedCents, 31500);
      assert.equal(insights.topItems.length, 1);
      assert.equal(insights.topItems[0].itemId, 'margherita');
      assert.equal(insights.topItems[0].name, 'Margherita');
      assert.equal(insights.topItems[0].selections, 7);
      assert.equal(insights.topItems[0].previousSelections, 5);
      assert.equal(insights.topItems[0].deltaPercent, 40.0);
      assert.equal(insights.byDay.length, 7);
      assert.equal(insights.byHour.length, 24);
      assert.ok(
        insights.highlights.some((h) =>
          h.includes('Margherita foi o item mais escolhido nesta semana, 40% a mais que na anterior.')
        )
      );
      assert.ok(
        insights.highlights.some((h) =>
          h.includes('Seus pedidos se concentram entre 18h e 20h.')
        )
      );
    }
  });

  await t.test('3. Casos de borda: semana anterior zerada, vitrine sem eventos (sem NaN/Infinity), coletor sendBeacon e aviso de privacidade no rodapé', async () => {
    assert.deepEqual(ALLOWED_METRIC_EVENT_TYPES, [
      'visit',
      'item_view',
      'item_select',
      'whatsapp_order'
    ]);
    assert.deepEqual(ALLOWED_INSIGHTS_PERIODS, ['7d', '30d', '90d']);
    assert.equal(isBotUserAgent('Googlebot/2.1'), true);
    assert.equal(isBotUserAgent('Mozilla/5.0 (X11; Linux x86_64) Gecko/20100101 Firefox/128.0'), false);
    assert.equal(validateInsightsPeriod('30d'), '30d');

    // Vitrine sem nenhum evento -> zero divisão por zero
    const emptyInsights = computeStorefrontInsights({
      siteId: SITE_A,
      period: '7d',
      rows: [],
      catalogSource: {},
      referenceDate: '2026-11-12'
    });
    assert.equal(emptyInsights.summary.visits, 0);
    assert.equal(emptyInsights.summary.conversionPercent, 0);
    assert.equal(Number.isNaN(emptyInsights.summary.conversionPercent), false);
    assert.ok(emptyInsights.highlights.length >= 1);

    // Semana anterior zerada com pedidos na semana atual -> frase "Esta semana o item mais pedido foi ..." sem NaN/Infinity
    const firstWeekInsights = computeStorefrontInsights({
      siteId: SITE_A,
      period: '7d',
      rows: [
        {
          site_id: SITE_A,
          metric_date: '2026-11-12',
          metric_hour: 19,
          item_key: 'refrigerante',
          metric_name: 'item_select',
          count_value: 4,
          estimated_cents: 0
        }
      ],
      catalogSource: {
        items: [{ id: 'refrigerante', name: 'Refrigerante', priceCents: 700 }]
      },
      referenceDate: '2026-11-12'
    });
    assert.equal(firstWeekInsights.topItems[0].deltaPercent, null);
    assert.ok(
      firstWeekInsights.highlights.some((h) =>
        h.includes('Esta semana o item mais pedido foi Refrigerante')
      )
    );

    // Coletor sendBeacon na vitrine pública
    const sentBeacons = [];
    const collector = createStorefrontMetricsCollector({
      slug: 'loja1',
      validItemIds: ['margherita-verace', 'calabresa-artesanal'],
      navigatorObj: {
        sendBeacon(url, blob) {
          sentBeacons.push({ url, blob });
          return true;
        }
      },
      nowFn: () => new Date('2026-11-12T19:15:00.000Z')
    });

    assert.equal(collector.record('visit'), true);
    assert.equal(collector.record('visit'), false, 'Visita é contabilizada apenas 1 vez por abertura');
    assert.equal(collector.record('item_view', { itemId: 'margherita-verace' }), true);
    assert.equal(collector.record('item_view', { itemId: 'item-invalido' }), false);
    assert.equal(collector.record('item_select', { itemId: 'margherita-verace', count: 2 }), true);
    assert.equal(collector.record('whatsapp_order', { estimatedCents: 9600 }), true);

    assert.equal(sentBeacons.length, 1, 'whatsapp_order dispara flush imediato via sendBeacon');
    assert.equal(sentBeacons[0].url, '/api/events');
    const beaconJson = JSON.parse(await sentBeacons[0].blob.text());
    assert.equal(beaconJson.slug, 'loja1');
    assert.equal(beaconJson.events.length, 4);

    // Aviso de privacidade no HTML público renderizado
    const html = renderStorefrontHtml({
      schemaVersion: 1,
      template: 'pizzeria-v1',
      slug: 'loja1',
      name: 'Forno & Praça',
      whatsapp: '5511999999999',
      currency: 'BRL',
      items: [{ id: 'margherita-verace', name: 'Margherita Verace', priceCents: 4800 }]
    });
    assert.match(html, /id="storefront-privacy-notice"/);
    assert.match(html, /sem cookies de rastreamento nem coleta de endereço IP ou dados pessoais/i);
  });
});
