import { renderStructureFields } from './showcase-structure.js';
import { attachWhatsappMask, extractPhoneDigits, formatWhatsappBR } from './phone-mask.mjs';
import { buildMilaForwardMessage, normalizeMilaRelayCode } from '../assets/mila-relay.mjs';
import { resetLinktreeImport } from './linktree-import.js';
import { loadSponsorAdmin, resetSponsorAdmin } from './sponsor-admin.mjs';
import { loadAutoReplyAdmin, resetAutoReplyAdmin } from './auto-reply-admin.mjs';
const section = globalThis.document?.getElementById('platform-cms-section');
const open = globalThis.document?.getElementById('platform-cms-open');
const navItems = [...(globalThis.document?.querySelectorAll('.nav-admin-item') ?? [])];
const fields = globalThis.document?.getElementById('platform-cms-fields');
const cmsList = globalThis.document?.getElementById('platform-cms-list');
const status = globalThis.document?.getElementById('platform-cms-status');
const publish = globalThis.document?.getElementById('platform-cms-publish');
const tabs = [...(globalThis.document?.querySelectorAll('.admin-tab') ?? [])];

const sectionNames = {
  hero: 'Abertura', value_props: 'Benefícios', areas_showcase: 'Áreas',
  templates_catalog: 'Modelos', featured_cases: 'Projetos em destaque',
  commercial_offer: 'Oferta', faq: 'Perguntas frequentes', announcements: 'Comunicados',
  header_nav: 'Navegação', footer: 'Rodapé'
};
const labels = {
  headline: 'Título', subtitle: 'Subtítulo', title: 'Título', items: 'Itens',
  areas: 'Áreas', freePlanTitle: 'Nome do plano básico', q: 'Pergunta', a: 'Resposta',
  bannerText: 'Comunicado', links: 'Links', label: 'Rótulo', href: 'Destino',
  copyright: 'Texto do rodapé'
};
const longTextKeys = new Set(['subtitle', 'a', 'bannerText']);
const MAX_LIST_ITEMS = 20;
const emptyItem = {
  areas: 'food',
  links: { label: '', href: '#inicio' },
  faq: { q: '', a: '' }
};

let available = false;
let onAvailable = () => {};
let generation = 0;

export function hasPlatformAdminAccess() {
  return available;
}

function setAvailable(value) {
  available = value;
  for (const item of navItems) item.hidden = !value;
  if (open) open.hidden = false;
  if (!value && section) section.hidden = true;
}

function button(text, type = 'button', variant = 'button-secondary') {
  const element = document.createElement('button');
  element.type = type;
  element.className = `button button-small ${variant} button-pill`.replace(/\s+/g, ' ');
  element.textContent = text;
  return element;
}

function emptyState(text) {
  const element = document.createElement('p');
  element.className = 'admin-empty';
  element.textContent = text;
  return element;
}

function badge(text, tone) {
  const element = document.createElement('span');
  element.className = `admin-badge admin-badge-${tone}`;
  element.textContent = text;
  return element;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

const confirmDialog = globalThis.document?.getElementById('platform-confirm');
const confirmTitle = globalThis.document?.getElementById('platform-confirm-title');
const confirmMessage = globalThis.document?.getElementById('platform-confirm-message');
const confirmList = globalThis.document?.getElementById('platform-confirm-list');
const confirmCancel = globalThis.document?.getElementById('platform-confirm-cancel');
const confirmAccept = globalThis.document?.getElementById('platform-confirm-accept');

export function confirmAction({ title, message, items = [], confirmLabel = 'Confirmar' }) {
  if (typeof confirmDialog?.showModal !== 'function') {
    return Promise.resolve(globalThis.confirm?.(`${title}\n\n${message}`) ?? false);
  }
  const trigger = document.activeElement;
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  confirmList.replaceChildren(...items.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  confirmList.hidden = !items.length;
  confirmAccept.textContent = confirmLabel;
  return new Promise(resolve => {
    const finish = accepted => {
      confirmAccept.removeEventListener('click', accept);
      confirmCancel.removeEventListener('click', cancel);
      confirmDialog.removeEventListener('cancel', cancel);
      if (confirmDialog.open) confirmDialog.close();
      trigger?.focus?.();
      resolve(accepted);
    };
    const accept = () => finish(true);
    const cancel = event => {
      event?.preventDefault?.();
      finish(false);
    };
    confirmAccept.addEventListener('click', accept);
    confirmCancel.addEventListener('click', cancel);
    confirmDialog.addEventListener('cancel', cancel);
    confirmDialog.showModal();
    confirmCancel.focus();
  });
}

export function nextTabIndex(current, key, count) {
  if (key === 'ArrowRight') return (current + 1) % count;
  if (key === 'ArrowLeft') return (current - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return -1;
}

function selectTab(tab, focus = false) {
  if (!tab) return;
  for (const entry of tabs) {
    const selected = entry === tab;
    entry.setAttribute('aria-selected', String(selected));
    entry.tabIndex = selected ? 0 : -1;
    const panel = document.getElementById(entry.getAttribute('aria-controls'));
    if (panel) panel.hidden = !selected;
  }
  if (focus) tab.focus();
  if (tab.getAttribute('aria-controls') === 'platform-templates') void loadTemplates();
  if (tab.getAttribute('aria-controls') === 'platform-sponsors') loadSponsorAdmin({ confirm: confirmAction });
  if (tab.getAttribute('aria-controls') === 'platform-auto-reply') loadAutoReplyAdmin({ confirm: confirmAction });
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab));
  tab.addEventListener('keydown', event => {
    const next = nextTabIndex(index, event.key, tabs.length);
    if (next < 0) return;
    event.preventDefault();
    selectTab(tabs[next], true);
  });
});

