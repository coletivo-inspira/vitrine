// Webhook de mensagens do Instagram (login unificado). Verificação `hub.challenge`,
// assinatura `X-Hub-Signature-256` sobre o corpo bruto e normalização dos eventos.
// Referência: docs/integrations/auto-reply/webhook-events.md.
import { constantTimeEqual, verifyHmacSha256 } from './crypto.mjs';

export const SIGNATURE_HEADER = 'x-hub-signature-256';
export const MAX_WEBHOOK_BYTES = 1024 * 1024;
const ID = /^[0-9]{1,32}$/;

/** `GET` de verificação. Devolve o texto do challenge ou `null`. */
export function verifyWebhookChallenge(searchParams, verifyToken) {
  const mode = searchParams.get('hub.mode');
  const token = searchParams.get('hub.verify_token');
  const challenge = searchParams.get('hub.challenge');
  if (mode !== 'subscribe' || !verifyToken || !challenge || !/^[A-Za-z0-9_-]{1,128}$/.test(challenge)) return null;
  return constantTimeEqual(token ?? '', verifyToken) ? challenge : null;
}

/** `sha256=<hex>` = HMAC-SHA256(corpo bruto, chave do app), em tempo constante. */
export async function verifyMetaSignature(rawBody, header, appSecret) {
  const match = /^sha256=([a-f0-9]{64})$/i.exec(String(header ?? '').trim());
  if (!match || !appSecret) return false;
  const expected = Uint8Array.from(match[1].toLowerCase().match(/../g), (pair) => parseInt(pair, 16));
  return verifyHmacSha256(appSecret, rawBody, expected);
}

const IGNORED_FLAGS = Object.freeze([
  ['is_echo', 'echo'],
  ['is_self', 'self_test'],
  ['is_deleted', 'deleted'],
  ['is_unsupported', 'unsupported']
]);

function classify(entryId, item) {
  const senderId = String(item?.sender?.id ?? '');
  const recipientId = String(item?.recipient?.id ?? '');
  const timestamp = Number(item?.timestamp);
  const base = {
    accountId: entryId,
    senderId: ID.test(senderId) ? senderId : null,
    eventAt: Number.isFinite(timestamp) && timestamp > 0 ? new Date(timestamp).toISOString() : null
  };
  if (item?.read) return { ...base, eligible: false, reason: 'read' };
  if (item?.reaction) return { ...base, eligible: false, reason: 'reaction' };
  if (item?.message_edit) return { ...base, eligible: false, reason: 'edit' };
  if (item?.postback) return { ...base, eligible: false, reason: 'postback' };
  const message = item?.message;
  if (!message || typeof message !== 'object') {
    return { ...base, eligible: false, reason: item?.referral ? 'referral' : 'not_message' };
  }
  for (const [flag, reason] of IGNORED_FLAGS) {
    if (message[flag] === true) return { ...base, eligible: false, reason };
  }
  if (!message.mid || typeof message.mid !== 'string' || message.mid.length > 256) {
    return { ...base, eligible: false, reason: 'no_message_id' };
  }
  if (message.quick_reply) return { ...base, eligible: false, reason: 'quick_reply' };
  if (!base.senderId) return { ...base, eligible: false, reason: 'invalid_sender' };
  if (senderId === entryId) return { ...base, eligible: false, reason: 'echo' };
  if (recipientId && recipientId !== entryId) return { ...base, eligible: false, reason: 'not_for_account' };
  if (!base.eventAt) return { ...base, eligible: false, reason: 'invalid_timestamp' };
  return { ...base, eventId: message.mid, eligible: true, reason: null };
}

/**
 * Lista plana de eventos. Nenhum texto, anexo ou dado do perfil sai daqui: só a conta do
 * negócio, o id do remetente (para responder), o id da mensagem e a hora.
 */
export function normalizeInstagramWebhook(payload) {
  const roots = Array.isArray(payload) ? payload : [payload];
  const events = [];
  for (const root of roots) {
    if (!root || typeof root !== 'object' || root.object !== 'instagram' || !Array.isArray(root.entry)) {
      events.push({ eligible: false, reason: 'unsupported_object' });
      continue;
    }
    for (const entry of root.entry) {
      const entryId = String(entry?.id ?? '');
      if (!ID.test(entryId)) {
        events.push({ eligible: false, reason: 'invalid_entry' });
        continue;
      }
      const items = Array.isArray(entry.messaging) ? entry.messaging : [];
      if (!items.length) events.push({ accountId: entryId, eligible: false, reason: entry.changes ? 'change_field' : 'empty' });
      for (const item of items) events.push(classify(entryId, item));
    }
  }
  return events;
}

/** Contagem dos motivos de descarte, para um único log por lote. */
export function summarizeIgnored(events) {
  const counts = {};
  for (const event of events) {
    if (event.eligible) continue;
    counts[event.reason] = (counts[event.reason] ?? 0) + 1;
  }
  return counts;
}
