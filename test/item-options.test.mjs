import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  defaultItemChoice,
  describeItemChoice,
  halfAndHalfPartners,
  itemUnitPriceCents,
  normalizeItemOptions
} from '../web/assets/item-options.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { staticStorefrontLimits } from '../src/static-storefronts.mjs';
import { withDomMock } from './fixtures/dom-mock.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

const sizes = (m, g, x) => [
  { id: 'media', label: 'Média', priceCents: m },
  { id: 'grande', label: 'Grande', priceCents: g },
  { id: 'gigante', label: 'Gigante', priceCents: x }
];
const borda = {
  label: 'Borda',
  choices: [{ id: 'catupiry', label: 'Catupiry', priceCents: 1290, prices: { media: 990, gigante: 1490 } }]
};
const calabresa = { id: 'calabresa', name: 'Calabresa', priceCents: 3990, sizes: sizes(2990, 3990, 4990), halfAndHalf: true, extras: borda, active: true };
const portuguesa = { id: 'portuguesa', name: 'Portuguesa', priceCents: 3990, sizes: sizes(2990, 3990, 5490), halfAndHalf: true, active: true };
const refri = { id: 'refri', name: 'Refri', priceCents: 990, active: true };
const menuItems = [calabresa, portuguesa, refri];

function draft(items) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    slug: 'pizzaria-teste',
    businessName: 'Pizzaria Teste',
    whatsapp: '5531999998888',
    categories: [{ id: 'pizzas', name: 'Pizzas', items }]
  };
}

test('Opções do item: tamanho padrão é o do preço do item; meio a meio cobra o maior; borda por tamanho', () => {
  assert.deepEqual(defaultItemChoice(calabresa), { sizeId: 'grande', halfWith: null, extraId: null });
  assert.equal(itemUnitPriceCents(calabresa, { sizeId: 'grande' }, menuItems), 3990);
  assert.equal(itemUnitPriceCents(calabresa, { sizeId: 'gigante', halfWith: 'portuguesa' }, menuItems), 5490);
  assert.equal(itemUnitPriceCents(calabresa, { sizeId: 'gigante', halfWith: 'portuguesa', extraId: 'catupiry' }, menuItems), 5490 + 1490);
  assert.equal(itemUnitPriceCents(calabresa, { sizeId: 'grande', extraId: 'catupiry' }, menuItems), 3990 + 1290, 'sem preço do tamanho, vale o preço base da borda');
  assert.equal(itemUnitPriceCents(calabresa, { sizeId: 'grande', halfWith: 'refri' }, menuItems), 3990, 'item sem meio a meio não vira metade');
  assert.deepEqual(halfAndHalfPartners(calabresa, menuItems, 'media').map((item) => item.id), ['portuguesa']);
  assert.equal(
    describeItemChoice(calabresa, { sizeId: 'gigante', halfWith: 'portuguesa', extraId: 'catupiry' }, menuItems),
    'Gigante, meio a meio com Portuguesa, Borda: Catupiry'
  );
});

test('Opções do item: validação recusa tamanhos fora do limite, repetidos ou sem preço e adicional com tamanho inexistente', () => {
  assert.deepEqual(normalizeItemOptions(calabresa).errors, []);
  const cases = [
    { sizes: [{ id: 'unico', label: 'Único', priceCents: 1000 }] },
    { sizes: [{ id: 'a', label: 'A', priceCents: 1000 }, { id: 'a', label: 'B', priceCents: 2000 }] },
    { sizes: [{ id: 'a', label: 'A', priceCents: 0 }, { id: 'b', label: 'B', priceCents: 2000 }] },
    { halfAndHalf: 'sim' },
    { sizes: sizes(1, 2, 3), extras: { label: 'Borda', choices: [{ id: 'x', label: 'X', priceCents: 100, prices: { familia: 200 } }] } },
    { extras: { label: 'Borda', choices: [] } }
  ];
  for (const options of cases) {
    const item = { id: 'p', name: 'Pizza', priceCents: 1000, ...options };
    assert.ok(normalizeItemOptions(item).errors.length, JSON.stringify(options));
    assert.throws(() => validateDraftContent(draft([item])), { code: 'INVALID_ITEM_OPTIONS' });
  }
  assert.throws(
    () => validateDraftContent(draft([{ ...calabresa, extras: { label: '<script>x</script>', choices: borda.choices } }])),
    { status: 422 }
  );
});

test('Opções do item: publicação leva tamanhos, meio a meio e borda; a página sem JavaScript lista os tamanhos', async () => {
  const { menu } = await compilePublicStorefront(draft(menuItems), { slug: 'pizzaria-teste', name: 'Pizzaria Teste', template: 'pizzeria-v1' }, { revision: 1 });
  const published = menu.items.find((item) => item.id === 'calabresa');
  assert.deepEqual(published.sizes, calabresa.sizes);
  assert.equal(published.halfAndHalf, true);
  assert.deepEqual(published.extras, borda);
  assert.equal(menu.items.find((item) => item.id === 'refri').sizes, undefined);
  assert.match(renderStorefrontHtml(menu), /<p class="menu-item-sizes">Média R\$ 29,90 · Grande R\$ 39,90 · Gigante R\$ 49,90<\/p>/);
});

test('Forno de Minas: Gigante meio a meio com borda, entrega e pagamento em dinheiro na mensagem', async () => {
  const source = JSON.parse(await readFile(resolve(root, 'content/vitrines/forno-de-minas.json'), 'utf8'));
  source.orderFields = { ...source.orderFields, deliveryFeeCents: 500 };
  const { menu } = await compilePublicStorefront(source, { slug: source.slug, name: source.businessName, template: source.template }, {
    revision: 1,
    ...staticStorefrontLimits(source.slug)
  });
  const pizzas = menu.items.filter((item) => item.sizes);
  assert.equal(pizzas.length, 25);
  assert.ok(pizzas.every((item) => item.halfAndHalf && item.extras?.label === 'Borda'));

  const message = withDomMock(({ byId }) => {
    const renderer = new StorefrontRenderer(byId.get('storefront-catalog'), menu, { isPublicPage: true });
    renderer.render();
    const calabresaItem = menu.items.find((item) => item.id === 'calabresa');
    renderer.setItemChoice(calabresaItem, { sizeId: 'gigante', halfWith: 'portuguesa', extraId: 'catupiry' });
    renderer.setQuantity(calabresaItem, 1);
    assert.equal(renderer.getCartTotal(), 5490 + 1490);
    renderer.customerDetails.customerName = 'Joana';
    renderer.customerDetails.deliveryOrPickup = 'delivery';
    renderer.customerDetails.address = 'Rua da Bahia, 1000 - Centro';
    renderer.customerDetails.paymentMethod = 'cash';
    renderer.customerDetails.changeFor = '10000';
    assert.equal(renderer.getOrderTotal(), 5490 + 1490 + 500);
    renderer.goToStage(2);
    renderer.goToStage(3);
    return renderer.buildOrderMessage();
  });

  assert.match(message, /Meu nome é Joana\./);
  assert.match(message, /- 1x 04\. Calabresa \(Gigante, meio a meio com 12\. Portuguesa, Borda: Catupiry\) — R\$ 69,80/);
  assert.match(message, /- Taxa de entrega — R\$ 5,00/);
  assert.match(message, /Total: R\$ 74,80/);
  assert.match(message, /Entrega: Rua da Bahia, 1000 - Centro/);
  assert.match(message, /Pagamento: Dinheiro \(troco para R\$ 100,00\)/);
});