function field(parent, key, value, sectionKey) {
  const caption = labels[key] ?? key;
  if (Array.isArray(value)) {
    const group = document.createElement('fieldset');
    group.className = 'admin-fieldset';
    const legend = document.createElement('legend');
    legend.textContent = caption;
    const list = document.createElement('div');
    list.className = 'admin-array-list';
    const add = button('Adicionar item');
    add.setAttribute('aria-label', `Adicionar item em ${caption}`);
    const read = new Map();
    function syncLimit() {
      const full = read.size >= MAX_LIST_ITEMS;
      add.disabled = full;
      add.textContent = full ? `Limite de ${MAX_LIST_ITEMS} itens` : 'Adicionar item';
    }
    function append(item) {
      const row = document.createElement('div');
      row.className = 'admin-array-row';
      const body = document.createElement('div');
      body.className = 'admin-array-fields';
      const remove = button('Remover');
      remove.setAttribute('aria-label', `Remover item de ${caption}`);
      const getter = field(body, 'item', item, sectionKey);
      remove.addEventListener('click', () => {
        read.delete(row);
        row.remove();
        syncLimit();
        add.focus();
      });
      read.set(row, getter);
      row.append(body, remove);
      list.append(row);
      syncLimit();
    }
    value.forEach(append);
    syncLimit();
    add.addEventListener('click', () => {
      if (read.size < MAX_LIST_ITEMS) append(emptyItem[key] ?? emptyItem[sectionKey] ?? '');
    });
    group.append(legend, list, add);
    parent.append(group);
    return () => [...read.values()].map(getter => getter());
  }
  if (value && typeof value === 'object') {
    const getters = Object.entries(value).map(([childKey, item]) => [childKey, field(parent, childKey, item, sectionKey)]);
    return () => Object.fromEntries(getters.map(([childKey, getter]) => [childKey, getter()]));
  }
  const label = document.createElement('label');
  label.className = 'admin-field';
  const text = document.createElement('span');
  text.className = 'admin-field-label';
  text.textContent = caption === 'item' ? 'Item' : caption;
  const long = longTextKeys.has(key) || String(value ?? '').length > 90;
  const input = document.createElement(long ? 'textarea' : 'input');
  input.className = long ? 'textarea-goal admin-textarea' : 'item-input';
  if (long) input.rows = 3;
  input.value = value;
  input.required = true;
  input.maxLength = 1000;
  label.append(text, input);
  parent.append(label);
  return () => input.value.trim();
}

