import {
  BRAZIL_UFS,
  BUSINESS_TIME_ZONE,
  MAX_CLOSED_DATES,
  MAX_RANGES_PER_DAY,
  WEEK_DAY_LABELS,
  buildRouteUrl,
  getOpenStatus,
  todayInBusinessTimeZone,
  validateBusinessHours,
  validatePublicAddress
} from '../assets/business-hours.mjs';
import { buildQrTargetUrl, drawQrOnCanvas, encodeQr, qrToSvg } from './qr-code.mjs';

const EDITOR_DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const ADDRESS_FIELDS = ['street', 'district', 'city', 'uf', 'postalCode'];
const DEFAULT_RANGES = [
  { opens: '09:00', closes: '18:00' },
  { opens: '18:00', closes: '22:00' }
];

const doc = () => globalThis.document;
const byId = (id) => doc()?.getElementById(id) ?? null;

const panel = {
  getContent: () => null,
  getSlug: () => '',
  onChange: () => {},
  now: () => new Date(),
  touchedAddress: new Set(),
  bound: false,
  qrSlug: null
};

function el(tag, attrs = {}, children = []) {
  const node = doc().createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children) if (child) node.append(child);
  return node;
}

function formatDateBR(iso) {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function ensureHours(content) {
  if (!content.businessHours || typeof content.businessHours !== 'object') {
    content.businessHours = { timeZone: BUSINESS_TIME_ZONE, week: {} };
  }
  const hours = content.businessHours;
  hours.timeZone = BUSINESS_TIME_ZONE;
  if (!hours.week || typeof hours.week !== 'object') hours.week = {};
  for (const day of EDITOR_DAYS) if (!Array.isArray(hours.week[day])) hours.week[day] = [];
  return hours;
}

function dropEmptyHours(content) {
  const hours = content.businessHours;
  if (!hours) return;
  const hasRanges = EDITOR_DAYS.some((day) => hours.week?.[day]?.length);
  if (!hasRanges && !(hours.closedDates?.length)) delete content.businessHours;
  else if (hours.closedDates && hours.closedDates.length === 0) delete hours.closedDates;
}

function commit({ rerender = false } = {}) {
  const content = panel.getContent();
  if (!content) return;
  dropEmptyHours(content);
  if (rerender) renderDays();
  renderHoursErrors();
  renderClosedDates();
  renderHoursStatus();
  panel.onChange();
}

function rangeInputId(day, index, part) {
  return `editor-hours-${day}-${index}-${part}`;
}

function renderDays() {
  const container = byId('editor-hours-days');
  const content = panel.getContent();
  if (!container || !content) return;
  const week = content.businessHours?.week ?? {};
  container.replaceChildren(
    ...EDITOR_DAYS.map((day) => {
      const ranges = Array.isArray(week[day]) ? week[day] : [];
      const label = WEEK_DAY_LABELS[day];
      const rows = ranges.map((range, index) => {
        const errorId = rangeInputId(day, index, 'error');
        const opens = el('input', {
          type: 'time', id: rangeInputId(day, index, 'opens'), className: 'item-input input-styled-height',
          'data-day': day, 'data-index': index, 'data-part': 'opens', 'aria-describedby': errorId
        });
        opens.value = range.opens ?? '';
        const closes = el('input', {
          type: 'time', id: rangeInputId(day, index, 'closes'), className: 'item-input input-styled-height',
          'data-day': day, 'data-index': index, 'data-part': 'closes', 'aria-describedby': errorId
        });
        closes.value = range.closes ?? '';
        const overnight = el('input', {
          type: 'checkbox', id: rangeInputId(day, index, 'overnight'),
          'data-day': day, 'data-index': index, 'data-part': 'overnight', 'aria-describedby': errorId
        });
        overnight.checked = range.overnight === true;
        return el('div', { className: 'hours-range', role: 'group', 'aria-label': `${label}, faixa ${index + 1}` }, [
          el('label', { className: 'hours-time', for: opens.id }, [el('span', { text: 'Abre' })]),
          opens,
          el('label', { className: 'hours-time', for: closes.id }, [el('span', { text: 'Fecha' })]),
          closes,
          el('label', { className: 'checkbox-label-styled hours-overnight', for: overnight.id }, [overnight, doc().createTextNode(' Termina no dia seguinte')]),
          el('button', {
            type: 'button', className: 'text-link-btn hours-remove', 'data-action': 'remove-range', 'data-day': day, 'data-index': index,
            'aria-label': `Remover faixa ${index + 1} de ${label.toLowerCase()}`, text: 'Remover'
          }),
          el('span', { id: errorId, className: 'form-error-msg hours-range-error', hidden: true })
        ]);
      });
      return el('div', { className: 'hours-day', 'data-day': day }, [
        el('span', { className: 'hours-day-label', id: `editor-hours-${day}-label`, text: label }),
        el('div', { className: 'hours-ranges' }, ranges.length ? rows : [el('span', { className: 'hours-day-closed', text: 'Fechado' })]),
        ranges.length < MAX_RANGES_PER_DAY
          ? el('button', {
            type: 'button', className: 'text-link-btn hours-add', 'data-action': 'add-range', 'data-day': day,
            'aria-label': `Adicionar faixa de horário em ${label.toLowerCase()}`, text: ranges.length ? 'Adicionar faixa' : 'Abrir neste dia'
          })
          : null
      ]);
    })
  );
}

function setFieldError(input, errorNode, message) {
  if (input) {
    if (message) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  if (errorNode && message) {
    errorNode.textContent = message;
    errorNode.hidden = false;
  }
}

function renderHoursErrors(extraErrors = []) {
  const content = panel.getContent();
  const container = byId('editor-hours-days');
  if (!container || !content) return [];
  for (const node of container.querySelectorAll('.hours-range-error')) {
    node.textContent = '';
    node.hidden = true;
  }
  for (const input of container.querySelectorAll('[aria-invalid]')) input.removeAttribute('aria-invalid');
  const closedError = byId('editor-hours-closed-error');
  if (closedError) {
    closedError.textContent = '';
    closedError.hidden = true;
  }
  const errors = [...validateBusinessHours(content.businessHours).errors, ...extraErrors.filter((e) => e.field?.startsWith('businessHours'))];
  const seen = new Set();
  for (const error of errors) {
    const [, group, day, index, part] = error.field.split('.');
    if (group === 'week' && day && index !== undefined) {
      const errorNode = byId(rangeInputId(day, index, 'error'));
      if (seen.has(errorNode)) continue;
      seen.add(errorNode);
      setFieldError(byId(rangeInputId(day, index, part ?? 'opens')), errorNode, error.message);
    } else if (group === 'closedDates') {
      setFieldError(byId('editor-hours-closed-date'), closedError, error.message);
    }
  }
  return errors;
}

function renderHoursStatus() {
  const status = byId('editor-hours-status');
  const content = panel.getContent();
  if (!status || !content) return;
  const { value, errors } = validateBusinessHours(content.businessHours);
  if (errors.length) {
    status.textContent = 'Corrija o horário para ver o selo da vitrine.';
    return;
  }
  const open = getOpenStatus(value, panel.now());
  status.textContent = open
    ? `Se publicado agora, a vitrine mostraria: "${open.label}".`
    : 'Sem horário, a vitrine não mostra o selo de aberto ou fechado.';
}

function renderClosedDates() {
  const list = byId('editor-hours-closed-list');
  const todayButton = byId('editor-hours-close-today');
  const content = panel.getContent();
  if (!list || !content) return;
  const today = todayInBusinessTimeZone(panel.now());
  const dates = content.businessHours?.closedDates ?? [];
  list.replaceChildren(
    ...dates.map((date) => {
      const label = date === today ? `Hoje (${formatDateBR(date)})` : formatDateBR(date);
      return el('li', {}, [
        el('span', { text: label }),
        el('button', { type: 'button', className: 'text-link-btn', 'data-action': 'reopen-date', 'data-date': date, 'aria-label': `Reabrir ${formatDateBR(date)}`, text: 'Reabrir' })
      ]);
    })
  );
  list.hidden = dates.length === 0;
  if (todayButton) {
    const closedToday = dates.includes(today);
    todayButton.setAttribute('aria-pressed', closedToday ? 'true' : 'false');
    todayButton.textContent = closedToday ? 'Reabrir hoje' : 'Fechado hoje';
  }
}

function setClosedDate(date, closed) {
  const content = panel.getContent();
  if (!content || !date) return;
  const hours = ensureHours(content);
  const today = todayInBusinessTimeZone(panel.now());
  const dates = new Set((hours.closedDates ?? []).filter((d) => d >= today));
  if (closed) dates.add(date);
  else dates.delete(date);
  hours.closedDates = [...dates].sort().slice(0, MAX_CLOSED_DATES);
  commit();
}

function readAddressInputs() {
  const raw = {};
  for (const field of ADDRESS_FIELDS) {
    const input = byId(`editor-address-${field}`);
    raw[field] = input ? input.value : '';
  }
  return raw;
}

function renderAddress({ showAll = false, extraErrors = [] } = {}) {
  const content = panel.getContent();
  if (!content) return;
  const { value, errors } = validatePublicAddress(content.publicAddress);
  const all = [...errors, ...extraErrors.filter((e) => e.field?.startsWith('publicAddress'))];
  for (const field of ADDRESS_FIELDS) {
    const input = byId(`editor-address-${field}`);
    const errorNode = byId(`editor-address-${field}-error`);
    if (errorNode) {
      errorNode.textContent = '';
      errorNode.hidden = true;
    }
    input?.removeAttribute('aria-invalid');
    const error = all.find((e) => e.field === `publicAddress.${field}`);
    if (error && (showAll || panel.touchedAddress.has(field))) setFieldError(input, errorNode, error.message);
  }
  const routeLink = byId('editor-address-route-link');
  if (routeLink) {
    const url = value ? buildRouteUrl(value) : '';
    routeLink.hidden = !url;
    routeLink.href = url || '#';
  }
}

function fillAddressInputs() {
  const address = panel.getContent()?.publicAddress ?? {};
  for (const field of ADDRESS_FIELDS) {
    const input = byId(`editor-address-${field}`);
    if (input) input.value = typeof address[field] === 'string' ? address[field] : '';
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = el('a', { href: url, download: filename });
  doc().body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function currentQr() {
  const slug = panel.getSlug() || 'vitrine';
  const url = buildQrTargetUrl(slug);
  return { slug, url, qr: encodeQr(url) };
}

function renderQr() {
  const preview = byId('editor-qr-preview');
  const urlNode = byId('editor-qr-url');
  if (!preview) return;
  const { slug, url, qr } = currentQr();
  if (panel.qrSlug === slug && preview.firstChild) return;
  panel.qrSlug = slug;
  // SVG gerado aqui mesmo, com o título escapado; a CSP do painel não aceita img com data: ou blob:.
  preview.innerHTML = qrToSvg(qr, { title: `QR Code da vitrine ${slug}` });
  if (urlNode) urlNode.textContent = url;
}

function bindEvents() {
  if (panel.bound) return;
  panel.bound = true;

  const days = byId('editor-hours-days');
  days?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action]');
    const content = panel.getContent();
    if (!button || !content) return;
    const { day } = button.dataset;
    const hours = ensureHours(content);
    if (button.dataset.action === 'add-range') {
      const ranges = hours.week[day];
      if (ranges.length >= MAX_RANGES_PER_DAY) return;
      ranges.push({ ...DEFAULT_RANGES[ranges.length] });
      commit({ rerender: true });
      byId(rangeInputId(day, ranges.length - 1, 'opens'))?.focus();
    } else if (button.dataset.action === 'remove-range') {
      hours.week[day].splice(Number(button.dataset.index), 1);
      commit({ rerender: true });
      days.querySelector(`.hours-day[data-day="${day}"] .hours-add`)?.focus();
    }
  });
  const onRangeInput = (event) => {
    const input = event.target;
    const content = panel.getContent();
    if (!input?.dataset?.part || !content) return;
    const range = ensureHours(content).week[input.dataset.day]?.[Number(input.dataset.index)];
    if (!range) return;
    if (input.dataset.part === 'overnight') {
      if (input.checked) range.overnight = true;
      else delete range.overnight;
    } else {
      range[input.dataset.part] = input.value;
    }
    commit();
  };
  days?.addEventListener('input', onRangeInput);
  days?.addEventListener('change', onRangeInput);

  byId('editor-hours-close-today')?.addEventListener('click', () => {
    const content = panel.getContent();
    if (!content) return;
    const today = todayInBusinessTimeZone(panel.now());
    setClosedDate(today, !(content.businessHours?.closedDates ?? []).includes(today));
  });
  byId('editor-hours-closed-add')?.addEventListener('click', () => {
    const input = byId('editor-hours-closed-date');
    if (!input?.value) {
      setFieldError(input, byId('editor-hours-closed-error'), 'Escolha uma data para fechar.');
      input?.focus();
      return;
    }
    setClosedDate(input.value, true);
    input.value = '';
  });
  byId('editor-hours-closed-list')?.addEventListener('click', (event) => {
    const button = event.target.closest?.('button[data-action="reopen-date"]');
    if (button) {
      setClosedDate(button.dataset.date, false);
      byId('editor-hours-close-today')?.focus();
    }
  });

  for (const field of ADDRESS_FIELDS) {
    const input = byId(`editor-address-${field}`);
    const update = () => {
      const content = panel.getContent();
      if (!content) return;
      const raw = readAddressInputs();
      if (ADDRESS_FIELDS.every((key) => !raw[key].trim())) delete content.publicAddress;
      else content.publicAddress = raw;
      renderAddress();
      panel.onChange();
    };
    input?.addEventListener('input', update);
    input?.addEventListener('change', update);
    input?.addEventListener('blur', () => {
      panel.touchedAddress.add(field);
      renderAddress();
    });
  }

  byId('editor-qr-svg')?.addEventListener('click', () => {
    const { slug, qr } = currentQr();
    downloadBlob(new Blob([qrToSvg(qr, { title: `QR Code da vitrine ${slug}` })], { type: 'image/svg+xml' }), `vitrine-${slug}-qr.svg`);
  });
  byId('editor-qr-png')?.addEventListener('click', () => {
    const { slug, qr } = currentQr();
    const canvas = drawQrOnCanvas(qr, doc().createElement('canvas'));
    canvas.toBlob((blob) => {
      if (blob) downloadBlob(blob, `vitrine-${slug}-qr.png`);
    }, 'image/png');
  });
}

function fillUfOptions() {
  const select = byId('editor-address-uf');
  if (!select || select.options.length) return;
  select.append(el('option', { value: '', text: 'UF' }), ...BRAZIL_UFS.map((uf) => el('option', { value: uf, text: uf })));
}

/**
 * Liga o painel de horário, endereço e QR Code ao rascunho aberto no editor.
 * `getContent` devolve sempre o conteúdo atual (o editor troca o objeto ao salvar).
 */
export function mountPlacePanel({ getContent, getSlug, onChange, now } = {}) {
  if (!byId('editor-hours-days')) return;
  panel.getContent = getContent ?? panel.getContent;
  panel.getSlug = getSlug ?? panel.getSlug;
  panel.onChange = onChange ?? panel.onChange;
  if (now) panel.now = now;
  panel.touchedAddress = new Set();
  panel.qrSlug = null;
  fillUfOptions();
  bindEvents();
  renderDays();
  renderHoursErrors();
  renderClosedDates();
  renderHoursStatus();
  fillAddressInputs();
  renderAddress();
  renderQr();
}

/**
 * Mostra no campo os erros de horário e endereço devolvidos pelo servidor e leva o
 * foco ao primeiro. Devolve `true` quando o erro era deste painel.
 */
export function showPlaceServerErrors(error, { focus = true, reveal } = {}) {
  const fieldErrors = Array.isArray(error?.fieldErrors) ? error.fieldErrors : error?.field ? [error] : [];
  const mine = fieldErrors.filter((e) => /^(businessHours|publicAddress)(\.|$)/.test(e.field ?? ''));
  if (!mine.length) return false;
  reveal?.();
  renderHoursErrors(mine);
  renderAddress({ showAll: true, extraErrors: mine });
  if (focus) {
    doc()?.querySelector('#editor-hours-group [aria-invalid="true"], #editor-address-group [aria-invalid="true"]')?.focus();
  }
  return true;
}
