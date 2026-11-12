import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateDraftContent } from '../src/portal-validation.mjs';
import { assertNoPrivateLeakage, compilePublicStorefront } from '../src/publication-engine.mjs';
import { StorefrontRenderer } from '../src/storefront-renderer.mjs';
import { findProhibitedQuotaTerm, getQuotaRemaining } from '../web/assets/quota-rules.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

function createDomMock() {
  const created = [];
  function makeEl(tag = 'div') {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: '',
      id: '',
      textContent: '',
      hidden: false,
      disabled: false,
      children: [],
      attributes: {},
      listeners: {},
      classList: {
        add(...tokens) {
          const existing = new Set(String(el.className || '').split(/\s+/).filter(Boolean));
          tokens.forEach((t) => existing.add(t));
          el.className = [...existing].join(' ');
        }
      },
      appendChild(child) {
        this.children.push(child);
        return child;
      },
      replaceChildren(...nodes) {
        this.children = nodes.flat();
      },
      setAttribute(key, val) {
        this.attributes[key] = String(val);
      },
      addEventListener(event, handler) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(handler);
      }
    };
    created.push(el);
    return el;
  }
  return { documentMock: { createElement: (tag) => makeEl(tag) }, created, makeEl };
}

async function withDom(fn) {
  const dom = createDomMock();
  const previous = globalThis.document;
  globalThis.document = dom.documentMock;
  try {
    return await fn(dom);
  } finally {
    if (previous === undefined) {
      delete globalThis.document;
    } else {
      globalThis.document = previous;
    }
  }
}

function baseDraft(items) {
  return {
    schemaVersion: 1,
    template: 'products-v1',
    catalogType: 'products',
    storefrontType: 'food',
    slug: 'padaria-coletiva',
    businessName: 'Padaria Coletiva',
    whatsapp: '5511999999999',
    categories: [{ id: 'geral', name: 'Geral', items }]
  };
}

const quotaItem = {
  id: 'forno',
  name: 'Forno novo da padaria',
  description: 'Ajude a comprar o forno que vai dobrar a produção.',
  priceMode: 'quota',
  priceCents: 2000,
  quotaTotal: 50,
  quotaFilled: 32,
  quotaReward: '1 pão de fermentação natural por cota',
  conditions: 'Entrega dos pães quando a meta fechar',
  active: true
};

const fixedItem = {
  id: 'pao',
  name: 'Pão de fermentação natural',
  priceCents: 1800,
  active: true
};

function expectCode(draft, code) {
  assert.throws(
    () => validateDraftContent(draft),
    (err) => err?.status === 422 && err?.code === code,
    `esperava ${code}`
  );
}

test('cotas - rascunho com item de cota válido é aceito', () => {
  const result = validateDraftContent(baseDraft([quotaItem, fixedItem]));
  assert.equal(result.activeItems, 2);
});

test('cotas - valor, total, confirmadas e benefício são validados no servidor', () => {
  expectCode(baseDraft([{ ...quotaItem, priceCents: 0 }]), 'INVALID_QUOTA_PRICE');
  expectCode(baseDraft([{ ...quotaItem, priceCents: undefined }]), 'INVALID_QUOTA_PRICE');
  expectCode(baseDraft([{ ...quotaItem, quotaTotal: undefined }]), 'INVALID_QUOTA_TOTAL');
  expectCode(baseDraft([{ ...quotaItem, quotaTotal: 1 }]), 'INVALID_QUOTA_TOTAL');
  expectCode(baseDraft([{ ...quotaItem, quotaTotal: 1001 }]), 'INVALID_QUOTA_TOTAL');
  expectCode(baseDraft([{ ...quotaItem, quotaTotal: 10.5 }]), 'INVALID_QUOTA_TOTAL');
  expectCode(baseDraft([{ ...quotaItem, quotaFilled: 51 }]), 'INVALID_QUOTA_FILLED');
  expectCode(baseDraft([{ ...quotaItem, quotaFilled: -1 }]), 'INVALID_QUOTA_FILLED');
  expectCode(baseDraft([{ ...quotaItem, quotaReward: 'x'.repeat(241) }]), 'INVALID_QUOTA_REWARD');
  expectCode(
    baseDraft([{ ...quotaItem, quotaReward: '<script>alert(1)</script>' }]),
    'INVALID_ITEM'
  );
  assert.doesNotThrow(() =>
    validateDraftContent(baseDraft([{ ...quotaItem, quotaFilled: 50 }]))
  );
});

