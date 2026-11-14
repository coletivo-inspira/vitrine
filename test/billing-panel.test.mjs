import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from '../workers/api.mjs';
import { subscriptionSummary } from '../src/billing/lifecycle.mjs';
import { createAsaasProvider, projectAsaasPayment, resolveAsaasConfig } from '../src/billing/asaas.mjs';
import { FREE_ENTITLEMENTS, normalizeEntitlements, planGateSummary } from '../src/entitlements.mjs';
import {
  PRICING_END, PRICING_START, applyPricingPage, renderPricingSection, salesFeeComparison
} from '../src/pricing-page.mjs';
import { validatePlanTable } from '../src/plans.mjs';
import { withSubmitLock } from '../web/portal/ui-state.mjs';

// Valores fictícios óbvios: nada aqui é chave real.
const FAKE_KEY = '$aact_hmlg_CHAVE_FICTICIA_DE_TESTE_000';
const ORIGIN = 'https://vitrine.inspira.dev.br';
const OWNER = '80000000-0000-0000-0000-00000000000a';
const OTHER = '80000000-0000-0000-0000-00000000000b';
const TENANT = '81000000-0000-0000-0000-00000000000a';
const DAY = 24 * 60 * 60 * 1000;
const DUE = Date.parse('2026-12-01T03:00:00Z');
const at = (days) => new Date(DUE + days * DAY);
const root = fileURLToPath(new URL('../', import.meta.url));
const plansSource = JSON.parse(await readFile(new URL('../content/plans.json', import.meta.url), 'utf8'));
const row = (status, extra = {}) => ({
  tenant_id: TENANT, plan_code: 'profissional', status, provider: 'asaas', provider_subscription_id: 'sub_1',
  current_period_end: new Date(DUE).toISOString(), grace_until: null, ...extra
});

test('resumo da assinatura segue as datas: ativa, tolerância, suspensa, cancelada e pendente', () => {
  assert.equal(subscriptionSummary(null).state, 'none');
  assert.equal(subscriptionSummary(null).effectivePlanCode, 'free');
  assert.deepEqual(
    (({ state, effectivePlanCode }) => ({ state, effectivePlanCode }))(subscriptionSummary(row('active'), at(-5))),
    { state: 'active', effectivePlanCode: 'profissional' }
  );
  const late = subscriptionSummary(row('active'), at(2));
  assert.equal(late.state, 'grace', 'vencida antes do Cron já aparece em tolerância');
  assert.equal(late.graceUntil, new Date(DUE + 7 * DAY).toISOString());
  assert.equal(subscriptionSummary(row('grace'), at(6)).effectivePlanCode, 'profissional');
  assert.equal(subscriptionSummary(row('grace'), at(8)).state, 'suspended');
  assert.equal(subscriptionSummary(row('suspended'), at(8)).effectivePlanCode, 'free');
  const canceled = subscriptionSummary(row('canceled'), at(-3));
  assert.deepEqual([canceled.state, canceled.accessUntil, canceled.effectivePlanCode], ['canceled', new Date(DUE).toISOString(), 'profissional']);
  assert.equal(subscriptionSummary(row('canceled'), at(1)).effectivePlanCode, 'free');
  assert.equal(subscriptionSummary(row('pending', { current_period_end: null }), at(0)).state, 'pending');
  assert.equal(subscriptionSummary(row('active', { provider: 'manual', current_period_end: null }), at(9)).state, 'active');
});

