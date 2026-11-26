// Equipe da vitrine por link (spec 018, User Story 5). O token do convite nasce aqui no
// Worker, aparece uma única vez (na resposta de criação) e só o hash SHA-256 vai ao banco.
// Token inexistente, vencido, revogado ou usado tem sempre a mesma resposta, e as
// tentativas inválidas passam pelo limitador por endereço do pré-orçamento.
import { PortalValidationError } from './portal-validation.mjs';
import { createLeadRateLimiter } from './quote-webhook.mjs';

export const TEAM_PATH = /^\/api\/sites\/([^/]+)\/team\/?$/;
export const SITE_INVITATIONS_PATH = /^\/api\/sites\/([^/]+)\/invitations(?:\/([^/]+))?\/?$/;
export const INVITATION_API_PATH = /^\/api\/invitations\/(lookup|accept)\/?$/;
export const INVITATION_PAGE_PATH = /^\/convite\/([A-Za-z0-9_-]*)\/?$/;
export const INVITATION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
export const TEAM_INVITATIONS_LIMIT = 20;
export const INVITATION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INVITATION_RATE_LIMIT = Object.freeze({ limit: 30, windowMs: 10 * 60 * 1000, maxKeys: 5000 });

export const INVITATION_HEADERS = Object.freeze({
  'cache-control': 'private, no-store',
  'x-robots-tag': 'noindex, nofollow',
  'referrer-policy': 'no-referrer'
});
export const INVITATION_PAGE_CSP =
  "default-src 'none'; style-src 'self'; img-src 'self'; font-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";

export const INVITE_ROLES = Object.freeze(['admin', 'editor', 'viewer']);
export const TEAM_ROLE_LABELS = Object.freeze({
  owner: 'Proprietário',
  admin: 'Administrador',
  editor: 'Funcionário',
  viewer: 'Somente leitura'
});

const MANAGER_ROLES = ['owner', 'admin'];
const UUID_PATTERN = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i;
const UNAVAILABLE_MESSAGE = 'Este convite não está mais disponível.';
const utf8 = new TextEncoder();

const toHex = (buffer) => Array.from(new Uint8Array(buffer), (byte) => byte.toString(16).padStart(2, '0')).join('');

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function createInvitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function hashInvitationToken(token) {
  return toHex(await crypto.subtle.digest('SHA-256', utf8.encode(token)));
}

/** Texto pronto para o WhatsApp; o papel aparece com o rótulo do painel. */
export function teamInvitationMessage(siteName, role, url) {
  return `Oi! Estou chamando você para a equipe da vitrine ${siteName} na Vitrine Inspira, como ${TEAM_ROLE_LABELS[role] ?? role}. Entre por este link: ${url}`;
}

let sharedLimiter = null;
function defaultInvitationLimiter() {
  // O Workers proíbe aleatórios no escopo global: o limitador nasce na primeira requisição.
  sharedLimiter ??= createLeadRateLimiter(INVITATION_RATE_LIMIT);
  return sharedLimiter;
}

async function invalidAttemptRetryAfter(request, limiter) {
  const address = request.headers.get('cf-connecting-ip') || 'sem-endereco';
  const { allowed, retryAfter } = await limiter.take(address, 'convite');
  return allowed ? null : Math.max(1, retryAfter ?? 1);
}

function withInvitationHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(INVITATION_HEADERS)) headers.set(name, value);
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function presentTeam(team) {
  return {
    members: (team?.members ?? []).map((member) => ({
      userId: member.userId,
      displayName: typeof member.displayName === 'string' && member.displayName.trim() ? member.displayName.trim() : null,
      role: member.role
    })),
    invitations: (team?.invitations ?? []).map((entry) => ({
      id: entry.id, role: entry.role, expiresAt: toIso(entry.expiresAt)
    }))
  };
}

/**
 * Rotas JSON de equipe e convite. Devolve `null` quando o caminho não é deste módulo.
 * Toda resposta sai com os três cabeçalhos de convite, inclusive erros, 404 e 429.
 */
