/**
 * "Despachar entrega" (spec 021): lê a mensagem de pedido colada (no formato que a
 * vitrine monta) e prepara a mensagem e o link `wa.me` do entregador. Módulo puro, sem
 * rede: nada sai do aparelho além do link que a pessoa abre.
 */
const ADDRESS_LINE = /^\s*(?:Entrega(?: no endereço)?|Endereço)\s*:\s*(.+)$/im;
const TOTAL_LINE = /^\s*Total[^:\n]*:\s*(R\$\s?[\d.]+,\d{2})/im;
const PAYMENT_LINE = /^\s*Pagamento\s*:\s*(.+)$/im;
const NOTES_LINE = /^\s*Observações\s*:\s*(.+)$/im;
const NAME_PATTERNS = [/Meu nome é\s+([^.\n]+)/i, /^\s*Nome\s*:\s*(.+)$/im];
const PICKUP_LINE = /^\s*Retirada no local\s*$/im;

const MESSAGE_MAX = 3500;

function firstMatch(text, pattern) {
  return text.match(pattern)?.[1]?.trim() ?? '';
}

/** Campos do pedido colado. Campos que não aparecem voltam vazios. */
export function parseOrderMessage(rawText) {
  const text = String(rawText ?? '').slice(0, MESSAGE_MAX);
  const name = NAME_PATTERNS.map((pattern) => firstMatch(text, pattern)).find(Boolean) ?? '';
  return {
    name,
    address: firstMatch(text, ADDRESS_LINE),
    total: firstMatch(text, TOTAL_LINE),
    payment: firstMatch(text, PAYMENT_LINE),
    notes: firstMatch(text, NOTES_LINE),
    pickup: PICKUP_LINE.test(text),
    text: text.trim()
  };
}

export function mapsLink(address) {
  const query = String(address ?? '').trim();
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : '';
}

/** Mensagem para o entregador: endereço, mapa, valor a cobrar, pagamento e o pedido inteiro. */
export function buildDispatchMessage(order, { businessName = '', courierName = '' } = {}) {
  const lines = [`Entrega${businessName ? ` ${businessName}` : ''}${courierName ? ` para ${courierName}` : ''}`];
  if (order.name) lines.push(`Cliente: ${order.name}`);
  if (order.address) {
    lines.push(`Endereço: ${order.address}`);
    lines.push(`Mapa: ${mapsLink(order.address)}`);
  }
  if (order.total) lines.push(`Cobrar: ${order.total}`);
  if (order.payment) lines.push(`Pagamento: ${order.payment}`);
  if (order.notes) lines.push(`Observações: ${order.notes}`);
  if (order.text) lines.push('', 'Pedido:', order.text);
  return lines.join('\n');
}

export function courierWhatsappLink(courier, message) {
  const digits = String(courier?.whatsapp ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const number = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
