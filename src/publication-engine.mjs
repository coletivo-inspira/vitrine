import { projectShowcaseManifest } from './showcase-structure.mjs';
import { publicMenu, whatsappLink } from './public-menu.mjs';
import { AUCTION_RULES, parseAuctionEndsAt } from '../web/assets/auction-rules.mjs';
import {
  MILA_WHATSAPP,
  ORDER_RELAY_MILA,
  buildMilaRelayCode,
  buildPublicOrderRelay,
  resolveOrderRelayMode,
  withMilaRelayPrefix
} from '../web/assets/mila-relay.mjs';
import { projectPublicPlace } from './business-hours.mjs';
import { renderStorefrontPlaceHtml } from '../web/assets/storefront-place.mjs';
import { HIGHLIGHT_ICON_PATHS, highlightIconSvg } from '../web/assets/highlight-icons.mjs';
import {
  DEFAULT_SHARE_DESCRIPTION,
  assertPublicSeo,
  projectPublicSeo,
  renderLocalBusinessJsonLd,
  renderShareMetaTags,
  shareMetaFor
} from './local-seo.mjs';
import {
  DEFAULT_TEMPLATE,
  PortalValidationError,
  isItemActive,
  migrateLegacyDraftContent,
  projectPublicLocality,
  slugifyCity,
  toPublicMenuDraft,
  validateComponentsConfig,
  validateDraftContent,
  validateMessagesConfig,
  validateOrderFieldsConfig,
  validateSafePublicHttpsUrl
} from './portal-validation.mjs';

const utf8Encoder = new TextEncoder();

export const FORBIDDEN_PUBLIC_KEYS = Object.freeze([
  'owner_user_id',
  'ownerUserId',
  'ownerEmail',
  'email',
  'userId',
  'user_id',
  'siteId',
  'site_id',
  'session',
  'token',
  'accessToken',
  'refreshToken',
  'service_role',
  'serviceRoleKey',
  'internalCost',
  'internalNotes',
  'active',
  'available',
  'password',
  'secret',
  'plan',
  'planCode',
  'plan_code',
  'subscription',
  'subscriptionStatus',
  'subscription_status',
  'paymentStatus',
  'payment_status',
  'billing',
  'provider',
  'providerCustomerId',
  'provider_customer_id',
  'providerSubscriptionId',
  'provider_subscription_id',
  'currentPeriodEnd',
  'current_period_end',
  'graceUntil',
  'grace_until',
  'entitlements'
]);

const ALLOWED_TOP_LEVEL_MENU_KEYS = new Set([
  'schemaVersion',
  'template',
  'storefrontType',
  'catalogType',
  'slug',
  'name',
  'whatsapp',
  'orderRelay',
  'currency',
  'components',
  'orderFields',
  'messages',
  'items',
  'categories',
  'structure',
  'locality',
  'businessHours',
  'publicAddress',
  'canonicalUrl',
  'localBusiness'
]);
const ALLOWED_LOCALITY_KEYS = new Set(['city', 'uf', 'citySlug']);

const ALLOWED_ITEM_KEYS = new Set([
  'id',
  'name',
  'priceCents',
  'priceMode',
  'conditions',
  'tradeFor',
  'quotaTotal',
  'quotaFilled',
  'quotaReward',
  'description',
  'imageUrl',
  'minQuantity',
  'durationMinutes',
  'section',
  'auctionEndsAt',
  'bidIncrementCents'
]);
const ALLOWED_CATEGORY_KEYS = new Set(['id', 'name', 'items']);
const ALLOWED_COMPONENT_KEYS = new Set([
  'name',
  'description',
  'photo',
  'price',
  'minQuantity',
  'quantitySelector',
  'durationMinutes'
]);
const ALLOWED_ORDER_FIELD_KEYS = new Set([
  'date',
  'timeSlots',
  'deliveryOrPickup',
  'customerName',
  'notes'
]);
const ALLOWED_MESSAGE_KEYS = new Set([
  'heroTitle',
  'welcomeText',
  'ctaLabel',
  'whatsappTemplate'
]);

function slugifyCategoryId(value, index) {
  if (typeof value === 'string' && value.trim()) {
    const cleaned = value
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 64);
    if (cleaned) return cleaned;
  }
  return `categoria-${index + 1}`;
}

function sanitizeOptionalDescription(raw) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 280) {
    throw new PortalValidationError(
      422,
      'INVALID_ITEM_DESCRIPTION',
      'A descrição de cada item deve ter no máximo 280 caracteres.'
    );
  }
  return trimmed;
}

function sanitizeOptionalSection(raw) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 160) {
    throw new PortalValidationError(
      422,
      'INVALID_ITEM',
      'A seção do item (section) deve ter no máximo 160 caracteres.'
    );
  }
  return trimmed;
}

function sanitizeOptionalItemShortText(raw, errorCode, label) {
  if (typeof raw !== 'string') return undefined;
  const trimmed = raw.trim();
  if (!trimmed) return undefined;
  if (trimmed.length > 240) {
    throw new PortalValidationError(
      422,
      errorCode,
      `${label} deve ter no máximo 240 caracteres.`
    );
  }
  return trimmed;
}

