// Endereço com mapa na vitrine (spec 021, US5): sugestões de endereço enquanto a pessoa
// digita, "Usar minha localização" e um mapa em <canvas> com o pino fixo no centro; a
// pessoa arrasta o mapa para marcar o ponto exato. Sem bibliotecas, sem estilos inline e
// sem hosts de terceiros: busca e blocos do mapa passam por /api/geo/ na própria origem.
import {
  MAP_DEFAULT_ZOOM,
  MAP_MAX_ZOOM,
  MAP_MIN_ZOOM,
  TILE_SIZE,
  mapsPointLink,
  normalizeGeoQuery,
  panCenter,
  roundCoord,
  visibleTiles
} from './geo.mjs';

const SVG_NS = 'http://www.w3.org/2000/svg';
const PIN_PATH = 'M12 22s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Zm0-9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z';
const SEARCH_DELAY_MS = 450;
const KEY_PAN_PX = 48;
const tileImages = new Map();

function tileImage(z, x, y, onLoad) {
  const key = `${z}/${x}/${y}`;
  let img = tileImages.get(key);
  if (!img && typeof Image === 'function') {
    img = new Image();
    img.decoding = 'async';
    img.addEventListener('load', () => onLoad());
    img.src = `/api/geo/tile/${key}.png`;
    tileImages.set(key, img);
  }
  return img;
}

function drawMap(canvas, center, zoom, redraw) {
  const ctx = typeof canvas?.getContext === 'function' ? canvas.getContext('2d') : null;
  if (!ctx) return;
  const width = canvas.clientWidth || 320;
  const height = canvas.clientHeight || 220;
  const ratio = Math.min(globalThis.devicePixelRatio || 1, 2);
  if (canvas.width !== Math.round(width * ratio)) canvas.width = Math.round(width * ratio);
  if (canvas.height !== Math.round(height * ratio)) canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = '#E8E4DC';
  ctx.fillRect(0, 0, width, height);
  for (const tile of visibleTiles({ ...center, zoom, width, height })) {
    const img = tileImage(tile.z, tile.x, tile.y, redraw);
    if (img?.complete && img.naturalWidth) ctx.drawImage(img, tile.left, tile.top, TILE_SIZE, TILE_SIZE);
  }
}

function svgIcon(doc, className, path) {
  if (typeof doc.createElementNS !== 'function') return null;
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const node = doc.createElementNS(SVG_NS, 'path');
  node.setAttribute('d', path);
  svg.appendChild(node);
  return svg;
}

function button(doc, className, text, label) {
  const btn = doc.createElement('button');
  btn.type = 'button';
  btn.className = className;
  btn.textContent = text;
  if (label) btn.setAttribute('aria-label', label);
  return btn;
}

/**
 * Liga o campo de endereço da vitrine às sugestões e ao mapa. O ponto escolhido fica em
 * `renderer.customerDetails.location` e entra na mensagem como link do Google Maps.
 */
