import test from 'node:test';
import assert from 'node:assert/strict';
import {
  deliveryDraftErrors,
  deliveryFeeFor,
  describePayment,
  draftCouriers,
  normalizeDeliveryPlatformUrl
} from '../web/assets/delivery.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { formatPriceBRL, interpolateWhatsappTemplate } from '../web/assets/storefront-renderer.mjs';

const IFOOD = 'https://www.ifood.com.br/delivery/belo-horizonte-mg/pizzaria-forno-de-minas/0f56a6a1-6301-430f-9544-128f339dc2bc';
const FOOD99 = 'https://food.99app.com/pt-BR/store/forno-de-minas';

function draft(extra = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    slug: 'pizzaria-teste',
    businessName: 'Pizzaria Teste',
    whatsapp: '5531999998888',
    categories: [{ id: 'pizzas', name: 'Pizzas', items: [{ id: 'calabresa', name: 'Calabresa', priceCents: 3990, active: true }] }],
    ...extra
  };
}

const compile = (content) =>
  compilePublicStorefront(content, { slug: content.slug, name: content.businessName, template: content.template }, { revision: 1 });

test('Delivery: links só do iFood e do 99Food, em HTTPS, sem usuário nem porta', () => {
  assert.equal(normalizeDeliveryPlatformUrl('ifood', IFOOD), IFOOD);
  assert.equal(normalizeDeliveryPlatformUrl('ifood', 'ifood.com.br/delivery/x'), 'https://ifood.com.br/delivery/x');
  assert.equal(normalizeDeliveryPlatformUrl('food99', FOOD99), FOOD99);
  for (const [platform, url] of [
    ['ifood', 'http://www.ifood.com.br/delivery/x'],
    ['ifood', 'https://ifood.com.br.golpe.example/x'],
    ['ifood', 'https://user:senha@ifood.com.br/x'],
    ['ifood', 'https://ifood.com.br:8443/x'],
    ['ifood', FOOD99],
    ['food99', 'https://99food.example/x'],
    ['food99', 'javascript:alert(1)'],
    ['rappi', 'https://www.rappi.com.br/x']
  ]) {
    assert.equal(normalizeDeliveryPlatformUrl(platform, url), null, `${platform} ${url}`);
  }
  assert.deepEqual(deliveryDraftErrors({ deliveryPlatforms: { ifood: IFOOD, food99: '' } }), []);
  assert.equal(deliveryDraftErrors({ deliveryPlatforms: { ifood: 'https://exemplo.com/loja' } })[0].field, 'deliveryPlatforms.ifood');
  assert.throws(() => validateDraftContent(draft({ deliveryPlatforms: { ifood: 'https://exemplo.com/loja' } })), { code: 'INVALID_DELIVERY_PLATFORM' });
  assert.throws(() => validateDraftContent(draft({ deliveryPlatforms: { uber: IFOOD } })), { code: 'INVALID_DELIVERY_PLATFORM' });
});

test('Delivery: a vitrine publica os links e mostra "Também estamos no"', async () => {
  const { menu } = await compile(draft({ deliveryPlatforms: { ifood: IFOOD, food99: FOOD99 } }));
  assert.deepEqual(menu.deliveryPlatforms, { ifood: IFOOD, food99: FOOD99 });
  const html = renderStorefrontHtml(menu);
  assert.match(html, /<p class="storefront-platforms-title">Também estamos no<\/p>/);
  assert.match(html, new RegExp(`href="${IFOOD.replace(/[.?]/g, '\\$&')}" target="_blank" rel="noopener noreferrer">iFood<`));
  assert.match(html, />99Food</);
  const { menu: without } = await compile(draft());
  assert.equal(without.deliveryPlatforms, undefined);
  assert.doesNotMatch(renderStorefrontHtml(without), /storefront-platforms/);
});

test('Delivery: entregadores ficam só no rascunho, nunca no artefato público', async () => {
  const couriers = [
    { id: 'joao', name: 'João da Moto', whatsapp: '(31) 97654-3210' },
    { id: 'ana', name: 'Ana', whatsapp: '5531977776666' }
  ];
  assert.deepEqual(draftCouriers({ deliveryCouriers: couriers }).map((c) => c.whatsapp), ['31976543210', '5531977776666']);
  validateDraftContent(draft({ deliveryCouriers: couriers }));
  const { menu, json } = await compile(draft({ deliveryCouriers: couriers }));
  assert.equal(menu.deliveryCouriers, undefined);
  assert.doesNotMatch(json, /João da Moto|76543210|977776666|deliveryCouriers/);
  assert.doesNotMatch(renderStorefrontHtml(menu), /João da Moto|76543210/);

  for (const bad of [
    [{ id: 'x', name: '', whatsapp: '31988887777' }],
    [{ id: 'x', name: 'Zé', whatsapp: '123' }],
    [{ id: 'x', name: 'Zé', whatsapp: '31988887777' }, { id: 'x', name: 'Zé 2', whatsapp: '31988887776' }],
    Array.from({ length: 21 }, (_, index) => ({ id: `m${index}`, name: `Moto ${index}`, whatsapp: '31988887777' }))
  ]) {
    assert.throws(() => validateDraftContent(draft({ deliveryCouriers: bad })), { code: 'INVALID_COURIER' });
  }
});

test('Delivery: taxa só na entrega, entre R$ 0 e R$ 500; pagamento com troco e variável {pagamento}', async () => {
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 600 }, 'delivery'), 600);
  assert.equal(deliveryFeeFor({ deliveryFeeCents: 600 }, 'pickup'), 0);
  assert.throws(() => validateDraftContent(draft({ orderFields: { deliveryOrPickup: true, deliveryFeeCents: 50001 } })), { code: 'INVALID_ORDER_FIELDS' });
  assert.throws(() => validateDraftContent(draft({ orderFields: { payment: 'sim' } })), { code: 'INVALID_ORDER_FIELDS' });

  const content = draft({
    orderFields: { deliveryOrPickup: true, deliveryFeeCents: 600, payment: true },
    messages: { whatsappTemplate: 'Pedido de {nome}:\n{itens}\nTotal: {total}\nPagamento: {pagamento}' }
  });
  validateDraftContent(content);
  const { menu } = await compile(content);
  assert.equal(menu.orderFields.deliveryFeeCents, 600);
  assert.equal(menu.orderFields.payment, true);

  assert.equal(describePayment({ method: 'pix' }, formatPriceBRL), 'Pix');
  assert.equal(describePayment({ method: 'cash', changeForCents: 5000 }, formatPriceBRL), 'Dinheiro (troco para R$ 50,00)');
  assert.equal(describePayment({ method: 'cheque' }, formatPriceBRL), '');
  assert.equal(interpolateWhatsappTemplate('Total: {total}\nPagamento: {pagamento}', { total: 'R$ 1,00', pagamento: 'Pix' }), 'Total: R$ 1,00\nPagamento: Pix');
  assert.equal(interpolateWhatsappTemplate('Total: {total}', { total: 'R$ 1,00', pagamento: 'Pix' }), 'Total: R$ 1,00\nPagamento: Pix');
});
