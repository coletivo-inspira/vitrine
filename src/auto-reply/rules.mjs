// Regras centrais da AutoResposta, sem nada específico do Instagram (US6). O provedor só
// fornece o contexto (`target`) e o evento normalizado.
export const REQUIRED_SCOPES = Object.freeze({ instagram: ['instagram_manage_messages'] });
export const PROVIDER_FLAG = Object.freeze({ instagram: 'instagramEnabled' });
export const MAX_EVENT_AGE_MS = 23 * 60 * 60 * 1000;
export const FREQUENCY_GAP_MS = Object.freeze({ once: Infinity, daily: 24 * 60 * 60 * 1000, weekly: 7 * 24 * 60 * 60 * 1000 });

/** Motivo que impede a conexão de responder, ou `null`. Usado na ativação e no envio. */
export function blockingReason(target, provider = 'instagram') {
  if (!target) return 'not_connected';
  const controls = target.controls ?? {};
  if (!controls.enabled) return 'platform_disabled';
  if (!controls[PROVIDER_FLAG[provider]]) return 'channel_disabled';
  if (!target.siteAllowed) return 'site_not_allowed';
  if (target.status === 'suspended') return 'connection_suspended';
  if (target.status !== 'connected') return 'reconnect_required';
  const scopes = Array.isArray(target.scopes) ? target.scopes : [];
  if (!(REQUIRED_SCOPES[provider] ?? []).every((scope) => scopes.includes(scope))) return 'permission_missing';
  if (!target.settings?.enabled) return 'auto_reply_disabled';
  return null;
}

/**
 * Elegibilidade do evento contra o contexto atual. `{ ok: true }` ou
 * `{ ok: false, status, reason }` com o registro a gravar.
 */
export function evaluateEvent(target, event, { now = Date.now(), provider = 'instagram' } = {}) {
  const reason = blockingReason(target, provider);
  if (reason) return { ok: false, status: 'skipped', reason };
  const eventMs = Date.parse(event?.eventAt ?? '');
  if (!Number.isFinite(eventMs)) return { ok: false, status: 'skipped', reason: 'invalid_timestamp' };
  if (now - eventMs > MAX_EVENT_AGE_MS) return { ok: false, status: 'skipped', reason: 'window_expired' };
  const enabledMs = Date.parse(target.settings?.enabledAt ?? '');
  if (Number.isFinite(enabledMs) && eventMs < enabledMs) return { ok: false, status: 'skipped', reason: 'before_activation' };
  return { ok: true };
}

/** Mesma decisão do banco (`service_claim_recipient_window`), para o adaptador em memória. */
export function frequencyAllows(frequency, lastSentAtMs, now = Date.now()) {
  if (lastSentAtMs === null || lastSentAtMs === undefined) return true;
  const gap = FREQUENCY_GAP_MS[frequency] ?? FREQUENCY_GAP_MS.daily;
  return Number.isFinite(gap) && lastSentAtMs <= now - gap;
}
