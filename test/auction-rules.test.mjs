import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AUCTION_RULES,
  AuctionError,
  applySoftClose,
  computeMaxBidCents,
  computeNextMinimumCents,
  formatRemaining,
  getAuctionTerms,
  isAuctionItem,
  normalizeBidderWhatsapp,
  validateBidPayload
} from '../web/assets/auction-rules.mjs';
import { StorefrontRenderer } from '../web/assets/storefront-renderer.mjs';
import { buildWinnerWhatsappHref, renderAuctionCards } from '../web/portal/auctions-panel.js';

function createDom() {
  function makeEl(tag) {
    const el = {
      tagName: String(tag).toUpperCase(),
      className: '',
      id: '',
      textContent: '',
      value: '',
      href: '',
      hidden: false,
      disabled: false,
      checked: false,
      open: false,
      children: [],
      attributes: {},
      listeners: {},
      classList: {
        add(...tokens) {
          const set = new Set(el.className.split(/\s+/).filter(Boolean));
          tokens.forEach((t) => set.add(t));
          el.className = [...set].join(' ');
        }
      },
      appendChild(child) {
        el.children.push(child);
        return child;
      },
      replaceChildren(...nodes) {
        el.children = nodes;
      },
      setAttribute(key, val) {
        el.attributes[key] = String(val);
      },
      addEventListener(event, handler) {
        (el.listeners[event] ??= []).push(handler);
      },
      click() {
        (el.listeners.click ?? []).forEach((handler) => handler({ preventDefault() {} }));
      },
      focus() {},
      closest() {
        return null;
      },
      showModal() {
        el.open = true;
      },
      close() {
        el.open = false;
        (el.listeners.close ?? []).forEach((handler) => handler());
      }
    };
    return el;
  }
  const body = makeEl('body');
  return { document: { createElement: makeEl, body, activeElement: null }, body };
}

function allNodes(root) {
  return [root, ...root.children.flatMap((child) => allNodes(child))];
}

function textOf(root) {
  return allNodes(root).map((node) => node.textContent).join(' | ');
}

function findButton(root, label) {
  return allNodes(root).find((node) => node.tagName === 'BUTTON' && node.textContent === label);
}

const ENDS_AT = new Date(Date.now() + 2 * 86_400_000).toISOString();
const MENU = {
  template: 'products-v1',
  catalogType: 'products',
  whatsapp: '5551988887777',
  items: [
    { id: 'vaso', name: 'Vaso Raro', priceMode: 'offer', priceCents: 5000, bidIncrementCents: 500, auctionEndsAt: ENDS_AT },
    { id: 'livre', name: 'Oferta livre', priceMode: 'offer', priceCents: 1000 }
  ]
};

