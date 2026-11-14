import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  BUSINESS_TIME_ZONE,
  buildRouteUrl,
  collectPlaceErrors,
  describeWeek,
  getOpenStatus,
  projectPublicPlace,
  toOpeningHoursSpecification,
  todayInBusinessTimeZone,
  validateBusinessHours,
  validatePublicAddress,
  zonedClock
} from '../src/business-hours.mjs';
import { PortalValidationError, validateDraftContent } from '../src/portal-validation.mjs';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  renderStorefrontHtml
} from '../src/publication-engine.mjs';
import { mountStorefrontPlace, renderStorefrontPlaceHtml } from '../web/assets/storefront-place.mjs';
import { buildQrTargetUrl, encodeQr, qrToSvg } from '../web/portal/qr-code.mjs';
import { createApiHandler } from '../workers/api.mjs';

const siteAId = '20000000-0000-0000-0000-000000000001';

// São Paulo está em UTC-3 (sem horário de verão desde 2019).
const sp = (localIso) => new Date(`${localIso}:00-03:00`);

function hours(week, extra = {}) {
  return { timeZone: BUSINESS_TIME_ZONE, week, ...extra };
}

const ADDRESS = { street: 'Rua Augusta, 1500', district: 'Consolação', city: 'São Paulo', uf: 'SP', postalCode: '01304001' };

function draft(extra = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    catalogType: 'products',
    slug: 'pizza-a',
    businessName: 'Pizza A',
    whatsapp: '5511987654321',
    categories: [{ id: 'pizzas', name: 'Pizzas', items: [{ id: 'mussarela', name: 'Mussarela', priceCents: 4500 }] }],
    ...extra
  };
}

test('Issue #118 — "Aberto agora" calculado no fuso de São Paulo', async (t) => {
  // 2026-11-16 é segunda-feira.
  const monday = hours({ mon: [{ opens: '18:00', closes: '23:00' }] });

  await t.test('18h–23h: às 17h59 fechado, às 18h00 aberto, às 23h00 fechado', () => {
    assert.equal(getOpenStatus(monday, sp('2026-11-16T17:59')).label, 'Fechado · abre às 18h');
    const open = getOpenStatus(monday, sp('2026-11-16T18:00'));
    assert.equal(open.open, true);
    assert.equal(open.label, 'Aberto agora');
    assert.equal(getOpenStatus(monday, sp('2026-11-16T22:59')).open, true);
    assert.equal(getOpenStatus(monday, sp('2026-11-16T23:00')).label, 'Fechado · abre segunda às 18h');
  });

  await t.test('usa o relógio de São Paulo, não o do servidor', () => {
    // 20h59 UTC = 17h59 em São Paulo; 21h00 UTC = 18h00.
    assert.equal(getOpenStatus(monday, new Date('2026-11-16T20:59:00Z')).open, false);
    assert.equal(getOpenStatus(monday, new Date('2026-11-16T21:00:00Z')).open, true);
    assert.deepEqual(zonedClock(new Date('2026-11-17T02:30:00Z')), { date: '2026-11-16', dayIndex: 1, day: 'mon', minutes: 23 * 60 + 30 });
    assert.equal(todayInBusinessTimeZone(new Date('2026-11-17T02:30:00Z')), '2026-11-16');
  });

  await t.test('faixa que passa da meia-noite (18h–02h)', () => {
    const friday = hours({ fri: [{ opens: '18:00', closes: '02:00', overnight: true }] });
    // 2026-11-20 é sexta-feira.
    assert.equal(getOpenStatus(friday, sp('2026-11-20T17:59')).label, 'Fechado · abre às 18h');
    assert.equal(getOpenStatus(friday, sp('2026-11-20T23:59')).label, 'Aberto agora');
    assert.equal(getOpenStatus(friday, sp('2026-11-21T00:00')).open, true);
    assert.equal(getOpenStatus(friday, sp('2026-11-21T01:59')).open, true);
    assert.equal(getOpenStatus(friday, sp('2026-11-21T02:00')).label, 'Fechado · abre sexta às 18h');
    assert.equal(getOpenStatus(friday, sp('2026-11-20T01:00')).open, false, 'quinta não tem faixa');
  });

  await t.test('próxima abertura amanhã e duas faixas no dia', () => {
    const split = hours({ tue: [{ opens: '11:00', closes: '14:00' }, { opens: '18:00', closes: '22:30' }] });
    assert.equal(getOpenStatus(split, sp('2026-11-16T20:00')).label, 'Fechado · abre amanhã às 11h');
    assert.equal(getOpenStatus(split, sp('2026-11-17T15:00')).label, 'Fechado · abre às 18h');
    const late = getOpenStatus(split, sp('2026-11-17T22:00'));
    assert.equal(late.open, true);
    assert.equal(late.closesAt, '22:30');
    assert.equal(late.detail, 'Fecha às 22h30');
  });

  await t.test('exceção "fechado hoje" cancela as faixas do dia, mas não a madrugada de ontem', () => {
    const everyday = hours(
      Object.fromEntries(['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'].map((d) => [d, [{ opens: '18:00', closes: '02:00', overnight: true }]])),
      { closedDates: ['2026-11-16'] }
    );
    assert.equal(getOpenStatus(everyday, sp('2026-11-16T01:00')).open, true, 'faixa de domingo segue até 2h');
    const closed = getOpenStatus(everyday, sp('2026-11-16T19:00'));
    assert.equal(closed.open, false);
    assert.equal(closed.closedToday, true);
    assert.equal(closed.label, 'Fechado hoje · abre amanhã às 18h');
    assert.equal(getOpenStatus(everyday, sp('2026-11-17T19:00')).label, 'Aberto agora');
  });

  await t.test('sem horário não há selo', () => {
    assert.equal(getOpenStatus(undefined, new Date()), null);
    assert.equal(getOpenStatus(hours({}), new Date()), null);
  });
});

