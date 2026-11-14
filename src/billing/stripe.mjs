// Provedor Stripe (ADR 0013 Cobrança item 7, issue #116): complemento do Asaas para
// cartão internacional ou a pedido do cliente. Modo de teste por padrão: o modo live
// só vale com STRIPE_ENV=live explícito e chave sk_live_/rk_live_. Sem SDK: chamadas
// REST com fetch e verificação de Stripe-Signature com Web Crypto. Sem Stripe Connect.
//
// O Checkout só cria a assinatura do Stripe depois do pagamento, então o
// provider_subscription_id gravado no banco é uma referência gerada aqui
// (`vtr_` + 32 hex) e enviada como metadado `vitrine_subscription` da sessão e da
// assinatura. Os eventos de fatura e de assinatura trazem esse metadado, então casam
// com a linha do banco em qualquer ordem de entrega, sem migração.
import {
  BillingProviderError,
  PROVIDER_ID_PATTERN,
  fetchWithRetry,
  timingSafeEqualText
} from './provider.mjs';

export const STRIPE_API_BASE = 'https://api.stripe.com/v1';
export const STRIPE_API_VERSION = '2025-03-31.basil';
export const STRIPE_SIGNATURE_HEADER = 'stripe-signature';
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
export const STRIPE_REFERENCE_METADATA = 'vitrine_subscription';

const REFERENCE_PATTERN = /^vtr_[a-f0-9]{32}$/;
const CHECKOUT_HOSTS = new Set(['checkout.stripe.com']);
const PORTAL_HOSTS = new Set(['billing.stripe.com']);
const MAX_SIGNATURES = 8;
const LIST_LIMIT = 20;

const EVENT_KINDS = Object.freeze({
  'invoice.paid': 'payment_received',
  'invoice.payment_failed': 'payment_overdue',
  'customer.subscription.deleted': 'subscription_canceled'
});

export const STRIPE_HANDLED_EVENTS = Object.freeze(Object.keys(EVENT_KINDS));

const KEY_PREFIXES = {
  test: ['sk_test_', 'rk_test_'],
  live: ['sk_live_', 'rk_live_']
};

// Lê a configuração do ambiente do Worker. Nunca devolve a chave em `reason`.
export function resolveStripeConfig(env = {}) {
  const mode = env.STRIPE_ENV === 'live' ? 'live' : 'test';
  const apiKey = typeof env.STRIPE_SECRET_KEY === 'string' ? env.STRIPE_SECRET_KEY.trim() : '';
  if (!apiKey) return { configured: false, mode, reason: 'missing_api_key' };
  const other = mode === 'live' ? 'test' : 'live';
  if (KEY_PREFIXES[other].some((prefix) => apiKey.startsWith(prefix))) {
    return { configured: false, mode, reason: mode === 'live' ? 'test_key_in_live' : 'live_key_in_test' };
  }
  if (!KEY_PREFIXES[mode].some((prefix) => apiKey.startsWith(prefix))) {
    return { configured: false, mode, reason: 'invalid_api_key' };
  }
  return { configured: true, mode, apiBase: STRIPE_API_BASE, apiKey };
}

function providerId(value) {
  return typeof value === 'string' && PROVIDER_ID_PATTERN.test(value) ? value : null;
}

function reference(value) {
  return typeof value === 'string' && REFERENCE_PATTERN.test(value) ? value : null;
}

function randomHex(bytes) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function newStripeReference() {
  return `vtr_${randomHex(16)}`;
}

// application/x-www-form-urlencoded no formato do Stripe: a[b][0]=valor.
export function encodeStripeForm(data) {
  const params = new URLSearchParams();
  const add = (prefix, value) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) value.forEach((item, i) => add(`${prefix}[${i}]`, item));
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) add(prefix ? `${prefix}[${k}]` : k, v);
    else params.append(prefix, String(value));
  };
  add('', data);
  return params.toString();
}