export async function handleInvitationRoutes({
  request, url, pathname, method, store, env, resolveUser, respond, guardMutation, readJson,
  rateLimiter = defaultInvitationLimiter()
}) {
  const team = pathname.match(TEAM_PATH);
  const siteInvitations = team ? null : pathname.match(SITE_INVITATIONS_PATH);
  const flow = team || siteInvitations ? null : pathname.match(INVITATION_API_PATH);
  if (!team && !siteInvitations && !flow) return null;

  const ok = (status, body) => respond(status, body, INVITATION_HEADERS);
  const fail = (status, code, message, headers = {}) =>
    respond(status, { error: { code, message } }, { ...INVITATION_HEADERS, ...headers });
  const unavailable = async () => {
    const retryAfter = await invalidAttemptRetryAfter(request, rateLimiter);
    return retryAfter
      ? fail(429, 'TOO_MANY_ATTEMPTS', 'Muitas tentativas com convites inválidos. Tente de novo em alguns minutos.', { 'retry-after': String(retryAfter) })
      : fail(404, 'INVITATION_UNAVAILABLE', UNAVAILABLE_MESSAGE);
  };
  const guard = (options) => {
    const error = guardMutation(request, url, options);
    return error ? withInvitationHeaders(error) : null;
  };

  try {
    if (flow) {
      const action = flow[1];
      if (method !== 'POST') return fail(405, 'METHOD_NOT_ALLOWED', 'Use POST para abrir ou aceitar o convite.');
      const user = action === 'accept' ? await resolveUser() : null;
      if (action === 'accept' && !user) return fail(401, 'UNAUTHORIZED', 'Entre na sua conta para aceitar o convite.');
      const guardError = guard({ requireOrigin: true, requireJson: true });
      if (guardError) return guardError;
      const { parsed } = await readJson(request);
      const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
      if (!INVITATION_TOKEN_PATTERN.test(token)) return await unavailable();
      const tokenHash = await hashInvitationToken(token);

      if (action === 'lookup') {
        const summary = await store.readInvitation?.(tokenHash, { env });
        if (!summary || summary.kind !== 'team') return await unavailable();
        return ok(200, {
          kind: 'team', siteName: summary.siteName, role: summary.role, expiresAt: toIso(summary.expiresAt)
        });
      }
      if (typeof store.acceptInvitation !== 'function') {
        return fail(503, 'INVITATIONS_UNAVAILABLE', 'Os convites ainda não estão disponíveis neste ambiente.');
      }
      const result = await store.acceptInvitation(tokenHash, user.id, { token: user.token, env });
      if (result?.status === 'already_member') {
        return fail(409, 'ALREADY_MEMBER', 'Você já faz parte desta vitrine.');
      }
      if (result?.status !== 'ok') return await unavailable();
      return ok(200, { siteId: result.siteId, slug: result.slug, role: result.role });
    }

    const [, rawSiteId, invitationId] = team ?? siteInvitations;
    const siteId = decodeURIComponent(rawSiteId);
    const user = await resolveUser();
    if (!user) return fail(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');

    const isList = Boolean(team) && method === 'GET';
    const isCreate = Boolean(siteInvitations) && method === 'POST' && !invitationId;
    const isRevoke = Boolean(siteInvitations) && method === 'DELETE' && Boolean(invitationId);
    if (!isList && !isCreate && !isRevoke) {
      return fail(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para a equipe da vitrine.');
    }
    if (!isList) {
      const guardError = guard({ requireOrigin: true, requireJson: isCreate });
      if (guardError) return guardError;
    }

    const options = { token: user.token, env };
    const site = UUID_PATTERN.test(siteId) ? await store.getSite(siteId, user.id, options) : null;
    if (!site) return fail(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
    if (!MANAGER_ROLES.includes(site.role)) {
      return fail(403, 'FORBIDDEN', 'Só o proprietário e a administração da vitrine gerem a equipe.');
    }
    if (typeof store.listSiteTeam !== 'function') {
      return fail(503, 'TEAM_UNAVAILABLE', 'A equipe ainda não está disponível neste ambiente.');
    }

    if (isList) {
      const result = await store.listSiteTeam(siteId, user.id, options);
      if (!result) return fail(403, 'FORBIDDEN', 'Só o proprietário e a administração da vitrine gerem a equipe.');
      return ok(200, presentTeam(result));
    }

    if (isRevoke) {
      if (!UUID_PATTERN.test(invitationId)) return fail(404, 'INVITATION_NOT_FOUND', 'Convite não encontrado ou já resolvido.');
      const status = await store.revokeInvitation(siteId, invitationId, user.id, options);
      if (status === 'forbidden') return fail(403, 'FORBIDDEN', 'Só o proprietário revoga convites de administrador.');
      if (status !== 'ok') return fail(404, 'INVITATION_NOT_FOUND', 'Convite não encontrado ou já resolvido.');
      return new Response(null, { status: 204, headers: INVITATION_HEADERS });
    }

    const { parsed } = await readJson(request);
    const role = parsed?.role;
    if (!INVITE_ROLES.includes(role)) {
      return fail(422, 'INVALID_ROLE', 'Escolha Administrador, Funcionário ou Somente leitura.');
    }
    if (role === 'admin' && site.role !== 'owner') {
      return fail(403, 'ADMIN_INVITE_OWNER_ONLY', 'Só o proprietário convida administradores.');
    }
    const token = createInvitationToken();
    const created = await store.createTeamInvitation(siteId, role, await hashInvitationToken(token), user.id, options);
    if (created?.status === 'admin_owner_only') {
      return fail(403, 'ADMIN_INVITE_OWNER_ONLY', 'Só o proprietário convida administradores.');
    }
    if (created?.status === 'limit') {
      return fail(409, 'TEAM_INVITATIONS_LIMIT', `A vitrine já tem ${TEAM_INVITATIONS_LIMIT} convites abertos. Revogue um ou espere vencer.`);
    }
    if (created?.status !== 'ok') return fail(403, 'FORBIDDEN', 'Só o proprietário e a administração da vitrine gerem a equipe.');
    const inviteUrl = `${url.origin}/convite/${token}`;
    return ok(201, {
      invitation: { id: created.invitation.id, role: created.invitation.role, expiresAt: toIso(created.invitation.expiresAt) },
      url: inviteUrl,
      message: teamInvitationMessage(site.name, role, inviteUrl)
    });
  } catch (error) {
    if (error instanceof PortalValidationError) return fail(error.status, error.code, error.message);
    console.error(JSON.stringify({
      event: 'invitation_internal_error',
      route: team ? 'team' : siteInvitations ? 'site_invitations' : `invitations_${flow[1]}`,
      errorName: String(error?.name || 'Error').slice(0, 80)
    }));
    return fail(500, 'INTERNAL_ERROR', 'Erro interno ao processar o convite.');
  }
}

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);

function invitationPageHtml(title, body) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<meta name="referrer" content="no-referrer">
<title>${escapeHtml(title)} | Vitrine Inspira</title>
<link rel="stylesheet" href="/portal/portal.css">
<link rel="stylesheet" href="/portal/team-panel.css">
</head>
<body class="invite-page">
<main class="invite-card" aria-labelledby="convite-titulo">
<p class="invite-brand">Vitrine Inspira</p>
${body}
</main>
</body>
</html>`;
}

export function renderTeamInvitationHtml({ siteName, role, acceptHref }) {
  const heading = `${siteName} convidou você para a equipe como ${TEAM_ROLE_LABELS[role] ?? role}`;
  return invitationPageHtml('Convite para a equipe', `<h1 id="convite-titulo" class="invite-title">${escapeHtml(heading)}</h1>
<p class="invite-text">Entre com a sua conta para aceitar. O convite vale por 7 dias e só pode ser usado uma vez.</p>
<p class="invite-actions"><a class="button button-pill invite-accept" href="${escapeHtml(acceptHref)}">Entrar e aceitar</a></p>`);
}

export function renderInvitationUnavailableHtml(text = 'Peça um novo convite a quem administra a vitrine.') {
  return invitationPageHtml(UNAVAILABLE_MESSAGE, `<h1 id="convite-titulo" class="invite-title">${UNAVAILABLE_MESSAGE}</h1>
<p class="invite-text">${escapeHtml(text)}</p>`);
}

function invitationPageResponse(status, html, method, extra = {}) {
  return new Response(method === 'HEAD' ? null : html, {
    status,
    headers: {
      ...INVITATION_HEADERS,
      'content-security-policy': INVITATION_PAGE_CSP,
      'content-type': 'text/html; charset=utf-8',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'DENY',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()',
      ...extra
    }
  });
}

/**
 * Página `/convite/<token>`, sem sessão. O token só sai daqui no fragmento do link para o
 * painel (`#/convite/<token>`), que o guarda em sessionStorage e o tira da barra de endereço.
 */
export async function handleInvitationPage({
  request, method, token, store, env, portalBase = '/portal/', rateLimiter = defaultInvitationLimiter()
}) {
  if (method !== 'GET' && method !== 'HEAD') {
    return invitationPageResponse(405, '', 'HEAD', { allow: 'GET, HEAD' });
  }
  try {
    const summary = INVITATION_TOKEN_PATTERN.test(token)
      ? await store.readInvitation?.(await hashInvitationToken(token), { env })
      : null;
    if (!summary || summary.kind !== 'team') {
      const retryAfter = await invalidAttemptRetryAfter(request, rateLimiter);
      if (retryAfter) {
        return invitationPageResponse(429, renderInvitationUnavailableHtml('Muitas tentativas com convites inválidos. Tente de novo em alguns minutos.'), method, { 'retry-after': String(retryAfter) });
      }
      return invitationPageResponse(404, renderInvitationUnavailableHtml(), method);
    }
    return invitationPageResponse(200, renderTeamInvitationHtml({
      siteName: summary.siteName, role: summary.role, acceptHref: `${portalBase}#/convite/${token}`
    }), method);
  } catch {
    return invitationPageResponse(503, renderInvitationUnavailableHtml('Não foi possível abrir o convite agora. Tente de novo em alguns minutos.'), method);
  }
}

/** Modo local: mesma regra do banco, sobre as listas em memória do store. */
export function createMemoryTeamInvitations({ sites, memberships, profiles, auditLogs, roleFor, now = () => Date.now() }) {
  const invitations = [];
  const isOpen = (entry, at = now()) => entry.status === 'open' && Date.parse(entry.expiresAt) > at;
  const record = (siteId, actorUserId, action, entityId, summary) => auditLogs.push({
    siteId, actorUserId, action, entityType: 'invitation', entityId, summary, createdAt: new Date(now()).toISOString()
  });
  const displayName = (userId) => {
    const profile = profiles.get(userId);
    const name = String(profile?.displayName ?? profile?.display_name ?? '').trim();
    return name || null;
  };
  const present = (entry) => ({ id: entry.id, role: entry.role, expiresAt: entry.expiresAt });
  const findOpen = (tokenHash) => invitations.find((entry) => entry.tokenHash === tokenHash && isOpen(entry));

  return {
    invitations,

    async listSiteTeam(siteId, actorId) {
      const site = sites.get(siteId);
      if (!MANAGER_ROLES.includes(roleFor(site, actorId))) return null;
      const ownerId = site.ownerUserId ?? site.owner_user_id;
      return {
        members: [
          ...(ownerId ? [{ userId: ownerId, displayName: displayName(ownerId), role: 'owner' }] : []),
          ...memberships.filter((entry) => entry.siteId === siteId)
            .map((entry) => ({ userId: entry.userId, displayName: displayName(entry.userId), role: entry.role }))
        ],
        invitations: invitations
          .filter((entry) => entry.siteId === siteId && entry.kind === 'team' && isOpen(entry))
          .map(present)
      };
    },

    async createTeamInvitation(siteId, role, tokenHash, actorId) {
      const actorRole = roleFor(sites.get(siteId), actorId);
      if (!MANAGER_ROLES.includes(actorRole) || !INVITE_ROLES.includes(role)) return { status: 'forbidden' };
      if (role === 'admin' && actorRole !== 'owner') return { status: 'admin_owner_only' };
      const open = invitations.filter((entry) => entry.siteId === siteId && entry.kind === 'team' && isOpen(entry));
      if (open.length >= TEAM_INVITATIONS_LIMIT) return { status: 'limit' };
      const createdAt = now();
      const entry = {
        id: crypto.randomUUID(), tokenHash, kind: 'team', siteId, role, createdBy: actorId,
        createdAt: new Date(createdAt).toISOString(),
        expiresAt: new Date(createdAt + INVITATION_TTL_MS).toISOString(),
        firstOpenedAt: null, status: 'open', resolvedAt: null, acceptedBy: null
      };
      invitations.push(entry);
      record(siteId, actorId, 'invitation_created', entry.id, { kind: 'team', role, expires_at: entry.expiresAt });
      return { status: 'ok', invitation: present(entry) };
    },

    async revokeInvitation(siteId, invitationId, actorId) {
      const entry = invitations.find((item) => item.id === invitationId && item.siteId === siteId && item.kind === 'team');
      const actorRole = roleFor(sites.get(siteId), actorId);
      if (!entry || !MANAGER_ROLES.includes(actorRole)) return 'not_found';
      if (entry.role === 'admin' && actorRole !== 'owner') return 'forbidden';
      if (!isOpen(entry)) return 'not_found';
      entry.status = 'revoked';
      entry.resolvedAt = new Date(now()).toISOString();
      record(siteId, actorId, 'invitation_revoked', entry.id, { kind: 'team', role: entry.role });
      return 'ok';
    },

    async readInvitation(tokenHash) {
      const entry = findOpen(tokenHash);
      const site = entry && sites.get(entry.siteId);
      if (!site) return null;
      if (!entry.firstOpenedAt) {
        entry.firstOpenedAt = new Date(now()).toISOString();
        record(entry.siteId, null, 'invitation_opened', entry.id, { kind: entry.kind });
      }
      return { kind: entry.kind, siteName: site.name, role: entry.role, expiresAt: entry.expiresAt };
    },

    async acceptInvitation(tokenHash, userId) {
      const entry = findOpen(tokenHash);
      const site = entry && entry.kind === 'team' && sites.get(entry.siteId);
      if (!site) return { status: 'unavailable' };
      if (roleFor(site, userId)) return { status: 'already_member' };
      memberships.push({ siteId: site.id, userId, role: entry.role });
      Object.assign(entry, { status: 'accepted', resolvedAt: new Date(now()).toISOString(), acceptedBy: userId });
      auditLogs.push({
        siteId: site.id, actorUserId: userId, entityType: 'membership', entityId: userId, action: 'insert',
        summary: { role: entry.role }, createdAt: entry.resolvedAt
      });
      record(site.id, userId, 'invitation_accepted', entry.id, { kind: 'team', role: entry.role });
      return { status: 'ok', siteId: site.id, slug: site.slug, role: entry.role };
    }
  };
}

function serviceHeaders(env) {
  const key = env?.SUPABASE_SERVICE_ROLE_KEY;
  return key ? { apikey: key, authorization: `Bearer ${key}`, 'content-type': 'application/json' } : null;
}

async function rpcErrorMessage(response) {
  const body = await response.json().catch(() => null);
  return String(body?.message ?? '');
}

/** Supabase: as funções da migração 20261126000100 com o JWT da pessoa (ou a chave de serviço na abertura). */
export function createRestTeamInvitations({ baseUrl, fetchImpl, authHeaders }) {
  const rpc = (name, body, headers) => fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST', headers, body: JSON.stringify(body)
  });

  async function listSiteTeam(siteId, _actorId, { token } = {}) {
    const response = await rpc('list_site_team', { target_site: siteId }, authHeaders(token));
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok) throw new Error('Falha ao consultar a equipe da vitrine.');
    const raw = await response.json();
    return {
      members: (raw?.members ?? []).map((row) => ({ userId: row.user_id, displayName: row.display_name ?? null, role: row.role })),
      invitations: (raw?.invitations ?? []).map((row) => ({ id: row.id, role: row.role, expiresAt: toIso(row.expires_at) }))
    };
  }

  return {
    listSiteTeam,

    async createTeamInvitation(siteId, role, tokenHash, _actorId, { token } = {}) {
      const response = await rpc('create_team_invitation', {
        target_site: siteId, target_role: role, target_token_hash: tokenHash
      }, authHeaders(token));
      if (response.ok) {
        const raw = await response.json();
        return { status: 'ok', invitation: { id: raw.id, role: raw.role, expiresAt: toIso(raw.expires_at) } };
      }
      const message = await rpcErrorMessage(response);
      if (message.includes('ADMIN_INVITE_OWNER_ONLY')) return { status: 'admin_owner_only' };
      if (message.includes('TEAM_INVITATIONS_LIMIT')) return { status: 'limit' };
      if (response.status === 401 || response.status === 403 || message.includes('FORBIDDEN')) return { status: 'forbidden' };
      throw new Error('Falha ao criar o convite da equipe.');
    },

    async revokeInvitation(siteId, invitationId, actorId, options = {}) {
      const team = await listSiteTeam(siteId, actorId, options);
      if (!team?.invitations.some((entry) => entry.id === invitationId)) return 'not_found';
      const response = await rpc('revoke_invitation', { target_invitation: invitationId }, authHeaders(options.token));
      if (response.ok) return 'ok';
      const message = await rpcErrorMessage(response);
      if (message.includes('INVITATION_NOT_FOUND')) return 'not_found';
      if (response.status === 401 || response.status === 403 || message.includes('FORBIDDEN')) return 'forbidden';
      throw new Error('Falha ao revogar o convite.');
    },

    async readInvitation(tokenHash, { env } = {}) {
      const headers = serviceHeaders(env);
      if (!headers) {
        throw new PortalValidationError(503, 'INVITATIONS_UNAVAILABLE', 'Os convites ainda não estão disponíveis neste ambiente.');
      }
      const response = await rpc('service_read_invitation', { target_token_hash: tokenHash }, headers);
      if (!response.ok) throw new Error('Falha ao consultar o convite.');
      const raw = await response.json();
      return raw && typeof raw === 'object'
        ? { kind: raw.kind, siteName: raw.site_name, role: raw.role ?? null, expiresAt: toIso(raw.expires_at) }
        : null;
    },

    async acceptInvitation(tokenHash, _userId, { token } = {}) {
      const response = await rpc('accept_invitation', { target_token_hash: tokenHash }, authHeaders(token));
      if (response.ok) {
        const raw = await response.json();
        return { status: 'ok', siteId: raw.site_id, slug: raw.slug, role: raw.role };
      }
      const message = await rpcErrorMessage(response);
      if (message.includes('ALREADY_MEMBER')) return { status: 'already_member' };
      if (message.includes('INVITATION_UNAVAILABLE')) return { status: 'unavailable' };
      throw new Error('Falha ao aceitar o convite.');
    }
  };
}

/** Rotina agendada: marca vencidos e apaga resolvidos há mais de 90 dias. */
export async function purgeExpiredInvitations(env = {}, fetchImpl = globalThis.fetch) {
  const headers = serviceHeaders(env);
  if (!env.SUPABASE_URL || !headers) return null;
  const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/purge_expired_invitations`, {
    method: 'POST', headers, body: '{}'
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Falha ao limpar convites vencidos.');
  return response.json();
}