test('Regras puras do leilão', () => {
  assert.equal(isAuctionItem(MENU.items[0]), true);
  assert.equal(isAuctionItem(MENU.items[1]), false);
  assert.equal(isAuctionItem({ priceMode: 'donation', auctionEndsAt: ENDS_AT }), false);
  assert.deepEqual(getAuctionTerms({ priceMode: 'offer', priceCents: 0, auctionEndsAt: ENDS_AT }), {
    startCents: AUCTION_RULES.minStartCents,
    incrementCents: AUCTION_RULES.defaultIncrementCents,
    scheduledEndsAt: ENDS_AT
  });
  assert.equal(computeNextMinimumCents({ startCents: 5000, incrementCents: 500, currentCents: null }), 5000);
  assert.equal(computeNextMinimumCents({ startCents: 5000, incrementCents: 500, currentCents: 8000 }), 8500);
  assert.equal(computeMaxBidCents(8500), 85000);
  assert.equal(computeMaxBidCents(50_000_000), AUCTION_RULES.maxAmountCents);

  const scheduled = Date.parse('2026-11-20T21:00:00Z');
  assert.equal(applySoftClose({ endsAtMs: scheduled, scheduledEndsAtMs: scheduled, nowMs: scheduled - 600_000 }), scheduled);
  assert.equal(
    applySoftClose({ endsAtMs: scheduled, scheduledEndsAtMs: scheduled, nowMs: scheduled - 60_000 }),
    scheduled + 120_000
  );
  assert.equal(
    applySoftClose({ endsAtMs: scheduled + 3_590_000, scheduledEndsAtMs: scheduled, nowMs: scheduled + 3_589_000 }),
    scheduled + AUCTION_RULES.maxExtensionMs
  );

  assert.equal(normalizeBidderWhatsapp('(51) 99999-8888'), '5551999998888');
  assert.equal(normalizeBidderWhatsapp('+1 415 555 0101'), '14155550101');
  assert.equal(normalizeBidderWhatsapp('123'), null);
  assert.equal(formatRemaining(90 * 60_000), '1 h 30 min');
  assert.equal(formatRemaining(30_000), 'menos de 1 min');
  assert.equal(formatRemaining(-1), 'encerrado');

  assert.deepEqual(
    validateBidPayload({ itemId: 'vaso', amountCents: 5000, name: '  Ana   Souza ', whatsapp: '51999998888', consent: true }),
    { itemId: 'vaso', amountCents: 5000, name: 'Ana Souza', whatsapp: '5551999998888' }
  );
  for (const bad of [
    { itemId: 'vaso', amountCents: 5000.5, name: 'Ana', whatsapp: '51999998888', consent: true },
    { itemId: 'vaso', amountCents: 5000, name: 'A', whatsapp: '51999998888', consent: true },
    { itemId: 'vaso', amountCents: 5000, name: 'Ana', whatsapp: '51999998888', consent: 'sim' },
    { itemId: 'vaso', amountCents: 5000, name: '<script>', whatsapp: '51999998888', consent: true }
  ]) {
    assert.throws(() => validateBidPayload(bad), (err) => err instanceof AuctionError && err.code === 'INVALID_BID');
  }
});

test('Prévia do editor mostra o leilão sem permitir lance', () => {
  const { document } = createDom();
  globalThis.document = document;
  const container = document.createElement('div');
  const renderer = new StorefrontRenderer(container, MENU, { isPreview: true });
  renderer.render();
  const text = textOf(container);
  assert.match(text, /Leilão/);
  assert.match(text, /Lance inicial R\$ 50,00/);
  assert.match(text, /Os lances ficam disponíveis na vitrine publicada/);
  assert.equal(findButton(container, 'Dar lance').disabled, true);
  assert.match(text, /Faça sua oferta/, 'item de lance sem prazo mantém a oferta pelo WhatsApp');
});

