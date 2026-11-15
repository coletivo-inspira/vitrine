// Regras dos links diretos da central de canais (issue #125). Módulo puro: roda no
// Worker (validação e projeção), no Node (testes) e no painel.
import { MILA_WHATSAPP, ORDER_RELAY_MILA, buildMilaRelayCode } from './mila-relay.mjs';

export const INSTAGRAM_HOSTS = Object.freeze(['instagram.com', 'www.instagram.com']);
export const PUBLIC_EMAIL_MAX = 120;
const INSTAGRAM_HANDLE = /^[A-Za-z0-9_.]{1,30}$/;
const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct']);
const EMAIL_PATTERN = /^[^\s@<>"'()]+@[^\s@<>"'()]+\.[a-z]{2,}$/i;
const WHATSAPP_PATTERN = /^[1-9]\d{7,14}$/;

function validHandle(handle) {
  return INSTAGRAM_HANDLE.test(handle) && !handle.includes('..') && !INSTAGRAM_RESERVED.has(handle.toLowerCase());
}

/** Aceita `@perfil`, `perfil` ou `https://instagram.com/perfil`; devolve o perfil ou `null`. */
export function instagramHandleFrom(value) {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw) return null;
  if (/^@?[A-Za-z0-9_.]+$/.test(raw)) {
    const handle = raw.replace(/^@/, '');
    return validHandle(handle) ? handle : null;
  }
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  if (!INSTAGRAM_HOSTS.includes(url.hostname.toLowerCase())) return null;
  const handle = url.pathname.match(/^\/([A-Za-z0-9_.]{1,30})\/?$/)?.[1];
  return handle && validHandle(handle) ? handle : null;
}

export function instagramUrlFromHandle(handle) {
  return `https://www.instagram.com/${handle}/`;
}

/** Endereço canônico do perfil (`https://www.instagram.com/<perfil>/`) ou `null`. */
export function normalizeInstagramUrl(value) {
  const handle = instagramHandleFrom(value);
  return handle ? instagramUrlFromHandle(handle) : null;
}

/**
 * Campo único do rascunho: `instagramUrl`. O importador do Linktree gravava o perfil
 * em `instagram`; esse valor continua aceito e vira `instagramUrl` na leitura.
 */
export function draftInstagramUrl(content) {
  const current = typeof content?.instagramUrl === 'string' && content.instagramUrl.trim()
    ? content.instagramUrl
    : content?.instagram;
  return normalizeInstagramUrl(current);
}

export function normalizePublicEmail(value) {
  if (typeof value !== 'string') return null;
  const email = value.trim();
  return email && email.length <= PUBLIC_EMAIL_MAX && EMAIL_PATTERN.test(email) ? email : null;
}

function present(value) {
  return typeof value === 'string' ? Boolean(value.trim()) : value !== undefined && value !== null;
}

/** Erros dos links diretos do rascunho, no formato `{ field, code, message }`. */
export function channelDraftErrors(content) {
  const errors = [];
  if (present(content?.instagramUrl) && !normalizeInstagramUrl(content.instagramUrl)) {
    errors.push({
      field: 'instagramUrl',
      code: 'INVALID_INSTAGRAM_URL',
      message: 'Use o endereço do perfil no Instagram (https://www.instagram.com/seu.perfil/) ou só o @perfil.'
    });
  }
  if (present(content?.instagram) && !instagramHandleFrom(content.instagram)) {
    errors.push({
      field: 'instagram',
      code: 'INVALID_INSTAGRAM_URL',
      message: 'O perfil do Instagram importado é inválido. Informe de novo em Canais.'
    });
  }
  if (present(content?.publicEmail) && !normalizePublicEmail(content.publicEmail)) {
    errors.push({
      field: 'publicEmail',
      code: 'INVALID_PUBLIC_EMAIL',
      message: `Use um e-mail válido de até ${PUBLIC_EMAIL_MAX} caracteres, como contato@seunegocio.com.br.`
    });
  }
  return errors;
}

/**
 * Link do botão "Testar" do WhatsApp: só abre a conversa. Sem texto no modo direto; no
 * modo Mila leva o código da vitrine, porque é ele que identifica o negócio.
 */
export function whatsappTestLink(content, slug) {
  if (content?.orderRelay === ORDER_RELAY_MILA) {
    let code = '';
    try {
      code = buildMilaRelayCode(slug);
    } catch {
      code = '';
    }
    return {
      via: 'mila',
      number: MILA_WHATSAPP,
      url: `https://wa.me/${MILA_WHATSAPP}${code ? `?text=${encodeURIComponent(`#${code} `)}` : ''}`
    };
  }
  const number = typeof content?.whatsapp === 'string' ? content.whatsapp.trim() : '';
  if (!WHATSAPP_PATTERN.test(number)) return { via: 'direct', number: null, url: null };
  return { via: 'direct', number, url: `https://wa.me/${number}` };
}
