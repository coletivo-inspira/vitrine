/**
 * Painel: Configurações > Delivery (spec 021). Links das lojas no iFood e no 99Food,
 * taxa de entrega, forma de pagamento e entregadores. Tudo fica no rascunho; os
 * entregadores nunca são publicados (ver `deliveryCouriers` em FORBIDDEN_PUBLIC_KEYS).
 */
import {
  DELIVERY_FEE_MAX_CENTS,
  DELIVERY_PLATFORMS,
  MAX_DELIVERY_COURIERS,
  COURIER_NAME_MAX,
  normalizeCourierWhatsapp,
  normalizeDeliveryPlatformUrl
} from '../assets/delivery.mjs';

const panel = { getContent: () => null, onChange: () => {}, container: null, doc: null, rows: [], platformDrafts: {} };

function el(tag, attrs = {}, children = []) {
  const node = panel.doc.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

export function formatCentsInput(cents) {
  if (!Number.isSafeInteger(cents) || cents <= 0) return '';
  return `R$ ${Math.floor(cents / 100).toLocaleString('pt-BR')},${String(cents % 100).padStart(2, '0')}`;
}

export function parseCentsInput(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 8);
  return digits ? parseInt(digits, 10) : 0;
}

/** Próximo identificador livre para um entregador, a partir do nome. */
export function nextCourierId(name, couriers = []) {
  const base = String(name ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'entregador';
  const used = new Set(couriers.map((courier) => courier?.id));
  if (!used.has(base)) return base;
  let index = 2;
  while (used.has(`${base}-${index}`)) index += 1;
  return `${base}-${index}`;
}

function content() {
  return panel.getContent();
}

function orderFields() {
  const draft = content();
  if (!draft.orderFields || typeof draft.orderFields !== 'object') draft.orderFields = {};
  return draft.orderFields;
}

function setProblem(input, problem, message) {
  problem.textContent = message;
  problem.hidden = !message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function renderPlatforms() {
  const draft = content();
  const rows = DELIVERY_PLATFORMS.map((platform) => {
    const id = `delivery-platform-${platform.id}`;
    const problemId = `${id}-problem`;
    const input = el('input', {
      type: 'url', id, className: 'item-input input-styled-height', inputmode: 'url',
      placeholder: `https://${platform.id === 'ifood' ? 'www.ifood.com.br/delivery/...' : 'food.99app.com/...'}`,
      'aria-describedby': problemId
    });
    input.value = panel.platformDrafts[platform.id] ?? draft.deliveryPlatforms?.[platform.id] ?? '';
    const problem = el('span', { id: problemId, className: 'form-error-msg', hidden: true, role: 'alert' });
    const check = () => {
      const value = input.value.trim();
      const url = value ? normalizeDeliveryPlatformUrl(platform.id, value) : null;
      setProblem(input, problem, value && !url
        ? `Use o link da sua loja no ${platform.label} (https://, domínio ${platform.domain}). Enquanto isso, o link não é salvo.`
        : '');
      return url;
    };
    check();
    input.addEventListener('input', () => {
      const url = check();
      panel.platformDrafts[platform.id] = input.value;
      const next = { ...(content().deliveryPlatforms ?? {}) };
      if (url) next[platform.id] = url;
      else delete next[platform.id];
      if (Object.keys(next).length) content().deliveryPlatforms = next;
      else delete content().deliveryPlatforms;
      panel.onChange();
    });
    return el('div', { className: 'form-group delivery-field' }, [
      el('label', { for: id, text: `Loja no ${platform.label}` }), input, problem
    ]);
  });
  return el('fieldset', { className: 'form-group delivery-group' }, [
    el('legend', { className: 'label-spaced', text: 'Aplicativos de delivery' }),
    el('span', { className: 'form-help help-block-spaced', text: 'Opcional. A vitrine mostra "Também estamos no" com esses links, e quem preferir pede pelo app.' }),
    ...rows
  ]);
}

function renderFeeAndPayment() {
  const fields = orderFields();
  const feeInput = el('input', {
    type: 'text', id: 'delivery-fee', className: 'item-input input-styled-height', inputmode: 'numeric',
    placeholder: 'R$ 0,00', 'aria-describedby': 'delivery-fee-help'
  });
  feeInput.value = formatCentsInput(fields.deliveryFeeCents);
  feeInput.addEventListener('input', () => {
    const cents = Math.min(parseCentsInput(feeInput.value), DELIVERY_FEE_MAX_CENTS);
    feeInput.value = formatCentsInput(cents);
    if (cents > 0) orderFields().deliveryFeeCents = cents;
    else delete orderFields().deliveryFeeCents;
    panel.onChange();
  });
  const payment = el('input', { type: 'checkbox', id: 'delivery-payment' });
  payment.checked = fields.payment === true;
  payment.addEventListener('change', () => {
    if (payment.checked) orderFields().payment = true;
    else delete orderFields().payment;
    panel.onChange();
  });
  return el('fieldset', { className: 'form-group delivery-group' }, [
    el('legend', { className: 'label-spaced', text: 'Entrega e pagamento' }),
    el('div', { className: 'form-group delivery-field' }, [
      el('label', { for: 'delivery-fee', text: 'Taxa de entrega' }),
      feeInput,
      el('span', { id: 'delivery-fee-help', className: 'form-help', text: 'Somada ao total só quando a pessoa escolhe entrega. Precisa do campo "Endereço de entrega ou retirada" ligado em Pedido.' })
    ]),
    el('label', { className: 'checkbox-label-styled', for: 'delivery-payment' }, [
      payment, panel.doc.createTextNode(' Perguntar a forma de pagamento (Pix, cartão na entrega ou dinheiro com troco)')
    ])
  ]);
}

/** Grava no rascunho só os entregadores completos; linhas pela metade ficam no formulário. */
function syncCouriers() {
  const valid = panel.rows.flatMap((row) => {
    const name = row.name.trim();
    const whatsapp = normalizeCourierWhatsapp(row.whatsapp);
    return name && name.length <= COURIER_NAME_MAX && whatsapp ? [{ id: row.id, name, whatsapp }] : [];
  });
  if (valid.length) content().deliveryCouriers = valid;
  else delete content().deliveryCouriers;
  panel.onChange();
}

function courierRow(courier, index) {
  const nameId = `delivery-courier-name-${index}`;
  const phoneId = `delivery-courier-phone-${index}`;
  const problemId = `delivery-courier-problem-${index}`;
  const name = el('input', {
    type: 'text', id: nameId, className: 'item-input input-styled-height', maxlength: COURIER_NAME_MAX,
    placeholder: 'Nome', 'aria-label': `Nome do entregador ${index + 1}`
  });
  name.value = courier.name ?? '';
  const phone = el('input', {
    type: 'tel', id: phoneId, className: 'item-input input-styled-height', inputmode: 'tel',
    placeholder: '31 98888-7777', 'aria-describedby': problemId, 'aria-label': `WhatsApp do entregador ${index + 1}`
  });
  phone.value = courier.whatsapp ?? '';
  const problem = el('span', { id: problemId, className: 'form-error-msg', hidden: true, role: 'alert' });
  const phoneProblem = () => (phone.value.trim() && !normalizeCourierWhatsapp(phone.value) ? 'Use o WhatsApp com DDD, como 31 98888-7777.' : '');
  setProblem(phone, problem, phoneProblem());
  name.addEventListener('input', () => {
    panel.rows[index].name = name.value;
    syncCouriers();
  });
  phone.addEventListener('input', () => {
    panel.rows[index].whatsapp = phone.value;
    setProblem(phone, problem, phoneProblem());
    syncCouriers();
  });
  const remove = el('button', {
    type: 'button', className: 'text-link-btn', text: 'Remover', 'aria-label': `Remover ${courier.name || `entregador ${index + 1}`}`
  });
  remove.addEventListener('click', () => {
    panel.rows.splice(index, 1);
    syncCouriers();
    render();
  });
  return el('div', { className: 'delivery-courier-row', role: 'group', 'aria-label': `Entregador ${index + 1}` }, [
    name, phone, remove, problem
  ]);
}

function renderCouriers() {
  const couriers = panel.rows;
  const add = el('button', { type: 'button', className: 'button button-small button-secondary button-pill', text: 'Adicionar entregador' });
  add.disabled = couriers.length >= MAX_DELIVERY_COURIERS;
  add.addEventListener('click', () => {
    panel.rows.push({ id: nextCourierId(`entregador-${panel.rows.length + 1}`, panel.rows), name: '', whatsapp: '' });
    render();
    panel.doc.getElementById(`delivery-courier-name-${panel.rows.length - 1}`)?.focus?.();
  });
  return el('fieldset', { className: 'form-group delivery-group' }, [
    el('legend', { className: 'label-spaced', text: 'Entregadores' }),
    el('span', { className: 'form-help help-block-spaced', text: 'Só a equipe vê esta lista: ela não vai para a vitrine. Em Pedidos, "Despachar entrega" manda o pedido para o entregador escolhido pelo WhatsApp.' }),
    ...couriers.map(courierRow),
    add
  ]);
}

function render() {
  if (!panel.container || !content()) return;
  panel.container.replaceChildren(renderPlatforms(), renderFeeAndPayment(), renderCouriers());
}

/** Liga a seção Delivery ao rascunho aberto no editor. */
export function mountDeliveryPanel({ getContent, onChange, doc = globalThis.document } = {}) {
  const container = doc?.getElementById('delivery-panel');
  if (!container) return;
  Object.assign(panel, { getContent: getContent ?? (() => null), onChange: onChange ?? (() => {}), container, doc, platformDrafts: {} });
  const couriers = Array.isArray(panel.getContent()?.deliveryCouriers) ? panel.getContent().deliveryCouriers : [];
  panel.rows = couriers.map((courier) => ({ id: courier.id, name: courier.name ?? '', whatsapp: courier.whatsapp ?? '' }));
  render();
}
