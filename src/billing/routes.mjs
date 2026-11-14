// Rotas de cobrança (issue #113): POST /api/billing/checkout (dono do tenant) e
// POST /api/billing/asaas/webhook (público, autenticado pelo token do Asaas).
// Issue #114: GET /api/billing/notice (aviso do Início) e POST /api/billing/cancel.
// Issue #116: POST /api/billing/stripe/webhook (Stripe-Signature) e
// POST /api/billing/stripe/portal (portal do cliente do Stripe, dono do tenant).
// workers/api.mjs só encaminha; tudo de cobrança fica aqui e em src/billing/.
import planTableSource from '../../content/plans.json' with { type: 'json' };
import { planByCode, validatePlanTable } from '../plans.mjs';
import { createAsaasProvider, resolveAsaasConfig } from './asaas.mjs';
import { createStripeProvider, resolveStripeConfig } from './stripe.mjs';
import { pickSubscriptionNotice } from './lifecycle.mjs';
import {
  BillingProviderError,
  assertBillingProvider,
  subscriptionChangeFor,
  validateBillingDetails
} from './provider.mjs';

export const BILLING_CHECKOUT_PATH = '/api/billing/checkout';
export const ASAAS_WEBHOOK_PATH = '/api/billing/asaas/webhook';
export const BILLING_NOTICE_PATH = '/api/billing/notice';
export const BILLING_CANCEL_PATH = '/api/billing/cancel';
export const STRIPE_WEBHOOK_PATH = '/api/billing/stripe/webhook';
export const STRIPE_PORTAL_PATH = '/api/billing/stripe/portal';
export const BILLING_NOT_CONFIGURED = 'BILLING_NOT_CONFIGURED';
export const BILLING_PROVIDERS = Object.freeze(['asaas', 'stripe']);
export const DEFAULT_BILLING_PROVIDER = 'asaas';
const DEFAULT_PORTAL_ORIGIN = 'https://painel.inspira.dev.br';

const PLAN_TABLE = validatePlanTable(planTableSource);
const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_CHECKOUT_BYTES = 8 * 1024;
const ACTIVE_STATUSES = new Set(['active', 'past_due', 'grace']);

const BILLING_PATHS = new Set([
  BILLING_CHECKOUT_PATH, ASAAS_WEBHOOK_PATH, BILLING_NOTICE_PATH, BILLING_CANCEL_PATH,
  STRIPE_WEBHOOK_PATH, STRIPE_PORTAL_PATH
]);

export function isBillingRoute(pathname) {
  return BILLING_PATHS.has(pathname.replace(/\/+$/, ''));
}

export class BillingStoreError extends Error {
  constructor(code, message = code) {
    super(message);
    this.name = 'BillingStoreError';
    this.code = code;
  }
}

