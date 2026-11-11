import {
  DEFAULT_TEMPLATE,
  MAX_DRAFT_BYTES,
  PortalValidationError,
  createInitialDraftContent,
  measureDraftBytes,
  validateDraftContent,
  validateRevision,
  validateSiteInput
} from '../src/portal-validation.mjs';

const SESSION_COOKIE_NAME = '__Host-vitrine_session';
const LOGOUT_COOKIE_HEADER = `${SESSION_COOKIE_NAME}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax`;
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'no-store'
});

const utf8Encoder = new TextEncoder();
const utf8Decoder = new TextDecoder();

function jsonResponse(status, body, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...JSON_HEADERS,
      ...extraHeaders
    }
  });
}

function errorResponse(status, code, message, extra = {}) {
  return jsonResponse(status, {
    error: {
      code,
      message,
      ...extra
    }
  });
}

function base64UrlToUint8Array(base64Url) {
  const padded = base64Url.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(base64Url.length / 4) * 4, '=');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function verifyJwtHs256(token, secret, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || typeof secret !== 'string' || !secret) {
    return null;
  }
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }
  try {
    const header = JSON.parse(utf8Decoder.decode(base64UrlToUint8Array(parts[0])));
    if (!header || header.alg !== 'HS256') {
      return null;
    }
    const key = await crypto.subtle.importKey(
      'raw',
      utf8Encoder.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const data = utf8Encoder.encode(`${parts[0]}.${parts[1]}`);
    const signature = base64UrlToUint8Array(parts[2]);
    const valid = await crypto.subtle.verify('HMAC', key, signature, data);
    if (!valid) {
      return null;
    }
    const payload = JSON.parse(utf8Decoder.decode(base64UrlToUint8Array(parts[1])));
    if (!payload || typeof payload !== 'object') {
      return null;
    }
    if (typeof payload.exp === 'number' && payload.exp <= nowSeconds) {
      return null;
    }
    const userId = typeof payload.sub === 'string' && payload.sub.trim() ? payload.sub.trim() : null;
    if (!userId) {
      return null;
    }
    return { id: userId };
  } catch {
    return null;
  }
}

export function extractSessionToken(request) {
  const authHeader = request.headers.get('authorization');
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
  }
  const cookieHeader = request.headers.get('cookie');
  if (typeof cookieHeader === 'string' && cookieHeader.trim()) {
    const cookies = cookieHeader.split(';');
    for (const part of cookies) {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) continue;
      const name = part.slice(0, eqIdx).trim();
      if (name === SESSION_COOKIE_NAME) {
        const rawValue = part.slice(eqIdx + 1).trim();
        if (!rawValue) return null;
        try {
          return decodeURIComponent(rawValue);
        } catch {
          return rawValue;
        }
      }
    }
  }
  return null;
}

function normalizeVerifiedUser(result, token) {
  if (!result) return null;
  if (typeof result === 'string' && result.trim()) {
    return { id: result.trim(), token };
  }
  if (typeof result === 'object') {
    const id =
      (typeof result.id === 'string' && result.id.trim()) ||
      (typeof result.sub === 'string' && result.sub.trim()) ||
      (typeof result.userId === 'string' && result.userId.trim()) ||
      (typeof result.user?.id === 'string' && result.user.id.trim()) ||
      null;
    if (id) {
      return { id, token };
    }
  }
  return null;
}

async function resolveSessionUser(request, env, deps) {
  const token = extractSessionToken(request);
  if (!token) {
    return null;
  }

  const verifier = deps.authVerifier;
  if (verifier) {
    try {
      const fn = typeof verifier === 'function' ? verifier : verifier.verify?.bind(verifier);
      if (typeof fn !== 'function') {
        return null;
      }
      let result;
      try {
        result = await fn(token, request, env);
      } catch (err) {
        if (err instanceof TypeError && /headers|url|method/i.test(String(err.message))) {
          result = await fn(request, token, env);
        } else {
          throw err;
        }
      }
      return normalizeVerifiedUser(result, token);
    } catch {
      return null;
    }
  }

  if (env?.SUPABASE_JWT_SECRET) {
    const verified = await verifyJwtHs256(token, env.SUPABASE_JWT_SECRET);
    return normalizeVerifiedUser(verified, token);
  }

  if (env?.SUPABASE_URL && env?.SUPABASE_ANON_KEY) {
    const fetchImpl = deps.fetch ?? globalThis.fetch;
    try {
      const baseUrl = String(env.SUPABASE_URL).replace(/\/+$/, '');
      const response = await fetchImpl(`${baseUrl}/auth/v1/user`, {
        method: 'GET',
        headers: {
          authorization: `Bearer ${token}`,
          apikey: String(env.SUPABASE_ANON_KEY)
        }
      });
      if (!response.ok) {
        return null;
      }
      const data = await response.json();
      return normalizeVerifiedUser(data, token);
    } catch {
      return null;
    }
  }

  return null;
}

