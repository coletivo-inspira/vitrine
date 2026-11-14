import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  PLAN_FEATURES,
  TECHNICAL_MAX_ACTIVE_ITEMS,
  cheapestPlanWithFeature,
  planByCode,
  validatePlanTable
} from '../src/plans.mjs';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');
const rawTable = JSON.parse(await read('content/plans.json'));
const adr = await read('docs/adr/0013-plans-and-recurring-billing.md');
const offer = await read('docs/commercial-offer.md');

const reais = (cents) => cents / 100;

function adrPlanRows(text) {
  const rows = new Map();
  const pattern = /^\| `([a-z]+)` \| ([^|]+?) \| R\$ (\d+) \| (?:até )?(\d+) \| (\d+) \|/gm;
  for (const [, code, name, price, vitrines, items] of text.matchAll(pattern)) {
    rows.set(code, { name, price: Number(price), vitrines: Number(vitrines), items: Number(items) });
  }
  return rows;
}

function offerPriceRows(text) {
  const rows = new Map();
  for (const [, name, price] of text.matchAll(/^\| ([^|`]+?) \| R\$ (\d+)/gm)) rows.set(name, Number(price));
  return rows;
}

function coherenceMismatches(table, adrText, offerText) {
  const problems = [];
  const adrRows = adrPlanRows(adrText);
  const offerRows = offerPriceRows(offerText);
  for (const plan of table.plans) {
    const row = adrRows.get(plan.code);
    if (!row) {
      problems.push(`ADR 0013 sem a linha do plano ${plan.code}`);
      continue;
    }
    if (row.name !== plan.name) problems.push(`${plan.code}: nome ${row.name} no ADR, ${plan.name} no JSON`);
    if (row.price !== reais(plan.monthlyPriceCents)) problems.push(`${plan.code}: R$ ${row.price} no ADR, R$ ${reais(plan.monthlyPriceCents)} no JSON`);
    if (row.vitrines !== plan.limits.vitrines) problems.push(`${plan.code}: ${row.vitrines} vitrines no ADR, ${plan.limits.vitrines} no JSON`);
    if (row.items !== plan.limits.activeItemsPerVitrine) problems.push(`${plan.code}: ${row.items} itens no ADR, ${plan.limits.activeItemsPerVitrine} no JSON`);
    const offerPrice = offerRows.get(plan.name);
    if (offerPrice !== reais(plan.monthlyPriceCents)) problems.push(`${plan.code}: R$ ${offerPrice} na oferta comercial, R$ ${reais(plan.monthlyPriceCents)} no JSON`);
  }
  if (adrRows.size !== table.plans.length) problems.push(`ADR 0013 tem ${adrRows.size} planos, o JSON tem ${table.plans.length}`);

  adrText = adrText.replace(/\s+/g, ' ');
  const implantacao = table.services.find((service) => service.code === 'implantacao');
  const range = `R$ ${reais(implantacao.minPriceCents)} a ${reais(implantacao.maxPriceCents)}`;
  if (!adrText.includes(`${implantacao.name} de ${range}`)) problems.push(`ADR 0013 sem "${implantacao.name} de ${range}"`);
  if (!offerText.includes(`| ${implantacao.name} | ${range}`)) problems.push(`oferta comercial sem "${implantacao.name} | ${range}"`);

  const projeto = table.services.find((service) => service.code === 'projeto');
  const from = `partir de R$ ${reais(projeto.minPriceCents)}`;
  if (!adrText.includes(`a ${from}`)) problems.push(`ADR 0013 sem "a ${from}"`);
  if (!offerText.includes(`| ${projeto.name} | A ${from}`)) problems.push(`oferta comercial sem "${projeto.name} | A ${from}"`);
  return problems;
}

test('content/plans.json passa no validador', () => {
  const table = validatePlanTable(rawTable);
  assert.deepEqual(table.plans.map((plan) => plan.code), ['free', 'essencial', 'profissional', 'equipe']);
  assert.deepEqual(table.services.map((service) => service.code), ['implantacao', 'projeto']);
  assert.equal(planByCode(table, 'essencial').monthlyPriceCents, 3900);
  assert.equal(planByCode(table, 'bespoke'), null);
});

test('nenhum plano passa do teto técnico de 100 itens ativos por vitrine', () => {
  const table = validatePlanTable(rawTable);
  for (const plan of table.plans) assert.ok(plan.limits.activeItemsPerVitrine <= TECHNICAL_MAX_ACTIVE_ITEMS, plan.code);
  const tooMany = structuredClone(rawTable);
  tooMany.plans[3].limits.activeItemsPerVitrine = 101;
  assert.throws(() => validatePlanTable(tooMany), /activeItemsPerVitrine/);
});

test('validador recusa preço fracionado, código repetido e recurso fora da lista', () => {
  const fractional = structuredClone(rawTable);
  fractional.plans[1].monthlyPriceCents = 39.9;
  assert.throws(() => validatePlanTable(fractional), /monthlyPriceCents/);

  const negative = structuredClone(rawTable);
  negative.services[0].minPriceCents = -1;
  assert.throws(() => validatePlanTable(negative), /minPriceCents/);

  const duplicate = structuredClone(rawTable);
  duplicate.plans[2].code = 'essencial';
  assert.throws(() => validatePlanTable(duplicate), /unique/);

  const unknownCode = structuredClone(rawTable);
  unknownCode.plans[0].code = 'ilimitado';
  assert.throws(() => validatePlanTable(unknownCode), /code/);

  const unknownFeature = structuredClone(rawTable);
  unknownFeature.plans[1].features.push('unlimited_items');
  assert.throws(() => validatePlanTable(unknownFeature), /unknown feature/);

  const paidFree = structuredClone(rawTable);
  paidFree.plans[0].monthlyPriceCents = 100;
  assert.throws(() => validatePlanTable(paidFree), /free plan/);

  const invertedRange = structuredClone(rawTable);
  invertedRange.services[0].maxPriceCents = 100;
  assert.throws(() => validatePlanTable(invertedRange), /maxPriceCents/);
});

test('cada recurso tem um plano que o libera e o mais barato é o indicado', () => {
  const table = validatePlanTable(rawTable);
  for (const feature of PLAN_FEATURES) assert.ok(cheapestPlanWithFeature(table, feature), feature);
  assert.equal(cheapestPlanWithFeature(table, 'custom_domain').code, 'essencial');
  assert.equal(cheapestPlanWithFeature(table, 'quote_webhook').code, 'profissional');
  assert.equal(cheapestPlanWithFeature(table, 'multi_vitrine').code, 'equipe');
  assert.throws(() => cheapestPlanWithFeature(table, 'unlimited_items'), /Unknown plan feature/);
});

test('preços e limites coincidem com o ADR 0013 e a oferta comercial', () => {
  assert.deepEqual(coherenceMismatches(validatePlanTable(rawTable), adr, offer), []);
});

test('termos e privacidade citam o Asaas e a tolerância sem prometer processamento gratuito', async () => {
  const visibleText = (html) => html.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const terms = visibleText(await read('web/termos/index.html'));
  const privacy = visibleText(await read('web/privacidade/index.html'));
  for (const text of [terms, privacy]) {
    assert.match(text, /Asaas, (?:que atua como )?operador de pagamento/);
    const withoutDisclaimer = text.replace('não promete processamento de pagamento gratuito', '');
    assert.doesNotMatch(withoutDisclaimer, /processamento[^.]{0,30}(?:gratuito|sem custo|sem tarifa)/i);
  }
  assert.match(terms, /7 dias de tolerância/);
  assert.match(terms, /não promete processamento de pagamento gratuito/);
  assert.match(terms, /não apagam nada/);
  assert.match(privacy, /não apagam os dados/);
  assert.match(privacy, /nunca aparecem na vitrine publicada/);
});

test('mudar o preço do Essencial só no JSON quebra a coerência com o ADR 0013', () => {
  const changed = structuredClone(rawTable);
  changed.plans.find((plan) => plan.code === 'essencial').monthlyPriceCents = 4900;
  const problems = coherenceMismatches(validatePlanTable(changed), adr, offer);
  assert.ok(problems.some((problem) => problem.startsWith('essencial: R$ 39 no ADR')), problems.join('\n'));
  assert.ok(problems.some((problem) => problem.includes('na oferta comercial')), problems.join('\n'));
});
