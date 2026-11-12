import { publicMenu } from './public-menu.mjs';
import { ORDER_RELAY_MODES } from '../web/assets/mila-relay.mjs';

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
  'logout',
  'como-funciona',
  'possibilidades',
  'planos',
  'orcamento'
]);

export const DEFAULT_TEMPLATE = 'pizzeria-v1';
export const ALLOWED_TEMPLATES = Object.freeze([
  'pizzeria-v1',
  'products-v1',
  'booking-v1',
  'quote-v1'
]);

export const DEFAULT_STOREFRONT_TYPE = 'food';
export const ALLOWED_STOREFRONT_TYPES = Object.freeze([
  'food',
  'art',
  'photo',
  'health',
  'tech'
]);

export const DEFAULT_CATALOG_TYPE = 'products';
export const ALLOWED_CATALOG_TYPES = Object.freeze([
  'products',
  'booking',
  'quote'
]);

export const DEFAULT_ITEM_PRICE_MODE = 'fixed';
export const ALLOWED_ITEM_PRICE_MODES = Object.freeze([
  'fixed',
  'offer',
  'donation',
  'trade'
]);

export const ALLOWED_PROFILE_INTERESTS = Object.freeze([
  'cardapio-digital',
  'agendamento',
  'orcamento-whatsapp',
  'dominio-proprio',
  'identidade-visual',
  'fotografia-conteudo',
  'automacao-atendimento',
  'design-sob-medida'
]);

export const ALLOWED_CUSTOMIZATION_STATUSES = Object.freeze([
  'novo',
  'em_analise',
  'respondido',
  'encerrado'
]);

export const ALLOWED_WHATSAPP_VARIABLES = Object.freeze([
  '{itens}',
  '{total}',
  '{data}',
  '{horario}',
  '{endereco}',
  '{nome}'
]);

export const CATALOG_IMAGES_BUCKET = 'catalog-images';
export const MAX_CATALOG_IMAGE_BYTES = 262144;

export const ALLOWED_METRIC_EVENT_TYPES = Object.freeze([
  'visit',
  'item_view',
  'item_select',
  'whatsapp_order'
]);
export const ALLOWED_INSIGHTS_PERIODS = Object.freeze(['7d', '30d', '90d']);
export const MAX_EVENTS_BATCH_SIZE = 25;
export const MAX_EVENTS_BATCH_BYTES = 16384;
export const METRICS_RETENTION_MONTHS = 13;

const BOT_USER_AGENT_PATTERN =
  /bot|crawler|spider|headless|slurp|facebookexternalhit|whatsapp|preview|curl|wget|python/i;
const ISO_DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DANGEROUS_SCHEME_OR_TAG_PATTERN =
  /\b(?:javascript|vbscript)\s*:|(?:^|[\s"'=(])data\s*:(?!\s+[\{\p{L}\p{N}])/iu;
const DANGEROUS_TAG_OR_HANDLER_PATTERN =
  /\bhttp:\/\/|\bhttps?:\/\/[^/\s:@]+:[^/\s@]*@|<\s*\/?\s*(?:script|iframe|object|embed|svg|img|style|link|meta)\b|\b(?:onabort|onafterprint|onanimationend|onanimationiteration|onanimationstart|onauxclick|onbeforeinput|onbeforeprint|onbeforeunload|onblur|oncancel|oncanplay|oncanplaythrough|onchange|onclick|onclose|oncontextmenu|oncopy|oncuechange|oncut|ondblclick|ondrag|ondragend|ondragenter|ondragleave|ondragover|ondragstart|ondrop|ondurationchange|onemptied|onended|onerror|onfocus|onfocusin|onfocusout|onformdata|onfullscreenchange|onfullscreenerror|ongotpointercapture|onhashchange|oninput|oninvalid|onkeydown|onkeypress|onkeyup|onlanguagechange|onload|onloadeddata|onloadedmetadata|onloadstart|onlostpointercapture|onmessage|onmessageerror|onmousedown|onmouseenter|onmouseleave|onmousemove|onmouseout|onmouseover|onmouseup|onoffline|ononline|onpagehide|onpageshow|onpaste|onpause|onplay|onplaying|onpointercancel|onpointerdown|onpointerenter|onpointerleave|onpointermove|onpointerout|onpointerover|onpointerrawupdate|onpointerup|onpopstate|onprogress|onratechange|onrejectionhandled|onreset|onresize|onscroll|onscrollend|onsecuritypolicyviolation|onseeked|onseeking|onselect|onselectionchange|onselectstart|onslotchange|onstalled|onstorage|onsubmit|onsuspend|ontimeupdate|ontoggle|ontouchcancel|ontouchend|ontouchmove|ontouchstart|ontransitioncancel|ontransitionend|ontransitionrun|ontransitionstart|onunhandledrejection|onunload|onvolumechange|onwaiting|onwheel)\s*=/i;
const OPTIONAL_URL_FIELDS = Object.freeze(['url', 'imageUrl', 'logoUrl', 'website', 'href']);
const ALLOWED_COMPONENT_KEYS = Object.freeze([
  'name',
  'description',
  'photo',
  'price',
  'minQuantity',
  'quantitySelector',
  'durationMinutes'
]);
const ALLOWED_ORDER_FIELD_KEYS = Object.freeze([
  'date',
  'timeSlots',
  'deliveryOrPickup',
  'customerName',
  'notes'
]);
const ALLOWED_MESSAGE_KEYS = Object.freeze([
  'heroTitle',
  'welcomeText',
  'ctaLabel',
  'whatsappTemplate'
]);

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
  if (
    typeof value === 'string' &&
    (DANGEROUS_SCHEME_OR_TAG_PATTERN.test(value) || DANGEROUS_TAG_OR_HANDLER_PATTERN.test(value))
  ) {
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
      if (field === 'imageUrl' && target[field] === '') {
        continue;
      }
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
    if (Array.isArray(this.missingFields)) {
      error.missingFields = this.missingFields;
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
  if (typeof resolved !== 'string' || !ALLOWED_TEMPLATES.includes(resolved)) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_TEMPLATE',
      `Modelo de vitrine inválido. Modelos suportados: ${ALLOWED_TEMPLATES.join(', ')}.`
    );
  }
  return resolved;
}

export function validateStorefrontType(storefrontType = DEFAULT_STOREFRONT_TYPE, errorStatus = 400) {
  const resolved = storefrontType === undefined ? DEFAULT_STOREFRONT_TYPE : storefrontType;
  if (typeof resolved !== 'string' || !ALLOWED_STOREFRONT_TYPES.includes(resolved)) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_STOREFRONT_TYPE',
      `Tipo de vitrine inválido. Áreas suportadas: ${ALLOWED_STOREFRONT_TYPES.join(', ')}.`
    );
  }
  return resolved;
}

export function validateCatalogType(catalogType = DEFAULT_CATALOG_TYPE, errorStatus = 422) {
  const resolved = catalogType === undefined ? DEFAULT_CATALOG_TYPE : catalogType;
  if (typeof resolved !== 'string' || !ALLOWED_CATALOG_TYPES.includes(resolved)) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_CATALOG_TYPE',
      `Tipo de catálogo inválido. Tipos suportados: ${ALLOWED_CATALOG_TYPES.join(', ')}.`
    );
  }
  return resolved;
}

