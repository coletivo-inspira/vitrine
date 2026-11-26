// Endereço público da vitrine, resolvido no momento do envio (FR-007). Prioridade: domínio
// próprio ativo com SSL e com o recurso `custom_domain` → endereço padrão. Subdomínio
// `inspira_subdomain` ainda não existe no produto; quando existir, entra entre os dois.
import { canonicalUrlFor } from '../local-seo.mjs';

export const DEFAULT_PUBLIC_ORIGIN = 'https://vitrine.inspira.dev.br';
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function publicOriginFrom(env = {}) {
  const raw = String(env.PUBLIC_SITE_ORIGIN ?? DEFAULT_PUBLIC_ORIGIN).replace(/\/+$/, '');
  try {
    const parsed = new URL(raw);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password && parsed.pathname === '/'
      ? parsed.origin
      : DEFAULT_PUBLIC_ORIGIN;
  } catch {
    return DEFAULT_PUBLIC_ORIGIN;
  }
}

/**
 * `site` vem de `private.auto_reply_site_state`. Devolve `{ url }` ou `{ reason }` quando
 * não há endereço que possa ir ao consumidor.
 */
export function resolveAutoReplyPublicUrl(site, env = {}) {
  if (!site || typeof site !== 'object') return { reason: 'site_not_found' };
  if (site.demo) return { reason: 'site_demo' };
  if (site.archived) return { reason: 'site_archived' };
  if (site.paused) return { reason: 'site_paused' };
  if (!site.published) return { reason: 'site_not_published' };
  if (typeof site.slug !== 'string' || !SLUG.test(site.slug)) return { reason: 'public_url_invalid' };
  const origin = publicOriginFrom(env);
  const canonical = canonicalUrlFor({
    slug: site.slug,
    domains: Array.isArray(site.domains) ? site.domains : [],
    allowCustomDomain: site.customDomainAllowed === true
  });
  const url = canonical.startsWith(`${DEFAULT_PUBLIC_ORIGIN}/`)
    ? `${origin}/${site.slug}`
    : canonical.replace(/\/$/, '');
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
      return { reason: 'public_url_invalid' };
    }
  } catch {
    return { reason: 'public_url_invalid' };
  }
  return { url };
}
