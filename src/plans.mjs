// Tabela de planos (ADR 0013). `content/plans.json` é a fonte única; o banco, o
// Worker e a página de preços derivam dela.

export const PLAN_CODES = Object.freeze(['free', 'essencial', 'profissional', 'equipe']);

export const PLAN_FEATURES = Object.freeze([
  'custom_domain',
  'inspira_subdomain',
  'local_seo',
  'public_json',
  'quote_webhook',
  'conversion_reports',
  'multi_vitrine',
  'support_badge_optional'
]);

// Teto técnico do ADR 0005: nenhum plano é "ilimitado".
export const TECHNICAL_MAX_ACTIVE_ITEMS = 100;
export const MAX_ITEM_BLOCKS = 5;
export const MAX_VITRINES_PER_PLAN = 5;

const SERVICE_BILLING = new Set(['one_time']);

function fail(message) {
  throw new TypeError(`Invalid plans: ${message}`);
}

function name(value, field) {
  if (typeof value !== 'string' || !value.trim() || value.length > 80) fail(`${field} must be a short text`);
  return value.trim();
}

function cents(value, field, { nullable = false } = {}) {
  if (nullable && value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) fail(`${field} must be a non-negative integer in cents`);
  return value;
}

function bounded(value, field, max) {
  if (!Number.isSafeInteger(value) || value < 1 || value > max) fail(`${field} must be an integer between 1 and ${max}`);
  return value;
}

function validatePlan(plan, index) {
  const at = `plans[${index}]`;
  if (!plan || typeof plan !== 'object') fail(`${at} must be an object`);
  if (!PLAN_CODES.includes(plan.code)) fail(`${at}.code must be one of ${PLAN_CODES.join(', ')}`);
  const limits = plan.limits;
  if (!limits || typeof limits !== 'object') fail(`${at}.limits is required`);
  if (!Array.isArray(plan.features)) fail(`${at}.features must be a list`);
  const features = new Set();
  for (const feature of plan.features) {
    if (!PLAN_FEATURES.includes(feature)) fail(`${at}.features has unknown feature ${JSON.stringify(feature)}`);
    if (features.has(feature)) fail(`${at}.features repeats ${feature}`);
    features.add(feature);
  }
  return Object.freeze({
    code: plan.code,
    name: name(plan.name, `${at}.name`),
    monthlyPriceCents: cents(plan.monthlyPriceCents, `${at}.monthlyPriceCents`),
    limits: Object.freeze({
      vitrines: bounded(limits.vitrines, `${at}.limits.vitrines`, MAX_VITRINES_PER_PLAN),
      activeItemsPerVitrine: bounded(limits.activeItemsPerVitrine, `${at}.limits.activeItemsPerVitrine`, TECHNICAL_MAX_ACTIVE_ITEMS),
      itemBlocks: bounded(limits.itemBlocks, `${at}.limits.itemBlocks`, MAX_ITEM_BLOCKS)
    }),
    features: Object.freeze(PLAN_FEATURES.filter((feature) => features.has(feature)))
  });
}

function validateService(service, index) {
  const at = `services[${index}]`;
  if (!service || typeof service !== 'object') fail(`${at} must be an object`);
  if (typeof service.code !== 'string' || !/^[a-z][a-z0-9_]{1,31}$/.test(service.code)) fail(`${at}.code is invalid`);
  if (!SERVICE_BILLING.has(service.billing)) fail(`${at}.billing must be one_time`);
  const minPriceCents = cents(service.minPriceCents, `${at}.minPriceCents`);
  const maxPriceCents = cents(service.maxPriceCents, `${at}.maxPriceCents`, { nullable: true });
  if (maxPriceCents !== null && maxPriceCents < minPriceCents) fail(`${at}.maxPriceCents is below minPriceCents`);
  return Object.freeze({
    code: service.code,
    name: name(service.name, `${at}.name`),
    billing: service.billing,
    minPriceCents,
    maxPriceCents
  });
}

export function validatePlanTable(table) {
  if (table?.schemaVersion !== 1) fail('schemaVersion must be 1');
  if (table.currency !== 'BRL') fail('currency must be BRL');
  if (!Array.isArray(table.plans) || !Array.isArray(table.services)) fail('plans and services must be lists');

  const plans = table.plans.map(validatePlan);
  const codes = plans.map((plan) => plan.code);
  if (new Set(codes).size !== codes.length) fail('plan codes must be unique');
  for (const code of PLAN_CODES) {
    if (!codes.includes(code)) fail(`plan ${code} is missing`);
  }
  if (plans.find((plan) => plan.code === 'free').monthlyPriceCents !== 0) fail('free plan must cost 0');

  const services = table.services.map(validateService);
  const serviceCodes = services.map((service) => service.code);
  if (new Set(serviceCodes).size !== serviceCodes.length) fail('service codes must be unique');

  return Object.freeze({
    schemaVersion: 1,
    currency: 'BRL',
    plans: Object.freeze(plans),
    services: Object.freeze(services)
  });
}

export function planByCode(table, code) {
  return table.plans.find((plan) => plan.code === code) ?? null;
}

// Plano mais barato que libera o recurso: é o nome mostrado em PLAN_FEATURE_REQUIRED.
export function cheapestPlanWithFeature(table, feature) {
  if (!PLAN_FEATURES.includes(feature)) throw new TypeError(`Unknown plan feature ${feature}`);
  return [...table.plans]
    .filter((plan) => plan.features.includes(feature))
    .sort((a, b) => a.monthlyPriceCents - b.monthlyPriceCents)[0] ?? null;
}