test('faturas do Asaas: só id, datas, valor, situação e links do próprio Asaas', async () => {
  const projected = projectAsaasPayment({
    id: 'pay_1', dueDate: '2026-11-01', paymentDate: '2026-11-01', value: 89, status: 'RECEIVED',
    invoiceUrl: 'https://sandbox.asaas.com/i/abc', transactionReceiptUrl: 'https://sandbox.asaas.com/comprovantes/abc',
    customer: 'cus_1', description: 'Maria da Silva 123.456.789-09', billingType: 'PIX'
  });
  assert.deepEqual(projected, {
    id: 'pay_1', dueDate: '2026-11-01', paidDate: '2026-11-01', valueCents: 8900, state: 'paid',
    invoiceUrl: 'https://sandbox.asaas.com/i/abc', receiptUrl: 'https://sandbox.asaas.com/comprovantes/abc'
  });
  assert.equal(projectAsaasPayment({ id: 'pay_2', dueDate: '2026-12-01', status: 'OVERDUE', invoiceUrl: 'https://outro.exemplo/i' }).invoiceUrl, null);
  assert.equal(projectAsaasPayment({ id: '../x', dueDate: '2026-12-01' }), null);

  const calls = [];
  const provider = createAsaasProvider(resolveAsaasConfig({ ASAAS_API_KEY: FAKE_KEY }), {
    fetch: async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      return Response.json({ data: [
        { id: 'pay_a', dueDate: '2026-10-01', value: 89, status: 'RECEIVED' },
        { id: 'pay_b', dueDate: '2026-11-01', value: 89, status: 'PENDING' }
      ] });
    }
  });
  const items = await provider.listPayments('sub_1');
  assert.deepEqual(items.map((item) => item.id), ['pay_b', 'pay_a'], 'mais recente primeiro');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api-sandbox.asaas.com/v3/subscriptions/sub_1/payments?limit=12');
  assert.doesNotMatch(calls[0].url, /aact/);
});

function overviewStore({ rows = [row('active')], tenants = [{ id: TENANT, name: 'Ateliê Maria' }], fail = false } = {}) {
  const seen = [];
  return {
    seen,
    async listOwnedTenants({ userId, token }) {
      seen.push({ userId, token });
      if (fail) throw new Error('banco fora');
      return userId === OWNER ? tenants : [];
    },
    async listSubscriptions(ids) { return rows.filter((entry) => ids.includes(entry.tenant_id)); },
    async readNotices() { return []; },
    async getTenantOwner() { return OWNER; },
    async getSubscription() { return rows[0] ?? null; }
  };
}

function overviewHandler(store, { payments, now = at(-5), providerCalls = [] } = {}) {
  return createApiHandler({
    billingStore: store,
    now: () => now,
    fetch: async (url, init = {}) => {
      providerCalls.push(`${init.method ?? 'GET'} ${new URL(url).pathname}`);
      if (payments === 'fail') return new Response(null, { status: 503 });
      return Response.json({ data: payments ?? [] });
    },
    authVerifier: (token) => ({ 'sessao-dono': { id: OWNER }, 'sessao-outra': { id: OTHER } })[token] ?? null
  });
}

const getOverview = (handler, env, token = 'sessao-dono') => handler(new Request(`${ORIGIN}/api/billing/overview`, {
  headers: token ? { authorization: `Bearer ${token}` } : {}
}), env);

test('GET /api/billing/overview: dono vê plano, situação, vencimento e faturas, sem identificadores internos', async () => {
  const store = overviewStore();
  const providerCalls = [];
  const handler = overviewHandler(store, {
    providerCalls,
    payments: [{ id: 'pay_9', dueDate: '2026-11-01', value: 89, status: 'RECEIVED', transactionReceiptUrl: 'https://sandbox.asaas.com/c/9' }]
  });
  const env = { ASAAS_API_KEY: FAKE_KEY };
  assert.equal((await getOverview(handler, env, null)).status, 401);
  const response = await getOverview(handler, env);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const body = await response.json();
  assert.equal(body.billing.available, true);
  assert.equal(body.billing.mode, 'sandbox');
  assert.deepEqual(body.plans.map((plan) => plan.code), ['free', 'essencial', 'profissional', 'equipe']);
  const [org] = body.organizations;
  assert.equal(org.plan.name, 'Profissional');
  assert.equal(org.subscription.state, 'active');
  assert.equal(org.subscription.currentPeriodEnd, new Date(DUE).toISOString());
  assert.equal(org.canCheckout, false, 'assinatura em vigor não abre outro checkout');
  assert.equal(org.canCancel, true);
  assert.deepEqual(org.invoices.items.map((item) => [item.id, item.state, item.receiptUrl]), [['pay_9', 'paid', 'https://sandbox.asaas.com/c/9']]);
  assert.doesNotMatch(JSON.stringify(body), /sub_1|provider_subscription_id|cus_/);
  assert.deepEqual(providerCalls, ['GET /v3/subscriptions/sub_1/payments']);
  assert.deepEqual(store.seen.at(-1), { userId: OWNER, token: 'sessao-dono' });

  const other = await (await getOverview(handler, env, 'sessao-outra')).json();
  assert.deepEqual(other.organizations, [], 'quem não é dono não recebe cobrança');
  assert.equal((await handler(new Request(`${ORIGIN}/api/billing/overview`, {
    method: 'POST', headers: { authorization: 'Bearer sessao-dono' }
  }), env)).status, 405);
});

