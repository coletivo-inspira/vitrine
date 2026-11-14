// Interface de provedor de cobrança (ADR 0013). O Asaas é o provedor padrão; o
// Stripe (src/billing/stripe.mjs, issue #116) implementa os mesmos métodos e
// reaproveita as rotas, a gravação de eventos e o mapeamento deste módulo.
//
// Um provedor é um objeto com:
//   name: 'asaas' | 'stripe' (o mesmo valor de public.subscriptions.provider)
//   createCustomer({ name, cpfCnpj, email, reference }) -> { customerId }
//   createSubscription({ customerId, plan, reference, successUrl, cancelUrl }) -> { subscriptionId, checkoutUrl }
//   getSubscription(subscriptionId, { customerId }) -> { subscriptionId, status, nextDueDate }
//   cancelSubscription(subscriptionId, { customerId }) -> { canceled: true }
//   verifyWebhook(request, rawBody?) -> Promise<boolean>
//   parseWebhookEvent(payload) -> NormalizedEvent | null
// Opcional: createPortalSession({ customerId, returnUrl }) -> { portalUrl } (Stripe).
// Opcional: listPayments(subscriptionId) -> Payment[] (histórico do painel, issue #115).
//
// Payment: { id, dueDate, paidDate, valueCents, state, invoiceUrl, receiptUrl }, com
// `state` em pending, paid, overdue, refunded ou other e links só do provedor.
//
// NormalizedEvent: { id, providerType, kind, subscriptionId, paymentId, periodEnd }
// `kind` é um de WEBHOOK_EVENT_KINDS; eventos que não mudam a assinatura usam 'other'.

export const BILLING_PROVIDER_METHODS = Object.freeze([
  'createCustomer',
  'createSubscription',
  'getSubscription',
  'cancelSubscription',
  'verifyWebhook',
  'parseWebhookEvent'
]);

export const WEBHOOK_EVENT_KINDS = Object.freeze([
  'payment_confirmed',
  'payment_received',
  'payment_overdue',
  'payment_refunded',
  'payment_deleted',
  'subscription_canceled',
  'other'
]);

export const PROVIDER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const DEFAULT_TIMEOUT_MS = 8000;
export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_RETRY_BASE_MS = 300;
const MAX_RETRY_DELAY_MS = 2000;

export function assertBillingProvider(provider) {
  if (!provider || typeof provider !== 'object' || !['asaas', 'stripe'].includes(provider.name)) {
    throw new TypeError('Billing provider must declare name asaas or stripe');
  }
  for (const method of BILLING_PROVIDER_METHODS) {
    if (typeof provider[method] !== 'function') throw new TypeError(`Billing provider is missing ${method}`);
  }
  return provider;
}

// Erro do provedor sem corpo da resposta, URL com parâmetros nem credenciais:
// só a situação HTTP e, quando houver, o código de erro do provedor.
export class BillingProviderError extends Error {
  constructor(message, { status = 0, providerCode = null, retryable = false, kind = 'http' } = {}) {
    super(message);
    this.name = 'BillingProviderError';
    this.status = status;
    this.providerCode = providerCode;
    this.retryable = retryable;
    this.kind = kind;
  }
}

export function isRetryableStatus(status) {
  return status === 429 || (status >= 500 && status <= 599);
}

// O Asaas manda RateLimit-Reset (segundos) no 429. Se a liberação passar do teto de
// espera, não há nova tentativa: o Worker não fica preso esperando.
function retryDelay(attempt, baseMs, response) {
  const header = Number(response?.headers?.get?.('ratelimit-reset') ?? response?.headers?.get?.('retry-after'));
  const fromHeader = Number.isFinite(header) && header > 0 ? header * 1000 : 0;
  const delay = Math.max(baseMs * 2 ** (attempt - 1), fromHeader);
  return delay > MAX_RETRY_DELAY_MS ? null : delay;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Até `maxAttempts` chamadas, com espera crescente, só para 429 e 5xx. Falha de rede
// e tempo esgotado não são repetidos: uma criação pode ter chegado ao provedor.
export async function fetchWithRetry(fetchImpl, url, init = {}, options = {}) {
  const maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseMs = options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS;
  const sleep = options.sleep ?? defaultSleep;
  for (let attempt = 1; ; attempt += 1) {
    let response;
    try {
      response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
      throw new BillingProviderError(
        timedOut ? 'O provedor de cobrança não respondeu a tempo.' : 'Falha de rede ao falar com o provedor de cobrança.',
        { kind: timedOut ? 'timeout' : 'network' }
      );
    }
    if (!isRetryableStatus(response.status) || attempt >= maxAttempts) return response;
    const delay = retryDelay(attempt, baseMs, response);
    if (delay === null) return response;
    await response.body?.cancel?.().catch(() => {});
    await sleep(delay);
  }
}

// Comparação em tempo constante: compara os SHA-256 dos dois textos, então nem o
// tamanho do segredo vaza pelo tempo de resposta.
export async function timingSafeEqualText(received, expected) {
  if (typeof received !== 'string' || typeof expected !== 'string' || !expected) return false;
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(received)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected))
  ]);
  const left = new Uint8Array(a);
  const right = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left[i] ^ right[i];
  return diff === 0;
}

