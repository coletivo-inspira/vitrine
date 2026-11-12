import { StorefrontRenderer } from '../portal/storefront-renderer.js';

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

export function resolveStorefrontSlug(pathname = window.location.pathname, search = window.location.search) {
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

async function bootStorefront() {
  if (typeof document === 'undefined') return;

  const slug = resolveStorefrontSlug();
  const statusBanner = document.getElementById('storefront-status');
  const nameHeading = document.getElementById('storefront-name');
  const pageTitle = document.getElementById('storefront-page-title');
  const slugPill = document.getElementById('storefront-slug-pill');
  const subtitlePara = document.getElementById('storefront-subtitle');
  const categoryNav = document.getElementById('category-nav');
  const catalogContainer = document.getElementById('storefront-catalog');
  const heroSec = document.querySelector('.storefront-hero');

  // Immediately resolve the storefront slug and display in the pill (Fix AUD-009)
  if (slugPill) {
    slugPill.textContent = `/${slug}`;
  }

  try {
    const response = await fetch(`/data/vitrines/${encodeURIComponent(slug)}/menu.json`, {
      headers: { accept: 'application/json' }
    });

    if (!response.ok) {
      if (nameHeading) nameHeading.textContent = 'Vitrine não encontrada';
      if (statusBanner) {
        statusBanner.textContent = 'Esta vitrine ainda não foi publicada ou o endereço está incorreto.';
        statusBanner.hidden = false;
      }
      return;
    }

    const menu = await response.json();

    // Fill Page elements
    if (pageTitle) {
      pageTitle.textContent = `${menu.businessName || menu.name} — Vitrine`;
    }
    if (nameHeading) {
      nameHeading.textContent = menu.messages?.heroTitle || menu.businessName || menu.name;
    }
    if (subtitlePara) {
      subtitlePara.textContent = menu.messages?.welcomeText || menu.welcomeText || 'Escolha seus itens abaixo e toque em Pedir no WhatsApp.';
    }
    if (statusBanner) {
      statusBanner.hidden = true;
    }

    // Populate category navigation chips
    const categories = menu.categories || [];
    if (categoryNav) {
      categoryNav.replaceChildren();
      categories.forEach(category => {
        if (category.items && category.items.length > 0) {
          const chip = document.createElement('a');
          chip.className = 'category-chip';
          chip.href = `#cat-${category.id}`;
          chip.textContent = category.name;
          categoryNav.appendChild(chip);
        }
      });
    }

    // Initialize the shared renderer
    const renderer = new StorefrontRenderer(catalogContainer, menu, {
      isPublicPage: true,
      onUpdate: (r) => {
        if (heroSec) {
          heroSec.hidden = r.stage !== 1;
        }
      }
    });
    renderer.render();

  } catch (err) {
    if (statusBanner) {
      statusBanner.textContent = 'Não foi possível carregar o cardápio neste momento.';
      statusBanner.hidden = false;
    }
  }
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootStorefront);
  } else {
    bootStorefront();
  }
}
