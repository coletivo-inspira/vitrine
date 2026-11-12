import { StorefrontRenderer, slugifyCategoryId } from '../assets/storefront-renderer.mjs';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_PATHS = new Set([
  'admin',
  'api',
  'auth',
  'app',
  'www',
  'portal',
  'assets',
  'data',
  'login',
  'logout',
  'vitrine'
]);

export function formatPriceCentsBRL(priceCents) {
  if (!Number.isSafeInteger(priceCents) || priceCents < 0) {
    return 'R$ 0,00';
  }
  const reais = Math.floor(priceCents / 100);
  const centavos = String(priceCents % 100).padStart(2, '0');
  return `R$ ${reais.toLocaleString('pt-BR')},${centavos}`;
}

export function resolveStorefrontSlug(
  pathname = globalThis.location?.pathname ?? '/',
  search = globalThis.location?.search ?? ''
) {
  const params = new URLSearchParams(search || '');
  const querySlug = params.get('slug')?.trim().toLowerCase();
  if (querySlug && SLUG_PATTERN.test(querySlug) && !RESERVED_PATHS.has(querySlug)) {
    return querySlug;
  }

  const segments = String(pathname || '/')
    .split('/')
    .map((part) => part.trim().toLowerCase())
    .filter(Boolean);

  if (segments.length > 0) {
    const first = segments[0].replace(/\.html$/, '');
    if (SLUG_PATTERN.test(first) && !RESERVED_PATHS.has(first)) {
      return first;
    }
  }

  return 'loja1';
}

export function normalizeStorefrontCategories(menu) {
  if (Array.isArray(menu?.categories) && menu.categories.length > 0) {
    return menu.categories.filter(
      (cat) => cat && typeof cat === 'object' && Array.isArray(cat.items) && cat.items.length > 0
    );
  }
  if (Array.isArray(menu?.items) && menu.items.length > 0) {
    return [
      {
        id: 'catalogo',
        name: 'Catálogo',
        items: menu.items
      }
    ];
  }
  return [];
}

function resolveCatalogTagLabel(catalogType) {
  if (catalogType === 'booking') return 'Agendamento Online';
  if (catalogType === 'quote') return 'Solicitação de Orçamento';
  return 'Cardápio Digital';
}

export async function bootStorefront(deps = {}) {
  const doc = deps.document ?? globalThis.document;
  if (!doc) return null;

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const slug =
    deps.slug ??
    resolveStorefrontSlug(deps.pathname ?? globalThis.location?.pathname, deps.search ?? globalThis.location?.search);

  const statusBanner = doc.getElementById('storefront-status');
  const nameHeading = doc.getElementById('storefront-name');
  const pageTitle = doc.getElementById('storefront-page-title');
  const slugPill = doc.getElementById('storefront-slug-pill');
  const templateTag = doc.querySelector('.storefront-template-tag');
  const subtitlePara = doc.getElementById('storefront-subtitle');
  const categoryNav = doc.getElementById('category-nav');
  const catalogContainer = doc.getElementById('storefront-catalog');
  const heroSec = doc.querySelector('.storefront-hero');

  if (slugPill) {
    slugPill.textContent = `/${slug}`;
  }

  try {
    const response = await fetchImpl(`/data/vitrines/${encodeURIComponent(slug)}/menu.json`, {
      headers: { accept: 'application/json' }
    });

    if (!response || !response.ok) {
      if (nameHeading) nameHeading.textContent = 'Vitrine não encontrada';
      if (statusBanner) {
        statusBanner.textContent =
          'Esta vitrine ainda não foi publicada ou o endereço está incorreto.';
        statusBanner.hidden = false;
      }
      return null;
    }

    const menu = await response.json();
    const displayName = menu.messages?.heroTitle || menu.businessName || menu.name || 'Vitrine';
    const tagLabel = resolveCatalogTagLabel(menu.catalogType);

    if (pageTitle) {
      pageTitle.textContent = `${displayName} — ${tagLabel}`;
    }
    if (templateTag) {
      templateTag.textContent = tagLabel;
    }
    if (nameHeading) {
      nameHeading.textContent = displayName;
    }
    if (subtitlePara) {
      subtitlePara.textContent =
        menu.messages?.welcomeText ||
        menu.welcomeText ||
        'Escolha seus itens abaixo, preencha os dados solicitados e envie pelo WhatsApp.';
    }
    if (statusBanner) {
      statusBanner.hidden = true;
    }

    const categories = normalizeStorefrontCategories(menu);
    if (categoryNav) {
      categoryNav.replaceChildren();
      categories.forEach((category, idx) => {
        const catId = category.id
          ? slugifyCategoryId(String(category.id), idx)
          : slugifyCategoryId(category.name, idx);
        const chip = doc.createElement('a');
        chip.className = 'category-chip';
        chip.href = `#cat-${catId}`;
        chip.textContent = category.name;
        categoryNav.appendChild(chip);
      });
    }

    const renderer = new StorefrontRenderer(catalogContainer, menu, {
      isPublicPage: true,
      targetWhatsapp: menu.whatsapp,
      onUpdate: (r) => {
        if (heroSec) {
          heroSec.hidden = r.stage !== 1;
        }
      }
    });
    renderer.render();
    return renderer;
  } catch {
    if (statusBanner) {
      statusBanner.textContent = 'Não foi possível carregar o cardápio neste momento.';
      statusBanner.hidden = false;
    }
    return null;
  }
}

if (typeof document !== 'undefined' && !globalThis.__VITRINE_DISABLE_AUTOBOOT__) {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => bootStorefront());
  } else {
    bootStorefront();
  }
}
