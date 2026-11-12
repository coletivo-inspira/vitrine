import {
  formatPriceBRL,
  interpolateWhatsappTemplate
} from '../assets/storefront-renderer.mjs';

export const MAX_TIME_SLOTS = 24;
const TIME_SLOT_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

export const WHATSAPP_TEMPLATE_VARIABLES = Object.freeze([
  { token: '{itens}', key: 'itens', label: 'Itens', colorClass: 'var-chip-itens' },
  { token: '{total}', key: 'total', label: 'Total', colorClass: 'var-chip-total' },
  { token: '{data}', key: 'data', label: 'Data', colorClass: 'var-chip-data' },
  { token: '{horario}', key: 'horario', label: 'Horário', colorClass: 'var-chip-horario' },
  { token: '{endereco}', key: 'endereco', label: 'Endereço', colorClass: 'var-chip-endereco' },
  { token: '{nome}', key: 'nome', label: 'Nome', colorClass: 'var-chip-nome' }
]);

const VARIABLE_BY_TOKEN = new Map(
  WHATSAPP_TEMPLATE_VARIABLES.map((v) => [v.token, v])
);

export function getAvailableTemplateVariables(
  catalogType = 'products',
  orderFields = {},
  components = {}
) {
  const isBooking = catalogType === 'booking';
  const isQuote = catalogType === 'quote';
  const hasDate = isBooking || Boolean(orderFields?.date);
  const hasTime =
    isBooking || (Array.isArray(orderFields?.timeSlots) && orderFields.timeSlots.length > 0);
  const hasAddress =
    catalogType === 'products'
      ? orderFields?.deliveryOrPickup !== false
      : Boolean(orderFields?.deliveryOrPickup);
  const hasTotal = !isQuote || Boolean(components?.price);

  return WHATSAPP_TEMPLATE_VARIABLES.filter((v) => {
    if (v.key === 'itens' || v.key === 'nome') return true;
    if (v.key === 'total') return hasTotal;
    if (v.key === 'data') return hasDate;
    if (v.key === 'horario') return hasTime;
    if (v.key === 'endereco') return hasAddress;
    return true;
  });
}

export function findUnsupportedTemplateVariables(
  template = '',
  catalogType = 'products',
  orderFields = {},
  components = {}
) {
  const text = String(template ?? '');
  const availableTokens = new Set(
    getAvailableTemplateVariables(catalogType, orderFields, components).map((v) => v.token)
  );
  const unsupported = [];
  for (const v of WHATSAPP_TEMPLATE_VARIABLES) {
    if (text.includes(v.token) && !availableTokens.has(v.token)) {
      unsupported.push(v);
    }
  }
  return unsupported;
}

export function findVariableOccurrences(text = '') {
  const str = String(text ?? '');
  const pattern = /\{(itens|total|data|horario|endereco|nome)\}/g;
  const matches = [];
  let match;
  while ((match = pattern.exec(str)) !== null) {
    matches.push({
      token: match[0],
      start: match.index,
      end: match.index + match[0].length
    });
  }
  return matches;
}

export function toggleVariableInTemplate(
  template = '',
  variableToken = '{itens}',
  selectionStart = null,
  selectionEnd = null
) {
  const str = String(template ?? '');
  if (str.includes(variableToken)) {
    const escaped = variableToken.replace(/[{}]/g, '\\$&');
    const removed = str
      .replace(new RegExp(`\\s*${escaped}`, 'g'), '')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    return {
      text: removed,
      cursor: Math.min(selectionStart ?? removed.length, removed.length),
      action: 'removed'
    };
  }

  const start =
    typeof selectionStart === 'number' && selectionStart >= 0 && selectionStart <= str.length
      ? selectionStart
      : str.length;
  const end =
    typeof selectionEnd === 'number' && selectionEnd >= start && selectionEnd <= str.length
      ? selectionEnd
      : start;

  const before = str.slice(0, start);
  const after = str.slice(end);
  const nextText = `${before}${variableToken}${after}`;
  const nextCursor = start + variableToken.length;
  return {
    text: nextText,
    cursor: nextCursor,
    action: 'inserted'
  };
}

