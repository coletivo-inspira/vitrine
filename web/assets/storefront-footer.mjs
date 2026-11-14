// Rodapé da vitrine pública: dados do negócio, links de `navigation.footer` e a
// linha de apoio (preços, privacidade, crédito e selo do plano Gratuito).
// Módulo puro: roda no Worker (publicação), no Node (testes) e no navegador.
import { describeWeek } from './business-hours.mjs';
import { ORDER_RELAY_MILA, withMilaRelayPrefix } from './mila-relay.mjs';

export const PROMO_SITE_URL = 'https://vitrine.inspira.dev.br/';
export const PRIVACY_URL = 'https://vitrine.inspira.dev.br/privacidade/';
export const COLLECTIVE_URL = 'https://inspira.dev.br/';
export const SUPPORT_BADGE_LABEL = 'Apoio Coletivo Me Inspira';
export const TAGLINE_MAX = 160;

export const DIRECT_ORDER_FOOTER_NOTE =
  'Preços em Reais (BRL). O botão abre uma conversa no WhatsApp para confirmar pedido e disponibilidade.';
export const MILA_RELAY_FOOTER_NOTE =
  'Preços em Reais (BRL). Os pedidos desta vitrine chegam à Mila, da equipe Vitrine Inspira, que repassa cada um ao negócio pelo WhatsApp.';

const INSTAGRAM_HOSTS = new Set(['instagram.com', 'www.instagram.com']);
const EMAIL_PATTERN = /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[a-z]{2,}$/i;
const DAY_SHORT = Object.freeze({ mon: 'Seg', tue: 'Ter', wed: 'Qua', thu: 'Qui', fri: 'Sex', sat: 'Sáb', sun: 'Dom' });

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function footerInstagramHref(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && INSTAGRAM_HOSTS.has(url.hostname) ? url.href : '';
  } catch {
    return '';
  }
}

export function footerEmail(value) {
  if (typeof value !== 'string') return '';
  const email = value.trim();
  return email.length <= 120 && EMAIL_PATTERN.test(email) ? email : '';
}

/**
 * Horário resumido do rodapé, agrupando dias seguidos com as mesmas faixas
 * ("Seg a sex: 18h às 23h"). Dias fechados ficam de fora; a lista completa está
 * no bloco "Horário e como chegar".
 */
export function summarizeWeek(hours) {
  const groups = [];
  for (const row of describeWeek(hours)) {
    const last = groups[groups.length - 1];
    if (last && last.text === row.text) last.days.push(row.day);
    else groups.push({ text: row.text, days: [row.day] });
  }
  return groups
    .filter((group) => group.text !== 'Fechado')
    .map(({ text, days }) => {
      const first = DAY_SHORT[days[0]];
      const lastDay = DAY_SHORT[days[days.length - 1]].toLowerCase();
      const label = days.length === 1 ? first : `${first} ${days.length === 2 ? 'e' : 'a'} ${lastDay}`;
      return `${label}: ${text}`;
    });
}

export function footerCity(menu) {
  const source = menu?.publicAddress?.city ? menu.publicAddress : menu?.locality;
  return source?.city && source?.uf ? `${source.city} – ${source.uf}` : '';
}

// Textos padrão de `getDefaultMessages` (src/portal-validation.mjs): são instruções
// de uso, não uma frase do negócio. O teste do rodapé confere a sincronia.
export const DEFAULT_WELCOME_TEXTS = Object.freeze([
  'Escolha o serviço desejado, selecione a data e o horário de preferência e confirme pelo WhatsApp.',
  'Selecione os itens de seu interesse e envie sua solicitação de orçamento pelo WhatsApp.',
  'Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.'
]);

/** Frase curta: o texto de boas-vindas escrito pelo negócio, quando cabe no rodapé. */
export function footerTagline(menu) {
  const text = String(menu?.messages?.welcomeText ?? '').trim();
  return text && text.length <= TAGLINE_MAX && !DEFAULT_WELCOME_TEXTS.includes(text) ? text : '';
}