test('cotas - rifa, sorteio, prêmio e retorno financeiro são barrados', () => {
  expectCode(baseDraft([{ ...quotaItem, name: 'Rifa do forno' }]), 'QUOTA_PROHIBITED_TERMS');
  expectCode(
    baseDraft([{ ...quotaItem, description: 'Concorra a uma cesta no SORTEIO de sexta' }]),
    'QUOTA_PROHIBITED_TERMS'
  );
  expectCode(
    baseDraft([{ ...quotaItem, quotaReward: 'Prêmio para quem tiver mais cotas' }]),
    'QUOTA_PROHIBITED_TERMS'
  );
  expectCode(
    baseDraft([{ ...quotaItem, conditions: 'Participação nos lucros da padaria' }]),
    'QUOTA_PROHIBITED_TERMS'
  );
  expectCode(
    baseDraft([{ ...quotaItem, quotaReward: 'Rendimento de 2% ao mês' }]),
    'QUOTA_PROHIBITED_TERMS'
  );

  expectCode(baseDraft([{ ...fixedItem, name: 'Número da sorte 23' }]), 'RAFFLE_NOT_ALLOWED');
  expectCode(
    baseDraft([{ ...fixedItem, description: 'Ação entre amigos para a festa' }]),
    'RAFFLE_NOT_ALLOWED'
  );
  expectCode(baseDraft([{ ...fixedItem, section: 'Rifas' }]), 'RAFFLE_NOT_ALLOWED');

  assert.doesNotThrow(() =>
    validateDraftContent(baseDraft([{ ...fixedItem, name: 'Kit de pães sortidos' }]))
  );
  assert.doesNotThrow(() =>
    validateDraftContent(baseDraft([{ ...fixedItem, description: 'Café premiado da serra' }]))
  );
  assert.equal(findProhibitedQuotaTerm('Prêmio de melhor pão'), null);
  assert.equal(findProhibitedQuotaTerm('Prêmio de melhor pão', { quota: true }), 'premio');
  assert.equal(findProhibitedQuotaTerm(['ok', 'Sorteamos amanhã']), 'sorteamos');
});

test('cotas - publicação projeta apenas os campos públicos da cota', async () => {
  const leftover = { ...fixedItem, quotaTotal: 40, quotaFilled: 3, quotaReward: 'sobra' };
  const draft = baseDraft([{ ...quotaItem, quotaFilled: undefined }, leftover]);
  const compiled = await compilePublicStorefront(draft, {
    slug: 'padaria-coletiva',
    name: 'Padaria Coletiva',
    template: 'products-v1'
  });

  const [publishedQuota, publishedFixed] = compiled.menu.items;
  assert.equal(publishedQuota.priceMode, 'quota');
  assert.equal(publishedQuota.priceCents, 2000);
  assert.equal(publishedQuota.quotaTotal, 50);
  assert.equal(publishedQuota.quotaFilled, 0);
  assert.equal(publishedQuota.quotaReward, '1 pão de fermentação natural por cota');
  assert.equal(publishedQuota.conditions, 'Entrega dos pães quando a meta fechar');
  assert.equal(publishedFixed.priceMode, undefined);
  assert.equal(publishedFixed.quotaTotal, undefined);
  assert.equal(publishedFixed.quotaReward, undefined);
  assert.equal(compiled.menu.categories[0].items[0].quotaTotal, 50);
  assert.doesNotThrow(() => assertNoPrivateLeakage(compiled.menu));
});