export function handleAtomicVariableKeydown(
  text = '',
  selectionStart = 0,
  selectionEnd = 0,
  key = ''
) {
  if (key !== 'Backspace' && key !== 'Delete') return null;
  const str = String(text ?? '');
  const occurrences = findVariableOccurrences(str);
  if (occurrences.length === 0) return null;

  if (selectionStart === selectionEnd) {
    const pos = selectionStart;
    for (const occ of occurrences) {
      if (key === 'Backspace' && pos > occ.start && pos <= occ.end) {
        const nextText = str.slice(0, occ.start) + str.slice(occ.end);
        return { text: nextText, cursor: occ.start };
      }
      if (key === 'Delete' && pos >= occ.start && pos < occ.end) {
        const nextText = str.slice(0, occ.start) + str.slice(occ.end);
        return { text: nextText, cursor: occ.start };
      }
    }
    return null;
  }

  let rangeStart = Math.min(selectionStart, selectionEnd);
  let rangeEnd = Math.max(selectionStart, selectionEnd);
  let expanded = false;

  for (const occ of occurrences) {
    const overlaps = occ.start < rangeEnd && occ.end > rangeStart;
    if (overlaps && (occ.start < rangeStart || occ.end > rangeEnd)) {
      rangeStart = Math.min(rangeStart, occ.start);
      rangeEnd = Math.max(rangeEnd, occ.end);
      expanded = true;
    }
  }

  if (!expanded) return null;
  const nextText = str.slice(0, rangeStart) + str.slice(rangeEnd);
  return { text: nextText, cursor: rangeStart };
}

export function buildHighlightedTemplateNodes(doc, text = '') {
  const str = String(text ?? '');
  const occurrences = findVariableOccurrences(str);
  const nodes = [];
  let cursor = 0;

  for (const occ of occurrences) {
    if (occ.start > cursor) {
      nodes.push(doc.createTextNode(str.slice(cursor, occ.start)));
    }
    const meta = VARIABLE_BY_TOKEN.get(occ.token);
    const mark = doc.createElement('mark');
    mark.className = `template-var-highlight ${meta ? meta.colorClass : ''}`.trim();
    mark.textContent = occ.token;
    nodes.push(mark);
    cursor = occ.end;
  }

  if (cursor < str.length) {
    nodes.push(doc.createTextNode(str.slice(cursor)));
  }

  if (str.endsWith('\n')) {
    nodes.push(doc.createTextNode('\u200B'));
  }

  return nodes;
}

export function buildSimulatedWhatsappPreview(draftContent = {}) {
  const catalogType = draftContent?.catalogType || 'products';
  const comp = draftContent?.components || {};
  const fields = draftContent?.orderFields || {};
  const messages = draftContent?.messages || {};
  const template =
    typeof messages.whatsappTemplate === 'string' && messages.whatsappTemplate.trim()
      ? messages.whatsappTemplate
      : 'Olá! Meu nome é {nome}. Gostaria de pedir:\n{itens}\nTotal estimado: {total}';

  const activeItems = [];
  for (const cat of draftContent?.categories || []) {
    for (const item of cat?.items || []) {
      if (item && item.active !== false && item.name && item.name.trim()) {
        activeItems.push(item);
      }
    }
  }

  const sampleItems =
    activeItems.length > 0
      ? activeItems.slice(0, 2)
      : catalogType === 'booking'
        ? [
            { name: 'Atendimento Completo', priceCents: 8000, durationMinutes: 45, priceMode: 'fixed' },
            { name: 'Avaliação Inicial', priceCents: 4000, durationMinutes: 30, priceMode: 'fixed' }
          ]
        : [
            { name: 'Item Exemplo 1', priceCents: 4500, priceMode: 'fixed' },
            { name: 'Item Exemplo 2', priceCents: 3000, priceMode: 'fixed' }
          ];

  let totalCents = 0;
  let hasOffers = false;
  const itemLines = sampleItems.map((item) => {
    const mode = catalogType === 'booking' ? 'fixed' : (item.priceMode || 'fixed');
    if (mode === 'offer') {
      hasOffers = true;
      const offerVal = item.priceCents > 0 ? item.priceCents : 8500;
      return `- ${item.name} — Lance: ${formatPriceBRL(offerVal)}`;
    }
    if (mode === 'donation') {
      return `- Doação: ${item.name}`;
    }
    if (mode === 'trade') {
      return `- Troca: ${item.name}, ofereço: ${item.tradeFor || 'livros ou plantas'}`;
    }
    const cents = Number.isInteger(item.priceCents) && item.priceCents > 0 ? item.priceCents : 0;
    totalCents += cents;
    const parts = [`- 1x ${item.name}`];
    if (comp.durationMinutes && item.durationMinutes > 0) {
      parts.push(`(${item.durationMinutes} min)`);
    }
    if (comp.price !== false && (catalogType !== 'quote' || cents > 0)) {
      parts.push(`— ${formatPriceBRL(cents)}`);
    }
    return parts.join(' ');
  });

  const sampleSlot =
    Array.isArray(fields.timeSlots) && fields.timeSlots.length > 0
      ? fields.timeSlots[0]
      : '14:00';

  const totalStr =
    comp.price !== false && (catalogType !== 'quote' || totalCents > 0)
      ? hasOffers
        ? `${formatPriceBRL(totalCents)} (sem os lances)`
        : formatPriceBRL(totalCents)
      : 'Sob orçamento';

  const message = interpolateWhatsappTemplate(template, {
    itens: itemLines.join('\n'),
    total: totalStr,
    data: '15/11/2026',
    horario: sampleSlot,
    endereco: 'Entrega: Rua das Flores, 120 - Centro',
    nome: 'Maria'
  });

  const unsupported = findUnsupportedTemplateVariables(
    template,
    catalogType,
    fields,
    comp
  );

  const rawPhone = String(draftContent?.whatsapp || '5511999999999').replace(/\D/g, '');
  const waHref = `https://wa.me/${rawPhone}?text=${encodeURIComponent(message)}`;

  return {
    message,
    unsupported,
    waHref
  };
}

