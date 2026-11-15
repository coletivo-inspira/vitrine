import { PortalValidationError } from './portal-validation.mjs';

export const SITE_LIFECYCLE_PATH = /^\/api\/sites\/([^/]+)\/lifecycle\/?$/;
export const LIFECYCLE_ACTIONS = Object.freeze(['pause', 'resume', 'archive', 'restore', 'delete']);
export const PAUSE_ROLES = Object.freeze(['owner', 'admin']);
export const ARCHIVE_ROLES = Object.freeze(['owner']);
export const ARCHIVE_RESTORE_DAYS = 90;
export const DOMAIN_QUARANTINE_DAYS = 30;
export const PUBLIC_STATE_CACHE_TTL_MS = 30 * 1000;
// Mesmo critério de private.count_plan_sites: só vitrine não arquivada ocupa vaga do plano.
export const PLAN_SITE_COUNT_CRITERION = 'archived_at is null';

const DAY_MS = 24 * 60 * 60 * 1000;
const PUBLIC_HOST = 'vitrine.inspira.dev.br';
const PAUSED_PAGE_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; img-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const PAUSED_HEADERS = Object.freeze({
  'x-robots-tag': 'noindex',
  'cache-control': 'no-store',
  'retry-after': '3600',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
});

const RPC_ERRORS = Object.freeze({
  FORBIDDEN_SITE_ROLE: [403, 'Seu papel nesta vitrine não permite esta ação.'],
  SITE_NOT_FOUND: [404, 'Vitrine não encontrada.'],
  SITE_ALREADY_PAUSED: [409, 'A vitrine já está pausada.'],
  SITE_NOT_PAUSED: [409, 'A vitrine não está pausada.'],
  SITE_ARCHIVED: [409, 'Restaure a vitrine arquivada antes de retomá-la.'],
  SITE_ALREADY_ARCHIVED: [409, 'A vitrine já está arquivada.'],
  SITE_NOT_ARCHIVED: [409, 'Só uma vitrine arquivada pode ser restaurada ou excluída.'],
  RESTORE_WINDOW_EXPIRED: [409, `O prazo de ${ARCHIVE_RESTORE_DAYS} dias para restaurar esta vitrine terminou.`],
  CONFIRMATION_MISMATCH: [422, 'Digite o endereço exato da vitrine para confirmar.'],
  DOMAINS_CONNECTED: [409, 'Desconecte os domínios próprios antes de excluir a vitrine.'],
  SITE_PAUSED: [409, 'Retome a vitrine antes de publicar ou restaurar uma versão.']
});

function lifecycleError(code) {
  const [status, message] = RPC_ERRORS[code];
  return new PortalValidationError(status, code, message);
}

function toIso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function siteLifecycleFields(row = {}) {
  return {
    pausedAt: toIso(row.paused_at ?? row.pausedAt),
    archivedAt: toIso(row.archived_at ?? row.archivedAt)
  };
}

export function siteCountsTowardPlan(site) {
  return !site?.archivedAt && !site?.archived_at;
}

export function countPlanSites(sites = []) {
  return sites.filter(siteCountsTowardPlan).length;
}

export function restorableUntil(archivedAt) {
  const iso = toIso(archivedAt);
  return iso ? new Date(Date.parse(iso) + ARCHIVE_RESTORE_DAYS * DAY_MS).toISOString() : null;
}

export function lifecyclePermissions(role, state = {}) {
  const canPauseRole = PAUSE_ROLES.includes(role);
  const isOwner = ARCHIVE_ROLES.includes(role);
  const paused = Boolean(state.pausedAt);
  const archived = Boolean(state.archivedAt);
  return {
    canPause: canPauseRole && !paused,
    canResume: canPauseRole && paused && !archived,
    canArchive: isOwner && !archived,
    canRestore: isOwner && archived,
    canDelete: isOwner && archived
  };
}