export function renderAddressMap(renderer, group, input, { area = null, fetchImpl = globalThis.fetch, doc = globalThis.document } = {}) {
  const details = renderer.customerDetails;
  const idBase = `${renderer.idPrefix}-geo`;
  const status = doc.createElement('p');
  status.className = 'sf-field-help';
  status.id = `${idBase}-status`;
  status.setAttribute('aria-live', 'polite');

  const list = doc.createElement('ul');
  list.className = 'sf-geo-suggestions';
  list.id = `${idBase}-suggestions`;
  list.setAttribute('aria-label', 'Endereços encontrados');
  list.hidden = true;
  input.setAttribute('autocomplete', 'street-address');
  input.setAttribute('aria-controls', list.id);

  const choose = (result) => {
    details.address = result.label;
    details.location = { lat: result.lat, lon: result.lon };
    details.mapZoom = MAP_DEFAULT_ZOOM;
    renderer.render();
  };

  let timer = null;
  let requestId = 0;
  input.addEventListener('input', () => {
    if (timer) clearTimeout(timer);
    const query = normalizeGeoQuery(input.value);
    if (!query || typeof fetchImpl !== 'function') {
      list.hidden = true;
      return;
    }
    timer = setTimeout(async () => {
      const current = ++requestId;
      const bias = details.location
        ? `&lat=${details.location.lat}&lon=${details.location.lon}`
        : area ? `&near=${encodeURIComponent(`${area.city} - ${area.uf}`)}` : '';
      try {
        const response = await fetchImpl(`/api/geo/search?q=${encodeURIComponent(query)}${bias}`, { headers: { accept: 'application/json' } });
        const data = response?.ok ? await response.json() : null;
        if (current !== requestId) return;
        const results = Array.isArray(data?.results) ? data.results : [];
        list.replaceChildren(...results.map((result) => {
          const item = doc.createElement('li');
          const option = button(doc, '', result.label);
          option.addEventListener('click', () => choose(result));
          item.appendChild(option);
          return item;
        }));
        list.hidden = results.length === 0;
        status.textContent = results.length ? '' : 'Nenhum endereço encontrado. Continue digitando ou use sua localização.';
      } catch {
        if (current === requestId) list.hidden = true;
      }
    }, SEARCH_DELAY_MS);
  });

  const actions = doc.createElement('div');
  actions.className = 'sf-geo-actions';
  const locate = button(doc, 'sf-secondary-button', 'Usar minha localização');
  locate.addEventListener('click', () => {
    const geo = globalThis.navigator?.geolocation;
    if (!geo) {
      status.textContent = 'Este aparelho não informa a localização. Digite o endereço.';
      return;
    }
    status.textContent = 'Buscando sua localização...';
    geo.getCurrentPosition(async (position) => {
      const lat = roundCoord(position.coords.latitude);
      const lon = roundCoord(position.coords.longitude);
      details.location = { lat, lon };
      details.mapZoom = MAP_DEFAULT_ZOOM;
      if (!details.address.trim() && typeof fetchImpl === 'function') {
        try {
          const response = await fetchImpl(`/api/geo/reverse?lat=${lat}&lon=${lon}`, { headers: { accept: 'application/json' } });
          const data = response?.ok ? await response.json() : null;
          if (data?.result?.label) details.address = data.result.label;
        } catch {
          // O ponto já vale para a entrega; o endereço pode ser digitado.
        }
      }
      renderer.render();
    }, () => {
      status.textContent = 'Não foi possível pegar a localização. Digite o endereço ou permita o acesso.';
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 });
  });
  actions.appendChild(locate);

  group.appendChild(list);
  group.appendChild(actions);

  if (details.location) {
    const center = { ...details.location };
    let zoom = details.mapZoom || MAP_DEFAULT_ZOOM;
    const wrap = doc.createElement('div');
    wrap.className = 'sf-map';
    const canvas = doc.createElement('canvas');
    canvas.className = 'sf-map-canvas';
    canvas.tabIndex = 0;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Mapa do ponto de entrega. Arraste ou use as setas para ajustar o pino.');
    const pin = svgIcon(doc, 'sf-map-pin', PIN_PATH);
    const link = doc.createElement('a');
    link.className = 'sf-map-link';
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = 'Ver no Google Maps';

    let frame = 0;
    const redraw = () => {
      if (frame || typeof globalThis.requestAnimationFrame !== 'function') return;
      frame = globalThis.requestAnimationFrame(() => {
        frame = 0;
        drawMap(canvas, center, zoom, redraw);
      });
    };
    const commit = () => {
      details.location = { lat: roundCoord(center.lat), lon: roundCoord(center.lon) };
      details.mapZoom = zoom;
      link.href = mapsPointLink(details.location.lat, details.location.lon);
    };

    let drag = null;
    canvas.addEventListener('pointerdown', (event) => {
      drag = { x: event.clientX, y: event.clientY, start: { ...center } };
      canvas.setPointerCapture?.(event.pointerId);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drag) return;
      Object.assign(center, panCenter({ ...drag.start, zoom }, event.clientX - drag.x, event.clientY - drag.y));
      redraw();
    });
    const endDrag = () => {
      if (!drag) return;
      drag = null;
      commit();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);
    canvas.addEventListener('keydown', (event) => {
      const moves = { ArrowLeft: [KEY_PAN_PX, 0], ArrowRight: [-KEY_PAN_PX, 0], ArrowUp: [0, KEY_PAN_PX], ArrowDown: [0, -KEY_PAN_PX] };
      const move = moves[event.key];
      if (!move) return;
      event.preventDefault();
      Object.assign(center, panCenter({ ...center, zoom }, move[0], move[1]));
      commit();
      redraw();
    });

    const zoomBox = doc.createElement('div');
    zoomBox.className = 'sf-map-zoom';
    const zoomIn = button(doc, '', '+', 'Aproximar o mapa');
    const zoomOut = button(doc, '', '−', 'Afastar o mapa');
    zoomIn.addEventListener('click', () => { zoom = Math.min(MAP_MAX_ZOOM, zoom + 1); commit(); redraw(); });
    zoomOut.addEventListener('click', () => { zoom = Math.max(MAP_MIN_ZOOM, zoom - 1); commit(); redraw(); });
    zoomBox.appendChild(zoomIn);
    zoomBox.appendChild(zoomOut);

    const credit = doc.createElement('a');
    credit.className = 'sf-map-credit';
    credit.href = 'https://www.openstreetmap.org/copyright';
    credit.target = '_blank';
    credit.rel = 'noopener noreferrer';
    credit.textContent = '© OpenStreetMap';

    wrap.appendChild(canvas);
    if (pin) wrap.appendChild(pin);
    wrap.appendChild(zoomBox);
    wrap.appendChild(credit);

    const hint = doc.createElement('p');
    hint.className = 'sf-field-help';
    hint.textContent = 'Arraste o mapa até o pino ficar no ponto exato da entrega.';

    group.appendChild(hint);
    group.appendChild(wrap);
    actions.appendChild(link);
    commit();
    redraw();
  }

  group.appendChild(status);
}