function toIso(seconds) {
  return Number.isInteger(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : null;
}

// Metadado da referência nas duas formas da fatura: `parent.subscription_details`
// (API 2025-03-31.basil em diante) e `subscription_details` (versões anteriores).
function invoiceReference(invoice) {
  return reference(invoice?.parent?.subscription_details?.metadata?.[STRIPE_REFERENCE_METADATA])
    ?? reference(invoice?.subscription_details?.metadata?.[STRIPE_REFERENCE_METADATA]);
}

// Fim do período pago: o maior `period.end` das linhas da fatura. O `period_end` da
// própria fatura não serve, porque na renovação aponta para o período anterior.
function invoicePeriodEnd(invoice) {
  const lines = Array.isArray(invoice?.lines?.data) ? invoice.lines.data : [];
  const ends = lines.map((line) => line?.period?.end).filter((end) => Number.isInteger(end) && end > 0);
  return ends.length ? toIso(Math.max(...ends)) : null;
}

// Converte o evento do Stripe no evento normalizado da interface. `livemode` volta
// junto para a rota recusar evento live com o provedor em modo de teste (e o inverso).
export function parseStripeWebhookEvent(payload) {
  if (!payload || typeof payload !== 'object' || payload.object !== 'event') return null;
  const id = providerId(payload.id);
  const providerType = typeof payload.type === 'string' && /^[a-z_.]{1,64}$/.test(payload.type) ? payload.type : null;
  if (!id || !providerType || typeof payload.livemode !== 'boolean') return null;
  const object = payload.data?.object && typeof payload.data.object === 'object' ? payload.data.object : null;
  const kind = EVENT_KINDS[providerType] ?? 'other';
  let subscriptionId = null;
  let paymentId = null;
  let periodEnd = null;
  if (kind === 'subscription_canceled') {
    subscriptionId = reference(object?.metadata?.[STRIPE_REFERENCE_METADATA]);
  } else if (kind !== 'other' && object?.object === 'invoice') {
    subscriptionId = invoiceReference(object);
    paymentId = providerId(object.id);
    if (kind === 'payment_received') periodEnd = invoicePeriodEnd(object);
  }
  return { id, providerType, kind, subscriptionId, paymentId, periodEnd, livemode: payload.livemode };
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function signStripePayload(secret, timestamp, payload) {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${timestamp}.${payload}`)));
}

// Stripe-Signature: t=<segundos>,v1=<hex>[,v1=<hex>...]. Confere todas as v1 (pode
// haver mais de uma durante a troca do segredo) sem parar na primeira que bate.
export async function verifyStripeSignature(header, payload, secret, {
  now = Date.now(),
  toleranceSeconds = STRIPE_SIGNATURE_TOLERANCE_SECONDS
} = {}) {
  if (typeof header !== 'string' || typeof payload !== 'string' || typeof secret !== 'string' || !secret) return false;
  let timestamp = null;
  const signatures = [];
  for (const part of header.split(',')) {
    const index = part.indexOf('=');
    if (index < 1) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name === 't' && /^\d{1,12}$/.test(value)) timestamp = value;
    if (name === 'v1' && /^[a-f0-9]{64}$/.test(value) && signatures.length < MAX_SIGNATURES) signatures.push(value);
  }
  if (timestamp === null || !signatures.length) return false;
  if (Math.abs(Math.floor(now / 1000) - Number(timestamp)) > toleranceSeconds) return false;
  const expected = await signStripePayload(secret, timestamp, payload);
  const results = await Promise.all(signatures.map((signature) => timingSafeEqualText(signature, expected)));
  return results.includes(true);
}

async function readProviderError(response) {
  const body = await response.json().catch(() => null);
  const code = body?.error?.code ?? body?.error?.type;
  return typeof code === 'string' && /^[a-z0-9_]{1,64}$/i.test(code) ? code : null;
}

function safeUrl(value, hosts) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  return parsed.protocol === 'https:' && hosts.has(parsed.hostname) ? parsed.href : null;
}

// Sem configuração válida, as chamadas à API falham com kind 'not_configured'; o
// webhook continua conferindo a assinatura, que não depende da chave da API.
export function createStripeProvider(config, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const retry = { sleep: deps.sleep, timeoutMs: deps.timeoutMs, retryBaseMs: deps.retryBaseMs };
  const webhookSecret = typeof deps.webhookSecret === 'string' ? deps.webhookSecret : '';
  const nowMs = typeof deps.now === 'function' ? () => deps.now().getTime() : () => Date.now();

  // POST leva Idempotency-Key: a nova tentativa em 429/5xx não duplica a criação.
  async function call(method, path, body) {
    if (!config?.configured) {
      throw new BillingProviderError('A cobrança pelo Stripe não está configurada.', { kind: 'not_configured' });
    }
    const response = await fetchWithRetry(fetchImpl, `${config.apiBase}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        accept: 'application/json',
        'stripe-version': STRIPE_API_VERSION,
        ...(method === 'POST' ? { 'idempotency-key': `vtr-${randomHex(16)}`, 'content-type': 'application/x-www-form-urlencoded' } : {})
      },
      ...(body ? { body: encodeStripeForm(body) } : {})
    }, retry);
    if (!response.ok) {
      throw new BillingProviderError('O Stripe recusou a operação.', {
        status: response.status,
        providerCode: await readProviderError(response),
        retryable: response.status === 429 || response.status >= 500
      });
    }
    return response.json();
  }

  function requireId(value, what) {
    const id = providerId(value);
    if (!id) throw new BillingProviderError(`Identificador de ${what} inválido.`, { kind: 'invalid_id' });
    return id;
  }

  function requireReference(value) {
    const ref = reference(value);
    if (!ref) throw new BillingProviderError('Identificador de assinatura inválido.', { kind: 'invalid_id' });
    return ref;
  }

  async function subscriptionsFor(customerId, ref) {
    const query = new URLSearchParams({ customer: customerId, status: 'all', limit: String(LIST_LIMIT) });
    const data = await call('GET', `/subscriptions?${query}`);
    const list = Array.isArray(data?.data) ? data.data : [];
    return list.filter((sub) => sub?.metadata?.[STRIPE_REFERENCE_METADATA] === ref && providerId(sub.id));
  }

  return Object.freeze({
    name: 'stripe',
    mode: config?.mode ?? 'test',
    configured: Boolean(config?.configured),
    requiresTaxId: false,

    // Sem CPF ou CNPJ: o Stripe atende cartão internacional, e a Vitrine só manda o
    // mínimo (nome e e-mail).
    async createCustomer({ name, email, reference: tenantId }) {
      const data = await call('POST', '/customers', {
        name,
        email,
        preferred_locales: ['pt-BR'],
        ...(tenantId ? { metadata: { tenant_id: tenantId } } : {})
      });
      return { customerId: requireId(data?.id, 'cliente') };
    },

    // Checkout em modo assinatura, só cartão, preço mensal em reais da tabela de
    // planos. O cartão é digitado na página do Stripe; nunca passa pelo Worker.
    async createSubscription({ customerId, plan, reference: tenantId, successUrl, cancelUrl }) {
      const ref = newStripeReference();
      const metadata = { [STRIPE_REFERENCE_METADATA]: ref, ...(tenantId ? { tenant_id: tenantId } : {}) };
      const data = await call('POST', '/checkout/sessions', {
        mode: 'subscription',
        customer: requireId(customerId, 'cliente'),
        payment_method_types: ['card'],
        locale: 'pt-BR',
        line_items: [{
          quantity: 1,
          price_data: {
            currency: 'brl',
            unit_amount: plan.monthlyPriceCents,
            recurring: { interval: 'month' },
            product_data: { name: `Vitrine Inspira, plano ${plan.name}` }
          }
        }],
        ...(tenantId ? { client_reference_id: tenantId } : {}),
        metadata,
        subscription_data: { metadata },
        success_url: successUrl,
        cancel_url: cancelUrl
      });
      const checkoutUrl = safeUrl(data?.url, CHECKOUT_HOSTS);
      if (!checkoutUrl) {
        const sessionId = providerId(data?.id);
        if (sessionId) await call('POST', `/checkout/sessions/${encodeURIComponent(sessionId)}/expire`).catch(() => {});
        throw new BillingProviderError('O Stripe não devolveu a página de pagamento.', { kind: 'missing_checkout_url' });
      }
      return { subscriptionId: ref, checkoutUrl };
    },

    async getSubscription(subscriptionId, { customerId } = {}) {
      const ref = requireReference(subscriptionId);
      const [sub] = await subscriptionsFor(requireId(customerId, 'cliente'), ref);
      const periodEnd = sub?.items?.data?.[0]?.current_period_end ?? sub?.current_period_end;
      return {
        subscriptionId: ref,
        status: typeof sub?.status === 'string' ? sub.status : null,
        nextDueDate: toIso(periodEnd)?.slice(0, 10) ?? null
      };
    },

    // Cancela já (como o DELETE do Asaas); o plano vale até current_period_end no
    // banco. Também expira sessões de Checkout abertas da mesma referência, para que
    // um link antigo não gere cobrança sem plano.
    async cancelSubscription(subscriptionId, { customerId } = {}) {
      const ref = requireReference(subscriptionId);
      const customer = requireId(customerId, 'cliente');
      const query = new URLSearchParams({ customer, status: 'open', limit: String(LIST_LIMIT) });
      const sessions = await call('GET', `/checkout/sessions?${query}`);
      for (const session of Array.isArray(sessions?.data) ? sessions.data : []) {
        const id = providerId(session?.id);
        if (id && session?.metadata?.[STRIPE_REFERENCE_METADATA] === ref) {
          await call('POST', `/checkout/sessions/${encodeURIComponent(id)}/expire`);
        }
      }
      for (const sub of await subscriptionsFor(customer, ref)) {
        if (['canceled', 'incomplete_expired'].includes(sub.status)) continue;
        await call('DELETE', `/subscriptions/${encodeURIComponent(sub.id)}`);
      }
      return { canceled: true };
    },

    // Portal do cliente do Stripe: troca de cartão, faturas e cancelamento.
    async createPortalSession({ customerId, returnUrl }) {
      const data = await call('POST', '/billing_portal/sessions', {
        customer: requireId(customerId, 'cliente'),
        return_url: returnUrl,
        locale: 'pt-BR'
      });
      const portalUrl = safeUrl(data?.url, PORTAL_HOSTS);
      if (!portalUrl) throw new BillingProviderError('O Stripe não devolveu o portal do cliente.', { kind: 'missing_portal_url' });
      return { portalUrl };
    },

    async verifyWebhook(request, rawBody) {
      const payload = typeof rawBody === 'string' ? rawBody : await request.clone().text().catch(() => null);
      return verifyStripeSignature(request.headers.get(STRIPE_SIGNATURE_HEADER), payload, webhookSecret, { now: nowMs() });
    },

    parseWebhookEvent: parseStripeWebhookEvent
  });
}
