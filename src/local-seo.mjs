// SEO local e cartão de prévia da vitrine publicada.
// O HTML público é montado sem sessão, então o plano (`local_seo`, `custom_domain`)
// e o domínio ativo são decididos na publicação e gravados no snapshot (ADR 0008).
import { toOpeningHoursSpecification } from './business-hours.mjs';
import { validateCustomHostname } from './custom-domains.mjs';
import { hasPlanFeature } from './entitlements.mjs';
import { PortalValidationError } from './portal-validation.mjs';
import {
  AREA_SERVED_MAX,
  LOCAL_BUSINESS_TYPES,
  projectPublicLocalBusiness
} from '../web/assets/local-seo.mjs';

export * from '../web/assets/local-seo.mjs';

export const PUBLIC_SITE_ORIGIN = 'https://vitrine.inspira.dev.br';
export const DEFAULT_SHARE_IMAGE = `${PUBLIC_SITE_ORIGIN}/assets/brand/og-vitrine.png`;
export const DEFAULT_SHARE_DESCRIPTION = 'Vitrine oficial: faça seu pedido direto no WhatsApp.';

const TYPE_VALUES = new Set(LOCAL_BUSINESS_TYPES.map((entry) => entry.value));
const OWN_PATH = /^\/[a-z0-9][a-z0-9/_.-]*$/i;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function basicUrl(slug) {
  return `${PUBLIC_SITE_ORIGIN}/${slug}`;
}

/**
 * Endereço canônico de uma vitrine. Ponto único para og:url, `<link rel="canonical">`
 * e o `url` do JSON-LD.
 *
 * - `domains`: linhas de `custom_domains` da vitrine (snake_case ou camelCase).
 *   Vale o primeiro domínio com `status` e `ssl_status` ativos.
 * - `allowCustomDomain`: `false` quando o domínio não deve ser canônico (plano sem
 *   `custom_domain` ou assinatura suspensa, ADR 0007: "na suspensão, a vitrine volta
 *   ao endereço básico"). Quem muda o direito chama esta mesma função.
 *
 * Devolve `https://<domínio>/` ou o endereço básico `https://vitrine.inspira.dev.br/<slug>`.
 */
export function canonicalUrlFor({ slug, domains = [], allowCustomDomain = true } = {}) {
  if (allowCustomDomain && Array.isArray(domains)) {
    const active = domains.find((domain) =>
      domain?.status === 'active' && (domain.ssl_status ?? domain.sslStatus) === 'active');
    if (active) {
      try {
        return `https://${validateCustomHostname(active.hostname)}/`;
      } catch {
        // Hostname inválido no banco: fica o endereço básico.
      }
    }
  }
  return basicUrl(slug);
}

/** Opções de publicação derivadas do plano e dos domínios (entram em compilePublicStorefront). */
export function publicationSeoOptions({ slug, entitlements, domains = [] } = {}) {
  return {
    localSeo: hasPlanFeature(entitlements, 'local_seo'),
    canonicalUrl: canonicalUrlFor({
      slug,
      domains,
      allowCustomDomain: hasPlanFeature(entitlements, 'custom_domain')
    })
  };
}

/**
 * Campos públicos de SEO do snapshot: `canonicalUrl` só quando difere do endereço
 * básico e `localBusiness` só com o recurso `local_seo`.
 */
export function projectPublicSeo(content, slug, { localSeo = false, canonicalUrl } = {}) {
  const canonical = typeof canonicalUrl === 'string' && canonicalUrl !== basicUrl(slug) ? canonicalUrl : null;
  return {
    ...(canonical ? { canonicalUrl: canonical } : {}),
    ...projectPublicLocalBusiness(content, { enabled: localSeo === true })
  };
}

function leak(message) {
  return new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', message);
}

/** Confere `canonicalUrl` e `localBusiness` de um snapshot público. */
export function assertPublicSeo(menu) {
  if (menu.canonicalUrl !== undefined) {
    let expected = null;
    try {
      const url = new URL(menu.canonicalUrl);
      expected = `https://${validateCustomHostname(url.hostname)}/`;
    } catch {
      expected = null;
    }
    if (menu.canonicalUrl !== expected) throw leak('Endereço canônico inválido.');
  }
  if (menu.localBusiness !== undefined) {
    const block = menu.localBusiness;
    const keys = block && typeof block === 'object' && !Array.isArray(block) ? Object.keys(block) : null;
    if (
      !keys ||
      keys.some((key) => key !== 'type' && key !== 'areaServed') ||
      !TYPE_VALUES.has(block.type) ||
      (block.areaServed !== undefined &&
        (typeof block.areaServed !== 'string' || !block.areaServed || block.areaServed.length > AREA_SERVED_MAX || /[<>]/.test(block.areaServed)))
    ) {
      throw leak('Bloco localBusiness inválido.');
    }
  }
}

/** Endereço canônico gravado no snapshot (ou o básico). */
export function canonicalUrlOf(menu) {
  return typeof menu?.canonicalUrl === 'string' && menu.canonicalUrl ? menu.canonicalUrl : basicUrl(menu?.slug ?? '');
}

function absoluteImage(value) {
  if (typeof value !== 'string') return '';
  const src = value.trim();
  if (OWN_PATH.test(src)) return `${PUBLIC_SITE_ORIGIN}${src}`;
  try {
    return new URL(src).protocol === 'https:' ? src : '';
  } catch {
    return '';
  }
}

function heroImage(structure) {
  const home = structure?.pages?.find((page) => page?.slug === 'home');
  return home?.sections?.find((section) => section?.moduleCode === 'hero' && section.active !== false)?.config?.imageUrl;
}

