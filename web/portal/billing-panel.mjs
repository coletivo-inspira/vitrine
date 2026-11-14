// Tela "Plano e cobrança" do painel (hash #plano, issue #115). O Worker decide tudo em
// GET /api/billing/overview, POST /api/billing/checkout e POST /api/billing/cancel;
// aqui há texto, exibição e a trava de envio. Membros que não são donos veem só o
// nome do plano de cada vitrine.
import { announce, showState, withSubmitLock } from './ui-state.mjs';
import { createPlanBadge, forgetSitePlans, loadSitePlan } from './plan-gate.mjs';

const TIME_ZONE = 'America/Sao_Paulo';
const MAX_LISTED_SITES = 20;
const doc = () => globalThis.document;
const byId = (id) => doc()?.getElementById(id) ?? null;

const STATE_LABELS = Object.freeze({
  active: 'Ativa',
  grace: 'Em tolerância',
  suspended: 'Recursos pagos suspensos',
  canceled: 'Cancelada',
  pending: 'Aguardando pagamento',
  none: 'Sem assinatura'
});

const INVOICE_LABELS = Object.freeze({
  paid: 'Paga',
  pending: 'Em aberto',
  overdue: 'Vencida',
  refunded: 'Estornada',
  other: 'Em análise no Asaas'
});

export function formatPrice(cents) {
  if (!Number.isFinite(cents) || cents <= 0) return 'Gratuito';
  const value = new Intl.NumberFormat('pt-BR', {
    style: 'currency', currency: 'BRL', minimumFractionDigits: cents % 100 ? 2 : 0
  }).format(cents / 100);
  return `${value} por mês`;
}

// `offsetMs = -1` mostra o último dia de um prazo que termina à meia-noite.
export function formatDay(value, offsetMs = 0, { year = true } = {}) {
  const time = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? Date.parse(`${value}T12:00:00-03:00`)
    : Date.parse(value);
  if (!Number.isFinite(time)) return '';
  return new Intl.DateTimeFormat('pt-BR', {
    day: 'numeric', month: 'long', ...(year ? { year: 'numeric' } : {}), timeZone: TIME_ZONE
  }).format(new Date(time + offsetMs));
}

// Situação da organização em texto: rótulo, data em destaque e explicação.
export function billingStatusCopy(org) {
  const sub = org?.subscription ?? null;
  const state = sub?.state ?? 'none';
  const planName = sub?.planName ?? org?.plan?.name ?? 'Gratuito/Social';
  const freeText = 'A organização usa o plano Gratuito/Social: 1 vitrine, até 20 itens ativos e endereço vitrine.inspira.dev.br.';
  switch (state) {
    case 'active':
      return {
        state,
        label: STATE_LABELS.active,
        dueLabel: sub.currentPeriodEnd ? `Próximo vencimento: ${formatDay(sub.currentPeriodEnd)}` : 'Sem vencimento automático',
        text: sub.provider === 'manual'
          ? `O plano ${planName} é gerido pela equipe da Vitrine.`
          : `O plano ${planName} renova todo mês pelo Asaas, que envia a fatura ao seu e-mail de cobrança.`
      };
    case 'grace':
      return {
        state,
        label: `${STATE_LABELS.grace} até ${formatDay(sub.graceUntil, -1, { year: false })}`,
        dueLabel: sub.currentPeriodEnd ? `Venceu em ${formatDay(sub.currentPeriodEnd)}` : '',
        text: `O pagamento do plano ${planName} ainda não foi confirmado. Os recursos pagos continuam até ${formatDay(sub.graceUntil, -1)}; depois, a vitrine segue no ar com os limites do plano Gratuito. Pague pela fatura em aberto no histórico abaixo.`
      };
    case 'suspended':
      return {
        state,
        label: STATE_LABELS.suspended,
        dueLabel: sub.currentPeriodEnd ? `Venceu em ${formatDay(sub.currentPeriodEnd)}` : '',
        text: `O pagamento do plano ${planName} não foi confirmado. A vitrine continua no ar em vitrine.inspira.dev.br, sem o domínio próprio e com os limites do plano Gratuito. Nada foi apagado: quando o Asaas confirmar o pagamento da fatura em aberto, tudo volta sozinho.`
      };
    case 'canceled':
      return sub.accessUntil
        ? {
            state,
            label: STATE_LABELS.canceled,
            dueLabel: `Plano vale até ${formatDay(sub.accessUntil, -1)}`,
            text: `Não haverá novas cobranças. O plano ${planName} continua até o fim do período pago; depois, valem os limites do plano Gratuito. Nada é apagado.`
          }
        : { state, label: STATE_LABELS.canceled, dueLabel: '', text: freeText };
    case 'pending':
      return {
        state,
        label: STATE_LABELS.pending,
        dueLabel: '',
        text: `A contratação do plano ${planName} começa quando o Asaas confirmar o pagamento. Até lá, valem os limites do plano Gratuito.`
      };
    default:
      return { state: 'none', label: STATE_LABELS.none, dueLabel: '', text: freeText };
  }
}