function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const key of Object.keys(obj)) {
    const value = obj[key];
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

export function assertNoPrivateLeakage(menuArtifact) {
  if (!menuArtifact || typeof menuArtifact !== 'object' || Array.isArray(menuArtifact)) {
    throw new PortalValidationError(422, 'INVALID_PUBLIC_MENU', 'Artefato público inválido.');
  }

  for (const key of Object.keys(menuArtifact)) {
    if (FORBIDDEN_PUBLIC_KEYS.includes(key) || !ALLOWED_TOP_LEVEL_MENU_KEYS.has(key)) {
      throw new PortalValidationError(
        422,
        'PRIVATE_FIELD_LEAKAGE',
        `Campo não permitido no artefato público: ${key}`
      );
    }
  }

  if (menuArtifact.orderRelay !== undefined) {
    const relay = menuArtifact.orderRelay;
    const relayKeys = relay && typeof relay === 'object' && !Array.isArray(relay) ? Object.keys(relay) : null;
    if (
      !relayKeys ||
      relayKeys.length !== 2 ||
      relay.via !== ORDER_RELAY_MILA ||
      relay.code !== buildMilaRelayCode(menuArtifact.slug)
    ) {
      throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Bloco orderRelay inválido.');
    }
    if (menuArtifact.whatsapp !== MILA_WHATSAPP) {
      throw new PortalValidationError(
        422,
        'PRIVATE_FIELD_LEAKAGE',
        'Com pedidos pela Mila, o artefato público só pode conter o WhatsApp da Mila.'
      );
    }
  }

  if (menuArtifact.structure !== undefined) {
    const { theme, navigation, pages } = menuArtifact.structure ?? {};
    const projected = projectShowcaseManifest({ themeOverrides: theme, navigationMenus: navigation, pages });
    if (JSON.stringify(projected) !== JSON.stringify(menuArtifact.structure)) {
      throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'A estrutura pública contém campos não permitidos.');
    }
  }

  if (menuArtifact.locality !== undefined) {
    const locality = menuArtifact.locality;
    if (
      !locality ||
      typeof locality !== 'object' ||
      Array.isArray(locality) ||
      Object.keys(locality).some((key) => !ALLOWED_LOCALITY_KEYS.has(key)) ||
      locality.citySlug !== slugifyCity(locality.city, locality.uf)
    ) {
      throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Bloco locality inválido.');
    }
  }

  if (menuArtifact.businessHours !== undefined || menuArtifact.publicAddress !== undefined) {
    const { businessHours, publicAddress } = menuArtifact;
    if (JSON.stringify(projectPublicPlace({ businessHours, publicAddress })) !==
        JSON.stringify({ ...(businessHours ? { businessHours } : {}), ...(publicAddress ? { publicAddress } : {}) })) {
      throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Horário ou endereço público inválido.');
    }
  }

  assertPublicSeo(menuArtifact);

  if (menuArtifact.components !== undefined) {
    if (
      !menuArtifact.components ||
      typeof menuArtifact.components !== 'object' ||
      Array.isArray(menuArtifact.components)
    ) {
      throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Bloco components inválido.');
    }
    for (const key of Object.keys(menuArtifact.components)) {
      if (FORBIDDEN_PUBLIC_KEYS.includes(key) || !ALLOWED_COMPONENT_KEYS.has(key)) {
        throw new PortalValidationError(
          422,
          'PRIVATE_FIELD_LEAKAGE',
          `Campo não permitido em components público: ${key}`
        );
      }
    }
  }

  if (menuArtifact.orderFields !== undefined) {
    if (
      !menuArtifact.orderFields ||
      typeof menuArtifact.orderFields !== 'object' ||
      Array.isArray(menuArtifact.orderFields)
    ) {
      throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Bloco orderFields inválido.');
    }
    for (const key of Object.keys(menuArtifact.orderFields)) {
      if (FORBIDDEN_PUBLIC_KEYS.includes(key) || !ALLOWED_ORDER_FIELD_KEYS.has(key)) {
        throw new PortalValidationError(
          422,
          'PRIVATE_FIELD_LEAKAGE',
          `Campo não permitido em orderFields público: ${key}`
        );
      }
    }
  }

  if (menuArtifact.messages !== undefined) {
    if (
      !menuArtifact.messages ||
      typeof menuArtifact.messages !== 'object' ||
      Array.isArray(menuArtifact.messages)
    ) {
      throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Bloco messages inválido.');
    }
    for (const key of Object.keys(menuArtifact.messages)) {
      if (FORBIDDEN_PUBLIC_KEYS.includes(key) || !ALLOWED_MESSAGE_KEYS.has(key)) {
        throw new PortalValidationError(
          422,
          'PRIVATE_FIELD_LEAKAGE',
          `Campo não permitido em messages público: ${key}`
        );
      }
    }
  }

  for (const item of menuArtifact.items ?? []) {
    for (const key of Object.keys(item)) {
      if (FORBIDDEN_PUBLIC_KEYS.includes(key) || !ALLOWED_ITEM_KEYS.has(key)) {
        throw new PortalValidationError(
          422,
          'PRIVATE_FIELD_LEAKAGE',
          `Campo não permitido em item público: ${key}`
        );
      }
    }
  }

  for (const category of menuArtifact.categories ?? []) {
    for (const key of Object.keys(category)) {
      if (FORBIDDEN_PUBLIC_KEYS.includes(key) || !ALLOWED_CATEGORY_KEYS.has(key)) {
        throw new PortalValidationError(
          422,
          'PRIVATE_FIELD_LEAKAGE',
          `Campo não permitido em categoria pública: ${key}`
        );
      }
    }
    for (const item of category.items ?? []) {
      for (const key of Object.keys(item)) {
        if (FORBIDDEN_PUBLIC_KEYS.includes(key) || !ALLOWED_ITEM_KEYS.has(key)) {
          throw new PortalValidationError(
            422,
            'PRIVATE_FIELD_LEAKAGE',
            `Campo não permitido em item de categoria pública: ${key}`
          );
        }
      }
    }
  }
}

