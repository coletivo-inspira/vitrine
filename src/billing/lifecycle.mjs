// Ciclo da assinatura (issue #114, ADR 0013 Cobrança item 6). O banco é a fonte da
// verdade: public.billing_lifecycle_tick move as assinaturas e
// private.site_entitlements decide os direitos. Este módulo tem a regra espelhada em
// JavaScript (aviso do painel e testes), a chamada do Cron e a resposta do domínio
// próprio que deixou de ser canônico. workers/api.mjs só chama estas funções.

export const GRACE_DAYS = 7;
export const NOTICE_DAYS = 3;
export const LIFECYCLE_BATCH = 200;
export const LIFECYCLE_TIMEOUT_MS = 8000;
// Resposta de recurso pago desligado (vitrine.json, pré-orçamento): curta, para que a
// reativação apareça logo.
export const PAID_FEATURE_GONE_CACHE_CONTROL = 'public, max-age=60';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOTICE_SEVERITY = { suspended: 3, grace: 2, due_soon: 1 };

function toTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const time = value instanceof Date ? value.getTime() : Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

function graceUntilTime(sub) {
  const explicit = toTime(sub?.grace_until ?? sub?.graceUntil);
  if (explicit !== null) return explicit;
  const periodEnd = toTime(sub?.current_period_end ?? sub?.currentPeriodEnd);
  return periodEnd === null ? null : periodEnd + GRACE_DAYS * DAY_MS;
}

// Mesmo resultado de public.billing_lifecycle_tick para uma linha. Devolve
// { status, graceUntil } quando a assinatura muda, ou null.
export function nextLifecycleState(sub, now = new Date()) {
  const at = toTime(now);
  const periodEnd = toTime(sub?.current_period_end ?? sub?.currentPeriodEnd);
  const until = graceUntilTime(sub);
  const overdue = ['active', 'past_due'].includes(sub?.status) && periodEnd !== null && periodEnd <= at;
  const graceOver = sub?.status === 'grace' && until !== null && until <= at;
  if (!overdue && !graceOver) return null;
  return { status: until <= at ? 'suspended' : 'grace', graceUntil: new Date(until).toISOString() };
}

// Faixa do Início: 3 dias antes do vencimento, durante a tolerância e na suspensão.
export function subscriptionNotice(sub, now = new Date()) {
  const at = toTime(now);
  const status = sub?.status;
  const periodEnd = toTime(sub?.current_period_end ?? sub?.currentPeriodEnd);
  const until = graceUntilTime(sub);
  const base = {
    tenantId: sub?.tenant_id ?? sub?.tenantId ?? null,
    planCode: sub?.plan_code ?? sub?.planCode ?? null,
    planName: sub?.plan_name ?? sub?.planName ?? null,
    dueDate: periodEnd === null ? null : new Date(periodEnd).toISOString(),
    graceUntil: until === null ? null : new Date(until).toISOString()
  };
  const late = ['active', 'past_due', 'grace'].includes(status) && periodEnd !== null && periodEnd <= at;
  if (status === 'suspended' || ((late || status === 'grace') && until !== null && until <= at)) {
    return { ...base, kind: 'suspended', daysLeft: 0 };
  }
  if (late || (status === 'grace' && until !== null)) {
    return { ...base, kind: 'grace', daysLeft: Math.max(1, Math.ceil((until - at) / DAY_MS)) };
  }
  if (['active', 'past_due'].includes(status) && periodEnd !== null && periodEnd - at <= NOTICE_DAYS * DAY_MS) {
    return { ...base, kind: 'due_soon', daysLeft: Math.max(1, Math.ceil((periodEnd - at) / DAY_MS)) };
  }
  return null;
}

const OPEN_STATUSES = new Set(['active', 'past_due', 'grace']);

// Situação mostrada na tela "Plano e cobrança" (issue #115), com a mesma regra de datas
// de private.site_entitlements: `state` em none, pending, active, grace, suspended ou
// canceled, e `effectivePlanCode` é o plano que vale agora.
export function subscriptionSummary(sub, now = new Date()) {
  const at = toTime(now);
  const status = sub?.status ?? null;
  const planCode = sub?.plan_code ?? sub?.planCode ?? null;
  const periodEnd = toTime(sub?.current_period_end ?? sub?.currentPeriodEnd);
  const until = graceUntilTime(sub);
  const iso = (time) => (time === null ? null : new Date(time).toISOString());
  const base = {
    planCode,
    status,
    provider: sub?.provider ?? null,
    currentPeriodEnd: iso(periodEnd),
    graceUntil: null,
    accessUntil: null
  };
  if (!sub || !status) return { ...base, state: 'none', effectivePlanCode: 'free' };
  if (status === 'pending') return { ...base, state: 'pending', effectivePlanCode: 'free' };
  if (status === 'canceled') {
    const valid = periodEnd !== null && periodEnd > at;
    return { ...base, state: 'canceled', accessUntil: valid ? iso(periodEnd) : null, effectivePlanCode: valid ? planCode : 'free' };
  }
  const late = OPEN_STATUSES.has(status) && periodEnd !== null && periodEnd <= at;
  if (status === 'suspended' || ((late || status !== 'active') && until !== null && until <= at)) {
    return { ...base, state: 'suspended', graceUntil: iso(until), effectivePlanCode: 'free' };
  }
  if (late || status === 'past_due' || status === 'grace') {
    return { ...base, state: 'grace', graceUntil: iso(until), effectivePlanCode: planCode };
  }
  if (status === 'active') return { ...base, state: 'active', effectivePlanCode: planCode };
  return { ...base, state: 'none', effectivePlanCode: 'free' };
}

