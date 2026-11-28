/**
 * Painel: "Tamanhos, meio a meio e adicional" no cartão do item do editor (spec 021).
 * Só grava no item o que está completo (de 2 a 4 tamanhos com nome e preço; opções do
 * adicional com nome e preço), para o salvamento automático não esbarrar em linhas pela
 * metade. Linhas incompletas ficam guardadas por item enquanto o editor está aberto.
 */
import { ITEM_OPTION_LIMITS } from '../assets/item-options.mjs';

const rowsByItem = new WeakMap();

function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export function formatOptionCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0 || cents === 0) return '';
  return `R$ ${Math.floor(cents / 100).toLocaleString('pt-BR')},${String(cents % 100).padStart(2, '0')}`;
}

export function parseOptionCents(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 9);
  return digits ? parseInt(digits, 10) : 0;
}

export function optionIdFrom(label, used) {
  const base = String(label ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'opcao';
  let id = base;
  let index = 2;
  while (used.has(id)) id = `${base}-${index++}`;
  used.add(id);
  return id;
}

/**
 * Converte as linhas do formulário nas chaves do item. Devolve `{ sizes, extras }`
 * com `undefined` quando o grupo não está completo.
 */
export function itemOptionsFromRows(state) {
  const sizeRows = state.sizes.filter((row) => row.label.trim() && row.priceCents > 0);
  const sizeIds = new Set(state.sizes.map((row) => row.id).filter(Boolean));
  const sizes = sizeRows.length >= ITEM_OPTION_LIMITS.minSizes && sizeRows.length === state.sizes.length
    ? sizeRows.map((row) => ({ id: row.id || optionIdFrom(row.label, sizeIds), label: row.label.trim(), priceCents: row.priceCents }))
    : undefined;
  const extraRows = state.extras.choices.filter((row) => row.label.trim());
  const choiceIds = new Set(state.extras.choices.map((row) => row.id).filter(Boolean));
  const extras = state.extras.label.trim() && extraRows.length
    ? {
        label: state.extras.label.trim(),
        choices: extraRows.map((row) => {
          const prices = sizes
            ? Object.fromEntries(sizes.flatMap((size) => (row.prices[size.id] > 0 ? [[size.id, row.prices[size.id]]] : [])))
            : {};
          const base = sizes ? (prices[sizes[0].id] ?? row.priceCents) : row.priceCents;
          return {
            id: row.id || optionIdFrom(row.label, choiceIds),
            label: row.label.trim(),
            priceCents: base,
            ...(Object.keys(prices).length ? { prices } : {})
          };
        })
      }
    : undefined;
  return { sizes, extras };
}

function stateFor(item) {
  if (!rowsByItem.has(item)) {
    rowsByItem.set(item, {
      sizes: (Array.isArray(item.sizes) ? item.sizes : []).map((size) => ({ id: size.id, label: size.label, priceCents: size.priceCents })),
      extras: {
        label: item.extras?.label ?? 'Borda',
        choices: (item.extras?.choices ?? []).map((choice) => ({
          id: choice.id, label: choice.label, priceCents: choice.priceCents, prices: { ...(choice.prices ?? {}) }
        }))
      }
    });
  }
  return rowsByItem.get(item);
}

function apply(item, state, onChange) {
  const { sizes, extras } = itemOptionsFromRows(state);
  if (sizes) {
    item.sizes = sizes;
    state.sizes.forEach((row, index) => { row.id = sizes[index].id; });
    if (!sizes.some((size) => size.priceCents === item.priceCents)) item.priceCents = sizes[0].priceCents;
  } else {
    delete item.sizes;
  }
  if (extras) {
    item.extras = extras;
    let cursor = 0;
    state.extras.choices.forEach((row) => { if (row.label.trim()) row.id = extras.choices[cursor++].id; });
  } else {
    delete item.extras;
  }
  onChange();
}

function priceInput(id, labelText, cents, onInput) {
  const input = el('input', { type: 'text', id, className: 'item-input input-styled-height', inputmode: 'numeric', placeholder: 'R$ 0,00', 'aria-label': labelText });
  input.value = formatOptionCents(cents);
  input.addEventListener('input', () => {
    const next = parseOptionCents(input.value);
    input.value = formatOptionCents(next);
    onInput(next);
  });
  return input;
}

/** Desenha o grupo de opções no cartão do item; `onChange` salva o rascunho. */
export function renderItemOptionsField(item, fields, { onChange = () => {}, priceMode = 'fixed', rerender = () => {} } = {}) {
  if (priceMode !== 'fixed' || !item) return;
  const state = stateFor(item);
  const prefix = `item-options-${item.id}`;
  const details = el('details', { className: 'item-options-field' });
  if (state.open ?? Boolean(item.sizes || item.halfAndHalf || item.extras)) details.open = true;
  details.addEventListener('toggle', () => { state.open = details.open; });
  details.append(el('summary', { text: 'Tamanhos, meio a meio e adicional' }));

  const sizesBox = el('fieldset', { className: 'form-group item-options-group' }, [
    el('legend', { text: `Tamanhos (de ${ITEM_OPTION_LIMITS.minSizes} a ${ITEM_OPTION_LIMITS.maxSizes})` }),
    el('span', { className: 'form-help', text: 'Ex.: Média, Grande e Gigante. A vitrine abre no tamanho com o mesmo preço do item.' })
  ]);
  state.sizes.forEach((row, index) => {
    const label = el('input', {
      type: 'text', id: `${prefix}-size-${index}`, className: 'item-input input-styled-height',
      maxlength: ITEM_OPTION_LIMITS.sizeLabel, placeholder: 'Nome do tamanho', 'aria-label': `Nome do tamanho ${index + 1}`
    });
    label.value = row.label;
    label.addEventListener('input', () => { row.label = label.value; apply(item, state, onChange); });
    const price = priceInput(`${prefix}-size-price-${index}`, `Preço do tamanho ${index + 1}`, row.priceCents, (cents) => {
      row.priceCents = cents;
      apply(item, state, onChange);
    });
    const remove = el('button', { type: 'button', className: 'text-link-btn', text: 'Remover', 'aria-label': `Remover tamanho ${index + 1}` });
    remove.addEventListener('click', () => { state.sizes.splice(index, 1); apply(item, state, onChange); rerender(); });
    sizesBox.append(el('div', { className: 'item-options-row' }, [label, price, remove]));
  });
  const addSize = el('button', { type: 'button', className: 'button button-small button-secondary button-pill', text: 'Adicionar tamanho' });
  addSize.disabled = state.sizes.length >= ITEM_OPTION_LIMITS.maxSizes;
  addSize.addEventListener('click', () => { state.sizes.push({ id: '', label: '', priceCents: 0 }); rerender(); });
  sizesBox.append(addSize);

  const halfId = `${prefix}-half`;
  const half = el('input', { type: 'checkbox', id: halfId });
  half.checked = item.halfAndHalf === true;
  half.addEventListener('change', () => {
    if (half.checked) item.halfAndHalf = true;
    else delete item.halfAndHalf;
    onChange();
  });
  const halfLabel = el('label', { className: 'checkbox-label-styled', for: halfId }, [
    half, document.createTextNode(' Aceita meio a meio (vale o preço do sabor mais caro)')
  ]);

  const extrasBox = el('fieldset', { className: 'form-group item-options-group' }, [
    el('legend', { text: 'Adicional de escolha única' })
  ]);
  const groupLabel = el('input', {
    type: 'text', id: `${prefix}-extras-label`, className: 'item-input input-styled-height',
    maxlength: ITEM_OPTION_LIMITS.extrasLabel, placeholder: 'Ex.: Borda', 'aria-label': 'Nome do adicional'
  });
  groupLabel.value = state.extras.label;
  groupLabel.addEventListener('input', () => { state.extras.label = groupLabel.value; apply(item, state, onChange); });
  extrasBox.append(groupLabel);
  const sizes = Array.isArray(item.sizes) ? item.sizes : [];
  state.extras.choices.forEach((row, index) => {
    const label = el('input', {
      type: 'text', id: `${prefix}-extra-${index}`, className: 'item-input input-styled-height',
      maxlength: ITEM_OPTION_LIMITS.extraChoiceLabel, placeholder: 'Ex.: Catupiry', 'aria-label': `Opção ${index + 1} do adicional`
    });
    label.value = row.label;
    label.addEventListener('input', () => { row.label = label.value; apply(item, state, onChange); });
    const prices = sizes.length
      ? sizes.map((size) => priceInput(`${prefix}-extra-${index}-${size.id}`, `Preço de ${row.label || `opção ${index + 1}`} no tamanho ${size.label}`, row.prices[size.id] ?? 0, (cents) => {
          row.prices[size.id] = cents;
          apply(item, state, onChange);
        }))
      : [priceInput(`${prefix}-extra-${index}-price`, `Preço de ${row.label || `opção ${index + 1}`}`, row.priceCents, (cents) => {
          row.priceCents = cents;
          apply(item, state, onChange);
        })];
    const remove = el('button', { type: 'button', className: 'text-link-btn', text: 'Remover', 'aria-label': `Remover opção ${index + 1} do adicional` });
    remove.addEventListener('click', () => { state.extras.choices.splice(index, 1); apply(item, state, onChange); rerender(); });
    extrasBox.append(el('div', { className: 'item-options-row' }, [label, ...prices, remove]));
  });
  if (sizes.length && state.extras.choices.length) {
    extrasBox.append(el('span', { className: 'form-help', text: `Um preço por tamanho, na ordem: ${sizes.map((size) => size.label).join(', ')}.` }));
  }
  const addExtra = el('button', { type: 'button', className: 'button button-small button-secondary button-pill', text: 'Adicionar opção' });
  addExtra.disabled = state.extras.choices.length >= ITEM_OPTION_LIMITS.maxExtraChoices;
  addExtra.addEventListener('click', () => { state.extras.choices.push({ id: '', label: '', priceCents: 0, prices: {} }); rerender(); });
  extrasBox.append(addExtra);

  details.append(sizesBox, halfLabel, extrasBox);
  fields.appendChild(details);
}
