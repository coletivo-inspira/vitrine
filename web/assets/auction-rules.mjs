/**
 * Regras do leilão compartilhadas entre a vitrine pública, o painel, o Worker e o
 * motor em memória dos testes. A autoridade final é a função SQL
 * `private.place_auction_bid`; manter os valores abaixo iguais aos da migração
 * `20261112194217_auction_bids.sql`.
 */

export const AUCTION_RULES = Object.freeze({
  defaultIncrementCents: 100,
  minIncrementCents: 100,
  maxIncrementCents: 1_000_000,
  minStartCents: 100,
  maxAmountCents: 100_000_000,
  maxJumpFactor: 10,
  maxScheduleDays: 60,
  softCloseMs: 3 * 60_000,
  maxExtensionMs: 60 * 60_000,
  visitorMinIntervalMs: 15_000,
  visitorLotHourlyMax: 10,
  visitorSiteDailyMax: 40,
  visitorLotMaxIdentities: 3,
  lotMaxBids: 300,
  retentionDays: 90,
  recentBidsShown: 5,
  boardPollMs: 30_000,
  nameMinLength: 2,
  nameMaxLength: 60,
  voidReasonMinLength: 3,
  voidReasonMaxLength: 200
});

export const AUCTION_ERRORS = Object.freeze({
  INVALID_BID: { status: 400, message: 'Confira o valor, o nome e o WhatsApp do lance.' },
  BIDDER_BLOCKED: { status: 403, message: 'Este contato não pode dar lances nesta vitrine.' },
  BIDDER_IS_OWNER: { status: 403, message: 'O WhatsApp da própria vitrine não pode dar lances.' },
  PUBLICATION_NOT_FOUND: { status: 404, message: 'Vitrine publicada não encontrada.' },
  AUCTION_NOT_FOUND: { status: 404, message: 'Este item não está em leilão.' },
  AUCTION_CLOSED: { status: 409, message: 'Este leilão já foi encerrado.' },
  ALREADY_LEADING: { status: 409, message: 'Seu lance já é o maior. Aguarde outra oferta para cobrir.' },
  AUCTION_BID_LIMIT: { status: 409, message: 'Este leilão atingiu o limite de lances.' },
  BID_TOO_LOW: { status: 422, message: 'O lance está abaixo do mínimo.' },
  BID_TOO_HIGH: { status: 422, message: 'O valor está muito acima do lance atual. Confira os dígitos.' },
  BID_RATE_LIMITED: { status: 429, message: 'Aguarde alguns segundos antes de um novo lance.' },
  TOO_MANY_IDENTITIES: { status: 429, message: 'Limite de contatos diferentes atingido neste leilão.' },
  AUCTIONS_UNAVAILABLE: { status: 503, message: 'Leilões indisponíveis no momento. Tente mais tarde.' }
});

