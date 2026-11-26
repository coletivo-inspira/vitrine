// Processamento de um evento já reclamado (idempotência gravada). Ordem: regras → vaga de
// frequência → endereço → mensagem → releitura do estado → envio com tentativas limitadas
// → registro. O texto do consumidor nunca chega aqui.
import { renderAutoReplyMessage, AUTO_REPLY_MAX_BYTES } from '../../web/assets/auto-reply-message.mjs';
import { decryptChannelToken, AUTO_REPLY_KEY_ENV } from './crypto.mjs';
import { resolveAutoReplyPublicUrl } from './public-url.mjs';
import { evaluateEvent } from './rules.mjs';

export const SEND_MAX_ATTEMPTS = 3;
export const SEND_BACKOFF_MS = Object.freeze([1000, 3000]);
const TRANSIENT = new Set(['rate_limited', 'unavailable', 'network']);
const RECONNECT = new Set(['token_invalid', 'permission_missing']);

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}

export function logAutoReply(event, fields = {}) {
  const safe = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined) continue;
    safe[key] = typeof value === 'string' ? value.slice(0, 120) : value;
  }
  console.log(JSON.stringify({ event, ...safe }));
}

async function finish(store, deliveryId, result, options) {
  await store.finishAutoReplyDelivery(deliveryId, result, options);
  return result;
}

/**
 * `claim` = `{ deliveryId, provider, event, target, recipientHash, correlationId }`.
 * `adapter` = provedor com `sendText`. Devolve o registro final.
 */
export async function processClaimedEvent({
  store, adapter, env = {}, claim, now = () => Date.now(), wait = sleep, log = logAutoReply
}) {
  const options = { env };
  const { deliveryId, provider, event, recipientHash, correlationId } = claim;
  const done = async (result) => {
    const saved = await finish(store, deliveryId, { attempts: 0, ...result }, options);
    log('auto_reply_processed', {
      correlationId, provider, status: saved.status, reason: saved.reason ?? undefined,
      errorCode: saved.errorCode ?? undefined, attempts: saved.attempts
    });
    return saved;
  };

  const verdict = evaluateEvent(claim.target, event, { now: now(), provider });
  if (!verdict.ok) return done({ status: verdict.status, reason: verdict.reason });

  const target = claim.target;
  const frequency = target.settings.frequency ?? 'daily';
  const window = await store.claimRecipientWindow(target.connectionId, recipientHash, frequency, options);
  if (!window?.claimed) return done({ status: 'skipped', reason: 'frequency' });
  const release = () => store.releaseRecipientWindow(target.connectionId, recipientHash, window.previous ?? null, options);

  const resolved = resolveAutoReplyPublicUrl(target.site, env);
  if (!resolved.url) {
    await release();
    return done({ status: 'skipped', reason: resolved.reason });
  }
  const { text, bytes } = renderAutoReplyMessage(target.settings.message, { name: target.site?.name ?? '', url: resolved.url });
  if (!text || bytes > AUTO_REPLY_MAX_BYTES) {
    await release();
    return done({ status: 'failed', reason: 'message_invalid' });
  }

  const current = await store.getAutoReplyTarget(provider, event.accountId, options);
  const recheck = evaluateEvent(current, event, { now: now(), provider });
  if (!recheck.ok || current.connectionId !== target.connectionId) {
    await release();
    return done({ status: 'cancelled', reason: recheck.ok ? 'connection_changed' : recheck.reason });
  }

  let accessToken;
  try {
    accessToken = await decryptChannelToken(current.tokenCiphertext, {
      siteId: current.siteId, provider, accountId: current.accountId
    }, env[AUTO_REPLY_KEY_ENV]);
  } catch {
    await release();
    return done({ status: 'failed', reason: 'credential_unreadable' });
  }

  let lastError = null;
  for (let attempt = 1; attempt <= SEND_MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) await wait(SEND_BACKOFF_MS[attempt - 2] ?? 3000);
    try {
      const sent = await adapter.sendText({ accountId: current.accountId, recipientId: event.senderId, text, accessToken });
      return done({ status: 'sent', reason: null, attempts: attempt, providerMessageId: sent.messageId ?? null });
    } catch (error) {
      lastError = error;
      const kind = error?.kind ?? 'rejected';
      if (kind === 'uncertain') {
        return done({ status: 'uncertain', reason: 'send_uncertain', attempts: attempt, errorCode: 'timeout' });
      }
      if (RECONNECT.has(kind)) {
        await store.markChannelConnection(current.connectionId, 'reconnect_required', kind, options);
        await release();
        return done({ status: 'failed', reason: kind, attempts: attempt, errorCode: error.errorCode });
      }
      if (!TRANSIENT.has(kind)) {
        await release();
        return done({ status: 'failed', reason: kind, attempts: attempt, errorCode: error.errorCode });
      }
    }
  }
  await release();
  return done({
    status: 'failed',
    reason: lastError?.kind === 'rate_limited' ? 'rate_limited' : 'provider_unavailable',
    attempts: SEND_MAX_ATTEMPTS,
    errorCode: lastError?.errorCode
  });
}
