import { readFile } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_TEMPLATE,
  MAX_ACTIVE_ITEMS,
  MAX_DRAFT_BYTES,
  MAX_TOTAL_ITEMS,
  PortalValidationError,
  RESERVED_SLUGS,
  extractDraftItems,
  isItemActive,
  validateDraftContent,
  validateSafePublicHttpsUrl,
  validateSiteName,
  validateSlug,
  validateTemplate,
  validateWhatsapp
} from '../src/portal-validation.mjs';
import { publicMenu, whatsappLink } from '../src/public-menu.mjs';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  computeSha256Hex
} from '../src/publication-engine.mjs';

const ROOT_DIR = fileURLToPath(new URL('../', import.meta.url));
export const DEFAULT_PILOT_FIXTURE_PATH = resolve(ROOT_DIR, 'examples/pilot-10-vitrines.json');
export const PILOT_MAX_VITRINES = 10;
export const FREE_PLAN_MAX_ACTIVE_ITEMS = MAX_ACTIVE_ITEMS;
export const TECHNICAL_MAX_TOTAL_ITEMS = MAX_TOTAL_ITEMS;
export const DOMAIN_GRACE_PERIOD_DAYS = 7;
export const CANONICAL_PUBLIC_BASE_URL = 'https://vitrine.inspira.dev.br';
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const VALID_PLAN_TIERS = new Set(['free_basic', 'inspira_subdomain', 'custom_domain']);
const HOSTNAME_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const RESERVED_HOSTNAMES = new Set(['vitrine.inspira.dev.br', 'painel.inspira.dev.br', 'inspira.dev.br']);

export function validateCustomHostname(hostname) {
  if (typeof hostname !== 'string' || !hostname.trim()) {
    throw new PortalValidationError(
      422,
      'INVALID_CUSTOM_HOSTNAME',
      'Informe um hostname personalizado válido.'
    );
  }
  const normalized = hostname.trim().toLowerCase();
  if (
    normalized.length < 4 ||
    normalized.length > 253 ||
    !HOSTNAME_PATTERN.test(normalized) ||
    RESERVED_HOSTNAMES.has(normalized)
  ) {
    throw new PortalValidationError(
      422,
      'INVALID_CUSTOM_HOSTNAME',
      `Hostname personalizado inválido ou reservado: ${normalized}`
    );
  }
  validateSafePublicHttpsUrl(`https://${normalized}`, 422);
  return normalized;
}

/**
 * Simulação pura e determinística da máquina de estados 002-US4 (ADR 0006 + ADR 0007):
 * - Ativo (now <= paidUntil): hostname personalizado é canônico.
 * - Tolerância de 7 dias (paidUntil < now <= paidUntil + 7 dias): status = 'grace_period',
 *   hostname personalizado continua ativo sem interrupção.
 * - Após o 7º dia de vencimento (now > paidUntil + 7 dias): status = 'suspended',
 *   reversão automática ao endereço básico gratuito https://vitrine.inspira.dev.br/<slug>
 *   preservando 100% dos rascunhos, itens (ativos e ocultos) e publicações.
 */