test('Issue #118 — validação do horário e do endereço', async (t) => {
  await t.test('normaliza e ordena faixas, datas e CEP', () => {
    const { value, errors } = validateBusinessHours({
      week: { sat: [{ opens: '18:00', closes: '23:00' }, { opens: '11:00', closes: '15:00' }] },
      closedDates: ['2026-12-25', '2026-12-24', '2026-12-25']
    });
    assert.deepEqual(errors, []);
    assert.deepEqual(value.week.sat, [{ opens: '11:00', closes: '15:00' }, { opens: '18:00', closes: '23:00' }]);
    assert.deepEqual(value.week.mon, []);
    assert.deepEqual(value.closedDates, ['2026-12-24', '2026-12-25']);
    assert.equal(value.timeZone, BUSINESS_TIME_ZONE);
    assert.equal(validatePublicAddress(ADDRESS).value.postalCode, '01304-001');
    assert.equal(validatePublicAddress({ street: ' ', city: '', uf: '' }).value, undefined);
  });

  await t.test('fim antes do início sem virar o dia é recusado no campo', () => {
    const { errors } = validateBusinessHours({ week: { mon: [{ opens: '18:00', closes: '17:00' }] } });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].field, 'businessHours.week.mon.0.closes');
    assert.equal(errors[0].code, 'BUSINESS_HOURS_END_BEFORE_START');
    assert.match(errors[0].message, /Segunda-feira: o fim precisa ser depois do início/);
    assert.equal(validateBusinessHours({ week: { mon: [{ opens: '18:00', closes: '18:00' }] } }).errors.length, 1);
    assert.deepEqual(validateBusinessHours({ week: { mon: [{ opens: '18:00', closes: '02:00', overnight: true }] } }).errors, []);
    assert.equal(validateBusinessHours({ week: { mon: [{ opens: '10:00', closes: '12:00', overnight: true }] } }).errors[0].field, 'businessHours.week.mon.0.closes');
  });

  await t.test('outras recusas por campo', () => {
    const fields = (raw) => validateBusinessHours(raw).errors.map((e) => e.field);
    assert.deepEqual(fields({ week: { mon: [{ opens: '25:00', closes: '23:00' }] } }), ['businessHours.week.mon.0.opens']);
    assert.deepEqual(fields({ week: { mon: [{ opens: '09:00', closes: '' }] } }), ['businessHours.week.mon.0.closes']);
    assert.deepEqual(fields({ week: { mon: [{ opens: '09:00', closes: '12:00' }, { opens: '11:00', closes: '14:00' }] } }), ['businessHours.week.mon.1.opens']);
    assert.deepEqual(fields({ week: { mon: [1, 2, 3] } }), ['businessHours.week.mon']);
    assert.deepEqual(fields({ week: { funday: [] } }), ['businessHours.week.funday']);
    assert.deepEqual(fields({ timeZone: 'UTC', week: {} }), ['businessHours.timeZone']);
    assert.deepEqual(fields({ week: {}, closedDates: ['2026-02-30'] }), ['businessHours.closedDates.0']);
    const address = (raw) => validatePublicAddress(raw).errors.map((e) => e.field);
    assert.deepEqual(address({ street: 'Rua A, 1' }), ['publicAddress.city', 'publicAddress.uf']);
    assert.deepEqual(address({ ...ADDRESS, postalCode: '123' }), ['publicAddress.postalCode']);
    assert.deepEqual(address({ ...ADDRESS, street: '<b>Rua</b>' }), ['publicAddress.street']);
    assert.deepEqual(address({ ...ADDRESS, lat: -23.5 }), ['publicAddress.lat']);
  });

  await t.test('validateDraftContent recusa com erro no campo, e o JSON da API leva o campo', () => {
    const content = draft({ businessHours: { week: { mon: [{ opens: '18:00', closes: '17:00' }] } } });
    assert.equal(collectPlaceErrors(content).length, 1);
    let caught;
    try {
      validateDraftContent(content);
    } catch (error) {
      caught = error;
    }
    assert.ok(caught instanceof PortalValidationError);
    assert.equal(caught.status, 422);
    const body = caught.toJSON();
    assert.equal(body.error.code, 'BUSINESS_HOURS_END_BEFORE_START');
    assert.equal(body.error.field, 'businessHours.week.mon.0.closes');
    assert.equal(body.error.fieldErrors.length, 1);
    assert.doesNotThrow(() => validateDraftContent(draft({ businessHours: hours({ mon: [] }), publicAddress: ADDRESS })));
  });
});

