// Provedor Asaas (ADR 0013, issue #113). Sandbox por padrão: a URL de produção só é
// usada com ASAAS_ENV=production explícito. A chave vai só no cabeçalho
// `access_token`; nunca em URL, erro ou log.
import {
  BillingProviderError,
  PROVIDER_ID_PATTERN,
  fetchWithRetry,
  timingSafeEqualText
} from './provider.mjs';

export const ASAAS_SANDBOX_API_BASE = 'https://api-sandbox.asaas.com/v3';
export const ASAAS_PRODUCTION_API_BASE = 'https://api.asaas.com/v3';
export const ASAAS_WEBHOOK_HEADER = 'asaas-access-token';

const SANDBOX_HOSTS = new Set(['api-sandbox.asaas.com', 'sandbox.asaas.com']);
const PRODUCTION_HOSTS = new Set(['api.asaas.com']);
const CHECKOUT_HOSTS = /^(?:[a-z0-9-]+\.)*asaas\.com$/;
const USER_AGENT = 'vitrine-inspira';
const BRAZIL_OFFSET_MS = 3 * 60 * 60 * 1000;

const EVENT_KINDS = Object.freeze({
  PAYMENT_CONFIRMED: 'payment_confirmed',
  PAYMENT_RECEIVED: 'payment_received',
  PAYMENT_OVERDUE: 'payment_overdue',
  PAYMENT_REFUNDED: 'payment_refunded',
  PAYMENT_CHARGEBACK_REQUESTED: 'payment_refunded',
  PAYMENT_DELETED: 'payment_deleted',
  SUBSCRIPTION_DELETED: 'subscription_canceled',
  SUBSCRIPTION_INACTIVATED: 'subscription_canceled'
});

export const ASAAS_HANDLED_EVENTS = Object.freeze(Object.keys(EVENT_KINDS));

// Lê a configuração do ambiente do Worker. Nunca devolve a chave em `reason`.
export function resolveAsaasConfig(env = {}) {
  const mode = env.ASAAS_ENV === 'production' ? 'production' : 'sandbox';
  const rawBase = typeof env.ASAAS_API_BASE === 'string' && env.ASAAS_API_BASE.trim()
    ? env.ASAAS_API_BASE.trim()
    : mode === 'production' ? ASAAS_PRODUCTION_API_BASE : ASAAS_SANDBOX_API_BASE;
  let base;
  try {
    base = new URL(rawBase);
  } catch {
    return { configured: false, mode, reason: 'invalid_api_base' };
  }
  const allowedHosts = mode === 'production' ? PRODUCTION_HOSTS : SANDBOX_HOSTS;
  if (base.protocol !== 'https:' || !allowedHosts.has(base.hostname) || base.search || base.hash) {
    return { configured: false, mode, reason: 'api_base_not_allowed' };
  }
  const apiKey = typeof env.ASAAS_API_KEY === 'string' ? env.ASAAS_API_KEY.trim() : '';
  if (!apiKey) return { configured: false, mode, reason: 'missing_api_key' };
  // Chaves do Asaas indicam o ambiente: $aact_prod_ (produção) e $aact_hmlg_ (sandbox).
  if (mode === 'sandbox' && apiKey.startsWith('$aact_prod_')) {
    return { configured: false, mode, reason: 'production_key_in_sandbox' };
  }
  if (mode === 'production' && apiKey.startsWith('$aact_hmlg_')) {
    return { configured: false, mode, reason: 'sandbox_key_in_production' };
  }
  return { configured: true, mode, apiBase: base.href.replace(/\/+$/, ''), apiKey };
}

function addOneMonth(isoDate) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate ?? '');
  if (!match) return null;
  const [year, month, day] = match.slice(1).map(Number);
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(year, month, Math.min(day, lastDay)));
  if (Number.isNaN(next.getTime())) return null;
  // Meia-noite em Brasília (UTC-3, sem horário de verão desde 2019).
  return new Date(next.getTime() + BRAZIL_OFFSET_MS).toISOString();
}

export function todayInBrazil(now = new Date()) {
  return new Date(now.getTime() - BRAZIL_OFFSET_MS).toISOString().slice(0, 10);
}

function providerId(value) {
  return typeof value === 'string' && PROVIDER_ID_PATTERN.test(value) ? value : null;
}