test('overview sem ASAAS_API_KEY mostra cobrança indisponível sem quebrar; falhas viram erro, nunca "sem faturas"', async () => {
  const providerCalls = [];
  const noKey = await (await getOverview(overviewHandler(overviewStore(), { providerCalls }), {})).json();
  assert.equal(noKey.billing.available, false);
  assert.equal(noKey.organizations[0].canCheckout, false);
  assert.equal(noKey.organizations[0].canCancel, false);
  assert.equal(noKey.organizations[0].invoices.status, 'unavailable');
  assert.deepEqual(providerCalls, [], 'sem chave, nenhuma chamada ao Asaas');

  const prodKey = await (await getOverview(overviewHandler(overviewStore()), { ASAAS_API_KEY: '$aact_prod_FICTICIA' })).json();
  assert.equal(prodKey.billing.available, false, 'chave de produção não liga a cobrança sem ASAAS_ENV=production');

  const invoicesDown = await (await getOverview(overviewHandler(overviewStore(), { payments: 'fail' }), { ASAAS_API_KEY: FAKE_KEY })).json();
  assert.equal(invoicesDown.organizations[0].invoices.status, 'error');

  const storeDown = await getOverview(overviewHandler(overviewStore({ fail: true })), { ASAAS_API_KEY: FAKE_KEY });
  assert.equal(storeDown.status, 503);

  const suspended = await (await getOverview(overviewHandler(overviewStore({ rows: [row('suspended')] }), { now: at(9) }), { ASAAS_API_KEY: FAKE_KEY })).json();
  assert.equal(suspended.organizations[0].subscription.state, 'suspended');
  assert.equal(suspended.organizations[0].plan.code, 'free');
  assert.equal(suspended.organizations[0].canCheckout, true, 'suspensa pode contratar de novo');

  const noStore = await (await getOverview(createApiHandler({
    authVerifier: (token) => (token === 'sessao-dono' ? { id: OWNER } : null)
  }), {})).json();
  assert.deepEqual([noStore.billing.available, noStore.organizations], [false, []]);
});

test('selos de plano: free mostra Essencial no domínio e no SEO e Profissional nos blocos', async () => {
  const free = planGateSummary(FREE_ENTITLEMENTS);
  assert.deepEqual(free.plan, { code: 'free', name: 'Gratuito/Social' });
  assert.deepEqual(free.locked, {
    custom_domain: { code: 'essencial', name: 'Essencial' },
    local_seo: { code: 'essencial', name: 'Essencial' },
    item_blocks: { code: 'profissional', name: 'Profissional' }
  });
  assert.deepEqual(planGateSummary(normalizeEntitlements({ plan_code: 'essencial' })).locked, {
    custom_domain: null, local_seo: null, item_blocks: { code: 'profissional', name: 'Profissional' }
  });
  assert.deepEqual(Object.values(planGateSummary(normalizeEntitlements({ plan_code: 'equipe' })).locked), [null, null, null]);

  const api = createApiHandler();
  const send = (path, token = 'token-owner', method = 'GET') => api(new Request(`${ORIGIN}${path}`, {
    method, headers: { authorization: `Bearer ${token}` }
  }), {});
  const siteId = '20000000-0000-0000-0000-000000000001';
  assert.equal((await send(`/api/sites/${siteId}/entitlements`, null)).status, 401);
  assert.equal((await send(`/api/sites/${siteId}/entitlements`, 'token-stranger')).status, 404);
  assert.equal((await send(`/api/sites/${siteId}/entitlements`, 'token-owner', 'POST')).status, 405);
  const ok = await send(`/api/sites/${siteId}/entitlements`, 'token-member');
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).locked.custom_domain.name, 'Essencial', 'membro também vê o selo');
});