export function resolveCatalogTypeForTemplate(template = DEFAULT_TEMPLATE, catalogType = undefined) {
  if (catalogType !== undefined) {
    return validateCatalogType(catalogType, 400);
  }
  if (template === 'booking-v1') return 'booking';
  if (template === 'quote-v1') return 'quote';
  return 'products';
}

export function resolveTemplateForCatalogType(catalogType, template = undefined) {
  if (template !== undefined) {
    return validateTemplate(template, 400);
  }
  if (catalogType === 'booking') return 'booking-v1';
  if (catalogType === 'quote') return 'quote-v1';
  if (catalogType === 'products') return 'products-v1';
  return DEFAULT_TEMPLATE;
}

export function getDefaultComponents(catalogType = DEFAULT_CATALOG_TYPE, template = DEFAULT_TEMPLATE) {
  const resolvedCatalog = ALLOWED_CATALOG_TYPES.includes(catalogType)
    ? catalogType
    : resolveCatalogTypeForTemplate(template);

  if (resolvedCatalog === 'booking') {
    return {
      name: true,
      description: true,
      photo: true,
      price: true,
      minQuantity: false,
      quantitySelector: false,
      durationMinutes: true
    };
  }

  if (resolvedCatalog === 'quote') {
    return {
      name: true,
      description: true,
      photo: true,
      price: false,
      minQuantity: false,
      quantitySelector: true,
      durationMinutes: false
    };
  }

  return {
    name: true,
    description: true,
    photo: template === 'pizzeria-v1' ? false : true,
    price: true,
    minQuantity: false,
    quantitySelector: true,
    durationMinutes: false
  };
}

export function getDefaultOrderFields(catalogType = DEFAULT_CATALOG_TYPE) {
  if (catalogType === 'booking') {
    return {
      date: true,
      timeSlots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
      deliveryOrPickup: false,
      customerName: true,
      notes: true
    };
  }

  if (catalogType === 'quote') {
    return {
      date: false,
      timeSlots: [],
      deliveryOrPickup: false,
      customerName: true,
      notes: true
    };
  }

  return {
    date: false,
    timeSlots: [],
    deliveryOrPickup: true,
    customerName: true,
    notes: true
  };
}

export function getDefaultMessages(
  catalogType = DEFAULT_CATALOG_TYPE,
  businessName = 'Vitrine',
  template = DEFAULT_TEMPLATE
) {
  const safeName = typeof businessName === 'string' && businessName.trim() ? businessName.trim() : 'Vitrine';

  if (catalogType === 'booking') {
    return {
      heroTitle: safeName,
      welcomeText:
        'Escolha o serviço desejado, selecione a data e o horário de preferência e confirme pelo WhatsApp.',
      ctaLabel: 'Confirmar agendamento no WhatsApp',
      whatsappTemplate:
        'Olá! Meu nome é {nome}. Gostaria de agendar:\n{itens}\nData: {data} às {horario}\nTotal estimado: {total}'
    };
  }

  if (catalogType === 'quote') {
    return {
      heroTitle: safeName,
      welcomeText:
        'Selecione os itens de seu interesse e envie sua solicitação de orçamento pelo WhatsApp.',
      ctaLabel: 'Solicitar orçamento no WhatsApp',
      whatsappTemplate:
        'Olá! Meu nome é {nome}. Tenho interesse em solicitar orçamento para:\n{itens}'
    };
  }

  if (template === 'pizzeria-v1') {
    return {
      heroTitle: safeName,
      welcomeText:
        'Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.',
      ctaLabel: 'Enviar pedido no WhatsApp',
      whatsappTemplate:
        'Olá! Tenho interesse nestes produtos:\n{itens}\nTotal estimado: {total}'
    };
  }

  return {
    heroTitle: safeName,
    welcomeText:
      'Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.',
    ctaLabel: 'Enviar pedido no WhatsApp',
    whatsappTemplate:
      'Olá! Meu nome é {nome}. Gostaria de pedir:\n{itens}\nTotal: {total}\nEntrega/Retirada: {endereco}'
  };
}

export function validateComponentsConfig(components, catalogType = DEFAULT_CATALOG_TYPE, template = DEFAULT_TEMPLATE) {
  if (!components || typeof components !== 'object' || Array.isArray(components)) {
    throw new PortalValidationError(
      422,
      'INVALID_COMPONENTS',
      'A configuração de componentes do item deve ser um objeto JSON válido.'
    );
  }
  for (const key of Object.keys(components)) {
    if (!ALLOWED_COMPONENT_KEYS.includes(key)) {
      throw new PortalValidationError(
        422,
        'INVALID_COMPONENTS',
        `Componente de item desconhecido: ${key}.`
      );
    }
    if (typeof components[key] !== 'boolean') {
      throw new PortalValidationError(
        422,
        'INVALID_COMPONENTS',
        `O componente ${key} deve ser booleano (true ou false).`
      );
    }
  }
  if (components.name === false) {
    throw new PortalValidationError(
      422,
      'INVALID_COMPONENTS',
      'O componente name (nome do item) é obrigatório e não pode ser desativado.'
    );
  }
  return {
    ...getDefaultComponents(catalogType, template),
    ...components
  };
}

export function validateOrderFieldsConfig(orderFields, catalogType = DEFAULT_CATALOG_TYPE) {
  if (!orderFields || typeof orderFields !== 'object' || Array.isArray(orderFields)) {
    throw new PortalValidationError(
      422,
      'INVALID_ORDER_FIELDS',
      'A configuração de campos do pedido deve ser um objeto JSON válido.'
    );
  }
  for (const key of Object.keys(orderFields)) {
    if (!ALLOWED_ORDER_FIELD_KEYS.includes(key)) {
      throw new PortalValidationError(
        422,
        'INVALID_ORDER_FIELDS',
        `Campo de pedido desconhecido: ${key}.`
      );
    }
    if (key === 'timeSlots') {
      if (!Array.isArray(orderFields.timeSlots) || orderFields.timeSlots.length > 48) {
        throw new PortalValidationError(
          422,
          'INVALID_ORDER_FIELDS',
          'A lista de horários (timeSlots) deve ser um array com até 48 horários.'
        );
      }
      for (const slot of orderFields.timeSlots) {
        if (typeof slot !== 'string' || !slot.trim() || slot.trim().length > 40) {
          throw new PortalValidationError(
            422,
            'INVALID_ORDER_FIELDS',
            'Cada horário em timeSlots deve ter entre 1 e 40 caracteres.'
          );
        }
        assertNoDangerousTextPayload(slot, 422, 'INVALID_ORDER_FIELDS');
      }
    } else if (typeof orderFields[key] !== 'boolean') {
      throw new PortalValidationError(
        422,
        'INVALID_ORDER_FIELDS',
        `O campo de pedido ${key} deve ser booleano (true ou false).`
      );
    }
  }
  const defaults = getDefaultOrderFields(catalogType);
  return {
    ...defaults,
    ...orderFields,
    timeSlots: Array.isArray(orderFields.timeSlots)
      ? orderFields.timeSlots.map((s) => s.trim())
      : defaults.timeSlots
  };
}

