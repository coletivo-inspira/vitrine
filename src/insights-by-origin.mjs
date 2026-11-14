// Insights por origem (issue #119, ADR 0013). Cliques em "Traçar rota" e visitas
// pelo QR Code valem para todos os planos; visitas por origem e o funil por origem
// (visitas → cliques para enviar no WhatsApp) são do recurso conversion_reports.
import { UNRECORDED_SOURCE, metricSourceLabel } from '../web/assets/metrics-source.mjs';
import { hasPlanFeature, planFeatureRequiredError } from './entitlements.mjs';
import { resolveInsightsPeriodStart, validateInsightsPeriod } from './portal-validation.mjs';

export const ORIGIN_INSIGHTS_FEATURE = 'conversion_reports';
export const MAX_ORIGIN_CAMPAIGNS = 10;

const ISO_DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

function addUtcDays(isoDate, delta) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + delta)).toISOString().slice(0, 10);
}

function toIsoDate(referenceDate) {
  if (typeof referenceDate === 'string' && ISO_DATE_ONLY.test(referenceDate)) return referenceDate;
  return (referenceDate instanceof Date ? referenceDate : new Date(referenceDate)).toISOString().slice(0, 10);
}

function percent(part, whole) {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

export function metricRowKey(row) {
  return [
    row.site_id,
    row.metric_date,
    row.metric_hour,
    row.item_key ?? '',
    row.metric_name,
    row.source ?? UNRECORDED_SOURCE,
    row.campaign ?? ''
  ].join(':');
}

export function summarizeOriginMetrics(rows, { period = '7d', referenceDate = new Date() } = {}) {
  const validPeriod = validateInsightsPeriod(period);
  const todayIso = toIsoDate(referenceDate);
  const currentStart = resolveInsightsPeriodStart(validPeriod, todayIso);
  const days = Math.round((Date.parse(todayIso) - Date.parse(currentStart)) / 86400000) + 1;
  const previousEnd = addUtcDays(currentStart, -1);
  const previousStart = addUtcDays(previousEnd, -(days - 1));

  const reach = { routeClicks: 0, previousRouteClicks: 0, qrVisits: 0, previousQrVisits: 0 };
  const bySource = new Map();
  const byCampaign = new Map();
  const entry = (map, key, base) => {
    if (!map.has(key)) map.set(key, { ...base, visits: 0, orders: 0 });
    return map.get(key);
  };

  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || typeof row !== 'object') continue;
    const date = String(row.metric_date ?? row.metricDate ?? '').slice(0, 10);
    const isCurrent = date >= currentStart && date <= todayIso;
    const isPrevious = date >= previousStart && date <= previousEnd;
    if (!isCurrent && !isPrevious) continue;
    const name = String(row.metric_name ?? row.metricName ?? '');
    const count = Math.max(0, Number(row.count_value ?? row.countValue ?? 0) || 0);

    if (name === 'route_click') {
      reach[isCurrent ? 'routeClicks' : 'previousRouteClicks'] += count;
      continue;
    }
    if (name === 'qr_visit') {
      reach[isCurrent ? 'qrVisits' : 'previousQrVisits'] += count;
      continue;
    }
    if (!isCurrent || (name !== 'visit' && name !== 'whatsapp_order')) continue;

    const source = String(row.source ?? UNRECORDED_SOURCE);
    const campaign = String(row.campaign ?? '');
    const field = name === 'visit' ? 'visits' : 'orders';
    entry(bySource, source, { source, label: metricSourceLabel(source) })[field] += count;
    if (campaign) {
      entry(byCampaign, `${source}:${campaign}`, { source, label: metricSourceLabel(source), campaign })[field] += count;
    }
  }

  const finish = (list) => list
    .filter((item) => item.visits > 0 || item.orders > 0)
    .map((item) => ({ ...item, conversionPercent: percent(item.orders, item.visits) }))
    .sort((a, b) => b.visits - a.visits || b.orders - a.orders || a.label.localeCompare(b.label, 'pt-BR'));

  const sources = finish([...bySource.values()]);
  return {
    reach,
    origins: {
      totalVisits: sources.reduce((sum, item) => sum + item.visits, 0),
      sources,
      campaigns: finish([...byCampaign.values()]).slice(0, MAX_ORIGIN_CAMPAIGNS)
    }
  };
}

export function withOriginInsights(insights, rows, options = {}) {
  if (!insights) return insights;
  return { ...insights, ...summarizeOriginMetrics(rows, options) };
}

// O detalhe por origem só sai do Worker quando o plano tem o recurso.
export function applyOriginEntitlement(insights, entitlements) {
  if (!insights) return insights;
  if (hasPlanFeature(entitlements, ORIGIN_INSIGHTS_FEATURE)) {
    return { ...insights, origins: { available: true, ...(insights.origins ?? { totalVisits: 0, sources: [], campaigns: [] }) } };
  }
  const { requiredPlan } = planFeatureRequiredError(ORIGIN_INSIGHTS_FEATURE);
  return { ...insights, origins: { available: false, feature: ORIGIN_INSIGHTS_FEATURE, requiredPlan } };
}