export function assertSiteAcceptsPublication(site) {
  if (site?.pausedAt || site?.archivedAt) throw lifecycleError('SITE_PAUSED');
}

function formatDate(iso) {
  if (!iso) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' })
    .format(new Date(iso));
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export function describeLifecycleDialogs(slug, summary = {}) {
  const address = `${PUBLIC_HOST}/${slug}`;
  const publication = summary.publication;
  const domains = Array.isArray(summary.domains) ? summary.domains : [];
  const releaseCount = Number(summary.releaseCount ?? 0);
  const memberCount = Number(summary.memberCount ?? 0);
  const restoreDate = formatDate(restorableUntil(summary.archivedAt) ?? restorableUntil(new Date()));
  const publicationLine = publication
    ? `Publicação mantida: versão ${publication.revision}, com ${plural(Number(publication.itemCount ?? 0), 'item', 'itens')}`
    : 'Ainda não há publicação: nada muda para quem visita';
  const offline = [
    `${address} mostra “Esta vitrine está pausada”`,
    ...domains.map(domain => `${domain.hostname} também mostra a página de pausa`)
  ];
  const kept = `Rascunho, ${plural(releaseCount, 'versão publicada', 'versões publicadas')} e Insights continuam guardados`;

  return {
    pause: {
      title: 'Pausar a vitrine?',
      message: 'A vitrine sai do ar até você retomar. Nada é apagado e os buscadores deixam de indexá-la enquanto estiver pausada.',
      items: [...offline, publicationLine, kept],
      confirmLabel: 'Pausar vitrine'
    },
    resume: {
      title: 'Retomar a vitrine?',
      message: 'A mesma publicação volta ao ar, sem publicar de novo.',
      items: [
        publication
          ? `Volta ao ar a versão ${publication.revision}, com ${plural(Number(publication.itemCount ?? 0), 'item', 'itens')}`
          : 'Ainda não há publicação: publique para a vitrine aparecer',
        `${address} volta a abrir a vitrine`,
        ...domains.map(domain => `${domain.hostname} volta a abrir a vitrine`)
      ],
      confirmLabel: 'Retomar vitrine'
    },
    archive: {
      title: 'Arquivar a vitrine?',
      message: `A vitrine sai do ar e da lista principal e deixa de ocupar uma vaga do seu plano. Você pode restaurá-la até ${restoreDate}.`,
      items: [
        ...offline,
        'Sai da lista principal e passa para o filtro “Arquivadas”',
        'Libera 1 vaga de vitrine do plano',
        `${kept}; a equipe (${plural(memberCount, 'pessoa', 'pessoas')}) mantém o acesso`,
        `Restaurável por ${ARCHIVE_RESTORE_DAYS} dias, até ${restoreDate}`
      ],
      confirmLabel: 'Arquivar vitrine'
    },
    restore: {
      title: 'Restaurar a vitrine?',
      message: 'Ela volta para a lista principal, ainda pausada. Depois use “Retomar” para colocá-la no ar.',
      items: [
        'Volta para a lista principal',
        'Ocupa de novo 1 vaga de vitrine do plano',
        'Continua pausada até alguém do time retomar'
      ],
      confirmLabel: 'Restaurar vitrine'
    },
    delete: {
      title: 'Excluir a vitrine de vez?',
      message: 'Esta ação não pode ser desfeita. Digite o endereço da vitrine para confirmar.',
      items: [
        `Apaga o rascunho, a publicação e ${plural(releaseCount, 'versão publicada', 'versões publicadas')}`,
        'Apaga Insights, curtidas e o histórico da vitrine',
        `Remove o acesso da equipe (${plural(memberCount, 'pessoa', 'pessoas')})`,
        `O endereço ${slug} fica livre para outra vitrine`
      ],
      confirmLabel: 'Excluir de vez',
      requiresSlug: slug,
      ...(domains.length
        ? { blockedReason: `Desconecte antes os domínios próprios: ${domains.map(domain => domain.hostname).join(', ')}.` }
        : {})
    },
    domains: domains.map(domain => ({
      id: domain.id,
      hostname: domain.hostname,
      title: `Desconectar ${domain.hostname}?`,
      message: `O endereço ${domain.hostname} deixa de abrir a vitrine; ela continua em ${address}. O nome fica em quarentena.`,
      items: [
        `${domain.hostname} para de abrir a vitrine`,
        `A vitrine continua no ar em ${address}`,
        `Quarentena de ${DOMAIN_QUARANTINE_DAYS} dias: outra vitrine não pode usar ${domain.hostname}`,
        'Para voltar, vincule o domínio e verifique o DNS de novo'
      ],
      confirmLabel: 'Desconectar domínio'
    }))
  };
}

export function presentSiteLifecycle(site, summary = {}) {
  const state = {
    paused: Boolean(summary.pausedAt),
    archived: Boolean(summary.archivedAt),
    pausedAt: toIso(summary.pausedAt),
    archivedAt: toIso(summary.archivedAt),
    restorableUntil: restorableUntil(summary.archivedAt)
  };
  return {
    state,
    permissions: lifecyclePermissions(site.role, state),
    summary: {
      draftRevision: summary.draftRevision ?? null,
      publication: summary.publication ?? null,
      releaseCount: Number(summary.releaseCount ?? 0),
      memberCount: Number(summary.memberCount ?? 0),
      domains: Array.isArray(summary.domains) ? summary.domains : []
    },
    dialogs: describeLifecycleDialogs(site.slug, summary)
  };
}

const PAUSED_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Vitrine pausada</title>
<style>
:root{color-scheme:light dark;--paper:#F7F7F4;--ink:#27322E;--soft:#56615B;--accent:#C74414;--line:#DDDCD6}
@media (prefers-color-scheme:dark){:root{--paper:#171E1A;--ink:#F7F7F4;--soft:#B9C5BD;--accent:#FFB18A;--line:#45544A}}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;padding:40px 20px;background:var(--paper);color:var(--ink);font:16px/1.6 system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:34rem;border-top:1px solid var(--line);padding-top:28px}
p.eyebrow{margin:0 0 12px;font-size:13px;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--soft)}
h1{margin:0 0 16px;font-size:clamp(2rem,6vw,3rem);line-height:1.1;letter-spacing:-.03em}
p{margin:0 0 24px;color:var(--soft)}
a{color:var(--accent);font-weight:700}
a:focus-visible{outline:3px solid var(--accent);outline-offset:5px}
</style>
</head>
<body>
<main>
<p class="eyebrow">Vitrine Inspira</p>
<h1>Esta vitrine está pausada</h1>
<p>Esta vitrine saiu do ar por um tempo. Tente de novo mais tarde.</p>
<a href="https://${PUBLIC_HOST}/">Conhecer a Vitrine Inspira</a>
</main>
</body>
</html>
`;

export function renderPausedShowcaseHtml() {
  return PAUSED_HTML;
}

export function pausedShowcaseResponse(method = 'GET', { json = false } = {}) {
  const body = json
    ? JSON.stringify({ error: { code: 'SHOWCASE_PAUSED', message: 'Esta vitrine está pausada.' } })
    : PAUSED_HTML;
  return new Response(method === 'HEAD' ? null : body, {
    status: 503,
    headers: {
      ...PAUSED_HEADERS,
      'content-security-policy': PAUSED_PAGE_CSP,
      'content-type': json ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'
    }
  });
}

const publicStateByStore = new WeakMap();

function stateCacheFor(store) {
  let cache = publicStateByStore.get(store);
  if (!cache) {
    cache = new Map();
    publicStateByStore.set(store, cache);
  }
  return cache;
}

export function forgetPublicSiteState(store, slug) {
  if (store && typeof store === 'object') stateCacheFor(store).delete(slug);
}

export async function readPublicSiteState(store, slug, nowMs = Date.now()) {
  if (typeof store?.getPublicSiteState !== 'function') return null;
  const cache = stateCacheFor(store);
  const cached = cache.get(slug);
  if (cached && nowMs - cached.at < PUBLIC_STATE_CACHE_TTL_MS) return cached.state;
  let state = null;
  try {
    state = (await store.getPublicSiteState(slug)) === 'paused' ? 'paused' : null;
  } catch {
    return cached?.state ?? null;
  }
  cache.set(slug, { state, at: nowMs });
  return state;
}

export async function respondIfShowcasePaused(store, slug, method, options = {}) {
  return (await readPublicSiteState(store, slug)) === 'paused'
    ? pausedShowcaseResponse(method, options)
    : null;
}

export function storefrontCacheUrls(slug, origins = [], hostnames = []) {
  const bases = new Set([
    ...origins.filter(Boolean).map(origin => String(origin).replace(/\/+$/, '')),
    ...hostnames.filter(Boolean).map(hostname => `https://${hostname}`)
  ]);
  return [...bases].flatMap(base => [
    `${base}/${slug}`,
    `${base}/${slug}/`,
    `${base}/data/vitrines/${slug}/menu.json`,
    `${base}/${slug}/vitrine.json`
  ]);
}