export function validateMessagesConfig(
  messages,
  catalogType = DEFAULT_CATALOG_TYPE,
  businessName = 'Vitrine',
  template = DEFAULT_TEMPLATE
) {
  if (!messages || typeof messages !== 'object' || Array.isArray(messages)) {
    throw new PortalValidationError(
      422,
      'INVALID_MESSAGES',
      'A configuração de textos e mensagens deve ser um objeto JSON válido.'
    );
  }
  for (const key of Object.keys(messages)) {
    if (!ALLOWED_MESSAGE_KEYS.includes(key)) {
      throw new PortalValidationError(
        422,
        'INVALID_MESSAGES',
        `Campo de mensagem desconhecido: ${key}.`
      );
    }
    const val = messages[key];
    if (typeof val !== 'string') {
      throw new PortalValidationError(
        422,
        'INVALID_MESSAGES',
        `O campo ${key} deve ser um texto válido.`
      );
    }
    assertNoDangerousTextPayload(val, 422, 'INVALID_MESSAGES');
  }

  if (messages.heroTitle !== undefined && messages.heroTitle.trim().length > 160) {
    throw new PortalValidationError(
      422,
      'INVALID_MESSAGES',
      'O título (heroTitle) deve ter no máximo 160 caracteres.'
    );
  }
  if (messages.welcomeText !== undefined && messages.welcomeText.trim().length > 500) {
    throw new PortalValidationError(
      422,
      'INVALID_MESSAGES',
      'O texto de boas-vindas (welcomeText) deve ter no máximo 500 caracteres.'
    );
  }
  if (messages.ctaLabel !== undefined && messages.ctaLabel.trim().length > 80) {
    throw new PortalValidationError(
      422,
      'INVALID_MESSAGES',
      'O texto do botão (ctaLabel) deve ter no máximo 80 caracteres.'
    );
  }
  if (messages.whatsappTemplate !== undefined) {
    const tpl = messages.whatsappTemplate.trim();
    if (!tpl || tpl.length > 1000) {
      throw new PortalValidationError(
        422,
        'INVALID_MESSAGES',
        'O modelo de mensagem do WhatsApp (whatsappTemplate) deve ter entre 1 e 1000 caracteres.'
      );
    }
    const placeholders = tpl.match(/\{[^{}]+\}/g) ?? [];
    for (const token of placeholders) {
      if (!ALLOWED_WHATSAPP_VARIABLES.includes(token)) {
        throw new PortalValidationError(
          422,
          'INVALID_MESSAGES',
          `Variável não suportada na mensagem do WhatsApp: ${token}. Variáveis permitidas: ${ALLOWED_WHATSAPP_VARIABLES.join(', ')}.`
        );
      }
    }
  }

  const defaults = getDefaultMessages(catalogType, businessName, template);
  return {
    heroTitle:
      typeof messages.heroTitle === 'string' && messages.heroTitle.trim()
        ? messages.heroTitle.trim()
        : defaults.heroTitle,
    welcomeText:
      typeof messages.welcomeText === 'string' && messages.welcomeText.trim()
        ? messages.welcomeText.trim()
        : defaults.welcomeText,
    ctaLabel:
      typeof messages.ctaLabel === 'string' && messages.ctaLabel.trim()
        ? messages.ctaLabel.trim()
        : defaults.ctaLabel,
    whatsappTemplate:
      typeof messages.whatsappTemplate === 'string' && messages.whatsappTemplate.trim()
        ? messages.whatsappTemplate.trim()
        : defaults.whatsappTemplate
  };
}

