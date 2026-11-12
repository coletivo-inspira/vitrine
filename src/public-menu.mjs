import { withMilaRelayPrefix } from '../web/assets/mila-relay.mjs';

// Explicit projection: never serialize the private draft or its owner/session.
function text(value, name, max = 160) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) {
    throw new TypeError(`Invalid ${name}`);
  }
  return value.trim();
}

const ALLOWED_PUBLIC_TEMPLATES = Object.freeze([
  'pizzeria-v1',
  'products-v1',
  'booking-v1',
  'quote-v1'
]);

const RESERVED_PUBLIC_SLUGS = Object.freeze([
  'admin',
  'api',
  'www',
  'app',
  'auth',
  'portal',
  'assets',
  'data',
  'login',
  'logout',
  'como-funciona',
  'possibilidades',
  'planos',
  'orcamento',
  'por-cidade'
]);

export function publicMenu(draft) {
  if (!draft || !ALLOWED_PUBLIC_TEMPLATES.includes(draft.template)) throw new TypeError('Invalid template');
  const slug = text(draft.slug, 'slug', 63);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || RESERVED_PUBLIC_SLUGS.includes(slug)) {
    throw new TypeError('Invalid slug');
  }
  const phone = text(draft.whatsapp, 'whatsapp', 15);
  if (!/^[1-9]\d{7,14}$/.test(phone)) throw new TypeError('Use international phone digits');
  if (!Array.isArray(draft.items) || draft.items.length > 500) throw new TypeError('Invalid items');
  const ids = new Set();
  const items = draft.items.filter(item => item?.active === true).map(item => {
    const id = text(item.id, 'item id', 64);
    if (ids.has(id)) throw new TypeError('Duplicate item id');
    ids.add(id);
    if (!Number.isSafeInteger(item.priceCents) || item.priceCents < 0) throw new TypeError('Invalid price');
    return { id, name: text(item.name, 'item name'), priceCents: item.priceCents };
  });
  return { schemaVersion: 1, template: draft.template, slug,
    name: text(draft.name, 'name'), whatsapp: phone, currency: 'BRL', items };
}

export function whatsappLink(menu, itemId) {
  // Revalidate public data before constructing a URL. Opening it does not send a message.
  const checked = publicMenu({ ...menu, items: menu.items.map(item => ({ ...item, active: true })) });
  const item = checked.items.find(entry => entry.id === itemId);
  if (!item) throw new TypeError('Unknown item');
  const message = withMilaRelayPrefix(
    `Olá! Tenho interesse em ${item.name}. Pode confirmar preço e disponibilidade?`,
    menu.orderRelay,
    checked.name
  );
  return `https://wa.me/${checked.whatsapp}?text=${encodeURIComponent(message)}`;
}
