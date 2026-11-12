/**
 * Regras compartilhadas das cotas de apoio (Spec 014).
 * Usadas pelo validador do servidor (src/portal-validation.mjs), pelo editor do painel
 * e pela vitrine pública. Cotas nunca envolvem sorteio, prêmio ou retorno financeiro:
 * esses formatos dependem de autorização federal (Lei 5.768/1971; Decreto-Lei 3.688/1941,
 * art. 51) ou configuram valor mobiliário (Lei 6.385/1976; Resolução CVM 88/2022).
 */

export const QUOTA_MIN_TOTAL = 2;
export const QUOTA_MAX_TOTAL = 1000;
export const QUOTA_MAX_PER_SELECTION = 99;
export const QUOTA_TEXT_MAX_LENGTH = 240;

export const QUOTA_NO_DRAW_NOTICE = 'Sem sorteio: toda cota garante o mesmo benefício.';
export const QUOTA_PAYMENT_NOTICE =
  'A reserva não é pagamento. O valor é combinado direto com a vitrine pelo WhatsApp.';

const RAFFLE_TERMS_PATTERN =
  /\b(rifas?|rifar|sorteios?|sortear|sorteamos|sorteiam?|sorteados?|sorteadas?|numeros? da sorte|acao entre amigos|acoes entre amigos)\b/;

const QUOTA_ONLY_TERMS_PATTERN =
  /\b(premios?|premiacao|premiacoes|concorra|concorrer|concorrendo|bilhetes?|loterias?|bingos?|rendimentos?|rentabilidade|lucros?|dividendos?|juros|retorno financeiro|participacao nos resultados)\b/;

function normalizeForTermCheck(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

/**
 * Retorna o primeiro termo proibido encontrado (normalizado, sem acentos) ou null.
 * Termos de rifa/sorteio valem para qualquer item; termos de prêmio e retorno financeiro
 * valem apenas para itens de cota.
 */
export function findProhibitedQuotaTerm(values, { quota = false } = {}) {
  const list = Array.isArray(values) ? values : [values];
  for (const value of list) {
    if (typeof value !== 'string' || !value.trim()) continue;
    const normalized = normalizeForTermCheck(value);
    const raffle = normalized.match(RAFFLE_TERMS_PATTERN);
    if (raffle) return raffle[1];
    if (quota) {
      const quotaOnly = normalized.match(QUOTA_ONLY_TERMS_PATTERN);
      if (quotaOnly) return quotaOnly[1];
    }
  }
  return null;
}

export function getQuotaRemaining(item) {
  const total = Number.isSafeInteger(item?.quotaTotal) ? item.quotaTotal : 0;
  const filled = Number.isSafeInteger(item?.quotaFilled) ? item.quotaFilled : 0;
  return Math.max(0, total - Math.min(Math.max(filled, 0), total));
}