// Efeito de "Mudar de plano", mostrado antes de confirmar.
export function changePlanSummary(org, plan) {
  if (!org?.canCheckout) {
    return 'Para trocar um plano em vigor sem perder os dias já pagos, a equipe da Vitrine faz a troca e ajusta a próxima cobrança. Peça pela área Customizações.';
  }
  if (!plan) return 'Escolha um plano para ver o que muda.';
  const sub = org.subscription;
  const parts = [
    `Você vai para a página de pagamento do Asaas, com Pix, boleto ou cartão. O plano ${plan.name} (${formatPrice(plan.monthlyPriceCents)}) começa quando o Asaas confirmar o pagamento e a cobrança se repete todo mês na mesma data.`
  ];
  if (sub?.state === 'canceled' && sub.accessUntil) {
    parts.push('Os dias que restam do plano cancelado deixam de valer: até a confirmação, valem os limites do plano Gratuito.');
  } else if (sub?.state === 'suspended') {
    parts.push('A nova contratação substitui a assinatura suspensa, que é cancelada no Asaas. Para voltar ao mesmo plano sem nova contratação, pague a fatura em aberto.');
  } else if (sub?.state === 'pending') {
    parts.push(sub.planName
      ? `A contratação pendente do plano ${sub.planName} é substituída por esta.`
      : 'A contratação pendente anterior é substituída por esta.');
  }
  return parts.join(' ');
}

// Efeito de "Cancelar assinatura", mostrado antes de confirmar.
export function cancelSummary(org) {
  const sub = org?.subscription;
  const planName = sub?.planName ?? org?.plan?.name ?? '';
  const until = sub?.state === 'active' && sub.currentPeriodEnd
    ? `O plano ${planName} continua valendo até ${formatDay(sub.currentPeriodEnd, -1)}, o fim do período pago.`
    : sub?.state === 'grace' && sub.graceUntil
      ? `Os recursos pagos continuam até ${formatDay(sub.graceUntil, -1)} e a fatura em aberto é cancelada.`
      : 'Os recursos pagos param de valer agora e a fatura em aberto é cancelada.';
  return {
    text: until,
    effects: [
      'Depois, a vitrine segue no ar em vitrine.inspira.dev.br com os limites do plano Gratuito: 20 itens ativos, 1 bloco de itens e sem domínio próprio.',
      'Nada é apagado: itens, páginas, publicações e domínios cadastrados continuam salvos.',
      'O Asaas não gera novas cobranças. Para voltar, contrate um plano de novo nesta tela.'
    ]
  };
}

export function invoiceStateLabel(state) {
  return INVOICE_LABELS[state] ?? INVOICE_LABELS.other;
}

