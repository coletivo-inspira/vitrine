// Aba "Licenças e cupons" da Administração (spec 021): relatório, criação, lista e
// desativação de cupons. Licenças para uma vitrine específica ficam na aba Usuários.
import { PLAN_NAMES, actionButton, adminRequest, copyText, element, formatDay, formatMoney } from './platform-access.mjs';

const doc = globalThis.document;
const report = doc?.getElementById('platform-coupon-report');
const couponForm = doc?.getElementById('platform-coupon-form');
const plan = doc?.getElementById('platform-coupon-plan');
const months = doc?.getElementById('platform-coupon-months');
const maxUses = doc?.getElementById('platform-coupon-max');
const expires = doc?.getElementById('platform-coupon-expires');
const code = doc?.getElementById('platform-coupon-code');
const note = doc?.getElementById('platform-coupon-note');
const statusLine = doc?.getElementById('platform-coupon-status');
const created = doc?.getElementById('platform-coupon-created');
const list = doc?.getElementById('platform-coupon-list');

let confirmWith = async () => true;
let loaded = false;

export function couponReportMetrics(data) {
  const number = value => Number(value ?? 0).toLocaleString('pt-BR');
  const licenses = data?.activeLicenses ?? {};
  const activeLicenses = Number(licenses.manual ?? 0) + Number(licenses.coupon ?? 0) + Number(licenses.courtesy ?? 0);
  return [
    { label: 'Valor concedido em cupons', value: formatMoney(data?.valueCents), detail: 'preço mensal do plano × meses resgatados' },
    { label: 'Resgates', value: number(data?.redemptions), detail: `${number(data?.monthsGranted)} meses de plano concedidos` },
    { label: 'Cupons ativos', value: number(data?.activeCoupons), detail: `de ${number(data?.coupons)} criados` },
    {
      label: 'Licenças vigentes', value: number(activeLicenses),
      detail: `${number(licenses.manual)} manuais · ${number(licenses.coupon)} por cupom · ${number(licenses.courtesy)} cortesias`
    }
  ];
}

export function couponState(coupon, now = Date.now()) {
  if (coupon.disabledAt) return 'Desativado';
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) <= now) return 'Vencido';
  if (coupon.redemptions >= coupon.maxRedemptions) return 'Esgotado';
  return 'Ativo';
}

export function couponSummary(coupon) {
  const planName = PLAN_NAMES[coupon.planCode] ?? coupon.planCode;
  return [
    `${planName} por ${coupon.months} ${coupon.months === 1 ? 'mês' : 'meses'}`,
    `${coupon.redemptions} de ${coupon.maxRedemptions} ${coupon.maxRedemptions === 1 ? 'uso' : 'usos'}`,
    coupon.expiresAt ? `válido até ${formatDay(coupon.expiresAt)}` : 'sem validade',
    `valor concedido ${formatMoney(coupon.valueCents)}`
  ].join(' · ');
}

// A data do campo vale até o fim do dia em Brasília.
export function couponPayload({ planCode, monthsValue, maxValue, expiresValue, codeValue, noteValue }) {
  return {
    planCode,
    months: Number(monthsValue),
    maxRedemptions: Number(maxValue),
    expiresAt: expiresValue ? new Date(`${expiresValue}T23:59:59-03:00`).toISOString() : null,
    code: String(codeValue ?? '').trim().toUpperCase() || null,
    note: String(noteValue ?? '').trim()
  };
}

function renderReport(data) {
  report.replaceChildren(...couponReportMetrics(data).map(metric => {
    const item = element('li', 'portal-card admin-kpi');
    item.append(
      element('span', 'admin-kpi-label', metric.label),
      element('strong', 'admin-kpi-value', metric.value),
      element('span', 'admin-kpi-detail', metric.detail)
    );
    return item;
  }));
}

function copyButton(text) {
  const button = actionButton('Copiar código');
  button.setAttribute('aria-label', `Copiar o código ${text}`);
  button.addEventListener('click', async () => {
    statusLine.textContent = await copyText(text) ? `Código ${text} copiado.` : `Copie o código ${text}.`;
  });
  return button;
}

