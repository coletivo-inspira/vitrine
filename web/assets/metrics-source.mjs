// Origem das visitas (issue #119). A vitrine lê utm_source e utm_campaign só na
// carga da página e não grava nada no navegador; o Worker e o banco normalizam de
// novo, porque o lote de eventos é público. O SQL espelha estas regras em
// supabase/migrations/20261116000200_metrics_source.sql.

export const DIRECT_SOURCE = 'direto';
export const OTHER_SOURCE = 'outro';
export const QR_SOURCE = 'qr';
// Linhas gravadas antes da origem existir (ou métricas de item) ficam com ''.
export const UNRECORDED_SOURCE = '';

export const METRIC_SOURCES = Object.freeze([
  DIRECT_SOURCE,
  QR_SOURCE,
  'ig_comment',
  'ig_bio',
  'ig_story',
  'instagram',
  'whatsapp',
  'facebook',
  'google',
  'tiktok',
  OTHER_SOURCE
]);

export const METRIC_SOURCE_LABELS = Object.freeze({
  direto: 'Direto (sem link de campanha)',
  qr: 'QR Code',
  ig_comment: 'Comentário no Instagram',
  ig_bio: 'Link na bio do Instagram',
  ig_story: 'Stories do Instagram',
  instagram: 'Instagram',
  whatsapp: 'WhatsApp',
  facebook: 'Facebook',
  google: 'Google',
  tiktok: 'TikTok',
  outro: 'Outra origem',
  '': 'Sem origem registrada'
});

export const MAX_SOURCE_TOKEN_LENGTH = 32;
const SOURCE_TOKEN_PATTERN = /^[a-z0-9][a-z0-9_-]{0,31}$/;
// Seis dígitos seguidos já podem ser telefone, CPF ou CEP.
const DIGIT_RUN_PATTERN = /[0-9]{6}/;

export function metricSourceLabel(source) {
  return METRIC_SOURCE_LABELS[source] ?? METRIC_SOURCE_LABELS.outro;
}

export function normalizeMetricSource(raw) {
  if (raw === undefined || raw === null) return DIRECT_SOURCE;
  const value = String(raw).trim().toLowerCase();
  if (!value) return DIRECT_SOURCE;
  if (!SOURCE_TOKEN_PATTERN.test(value) || !METRIC_SOURCES.includes(value)) return OTHER_SOURCE;
  return value;
}

export function normalizeMetricCampaign(raw, source) {
  if (raw === undefined || raw === null) return '';
  if (!source || source === DIRECT_SOURCE || source === OTHER_SOURCE) return '';
  const value = String(raw).trim().toLowerCase();
  if (!SOURCE_TOKEN_PATTERN.test(value) || DIGIT_RUN_PATTERN.test(value)) return '';
  return value;
}

export function resolveVisitOrigin(search = '') {
  let params;
  try {
    params = new URLSearchParams(typeof search === 'string' ? search : '');
  } catch {
    return { source: DIRECT_SOURCE, campaign: '' };
  }
  const source = normalizeMetricSource(params.get('utm_source'));
  return { source, campaign: normalizeMetricCampaign(params.get('utm_campaign'), source) };
}

// Conta cliques em "Traçar rota" (bloco de #118) sem tocar no link nem atrasá-lo.
export function bindRouteClickMetric(doc, record) {
  if (!doc || typeof doc.addEventListener !== 'function' || typeof record !== 'function') return false;
  doc.addEventListener('click', (event) => {
    const target = event?.target;
    if (target && typeof target.closest === 'function' && target.closest('.storefront-route-button')) {
      record('route_click');
    }
  });
  return true;
}