test('Issue #118 — publicação, vitrine e botão "Traçar rota"', async (t) => {
  const week = { fri: [{ opens: '18:00', closes: '02:00', overnight: true }] };

  await t.test('snapshot leva só horário e endereço normalizados', async () => {
    const { menu } = await compilePublicStorefront(
      draft({ businessHours: { week, closedDates: [] }, publicAddress: ADDRESS }),
      { slug: 'pizza-a', name: 'Pizza A' }
    );
    assert.deepEqual(menu.businessHours, { timeZone: BUSINESS_TIME_ZONE, week: { sun: [], mon: [], tue: [], wed: [], thu: [], fri: week.fri, sat: [] } });
    assert.deepEqual(menu.publicAddress, { ...ADDRESS, postalCode: '01304-001' });
    assert.ok(Object.isFrozen(menu.businessHours.week.fri));

    const bare = (await compilePublicStorefront(draft({ businessHours: hours({}) }), { slug: 'pizza-a' })).menu;
    assert.equal('businessHours' in bare, false);
    assert.equal('publicAddress' in bare, false);
  });

  await t.test('snapshot com campo extra no endereço é barrado', async () => {
    const { menu } = await compilePublicStorefront(draft({ publicAddress: ADDRESS }), { slug: 'pizza-a' });
    const tampered = structuredClone(menu);
    tampered.publicAddress.ownerPhone = '5511999999999';
    assert.throws(() => assertNoPrivateLeakage(tampered), { code: 'PRIVATE_FIELD_LEAKAGE' });
    const badHours = structuredClone(menu);
    badHours.businessHours = { timeZone: BUSINESS_TIME_ZONE, week: { mon: [{ opens: '18:00', closes: '17:00' }] } };
    assert.throws(() => assertNoPrivateLeakage(badHours), { code: 'PRIVATE_FIELD_LEAKAGE' });
  });

  await t.test('com endereço, o link abre o destino certo com rel="noopener"; sem endereço, não há botão', async () => {
    const url = buildRouteUrl(validatePublicAddress(ADDRESS).value);
    assert.equal(
      url,
      'https://www.google.com/maps/dir/?api=1&destination=' +
        encodeURIComponent('Rua Augusta, 1500, Consolação, São Paulo - SP, 01304-001, Brasil')
    );
    const withAddress = (await compilePublicStorefront(draft({ publicAddress: ADDRESS, businessHours: { week } }), { slug: 'pizza-a' })).menu;
    const html = renderStorefrontHtml(withAddress);
    const link = html.match(/<a class="storefront-route-button"[^>]*>Traçar rota<\/a>/)?.[0];
    assert.ok(link, 'botão presente');
    assert.match(link, /rel="noopener"/);
    assert.match(link, /target="_blank"/);
    assert.ok(link.includes(`href="${url.replace(/&/g, '&amp;')}"`));
    assert.match(link, /aria-label="Traçar rota até Rua Augusta, 1500/);
    assert.match(html, /data-open-badge hidden/);
    assert.match(html, /Sexta-feira<\/span><span>18h às 2h/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);

    const withoutAddress = (await compilePublicStorefront(draft({ businessHours: { week } }), { slug: 'pizza-a' })).menu;
    const noRoute = renderStorefrontHtml(withoutAddress);
    assert.doesNotMatch(noRoute, /Traçar rota/);
    assert.match(noRoute, /storefront-open-badge/);
    assert.equal(renderStorefrontPlaceHtml({}), '');
  });

  await t.test('modelo estático recebe o bloco no marcador', async () => {
    const { readFile } = await import('node:fs/promises');
    const template = await readFile(new URL('../web/vitrine/index.html', import.meta.url), 'utf8');
    assert.match(template, /<!--STATIC_STOREFRONT_PLACE-->/);
    const menu = (await compilePublicStorefront(draft({ publicAddress: ADDRESS }), { slug: 'pizza-a' })).menu;
    const html = renderStorefrontHtml(menu, template);
    assert.match(html, /storefront-route-button/);
    assert.doesNotMatch(html, /STATIC_STOREFRONT_PLACE/);
  });

  await t.test('selo preenchido no navegador e atualizado com o relógio', () => {
    const badge = { hidden: true, textContent: '', dataset: {} };
    const section = { hidden: false, querySelector: (selector) => (selector === '[data-open-badge]' ? badge : null) };
    const doc = { getElementById: (id) => (id === 'storefront-place' ? section : null) };
    let clock = sp('2026-11-20T17:59');
    let tick = null;
    const mounted = mountStorefrontPlace(doc, { businessHours: hours(week) }, {
      now: () => clock,
      setIntervalImpl: (fn, ms) => {
        tick = fn;
        assert.equal(ms, 60_000);
        return 1;
      }
    });
    assert.equal(mounted.section, section);
    assert.equal(badge.hidden, false);
    assert.equal(badge.textContent, 'Fechado · abre às 18h');
    assert.equal(badge.dataset.state, 'closed');
    clock = sp('2026-11-20T18:00');
    tick();
    assert.equal(badge.textContent, 'Aberto agora');
    assert.equal(badge.dataset.state, 'open');
  });

  await t.test('fluxo pela API: horário inválido recusado no campo; publicado aparece na vitrine', async () => {
    const api = createApiHandler();
    const put = (content, revision) => api.fetch(new Request(`http://localhost/api/sites/${siteAId}/draft`, {
      method: 'PUT',
      headers: { Authorization: 'Bearer token-owner', 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision, content })
    }));
    const invalid = await put(draft({ businessHours: { week: { mon: [{ opens: '18:00', closes: '17:00' }] } } }), 1);
    assert.equal(invalid.status, 422);
    const body = await invalid.json();
    assert.equal(body.error.field, 'businessHours.week.mon.0.closes');

    const saved = await put(draft({ businessHours: { week }, publicAddress: ADDRESS }), 1);
    assert.equal(saved.status, 200);
    const published = await api.fetch(new Request(`http://localhost/api/sites/${siteAId}/publish`, {
      method: 'POST', headers: { Authorization: 'Bearer token-owner' }
    }));
    assert.equal(published.status, 200);
    const menu = await (await api.fetch(new Request('http://localhost/data/vitrines/pizza-a/menu.json'))).json();
    assert.deepEqual(menu.businessHours.week.fri, week.fri);
    const page = await (await api.fetch(new Request('http://localhost/pizza-a'))).text();
    assert.match(page, /class="storefront-route-button"/);
  });
});