export function migrateLegacyDraftContent(content, site = {}) {
  if (!content || typeof content !== 'object' || Array.isArray(content)) {
    return content;
  }

  const cloned = structuredClone(content);
  const resolvedTemplate =
    typeof cloned.template === 'string' && ALLOWED_TEMPLATES.includes(cloned.template)
      ? cloned.template
      : typeof site?.template === 'string' && ALLOWED_TEMPLATES.includes(site.template)
        ? site.template
        : DEFAULT_TEMPLATE;

  const rawStorefrontType =
    cloned.storefrontType ?? site?.storefrontType ?? site?.storefront_type ?? DEFAULT_STOREFRONT_TYPE;
  const resolvedStorefrontType = ALLOWED_STOREFRONT_TYPES.includes(rawStorefrontType)
    ? rawStorefrontType
    : DEFAULT_STOREFRONT_TYPE;

  const rawCatalogType = cloned.catalogType;
  const resolvedCatalogType = ALLOWED_CATALOG_TYPES.includes(rawCatalogType)
    ? rawCatalogType
    : resolveCatalogTypeForTemplate(resolvedTemplate);

  const resolvedBusinessName =
    (typeof cloned.businessName === 'string' && cloned.businessName.trim()) ||
    (typeof cloned.name === 'string' && cloned.name.trim()) ||
    (typeof site?.name === 'string' && site.name.trim()) ||
    'Vitrine';

  const defaultComponents = getDefaultComponents(resolvedCatalogType, resolvedTemplate);
  const components =
    cloned.components && typeof cloned.components === 'object' && !Array.isArray(cloned.components)
      ? { ...defaultComponents, ...cloned.components }
      : defaultComponents;

  const defaultOrderFields = getDefaultOrderFields(resolvedCatalogType);
  const orderFields =
    cloned.orderFields && typeof cloned.orderFields === 'object' && !Array.isArray(cloned.orderFields)
      ? {
          ...defaultOrderFields,
          ...cloned.orderFields,
          timeSlots: Array.isArray(cloned.orderFields.timeSlots)
            ? [...cloned.orderFields.timeSlots]
            : defaultOrderFields.timeSlots
        }
      : defaultOrderFields;

  const defaultMessages = getDefaultMessages(resolvedCatalogType, resolvedBusinessName, resolvedTemplate);
  const messages =
    cloned.messages && typeof cloned.messages === 'object' && !Array.isArray(cloned.messages)
      ? { ...defaultMessages, ...cloned.messages }
      : defaultMessages;

  return {
    schemaVersion: cloned.schemaVersion ?? 1,
    ...cloned,
    template: resolvedTemplate,
    storefrontType: resolvedStorefrontType,
    catalogType: resolvedCatalogType,
    ...(cloned.slug ?? site?.slug ? { slug: cloned.slug ?? site.slug } : {}),
    ...(cloned.businessName ?? cloned.name ?? site?.name
      ? { businessName: resolvedBusinessName }
      : {}),
    components,
    orderFields,
    messages
  };
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

export function validatePriceCents(priceCents, { allowZero = false } = {}) {
  if (allowZero && (priceCents === 0 || priceCents === null || priceCents === undefined)) {
    return 0;
  }
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

export const REQUIRED_PROFILE_FIELDS = Object.freeze([
  'displayName',
  'businessName',
  'city',
  'whatsapp'
]);

export function getMissingRequiredProfileFields(profile = {}) {
  if (!profile || typeof profile !== 'object') {
    return [...REQUIRED_PROFILE_FIELDS];
  }
  const missing = [];
  const displayName =
    typeof profile.displayName === 'string'
      ? profile.displayName.trim()
      : typeof profile.display_name === 'string'
        ? profile.display_name.trim()
        : '';
  const businessName =
    typeof profile.businessName === 'string'
      ? profile.businessName.trim()
      : typeof profile.business_name === 'string'
        ? profile.business_name.trim()
        : '';
  const city = typeof profile.city === 'string' ? profile.city.trim() : '';
  const whatsapp = typeof profile.whatsapp === 'string' ? profile.whatsapp.trim() : '';

  if (!displayName) missing.push('displayName');
  if (!businessName) missing.push('businessName');
  if (!city) missing.push('city');
  if (!isValidWhatsapp(whatsapp)) missing.push('whatsapp');
  return missing;
}

export function isProfileComplete(profile = {}) {
  return getMissingRequiredProfileFields(profile).length === 0;
}

export function assertProfileComplete(profile = {}) {
  const missingFields = getMissingRequiredProfileFields(profile);
  if (missingFields.length > 0) {
    throw new PortalValidationError(
      409,
      'PROFILE_INCOMPLETE',
      'Complete seu perfil (nome, nome do negócio, cidade e WhatsApp) antes de criar uma vitrine.',
      { missingFields }
    );
  }
  return true;
}

export function computeProfileCompleteness(profile = {}) {
  const missingFields = [];
  if (typeof profile.displayName !== 'string' || !profile.displayName.trim()) {
    missingFields.push('displayName');
  }
  if (typeof profile.businessName !== 'string' || !profile.businessName.trim()) {
    missingFields.push('businessName');
  }
  if (typeof profile.city !== 'string' || !profile.city.trim()) {
    missingFields.push('city');
  }
  if (typeof profile.whatsapp !== 'string' || !profile.whatsapp.trim()) {
    missingFields.push('whatsapp');
  }
  if (!Array.isArray(profile.interests) || profile.interests.length === 0) {
    missingFields.push('interests');
  }
  const completedCount = 5 - missingFields.length;
  return {
    percent: Math.round((completedCount / 5) * 100),
    missingFields
  };
}

export function normalizeProfileInterestEntry(entry) {
  if (typeof entry !== 'string') {
    throw new PortalValidationError(
      422,
      'INVALID_INTERESTS',
      `Interesse inválido: ${String(entry)}.`
    );
  }
  const trimmed = entry.trim();
  if (ALLOWED_PROFILE_INTERESTS.includes(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith('outro:')) {
    const rawCustom = trimmed.slice('outro:'.length);
    assertNoDangerousTextPayload(rawCustom, 422, 'INVALID_INTERESTS');
    const cleaned = rawCustom
      .replace(/[\u0000-\u001F\u007F]+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (/[<>]/.test(cleaned) || cleaned.length < 2 || cleaned.length > 40) {
      throw new PortalValidationError(
        422,
        'INVALID_INTERESTS',
        'A área de interesse personalizada deve ter entre 2 e 40 caracteres e não conter HTML.'
      );
    }
    assertNoDangerousTextPayload(cleaned, 422, 'INVALID_INTERESTS');
    return `outro:${cleaned}`;
  }
  throw new PortalValidationError(
    422,
    'INVALID_INTERESTS',
    `Interesse inválido: ${String(entry)}.`
  );
}

export function formatProfileRecord(userId, raw = {}, interests = []) {
  const displayName = typeof raw.displayName === 'string'
    ? raw.displayName.trim()
    : typeof raw.display_name === 'string'
      ? raw.display_name.trim()
      : '';
  const businessName = typeof raw.businessName === 'string'
    ? raw.businessName.trim()
    : typeof raw.business_name === 'string'
      ? raw.business_name.trim()
      : '';
  const city = typeof raw.city === 'string' ? raw.city.trim() : '';
  const whatsapp = typeof raw.whatsapp === 'string' ? raw.whatsapp.trim() : '';
  const normalizedInterests = [];
  if (Array.isArray(interests)) {
    const seen = new Set();
    for (const item of interests) {
      try {
        const normalized = normalizeProfileInterestEntry(item);
        if (!seen.has(normalized)) {
          seen.add(normalized);
          normalizedInterests.push(normalized);
        }
      } catch {
        // Ignore invalid stored entries when formatting record
      }
    }
  }
  const updatedAt = raw.updatedAt ?? raw.updated_at ?? raw.createdAt ?? raw.created_at ?? null;

  return {
    userId,
    displayName,
    businessName,
    city,
    whatsapp,
    interests: normalizedInterests,
    completeness: computeProfileCompleteness({
      displayName,
      businessName,
      city,
      whatsapp,
      interests: normalizedInterests
    }),
    updatedAt
  };
}

export function validateProfileInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PortalValidationError(400, 'INVALID_PAYLOAD', 'Dados de perfil inválidos.');
  }

  const validateTextField = (val, maxLen, fieldLabel) => {
    if (val === undefined || val === null) return '';
    if (typeof val !== 'string') {
      throw new PortalValidationError(422, 'INVALID_PROFILE', `O campo ${fieldLabel} deve ser um texto válido.`);
    }
    const trimmed = val.trim();
    if (trimmed.length > maxLen) {
      throw new PortalValidationError(
        422,
        'INVALID_PROFILE',
        `O campo ${fieldLabel} deve ter no máximo ${maxLen} caracteres.`
      );
    }
    assertNoDangerousTextPayload(trimmed, 422, 'INVALID_PROFILE');
    return trimmed;
  };

  const displayName = validateTextField(payload.displayName, 120, 'nome de exibição');
  const businessName = validateTextField(payload.businessName, 160, 'nome do negócio');
  const city = validateTextField(payload.city, 120, 'cidade');

  let whatsapp = '';
  if (payload.whatsapp !== undefined && payload.whatsapp !== null) {
    if (typeof payload.whatsapp !== 'string') {
      throw new PortalValidationError(
        422,
        'INVALID_WHATSAPP',
        'Informe um número de WhatsApp internacional válido contendo apenas dígitos.'
      );
    }
    const trimmedWa = payload.whatsapp.trim();
    if (trimmedWa !== '') {
      whatsapp = validateWhatsapp(trimmedWa);
    }
  }

  let interests = [];
  if (payload.interests !== undefined && payload.interests !== null) {
    if (!Array.isArray(payload.interests) || payload.interests.length > 8) {
      throw new PortalValidationError(
        422,
        'INVALID_INTERESTS',
        'A lista de interesses deve conter até 8 opções válidas.'
      );
    }
    const seen = new Set();
    for (const entry of payload.interests) {
      const normalized = normalizeProfileInterestEntry(entry);
      seen.add(normalized);
    }
    interests = [...seen];
  }

  return {
    displayName,
    businessName,
    city,
    whatsapp,
    interests
  };
}

export function validateCustomizationRequestInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PortalValidationError(
      400,
      'INVALID_PAYLOAD',
      'Dados do pedido de customização inválidos.'
    );
  }

  let siteId = null;
  if (payload.siteId !== undefined && payload.siteId !== null && payload.siteId !== '') {
    if (typeof payload.siteId !== 'string' || !UUID_PATTERN.test(payload.siteId.trim())) {
      throw new PortalValidationError(
        422,
        'INVALID_SITE_ID',
        'O identificador da vitrine associada (siteId) deve ser um UUID válido.'
      );
    }
    siteId = payload.siteId.trim();
  }

  const storefrontType = validateStorefrontType(payload.storefrontType ?? null, 422);

  if (typeof payload.templateInterest !== 'string') {
    throw new PortalValidationError(
      422,
      'INVALID_TEMPLATE_INTEREST',
      'Informe o modelo de interesse (entre 1 e 120 caracteres).'
    );
  }
  const templateInterest = payload.templateInterest.trim();
  if (templateInterest.length < 1 || templateInterest.length > 120) {
    throw new PortalValidationError(
      422,
      'INVALID_TEMPLATE_INTEREST',
      'O modelo de interesse deve ter entre 1 e 120 caracteres.'
    );
  }
  assertNoDangerousTextPayload(templateInterest, 422, 'INVALID_TEMPLATE_INTEREST');

  if (typeof payload.goal !== 'string') {
    throw new PortalValidationError(
      422,
      'INVALID_GOAL',
      'Descreva o objetivo da customização (entre 10 e 2000 caracteres).'
    );
  }
  const goal = payload.goal.trim();
  if (goal.length < 10 || goal.length > 2000) {
    throw new PortalValidationError(
      422,
      'INVALID_GOAL',
      'O objetivo da customização deve ter entre 10 e 2000 caracteres.'
    );
  }
  assertNoDangerousTextPayload(goal, 422, 'INVALID_GOAL');

  const referenceUrls = [];
  if (payload.referenceUrls !== undefined && payload.referenceUrls !== null) {
    if (!Array.isArray(payload.referenceUrls) || payload.referenceUrls.length > 10) {
      throw new PortalValidationError(
        422,
        'INVALID_URL',
        'Informe no máximo 10 links HTTPS públicos de referência.'
      );
    }
    for (const rawUrl of payload.referenceUrls) {
      referenceUrls.push(validateSafePublicHttpsUrl(rawUrl, 422));
    }
  }

  let desiredDeadline = '';
  if (payload.desiredDeadline !== undefined && payload.desiredDeadline !== null) {
    if (typeof payload.desiredDeadline !== 'string' || payload.desiredDeadline.trim().length > 120) {
      throw new PortalValidationError(
        422,
        'INVALID_DEADLINE',
        'O prazo desejado deve ter no máximo 120 caracteres.'
      );
    }
    desiredDeadline = payload.desiredDeadline.trim();
    assertNoDangerousTextPayload(desiredDeadline, 422, 'INVALID_DEADLINE');
  }

  return {
    siteId,
    storefrontType,
    templateInterest,
    goal,
    referenceUrls,
    desiredDeadline
  };
}