test('cotas - vitrine pública limita a seleção ao saldo e separa o total das cotas', async () => {
  await withDom(async ({ makeEl, created }) => {
    const draft = baseDraft([
      { ...quotaItem, quotaTotal: 10, quotaFilled: 7 },
      fixedItem,
      { ...quotaItem, id: 'esgotado', name: 'Batedeira', quotaTotal: 5, quotaFilled: 5 }
    ]);
    const { menu } = await compilePublicStorefront(draft, {
      slug: 'padaria-coletiva',
      name: 'Padaria Coletiva',
      template: 'products-v1'
    });
    const [forno, pao, batedeira] = menu.items;
    const renderer = new StorefrontRenderer(makeEl('div'), menu, { isPublicPage: true });
    renderer.render();

    const renderedText = created.map((el) => el.textContent).join('\n');
    assert.match(renderedText, /7 de 10 cotas confirmadas/);
    assert.match(renderedText, /R\$ 20,00 por cota/);
    assert.match(renderedText, /Meta: R\$ 200,00 · 3 cotas disponíveis/);
    assert.match(renderedText, /Cada cota garante: 1 pão de fermentação natural por cota/);
    assert.match(renderedText, /Sem sorteio: toda cota garante o mesmo benefício\./);
    assert.match(renderedText, /Cotas esgotadas/);
    assert.ok(created.some((el) => el.tagName === 'PROGRESS' && el.max === 10 && el.value === 7));

    assert.equal(getQuotaRemaining(forno), 3);
    assert.equal(renderer.setQuotaQuantity(batedeira, 1), false);
    assert.equal(renderer.cart.has(batedeira.id), false);

    renderer.setQuotaQuantity(forno, 1);
    renderer.setQuotaQuantity(forno, 1);
    renderer.setQuotaQuantity(forno, 1);
    assert.equal(renderer.setQuotaQuantity(forno, 1), false);
    assert.equal(renderer.cart.get(forno.id), 3);
    assert.match(renderer.itemErrors.get(forno.id), /Restam apenas 3 cotas/);
    assert.equal(renderer.getCartTotal(), 0);
    assert.equal(renderer.getQuotaTotal(), 6000);

    const quotaOnlyMessage = renderer.buildOrderMessage();
    assert.match(
      quotaOnlyMessage,
      /- 3 cotas de apoio: Forno novo da padaria \(3 × R\$ 20,00 = R\$ 60,00\)/
    );
    assert.match(quotaOnlyMessage, /reserva sem sorteio; o pagamento é combinado nesta conversa/);
    assert.match(quotaOnlyMessage, /Total: R\$ 60,00 em cotas/);
    assert.doesNotMatch(quotaOnlyMessage, /à parte do total/);

    renderer.setQuantity(pao, 1);
    assert.equal(renderer.getCartTotal(), 1800);
    const mixedMessage = renderer.buildOrderMessage();
    assert.match(mixedMessage, /- 1x Pão de fermentação natural — R\$ 18,00/);
    assert.match(mixedMessage, /Cotas reservadas \(à parte do total\): R\$ 60,00/);
    assert.match(mixedMessage, /Total: R\$ 18,00\n/);

    renderer.setQuotaQuantity(forno, -3);
    assert.equal(renderer.cart.has(forno.id), false);
    assert.doesNotMatch(renderer.buildOrderMessage(), /cotas/i);
  });
});

test('cotas - agendamento trata item de cota como serviço comum', () => {
  const renderer = new StorefrontRenderer(null, { catalogType: 'booking', items: [] });
  assert.equal(renderer.getItemPriceMode({ priceMode: 'quota', quotaTotal: 10 }), 'fixed');
  const products = new StorefrontRenderer(null, { catalogType: 'products', items: [] });
  assert.equal(products.getItemPriceMode({ priceMode: 'quota', quotaTotal: 10 }), 'quota');
  assert.equal(products.getItemPriceMode({ priceMode: 'quota' }), 'fixed');
});

test('cotas - painel oferece o tipo "Cotas de apoio" com aviso legal', async () => {
  const html = await readFile(resolve(root, 'web/portal/index.html'), 'utf8');
  const editor = await readFile(resolve(root, 'web/portal/editor.js'), 'utf8');
  assert.match(html, /data-price-mode="quota"/);
  assert.match(html, /<symbol id="icon-users-quota"/);
  assert.match(editor, /\['quota', 'Cotas de apoio \(sem sorteio\)'\]/);
  assert.match(editor, /exigem autorização federal/);
  assert.match(editor, /from '\.\.\/assets\/quota-rules\.mjs'/);
  for (const source of [html, editor]) {
    assert.doesNotMatch(source, /\bcat[aá]logo de cotas|card[aá]pio de cotas/i);
  }
});