async function request(path = '', method = 'GET', payload) {
  const response = await fetch('/api/admin/cms' + path, {
    method,
    ...(payload === undefined ? {} : {
      headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
    })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw Object.assign(new Error(data?.error?.message ?? 'Não foi possível concluir a operação.'), {
      status: response.status
    });
  }
  return response.json();
}

const cmsEntries = new Map();
const dirtyCmsKeys = new Set();
const savedCmsKeys = new Set();
const reload = globalThis.document?.getElementById('platform-cms-reload');
let selectedCmsKey = null;

function sectionName(key) {
  return sectionNames[key] ?? key;
}

function visibilityBadge(visible) {
  return visible ? badge('Visível', 'visible') : badge('Oculta', 'hidden');
}

function publishedSummary(sections) {
  const latest = sections
    .map(entry => new Date(entry.publishedAt ?? '').getTime())
    .filter(Number.isFinite)
    .sort((a, b) => b - a)[0];
  return latest === undefined
    ? 'A página institucional ainda não foi publicada pelo painel.'
    : `Última publicação em ${formatDate(latest)}.`;
}

function renderCmsList() {
  const ordered = [...cmsEntries.values()].sort((a, b) =>
    a.entry.displayOrder - b.entry.displayOrder || a.entry.sectionKey.localeCompare(b.entry.sectionKey));
  cmsList.replaceChildren(...ordered.map(({ entry }) => {
    const item = document.createElement('li');
    const choose = document.createElement('button');
    choose.type = 'button';
    choose.className = 'admin-cms-item';
    choose.dataset.sectionKey = entry.sectionKey;
    if (entry.sectionKey === selectedCmsKey) choose.setAttribute('aria-current', 'true');
    const order = document.createElement('span');
    order.className = 'admin-cms-item-order';
    order.textContent = String(entry.displayOrder).padStart(2, '0');
    order.setAttribute('aria-label', `Ordem ${entry.displayOrder}`);
    const name = document.createElement('span');
    name.className = 'admin-cms-item-name';
    name.textContent = sectionName(entry.sectionKey);
    choose.append(order, name, visibilityBadge(entry.visible));
    choose.addEventListener('click', () => selectCmsSection(entry.sectionKey, true));
    item.append(choose);
    return item;
  }));
}

function selectCmsSection(key, fromList = false) {
  selectedCmsKey = key;
  for (const [sectionKey, { form }] of cmsEntries) form.hidden = sectionKey !== key;
  if (!fromList) {
    renderCmsList();
    return;
  }
  for (const choice of cmsList.querySelectorAll('.admin-cms-item')) {
    if (choice.dataset.sectionKey === key) choice.setAttribute('aria-current', 'true');
    else choice.removeAttribute('aria-current');
  }
  if (globalThis.matchMedia?.('(max-width: 899px)').matches) fields.scrollIntoView?.({ block: 'start' });
}

function buildCmsForm(entry) {
  const form = document.createElement('form');
  form.className = 'admin-cms-form';
  form.hidden = true;
  const header = document.createElement('div');
  header.className = 'admin-cms-form-header';
  const title = document.createElement('h2');
  title.id = `platform-cms-title-${entry.sectionKey}`;
  title.textContent = sectionName(entry.sectionKey);
  form.setAttribute('aria-labelledby', title.id);
  let stateBadge = visibilityBadge(entry.visible);
  header.append(title, stateBadge);

  const settings = document.createElement('div');
  settings.className = 'admin-cms-settings';
  const visible = document.createElement('input');
  visible.type = 'checkbox';
  visible.checked = entry.visible;
  const visibility = document.createElement('label');
  visibility.className = 'admin-check';
  visibility.append(visible, ' Exibir seção na página');
  const order = document.createElement('input');
  order.type = 'number';
  order.className = 'item-input admin-order-input';
  order.min = '0';
  order.max = '99';
  order.required = true;
  order.value = entry.displayOrder;
  const orderLabel = document.createElement('label');
  orderLabel.className = 'admin-field admin-field-inline';
  const orderText = document.createElement('span');
  orderText.className = 'admin-field-label';
  orderText.textContent = 'Posição na página';
  const orderHelp = document.createElement('span');
  orderHelp.className = 'admin-field-help';
  orderHelp.id = `platform-cms-order-help-${entry.sectionKey}`;
  orderHelp.textContent = 'De 0 a 99; números menores aparecem antes.';
  order.setAttribute('aria-describedby', orderHelp.id);
  orderLabel.append(orderText, order, orderHelp);
  settings.append(visibility, orderLabel);

  const content = document.createElement('div');
  content.className = 'admin-cms-content';
  const read = field(content, '', entry.content, entry.sectionKey);
  const actions = document.createElement('div');
  actions.className = 'admin-cms-actions';
  const formStatus = document.createElement('p');
  formStatus.className = 'admin-form-status';
  formStatus.setAttribute('role', 'status');
  const save = button('Salvar rascunho', 'submit', '');
  actions.append(formStatus, save);
  form.append(header, settings, content, actions);

  const markDirty = () => {
    dirtyCmsKeys.add(entry.sectionKey);
    formStatus.textContent = 'Alterações ainda não salvas.';
  };
  form.addEventListener('input', markDirty);
  form.addEventListener('click', event => {
    if (event.target?.type === 'button') markDirty();
  });

  form.addEventListener('submit', async event => {
    event.preventDefault();
    save.disabled = true;
    formStatus.textContent = 'Salvando…';
    try {
      const payload = { content: read(), visible: visible.checked, displayOrder: order.valueAsNumber };
      await request('/' + entry.sectionKey, 'PUT', payload);
      Object.assign(entry, { content: payload.content, visible: payload.visible, displayOrder: payload.displayOrder });
      const nextBadge = visibilityBadge(entry.visible);
      stateBadge.replaceWith(nextBadge);
      stateBadge = nextBadge;
      dirtyCmsKeys.delete(entry.sectionKey);
      savedCmsKeys.add(entry.sectionKey);
      renderCmsList();
      formStatus.textContent = 'Rascunho salvo. Publique a página para levar a mudança ao ar.';
    } catch (error) {
      formStatus.textContent = error.message;
    } finally {
      save.disabled = false;
    }
  });
  return form;
}

function renderCms(sections) {
  fields.replaceChildren();
  cmsEntries.clear();
  dirtyCmsKeys.clear();
  savedCmsKeys.clear();
  if (reload) reload.hidden = true;
  const previousKey = selectedCmsKey;
  selectedCmsKey = null;
  if (!sections.length) {
    cmsList.replaceChildren();
    fields.append(emptyState('Nenhuma seção institucional cadastrada ainda.'));
    status.textContent = '';
    return;
  }
  for (const entry of sections) {
    const form = buildCmsForm(entry);
    cmsEntries.set(entry.sectionKey, { entry, form });
    fields.append(form);
  }
  const [first] = [...cmsEntries.values()].sort((a, b) => a.entry.displayOrder - b.entry.displayOrder);
  selectCmsSection(cmsEntries.has(previousKey) ? previousKey : first.entry.sectionKey);
  status.textContent = publishedSummary(sections);
}

function sectionList(keys) {
  return [...keys].map(sectionName);
}

async function publishCms() {
  const unsaved = sectionList(dirtyCmsKeys);
  const saved = sectionList(savedCmsKeys);
  const accepted = await confirmAction({
    title: 'Publicar a página institucional?',
    message: unsaved.length
      ? 'Há alterações não salvas e elas não serão publicadas. Todas as seções vão ao ar com o último rascunho salvo, substituindo a versão atual da página.'
      : 'Todas as seções vão ao ar com o último rascunho salvo, substituindo a versão atual da página.',
    items: [
      ...saved.map(name => `${name}: rascunho salvo nesta sessão`),
      ...unsaved.map(name => `${name}: alterações não salvas (ficam de fora)`)
    ],
    confirmLabel: 'Publicar agora'
  });
  if (!accepted) return;
  publish.disabled = true;
  if (reload) reload.hidden = true;
  status.textContent = 'Publicando a página institucional…';
  try {
    await request('/publish', 'POST', {});
    savedCmsKeys.clear();
    status.textContent = `Página institucional publicada em ${formatDate(Date.now())}.`;
  } catch (error) {
    status.textContent = error.status === 409
      ? 'O rascunho mudou durante a publicação. Atualize o rascunho para conferir as seções e publique de novo.'
      : error.message;
    if (error.status === 409 && reload) reload.hidden = false;
  } finally {
    publish.disabled = false;
  }
}

async function reloadCms() {
  if (dirtyCmsKeys.size) {
    const accepted = await confirmAction({
      title: 'Descartar alterações não salvas?',
      message: 'Atualizar o rascunho recarrega as seções do servidor e descarta o que não foi salvo.',
      items: sectionList(dirtyCmsKeys),
      confirmLabel: 'Atualizar e descartar'
    });
    if (!accepted) return;
  }
  const currentGeneration = generation;
  reload.disabled = true;
  status.textContent = 'Atualizando o rascunho…';
  try {
    const { sections } = await request();
    if (currentGeneration !== generation) return;
    renderCms(sections);
  } catch (error) {
    if (currentGeneration === generation) status.textContent = error.message;
  } finally {
    reload.disabled = false;
  }
}

export function initializePlatformCms(onAccessGranted) {
  if (typeof onAccessGranted === 'function') onAvailable = onAccessGranted;
  publish?.addEventListener('click', () => void publishCms());
  reload?.addEventListener('click', () => void reloadCms());
  retry?.addEventListener('click', () => void loadOperations());
}

export function showPlatformCms(active) {
  const visible = active && available;
  const entering = visible && section?.hidden;
  if (section) section.hidden = !visible;
  if (!visible) return;
  if (entering) globalThis.document?.getElementById('platform-admin-title')?.focus();
  void loadOperations();
}

export async function detectPlatformCms(authenticated) {
  if (!section) return;
  const requestGeneration = ++generation;
  setAvailable(false);
  fields.replaceChildren();
  cmsList.replaceChildren(emptyState('Carregando seções…'));
  cmsEntries.clear();
  status.textContent = '';
  overviewList.replaceChildren();
  requestList.replaceChildren();
  auditList.replaceChildren();
  operationStatus.textContent = '';
  if (retry) retry.hidden = true;
  if (reload) reload.hidden = true;
  templatesLoaded = false;
  templateSelect.replaceChildren();
  templateFields.replaceChildren();
  templateStatus.textContent = '';
  resetMilaConsole();
  resetLinktreeImport();
  resetSponsorAdmin();
  resetAutoReplyAdmin();
  selectTab(tabs[0]);
  if (!authenticated) return;
  try {
    const { sections } = await request();
    if (requestGeneration !== generation) return;
    renderCms(sections);
    setAvailable(true);
    onAvailable();
  } catch {
    // A administração só aparece após autorização positiva do servidor.
  }
}

const operationStatus = globalThis.document?.getElementById('platform-operations-status');
const overviewList = globalThis.document?.getElementById('platform-overview');
const requestList = globalThis.document?.getElementById('platform-requests');
const auditList = globalThis.document?.getElementById('platform-audit');
const stages = { novo: 'Novo', em_analise: 'Em análise', respondido: 'Respondido', encerrado: 'Encerrado' };
const nextStage = { novo: 'em_analise', em_analise: 'respondido', respondido: 'encerrado' };
const retry = globalThis.document?.getElementById('platform-operations-retry');
const storefrontTypes = { food: 'Alimentação', art: 'Arte & design', photo: 'Fotografia & mídia', health: 'Saúde', tech: 'Tecnologia' };
const auditActions = {
  publish: 'Publicação', status_changed: 'Etapa alterada', template_created: 'Modelo criado',
  template_updated: 'Modelo atualizado', mila_relay_lookup: 'Código da Mila consultado',
  linktree_imported: 'Importação do Linktree', linktree_demo_invited: 'Dono convidado para a demonstração',
  linktree_demo_accepted: 'Demonstração aceita pelo dono',
  sponsor_granted: 'Acesso ao Impacto dado', sponsor_revoked: 'Acesso ao Impacto retirado',
  insert: 'Criação', update: 'Alteração', delete: 'Remoção'
};
const auditEntities = {
  platform_cms: 'página institucional', customization_request: 'pedido de customização',
  platform_operator: 'patrocinador',
  template: 'modelo de vitrine', site: 'vitrine', draft: 'rascunho da vitrine', publication: 'publicação da vitrine'
};

export function describeAudit(entry) {
  const action = auditActions[entry.action] ?? entry.action;
  const entity = auditEntities[entry.entity_type] ?? entry.entity_type;
  const target = entry.entity_type === 'template' && entry.entity_id ? ` ${entry.entity_id}` : '';
  const change = entry.summary?.from && entry.summary?.to
    ? ` (${stages[entry.summary.from] ?? entry.summary.from} → ${stages[entry.summary.to] ?? entry.summary.to})`
    : '';
  return `${action} · ${entity}${target}${change}`;
}

export function overviewMetrics(overview, requests = []) {
  const number = value => Number(value ?? 0).toLocaleString('pt-BR');
  const mb = bytes => (Number(bytes ?? 0) / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  const openRequests = requests.filter(entry => entry.status !== 'encerrado').length;
  return [
    { label: 'Vitrines', value: number(overview.siteCount), detail: 'cadastradas na plataforma' },
    {
      label: 'Pedidos em aberto', value: number(openRequests),
      detail: requests.length ? `de ${number(requests.length)} pedidos de customização` : 'nenhum pedido registrado'
    },
    {
      label: 'Banco de dados', value: `${mb(overview.databaseBytes)} MB`,
      detail: `de ${mb(overview.databaseLimitBytes)} MB do plano gratuito`,
      meter: { value: Number(overview.databaseBytes ?? 0), max: Number(overview.databaseLimitBytes ?? 1) }
    },
    { label: 'Arquivos', value: number(overview.assetCount), detail: 'imagens prontas nas vitrines' },
    {
      label: 'Domínios ativos', value: number(overview.activeDomainCount),
      detail: `${number(overview.reservedDomainCount)} de ${number(overview.domainLimit)} vagas reservadas`
    }
  ];
}

function renderMetrics(metrics) {
  overviewList.replaceChildren(...metrics.map(metric => {
    const item = document.createElement('li');
    item.className = 'portal-card admin-kpi';
    const label = document.createElement('span');
    label.className = 'admin-kpi-label';
    label.textContent = metric.label;
    const value = document.createElement('strong');
    value.className = 'admin-kpi-value';
    value.textContent = metric.value;
    const detail = document.createElement('span');
    detail.className = 'admin-kpi-detail';
    detail.textContent = metric.detail;
    item.append(label, value);
    if (metric.meter) {
      const meter = document.createElement('progress');
      meter.className = 'admin-kpi-meter';
      meter.max = metric.meter.max;
      meter.value = Math.min(metric.meter.value, metric.meter.max);
      meter.setAttribute('aria-label', `${metric.label}: ${metric.value} ${metric.detail}`);
      item.append(meter);
    }
    item.append(detail);
    return item;
  }));
}

function renderMetricPlaceholders(detail) {
  renderMetrics(['Vitrines', 'Pedidos em aberto', 'Banco de dados', 'Arquivos', 'Domínios ativos']
    .map(label => ({ label, value: '—', detail })));
}

async function operation(path, payload) {
  const response = await fetch('/api/admin/' + path, payload ? {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'A operação não pôde ser concluída.');
  return data;
}

function requestItem(entry) {
  const item = document.createElement('li');
  item.className = 'admin-request';
  item.dataset.requestId = entry.id;
  item.tabIndex = -1;
  const main = document.createElement('div');
  main.className = 'admin-request-main';
  const goal = document.createElement('span');
  goal.className = 'admin-request-goal';
  goal.textContent = entry.goal;
  main.append(badge(stages[entry.status] ?? entry.status, entry.status === 'encerrado' ? 'hidden' : 'stage'), goal);
  item.append(main);
  const created = formatDate(entry.created_at);
  const meta = [storefrontTypes[entry.storefront_type], created && `recebido em ${created}`].filter(Boolean);
  if (meta.length) {
    const details = document.createElement('span');
    details.className = 'admin-request-meta';
    details.textContent = meta.join(' · ');
    item.append(details);
  }
  const next = nextStage[entry.status];
  if (!next) return item;
  const advance = button(`Marcar como ${stages[next].toLowerCase()}`);
  advance.addEventListener('click', async () => {
    const accepted = await confirmAction({
      title: `Marcar como ${stages[next].toLowerCase()}?`,
      message: `O pedido "${entry.goal}" passa de ${stages[entry.status].toLowerCase()} para ${stages[next].toLowerCase()}. As etapas só avançam; não é possível voltar.`,
      confirmLabel: `Marcar como ${stages[next].toLowerCase()}`
    });
    if (!accepted) return;
    advance.disabled = true;
    try {
      await operation('customization-requests/' + encodeURIComponent(entry.id), { status: next });
      await loadOperations();
      [...requestList.children].find(row => row.dataset?.requestId === entry.id)?.focus();
    } catch (error) {
      operationStatus.textContent = error.message;
    } finally {
      advance.disabled = false;
    }
  });
  item.append(advance);
  return item;
}

function auditItem(entry) {
  const item = document.createElement('li');
  item.className = 'admin-audit';
  const when = document.createElement('time');
  when.dateTime = entry.created_at;
  when.textContent = formatDate(entry.created_at);
  const what = document.createElement('span');
  what.textContent = describeAudit(entry);
  item.append(when, what);
  return item;
}

async function loadOperations() {
  if (!available || section.hidden) return;
  const currentGeneration = generation;
  operationStatus.textContent = 'Carregando indicadores e pedidos…';
  if (!overviewList.children.length) renderMetricPlaceholders('carregando');
  if (retry) retry.hidden = true;
  const [overviewResult, requestsResult, logsResult] = await Promise.allSettled([
    operation('overview'), operation('customization-requests'), operation('audit-logs')
  ]);
  if (currentGeneration !== generation || section.hidden) return;
  const failures = [];
  const requests = requestsResult.status === 'fulfilled' ? requestsResult.value.requests : null;
  if (overviewResult.status === 'fulfilled') {
    renderMetrics(overviewMetrics(overviewResult.value.overview, requests ?? []));
  } else {
    renderMetricPlaceholders('indisponível no momento');
    failures.push(['indicadores', overviewResult.reason]);
  }
  if (requests) {
    requestList.replaceChildren(...requests.map(requestItem));
    if (!requests.length) requestList.append(emptyState('Nenhum pedido de customização registrado.'));
  } else {
    requestList.replaceChildren(emptyState('Não foi possível carregar os pedidos.'));
    failures.push(['pedidos', requestsResult.reason]);
  }
  if (logsResult.status === 'fulfilled') {
    const { logs } = logsResult.value;
    auditList.replaceChildren(...logs.map(auditItem));
    if (!logs.length) auditList.append(emptyState('Nenhuma atividade registrada.'));
  } else {
    auditList.replaceChildren(emptyState('Não foi possível carregar a atividade.'));
    failures.push(['atividade', logsResult.reason]);
  }
  operationStatus.textContent = failures.length
    ? `Não foi possível carregar ${failures.map(([name]) => name).join(', ')}: ${failures[0][1]?.message ?? 'erro desconhecido'}`
    : '';
  if (retry) retry.hidden = !failures.length;
}

const templateStatus = globalThis.document?.getElementById('platform-templates-status');
const templateSelect = globalThis.document?.getElementById('platform-template-select');
const templateFields = globalThis.document?.getElementById('platform-template-fields');
const templateCopy = globalThis.document?.getElementById('platform-template-copy');
let availableTemplates = [];
let templatesLoaded = false;

async function templateRequest(payload) {
  const response = await fetch('/api/admin/templates', payload ? {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'Não foi possível acessar os modelos.');
  return data;
}

function showSelectedTemplate(creating = false) {
  const template = availableTemplates.find(entry => entry.code === templateSelect.value);
  templateCopy.hidden = !template || !['pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1', 'servicos-produtos-v1'].includes(template.code);
  if (!template) {
    templateFields.replaceChildren();
    return;
  }
  const editor = document.createElement('div');
  templateFields.replaceChildren(editor);
  let code;
  if (creating) {
    const label = document.createElement('label');
    label.className = 'admin-field';
    const text = document.createElement('span');
    text.className = 'admin-field-label';
    text.textContent = 'Identificador do novo modelo';
    code = document.createElement('input');
    code.className = 'item-input';
    code.pattern = '[a-z0-9][a-z0-9_\\-]{1,63}';
    code.maxLength = 64;
    code.placeholder = 'vitrine-bistro';
    label.append(text, code);
    templateFields.prepend(label);
    code.focus();
  }
  renderStructureFields(editor, {
    theme: template.default_tokens,
    navigation: {},
    pages: [{ slug: 'home', title: 'Início', active: true, sections: template.default_sections }]
  }, async ({ name, themeOverrides, pages }) => {
    const currentGeneration = generation;
    const accepted = await confirmAction(creating ? {
      title: 'Criar o novo modelo?',
      message: `O modelo "${name}" fica disponível a partir de ${template.name}. As vitrines atuais não mudam.`,
      confirmLabel: 'Criar modelo'
    } : {
      title: `Salvar o modelo ${template.name}?`,
      message: 'Os novos padrões valem na próxima prévia ou publicação de todas as vitrines que usam este modelo. Não há versão anterior para restaurar pelo painel.',
      confirmLabel: 'Salvar modelo'
    });
    if (!accepted) return;
    try {
      const { template: saved } = await templateRequest({
        code: creating ? code.value.trim() : template.code, name,
        ...(creating ? { baseCode: template.code } : {}),
        defaultTokens: themeOverrides, defaultSections: pages[0].sections
      });
      if (currentGeneration !== generation) return;
      if (creating) {
        availableTemplates.push(saved);
        templateSelect.add(new Option(saved.name, saved.code, false, true));
        showSelectedTemplate();
      } else availableTemplates = availableTemplates.map(entry => entry.code === saved.code ? saved : entry);
      templateSelect.querySelectorAll('option').forEach(option => {
        if (option.value === saved.code) option.textContent = saved.name;
      });
      templateStatus.textContent = 'Modelo salvo. Os novos padrões serão usados na próxima prévia ou publicação.';
    } catch (error) {
      if (currentGeneration === generation) templateStatus.textContent = error.message;
    }
  }, [], creating ? '' : template.name);
}

templateSelect?.addEventListener('change', () => showSelectedTemplate());
templateCopy?.addEventListener('click', () => showSelectedTemplate(true));

async function loadTemplates() {
  if (templatesLoaded || !available || section.hidden) return;
  templatesLoaded = true;
  const currentGeneration = generation;
  templateStatus.textContent = 'Carregando modelos…';
  try {
    const { templates } = await templateRequest();
    if (currentGeneration !== generation) return;
    availableTemplates = templates;
    templateSelect.replaceChildren(...templates.map(entry => new Option(entry.name, entry.code)));
    templateStatus.textContent = templates.length ? '' : 'Nenhum modelo disponível.';
    showSelectedTemplate();
  } catch (error) {
    if (currentGeneration !== generation) return;
    templatesLoaded = false;
    templateStatus.textContent = error.message;
  }
}

const milaForm = globalThis.document?.getElementById('platform-mila-form');
const milaMessage = globalThis.document?.getElementById('platform-mila-message');
const milaCustomer = globalThis.document?.getElementById('platform-mila-customer');
const milaStatus = globalThis.document?.getElementById('platform-mila-status');
const milaResults = globalThis.document?.getElementById('platform-mila-results');

function resetMilaConsole() {
  if (!milaForm) return;
  milaForm.reset();
  milaStatus.textContent = '';
  milaResults.replaceChildren();
}

function renderMilaMatch(match, code, order, customerPhone) {
  const entry = document.createElement('li');
  entry.className = 'mila-console-match';
  const title = document.createElement('strong');
  title.textContent = match.name;
  const meta = document.createElement('span');
  meta.className = 'form-help';
  meta.textContent = `/${match.slug} · dono: ${formatWhatsappBR(match.whatsapp)}`;
  const forward = document.createElement('a');
  forward.className = 'button button-small button-pill';
  forward.target = '_blank';
  forward.rel = 'noopener noreferrer';
  forward.textContent = 'Repassar ao dono no WhatsApp';
  forward.href = `https://wa.me/${match.whatsapp}?text=${encodeURIComponent(
    buildMilaForwardMessage({ businessName: match.name, code, order, customerPhone })
  )}`;
  entry.append(title, meta, forward);
  return entry;
}

attachWhatsappMask(milaCustomer);
milaForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const order = milaMessage.value.trim();
  const code = normalizeMilaRelayCode(order);
  milaResults.replaceChildren();
  if (!code) {
    milaStatus.textContent = 'Não encontrei um código #VI-XXXXXX-XXXX na mensagem. Peça ao cliente para enviar o pedido pelo botão da vitrine.';
    milaMessage.focus();
    return;
  }
  const submit = milaForm.querySelector('button[type="submit"]');
  const currentGeneration = generation;
  submit.disabled = true;
  milaStatus.textContent = `Procurando a vitrine do código #${code}…`;
  try {
    const response = await fetch('/api/admin/mila-relay?code=' + encodeURIComponent(code));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? 'Não foi possível localizar a vitrine.');
    if (currentGeneration !== generation) return;
    const customerPhone = extractPhoneDigits(milaCustomer.value);
    milaResults.replaceChildren(...data.matches.map(match => renderMilaMatch(match, code, order, customerPhone)));
    milaStatus.textContent = !data.matches.length
      ? `Nenhuma vitrine publicada usa o código #${code} com pedidos pela Mila.`
      : data.matches.length > 1
        ? `${data.matches.length} vitrines usam o código #${code}. Confira o nome do negócio na mensagem antes de repassar.`
        : `Vitrine encontrada para #${code}.`;
  } catch (error) {
    if (currentGeneration === generation) milaStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});
