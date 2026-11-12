import {
  UF_NAMES,
  buildCityListingSearch,
  describeListingPrice
} from './city-listings.mjs';

const PUBLIC_ORIGIN = 'https://vitrine.inspira.dev.br';
const MODE_FILTER_LABELS = Object.freeze([
  ['todos', 'Todos', 'total'],
  ['lance', 'Lance', 'offer'],
  ['doacao', 'Doação', 'donation'],
  ['troca', 'Troca', 'trade']
]);

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function pluralItems(count) {
  return count === 1 ? '1 item' : `${count} itens`;
}

function renderLayout({ title, description, canonicalPath, robots, body }) {
  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#F7F7F4">
  <meta name="description" content="${escapeHtml(description)}">
  ${robots ? `<meta name="robots" content="${escapeHtml(robots)}">` : ''}
  <title>${escapeHtml(title)}</title>
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Vitrine Inspira">
  <meta property="og:title" content="${escapeHtml(title)}">
  <meta property="og:description" content="${escapeHtml(description)}">
  <meta property="og:url" content="${PUBLIC_ORIGIN}${escapeHtml(canonicalPath)}">
  <meta property="og:image" content="${PUBLIC_ORIGIN}/assets/brand/og-vitrine.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="Vitrine Inspira — por cidade">
  <meta property="og:locale" content="pt_BR">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="canonical" href="${PUBLIC_ORIGIN}${escapeHtml(canonicalPath)}">
  <link rel="icon" href="/assets/brand/vitrine-icon.svg" type="image/svg+xml">
  <link rel="preload" href="/assets/fonts/syne.ttf" as="font" type="font/ttf" crossorigin>
  <link rel="preload" href="/assets/fonts/dm-sans.ttf" as="font" type="font/ttf" crossorigin>
  <script src="/theme.js"></script>
  <link rel="stylesheet" href="/styles.css">
  <link rel="stylesheet" href="/por-cidade/por-cidade.css">
  <script type="module" src="/app.js"></script>
</head>
<body class="city-page">
  <a class="skip-link" href="#conteudo">Pular para o conteúdo</a>
  <header class="site-header wrap">
    <a class="brand" href="/" aria-label="Vitrine Inspira — início">
      <img class="brand-logo brand-logo-light" src="/assets/brand/vitrine-animated.svg" width="188" height="58" alt="vitrine — coletivo inspira">
      <img class="brand-logo brand-logo-dark" src="/assets/brand/vitrine-animated-inverse.svg" width="188" height="58" alt="vitrine — coletivo inspira">
    </a>
    <div class="header-controls">
    <button class="theme-toggle" type="button" aria-label="Ativar modo escuro" hidden>
      <svg class="theme-moon" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path d="M20.5 14A9 9 0 0 1 10 3.5 9 9 0 1 0 20.5 14Z"/></svg>
      <svg class="theme-sun" width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg>
    </button>
    <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="site-nav" aria-label="Abrir menu" hidden>
      <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
    </button>
    </div>
    <nav id="site-nav" aria-label="Navegação principal">
      <a href="/como-funciona/">Como funciona</a>
      <a href="/possibilidades/">Possibilidades</a>
      <a href="/planos/">Planos</a>
      <a href="/orcamento/">Orçamento</a>
      <a href="/por-cidade" aria-current="page">Por cidade</a>
      <a href="https://painel.inspira.dev.br/">Entrar</a>
      <a class="button button-small" href="https://painel.inspira.dev.br/">Criar minha vitrine</a>
    </nav>
  </header>

  <main id="conteudo" class="wrap city-main">
${body}
  </main>

  <footer class="site-footer compact-footer">
    <div class="wrap">
      <p>
        © 2026 <a href="https://inspira.dev.br/">Coletivo Inspira</a>. Todos os direitos reservados.
        <a href="https://inspira.dev.br/" target="_blank" rel="noopener noreferrer" class="footer-logo-link">
          <img src="/assets/brand/coletivo-inspira.svg" alt="Coletivo Inspira" width="20" height="20" class="footer-logo">
        </a>
      </p>
    </div>
  </footer>
</body>
</html>`;
}

const PRIVACY_NOTE = `<p class="city-privacy">Aqui aparecem só o nome da vitrine, a cidade e os dados públicos de cada item. Nada de nome, telefone ou endereço de quem anuncia: a conversa acontece na vitrine.</p>`;

export function renderCityIndexHtml({ cities = [] } = {}) {
  const byUf = new Map();
  for (const city of cities) {
    if (!byUf.has(city.uf)) byUf.set(city.uf, []);
    byUf.get(city.uf).push(city);
  }
  const groups = [...byUf.entries()].map(([uf, list]) => `
      <section class="city-uf" aria-labelledby="uf-${escapeHtml(uf.toLowerCase())}">
        <h2 id="uf-${escapeHtml(uf.toLowerCase())}" class="city-uf-title">${escapeHtml(UF_NAMES[uf] ?? uf)} <span>${escapeHtml(uf)}</span></h2>
        <ul class="city-list">
          ${list.map((city) => `<li><a class="city-list-link" href="/por-cidade/${escapeHtml(city.citySlug)}"><span class="city-list-name">${escapeHtml(city.city)}</span><span class="city-list-count">${escapeHtml(pluralItems(city.counts.total))}</span></a></li>`).join('\n          ')}
        </ul>
      </section>`).join('');

  const content = cities.length
    ? `<div class="city-ufs">${groups}
    </div>`
    : `<div class="city-empty">
      <h2>Ainda não há cidades por aqui</h2>
      <p>Assim que uma vitrine publicar itens de lance, doação ou troca e autorizar a página da cidade, ela aparece nesta lista.</p>
    </div>`;

  const body = `    <section class="city-hero" aria-labelledby="city-title">
      <p class="city-eyebrow">Lance, doação e troca</p>
      <h1 id="city-title">Por cidade</h1>
      <p class="city-lede">Coisas para propor um valor, receber sem custo ou trocar, reunidas das vitrines de cada cidade.</p>
    </section>
    ${content}
    <aside class="city-owner-note" aria-label="Para quem tem vitrine">
      <h2>Tem uma vitrine?</h2>
      <p>No painel, em <strong>Ajustes → Página por cidade</strong>, autorize a listagem, informe a cidade e publique. Só itens de lance, doação e troca entram aqui.</p>
      <a class="text-link" href="https://painel.inspira.dev.br/">Abrir o painel →</a>
    </aside>
    ${PRIVACY_NOTE}`;

  return renderLayout({
    title: 'Por cidade: lance, doação e troca — Vitrine Inspira',
    description: 'Itens de lance, doação e troca das vitrines de cada cidade, em um só lugar.',
    canonicalPath: '/por-cidade',
    body
  });
}

function renderListingCard(listing) {
  const price = describeListingPrice(listing);
  const { item, vitrine } = listing;
  const image = item.imageUrl
    ? `<img class="city-card-photo" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" width="480" height="360">`
    : '';
  return `<li>
        <article class="city-card${image ? ' has-photo' : ''}" data-mode="${escapeHtml(item.priceMode)}">
          ${image}
          <div class="city-card-body">
            <span class="city-mode city-mode-${escapeHtml(item.priceMode)}">${escapeHtml(price.modeLabel)}</span>
            <h2 class="city-card-title">${escapeHtml(item.name)}</h2>
            ${item.description ? `<p class="city-card-desc">${escapeHtml(item.description)}</p>` : ''}
            <p class="city-card-price"><strong>${escapeHtml(price.headline)}</strong>${price.detail ? ` <span>${escapeHtml(price.detail)}</span>` : ''}</p>
          </div>
          <div class="city-card-footer">
            <span class="city-card-vitrine">na vitrine <strong>${escapeHtml(vitrine.name)}</strong></span>
            <a class="button button-small city-card-link" href="${escapeHtml(vitrine.url)}" aria-label="Ver ${escapeHtml(item.name)} na vitrine ${escapeHtml(vitrine.name)}">Ver na vitrine</a>
          </div>
        </article>
      </li>`;
}

