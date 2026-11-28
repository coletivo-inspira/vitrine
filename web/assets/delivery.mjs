// Delivery da vitrine (spec 021): links das lojas no iFood e no 99Food, taxa de
// entrega, forma de pagamento e entregadores. Módulo puro: roda no Worker, no Node
// (testes), na vitrine pública e no painel. Nenhuma API externa: tudo vira link.

export const DELIVERY_PLATFORMS = Object.freeze([
  Object.freeze({ id: 'ifood', label: 'iFood', domain: 'ifood.com.br' }),
  Object.freeze({ id: 'food99', label: '99Food', domain: '99app.com' })
]);
export const DELIVERY_FEE_MAX_CENTS = 50000;
export const MAX_DELIVERY_COURIERS = 20;
export const COURIER_NAME_MAX = 60;
export const PAYMENT_CHANGE_MAX_CENTS = 100000;

// Ícones de traço em 24×24, no mesmo desenho dos ícones de destaques.
export const PAYMENT_METHODS = Object.freeze([
  Object.freeze({ id: 'pix', label: 'Pix', icon: 'M12 3l9 9-9 9-9-9 9-9ZM12 8.5l3.5 3.5-3.5 3.5L8.5 12 12 8.5Z' }),
  Object.freeze({ id: 'card', label: 'Cartão na entrega', icon: 'M3 6h18v12H3ZM3 10h18M7 15h4' }),
  Object.freeze({ id: 'cash', label: 'Dinheiro', icon: 'M2 7h20v10H2ZM12 9.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5ZM6 10v4M18 10v4' })
]);

const WHATSAPP_PATTERN = /^[1-9]\d{9,14}$/;
const UF_PATTERN = /^[A-Z]{2}$/;
export const DELIVERY_CITY_MAX = 60;
const COURIER_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const URL_MAX = 500;

function present(value) {
  return typeof value === 'string' ? Boolean(value.trim()) : value !== undefined && value !== null;
}

function platformById(id) {
  return DELIVERY_PLATFORMS.find((platform) => platform.id === id) ?? null;
}

/** Endereço HTTPS da loja na plataforma (host igual ou subdomínio do domínio dela) ou `null`. */
export function normalizeDeliveryPlatformUrl(platformId, value) {
  const platform = platformById(platformId);
  if (!platform || typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || raw.length > URL_MAX) return null;
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (host !== platform.domain && !host.endsWith(`.${platform.domain}`)) return null;
  return url.href;
}

/** Links válidos da vitrine, na ordem de `DELIVERY_PLATFORMS`: `[{ id, label, url }]`. */
export function deliveryPlatformLinks(content) {
  const source = content?.deliveryPlatforms;
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  return DELIVERY_PLATFORMS.flatMap((platform) => {
    const url = normalizeDeliveryPlatformUrl(platform.id, source[platform.id]);
    return url ? [{ id: platform.id, label: platform.label, url }] : [];
  });
}

/** Projeção pública: `{ deliveryPlatforms }` só com links válidos, ou `{}`. */
export function projectPublicDeliveryPlatforms(content) {
  const links = deliveryPlatformLinks(content);
  return links.length ? { deliveryPlatforms: Object.fromEntries(links.map((link) => [link.id, link.url])) } : {};
}

/** Cidade das entregas (`{ city, uf }`), usada para orientar a busca do endereço com mapa. */
export function normalizeDeliveryArea(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const city = typeof value.city === 'string' ? value.city.replace(/\s+/g, ' ').trim() : '';
  const uf = typeof value.uf === 'string' ? value.uf.trim().toUpperCase() : '';
  if (city.length < 2 || city.length > DELIVERY_CITY_MAX || /[<>{}]/.test(city) || !UF_PATTERN.test(uf)) return null;
  return { city, uf };
}

export function projectPublicDeliveryArea(content) {
  const area = normalizeDeliveryArea(content?.deliveryArea);
  return area ? { deliveryArea: area } : {};
}

/** Referência de cidade para a busca: a cidade das entregas ou a do endereço público. */
export function deliverySearchArea(menu) {
  return normalizeDeliveryArea(menu?.deliveryArea) ?? normalizeDeliveryArea(menu?.publicAddress);
}

export function normalizeCourierWhatsapp(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return WHATSAPP_PATTERN.test(digits) ? digits : null;
}