export function evaluateDomainSubscriptionState({
  slug,
  subscription = {},
  referenceDate,
  draftSnapshot = null,
  publicationSnapshot = null
}) {
  const validSlug = validateSlug(slug);
  const freeCanonicalUrl = `${CANONICAL_PUBLIC_BASE_URL}/${validSlug}`;
  const planTier = subscription?.planTier ?? 'free_basic';

  if (!VALID_PLAN_TIERS.has(planTier)) {
    throw new PortalValidationError(
      422,
      'INVALID_PLAN_TIER',
      `Modalidade comercial inválida: ${String(planTier)}`
    );
  }

  const graceDays =
    subscription?.graceDays === undefined ? DOMAIN_GRACE_PERIOD_DAYS : subscription.graceDays;
  if (graceDays !== DOMAIN_GRACE_PERIOD_DAYS) {
    throw new PortalValidationError(
      422,
      'INVALID_GRACE_PERIOD',
      `A janela de tolerância comercial deve ser exatamente ${DOMAIN_GRACE_PERIOD_DAYS} dias.`
    );
  }

  const preservedData = {
    dataPreserved: true,
    siteSlugPreserved: validSlug,
    draftRevisionPreserved: draftSnapshot?.revision ?? null,
    totalItemsPreserved: draftSnapshot?.totalItems ?? null,
    activeItemsPreserved: draftSnapshot?.activeItems ?? null,
    hiddenItemsPreserved:
      typeof draftSnapshot?.totalItems === 'number' &&
      typeof draftSnapshot?.activeItems === 'number'
        ? draftSnapshot.totalItems - draftSnapshot.activeItems
        : null,
    publicationHashPreserved: publicationSnapshot?.hash ?? null
  };

  if (planTier === 'free_basic') {
    return {
      slug: validSlug,
      planTier: 'free_basic',
      status: 'active',
      canonicalUrl: freeCanonicalUrl,
      basicFallbackUrl: freeCanonicalUrl,
      redirectFromBasicPathTo: null,
      customHostname: null,
      customHostnameActive: false,
      verificationStatus: 'not_applicable',
      paidUntil: null,
      graceUntil: null,
      daysPastExpiration: 0,
      revertedToFreeAddress: false,
      ...preservedData
    };
  }

  const customHostname = validateCustomHostname(subscription.customHostname);
  const customCanonicalUrl = `https://${customHostname}`;

  if (typeof subscription.paidUntil !== 'string' || !subscription.paidUntil.trim()) {
    throw new PortalValidationError(
      422,
      'INVALID_PAID_UNTIL',
      'Assinaturas de endereço personalizado exigem data de vigência paidUntil em formato ISO-8601.'
    );
  }

  const paidUntilMs = Date.parse(subscription.paidUntil);
  if (!Number.isFinite(paidUntilMs)) {
    throw new PortalValidationError(
      422,
      'INVALID_PAID_UNTIL',
      `Data paidUntil inválida: ${subscription.paidUntil}`
    );
  }

  const refMs =
    referenceDate instanceof Date
      ? referenceDate.getTime()
      : typeof referenceDate === 'number'
        ? referenceDate
        : Date.parse(referenceDate ?? subscription.paidUntil);

  if (!Number.isFinite(refMs)) {
    throw new PortalValidationError(
      422,
      'INVALID_REFERENCE_DATE',
      `Data de referência inválida na simulação de vigência: ${String(referenceDate)}`
    );
  }

  const graceUntilMs = paidUntilMs + DOMAIN_GRACE_PERIOD_DAYS * DAY_IN_MS;
  const paidUntilIso = new Date(paidUntilMs).toISOString();
  const graceUntilIso = new Date(graceUntilMs).toISOString();

  if (refMs <= paidUntilMs) {
    return {
      slug: validSlug,
      planTier,
      status: 'active',
      canonicalUrl: customCanonicalUrl,
      basicFallbackUrl: freeCanonicalUrl,
      redirectFromBasicPathTo: customCanonicalUrl,
      customHostname,
      customHostnameActive: true,
      verificationStatus: 'verified',
      paidUntil: paidUntilIso,
      graceUntil: graceUntilIso,
      daysPastExpiration: 0,
      revertedToFreeAddress: false,
      ...preservedData
    };
  }

  const elapsedPastExpirationMs = refMs - paidUntilMs;
  const daysPastExpiration = Math.ceil(elapsedPastExpirationMs / DAY_IN_MS);

  if (refMs <= graceUntilMs) {
    return {
      slug: validSlug,
      planTier,
      status: 'grace_period',
      canonicalUrl: customCanonicalUrl,
      basicFallbackUrl: freeCanonicalUrl,
      redirectFromBasicPathTo: customCanonicalUrl,
      customHostname,
      customHostnameActive: true,
      verificationStatus: 'verified',
      paidUntil: paidUntilIso,
      graceUntil: graceUntilIso,
      daysPastExpiration,
      revertedToFreeAddress: false,
      ...preservedData
    };
  }

  return {
    slug: validSlug,
    planTier,
    status: 'suspended',
    canonicalUrl: freeCanonicalUrl,
    basicFallbackUrl: freeCanonicalUrl,
    redirectFromBasicPathTo: null,
    customHostname,
    customHostnameActive: false,
    verificationStatus: 'quarantined',
    paidUntil: paidUntilIso,
    graceUntil: graceUntilIso,
    daysPastExpiration,
    revertedToFreeAddress: true,
    ...preservedData
  };
}

