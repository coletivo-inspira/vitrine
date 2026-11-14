const doc = globalThis.document;
const section = doc?.getElementById('sponsor-impact-section');
const navItems = [...(doc?.querySelectorAll('.nav-sponsor-item') ?? [])];
const kpis = doc?.getElementById('sponsor-impact-kpis');
const statusLine = doc?.getElementById('sponsor-impact-status');
const content = doc?.getElementById('sponsor-impact-content');
const suppressedCard = doc?.getElementById('sponsor-impact-suppressed');
const monthsBody = doc?.getElementById('sponsor-impact-months');
const citiesBody = doc?.getElementById('sponsor-impact-cities');
const periodSelect = doc?.getElementById('sponsor-impact-period');
const periodLabel = doc?.getElementById('sponsor-impact-period-label');

let available = false;
let impact = null;
let generation = 0;
let onAvailable = () => {};

const MONTH_NAMES = ['jan.', 'fev.', 'mar.', 'abr.', 'mai.', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'];

export function formatImpactMonth(value, { long = false } = {}) {
  const match = /^(\d{4})-(\d{2})$/.exec(String(value ?? ''));
  if (!match) return '';
  const index = Number(match[2]) - 1;
  if (long) {
    const date = new Date(Date.UTC(Number(match[1]), index, 1));
    const name = date.toLocaleDateString('pt-BR', { month: 'long', timeZone: 'UTC' });
    return `${name} de ${match[1]}`;
  }
  return `${MONTH_NAMES[index]} ${match[1]}`;
}

function number(value) {
  return Number(value ?? 0).toLocaleString('pt-BR');
}

export function summarizeImpact(data) {
  if (!data || data.suppressed) return [];
  const totals = data.months.reduce((sum, entry) => ({
    visits: sum.visits + entry.visits,
    whatsappClicks: sum.whatsappClicks + entry.whatsappClicks
  }), { visits: 0, whatsappClicks: 0 });
  const current = data.months.at(-1) ?? { visits: 0, whatsappClicks: 0 };
  const range = data.firstMonth && data.lastMonth
    ? `de ${formatImpactMonth(data.firstMonth)} a ${formatImpactMonth(data.lastMonth)}`
    : 'nos últimos 12 meses';
  return [
    { label: 'Vitrines sociais ativas', value: number(data.activeSites), detail: 'plano Gratuito/Social, sem as arquivadas' },
    { label: 'Visitas', value: number(totals.visits), detail: range },
    { label: 'Cliques para enviar no WhatsApp', value: number(totals.whatsappClicks), detail: range },
    {
      label: 'Visitas neste mês', value: number(current.visits),
      detail: `${number(current.whatsappClicks)} cliques para enviar no WhatsApp`
    }
  ];
}

export function impactCityRows(data, month = '') {
  if (!data || data.suppressed) return [];
  return data.cities.map(city => {
    const entry = month ? city.months.find(item => item.month === month) : null;
    return {
      city: city.city,
      others: city.others,
      sites: city.sites,
      visits: month ? entry?.visits ?? 0 : city.visits,
      whatsappClicks: month ? entry?.whatsappClicks ?? 0 : city.whatsappClicks
    };
  });
}

function element(tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function cell(tag, text, className) {
  const node = element(tag, className, text);
  if (tag === 'th') node.scope = 'row';
  return node;
}

function renderKpis(data) {
  kpis.replaceChildren(...summarizeImpact(data).map(metric => {
    const item = element('li', 'portal-card admin-kpi');
    item.append(
      element('span', 'admin-kpi-label', metric.label),
      element('strong', 'admin-kpi-value', metric.value),
      element('span', 'admin-kpi-detail', metric.detail)
    );
    return item;
  }));
}

function renderMonths(data) {
  const peak = Math.max(1, ...data.months.map(entry => entry.visits));
  monthsBody.replaceChildren(...[...data.months].reverse().map(entry => {
    const row = element('tr');
    const name = cell('th', formatImpactMonth(entry.month));
    const visits = element('td', 'impact-cell-number');
    const bar = element('span', 'impact-bar');
    bar.setAttribute('aria-hidden', 'true');
    const fill = element('span', 'impact-bar-fill');
    fill.style.inlineSize = `${Math.round((entry.visits / peak) * 100)}%`;
    bar.append(fill);
    visits.append(element('span', 'impact-cell-value', number(entry.visits)), bar);
    row.append(name, visits, cell('td', number(entry.whatsappClicks), 'impact-cell-number'));
    return row;
  }));
}

function renderCities(data) {
  const month = periodSelect?.value ?? '';
  if (periodLabel) {
    periodLabel.textContent = month ? `Em ${formatImpactMonth(month, { long: true })}` : 'Somados nos últimos 12 meses';
  }
  citiesBody.replaceChildren(...impactCityRows(data, month).map(entry => {
    const row = element('tr', entry.others ? 'impact-row-others' : '');
    const name = cell('th', '');
    name.append(element('span', 'impact-city-name', entry.city));
    if (entry.others) {
      name.append(element('span', 'impact-city-note', `cidades com menos de ${data.minGroupSize} vitrines ou sem cidade informada`));
    }
    row.append(
      name,
      cell('td', number(entry.sites), 'impact-cell-number'),
      cell('td', number(entry.visits), 'impact-cell-number'),
      cell('td', number(entry.whatsappClicks), 'impact-cell-number')
    );
    return row;
  }));
}

function renderPeriodOptions(data) {
  if (!periodSelect) return;
  const previous = periodSelect.value;
  const options = [new Option('Últimos 12 meses', '')];
  for (const entry of [...data.months].reverse()) {
    options.push(new Option(formatImpactMonth(entry.month, { long: true }), entry.month));
  }
  periodSelect.replaceChildren(...options);
  periodSelect.value = data.months.some(entry => entry.month === previous) ? previous : '';
}

function render(data) {
  if (!section) return;
  const suppressed = !data || data.suppressed;
  suppressedCard.hidden = !suppressed;
  content.hidden = suppressed;
  kpis.hidden = suppressed;
  if (suppressed) {
    kpis.replaceChildren();
    monthsBody.replaceChildren();
    citiesBody.replaceChildren();
    return;
  }
  renderKpis(data);
  renderMonths(data);
  renderPeriodOptions(data);
  renderCities(data);
}

async function fetchImpact(fetchImpl) {
  const response = await fetchImpl('/api/sponsor/impact', { headers: { accept: 'application/json' } });
  if (!response.ok) {
    const error = new Error('Não foi possível carregar o impacto agora.');
    error.status = response.status;
    throw error;
  }
  return (await response.json()).impact;
}

function setAvailable(value) {
  available = value;
  for (const item of navItems) item.hidden = !value;
  if (!value && section) section.hidden = true;
}

export function hasSponsorImpactAccess() {
  return available;
}

export async function detectSponsorImpact(authenticated, fetchImpl = globalThis.fetch) {
  if (!section) return;
  const requestGeneration = ++generation;
  setAvailable(false);
  impact = null;
  if (statusLine) statusLine.textContent = '';
  render(null);
  if (!authenticated) return;
  try {
    const data = await fetchImpact(fetchImpl);
    if (requestGeneration !== generation) return;
    impact = data;
    render(impact);
    setAvailable(true);
    onAvailable();
  } catch {
    // "Impacto" só aparece depois que o servidor confirma o papel.
  }
}

async function refresh(fetchImpl = globalThis.fetch) {
  const requestGeneration = generation;
  if (statusLine) statusLine.textContent = 'Atualizando…';
  try {
    const data = await fetchImpact(fetchImpl);
    if (requestGeneration !== generation) return;
    impact = data;
    render(impact);
    statusLine.textContent = '';
  } catch (error) {
    if (requestGeneration !== generation) return;
    if (error.status === 403 || error.status === 401) {
      setAvailable(false);
      globalThis.window?.location?.assign?.('#inicio');
      return;
    }
    statusLine.textContent = impact
      ? 'Não foi possível atualizar agora; mostrando os últimos números carregados.'
      : error.message;
  }
}

export function showSponsorImpact(active) {
  const visible = active && available;
  const entering = visible && section?.hidden;
  if (section) section.hidden = !visible;
  if (!entering) return;
  doc?.getElementById('sponsor-impact-title')?.focus();
  void refresh();
}

export function initializeSponsorImpact(onAccessGranted) {
  if (typeof onAccessGranted === 'function') onAvailable = onAccessGranted;
  periodSelect?.addEventListener('change', () => {
    if (impact && !impact.suppressed) renderCities(impact);
  });
}
