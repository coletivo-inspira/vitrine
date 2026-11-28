import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDispatchMessage, courierWhatsappLink, mapsLink, parseOrderMessage } from '../web/portal/dispatch.mjs';
import { nextCourierId, parseCentsInput, formatCentsInput } from '../web/portal/delivery-panel.mjs';
import { itemOptionsFromRows } from '../web/portal/item-options-field.mjs';
import { normalizeItemOptions } from '../web/assets/item-options.mjs';

const ORDER = [
  'Olá, Forno de Minas! Meu nome é Joana.',
  'Quero pedir:',
  '- 1x 04. Calabresa (Gigante, meio a meio com 12. Portuguesa, Borda: Catupiry) — R$ 69,80',
  '- Taxa de entrega — R$ 5,00',
  'Total: R$ 74,80',
  'Entrega: Rua da Bahia, 1000 - Centro',
  'Pagamento: Dinheiro (troco para R$ 100,00)',
  'Observações: Interfone 12'
].join('\n');

test('Despacho: lê nome, endereço, total, pagamento e observações da mensagem da vitrine', () => {
  const order = parseOrderMessage(ORDER);
  assert.equal(order.name, 'Joana');
  assert.equal(order.address, 'Rua da Bahia, 1000 - Centro');
  assert.equal(order.total, 'R$ 74,80');
  assert.equal(order.payment, 'Dinheiro (troco para R$ 100,00)');
  assert.equal(order.notes, 'Interfone 12');
  assert.equal(order.pickup, false);
  assert.equal(parseOrderMessage('Olá! Tenho interesse nestes itens:\n- 1x Pizza\nTotal estimado: R$ 39,90\nRetirada no local').total, 'R$ 39,90');
  assert.equal(parseOrderMessage('Retirada no local').pickup, true);
  assert.deepEqual(parseOrderMessage('oi, quero uma pizza'), {
    name: '', address: '', total: '', payment: '', notes: '', location: '', pickup: false, text: 'oi, quero uma pizza'
  });
});

test('Despacho: mensagem do entregador com mapa e link wa.me com DDI', () => {
  const order = parseOrderMessage(ORDER);
  const message = buildDispatchMessage(order, { businessName: 'Pizzaria Forno de Minas', courierName: 'João' });
  assert.match(message, /^Entrega Pizzaria Forno de Minas para João\nCliente: Joana\nEndereço: Rua da Bahia, 1000 - Centro\n/);
  assert.match(message, /Mapa: https:\/\/www\.google\.com\/maps\/search\/\?api=1&query=Rua%20da%20Bahia%2C%201000%20-%20Centro/);
  assert.match(message, /Cobrar: R\$ 74,80\nPagamento: Dinheiro \(troco para R\$ 100,00\)/);
  assert.match(message, /\n\nPedido:\nOlá, Forno de Minas!/);
  assert.equal(mapsLink(''), '');
  assert.equal(courierWhatsappLink({ whatsapp: '31976543210' }, 'oi'), 'https://wa.me/5531976543210?text=oi');
  assert.equal(courierWhatsappLink({ whatsapp: '5531976543210' }, 'oi'), 'https://wa.me/5531976543210?text=oi');
  assert.equal(courierWhatsappLink({ whatsapp: '' }, 'oi'), '');
});

test('Painel Delivery: ids de entregador, valores em reais e opções do item só quando completas', () => {
  assert.equal(nextCourierId('João da Moto', []), 'joao-da-moto');
  assert.equal(nextCourierId('João da Moto', [{ id: 'joao-da-moto' }]), 'joao-da-moto-2');
  assert.equal(parseCentsInput('R$ 5,00'), 500);
  assert.equal(formatCentsInput(123456), 'R$ 1.234,56');

  const incomplete = itemOptionsFromRows({
    sizes: [{ id: '', label: 'Média', priceCents: 2990 }, { id: '', label: 'Grande', priceCents: 0 }],
    extras: { label: 'Borda', choices: [] }
  });
  assert.equal(incomplete.sizes, undefined);
  assert.equal(incomplete.extras, undefined);

  const complete = itemOptionsFromRows({
    sizes: [{ id: '', label: 'Média', priceCents: 2990 }, { id: '', label: 'Grande', priceCents: 3990 }],
    extras: { label: 'Borda', choices: [{ id: '', label: 'Catupiry', priceCents: 0, prices: { media: 990, grande: 1290 } }] }
  });
  assert.deepEqual(complete.sizes.map((size) => size.id), ['media', 'grande']);
  assert.deepEqual(complete.extras, {
    label: 'Borda',
    choices: [{ id: 'catupiry', label: 'Catupiry', priceCents: 990, prices: { media: 990, grande: 1290 } }]
  });
  assert.deepEqual(normalizeItemOptions({ ...complete, priceCents: 3990 }).errors, []);
});