const panel = {
  fetch: (...args) => globalThis.fetch(...args),
  getSites: () => [],
  isOnline: () => true,
  publicOrigin: () => 'https://vitrine.inspira.dev.br',
  data: null,
  current: null,
  bound: false
};

function el(tag, className = '', text = '') {
  const node = doc().createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function plansByCode() {
  return new Map((panel.data?.plans ?? []).map((plan) => [plan.code, plan]));
}

function ownedActiveSites() {
  return panel.getSites().filter((site) => site?.role === 'owner' && !site.archivedAt);
}

function renderInvoices(org) {
  const box = el('div', 'billing-invoices');
  box.append(el('h3', 'billing-subtitle', 'Histórico de faturas'));
  const { status, items } = org.invoices ?? { status: 'none', items: [] };
  if (status === 'error') {
    const holder = el('div');
    showState(holder, {
      state: 'error',
      message: 'Não foi possível carregar as faturas do Asaas.',
      onRetry: () => loadBillingPanel()
    });
    box.append(holder);
    return box;
  }
  if (status === 'unavailable') {
    box.append(el('p', 'billing-muted', 'O histórico aparece aqui quando a cobrança estiver disponível.'));
    return box;
  }
  if (status === 'none' || !items.length) {
    box.append(el('p', 'billing-muted', status === 'none'
      ? 'Ainda não há faturas: esta organização não tem assinatura no Asaas.'
      : 'Ainda não há faturas nesta assinatura.'));
    return box;
  }
  const list = el('ul', 'billing-invoice-list');
  for (const invoice of items) {
    const row = el('li', 'billing-invoice');
    row.dataset.state = invoice.state;
    const when = el('span', 'billing-invoice-date', formatDay(invoice.dueDate));
    const value = el('span', 'billing-invoice-value', Number.isFinite(invoice.valueCents)
      ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(invoice.valueCents / 100)
      : '—');
    const state = el('span', 'billing-invoice-state', invoiceStateLabel(invoice.state));
    row.append(when, value, state);
    const href = invoice.state === 'paid' ? invoice.receiptUrl ?? invoice.invoiceUrl : invoice.invoiceUrl;
    if (href) {
      const link = el('a', 'text-link billing-invoice-link');
      link.href = href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = invoice.state === 'paid' ? 'Comprovante' : 'Pagar fatura';
      link.append(el('span', 'visually-hidden', ` de ${formatDay(invoice.dueDate)} (abre o Asaas em nova aba)`));
      row.append(link);
    }
    list.append(row);
  }
  box.append(list);
  return box;
}

function renderOrganization(org) {
  const card = el('article', 'portal-card billing-card');
  card.dataset.state = org.subscription?.state ?? 'none';
  const copy = billingStatusCopy(org);
  const header = el('div', 'billing-card-header');
  const titles = el('div');
  titles.append(el('p', 'billing-eyebrow', org.name || 'Sua organização'));
  const planLine = el('h2', 'billing-plan-name', org.plan.name);
  titles.append(planLine, el('p', 'billing-plan-price', formatPrice(org.plan.monthlyPriceCents)));
  const chip = el('span', 'billing-status-chip', copy.label);
  chip.dataset.state = copy.state;
  header.append(titles, chip);
  card.append(header);
  if (copy.dueLabel) card.append(el('p', 'billing-due', copy.dueLabel));
  card.append(el('p', 'billing-status-text', copy.text));

  const limits = plansByCode().get(org.plan.code)?.limits;
  if (limits) {
    const used = ownedActiveSites().length;
    const usage = el('p', 'billing-usage', `Vitrines no plano: ${Math.min(used, 99)} de ${limits.vitrines}. Até ${limits.activeItemsPerVitrine} itens ativos e ${limits.itemBlocks === 1 ? '1 bloco' : `${limits.itemBlocks} blocos`} de itens por vitrine.`);
    if (used >= limits.vitrines) usage.append(' Arquivar uma vitrine libera a vaga.');
    card.append(usage);
  }

  const actions = el('div', 'billing-actions');
  const change = el('button', 'button button-small button-pill', 'Mudar de plano');
  change.type = 'button';
  change.addEventListener('click', () => openChangeDialog(org));
  actions.append(change);
  if (org.canCancel) {
    const cancel = el('button', 'button button-small button-secondary button-pill', 'Cancelar assinatura');
    cancel.type = 'button';
    cancel.addEventListener('click', () => openCancelDialog(org));
    actions.append(cancel);
  }
  if (!panel.data?.billing?.available) {
    change.disabled = true;
    const note = el('p', 'billing-unavailable', 'A cobrança ainda não está disponível nesta plataforma. A contratação e o cancelamento aparecem aqui quando o Asaas for ativado; até lá, nenhum plano pago é cobrado.');
    note.id = `billing-unavailable-${org.tenantId}`;
    change.setAttribute('aria-describedby', note.id);
    card.append(actions, note);
  } else {
    card.append(actions);
  }
  card.append(renderInvoices(org));
  return card;
}

function renderSitePlans(container, { ownerView }) {
  const sites = panel.getSites().filter((site) => !site?.archivedAt).slice(0, MAX_LISTED_SITES);
  if (!sites.length) return;
  const card = el('section', 'portal-card billing-sites');
  card.append(el('h2', 'billing-subtitle', 'Plano de cada vitrine'));
  if (!ownerView) {
    card.append(el('p', 'billing-muted', 'Só a pessoa dona da organização vê cobrança e faturas e pode mudar de plano.'));
  }
  const list = el('ul', 'billing-site-list');
  for (const site of sites) {
    const row = el('li', 'billing-site');
    row.append(el('span', 'billing-site-name', site.name));
    const plan = el('span', 'billing-site-plan', 'Consultando…');
    row.append(plan);
    list.append(row);
    void loadSitePlan(site.id, panel.fetch).then((summary) => {
      plan.textContent = '';
      if (summary?.plan?.name) plan.append(createPlanBadge(summary.plan));
      else plan.textContent = 'Plano indisponível agora';
    });
  }
  card.append(list);
  container.append(card);
}

function renderNoOrganization(container) {
  const card = el('article', 'portal-card billing-card');
  card.dataset.state = 'none';
  card.append(el('p', 'billing-eyebrow', 'Sua conta'));
  card.append(el('h2', 'billing-plan-name', 'Gratuito/Social'));
  card.append(el('p', 'billing-status-text', 'Suas vitrines usam o plano Gratuito/Social. Para contratar um plano pago, a equipe da Vitrine cria a organização de cobrança da sua conta e vincula as suas vitrines.'));
  const actions = el('div', 'billing-actions');
  const ask = el('a', 'button button-small button-pill', 'Pedir pela área Customizações');
  ask.href = '#pedidos';
  actions.append(ask);
  card.append(actions);
  container.append(card);
}

function render() {
  const body = byId('billing-panel-body');
  if (!body) return;
  body.removeAttribute('aria-busy');
  body.replaceChildren();
  const organizations = panel.data?.organizations ?? [];
  for (const org of organizations) body.append(renderOrganization(org));
  if (!organizations.length) {
    const ownsSites = panel.getSites().some((site) => site?.role === 'owner');
    if (ownsSites) renderNoOrganization(body);
  }
  renderSitePlans(body, { ownerView: organizations.length > 0 });
  if (!body.children.length) {
    showState(body, { state: 'empty', message: 'Você ainda não participa de nenhuma vitrine. Crie a sua para ver o plano aqui.' });
  }
}

export async function loadBillingPanel() {
  const body = byId('billing-panel-body');
  if (!body) return null;
  const pricing = byId('billing-pricing-link');
  if (pricing) pricing.href = `${String(panel.publicOrigin()).replace(/\/+$/, '')}/planos/`;
  if (!panel.isOnline()) {
    panel.data = null;
    showState(body, {
      state: 'empty',
      message: 'No modo local de demonstração não há cobrança. Entre com sua conta para ver o plano e as faturas.'
    });
    return null;
  }
  forgetSitePlans();
  showState(body, { state: 'loading', message: 'Carregando plano e cobrança…' });
  try {
    const response = await panel.fetch('/api/billing/overview');
    if (!response.ok) throw new Error(String(response.status));
    panel.data = await response.json();
  } catch {
    panel.data = null;
    showState(body, {
      state: 'error',
      message: 'Não foi possível carregar o plano e a cobrança. Nenhuma informação foi alterada.',
      onRetry: () => loadBillingPanel()
    });
    return null;
  }
  render();
  return panel.data;
}

function selectedPlan() {
  const checked = [...(byId('billing-change-plans')?.querySelectorAll('input') ?? [])].find((input) => input.checked);
  return checked ? plansByCode().get(checked.value) ?? null : null;
}

function updateChangeSummary() {
  const summary = byId('billing-change-summary');
  if (summary) summary.textContent = changePlanSummary(panel.current, selectedPlan());
}

function clearFieldErrors() {
  for (const field of ['name', 'cpfCnpj', 'email']) {
    const input = byId(`billing-${field}`);
    const error = byId(`billing-${field}-error`);
    input?.removeAttribute('aria-invalid');
    if (error) error.hidden = true;
  }
}

function openChangeDialog(org) {
  const dialog = byId('billing-change-dialog');
  if (!dialog) return;
  panel.current = org;
  const plans = byId('billing-change-plans');
  const details = byId('billing-change-details');
  const submit = byId('billing-change-submit');
  announce(byId('billing-change-message'), '');
  clearFieldErrors();
  const legend = plans.querySelector('legend');
  plans.replaceChildren(...(legend ? [legend] : []));
  const paid = (panel.data?.plans ?? []).filter((plan) => plan.monthlyPriceCents > 0);
  const currentCode = org.subscription?.planCode ?? org.plan.code;
  for (const plan of paid) {
    const label = el('label', 'billing-plan-option');
    const input = el('input');
    input.type = 'radio';
    input.name = 'billing-plan';
    input.value = plan.code;
    input.checked = plan.code === (paid.some((entry) => entry.code === currentCode) ? currentCode : paid[0]?.code);
    input.addEventListener('change', updateChangeSummary);
    const name = el('span', 'billing-plan-option-name', plan.name);
    const price = el('span', 'billing-plan-option-price', formatPrice(plan.monthlyPriceCents));
    label.append(input, name, price);
    if (plan.code === currentCode) label.append(el('span', 'billing-plan-option-current', 'plano atual'));
    plans.append(label);
  }
  plans.hidden = !org.canCheckout;
  details.hidden = !org.canCheckout;
  submit.textContent = org.canCheckout ? 'Ir para o pagamento' : 'Pedir a troca';
  updateChangeSummary();
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

function closeDialog(dialog) {
  if (typeof dialog?.close === 'function') dialog.close();
  else dialog?.removeAttribute('open');
}

async function readError(response) {
  const data = await response.json().catch(() => null);
  return data?.error ?? {};
}

export async function submitCheckout(fetchImpl = panel.fetch) {
  const org = panel.current;
  const plan = selectedPlan();
  const message = byId('billing-change-message');
  if (!org || !plan) return null;
  clearFieldErrors();
  const billing = {
    name: byId('billing-name')?.value ?? '',
    cpfCnpj: byId('billing-cpfCnpj')?.value ?? '',
    email: byId('billing-email')?.value ?? ''
  };
  const response = await fetchImpl('/api/billing/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: org.tenantId, planCode: plan.code, billing })
  }).catch(() => null);
  if (!response) {
    announce(message, 'Falha de rede. Nada foi contratado; tente de novo.', 'error');
    return null;
  }
  if (response.status === 201) {
    const data = await response.json().catch(() => null);
    let url = null;
    try {
      url = new URL(data?.checkoutUrl);
    } catch {
      url = null;
    }
    if (url?.protocol === 'https:') {
      announce(message, 'Abrindo a página de pagamento do Asaas…');
      globalThis.window?.location.assign(url.href);
      return url.href;
    }
    announce(message, 'O Asaas não devolveu a página de pagamento. Tente de novo em alguns minutos.', 'error');
    return null;
  }
  const error = await readError(response);
  if (error.code === 'INVALID_BILLING_DETAILS' && Array.isArray(error.fields)) {
    let first = null;
    for (const field of error.fields) {
      const input = byId(`billing-${field}`);
      const hint = byId(`billing-${field}-error`);
      input?.setAttribute('aria-invalid', 'true');
      if (hint) hint.hidden = false;
      first ??= input;
    }
    first?.focus();
  }
  announce(message, error.message || 'Não foi possível iniciar a contratação. Tente de novo.', 'error');
  return null;
}

function openCancelDialog(org) {
  const dialog = byId('billing-cancel-dialog');
  if (!dialog) return;
  panel.current = org;
  const { text, effects } = cancelSummary(org);
  byId('billing-cancel-summary').textContent = text;
  const list = byId('billing-cancel-effects');
  list.replaceChildren(...effects.map((effect) => el('li', '', effect)));
  announce(byId('billing-cancel-message'), '');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', '');
}

export async function submitCancel(fetchImpl = panel.fetch) {
  const org = panel.current;
  const message = byId('billing-cancel-message');
  if (!org) return null;
  const response = await fetchImpl('/api/billing/cancel', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenantId: org.tenantId })
  }).catch(() => null);
  if (!response) {
    announce(message, 'Falha de rede. A assinatura não foi cancelada; tente de novo.', 'error');
    return null;
  }
  if (!response.ok) {
    const error = await readError(response);
    announce(message, error.message || 'Não foi possível cancelar a assinatura. Tente de novo.', 'error');
    return null;
  }
  const data = await response.json().catch(() => ({}));
  closeDialog(byId('billing-cancel-dialog'));
  const until = data?.subscription?.accessUntil;
  announce(byId('billing-panel-message'), until
    ? `Assinatura cancelada. O plano continua até ${formatDay(until, -1)}; não haverá novas cobranças.`
    : 'Assinatura cancelada. Não haverá novas cobranças.');
  await loadBillingPanel();
  return data;
}