async function purgeEdgeCache(urls) {
  const cache = globalThis.caches?.default;
  if (!cache) return;
  await Promise.allSettled(urls.map(cacheUrl => cache.delete(cacheUrl)));
}

function assertAllowed(action, role, summary, confirmSlug, slug) {
  if ((action === 'pause' || action === 'resume') && !PAUSE_ROLES.includes(role)) {
    throw new PortalValidationError(403, 'FORBIDDEN_ROLE', 'Só o dono ou um admin pode pausar ou retomar esta vitrine.');
  }
  if (['archive', 'restore', 'delete'].includes(action) && !ARCHIVE_ROLES.includes(role)) {
    throw new PortalValidationError(403, 'FORBIDDEN_ROLE', 'Só o dono pode arquivar, restaurar ou excluir esta vitrine.');
  }
  const paused = Boolean(summary.pausedAt);
  const archived = Boolean(summary.archivedAt);
  if (action === 'pause' && paused) throw lifecycleError('SITE_ALREADY_PAUSED');
  if (action === 'resume' && archived) throw lifecycleError('SITE_ARCHIVED');
  if (action === 'resume' && !paused) throw lifecycleError('SITE_NOT_PAUSED');
  if (action === 'archive' && archived) throw lifecycleError('SITE_ALREADY_ARCHIVED');
  if ((action === 'restore' || action === 'delete') && !archived) throw lifecycleError('SITE_NOT_ARCHIVED');
  if (action === 'restore' && Date.parse(restorableUntil(summary.archivedAt)) <= Date.now()) {
    throw lifecycleError('RESTORE_WINDOW_EXPIRED');
  }
  if (action === 'delete') {
    if (confirmSlug !== slug) throw lifecycleError('CONFIRMATION_MISMATCH');
    if (summary.domains?.length) throw lifecycleError('DOMAINS_CONNECTED');
  }
}

