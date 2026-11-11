import { publicMenu } from './public-menu.mjs';

export const RESERVED_SLUGS = Object.freeze([
  'admin',
  'api',
  'auth',
  'app',
  'www',
  'portal',
  'assets',
  'data',
  'login',
  'logout'
]);

export const DEFAULT_TEMPLATE = 'pizzeria-v1';
export const DEFAULT_WHATSAPP = '5511999999999';
export const MAX_ACTIVE_ITEMS = 20;
export const FREE_PLAN_ACTIVE_ITEMS_LIMIT = MAX_ACTIVE_ITEMS;
export const ACTIVE_ITEMS_LIMIT = MAX_ACTIVE_ITEMS;
export const MAX_TOTAL_ITEMS = 100;
export const TOTAL_ITEMS_LIMIT = MAX_TOTAL_ITEMS;
export const MAX_DRAFT_BYTES = 262144;
export const DRAFT_MAX_BYTES = MAX_DRAFT_BYTES;

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const WHATSAPP_PATTERN = /^[1-9]\d{7,14}$/;
const DANGEROUS_SCHEME_OR_TAG_PATTERN =
  /\b(?:javascript|vbscript|data)\s*:|\bhttp:\/\/|\bhttps?:\/\/[^/\s:@]+:[^/\s@]*@|<\s*\/?\s*(?:script|iframe|object|embed|svg|img|style|link|meta)\b|\bon[a-z]+\s*=/i;
const OPTIONAL_URL_FIELDS = Object.freeze(['url', 'imageUrl', 'logoUrl', 'website', 'href']);
const utf8Encoder = new TextEncoder();

export function validateSafePublicHttpsUrl(rawUrl, errorStatus = 422) {
  if (typeof rawUrl !== 'string' || !rawUrl.trim() || rawUrl.length > 2048) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_URL',
      'Use uma URL HTTPS pública válida sem credenciais embutidas.'
    );
  }
  let parsed;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_URL',
      'Use uma URL HTTPS pública válida sem credenciais embutidas.'
    );
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_URL',
      'Use uma URL HTTPS pública válida sem credenciais embutidas.'
    );
  }
  return parsed.href;
}

export function assertNoDangerousTextPayload(value, errorStatus = 422, errorCode = 'INVALID_PAYLOAD') {
  if (typeof value === 'string' && DANGEROUS_SCHEME_OR_TAG_PATTERN.test(value)) {
    throw new PortalValidationError(
      errorStatus,
      errorCode,
      'Conteúdo rejeitado por conter protocolo inseguro, credenciais em URL ou marcação executável.'
    );
  }
}

function validateOptionalUrlFields(target, errorStatus = 422) {
  if (!target || typeof target !== 'object') return;
  for (const field of OPTIONAL_URL_FIELDS) {
    if (target[field] !== undefined && target[field] !== null) {
      validateSafePublicHttpsUrl(target[field], errorStatus);
    }
  }
}

export class PortalValidationError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.name = 'PortalValidationError';
    this.status = status;
    this.statusCode = status;
    this.code = code;
    Object.assign(this, extra);
  }

  toJSON() {
    const error = {
      code: this.code,
      message: this.message
    };
    if (typeof this.currentRevision === 'number') {
      error.currentRevision = this.currentRevision;
    }
    return { error };
  }
}

export function isValidSlug(slug) {
  return (
    typeof slug === 'string' &&
    slug.length >= 3 &&
    slug.length <= 40 &&
    SLUG_PATTERN.test(slug) &&
    !RESERVED_SLUGS.includes(slug)
  );
}

export function validateSlug(slug) {
  if (!isValidSlug(slug)) {
    throw new PortalValidationError(
      400,
      'INVALID_SLUG',
      'Identificador (slug) inválido. Use entre 3 e 40 caracteres minúsculos (a-z, 0-9 e hifens), sem nomes reservados.'
    );
  }
  return slug;
}

export function validateSiteName(name, errorStatus = 400) {
  if (typeof name !== 'string') {
    throw new PortalValidationError(errorStatus, 'INVALID_NAME', 'Informe um nome válido para a vitrine.');
  }
  const trimmed = name.trim();
  if (trimmed.length < 1 || trimmed.length > 160) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_NAME',
      'O nome da vitrine deve ter entre 1 e 160 caracteres.'
    );
  }
  assertNoDangerousTextPayload(trimmed, errorStatus, 'INVALID_NAME');
  return trimmed;
}

