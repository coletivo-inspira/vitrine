import {
  buildRouteUrl,
  describeWeek,
  formatPublicAddress,
  getOpenStatus
} from './business-hours.mjs';

const REFRESH_MS = 60_000;

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Bloco "Horário e como chegar" da vitrine pública. O selo nasce oculto: o
 * snapshot é imutável e o cálculo de "Aberto agora" acontece no navegador.
 */
export function renderStorefrontPlaceHtml(menu) {
  const hours = menu?.businessHours;
  const address = menu?.publicAddress;
  const routeUrl = buildRouteUrl(address);
  if (!hours && !routeUrl) return '';

  const hoursHtml = hours
    ? `<div class="storefront-place-hours">
        <p class="storefront-open-badge" data-open-badge hidden></p>
        <details class="storefront-hours">
          <summary>Horário de funcionamento</summary>
          <ul>${describeWeek(hours).map((row) =>
            `<li><span>${escapeHtml(row.label)}</span><span>${escapeHtml(row.text)}</span></li>`
          ).join('')}</ul>
        </details>
      </div>`
    : '';
  const addressText = formatPublicAddress(address);
  const addressHtml = routeUrl
    ? `<div class="storefront-place-address">
        <p class="storefront-address">${escapeHtml(addressText)}</p>
        <a class="storefront-route-button" href="${escapeHtml(routeUrl)}" target="_blank" rel="noopener" aria-label="Traçar rota até ${escapeHtml(addressText)} no Google Maps (abre em nova aba)">Traçar rota</a>
      </div>`
    : '';

  return `<section id="storefront-place" class="storefront-place" aria-label="Horário e como chegar">
      ${hoursHtml}
      ${addressHtml}
    </section>`;
}

/**
 * Preenche o selo de "Aberto agora" e o atualiza a cada minuto. Se a página veio
 * sem o bloco (prévia estática), insere-o depois de `anchor`.
 */
export function mountStorefrontPlace(doc, menu, {
  anchor = null,
  now = () => new Date(),
  setIntervalImpl = globalThis.setInterval
} = {}) {
  if (!doc || !menu) return null;
  let section = doc.getElementById?.('storefront-place') ?? null;
  if (!section && anchor?.insertAdjacentHTML) {
    const html = renderStorefrontPlaceHtml(menu);
    if (html) {
      anchor.insertAdjacentHTML('afterend', html);
      section = doc.getElementById('storefront-place');
    }
  }
  if (!section) return null;

  const badge = section.querySelector?.('[data-open-badge]') ?? null;
  const update = () => {
    const status = getOpenStatus(menu.businessHours, now());
    if (!badge) return status;
    if (!status) {
      badge.hidden = true;
      return status;
    }
    if (badge.textContent !== status.label) badge.textContent = status.label;
    badge.dataset.state = status.open ? 'open' : 'closed';
    badge.hidden = false;
    return status;
  };
  update();
  const timer = badge && typeof setIntervalImpl === 'function' ? setIntervalImpl(update, REFRESH_MS) : null;
  return { section, update, timer };
}
