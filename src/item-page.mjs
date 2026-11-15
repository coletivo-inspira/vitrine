// Página própria do item: `/<endereço>/item/<item>` (e `/item/<item>` no domínio próprio).
// O HTML parte do mesmo documento da vitrine (cabeçalho, gaveta, rodapé, tema e
// cartão de prévia de `local-seo.mjs`) e troca só o `<main>` e os metadados.
import { whatsappLink } from './public-menu.mjs';
import { canonicalUrlOf, renderShareMetaTags, shareMetaFor } from './local-seo.mjs';
import { renderFaqBlock } from '../web/assets/faq-block.mjs';
import { PortalValidationError, validateSafePublicHttpsUrl } from './portal-validation.mjs';
import {
  ITEM_PAGE_FIELD_KEYS,
  ITEM_PAGE_LIMITS,
  assignItemSlugs,
  itemPagePath,
  normalizeItemPageFields,
  splitParagraphs
} from '../web/assets/item-page-fields.mjs';
import { NOTIFY_BUTTON_LABEL, buildNotifyHref, isItemSoon, soonBadgeText } from '../web/assets/item-availability.mjs';
import { PAYMENT_LINK_ICON, PAYMENT_LINK_NOTICE, publicPaymentLink } from '../web/assets/payment-link.mjs';

/** ADR 0009: o snapshot publicado tem no máximo 256 KiB. */
export const MAX_PUBLIC_MANIFEST_BYTES = 256 * 1024;
export const RELATED_ITEMS_LIMIT = 3;

const ITEM_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ITEM_PAGE_PATH = /^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/item\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
const OWN_PATH = /^\/[a-z0-9][a-z0-9/_.-]*$/i;
const PHOTO_WIDTH = 800;
const PHOTO_HEIGHT = 600;
const utf8Encoder = new TextEncoder();

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(cents) {
  const value = Number.isSafeInteger(cents) && cents > 0 ? cents : 0;
  return `R$ ${Math.floor(value / 100).toLocaleString('pt-BR')},${String(value % 100).padStart(2, '0')}`;
}

function leak(message) {
  return new PortalValidationError(422, 'PRIVATE_FIELD_LEAKAGE', message);
}

/** Campos da página do item que entram no snapshot (publicação: formato estrito). */
export function projectItemPageFields(rawItem) {
  const { fields, error } = normalizeItemPageFields(rawItem, { strict: true });
  if (error) throw new PortalValidationError(422, error.code, error.message);
  if (fields.gallery) fields.gallery = fields.gallery.map((url) => validateSafePublicHttpsUrl(url, 422));
  return fields;
}