/**
 * Imagem do cartão: capa (foto do hero) ou logo da vitrine, depois a foto do primeiro
 * item e, por fim, a capa geral `og-vitrine.png`. Sempre URL HTTPS absoluta.
 */
export function getOgImage(menu) {
  const candidates = [
    heroImage(menu?.structure),
    menu?.logoUrl,
    menu?.coverUrl,
    menu?.imageUrl,
    menu?.structure?.theme?.logoUrl,
    menu?.items?.find((item) => absoluteImage(item?.imageUrl))?.imageUrl
  ];
  for (const candidate of candidates) {
    const image = absoluteImage(candidate);
    if (image) return image;
  }
  return DEFAULT_SHARE_IMAGE;
}

/**
 * Metadados do cartão de prévia (Open Graph / Twitter Card).
 * Sem `item`, descreve a vitrine; com `item` (página do item), usa nome, descrição e
 * foto do item e `itemUrl` como endereço.
 */
export function shareMetaFor(menu, { item = null, itemUrl, canonicalUrl } = {}) {
  const name = String(menu?.name ?? '').trim() || 'Vitrine';
  const url = itemUrl ?? canonicalUrl ?? canonicalUrlOf(menu);
  const itemImage = item ? absoluteImage(item.imageUrl) : '';
  const image = itemImage || getOgImage(menu);
  const itemName = item ? String(item.name ?? '').trim() : '';
  return {
    type: 'website',
    siteName: 'Vitrine Inspira',
    title: itemName ? `${itemName} — ${name}` : `${name} — Vitrine`,
    description: (itemName && item.description) || menu?.messages?.welcomeText || DEFAULT_SHARE_DESCRIPTION,
    url,
    image,
    imageAlt: itemName ? `${itemName}, na vitrine de ${name}` : `Vitrine oficial de ${name}`,
    imageIsDefault: image === DEFAULT_SHARE_IMAGE,
    locale: 'pt_BR',
    twitterCard: 'summary_large_image'
  };
}

/** Tags do cartão e `<link rel="canonical">`, com todos os valores escapados. */
export function renderShareMetaTags(meta, indent = '  ') {
  const tags = [
    `<meta property="og:type" content="${escapeHtml(meta.type)}">`,
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}">`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}">`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}">`,
    `<meta property="og:url" content="${escapeHtml(meta.url)}">`,
    `<meta property="og:image" content="${escapeHtml(meta.image)}">`,
    ...(meta.imageIsDefault
      ? ['<meta property="og:image:width" content="1200">', '<meta property="og:image:height" content="630">']
      : []),
    `<meta property="og:image:alt" content="${escapeHtml(meta.imageAlt)}">`,
    `<meta property="og:locale" content="${escapeHtml(meta.locale)}">`,
    `<meta name="twitter:card" content="${escapeHtml(meta.twitterCard)}">`,
    `<link rel="canonical" href="${escapeHtml(meta.url)}">`
  ];
  return tags.join(`\n${indent}`);
}

function postalAddress(menu) {
  const address = menu.publicAddress;
  if (address) {
    return {
      '@type': 'PostalAddress',
      streetAddress: address.district ? `${address.street}, ${address.district}` : address.street,
      addressLocality: address.city,
      addressRegion: address.uf,
      ...(address.postalCode ? { postalCode: address.postalCode } : {}),
      addressCountry: 'BR'
    };
  }
  if (menu.locality?.city && menu.locality?.uf) {
    return {
      '@type': 'PostalAddress',
      addressLocality: menu.locality.city,
      addressRegion: menu.locality.uf,
      addressCountry: 'BR'
    };
  }
  return null;
}

/**
 * JSON-LD `LocalBusiness` (ou subtipo) montado só com campos do snapshot público.
 * Devolve `null` sem o bloco `localBusiness` (vitrine sem o recurso `local_seo`).
 * Com pedidos pela Mila não há telefone: o WhatsApp público é o da Mila, não o do negócio.
 */
export function buildLocalBusinessJsonLd(menu, { canonicalUrl } = {}) {
  if (!menu?.localBusiness) return null;
  const url = canonicalUrl ?? canonicalUrlOf(menu);
  const description = menu.messages?.welcomeText;
  const address = postalAddress(menu);
  const hours = toOpeningHoursSpecification(menu.businessHours);
  const phone = !menu.orderRelay && /^\d{10,15}$/.test(String(menu.whatsapp ?? '')) ? `+${menu.whatsapp}` : '';
  return {
    '@context': 'https://schema.org',
    '@type': menu.localBusiness.type,
    '@id': `${url}#negocio`,
    name: String(menu.name ?? '').trim() || 'Vitrine',
    url,
    image: getOgImage(menu),
    ...(description ? { description } : {}),
    ...(phone ? { telephone: phone } : {}),
    ...(address ? { address } : {}),
    ...(menu.localBusiness.areaServed ? { areaServed: menu.localBusiness.areaServed } : {}),
    ...(hours.length ? { openingHoursSpecification: hours } : {})
  };
}

/**
 * JSON seguro dentro de `<script>`: `<`, `>` e `&` viram escapes Unicode, então um
 * nome com `</script>` não fecha a tag. U+2028/U+2029 também são escapados.
 */
export function serializeJsonLd(data) {
  return JSON.stringify(data).replace(/[<>&\u2028\u2029]/g, (char) =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

/** `<script type="application/ld+json">` da vitrine, ou string vazia. Não é executável (CSP inalterada). */
export function renderLocalBusinessJsonLd(menu, options = {}) {
  const data = buildLocalBusinessJsonLd(menu, options);
  return data ? `<script type="application/ld+json">${serializeJsonLd(data)}</script>` : '';
}