export function buildCustomizationWhatsappUrl(requestRecord, teamWhatsapp = DEFAULT_WHATSAPP) {
  const validPhone = validateWhatsapp(teamWhatsapp);
  const lines = [
    'Olá! Enviei um pedido de customização pelo Portal Vitrine Inspira:',
    `Área: ${requestRecord.storefrontType}`,
    `Modelo de interesse: ${requestRecord.templateInterest}`,
    `Objetivo: ${requestRecord.goal}`
  ];
  if (requestRecord.desiredDeadline) {
    lines.push(`Prazo desejado: ${requestRecord.desiredDeadline}`);
  }
  if (Array.isArray(requestRecord.referenceUrls) && requestRecord.referenceUrls.length > 0) {
    lines.push(`Referências: ${requestRecord.referenceUrls.join(', ')}`);
  }
  return `https://wa.me/${validPhone}?text=${encodeURIComponent(lines.join('\n'))}`;
}

export function validateCatalogImagePath(objectPath, expectedSiteId = null) {
  if (typeof objectPath !== 'string' || !objectPath.trim() || objectPath.includes('..')) {
    throw new PortalValidationError(
      422,
      'INVALID_IMAGE_PATH',
      'Caminho de imagem inválido para o bucket catalog-images.'
    );
  }
  const trimmed = objectPath.trim().replace(/^\/+/, '');
  const match = trimmed.match(
    /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/([a-z0-9][a-z0-9._-]*\.webp)$/i
  );
  if (!match) {
    throw new PortalValidationError(
      422,
      'INVALID_IMAGE_PATH',
      'Use o formato <site_id>/<item_id>.webp em WebP.'
    );
  }
  if (expectedSiteId && match[1].toLowerCase() !== String(expectedSiteId).toLowerCase()) {
    throw new PortalValidationError(
      403,
      'FORBIDDEN_IMAGE_PATH',
      'O caminho da imagem não pertence à vitrine selecionada.'
    );
  }
  return trimmed;
}

export function validateSiteInput(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PortalValidationError(400, 'INVALID_PAYLOAD', 'Dados de criação da vitrine inválidos.');
  }
  validateOptionalUrlFields(payload, 400);
  const slug = validateSlug(payload.slug);
  const name = validateSiteName(payload.name, 400);
  const storefrontType = validateStorefrontType(payload.storefrontType, 400);
  const template = resolveTemplateForCatalogType(payload.catalogType, payload.template);
  const catalogType = resolveCatalogTypeForTemplate(template, payload.catalogType);
  const whatsapp =
    payload.whatsapp !== undefined ? validateWhatsapp(payload.whatsapp) : DEFAULT_WHATSAPP;
  return { name, slug, storefrontType, template, catalogType, whatsapp };
}

export const validateCreateSitePayload = validateSiteInput;
export const validateSitePayload = validateSiteInput;

