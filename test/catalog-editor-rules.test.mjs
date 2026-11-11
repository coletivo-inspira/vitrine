import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMenu, whatsappLink } from '../src/public-menu.mjs';
import {
  formatCentsToBRL,
  parseCurrencyToCents,
  validateDraftContent
} from '../src/portal-validation.mjs';

export function parseBrlToCents(val) {
  if (typeof val !== 'string') {
    throw new TypeError('Price must be a string');
  }
  const clean = val.trim();
  if (!/^\d+(?:,\d{2})?$/.test(clean)) {
    throw new Error('Invalid BRL price format');
  }
  return parseCurrencyToCents(clean);
}

export function validateCatalogDraft(content) {
  validateDraftContent(content);
  return true;
}

test('Frente QA - Regras do Editor de Cardápio e Máscara de Centavos', async (t) => {

  await t.test('Máscara de Centavos: conversão determinística de BRL para centavos', () => {
    // Casos válidos
    assert.equal(parseBrlToCents('49,90'), 4990);
    assert.equal(parseBrlToCents('5'), 500);
    assert.equal(parseBrlToCents('0,05'), 5);
    assert.equal(parseBrlToCents('  120,50  '), 12050);
    assert.equal(formatCentsToBRL(4990), 'R$ 49,90');
    assert.equal(formatCentsToBRL(5), 'R$ 0,05');

    // Rejeições de floats, NaN, negativos ou zero
    assert.throws(() => parseBrlToCents(49.9), TypeError);
    assert.throws(() => parseBrlToCents('49.90'), Error); // uso de ponto
    assert.throws(() => parseBrlToCents('NaN'), Error);
    assert.throws(() => parseBrlToCents('0,00'), Error);
    assert.throws(() => parseBrlToCents('0'), Error);
    assert.throws(() => parseBrlToCents('-5,00'), Error);
    assert.throws(() => parseBrlToCents('-5'), Error);
    assert.throws(() => parseBrlToCents(''), Error);
    assert.throws(() => parseBrlToCents('abc'), Error);
  });

  await t.test('Limites do Plano Gratuito: ativos e ocultos', () => {
    const validDraft = {
      template: 'pizzeria-v1',
      slug: 'pizza-exemplo',
      name: 'Pizzaria Exemplo',
      whatsapp: '5511999999999',
      items: []
    };

    // Gera 20 itens ativos e 80 itens ocultos (total 100 itens)
    for (let i = 1; i <= 20; i++) {
      validDraft.items.push({ id: `a${i}`, name: `Ativo ${i}`, priceCents: 1000, active: true, available: true });
    }
    for (let i = 1; i <= 80; i++) {
      validDraft.items.push({ id: `i${i}`, name: `Oculto ${i}`, priceCents: 1000, active: false, available: true });
    }

    assert.equal(validDraft.items.length, 100);
    assert.ok(validateCatalogDraft(validDraft));

    // Adicionar mais um item oculto (total 101) deve estourar o teto total de 100 itens
    const overflowTotal = structuredClone(validDraft);
    overflowTotal.items.push({ id: 'i81', name: 'Oculto 81', priceCents: 1000, active: false });
    assert.throws(() => validateCatalogDraft(overflowTotal), (err) => err.code === 'TOTAL_ITEMS_LIMIT_EXCEEDED');

    // Ativar um item oculto (total 21 ativos) deve estourar o limite gratuito de 20 ativos
    const overflowActive = structuredClone(validDraft);
    overflowActive.items[20].active = true; // Ativa um dos itens ocultos
    assert.throws(() => validateCatalogDraft(overflowActive), (err) => err.code === 'ACTIVE_ITEMS_LIMIT_EXCEEDED');
  });

  await t.test('Validação de preços inválidos no rascunho', () => {
    const draft = {
      template: 'pizzeria-v1',
      slug: 'pizza-exemplo',
      name: 'Pizzaria Exemplo',
      whatsapp: '5511999999999',
      items: [
        { id: '1', name: 'Pizza', priceCents: 0, active: true } // preço zero
      ]
    };
    assert.throws(() => validateCatalogDraft(draft), (err) => err.code === 'INVALID_PRICE_CENTS');

    draft.items[0].priceCents = -100; // preço negativo
    assert.throws(() => validateCatalogDraft(draft), (err) => err.code === 'INVALID_PRICE_CENTS');

    draft.items[0].priceCents = 15.5; // preço float
    assert.throws(() => validateCatalogDraft(draft), (err) => err.code === 'INVALID_PRICE_CENTS');
  });

  await t.test('Validação do tamanho de payload', () => {
    const draft = {
      template: 'pizzeria-v1',
      slug: 'pizza-exemplo',
      name: 'Pizzaria Exemplo',
      whatsapp: '5511999999999',
      items: []
    };

    // Adiciona itens com descrições muito longas para simular payload > 256 KiB
    for (let i = 1; i <= 90; i++) {
      draft.items.push({
        id: `item-${i}`,
        name: 'Pizza Muito Longa '.repeat(200),
        priceCents: 5000,
        active: false
      });
    }

    assert.throws(() => validateCatalogDraft(draft), (err) => err.code === 'DRAFT_TOO_LARGE');
  });

  await t.test('Compatibilidade integral com publicMenu() e whatsappLink() de public-menu.mjs', () => {
    const draft = {
      template: 'pizzeria-v1',
      slug: 'pizza-exemplo',
      name: 'Pizzaria Exemplo',
      whatsapp: '5511999999999',
      items: [
        { id: 'p1', name: 'Mussarela', priceCents: 4500, active: true, available: true },
        { id: 'p2', name: 'Calabresa', priceCents: 4990, active: true, available: true },
        { id: 'p3', name: 'Rascunho Secreto', priceCents: 3000, active: false, available: true }
      ]
    };

    // O rascunho deve ser perfeitamente válido pelas regras do editor
    assert.ok(validateCatalogDraft(draft));

    // publicMenu deve processar com sucesso o rascunho válido, gerando a projeção pública
    const publicData = publicMenu(draft);
    assert.equal(publicData.schemaVersion, 1);
    assert.equal(publicData.slug, 'pizza-exemplo');
    assert.equal(publicData.items.length, 2); // Apenas ativos
    assert.deepEqual(publicData.items, [
      { id: 'p1', name: 'Mussarela', priceCents: 4500 },
      { id: 'p2', name: 'Calabresa', priceCents: 4990 }
    ]);

    // whatsappLink deve gerar corretamente o link para itens ativos
    const link1 = whatsappLink(publicData, 'p1');
    const url1 = new URL(link1);
    assert.equal(url1.origin, 'https://wa.me');
    assert.equal(url1.pathname, '/5511999999999');
    assert.match(url1.searchParams.get('text'), /Mussarela/);

    // Itens ocultos/inválidos devem falhar ao tentar gerar link do WhatsApp
    assert.throws(() => whatsappLink(publicData, 'p3'), /Unknown item/);
  });
});
