// Alertas operacionais da AutoResposta, calculados a partir da leitura da administração
// (admin_read_auto_reply) e do ambiente. Sem tokens, sem consumidores: só contagens e
// endereços de vitrine. docs/integrations/auto-reply/operational-runbook.md.
import { currentKeyVersion, hasPreviousKey, hasStableHashKey } from './crypto.mjs';

export const NO_EVENTS_AFTER_DAYS = 7;
export const EXPIRING_WITHIN_DAYS = 7;
export const FAILURE_RATE_MIN_FAILED = 5;
export const FAILURE_RATE_THRESHOLD = 0.2;
const DAY_MS = 24 * 60 * 60 * 1000;
const SEVERITY_ORDER = Object.freeze({ critical: 0, warning: 1, info: 2 });

function slugs(connections) {
  return connections.map((c) => c.slug).filter(Boolean).slice(0, 10);
}

function alert(code, severity, title, detail, items = []) {
  return { code, severity, title, detail, count: Array.isArray(items) ? items.length : Number(items) || 0,
    sites: Array.isArray(items) ? slugs(items) : [] };
}

/** Lista ordenada por gravidade. `overview` = resposta de admin_read_auto_reply. */
export function buildAutoReplyAlerts(overview, { env = {}, now = Date.now() } = {}) {
  const connections = Array.isArray(overview?.connections) ? overview.connections : [];
  const week = overview?.last7Days ?? {};
  const alerts = [];
  const version = currentKeyVersion(env);

  const authFailures = Number(week.authFailures) || 0;
  if (authFailures > 0) {
    alerts.push(alert('auth_failures', 'critical', 'Falhas de autorização',
      `${authFailures} envio(s) recusado(s) por token ou permissão nos últimos 7 dias. As conexões afetadas pediram reconexão.`, authFailures));
  }
  const failed = Number(week.failed) || 0;
  const received = Number(week.received) || 0;
  if (failed >= FAILURE_RATE_MIN_FAILED && received > 0 && failed / received >= FAILURE_RATE_THRESHOLD) {
    alerts.push(alert('high_failure_rate', 'critical', 'Muitas falhas de envio',
      `${failed} de ${received} eventos falharam nos últimos 7 dias (${Math.round((failed / received) * 100)}%).`, failed));
  }
  const pendingRotation = connections.filter((c) => Number.isInteger(c.keyVersion) && c.keyVersion < version);
  if (pendingRotation.length) {
    alerts.push(hasPreviousKey(env)
      ? alert('credentials_pending_rotation', 'warning', 'Recifragem pendente',
        `${pendingRotation.length} credencial(is) ainda na chave antiga. Rode "Recifrar agora" ou espere o Cron.`, pendingRotation)
      : alert('rotation_missing_previous_key', 'critical', 'Chave anterior ausente',
        `${pendingRotation.length} credencial(is) cifrada(s) com uma versão antiga e sem AUTO_REPLY_ENCRYPTION_KEY_PREVIOUS: elas não abrem e os envios vão falhar.`, pendingRotation));
  }
  if (hasPreviousKey(env) && !hasStableHashKey(env)) {
    alerts.push(alert('hash_key_unstable', 'critical', 'Chave do hash não fixada',
      'Há chave anterior configurada, mas falta AUTO_REPLY_HASH_KEY. Sem ela, a frequência por consumidor recomeça depois da troca de chave.', 1));
  }
  const expired = connections.filter((c) => c.expiresAt && Date.parse(c.expiresAt) <= now);
  if (expired.length) {
    alerts.push(alert('token_expired', 'critical', 'Autorização vencida',
      `${expired.length} conexão(ões) com autorização vencida. O dono precisa reconectar.`, expired));
  }
  const expiring = connections.filter((c) => c.expiresAt && Date.parse(c.expiresAt) > now
    && Date.parse(c.expiresAt) - now <= EXPIRING_WITHIN_DAYS * DAY_MS);
  if (expiring.length) {
    alerts.push(alert('token_expiring', 'warning', 'Autorização perto de vencer',
      `${expiring.length} conexão(ões) vencem em até ${EXPIRING_WITHIN_DAYS} dias.`, expiring));
  }
  const reconnect = connections.filter((c) => c.status === 'reconnect_required');
  if (reconnect.length) {
    alerts.push(alert('reconnect_required', 'warning', 'Reconexão necessária',
      `${reconnect.length} conexão(ões) aguardando o dono reconectar.`, reconnect));
  }
  const noWebhook = connections.filter((c) => c.status === 'connected' && c.webhookSubscribed === false);
  if (noWebhook.length) {
    alerts.push(alert('webhook_not_subscribed', 'warning', 'Mensagens sem assinatura',
      `${noWebhook.length} conexão(ões) sem a assinatura do webhook confirmada pela Meta.`, noWebhook));
  }
  const silent = connections.filter((c) => c.status === 'connected' && c.enabled && !c.lastEventAt
    && c.connectedAt && now - Date.parse(c.connectedAt) > NO_EVENTS_AFTER_DAYS * DAY_MS);
  if (silent.length) {
    alerts.push(alert('no_events', 'warning', 'Nenhuma mensagem recebida',
      `${silent.length} conexão(ões) ligada(s) há mais de ${NO_EVENTS_AFTER_DAYS} dias sem nenhum evento. Pode ser a limitação da Meta para contas sem Página vinculada.`, silent));
  }
  const uncertain = Number(week.uncertain) || 0;
  if (uncertain > 0) {
    alerts.push(alert('uncertain_sends', 'warning', 'Envios inconclusivos',
      `${uncertain} envio(s) sem confirmação da Meta nos últimos 7 dias. Nada foi reenviado.`, uncertain));
  }
  const pendingDeletion = Number(overview?.deletionRequests?.pendingReview) || 0;
  if (pendingDeletion > 0) {
    alerts.push(alert('deletion_pending_review', 'warning', 'Pedidos de exclusão para conferir',
      `${pendingDeletion} pedido(s) de exclusão da Meta nos últimos 30 dias sem conexão encontrada. Conferir à mão.`, pendingDeletion));
  }
  const suspended = connections.filter((c) => c.status === 'suspended');
  if (suspended.length) {
    alerts.push(alert('connections_suspended', 'info', 'Conexões suspensas',
      `${suspended.length} conexão(ões) suspensa(s) pela equipe.`, suspended));
  }
  return alerts.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Sinais do Cron que viram linhas `auto_reply_alert` no log, para alertas por log. */
export function maintenanceAlerts(result = {}) {
  const alerts = [];
  if (result.stale > 0) alerts.push({ code: 'stuck_processing', severity: 'warning', count: result.stale });
  if (result.revoked > 0) alerts.push({ code: 'tokens_revoked', severity: 'warning', count: result.revoked });
  if (result.rotation?.failed > 0) alerts.push({ code: 'rotation_failed', severity: 'critical', count: result.rotation.failed });
  return alerts;
}
