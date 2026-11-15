/**
 * Campos opcionais da página do item (detalhes, descrição longa, perguntas
 * frequentes e galeria) e o endereço público do item. Módulo puro, usado pelo
 * validador do rascunho, pela publicação, pelo painel e pela vitrine.
 */

export const ITEM_PAGE_LIMITS = Object.freeze({
  details: 6,
  detailLabel: 40,
  detailValue: 120,
  longDescription: 2000,
  faq: 6,
  faqQuestion: 160,
  faqAnswer: 300,
  gallery: 4
});

export const ITEM_PAGE_FIELD_KEYS = Object.freeze(['details', 'longDescription', 'faq', 'gallery']);

const ITEM_SLUG_MAX = 64;

function fail(code, message) {
  return { fields: null, error: { code, message } };
}

function text(value) {
  return typeof value === 'string' ? value.trim() : '';
}

/** "Rótulo: valor" (texto) ou `{ label, value }` → `{ label, value }`; `null` sem dois-pontos. */
export function parseDetailLine(entry) {
  if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
    return { label: text(entry.label), value: text(entry.value) };
  }
  const line = text(entry);
  const colon = line.indexOf(':');
  if (colon < 0) return line ? null : { label: '', value: '' };
  return { label: line.slice(0, colon).trim(), value: line.slice(colon + 1).trim() };
}

/** Linhas do campo de texto do painel → lista guardada no rascunho (sem linhas vazias). */
export function detailsFromText(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Lista do rascunho → texto do campo do painel, uma linha por detalhe. */
export function detailsToText(details) {
  if (!Array.isArray(details)) return '';
  return details
    .map((entry) => (entry && typeof entry === 'object' ? `${text(entry.label)}: ${text(entry.value)}` : text(entry)))
    .filter(Boolean)
    .join('\n');
}

/** Parágrafos da descrição longa: blocos separados por linha em branco. */
export function splitParagraphs(value) {
  return text(value)
    .split(/\r?\n\s*\r?\n/)
    .map((paragraph) => paragraph.replace(/\s*\r?\n\s*/g, ' ').trim())
    .filter(Boolean);
}

/**
 * Normaliza os campos da página do item.
 *
 * - `strict: false` (salvar rascunho): confere só tipos, quantidades e tamanhos, para
 *   que uma linha ainda incompleta não bloqueie o salvamento automático.
 * - `strict: true` (publicar): exige "Rótulo: valor" em cada detalhe e pergunta com
 *   resposta, e devolve só o que entra no artefato público.
 *
 * Devolve `{ fields, error }`; `error` traz `code` e `message` em português.
 */
export function normalizeItemPageFields(item, { strict = false } = {}) {
  const fields = {};
  const raw = item && typeof item === 'object' ? item : {};

  if (raw.details !== undefined && raw.details !== null) {
    if (!Array.isArray(raw.details)) return fail('INVALID_ITEM_DETAILS', 'Os detalhes do item devem ser uma lista de linhas.');
    const lines = raw.details.filter((entry) => (typeof entry === 'string' ? entry.trim() : entry));
    if (lines.length > ITEM_PAGE_LIMITS.details) {
      return fail('INVALID_ITEM_DETAILS', `Use no máximo ${ITEM_PAGE_LIMITS.details} linhas de detalhes por item.`);
    }
    const details = [];
    for (const entry of lines) {
      if (typeof entry !== 'string' && (typeof entry !== 'object' || Array.isArray(entry))) {
        return fail('INVALID_ITEM_DETAILS', 'Cada detalhe deve ser uma linha "Rótulo: valor".');
      }
      const parsed = parseDetailLine(entry);
      const label = parsed?.label ?? '';
      const value = parsed?.value ?? text(entry);
      if (label.length > ITEM_PAGE_LIMITS.detailLabel || value.length > ITEM_PAGE_LIMITS.detailValue) {
        return fail(
          'INVALID_ITEM_DETAILS',
          `Em cada detalhe, o rótulo tem até ${ITEM_PAGE_LIMITS.detailLabel} caracteres e o valor até ${ITEM_PAGE_LIMITS.detailValue}.`
        );
      }
      if (strict && (!parsed || !label || !value)) {
        return fail('INVALID_ITEM_DETAILS', 'Escreva cada detalhe no formato "Rótulo: valor", por exemplo "Duração: 1 hora".');
      }
      if (label && value) details.push({ label, value });
    }
    if (details.length) fields.details = details;
  }

  if (raw.longDescription !== undefined && raw.longDescription !== null) {
    if (typeof raw.longDescription !== 'string') {
      return fail('INVALID_ITEM_LONG_DESCRIPTION', 'A descrição longa do item deve ser um texto.');
    }
    const longDescription = raw.longDescription.trim().replace(/\r\n/g, '\n');
    if (longDescription.length > ITEM_PAGE_LIMITS.longDescription) {
      return fail(
        'INVALID_ITEM_LONG_DESCRIPTION',
        `A descrição longa deve ter no máximo ${ITEM_PAGE_LIMITS.longDescription.toLocaleString('pt-BR')} caracteres.`
      );
    }
    if (longDescription) fields.longDescription = longDescription;
  }

  if (raw.faq !== undefined && raw.faq !== null) {
    if (!Array.isArray(raw.faq)) return fail('INVALID_ITEM_FAQ', 'As perguntas frequentes do item devem ser uma lista.');
    if (raw.faq.length > ITEM_PAGE_LIMITS.faq) {
      return fail('INVALID_ITEM_FAQ', `Use no máximo ${ITEM_PAGE_LIMITS.faq} perguntas frequentes por item.`);
    }
    const faq = [];
    for (const entry of raw.faq) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        return fail('INVALID_ITEM_FAQ', 'Cada pergunta frequente deve ter pergunta e resposta.');
      }
      if ((entry.q !== undefined && typeof entry.q !== 'string') || (entry.a !== undefined && typeof entry.a !== 'string')) {
        return fail('INVALID_ITEM_FAQ', 'Pergunta e resposta devem ser textos.');
      }
      const q = text(entry.q);
      const a = text(entry.a);
      if (q.length > ITEM_PAGE_LIMITS.faqQuestion || a.length > ITEM_PAGE_LIMITS.faqAnswer) {
        return fail(
          'INVALID_ITEM_FAQ',
          `Cada pergunta tem até ${ITEM_PAGE_LIMITS.faqQuestion} caracteres e cada resposta até ${ITEM_PAGE_LIMITS.faqAnswer}.`
        );
      }
      if (strict && Boolean(q) !== Boolean(a)) {
        return fail('INVALID_ITEM_FAQ', 'Preencha a pergunta e a resposta de cada pergunta frequente do item.');
      }
      if (q && a) faq.push({ q, a });
    }
    if (faq.length) fields.faq = faq;
  }

  if (raw.gallery !== undefined && raw.gallery !== null) {
    if (!Array.isArray(raw.gallery) || raw.gallery.some((url) => typeof url !== 'string')) {
      return fail('INVALID_ITEM_GALLERY', 'A galeria do item deve ser uma lista de endereços de imagem.');
    }
    const gallery = raw.gallery.map((url) => url.trim()).filter(Boolean);
    if (gallery.length > ITEM_PAGE_LIMITS.gallery) {
      return fail('INVALID_ITEM_GALLERY', `A galeria aceita até ${ITEM_PAGE_LIMITS.gallery} fotos além da foto principal.`);
    }
    if (gallery.length) fields.gallery = gallery;
  }

  return { fields, error: null };
}

