/**
 * Gaveta lateral "Sua seleção" da vitrine pública e persistência da seleção na sessão.
 * Lê e altera o mesmo estado do StorefrontRenderer (barra inferior e cartões).
 * CSP: sem innerHTML, sem estilos inline e sem scripts inline.
 */

export const SELECTION_STORAGE_PREFIX = 'vitrine-selecao:';
export const SELECTION_ADDED_MESSAGE = 'Adicionado à sua seleção';

const SVG_NS = 'http://www.w3.org/2000/svg';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
const TOAST_MS = 2600;
const NOTICE_TOAST_MS = 6000;

export function formatDiscardNotice(count) {
  if (!Number.isSafeInteger(count) || count <= 0) return '';
  return count === 1
    ? '1 item da sua seleção saiu da vitrine e foi removido.'
    : `${count} itens da sua seleção saíram da vitrine e foram removidos.`;
}

function resolveStorage(storage) {
  if (storage !== undefined) return storage;
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

/**
 * Guarda só `{ versao, itens: { itemId: quantidade } }` em sessionStorage, chave
 * `vitrine-selecao:<endereço>`. Sem cookie, sem nome, telefone ou endereço.
 */
export function createSelectionStore({ slug, storage, version = '' } = {}) {
  const store = resolveStorage(storage);
  const key = `${SELECTION_STORAGE_PREFIX}${slug}`;
  let lastWritten = null;

  function load() {
    if (!store || !slug) return null;
    try {
      const parsed = JSON.parse(store.getItem(key) ?? 'null');
      if (!parsed || typeof parsed !== 'object' || !parsed.itens || typeof parsed.itens !== 'object') return null;
      lastWritten = JSON.stringify(parsed);
      return { versao: typeof parsed.versao === 'string' ? parsed.versao : '', itens: parsed.itens };
    } catch {
      return null;
    }
  }

  function save(selection) {
    if (!store || !slug) return false;
    try {
      const itens = {};
      for (const [itemId, qty] of Object.entries(selection ?? {})) {
        if (Number.isSafeInteger(qty) && qty > 0) itens[itemId] = qty;
      }
      if (Object.keys(itens).length === 0) {
        if (lastWritten !== '') store.removeItem(key);
        lastWritten = '';
        return true;
      }
      const serialized = JSON.stringify({ versao: version, itens });
      if (serialized !== lastWritten) store.setItem(key, serialized);
      lastWritten = serialized;
      return true;
    } catch {
      return false;
    }
  }

  return { key, load, save };
}

export function trapFocus(container, event) {
  if (event?.key !== 'Tab' || typeof container?.querySelectorAll !== 'function') return false;
  const focusable = [...container.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && !el.closest?.('[hidden]'));
  if (focusable.length === 0) return false;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = container.ownerDocument?.activeElement;
  if (event.shiftKey && (active === first || !container.contains(active))) {
    event.preventDefault();
    last.focus();
    return true;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
    return true;
  }
  return false;
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function closeIcon(doc) {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '24');
  svg.setAttribute('height', '24');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'M6 6l12 12M18 6 6 18');
  svg.appendChild(path);
  return svg;
}

function describeEntry(renderer, { item, qty, priceMode }) {
  const components = renderer.getResolvedComponents();
  const catalogType = renderer.getCatalogType();
  const price = Number.isInteger(item.priceCents) ? item.priceCents : 0;
  if (priceMode === 'offer') {
    return { meta: `Lance: ${renderer.formatPrice(renderer.offers.get(item.id) || price)}`, lineTotal: '' };
  }
  if (priceMode === 'donation') return { meta: 'Doação', lineTotal: '' };
  if (priceMode === 'trade') {
    const proposal = (renderer.tradeProposals.get(item.id) || '').trim();
    return { meta: proposal ? `Troca, você oferece: ${proposal}` : 'Troca', lineTotal: '' };
  }
  if (priceMode === 'quota') {
    return { meta: `${renderer.formatPrice(price)} por cota`, lineTotal: renderer.formatPrice(price * qty) };
  }
  const parts = [];
  const showsPrice = components.price && (catalogType !== 'quote' || price > 0);
  if (showsPrice) parts.push(qty > 1 ? `${renderer.formatPrice(price)} cada` : renderer.formatPrice(price));
  else if (catalogType === 'quote') parts.push('Sob consulta');
  if (components.durationMinutes && item.durationMinutes > 0) parts.push(`${item.durationMinutes} min`);
  return { meta: parts.join(' · '), lineTotal: showsPrice ? renderer.formatPrice(price * qty) : '' };
}

