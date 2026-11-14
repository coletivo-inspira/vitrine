// Estado público do item (#133): `available` (padrão, fica fora do snapshot) ou
// `soon` ("Em breve"). Usado pela publicação (servidor), pela vitrine pública e pelo
// editor, para que selo, link "Avise-me" e regras de seleção sejam os mesmos.
// O estado privado "Oculto" continua sendo `active: false` no rascunho.
import { withMilaRelayPrefix } from './mila-relay.mjs';

export const ITEM_AVAILABILITY_SOON = 'soon';
export const ITEM_AVAILABILITY_VALUES = Object.freeze(['available', ITEM_AVAILABILITY_SOON]);
export const ITEM_AVAILABILITY_LABEL_MAX = 24;
export const DEFAULT_SOON_LABEL = 'Em breve';
export const NOTIFY_BUTTON_LABEL = 'Avise-me pelo WhatsApp';
export const NOTIFY_CLICK_METRIC = 'notify_click';

/** Estados do seletor do editor, na ordem exibida. */
export const ITEM_VISIBILITY_STATES = Object.freeze([
  Object.freeze({ value: 'available', label: 'Disponível', hint: 'Aparece na vitrine e pode ser escolhido.' }),
  Object.freeze({ value: 'soon', label: 'Em breve', hint: 'Aparece com o selo e o botão "Avise-me", sem entrar no pedido.' }),
  Object.freeze({ value: 'hidden', label: 'Oculto', hint: 'Some da vitrine na próxima publicação.' })
]);

const WHATSAPP_DIGITS = /^[1-9]\d{7,14}$/;

export function isItemSoon(item) {
  return item?.availability === ITEM_AVAILABILITY_SOON;
}

/** Texto do dono para o selo, sem espaços repetidos; `''` quando vazio ou inválido. */
export function normalizeAvailabilityLabel(raw) {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
}

export function soonBadgeText(item) {
  const label = normalizeAvailabilityLabel(item?.availabilityLabel);
  return label && label.length <= ITEM_AVAILABILITY_LABEL_MAX ? label : DEFAULT_SOON_LABEL;
}

export function buildNotifyMessage(itemName) {
  const name = typeof itemName === 'string' && itemName.trim() ? itemName.trim() : 'este item';
  return `Olá! Quero ser avisado(a) quando ${name} estiver disponível.`;
}

/**
 * Link `wa.me` do "Avise-me". No modo Mila o snapshot já traz o número da Mila em
 * `whatsapp`, e a mensagem ganha o código da vitrine (ADR 0012). Sem número válido: `''`.
 */
export function buildNotifyHref(menu, item) {
  const digits = String(menu?.whatsapp ?? '').replace(/\D/g, '');
  if (!WHATSAPP_DIGITS.test(digits)) return '';
  const message = withMilaRelayPrefix(
    buildNotifyMessage(item?.name),
    menu?.orderRelay,
    menu?.name || menu?.businessName || ''
  );
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

/** Estado do seletor para um item do rascunho (rascunhos antigos: Disponível ou Oculto). */
export function itemVisibilityState(item) {
  if (!item || item.active === false || item.available === false) return 'hidden';
  return isItemSoon(item) ? 'soon' : 'available';
}

/**
 * Aplica o estado escolhido no rascunho sem apagar dados: o texto do selo fica guardado
 * mesmo quando o item volta a "Disponível" ou fica "Oculto".
 */
export function applyItemVisibilityState(item, state) {
  if (!item || typeof item !== 'object') return item;
  if (state === 'hidden') {
    item.active = false;
    if (Object.hasOwn(item, 'available')) item.available = false;
    return item;
  }
  item.active = true;
  if (Object.hasOwn(item, 'available')) item.available = true;
  if (state === 'soon') item.availability = ITEM_AVAILABILITY_SOON;
  else delete item.availability;
  return item;
}