export function createMemoryStore(initial = {}) {
  const sites = new Map();
  const drafts = new Map();
  const memberships = [];

  if (initial.sites instanceof Map) {
    for (const [key, value] of initial.sites.entries()) {
      sites.set(key, structuredClone(value));
    }
  } else if (Array.isArray(initial.sites)) {
    for (const site of initial.sites) {
      if (site?.id) {
        sites.set(site.id, structuredClone(site));
      }
    }
  }

  if (initial.drafts instanceof Map) {
    for (const [key, value] of initial.drafts.entries()) {
      drafts.set(key, structuredClone(value));
    }
  } else if (Array.isArray(initial.drafts)) {
    for (const draft of initial.drafts) {
      const siteId = draft?.siteId ?? draft?.site_id;
      if (siteId) {
        drafts.set(siteId, {
          siteId,
          revision: draft.revision ?? 1,
          updatedAt: draft.updatedAt ?? draft.updated_at ?? new Date().toISOString(),
          content: structuredClone(draft.content ?? {})
        });
      }
    }
  }

  const rawMemberships = initial.memberships ?? initial.siteMemberships ?? [];
  if (Array.isArray(rawMemberships)) {
    for (const entry of rawMemberships) {
      const siteId = entry?.siteId ?? entry?.site_id;
      const userId = entry?.userId ?? entry?.user_id;
      if (siteId && userId) {
        memberships.push({
          siteId,
          userId,
          role: entry.role ?? 'member'
        });
      }
    }
  }

  function getRoleForSite(site, userId) {
    if (!site || !userId) return null;
    const ownerId = site.ownerUserId ?? site.owner_user_id;
    if (ownerId === userId) {
      return 'owner';
    }
    const isMember = memberships.some(m => m.siteId === site.id && m.userId === userId);
    return isMember ? 'member' : null;
  }

  function formatSiteSummary(site, role) {
    return {
      id: site.id,
      slug: site.slug,
      name: site.name,
      template: site.template ?? DEFAULT_TEMPLATE,
      role,
      updatedAt: site.updatedAt ?? site.updated_at ?? site.createdAt ?? site.created_at
    };
  }

  return {
    sites,
    drafts,
    memberships,

    addMembership(siteId, userId, role = 'member') {
      const exists = memberships.some(m => m.siteId === siteId && m.userId === userId);
      if (!exists) {
        memberships.push({ siteId, userId, role });
      }
    },

    async listSites(userId) {
      const result = [];
      for (const site of sites.values()) {
        const role = getRoleForSite(site, userId);
        if (role) {
          result.push(formatSiteSummary(site, role));
        }
      }
      return result;
    },

    async createSite({ userId, name, slug, template = DEFAULT_TEMPLATE, content }) {
      for (const existing of sites.values()) {
        if (existing.slug === slug) {
          throw new PortalValidationError(
            409,
            'SLUG_TAKEN',
            'Este identificador (slug) já está em uso por outra vitrine.'
          );
        }
      }
      const now = new Date().toISOString();
      const id = crypto.randomUUID();
      const siteRecord = {
        id,
        ownerUserId: userId,
        slug,
        name,
        template,
        createdAt: now,
        updatedAt: now
      };
      const draftRecord = {
        siteId: id,
        revision: 1,
        updatedAt: now,
        content: structuredClone(
          content ??
            createInitialDraftContent({
              slug,
              name,
              template
            })
        )
      };
      sites.set(id, siteRecord);
      drafts.set(id, draftRecord);
      return {
        site: formatSiteSummary(siteRecord, 'owner'),
        draft: structuredClone(draftRecord)
      };
    },

    async getDraft(siteId, userId) {
      const site = sites.get(siteId);
      const role = getRoleForSite(site, userId);
      if (!role) {
        return null;
      }
      const draft = drafts.get(siteId);
      if (!draft) {
        return null;
      }
      return structuredClone(draft);
    },

    async updateDraft({ siteId, userId, revision, content }) {
      const site = sites.get(siteId);
      const role = getRoleForSite(site, userId);
      if (!role) {
        return { status: 'not_found' };
      }
      const current = drafts.get(siteId);
      if (!current) {
        return { status: 'not_found' };
      }
      if (current.revision !== revision) {
        return {
          status: 'conflict',
          currentRevision: current.revision
        };
      }
      const now = new Date().toISOString();
      const nextDraft = {
        siteId,
        revision: current.revision + 1,
        updatedAt: now,
        content: structuredClone(content)
      };
      drafts.set(siteId, nextDraft);
      site.updatedAt = now;
      return {
        status: 'ok',
        draft: structuredClone(nextDraft)
      };
    }
  };
}