export function validateTemplate(template = DEFAULT_TEMPLATE, errorStatus = 400) {
  const resolved = template === undefined ? DEFAULT_TEMPLATE : template;
  if (resolved !== DEFAULT_TEMPLATE) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_TEMPLATE',
      'Modelo de vitrine inválido. Apenas pizzeria-v1 é suportado no MVP.'
    );
  }
  return resolved;
}

export function isValidWhatsapp(whatsapp) {
  return typeof whatsapp === 'string' && WHATSAPP_PATTERN.test(whatsapp.trim());
}

export function validateWhatsapp(whatsapp) {
  if (typeof whatsapp !== 'string') {
    throw new PortalValidationError(
      422,
      'INVALID_WHATSAPP',
      'Informe um número de WhatsApp internacional válido contendo apenas dígitos (DDI + DDD + número).'
    );
  }
  const trimmed = whatsapp.trim();
  if (!WHATSAPP_PATTERN.test(trimmed)) {
    throw new PortalValidationError(
      422,
      'INVALID_WHATSAPP',
      'Informe um número de WhatsApp internacional válido contendo apenas dígitos (DDI + DDD + número).'
    );
  }
  return trimmed;
}

export function isValidPriceCents(priceCents) {
  return Number.isSafeInteger(priceCents) && priceCents > 0;
}

export function validatePriceCents(priceCents) {
  if (!isValidPriceCents(priceCents)) {
    throw new PortalValidationError(
      422,
      'INVALID_PRICE_CENTS',
      'O preço em centavos (priceCents) deve ser um número inteiro positivo seguro.'
    );
  }
  return priceCents;
}

export function parseCurrencyToCents(value) {
  if (typeof value === 'number') {
    return validatePriceCents(value);
  }
  if (typeof value !== 'string') {
    throw new PortalValidationError(
      422,
      'INVALID_PRICE_CENTS',
      'Formato monetário inválido para conversão em centavos.'
    );
  }
  const cleaned = value.replace(/R\$/gi, '').trim();
  if (!cleaned || /^-/.test(cleaned)) {
    throw new PortalValidationError(
      422,
      'INVALID_PRICE_CENTS',
      'O valor monetário deve ser positivo.'
    );
  }
  const match = cleaned.match(/^(\d{1,3}(?:\.\d{3})*|\d+)(?:[,.](\d{1,2}))?$/);
  if (!match) {
    throw new PortalValidationError(
      422,
      'INVALID_PRICE_CENTS',
      'Formato monetário inválido. Use reais e centavos (ex.: 45,90).'
    );
  }
  const reais = Number(match[1].replace(/\./g, ''));
  const centavos = match[2] ? Number(match[2].padEnd(2, '0')) : 0;
  return validatePriceCents(reais * 100 + centavos);
}

export const parsePriceCents = parseCurrencyToCents;

export function formatCentsToBRL(priceCents) {
  const valid = validatePriceCents(priceCents);
  const reais = Math.floor(valid / 100);
  const centavos = String(valid % 100).padStart(2, '0');
  return `R$ ${reais.toLocaleString('pt-BR')},${centavos}`;
}

export const formatPriceCents = formatCentsToBRL;

export function validateRevision(revision) {
  if (!Number.isSafeInteger(revision) || revision < 1) {
    throw new PortalValidationError(
      400,
      'INVALID_REVISION',
      'A revisão do rascunho deve ser um número inteiro positivo maior ou igual a 1.'
    );
  }
  return revision;
}

export function validateSiteInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PortalValidationError(400, 'INVALID_PAYLOAD', 'Dados de criação da vitrine inválidos.');
  }
  validateOptionalUrlFields(payload, 400);
  const slug = validateSlug(payload.slug);
  const name = validateSiteName(payload.name, 400);
  const template = validateTemplate(payload.template, 400);
  const whatsapp =
    payload.whatsapp !== undefined ? validateWhatsapp(payload.whatsapp) : DEFAULT_WHATSAPP;
  return { name, slug, template, whatsapp };
}

export const validateCreateSitePayload = validateSiteInput;
export const validateSitePayload = validateSiteInput;