export function initBillingPanel({ fetch: fetchImpl, getSites, isOnline, publicOrigin } = {}) {
  if (fetchImpl) panel.fetch = fetchImpl;
  if (getSites) panel.getSites = () => (Array.isArray(getSites()) ? getSites() : []);
  if (isOnline) panel.isOnline = isOnline;
  if (typeof publicOrigin === 'function') panel.publicOrigin = publicOrigin;
  if (panel.bound || !doc()) return;
  panel.bound = true;

  const changeDialog = byId('billing-change-dialog');
  const changeForm = globalThis.document?.getElementById('billing-change-form');
  const changeSubmit = byId('billing-change-submit');
  byId('billing-change-back')?.addEventListener('click', () => closeDialog(changeDialog));
  changeForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!panel.current?.canCheckout) {
      closeDialog(changeDialog);
      if (globalThis.window) globalThis.window.location.hash = '#pedidos';
      return;
    }
    void withSubmitLock(changeSubmit, () => submitCheckout(), { busyLabel: 'Abrindo o pagamento…' });
  });

  const cancelDialog = byId('billing-cancel-dialog');
  const cancelConfirm = byId('billing-cancel-confirm');
  byId('billing-cancel-back')?.addEventListener('click', () => closeDialog(cancelDialog));
  cancelConfirm?.addEventListener('click', () => {
    void withSubmitLock(cancelConfirm, () => submitCancel(), { busyLabel: 'Cancelando…' });
  });
}