export function normalizeTimeSlots(slots = []) {
  if (!Array.isArray(slots)) return [];
  const valid = [];
  const seen = new Set();
  for (const raw of slots) {
    if (typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!TIME_SLOT_REGEX.test(trimmed)) continue;
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      valid.push(trimmed);
    }
  }
  valid.sort((a, b) => a.localeCompare(b));
  return valid.slice(0, MAX_TIME_SLOTS);
}

export function addTimeSlot(slots = [], newSlot = '') {
  const trimmed = String(newSlot ?? '').trim();
  if (!TIME_SLOT_REGEX.test(trimmed)) {
    return {
      slots: normalizeTimeSlots(slots),
      added: false,
      reason: 'invalid'
    };
  }
  const current = normalizeTimeSlots(slots);
  if (current.includes(trimmed)) {
    return {
      slots: current,
      added: false,
      reason: 'duplicate'
    };
  }
  if (current.length >= MAX_TIME_SLOTS) {
    return {
      slots: current,
      added: false,
      reason: 'limit'
    };
  }
  const next = normalizeTimeSlots([...current, trimmed]);
  return {
    slots: next,
    added: true,
    reason: null
  };
}

export function removeTimeSlot(slots = [], slotToRemove = '') {
  const target = String(slotToRemove ?? '').trim();
  return normalizeTimeSlots(slots).filter((s) => s !== target);
}

function parseMinutes(hhmm) {
  const match = String(hhmm ?? '').trim().match(TIME_SLOT_REGEX);
  if (!match) return null;
  return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function formatMinutes(totalMinutes) {
  const hh = String(Math.floor(totalMinutes / 60)).padStart(2, '0');
  const mm = String(totalMinutes % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function generateTimeSlotInterval(
  startTime = '09:00',
  endTime = '17:00',
  stepMinutes = 60,
  existingSlots = []
) {
  const startMin = parseMinutes(startTime);
  const endMin = parseMinutes(endTime);
  const step = Number(stepMinutes);
  if (
    startMin === null ||
    endMin === null ||
    startMin > endMin ||
    ![30, 60, 90].includes(step)
  ) {
    return {
      slots: normalizeTimeSlots(existingSlots),
      generatedCount: 0,
      truncated: false,
      error: 'Informe um intervalo válido (hora inicial menor ou igual à final).'
    };
  }

  const generated = [];
  for (let m = startMin; m <= endMin; m += step) {
    generated.push(formatMinutes(m));
  }

  const combined = [...normalizeTimeSlots(existingSlots), ...generated];
  const uniqueSorted = [...new Set(combined)].sort((a, b) => a.localeCompare(b));
  const truncated = uniqueSorted.length > MAX_TIME_SLOTS;
  const finalSlots = uniqueSorted.slice(0, MAX_TIME_SLOTS);

  return {
    slots: finalSlots,
    generatedCount: finalSlots.length,
    truncated,
    error: null
  };
}