function usesStepper(renderer, { item, priceMode }) {
  if (priceMode === 'quota') return true;
  if (priceMode !== 'fixed') return false;
  const components = renderer.getResolvedComponents();
  return Boolean(components.quantitySelector || (components.minQuantity && item.minQuantity > 1));
}

/**
 * Cria a gaveta `<dialog>` e a liga ao evento cancelável do ícone "Sua seleção".
 * Devolve `null` quando o documento não oferece o necessário (sem JavaScript
 * completo, o ícone continua sendo só a âncora para as etapas).
 */
export function createSelectionDrawer({
  doc = globalThis.document,
  win = globalThis,
  renderer,
  openEvent,
  trigger = doc?.querySelector?.('.storefront-selection') ?? null
} = {}) {
  if (!doc?.body || typeof doc.createElement !== 'function' || typeof doc.addEventListener !== 'function' || !renderer) {
    return null;
  }

  const dialog = el(doc, 'dialog', 'selection-drawer');
  if (typeof dialog.showModal !== 'function') return null;
  dialog.setAttribute('aria-labelledby', 'selection-drawer-title');

  const panel = el(doc, 'div', 'selection-drawer-panel');
  const head = el(doc, 'div', 'selection-drawer-head');
  const title = el(doc, 'h2', 'selection-drawer-title');
  title.id = 'selection-drawer-title';
  title.setAttribute('tabindex', '-1');
  const closeButton = el(doc, 'button', 'selection-drawer-close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Fechar sua seleção');
  closeButton.appendChild(closeIcon(doc));
  head.append(title, closeButton);

  const notice = el(doc, 'p', 'selection-drawer-notice');
  notice.hidden = true;
  const live = el(doc, 'p', 'selection-drawer-live');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const body = el(doc, 'div', 'selection-drawer-body');
  const foot = el(doc, 'div', 'selection-drawer-foot');
  panel.append(head, notice, live, body, foot);
  dialog.appendChild(panel);

  const toast = el(doc, 'p', 'selection-toast');
  toast.setAttribute('aria-hidden', 'true');
  toast.hidden = true;

  doc.body.append(dialog, toast);

  let isOpen = false;
  let toastTimer = null;
  let restoreFocusOnClose = true;

  function setTimer(fn, ms) {
    return typeof win?.setTimeout === 'function' ? win.setTimeout(fn, ms) : null;
  }

  function clearTimer(id) {
    if (id !== null && typeof win?.clearTimeout === 'function') win.clearTimeout(id);
  }

  function showToast(message, ms = TOAST_MS) {
    if (!message) return;
    toast.textContent = message;
    toast.hidden = false;
    clearTimer(toastTimer);
    toastTimer = setTimer(() => {
      toast.hidden = true;
    }, ms);
  }

  function announce(message) {
    live.textContent = '';
    live.textContent = message;
  }

  function stepButton(label, text, focusKey, disabled, onClick) {
    const button = el(doc, 'button', 'btn-qty', text);
    button.type = 'button';
    button.disabled = disabled;
    button.setAttribute('aria-label', label);
    button.dataset.focusKey = focusKey;
    button.addEventListener('click', onClick);
    return button;
  }

  function changeQuantity(entry, delta) {
    const { item, priceMode } = entry;
    const name = item.name || 'item';
    if (priceMode === 'quota') renderer.setQuotaQuantity(item, delta);
    else renderer.setQuantity(item, delta);
    const next = renderer.cart.get(item.id) || 0;
    if (next === 0) {
      announce(`${name} removido da sua seleção.`);
      afterEmpty();
    } else if (next !== entry.qty) {
      announce(`Quantidade de ${name}: ${next}.`);
    } else if (renderer.itemErrors.get(item.id)) {
      announce(renderer.itemErrors.get(item.id));
    }
  }

  function removeEntry(entry) {
    renderer.removeItem(entry.item);
    announce(`${entry.item.name || 'Item'} removido da sua seleção.`);
    afterEmpty();
  }

  function afterEmpty() {
    if (renderer.getCartCount() === 0 && renderer.stage !== 1) renderer.goToStage(1);
  }

  function renderItem(entry) {
    const { item, qty, priceMode } = entry;
    const name = item.name || 'Item';
    const id = String(item.id);
    const row = el(doc, 'li', 'selection-drawer-item');
    row.dataset.itemId = id;

    const components = renderer.getResolvedComponents();
    if (components.photo && typeof item.imageUrl === 'string' && item.imageUrl.trim()) {
      const img = el(doc, 'img', 'selection-drawer-photo');
      img.src = item.imageUrl.trim();
      img.alt = '';
      img.width = 64;
      img.height = 64;
      img.loading = 'lazy';
      row.appendChild(img);
    }

    const info = el(doc, 'div', 'selection-drawer-info');
    info.appendChild(el(doc, 'p', 'selection-drawer-name', name));
    const { meta, lineTotal } = describeEntry(renderer, entry);
    if (meta) info.appendChild(el(doc, 'p', 'selection-drawer-meta', meta));
    row.appendChild(info);

    const controls = el(doc, 'div', 'selection-drawer-controls');
    if (usesStepper(renderer, entry)) {
      const group = el(doc, 'div', 'qty-selector');
      group.setAttribute('role', 'group');
      group.setAttribute('aria-label', priceMode === 'quota' ? `Cotas de ${name}` : `Quantidade de ${name}`);
      const max = priceMode === 'quota' ? renderer.getQuotaSelectionLimit(item) : 99;
      group.append(
        stepButton(
          priceMode === 'quota' ? `Remover uma cota de ${name}` : `Diminuir quantidade de ${name}`,
          '−',
          `dec:${id}`,
          false,
          () => changeQuantity(entry, -1)
        ),
        el(doc, 'span', 'qty-val', String(qty)),
        stepButton(
          priceMode === 'quota' ? `Reservar mais uma cota de ${name}` : `Aumentar quantidade de ${name}`,
          '+',
          `inc:${id}`,
          qty >= max,
          () => changeQuantity(entry, 1)
        )
      );
      controls.appendChild(group);
    }
    if (lineTotal) controls.appendChild(el(doc, 'span', 'selection-drawer-line-total', lineTotal));
    const remove = el(doc, 'button', 'selection-drawer-remove', 'Remover');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Remover ${name} da sua seleção`);
    remove.dataset.focusKey = `remove:${id}`;
    remove.addEventListener('click', () => removeEntry(entry));
    controls.appendChild(remove);
    row.appendChild(controls);
    return row;
  }

  function renderSummary(summary) {
    const box = el(doc, 'div', 'selection-drawer-summary');
    box.appendChild(el(doc, 'p', 'selection-drawer-count', summary.countText));
    const total = summary.totalText || summary.quotaText || summary.durationText;
    if (total) {
      const line = el(doc, 'p', 'selection-drawer-total');
      line.append(
        el(doc, 'span', '', summary.durationText && !summary.totalText && !summary.quotaText ? 'Duração estimada' : 'Total estimado'),
        el(doc, 'strong', '', summary.totalText || summary.quotaText || summary.durationText)
      );
      box.appendChild(line);
      if (summary.totalText && summary.quotaText) {
        box.appendChild(el(doc, 'p', 'selection-drawer-quota', summary.quotaText));
      }
    }
    if (renderer.hasSelectedOffers()) {
      box.appendChild(el(doc, 'p', 'selection-drawer-note', 'Lances não entram no total; são combinados com o negócio.'));
    }
    if (renderer.getQuotaCount() > 0) {
      box.appendChild(el(doc, 'p', 'selection-drawer-note', 'Cotas: reserva sem sorteio; o pagamento é combinado diretamente com o negócio.'));
    }
    return box;
  }

  function continueToStage() {
    const target = renderer.hasAnyOrderFields() ? 2 : 3;
    restoreFocusOnClose = false;
    close();
    renderer.goToStage(Math.max(renderer.stage, target));
    const heading = renderer.container?.querySelector?.('.sf-stage-title');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus();
    }
  }

  function refresh() {
    const isQuote = renderer.getCatalogType() === 'quote';
    title.textContent = isQuote ? 'Seu pré-orçamento' : 'Sua seleção';
    const active = doc.activeElement;
    const focusKey = isOpen && dialog.contains(active) ? active?.dataset?.focusKey ?? '' : '';
    const focusIndex = focusKey ? [...body.querySelectorAll('.selection-drawer-item')].findIndex((row) => row.contains(active)) : -1;

    const entries = renderer.getSelectedEntries();
    body.replaceChildren();
    foot.replaceChildren();

    if (entries.length === 0) {
      const empty = el(doc, 'div', 'selection-drawer-empty');
      empty.appendChild(el(doc, 'p', 'selection-drawer-empty-title', isQuote ? 'Seu pré-orçamento está vazio' : 'Sua seleção está vazia'));
      const link = el(doc, 'a', 'whatsapp-order-button selection-drawer-browse', 'Ver itens da vitrine');
      link.href = '#storefront-catalog';
      link.dataset.focusKey = 'browse';
      link.addEventListener('click', () => {
        restoreFocusOnClose = false;
        close();
        if (renderer.stage !== 1) renderer.goToStage(1);
      });
      empty.appendChild(link);
      body.appendChild(empty);
    } else {
      const list = el(doc, 'ul', 'selection-drawer-list');
      list.setAttribute('aria-label', isQuote ? 'Itens do pré-orçamento' : 'Itens da sua seleção');
      for (const entry of entries) list.appendChild(renderItem(entry));
      body.appendChild(list);

      foot.appendChild(renderSummary(renderer.getSelectionSummary()));
      const actions = el(doc, 'div', 'selection-drawer-actions');
      const next = el(doc, 'button', 'whatsapp-order-button selection-drawer-continue', 'Continuar');
      next.type = 'button';
      next.dataset.focusKey = 'continue';
      next.addEventListener('click', continueToStage);
      const keep = el(doc, 'button', 'sf-secondary-button selection-drawer-keep', 'Continuar escolhendo');
      keep.type = 'button';
      keep.dataset.focusKey = 'keep';
      keep.addEventListener('click', () => close());
      actions.append(next, keep);
      foot.appendChild(actions);
    }

    if (!focusKey) return;
    const target = [...dialog.querySelectorAll('[data-focus-key]')].find((node) => node.dataset.focusKey === focusKey);
    if (target && !target.disabled) {
      target.focus();
      return;
    }
    const sameRow = target?.closest?.('.selection-drawer-item')?.querySelector?.('.selection-drawer-remove');
    const rows = [...body.querySelectorAll('.selection-drawer-item')];
    const neighbour = rows[Math.min(Math.max(focusIndex, 0), rows.length - 1)]?.querySelector?.('.selection-drawer-remove');
    (sameRow ?? neighbour ?? dialog.querySelector('.selection-drawer-browse') ?? title).focus();
  }

  function open() {
    refresh();
    if (!isOpen) {
      restoreFocusOnClose = true;
      dialog.showModal();
      isOpen = true;
    }
    title.focus();
  }

  function close() {
    if (!isOpen) return;
    dialog.close();
  }

  function setNotice(message) {
    notice.textContent = message;
    notice.hidden = !message;
    if (message) showToast(message, NOTICE_TOAST_MS);
  }

  dialog.addEventListener('close', () => {
    isOpen = false;
    live.textContent = '';
    if (!notice.hidden) setNotice('');
    if (restoreFocusOnClose) trigger?.focus?.();
    restoreFocusOnClose = true;
  });
  dialog.addEventListener('keydown', (event) => trapFocus(dialog, event));
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  closeButton.addEventListener('click', () => close());

  if (openEvent) {
    doc.addEventListener(openEvent, (event) => {
      event.preventDefault();
      open();
    });
  }

  return {
    element: dialog,
    open,
    close,
    refresh,
    isOpen: () => isOpen,
    setNotice,
    showToast
  };
}
