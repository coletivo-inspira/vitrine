import test from 'node:test';
import assert from 'node:assert';
import { migrateLegacyDraftContent } from '../src/portal-validation.mjs';

test('storefront-staged-flow - WhatsApp template interpolation', () => {
  // Simple Mock of template interpolation logic used by Stage 3
  function interpolateTemplate(template, data) {
    return template
      .replace('{nome}', data.nome || '')
      .replace('{itens}', data.itens || '')
      .replace('{total}', data.total || '')
      .replace('{data}', data.data || '')
      .replace('{horario}', data.horario || '')
      .replace('{endereco}', data.endereco || '');
  }

  const template = "Olá! Meu nome é {nome}. Gostaria de:\n{itens}\nTotal: {total}\nEntrega/Retirada: {endereco}";
  const data = {
    nome: "Carlos",
    itens: "- 2x Picanha (R$ 178,00)",
    total: "R$ 178,00",
    endereco: "Rua das Flores, 123"
  };

  const result = interpolateTemplate(template, data);
  assert.ok(result.includes('Carlos'));
  assert.ok(result.includes('178,00'));
  assert.ok(result.includes('Flores'));
});

test('storefront-staged-flow - migrateLegacyDraftContent parses and migrates pizzeria-v1 correctly', () => {
  const legacyDraft = {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    whatsapp: '5511999999999',
    businessName: 'Pizzaria Bella',
    categories: [
      {
        name: 'Tradicionais',
        items: [
          { id: '1', name: 'Margherita', description: 'Molho e muçarela', priceCents: 4500, active: true }
        ]
      }
    ]
  };

  const migrated = migrateLegacyDraftContent(legacyDraft);

  // Validate fields set by migrateLegacyDraftContent
  assert.equal(migrated.template, 'pizzeria-v1');
  assert.equal(migrated.catalogType, 'products');
  assert.equal(migrated.storefrontType, 'food');
  assert.equal(migrated.businessName, 'Pizzaria Bella');
  
  // Validate default components are added
  assert.ok(migrated.components);
  assert.equal(migrated.components.photo, false); // For legacy pizzeria-v1, photo defaults to false
  assert.equal(migrated.components.price, true);
  assert.equal(migrated.components.quantitySelector, true);

  // Validate default orderFields are added
  assert.ok(migrated.orderFields);
  assert.equal(migrated.orderFields.deliveryOrPickup, true);
  assert.equal(migrated.orderFields.customerName, true);

  // Validate default messages are added
  assert.ok(migrated.messages);
  assert.equal(migrated.messages.heroTitle, 'Pizzaria Bella');
  assert.ok(migrated.messages.welcomeText);
});
