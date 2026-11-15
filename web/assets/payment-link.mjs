// Link de pagamento do próprio negócio por item (#134). Regras únicas usadas pela
// publicação (servidor), pela vitrine pública e pelo editor. A lista de domínios
// vem de `content/payment-link-domains.json` e é sempre passada como parâmetro:
// este módulo não conhece provedores.
// O pagamento acontece fora da plataforma (ADR 0013, item 8): a Vitrine só mostra o
// link, sem acrescentar parâmetros, e não confirma nem cobra nada.

export const PAYMENT_LINK_DEFAULT_LABEL = 'Pagar no site do negócio';
export const PAYMENT_LINK_LABEL_MAX = 32;
export const PAYMENT_LINK_URL_MAX = 2048;
export const PAYMENT_LINK_CLICK_METRIC = 'payment_link_click';
export const PAYMENT_LINK_NOTICE =
  'O pagamento é feito no site do negócio. A Vitrine Inspira não recebe nem guarda dados de pagamento.';
// Ícone estático de "abre em outro site" (sem conteúdo do usuário).
export const PAYMENT_LINK_ICON_PATH = 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5';
export const PAYMENT_LINK_ICON =
  `<svg class="sf-payment-link-icon" width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${PAYMENT_LINK_ICON_PATH}"/></svg>`;
// Lance (valor ainda não definido) e troca (sem pagamento) não mostram o link.
export const PAYMENT_LINK_HIDDEN_PRICE_MODES = Object.freeze(['offer', 'trade']);

const HOST_PATTERN = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;
// Espaços, caracteres de controle e barra invertida (que o URL trata como "/").
const UNSAFE_CHARS = /[\s\u0000-\u001f\u007f\\]/;

/** Hosts da configuração, em minúsculas. Recusa curinga, ponto inicial ou host inválido. */
export function paymentLinkHosts(config) {
  const entries = Array.isArray(config?.domains) ? config.domains : [];
  const hosts = entries.map((entry) => (typeof entry === 'string' ? entry : entry?.host));
  for (const host of hosts) {
    if (typeof host !== 'string' || host !== host.toLowerCase() || !HOST_PATTERN.test(host)) {
      throw new Error(`Domínio de pagamento inválido na configuração: ${JSON.stringify(host)}`);
    }
  }
  if (new Set(hosts).size !== hosts.length) throw new Error('Domínio de pagamento repetido na configuração.');
  return Object.freeze([...hosts]);
}

function fail(code, message) {
  return { url: '', error: { code, message } };
}

/**
 * Confere o endereço digitado. Devolve `{ url }` (o endereço como o URL o lê, sem
 * nada acrescentado) ou `{ error: { code, message } }` com a mensagem para o campo.
 */
export function checkPaymentLinkUrl(raw, hosts) {
  const value = typeof raw === 'string' ? raw.trim() : '';
  if (!value) return fail('INVALID_PAYMENT_LINK', 'Cole o endereço do link de pagamento, começando com https://.');
  if (value.length > PAYMENT_LINK_URL_MAX) {
    return fail('INVALID_PAYMENT_LINK', `O link de pagamento deve ter no máximo ${PAYMENT_LINK_URL_MAX} caracteres.`);
  }
  if (!/^https:\/\//i.test(value)) {
    return fail('INVALID_PAYMENT_LINK', 'O link de pagamento precisa começar com https:// e ser o endereço do site de pagamento.');
  }
  if (UNSAFE_CHARS.test(value)) {
    return fail('INVALID_PAYMENT_LINK', 'O link de pagamento não pode ter espaços. Copie o endereço completo de novo.');
  }
  const authority = value.slice('https://'.length).split(/[/?#]/, 1)[0];
  if (authority.includes('@')) {
    return fail('INVALID_PAYMENT_LINK', 'Tire o usuário e a senha do link de pagamento (o trecho antes de "@").');
  }
  if (authority.includes(':')) {
    return fail('INVALID_PAYMENT_LINK', 'Tire a porta do link de pagamento (o trecho com ":" depois do domínio).');
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return fail('INVALID_PAYMENT_LINK', 'Link de pagamento inválido. Copie o endereço completo do site de pagamento.');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.port) {
    return fail('INVALID_PAYMENT_LINK', 'O link de pagamento precisa começar com https:// e ser o endereço do site de pagamento.');
  }
  const host = parsed.hostname.toLowerCase();
  if (!Array.isArray(hosts) || !hosts.includes(host)) {
    return fail(
      'PAYMENT_LINK_DOMAIN_NOT_ALLOWED',
      `O site ${host || 'informado'} não está na lista de sites de pagamento aceitos. Fale com a equipe Vitrine Inspira para incluir o seu provedor.`
    );
  }
  return { url: parsed.href, error: null };
}

/** Texto do botão sem espaços repetidos; `''` quando vazio. */
export function normalizePaymentLinkLabel(raw) {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim() : '';
}

export function paymentLinkLabel(link) {
  const label = normalizePaymentLinkLabel(link?.label);
  return label && label.length <= PAYMENT_LINK_LABEL_MAX ? label : PAYMENT_LINK_DEFAULT_LABEL;
}

/**
 * Link que a vitrine mostra para o item publicado, ou `null`: item "Em breve" (#133),
 * lance e troca não mostram. Só aceita `https://` (o snapshot já foi conferido).
 */
export function publicPaymentLink(item, priceMode = item?.priceMode) {
  const link = item?.paymentLink;
  if (!link || typeof link.url !== 'string' || !/^https:\/\//.test(link.url)) return null;
  if (item.availability === 'soon' || PAYMENT_LINK_HIDDEN_PRICE_MODES.includes(priceMode)) return null;
  return { url: link.url, label: paymentLinkLabel(link) };
}

/** Conta `payment_link_click` em qualquer link marcado com `data-payment-link` (só a contagem). */
export function bindPaymentLinkClickMetric(doc, record) {
  if (!doc || typeof doc.addEventListener !== 'function' || typeof record !== 'function') return false;
  doc.addEventListener('click', (event) => {
    const target = event?.target;
    if (target && typeof target.closest === 'function' && target.closest('[data-payment-link]')) {
      record(PAYMENT_LINK_CLICK_METRIC);
    }
  });
  return true;
}