/** Entregadores válidos do rascunho (privados: nunca entram na projeção pública). */
export function draftCouriers(content) {
  const list = Array.isArray(content?.deliveryCouriers) ? content.deliveryCouriers : [];
  return list.flatMap((entry) => {
    const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
    const whatsapp = normalizeCourierWhatsapp(entry?.whatsapp);
    const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
    return name && whatsapp && COURIER_ID_PATTERN.test(id) ? [{ id, name, whatsapp }] : [];
  });
}

/** Erros do delivery no rascunho, no formato `{ field, code, message }`. */
export function deliveryDraftErrors(content) {
  const errors = [];
  const platforms = content?.deliveryPlatforms;
  if (platforms !== undefined && platforms !== null) {
    if (typeof platforms !== 'object' || Array.isArray(platforms)) {
      errors.push({ field: 'deliveryPlatforms', code: 'INVALID_DELIVERY_PLATFORM', message: 'Os links do delivery precisam ser um objeto.' });
    } else {
      for (const key of Object.keys(platforms)) {
        const platform = platformById(key);
        if (!platform) {
          errors.push({ field: `deliveryPlatforms.${key}`, code: 'INVALID_DELIVERY_PLATFORM', message: `Plataforma de delivery desconhecida: ${key}.` });
        } else if (present(platforms[key]) && !normalizeDeliveryPlatformUrl(key, platforms[key])) {
          errors.push({
            field: `deliveryPlatforms.${key}`,
            code: 'INVALID_DELIVERY_PLATFORM',
            message: `Use o link da sua loja no ${platform.label}, que começa com https:// e é do domínio ${platform.domain}.`
          });
        }
      }
    }
  }

  if (content?.deliveryArea !== undefined && content.deliveryArea !== null && !normalizeDeliveryArea(content.deliveryArea)) {
    errors.push({ field: 'deliveryArea', code: 'INVALID_DELIVERY_AREA', message: `Informe a cidade das entregas (até ${DELIVERY_CITY_MAX} caracteres) e a UF, como Belo Horizonte e MG.` });
  }

  const couriers = content?.deliveryCouriers;
  if (couriers !== undefined && couriers !== null) {
    if (!Array.isArray(couriers) || couriers.length > MAX_DELIVERY_COURIERS) {
      errors.push({ field: 'deliveryCouriers', code: 'INVALID_COURIER', message: `Cadastre até ${MAX_DELIVERY_COURIERS} entregadores.` });
    } else {
      const ids = new Set();
      couriers.forEach((entry, index) => {
        const name = typeof entry?.name === 'string' ? entry.name.trim() : '';
        const id = typeof entry?.id === 'string' ? entry.id.trim() : '';
        if (!COURIER_ID_PATTERN.test(id) || ids.has(id)) {
          errors.push({ field: `deliveryCouriers.${index}.id`, code: 'INVALID_COURIER', message: 'Identificador de entregador inválido ou repetido.' });
        }
        ids.add(id);
        if (!name || name.length > COURIER_NAME_MAX) {
          errors.push({ field: `deliveryCouriers.${index}.name`, code: 'INVALID_COURIER', message: `Informe o nome do entregador (até ${COURIER_NAME_MAX} caracteres).` });
        }
        if (!normalizeCourierWhatsapp(entry?.whatsapp)) {
          errors.push({ field: `deliveryCouriers.${index}.whatsapp`, code: 'INVALID_COURIER', message: 'Informe o WhatsApp do entregador com DDD, como 31 98888-7777.' });
        }
      });
    }
  }
  return errors;
}

export function isValidDeliveryFeeCents(value) {
  return Number.isSafeInteger(value) && value >= 0 && value <= DELIVERY_FEE_MAX_CENTS;
}

/** Taxa que entra no total: só na entrega e só quando configurada. */
export function deliveryFeeFor(orderFields, mode) {
  const fee = orderFields?.deliveryFeeCents;
  return mode === 'delivery' && isValidDeliveryFeeCents(fee) ? fee : 0;
}

/** Texto do pagamento para a mensagem, como `Dinheiro (troco para R$ 100,00)`; `''` sem escolha. */
export function describePayment(choice, formatPrice) {
  const method = PAYMENT_METHODS.find((entry) => entry.id === choice?.method);
  if (!method) return '';
  const change = choice?.changeForCents;
  if (method.id === 'cash' && Number.isSafeInteger(change) && change > 0 && change <= PAYMENT_CHANGE_MAX_CENTS) {
    return `${method.label} (troco para ${formatPrice(change)})`;
  }
  return method.label;
}
