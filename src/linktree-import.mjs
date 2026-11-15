import {
  PortalValidationError,
  assertNoDangerousTextPayload,
  createInitialDraftContent,
  isValidSlug,
  validateDraftContent
} from './portal-validation.mjs';
import { instagramUrlFromHandle } from '../web/assets/channels.mjs';

export const LINKTREE_HOST = 'linktr.ee';
export const LINKTREE_USERNAME_PATTERN = /^[A-Za-z0-9_.]{1,30}$/;
export const LINKTREE_TIMEOUT_MS = 5000;
export const LINKTREE_MAX_BYTES = 1024 * 1024;
export const LINKTREE_DEMO_DAYS = 30;
export const LINKTREE_MAX_ITEMS = 20;
const MAX_SAME_HOST_REDIRECTS = 2;
const MAX_LINK_CANDIDATES = 80;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WHATSAPP_PATTERN = /^[1-9]\d{7,14}$/;
const INSTAGRAM_RESERVED = new Set(['p', 'reel', 'reels', 'explore', 'stories', 'accounts', 'tv', 'direct']);
const PHOTO_HOST_SUFFIX = '.linktr.ee';

function fail(status, code, message) {
  return new PortalValidationError(status, code, message);
}

export function validateLinktreeUsername(raw) {
  const username = typeof raw === 'string' ? raw : '';
  if (!LINKTREE_USERNAME_PATTERN.test(username) || username.includes('..') || /^\.+$/.test(username)) {
    throw fail(422, 'INVALID_LINKTREE_USERNAME',
      'Informe só o nome de usuário do Linktree: até 30 letras, números, ponto ou sublinhado, sem barra, arroba ou "..".');
  }
  return username;
}

export function buildLinktreeUrl(username) {
  return `https://${LINKTREE_HOST}/${encodeURIComponent(validateLinktreeUsername(username))}`;
}

export function isAllowedLinktreeUrl(raw) {
  let url;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' || url.hostname !== LINKTREE_HOST || url.port || url.username || url.password) {
    return false;
  }
  const match = url.pathname.match(/^\/([^/]+)\/?$/);
  if (!match) return false;
  try {
    validateLinktreeUsername(decodeURIComponent(match[1]));
    return true;
  } catch {
    return false;
  }
}

async function readLimitedText(response, maxBytes, race) {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel?.().catch(() => {});
    throw fail(502, 'LINKTREE_TOO_LARGE', 'A página do Linktree passa de 1 MB e não foi importada.');
  }
  if (!response.body?.getReader) {
    throw fail(502, 'LINKTREE_UNAVAILABLE', 'O Linktree respondeu sem conteúdo.');
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await race(reader.read());
    if (done) break;
    const chunk = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value ?? ''));
    total += chunk.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw fail(502, 'LINKTREE_TOO_LARGE', 'A página do Linktree passa de 1 MB e não foi importada.');
    }
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder('utf-8').decode(bytes);
}

