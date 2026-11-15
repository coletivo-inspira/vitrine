// Campos de pré-orçamento da vitrine pública (issue #121). O mesmo módulo valida a
// configuração no servidor e monta os campos na etapa "Dados para o orçamento".
// Sem consentimento marcado nada sai do navegador além do link do WhatsApp.

export const QUOTE_LEAD_FIELDS = Object.freeze(['category', 'date', 'neighborhood']);
export const QUOTE_LEAD_LABELS = Object.freeze({
  category: 'Categoria',
  date: 'Data',
  neighborhood: 'Bairro'
});
export const QUOTE_LEAD_TEXT_MAX = 80;
export const QUOTE_LEAD_MAX_ITEMS = 30;
export const QUOTE_LEAD_MAX_QUANTITY = 999;

const INPUT_LABELS = Object.freeze({
  category: 'Categoria do pedido',
  date: 'Data do evento ou do serviço',
  neighborhood: 'Bairro'
});
const PLACEHOLDERS = Object.freeze({
  category: 'Ex.: Casamento, ensaio, reforma',
  neighborhood: 'Ex.: Cidade Baixa'
});
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function quoteLeadConsentText(businessName) {
  const name = typeof businessName === 'string' && businessName.trim() ? businessName.trim() : 'o negócio';
  return `Enviar estes dados para ${name} organizar o atendimento`;
}

/** Erros da configuração `quoteLead` do rascunho, no formato `{ field, code, message }`. */
export function validateQuoteLeadConfig(config) {
  if (config === undefined || config === null) return { errors: [] };
  const invalid = (message) => ({ errors: [{ field: 'quoteLead.fields', code: 'INVALID_QUOTE_LEAD', message }] });
  if (typeof config !== 'object' || Array.isArray(config) || Object.keys(config).some((key) => key !== 'fields')) {
    return invalid('Configuração de pré-orçamento inválida.');
  }
  const { fields } = config;
  if (!Array.isArray(fields) || fields.length > QUOTE_LEAD_FIELDS.length) {
    return invalid('Escolha até 3 campos de pré-orçamento.');
  }
  if (fields.some((field) => !QUOTE_LEAD_FIELDS.includes(field)) || new Set(fields).size !== fields.length) {
    return invalid('Campo de pré-orçamento desconhecido ou repetido.');
  }
  return { errors: [] };
}

/** Campos ligados, na ordem canônica. Lista vazia quando a configuração é inválida. */
export function quoteLeadFields(config) {
  if (validateQuoteLeadConfig(config).errors.length || !config) return [];
  return QUOTE_LEAD_FIELDS.filter((field) => config.fields.includes(field));
}

export function hasQuoteLead(menu) {
  return quoteLeadFields(menu?.quoteLead).length > 0;
}

function cleanText(value) {
  return typeof value === 'string'
    ? value.replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim()
    : '';
}

