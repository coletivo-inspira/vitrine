import { StorefrontRenderer, slugifyCategoryId } from '../assets/storefront-renderer.mjs';
import { AUCTION_RULES, isAuctionItem } from '../assets/auction-rules.mjs';

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
        id: 'vitrine',
        name: 'Vitrine',
        items: menu.items
      }
    ];
  }
  return [];
}

function resolveCatalogTagLabel(catalogType) {
  if (catalogType === 'booking') return 'Agendamento Online';
  if (catalogType === 'quote') return 'Solicitação de Orçamento';
  return 'Vitrine';
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

const LIKE_ERROR_MESSAGES = Object.freeze({
  429: 'Muitas curtidas nesta vitrine agora. Tente de novo em alguns minutos.',
  default: 'Não foi possível registrar sua curtida. Tente de novo.'
});

export function createStorefrontLikesClient({ slug, fetchImpl = globalThis.fetch } = {}) {
  const counts = new Map();
  const liked = new Set();
  const pending = new Set();
  const listeners = new Set();
  let available = false;

  function notify(itemId = null, message = '') {
    for (const listener of listeners) {
      try {
        listener(itemId, message);
      } catch {
        // A failing listener must not block the others.
      }
    }
  }

  function apply(itemId, isLiked, count) {
    if (isLiked) liked.add(itemId);
    else liked.delete(itemId);
    if (count > 0) counts.set(itemId, count);
    else counts.delete(itemId);
  }

  async function load() {
    if (!slug || typeof fetchImpl !== 'function') return false;
    try {
      const response = await fetchImpl(`/api/likes?slug=${encodeURIComponent(slug)}`, {
        headers: { accept: 'application/json' },
        credentials: 'same-origin'
      });
      if (!response || !response.ok) return false;
      const body = await response.json();
      counts.clear();
      liked.clear();
      const rawCounts = body?.counts && typeof body.counts === 'object' ? body.counts : {};
      for (const [itemId, count] of Object.entries(rawCounts)) {
        if (Number.isSafeInteger(count) && count > 0) counts.set(itemId, count);
      }
      for (const itemId of Array.isArray(body?.liked) ? body.liked : []) {
        if (typeof itemId === 'string') liked.add(itemId);
      }
      available = true;
      notify();
      return true;
    } catch {
      return false;
    }
  }

  function getState(itemId) {
    return {
      available,
      count: counts.get(itemId) ?? 0,
      liked: liked.has(itemId),
      pending: pending.has(itemId)
    };
  }

  async function toggle(itemId) {
    if (!available || typeof itemId !== 'string' || !itemId || pending.has(itemId)) {
      return getState(itemId);
    }
    const wasLiked = liked.has(itemId);
    const previousCount = counts.get(itemId) ?? 0;
    const nextLiked = !wasLiked;
    apply(itemId, nextLiked, Math.max(0, previousCount + (nextLiked ? 1 : -1)));
    pending.add(itemId);
    notify(itemId);

    let message = '';
    try {
      const response = await fetchImpl('/api/likes', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ slug, itemId, liked: nextLiked })
      });
      if (response && response.ok) {
        const body = await response.json();
        const confirmedCount = Number.isSafeInteger(body?.count) ? body.count : counts.get(itemId) ?? 0;
        apply(itemId, body?.liked === true, confirmedCount);
      } else {
        apply(itemId, wasLiked, previousCount);
        message = LIKE_ERROR_MESSAGES[response?.status] ?? LIKE_ERROR_MESSAGES.default;
      }
    } catch {
      apply(itemId, wasLiked, previousCount);
      message = LIKE_ERROR_MESSAGES.default;
    }
    pending.delete(itemId);
    notify(itemId, message);
    return getState(itemId);
  }

  function subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  }

  return {
    load,
    getState,
    toggle,
    subscribe,
    isAvailable: () => available
  };
}