export async function computeSha256Hex(input) {
  const bytes = typeof input === 'string' ? utf8Encoder.encode(input) : input;
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  const view = new Uint8Array(digest);
  let hex = '';
  for (let i = 0; i < view.length; i += 1) {
    hex += view[i].toString(16).padStart(2, '0');
  }
  return hex;
}

export function projectPublicStorefrontMenu(draftContent, site = {}, limits = {}) {
  if (!draftContent || typeof draftContent !== 'object' || Array.isArray(draftContent)) {
    throw new PortalValidationError(
      422,
      'INVALID_DRAFT',
      'O conteúdo do rascunho para publicação deve ser um objeto JSON válido.'
    );
  }

  if (
    site?.slug &&
    draftContent.slug !== undefined &&
    String(draftContent.slug).trim() !== String(site.slug).trim()
  ) {
    throw new PortalValidationError(
      422,
      'INVALID_SLUG',
      'O slug do rascunho diverge do identificador da vitrine.'
    );
  }

  const migrated = migrateLegacyDraftContent(
    {
      ...draftContent,
      slug: site.slug ?? draftContent.slug,
      businessName: draftContent.businessName ?? draftContent.name ?? site.name,
      template: draftContent.template ?? site.template ?? DEFAULT_TEMPLATE
    },
    site
  );

  const planLimits = { maxActiveItems: limits.maxActiveItems, planName: limits.planName };
  validateDraftContent(migrated, planLimits);
  const relayViaMila = resolveOrderRelayMode(migrated) === ORDER_RELAY_MILA;

  let baseMenu;
  try {
    const visibleContent = Array.isArray(migrated.categories)
      ? { ...migrated, categories: migrated.categories.filter(category => category?.active !== false) }
      : migrated;
    const publicMenuDraft = toPublicMenuDraft(visibleContent, site, planLimits);
    if (relayViaMila) {
      publicMenuDraft.whatsapp = MILA_WHATSAPP;
    }
    baseMenu = publicMenu(publicMenuDraft);
  } catch (err) {
    if (err instanceof PortalValidationError) {
      throw err;
    }
    throw new PortalValidationError(
      422,
      'INVALID_PUBLIC_MENU',
      err?.message || 'Falha ao projetar os dados públicos do cardápio.'
    );
  }

  if (!Array.isArray(baseMenu.items) || baseMenu.items.length === 0) {
    throw new PortalValidationError(
      422,
      'EMPTY_PUBLIC_MENU',
      'O rascunho precisa ter ao menos 1 item ativo para ser publicado.'
    );
  }

  const rawItemExtrasById = new Map();
  let flatCounter = 0;

  const collectSourceExtras = (itemsList) => {
    if (!Array.isArray(itemsList)) return;
    for (const rawItem of itemsList) {
      if (!rawItem || typeof rawItem !== 'object') continue;
      flatCounter += 1;
      const itemId =
        typeof rawItem.id === 'string' && rawItem.id.trim()
          ? rawItem.id.trim()
          : `item-${flatCounter}`;
      if (isItemActive(rawItem)) {
        const extras = {};
        if (
          typeof rawItem.priceMode === 'string' &&
          ['offer', 'donation', 'trade', 'quota'].includes(rawItem.priceMode.trim())
        ) {
          extras.priceMode = rawItem.priceMode.trim();
        }
        if (extras.priceMode === 'quota') {
          extras.quotaTotal = rawItem.quotaTotal;
          extras.quotaFilled = Number.isSafeInteger(rawItem.quotaFilled) ? rawItem.quotaFilled : 0;
          const quotaReward = sanitizeOptionalItemShortText(
            rawItem.quotaReward,
            'INVALID_QUOTA_REWARD',
            'O campo "O que cada cota garante"'
          );
          if (quotaReward !== undefined) {
            extras.quotaReward = quotaReward;
          }
        }
        if (extras.priceMode === 'offer') {
          const auctionEndsAt = parseAuctionEndsAt(rawItem.auctionEndsAt);
          if (auctionEndsAt) {
            extras.auctionEndsAt = auctionEndsAt.toISOString();
            if (
              Number.isSafeInteger(rawItem.bidIncrementCents) &&
              rawItem.bidIncrementCents >= AUCTION_RULES.minIncrementCents &&
              rawItem.bidIncrementCents <= AUCTION_RULES.maxIncrementCents
            ) {
              extras.bidIncrementCents = rawItem.bidIncrementCents;
            }
          }
        }
        const conditions = sanitizeOptionalItemShortText(
          rawItem.conditions,
          'INVALID_ITEM_CONDITIONS',
          'As condições do item'
        );
        if (conditions !== undefined) {
          extras.conditions = conditions;
        }
        const tradeFor = sanitizeOptionalItemShortText(
          rawItem.tradeFor,
          'INVALID_ITEM_TRADE_FOR',
          'O campo "Aceito em troca"'
        );
        if (tradeFor !== undefined) {
          extras.tradeFor = tradeFor;
        }
        const desc = sanitizeOptionalDescription(rawItem.description);
        if (desc !== undefined) {
          extras.description = desc;
        }
        const section = sanitizeOptionalSection(rawItem.section);
        if (section !== undefined) {
          extras.section = section;
        }
        if (typeof rawItem.imageUrl === 'string' && rawItem.imageUrl.trim()) {
          extras.imageUrl = validateSafePublicHttpsUrl(rawItem.imageUrl.trim(), 422);
        }
        if (Number.isSafeInteger(rawItem.minQuantity) && rawItem.minQuantity >= 1 && rawItem.minQuantity <= 99) {
          extras.minQuantity = rawItem.minQuantity;
        }
        if (
          Number.isSafeInteger(rawItem.durationMinutes) &&
          rawItem.durationMinutes >= 5 &&
          rawItem.durationMinutes <= 480
        ) {
          extras.durationMinutes = rawItem.durationMinutes;
        }
        rawItemExtrasById.set(itemId, extras);
      }
    }
  };

  if (Array.isArray(migrated.items)) {
    collectSourceExtras(migrated.items);
  }
  if (Array.isArray(migrated.categories)) {
    for (const cat of migrated.categories) {
      if (cat && typeof cat === 'object' && cat.active !== false) {
        collectSourceExtras(cat.items);
      }
    }
  }

  const validatedItemsById = new Map();
  const projectedItems = baseMenu.items.map((item) => {
    const extras = rawItemExtrasById.get(item.id) ?? {};
    const projectedItem = {
      id: item.id,
      name: item.name,
      ...(extras.priceMode !== undefined ? { priceMode: extras.priceMode } : {}),
      ...(extras.conditions !== undefined ? { conditions: extras.conditions } : {}),
      ...(extras.tradeFor !== undefined ? { tradeFor: extras.tradeFor } : {}),
      ...(extras.quotaTotal !== undefined ? { quotaTotal: extras.quotaTotal } : {}),
      ...(extras.quotaFilled !== undefined ? { quotaFilled: extras.quotaFilled } : {}),
      ...(extras.quotaReward !== undefined ? { quotaReward: extras.quotaReward } : {}),
      ...(extras.description !== undefined ? { description: extras.description } : {}),
      ...(extras.section !== undefined ? { section: extras.section } : {}),
      ...(extras.imageUrl !== undefined ? { imageUrl: extras.imageUrl } : {}),
      priceCents: item.priceCents,
      ...(extras.auctionEndsAt !== undefined ? { auctionEndsAt: extras.auctionEndsAt } : {}),
      ...(extras.bidIncrementCents !== undefined ? { bidIncrementCents: extras.bidIncrementCents } : {}),
      ...(extras.minQuantity !== undefined ? { minQuantity: extras.minQuantity } : {}),
      ...(extras.durationMinutes !== undefined ? { durationMinutes: extras.durationMinutes } : {})
    };
    validatedItemsById.set(item.id, projectedItem);
    return projectedItem;
  });

  const assignedItemIds = new Set();
  const projectedCategories = [];
  const seenCategoryIds = new Set();

  if (Array.isArray(migrated.categories)) {
    let itemIndexCursor = Array.isArray(migrated.items)
      ? migrated.items.length
      : 0;

    for (let catIdx = 0; catIdx < migrated.categories.length; catIdx += 1) {
      const rawCat = migrated.categories[catIdx];
      if (!rawCat || typeof rawCat !== 'object') continue;

      const catName =
        typeof rawCat.name === 'string' && rawCat.name.trim()
          ? rawCat.name.trim()
          : `Categoria ${catIdx + 1}`;
      let catId = slugifyCategoryId(rawCat.id ?? catName, catIdx);
      if (seenCategoryIds.has(catId)) {
        catId = `${catId}-${catIdx + 1}`;
      }

      const catItems = [];
      if (Array.isArray(rawCat.items)) {
        for (const rawItem of rawCat.items) {
          itemIndexCursor += 1;
          if (!isItemActive(rawItem)) continue;
          const resolvedId =
            typeof rawItem.id === 'string' && rawItem.id.trim()
              ? rawItem.id.trim()
              : `item-${itemIndexCursor}`;
          const validatedItem = validatedItemsById.get(resolvedId);
          if (validatedItem && !assignedItemIds.has(resolvedId)) {
            assignedItemIds.add(resolvedId);
            catItems.push({ ...validatedItem });
          }
        }
      }

      if (catItems.length > 0) {
        seenCategoryIds.add(catId);
        projectedCategories.push({
          id: catId,
          name: catName,
          items: catItems
        });
      }
    }
  }

  const unassignedItems = projectedItems
    .filter((item) => !assignedItemIds.has(item.id))
    .map((item) => ({ ...item }));

  if (unassignedItems.length > 0) {
    const hasSectionedItems = unassignedItems.some(
      (item) => typeof item.section === 'string' && item.section.trim()
    );
    if (hasSectionedItems) {
      const groupedBySection = new Map();
      const unsectioned = [];
      for (const item of unassignedItems) {
        const sec = typeof item.section === 'string' ? item.section.trim() : '';
        if (sec) {
          if (!groupedBySection.has(sec)) {
            groupedBySection.set(sec, []);
          }
          groupedBySection.get(sec).push(item);
        } else {
          unsectioned.push(item);
        }
      }
      let secIdx = projectedCategories.length;
      for (const [secName, secItems] of groupedBySection.entries()) {
        secIdx += 1;
        let catId = slugifyCategoryId(secName, secIdx - 1);
        if (seenCategoryIds.has(catId)) {
          catId = `${catId}-${secIdx}`;
        }
        seenCategoryIds.add(catId);
        projectedCategories.push({
          id: catId,
          name: secName,
          items: secItems
        });
      }
      if (unsectioned.length > 0) {
        projectedCategories.push({
          id: projectedCategories.length === 0 ? 'cardapio' : 'outros-itens',
          name: projectedCategories.length === 0 ? 'Cardápio' : 'Outros Itens',
          items: unsectioned
        });
      }
    } else {
      projectedCategories.push({
        id: projectedCategories.length === 0 ? 'cardapio' : 'outros-itens',
        name: projectedCategories.length === 0 ? 'Cardápio' : 'Outros Itens',
        items: unassignedItems
      });
    }
  }

  const sanitizedComponents = validateComponentsConfig(
    migrated.components,
    migrated.catalogType,
    baseMenu.template
  );
  const sanitizedOrderFields = validateOrderFieldsConfig(
    migrated.orderFields,
    migrated.catalogType
  );
  const sanitizedMessages = validateMessagesConfig(
    migrated.messages,
    migrated.catalogType,
    baseMenu.name,
    baseMenu.template
  );
  const locality = projectPublicLocality(migrated.locality);

  const menu = {
    schemaVersion: baseMenu.schemaVersion,
    template: baseMenu.template,
    storefrontType: migrated.storefrontType,
    catalogType: migrated.catalogType,
    slug: baseMenu.slug,
    name: baseMenu.name,
    whatsapp: baseMenu.whatsapp,
    ...(relayViaMila ? { orderRelay: buildPublicOrderRelay(baseMenu.slug) } : {}),
    currency: baseMenu.currency,
    components: sanitizedComponents,
    orderFields: sanitizedOrderFields,
    messages: sanitizedMessages,
    items: projectedItems,
    categories: projectedCategories,
    ...(migrated.structure ? { structure: projectShowcaseManifest(migrated.structure) } : {}),
    ...(locality ? { locality } : {}),
    ...projectPublicPlace(migrated),
    ...projectPublicSeo(migrated, baseMenu.slug, limits)
  };

  for (const item of menu.items) {
    whatsappLink(menu, item.id);
  }

  assertNoPrivateLeakage(menu);
  return deepFreeze(menu);
}