export async function fetchLinktreePage(rawUsername, {
  fetch: fetchImpl = globalThis.fetch,
  timeoutMs = LINKTREE_TIMEOUT_MS,
  maxBytes = LINKTREE_MAX_BYTES
} = {}) {
  let target = buildLinktreeUrl(rawUsername);
  const controller = new AbortController();
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(fail(504, 'LINKTREE_TIMEOUT', 'O Linktree demorou mais de 5 segundos para responder. Tente de novo.'));
    }, timeoutMs);
  });
  timeout.catch(() => {});
  const race = promise => Promise.race([promise, timeout]);
  try {
    for (let hop = 0; ; hop += 1) {
      const response = await race(fetchImpl(target, {
        method: 'GET',
        redirect: 'manual',
        signal: controller.signal,
        headers: { accept: 'text/html', 'user-agent': 'VitrineInspira-Importador/1.0' }
      }));
      if (response.url && !isAllowedLinktreeUrl(response.url)) {
        throw fail(502, 'LINKTREE_REDIRECT_REFUSED', 'O Linktree redirecionou para outro endereço; a importação foi recusada.');
      }
      const redirected = response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
      if (redirected) {
        const location = response.headers.get('location');
        let next = null;
        try {
          next = location ? new URL(location, target).href : null;
        } catch {
          next = null;
        }
        if (!next || !isAllowedLinktreeUrl(next) || hop >= MAX_SAME_HOST_REDIRECTS) {
          throw fail(502, 'LINKTREE_REDIRECT_REFUSED', 'O Linktree redirecionou para outro endereço; a importação foi recusada.');
        }
        await response.body?.cancel?.().catch(() => {});
        target = next;
        continue;
      }
      if (response.status === 404 || response.status === 410) {
        throw fail(404, 'LINKTREE_NOT_FOUND', 'Não há página pública do Linktree com esse nome de usuário.');
      }
      if (response.status !== 200) {
        throw fail(502, 'LINKTREE_UNAVAILABLE', `O Linktree respondeu com erro (${response.status}). Tente mais tarde.`);
      }
      if (!/^text\/html\b/i.test(response.headers.get('content-type') || '')) {
        throw fail(502, 'LINKTREE_UNEXPECTED_CONTENT', 'O Linktree não respondeu com uma página HTML.');
      }
      return { url: target, html: await readLimitedText(response, maxBytes, race) };
    }
  } catch (error) {
    if (error instanceof PortalValidationError) throw error;
    if (controller.signal.aborted || error?.name === 'AbortError') {
      throw fail(504, 'LINKTREE_TIMEOUT', 'O Linktree demorou mais de 5 segundos para responder. Tente de novo.');
    }
    throw fail(502, 'LINKTREE_UNAVAILABLE', 'Não foi possível acessar o Linktree agora. Tente mais tarde.');
  } finally {
    clearTimeout(timer);
  }
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' };

function decodeEntities(value) {
  return value.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6}|#39);/gi, (match, name) => {
    const key = name.toLowerCase();
    if (ENTITIES[key] !== undefined) return ENTITIES[key];
    const code = key.startsWith('#x') ? parseInt(key.slice(2), 16) : key.startsWith('#') ? parseInt(key.slice(1), 10) : NaN;
    return Number.isInteger(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
  });
}

export function sanitizeImportedText(value, maxLength) {
  if (typeof value !== 'string') return '';
  const cleaned = value
    .replace(/<(script|style)\b[\s\S]*?<\/\1\s*>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/[<>]/g, ' ')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2066-\u2069\ufeff]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const truncated = Array.from(cleaned).slice(0, maxLength).join('').trim();
  try {
    assertNoDangerousTextPayload(truncated);
  } catch {
    return '';
  }
  return truncated;
}

export function sanitizeImportedUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > 2048) return null;
  let url;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.') || /^[\d.]+$/.test(host) || host.startsWith('[') || host === 'localhost' || host.endsWith('.localhost')) {
    return null;
  }
  return url.href;
}

function sanitizePhotoUrl(raw) {
  const href = sanitizeImportedUrl(raw);
  if (!href) return null;
  const host = new URL(href).hostname.toLowerCase();
  return host === LINKTREE_HOST || host.endsWith(PHOTO_HOST_SUFFIX) ? href : null;
}

function readNextData(html) {
  const match = html.match(/<script\b[^>]*\bid\s*=\s*["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script\s*>/i);
  if (!match) return null;
  try {
    const data = JSON.parse(match[1]);
    return data && typeof data === 'object' ? data : null;
  } catch {
    return null;
  }
}

function readMeta(html, property) {
  const tags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of tags) {
    const key = tag.match(/\b(?:property|name)\s*=\s*["']([^"']+)["']/i)?.[1];
    if (key?.toLowerCase() !== property) continue;
    const content = tag.match(/\bcontent\s*=\s*"([^"]*)"/i)?.[1] ?? tag.match(/\bcontent\s*=\s*'([^']*)'/i)?.[1];
    if (content !== undefined) return decodeEntities(content);
  }
  return '';
}

function normalizedHost(url) {
  return url.hostname.toLowerCase().replace(/^(?:www|m)\./, '');
}

