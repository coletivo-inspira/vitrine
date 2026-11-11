import { whatsappLink } from '../assets/public-menu.mjs';

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

export function normalizeStorefrontCategories(menu) {
  if (Array.isArray(menu?.categories) && menu.categories.length > 0) {
    return menu.categories.filter(
      (cat) => cat && typeof cat === 'object' && Array.isArray(cat.items) && cat.items.length > 0
    );
  }
  if (Array.isArray(menu?.items) && menu.items.length > 0) {
    return [
      {
        id: 'cardapio',
        name: 'Cardápio',
        items: menu.items
      }
    ];
  }
  return [];
}

function renderStorefrontDOM(menu) {
  const pageTitle = document.getElementById('storefront-page-title');
  const slugPill = document.getElementById('storefront-slug-pill');
  const nameHeading = document.getElementById('storefront-name');
  const categoryNav = document.getElementById('category-nav');
  const catalogContainer = document.getElementById('storefront-catalog');
  const statusBanner = document.getElementById('storefront-status');

  if (pageTitle) {
    pageTitle.textContent = `${menu.name} — Cardápio Digital`;
  }
  if (slugPill) {
    slugPill.textContent = `/${menu.slug}`;
  }
  if (nameHeading) {
    nameHeading.textContent = menu.name;
  }
  if (statusBanner) {
    statusBanner.hidden = true;
  }

  const categories = normalizeStorefrontCategories(menu);
  if (categoryNav) {
    categoryNav.replaceChildren();
    for (const category of categories) {
      const chip = document.createElement('a');
      chip.className = 'category-chip';
      chip.href = `#cat-${category.id}`;
      chip.textContent = category.name;
      categoryNav.appendChild(chip);
    }
  }

  if (!catalogContainer) return;
  catalogContainer.replaceChildren();

  for (const category of categories) {
    const section = document.createElement('section');
    section.className = 'menu-category';
    section.id = `cat-${category.id}`;

    const header = document.createElement('div');
    header.className = 'menu-category-header';

    const h2 = document.createElement('h2');
    h2.className = 'menu-category-title';
    h2.textContent = category.name;

    const countSpan = document.createElement('span');
    countSpan.className = 'menu-category-count';
    countSpan.textContent =
      category.items.length === 1 ? '1 opção' : `${category.items.length} opções`;

    header.appendChild(h2);
    header.appendChild(countSpan);
    section.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'menu-items-grid';

    for (const item of category.items) {
      const card = document.createElement('article');
      card.className = 'menu-item-card';
      card.dataset.itemId = item.id;

      const body = document.createElement('div');
      body.className = 'menu-item-body';

      const title = document.createElement('h3');
      title.className = 'menu-item-title';
      title.textContent = item.name;
      body.appendChild(title);

      if (typeof item.description === 'string' && item.description.trim()) {
        const desc = document.createElement('p');
        desc.className = 'menu-item-description';
        desc.textContent = item.description.trim();
        body.appendChild(desc);
      }

      const footer = document.createElement('div');
      footer.className = 'menu-item-footer';

      const price = document.createElement('span');
      price.className = 'menu-item-price';
      price.textContent = formatPriceCentsBRL(item.priceCents);

      const waButton = document.createElement('a');
      waButton.className = 'whatsapp-order-button';
      waButton.href = whatsappLink(menu, item.id);
      waButton.target = '_blank';
      waButton.rel = 'noopener noreferrer';
      waButton.textContent = 'Pedir no WhatsApp';

      footer.appendChild(price);
      footer.appendChild(waButton);

      card.appendChild(body);
      card.appendChild(footer);
      grid.appendChild(card);
    }

    section.appendChild(grid);
    catalogContainer.appendChild(section);
  }
}

async function bootStorefront() {
  if (typeof document === 'undefined') return;

  const slug = resolveStorefrontSlug();
  const statusBanner = document.getElementById('storefront-status');
  const nameHeading = document.getElementById('storefront-name');

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
    renderStorefrontDOM(menu);
  } catch {
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