test('Vitrine pública registra lance pelo diálogo e indica quem está na frente', async () => {
  const { document, body } = createDom();
  globalThis.document = document;
  const container = document.createElement('div');
  const calls = [];
  const client = {
    async placeBid(payload) {
      calls.push(payload);
      return {
        ok: true,
        bid: { ref: 'abcd1234', amountCents: payload.amountCents, placedAt: new Date().toISOString() },
        lot: {
          itemId: 'vaso', status: 'open', endsAt: ENDS_AT, scheduledEndsAt: ENDS_AT, startCents: 5000,
          incrementCents: 500, currentCents: payload.amountCents, nextMinCents: payload.amountCents + 500,
          bidCount: 1, leadingRef: 'abcd1234', recentBids: [{ amountCents: payload.amountCents, placedAt: new Date().toISOString() }]
        }
      };
    }
  };
  const renderer = new StorefrontRenderer(container, MENU, { isPublicPage: true, auctionClient: client, targetWhatsapp: MENU.whatsapp });
  renderer.render();

  assert.equal(renderer.startBid(MENU.items[0], 'R$ 40,00'), false);
  assert.match(textOf(container), /O lance mínimo agora é R\$ 50,00/);

  assert.equal(renderer.startBid(MENU.items[0], 'R$ 60,00'), true);
  const dialog = body.children.find((node) => node.tagName === 'DIALOG');
  assert.equal(dialog.open, true);
  const parts = renderer.bidDialogParts;
  parts.nameInput.value = 'Ana Souza';
  parts.phoneInput.value = '(51) 91111-2222';
  assert.equal(await renderer.submitBidDialog(), false);
  assert.match(parts.error.textContent, /autorização/);
  parts.consent.checked = true;
  assert.equal(await renderer.submitBidDialog(), true);
  assert.deepEqual(calls[0], {
    itemId: 'vaso', amountCents: 6000, name: 'Ana Souza', whatsapp: '5551911112222', consent: true, website: ''
  });
  assert.equal(dialog.open, false);
  const text = textOf(container);
  assert.match(text, /Lance atual R\$ 60,00/);
  assert.match(text, /Você está na frente/);
  const wa = allNodes(container).find((node) => node.tagName === 'A' && node.textContent === 'Avisar pelo WhatsApp');
  assert.match(wa.href, /^https:\/\/wa\.me\/5551988887777\?text=/);
  assert.match(decodeURIComponent(wa.href), /R\$ 60,00 no item "Vaso Raro"/);
  assert.equal(renderer.cart.size, 0, 'lance de leilão não entra no carrinho');

  renderer.setAuctionBoard({
    serverNow: new Date().toISOString(),
    lots: [{ ...renderer.auctionBoard.get('vaso'), currentCents: 6500, nextMinCents: 7000, leadingRef: 'ffff0000' }]
  });
  assert.match(textOf(container), /Seu lance foi superado\. Próximo mínimo: R\$ 70,00/);

  renderer.setAuctionBoard({
    serverNow: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    lots: [{ ...renderer.auctionBoard.get('vaso'), status: 'closed' }]
  });
  const closedText = textOf(container);
  assert.match(closedText, /Arrematado por R\$ 65,00/);
  assert.equal(findButton(container, 'Dar lance'), undefined);
});

test('Painel mostra vencedor com link de WhatsApp e lances desconsiderados', () => {
  const { document } = createDom();
  globalThis.document = document;
  const container = document.createElement('div');
  const auction = {
    lotId: 'lot-1', itemId: 'vaso', itemName: 'Vaso Raro', status: 'closed',
    endsAt: '2026-11-10T21:00:00.000Z', scheduledEndsAt: '2026-11-10T21:00:00.000Z',
    startCents: 5000, incrementCents: 500, currentCents: 6000, bidCount: 1, personalDataPurged: false,
    winner: { bidId: 'b1', name: 'Ana Souza', whatsapp: '5551911112222', amountCents: 6000, placedAt: '2026-11-10T20:00:00.000Z' },
    bids: [
      { id: 'b2', amountCents: 90000, name: 'Perfil Falso', whatsapp: '5551933334444', status: 'void', voidReason: 'Número inexistente', voidedAt: '2026-11-10T22:00:00.000Z', placedAt: '2026-11-10T20:30:00.000Z' },
      { id: 'b1', amountCents: 6000, name: 'Ana Souza', whatsapp: '5551911112222', status: 'valid', voidReason: null, voidedAt: null, placedAt: '2026-11-10T20:00:00.000Z' }
    ]
  };
  const voided = [];
  renderAuctionCards(container, [auction], { siteName: 'Brechó Aurora', onVoid: (a, b) => voided.push(b.id) });
  const text = textOf(container);
  assert.match(text, /Vencedor/);
  assert.match(text, /Ana Souza/);
  assert.match(text, /\+55 \(51\) 91111-2222/);
  assert.match(text, /Desconsiderado: Número inexistente/);
  const link = allNodes(container).find((node) => node.tagName === 'A');
  assert.equal(link.textContent, 'Chamar no WhatsApp');
  assert.equal(link.href, buildWinnerWhatsappHref(auction, 'Brechó Aurora'));
  assert.match(decodeURIComponent(link.href), /venceu o leilão de "Vaso Raro" na vitrine Brechó Aurora/);
  const buttons = allNodes(container).filter((node) => node.tagName === 'BUTTON' && node.textContent === 'Desconsiderar');
  assert.equal(buttons.length, 1, 'só lances válidos podem ser desconsiderados');
  buttons[0].click();
  assert.deepEqual(voided, ['b1']);
});