export function classifyImportedLink(href) {
  const url = new URL(href);
  const host = normalizedHost(url);
  let phone = null;
  if (host === 'wa.me') phone = url.pathname.match(/^\/\+?(\d{8,15})\/?$/)?.[1] ?? null;
  if ((host === 'api.whatsapp.com' || host === 'whatsapp.com') && /^\/send\/?$/.test(url.pathname)) {
    phone = (url.searchParams.get('phone') ?? '').replace(/\D/g, '');
  }
  if (phone && WHATSAPP_PATTERN.test(phone)) return { kind: 'whatsapp', whatsapp: phone };
  if (host === 'instagram.com') {
    const handle = url.pathname.match(/^\/([A-Za-z0-9_.]{1,30})\/?$/)?.[1];
    if (handle && !INSTAGRAM_RESERVED.has(handle.toLowerCase()) && !handle.includes('..')) {
      return { kind: 'instagram', instagram: handle };
    }
  }
  return { kind: 'link' };
}

function collectRawLinks(pageProps, account) {
  const sources = [
    ...(Array.isArray(pageProps?.links) ? pageProps.links : []),
    ...(Array.isArray(account?.links) ? account.links : []),
    ...(Array.isArray(pageProps?.socialLinks) ? pageProps.socialLinks : []),
    ...(Array.isArray(account?.socialLinks) ? account.socialLinks : [])
  ];
  return sources.slice(0, MAX_LINK_CANDIDATES)
    .filter(entry => entry && typeof entry === 'object' && !entry.locked)
    .map(entry => ({ title: entry.title ?? entry.type ?? '', url: entry.url }));
}

export function parseLinktreeHtml(html, username) {
  const source = typeof html === 'string' ? html : '';
  const data = readNextData(source);
  const pageProps = data?.props?.pageProps ?? {};
  const account = pageProps.account && typeof pageProps.account === 'object' ? pageProps.account : {};
  const name = sanitizeImportedText(account.pageTitle ?? account.displayName ?? '', 160) ||
    sanitizeImportedText(readMeta(source, 'og:title').replace(/\s*\|\s*Linktree\s*$/i, ''), 160) ||
    sanitizeImportedText(username, 160);
  const description = sanitizeImportedText(account.description ?? '', 280) ||
    sanitizeImportedText(readMeta(source, 'og:description'), 280);
  const photoUrl = sanitizePhotoUrl(account.profilePictureUrl ?? '') || sanitizePhotoUrl(readMeta(source, 'og:image'));

  let whatsapp = null;
  let instagram = null;
  const links = [];
  const seen = new Set();
  let skipped = 0;
  for (const entry of collectRawLinks(pageProps, account)) {
    const href = sanitizeImportedUrl(entry.url);
    if (!href || seen.has(href)) {
      if (!href) skipped += 1;
      continue;
    }
    seen.add(href);
    const classified = classifyImportedLink(href);
    if (classified.kind === 'whatsapp' && !whatsapp) {
      whatsapp = classified.whatsapp;
      continue;
    }
    if (classified.kind === 'instagram' && !instagram) {
      instagram = classified.instagram;
      continue;
    }
    const title = sanitizeImportedText(entry.title, 160) || normalizedHost(new URL(href));
    links.push({ title, url: href });
  }
  if (links.length > LINKTREE_MAX_ITEMS) skipped += links.length - LINKTREE_MAX_ITEMS;
  return {
    username,
    name,
    description,
    photoUrl,
    whatsapp,
    instagram,
    links: links.slice(0, LINKTREE_MAX_ITEMS),
    skipped
  };
}

export function suggestDemoSlug(username) {
  const base = username.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  if (isValidSlug(base)) return base;
  const prefixed = `demo-${base}`.slice(0, 40).replace(/-+$/, '');
  return isValidSlug(prefixed) ? prefixed : 'demo-linktree';
}

export function buildLinktreeDemoDraft(profile, { slug, importedAt = new Date().toISOString() } = {}) {
  const resolvedSlug = slug === undefined || slug === null || slug === '' ? suggestDemoSlug(profile.username) : slug;
  if (typeof resolvedSlug !== 'string' || !isValidSlug(resolvedSlug)) {
    throw fail(422, 'INVALID_SLUG', 'Endereço inválido. Use entre 3 e 40 caracteres minúsculos (a-z, 0-9 e hifens), sem nomes reservados.');
  }
  const content = createInitialDraftContent({
    slug: resolvedSlug,
    name: profile.name,
    storefrontType: 'tech',
    template: 'quote-v1',
    catalogType: 'quote',
    ...(profile.whatsapp ? { whatsapp: profile.whatsapp } : {})
  });
  content.messages = { ...content.messages, heroTitle: profile.name };
  if (profile.description) content.messages.welcomeText = profile.description;
  if (profile.instagram) content.instagramUrl = instagramUrlFromHandle(profile.instagram);
  content.categories = profile.links.length ? [{
    id: 'links-linktree',
    name: 'Links',
    items: profile.links.map((link, index) => ({
      id: `link-${index + 1}`,
      name: link.title,
      url: link.url,
      active: true
    }))
  }] : [];
  content.demo = {
    source: 'linktree',
    username: profile.username,
    importedAt,
    ...(profile.photoUrl ? { photoUrl: profile.photoUrl } : {})
  };
  validateDraftContent(content);
  return {
    slug: resolvedSlug,
    name: profile.name,
    storefrontType: content.storefrontType,
    template: content.template,
    content
  };
}