export async function compilePublicStorefront(draftContent, site = {}, options = {}) {
  const menu = projectPublicStorefrontMenu(draftContent, site, options);
  const canonicalJson = JSON.stringify(menu);
  const hash = await computeSha256Hex(canonicalJson);
  const publishedAt = options.publishedAt ?? new Date().toISOString();
  const revision = Number.isSafeInteger(options.revision) && options.revision >= 1 ? options.revision : 1;
  const siteId = options.siteId ?? site.id ?? null;

  const publication = deepFreeze({
    ...(siteId ? { siteId } : {}),
    slug: menu.slug,
    revision,
    hash,
    publishedAt,
    url: `/${menu.slug}`,
    menuUrl: `/data/vitrines/${menu.slug}/menu.json`,
    immutableMenuUrl: `/data/vitrines/${menu.slug}/releases/${hash}.json`,
    menu
  });

  return {
    hash,
    json: canonicalJson,
    menu,
    publication
  };
}

const DIRECT_ORDER_FOOTER_NOTE =
  'Preços em Reais (BRL). O botão abre uma conversa no WhatsApp para confirmar pedido e disponibilidade.';
const MILA_RELAY_FOOTER_NOTE =
  'Preços em Reais (BRL). Os pedidos desta vitrine chegam à Mila, da equipe Vitrine Inspira, que repassa cada um ao negócio pelo WhatsApp.';

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatPublicPriceBRL(priceCents) {
  const reais = Math.floor(priceCents / 100);
  const centavos = String(priceCents % 100).padStart(2, '0');
  return `R$ ${reais.toLocaleString('pt-BR')},${centavos}`;
}