export class AuctionError extends Error {
  constructor(code, details = {}) {
    super(AUCTION_ERRORS[code]?.message ?? 'Não foi possível registrar o lance.');
    this.name = 'AuctionError';
    this.code = code;
    this.status = AUCTION_ERRORS[code]?.status ?? 400;
    this.details = details;
  }
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const WHATSAPP_PATTERN = /^[1-9]\d{7,14}$/;
const ITEM_ID_PATTERN = /^[^\s<>]{1,64}$/;

export function parseAuctionEndsAt(value) {
  if (typeof value !== 'string' || !ISO_PATTERN.test(value.trim())) return null;
  const ms = Date.parse(value.trim());
  return Number.isFinite(ms) ? new Date(ms) : null;
}

export function isAuctionItem(item) {
  return Boolean(
    item &&
      typeof item.priceMode === 'string' &&
      item.priceMode.trim() === 'offer' &&
      parseAuctionEndsAt(item.auctionEndsAt)
  );
}

export function getAuctionTerms(item) {
  const ends = parseAuctionEndsAt(item?.auctionEndsAt);
  if (!ends) return null;
  const price = Number.isSafeInteger(item.priceCents) ? item.priceCents : 0;
  const rawIncrement = item.bidIncrementCents;
  const incrementCents =
    Number.isSafeInteger(rawIncrement) &&
    rawIncrement >= AUCTION_RULES.minIncrementCents &&
    rawIncrement <= AUCTION_RULES.maxIncrementCents
      ? rawIncrement
      : AUCTION_RULES.defaultIncrementCents;
  return {
    startCents: Math.min(Math.max(price, AUCTION_RULES.minStartCents), AUCTION_RULES.maxAmountCents),
    incrementCents,
    scheduledEndsAt: ends.toISOString()
  };
}

export function computeNextMinimumCents({ startCents, incrementCents, currentCents }) {
  if (!Number.isSafeInteger(currentCents) || currentCents <= 0) return startCents;
  return currentCents + incrementCents;
}

export function computeMaxBidCents(requiredCents) {
  return Math.min(requiredCents * AUCTION_RULES.maxJumpFactor, AUCTION_RULES.maxAmountCents);
}

export function applySoftClose({ endsAtMs, scheduledEndsAtMs, nowMs }) {
  if (endsAtMs - nowMs >= AUCTION_RULES.softCloseMs) return endsAtMs;
  return Math.min(
    Math.max(endsAtMs, nowMs + AUCTION_RULES.softCloseMs),
    scheduledEndsAtMs + AUCTION_RULES.maxExtensionMs
  );
}

export function normalizeBidderWhatsapp(raw) {
  const text = String(raw ?? '').trim();
  const digits = text.replace(/\D/g, '');
  const hasCountryCode = text.startsWith('+');
  const withCountry = !hasCountryCode && (digits.length === 10 || digits.length === 11) ? `55${digits}` : digits;
  return WHATSAPP_PATTERN.test(withCountry) ? withCountry : null;
}

export function normalizeBidderName(raw) {
  if (typeof raw !== 'string') return null;
  const cleaned = raw.replace(/\s+/g, ' ').trim();
  if (
    cleaned.length < AUCTION_RULES.nameMinLength ||
    cleaned.length > AUCTION_RULES.nameMaxLength ||
    /[<>]/.test(cleaned)
  ) {
    return null;
  }
  return cleaned;
}

export function validateBidPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new AuctionError('INVALID_BID');
  }
  const itemId = typeof payload.itemId === 'string' ? payload.itemId.trim() : '';
  const name = normalizeBidderName(payload.name);
  const whatsapp = normalizeBidderWhatsapp(payload.whatsapp);
  const amountCents = payload.amountCents;
  if (
    !ITEM_ID_PATTERN.test(itemId) ||
    !name ||
    !whatsapp ||
    payload.consent !== true ||
    !Number.isSafeInteger(amountCents) ||
    amountCents < AUCTION_RULES.minStartCents ||
    amountCents > AUCTION_RULES.maxAmountCents
  ) {
    throw new AuctionError('INVALID_BID');
  }
  return { itemId, name, whatsapp, amountCents };
}

export function shortBidRef(bidId) {
  return String(bidId ?? '').replace(/-/g, '').slice(0, 8);
}

export function formatAuctionCents(cents) {
  const value = Number.isSafeInteger(cents) && cents >= 0 ? cents : 0;
  return `R$ ${Math.floor(value / 100).toLocaleString('pt-BR')},${String(value % 100).padStart(2, '0')}`;
}

export function formatRemaining(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'encerrado';
  const totalMinutes = Math.floor(ms / 60_000);
  if (totalMinutes < 1) return 'menos de 1 min';
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return hours > 0 ? `${days} d ${hours} h` : `${days} d`;
  if (hours > 0) return minutes > 0 ? `${hours} h ${minutes} min` : `${hours} h`;
  return `${minutes} min`;
}

export function formatAuctionDeadline(iso) {
  const date = iso instanceof Date ? iso : new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(date.getDate())}/${pad(date.getMonth() + 1)} às ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function auctionErrorMessage(code, details = {}) {
  if (code === 'BID_TOO_LOW' && Number.isSafeInteger(details.requiredCents)) {
    return `O lance mínimo agora é ${formatAuctionCents(details.requiredCents)}.`;
  }
  return AUCTION_ERRORS[code]?.message ?? 'Não foi possível registrar o lance. Tente novamente.';
}

export function buildWhatsappHref(phoneDigits, text) {
  const digits = String(phoneDigits ?? '').replace(/\D/g, '');
  if (!WHATSAPP_PATTERN.test(digits)) return '';
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}