function presentDemo(row, profile) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    demoExpiresAt: row.demoExpiresAt ?? row.demo_expires_at ?? null,
    published: false,
    ...(profile ? {
      extracted: {
        description: profile.description,
        photoUrl: profile.photoUrl,
        whatsapp: profile.whatsapp,
        instagram: profile.instagram,
        links: profile.links,
        skipped: profile.skipped
      }
    } : {})
  };
}

export async function importLinktreeDemo(payload, { repository, options, fetch: fetchImpl, timeoutMs, maxBytes }) {
  const username = validateLinktreeUsername(payload?.username);
  if (payload?.slug !== undefined && payload.slug !== '' && (typeof payload.slug !== 'string' || !isValidSlug(payload.slug))) {
    throw fail(422, 'INVALID_SLUG', 'Endereço inválido. Use entre 3 e 40 caracteres minúsculos (a-z, 0-9 e hifens), sem nomes reservados.');
  }
  const { html } = await fetchLinktreePage(username, { fetch: fetchImpl, timeoutMs, maxBytes });
  const profile = parseLinktreeHtml(html, username);
  const draft = buildLinktreeDemoDraft(profile, { slug: payload?.slug || undefined });
  const row = await repository.importLinktreeDemo({
    ...draft,
    username,
    summary: {
      username,
      slug: draft.slug,
      links: profile.links.length,
      whatsapp: Boolean(profile.whatsapp),
      instagram: Boolean(profile.instagram)
    }
  }, options);
  return presentDemo(row, profile);
}

export function matchLinktreeRoute(pathname) {
  if (/^\/api\/admin\/linktree-demos\/?$/.test(pathname)) return { admin: true, action: 'import' };
  const invite = pathname.match(/^\/api\/admin\/linktree-demos\/([^/]+)\/invite\/?$/);
  if (invite) return { admin: true, action: 'invite', siteId: invite[1] };
  if (/^\/api\/linktree-demos\/invitations\/?$/.test(pathname)) return { admin: false, action: 'invitations' };
  const accept = pathname.match(/^\/api\/linktree-demos\/([^/]+)\/accept\/?$/);
  if (accept) return { admin: false, action: 'accept', siteId: accept[1] };
  return null;
}

const ROUTE_METHODS = { import: 'POST', invite: 'POST', invitations: 'GET', accept: 'POST' };

export async function handleLinktreeRoute(route, method, payload, context) {
  if (ROUTE_METHODS[route.action] !== method) {
    throw fail(405, 'METHOD_NOT_ALLOWED', 'Método não permitido para demonstrações do Linktree.');
  }
  const { repository, options } = context;
  if (route.action === 'import') {
    return { status: 201, body: { demo: await importLinktreeDemo(payload, context) } };
  }
  if (route.action === 'invitations') {
    return { status: 200, body: { invitations: await repository.listLinktreeDemoInvitations(options) } };
  }
  if (!UUID_PATTERN.test(route.siteId)) {
    throw fail(404, 'LINKTREE_DEMO_NOT_FOUND', 'Demonstração não encontrada ou já entregue.');
  }
  if (route.action === 'invite') {
    const userId = payload?.userId;
    if (typeof userId !== 'string' || !UUID_PATTERN.test(userId)) {
      throw fail(422, 'INVALID_MEMBER', 'Informe o identificador da conta do dono (UUID), o mesmo usado na equipe da vitrine.');
    }
    const invited = await repository.inviteLinktreeDemoOwner(route.siteId, userId, options);
    if (!invited) throw fail(404, 'LINKTREE_DEMO_NOT_FOUND', 'Demonstração não encontrada, vencida ou já entregue.');
    return { status: 200, body: { invitation: invited } };
  }
  const accepted = await repository.acceptLinktreeDemo(route.siteId, options);
  if (!accepted) throw fail(404, 'LINKTREE_DEMO_NOT_FOUND', 'Convite não encontrado, vencido ou já aceito.');
  return { status: 200, body: { site: accepted } };
}