export function isValidLeadDate(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Valores do formulário já limpos; descarta os vazios e os de campos desligados. */
export function collectQuoteLeadValues(menu, values = {}) {
  const result = {};
  for (const field of quoteLeadFields(menu?.quoteLead)) {
    const value = cleanText(values[field]);
    if (!value) continue;
    if (field === 'date' ? isValidLeadDate(value) : value.length <= QUOTE_LEAD_TEXT_MAX) result[field] = value;
  }
  return result;
}

function formatDate(value) {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
}

/** Linhas acrescentadas à mensagem do WhatsApp (categoria e bairro; a data já pode vir do pedido). */
export function quoteLeadMessageLines(menu, values = {}, { skipDate = false } = {}) {
  const collected = collectQuoteLeadValues(menu, values);
  return QUOTE_LEAD_FIELDS
    .filter((field) => collected[field] && !(field === 'date' && skipDate))
    .map((field) => `${QUOTE_LEAD_LABELS[field]}: ${field === 'date' ? formatDate(collected[field]) : collected[field]}`);
}

export function createQuoteLeadState() {
  return { values: { category: '', date: '', neighborhood: '' }, consent: false };
}

/**
 * Monta o bloco "Pré-orçamento" dentro do formulário da etapa 2. Quando o pedido já
 * pergunta a data (`orderFields.date`), o campo de data reaproveita aquela resposta.
 */
export function renderQuoteLeadFields(form, renderer, doc = globalThis.document) {
  const fields = quoteLeadFields(renderer?.menu?.quoteLead);
  if (!fields.length || !form || !doc) return null;
  const state = renderer.quoteLead ?? (renderer.quoteLead = createQuoteLeadState());
  const reusesOrderDate = Boolean(renderer.getResolvedOrderFields?.().date);

  const fieldset = doc.createElement('fieldset');
  fieldset.className = 'sf-quote-lead';
  const legend = doc.createElement('legend');
  legend.className = 'sf-field-label';
  legend.textContent = 'Pré-orçamento (opcional)';
  fieldset.appendChild(legend);

  for (const field of fields) {
    if (field === 'date' && reusesOrderDate) continue;
    const id = `${renderer.idPrefix ?? 'sf'}-lead-${field}`;
    const group = doc.createElement('div');
    group.className = 'sf-field-group';
    const label = doc.createElement('label');
    label.className = 'sf-field-label';
    label.setAttribute('for', id);
    label.textContent = INPUT_LABELS[field];
    const input = doc.createElement('input');
    input.id = id;
    input.className = 'sf-input';
    input.type = field === 'date' ? 'date' : 'text';
    if (field !== 'date') {
      input.maxLength = QUOTE_LEAD_TEXT_MAX;
      input.placeholder = PLACEHOLDERS[field];
      input.autocomplete = field === 'neighborhood' ? 'address-level3' : 'off';
    }
    input.value = state.values[field] ?? '';
    input.addEventListener('input', () => {
      state.values[field] = input.value;
    });
    group.append(label, input);
    fieldset.appendChild(group);
  }

  const consentId = `${renderer.idPrefix ?? 'sf'}-lead-consent`;
  const consentLabel = doc.createElement('label');
  consentLabel.className = 'sf-quote-consent';
  consentLabel.setAttribute('for', consentId);
  const consent = doc.createElement('input');
  consent.type = 'checkbox';
  consent.id = consentId;
  consent.checked = state.consent === true;
  consent.addEventListener('change', () => {
    state.consent = consent.checked;
  });
  const consentText = doc.createElement('span');
  consentText.textContent = quoteLeadConsentText(renderer.menu?.name ?? renderer.menu?.businessName);
  consentLabel.append(consent, consentText);
  fieldset.appendChild(consentLabel);

  const note = doc.createElement('p');
  note.className = 'sf-quote-note';
  note.textContent = 'Sem marcar, nada é enviado: o pedido segue só pelo WhatsApp.';
  fieldset.appendChild(note);

  form.appendChild(fieldset);
  return fieldset;
}

/** Corpo de `POST /api/sites/:slug/leads`; `null` quando não há consentimento ou nada a enviar. */
export function buildQuoteLeadRequest(renderer) {
  const menu = renderer?.menu;
  const state = renderer?.quoteLead;
  if (!hasQuoteLead(menu) || state?.consent !== true) return null;
  const values = { ...state.values };
  if (renderer.getResolvedOrderFields?.().date && renderer.customerDetails?.date) {
    values.date = renderer.customerDetails.date;
  }
  const fields = collectQuoteLeadValues(menu, values);
  const items = [];
  for (const [id, quantity] of renderer.cart ?? []) {
    if (items.length >= QUOTE_LEAD_MAX_ITEMS) break;
    if (typeof id === 'string' && Number.isInteger(quantity) && quantity >= 1) {
      items.push({ id, quantity: Math.min(quantity, QUOTE_LEAD_MAX_QUANTITY) });
    }
  }
  if (!Object.keys(fields).length && !items.length) return null;
  return { consent: true, fields, items };
}

/** Dispara o envio sem esperar: o WhatsApp abre na mesma hora, com ou sem resposta. */
export function sendQuoteLead(renderer, fetchImpl = globalThis.fetch) {
  const body = buildQuoteLeadRequest(renderer);
  const slug = renderer?.menu?.slug;
  if (!body || typeof slug !== 'string' || !slug || typeof fetchImpl !== 'function') return false;
  try {
    const pending = fetchImpl(`/api/sites/${encodeURIComponent(slug)}/leads`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
      credentials: 'omit'
    });
    pending?.catch?.(() => {});
  } catch {
    return false;
  }
  return true;
}