// Mudança de public.subscriptions para cada tipo de evento. `periodMode`:
//   extend: current_period_end passa a max(atual, periodEnd)
//   clamp:  current_period_end passa a min(atual, periodEnd); a tolerância conta dali
//   keep:   não mexe
// O banco (public.billing_apply_event) ainda recusa reabrir assinatura cancelada e
// pôr em atraso uma assinatura que nunca foi paga.
export function subscriptionChangeFor(event, now = new Date()) {
  switch (event?.kind) {
    case 'payment_confirmed':
    case 'payment_received':
      return event.periodEnd
        ? { status: 'active', periodEnd: event.periodEnd, periodMode: 'extend' }
        : { status: 'active', periodEnd: null, periodMode: 'keep' };
    case 'payment_overdue':
    case 'payment_deleted':
      return { status: 'past_due', periodEnd: null, periodMode: 'keep' };
    case 'payment_refunded':
      return { status: 'past_due', periodEnd: now.toISOString(), periodMode: 'clamp' };
    case 'subscription_canceled':
      return { status: 'canceled', periodEnd: null, periodMode: 'keep' };
    default:
      return null;
  }
}

function checkDigits(base, weights) {
  const total = [...base].reduce((sum, char, i) => sum + (char.charCodeAt(0) - 48) * weights[i], 0);
  const rest = total % 11;
  return rest < 2 ? 0 : 11 - rest;
}

// CPF (11 dígitos) ou CNPJ (14 posições; as 12 primeiras podem ser letras, formato
// alfanumérico da Receita). Devolve só os caracteres, sem pontuação, ou null.
export function normalizeTaxId(value) {
  if (typeof value !== 'string') return null;
  const id = value.toUpperCase().replace(/[.\-/\s]/g, '');
  if (/^\d{11}$/.test(id)) {
    if (/^(\d)\1{10}$/.test(id)) return null;
    const d1 = checkDigits(id.slice(0, 9), [10, 9, 8, 7, 6, 5, 4, 3, 2]);
    const d2 = checkDigits(id.slice(0, 9) + d1, [11, 10, 9, 8, 7, 6, 5, 4, 3, 2]);
    return id.endsWith(`${d1}${d2}`) ? id : null;
  }
  if (/^[0-9A-Z]{12}\d{2}$/.test(id)) {
    if (/^(\d)\1{13}$/.test(id)) return null;
    const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const d1 = checkDigits(id.slice(0, 12), w1);
    const d2 = checkDigits(id.slice(0, 12) + d1, [6, ...w1]);
    return id.endsWith(`${d1}${d2}`) ? id : null;
  }
  return null;
}

const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;

// Dados de cobrança do checkout. Vão só para o provedor; nunca para o banco. Com
// requireTaxId false (Stripe, cliente do exterior), o CPF ou CNPJ é descartado.
export function validateBillingDetails(input, { requireTaxId = true } = {}) {
  const errors = [];
  const name = typeof input?.name === 'string' ? input.name.trim().replace(/\s+/g, ' ') : '';
  if (name.length < 2 || name.length > 100) errors.push('name');
  const cpfCnpj = requireTaxId ? normalizeTaxId(input?.cpfCnpj) : null;
  if (requireTaxId && !cpfCnpj) errors.push('cpfCnpj');
  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : '';
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) errors.push('email');
  if (errors.length) return { ok: false, fields: errors };
  return { ok: true, value: requireTaxId ? { name, cpfCnpj, email } : { name, email } };
}