async function rpc(baseUrl, anonKey, fetchImpl, token, name, body) {
  return fetchImpl(`${baseUrl}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: anonKey,
      authorization: `Bearer ${token}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify(body)
  });
}

async function rpcError(response, fallback) {
  const error = await response.json().catch(() => null);
  if (error?.code === '23505') {
    return fail(409, 'SLUG_TAKEN', 'Já existe uma vitrine com esse endereço. Informe outro endereço para a demonstração.');
  }
  if (error?.code === '42501' || response.status === 403) {
    return fail(403, 'FORBIDDEN_PLATFORM_ADMIN', 'Acesso restrito aos operadores da plataforma.');
  }
  return new Error(fallback);
}

export function createLinktreeSupabaseRepository({ supabaseUrl, supabaseAnonKey, fetch: fetchImpl = globalThis.fetch }) {
  const baseUrl = supabaseUrl.replace(/\/+$/, '');
  return {
    async importLinktreeDemo(draft, { token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'import_linktree_demo', {
        target_slug: draft.slug,
        target_name: draft.name,
        target_storefront_type: draft.storefrontType,
        target_template: draft.template,
        target_content: draft.content,
        target_username: draft.username,
        target_summary: draft.summary
      });
      if (!response.ok) throw await rpcError(response, 'Falha ao criar a demonstração do Linktree.');
      const row = await response.json();
      return { id: row.id, slug: row.slug, name: row.name, demoExpiresAt: row.demo_expires_at };
    },
    async inviteLinktreeDemoOwner(siteId, userId, { token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'invite_linktree_demo_owner', {
        target_site_id: siteId, target_user_id: userId
      });
      if (!response.ok) throw await rpcError(response, 'Falha ao convidar o dono da demonstração.');
      const row = await response.json();
      return row ? { siteId: row.id, userId: row.invited_user_id, demoExpiresAt: row.demo_expires_at } : null;
    },
    async listLinktreeDemoInvitations({ token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'list_my_linktree_demo_invitations', {});
      if (!response.ok) throw await rpcError(response, 'Falha ao consultar convites de demonstração.');
      const rows = await response.json();
      return (Array.isArray(rows) ? rows : []).map(row => ({
        siteId: row.id, slug: row.slug, name: row.name, demoExpiresAt: row.demo_expires_at
      }));
    },
    async acceptLinktreeDemo(siteId, { token }) {
      const response = await rpc(baseUrl, supabaseAnonKey, fetchImpl, token, 'accept_linktree_demo', {
        target_site_id: siteId
      });
      if (!response.ok) throw await rpcError(response, 'Falha ao aceitar a demonstração.');
      const row = await response.json();
      return row ? { id: row.id, slug: row.slug, name: row.name } : null;
    }
  };
}

export function resolveLinktreeRepository(store, env = {}, fetchImpl) {
  if (typeof store?.importLinktreeDemo === 'function') return store;
  if (env.SUPABASE_URL && env.SUPABASE_ANON_KEY) {
    return createLinktreeSupabaseRepository({
      supabaseUrl: env.SUPABASE_URL, supabaseAnonKey: env.SUPABASE_ANON_KEY, fetch: fetchImpl ?? globalThis.fetch
    });
  }
  throw fail(503, 'LINKTREE_IMPORT_UNAVAILABLE', 'A importação do Linktree exige o banco configurado.');
}

export async function purgeExpiredLinktreeDemos(env = {}, fetchImpl = globalThis.fetch) {
  const token = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!env.SUPABASE_URL || !token) return null;
  const response = await fetchImpl(`${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/rpc/purge_expired_linktree_demos`, {
    method: 'POST',
    headers: { apikey: token, authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: '{}'
  });
  if (!response.ok) throw new Error('Falha ao apagar demonstrações vencidas.');
  return response.json();
}