export function simulateDomainLifecycleTransitions({
  slug,
  subscription = {},
  draftSnapshot = null,
  publicationSnapshot = null
}) {
  const planTier = subscription?.planTier ?? 'free_basic';
  if (planTier === 'free_basic') {
    const baseline = evaluateDomainSubscriptionState({
      slug,
      subscription,
      referenceDate: '2026-11-11T00:00:00.000Z',
      draftSnapshot,
      publicationSnapshot
    });
    return {
      planTier: 'free_basic',
      activePhase: baseline,
      gracePeriodDay3: baseline,
      gracePeriodBoundaryDay7: baseline,
      expiredAfterDay7: baseline
    };
  }

  const paidUntilMs = Date.parse(subscription.paidUntil);
  if (!Number.isFinite(paidUntilMs)) {
    throw new PortalValidationError(
      422,
      'INVALID_PAID_UNTIL',
      `Data paidUntil inválida para simulação de ciclo de domínio: ${String(subscription?.paidUntil)}`
    );
  }

  const activePhase = evaluateDomainSubscriptionState({
    slug,
    subscription,
    referenceDate: paidUntilMs - DAY_IN_MS,
    draftSnapshot,
    publicationSnapshot
  });

  const gracePeriodDay3 = evaluateDomainSubscriptionState({
    slug,
    subscription,
    referenceDate: paidUntilMs + 3 * DAY_IN_MS,
    draftSnapshot,
    publicationSnapshot
  });

  const gracePeriodBoundaryDay7 = evaluateDomainSubscriptionState({
    slug,
    subscription,
    referenceDate: paidUntilMs + DOMAIN_GRACE_PERIOD_DAYS * DAY_IN_MS,
    draftSnapshot,
    publicationSnapshot
  });

  const expiredAfterDay7 = evaluateDomainSubscriptionState({
    slug,
    subscription,
    referenceDate: paidUntilMs + DOMAIN_GRACE_PERIOD_DAYS * DAY_IN_MS + 1000,
    draftSnapshot,
    publicationSnapshot
  });

  return {
    planTier,
    activePhase,
    gracePeriodDay3,
    gracePeriodBoundaryDay7,
    expiredAfterDay7
  };
}