// Converte o corpo do webhook do Asaas no evento normalizado da interface. A
// cobrança mensal cobre de `dueDate` até um mês depois; esse é o current_period_end.
export function parseAsaasWebhookEvent(payload) {
  if (!payload || typeof payload !== 'object') return null;
  const id = providerId(payload.id);
  const providerType = typeof payload.event === 'string' && /^[A-Z_]{1,64}$/.test(payload.event) ? payload.event : null;
  if (!id || !providerType) return null;
  const kind = EVENT_KINDS[providerType] ?? 'other';
  const payment = payload.payment && typeof payload.payment === 'object' ? payload.payment : null;
  const subscription = payload.subscription && typeof payload.subscription === 'object' ? payload.subscription : null;
  const subscriptionId = kind === 'subscription_canceled'
    ? providerId(subscription?.id)
    : providerId(payment?.subscription) ?? providerId(subscription?.id);
  return {
    id,
    providerType,
    kind,
    subscriptionId,
    paymentId: providerId(payment?.id),
    periodEnd: payment && (kind === 'payment_confirmed' || kind === 'payment_received')
      ? addOneMonth(payment.dueDate)
      : null
  };
}

async function readProviderError(response) {
  const body = await response.json().catch(() => null);
  const code = body?.errors?.[0]?.code;
  return typeof code === 'string' && /^[a-z0-9_]{1,64}$/i.test(code) ? code : null;
}

// Sem configuração válida, as chamadas à API falham com kind 'not_configured'; o
// webhook continua conferindo o token, que não depende da chave da API.
export function createAsaasProvider(config, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch.bind(globalThis);
  const retry = { sleep: deps.sleep, timeoutMs: deps.timeoutMs, retryBaseMs: deps.retryBaseMs };
  const webhookToken = typeof deps.webhookToken === 'string' ? deps.webhookToken : '';

  async function call(method, path, body) {
    if (!config?.configured) {
      throw new BillingProviderError('A cobrança não está configurada.', { kind: 'not_configured' });
    }
    const response = await fetchWithRetry(fetchImpl, `${config.apiBase}${path}`, {
      method,
      headers: {
        access_token: config.apiKey,
        accept: 'application/json',
        'user-agent': USER_AGENT,
        ...(body ? { 'content-type': 'application/json' } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }, retry);
    if (!response.ok) {
      throw new BillingProviderError('O Asaas recusou a operação.', {
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

  return Object.freeze({
    name: 'asaas',
    mode: config?.mode ?? 'sandbox',
    configured: Boolean(config?.configured),

    async createCustomer({ name, cpfCnpj, email, reference }) {
      const data = await call('POST', '/customers', {
        name, cpfCnpj, email, ...(reference ? { externalReference: reference } : {})
      });
      return { customerId: requireId(data?.id, 'cliente') };
    },

    // billingType UNDEFINED deixa a pessoa escolher Pix, boleto ou cartão na página
    // de pagamento do Asaas; o cartão nunca passa pelo Worker.
    async createSubscription({ customerId, plan, reference, now = new Date() }) {
      const data = await call('POST', '/subscriptions', {
        customer: requireId(customerId, 'cliente'),
        billingType: 'UNDEFINED',
        cycle: 'MONTHLY',
        value: plan.monthlyPriceCents / 100,
        nextDueDate: todayInBrazil(now),
        description: `Vitrine Inspira, plano ${plan.name}`,
        ...(reference ? { externalReference: reference } : {})
      });
      const subscriptionId = requireId(data?.id, 'assinatura');
      const payments = await call('GET', `/subscriptions/${encodeURIComponent(subscriptionId)}/payments?limit=1`);
      const checkoutUrl = payments?.data?.[0]?.invoiceUrl;
      let parsed = null;
      try {
        parsed = new URL(checkoutUrl);
      } catch {
        parsed = null;
      }
      if (!parsed || parsed.protocol !== 'https:' || !CHECKOUT_HOSTS.test(parsed.hostname)) {
        await call('DELETE', `/subscriptions/${encodeURIComponent(subscriptionId)}`).catch(() => {});
        throw new BillingProviderError('O Asaas não devolveu a página de pagamento.', { kind: 'missing_checkout_url' });
      }
      return { subscriptionId, checkoutUrl: parsed.href };
    },

    async getSubscription(subscriptionId) {
      const id = requireId(subscriptionId, 'assinatura');
      const data = await call('GET', `/subscriptions/${encodeURIComponent(id)}`);
      return {
        subscriptionId: requireId(data?.id, 'assinatura'),
        status: typeof data?.status === 'string' ? data.status : null,
        nextDueDate: typeof data?.nextDueDate === 'string' ? data.nextDueDate : null
      };
    },

    async cancelSubscription(subscriptionId) {
      const id = requireId(subscriptionId, 'assinatura');
      const data = await call('DELETE', `/subscriptions/${encodeURIComponent(id)}`);
      return { canceled: data?.deleted === true };
    },

    async verifyWebhook(request) {
      return timingSafeEqualText(request.headers.get(ASAAS_WEBHOOK_HEADER) ?? '', webhookToken);
    },

    parseWebhookEvent: parseAsaasWebhookEvent
  });
}
