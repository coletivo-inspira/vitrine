/**
 * Painel: "Despachar entrega" na aba Pedidos (spec 021). A pessoa cola a mensagem do
 * pedido que chegou no WhatsApp, escolhe o entregador e abre a conversa dele com a
 * mensagem pronta. Nada é enviado ao servidor.
 */
import { draftCouriers } from '../assets/delivery.mjs';
import { buildDispatchMessage, courierWhatsappLink, parseOrderMessage } from './dispatch.mjs';

const panel = { getContent: () => null, container: null, doc: null, text: '', courierId: '' };

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

function summaryItem(label, value) {
  return el('li', {}, [el('strong', { text: `${label}: ` }), panel.doc.createTextNode(value || 'não encontrado no texto')]);
}

function currentCourier() {
  const couriers = draftCouriers(panel.getContent());
  if (!couriers.some((courier) => courier.id === panel.courierId)) panel.courierId = couriers[0]?.id ?? '';
  return { couriers, courier: couriers.find((entry) => entry.id === panel.courierId) ?? null };
}

function renderResult() {
  const box = panel.doc.getElementById('dispatch-result');
  if (!box) return;
  const draft = panel.getContent();
  const { courier } = currentCourier();
  const order = parseOrderMessage(panel.text);
  const message = order.text
    ? buildDispatchMessage(order, { businessName: draft?.businessName ?? '', courierName: courier?.name ?? '' })
    : '';
  const href = courier && message ? courierWhatsappLink(courier, message) : '';
  const children = [];
  if (order.text) {
    children.push(el('ul', { className: 'dispatch-summary', 'aria-label': 'Dados encontrados no pedido' }, [
      summaryItem('Cliente', order.name),
      summaryItem('Endereço', order.pickup ? 'retirada no local' : order.address),
      summaryItem('Cobrar', order.total),
      summaryItem('Pagamento', order.payment)
    ]));
    children.push(el('pre', { className: 'dispatch-preview', 'aria-label': 'Mensagem para o entregador', text: message }));
  }
  const open = el('a', {
    className: 'button button-small button-pill',
    href: href || undefined, target: '_blank', rel: 'noopener noreferrer',
    'aria-disabled': href ? undefined : 'true', tabindex: href ? undefined : '-1',
    text: 'Abrir no WhatsApp do entregador'
  });
  const clear = el('button', { type: 'button', className: 'text-link-btn', text: 'Limpar' });
  clear.addEventListener('click', () => { panel.text = ''; render(); });
  children.push(el('div', { className: 'dispatch-actions' }, [open, clear]));
  box.replaceChildren(...children);
}

function render() {
  if (!panel.container) return;
  const { couriers } = currentCourier();
  const textarea = el('textarea', {
    id: 'dispatch-order-text', className: 'item-input', rows: 6,
    placeholder: 'Cole aqui a mensagem do pedido que chegou no WhatsApp'
  });
  textarea.value = panel.text;
  textarea.addEventListener('input', () => {
    panel.text = textarea.value;
    renderResult();
  });

  const children = [
    el('h2', { id: 'dispatch-title', text: 'Despachar entrega' }),
    el('p', { className: 'form-help', text: 'Cole o pedido, escolha o entregador e abra a conversa dele com endereço, mapa, valor a cobrar e o pedido. Nada fica salvo.' }),
    el('label', { for: 'dispatch-order-text', text: 'Mensagem do pedido' }),
    textarea
  ];
  if (!couriers.length) {
    children.push(el('p', { className: 'form-help', text: 'Cadastre os entregadores em Configurações > Delivery para despachar daqui.' }));
  } else {
    const select = el('select', { id: 'dispatch-courier', className: 'select-styled' });
    for (const entry of couriers) {
      const option = el('option', { value: entry.id, text: entry.name });
      option.selected = entry.id === panel.courierId;
      select.append(option);
    }
    select.addEventListener('change', () => { panel.courierId = select.value; renderResult(); });
    children.push(el('label', { for: 'dispatch-courier', text: 'Entregador' }), select);
  }
  children.push(el('div', { id: 'dispatch-result', className: 'dispatch-card' }));
  panel.container.replaceChildren(...children);
  renderResult();
}

/** Redesenha com os entregadores atuais do rascunho (ao abrir a aba Pedidos). */
export function refreshDispatchPanel() {
  render();
}

export function mountDispatchPanel({ getContent, doc = globalThis.document } = {}) {
  const container = doc?.getElementById('dispatch-panel');
  if (!container) return;
  Object.assign(panel, { getContent: getContent ?? (() => null), container, doc, text: '', courierId: '' });
  render();
}
