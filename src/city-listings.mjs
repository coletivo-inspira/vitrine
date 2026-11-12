import { BRAZIL_UFS, slugifyCity } from './portal-validation.mjs';

export const CITY_LISTING_PRICE_MODES = Object.freeze(['offer', 'donation', 'trade']);
export const CITY_MODE_FILTERS = Object.freeze({ lance: 'offer', doacao: 'donation', troca: 'trade' });
export const CITY_PAGE_SIZE = 24;
export const CITY_SLUG_PATTERN = new RegExp(
  `^[a-z0-9]+(?:-[a-z0-9]+)*-(?:${BRAZIL_UFS.map((uf) => uf.toLowerCase()).join('|')})$`
);
export const LISTING_CURSOR_PATTERN = /^\d{16}~[a-z0-9]+(?:-[a-z0-9]+)*~\d{3}$/;

export const UF_NAMES = Object.freeze({
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará',
  DF: 'Distrito Federal', ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso',
  MS: 'Mato Grosso do Sul', MG: 'Minas Gerais', PA: 'Pará', PB: 'Paraíba', PR: 'Paraná',
  PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina',
  SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins'
});

const MODE_LABELS = Object.freeze({ offer: 'Lance', donation: 'Doação', trade: 'Troca' });

export function isValidCitySlug(value) {
  return typeof value === 'string' && value.length <= 80 && CITY_SLUG_PATTERN.test(value);
}

export function buildListingSortKey(publishedAt, siteSlug, position) {
  const epochMicros = Math.max(0, Math.trunc(Date.parse(publishedAt) || 0)) * 1000;
  const reversedPosition = Math.max(0, 999 - position);
  return `${String(epochMicros).padStart(16, '0')}~${siteSlug}~${String(reversedPosition).padStart(3, '0')}`;
}

/**
 * JavaScript twin of private.refresh_city_listings() (Supabase trigger):
 * derives the city rows of one public manifest. Used by the in-memory store.
 */
export function projectCityListings(menu, publishedAt) {
  const locality = menu?.locality;
  if (
    !locality ||
    typeof locality.city !== 'string' ||
    !BRAZIL_UFS.includes(locality.uf) ||
    locality.citySlug !== slugifyCity(locality.city, locality.uf) ||
    !isValidCitySlug(locality.citySlug)
  ) {
    return [];
  }
  const items = Array.isArray(menu.items) ? menu.items : [];
  const rows = [];
  items.forEach((item, index) => {
    if (!item || !CITY_LISTING_PRICE_MODES.includes(item.priceMode)) return;
    const position = index + 1;
    rows.push({
      city_slug: locality.citySlug,
      city: locality.city,
      uf: locality.uf,
      site_slug: menu.slug,
      site_name: menu.name,
      item_id: item.id,
      item_position: position,
      item_name: item.name,
      price_mode: item.priceMode,
      price_cents: Number.isSafeInteger(item.priceCents) ? item.priceCents : 0,
      description: item.description ?? null,
      conditions: item.conditions ?? null,
      trade_for: item.tradeFor ?? null,
      image_url: item.imageUrl ?? null,
      published_at: publishedAt,
      sort_key: buildListingSortKey(publishedAt, menu.slug, position)
    });
  });
  return rows;
}

export function parseCityListingQuery(searchParams) {
  const rawMode = searchParams?.get?.('modo') ?? '';
  const modeKey = Object.hasOwn(CITY_MODE_FILTERS, rawMode) ? rawMode : 'todos';
  const rawCursor = searchParams?.get?.('depois') ?? '';
  const cursor = LISTING_CURSOR_PATTERN.test(rawCursor) ? rawCursor : null;
  return { modeKey, priceMode: CITY_MODE_FILTERS[modeKey] ?? null, cursor };
}