export function createInitialDraftContent({
  slug,
  name,
  businessName,
  storefrontType = DEFAULT_STOREFRONT_TYPE,
  template = DEFAULT_TEMPLATE,
  catalogType,
  whatsapp = DEFAULT_WHATSAPP
}) {
  const validSlug = validateSlug(slug);
  const resolvedName = validateSiteName(businessName ?? name);
  const validStorefrontType = validateStorefrontType(storefrontType, 400);
  const validTemplate = resolveTemplateForCatalogType(catalogType, template);
  const validCatalogType = resolveCatalogTypeForTemplate(validTemplate, catalogType);
  const validWhatsapp = validateWhatsapp(whatsapp);
  return {
    schemaVersion: 1,
    template: validTemplate,
    storefrontType: validStorefrontType,
    catalogType: validCatalogType,
    slug: validSlug,
    businessName: resolvedName,
    whatsapp: validWhatsapp,
    components: getDefaultComponents(validCatalogType, validTemplate),
    orderFields: getDefaultOrderFields(validCatalogType),
    messages: getDefaultMessages(validCatalogType, resolvedName, validTemplate),
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

  const effectiveTemplate =
    content.template !== undefined ? validateTemplate(content.template, 422) : DEFAULT_TEMPLATE;

  if (content.storefrontType !== undefined) {
    validateStorefrontType(content.storefrontType, 422);
  }

  const effectiveCatalogType =
    content.catalogType !== undefined
      ? validateCatalogType(content.catalogType, 422)
      : resolveCatalogTypeForTemplate(effectiveTemplate);

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

  let validatedComponents = null;
  if (content.components !== undefined) {
    validatedComponents = validateComponentsConfig(
      content.components,
      effectiveCatalogType,
      effectiveTemplate
    );
  }

  if (content.orderFields !== undefined) {
    validateOrderFieldsConfig(content.orderFields, effectiveCatalogType);
  }

  if (content.messages !== undefined) {
    validateMessagesConfig(
      content.messages,
      effectiveCatalogType,
      rawBusinessName ?? 'Vitrine',
      effectiveTemplate
    );
  }

  const allowZeroPrice =
    effectiveCatalogType === 'quote' || validatedComponents?.price === false;

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
      throw new PortalValidationError(422, 'INVALID_ITEM', 'Item da vitrine inválido.');
    }

    let itemPriceMode = DEFAULT_ITEM_PRICE_MODE;
    if (item.priceMode !== undefined && item.priceMode !== null) {
      if (typeof item.priceMode !== 'string' || !ALLOWED_ITEM_PRICE_MODES.includes(item.priceMode.trim())) {
        throw new PortalValidationError(
          422,
          'INVALID_PRICE_MODE',
          `Modo de preço do item inválido. Modos suportados: ${ALLOWED_ITEM_PRICE_MODES.join(', ')}.`
        );
      }
      itemPriceMode = item.priceMode.trim();
    }

    validateOptionalUrlFields(item, 422);
    validatePriceCents(item.priceCents, {
      allowZero: allowZeroPrice || itemPriceMode !== 'fixed'
    });

    if (item.conditions !== undefined && item.conditions !== null) {
      if (typeof item.conditions !== 'string' || item.conditions.trim().length > 240) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM_CONDITIONS',
          'As condições do item devem ter no máximo 240 caracteres.'
        );
      }
      assertNoDangerousTextPayload(item.conditions, 422, 'INVALID_ITEM');
    }

    if (item.tradeFor !== undefined && item.tradeFor !== null) {
      if (typeof item.tradeFor !== 'string' || item.tradeFor.trim().length > 240) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM_TRADE_FOR',
          'O campo "Aceito em troca" deve ter no máximo 240 caracteres.'
        );
      }
      assertNoDangerousTextPayload(item.tradeFor, 422, 'INVALID_ITEM');
    }

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

    if (item.section !== undefined && item.section !== null) {
      if (typeof item.section !== 'string' || item.section.trim().length > 160) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM',
          'A seção do item (section) deve ter no máximo 160 caracteres.'
        );
      }
      assertNoDangerousTextPayload(item.section, 422, 'INVALID_ITEM');
    }

    if (item.minQuantity !== undefined && item.minQuantity !== null) {
      if (!Number.isSafeInteger(item.minQuantity) || item.minQuantity < 1 || item.minQuantity > 99) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM',
          'A quantidade mínima (minQuantity) deve ser um número inteiro entre 1 e 99.'
        );
      }
    }

    if (item.durationMinutes !== undefined && item.durationMinutes !== null) {
      if (
        !Number.isSafeInteger(item.durationMinutes) ||
        item.durationMinutes < 5 ||
        item.durationMinutes > 480
      ) {
        throw new PortalValidationError(
          422,
          'INVALID_ITEM',
          'A duração em minutos (durationMinutes) deve ser um número inteiro entre 5 e 480.'
        );
      }
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

  if (
    content.orderRelay !== undefined &&
    content.orderRelay !== null &&
    !ORDER_RELAY_MODES.includes(content.orderRelay)
  ) {
    throw new PortalValidationError(
      422,
      'INVALID_ORDER_RELAY',
      'Forma de receber pedidos inválida. Use "direct" (seu WhatsApp) ou "mila" (pela Mila).'
    );
  }

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
    priceCents: Number.isSafeInteger(item.priceCents) && item.priceCents >= 0 ? item.priceCents : 0,
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

export function isBotUserAgent(userAgent) {
  if (typeof userAgent !== 'string' || !userAgent.trim()) {
    return false;
  }
  return BOT_USER_AGENT_PATTERN.test(userAgent);
}

export function validateInsightsPeriod(rawPeriod = '7d', errorStatus = 400) {
  const normalized =
    rawPeriod === undefined || rawPeriod === null || rawPeriod === ''
      ? '7d'
      : String(rawPeriod).trim().toLowerCase();
  if (!ALLOWED_INSIGHTS_PERIODS.includes(normalized)) {
    throw new PortalValidationError(
      errorStatus,
      'INVALID_PERIOD',
      `Período inválido. Períodos suportados: ${ALLOWED_INSIGHTS_PERIODS.join(', ')}.`
    );
  }
  return normalized;
}

export function validateEventsBatchPayload(payload, { rawByteLength = 0, now = new Date() } = {}) {
  if (rawByteLength > MAX_EVENTS_BATCH_BYTES) {
    throw new PortalValidationError(
      400,
      'INVALID_EVENTS_BATCH',
      'O lote de eventos excede o limite máximo de 16 KiB.'
    );
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new PortalValidationError(
      400,
      'INVALID_EVENTS_BATCH',
      'O corpo da requisição de eventos deve ser um objeto JSON válido.'
    );
  }
  if (typeof payload.slug !== 'string') {
    throw new PortalValidationError(
      400,
      'INVALID_EVENTS_BATCH',
      'Informe o identificador (slug) da vitrine publicada.'
    );
  }
  const slug = validateSlug(payload.slug.trim().toLowerCase());

  if (
    !Array.isArray(payload.events) ||
    payload.events.length < 1 ||
    payload.events.length > MAX_EVENTS_BATCH_SIZE
  ) {
    throw new PortalValidationError(
      400,
      'INVALID_EVENTS_BATCH',
      `O lote deve conter entre 1 e ${MAX_EVENTS_BATCH_SIZE} eventos.`
    );
  }

  const nowDateObj = now instanceof Date ? now : new Date(now);
  const defaultDateStr = nowDateObj.toISOString().slice(0, 10);
  const defaultHour = nowDateObj.getUTCHours();

  const normalizedEvents = [];

  for (const rawEvent of payload.events) {
    if (!rawEvent || typeof rawEvent !== 'object' || Array.isArray(rawEvent)) {
      throw new PortalValidationError(
        400,
        'INVALID_EVENTS_BATCH',
        'Cada evento do lote deve ser um objeto JSON válido.'
      );
    }

    const type = typeof rawEvent.type === 'string' ? rawEvent.type.trim() : '';
    if (!ALLOWED_METRIC_EVENT_TYPES.includes(type)) {
      throw new PortalValidationError(
        400,
        'INVALID_EVENTS_BATCH',
        `Tipo de evento inválido: ${String(rawEvent.type)}.`
      );
    }

    let hour = defaultHour;
    if (rawEvent.hour !== undefined && rawEvent.hour !== null) {
      if (!Number.isSafeInteger(rawEvent.hour) || rawEvent.hour < 0 || rawEvent.hour > 23) {
        throw new PortalValidationError(
          400,
          'INVALID_EVENTS_BATCH',
          'O campo hour do evento deve ser um número inteiro entre 0 e 23.'
        );
      }
      hour = rawEvent.hour;
    }

    let dateStr = defaultDateStr;
    if (rawEvent.date !== undefined && rawEvent.date !== null) {
      if (typeof rawEvent.date !== 'string' || !ISO_DATE_ONLY_PATTERN.test(rawEvent.date.trim())) {
        throw new PortalValidationError(
          400,
          'INVALID_EVENTS_BATCH',
          'O campo date do evento deve estar no formato YYYY-MM-DD.'
        );
      }
      dateStr = rawEvent.date.trim();
    }

    let count = 1;
    if (rawEvent.count !== undefined && rawEvent.count !== null) {
      if (!Number.isSafeInteger(rawEvent.count) || rawEvent.count < 1 || rawEvent.count > 99) {
        throw new PortalValidationError(
          400,
          'INVALID_EVENTS_BATCH',
          'O campo count do evento deve ser um número inteiro entre 1 e 99.'
        );
      }
      count = rawEvent.count;
    }

    let itemId = '';
    if (type === 'item_view' || type === 'item_select') {
      if (typeof rawEvent.itemId !== 'string' || !rawEvent.itemId.trim() || rawEvent.itemId.trim().length > 64) {
        throw new PortalValidationError(
          422,
          'INVALID_EVENT_ITEM',
          'Informe um itemId válido para eventos de visualização ou seleção de item.'
        );
      }
      assertNoDangerousTextPayload(rawEvent.itemId, 422, 'INVALID_EVENT_ITEM');
      itemId = rawEvent.itemId.trim();
    }

    let estimatedCents = 0;
    if (type === 'whatsapp_order' && rawEvent.estimatedCents !== undefined && rawEvent.estimatedCents !== null) {
      if (
        !Number.isSafeInteger(rawEvent.estimatedCents) ||
        rawEvent.estimatedCents < 0 ||
        rawEvent.estimatedCents > 100000000
      ) {
        throw new PortalValidationError(
          400,
          'INVALID_EVENTS_BATCH',
          'O valor estimado (estimatedCents) deve ser um número inteiro não-negativo.'
        );
      }
      estimatedCents = rawEvent.estimatedCents;
    }

    normalizedEvents.push({
      type,
      itemId,
      hour,
      date: dateStr,
      count,
      estimatedCents
    });
  }

  return {
    slug,
    events: normalizedEvents
  };
}

function addUtcDays(isoDateStr, deltaDays) {
  const [y, m, d] = isoDateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + deltaDays));
  return dt.toISOString().slice(0, 10);
}