export async function validatePilotVitrineEntry(
  entry,
  index = 0,
  seenSlugs = new Set(),
  seenHostnames = new Set()
) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new PortalValidationError(
      400,
      'INVALID_PILOT_VITRINE',
      `Entrada de vitrine inválida na posição ${index}.`
    );
  }

  const slug = validateSlug(entry.slug);
  if (seenSlugs.has(slug)) {
    throw new PortalValidationError(
      409,
      'DUPLICATE_PILOT_SLUG',
      `Slug duplicado encontrado no lote do piloto: ${slug}`
    );
  }
  seenSlugs.add(slug);

  const name = validateSiteName(entry.name, 400);
  const template = validateTemplate(entry.template ?? DEFAULT_TEMPLATE, 400);

  if (!entry.draft || typeof entry.draft !== 'object' || Array.isArray(entry.draft)) {
    throw new PortalValidationError(
      422,
      'INVALID_DRAFT',
      `A vitrine "${slug}" não possui um objeto draft válido.`
    );
  }

  if (entry.draft.slug !== undefined && String(entry.draft.slug).trim() !== slug) {
    throw new PortalValidationError(
      422,
      'INVALID_SLUG',
      `O slug do rascunho (${entry.draft.slug}) diverge do slug da vitrine (${slug}).`
    );
  }

  const draftValidation = validateDraftContent({
    ...entry.draft,
    slug,
    businessName: entry.draft.businessName ?? entry.draft.name ?? name,
    template: entry.draft.template ?? template
  });

  const whatsapp = validateWhatsapp(entry.draft.whatsapp);
  const allItems = extractDraftItems(entry.draft);
  const activeItems = allItems.filter(isItemActive);
  const hiddenItems = allItems.length - activeItems.length;

  if (activeItems.length === 0) {
    throw new PortalValidationError(
      422,
      'EMPTY_PUBLIC_MENU',
      `A vitrine "${slug}" precisa ter ao menos 1 item ativo para entrar no piloto.`
    );
  }

  if (activeItems.length > FREE_PLAN_MAX_ACTIVE_ITEMS) {
    throw new PortalValidationError(
      422,
      'ACTIVE_ITEMS_LIMIT_EXCEEDED',
      `A vitrine "${slug}" possui ${activeItems.length} itens ativos, excedendo o limite de ${FREE_PLAN_MAX_ACTIVE_ITEMS} do Plano Básico Gratuito.`
    );
  }

  if (allItems.length > TECHNICAL_MAX_TOTAL_ITEMS) {
    throw new PortalValidationError(
      422,
      'TOTAL_ITEMS_LIMIT_EXCEEDED',
      `A vitrine "${slug}" possui ${allItems.length} itens totais, excedendo o teto técnico de ${TECHNICAL_MAX_TOTAL_ITEMS} itens.`
    );
  }

  const revision =
    Number.isSafeInteger(entry.revision) && entry.revision >= 1 ? entry.revision : 1;
  const publishedAt =
    typeof entry.publishedAt === 'string' && entry.publishedAt.trim()
      ? entry.publishedAt.trim()
      : '2026-11-11T00:00:00.000Z';

  // Compilação dupla para comprovar determinismo estrito de projeção e SHA-256
  const compiledFirst = await compilePublicStorefront(
    entry.draft,
    { id: entry.id, slug, name, template },
    { siteId: entry.id, revision, publishedAt }
  );
  const compiledSecond = await compilePublicStorefront(
    entry.draft,
    { id: entry.id, slug, name, template },
    { siteId: entry.id, revision, publishedAt }
  );

  if (compiledFirst.hash !== compiledSecond.hash || compiledFirst.json !== compiledSecond.json) {
    throw new PortalValidationError(
      500,
      'NON_DETERMINISTIC_COMPILATION',
      `Compilação não determinística detectada para a vitrine "${slug}".`
    );
  }

  // Valida também compatibilidade direta com publicMenu() e whatsappLink() de src/public-menu.mjs
  const directMenu = publicMenu({
    template,
    slug,
    name: entry.draft.businessName ?? name,
    whatsapp,
    items: compiledFirst.menu.items.map((item) => ({ ...item, active: true }))
  });

  if (directMenu.items.length !== activeItems.length) {
    throw new PortalValidationError(
      422,
      'PUBLIC_MENU_PROJECTION_MISMATCH',
      `Divergência na contagem de itens ativos projetados para "${slug}".`
    );
  }

  const whatsappLinks = compiledFirst.menu.items.map((item) => whatsappLink(compiledFirst.menu, item.id));
  for (const link of whatsappLinks) {
    validateSafePublicHttpsUrl(link, 422);
    if (!link.startsWith(`https://wa.me/${whatsapp}?text=`)) {
      throw new PortalValidationError(
        422,
        'INVALID_WHATSAPP_LINK',
        `Link de WhatsApp gerado fora do padrão para a vitrine "${slug}".`
      );
    }
  }

  assertNoPrivateLeakage(compiledFirst.menu);

  // Garante que itens ocultos (active: false) jamais vazam para o JSON compilado
  for (const rawItem of allItems) {
    if (!isItemActive(rawItem) && rawItem?.id) {
      const leaked = compiledFirst.menu.items.some((pubItem) => pubItem.id === rawItem.id);
      if (leaked) {
        throw new PortalValidationError(
          422,
          'INACTIVE_ITEM_LEAKAGE',
          `Item inativo "${rawItem.id}" vazou para a publicação da vitrine "${slug}".`
        );
      }
    }
  }

  if (entry.subscription?.customHostname) {
    const normalizedHost = validateCustomHostname(entry.subscription.customHostname);
    if (seenHostnames.has(normalizedHost)) {
      throw new PortalValidationError(
        409,
        'DUPLICATE_CUSTOM_HOSTNAME',
        `Hostname personalizado duplicado no lote do piloto: ${normalizedHost}`
      );
    }
    seenHostnames.add(normalizedHost);
  }

  const draftSnapshot = {
    revision,
    byteLength: draftValidation.byteLength,
    totalItems: allItems.length,
    activeItems: activeItems.length
  };
  const publicationSnapshot = {
    hash: compiledFirst.hash,
    immutableMenuUrl: compiledFirst.publication.immutableMenuUrl
  };

  const domainLifecycle = simulateDomainLifecycleTransitions({
    slug,
    subscription: entry.subscription ?? { planTier: 'free_basic' },
    draftSnapshot,
    publicationSnapshot
  });

  if (
    domainLifecycle.expiredAfterDay7.canonicalUrl !== `${CANONICAL_PUBLIC_BASE_URL}/${slug}` ||
    domainLifecycle.expiredAfterDay7.dataPreserved !== true ||
    domainLifecycle.expiredAfterDay7.totalItemsPreserved !== allItems.length ||
    domainLifecycle.expiredAfterDay7.activeItemsPreserved !== activeItems.length ||
    domainLifecycle.expiredAfterDay7.publicationHashPreserved !== compiledFirst.hash
  ) {
    throw new PortalValidationError(
      500,
      'UNSAFE_DOMAIN_REVERSION',
      `Falha na simulação de reversão segura de domínio (002-US4) para a vitrine "${slug}".`
    );
  }

  return {
    id: entry.id ?? null,
    slug,
    name: compiledFirst.menu.name,
    template: compiledFirst.menu.template,
    whatsapp: compiledFirst.menu.whatsapp,
    currency: compiledFirst.menu.currency,
    revision,
    draftBytes: draftValidation.byteLength,
    activeItems: activeItems.length,
    hiddenItems,
    totalItems: allItems.length,
    categoriesCount: compiledFirst.menu.categories.length,
    hash: compiledFirst.hash,
    publicUrl: `${CANONICAL_PUBLIC_BASE_URL}/${slug}`,
    menuUrl: compiledFirst.publication.menuUrl,
    immutableMenuUrl: compiledFirst.publication.immutableMenuUrl,
    sampleWhatsappLink: whatsappLinks[0],
    domainLifecycle
  };
}