export function createInitialDraftContent({
  slug,
  name,
  businessName,
  template = DEFAULT_TEMPLATE,
  whatsapp = DEFAULT_WHATSAPP
}) {
  const validSlug = validateSlug(slug);
  const resolvedName = validateSiteName(businessName ?? name);
  const validTemplate = validateTemplate(template, 400);
  const validWhatsapp = validateWhatsapp(whatsapp);
  return {
    schemaVersion: 1,
    template: validTemplate,
    slug: validSlug,
    businessName: resolvedName,
    whatsapp: validWhatsapp,
    categories: []
  };
}

export function measureDraftBytes(content) {
  if (typeof content === 'string') {
    return utf8Encoder.encode(content).byteLength;
  }
  if (content === undefined) {
    return 0;
  }
  return utf8Encoder.encode(JSON.stringify(content)).byteLength;
}

export const getDraftByteLength = measureDraftBytes;

export function isItemActive(item) {
  if (!item || typeof item !== 'object') return false;
  return item.active !== false && item.available !== false;
}

export function extractDraftItems(content) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return [];
  }
  const collected = [];
  if (Array.isArray(content.items)) {
    collected.push(...content.items);
  }
  if (Array.isArray(content.categories)) {
    for (const category of content.categories) {
      if (category && typeof category === 'object' && Array.isArray(category.items)) {
        collected.push(...category.items);
      }
    }
  }
  return collected;
}

export function validateDraftContent(content, options = {}) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    throw new PortalValidationError(
      422,
      'INVALID_DRAFT',
      'O conteúdo do rascunho deve ser um objeto JSON válido.'
    );
  }

  const byteLength = measureDraftBytes(content);
  if (byteLength > MAX_DRAFT_BYTES) {
    throw new PortalValidationError(
      413,
      'DRAFT_TOO_LARGE',
      'O rascunho excede o tamanho máximo permitido de 256 KiB (262.144 bytes).'
    );
  }

  if (content.schemaVersion !== undefined && content.schemaVersion !== 1) {
    throw new PortalValidationError(
      422,
      'INVALID_DRAFT',
      'Versão de schema do rascunho inválida. Esperado schemaVersion: 1.'
    );
  }

  if (content.template !== undefined) {
    validateTemplate(content.template, 422);
  }

  validateOptionalUrlFields(content, 422);

  if (content.slug !== undefined) {
    if (
      typeof content.slug !== 'string' ||
      !SLUG_PATTERN.test(content.slug.trim()) ||
      RESERVED_SLUGS.includes(content.slug.trim()) ||
      content.slug.trim().length < 1 ||
      content.slug.trim().length > 63
    ) {
      throw new PortalValidationError(422, 'INVALID_SLUG', 'Slug do rascunho inválido.');
    }
  }

  const rawBusinessName = content.businessName ?? content.name;
  if (rawBusinessName !== undefined) {
    if (typeof rawBusinessName !== 'string' || !rawBusinessName.trim() || rawBusinessName.trim().length > 160) {
      throw new PortalValidationError(
        422,
        'INVALID_NAME',
        'O nome do estabelecimento no rascunho deve ter entre 1 e 160 caracteres.'
      );
    }
    assertNoDangerousTextPayload(rawBusinessName, 422, 'INVALID_NAME');
  }

  const hasCategories = content.categories !== undefined;
  const hasItems = content.items !== undefined;

  if (hasCategories && !Array.isArray(content.categories)) {
    throw new PortalValidationError(
      422,
      'INVALID_DRAFT',
      'O campo categories deve ser uma lista de categorias.'
    );
  }

  if (hasItems && !Array.isArray(content.items)) {
    throw new PortalValidationError(
      422,
      'INVALID_DRAFT',
      'O campo items deve ser uma lista de itens do cardápio.'
    );
  }

  if (Array.isArray(content.categories)) {
    for (const category of content.categories) {
      if (!category || typeof category !== 'object' || Array.isArray(category)) {
        throw new PortalValidationError(422, 'INVALID_CATEGORY', 'Categoria inválida no rascunho.');
      }
      validateOptionalUrlFields(category, 422);
      if (category.name !== undefined && (typeof category.name !== 'string' || !category.name.trim() || category.name.trim().length > 160)) {
        throw new PortalValidationError(
          422,
          'INVALID_CATEGORY',
          'O nome de cada categoria deve ter entre 1 e 160 caracteres.'
        );
      }
      if (category.name !== undefined) {
        assertNoDangerousTextPayload(category.name, 422, 'INVALID_CATEGORY');
      }
      if (category.items !== undefined && !Array.isArray(category.items)) {
        throw new PortalValidationError(
          422,
          'INVALID_CATEGORY',
          'Os itens de uma categoria devem ser representados como uma lista.'
        );
      }
    }
  }

  const allItems = extractDraftItems(content);
  const seenIds = new Set();

  for (let index = 0; index < allItems.length; index += 1) {
    const item = allItems[index];
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      throw new PortalValidationError(422, 'INVALID_ITEM', 'Item do cardápio inválido.');
    }

    validateOptionalUrlFields(item, 422);
    validatePriceCents(item.priceCents);

    if (item.name !== undefined) {
      if (typeof item.name !== 'string' || !item.name.trim() || item.name.trim().length > 160) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM',
          'O nome do item deve ter entre 1 e 160 caracteres.'
        );
      }
      assertNoDangerousTextPayload(item.name, 422, 'INVALID_ITEM');
    }

    if (item.description !== undefined && item.description !== null) {
      if (typeof item.description !== 'string' || item.description.trim().length > 280) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM_DESCRIPTION',
          'A descrição de cada item deve ter no máximo 280 caracteres.'
        );
      }
      assertNoDangerousTextPayload(item.description, 422, 'INVALID_ITEM');
    }

    if (item.id !== undefined) {
      if (typeof item.id !== 'string' || !item.id.trim() || item.id.trim().length > 64) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM',
          'O identificador do item deve ter entre 1 e 64 caracteres.'
        );
      }
      assertNoDangerousTextPayload(item.id, 422, 'INVALID_ITEM');
      const normalizedId = item.id.trim();
      if (seenIds.has(normalizedId)) {
        throw new PortalValidationError(
          422,
          'DUPLICATE_ITEM_ID',
          `Identificador de item duplicado no cardápio: ${normalizedId}.`
        );
      }
      seenIds.add(normalizedId);
    }
  }

  if (allItems.length > MAX_TOTAL_ITEMS) {
    throw new PortalValidationError(
      422,
      'TOTAL_ITEMS_LIMIT_EXCEEDED',
      `O rascunho excede o teto técnico de ${MAX_TOTAL_ITEMS} itens totais (ativos e ocultos).`
    );
  }

  const activeItems = allItems.filter(isItemActive);
  if (activeItems.length > MAX_ACTIVE_ITEMS) {
    throw new PortalValidationError(
      422,
      'ACTIVE_ITEMS_LIMIT_EXCEEDED',
      `O Plano Básico Gratuito permite até ${MAX_ACTIVE_ITEMS} itens ativos por vitrine.`
    );
  }

  const whatsappValue = content.whatsapp ?? options.defaultWhatsapp;
  validateWhatsapp(whatsappValue);

  return {
    content,
    byteLength,
    totalItems: allItems.length,
    activeItems: activeItems.length,
    items: allItems
  };
}