function buildCatalogLookup(catalogSource = {}) {
  const itemMetaById = new Map();
  const categoryNameById = new Map();

  const categories = Array.isArray(catalogSource?.categories) ? catalogSource.categories : [];
  for (let cIdx = 0; cIdx < categories.length; cIdx += 1) {
    const cat = categories[cIdx];
    if (!cat || typeof cat !== 'object') continue;
    const catId =
      typeof cat.id === 'string' && cat.id.trim()
        ? cat.id.trim()
        : `categoria-${cIdx + 1}`;
    const catName =
      typeof cat.name === 'string' && cat.name.trim()
        ? cat.name.trim()
        : `Categoria ${cIdx + 1}`;
    categoryNameById.set(catId, catName);

    if (Array.isArray(cat.items)) {
      for (const item of cat.items) {
        if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
          continue;
        }
        const itemId = item.id.trim();
        itemMetaById.set(itemId, {
          itemId,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : itemId,
          categoryId: catId,
          categoryName: catName
        });
      }
    }
  }

  if (Array.isArray(catalogSource?.items)) {
    for (const item of catalogSource.items) {
      if (!item || typeof item !== 'object' || typeof item.id !== 'string' || !item.id.trim()) {
        continue;
      }
      const itemId = item.id.trim();
      if (!itemMetaById.has(itemId)) {
        const secName =
          typeof item.section === 'string' && item.section.trim()
            ? item.section.trim()
            : 'Cardápio';
        const secId =
          secName === 'Cardápio'
            ? 'cardapio'
            : secName
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'cardapio';
        itemMetaById.set(itemId, {
          itemId,
          name: typeof item.name === 'string' && item.name.trim() ? item.name.trim() : itemId,
          categoryId: secId,
          categoryName: secName
        });
      }
    }
  }

  return { itemMetaById, categoryNameById };
}