export async function validatePilotPack(packData, options = {}) {
  const requireExactCohortSize = options.requireExactCohortSize ?? false;

  if (!packData || typeof packData !== 'object' || Array.isArray(packData)) {
    throw new PortalValidationError(
      400,
      'INVALID_PILOT_PACK',
      'O pacote do piloto deve ser um objeto JSON válido.'
    );
  }

  if (packData.schemaVersion !== 1) {
    throw new PortalValidationError(
      400,
      'INVALID_SCHEMA_VERSION',
      'O pacote do piloto deve declarar schemaVersion: 1.'
    );
  }

  if (!Array.isArray(packData.vitrines) || packData.vitrines.length === 0) {
    throw new PortalValidationError(
      400,
      'EMPTY_PILOT_PACK',
      'O pacote do piloto deve conter ao menos 1 vitrine.'
    );
  }

  if (packData.vitrines.length > PILOT_MAX_VITRINES) {
    throw new PortalValidationError(
      422,
      'PILOT_VITRINE_LIMIT_EXCEEDED',
      `O lote do piloto em custo zero (ADR 0005) permite no máximo ${PILOT_MAX_VITRINES} vitrines; recebidas: ${packData.vitrines.length}.`
    );
  }

  if (requireExactCohortSize && packData.vitrines.length !== PILOT_MAX_VITRINES) {
    throw new PortalValidationError(
      422,
      'PILOT_COHORT_SIZE_MISMATCH',
      `A fixture canônica do piloto deve conter exatamente ${PILOT_MAX_VITRINES} vitrines; encontradas: ${packData.vitrines.length}.`
    );
  }

  const seenSlugs = new Set();
  const seenHostnames = new Set();
  const validatedVitrines = [];
  let totalActiveItems = 0;
  let totalHiddenItems = 0;
  let totalDraftItems = 0;

  for (let i = 0; i < packData.vitrines.length; i += 1) {
    const validated = await validatePilotVitrineEntry(
      packData.vitrines[i],
      i,
      seenSlugs,
      seenHostnames
    );
    validatedVitrines.push(validated);
    totalActiveItems += validated.activeItems;
    totalHiddenItems += validated.hiddenItems;
    totalDraftItems += validated.totalItems;
  }

  const batchDigestInput = validatedVitrines
    .map((v) => `${v.slug}:${v.revision}:${v.hash}`)
    .join('\n');
  const batchDigest = await computeSha256Hex(batchDigestInput);

  return {
    ok: true,
    schemaVersion: 1,
    pilotCohortId: packData.pilotCohortId ?? 'vitrine-inspira-pilot-v1',
    pilotLimit: PILOT_MAX_VITRINES,
    freePlanActiveItemsLimit: FREE_PLAN_MAX_ACTIVE_ITEMS,
    technicalTotalItemsLimit: TECHNICAL_MAX_TOTAL_ITEMS,
    maxDraftBytes: MAX_DRAFT_BYTES,
    domainGracePeriodDays: DOMAIN_GRACE_PERIOD_DAYS,
    vitrineCount: validatedVitrines.length,
    totalActiveItems,
    totalHiddenItems,
    totalDraftItems,
    batchDigest,
    vitrines: validatedVitrines
  };
}

