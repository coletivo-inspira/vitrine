import { ORDER_RELAY_MILA, isMilaRelayCode, withMilaRelayPrefix } from './mila-relay.mjs';

/**
 * Shared Storefront Renderer for Vitrine Inspira.
 * Used by both the Public Storefront (/vitrine/ & /<slug>) and the Portal Editor Live Preview (/portal/).
 * Strictly CSP-safe: zero inline scripts, zero inline styles, zero innerHTML with untrusted data, zero emojis.
 */

export function formatPriceBRL(cents) {
  if (typeof cents !== 'number' || Number.isNaN(cents) || cents < 0) {
    return 'R$ 0,00';
  }
  const whole = Math.floor(Math.round(cents) / 100);
  const dec = String(Math.round(cents) % 100).padStart(2, '0');
  return `R$ ${whole.toLocaleString('pt-BR')},${dec}`;
}

export function slugifyCategoryId(raw, fallbackIndex = 0) {
  if (typeof raw === 'string' && raw.trim()) {
    const cleaned = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    if (cleaned) return cleaned;
  }
  return `secao-${fallbackIndex + 1}`;
}

export function formatDateBR(isoDate) {
  if (typeof isoDate !== 'string' || !isoDate.trim()) return '';
  const parts = isoDate.trim().split('-');
  if (parts.length === 3 && parts[0].length === 4) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return isoDate.trim();
}

export function interpolateWhatsappTemplate(template, vars = {}) {
  const base =
    typeof template === 'string' && template.trim()
      ? template
      : 'Olá! Tenho interesse nestes itens:\n{itens}\nTotal estimado: {total}';

  let output = base
    .replaceAll('{itens}', vars.itens ?? '')
    .replaceAll('{total}', vars.total ?? '')
    .replaceAll('{data}', vars.data ?? '')
    .replaceAll('{horario}', vars.horario ?? '')
    .replaceAll('{endereco}', vars.endereco ?? '')
    .replaceAll('{nome}', vars.nome ?? '');

  if (typeof vars.observacoes === 'string' && vars.observacoes.trim()) {
    output += `\nObservações: ${vars.observacoes.trim()}`;
  }

  // Collapse excessive blank lines left by optional empty placeholders
  return output.replace(/\n{3,}/g, '\n\n').trim();
}

export class StorefrontRenderer {
  constructor(container, menu = {}, options = {}) {
    this.container = container;
    this.menu = menu || {};
    this.options = options || {};
    this.stage = 1; // 1: Escolher, 2: Dados, 3: Revisar e enviar
    this.cart = new Map(); // itemId -> quantity
    this.offers = new Map(); // itemId -> offerCents
    this.tradeProposals = new Map(); // itemId -> text
    this.itemErrors = new Map(); // itemId -> error message
    this.validationMessage = '';
    this.idPrefix = this.options.isPreview ? 'preview-sf' : 'public-sf';

    const orderFields = this.getResolvedOrderFields();
    this.customerDetails = {
      date: '',
      timeSlot: '',
      deliveryOrPickup: orderFields.deliveryOrPickup ? 'pickup' : '',
      address: '',
      customerName: '',
      notes: ''
    };
  }

  getItemPriceMode(item) {
    if (this.getCatalogType() === 'booking') return 'fixed';
    const raw = typeof item?.priceMode === 'string' ? item.priceMode.trim() : 'fixed';
    if (raw === 'offer' || raw === 'donation' || raw === 'trade') {
      return raw;
    }
    return 'fixed';
  }

  hasSelectedOffers() {
    for (const item of this.getAllActiveItems()) {
      if (this.cart.has(item.id) && this.getItemPriceMode(item) === 'offer') {
        return true;
      }
    }
    return false;
  }

  hasSelectedFixedPriceItems() {
    for (const item of this.getAllActiveItems()) {
      if (this.cart.has(item.id) && this.getItemPriceMode(item) === 'fixed') {
        return true;
      }
    }
    return false;
  }

  getCatalogType() {
    const raw = this.menu?.catalogType;
    if (raw === 'booking' || raw === 'quote' || raw === 'products') {
      return raw;
    }
    if (this.menu?.template === 'booking-v1') return 'booking';
    if (this.menu?.template === 'quote-v1') return 'quote';
    return 'products';
  }

  getResolvedComponents() {
    const catalogType = this.getCatalogType();
    const defaults =
      catalogType === 'booking'
        ? {
            name: true,
            description: true,
            photo: true,
            price: true,
            minQuantity: false,
            quantitySelector: false,
            durationMinutes: true
          }
        : catalogType === 'quote'
          ? {
              name: true,
              description: true,
              photo: true,
              price: false,
              minQuantity: false,
              quantitySelector: true,
              durationMinutes: false
            }
          : {
              name: true,
              description: true,
              photo: this.menu?.template !== 'pizzeria-v1',
              price: true,
              minQuantity: false,
              quantitySelector: true,
              durationMinutes: false
            };

    return {
      ...defaults,
      ...(this.menu?.components && typeof this.menu.components === 'object'
        ? this.menu.components
        : {}),
      name: true
    };
  }

  getResolvedOrderFields() {
    const catalogType = this.getCatalogType();
    const defaults =
      catalogType === 'booking'
        ? {
            date: true,
            timeSlots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
            deliveryOrPickup: false,
            customerName: true,
            notes: true
          }
        : catalogType === 'quote'
          ? {
              date: false,
              timeSlots: [],
              deliveryOrPickup: false,
              customerName: true,
              notes: true
            }
          : {
              date: false,
              timeSlots: [],
              deliveryOrPickup: true,
              customerName: true,
              notes: true
            };

    const raw =
      this.menu?.orderFields && typeof this.menu.orderFields === 'object'
        ? this.menu.orderFields
        : {};
    return {
      ...defaults,
      ...raw,
      timeSlots: Array.isArray(raw.timeSlots) ? raw.timeSlots : defaults.timeSlots
    };
  }

  hasAnyOrderFields() {
    const f = this.getResolvedOrderFields();
    return Boolean(
      f.customerName ||
        f.date ||
        (Array.isArray(f.timeSlots) && f.timeSlots.length > 0) ||
        f.deliveryOrPickup ||
        f.notes
    );
  }

  getNormalizedCategories() {
    const rawCategories = Array.isArray(this.menu?.categories) ? this.menu.categories : [];
    const normalized = [];

    rawCategories.forEach((cat, idx) => {
      if (!cat || typeof cat !== 'object') return;
      const rawItems = Array.isArray(cat.items) ? cat.items : [];
      const visibleItems = this.options.isPreview
        ? rawItems
        : rawItems.filter((item) => item && item.active !== false);

      if (!cat.name && visibleItems.length === 0) return;
      if (!this.options.isPreview && visibleItems.length === 0) return;

      normalized.push({
        id: cat.id ? slugifyCategoryId(String(cat.id), idx) : slugifyCategoryId(cat.name, idx),
        name: (cat.name && String(cat.name).trim()) || `Categoria ${idx + 1}`,
        items: visibleItems
      });
    });

    if (normalized.length === 0 && Array.isArray(this.menu?.items) && this.menu.items.length > 0) {
      const visibleFlat = this.options.isPreview
        ? this.menu.items
        : this.menu.items.filter((item) => item && item.active !== false);
      if (visibleFlat.length > 0) {
        normalized.push({
          id: 'vitrine',
          name: 'Vitrine',
          items: visibleFlat
        });
      }
    }

    return normalized;
  }