/** Confere no artefato público o `slug` e os campos da página do item. */
export function assertPublicItemPageFields(item) {
  if (item.slug !== undefined && (typeof item.slug !== 'string' || !ITEM_SLUG_PATTERN.test(item.slug) || item.slug.length > 64)) {
    throw leak('Endereço do item inválido.');
  }
  const present = ITEM_PAGE_FIELD_KEYS.filter((key) => item[key] !== undefined);
  if (!present.length) return;
  const picked = Object.fromEntries(present.map((key) => [key, item[key]]));
  const { fields, error } = normalizeItemPageFields(picked, { strict: true });
  if (error || JSON.stringify(fields) !== JSON.stringify(picked)) {
    throw leak('Campos da página do item inválidos.');
  }
  for (const url of fields.gallery ?? []) {
    if (!/^https:\/\//.test(url)) throw leak('Galeria do item com endereço inválido.');
  }
}

/**
 * Recusa snapshots acima de 256 KiB (ADR 0009) e diz quantos itens com descrição
 * longa cabem, pela média das descrições longas desta vitrine.
 */
export function assertPublicManifestSize(menu, json = JSON.stringify(menu)) {
  const bytes = utf8Encoder.encode(json).byteLength;
  if (bytes <= MAX_PUBLIC_MANIFEST_BYTES) return bytes;
  const longBytes = (menu.items ?? [])
    .filter((item) => item.longDescription)
    .map((item) => utf8Encoder.encode(JSON.stringify(item.longDescription)).byteLength);
  // Cada item aparece em `items` e na sua categoria, então a descrição longa conta duas vezes.
  const copies = Array.isArray(menu.categories) && menu.categories.length ? 2 : 1;
  const totalLong = longBytes.reduce((sum, value) => sum + value, 0) * copies;
  const average = longBytes.length ? (totalLong / longBytes.length) : 0;
  const room = MAX_PUBLIC_MANIFEST_BYTES - (bytes - totalLong);
  const fits = average > 0 ? Math.max(0, Math.floor(room / average)) : 0;
  const kib = (value) => Math.ceil(value / 1024).toLocaleString('pt-BR');
  const hint = longBytes.length
    ? ` Com descrições longas do tamanho das atuais, cabem ${fits} ${fits === 1 ? 'item' : 'itens'} com descrição longa (hoje são ${longBytes.length}).`
    : '';
  throw new PortalValidationError(
    422,
    'PUBLIC_MANIFEST_TOO_LARGE',
    `A vitrine publicada ficaria com ${kib(bytes)} KiB, acima do limite de 256 KiB.${hint} Encurte descrições longas, perguntas frequentes ou detalhes e publique de novo.`
  );
}

/** `{ slug, itemSlug }` de `/<endereço>/item/<item>`, ou `null`. */
export function matchItemPagePath(pathname) {
  const match = String(pathname ?? '').match(ITEM_PAGE_PATH);
  return match ? { slug: match[1], itemSlug: match[2] } : null;
}

/** Caminho interno de um pedido no domínio próprio: `/` e `/item/<item>` ganham o endereço. */
export function customDomainPath(slug, pathname) {
  if (pathname === '/') return `/${slug}`;
  return /^\/item\/[a-z0-9-]+\/?$/.test(pathname) ? `/${slug}${pathname}` : pathname;
}

/** Caminhos públicos aceitos no domínio próprio da vitrine `slug`. */
export function customDomainPublicPaths(slug, path) {
  const paths = new Set([`/${slug}`, `/${slug}/`, `/data/vitrines/${slug}/menu.json`]);
  if (matchItemPagePath(path)?.slug === slug) paths.add(path);
  return paths;
}

/** Item publicado pelo endereço (rota) ou pelo identificador. */
export function findPublishedItem(menu, ref, { bySlugOnly = false } = {}) {
  const items = Array.isArray(menu?.items) ? menu.items : [];
  const slugs = assignItemSlugs(items);
  const key = String(ref ?? '');
  const bySlug = items.find((item) => slugs.get(String(item.id)) === key);
  if (bySlug || bySlugOnly) return bySlug ? { item: bySlug, slugs } : null;
  const byId = items.find((item) => String(item.id) === key);
  return byId ? { item: byId, slugs } : null;
}

/**
 * Snapshot reduzido para montar só a moldura da página (cabeçalho, rodapé, metadados):
 * o `<main>` da vitrine é descartado, e a grade inteira custaria CPU à toa (ADR 0008).
 * Mantém um item de lance, doação ou troca para o rodapé decidir o link "por cidade".
 */
export function itemPageShellMenu(menu, item) {
  const special = (menu.items ?? []).find((entry) => ['offer', 'donation', 'trade'].includes(entry.priceMode));
  return { ...menu, items: special && special !== item ? [item, special] : [item], categories: [] };
}

function itemCategory(menu, item) {
  return (menu.categories ?? []).find((category) => (category.items ?? []).some((entry) => entry.id === item.id)) ?? null;
}

function joinUrl(base, path) {
  return base.endsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

function safeImage(value) {
  if (typeof value !== 'string') return '';
  const src = value.trim();
  if (OWN_PATH.test(src)) return src;
  try {
    return new URL(src).protocol === 'https:' ? src : '';
  } catch {
    return '';
  }
}

function priceMode(menu, item) {
  if (menu.catalogType === 'booking') return 'fixed';
  return ['offer', 'donation', 'trade', 'quota'].includes(item.priceMode) ? item.priceMode : 'fixed';
}

const MODE_LABELS = Object.freeze({ offer: 'Lance', donation: 'Doação', trade: 'Troca', quota: 'Cotas' });

function renderTrail(menu, category, item, home) {
  const crumbs = [`<li><a href="${escapeHtml(home)}">${escapeHtml(menu.name)}</a></li>`];
  if (category) {
    crumbs.push(`<li><a href="${escapeHtml(`${home}#cat-${category.id}`)}">${escapeHtml(category.name)}</a></li>`);
  }
  crumbs.push(`<li aria-current="page">${escapeHtml(item.name)}</li>`);
  return `<nav class="item-page-trail" aria-label="Trilha"><ol>${crumbs.join('')}</ol></nav>`;
}

function renderGallery(menu, item) {
  if (menu.components?.photo === false) return '';
  const photos = [item.imageUrl, ...(item.gallery ?? [])].map(safeImage).filter(Boolean);
  if (!photos.length) return '';
  const total = photos.length;
  const alt = (index) => (total > 1 ? `${item.name}, foto ${index + 1} de ${total}` : item.name);
  const thumbs = total > 1
    ? `<ul class="item-page-thumbs" aria-label="Fotos do item">${photos.map((src, index) =>
      `<li><a class="item-page-thumb" href="${escapeHtml(src)}" data-photo-index="${index}" data-photo-alt="${escapeHtml(alt(index))}" aria-label="Ver foto ${index + 1} de ${total}"${index === 0 ? ' aria-current="true"' : ''}><img src="${escapeHtml(src)}" alt="" width="96" height="72" loading="lazy" decoding="async"></a></li>`
    ).join('')}</ul>`
    : '';
  return `<div class="item-page-gallery">
        <figure class="item-page-figure"><img class="item-page-photo" src="${escapeHtml(photos[0])}" alt="${escapeHtml(alt(0))}" width="${PHOTO_WIDTH}" height="${PHOTO_HEIGHT}" fetchpriority="high" decoding="async"></figure>
        ${thumbs}
      </div>`;
}

function renderPriceLine(menu, item, mode) {
  const price = Number.isSafeInteger(item.priceCents) ? item.priceCents : 0;
  if (mode === 'offer') {
    return `<p class="item-page-price">Faça sua oferta${price > 0 ? ` <span class="item-page-price-note">a partir de ${escapeHtml(formatPrice(price))}</span>` : ''}</p>`;
  }
  if (mode === 'donation') {
    return `<p class="item-page-price">Doação</p>${item.conditions ? `<p class="item-page-note">Condições: ${escapeHtml(item.conditions)}</p>` : ''}`;
  }
  if (mode === 'trade') {
    return `<p class="item-page-price">Troca</p>${item.tradeFor ? `<p class="item-page-note">Aceito em troca: ${escapeHtml(item.tradeFor)}</p>` : ''}`;
  }
  if (mode === 'quota') {
    return `<p class="item-page-price">${escapeHtml(formatPrice(price))} <span class="item-page-price-note">por cota</span></p>${item.quotaReward ? `<p class="item-page-note">Cada cota garante: ${escapeHtml(item.quotaReward)}</p>` : ''}`;
  }
  if (menu.components?.price !== false && (menu.catalogType !== 'quote' || price > 0)) {
    return `<p class="item-page-price">${escapeHtml(formatPrice(price))}</p>`;
  }
  return menu.catalogType === 'quote' ? '<p class="item-page-price">Sob consulta</p>' : '';
}

function renderDetails(menu, item) {
  const rows = [...(item.details ?? [])];
  if (menu.components?.durationMinutes && item.durationMinutes > 0) {
    rows.unshift({ label: 'Duração', value: `${item.durationMinutes} min` });
  }
  if (!rows.length) return '';
  return `<dl class="item-page-details">${rows.map((row) =>
    `<div><dt>${escapeHtml(row.label)}</dt><dd>${escapeHtml(row.value)}</dd></div>`
  ).join('')}</dl>`;
}

/**
 * Ponto de extensão da área de seleção. Sem JavaScript fica o link do WhatsApp; com
 * JavaScript, `vitrine.js` desenha aqui o mesmo controle do cartão. O item "Em breve"
 * (#133) não tem seleção: só o "Avise-me pelo WhatsApp".
 */
function renderSelectArea(menu, item) {
  if (isItemSoon(item)) {
    const href = buildNotifyHref(menu, item);
    const link = href
      ? `<a class="whatsapp-order-button sf-notify-button" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" data-notify-item="${escapeHtml(item.id)}">${NOTIFY_BUTTON_LABEL}</a>`
      : '';
    return `<div id="storefront-catalog" class="item-page-select" data-item-select>
          <div class="sf-soon-footer">
            <p class="sf-soon-note">Ainda não dá para escolher este item. Peça para ser avisado(a) quando estiver disponível.</p>
            ${link}
          </div>
        </div>`;
  }
  let fallback = '';
  try {
    fallback = `<a class="whatsapp-order-button" href="${escapeHtml(whatsappLink(menu, item.id))}" target="_blank" rel="noopener noreferrer">Pedir no WhatsApp</a>`;
  } catch {
    fallback = '';
  }
  return `<div id="storefront-catalog" class="item-page-select" data-item-select>${fallback}</div>`;
}

/**
 * Ponto de extensão abaixo da seleção: link de pagamento do próprio negócio (#134),
 * como ação secundária. O WhatsApp continua sendo a ação principal.
 */
function renderPurchaseExtras(menu, item, mode) {
  const link = publicPaymentLink(item, mode);
  if (!link) return '';
  return `<div class="sf-payment-link-box item-page-payment">
          <a class="sf-secondary-button sf-payment-link" href="${escapeHtml(link.url)}" target="_blank" rel="noopener noreferrer" data-payment-link aria-describedby="item-page-payment-note">${escapeHtml(link.label)}${PAYMENT_LINK_ICON}<span class="sf-visually-hidden"> (abre em nova aba)</span></a>
          <p class="sf-payment-note" id="item-page-payment-note">${escapeHtml(PAYMENT_LINK_NOTICE)}</p>
        </div>`;
}

function renderShare(shareUrl, title) {
  return `<div class="item-page-share">
          <button class="sf-secondary-button item-page-share-button" type="button" data-share-url="${escapeHtml(shareUrl)}" data-share-title="${escapeHtml(title)}" hidden>
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L7.5 7.5M12 3l4.5 4.5M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>
            Compartilhar
          </button>
          <p class="item-page-share-status" role="status" aria-live="polite"></p>
        </div>`;
}

function renderLongDescription(item) {
  const paragraphs = splitParagraphs(item.longDescription);
  if (!paragraphs.length) return '';
  return `<section class="item-page-section" aria-labelledby="item-page-sobre">
      <h2 id="item-page-sobre">Sobre este item</h2>
      <div class="item-page-prose">${paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}</div>
    </section>`;
}

// FAQ mínima e isolada: trocar pelo componente visual único de perguntas frequentes da #132.
function renderItemFaq(faq) {
  if (!faq?.length) return '';
  return renderFaqBlock({ items: faq.slice(0, ITEM_PAGE_LIMITS.faq) }, {
    id: 'item-page-perguntas',
    className: 'item-page-section item-page-faq'
  });
}

function relatedPriceText(menu, item) {
  if (isItemSoon(item)) return soonBadgeText(item);
  const mode = priceMode(menu, item);
  if (mode !== 'fixed') return MODE_LABELS[mode];
  if (menu.components?.price === false || (menu.catalogType === 'quote' && !(item.priceCents > 0))) return '';
  return formatPrice(item.priceCents);
}

function renderRelated(menu, category, item, slugs, basePath) {
  const related = (category?.items ?? []).filter((entry) => entry.id !== item.id).slice(0, RELATED_ITEMS_LIMIT);
  if (!related.length) return '';
  const showPhotos = menu.components?.photo !== false;
  return `<section class="item-page-section item-page-related" aria-labelledby="item-page-relacionados">
      <h2 id="item-page-relacionados">Veja também</h2>
      <ul class="item-page-related-list">${related.map((entry) => {
    const photo = showPhotos ? safeImage(entry.imageUrl) : '';
    const price = relatedPriceText(menu, entry);
    return `<li><a class="item-page-related-card" href="${escapeHtml(itemPagePath(basePath, slugs.get(String(entry.id))))}">${photo
      ? `<img src="${escapeHtml(photo)}" alt="" width="320" height="240" loading="lazy" decoding="async">` : ''}<span class="item-page-related-name">${escapeHtml(entry.name)}</span>${price
      ? `<span class="item-page-related-price">${escapeHtml(price)}</span>` : ''}</a></li>`;
  }).join('')}</ul>
    </section>`;
}

function rewriteLocalAnchors(block, home) {
  return block.replace(/href="#(?!storefront-catalog")([^"]*)"/g, (_, anchor) =>
    `href="${escapeHtml(anchor === 'vitrine-principal' ? home : `${home}#${anchor}`)}"`);
}

/**
 * Documento da página do item a partir do HTML da vitrine. Devolve `null` quando o
 * item não existe no snapshot.
 * - `basePath`: `/<endereço>` (padrão) ou `''` no domínio próprio.
 * - `canonicalUrl`: endereço canônico da vitrine (como em `renderStorefrontHtml`).
 */
export function renderItemPageDocument(storefrontHtml, menu, itemRef, { basePath, canonicalUrl, bySlugOnly = false } = {}) {
  const found = findPublishedItem(menu, itemRef, { bySlugOnly });
  if (!found) return null;
  const { item, slugs } = found;
  const base = basePath ?? `/${menu.slug}`;
  const home = base || '/';
  const itemSlug = slugs.get(String(item.id));
  const itemUrl = joinUrl(canonicalUrl ?? canonicalUrlOf(menu), `item/${itemSlug}`);
  const share = shareMetaFor(menu, { item, itemUrl });
  const category = itemCategory(menu, item);
  const mode = priceMode(menu, item);
  const gallery = renderGallery(menu, item);
  const lead = menu.components?.description !== false && item.description
    ? `<p class="item-page-lead">${escapeHtml(item.description)}</p>` : '';

  const main = `<main id="vitrine-principal" class="wrap storefront-main item-page-main">
    <div id="storefront-status" class="storefront-status" role="status" aria-live="polite" hidden></div>
    ${renderTrail(menu, category, item, home)}
    <article class="item-page${gallery ? ' has-gallery' : ''}" data-item-id="${escapeHtml(item.id)}">
      ${gallery}
      <div class="item-page-summary">
        ${mode !== 'fixed' || isItemSoon(item) ? `<p class="item-page-badges">${mode !== 'fixed' ? `<span class="sf-mode-badge sf-mode-${mode} item-page-mode">${MODE_LABELS[mode]}</span>` : ''}${isItemSoon(item) ? `<span class="sf-soon-badge">${escapeHtml(soonBadgeText(item))}</span>` : ''}</p>` : ''}
        <h1 class="item-page-title">${escapeHtml(item.name)}</h1>
        ${renderPriceLine(menu, item, mode)}
        ${lead}
        ${renderDetails(menu, item)}
        ${renderSelectArea(menu, item)}
        ${renderPurchaseExtras(menu, item, mode)}
        ${renderShare(itemUrl, share.title)}
      </div>
    </article>
    ${renderLongDescription(item)}
    ${renderItemFaq(item.faq)}
    ${renderRelated(menu, category, item, slugs, base)}
  </main>`;

  return storefrontHtml
    .replace(/<meta name="description" content="[^"]*">/, () => `<meta name="description" content="${escapeHtml(share.description)}">`)
    .replace(/<title id="storefront-page-title">[\s\S]*?<\/title>/, () => `<title>${escapeHtml(share.title)}</title>`)
    .replace(/<meta property="og:type"[\s\S]*?<link rel="canonical"[^>]*>/, () => renderShareMetaTags(share))
    .replace(/<body data-storefront-slug="([^"]*)"/, (match) => `${match} data-storefront-item="${escapeHtml(item.id)}"`)
    .replace('>Pular para os itens<', '>Pular para o conteúdo<')
    .replace(/<header class="storefront-topbar">[\s\S]*?<\/header>/, (header) => rewriteLocalAnchors(header, home))
    .replace(/<footer class="storefront-footer"[^>]*>[\s\S]*?<\/footer>/, (footer) => rewriteLocalAnchors(footer, home))
    .replace(/<main id="vitrine-principal"[\s\S]*<\/main>/, () => main);
}

/** Imagens externas da página do item (para escolher a CSP com o armazenamento). */
export function itemPageUsesStorageImages(menu, itemRef) {
  const found = findPublishedItem(menu, itemRef);
  if (!found) return false;
  const category = itemCategory(menu, found.item);
  return [found.item, ...(category?.items ?? [])].some((entry) =>
    [entry.imageUrl, ...(entry.gallery ?? [])].some((src) => typeof src === 'string' && /^https:/.test(src)));
}