export function parsePilotCliArgs(argv = []) {
  const options = {
    fixturePath: DEFAULT_PILOT_FIXTURE_PATH,
    requireExactCohortSize: true
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run' || arg === '--check') {
      continue;
    }
    if (arg === '--fixture') {
      const next = argv[i + 1];
      if (!next || next.startsWith('--')) {
        throw new Error('Missing value for --fixture');
      }
      options.fixturePath = isAbsolute(next) ? resolve(next) : resolve(ROOT_DIR, next);
      i += 1;
    } else if (arg.startsWith('--fixture=')) {
      const raw = arg.slice('--fixture='.length);
      options.fixturePath = isAbsolute(raw) ? resolve(raw) : resolve(ROOT_DIR, raw);
    } else {
      throw new Error(`Unsupported argument: ${arg}`);
    }
  }

  // Garante que a fixture do piloto nunca resida dentro de web/ ou dist/
  for (const forbiddenDir of [resolve(ROOT_DIR, 'web'), resolve(ROOT_DIR, 'dist')]) {
    const rel = relative(forbiddenDir, options.fixturePath);
    if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) {
      throw new Error(
        `Security violation: Pilot fixture cannot reside inside public web/ or dist/ directories (${options.fixturePath})`
      );
    }
  }

  return options;
}

export async function runPilotValidation(argv = process.argv.slice(2)) {
  const options = parsePilotCliArgs(argv);
  const rawJson = await readFile(options.fixturePath, 'utf8');
  const packData = JSON.parse(rawJson);
  const report = await validatePilotPack(packData, {
    requireExactCohortSize: options.requireExactCohortSize
  });

  const summary = {
    ok: report.ok,
    pilotCohortId: report.pilotCohortId,
    fixture: relative(ROOT_DIR, options.fixturePath) || options.fixturePath,
    pilotLimit: report.pilotLimit,
    vitrineCount: report.vitrineCount,
    freePlanActiveItemsLimit: report.freePlanActiveItemsLimit,
    technicalTotalItemsLimit: report.technicalTotalItemsLimit,
    domainGracePeriodDays: report.domainGracePeriodDays,
    totalActiveItems: report.totalActiveItems,
    totalHiddenItems: report.totalHiddenItems,
    totalDraftItems: report.totalDraftItems,
    batchDigest: report.batchDigest,
    slugs: report.vitrines.map((v) => v.slug)
  };

  console.log(JSON.stringify(summary));
  return { summary, report };
}

export { RESERVED_SLUGS };

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  runPilotValidation().catch((error) => {
    const payload = {
      ok: false,
      code: error?.code || 'PILOT_VALIDATION_FAILED',
      message: error?.message || String(error)
    };
    console.error(JSON.stringify(payload));
    process.exitCode = 1;
  });
}