  getAllActiveItems() {
    const list = [];
    for (const cat of this.getNormalizedCategories()) {
      for (const item of cat.items) {
        if (item && item.active !== false) {
          list.push(item);
        }
      }
    }
    return list;
  }

  formatPrice(cents) {
    return formatPriceBRL(cents);
  }

  getCartTotal() {
    let total = 0;
    for (const item of this.getAllActiveItems()) {
      if (this.cart.has(item.id) && this.getItemPriceMode(item) === 'fixed') {
        total += (item.priceCents || 0) * this.cart.get(item.id);
      }
    }
    return total;
  }

  getCartTotalDuration() {
    let total = 0;
    for (const item of this.getAllActiveItems()) {
      if (this.cart.has(item.id)) {
        total += (item.durationMinutes || 0) * this.cart.get(item.id);
      }
    }
    return total;
  }

  getCartCount() {
    let count = 0;
    for (const qty of this.cart.values()) {
      count += qty;
    }
    return count;
  }

  setQuantity(item, delta) {
    if (!item || item.active === false) return;
    const components = this.getResolvedComponents();
    const minQty =
      components.minQuantity && Number.isInteger(item.minQuantity) && item.minQuantity > 1
        ? item.minQuantity
        : 1;
    const current = this.cart.get(item.id) || 0;

    if (current === 0 && delta > 0) {
      this.cart.set(item.id, minQty);
      if (this.options.isPublicPage && typeof globalThis.recordStorefrontEvent === 'function') {
        globalThis.recordStorefrontEvent('item_select', {
          itemId: item.id,
          count: minQty
        });
      }
    } else {
      const next = current + delta;
      if (next < minQty && delta < 0) {
        this.cart.delete(item.id);
      } else if (next <= 0) {
        this.cart.delete(item.id);
      } else {
        const clampedNext = Math.min(next, 99);
        const addedCount = clampedNext - current;
        this.cart.set(item.id, clampedNext);
        if (
          addedCount > 0 &&
          this.options.isPublicPage &&
          typeof globalThis.recordStorefrontEvent === 'function'
        ) {
          globalThis.recordStorefrontEvent('item_select', {
            itemId: item.id,
            count: addedCount
          });
        }
      }
    }

    if (typeof this.options.onUpdate === 'function') {
      this.options.onUpdate(this);
    }
    this.render();
  }

  toggleSingleSelect(item) {
    if (!item || item.active === false) return;
    if (this.cart.has(item.id)) {
      this.cart.delete(item.id);
    } else {
      const components = this.getResolvedComponents();
      const minQty =
        components.minQuantity && Number.isInteger(item.minQuantity) && item.minQuantity > 1
          ? item.minQuantity
          : 1;
      this.cart.set(item.id, minQty);
      if (this.options.isPublicPage && typeof globalThis.recordStorefrontEvent === 'function') {
        globalThis.recordStorefrontEvent('item_select', {
          itemId: item.id,
          count: minQty
        });
      }
    }
    if (typeof this.options.onUpdate === 'function') {
      this.options.onUpdate(this);
    }
    this.render();
  }

  goToStage(nextStage) {
    this.validationMessage = '';
    this.stage = nextStage;
    if (typeof this.options.onUpdate === 'function') {
      this.options.onUpdate(this);
    }
    this.render();
  }

  renderStepper(parent) {
    const nav = document.createElement('nav');
    nav.className = 'sf-stepper';
    nav.setAttribute('aria-label', 'Etapas do atendimento');

    const catalogType = this.getCatalogType();
    const step1Label =
      catalogType === 'booking'
        ? '1. Serviços'
        : catalogType === 'quote'
          ? '1. Itens'
          : '1. Vitrine';
    const steps = this.hasAnyOrderFields()
      ? [
          { num: 1, label: step1Label },
          { num: 2, label: '2. Seus dados' },
          { num: 3, label: '3. Revisar e enviar' }
        ]
      : [
          { num: 1, label: step1Label },
          { num: 3, label: '2. Revisar e enviar' }
        ];

    for (const step of steps) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = this.stage === step.num;
      const isCompleted = this.stage > step.num;
      btn.className = isActive
        ? 'sf-step-pill is-active'
        : isCompleted
          ? 'sf-step-pill is-done'
          : 'sf-step-pill';
      btn.textContent = step.label;
      btn.disabled = !isCompleted && !isActive;
      if (isActive) {
        btn.setAttribute('aria-current', 'step');
      }
      if (isCompleted) {
        btn.addEventListener('click', () => this.goToStage(step.num));
      }
      nav.appendChild(btn);
    }