function renderCoupons(coupons) {
  list.replaceChildren(...coupons.map(coupon => {
    const item = element('li', 'admin-coupon-row');
    const text = element('div', 'admin-coupon-text');
    const state = couponState(coupon);
    text.append(
      element('code', 'admin-coupon-code', coupon.code),
      element('span', `admin-badge admin-badge-${state === 'Ativo' ? 'visible' : 'hidden'}`, state),
      element('span', 'admin-coupon-meta', couponSummary(coupon))
    );
    if (coupon.note) text.append(element('span', 'admin-coupon-meta', coupon.note));
    const actions = element('div', 'admin-coupon-actions');
    actions.append(copyButton(coupon.code));
    const toggle = actionButton(coupon.disabledAt ? 'Reativar' : 'Desativar');
    toggle.addEventListener('click', () => void setDisabled(coupon, !coupon.disabledAt, toggle));
    actions.append(toggle);
    item.append(text, actions);
    return item;
  }));
  if (!coupons.length) list.append(element('li', 'admin-empty', 'Nenhum cupom criado ainda.'));
}

async function refresh() {
  list.replaceChildren(element('li', 'admin-empty', 'Carregando cupons…'));
  const [reportResult, couponsResult] = await Promise.allSettled([
    adminRequest('/api/admin/coupons/report'), adminRequest('/api/admin/coupons')
  ]);
  if (reportResult.status === 'fulfilled') renderReport(reportResult.value.report);
  if (couponsResult.status === 'fulfilled') renderCoupons(couponsResult.value.coupons);
  else list.replaceChildren(element('li', 'admin-empty', couponsResult.reason?.message ?? 'Não foi possível carregar os cupons.'));
  if (reportResult.status === 'rejected') statusLine.textContent = reportResult.reason?.message ?? '';
}

async function setDisabled(coupon, disabled, trigger) {
  if (disabled) {
    const accepted = await confirmWith({
      title: `Desativar o cupom ${coupon.code}?`,
      message: 'Ninguém mais consegue usar este código. As licenças já resgatadas continuam valendo.',
      confirmLabel: 'Desativar cupom'
    });
    if (!accepted) return;
  }
  trigger.disabled = true;
  try {
    await adminRequest(`/api/admin/coupons/${encodeURIComponent(coupon.id)}`, 'PATCH', { disabled });
    statusLine.textContent = disabled ? `Cupom ${coupon.code} desativado.` : `Cupom ${coupon.code} reativado.`;
    await refresh();
  } catch (error) {
    statusLine.textContent = error.message;
    trigger.disabled = false;
  }
}

async function createCoupon() {
  const payload = couponPayload({
    planCode: plan.value, monthsValue: months.value, maxValue: maxUses.value,
    expiresValue: expires.value, codeValue: code.value, noteValue: note.value
  });
  if (!Number.isInteger(payload.months) || payload.months < 1 || payload.months > 36) {
    statusLine.textContent = 'Informe de 1 a 36 meses.';
    months.focus();
    return;
  }
  if (!Number.isInteger(payload.maxRedemptions) || payload.maxRedemptions < 1 || payload.maxRedemptions > 1000) {
    statusLine.textContent = 'Informe de 1 a 1.000 usos.';
    maxUses.focus();
    return;
  }
  const submit = couponForm.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  statusLine.textContent = 'Criando cupom…';
  created.hidden = true;
  try {
    const { coupon } = await adminRequest('/api/admin/coupons', 'POST', payload);
    statusLine.textContent = 'Cupom criado. Envie o código a quem vai usar.';
    created.replaceChildren(element('code', 'admin-coupon-code admin-coupon-code-large', coupon.code), copyButton(coupon.code));
    created.hidden = false;
    code.value = '';
    note.value = '';
    await refresh();
  } catch (error) {
    statusLine.textContent = error.message;
  } finally {
    if (submit) submit.disabled = false;
  }
}

export function loadPlatformLicenses({ confirm } = {}) {
  if (typeof confirm === 'function') confirmWith = confirm;
  if (!list || loaded) return;
  loaded = true;
  void refresh();
}

export function resetPlatformLicenses() {
  loaded = false;
  report?.replaceChildren();
  list?.replaceChildren();
  if (statusLine) statusLine.textContent = '';
  if (created) {
    created.hidden = true;
    created.replaceChildren();
  }
}

couponForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void createCoupon();
});
