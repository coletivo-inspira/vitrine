// Direitos por plano (ADR 0013). O banco decide o plano de cada vitrine em
// private.site_entitlements; este módulo normaliza a resposta e expõe as checagens
// que o Worker usa. Qualquer falta de dado cai nos direitos do plano free.
import planTableSource from '../content/plans.json' with { type: 'json' };
import { PortalValidationError } from './portal-validation.mjs';
import {
  PLAN_FEATURES,
  TECHNICAL_MAX_ACTIVE_ITEMS,
  cheapestPlanWithFeature,
  planByCode,
  validatePlanTable
} from './plans.mjs';

export const PLAN_TABLE = validatePlanTable(planTableSource);
export const PLAN_FEATURE_REQUIRED = 'PLAN_FEATURE_REQUIRED';
export const ITEM_BLOCKS_FEATURE = 'item_blocks';

const ITEM_BLOCK_MODULE = 'catalog_grid';

function fromPlan(plan) {
  return Object.freeze({
    planCode: plan.code,
    planName: plan.name,
    maxVitrines: plan.limits.vitrines,
    maxActiveItems: plan.limits.activeItemsPerVitrine,
    maxItemBlocks: plan.limits.itemBlocks,
    features: Object.freeze([...plan.features])
  });
}

export const FREE_ENTITLEMENTS = fromPlan(planByCode(PLAN_TABLE, 'free'));

function boundedInteger(value, fallback, max) {
  return Number.isSafeInteger(value) && value >= 1 ? Math.min(value, max) : fallback;
}

// Aceita a linha de private.site_entitlements (snake_case). Recursos fora da lista
// fechada são descartados; limites nunca passam do teto técnico.
export function normalizeEntitlements(row) {
  const plan = row && typeof row === 'object' ? planByCode(PLAN_TABLE, row.plan_code ?? row.planCode) : null;
  if (!plan) return FREE_ENTITLEMENTS;
  const base = fromPlan(plan);
  const rawFeatures = Array.isArray(row.features) ? row.features : base.features;
  return Object.freeze({
    planCode: plan.code,
    planName: plan.name,
    maxVitrines: boundedInteger(row.max_vitrines ?? row.maxVitrines, base.maxVitrines, base.maxVitrines),
    maxActiveItems: boundedInteger(row.max_active_items ?? row.maxActiveItems, base.maxActiveItems, TECHNICAL_MAX_ACTIVE_ITEMS),
    maxItemBlocks: boundedInteger(row.max_item_blocks ?? row.maxItemBlocks, base.maxItemBlocks, base.maxItemBlocks),
    features: Object.freeze(PLAN_FEATURES.filter((feature) => rawFeatures.includes(feature)))
  });
}

// Sem store.getSiteEntitlements (ambiente de teste em memória) a vitrine é free.
export async function loadSiteEntitlements(store, siteId, options = {}) {
  if (typeof store?.getSiteEntitlements !== 'function') return FREE_ENTITLEMENTS;
  return normalizeEntitlements(await store.getSiteEntitlements(siteId, options));
}

export function hasPlanFeature(entitlements, feature) {
  return Boolean(entitlements?.features?.includes(feature));
}

export class PlanFeatureRequiredError extends PortalValidationError {
  constructor(feature, requiredPlan, message) {
    super(403, PLAN_FEATURE_REQUIRED, message, { feature, requiredPlan });
    this.name = 'PlanFeatureRequiredError';
  }

  toJSON() {
    const body = super.toJSON();
    body.error.feature = this.feature;
    body.error.requiredPlan = this.requiredPlan;
    return body;
  }
}

function requiredPlanSummary(plan) {
  return plan ? { code: plan.code, name: plan.name } : null;
}

// 403 PLAN_FEATURE_REQUIRED com o plano mais barato que libera o recurso.
export function planFeatureRequiredError(feature) {
  const plan = cheapestPlanWithFeature(PLAN_TABLE, feature);
  return new PlanFeatureRequiredError(
    feature,
    requiredPlanSummary(plan),
    `Este recurso faz parte do plano ${plan.name}.`
  );
}

export function requirePlanFeature(entitlements, feature) {
  if (!hasPlanFeature(entitlements, feature)) throw planFeatureRequiredError(feature);
}

// Bloco de itens: seção catalog_grid ativa em página ativa.
export function countItemBlocks(pages) {
  if (!Array.isArray(pages)) return 0;
  return pages
    .filter((page) => page && page.active !== false && Array.isArray(page.sections))
    .flatMap((page) => page.sections)
    .filter((section) => section?.moduleCode === ITEM_BLOCK_MODULE && section.active !== false)
    .length;
}

// Só recusa quando a mudança acrescenta blocos acima do plano: o que já existia
// continua salvo (nada é apagado quando o plano acaba).
export function assertItemBlocksAllowed(entitlements, nextPages, previousPages = []) {
  const next = countItemBlocks(nextPages);
  if (next <= entitlements.maxItemBlocks || next <= countItemBlocks(previousPages)) return;
  const plan = [...PLAN_TABLE.plans]
    .filter((entry) => entry.limits.itemBlocks >= next)
    .sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents)[0] ?? null;
  throw new PlanFeatureRequiredError(
    ITEM_BLOCKS_FEATURE,
    requiredPlanSummary(plan),
    plan
      ? `Mais de ${entitlements.maxItemBlocks} bloco de itens faz parte do plano ${plan.name}.`
      : `Nenhum plano permite ${next} blocos de itens.`
  );
}

// Recursos com trava no painel: o selo mostra o plano que libera antes do clique.
export const PANEL_GATED_FEATURES = Object.freeze(['custom_domain', 'local_seo']);

// Para GET /api/sites/:id/entitlements: o plano da vitrine e, por recurso travado, o
// plano mais barato que libera (null quando já está liberado).
export function planGateSummary(entitlements) {
  const current = entitlements ?? FREE_ENTITLEMENTS;
  const locked = {};
  for (const feature of PANEL_GATED_FEATURES) {
    locked[feature] = hasPlanFeature(current, feature)
      ? null
      : requiredPlanSummary(cheapestPlanWithFeature(PLAN_TABLE, feature));
  }
  const moreBlocks = [...PLAN_TABLE.plans]
    .filter((plan) => plan.limits.itemBlocks > current.maxItemBlocks)
    .sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents)[0] ?? null;
  locked[ITEM_BLOCKS_FEATURE] = requiredPlanSummary(moreBlocks);
  return {
    plan: { code: current.planCode, name: current.planName },
    limits: { activeItems: current.maxActiveItems, itemBlocks: current.maxItemBlocks, vitrines: current.maxVitrines },
    features: [...current.features],
    locked
  };
}

// Opções para validateDraftContent e compilePublicStorefront.
export function draftLimits(entitlements) {
  return { maxActiveItems: entitlements.maxActiveItems, planName: entitlements.planName };
}