export function renderCityPageHtml({ city, listings = [], modeKey = 'todos', cursor = null, nextCursor = null }) {
  const basePath = `/por-cidade/${city.citySlug}`;
  const ufName = UF_NAMES[city.uf] ?? city.uf;
  const filters = MODE_FILTER_LABELS.map(([key, label, countKey]) => {
    const current = key === modeKey;
    return `<a class="city-filter${current ? ' is-current' : ''}" href="${escapeHtml(basePath + buildCityListingSearch({ modeKey: key }))}"${current ? ' aria-current="page"' : ''}>${escapeHtml(label)} <span class="city-filter-count">${escapeHtml(String(city.counts[countKey] ?? 0))}</span></a>`;
  }).join('\n        ');

  const activeLabel = modeKey === 'todos' ? '' : MODE_FILTER_LABELS.find(([key]) => key === modeKey)?.[1];
  const list = listings.length
    ? `<ul class="city-grid" aria-label="Itens em ${escapeHtml(city.city)}">
      ${listings.map(renderListingCard).join('\n      ')}
    </ul>`
    : `<div class="city-empty">
      <h2>Nenhum item ${activeLabel ? `de ${escapeHtml(activeLabel.toLowerCase())} ` : ''}por enquanto</h2>
      <p><a class="text-link" href="${escapeHtml(basePath)}">Ver todos os itens de ${escapeHtml(city.city)} →</a></p>
    </div>`;

  const pagination = cursor || nextCursor
    ? `<nav class="city-pagination" aria-label="Paginação">
      ${cursor ? `<a class="text-link" href="${escapeHtml(basePath + buildCityListingSearch({ modeKey }))}">← Voltar ao início</a>` : '<span></span>'}
      ${nextCursor ? `<a class="button button-small" href="${escapeHtml(basePath + buildCityListingSearch({ modeKey, cursor: nextCursor }))}">Mais itens</a>` : ''}
    </nav>`
    : '';

  const body = `    <nav class="city-breadcrumb" aria-label="Você está em"><a href="/por-cidade">Por cidade</a> <span aria-hidden="true">/</span> <span>${escapeHtml(ufName)}</span></nav>
    <section class="city-hero" aria-labelledby="city-title">
      <p class="city-eyebrow">Lance, doação e troca</p>
      <h1 id="city-title">${escapeHtml(city.city)} <span class="city-uf-tag">${escapeHtml(city.uf)}</span></h1>
      <p class="city-lede">${escapeHtml(pluralItems(city.counts.total))} das vitrines de ${escapeHtml(city.city)} para propor um valor, receber sem custo ou trocar.</p>
    </section>
    <nav class="city-filters" aria-label="Filtrar por modo">
        ${filters}
    </nav>
    ${list}
    ${pagination}
    ${PRIVACY_NOTE}`;

  const modeSearch = buildCityListingSearch({ modeKey });
  return renderLayout({
    title: `${city.city} – ${city.uf}: lance, doação e troca — Vitrine Inspira`,
    description: `Itens de lance, doação e troca das vitrines de ${city.city} (${city.uf}).`,
    canonicalPath: basePath + modeSearch,
    robots: cursor ? 'noindex, follow' : '',
    body
  });
}

export function renderCityNotFoundHtml() {
  return renderLayout({
    title: 'Cidade sem itens — Vitrine Inspira',
    description: 'Ainda não há itens de lance, doação ou troca nesta cidade.',
    canonicalPath: '/por-cidade',
    robots: 'noindex',
    body: `    <section class="city-hero" aria-labelledby="city-title">
      <p class="city-eyebrow">Por cidade</p>
      <h1 id="city-title">Nada por aqui ainda</h1>
      <p class="city-lede">Ainda não há itens de lance, doação ou troca nesta cidade.</p>
      <p><a class="text-link" href="/por-cidade">Ver todas as cidades →</a></p>
    </section>`
  });
}

export function renderCityUnavailableHtml() {
  return renderLayout({
    title: 'Página temporariamente indisponível — Vitrine Inspira',
    description: 'A página por cidade está temporariamente indisponível.',
    canonicalPath: '/por-cidade',
    robots: 'noindex',
    body: `    <section class="city-hero" aria-labelledby="city-title">
      <p class="city-eyebrow">Por cidade</p>
      <h1 id="city-title">Volte em instantes</h1>
      <p class="city-lede">Não conseguimos carregar os itens agora. As vitrines continuam no ar normalmente.</p>
    </section>`
  });
}