    parent.appendChild(nav);
  }

  render() {
    if (!this.container) return;
    if (typeof this.container.replaceChildren === 'function') {
      this.container.replaceChildren();
    } else {
      this.container.innerHTML = '';
    }

    const wrap = document.createElement('div');
    wrap.className = 'storefront-render-wrap';

    this.renderStepper(wrap);

    if (this.stage === 1) {
      this.renderStage1(wrap);
    } else if (this.stage === 2) {
      this.renderStage2(wrap);
    } else {
      this.renderStage3(wrap);
    }

    this.container.appendChild(wrap);
  }

  renderStage1(parent) {
    const catalogType = this.getCatalogType();
    const resolvedComponents = this.getResolvedComponents();
    const normCategories = this.getNormalizedCategories();
    const messages = this.menu?.messages || {};
    const displayTitle =
      messages.heroTitle || this.menu?.businessName || this.menu?.name || 'Vitrine';
    const displayWelcome =
      messages.welcomeText ||
      this.menu?.welcomeText ||
      'Escolha os itens desejados abaixo para continuar pelo WhatsApp.';

    if (!this.options.isPublicPage) {
      const heroSec = document.createElement('section');
      heroSec.className = 'storefront-hero';

      const eyebrow = document.createElement('p');
      eyebrow.className = 'storefront-eyebrow';
      eyebrow.textContent =
        catalogType === 'booking'
          ? 'Agendamento pelo WhatsApp'
          : catalogType === 'quote'
            ? 'Orçamento pelo WhatsApp'
            : 'Atendimento direto no WhatsApp';
      heroSec.appendChild(eyebrow);

      const h1 = document.createElement('h3');
      h1.className = 'sf-preview-hero-title';
      h1.textContent = displayTitle;
      heroSec.appendChild(h1);

      const subtitle = document.createElement('p');
      subtitle.className = 'storefront-subtitle';
      subtitle.textContent = displayWelcome;
      heroSec.appendChild(subtitle);

      if (normCategories.length > 0) {
        const chipsDiv = document.createElement('nav');
        chipsDiv.className = 'category-chips';
        chipsDiv.setAttribute('aria-label', 'Categorias');

        for (const cat of normCategories) {
          const a = document.createElement('a');
          a.className = 'category-chip';
          a.href = `#${this.idPrefix}-cat-${cat.id}`;
          a.textContent = cat.name;
          chipsDiv.appendChild(a);
        }
        heroSec.appendChild(chipsDiv);
      }

      parent.appendChild(heroSec);
    }

    const catalogContainer = document.createElement('div');
    catalogContainer.className = 'storefront-catalog';

    if (normCategories.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'storefront-status';
      empty.textContent = this.options.isPreview
        ? 'Adicione categorias e itens para visualizar sua vitrine ao vivo aqui.'
        : 'Nenhum item ativo disponível neste momento.';
      catalogContainer.appendChild(empty);
      parent.appendChild(catalogContainer);
      return;
    }

    for (const cat of normCategories) {
      const catSec = document.createElement('section');
      catSec.className = 'menu-category';
      catSec.id = this.options.isPublicPage ? `cat-${cat.id}` : `${this.idPrefix}-cat-${cat.id}`;

      const catHeader = document.createElement('div');
      catHeader.className = 'menu-category-header';

      const h2 = document.createElement('h2');
      h2.className = 'menu-category-title';
      h2.textContent = cat.name;

      const countSpan = document.createElement('span');
      countSpan.className = 'menu-category-count';
      countSpan.textContent =
        cat.items.length === 1 ? '1 opção' : `${cat.items.length} opções`;

      catHeader.appendChild(h2);
      catHeader.appendChild(countSpan);
      catSec.appendChild(catHeader);

      const hasSections = cat.items.some(item => item && typeof item.section === 'string' && item.section.trim());

      if (hasSections) {
        const sectionsMap = new Map();
        const defaultSectionKey = '';
        
        for (const item of cat.items) {
          if (!item) continue;
          const secName = (typeof item.section === 'string' && item.section.trim()) || defaultSectionKey;
          if (!sectionsMap.has(secName)) {
            sectionsMap.set(secName, []);
          }
          sectionsMap.get(secName).push(item);
        }
        
        for (const [secName, secItems] of sectionsMap.entries()) {
          if (secName) {
            const secHeader = document.createElement('h3');
            secHeader.className = 'menu-section-title';
            secHeader.textContent = secName;
            catSec.appendChild(secHeader);
          }
          
          const secGrid = document.createElement('div');
          secGrid.className = 'menu-items-grid';
          
          for (const item of secItems) {
            this.renderItemCard(item, secGrid, resolvedComponents, catalogType);
          }
          
          catSec.appendChild(secGrid);
        }
      } else {
        const grid = document.createElement('div');
        grid.className = 'menu-items-grid';
        for (const item of cat.items) {
          this.renderItemCard(item, grid, resolvedComponents, catalogType);
        }
        catSec.appendChild(grid);
      }

      catalogContainer.appendChild(catSec);
    }

    parent.appendChild(catalogContainer);

    const cartCount = this.getCartCount();
    if (cartCount > 0) {
      const cartBar = document.createElement('div');
      cartBar.className = 'storefront-cart-bar';
      cartBar.setAttribute('role', 'region');
      cartBar.setAttribute('aria-label', 'Resumo da seleção');

      const info = document.createElement('div');
      info.className = 'cart-bar-info';

      const countStrong = document.createElement('strong');
      countStrong.textContent =
        catalogType === 'booking'
          ? cartCount === 1
            ? '1 serviço selecionado'
            : `${cartCount} serviços selecionados`
          : cartCount === 1
            ? '1 item selecionado'
            : `${cartCount} itens selecionados`;
      info.appendChild(countStrong);

      const cartTotal = this.getCartTotal();
      if (
        resolvedComponents.price &&
        (cartTotal > 0 || (catalogType !== 'quote' && this.hasSelectedFixedPriceItems()))
      ) {
        const totalVal = document.createElement('span');
        totalVal.className = 'cart-bar-total';
        totalVal.textContent = this.hasSelectedOffers()
          ? `${this.formatPrice(cartTotal)} (sem os lances)`
          : this.formatPrice(cartTotal);
        info.appendChild(totalVal);
      } else if (resolvedComponents.durationMinutes && this.getCartTotalDuration() > 0) {
        const durVal = document.createElement('span');
        durVal.className = 'cart-bar-total';
        durVal.textContent = `${this.getCartTotalDuration()} min`;
        info.appendChild(durVal);
      }

      const advBtn = document.createElement('button');
      advBtn.type = 'button';
      advBtn.className = 'whatsapp-order-button sf-cart-advance-btn';
      advBtn.textContent = this.hasAnyOrderFields()
        ? catalogType === 'booking'
          ? 'Escolher dia e horário'
          : 'Preencher dados'
        : 'Revisar pedido';
      advBtn.addEventListener('click', () => {
        this.goToStage(this.hasAnyOrderFields() ? 2 : 3);
      });

      cartBar.appendChild(info);
      cartBar.appendChild(advBtn);
      parent.appendChild(cartBar);
    }
  }

  submitOffer(item, rawText) {
    if (!item || item.active === false) return false;
    const digits = String(rawText ?? '').replace(/\D/g, '');
    const cents = parseInt(digits, 10) || 0;
    const minCents = Number.isInteger(item.priceCents) && item.priceCents > 0 ? item.priceCents : 0;

    if (cents <= 0) {
      this.itemErrors.set(item.id, 'Informe o valor do seu lance.');
      this.cart.delete(item.id);
      this.render();
      return false;
    }

    if (minCents > 0 && cents < minCents) {
      this.itemErrors.set(
        item.id,
        `O lance mínimo para este item é ${this.formatPrice(minCents)}.`
      );
      this.cart.delete(item.id);
      this.render();
      return false;
    }

    this.itemErrors.delete(item.id);
    this.offers.set(item.id, cents);
    this.cart.set(item.id, 1);
    if (this.options.isPublicPage && typeof globalThis.recordStorefrontEvent === 'function') {
      globalThis.recordStorefrontEvent('item_select', {
        itemId: item.id,
        count: 1
      });
    }
    if (typeof this.options.onUpdate === 'function') {
      this.options.onUpdate(this);
    }
    this.render();
    return true;
  }

  submitTrade(item, proposalText) {
    if (!item || item.active === false) return false;
    const cleaned = String(proposalText ?? '').trim();
    if (!cleaned) {
      this.itemErrors.set(item.id, 'Informe o que você oferece em troca.');
      this.cart.delete(item.id);
      this.render();
      return false;
    }
    this.itemErrors.delete(item.id);
    this.tradeProposals.set(item.id, cleaned);
    this.cart.set(item.id, 1);
    if (this.options.isPublicPage && typeof globalThis.recordStorefrontEvent === 'function') {
      globalThis.recordStorefrontEvent('item_select', {
        itemId: item.id,
        count: 1
      });
    }
    if (typeof this.options.onUpdate === 'function') {
      this.options.onUpdate(this);
    }
    this.render();
    return true;
  }

  renderItemCard(item, grid, resolvedComponents, catalogType) {
    if (!item) return;
    const isInactive = item.active === false;
    if (isInactive && !this.options.isPreview) return;

    const priceMode = this.getItemPriceMode(item);
    const qty = this.cart.get(item.id) || 0;
    const card = document.createElement('article');
    card.className = isInactive
      ? 'menu-item-card is-inactive'
      : qty > 0
        ? 'menu-item-card is-selected'
        : 'menu-item-card';
    if (item.id) {
      card.setAttribute('data-item-id', String(item.id));
    }

    const body = document.createElement('div');
    body.className = 'menu-item-body';

    if (resolvedComponents.photo && typeof item.imageUrl === 'string' && item.imageUrl.trim()) {
      const img = document.createElement('img');
      img.src = item.imageUrl.trim();
      img.alt = item.name || 'Foto do item';
      img.loading = 'lazy';
      img.className = 'menu-item-photo';
      body.appendChild(img);
    }

    if (resolvedComponents.name !== false) {
      const titleRow = document.createElement('div');
      titleRow.className = 'sf-item-title-row';

      const title = document.createElement('h3');
      title.className = 'menu-item-title';
      title.textContent = item.name || 'Item sem nome';
      titleRow.appendChild(title);

      if (priceMode !== 'fixed') {
        const modeBadge = document.createElement('span');
        modeBadge.className = `sf-mode-badge sf-mode-${priceMode}`;
        modeBadge.textContent =
          priceMode === 'offer'
            ? 'Lance'
            : priceMode === 'donation'
              ? 'Doação'
              : 'Troca';
        titleRow.appendChild(modeBadge);
      }

      if (isInactive) {
        const hiddenBadge = document.createElement('span');
        hiddenBadge.className = 'sf-hidden-badge';
        hiddenBadge.textContent = 'Oculto';
        titleRow.appendChild(hiddenBadge);
      }

      body.appendChild(titleRow);
    }

    if (resolvedComponents.description && typeof item.description === 'string' && item.description.trim()) {
      const desc = document.createElement('p');
      desc.className = 'menu-item-description';
      desc.textContent = item.description.trim();
      body.appendChild(desc);
    }

    if (priceMode === 'donation' && typeof item.conditions === 'string' && item.conditions.trim()) {
      const condP = document.createElement('p');
      condP.className = 'sf-item-condition-note';
      condP.textContent = `Condições: ${item.conditions.trim()}`;
      body.appendChild(condP);
    }

    if (priceMode === 'trade' && typeof item.tradeFor === 'string' && item.tradeFor.trim()) {
      const tradeP = document.createElement('p');
      tradeP.className = 'sf-item-condition-note';
      tradeP.textContent = `Aceito em troca: ${item.tradeFor.trim()}`;
      body.appendChild(tradeP);
    }

    const showDuration = Boolean(resolvedComponents.durationMinutes && item.durationMinutes > 0);
    const showMinQty = Boolean(
      priceMode === 'fixed' && resolvedComponents.minQuantity && item.minQuantity > 1
    );
    if (showDuration || showMinQty) {
      const metaRow = document.createElement('div');
      metaRow.className = 'sf-item-meta-row';
      if (showDuration) {
        const durPill = document.createElement('span');
        durPill.className = 'sf-meta-pill';
        durPill.textContent = `Duração: ${item.durationMinutes} min`;
        metaRow.appendChild(durPill);
      }
      if (showMinQty) {
        const minPill = document.createElement('span');
        minPill.className = 'sf-meta-pill';
        minPill.textContent = `Pedido mínimo: ${item.minQuantity} un.`;
        metaRow.appendChild(minPill);
      }
      body.appendChild(metaRow);
    }

    const footer = document.createElement('div');
    footer.className = 'menu-item-footer';

    const hasPositivePrice = Number.isInteger(item.priceCents) && item.priceCents > 0;

    if (priceMode === 'offer') {
      footer.classList.add('sf-footer-stacked');
      const offerHeader = document.createElement('div');
      offerHeader.className = 'sf-offer-header';

      const offerLabel = document.createElement('span');
      offerLabel.className = 'menu-item-price sf-offer-headline';
      offerLabel.textContent = 'Faça sua oferta';
      offerHeader.appendChild(offerLabel);

      if (hasPositivePrice) {
        const minSpan = document.createElement('span');
        minSpan.className = 'sf-offer-min';
        minSpan.textContent = `a partir de ${this.formatPrice(item.priceCents)}`;
        offerHeader.appendChild(minSpan);
      }
      footer.appendChild(offerHeader);

      const offerFormRow = document.createElement('div');
      offerFormRow.className = 'sf-inline-interaction';

      const inputId = `${this.idPrefix}-offer-${item.id}`;
      const inputLabel = document.createElement('label');
      inputLabel.className = 'sf-field-label';
      inputLabel.setAttribute('for', inputId);
      inputLabel.textContent = 'Seu lance';

      const offerInput = document.createElement('input');
      offerInput.type = 'text';
      offerInput.id = inputId;
      offerInput.inputMode = 'numeric';
      offerInput.className = 'sf-input sf-offer-input';
      offerInput.placeholder = hasPositivePrice
        ? `Ex.: ${this.formatPrice(item.priceCents)}`
        : 'Ex.: R$ 50,00';
      offerInput.disabled = isInactive;
      const savedOffer = this.offers.get(item.id);
      if (savedOffer > 0) {
        offerInput.value = this.formatPrice(savedOffer);
      }
      offerInput.addEventListener('input', () => {
        const rawDigits = offerInput.value.replace(/\D/g, '');
        if (!rawDigits) {
          offerInput.value = '';
          return;
        }
        const intPart = parseInt(rawDigits.slice(0, -2) || '0', 10).toLocaleString('pt-BR');
        const decPart = rawDigits.slice(-2).padStart(2, '0');
        offerInput.value = `R$ ${intPart},${decPart}`;
      });

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = qty > 0 ? 'whatsapp-order-button is-selected' : 'whatsapp-order-button';
      actionBtn.disabled = isInactive;
      actionBtn.textContent = qty > 0 ? 'Atualizar lance' : 'Incluir lance';
      actionBtn.addEventListener('click', () => {
        this.submitOffer(item, offerInput.value);
      });

      offerFormRow.appendChild(inputLabel);
      offerFormRow.appendChild(offerInput);
      offerFormRow.appendChild(actionBtn);

      if (qty > 0) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'sf-secondary-button sf-remove-inline-btn';
        removeBtn.textContent = 'Remover';
        removeBtn.addEventListener('click', () => {
          this.cart.delete(item.id);
          this.offers.delete(item.id);
          this.itemErrors.delete(item.id);
          this.render();
        });
        offerFormRow.appendChild(removeBtn);
      }

      footer.appendChild(offerFormRow);

      const errText = this.itemErrors.get(item.id);
      if (errText) {
        const errEl = document.createElement('p');
        errEl.className = 'sf-item-error';
        errEl.setAttribute('role', 'alert');
        errEl.textContent = errText;
        footer.appendChild(errEl);
      }
    } else if (priceMode === 'donation') {
      const donationBadge = document.createElement('span');
      donationBadge.className = 'sf-quote-tag sf-donation-tag';
      donationBadge.textContent = 'Doação';
      footer.appendChild(donationBadge);

      const donateBtn = document.createElement('button');
      donateBtn.type = 'button';
      donateBtn.className = qty > 0 ? 'whatsapp-order-button is-selected' : 'whatsapp-order-button';
      donateBtn.disabled = isInactive;
      donateBtn.setAttribute('aria-pressed', qty > 0 ? 'true' : 'false');
      donateBtn.textContent = qty > 0 ? 'Selecionado' : 'Quero receber';
      donateBtn.addEventListener('click', () => this.toggleSingleSelect(item));
      footer.appendChild(donateBtn);
    } else if (priceMode === 'trade') {
      footer.classList.add('sf-footer-stacked');
      const tradeHeader = document.createElement('div');
      tradeHeader.className = 'sf-offer-header';

      const tradeBadge = document.createElement('span');
      tradeBadge.className = 'sf-quote-tag sf-trade-tag';
      tradeBadge.textContent = 'Troca';
      tradeHeader.appendChild(tradeBadge);
      footer.appendChild(tradeHeader);

      const tradeFormRow = document.createElement('div');
      tradeFormRow.className = 'sf-inline-interaction';

      const inputId = `${this.idPrefix}-trade-${item.id}`;
      const inputLabel = document.createElement('label');
      inputLabel.className = 'sf-field-label';
      inputLabel.setAttribute('for', inputId);
      inputLabel.textContent = 'O que você oferece?';

      const tradeInput = document.createElement('input');
      tradeInput.type = 'text';
      tradeInput.id = inputId;
      tradeInput.maxLength = 160;
      tradeInput.className = 'sf-input sf-trade-input';
      tradeInput.placeholder = 'Ex.: Livros ou mudas de plantas';
      tradeInput.disabled = isInactive;
      tradeInput.value = this.tradeProposals.get(item.id) || '';
      tradeInput.addEventListener('input', () => {
        this.tradeProposals.set(item.id, tradeInput.value);
      });

      const actionBtn = document.createElement('button');
      actionBtn.type = 'button';
      actionBtn.className = qty > 0 ? 'whatsapp-order-button is-selected' : 'whatsapp-order-button';
      actionBtn.disabled = isInactive;
      actionBtn.textContent = qty > 0 ? 'Atualizar proposta' : 'Propor troca';
      actionBtn.addEventListener('click', () => {
        this.submitTrade(item, tradeInput.value);
      });

      tradeFormRow.appendChild(inputLabel);
      tradeFormRow.appendChild(tradeInput);
      tradeFormRow.appendChild(actionBtn);

      if (qty > 0) {
        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'sf-secondary-button sf-remove-inline-btn';
        removeBtn.textContent = 'Remover';
        removeBtn.addEventListener('click', () => {
          this.cart.delete(item.id);
          this.tradeProposals.delete(item.id);
          this.itemErrors.delete(item.id);
          this.render();
        });
        tradeFormRow.appendChild(removeBtn);
      }

      footer.appendChild(tradeFormRow);

      const errText = this.itemErrors.get(item.id);
      if (errText) {
        const errEl = document.createElement('p');
        errEl.className = 'sf-item-error';
        errEl.setAttribute('role', 'alert');
        errEl.textContent = errText;
        footer.appendChild(errEl);
      }
    } else {
      if (resolvedComponents.price && (catalogType !== 'quote' || hasPositivePrice)) {
        const price = document.createElement('span');
        price.className = 'menu-item-price';
        price.textContent = this.formatPrice(item.priceCents || 0);
        footer.appendChild(price);
      } else if (catalogType === 'quote') {
        const quoteLabel = document.createElement('span');
        quoteLabel.className = 'sf-quote-tag';
        quoteLabel.textContent = 'Sob consulta';
        footer.appendChild(quoteLabel);
      }

      const useStepper = Boolean(
        resolvedComponents.quantitySelector ||
          (resolvedComponents.minQuantity && item.minQuantity > 1)
      );

      if (useStepper) {
        const qtyDiv = document.createElement('div');
        qtyDiv.className = 'qty-selector';
        qtyDiv.setAttribute('role', 'group');
        qtyDiv.setAttribute('aria-label', `Quantidade de ${item.name || 'item'}`);

        const decBtn = document.createElement('button');
        decBtn.type = 'button';
        decBtn.className = 'btn-qty';
        decBtn.textContent = '−';
        decBtn.disabled = qty === 0 || isInactive;
        decBtn.setAttribute('aria-label', `Diminuir quantidade de ${item.name || 'item'}`);
        decBtn.addEventListener('click', () => this.setQuantity(item, -1));

        const qtyVal = document.createElement('span');
        qtyVal.className = 'qty-val';
        qtyVal.textContent = String(qty);

        const incBtn = document.createElement('button');
        incBtn.type = 'button';
        incBtn.className = 'btn-qty';
        incBtn.textContent = '+';
        incBtn.disabled = isInactive;
        incBtn.setAttribute('aria-label', `Adicionar ${item.name || 'item'}`);
        incBtn.addEventListener('click', () => this.setQuantity(item, 1));

        qtyDiv.appendChild(decBtn);
        qtyDiv.appendChild(qtyVal);
        qtyDiv.appendChild(incBtn);
        footer.appendChild(qtyDiv);
      } else {
        const selectBtn = document.createElement('button');
        selectBtn.type = 'button';
        selectBtn.className = qty > 0 ? 'whatsapp-order-button is-selected' : 'whatsapp-order-button';
        selectBtn.disabled = isInactive;
        selectBtn.setAttribute('aria-pressed', qty > 0 ? 'true' : 'false');
        selectBtn.textContent =
          qty > 0
            ? 'Selecionado'
            : catalogType === 'booking'
              ? 'Escolher serviço'
              : 'Selecionar';
        selectBtn.addEventListener('click', () => this.toggleSingleSelect(item));
        footer.appendChild(selectBtn);
      }
    }

    card.appendChild(body);
    card.appendChild(footer);
    grid.appendChild(card);
  }

  renderStage2(parent) {
    const catalogType = this.getCatalogType();
    const resolvedFields = this.getResolvedOrderFields();

    const card = document.createElement('section');
    card.className = 'sf-stage-card';

    const h2 = document.createElement('h2');
    h2.className = 'sf-stage-title';
    h2.textContent =
      catalogType === 'booking'
        ? 'Dia, horário e identificação'
        : catalogType === 'quote'
          ? 'Dados para o orçamento'
          : 'Dados do seu pedido';
    card.appendChild(h2);

    const helper = document.createElement('p');
    helper.className = 'sf-stage-subtitle';
    helper.textContent =
      catalogType === 'booking'
        ? 'Informe sua preferência de data e horário. A confirmação final é combinada direto no WhatsApp.'
        : 'Preencha as informações abaixo para montarmos sua mensagem pronta no WhatsApp.';
    card.appendChild(helper);

    if (this.validationMessage) {
      const alertBox = document.createElement('p');
      alertBox.className = 'sf-validation-msg';
      alertBox.setAttribute('role', 'alert');
      alertBox.textContent = this.validationMessage;
      card.appendChild(alertBox);
    }

    const form = document.createElement('form');
    form.className = 'sf-order-form';
    form.noValidate = true;

    if (resolvedFields.customerName) {
      const group = document.createElement('div');
      group.className = 'sf-field-group';

      const nameId = `${this.idPrefix}-cust-name`;
      const label = document.createElement('label');
      label.className = 'sf-field-label';
      label.setAttribute('for', nameId);
      label.textContent = 'Seu nome';

      const input = document.createElement('input');
      input.type = 'text';
      input.id = nameId;
      input.required = true;
      input.maxLength = 120;
      input.placeholder = 'Ex.: Mariana Costa';
      input.className = 'sf-input';
      input.value = this.customerDetails.customerName;
      input.addEventListener('input', () => {
        this.customerDetails.customerName = input.value;
      });

      group.appendChild(label);
      group.appendChild(input);
      form.appendChild(group);
    }

    if (resolvedFields.date) {
      const group = document.createElement('div');
      group.className = 'sf-field-group';

      const dateId = `${this.idPrefix}-cust-date`;
      const label = document.createElement('label');
      label.className = 'sf-field-label';
      label.setAttribute('for', dateId);
      label.textContent = 'Data de preferência';

      const input = document.createElement('input');
      input.type = 'date';
      input.id = dateId;
      input.required = true;
      input.className = 'sf-input';
      input.value = this.customerDetails.date;
      input.addEventListener('input', () => {
        this.customerDetails.date = input.value;
      });

      group.appendChild(label);
      group.appendChild(input);
      form.appendChild(group);
    }

    if (Array.isArray(resolvedFields.timeSlots) && resolvedFields.timeSlots.length > 0) {
      const group = document.createElement('div');
      group.className = 'sf-field-group';

      const label = document.createElement('span');
      label.className = 'sf-field-label';
      label.textContent = 'Horário de preferência';
      group.appendChild(label);

      const slotsGrid = document.createElement('div');
      slotsGrid.className = 'sf-timeslots-grid';
      slotsGrid.setAttribute('role', 'group');
      slotsGrid.setAttribute('aria-label', 'Horários disponíveis para preferência');

      for (const slot of resolvedFields.timeSlots) {
        const slotBtn = document.createElement('button');
        slotBtn.type = 'button';
        const isChosen = this.customerDetails.timeSlot === slot;
        slotBtn.className = isChosen ? 'sf-slot-pill is-selected' : 'sf-slot-pill';
        slotBtn.textContent = slot;
        slotBtn.setAttribute('aria-pressed', isChosen ? 'true' : 'false');
        slotBtn.addEventListener('click', () => {
          this.customerDetails.timeSlot = slot;
          this.render();
        });
        slotsGrid.appendChild(slotBtn);
      }

      group.appendChild(slotsGrid);
      form.appendChild(group);
    }

    if (resolvedFields.deliveryOrPickup) {
      if (!this.customerDetails.deliveryOrPickup) {
        this.customerDetails.deliveryOrPickup = 'pickup';
      }
      const group = document.createElement('div');
      group.className = 'sf-field-group';

      const label = document.createElement('span');
      label.className = 'sf-field-label';
      label.textContent = 'Forma de recebimento';
      group.appendChild(label);

      const modeRow = document.createElement('div');
      modeRow.className = 'sf-delivery-toggle';

      const pickupBtn = document.createElement('button');
      pickupBtn.type = 'button';
      pickupBtn.className =
        this.customerDetails.deliveryOrPickup === 'pickup'
          ? 'sf-slot-pill is-selected'
          : 'sf-slot-pill';
      pickupBtn.textContent = 'Retirada no local';
      pickupBtn.setAttribute(
        'aria-pressed',
        this.customerDetails.deliveryOrPickup === 'pickup' ? 'true' : 'false'
      );

      const deliveryBtn = document.createElement('button');
      deliveryBtn.type = 'button';
      deliveryBtn.className =
        this.customerDetails.deliveryOrPickup === 'delivery'
          ? 'sf-slot-pill is-selected'
          : 'sf-slot-pill';
      deliveryBtn.textContent = 'Entrega no endereço';
      deliveryBtn.setAttribute(
        'aria-pressed',
        this.customerDetails.deliveryOrPickup === 'delivery' ? 'true' : 'false'
      );

      const addrGroup = document.createElement('div');
      addrGroup.className = 'sf-field-group sf-address-group';
      addrGroup.hidden = this.customerDetails.deliveryOrPickup !== 'delivery';

      const addrId = `${this.idPrefix}-cust-address`;
      const addrLabel = document.createElement('label');
      addrLabel.className = 'sf-field-label';
      addrLabel.setAttribute('for', addrId);
      addrLabel.textContent = 'Endereço completo para entrega';

      const addrInput = document.createElement('input');
      addrInput.type = 'text';
      addrInput.id = addrId;
      addrInput.maxLength = 240;
      addrInput.className = 'sf-input';
      addrInput.placeholder = 'Rua, número, complemento e bairro';
      addrInput.value = this.customerDetails.address;
      addrInput.addEventListener('input', () => {
        this.customerDetails.address = addrInput.value;
      });

      pickupBtn.addEventListener('click', () => {
        this.customerDetails.deliveryOrPickup = 'pickup';
        this.render();
      });

      deliveryBtn.addEventListener('click', () => {
        this.customerDetails.deliveryOrPickup = 'delivery';
        this.render();
      });

      modeRow.appendChild(pickupBtn);
      modeRow.appendChild(deliveryBtn);
      group.appendChild(modeRow);

      addrGroup.appendChild(addrLabel);
      addrGroup.appendChild(addrInput);
      group.appendChild(addrGroup);
      form.appendChild(group);
    }

    if (resolvedFields.notes) {
      const group = document.createElement('div');
      group.className = 'sf-field-group';

      const notesId = `${this.idPrefix}-cust-notes`;
      const label = document.createElement('label');
      label.className = 'sf-field-label';
      label.setAttribute('for', notesId);
      label.textContent = 'Observações (opcional)';

      const textarea = document.createElement('textarea');
      textarea.id = notesId;
      textarea.rows = 3;
      textarea.maxLength = 400;
      textarea.className = 'sf-textarea';
      textarea.placeholder = 'Ex.: Sem cebola, ponto da carne, referência de entrega...';
      textarea.value = this.customerDetails.notes;
      textarea.addEventListener('input', () => {
        this.customerDetails.notes = textarea.value;
      });

      group.appendChild(label);
      group.appendChild(textarea);
      form.appendChild(group);
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (resolvedFields.customerName && !this.customerDetails.customerName.trim()) {
        this.validationMessage = 'Por favor, informe seu nome para continuar.';
        this.render();
        return;
      }
      if (resolvedFields.date && !this.customerDetails.date.trim()) {
        this.validationMessage = 'Por favor, escolha a data de preferência.';
        this.render();
        return;
      }
      if (
        Array.isArray(resolvedFields.timeSlots) &&
        resolvedFields.timeSlots.length > 0 &&
        !this.customerDetails.timeSlot
      ) {
        this.validationMessage = 'Por favor, selecione um horário de preferência.';
        this.render();
        return;
      }
      if (
        resolvedFields.deliveryOrPickup &&
        this.customerDetails.deliveryOrPickup === 'delivery' &&
        !this.customerDetails.address.trim()
      ) {
        this.validationMessage = 'Por favor, informe o endereço para entrega.';
        this.render();
        return;
      }
      this.goToStage(3);
    });

    const actions = document.createElement('div');
    actions.className = 'sf-stage-actions';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sf-secondary-button';
    backBtn.textContent = 'Voltar aos itens';
    backBtn.addEventListener('click', () => this.goToStage(1));

    const nextBtn = document.createElement('button');
    nextBtn.type = 'submit';
    nextBtn.className = 'whatsapp-order-button';
    nextBtn.textContent = 'Revisar resumo';

    actions.appendChild(backBtn);
    actions.appendChild(nextBtn);
    form.appendChild(actions);

    card.appendChild(form);
    parent.appendChild(card);
  }

  getOrderRelay() {
    const relay = this.menu?.orderRelay;
    return relay?.via === ORDER_RELAY_MILA && isMilaRelayCode(relay.code) ? relay : null;
  }

  buildOrderMessage() {
    return withMilaRelayPrefix(
      this.buildOrderBody(),
      this.getOrderRelay(),
      this.menu?.name || this.menu?.businessName || ''
    );
  }

  buildOrderBody() {
    const catalogType = this.getCatalogType();
    const resolvedComponents = this.getResolvedComponents();
    const resolvedFields = this.getResolvedOrderFields();
    const messages = this.menu?.messages || {};

    const itemLines = [];
    for (const item of this.getAllActiveItems()) {
      if (!this.cart.has(item.id)) continue;
      const qty = this.cart.get(item.id);
      const priceMode = this.getItemPriceMode(item);

      if (priceMode === 'offer') {
        const offerCents = this.offers.get(item.id) || item.priceCents || 0;
        itemLines.push(`- ${item.name || 'Item'} — Lance: ${this.formatPrice(offerCents)}`);
      } else if (priceMode === 'donation') {
        itemLines.push(`- Doação: ${item.name || 'Item'}`);
      } else if (priceMode === 'trade') {
        const proposal = (this.tradeProposals.get(item.id) || '').trim();
        itemLines.push(
          proposal
            ? `- Troca: ${item.name || 'Item'}, ofereço: ${proposal}`
            : `- Troca: ${item.name || 'Item'}`
        );
      } else {
        const parts = [`- ${qty}x ${item.name || 'Item'}`];
        if (resolvedComponents.durationMinutes && item.durationMinutes > 0) {
          parts.push(`(${item.durationMinutes} min)`);
        }
        const hasPrice = Number.isInteger(item.priceCents) && item.priceCents > 0;
        if (resolvedComponents.price && (catalogType !== 'quote' || hasPrice)) {
          parts.push(`— ${this.formatPrice((item.priceCents || 0) * qty)}`);
        }
        itemLines.push(parts.join(' '));
      }
    }

    const cartTotal = this.getCartTotal();
    const hasOffers = this.hasSelectedOffers();
    const totalStr =
      resolvedComponents.price && (catalogType !== 'quote' || cartTotal > 0 || hasOffers)
        ? hasOffers
          ? `${this.formatPrice(cartTotal)} (sem os lances)`
          : this.formatPrice(cartTotal)
        : resolvedComponents.durationMinutes && this.getCartTotalDuration() > 0
          ? `${this.getCartTotalDuration()} min`
          : 'Sob orçamento';

    const enderecoStr = resolvedFields.deliveryOrPickup
      ? this.customerDetails.deliveryOrPickup === 'delivery'
        ? `Entrega: ${this.customerDetails.address.trim()}`
        : 'Retirada no local'
      : '';

    let rawTemplate =
      typeof messages.whatsappTemplate === 'string' && messages.whatsappTemplate.trim()
        ? messages.whatsappTemplate
        : 'Olá! Tenho interesse nestes itens:\n{itens}\nTotal estimado: {total}';

    if (hasOffers) {
      rawTemplate = rawTemplate
        .replace(/Total estimado:/gi, 'Total (sem os lances):')
        .replace(/Total:/gi, 'Total (sem os lances):');
      const totalForOfferTemplate = this.formatPrice(cartTotal);
      return interpolateWhatsappTemplate(rawTemplate, {
        itens: itemLines.join('\n'),
        total: rawTemplate.includes('Total (sem os lances):')
          ? totalForOfferTemplate
          : `${totalForOfferTemplate} (sem os lances)`,
        data: resolvedFields.date ? formatDateBR(this.customerDetails.date) : '',
        horario:
          Array.isArray(resolvedFields.timeSlots) && resolvedFields.timeSlots.length > 0
            ? this.customerDetails.timeSlot
            : '',
        endereco: enderecoStr,
        nome: resolvedFields.customerName ? this.customerDetails.customerName.trim() : '',
        observacoes: resolvedFields.notes ? this.customerDetails.notes.trim() : ''
      });
    }

    return interpolateWhatsappTemplate(rawTemplate, {
      itens: itemLines.join('\n'),
      total: totalStr,
      data: resolvedFields.date ? formatDateBR(this.customerDetails.date) : '',
      horario:
        Array.isArray(resolvedFields.timeSlots) && resolvedFields.timeSlots.length > 0
          ? this.customerDetails.timeSlot
          : '',
      endereco: enderecoStr,
      nome: resolvedFields.customerName ? this.customerDetails.customerName.trim() : '',
      observacoes: resolvedFields.notes ? this.customerDetails.notes.trim() : ''
    });
  }

  renderStage3(parent) {
    const catalogType = this.getCatalogType();
    const resolvedComponents = this.getResolvedComponents();
    const resolvedFields = this.getResolvedOrderFields();
    const messages = this.menu?.messages || {};

    const card = document.createElement('section');
    card.className = 'sf-stage-card';

    const h2 = document.createElement('h2');
    h2.className = 'sf-stage-title';
    h2.textContent = 'Revise antes de enviar no WhatsApp';
    card.appendChild(h2);

    const summaryList = document.createElement('div');
    summaryList.className = 'review-items-container';

    for (const item of this.getAllActiveItems()) {
      if (!this.cart.has(item.id)) continue;
      const qty = this.cart.get(item.id);
      const priceMode = this.getItemPriceMode(item);

      const itemRow = document.createElement('div');
      itemRow.className = 'review-item-row';

      const titleSpan = document.createElement('span');
      titleSpan.className = 'review-item-title-qty';

      if (priceMode === 'offer') {
        titleSpan.textContent = item.name || 'Item';
        itemRow.appendChild(titleSpan);
        const priceSpan = document.createElement('span');
        priceSpan.className = 'review-item-price';
        priceSpan.textContent = `Lance: ${this.formatPrice(this.offers.get(item.id) || item.priceCents || 0)}`;
        itemRow.appendChild(priceSpan);
      } else if (priceMode === 'donation') {
        titleSpan.textContent = `Doação: ${item.name || 'Item'}`;
        itemRow.appendChild(titleSpan);
      } else if (priceMode === 'trade') {
        const proposal = (this.tradeProposals.get(item.id) || '').trim();
        titleSpan.textContent = proposal
          ? `Troca: ${item.name || 'Item'} (ofereço: ${proposal})`
          : `Troca: ${item.name || 'Item'}`;
        itemRow.appendChild(titleSpan);
      } else {
        let labelText = `${qty}x ${item.name || 'Item'}`;
        if (resolvedComponents.durationMinutes && item.durationMinutes > 0) {
          labelText += ` (${item.durationMinutes} min)`;
        }
        titleSpan.textContent = labelText;
        itemRow.appendChild(titleSpan);

        const hasPrice = Number.isInteger(item.priceCents) && item.priceCents > 0;
        if (resolvedComponents.price && (catalogType !== 'quote' || hasPrice)) {
          const priceSpan = document.createElement('span');
          priceSpan.className = 'review-item-price';
          priceSpan.textContent = this.formatPrice((item.priceCents || 0) * qty);
          itemRow.appendChild(priceSpan);
        }
      }

      summaryList.appendChild(itemRow);
    }
    card.appendChild(summaryList);

    const cartTotal = this.getCartTotal();
    const hasOffers = this.hasSelectedOffers();
    if (
      (resolvedComponents.price && (catalogType !== 'quote' || cartTotal > 0 || hasOffers)) ||
      (resolvedComponents.durationMinutes && this.getCartTotalDuration() > 0)
    ) {
      const totalDiv = document.createElement('div');
      totalDiv.className = 'review-total-divider';

      const totalLabel = document.createElement('strong');
      totalLabel.textContent =
        resolvedComponents.price && (catalogType !== 'quote' || cartTotal > 0 || hasOffers)
          ? hasOffers
            ? 'Total (sem os lances)'
            : 'Total estimado'
          : 'Duração estimada';
      totalDiv.appendChild(totalLabel);

      const totalVal = document.createElement('span');
      totalVal.className = 'review-total-val';
      totalVal.textContent =
        resolvedComponents.price && (catalogType !== 'quote' || cartTotal > 0 || hasOffers)
          ? this.formatPrice(cartTotal)
          : `${this.getCartTotalDuration()} min`;
      totalDiv.appendChild(totalVal);
      card.appendChild(totalDiv);
    }

    const detailPairs = [];
    if (resolvedFields.customerName && this.customerDetails.customerName.trim()) {
      detailPairs.push(['Nome', this.customerDetails.customerName.trim()]);
    }
    if (resolvedFields.date && this.customerDetails.date.trim()) {
      detailPairs.push(['Data', formatDateBR(this.customerDetails.date)]);
    }
    if (
      Array.isArray(resolvedFields.timeSlots) &&
      resolvedFields.timeSlots.length > 0 &&
      this.customerDetails.timeSlot
    ) {
      detailPairs.push(['Horário', this.customerDetails.timeSlot]);
    }
    if (resolvedFields.deliveryOrPickup) {
      detailPairs.push([
        'Recebimento',
        this.customerDetails.deliveryOrPickup === 'delivery'
          ? `Entrega em ${this.customerDetails.address.trim()}`
          : 'Retirada no local'
      ]);
    }
    if (resolvedFields.notes && this.customerDetails.notes.trim()) {
      detailPairs.push(['Observações', this.customerDetails.notes.trim()]);
    }

    if (detailPairs.length > 0) {
      const detailsSec = document.createElement('div');
      detailsSec.className = 'review-details-section';

      const detailsTitle = document.createElement('h3');
      detailsTitle.textContent = 'Seus dados';
      detailsSec.appendChild(detailsTitle);

      const detailsList = document.createElement('ul');
      detailsList.className = 'review-details-list';

      for (const [label, value] of detailPairs) {
        const li = document.createElement('li');
        const strong = document.createElement('strong');
        strong.textContent = `${label}: `;
        li.appendChild(strong);
        li.appendChild(document.createTextNode(value));
        detailsList.appendChild(li);
      }

      detailsSec.appendChild(detailsList);
      card.appendChild(detailsSec);
    }

    const compiledMessage = this.buildOrderMessage();
    const previewMsgBox = document.createElement('div');
    previewMsgBox.className = 'sf-wa-message-preview';

    const previewMsgLabel = document.createElement('span');
    previewMsgLabel.className = 'sf-wa-message-label';
    previewMsgLabel.textContent = 'Mensagem que será aberta no WhatsApp';
    previewMsgBox.appendChild(previewMsgLabel);

    const previewMsgPre = document.createElement('pre');
    previewMsgPre.className = 'sf-wa-message-body';
    previewMsgPre.textContent = compiledMessage;
    previewMsgBox.appendChild(previewMsgPre);
    card.appendChild(previewMsgBox);

    if (this.getOrderRelay()) {
      const relayNote = document.createElement('p');
      relayNote.className = 'sf-relay-note';
      relayNote.textContent =
        'Seu pedido vai para a Mila, da equipe Vitrine Inspira, que repassa ao negócio pelo WhatsApp. Mantenha o código no começo da mensagem.';
      card.appendChild(relayNote);
    }

    const rawPhone = String(
      this.options.targetWhatsapp || this.menu?.whatsapp || '5511999999999'
    ).replace(/\D/g, '');
    const waHref = `https://wa.me/${rawPhone}?text=${encodeURIComponent(compiledMessage)}`;

    const actions = document.createElement('div');
    actions.className = 'sf-stage-actions';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sf-secondary-button';
    backBtn.textContent = this.hasAnyOrderFields() ? 'Editar dados' : 'Voltar aos itens';
    backBtn.addEventListener('click', () => {
      this.goToStage(this.hasAnyOrderFields() ? 2 : 1);
    });

    const sendBtn = document.createElement('a');
    sendBtn.className = 'whatsapp-order-button';
    sendBtn.textContent =
      (typeof messages.ctaLabel === 'string' && messages.ctaLabel.trim()) ||
      (catalogType === 'booking'
        ? 'Confirmar agendamento no WhatsApp'
        : catalogType === 'quote'
          ? 'Solicitar orçamento no WhatsApp'
          : 'Enviar pedido no WhatsApp');
    sendBtn.href = waHref;
    sendBtn.target = '_blank';
    sendBtn.rel = 'noopener noreferrer';

    sendBtn.addEventListener('click', () => {
      if (typeof globalThis.recordStorefrontEvent === 'function') {
        globalThis.recordStorefrontEvent('whatsapp_order', {
          estimatedCents: this.getCartTotal()
        });
      }
    });

    actions.appendChild(backBtn);
    actions.appendChild(sendBtn);
    card.appendChild(actions);

    parent.appendChild(card);
  }
}
