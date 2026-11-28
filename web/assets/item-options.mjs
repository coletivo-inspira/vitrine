// Opções do item (spec 021): tamanhos, meio a meio e um grupo de adicionais de escolha
// única. Módulo puro, usado na validação do rascunho, na projeção pública, na vitrine e
// no editor. Uma escolha é `{ sizeId, halfWith, extraId }`; um cartão é uma linha do pedido.

export const ITEM_OPTION_LIMITS = Object.freeze({
  minSizes: 2,
  maxSizes: 4,
  sizeLabel: 30,
  extrasLabel: 30,
  extraChoiceLabel: 40,
  maxExtraChoices: 6,
  maxPriceCents: 10_000_000
});

const OPTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;

function optionError(field, message) {
  return { field, code: 'INVALID_ITEM_OPTIONS', message };
}

function validPrice(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= ITEM_OPTION_LIMITS.maxPriceCents;
}

function cleanText(value, max) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text && text.length <= max ? text : null;
}

/**
 * Confere e normaliza `sizes`, `halfAndHalf` e `extras` de um item. Devolve
 * `{ options, errors }`; `options` só traz as chaves presentes e válidas.
 */
export function normalizeItemOptions(item) {
  const options = {};
  const errors = [];

  if (item?.sizes !== undefined && item.sizes !== null) {
    const sizes = item.sizes;
    if (!Array.isArray(sizes) || sizes.length < ITEM_OPTION_LIMITS.minSizes || sizes.length > ITEM_OPTION_LIMITS.maxSizes) {
      errors.push(optionError('sizes', `Cadastre de ${ITEM_OPTION_LIMITS.minSizes} a ${ITEM_OPTION_LIMITS.maxSizes} tamanhos, cada um com nome e preço.`));
    } else {
      const ids = new Set();
      const normalized = [];
      sizes.forEach((size, index) => {
        const id = typeof size?.id === 'string' ? size.id.trim() : '';
        const label = cleanText(size?.label, ITEM_OPTION_LIMITS.sizeLabel);
        if (!OPTION_ID_PATTERN.test(id) || ids.has(id) || !label || !validPrice(size?.priceCents) || size.priceCents === 0) {
          errors.push(optionError(`sizes.${index}`, `Cada tamanho precisa de nome (até ${ITEM_OPTION_LIMITS.sizeLabel} caracteres) e preço maior que R$ 0,00, sem repetir.`));
          return;
        }
        ids.add(id);
        normalized.push({ id, label, priceCents: size.priceCents });
      });
      if (normalized.length === sizes.length) options.sizes = normalized;
    }
  }

  if (item?.halfAndHalf !== undefined && item.halfAndHalf !== null) {
    if (typeof item.halfAndHalf !== 'boolean') {
      errors.push(optionError('halfAndHalf', 'O meio a meio deve ser ligado ou desligado.'));
    } else if (item.halfAndHalf) {
      options.halfAndHalf = true;
    }
  }

  if (item?.extras !== undefined && item.extras !== null) {
    const extras = item.extras;
    const label = cleanText(extras?.label, ITEM_OPTION_LIMITS.extrasLabel);
    const choices = Array.isArray(extras?.choices) ? extras.choices : null;
    if (!label || !choices || choices.length < 1 || choices.length > ITEM_OPTION_LIMITS.maxExtraChoices) {
      errors.push(optionError('extras', `O adicional precisa de um nome (como "Borda") e de 1 a ${ITEM_OPTION_LIMITS.maxExtraChoices} opções.`));
    } else {
      const sizeIds = new Set((options.sizes ?? []).map((size) => size.id));
      const ids = new Set();
      const normalized = [];
      choices.forEach((choice, index) => {
        const id = typeof choice?.id === 'string' ? choice.id.trim() : '';
        const choiceLabel = cleanText(choice?.label, ITEM_OPTION_LIMITS.extraChoiceLabel);
        const prices = choice?.prices;
        const pricesValid = prices === undefined || prices === null || (
          typeof prices === 'object' && !Array.isArray(prices) &&
          Object.entries(prices).every(([sizeId, cents]) => sizeIds.has(sizeId) && validPrice(cents))
        );
        if (!OPTION_ID_PATTERN.test(id) || ids.has(id) || !choiceLabel || !validPrice(choice?.priceCents) || !pricesValid) {
          errors.push(optionError(`extras.choices.${index}`, `Cada opção do adicional precisa de nome (até ${ITEM_OPTION_LIMITS.extraChoiceLabel} caracteres) e preço, sem repetir.`));
          return;
        }
        ids.add(id);
        const entry = { id, label: choiceLabel, priceCents: choice.priceCents };
        if (prices && Object.keys(prices).length) entry.prices = { ...prices };
        normalized.push(entry);
      });
      if (normalized.length === choices.length) options.extras = { label, choices: normalized };
    }
  }

  return { options, errors };
}

