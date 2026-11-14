// Rotas de cobrança (issue #113): POST /api/billing/checkout (dono do tenant) e
// POST /api/billing/asaas/webhook (público, autenticado pelo token do Asaas).
// Issue #114: GET /api/billing/notice (aviso do Início) e POST /api/billing/cancel.
// workers/api.mjs só encaminha; tudo de cobrança fica aqui e em src/billing/.
import planTableSource from '../../content/plans.json' with { type: 'json' };
import { planByCode, validatePlanTable } from '../plans.mjs';
import { createAsaasProvider, resolveAsaasConfig } from './asaas.mjs';
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
export const BILLING_NOT_CONFIGURED = 'BILLING_NOT_CONFIGURED';

const PLAN_TABLE = validatePlanTable(planTableSource);
const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const MAX_WEBHOOK_BYTES = 64 * 1024;
const MAX_CHECKOUT_BYTES = 8 * 1024;
const ACTIVE_STATUSES = new Set(['active', 'past_due', 'grace']);

const BILLING_PATHS = new Set([BILLING_CHECKOUT_PATH, ASAAS_WEBHOOK_PATH, BILLING_NOTICE_PATH, BILLING_CANCEL_PATH]);

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
        select: 'plan_code,status,provider,provider_subscription_id,current_period_end',
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

function notConfigured(errorResponse) {
  return errorResponse(503, BILLING_NOT_CONFIGURED, 'A cobrança ainda não está configurada nesta plataforma.');
}

function providerFailure(error, errorResponse) {
  if (error instanceof BillingProviderError && error.kind === 'not_configured') return notConfigured(errorResponse);
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
  const details = validateBillingDetails(body.billing);
  if (!details.ok) {
    return errorResponse(422, 'INVALID_BILLING_DETAILS', 'Confira nome, CPF ou CNPJ e e-mail de cobrança.', {
      fields: details.fields
    });
  }

  const store = resolveBillingStore(env, deps);
  const provider = resolveAsaasProvider(env, deps);
  if (!store || provider.configured === false) return notConfigured(errorResponse);

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
    const subscription = await provider.createSubscription({ customerId, plan, reference: tenantId });
    created = { customerId, ...subscription };
  } catch (error) {
    return providerFailure(error, errorResponse);
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
    await provider.cancelSubscription(created.subscriptionId).catch(() => {});
    if (error instanceof BillingStoreError && error.code === 'SUBSCRIPTION_ALREADY_ACTIVE') {
      return errorResponse(409, 'SUBSCRIPTION_ALREADY_ACTIVE', 'Esta organização já tem uma assinatura em vigor.');
    }
    if (error instanceof BillingStoreError && error.code === 'BILLING_TENANT_FORBIDDEN') {
      return errorResponse(403, 'FORBIDDEN_TENANT_OWNER', 'Só a pessoa dona da organização pode contratar um plano.');
    }
    return errorResponse(503, 'BILLING_STORE_UNAVAILABLE', 'Não foi possível registrar a contratação. Tente de novo.');
  }

  if (previousSubscriptionId) {
    const cancel = provider.cancelSubscription(previousSubscriptionId).catch(() => {});
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
  const provider = resolveAsaasProvider(env, deps);
  if (!store || provider.configured === false) return notConfigured(errorResponse);

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
  if (!current || current.status === 'canceled' || current.provider !== provider.name || !current.provider_subscription_id) {
    return errorResponse(409, 'SUBSCRIPTION_NOT_CANCELABLE', 'Não há assinatura para cancelar por aqui. Fale com a equipe da Vitrine.');
  }

  try {
    await provider.cancelSubscription(current.provider_subscription_id);
  } catch (error) {
    return providerFailure(error, errorResponse);
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
  if (path === BILLING_CANCEL_PATH) return handleCancel(request, env, safeHelpers);
  return handleCheckout(request, env, ctx, safeHelpers);
}
