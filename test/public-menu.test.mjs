import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMenu, whatsappLink } from '../src/public-menu.mjs';

const draft = () => ({ template: 'pizzeria-v1', slug: 'pizza-exemplo', name: 'Pizzaria Exemplo',
  whatsapp: '5511999999999', ownerEmail: 'private@example.invalid', accessToken: 'never-publish',
  items: [{ id: 'm', name: 'Margherita & queijo', priceCents: 4500, active: true, internalCost: 1000 },
    { id: 'hidden', name: 'Rascunho', priceCents: 1, active: false }] });

test('exports only explicitly public fields and active menu items', () => {
  assert.deepEqual(publicMenu(draft()), { schemaVersion: 1, template: 'pizzeria-v1',
    slug: 'pizza-exemplo', name: 'Pizzaria Exemplo', whatsapp: '5511999999999', currency: 'BRL',
    items: [{ id: 'm', name: 'Margherita & queijo', priceCents: 4500 }] });
});
test('rejects invalid prices, routes, templates and phone injection', () => {
  for (const change of [{ slug: '../admin' }, { slug: 'admin' }, { whatsapp: '1?text=evil' },
    { template: 'custom-script' }, { items: [{ id: 'x', name: 'X', active: true, priceCents: 1.5 }] }]) {
    assert.throws(() => publicMenu({ ...draft(), ...change }), TypeError);
  }
});
test('rejects ambiguous item identifiers', () => {
  const data = draft(); data.items = [data.items[0], data.items[0]];
  assert.throws(() => publicMenu(data), /Duplicate/);
});
test('WhatsApp URL uses only validated digits and encoded text', () => {
  const menu = publicMenu(draft());
  const url = new URL(whatsappLink(menu, 'm'));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/5511999999999');
  assert.equal(url.searchParams.size, 1);
  assert.match(url.searchParams.get('text'), /Margherita & queijo/);
  assert.throws(() => whatsappLink(menu, 'hidden'), /Unknown/);
});
test('projection does not mutate the private draft', () => {
  const data = draft(); const before = structuredClone(data);
  publicMenu(data); assert.deepEqual(data, before);
});