export function renderStorefrontCatalogMarkup(menu) {
  const categories =
    Array.isArray(menu?.categories) && menu.categories.length > 0
      ? menu.categories
      : [{ id: 'cardapio', name: 'Cardápio', items: menu?.items ?? [] }];

  const chipsHtml = categories
    .map(
      (cat) =>
        `<a class="category-chip" href="#cat-${escapeHtml(cat.id)}">${escapeHtml(cat.name)}</a>`
    )
    .join('');

  const sectionsHtml = categories
    .map((cat) => {
      const countLabel = cat.items.length === 1 ? '1 opção' : `${cat.items.length} opções`;
      const itemsHtml = cat.items
        .map((item) => {
          const waHref = whatsappLink(menu, item.id);
          const descHtml = item.description
            ? `<p class="menu-item-description">${escapeHtml(item.description)}</p>`
            : '';
          return [
            `<article class="menu-item-card" data-item-id="${escapeHtml(item.id)}">`,
            `  <div class="menu-item-body">`,
            `    <h3 class="menu-item-title">${escapeHtml(item.name)}</h3>`,
            descHtml ? `    ${descHtml}` : '',
            `  </div>`,
            `  <div class="menu-item-footer">`,
            `    <span class="menu-item-price">${escapeHtml(formatPublicPriceBRL(item.priceCents))}</span>`,
            `    <a class="whatsapp-order-button" href="${escapeHtml(waHref)}" target="_blank" rel="noopener noreferrer">Pedir no WhatsApp</a>`,
            `  </div>`,
            `</article>`
          ]
            .filter(Boolean)
            .join('\n');
        })
        .join('\n');

      return [
        `<section class="menu-category" id="cat-${escapeHtml(cat.id)}">`,
        `  <div class="menu-category-header">`,
        `    <h2 class="menu-category-title">${escapeHtml(cat.name)}</h2>`,
        `    <span class="menu-category-count">${escapeHtml(countLabel)}</span>`,
        `  </div>`,
        `  <div class="menu-items-grid">`,
        itemsHtml,
        `  </div>`,
        `</section>`
      ].join('\n');
    })
    .join('\n');

  return { chipsHtml, sectionsHtml };
}

