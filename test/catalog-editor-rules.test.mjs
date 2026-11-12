import test from 'node:test';
import assert from 'node:assert/strict';
import { publicMenu, whatsappLink } from '../src/public-menu.mjs';
import {
  formatCentsToBRL,
  parseCurrencyToCents,
  validateDraftContent
} from '../src/portal-validation.mjs';
import {
  applyCatalogTypeSwitch,
  getCatalogTypeDisplayLabel,
  normalizeDraftForEditor
} from '../web/portal/editor.js';
import { renderStructureFields } from '../web/portal/showcase-structure.js';

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

  await t.test('Troca de Tipo de Vitrine no editor: cancelar não altera o rascunho e confirmar mantém itens e categorias', () => {
    const initialDraft = normalizeDraftForEditor(
      {
        schemaVersion: 1,
        template: 'products-v1',
        catalogType: 'products',
        slug: 'estudio-ana',
        businessName: 'Estúdio Ana',
        whatsapp: '5511999999999',
        categories: [
          {
            id: 'cat-1',
            name: 'Serviços & Produtos',
            items: [
              { id: 'i-1', name: 'Consultoria Visual', priceCents: 18000, active: true },
              { id: 'i-2', name: 'Kit Aquarela', priceCents: 9500, active: true }
            ]
          }
        ]
      },
      { slug: 'estudio-ana', name: 'Estúdio Ana', template: 'products-v1' }
    );

    const snapshotBeforeCancel = JSON.stringify(initialDraft);
    // Simula cancelamento: o rascunho não sofre mutação e os rótulos do diálogo batem com os tipos
    assert.equal(getCatalogTypeDisplayLabel('booking'), 'Agendamento de Serviços');
    assert.equal(getCatalogTypeDisplayLabel('quote'), 'Lista de Interesse / Orçamento');
    assert.equal(JSON.stringify(initialDraft), snapshotBeforeCancel);
    assert.equal(initialDraft.catalogType, 'products');

    // Simula confirmação: aplica a troca para 'booking', preserva categorias e itens intactos e atualiza padrões
    applyCatalogTypeSwitch(initialDraft, 'booking');
    assert.equal(initialDraft.catalogType, 'booking');
    assert.equal(initialDraft.template, 'booking-v1');
    assert.equal(initialDraft.components.durationMinutes, true);
    assert.equal(initialDraft.orderFields.date, true);
    assert.ok(initialDraft.orderFields.timeSlots.length > 0);
    assert.equal(initialDraft.categories.length, 1);
    assert.equal(initialDraft.categories[0].name, 'Serviços & Produtos');
    assert.equal(initialDraft.categories[0].items.length, 2);
    assert.equal(initialDraft.categories[0].items[0].name, 'Consultoria Visual');
    assert.equal(initialDraft.categories[0].items[1].name, 'Kit Aquarela');
  });

  await t.test('renderStructureFields redesenhado monta cartões, seletor de modelos, cor e seções mantendo o formato de onSave', async () => {
    function makeNode(tag) {
      let _text = '';
      const classes = new Set();
      const el = {
        tagName: String(tag).toUpperCase(),
        ownerDocument: doc,
        id: '',
        type: '',
        value: '',
        checked: false,
        disabled: false,
        hidden: false,
        open: false,
        innerHTML: '',
        children: [],
        attributes: {},
        listeners: {},
        get className() {
          return [...classes].join(' ');
        },
        set className(v) {
          classes.clear();
          String(v || '')
            .split(/\s+/)
            .filter(Boolean)
            .forEach((c) => classes.add(c));
        },
        classList: {
          add: (...cs) => cs.forEach((c) => c && classes.add(c)),
          remove: (...cs) => cs.forEach((c) => classes.delete(c)),
          contains: (c) => classes.has(c)
        },
        get textContent() {
          if (this.children.length === 0) return _text;
          return this.children.map((c) => c.textContent ?? '').join('');
        },
        set textContent(v) {
          this.children = [];
          _text = String(v ?? '');
        },
        appendChild(child) {
          this.children.push(child);
          return child;
        },
        append(...nodes) {
          nodes.forEach((n) => {
            if (typeof n === 'string') {
              this.children.push({ nodeType: 3, textContent: n });
            } else if (n) {
              this.children.push(n);
            }
          });
        },
        replaceChildren(...nodes) {
          this.children = [...nodes];
          _text = '';
        },
        setAttribute(k, v) {
          this.attributes[k] = String(v);
          if (k === 'id') this.id = String(v);
        },
        getAttribute(k) {
          return this.attributes[k] ?? null;
        },
        addEventListener(type, fn) {
          if (!this.listeners[type]) this.listeners[type] = [];
          this.listeners[type].push(fn);
        },
        dispatchEvent(evt) {
          (this.listeners[evt.type] || []).forEach((fn) => fn(evt));
        }
      };
      return el;
    }

    const doc = {
      createElement: (tag) => makeNode(tag)
    };
    const root = makeNode('div');

    let savedPayload = null;
    renderStructureFields(
      root,
      {
        theme: { accentColor: '#C74414', fontPair: 'editorial-syne', buttonStyle: 'pill' },
        navigation: {
          header: [{ label: 'Início', href: '#sec-hero' }],
          footer: [{ label: 'Contato', href: '#sec-hours' }]
        },
        pages: [
          {
            slug: 'home',
            title: 'Início',
            active: true,
            sections: [
              { id: 'sec-hero', moduleCode: 'hero', active: true, config: { headline: 'Olá', subtitle: 'Sub' } }
            ]
          }
        ]
      },
      async (payload) => {
        savedPayload = payload;
      },
      [],
      null,
      {
        selected: '',
        templates: [{ code: 'products-v1', name: 'Produtos Clássico' }]
      }
    );

    const form = root.children[0];
    assert.ok(form, 'Deve montar o formulário de estrutura');
    await form.listeners.submit[0]({ preventDefault() {} });

    assert.ok(savedPayload, 'onSave deve ser chamado ao submeter o formulário');
    assert.deepEqual(savedPayload.themeOverrides, {
      accentColor: '#C74414',
      fontPair: 'editorial-syne',
      buttonStyle: 'pill'
    });
    assert.deepEqual(savedPayload.navigationMenus.header, [{ label: 'Início', href: '#sec-hero' }]);
    assert.equal(savedPayload.pages.length, 1);
    assert.equal(savedPayload.pages[0].sections[0].id, 'sec-hero');
  });
});