/** Textos livres das opções, para as mesmas checagens de conteúdo dos outros campos do item. */
export function itemOptionTexts(item) {
  const sizes = Array.isArray(item?.sizes) ? item.sizes.map((size) => size?.label) : [];
  const extras = item?.extras && typeof item.extras === 'object'
    ? [item.extras.label, ...(Array.isArray(item.extras.choices) ? item.extras.choices.map((choice) => choice?.label) : [])]
    : [];
  return [...sizes, ...extras].filter((text) => typeof text === 'string');
}

export function hasItemOptions(item) {
  return Boolean((Array.isArray(item?.sizes) && item.sizes.length) || item?.halfAndHalf || item?.extras?.choices?.length);
}

export function defaultSizeId(item) {
  const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
  if (!sizes.length) return null;
  return (sizes.find((size) => size.priceCents === item.priceCents) ?? sizes[0]).id;
}

export function defaultItemChoice(item) {
  return { sizeId: defaultSizeId(item), halfWith: null, extraId: null };
}

function sizePrice(item, sizeId) {
  const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
  if (!sizes.length) return Number.isSafeInteger(item?.priceCents) ? item.priceCents : 0;
  return sizes.find((size) => size.id === sizeId)?.priceCents ?? null;
}

/** Outros sabores que podem ser a segunda metade no tamanho escolhido. */
export function halfAndHalfPartners(item, allItems, sizeId = defaultSizeId(item)) {
  if (!item?.halfAndHalf) return [];
  const needsSize = Array.isArray(item.sizes) && item.sizes.length > 0;
  return (allItems ?? []).filter((other) =>
    other && other.id !== item.id && other.halfAndHalf &&
    (needsSize ? sizePrice(other, sizeId) !== null && Array.isArray(other.sizes) && other.sizes.length > 0
      : !(Array.isArray(other.sizes) && other.sizes.length)));
}

/** Escolha conferida contra o item: tamanho existente, metade compatível e adicional existente. */
export function resolveItemChoice(item, choice, allItems = []) {
  const base = defaultItemChoice(item);
  const sizes = Array.isArray(item?.sizes) ? item.sizes : [];
  const sizeId = sizes.some((size) => size.id === choice?.sizeId) ? choice.sizeId : base.sizeId;
  const partner = choice?.halfWith
    ? halfAndHalfPartners(item, allItems, sizeId).find((other) => other.id === choice.halfWith) ?? null
    : null;
  const extra = item?.extras?.choices?.find((entry) => entry.id === choice?.extraId) ?? null;
  return { sizeId, halfWith: partner ? partner.id : null, extraId: extra ? extra.id : null, partner, extra };
}

function extraPrice(extra, sizeId) {
  if (!extra) return 0;
  const bySize = extra.prices && sizeId ? extra.prices[sizeId] : undefined;
  return Number.isSafeInteger(bySize) ? bySize : extra.priceCents;
}

/** Preço de uma unidade com as escolhas: maior metade no tamanho, mais o adicional. */
export function itemUnitPriceCents(item, choice, allItems = []) {
  const resolved = resolveItemChoice(item, choice, allItems);
  const own = sizePrice(item, resolved.sizeId) ?? 0;
  const half = resolved.partner ? sizePrice(resolved.partner, resolved.sizeId) ?? 0 : 0;
  return Math.max(own, half) + extraPrice(resolved.extra, resolved.sizeId);
}

/** Texto das escolhas para a linha do pedido, como `Grande, meio a meio com Portuguesa, Borda: Catupiry`. */
export function describeItemChoice(item, choice, allItems = []) {
  const resolved = resolveItemChoice(item, choice, allItems);
  const parts = [];
  const size = item?.sizes?.find((entry) => entry.id === resolved.sizeId);
  if (size) parts.push(size.label);
  if (resolved.partner) parts.push(`meio a meio com ${resolved.partner.name}`);
  if (resolved.extra) parts.push(`${item.extras.label}: ${resolved.extra.label}`);
  return parts.join(', ');
}

/** Preço do adicional no tamanho, para mostrar nas opções. */
export function extraChoicePriceCents(extra, sizeId) {
  return extraPrice(extra, sizeId);
}