function renderNavigation(links, label) {
  if (!links?.length) return '';
  return `<nav class="storefront-module-nav" aria-label="${label}">${links.map(link =>
    `<a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
  ).join('')}</nav>`;
}

const catalogModules = new Set(['catalog_grid', 'service_booking', 'quote_request']);

const HEADER_LINK_LIMIT = 5;
const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);

function publicLogoSrc(value) {
  if (typeof value !== 'string') return '';
  const src = value.trim();
  if (/^\/[a-z0-9][a-z0-9/_.-]*$/i.test(src)) return src;
  try {
    return new URL(src).protocol === 'https:' ? src : '';
  } catch {
    return '';
  }
}

function publicInstagramHref(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && INSTAGRAM_HOSTS.has(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

function hasSelectableItems(menu, structure) {
  if (!menu?.items?.length) return false;
  if (!structure) return true;
  return structure.pages.some(page => page.sections.some(section => catalogModules.has(section.moduleCode)));
}

/**
 * Cabeçalho da vitrine pública: identidade do negócio, menu (links de
 * `navigation.header`, Instagram e tema) e o ícone "Sua seleção". Sem JavaScript o
 * menu fica visível como lista e o ícone é só um link para as etapas.
 */
export function renderStorefrontHeader(menu, structure = null) {
  const name = String(menu?.name ?? '').trim() || 'Vitrine';
  const logo = publicLogoSrc(menu?.logoUrl);
  const identity = logo
    ? `<img class="storefront-identity-logo" src="${escapeHtml(logo)}" width="160" height="40" alt="${escapeHtml(name)}">`
    : `<span id="storefront-header-name" class="storefront-identity-name">${escapeHtml(name)}</span>`;
  const links = (structure?.navigation?.header ?? []).slice(0, HEADER_LINK_LIMIT)
    .map(link => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`);
  const instagram = publicInstagramHref(menu?.instagramUrl);
  if (instagram) {
    links.push(`<li><a class="storefront-header-instagram" href="${escapeHtml(instagram)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram de ${escapeHtml(name)}">Instagram</a></li>`);
  }
  const selection = hasSelectableItems(menu, structure)
    ? `<a class="storefront-selection" href="#storefront-catalog" aria-label="Sua seleção">
        <svg class="storefront-selection-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14l-1.2 11.1a2 2 0 0 1-2 1.9H8.2a2 2 0 0 1-2-1.9L5 8Z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/></svg>
        <span class="storefront-selection-count" aria-hidden="true" hidden>0</span>
      </a>
      <span class="storefront-selection-status" aria-live="polite"></span>`
    : '';
  return `<header class="storefront-topbar">
    <div class="wrap storefront-topbar-inner">
      <a class="storefront-identity" href="#vitrine-principal">${identity}</a>
      <nav id="storefront-header-menu" class="storefront-header-menu" aria-label="Menu da vitrine">
        ${links.length ? `<ul class="storefront-header-links">${links.join('')}</ul>` : ''}
        <div class="storefront-header-theme">
          <button class="theme-toggle" type="button" aria-label="Ativar modo escuro" hidden>
            <svg class="theme-moon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/></svg>
            <svg class="theme-sun" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
          </button>
        </div>
      </nav>
      <div class="storefront-header-actions">
        ${selection}
        <button class="storefront-menu-toggle" type="button" aria-label="Abrir menu" aria-expanded="false" aria-controls="storefront-header-menu" hidden>
          <svg class="storefront-menu-open-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
          <svg class="storefront-menu-close-icon" width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
        </button>
      </div>
    </div>
  </header>`;
}

const HERO_IMAGE_WIDTH = 800;
const HERO_IMAGE_HEIGHT = 1000;