export function createSupabaseRestStore({ supabaseUrl, supabaseAnonKey, fetch: customFetch } = {}) {
  const fetchImpl = customFetch ?? globalThis.fetch;
  const baseUrl = String(supabaseUrl ?? '').replace(/\/+$/, '');

  function authHeaders(token, extra = {}) {
    return {
      apikey: String(supabaseAnonKey),
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      ...extra
    };
  }

  return {
    async listSites(userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/sites?select=id,owner_user_id,slug,name,template,created_at,updated_at&order=created_at.asc`,
        {
          method: 'GET',
          headers: authHeaders(token)
        }
      );
      if (!response.ok) {
        throw new Error(`Supabase listSites error: ${response.status}`);
      }
      const rows = await response.json();
      return rows.map(row => ({
        id: row.id,
        slug: row.slug,
        name: row.name,
        template: row.template ?? DEFAULT_TEMPLATE,
        role: row.owner_user_id === userId ? 'owner' : 'member',
        updatedAt: row.updated_at ?? row.created_at
      }));
    },

    async createSite({ userId, name, slug, template = DEFAULT_TEMPLATE, content }, { token } = {}) {
      const siteRes = await fetchImpl(`${baseUrl}/rest/v1/sites`, {
        method: 'POST',
        headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({
          owner_user_id: userId,
          slug,
          name,
          template
        })
      });

      if (siteRes.status === 409) {
        throw new PortalValidationError(
          409,
          'SLUG_TAKEN',
          'Este identificador (slug) já está em uso por outra vitrine.'
        );
      }
      if (!siteRes.ok) {
        const errBody = await siteRes.json().catch(() => ({}));
        if (errBody?.code === '23505') {
          throw new PortalValidationError(
            409,
            'SLUG_TAKEN',
            'Este identificador (slug) já está em uso por outra vitrine.'
          );
        }
        if (errBody?.code === '23514') {
          throw new PortalValidationError(400, 'INVALID_SLUG', 'Identificador (slug) inválido.');
        }
        throw new Error(`Supabase createSite error: ${siteRes.status}`);
      }

      const [siteRow] = await siteRes.json();
      const draftContent =
        content ??
        createInitialDraftContent({
          slug,
          name,
          template
        });

      const draftRes = await fetchImpl(`${baseUrl}/rest/v1/drafts`, {
        method: 'POST',
        headers: authHeaders(token, { prefer: 'return=representation' }),
        body: JSON.stringify({
          site_id: siteRow.id,
          content: draftContent
        })
      });

      if (!draftRes.ok) {
        throw new Error(`Supabase createDraft error: ${draftRes.status}`);
      }
      const [draftRow] = await draftRes.json();
      const updatedAt = siteRow.updated_at ?? siteRow.created_at ?? new Date().toISOString();

      return {
        site: {
          id: siteRow.id,
          slug: siteRow.slug,
          name: siteRow.name,
          template: siteRow.template ?? DEFAULT_TEMPLATE,
          role: 'owner',
          updatedAt
        },
        draft: {
          siteId: draftRow.site_id,
          revision: draftRow.revision,
          updatedAt: draftRow.updated_at ?? updatedAt,
          content: draftRow.content
        }
      };
    },

    async getDraft(siteId, _userId, { token } = {}) {
      const response = await fetchImpl(
        `${baseUrl}/rest/v1/drafts?site_id=eq.${encodeURIComponent(siteId)}&select=site_id,revision,updated_at,content`,
        {
          method: 'GET',
          headers: authHeaders(token)
        }
      );
      if (!response.ok) {
        return null;
      }
      const rows = await response.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return null;
      }
      const row = rows[0];
      return {
        siteId: row.site_id,
        revision: row.revision,
        updatedAt: row.updated_at,
        content: row.content
      };
    },

    async updateDraft({ siteId, userId, revision, content }, { token } = {}) {
      const current = await this.getDraft(siteId, userId, { token });
      if (!current) {
        return { status: 'not_found' };
      }
      if (current.revision !== revision) {
        return {
          status: 'conflict',
          currentRevision: current.revision
        };
      }
      const updateRes = await fetchImpl(
        `${baseUrl}/rest/v1/drafts?site_id=eq.${encodeURIComponent(siteId)}&revision=eq.${encodeURIComponent(String(revision))}`,
        {
          method: 'PATCH',
          headers: authHeaders(token, { prefer: 'return=representation' }),
          body: JSON.stringify({ content })
        }
      );
      if (!updateRes.ok) {
        return { status: 'not_found' };
      }
      const updatedRows = await updateRes.json();
      if (!Array.isArray(updatedRows) || updatedRows.length === 0) {
        const latest = await this.getDraft(siteId, userId, { token });
        if (!latest) {
          return { status: 'not_found' };
        }
        return {
          status: 'conflict',
          currentRevision: latest.revision
        };
      }
      const row = updatedRows[0];
      return {
        status: 'ok',
        draft: {
          siteId: row.site_id,
          revision: row.revision,
          updatedAt: row.updated_at,
          content: row.content
        }
      };
    }
  };
}

function normalizeStore(providedStore) {
  if (!providedStore) {
    return createMemoryStore();
  }
  if (
    typeof providedStore.listSites === 'function' &&
    typeof providedStore.createSite === 'function' &&
    typeof providedStore.getDraft === 'function' &&
    typeof providedStore.updateDraft === 'function'
  ) {
    return providedStore;
  }
  return createMemoryStore(providedStore);
}

async function parseJsonRequest(request) {
  let rawText;
  try {
    rawText = await request.text();
  } catch {
    throw new PortalValidationError(400, 'INVALID_JSON', 'Não foi possível ler o corpo da requisição.');
  }
  if (!rawText || !rawText.trim()) {
    throw new PortalValidationError(400, 'INVALID_JSON', 'O corpo da requisição JSON está vazio.');
  }
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new PortalValidationError(400, 'INVALID_JSON', 'O corpo da requisição não contém JSON válido.');
  }
  return { rawText, parsed };
}

export function createApiHandler(deps = {}) {
  const defaultStore = normalizeStore(deps.store);

  function resolveStore(env) {
    if (deps.store) {
      return defaultStore;
    }
    if (env?.SUPABASE_URL && env?.SUPABASE_ANON_KEY) {
      return createSupabaseRestStore({
        supabaseUrl: env.SUPABASE_URL,
        supabaseAnonKey: env.SUPABASE_ANON_KEY,
        fetch: deps.fetch
      });
    }
    return defaultStore;
  }

  const handler = async function apiHandler(request, env = {}, _ctx = {}) {
    const url = new URL(request.url, 'http://localhost');
    const pathname = url.pathname;
    const method = (request.method || 'GET').toUpperCase();

    if (pathname !== '/api' && !pathname.startsWith('/api/')) {
      const assetsFetcher = env?.ASSETS ?? deps?.assets;
      if (assetsFetcher && typeof assetsFetcher.fetch === 'function') {
        return assetsFetcher.fetch(request);
      }
      return errorResponse(404, 'NOT_FOUND', 'Recurso não encontrado.');
    }

    try {
      if (pathname === '/api/auth/logout') {
        if (method !== 'POST') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/auth/logout.');
        }
        return jsonResponse(
          200,
          { ok: true },
          { 'set-cookie': LOGOUT_COOKIE_HEADER }
        );
      }

      if (pathname === '/api/auth/session') {
        if (method !== 'GET') {
          return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/auth/session.');
        }
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }
        return jsonResponse(200, {
          authenticated: true,
          user: {
            id: user.id
          }
        });
      }

      const store = resolveStore(env);

      if (pathname === '/api/sites' || pathname === '/api/sites/') {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        if (method === 'GET') {
          const sites = await store.listSites(user.id, { token: user.token, env });
          return jsonResponse(200, { sites });
        }

        if (method === 'POST') {
          const { parsed } = await parseJsonRequest(request);
          const { name, slug, template, whatsapp } = validateSiteInput(parsed);
          const content = createInitialDraftContent({
            slug,
            name,
            template,
            whatsapp
          });
          const created = await store.createSite(
            {
              userId: user.id,
              name,
              slug,
              template,
              content
            },
            { token: user.token, env }
          );
          return jsonResponse(201, created);
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para /api/sites.');
      }

      const draftMatch = pathname.match(/^\/api\/sites\/([^/]+)\/draft\/?$/);
      if (draftMatch) {
        const user = await resolveSessionUser(request, env, deps);
        if (!user) {
          return errorResponse(401, 'UNAUTHORIZED', 'Sessão inválida ou expirada.');
        }

        const siteId = decodeURIComponent(draftMatch[1]);

        if (method === 'GET') {
          const draft = await store.getDraft(siteId, user.id, { token: user.token, env });
          if (!draft) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
          }
          return jsonResponse(200, { draft });
        }

        if (method === 'PUT') {
          const existingDraft = await store.getDraft(siteId, user.id, { token: user.token, env });
          if (!existingDraft) {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
          }

          const { rawText, parsed } = await parseJsonRequest(request);
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return errorResponse(400, 'INVALID_PAYLOAD', 'Corpo da requisição inválido.');
          }

          if (parsed.content !== undefined && typeof parsed.content === 'object' && parsed.content !== null) {
            if (measureDraftBytes(parsed.content) > MAX_DRAFT_BYTES) {
              return errorResponse(
                413,
                'DRAFT_TOO_LARGE',
                'O rascunho excede o tamanho máximo permitido de 256 KiB (262.144 bytes).'
              );
            }
          } else if (utf8Encoder.encode(rawText).byteLength > MAX_DRAFT_BYTES) {
            return errorResponse(
              413,
              'DRAFT_TOO_LARGE',
              'O rascunho excede o tamanho máximo permitido de 256 KiB (262.144 bytes).'
            );
          }

          const revision = validateRevision(parsed.revision);
          validateDraftContent(parsed.content, {
            defaultWhatsapp:
              existingDraft.revision !== revision ? existingDraft.content?.whatsapp : undefined
          });

          const updateResult = await store.updateDraft(
            {
              siteId,
              userId: user.id,
              revision,
              content: parsed.content
            },
            { token: user.token, env }
          );

          if (!updateResult || updateResult.status === 'not_found') {
            return errorResponse(404, 'SITE_NOT_FOUND', 'Vitrine não encontrada.');
          }

          if (updateResult.status === 'conflict') {
            return errorResponse(
              409,
              'REVISION_CONFLICT',
              'Este rascunho foi atualizado em outra aba ou dispositivo. Recarregue antes de salvar.',
              { currentRevision: updateResult.currentRevision }
            );
          }

          return jsonResponse(200, { draft: updateResult.draft });
        }

        return errorResponse(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para rascunho.');
      }

      return errorResponse(404, 'NOT_FOUND', 'Endpoint da API não encontrado.');
    } catch (err) {
      if (err instanceof PortalValidationError) {
        return jsonResponse(err.status, err.toJSON());
      }
      return errorResponse(500, 'INTERNAL_ERROR', 'Erro interno ao processar a requisição.');
    }
  };

  handler.fetch = handler;
  handler.store = defaultStore;
  return handler;
}

const defaultApiHandler = createApiHandler();

export default {
  async fetch(request, env = {}, ctx = {}) {
    const url = new URL(request.url, 'http://localhost');
    if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
      return defaultApiHandler(request, env, ctx);
    }
    if (env?.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return errorResponse(404, 'NOT_FOUND', 'Recurso estático não encontrado.');
  }
};