export const validateCatalogDraft = validateDraftContent;

export function validateDraftUpdatePayload(payload, options = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PortalValidationError(
      400,
      'INVALID_PAYLOAD',
      'Corpo da requisição de atualização de rascunho inválido.'
    );
  }

  if (payload.content !== undefined && typeof payload.content === 'object' && payload.content !== null) {
    const byteLength = measureDraftBytes(payload.content);
    if (byteLength > MAX_DRAFT_BYTES) {
      throw new PortalValidationError(
        413,
        'DRAFT_TOO_LARGE',
        'O rascunho excede o tamanho máximo permitido de 256 KiB (262.144 bytes).'
      );
    }
  }

  const revision = validateRevision(payload.revision);
  const validated = validateDraftContent(payload.content, options);
  return {
    revision,
    ...validated
  };
}

export const validateDraftPayload = validateDraftUpdatePayload;

export function toPublicMenuDraft(content, site = {}) {
  const validated = validateDraftContent(content);
  const slug = (content.slug ?? site.slug ?? '').trim();
  const name = (content.name ?? content.businessName ?? site.name ?? '').trim();
  const items = validated.items.map((item, idx) => ({
    id: typeof item.id === 'string' && item.id.trim() ? item.id.trim() : `item-${idx + 1}`,
    name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : `Item ${idx + 1}`,
    priceCents: item.priceCents,
    active: isItemActive(item)
  }));

  return {
    template: content.template ?? site.template ?? DEFAULT_TEMPLATE,
    slug,
    name,
    whatsapp: content.whatsapp.trim(),
    items
  };
}

export function projectDraftToPublicMenu(content, site = {}) {
  return publicMenu(toPublicMenuDraft(content, site));
}