test('trava de envio (PB-03): clique duplo gera uma única chamada', async () => {
  const attributes = {};
  const button = {
    textContent: 'Mudar de plano', disabled: false,
    setAttribute: (name, value) => { attributes[name] = value; },
    removeAttribute: (name) => { delete attributes[name]; }
  };
  let calls = 0;
  let release;
  const task = () => { calls += 1; return new Promise((resolve) => { release = resolve; }); };
  const first = withSubmitLock(button, task, { busyLabel: 'Abrindo o pagamento…' });
  const second = withSubmitLock(button, task, { busyLabel: 'Abrindo o pagamento…' });
  assert.equal(first, second);
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.deepEqual([button.disabled, attributes['aria-busy'], button.textContent], [true, 'true', 'Abrindo o pagamento…']);
  release();
  await first;
  assert.deepEqual([button.disabled, attributes['aria-busy'], button.textContent], [false, undefined, 'Mudar de plano']);
});

test('/planos/ sai de content/plans.json: quatro planos, serviços e comparação com a taxa de 9%', async () => {
  const html = renderPricingSection(plansSource);
  for (const text of ['Gratuito/Social', 'Essencial', 'Profissional', 'Equipe/Multi-Vitrine', 'R$ 39', 'R$ 89', 'R$ 169',
    'Implantação Chave na Mão', 'R$ 290 a R$ 490', 'Projeto sob medida', 'A partir de R$ 950', 'Até 20 itens ativos por vitrine',
    '5 vitrines', 'Não inclui', 'depende de vaga']) {
    assert.ok(html.includes(text), `faltou "${text}"`);
  }
  assert.equal(salesFeeComparison(validatePlanTable(plansSource)), 'Vendendo mais de R$ 433 por mês, a taxa de 9% já passa do Essencial.');
  assert.doesNotMatch(html, /beacons|card[aá]pio|cat[aá]logo/i);

  const changed = structuredClone(plansSource);
  changed.plans.find((plan) => plan.code === 'essencial').monthlyPriceCents = 4500;
  const page = applyPricingPage(`<main>${PRICING_START}antigo${PRICING_END}</main>`, changed);
  assert.match(page, /R\$ 45<\/span>/);
  assert.match(page, /Vendendo mais de R\$ 500 por mês/);
  assert.doesNotMatch(page, /antigo|R\$ 39/);
  assert.throws(() => applyPricingPage('<main></main>', plansSource), /marcadores/);

  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const built = await readFile(new URL('../dist/planos/index.html', import.meta.url), 'utf8');
  assert.equal((built.match(/class="pricing-plan"/g) ?? []).length, 4);
  assert.ok(built.includes('R$ 89'));
  assert.doesNotMatch(built, /Assinatura em definição|Gerado por scripts\/build\.mjs/);
});