export async function handleSiteLifecycleRequest({
  request, url, method, store, user, siteId, env, respond, guardMutation, readJson,
  publicOrigins = [], evictPublication
}) {
  const options = { token: user.token, env };
  const site = await store.getSite(siteId, user.id, options);
  if (!site) throw new PortalValidationError(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
  if (typeof store.getSiteLifecycle !== 'function' || typeof store.changeSiteLifecycle !== 'function') {
    throw new PortalValidationError(503, 'LIFECYCLE_UNAVAILABLE', 'Pausar e arquivar ainda não estão disponíveis neste ambiente.');
  }
  if (method === 'GET') {
    return respond(200, { lifecycle: presentSiteLifecycle(site, await store.getSiteLifecycle(siteId, options)) });
  }
  if (method !== 'POST') {
    throw new PortalValidationError(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para o estado da vitrine.');
  }
  const guardError = guardMutation(request, url, { requireOrigin: true, requireJson: true });
  if (guardError) return guardError;
  const { parsed } = await readJson(request);
  const action = parsed?.action;
  if (!LIFECYCLE_ACTIONS.includes(action)) {
    throw new PortalValidationError(422, 'INVALID_ACTION', 'Ação inválida para a vitrine.');
  }
  const confirmSlug = typeof parsed.confirmSlug === 'string' ? parsed.confirmSlug.trim() : '';
  const before = await store.getSiteLifecycle(siteId, options);
  assertAllowed(action, site.role, before, confirmSlug, site.slug);

  const after = await store.changeSiteLifecycle(siteId, action, { actorId: user.id, confirmSlug }, options);
  forgetPublicSiteState(store, site.slug);
  evictPublication?.(site.slug);
  const hostnames = (before.domains ?? []).map(domain => domain.hostname);
  await purgeEdgeCache(storefrontCacheUrls(site.slug, [...publicOrigins, url.origin], hostnames));

  if (action === 'delete') return respond(200, { deleted: true, slug: site.slug });
  return respond(200, { lifecycle: presentSiteLifecycle(site, after) });
}

export async function hostnameQuarantinedError(response) {
  const body = await response.clone().json().catch(() => null);
  if (!String(body?.message ?? '').includes('HOSTNAME_QUARANTINED')) return null;
  return new PortalValidationError(
    409,
    'HOSTNAME_QUARANTINED',
    `Este endereço foi desconectado de outra vitrine e está em quarentena por até ${DOMAIN_QUARANTINE_DAYS} dias.`
  );
}

export async function recordDomainDisconnect(store, siteId, hostname, options) {
  if (typeof store.recordDomainDisconnect !== 'function') return null;
  try {
    return await store.recordDomainDisconnect(siteId, hostname, options);
  } catch (error) {
    console.error(JSON.stringify({
      event: 'domain_disconnect_audit_failed',
      code: String(error?.code ?? error?.message ?? 'unknown').slice(0, 80)
    }));
    return null;
  }
}

export function createMemorySiteLifecycle({
  sites, drafts, memberships, auditLogs, publicationsBySlug, publicationsByHash, now = () => new Date()
}) {
  const releasesFor = siteId => [...publicationsByHash.values()].filter(entry => entry.siteId === siteId);

  function snapshot(siteId) {
    const site = sites.get(siteId);
    if (!site) return null;
    const publication = publicationsBySlug.get(site.slug);
    const { pausedAt, archivedAt } = siteLifecycleFields(site);
    return {
      slug: site.slug,
      pausedAt,
      archivedAt,
      restorableUntil: restorableUntil(archivedAt),
      draftRevision: drafts.get(siteId)?.revision ?? null,
      publication: publication
        ? {
          revision: publication.revision,
          artifactHash: publication.hash,
          publishedAt: publication.publishedAt,
          itemCount: Array.isArray(publication.menu?.items) ? publication.menu.items.length : 0
        }
        : null,
      releaseCount: releasesFor(siteId).length,
      memberCount: memberships.filter(entry => entry.siteId === siteId).length,
      domains: []
    };
  }

  function audit(siteId, action, actorId, target, summary) {
    auditLogs.push({
      siteId, actorUserId: actorId, action, entityType: 'site', entityId: target,
      summary: Object.fromEntries(Object.entries({
        slug: summary.slug,
        artifactHash: summary.publication?.artifactHash,
        publicationRevision: summary.publication?.revision,
        draftRevision: summary.draftRevision,
        releaseCount: summary.releaseCount,
        domainCount: summary.domains.length
      }).filter(([, value]) => value != null)),
      createdAt: now().toISOString()
    });
  }

  return {
    async getSiteLifecycle(siteId) {
      return snapshot(siteId);
    },

    async changeSiteLifecycle(siteId, action, { actorId, confirmSlug } = {}) {
      const site = sites.get(siteId);
      if (!site) throw lifecycleError('SITE_NOT_FOUND');
      const stamp = now().toISOString();
      if (action === 'delete') {
        if (confirmSlug !== site.slug) throw lifecycleError('CONFIRMATION_MISMATCH');
        const final = snapshot(siteId);
        audit(null, 'delete', actorId, siteId, final);
        sites.delete(siteId);
        drafts.delete(siteId);
        for (let index = memberships.length - 1; index >= 0; index -= 1) {
          if (memberships[index].siteId === siteId) memberships.splice(index, 1);
        }
        for (let index = auditLogs.length - 1; index >= 0; index -= 1) {
          if (auditLogs[index].siteId === siteId) auditLogs.splice(index, 1);
        }
        publicationsBySlug.delete(site.slug);
        for (const [key, entry] of publicationsByHash) {
          if (entry.siteId === siteId || key.startsWith(`${site.slug}:`)) publicationsByHash.delete(key);
        }
        return null;
      }
      if (action === 'pause') site.pausedAt = stamp;
      if (action === 'resume') site.pausedAt = null;
      if (action === 'archive') {
        site.archivedAt = stamp;
        site.pausedAt ??= stamp;
      }
      if (action === 'restore') site.archivedAt = null;
      delete site.paused_at;
      delete site.archived_at;
      const result = snapshot(siteId);
      audit(siteId, action, actorId, siteId, result);
      return result;
    },

    async getPublicSiteState(slug) {
      for (const site of sites.values()) {
        if (site.slug === slug) {
          return siteLifecycleFields(site).pausedAt && publicationsBySlug.has(slug) ? 'paused' : null;
        }
      }
      return null;
    }
  };
}

async function readRpcError(response) {
  const body = await response.json().catch(() => null);
  const text = `${body?.message ?? ''} ${body?.details ?? ''} ${body?.hint ?? ''}`;
  const code = Object.keys(RPC_ERRORS).find(key => text.includes(key));
  return code ? lifecycleError(code) : new Error(`Falha ao atualizar o estado da vitrine (${response.status}).`);
}

export function createRestSiteLifecycle({ baseUrl, fetchImpl, authHeaders, anonHeaders }) {
  async function rpc(name, body, token) {
    const response = await fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: authHeaders(token),
      body: JSON.stringify(body)
    });
    if (!response.ok) throw await readRpcError(response);
    return response.json();
  }

  const actionRpc = {
    pause: 'pause_site',
    resume: 'resume_site',
    archive: 'archive_site',
    restore: 'restore_site'
  };

  return {
    async getSiteLifecycle(siteId, { token } = {}) {
      return rpc('read_site_lifecycle', { target_site: siteId }, token);
    },

    async changeSiteLifecycle(siteId, action, { confirmSlug } = {}, { token } = {}) {
      if (action === 'delete') {
        await rpc('delete_archived_site', { target_site: siteId, confirm_slug: confirmSlug }, token);
        return null;
      }
      return rpc(actionRpc[action], { target_site: siteId }, token);
    },

    async getPublicSiteState(slug) {
      const endpoint = new URL(`${baseUrl}/rest/v1/rpc/public_site_state`);
      endpoint.searchParams.set('target_slug', slug);
      const response = await fetchImpl(endpoint, { headers: anonHeaders() });
      if (!response.ok) throw new Error('Falha ao consultar o estado público da vitrine.');
      return response.json();
    },

    async recordDomainDisconnect(siteId, hostname, { token } = {}) {
      return rpc('record_domain_disconnect', { target_site: siteId, target_hostname: hostname }, token);
    }
  };
}
