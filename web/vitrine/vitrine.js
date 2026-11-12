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

const MAX_BATCH_EVENTS = 25;

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

export function createStorefrontMetricsCollector({
  slug,
  validItemIds = [],
  navigatorObj = globalThis.navigator,
  fetchImpl = globalThis.fetch,
  nowFn = () => new Date()
} = {}) {
  const allowedItems = new Set(validItemIds);
  const viewedItems = new Set();
  let visitQueued = false;
  let queue = [];

  function buildEventHour() {
    const d = nowFn();
    return d instanceof Date ? d.getHours() : new Date().getHours();
  }

  function flush() {
    if (queue.length === 0 || !slug) {
      return false;
    }
    const batch = queue.splice(0, MAX_BATCH_EVENTS);
    const bodyText = JSON.stringify({
      slug,
      events: batch
    });

    if (navigatorObj && typeof navigatorObj.sendBeacon === 'function') {
      try {
        const blob = new Blob([bodyText], { type: 'application/json' });
        const sent = navigatorObj.sendBeacon('/api/events', blob);
        if (sent) {
          return true;
        }
      } catch {
        // Fallback to fetch with keepalive
      }
    }

    if (typeof fetchImpl === 'function') {
      try {
        fetchImpl('/api/events', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: bodyText,
          keepalive: true
        }).catch(() => {});
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  function record(type, payload = {}) {
    const hour = Number.isInteger(payload.hour) ? payload.hour : buildEventHour();

    if (type === 'visit') {
      if (visitQueued) return false;
      visitQueued = true;
      queue.push({ type: 'visit', hour });
    } else if (type === 'item_view') {
      const itemId = typeof payload.itemId === 'string' ? payload.itemId.trim() : '';
      if (!itemId || (allowedItems.size > 0 && !allowedItems.has(itemId))) return false;
      if (viewedItems.has(itemId)) return false;
      viewedItems.add(itemId);
      queue.push({ type: 'item_view', itemId, hour });
    } else if (type === 'item_select') {
      const itemId = typeof payload.itemId === 'string' ? payload.itemId.trim() : '';
      if (!itemId || (allowedItems.size > 0 && !allowedItems.has(itemId))) return false;
      const count =
        Number.isSafeInteger(payload.count) && payload.count >= 1
          ? Math.min(payload.count, 99)
          : 1;
      queue.push({ type: 'item_select', itemId, count, hour });
    } else if (type === 'whatsapp_order') {
      const estimatedCents =
        Number.isSafeInteger(payload.estimatedCents) && payload.estimatedCents >= 0
          ? payload.estimatedCents
          : 0;
      queue.push({ type: 'whatsapp_order', estimatedCents, hour });
      flush();
      return true;
    } else {
      return false;
    }

    if (queue.length >= MAX_BATCH_EVENTS) {
      flush();
    }
    return true;
  }

  return {
    record,
    flush,
    getQueue() {
      return [...queue];
    }
  };
}

export async function bootStorefront(deps = {}) {
  const doc = deps.document ?? globalThis.document;
  if (!doc) return null;

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const navigatorObj = deps.navigator ?? globalThis.navigator;
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
    const validItemIds = [];
    for (const cat of categories) {
      for (const item of cat.items ?? []) {
        if (item?.id) validItemIds.push(String(item.id));
      }
    }

    const collector = createStorefrontMetricsCollector({
      slug,
      validItemIds,
      navigatorObj,
      fetchImpl
    });

    globalThis.recordStorefrontEvent = (type, payload) => collector.record(type, payload);
    collector.record('visit');
    for (const itemId of validItemIds.slice(0, 12)) {
      collector.record('item_view', { itemId });
    }

    if (typeof doc.addEventListener === 'function') {
      doc.addEventListener('visibilitychange', () => {
        if (doc.visibilityState === 'hidden') {
          collector.flush();
        }
      });
    }
    if (typeof globalThis.addEventListener === 'function') {
      globalThis.addEventListener('pagehide', () => collector.flush());
    }

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
    renderer.metricsCollector = collector;
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