test('Issue #118 — reuso para dados estruturados e lista de horários', () => {
  const value = validateBusinessHours({ week: { mon: [{ opens: '09:00', closes: '18:00' }] } }).value;
  assert.deepEqual(toOpeningHoursSpecification(value), [
    { '@type': 'OpeningHoursSpecification', dayOfWeek: 'https://schema.org/Monday', opens: '09:00', closes: '18:00' }
  ]);
  const rows = describeWeek(value);
  assert.equal(rows[0].label, 'Segunda-feira');
  assert.equal(rows[0].text, '9h às 18h');
  assert.equal(rows[6].text, 'Fechado');
  assert.deepEqual(projectPublicPlace({ businessHours: value }), { businessHours: value });
});

test('Issue #118 — QR Code da vitrine', async (t) => {
  await t.test('aponta para o endereço canônico com utm_source=qr', () => {
    assert.equal(buildQrTargetUrl('loja1'), 'https://vitrine.inspira.dev.br/loja1?utm_source=qr');
  });

  await t.test('matriz idêntica à de uma implementação de referência', () => {
    // Referência: biblioteca Python `qrcode`, nível M, máscara fixa, sem borda.
    const fingerprint = (text, mask) => {
      const qr = encodeQr(text, { mask });
      return {
        version: qr.version,
        sha256: createHash('sha256').update(qr.modules.map((row) => row.map(Number).join('')).join('\n')).digest('hex')
      };
    };
    assert.deepEqual(fingerprint('https://vitrine.inspira.dev.br/loja1?utm_source=qr', 2), {
      version: 4,
      sha256: '97b01862e6a7587a571ad267cc1bc3993d2d0e507e3bf28e7ddec4d722e013d6'
    });
    assert.deepEqual(fingerprint('https://vitrine.inspira.dev.br/pizzaria-do-bairro-sao-paulo?utm_source=qr', 5), {
      version: 5,
      sha256: '1e590ccd79831aadbd212c3a269a7e347519ee9ed88560a2b291a6a961016a29'
    });
  });

  await t.test('escolhe máscara sozinho, cresce de versão e gera SVG com zona de silêncio', () => {
    const qr = encodeQr(buildQrTargetUrl('loja1'));
    assert.ok(qr.mask >= 0 && qr.mask <= 7);
    assert.equal(qr.size, 33);
    assert.equal(encodeQr('x'.repeat(400)).version, 15);
    assert.throws(() => encodeQr('x'.repeat(3000)), RangeError);
    const svg = qrToSvg(qr, { title: 'QR Code da vitrine <loja1>' });
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 41 41"/);
    assert.match(svg, /<title>QR Code da vitrine &lt;loja1&gt;<\/title>/);
    assert.match(svg, /fill="#FFFFFF"/);
  });
});