export function computeStorefrontInsights({
  siteId,
  period = '7d',
  rows = [],
  catalogSource = {},
  referenceDate = new Date()
} = {}) {
  const validPeriod = validateInsightsPeriod(period);
  const daysCount = validPeriod === '90d' ? 90 : validPeriod === '30d' ? 30 : 7;
  const periodLabel =
    validPeriod === '90d'
      ? 'nestes 90 dias'
      : validPeriod === '30d'
        ? 'nestes 30 dias'
        : 'nesta semana';
  const previousLabel =
    validPeriod === '90d'
      ? 'nos 90 dias anteriores'
      : validPeriod === '30d'
        ? 'nos 30 dias anteriores'
        : 'na anterior';

  const todayIso =
    typeof referenceDate === 'string' && ISO_DATE_ONLY_PATTERN.test(referenceDate)
      ? referenceDate
      : (referenceDate instanceof Date ? referenceDate : new Date(referenceDate))
          .toISOString()
          .slice(0, 10);

  const currentStartIso = addUtcDays(todayIso, -(daysCount - 1));
  const previousEndIso = addUtcDays(currentStartIso, -1);
  const previousStartIso = addUtcDays(previousEndIso, -(daysCount - 1));

  const { itemMetaById } = buildCatalogLookup(catalogSource);

  let visits = 0;
  let previousVisits = 0;
  let orders = 0;
  let previousOrders = 0;
  let estimatedCents = 0;
  let previousEstimatedCents = 0;

  const dayMap = new Map();
  for (let i = 0; i < daysCount; i += 1) {
    const dateKey = addUtcDays(currentStartIso, i);
    dayMap.set(dateKey, { date: dateKey, visits: 0, orders: 0 });
  }

  const hourMap = new Map();
  for (let h = 0; h < 24; h += 1) {
    hourMap.set(h, { hour: h, visits: 0, orders: 0 });
  }

  const itemStatsMap = new Map();

  const ensureItemStat = (itemKey) => {
    if (!itemStatsMap.has(itemKey)) {
      const meta = itemMetaById.get(itemKey) ?? {
        itemId: itemKey,
        name: itemKey,
        categoryId: 'cardapio',
        categoryName: 'Cardápio'
      };
      itemStatsMap.set(itemKey, {
        itemId: itemKey,
        name: meta.name,
        categoryId: meta.categoryId,
        categoryName: meta.categoryName,
        views: 0,
        previousViews: 0,
        selections: 0,
        previousSelections: 0
      });
    }
    return itemStatsMap.get(itemKey);
  };

  for (const rawRow of Array.isArray(rows) ? rows : []) {
    if (!rawRow || typeof rawRow !== 'object') continue;
    const rawDate = String(rawRow.metric_date ?? rawRow.metricDate ?? '').slice(0, 10);
    if (!ISO_DATE_ONLY_PATTERN.test(rawDate)) continue;

    const isCurrent = rawDate >= currentStartIso && rawDate <= todayIso;
    const isPrevious = rawDate >= previousStartIso && rawDate <= previousEndIso;
    if (!isCurrent && !isPrevious) continue;

    const metricName = String(rawRow.metric_name ?? rawRow.metricName ?? '');
    const countVal = Math.max(0, Number(rawRow.count_value ?? rawRow.countValue ?? 0) || 0);
    const centsVal = Math.max(0, Number(rawRow.estimated_cents ?? rawRow.estimatedCents ?? 0) || 0);
    const hourVal = Number(rawRow.metric_hour ?? rawRow.metricHour ?? 0);
    const itemKey = String(rawRow.item_key ?? rawRow.itemKey ?? '').trim();

    if (metricName === 'visit') {
      if (isCurrent) {
        visits += countVal;
        if (dayMap.has(rawDate)) {
          dayMap.get(rawDate).visits += countVal;
        }
        if (Number.isInteger(hourVal) && hourMap.has(hourVal)) {
          hourMap.get(hourVal).visits += countVal;
        }
      } else if (isPrevious) {
        previousVisits += countVal;
      }
    } else if (metricName === 'whatsapp_order') {
      if (isCurrent) {
        orders += countVal;
        estimatedCents += centsVal;
        if (dayMap.has(rawDate)) {
          dayMap.get(rawDate).orders += countVal;
        }
        if (Number.isInteger(hourVal) && hourMap.has(hourVal)) {
          hourMap.get(hourVal).orders += countVal;
        }
      } else if (isPrevious) {
        previousOrders += countVal;
        previousEstimatedCents += centsVal;
      }
    } else if (metricName === 'item_view' && itemKey) {
      const stat = ensureItemStat(itemKey);
      if (isCurrent) {
        stat.views += countVal;
      } else if (isPrevious) {
        stat.previousViews += countVal;
      }
    } else if (metricName === 'item_select' && itemKey) {
      const stat = ensureItemStat(itemKey);
      if (isCurrent) {
        stat.selections += countVal;
      } else if (isPrevious) {
        stat.previousSelections += countVal;
      }
    }
  }

  const conversionPercent =
    visits > 0 ? Math.round((orders / visits) * 1000) / 10 : 0;
  const previousConversionPercent =
    previousVisits > 0 ? Math.round((previousOrders / previousVisits) * 1000) / 10 : 0;

  const topItems = [...itemStatsMap.values()]
    .filter((entry) => entry.views > 0 || entry.selections > 0 || entry.previousSelections > 0)
    .map((entry) => {
      const deltaPercent =
        entry.previousSelections > 0
          ? Math.round(
              ((entry.selections - entry.previousSelections) / entry.previousSelections) * 1000
            ) / 10
          : null;
      return {
        itemId: entry.itemId,
        name: entry.name,
        categoryName: entry.categoryName,
        views: entry.views,
        selections: entry.selections,
        previousSelections: entry.previousSelections,
        deltaPercent
      };
    })
    .sort((a, b) => {
      if (b.selections !== a.selections) return b.selections - a.selections;
      if (b.views !== a.views) return b.views - a.views;
      return a.name.localeCompare(b.name, 'pt-BR');
    })
    .slice(0, 10);

  const categorySelectionsMap = new Map();
  for (const entry of itemStatsMap.values()) {
    if (entry.selections <= 0) continue;
    const existing = categorySelectionsMap.get(entry.categoryId) ?? {
      categoryId: entry.categoryId,
      name: entry.categoryName,
      selections: 0
    };
    existing.selections += entry.selections;
    categorySelectionsMap.set(entry.categoryId, existing);
  }

  const topCategories = [...categorySelectionsMap.values()]
    .sort((a, b) => {
      if (b.selections !== a.selections) return b.selections - a.selections;
      return a.name.localeCompare(b.name, 'pt-BR');
    })
    .slice(0, 6);

  const byDay = [...dayMap.values()];
  const byHour = [...hourMap.values()];

  const highlights = [];

  if (topItems.length > 0 && topItems[0].selections > 0) {
    const leader = topItems[0];
    if (leader.previousSelections > 0 && leader.deltaPercent !== null) {
      const roundedDelta = Math.round(Math.abs(leader.deltaPercent));
      if (roundedDelta === 0) {
        highlights.push(
          `${leader.name} foi o item mais escolhido ${periodLabel}, mantendo o mesmo ritmo ${previousLabel}.`
        );
      } else if (leader.deltaPercent > 0) {
        highlights.push(
          `${leader.name} foi o item mais escolhido ${periodLabel}, ${roundedDelta}% a mais que ${previousLabel}.`
        );
      } else {
        highlights.push(
          `${leader.name} foi o item mais escolhido ${periodLabel}, ${roundedDelta}% a menos que ${previousLabel}.`
        );
      }
    } else {
      highlights.push(
        `Esta semana o item mais pedido foi ${leader.name}, com ${leader.selections} ${leader.selections === 1 ? 'escolha' : 'escolhas'}.`
      );
    }
  } else if (topItems.length > 0 && topItems[0].views > 0) {
    highlights.push(
      `${topItems[0].name} foi o item mais visto ${periodLabel} (${topItems[0].views} visualizações).`
    );
  }

  // Peak 2-hour window for orders or visits
  let bestWindowStart = -1;
  let bestWindowOrders = 0;
  let bestWindowVisits = 0;
  for (let h = 0; h < 23; h += 1) {
    const h1 = hourMap.get(h);
    const h2 = hourMap.get(h + 1);
    const sumOrders = (h1?.orders ?? 0) + (h2?.orders ?? 0);
    const sumVisits = (h1?.visits ?? 0) + (h2?.visits ?? 0);
    if (
      sumOrders > bestWindowOrders ||
      (sumOrders === bestWindowOrders && sumVisits > bestWindowVisits)
    ) {
      bestWindowOrders = sumOrders;
      bestWindowVisits = sumVisits;
      bestWindowStart = h;
    }
  }

  if (bestWindowStart >= 0 && bestWindowOrders > 0) {
    highlights.push(
      `Seus pedidos se concentram entre ${bestWindowStart}h e ${bestWindowStart + 2}h.`
    );
  } else if (bestWindowStart >= 0 && bestWindowVisits > 0) {
    highlights.push(
      `Seus acessos se concentram entre ${bestWindowStart}h e ${bestWindowStart + 2}h.`
    );
  }

  if (visits > 0 && previousVisits > 0) {
    const visitDelta = Math.round(((visits - previousVisits) / previousVisits) * 100);
    if (visitDelta > 0) {
      highlights.push(
        `As visitas cresceram ${visitDelta}% ${periodLabel} em relação ao período anterior.`
      );
    }
  }

  if (highlights.length === 0) {
    highlights.push(
      'Ainda não há eventos registrados neste período. Divulgue o link da sua vitrine para acompanhar visitas e pedidos aqui.'
    );
  }

  return {
    siteId,
    period: validPeriod,
    summary: {
      visits,
      previousVisits,
      orders,
      previousOrders,
      conversionPercent,
      previousConversionPercent,
      estimatedCents,
      previousEstimatedCents
    },
    topItems,
    topCategories,
    byDay,
    byHour,
    highlights
  };
}