test('painel e página de preços falam de vitrine, nunca de catálogo ou cardápio', async () => {
  for (const file of ['web/portal/billing-panel.mjs', 'web/portal/plan-gate.mjs', 'web/portal/ui-state.mjs', 'src/pricing-page.mjs', 'web/planos/index.html']) {
    const content = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(content, /cat[aá]logo|card[aá]pio/i, file);
  }
  const portal = await readFile(new URL('../web/portal/index.html', import.meta.url), 'utf8');
  const section = portal.slice(portal.indexOf('id="plano-section"'), portal.indexOf('<!-- Section 3: Perfil'));
  assert.match(section, /Plano e cobrança/);
  assert.doesNotMatch(section, /cat[aá]logo|card[aá]pio/i);
  const editor = await readFile(new URL('../web/portal/editor.js', import.meta.url), 'utf8');
  assert.doesNotMatch(editor, /placeholder = 'cardapio/);
});

class FakeElement {
  constructor(doc, tag) {
    Object.assign(this, {
      ownerDocument: doc, tagName: tag.toUpperCase(), childNodes: [], parentNode: null, attributes: {},
      listeners: {}, dataset: {}, hidden: false, disabled: false, value: '', checked: false, type: '', open: false
    });
    this.classSet = new Set();
  }
  get className() { return [...this.classSet].join(' '); }
  set className(value) { this.classSet = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get id() { return this.attributes.id ?? ''; }
  set id(value) { this.setAttribute('id', value); }
  get children() { return this.childNodes.filter((node) => node instanceof FakeElement); }
  get textContent() { return this.childNodes.map((node) => node.textContent ?? '').join(''); }
  set textContent(value) { this.replaceChildren(String(value ?? '')); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.ownerDocument.ids.set(String(value), this);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  adopt(node) {
    const child = typeof node === 'string' ? new FakeText(node) : node;
    child.parentNode?.childNodes.splice(child.parentNode.childNodes.indexOf(child), 1);
    child.parentNode = this;
    return child;
  }
  append(...nodes) { this.childNodes.push(...nodes.map((node) => this.adopt(node))); }
  after(node) {
    const index = this.parentNode.childNodes.indexOf(this);
    this.parentNode.childNodes.splice(index + 1, 0, this.parentNode.adopt(node));
  }
  replaceChildren(...nodes) {
    this.childNodes.forEach((node) => { node.parentNode = null; });
    this.childNodes = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }
  matches(selector) { return this.tagName === selector.toUpperCase() || this.classSet.has(selector.replace(/^\./, '')); }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  removeEventListener(type, listener) { this.listeners[type] = (this.listeners[type] ?? []).filter((entry) => entry !== listener); }
  dispatchEvent(event) {
    event.preventDefault ??= () => {};
    event.stopImmediatePropagation ??= () => {};
    for (let node = this; node; node = node.parentNode) (node.listeners?.[event.type] ?? []).forEach((listener) => listener(event));
  }
  click() { this.dispatchEvent({ type: 'click' }); }
  focus() { this.ownerDocument.activeElement = this; }
  showModal() { this.open = true; }
  close() { this.open = false; }
}

class FakeText {
  constructor(text) { this.textContent = text; this.parentNode = null; }
  remove() { this.parentNode?.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1); this.parentNode = null; }
}

async function portalDocument() {
  const markup = await readFile(new URL('../web/portal/index.html', import.meta.url), 'utf8');
  const doc = { ids: new Map(), activeElement: null };
  doc.createElement = (tag) => new FakeElement(doc, tag);
  doc.createTextNode = (text) => new FakeText(text);
  doc.body = doc.createElement('body');
  for (const [, tag, attrs] of markup.matchAll(/<(\w+)\b([^>]*\bid="[^"]+"[^>]*)>/g)) {
    const element = doc.createElement(tag);
    for (const [, name, value] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      if (name === 'class') element.className = value;
      else if (name === 'hidden') element.hidden = true;
      else element.setAttribute(name, value ?? '');
    }
    doc.body.append(element);
  }
  doc.getElementById = (id) => doc.ids.get(id) ?? null;
  return doc;
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const buttonsIn = (node, label) => node.querySelectorAll('button').filter((button) => button.textContent.startsWith(label));

function overviewPayload({ state = 'active', available = true, organizations } = {}) {
  const plans = validatePlanTable(plansSource).plans.map(({ code, name, monthlyPriceCents, limits, features }) =>
    ({ code, name, monthlyPriceCents, limits, features }));
  const subscription = {
    planCode: 'essencial', planName: 'Essencial', monthlyPriceCents: 3900, state, provider: 'asaas',
    currentPeriodEnd: new Date(DUE).toISOString(), graceUntil: new Date(DUE + 7 * DAY).toISOString(), accessUntil: null
  };
  return {
    billing: { available, mode: 'sandbox' },
    plans,
    organizations: organizations ?? [{
      tenantId: TENANT,
      name: 'Ateliê Maria',
      plan: state === 'suspended' ? { code: 'free', name: 'Gratuito/Social', monthlyPriceCents: 0 } : { code: 'essencial', name: 'Essencial', monthlyPriceCents: 3900 },
      subscription,
      canCheckout: available && state === 'suspended',
      canCancel: available,
      invoices: { status: 'ok', items: [{ id: 'pay_1', dueDate: '2026-11-01', valueCents: 3900, state: 'pending', invoiceUrl: 'https://sandbox.asaas.com/i/1', receiptUrl: null }] }
    }]
  };
}

test('tela Plano e cobrança: estados do dono, erro com "Tentar de novo", checkout e cancelamento únicos', async (t) => {
  const doc = await portalDocument();
  const assigned = [];
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = doc;
  globalThis.window = { location: { hash: '#plano', assign: (url) => assigned.push(url) } };
  t.after(() => Object.assign(globalThis, previous));

  const calls = [];
  let overview = [200, overviewPayload()];
  let releaseCheckout;
  const fetch = async (url, init = {}) => {
    calls.push(`${init.method ?? 'GET'} ${url}`);
    if (url === '/api/billing/overview') return { ok: overview[0] < 400, status: overview[0], json: async () => overview[1] };
    if (url.endsWith('/entitlements')) return { ok: true, status: 200, json: async () => planGateSummary(FREE_ENTITLEMENTS) };
    if (url === '/api/billing/checkout') {
      await new Promise((resolve) => { releaseCheckout = resolve; });
      return { ok: true, status: 201, json: async () => ({ checkoutUrl: 'https://sandbox.asaas.com/i/novo' }) };
    }
    if (url === '/api/billing/cancel') return { ok: true, status: 200, json: async () => ({ subscription: { accessUntil: new Date(DUE).toISOString() } }) };
    return { ok: false, status: 404, json: async () => ({}) };
  };
  const sites = [{ id: 's1', name: 'Ateliê Maria', role: 'owner', archivedAt: null }];
  const panel = await import(`../web/portal/billing-panel.mjs?dom=${Date.now()}`);
  panel.initBillingPanel({ fetch, getSites: () => sites, isOnline: () => true, publicOrigin: () => ORIGIN });
  const body = doc.getElementById('billing-panel-body');

  await panel.loadBillingPanel();
  await tick();
  assert.match(body.textContent, /Essencial/);
  assert.match(body.textContent, /Ativa/);
  assert.match(body.textContent, /Próximo vencimento: 1 de dezembro de 2026/);
  assert.match(body.textContent, /Pagar fatura/);
  assert.equal(doc.getElementById('billing-pricing-link').attributes.href ?? doc.getElementById('billing-pricing-link').href, `${ORIGIN}/planos/`);

  overview = [200, overviewPayload({ state: 'grace' })];
  await panel.loadBillingPanel();
  assert.match(body.textContent, /Em tolerância até 7 de dezembro/);
  assert.match(body.textContent, /continuam até 7 de dezembro de 2026/);

  overview = [503, { error: { code: 'BILLING_STORE_UNAVAILABLE' } }];
  await panel.loadBillingPanel();
  assert.match(body.textContent, /Não foi possível carregar o plano e a cobrança/);
  assert.doesNotMatch(body.textContent, /Ainda não há faturas/);
  const [retry] = buttonsIn(body, 'Tentar de novo');
  assert.ok(retry, 'erro oferece "Tentar de novo"');
  overview = [200, overviewPayload({ state: 'suspended' })];
  retry.click();
  await tick();
  assert.match(body.textContent, /Recursos pagos suspensos/);
  assert.match(body.textContent, /Nada foi apagado/);

  const [change] = buttonsIn(body, 'Mudar de plano');
  change.click();
  assert.equal(doc.getElementById('billing-change-dialog').open, true);
  assert.match(doc.getElementById('billing-change-summary').textContent, /substitui a assinatura suspensa/);
  doc.getElementById('billing-name').value = 'Maria Silva';
  doc.getElementById('billing-cpfCnpj').value = '529.982.247-25';
  doc.getElementById('billing-email').value = 'cobranca@exemplo.com.br';
  const form = doc.getElementById('billing-change-form');
  form.dispatchEvent({ type: 'submit' });
  form.dispatchEvent({ type: 'submit' });
  await tick();
  releaseCheckout();
  await tick();
  await tick();
  assert.equal(calls.filter((call) => call === 'POST /api/billing/checkout').length, 1, 'clique duplo gera um único checkout');
  assert.deepEqual(assigned, ['https://sandbox.asaas.com/i/novo']);

  overview = [200, overviewPayload()];
  await panel.loadBillingPanel();
  buttonsIn(body, 'Cancelar assinatura')[0].click();
  assert.match(doc.getElementById('billing-cancel-summary').textContent, /continua valendo até 30 de novembro de 2026/);
  const confirm = doc.getElementById('billing-cancel-confirm');
  confirm.click();
  confirm.click();
  await tick();
  await tick();
  assert.equal(calls.filter((call) => call === 'POST /api/billing/cancel').length, 1);
  assert.match(doc.getElementById('billing-panel-message').textContent, /Assinatura cancelada/);
});

test('tela Plano e cobrança: cobrança indisponível e membro que não é dono', async (t) => {
  const doc = await portalDocument();
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = doc;
  globalThis.window = { location: { hash: '#plano', assign: () => {} } };
  t.after(() => Object.assign(globalThis, previous));
  let overview = overviewPayload({ available: false });
  const fetch = async (url) => {
    if (url === '/api/billing/overview') return { ok: true, status: 200, json: async () => overview };
    return { ok: true, status: 200, json: async () => planGateSummary(normalizeEntitlements({ plan_code: 'profissional' })) };
  };
  let sites = [{ id: 's1', name: 'Ateliê Maria', role: 'owner', archivedAt: null }];
  const panel = await import(`../web/portal/billing-panel.mjs?dom=${Date.now()}-2`);
  panel.initBillingPanel({ fetch, getSites: () => sites, isOnline: () => true });
  const body = doc.getElementById('billing-panel-body');

  await panel.loadBillingPanel();
  assert.match(body.textContent, /A cobrança ainda não está disponível/);
  assert.equal(buttonsIn(body, 'Mudar de plano')[0].disabled, true);
  assert.equal(buttonsIn(body, 'Cancelar assinatura').length, 0);

  overview = overviewPayload({ organizations: [] });
  sites = [{ id: 's2', name: 'Pizzaria da Ana', role: 'editor', archivedAt: null }];
  await panel.loadBillingPanel();
  await tick();
  assert.match(body.textContent, /Só a pessoa dona da organização vê cobrança e faturas/);
  assert.match(body.textContent, /Pizzaria da Ana.*Profissional/);
  assert.doesNotMatch(body.textContent, /Histórico de faturas|fatura em aberto|vencimento|R\$/i);
  assert.equal(buttonsIn(body, 'Mudar de plano').length, 0);
});

test('selo no botão travado aparece antes do clique e sai quando o plano libera', async (t) => {
  const doc = await portalDocument();
  const previous = { document: globalThis.document, window: globalThis.window };
  globalThis.document = doc;
  globalThis.window = { location: { hash: '' } };
  t.after(() => Object.assign(globalThis, previous));
  const { lockAction, unlockAction } = await import('../web/portal/plan-gate.mjs');
  const parent = doc.createElement('div');
  const button = doc.createElement('button');
  button.append('Vincular domínio');
  parent.append(button);
  const hint = lockAction(button, { code: 'essencial', name: 'Essencial' }, 'Domínio próprio faz parte do plano Essencial.');
  assert.equal(button.textContent, 'Vincular domínio Essencial');
  assert.equal(button.dataset.planLocked, 'essencial');
  assert.equal(button.getAttribute('aria-describedby'), hint.id);
  assert.equal(parent.children[1], hint);
  button.click();
  assert.equal(globalThis.window.location.hash, '#plano');
  unlockAction(button);
  assert.equal(button.textContent, 'Vincular domínio');
  assert.equal(button.getAttribute('aria-describedby'), null);
  assert.equal(parent.children.length, 1);
});