/** Textos digitados nos campos da página do item (para as mesmas checagens dos demais textos). */
export function itemPageTexts(fields = {}) {
  return [
    ...(fields.details ?? []).flatMap((entry) => (typeof entry === 'string' ? [entry] : [entry?.label, entry?.value])),
    fields.longDescription,
    ...(fields.faq ?? []).flatMap((entry) => [entry?.q, entry?.a])
  ].filter((value) => typeof value === 'string' && value);
}

/** O cartão mostra "Ver detalhes" só quando o item tem algum campo da página do item. */
export function hasItemPageContent(item) {
  if (!item || typeof item !== 'object') return false;
  return Boolean(
    (Array.isArray(item.details) && item.details.length) ||
      (typeof item.longDescription === 'string' && item.longDescription.trim()) ||
      (Array.isArray(item.faq) && item.faq.length) ||
      (Array.isArray(item.gallery) && item.gallery.length)
  );
}

export function slugifyItemName(name) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, ITEM_SLUG_MAX)
    .replace(/-+$/g, '');
}

/**
 * Endereço de cada item, gerado do nome: único na vitrine (repetições ganham `-2`,
 * `-3`...) e estável enquanto o nome e a ordem dos itens de mesmo nome não mudam.
 * Itens que já trazem `slug` (snapshot publicado) mantêm o seu.
 * Devolve `Map(itemId → slug)`.
 */
export function assignItemSlugs(items = []) {
  const slugs = new Map();
  const used = new Set();
  const list = Array.isArray(items) ? items.filter((item) => item && item.id !== undefined) : [];
  for (const item of list) {
    if (typeof item.slug === 'string' && item.slug) used.add(item.slug);
  }
  list.forEach((item, index) => {
    if (typeof item.slug === 'string' && item.slug) {
      slugs.set(String(item.id), item.slug);
      return;
    }
    const base = slugifyItemName(item.name) || `item-${index + 1}`;
    let slug = base;
    for (let n = 2; used.has(slug); n += 1) slug = `${base}-${n}`;
    used.add(slug);
    slugs.set(String(item.id), slug);
  });
  return slugs;
}

/** Caminho da página do item. `basePath` é `/<endereço>` ou `''` no domínio próprio. */
export function itemPagePath(basePath, itemSlug) {
  return `${basePath || ''}/item/${encodeURIComponent(itemSlug)}`;
}
