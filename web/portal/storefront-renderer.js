/**
 * Shared Storefront Renderer for Vitrine Inspira.
 * Shared between the Editor Live Preview and the Public Storefront page.
 */

export class StorefrontRenderer {
  constructor(container, menu, options = {}) {
    this.container = container;
    this.menu = menu; // Draft content or public menu structure
    this.options = options; // { isPreview: false, onUpdate: () => {}, targetWhatsapp: '' }
    
    this.stage = 1; // 1: Select Items, 2: Customer Details, 3: Review & Send
    this.cart = new Map(); // itemId -> quantity
    
    // Customer details
    this.customerDetails = {
      date: '',
      timeSlot: '',
      deliveryOrPickup: 'pickup', // 'delivery' | 'pickup'
      address: '',
      customerName: '',
      notes: ''
    };

    this.initCartDefaults();
  }

  initCartDefaults() {
    // If items have minimum quantity enabled, pre-fill them when selected
    const categories = this.menu.categories || [];
    categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        if (item.active !== false && item.minQuantity > 1) {
          // Do not add to cart by default, but if user clicks "+", it starts at minQuantity
        }
      });
    });
  }

  // Format price helper
  formatPrice(cents) {
    if (typeof cents !== 'number' || isNaN(cents) || cents < 0) {
      return 'R$ 0,00';
    }
    const reais = cents / 100;
    return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  // Get total price
  getCartTotal() {
    let total = 0;
    const categories = this.menu.categories || [];
    categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        if (this.cart.has(item.id)) {
          const qty = this.cart.get(item.id);
          total += (item.priceCents || 0) * qty;
        }
      });
    });
    return total;
  }

  // Get total duration (for booking)
  getCartTotalDuration() {
    let total = 0;
    const categories = this.menu.categories || [];
    categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        if (this.cart.has(item.id)) {
          const qty = this.cart.get(item.id);
          total += (item.durationMinutes || 0) * qty;
        }
      });
    });
    return total;
  }

  // Get total quantity of items in cart
  getCartCount() {
    let count = 0;
    this.cart.forEach(qty => {
      count += qty;
    });
    return count;
  }

  // Set quantity of an item
  setQuantity(item, change) {
    const minQty = item.minQuantity || 1;
    const current = this.cart.get(item.id) || 0;
    
    if (current === 0 && change > 0) {
      // First select: starts at minimum quantity
      this.cart.set(item.id, minQty);
    } else {
      const next = current + change;
      if (next < minQty && change < 0) {
        // Remove item from cart if it goes below minimum quantity when decrementing
        this.cart.delete(item.id);
      } else if (next <= 0) {
        this.cart.delete(item.id);
      } else {
        this.cart.set(item.id, next);
      }
    }
    
    if (this.options.onUpdate) this.options.onUpdate(this);
    this.render();
  }

  // Main render entrypoint
  render() {
    if (!this.container) return;
    this.container.innerHTML = '';

    // Create main wrapper
    const wrap = document.createElement('div');
    wrap.className = 'storefront-render-wrap';

    // Render corresponding stage
    if (this.stage === 1) {
      this.renderStage1(wrap);
    } else if (this.stage === 2) {
      this.renderStage2(wrap);
    } else if (this.stage === 3) {
      this.renderStage3(wrap);
    }

    this.container.appendChild(wrap);
  }

  // STAGE 1: Item Selection
  renderStage1(parent) {
    const { businessName, welcomeText, categories, components, messages } = this.menu;
    const resolvedComponents = components || {
      name: true,
      description: true,
      photo: true,
      price: true,
      minQuantity: false,
      quantitySelector: true,
      durationMinutes: false
    };

    // Hero / Header Section
    if (!this.options.isPublicPage) {
      const heroSec = document.createElement('section');
      heroSec.className = 'storefront-hero';
      
      const h1 = document.createElement('h1');
      h1.id = 'storefront-name';
      h1.textContent = messages?.heroTitle || businessName || 'Vitrine';
      heroSec.appendChild(h1);

      const subtitle = document.createElement('p');
      subtitle.className = 'storefront-subtitle';
      subtitle.textContent = messages?.welcomeText || welcomeText || 'Selecione seus itens abaixo:';
      heroSec.appendChild(subtitle);

      // Category chips
      const chipsDiv = document.createElement('nav');
      chipsDiv.className = 'category-chips';
      chipsDiv.setAttribute('aria-label', 'Categorias');

      const normCategories = (categories || []).filter(c => c && c.name && c.items && c.items.length > 0);
      normCategories.forEach(cat => {
        const a = document.createElement('a');
        a.className = 'category-chip';
        a.href = `#cat-${cat.id}`;
        a.textContent = cat.name;
        chipsDiv.appendChild(a);
      });
      heroSec.appendChild(chipsDiv);
      parent.appendChild(heroSec);
    }

    // Catalog Area
    const catalogContainer = document.createElement('div');
    catalogContainer.className = 'storefront-catalog';

    if (normCategories.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'storefront-status';
      empty.textContent = 'Nenhum item ativo disponível neste momento.';
      catalogContainer.appendChild(empty);
    } else {
      normCategories.forEach(cat => {
        const catSec = document.createElement('section');
        catSec.className = 'menu-category';
        catSec.id = `cat-${cat.id}`;

        const catHeader = document.createElement('div');
        catHeader.className = 'menu-category-header';

        const h2 = document.createElement('h2');
        h2.className = 'menu-category-title';
        h2.textContent = cat.name;

        const countSpan = document.createElement('span');
        countSpan.className = 'menu-category-count';
        countSpan.textContent = `${cat.items.length} ${cat.items.length === 1 ? 'opção' : 'opções'}`;

        catHeader.appendChild(h2);
        catHeader.appendChild(countSpan);
        catSec.appendChild(catHeader);

        const grid = document.createElement('div');
        grid.className = 'menu-items-grid';

        cat.items.forEach(item => {
          // If in public storefront, skip inactive items. In editor preview, show them styled as inactive
          if (item.active === false && !this.options.isPreview) return;

          const card = document.createElement('article');
          card.className = item.active === false ? 'menu-item-card is-inactive' : 'menu-item-card';

          const body = document.createElement('div');
          body.className = 'menu-item-body';

          // Photo component
          if (resolvedComponents.photo && item.imageUrl) {
            const img = document.createElement('img');
            img.src = item.imageUrl;
            img.alt = item.name || 'Foto do item';
            img.className = 'menu-item-photo';
            body.appendChild(img);
          }

          // Name component
          if (resolvedComponents.name) {
            const title = document.createElement('h3');
            title.className = 'menu-item-title';
            title.textContent = item.name || 'Item sem nome';
            if (item.active === false) {
              title.textContent += ' (Oculto)';
            }
            body.appendChild(title);
          }

          // Description component
          if (resolvedComponents.description && item.description) {
            const desc = document.createElement('p');
            desc.className = 'menu-item-description';
            desc.textContent = item.description;
            body.appendChild(desc);
          }

          // Duration component
          if (resolvedComponents.durationMinutes && item.durationMinutes) {
            const durSpan = document.createElement('span');
            durSpan.className = 'menu-item-duration';
            durSpan.textContent = `⏱️ ${item.durationMinutes} min`;
            body.appendChild(durSpan);
          }

          const footer = document.createElement('div');
          footer.className = 'menu-item-footer';

          // Price component
          if (resolvedComponents.price) {
            const price = document.createElement('span');
            price.className = 'menu-item-price';
            price.textContent = this.formatPrice(item.priceCents);
            footer.appendChild(price);
          }

          // Quantity selector component (if enabled or if minimum quantity exists)
          if (resolvedComponents.quantitySelector || item.minQuantity > 1) {
            const qtyDiv = document.createElement('div');
            qtyDiv.className = 'qty-selector';

            const qty = this.cart.get(item.id) || 0;

            const decBtn = document.createElement('button');
            decBtn.type = 'button';
            decBtn.className = 'btn-qty';
            decBtn.textContent = '-';
            decBtn.disabled = qty === 0;
            decBtn.setAttribute('aria-label', 'Remover 1 item');
            decBtn.addEventListener('click', () => {
              this.setQuantity(item, -1);
            });

            const qtyVal = document.createElement('span');
            qtyVal.className = 'qty-val';
            qtyVal.textContent = qty;

            const incBtn = document.createElement('button');
            incBtn.type = 'button';
            incBtn.className = 'btn-qty';
            incBtn.textContent = '+';
            incBtn.setAttribute('aria-label', 'Adicionar 1 item');
            incBtn.addEventListener('click', () => {
              this.setQuantity(item, 1);
            });

            qtyDiv.appendChild(decBtn);
            qtyDiv.appendChild(qtyVal);
            qtyDiv.appendChild(incBtn);
            footer.appendChild(qtyDiv);
          } else {
            // Simple select/add button
            const selectBtn = document.createElement('button');
            selectBtn.type = 'button';
            selectBtn.className = 'whatsapp-order-button';
            const qty = this.cart.get(item.id) || 0;
            selectBtn.textContent = qty > 0 ? 'Selecionado ✓' : 'Selecionar';
            selectBtn.addEventListener('click', () => {
              if (qty > 0) {
                this.cart.delete(item.id);
              } else {
                this.cart.set(item.id, 1);
              }
              if (this.options.onUpdate) this.options.onUpdate(this);
              this.render();
            });
            footer.appendChild(selectBtn);
          }

          card.appendChild(body);
          card.appendChild(footer);
          grid.appendChild(card);
        });

        catSec.appendChild(grid);
        catalogContainer.appendChild(catSec);
      });
    }
    parent.appendChild(catalogContainer);

    // Cart Sticky Bottom Bar (if items are selected)
    const cartCount = this.getCartCount();
    if (cartCount > 0) {
      const cartBar = document.createElement('div');
      cartBar.className = 'storefront-cart-bar';

      const info = document.createElement('div');
      info.className = 'cart-bar-info';

      const count = document.createElement('strong');
      count.textContent = `${cartCount} ${cartCount === 1 ? 'item selecionado' : 'itens selecionados'}`;
      info.appendChild(count);

      if (resolvedComponents.price) {
        const totalVal = document.createElement('span');
        totalVal.className = 'cart-bar-total';
        totalVal.textContent = ` | Total: ${this.formatPrice(this.getCartTotal())}`;
        info.appendChild(totalVal);
      }

      const advBtn = document.createElement('button');
      advBtn.type = 'button';
      advBtn.className = 'whatsapp-order-button';
      advBtn.textContent = 'Avançar para dados →';
      advBtn.addEventListener('click', () => {
        this.stage = 2;
        this.render();
      });

      cartBar.appendChild(info);
      cartBar.appendChild(advBtn);
      parent.appendChild(cartBar);
    }
  }

  // STAGE 2: Customer Details Form
  renderStage2(parent) {
    const { orderFields } = this.menu;
    const resolvedFields = orderFields || {
      date: false,
      timeSlots: [],
      deliveryOrPickup: true,
      customerName: true,
      notes: true
    };

    const container = document.createElement('div');
    container.className = 'portal-card portal-card-padded';

    const h2 = document.createElement('h2');
    h2.textContent = 'Dados do Pedido / Atendimento';
    container.appendChild(h2);

    const form = document.createElement('form');
    form.className = 'form-flex-col';
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.stage = 3;
      this.render();
    });

    // 1. Customer Name field
    if (resolvedFields.customerName) {
      const div = document.createElement('div');
      div.className = 'form-group';
      
      const label = document.createElement('label');
      label.setAttribute('for', 'cust-name');
      label.textContent = 'Seu Nome (obrigatório)';
      
      const input = document.createElement('input');
      input.type = 'text';
      input.id = 'cust-name';
      input.required = true;
      input.className = 'item-input input-styled-height';
      input.value = this.customerDetails.customerName;
      input.addEventListener('input', () => {
        this.customerDetails.customerName = input.value;
      });

      div.appendChild(label);
      div.appendChild(input);
      form.appendChild(div);
    }

    // 2. Date field
    if (resolvedFields.date) {
      const div = document.createElement('div');
      div.className = 'form-group';
      
      const label = document.createElement('label');
      label.setAttribute('for', 'cust-date');
      label.textContent = 'Data de preferência (obrigatório)';
      
      const input = document.createElement('input');
      input.type = 'date';
      input.id = 'cust-date';
      input.required = true;
      input.className = 'item-input input-styled-height';
      input.value = this.customerDetails.date;
      input.addEventListener('input', () => {
        this.customerDetails.date = input.value;
      });

      div.appendChild(label);
      div.appendChild(input);
      form.appendChild(div);
    }

    // 3. Time Slots field
    if (resolvedFields.timeSlots && resolvedFields.timeSlots.length > 0) {
      const div = document.createElement('div');
      div.className = 'form-group';
      
      const label = document.createElement('label');
      label.setAttribute('for', 'cust-timeslot');
      label.textContent = 'Horário de preferência (obrigatório)';
      
      const select = document.createElement('select');
      select.id = 'cust-timeslot';
      select.required = true;
      select.className = 'select-styled';
      
      const defaultOpt = document.createElement('option');
      defaultOpt.value = '';
      defaultOpt.textContent = 'Selecione um horário...';
      select.appendChild(defaultOpt);

      resolvedFields.timeSlots.forEach(slot => {
        const opt = document.createElement('option');
        opt.value = slot;
        opt.textContent = slot;
        if (this.customerDetails.timeSlot === slot) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });

      select.addEventListener('change', () => {
        this.customerDetails.timeSlot = select.value;
      });

      div.appendChild(label);
      div.appendChild(select);
      form.appendChild(div);
    }

    // 4. Delivery or Pickup field
    if (resolvedFields.deliveryOrPickup) {
      const div = document.createElement('div');
      div.className = 'form-group';
      
      const label = document.createElement('label');
      label.textContent = 'Como deseja receber?';
      div.appendChild(label);

      const radioContainer = document.createElement('div');
      radioContainer.className = 'radio-group-container';

      const labelDeliv = document.createElement('label');
      labelDeliv.className = 'radio-label-styled';
      const rDeliv = document.createElement('input');
      rDeliv.type = 'radio';
      rDeliv.name = 'deliv-pickup';
      rDeliv.value = 'delivery';
      rDeliv.checked = this.customerDetails.deliveryOrPickup === 'delivery';
      labelDeliv.appendChild(rDeliv);
      labelDeliv.appendChild(document.createTextNode(' Entrega em domicílio'));

      const labelPickup = document.createElement('label');
      labelPickup.className = 'radio-label-styled';
      const rPickup = document.createElement('input');
      rPickup.type = 'radio';
      rPickup.name = 'deliv-pickup';
      rPickup.value = 'pickup';
      rPickup.checked = this.customerDetails.deliveryOrPickup === 'pickup';
      labelPickup.appendChild(rPickup);
      labelPickup.appendChild(document.createTextNode(' Retirada no local'));

      radioContainer.appendChild(labelDeliv);
      radioContainer.appendChild(labelPickup);
      div.appendChild(radioContainer);

      // Address Input (only if delivery is checked)
      const addrDiv = document.createElement('div');
      addrDiv.className = 'form-group address-input-group';
      addrDiv.hidden = this.customerDetails.deliveryOrPickup !== 'delivery';

      const addrLabel = document.createElement('label');
      addrLabel.setAttribute('for', 'cust-address');
      addrLabel.textContent = 'Endereço Completo de Entrega (obrigatório)';
      
      const addrInput = document.createElement('input');
      addrInput.type = 'text';
      addrInput.id = 'cust-address';
      addrInput.className = 'item-input input-styled-height';
      addrInput.value = this.customerDetails.address;
      addrInput.required = this.customerDetails.deliveryOrPickup === 'delivery';
      addrInput.placeholder = 'Rua, número, complemento, bairro...';
      addrInput.addEventListener('input', () => {
        this.customerDetails.address = addrInput.value;
      });

      rDeliv.addEventListener('change', () => {
        this.customerDetails.deliveryOrPickup = 'delivery';
        addrDiv.hidden = false;
        addrInput.required = true;
      });

      rPickup.addEventListener('change', () => {
        this.customerDetails.deliveryOrPickup = 'pickup';
        addrDiv.hidden = true;
        addrInput.required = false;
      });

      addrDiv.appendChild(addrLabel);
      addrDiv.appendChild(addrInput);
      div.appendChild(addrDiv);
      form.appendChild(div);
    }

    // 5. Notes field
    if (resolvedFields.notes) {
      const div = document.createElement('div');
      div.className = 'form-group';
      
      const label = document.createElement('label');
      label.setAttribute('for', 'cust-notes');
      label.textContent = 'Observações ou Comentários';
      
      const textarea = document.createElement('textarea');
      textarea.id = 'cust-notes';
      textarea.className = 'textarea-goal';
      textarea.placeholder = 'Ex: Ponto de referência, tirar cebola, restrição alimentar...';
      textarea.value = this.customerDetails.notes;
      textarea.addEventListener('input', () => {
        this.customerDetails.notes = textarea.value;
      });

      div.appendChild(label);
      div.appendChild(textarea);
      form.appendChild(div);
    }

    // Nav Actions
    const actions = document.createElement('div');
    actions.className = 'wizard-actions-spaced';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'button button-secondary button-pill';
    backBtn.textContent = '← Voltar';
    backBtn.addEventListener('click', () => {
      this.stage = 1;
      this.render();
    });

    const nextBtn = document.createElement('button');
    nextBtn.type = 'submit';
    nextBtn.className = 'button button-pill';
    nextBtn.textContent = 'Revisar Pedido →';

    actions.appendChild(backBtn);
    actions.appendChild(nextBtn);
    form.appendChild(actions);

    container.appendChild(form);
    parent.appendChild(container);
  }

  // STAGE 3: Review and Confirm (WA checkout)
  renderStage3(parent) {
    const { whatsapp, components, messages } = this.menu;
    const resolvedComponents = components || {
      name: true,
      description: true,
      photo: true,
      price: true,
      minQuantity: false,
      quantitySelector: true,
      durationMinutes: false
    };

    const container = document.createElement('div');
    container.className = 'portal-card portal-card-padded';

    const h2 = document.createElement('h2');
    h2.textContent = 'Revisão do seu Pedido';
    container.appendChild(h2);

    // List Chosen Items
    const summaryList = document.createElement('div');
    summaryList.className = 'review-items-container';

    let listText = '';
    const categories = this.menu.categories || [];
    categories.forEach(cat => {
      (cat.items || []).forEach(item => {
        if (this.cart.has(item.id)) {
          const qty = this.cart.get(item.id);
          const itemRow = document.createElement('div');
          itemRow.className = 'review-item-row';

          const titleSpan = document.createElement('span');
          titleSpan.className = 'review-item-title-qty';
          titleSpan.textContent = `${qty}x ${item.name || 'Item'}`;
          if (resolvedComponents.durationMinutes && item.durationMinutes) {
            titleSpan.textContent += ` (${item.durationMinutes} min)`;
          }
          itemRow.appendChild(titleSpan);

          if (resolvedComponents.price) {
            const priceSpan = document.createElement('span');
            priceSpan.className = 'review-item-price';
            priceSpan.textContent = this.formatPrice((item.priceCents || 0) * qty);
            itemRow.appendChild(priceSpan);
            
            listText += `- ${qty}x ${item.name} (${this.formatPrice(item.priceCents)})\n`;
          } else if (resolvedComponents.durationMinutes && item.durationMinutes) {
            listText += `- ${qty}x ${item.name} (${item.durationMinutes} min)\n`;
          } else {
            listText += `- ${qty}x ${item.name}\n`;
          }

          summaryList.appendChild(itemRow);
        }
      });
    });
    container.appendChild(summaryList);

    // Total Display
    const totalDiv = document.createElement('div');
    totalDiv.className = 'review-total-divider';

    const totalLabel = document.createElement('strong');
    totalLabel.textContent = resolvedComponents.durationMinutes ? 'Total estimado:' : 'Total:';
    totalDiv.appendChild(totalLabel);

    const totalVal = document.createElement('span');
    totalVal.className = 'review-total-val';
    if (resolvedComponents.price) {
      totalVal.textContent = this.formatPrice(this.getCartTotal());
    } else if (resolvedComponents.durationMinutes) {
      totalVal.textContent = `${this.getCartTotalDuration()} min`;
    } else {
      totalVal.textContent = '-';
    }
    totalDiv.appendChild(totalVal);
    container.appendChild(totalDiv);

    // Customer details summary
    const detailsSec = document.createElement('div');
    detailsSec.className = 'review-details-section';

    const detailsTitle = document.createElement('h3');
    detailsTitle.textContent = 'Dados de Envio';
    detailsSec.appendChild(detailsTitle);

    const detailsList = document.createElement('ul');
    detailsList.className = 'review-details-list';

    if (this.customerDetails.customerName) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>Nome:</strong> ${this.customerDetails.customerName}`;
      detailsList.appendChild(li);
    }
    if (this.customerDetails.date) {
      // Format date beautifully
      const parts = this.customerDetails.date.split('-');
      const formattedDate = parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : this.customerDetails.date;
      const li = document.createElement('li');
      li.innerHTML = `<strong>Data:</strong> ${formattedDate}`;
      detailsList.appendChild(li);
    }
    if (this.customerDetails.timeSlot) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>Horário:</strong> ${this.customerDetails.timeSlot}`;
      detailsList.appendChild(li);
    }
    if (this.customerDetails.deliveryOrPickup) {
      const li = document.createElement('li');
      const text = this.customerDetails.deliveryOrPickup === 'delivery'
        ? `Entrega no endereço: ${this.customerDetails.address}`
        : 'Retirada no local';
      li.innerHTML = `<strong>Forma de recebimento:</strong> ${text}`;
      detailsList.appendChild(li);
    }
    if (this.customerDetails.notes) {
      const li = document.createElement('li');
      li.innerHTML = `<strong>Observações:</strong> ${this.customerDetails.notes}`;
      detailsList.appendChild(li);
    }
    detailsSec.appendChild(detailsList);
    container.appendChild(detailsSec);

    // Build WhatsApp Message and Link
    const waPhone = this.options.targetWhatsapp || whatsapp || '5511999999999';
    const waTemplate = messages?.whatsappTemplate || 'Olá! Tenho interesse nestes produtos:\n{itens}\nTotal estimado: {total}';

    const formattedDate = this.customerDetails.date 
      ? this.customerDetails.date.split('-').reverse().join('/') 
      : '';
    const formattedAddress = this.customerDetails.deliveryOrPickup === 'delivery' 
      ? this.customerDetails.address 
      : 'Retirada no local';

    let msg = waTemplate
      .replace('{itens}', listText.trim())
      .replace('{total}', resolvedComponents.price ? this.formatPrice(this.getCartTotal()) : (resolvedComponents.durationMinutes ? `${this.getCartTotalDuration()} min` : ''))
      .replace('{data}', formattedDate)
      .replace('{horario}', this.customerDetails.timeSlot)
      .replace('{endereco}', formattedAddress)
      .replace('{nome}', this.customerDetails.customerName);

    // Form action buttons
    const actions = document.createElement('div');
    actions.className = 'wizard-actions-spaced';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'button button-secondary button-pill';
    backBtn.textContent = '← Voltar';
    backBtn.addEventListener('click', () => {
      this.stage = 2;
      this.render();
    });

    const sendBtn = document.createElement('a');
    sendBtn.className = 'whatsapp-order-button';
    sendBtn.textContent = messages?.ctaLabel || 'Enviar no WhatsApp';
    sendBtn.href = `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`;
    sendBtn.target = '_blank';
    sendBtn.rel = 'noopener noreferrer';
    
    // Track stats click on click (FR-014 metric)
    sendBtn.addEventListener('click', () => {
      if (typeof window !== 'undefined' && typeof window.recordStorefrontEvent === 'function') {
        window.recordStorefrontEvent('whatsapp_order', { estimatedCents: this.getCartTotal() });
      }
    });

    actions.appendChild(backBtn);
    actions.appendChild(sendBtn);
    container.appendChild(actions);

    parent.appendChild(container);
  }
}