/** Conversa geral no WhatsApp; no modo Mila usa o número da Mila e o código da vitrine. */
export function footerWhatsappHref(menu) {
  const phone = String(menu?.whatsapp ?? '').replace(/\D/g, '');
  if (!phone) return '';
  const message = withMilaRelayPrefix(
    `Olá! Vi a vitrine ${menu.name} e gostaria de conversar.`, menu.orderRelay, menu.name
  );
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

/** Snapshot sem `supportBadge: false` mostra o selo (plano Gratuito e versões antigas). */
export function showsSupportBadge(menu) {
  return menu?.supportBadge !== false;
}

/**
 * HTML do rodapé. `navigation` são os links de `navigation.footer` já projetados;
 * `extraLinks` recebe links prontos (ex.: página por cidade).
 */
export function renderStorefrontFooterHtml(menu, { navigation = [], extraLinks = '' } = {}) {
  const name = String(menu?.name ?? '').trim() || 'Vitrine';
  const viaMila = menu?.orderRelay?.via === ORDER_RELAY_MILA;
  const tagline = footerTagline(menu);
  const whatsapp = footerWhatsappHref(menu);
  const hours = summarizeWeek(menu?.businessHours);
  const city = footerCity(menu);
  const instagram = footerInstagramHref(menu?.instagramUrl);
  const email = footerEmail(menu?.publicEmail);

  const facts = [
    hours.length ? `<div><dt>Horário</dt><dd>${hours.map((line) => `<span>${escapeHtml(line)}</span>`).join('')}</dd></div>` : '',
    city ? `<div><dt>Cidade</dt><dd>${escapeHtml(city)}</dd></div>` : ''
  ].join('');
  const channels = [
    instagram
      ? `<li><a href="${escapeHtml(instagram)}" target="_blank" rel="noopener noreferrer" aria-label="Instagram de ${escapeHtml(name)} (abre em nova aba)">Instagram</a></li>`
      : '',
    email ? `<li><a href="mailto:${escapeHtml(email)}" aria-label="E-mail de ${escapeHtml(name)}: ${escapeHtml(email)}">${escapeHtml(email)}</a></li>` : ''
  ].join('');
  const links = (Array.isArray(navigation) ? navigation : [])
    .filter((link) => link?.label && link?.href)
    .map((link) => `<li><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></li>`)
    .join('');
  const linksHtml = links || extraLinks
    ? `<nav class="storefront-footer-links" aria-label="Links do rodapé">${links ? `<ul>${links}</ul>` : ''}${extraLinks}</nav>`
    : '';
  const badge = showsSupportBadge(menu)
    ? `<a class="storefront-support-badge" href="${COLLECTIVE_URL}" target="_blank" rel="noopener" aria-label="${SUPPORT_BADGE_LABEL} (abre o site do coletivo em nova aba)">${SUPPORT_BADGE_LABEL}</a>`
    : '';

  return `<footer class="storefront-footer" data-storefront-footer>
    <div class="wrap storefront-footer-inner">
      <div class="storefront-footer-grid${linksHtml ? '' : ' is-single'}">
        <section class="storefront-footer-business" aria-labelledby="storefront-footer-name">
          <h2 id="storefront-footer-name" class="storefront-footer-name">${escapeHtml(name)}</h2>${tagline ? `
          <p class="storefront-footer-tagline">${escapeHtml(tagline)}</p>` : ''}${whatsapp ? `
          <a class="storefront-footer-whatsapp" href="${escapeHtml(whatsapp)}" target="_blank" rel="noopener noreferrer">${viaMila ? 'Conversar pela Mila no WhatsApp' : 'Conversar no WhatsApp'}</a>` : ''}${facts ? `
          <dl class="storefront-footer-facts">${facts}</dl>` : ''}${channels ? `
          <ul class="storefront-footer-channels">${channels}</ul>` : ''}
        </section>${linksHtml ? `
        ${linksHtml}` : ''}
      </div>
      <div class="storefront-footer-support">
        <p class="storefront-footer-note">${viaMila ? MILA_RELAY_FOOTER_NOTE : DIRECT_ORDER_FOOTER_NOTE}</p>
        <p id="storefront-privacy-notice" class="storefront-footer-note storefront-privacy-notice">Privacidade (LGPD): só estatísticas agregadas de visitas, de onde vieram (como QR Code ou redes sociais) e escolhas, sem identificar quem visita, sem cookies de rastreamento nem coleta de endereço IP ou dados pessoais. Um cookie funcional e anônimo guarda sua curtida; nome e WhatsApp de um lance vão só para a vitrine e são apagados 90 dias após o encerramento. <a href="${PRIVACY_URL}">Privacidade</a></p>
        <div class="storefront-footer-credits">
          <a class="storefront-footer-credit" href="${PROMO_SITE_URL}" aria-label="Vitrine feita com Vitrine Inspira (conhecer a Vitrine Inspira)">
            <span>Vitrine feita com</span>
            <img class="brand-logo brand-logo-light" src="/assets/brand/vitrine.svg" width="104" height="32" alt="">
            <img class="brand-logo brand-logo-dark" src="/assets/brand/vitrine-inverse.svg" width="104" height="32" alt="">
          </a>${badge ? `
          ${badge}` : ''}
        </div>
      </div>
    </div>
  </footer>`;
}