export function buildCityListingSearch({ modeKey = 'todos', cursor = null } = {}) {
  const params = new URLSearchParams();
  if (modeKey && modeKey !== 'todos') params.set('modo', modeKey);
  if (cursor) params.set('depois', cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

export function paginateCityListings(rows, { citySlug, priceMode = null, cursor = null, limit = CITY_PAGE_SIZE }) {
  const filtered = rows
    .filter((row) => row.city_slug === citySlug)
    .filter((row) => !priceMode || row.price_mode === priceMode)
    .filter((row) => !cursor || row.sort_key < cursor)
    .sort((a, b) => (a.sort_key < b.sort_key ? 1 : a.sort_key > b.sort_key ? -1 : 0));
  return finalizeCityListingPage(filtered.slice(0, limit + 1), limit);
}

export function finalizeCityListingPage(rowsWithLookahead, limit = CITY_PAGE_SIZE) {
  const pageRows = rowsWithLookahead.slice(0, limit);
  const hasMore = rowsWithLookahead.length > limit;
  return {
    rows: pageRows,
    nextCursor: hasMore && pageRows.length ? pageRows[pageRows.length - 1].sort_key : null
  };
}

export function summarizeCities(rows) {
  const byCity = new Map();
  const ordered = [...rows].sort((a, b) => (a.sort_key < b.sort_key ? 1 : -1));
  for (const row of ordered) {
    let entry = byCity.get(row.city_slug);
    if (!entry) {
      entry = { citySlug: row.city_slug, city: row.city, uf: row.uf, counts: { offer: 0, donation: 0, trade: 0, total: 0 } };
      byCity.set(row.city_slug, entry);
    }
    entry.counts[row.price_mode] += 1;
    entry.counts.total += 1;
  }
  return sortCities([...byCity.values()]);
}

export function sortCities(cities) {
  return [...cities].sort(
    (a, b) => a.uf.localeCompare(b.uf, 'pt-BR') || a.city.localeCompare(b.city, 'pt-BR')
  );
}

export function cityFromSummaryRow(row) {
  return {
    citySlug: row.city_slug,
    city: row.city,
    uf: row.uf,
    counts: {
      offer: Number(row.offer_count) || 0,
      donation: Number(row.donation_count) || 0,
      trade: Number(row.trade_count) || 0,
      total: Number(row.total_count) || 0
    }
  };
}

export function toPublicListing(row) {
  return {
    vitrine: { slug: row.site_slug, name: row.site_name, url: `/${row.site_slug}` },
    item: {
      id: row.item_id,
      name: row.item_name,
      priceMode: row.price_mode,
      priceCents: row.price_cents,
      ...(row.description ? { description: row.description } : {}),
      ...(row.conditions ? { conditions: row.conditions } : {}),
      ...(row.trade_for ? { tradeFor: row.trade_for } : {}),
      ...(row.image_url ? { imageUrl: row.image_url } : {})
    },
    publishedAt: row.published_at,
    // Reserved for the auction summary of spec 013 (see specs/012-vitrine-por-cidade/research.md, D10).
    auction: null
  };
}

export function formatListingPriceBRL(priceCents) {
  const reais = Math.floor(priceCents / 100);
  const centavos = String(priceCents % 100).padStart(2, '0');
  return `R$ ${reais.toLocaleString('pt-BR')},${centavos}`;
}

/**
 * Single place that turns a listing into the price/mode copy shown on the city page.
 * Spec 013 plugs the real auction summary in here through `listing.auction`.
 */
export function describeListingPrice(listing) {
  const { priceMode, priceCents, conditions, tradeFor } = listing.item;
  const modeLabel = MODE_LABELS[priceMode] ?? '';
  if (priceMode === 'offer') {
    return {
      modeLabel,
      headline: 'Faça sua oferta',
      detail: Number.isSafeInteger(priceCents) && priceCents > 0 ? `a partir de ${formatListingPriceBRL(priceCents)}` : ''
    };
  }
  if (priceMode === 'donation') {
    return { modeLabel, headline: 'Sem custo', detail: conditions ? `Condições: ${conditions}` : '' };
  }
  return { modeLabel, headline: 'Para trocar', detail: tradeFor ? `Aceito em troca: ${tradeFor}` : '' };
}

export function modeLabel(priceMode) {
  return MODE_LABELS[priceMode] ?? '';
}