// Acesso ao Supabase pelo PostgREST. A posse do tenant é lida com o token da pessoa
// (RLS de public.tenants); a escrita usa o service_role, só por RPC.
export function createSupabaseBillingStore({ supabaseUrl, anonKey, serviceRoleKey, fetch: customFetch } = {}) {
  const baseUrl = String(supabaseUrl ?? '').replace(/\/+$/, '');
  const fetchImpl = customFetch ?? globalThis.fetch.bind(globalThis);
  const serviceHeaders = {
    apikey: serviceRoleKey,
    authorization: `Bearer ${serviceRoleKey}`,
    'content-type': 'application/json'
  };

  async function rpc(name, args) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: serviceHeaders,
      body: JSON.stringify(args)
    });
    if (response.ok) return response.json();
    const body = await response.json().catch(() => null);
    const known = /^(SUBSCRIPTION_ALREADY_ACTIVE|SUBSCRIPTION_NOT_CANCELABLE|BILLING_TENANT_FORBIDDEN|BILLING_PLAN_INVALID)$/.exec(body?.message ?? '');
    throw new BillingStoreError(known ? known[1] : 'BILLING_STORE_FAILED');
  }

  return {
    async getTenantOwner(tenantId, { token }) {
      const query = new URLSearchParams({ id: `eq.${tenantId}`, select: 'owner_user_id', limit: '1' });
      const response = await fetchImpl(`${baseUrl}/rest/v1/tenants?${query}`, {
        headers: { apikey: anonKey, authorization: `Bearer ${token}` }
      });
      if (!response.ok) throw new BillingStoreError('BILLING_STORE_FAILED');
      const rows = await response.json();
      return Array.isArray(rows) && rows[0]?.owner_user_id ? rows[0].owner_user_id : null;
    },

    async getSubscription(tenantId) {
      const query = new URLSearchParams({
        tenant_id: `eq.${tenantId}`,
        select: 'plan_code,status,provider,provider_customer_id,provider_subscription_id,current_period_end',
        limit: '1'
      });
      const response = await fetchImpl(`${baseUrl}/rest/v1/subscriptions?${query}`, {
        headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` }
      });
      if (!response.ok) throw new BillingStoreError('BILLING_STORE_FAILED');
      const rows = await response.json();
      return Array.isArray(rows) ? rows[0] ?? null : null;
    },

    async attachCheckout({ tenantId, userId, planCode, provider, customerId, subscriptionId }) {
      const previous = await rpc('billing_attach_checkout', {
        target_tenant: tenantId,
        target_user: userId,
        target_plan: planCode,
        target_provider: provider,
        target_customer: customerId,
        target_subscription: subscriptionId
      });
      return { previousSubscriptionId: typeof previous === 'string' ? previous : null };
    },

    // Com o token da pessoa: a função só devolve organizações de que ela é dona.
    async readNotices({ token }) {
      const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/read_subscription_notices`, {
        method: 'POST',
        headers: { apikey: anonKey, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: '{}'
      });
      if (response.status === 404) return [];
      if (!response.ok) throw new BillingStoreError('BILLING_STORE_FAILED');
      const rows = await response.json();
      return Array.isArray(rows) ? rows : [];
    },

    async cancelByOwner({ tenantId, userId }) {
      return rpc('billing_cancel_by_owner', { target_tenant: tenantId, target_user: userId });
    },

    async applyEvent({ provider, event, change }) {
      return rpc('billing_apply_event', {
        target_provider: provider,
        target_event_id: event.id,
        target_event_type: event.providerType,
        target_subscription: event.subscriptionId,
        target_payment: event.paymentId,
        next_status: change?.status ?? null,
        next_period_end: change?.periodEnd ?? null,
        period_mode: change?.periodMode ?? 'keep'
      });
    }
  };
}

function resolveBillingStore(env, deps) {
  if (deps.billingStore) return deps.billingStore;
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return null;
  return createSupabaseBillingStore({
    supabaseUrl: env.SUPABASE_URL,
    anonKey: env.SUPABASE_ANON_KEY,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
    fetch: deps.fetch
  });
}

function resolveAsaasProvider(env, deps) {
  if (deps.billingProvider) return assertBillingProvider(deps.billingProvider);
  const config = resolveAsaasConfig(env);
  return createAsaasProvider(config, {
    fetch: deps.fetch,
    sleep: deps.billingSleep,
    webhookToken: typeof env.ASAAS_WEBHOOK_TOKEN === 'string' ? env.ASAAS_WEBHOOK_TOKEN.trim() : ''
  });
}

// Stripe em modo de teste por padrão; live só com STRIPE_ENV=live e chave live.
function resolveStripeProvider(env, deps) {
  if (deps.stripeProvider) return assertBillingProvider(deps.stripeProvider);
  return createStripeProvider(resolveStripeConfig(env), {
    fetch: deps.fetch,
    sleep: deps.billingSleep,
    now: deps.now,
    webhookSecret: typeof env.STRIPE_WEBHOOK_SECRET === 'string' ? env.STRIPE_WEBHOOK_SECRET.trim() : ''
  });
}

function resolveProvider(name, env, deps) {
  return name === 'stripe' ? resolveStripeProvider(env, deps) : resolveAsaasProvider(env, deps);
}

// Retorno do Checkout e do portal do Stripe: sempre o painel (PORTAL_ORIGIN, https).
function portalReturnUrls(env, deps) {
  let origin = DEFAULT_PORTAL_ORIGIN;
  try {
    const parsed = new URL(env.PORTAL_ORIGIN ?? deps.portalOrigin ?? DEFAULT_PORTAL_ORIGIN);
    if (parsed.protocol === 'https:') origin = parsed.origin;
  } catch {
    origin = DEFAULT_PORTAL_ORIGIN;
  }
  return {
    successUrl: `${origin}/?cobranca=concluida#inicio`,
    cancelUrl: `${origin}/?cobranca=cancelada#inicio`,
    returnUrl: `${origin}/#inicio`
  };
}

async function readBoundedText(request, maxBytes) {
  const declared = Number(request.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const text = await request.text().catch(() => null);
  if (text === null || new TextEncoder().encode(text).length > maxBytes) return null;
  return text;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function notConfigured(errorResponse, providerName = DEFAULT_BILLING_PROVIDER) {
  if (providerName === 'stripe') {
    return errorResponse(503, BILLING_NOT_CONFIGURED, 'A cobrança pelo Stripe ainda não está configurada nesta plataforma.', {
      provider: 'stripe'
    });
  }
  return errorResponse(503, BILLING_NOT_CONFIGURED, 'A cobrança ainda não está configurada nesta plataforma.');
}

function providerFailure(error, errorResponse, providerName) {
  if (error instanceof BillingProviderError && error.kind === 'not_configured') return notConfigured(errorResponse, providerName);
  if (error instanceof BillingProviderError && error.status >= 400 && error.status < 500 && error.status !== 429) {
    return errorResponse(422, 'BILLING_DATA_REJECTED', 'O provedor de cobrança recusou os dados informados. Confira e tente de novo.', {
      providerCode: error.providerCode
    });
  }
  return errorResponse(502, 'BILLING_PROVIDER_UNAVAILABLE', 'O provedor de cobrança não respondeu. Tente de novo em alguns minutos.');
}

async function handleCheckout(request, env, ctx, helpers) {
  const { deps, errorResponse, jsonResponse } = helpers;
  const guard = helpers.guard();
  if (guard) return guard;
  const user = await helpers.resolveUser();
  if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');

  const text = await readBoundedText(request, MAX_CHECKOUT_BYTES);
  const body = text === null ? undefined : parseJson(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(400, 'INVALID_JSON', 'O corpo da requisição não contém JSON válido.');
  }
  const plan = typeof body.planCode === 'string' ? planByCode(PLAN_TABLE, body.planCode) : null;
  if (!plan || plan.monthlyPriceCents <= 0) {
    return errorResponse(400, 'INVALID_PLAN', 'Escolha um plano pago da tabela de planos.');
  }
  if (typeof body.tenantId !== 'string' || !UUID_PATTERN.test(body.tenantId)) {
    return errorResponse(400, 'INVALID_TENANT', 'Informe a organização que vai assinar o plano.');
  }
  const providerName = body.provider ?? DEFAULT_BILLING_PROVIDER;
  if (!BILLING_PROVIDERS.includes(providerName)) {
    return errorResponse(400, 'INVALID_PROVIDER', 'Escolha o meio de cobrança: asaas (padrão) ou stripe.');
  }
  const details = validateBillingDetails(body.billing, { requireTaxId: providerName !== 'stripe' });
  if (!details.ok) {
    return errorResponse(422, 'INVALID_BILLING_DETAILS', 'Confira nome, CPF ou CNPJ e e-mail de cobrança.', {
      fields: details.fields
    });
  }

  const store = resolveBillingStore(env, deps);
  const provider = resolveProvider(providerName, env, deps);
  if (!store || provider.configured === false) return notConfigured(errorResponse, providerName);

  const tenantId = body.tenantId.toLowerCase();
  let owner;
  let current;
  try {
    owner = await store.getTenantOwner(tenantId, { token: user.token, env });
    current = owner === user.id ? await store.getSubscription(tenantId) : null;
  } catch {
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Não foi possível consultar a assinatura. Tente de novo.');
  }
  if (!owner || owner !== user.id) {
    return errorResponse(403, 'FORBIDDEN_TENANT_OWNER', 'Só a pessoa dona da organização pode contratar um plano.');
  }
  if (current && ACTIVE_STATUSES.has(current.status)) {
    return errorResponse(409, 'SUBSCRIPTION_ALREADY_ACTIVE', 'Esta organização já tem uma assinatura em vigor.');
  }

  let created;
  try {
    const { customerId } = await provider.createCustomer({ ...details.value, reference: tenantId });
    const subscription = await provider.createSubscription({
      customerId, plan, reference: tenantId, ...portalReturnUrls(env, deps)
    });
    created = { customerId, ...subscription };
  } catch (error) {
    return providerFailure(error, errorResponse, providerName);
  }

  let previousSubscriptionId = null;
  try {
    ({ previousSubscriptionId } = await store.attachCheckout({
      tenantId,
      userId: user.id,
      planCode: plan.code,
      provider: provider.name,
      customerId: created.customerId,
      subscriptionId: created.subscriptionId
    }));
  } catch (error) {
    await provider.cancelSubscription(created.subscriptionId, { customerId: created.customerId }).catch(() => {});
    if (error instanceof BillingStoreError && error.code === 'SUBSCRIPTION_ALREADY_ACTIVE') {
      return errorResponse(409, 'SUBSCRIPTION_ALREADY_ACTIVE', 'Esta organização já tem uma assinatura em vigor.');
    }
    if (error instanceof BillingStoreError && error.code === 'BILLING_TENANT_FORBIDDEN') {
      return errorResponse(403, 'FORBIDDEN_TENANT_OWNER', 'Só a pessoa dona da organização pode contratar um plano.');
    }
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Não foi possível registrar a contratação. Tente de novo.');
  }

  // A anterior não cancelada (pendente ou suspensa) é cancelada no provedor dela, que
  // pode ser outro: billing_attach_checkout só devolve a do mesmo provedor.
  let stale = null;
  if (previousSubscriptionId) {
    stale = { provider, subscriptionId: previousSubscriptionId, customerId: current?.provider_customer_id };
  } else if (current && current.status !== 'canceled' && current.provider !== provider.name
    && BILLING_PROVIDERS.includes(current.provider) && current.provider_subscription_id) {
    stale = {
      provider: resolveProvider(current.provider, env, deps),
      subscriptionId: current.provider_subscription_id,
      customerId: current.provider_customer_id
    };
  }
  if (stale) {
    const cancel = stale.provider.cancelSubscription(stale.subscriptionId, { customerId: stale.customerId }).catch(() => {});
    if (typeof ctx?.waitUntil === 'function') ctx.waitUntil(cancel);
    else await cancel;
  }

  return jsonResponse(201, {
    checkoutUrl: created.checkoutUrl,
    subscription: { planCode: plan.code, status: 'pending', provider: provider.name }
  }, { 'cache-control': 'no-store' });
}

// Aviso do Início para a pessoa dona: { notice: null | { kind, dueDate, graceUntil, ... } }.
async function handleNotice(request, env, helpers) {
  const { deps, errorResponse, jsonResponse } = helpers;
  const user = await helpers.resolveUser();
  if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  const store = resolveBillingStore(env, deps);
  if (!store || typeof store.readNotices !== 'function') {
    return jsonResponse(200, { notice: null }, { 'cache-control': 'no-store' });
  }
  let rows;
  try {
    rows = await store.readNotices({ token: user.token, userId: user.id, env });
  } catch {
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Não foi possível consultar a assinatura. Tente de novo.');
  }
  const now = typeof deps.now === 'function' ? deps.now() : new Date();
  return jsonResponse(200, { notice: pickSubscriptionNotice(rows, now) }, { 'cache-control': 'no-store' });
}

// Cancelamento a pedido do dono: cancela no provedor e marca 'canceled'. O plano vale
// até current_period_end (decisão da issue #114). Se a gravação falhar depois do
// cancelamento no provedor, o webhook SUBSCRIPTION_DELETED marca 'canceled' do mesmo jeito.
async function handleCancel(request, env, helpers) {
  const { deps, errorResponse, jsonResponse } = helpers;
  const guard = helpers.guard();
  if (guard) return guard;
  const user = await helpers.resolveUser();
  if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  const text = await readBoundedText(request, MAX_CHECKOUT_BYTES);
  const body = text === null ? undefined : parseJson(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(400, 'INVALID_JSON', 'O corpo da requisição não contém JSON válido.');
  }
  if (typeof body.tenantId !== 'string' || !UUID_PATTERN.test(body.tenantId)) {
    return errorResponse(400, 'INVALID_TENANT', 'Informe a organização da assinatura.');
  }
  const store = resolveBillingStore(env, deps);
  if (!store) return notConfigured(errorResponse);

  const tenantId = body.tenantId.toLowerCase();
  let owner;
  let current;
  try {
    owner = await store.getTenantOwner(tenantId, { token: user.token, env });
    current = owner === user.id ? await store.getSubscription(tenantId) : null;
  } catch {
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Não foi possível consultar a assinatura. Tente de novo.');
  }
  if (!owner || owner !== user.id) {
    return errorResponse(403, 'FORBIDDEN_TENANT_OWNER', 'Só a pessoa dona da organização pode cancelar o plano.');
  }
  if (!current || current.status === 'canceled' || !BILLING_PROVIDERS.includes(current.provider) || !current.provider_subscription_id) {
    return errorResponse(409, 'SUBSCRIPTION_NOT_CANCELABLE', 'Não há assinatura para cancelar por aqui. Fale com a equipe da Vitrine.');
  }
  const provider = resolveProvider(current.provider, env, deps);
  if (provider.configured === false) return notConfigured(errorResponse, current.provider);

  try {
    await provider.cancelSubscription(current.provider_subscription_id, { customerId: current.provider_customer_id });
  } catch (error) {
    return providerFailure(error, errorResponse, current.provider);
  }
  let row;
  try {
    row = await store.cancelByOwner({ tenantId, userId: user.id });
  } catch (error) {
    if (error instanceof BillingStoreError && error.code === 'SUBSCRIPTION_NOT_CANCELABLE') {
      return errorResponse(409, 'SUBSCRIPTION_NOT_CANCELABLE', 'Esta assinatura já foi cancelada.');
    }
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'O cancelamento foi pedido ao provedor; a situação será atualizada em instantes.');
  }
  const accessUntil = row?.current_period_end ?? current.current_period_end ?? null;
  const now = typeof deps.now === 'function' ? deps.now() : new Date();
  return jsonResponse(200, {
    subscription: {
      planCode: current.plan_code,
      status: 'canceled',
      accessUntil: accessUntil && Date.parse(accessUntil) > now.getTime() ? accessUntil : null
    }
  }, { 'cache-control': 'no-store' });
}

// Responde rápido: um único RPC por evento. Erro do banco devolve 503 para o Asaas
// reenviar; como o id só é gravado junto com a mudança, o reenvio é seguro.
async function handleAsaasWebhook(request, env, helpers) {
  const { deps, errorResponse, jsonResponse } = helpers;
  const provider = resolveAsaasProvider(env, deps);
  if (!await provider.verifyWebhook(request)) {
    return errorResponse(401, 'INVALID_WEBHOOK_TOKEN', 'Token do webhook ausente ou inválido.');
  }
  const store = resolveBillingStore(env, deps);
  if (!store) return notConfigured(errorResponse);

  const text = await readBoundedText(request, MAX_WEBHOOK_BYTES);
  if (text === null) return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Evento grande demais.');
  const event = provider.parseWebhookEvent(parseJson(text));
  if (!event) return errorResponse(400, 'INVALID_WEBHOOK_EVENT', 'Evento sem id ou tipo.');

  let outcome;
  try {
    outcome = await store.applyEvent({ provider: provider.name, event, change: subscriptionChangeFor(event) });
  } catch {
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Evento não registrado; reenvie.');
  }
  return jsonResponse(200, { received: true, outcome }, { 'cache-control': 'no-store' });
}

// A assinatura do Stripe cobre o corpo bruto, então o corpo é lido antes de conferir.
// Assinatura ausente, errada, fora da tolerância de 5 minutos ou segredo ausente:
// 400 e nada muda. Evento live com STRIPE_ENV diferente de live (ou o inverso) também
// não muda nada. Idempotência por event.id em private.billing_events (provider stripe).
async function handleStripeWebhook(request, env, helpers) {
  const { deps, errorResponse, jsonResponse } = helpers;
  const provider = resolveStripeProvider(env, deps);
  const text = await readBoundedText(request, MAX_WEBHOOK_BYTES);
  if (text === null) return errorResponse(413, 'PAYLOAD_TOO_LARGE', 'Evento grande demais.');
  if (!await provider.verifyWebhook(request, text)) {
    return errorResponse(400, 'INVALID_WEBHOOK_SIGNATURE', 'Assinatura do webhook ausente ou inválida.');
  }
  const store = resolveBillingStore(env, deps);
  if (!store) return notConfigured(errorResponse, 'stripe');

  const event = provider.parseWebhookEvent(parseJson(text));
  if (!event) return errorResponse(400, 'INVALID_WEBHOOK_EVENT', 'Evento sem id ou tipo.');
  if (event.livemode !== (provider.mode === 'live')) {
    return errorResponse(400, 'STRIPE_MODE_MISMATCH', 'Evento de outro modo do Stripe (teste ou live).');
  }

  let outcome;
  try {
    outcome = await store.applyEvent({ provider: provider.name, event, change: subscriptionChangeFor(event) });
  } catch {
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Evento não registrado; reenvie.');
  }
  return jsonResponse(200, { received: true, outcome }, { 'cache-control': 'no-store' });
}

// Portal do cliente do Stripe (cartão, faturas, cancelamento), só para o dono de uma
// assinatura do Stripe. A assinatura do Asaas não tem portal: 409.
async function handleStripePortal(request, env, helpers) {
  const { deps, errorResponse, jsonResponse } = helpers;
  const guard = helpers.guard();
  if (guard) return guard;
  const user = await helpers.resolveUser();
  if (!user) return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
  const text = await readBoundedText(request, MAX_CHECKOUT_BYTES);
  const body = text === null ? undefined : parseJson(text);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return errorResponse(400, 'INVALID_JSON', 'O corpo da requisição não contém JSON válido.');
  }
  if (typeof body.tenantId !== 'string' || !UUID_PATTERN.test(body.tenantId)) {
    return errorResponse(400, 'INVALID_TENANT', 'Informe a organização da assinatura.');
  }
  const store = resolveBillingStore(env, deps);
  const provider = resolveStripeProvider(env, deps);
  if (!store || provider.configured === false) return notConfigured(errorResponse, 'stripe');

  const tenantId = body.tenantId.toLowerCase();
  let owner;
  let current;
  try {
    owner = await store.getTenantOwner(tenantId, { token: user.token, env });
    current = owner === user.id ? await store.getSubscription(tenantId) : null;
  } catch {
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Não foi possível consultar a assinatura. Tente de novo.');
  }
  if (!owner || owner !== user.id) {
    return errorResponse(403, 'FORBIDDEN_TENANT_OWNER', 'Só a pessoa dona da organização pode abrir o portal de cobrança.');
  }
  if (!current || current.provider !== 'stripe' || !current.provider_customer_id) {
    return errorResponse(409, 'STRIPE_PORTAL_UNAVAILABLE', 'Esta organização não tem assinatura pelo Stripe.');
  }
  let portal;
  try {
    portal = await provider.createPortalSession({
      customerId: current.provider_customer_id,
      returnUrl: portalReturnUrls(env, deps).returnUrl
    });
  } catch (error) {
    return providerFailure(error, errorResponse, 'stripe');
  }
  return jsonResponse(200, { portalUrl: portal.portalUrl }, { 'cache-control': 'no-store' });
}

// helpers: { deps, resolveUser(), guard(), jsonResponse, errorResponse }
export async function handleBillingRoute(request, env = {}, ctx = {}, helpers) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, '');
  const method = (request.method || 'GET').toUpperCase();
  const safeHelpers = { ...helpers, deps: helpers.deps ?? {} };
  if (path === BILLING_NOTICE_PATH) {
    if (method !== 'GET') return helpers.errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use GET nesta rota de cobrança.');
    return handleNotice(request, env, safeHelpers);
  }
  if (method !== 'POST') {
    return helpers.errorResponse(405, 'METHOD_NOT_ALLOWED', 'Use POST nesta rota de cobrança.');
  }
  if (path === ASAAS_WEBHOOK_PATH) return handleAsaasWebhook(request, env, safeHelpers);
  if (path === STRIPE_WEBHOOK_PATH) return handleStripeWebhook(request, env, safeHelpers);
  if (path === STRIPE_PORTAL_PATH) return handleStripePortal(request, env, safeHelpers);
  if (path === BILLING_CANCEL_PATH) return handleCancel(request, env, safeHelpers);
  return handleCheckout(request, env, ctx, safeHelpers);
}
