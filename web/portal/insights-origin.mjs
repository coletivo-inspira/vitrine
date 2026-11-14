// Quadro "Visitas por origem" do Painel de Insights (issue #119). Rota e QR Code
// aparecem em todos os planos; a origem e o funil vêm do Worker só quando o plano
// tem conversion_reports, senão o quadro mostra o plano que libera.

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

function formatPercent(value) {
  const num = Number.isFinite(value) ? value : 0;
  return `${num.toFixed(1).replace('.', ',')}%`;
}

function reachPill(doc, label, current, previous) {
  const pill = el(doc, 'div', 'origin-reach-pill');
  pill.append(el(doc, 'span', 'origin-reach-label', label), el(doc, 'strong', 'origin-reach-value', String(current)));
  pill.append(el(doc, 'span', 'origin-reach-previous', `Período anterior: ${previous}`));
  return pill;
}

function funnelRow(doc, entry, maxVisits, title) {
  const row = el(doc, 'li', 'origin-row');
  const head = el(doc, 'div', 'origin-row-head');
  head.append(el(doc, 'strong', 'origin-row-label', title));
  head.append(el(doc, 'span', 'origin-row-count', plural(entry.visits, 'visita', 'visitas')));
  row.append(head);

  const track = el(doc, 'div', 'origin-bar');
  track.setAttribute('aria-hidden', 'true');
  const visitsBar = el(doc, 'span', 'origin-bar-visits');
  visitsBar.style.width = `${maxVisits > 0 ? Math.max(2, Math.round((entry.visits / maxVisits) * 100)) : 0}%`;
  const ordersBar = el(doc, 'span', 'origin-bar-orders');
  const ordersShare = entry.visits > 0 ? Math.min(100, Math.round((entry.orders / entry.visits) * 100)) : 0;
  ordersBar.style.width = `${entry.orders > 0 ? Math.max(4, ordersShare) : 0}%`;
  visitsBar.append(ordersBar);
  track.append(visitsBar);
  row.append(track);

  row.append(el(
    doc,
    'span',
    'origin-row-funnel',
    `${plural(entry.orders, 'clique', 'cliques')} para enviar no WhatsApp · ${formatPercent(entry.conversionPercent)} das visitas`
  ));
  return row;
}

function renderAvailable(doc, body, origins) {
  const sources = Array.isArray(origins.sources) ? origins.sources : [];
  if (sources.length === 0) {
    body.append(el(
      doc,
      'p',
      'empty-msg',
      'Nenhuma visita com origem neste período. Divulgue o QR Code ou links com utm_source, como ?utm_source=ig_comment&utm_campaign=reel_01.'
    ));
    return;
  }
  const maxVisits = Math.max(...sources.map((entry) => entry.visits));
  const list = el(doc, 'ol', 'origin-list');
  list.setAttribute('aria-label', 'Visitas e cliques para enviar no WhatsApp por origem');
  for (const entry of sources) list.append(funnelRow(doc, entry, maxVisits, entry.label));
  body.append(list);

  const campaigns = Array.isArray(origins.campaigns) ? origins.campaigns : [];
  if (campaigns.length > 0) {
    body.append(el(doc, 'h3', 'origin-subtitle', 'Campanhas (utm_campaign)'));
    const campaignList = el(doc, 'ol', 'origin-list');
    campaignList.setAttribute('aria-label', 'Visitas e cliques para enviar no WhatsApp por campanha');
    const maxCampaign = Math.max(...campaigns.map((entry) => entry.visits));
    for (const entry of campaigns) {
      campaignList.append(funnelRow(doc, entry, maxCampaign, `${entry.campaign} · ${entry.label}`));
    }
    body.append(campaignList);
  }
}

function renderLocked(doc, body, origins) {
  const planName = origins.requiredPlan?.name ?? 'Profissional';
  const box = el(doc, 'div', 'origin-locked');
  box.append(el(doc, 'strong', 'origin-locked-title', `Disponível no ${planName}`));
  box.append(el(
    doc,
    'p',
    'origin-locked-text',
    'Veja de onde vêm as visitas (QR Code, comentário ou bio do Instagram, campanhas) e quantas viram cliques para enviar no WhatsApp.'
  ));
  body.append(box);
}

export function renderInsightsOrigin(container, insights, doc = globalThis.document) {
  if (!container || !doc) return;
  container.replaceChildren();

  const header = el(doc, 'div', 'insights-card-header');
  const heading = el(doc, 'div');
  heading.append(el(doc, 'span', 'card-eyebrow', 'De onde vêm as visitas'));
  const title = el(doc, 'h2', '', 'Visitas por origem');
  title.id = 'insights-origin-title';
  heading.append(title);
  header.append(heading);
  const legend = el(doc, 'div', 'insights-chart-legend');
  legend.setAttribute('aria-hidden', 'true');
  for (const [swatch, label] of [['swatch-visits', 'Visitas'], ['swatch-orders', 'Cliques no WhatsApp']]) {
    const item = el(doc, 'span', 'legend-item');
    item.append(el(doc, 'span', `legend-swatch ${swatch}`), doc.createTextNode(` ${label}`));
    legend.append(item);
  }
  header.append(legend);
  container.append(header);

  const reach = insights?.reach ?? {};
  const reachRow = el(doc, 'div', 'origin-reach');
  reachRow.append(reachPill(doc, 'Visitas pelo QR Code', reach.qrVisits ?? 0, reach.previousQrVisits ?? 0));
  reachRow.append(reachPill(doc, 'Cliques em "Traçar rota"', reach.routeClicks ?? 0, reach.previousRouteClicks ?? 0));
  container.append(reachRow);

  const body = el(doc, 'div', 'origin-body');
  const origins = insights?.origins;
  if (origins?.available) renderAvailable(doc, body, origins);
  else renderLocked(doc, body, origins ?? {});
  container.append(body);

  container.append(el(
    doc,
    'p',
    'insights-privacy-footnote',
    'A origem vem só dos parâmetros utm_source e utm_campaign do link. Sem cookies, sem identificar quem visita, só contagens por dia.'
  ));
}
