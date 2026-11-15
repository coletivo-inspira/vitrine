// Central de canais (issue #125): projeção pública dos links diretos e status das
// integrações para o editor. Contrato em docs/central-de-canais.md.
import { hasPlanFeature, loadSiteEntitlements, planFeatureRequiredError } from './entitlements.mjs';
import { PortalValidationError } from './portal-validation.mjs';
import { readQuoteWebhookStatus } from './quote-webhook.mjs';
import { PUBLIC_JSON_FEATURE } from './vitrine-json.mjs';
import {
  draftInstagramUrl,
  normalizeInstagramUrl,
  normalizePublicEmail
} from '../web/assets/channels.mjs';

export { channelDraftErrors } from '../web/assets/channels.mjs';

export const CHANNELS_PATH = /^\/api\/sites\/([^/]+)\/channels\/?$/;
export const CHANNEL_LINK_EDITOR_ROLES = Object.freeze(['owner', 'admin', 'editor']);
export const CHANNEL_MANAGER_ROLES = Object.freeze(['owner', 'admin']);
const CUSTOM_DOMAIN_FEATURE = 'custom_domain';
const QUOTE_WEBHOOK_FEATURE = 'quote_webhook';
const PUBLIC_SITE_ORIGIN = 'https://vitrine.inspira.dev.br';
const NO_STORE = Object.freeze({ 'cache-control': 'no-store' });

/** Campos do snapshot: `instagramUrl` (só instagram.com) e `publicEmail`, quando houver. */
export function projectPublicChannels(content) {
  const instagramUrl = draftInstagramUrl(content);
  const publicEmail = normalizePublicEmail(content?.publicEmail);
  return {
    ...(instagramUrl ? { instagramUrl } : {}),
    ...(publicEmail ? { publicEmail } : {})
  };
}

export function assertPublicChannels(menu) {
  if (menu.instagramUrl !== undefined && normalizeInstagramUrl(menu.instagramUrl) !== menu.instagramUrl) {
    throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Campo instagramUrl inválido.');
  }
  if (menu.publicEmail !== undefined && normalizePublicEmail(menu.publicEmail) !== menu.publicEmail) {
    throw new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', 'Campo publicEmail inválido.');
  }
}

function gate(entitlements, feature) {
  const available = hasPlanFeature(entitlements, feature);
  return { feature, available, requiredPlan: available ? null : planFeatureRequiredError(feature).requiredPlan };
}

function pickDomain(rows) {
  if (!Array.isArray(rows) || !rows.length) return null;
  return rows.find((row) => row.status === 'active') ?? rows[0];
}

async function customDomainStatus(store, site, { manager, options, entitlements }) {
  const base = { id: 'custom_domain', ...gate(entitlements, CUSTOM_DOMAIN_FEATURE) };
  if (!manager) return { ...base, state: base.available ? 'restricted' : 'locked', restricted: true };
  if (typeof store.listDomains !== 'function') return { ...base, state: base.available ? 'unavailable' : 'locked' };
  let row;
  try {
    row = pickDomain(await store.listDomains(site.id, options));
  } catch {
    return { ...base, state: 'error', diagnostic: { code: 'READ_FAILED' } };
  }
  if (!row) return { ...base, state: base.available ? 'off' : 'locked' };
  const diagnostic = {
    hostname: row.hostname,
    status: row.status,
    sslStatus: row.ssl_status ?? row.sslStatus ?? 'pending',
    cnameTarget: row.cname_target ?? row.cnameTarget ?? null,
    verifiedAt: row.verified_at ?? row.verifiedAt ?? null
  };
  if (!base.available) return { ...base, state: 'locked', diagnostic };
  const state = diagnostic.status === 'active' && diagnostic.sslStatus === 'active'
    ? 'active'
    : ['failed', 'suspended'].includes(diagnostic.status) || diagnostic.sslStatus === 'failed'
      ? 'error'
      : 'pending';
  return { ...base, state, diagnostic };
}

async function publicJsonStatus(site, { entitlements, loadPublication }) {
  const base = { id: 'public_json', ...gate(entitlements, PUBLIC_JSON_FEATURE) };
  const url = `${PUBLIC_SITE_ORIGIN}/${site.slug}/vitrine.json`;
  let publication = null;
  try {
    publication = typeof loadPublication === 'function' ? await loadPublication(site.slug) : null;
  } catch {
    publication = null;
  }
  const diagnostic = { url, publishedAt: publication?.publishedAt ?? null };
  if (!base.available) return { ...base, state: 'locked', diagnostic };
  if (!publication?.menu) return { ...base, state: 'off', diagnostic };
  return { ...base, state: publication.menu.features?.publicJson === true ? 'active' : 'pending', diagnostic };
}

const QUOTE_STATES = Object.freeze({ locked: 'locked', not_configured: 'off', ready: 'active', failing: 'error' });

async function quoteWebhookStatus(store, site, { manager, options, entitlements }) {
  const base = { id: 'quote_webhook', ...gate(entitlements, QUOTE_WEBHOOK_FEATURE) };
  if (!manager) return { ...base, state: base.available ? 'restricted' : 'locked', restricted: true };
  let status;
  try {
    status = await readQuoteWebhookStatus(store, site.id, { ...options, entitlements });
  } catch {
    return { ...base, state: base.available ? 'unavailable' : 'locked' };
  }
  if (!status) return { ...base, state: base.available ? 'unavailable' : 'locked' };
  let host = null;
  try {
    host = status.url ? new URL(status.url).hostname : null;
  } catch {
    host = null;
  }
  return {
    ...base,
    state: QUOTE_STATES[status.state] ?? 'off',
    diagnostic: {
      host,
      hasSecret: status.hasSecret,
      lastDelivery: status.lastDelivery,
      totals: status.totals
    }
  };
}

/**
 * Status de todas as integrações, para qualquer papel da equipe. Endereço e entregas
 * do webhook e o domínio só aparecem para dono e administração (`restricted` nos outros).
 */
export async function readChannelsStatus(store, site, { token, env, loadPublication } = {}) {
  const options = { token, env };
  const manager = CHANNEL_MANAGER_ROLES.includes(site.role);
  const entitlements = await loadSiteEntitlements(store, site.id, options);
  const context = { manager, options, entitlements, loadPublication };
  const [customDomain, publicJson, quoteWebhook] = await Promise.all([
    customDomainStatus(store, site, context),
    publicJsonStatus(site, context),
    quoteWebhookStatus(store, site, context)
  ]);
  return {
    role: site.role,
    canEditLinks: CHANNEL_LINK_EDITOR_ROLES.includes(site.role),
    canManageIntegrations: manager,
    plan: { code: entitlements.planCode, name: entitlements.planName },
    integrations: [
      customDomain,
      publicJson,
      quoteWebhook,
      { id: 'instagram_connect', feature: null, available: false, requiredPlan: null, state: 'soon' }
    ]
  };
}

/** `GET /api/sites/:id/channels`: qualquer papel da equipe da vitrine; só leitura. */
export async function handleChannelsRequest({ method, store, user, siteId, env = {}, respond, loadPublication }) {
  if (method !== 'GET') {
    throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'A central de canais só aceita GET.');
  }
  const site = await store.getSite(siteId, user.id, { token: user.token, env });
  if (!site) throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
  const channels = await readChannelsStatus(store, site, { token: user.token, env, loadPublication });
  return respond(200, { channels }, NO_STORE);
}