function heroWhatsappHref(menu) {
  const phone = String(menu.whatsapp ?? '').replace(/\D/g, '');
  if (!phone) return '';
  const message = withMilaRelayPrefix(
    `Olá! Vi a vitrine ${menu.name} e gostaria de conversar.`, menu.orderRelay, menu.name
  );
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

export function resolveHeroActionHref(target, menu, { hasCatalog = true } = {}) {
  if (target === 'selecao') return hasCatalog ? '#storefront-catalog' : '#vitrine-principal';
  if (target === 'whatsapp') return heroWhatsappHref(menu);
  if (target?.startsWith('pagina:')) {
    const slug = target.slice('pagina:'.length);
    return slug === 'home' ? '#vitrine-principal' : `#pagina-${slug}`;
  }
  return target?.startsWith('#') ? target : '';
}

function renderHeroAction(action, className, menu, options) {
  const href = action?.label ? resolveHeroActionHref(action.target, menu, options) : '';
  if (!href) return '';
  const external = href.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : '';
  return `<a class="${className}" href="${escapeHtml(href)}"${external}>${escapeHtml(action.label)}</a>`;
}

function renderStorefrontHero(menu, config = {}, id = '', navigation = '', options = {}) {
  const eyebrow = config.eyebrow ?? 'Atendimento direto no WhatsApp';
  const actions = renderHeroAction(config.primaryAction, 'storefront-hero-primary', menu, options) +
    renderHeroAction(config.secondaryAction, 'storefront-hero-secondary', menu, options);
  const photo = config.imageUrl && config.imageAlt
    ? `
      <figure class="storefront-hero-media">
        <img src="${escapeHtml(config.imageUrl)}" alt="${escapeHtml(config.imageAlt)}" width="${HERO_IMAGE_WIDTH}" height="${HERO_IMAGE_HEIGHT}" fetchpriority="high" decoding="async">
      </figure>`
    : '';
  return `<section${id ? ` id="${escapeHtml(id)}"` : ''} class="storefront-hero${photo ? ' has-photo' : ''}" aria-labelledby="storefront-name">
      <div class="storefront-hero-copy">
        ${eyebrow ? `<p class="storefront-eyebrow">${escapeHtml(eyebrow)}</p>\n        ` : ''}<h1 id="storefront-name">${escapeHtml(config.headline || menu.name)}</h1>
        <p id="storefront-subtitle" class="storefront-subtitle">${escapeHtml(config.subtitle || 'Escolha seus itens e envie pelo WhatsApp.')}</p>${actions ? `
        <div class="storefront-hero-actions">${actions}</div>` : ''}
      </div>${photo}
      ${navigation}
    </section>`;
}

function renderHighlights(config, id) {
  const items = (config.items ?? []).filter(item => item?.text && HIGHLIGHT_ICON_PATHS[item.icon]);
  if (items.length < 2) return '';
  return `<section id="${escapeHtml(id)}" class="storefront-highlights" aria-label="Destaques">
      <ul class="storefront-highlights-list" data-count="${items.length}">${items.map(item =>
    `<li class="storefront-highlight">${highlightIconSvg(item.icon)}<span>${escapeHtml(item.text)}</span></li>`
  ).join('')}</ul>
    </section>`;
}

function renderCategoryNavigation(chipsHtml) {
  return `<nav id="category-nav" class="category-chips" aria-label="Categorias da vitrine">${chipsHtml}</nav>`;
}

function renderStorefrontCatalog({ chipsHtml, sectionsHtml }, id = '', columns) {
  return `<section${id ? ` id="${escapeHtml(id)}"` : ''} aria-label="Catálogo da vitrine">
      ${renderCategoryNavigation(chipsHtml)}
      <div id="storefront-catalog" class="storefront-catalog"${columns ? ` data-columns="${columns}"` : ''}>
        ${sectionsHtml}
      </div>
    </section>`;
}

function renderPublicSections(pages, menu, catalog, placeHtml = '') {
  let catalogRendered = false;
  let mainHeroRendered = false;
  const hasCatalog = (pages ?? []).some(page => page.sections.some(({ moduleCode }) => catalogModules.has(moduleCode)));
  return (pages ?? []).map(page => {
    const blocks = page.sections.map(({ id, moduleCode, config }) => {
      const section = content => content ? `<section id="${escapeHtml(id)}" class="storefront-module">${content}</section>` : '';
      if (catalogModules.has(moduleCode)) {
        if (catalogRendered) return '';
        catalogRendered = true;
        return renderStorefrontCatalog(catalog, id, config.columns);
      }
      switch (moduleCode) {
        case 'about_story':
          return section(config.bio ? `<h2>Sobre</h2><p>${escapeHtml(config.bio)}</p>` : '');
        case 'hours_location':
          return section(config.scheduleText || config.addressText
            ? `<h2>Horários e localização</h2><p>${escapeHtml(config.scheduleText)}</p><p>${escapeHtml(config.addressText)}</p>` : '');
        case 'faq':
          return section(config.items?.length ? `<h2>Perguntas frequentes</h2>${config.items.map(item =>
            `<details><summary>${escapeHtml(item.q)}</summary><p>${escapeHtml(item.a)}</p></details>`
          ).join('')}` : '');
        case 'testimonials':
          return section(config.items?.length ? `<h2>Depoimentos</h2>${config.items.map(item =>
            `<blockquote><p>${escapeHtml(item.quote)}</p><footer>${escapeHtml(item.name)}</footer></blockquote>`
          ).join('')}` : '');
        case 'links_bio':
          return section(renderNavigation(config.links, 'Links'));
        case 'highlights':
          return renderHighlights(config, id);
        case 'custom_sandbox':
          return section(`<iframe class="storefront-widget" title="Componente da vitrine" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" data-widget-id="${config.widgetId}" src="https://sandbox.inspira.dev.br/embed/${config.widgetId}?v=${config.bundleHash}"></iframe>`);
        case 'hero':
          if (page.slug === 'home' && !mainHeroRendered) {
            mainHeroRendered = true;
            return renderStorefrontHero(menu, config, id, '', { hasCatalog }) + placeHtml;
          }
          return section(config.headline
            ? `<h2>${escapeHtml(config.headline)}</h2><p>${escapeHtml(config.subtitle ?? '')}</p>` : '');
        default:
          return '';
      }
    }).join('');
    if (!blocks) return '';
    return page.slug === 'home' ? blocks
      : `<section id="pagina-${escapeHtml(page.slug)}" class="storefront-module"><h2>${escapeHtml(page.title)}</h2>${blocks}</section>`;
  }).join('');
}

/**
 * HTML da vitrine publicada. `canonicalUrl` substitui o endereço gravado no snapshot
 * (ex.: pedido atendido pelo domínio próprio).
 */
export function renderStorefrontHtml(menu, baseTemplateHtml, { interactive = true, canonicalUrl } = {}) {
  const share = shareMetaFor(menu, { canonicalUrl });
  const descriptionTag = `<meta name="description" content="${escapeHtml(share.description)}">`;
  const shareTags = renderShareMetaTags(share);
  const jsonLd = renderLocalBusinessJsonLd(menu, { canonicalUrl: share.url });
  const catalog = renderStorefrontCatalogMarkup(menu);
  const { chipsHtml, sectionsHtml } = catalog;
  const structure = menu.structure ? projectShowcaseManifest({
    themeOverrides: menu.structure.theme, navigationMenus: menu.structure.navigation, pages: menu.structure.pages
  }) : null;
  const home = structure?.pages.find(page => page.slug === 'home');
  const hero = home?.sections.find(section => section.moduleCode === 'hero')?.config;
  // A foto do hero é o LCP: sem disputar banda com ~380 KB de fontes pré-carregadas (font-display: swap).
  const heroPhoto = Boolean(hero?.imageUrl && hero?.imageAlt);
  const header = renderStorefrontHeader(menu, structure);
  const footerNav = renderNavigation(structure?.navigation.footer, 'Links do rodapé');
  const cityLink = menu.locality && menu.items?.some((item) => ['offer', 'donation', 'trade'].includes(item.priceMode))
    ? `<a class="storefront-city-link" href="/por-cidade/${escapeHtml(menu.locality.citySlug)}">Mais itens de lance, doação e troca em ${escapeHtml(menu.locality.city)} – ${escapeHtml(menu.locality.uf)}</a>`
    : '';
  const placeHtml = renderStorefrontPlaceHtml(menu);
  const modularHtml = structure
    ? (hero ? '' : placeHtml) + renderPublicSections(structure.pages, menu, catalog, placeHtml)
    : renderStorefrontHero(menu, {}, '', renderCategoryNavigation(chipsHtml)) + placeHtml +
      `<div id="storefront-catalog" class="storefront-catalog">${sectionsHtml}</div>`;
  const theme = structure?.theme;
  const accent = theme?.accentColor ? ` style="--storefront-custom-accent:${theme.accentColor}"` : '';
  const shape = theme?.buttonStyle ? ` data-button-style="${theme.buttonStyle}"` : '';
  const font = theme?.fontPair ? ` data-font-pair="${theme.fontPair}"` : '';
  const orderNote = menu.orderRelay?.via === ORDER_RELAY_MILA
    ? MILA_RELAY_FOOTER_NOTE
    : DIRECT_ORDER_FOOTER_NOTE;
  if (!structure && typeof baseTemplateHtml === 'string' && baseTemplateHtml.trim()) {
    return baseTemplateHtml
      .replace(
        '<title id="storefront-page-title">Cardápio Digital — Vitrine Inspira</title>',
        () => `<title id="storefront-page-title">${escapeHtml(menu.name)} — Vitrine</title>`
      )
      .replace(
        `<meta name="description" content="${DEFAULT_SHARE_DESCRIPTION}">`,
        () => descriptionTag
      )
      .replace(/<meta property="og:type"[\s\S]*?<meta name="twitter:card"[^>]*>/, () => shareTags)
      .replace('</head>', () => `${jsonLd ? `  ${jsonLd}\n` : ''}</head>`)
      .replace(/<header class="storefront-topbar">[\s\S]*?<\/header>/, () => header)
      .replace(
        '<h1 id="storefront-name">Carregando vitrine...</h1>',
        `<h1 id="storefront-name">${escapeHtml(hero?.headline || menu.name)}</h1>`
      )
      .replace(
        '<nav id="category-nav" class="category-chips" aria-label="Categorias da vitrine"></nav>',
        `<nav id="category-nav" class="category-chips" aria-label="Categorias da vitrine">${chipsHtml}</nav>`
      )
      .replace(DIRECT_ORDER_FOOTER_NOTE, orderNote)
      .replace('<!--STATIC_STOREFRONT_PLACE-->', placeHtml)
      .replace('<!--STATIC_STOREFRONT_CATALOG-->', sectionsHtml);
  }

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#F7F7F4">
  ${descriptionTag}
  <title id="storefront-page-title">${escapeHtml(menu.name)} — Vitrine</title>
  ${shareTags}
  <link rel="icon" href="/assets/brand/vitrine-icon.svg" type="image/svg+xml">
  ${heroPhoto ? '' : `<link rel="preload" href="/assets/fonts/syne.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="/assets/fonts/dm-sans.ttf" as="font" type="font/ttf" crossorigin>
  `}<script src="/theme.js"></script>
  <link rel="stylesheet" href="/vitrine/vitrine.css">
  ${jsonLd}
</head>
<body data-storefront-slug="${escapeHtml(menu.slug)}"${accent}${shape}${font}>
  <a class="skip-link" href="#vitrine-principal">Pular para os itens</a>
  ${header}
  <main id="vitrine-principal" class="wrap storefront-main">
    <div id="storefront-status" class="storefront-status" role="status" aria-live="polite" hidden></div>
    ${structure && !hero ? `<h1 id="storefront-name" class="storefront-accessible-title">${escapeHtml(menu.name)}</h1>` : ''}
    ${modularHtml}
  </main>
  <footer class="storefront-footer">
    <div class="wrap storefront-footer-inner">
      ${footerNav}
      ${cityLink}
      <a class="brand" href="/" aria-label="Vitrine Inspira — página institucional">
        <img class="brand-logo brand-logo-light" src="/assets/brand/vitrine.svg" width="150" height="46" alt="vitrine — coletivo inspira">
        <img class="brand-logo brand-logo-dark" src="/assets/brand/vitrine-inverse.svg" width="150" height="46" alt="vitrine — coletivo inspira">
      </a>
      <p class="storefront-footer-note">
        ${orderNote}
      </p>
      <p id="storefront-privacy-notice" class="storefront-footer-note storefront-privacy-notice">
        Privacidade (LGPD): esta vitrine contabiliza apenas estatísticas agregadas de visitas e escolhas de itens, sem cookies de rastreamento nem coleta de endereço IP ou dados pessoais. Ao curtir um item, um cookie funcional e anônimo guarda sua curtida para que ela não seja contada duas vezes. Ao dar um lance em leilão, seu nome e WhatsApp vão só para a vitrine, com sua autorização, e são apagados 90 dias após o encerramento.
      </p>
    </div>
  </footer>
  ${interactive ? '<script type="module" src="/vitrine/vitrine.js"></script>' : ''}
</body>
</html>`;
}