export function createAuctionClient({ slug, fetchImpl = globalThis.fetch, onBoard } = {}) {
  const base = `/api/public/auctions/${encodeURIComponent(slug)}`;

  async function loadBoard() {
    try {
      const response = await fetchImpl(base, { headers: { accept: 'application/json' }, cache: 'no-store' });
      if (!response?.ok) return null;
      const board = await response.json();
      onBoard?.(board);
      return board;
    } catch {
      return null;
    }
  }

  async function placeBid(payload) {
    try {
      const response = await fetchImpl(`${base}/bids`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify(payload)
      });
      const body = await response.json().catch(() => ({}));
      if (response.status === 201) return { ok: true, ...body };
      if (response.status === 202) return { ok: false, error: { code: 'INVALID_BID' } };
      return { ok: false, error: body?.error ?? { code: 'AUCTIONS_UNAVAILABLE' } };
    } catch {
      return { ok: false, error: { code: 'AUCTIONS_UNAVAILABLE' } };
    }
  }

  return { loadBoard, placeBid, refresh: loadBoard };
}

export async function bootStorefront(deps = {}) {
  const doc = deps.document ?? globalThis.document;
  if (!doc) return null;

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const navigatorObj = deps.navigator ?? globalThis.navigator;
  const slug =
    deps.slug ??
    doc.body?.dataset?.storefrontSlug ?? resolveStorefrontSlug(deps.pathname ?? globalThis.location?.pathname, deps.search ?? globalThis.location?.search);

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

    const categories = catalogContainer ? normalizeStorefrontCategories(menu) : [];
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

    const customHero = menu.structure?.pages?.find(page => page.slug === 'home')
      ?.sections?.find(section => section.moduleCode === 'hero')?.config;
    if (customHero?.headline) {
      const heading = doc.getElementById('storefront-name');
      if (heading) heading.textContent = customHero.headline;
    }
    if (customHero?.subtitle) {
      const subtitle = doc.getElementById('storefront-subtitle');
      if (subtitle) subtitle.textContent = customHero.subtitle;
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

    if (!catalogContainer) return null;

    const likesClient = createStorefrontLikesClient({ slug, fetchImpl });
    const renderer = new StorefrontRenderer(catalogContainer, menu, {
      isPublicPage: true,
      likes: likesClient,
      targetWhatsapp: menu.whatsapp,
      onUpdate: (r) => {
        if (heroSec) {
          heroSec.hidden = r.stage !== 1;
        }
      }
    });
    renderer.metricsCollector = collector;

    const hasAuctions = categories.some((category) => (category.items ?? []).some(isAuctionItem));
    if (hasAuctions) {
      const auctionClient = createAuctionClient({
        slug,
        fetchImpl,
        onBoard: (board) => renderer.setAuctionBoard(board)
      });
      renderer.options.auctionClient = auctionClient;
      const refreshWhenVisible = () => {
        if (doc.visibilityState !== 'hidden' && renderer.stage === 1) auctionClient.loadBoard();
      };
      const setIntervalImpl = deps.setInterval ?? globalThis.setInterval;
      if (typeof setIntervalImpl === 'function') {
        renderer.auctionTimer = setIntervalImpl(refreshWhenVisible, AUCTION_RULES.boardPollMs);
      }
      if (typeof doc.addEventListener === 'function') {
        doc.addEventListener('visibilitychange', refreshWhenVisible);
      }
      renderer.render();
      await auctionClient.loadBoard();
      return renderer;
    }

    renderer.render();
    likesClient.load();
    return renderer;
  } catch {
    if (statusBanner) {
      statusBanner.textContent = 'Não foi possível carregar a vitrine neste momento.';
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

const sandboxWidgets = [...(globalThis.document?.querySelectorAll('iframe.storefront-widget') ?? [])];
if (sandboxWidgets.length) {
  globalThis.addEventListener('message', event => {
    if (event.origin !== 'null' || event.data?.type !== 'vitrine:sandbox:resize' ||
        !Number.isSafeInteger(event.data.heightPx) || event.data.heightPx < 120 || event.data.heightPx > 1200) return;
    const iframe = sandboxWidgets.find(element =>
      element.contentWindow === event.source && element.dataset.widgetId === event.data.widgetId
    );
    if (iframe) iframe.height = String(event.data.heightPx);
  });
}