// O aviso mais grave entre as organizações da pessoa (a suspensão antes da tolerância,
// e entre iguais o prazo mais curto).
export function pickSubscriptionNotice(rows, now = new Date()) {
  const notices = (Array.isArray(rows) ? rows : [])
    .map((row) => subscriptionNotice(row, now))
    .filter(Boolean);
  notices.sort((a, b) =>
    NOTICE_SEVERITY[b.kind] - NOTICE_SEVERITY[a.kind] || a.daysLeft - b.daysLeft);
  return notices[0] ?? null;
}

// Uma única chamada ao banco por execução do Cron, qualquer que seja o número de
// assinaturas: cabe no limite de subrequests do Workers Free. O que passar do lote
// fica para a próxima execução (hasMore).
export async function runSubscriptionLifecycle(env = {}, { fetch: customFetch, batch = LIFECYCLE_BATCH } = {}) {
  const baseUrl = String(env.SUPABASE_URL ?? '').replace(/\/+$/, '');
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) return { skipped: true };
  const fetchImpl = customFetch ?? globalThis.fetch.bind(globalThis);
  const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/billing_lifecycle_tick`, {
    method: 'POST',
    headers: { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ max_rows: batch }),
    signal: AbortSignal.timeout(LIFECYCLE_TIMEOUT_MS)
  });
  // 404: migração ainda não aplicada; nada a fazer até lá.
  if (response.status === 404) return { skipped: true };
  if (!response.ok) throw new Error(`Falha na verificação das assinaturas (${response.status}).`);
  const result = await response.json();
  return {
    grace: Number(result?.grace) || 0,
    suspended: Number(result?.suspended) || 0,
    hasMore: result?.hasMore === true
  };
}

// Rota do domínio próprio. Sem store.resolveDomainRoute (ou sem a migração), o domínio
// ativo continua canônico, como antes da issue #114.
export async function resolveShowcaseRoute(store, hostname) {
  if (typeof store?.resolveDomainRoute === 'function') {
    const route = await store.resolveDomainRoute(hostname);
    if (route !== undefined) return route?.slug ? { slug: route.slug, canonical: route.canonical !== false } : null;
  }
  if (typeof store?.resolveDomain !== 'function') return null;
  const slug = await store.resolveDomain(hostname);
  return slug ? { slug, canonical: true } : null;
}

// Leitura de public.resolve_showcase_host pelo PostgREST. Devolve undefined quando a
// função ainda não existe no banco.
export async function fetchShowcaseRoute({ baseUrl, headers, fetch: fetchImpl }, hostname) {
  const endpoint = new URL(`${baseUrl}/rest/v1/rpc/resolve_showcase_host`);
  endpoint.searchParams.set('requested_hostname', hostname);
  const response = await fetchImpl(endpoint, { headers });
  if (response.status === 404) return undefined;
  if (!response.ok) throw new Error('Falha ao resolver o domínio.');
  const rows = await response.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.slug ? { slug: row.slug, canonical: row.canonical === true } : null;
}

// Vitrine suspensa no domínio próprio: redirecionamento temporário (302, sem cache)
// para o endereço da plataforma, que volta a ser o canônico. Na reativação o domínio
// volta a responder direto, sem ação manual.
export function nonCanonicalDomainResponse(publicSiteOrigin, path) {
  return new Response(null, {
    status: 302,
    headers: {
      location: `${String(publicSiteOrigin).replace(/\/+$/, '')}${path}`,
      'cache-control': 'no-store'
    }
  });
}

// Para rotas públicas de recurso pago (vitrine.json na #120, webhook de pré-orçamento
// na #121): depois de requirePlanFeature falhar, responda com isto.
export function paidFeatureGoneResponse() {
  return new Response(null, {
    status: 404,
    headers: { 'cache-control': PAID_FEATURE_GONE_CACHE_CONTROL }
  });
}
