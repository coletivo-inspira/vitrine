// Shared by the publication engine (server), the public storefront and the panel,
// so the code printed in a customer's message is the same one Mila looks up.

export const MILA_WHATSAPP = '553131890669';
export const ORDER_RELAY_MILA = 'mila';
export const ORDER_RELAY_DIRECT = 'direct';
export const ORDER_RELAY_MODES = Object.freeze([ORDER_RELAY_DIRECT, ORDER_RELAY_MILA]);

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MILA_RELAY_CODE_PATTERN = /^VI-[A-Z0-9]{1,6}-[0-9A-HJKMNP-TV-Z]{4}$/;
const CODE_IN_TEXT_PATTERN = /#?\b(VI-[A-Z0-9]{1,6}-[0-9A-HJKMNP-TV-Z]{4})\b/i;

function fnv1a32(text) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// Derived only from the public slug: the code never carries the owner's phone,
// and the same slug always yields the same code without a database column.
export function buildMilaRelayCode(slug) {
  if (typeof slug !== 'string' || !SLUG_PATTERN.test(slug.trim())) {
    throw new TypeError('Invalid slug for Mila relay code');
  }
  const normalized = slug.trim();
  const prefix = normalized.replace(/-/g, '').toUpperCase().slice(0, 6);
  let bits = fnv1a32(`vitrine-mila:${normalized}`) >>> 12;
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix = CROCKFORD[bits & 31] + suffix;
    bits >>>= 5;
  }
  return `VI-${prefix}-${suffix}`;
}

export function isMilaRelayCode(code) {
  return typeof code === 'string' && MILA_RELAY_CODE_PATTERN.test(code);
}

export function normalizeMilaRelayCode(raw) {
  if (typeof raw !== 'string') return null;
  const match = raw.trim().toUpperCase().match(CODE_IN_TEXT_PATTERN);
  return match ? match[1].toUpperCase() : null;
}

export function resolveOrderRelayMode(content) {
  return content?.orderRelay === ORDER_RELAY_MILA ? ORDER_RELAY_MILA : ORDER_RELAY_DIRECT;
}

export function buildPublicOrderRelay(slug) {
  return { via: ORDER_RELAY_MILA, code: buildMilaRelayCode(slug) };
}

export function withMilaRelayPrefix(message, orderRelay, businessName = '') {
  if (orderRelay?.via !== ORDER_RELAY_MILA || !isMilaRelayCode(orderRelay.code)) return message;
  const name = typeof businessName === 'string' && businessName.trim() ? ` · Pedido para ${businessName.trim()}` : '';
  return `#${orderRelay.code}${name}\n\n${message}`;
}

export function buildMilaForwardMessage({ businessName, code, order, customerPhone }) {
  const lines = [
    `Olá! Aqui é a Mila, da Vitrine Inspira. Chegou um pedido pela vitrine ${businessName} (#${code}):`,
    '',
    String(order ?? '').trim()
  ];
  const phone = String(customerPhone ?? '').replace(/\D/g, '');
  if (phone) {
    lines.push('', `Contato do cliente: https://wa.me/${phone}`);
  }
  return lines.join('\n');
}
