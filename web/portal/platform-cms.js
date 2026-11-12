import { renderStructureFields } from './showcase-structure.js';
import { attachWhatsappMask, extractPhoneDigits, formatWhatsappBR } from './phone-mask.mjs';
import { buildMilaForwardMessage, normalizeMilaRelayCode } from '../assets/mila-relay.mjs';
const section = globalThis.document?.getElementById('platform-cms-section');
const open = globalThis.document?.getElementById('platform-cms-open');
const fields = globalThis.document?.getElementById('platform-cms-fields');
const status = globalThis.document?.getElementById('platform-cms-status');
const publish = globalThis.document?.getElementById('platform-cms-publish');

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
const emptyItem = {
  areas: 'food',
  links: { label: '', href: '#inicio' },
  faq: { q: '', a: '' }
};

function button(text, type = 'button') {
  const element = document.createElement('button');
  element.type = type;
  element.className = 'button button-small button-secondary button-pill';
  element.textContent = text;
  return element;
}

function field(parent, key, value, sectionKey) {
  const caption = labels[key] ?? key;
  if (Array.isArray(value)) {
    const group = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = caption;
    const list = document.createElement('div');
    const add = button('Adicionar');
    const read = new Map();
    function append(item) {
      const row = document.createElement('div');
      const remove = button('Remover');
      remove.setAttribute('aria-label', `Remover item de ${caption}`);
      const getter = field(row, 'item', item, sectionKey);
      remove.addEventListener('click', () => {
        read.delete(row);
        row.remove();
        add.focus();
      });
      read.set(row, getter);
      row.append(remove);
      list.append(row);
    }
    value.forEach(append);
    add.addEventListener('click', () => {
      if (read.size < 20) append(emptyItem[key] ?? emptyItem[sectionKey] ?? '');
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
  label.textContent = caption === 'item' ? 'Item' : caption;
  const input = document.createElement('input');
  input.value = value;
  input.required = true;
  input.maxLength = 1000;
  label.append(input);
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
    throw new Error(data?.error?.message ?? 'Não foi possível concluir a operação.');
  }
  return response.json();
}

function render(sections) {
  fields.replaceChildren();
  for (const entry of sections) {
    const card = document.createElement('details');
    card.className = 'portal-card';
    const summary = document.createElement('summary');
    summary.textContent = sectionNames[entry.sectionKey] ?? entry.sectionKey;
    const form = document.createElement('form');
    const visible = document.createElement('input');
    visible.type = 'checkbox';
    visible.checked = entry.visible;
    const visibility = document.createElement('label');
    visibility.append(visible, ' Exibir seção');
    const order = document.createElement('input');
    order.type = 'number';
    order.min = '0';
    order.max = '99';
    order.required = true;
    order.value = entry.displayOrder;
    const orderLabel = document.createElement('label');
    orderLabel.append('Ordem ', order);
    form.append(visibility, orderLabel);
    const read = field(form, '', entry.content, entry.sectionKey);
    const save = button('Salvar rascunho', 'submit');
    form.append(save);
    form.addEventListener('submit', async event => {
      event.preventDefault();
      save.disabled = true;
      try {
        await request('/' + entry.sectionKey, 'PUT', {
          content: read(), visible: visible.checked, displayOrder: order.valueAsNumber
        });
        status.textContent = `Rascunho salvo em ${summary.textContent}.`;
      } catch (error) {
        status.textContent = error.message;
      } finally {
        save.disabled = false;
      }
    });
    card.append(summary, form);
    fields.append(card);
  }
}

export function initializePlatformCms(onOpen) {
  open?.addEventListener('click', onOpen);
  publish?.addEventListener('click', async () => {
    publish.disabled = true;
    try {
      await request('/publish', 'POST', {});
      status.textContent = 'Página institucional publicada.';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      publish.disabled = false;
    }
  });
}

let generation = 0;

export function showPlatformCms(active) {
  if (section) section.hidden = !active;
  if (active) void loadOperations();
}

export async function detectPlatformCms(authenticated) {
  if (!open) return;
  const requestGeneration = ++generation;
  open.hidden = true;
  fields.replaceChildren();
  status.textContent = '';
  if (operations) {
    operations.open = false;
    overviewList.replaceChildren();
    requestList.replaceChildren();
    auditList.replaceChildren();
  }
  if (templatePanel) {
    templatePanel.open = false;
    templateSelect.replaceChildren();
    templateFields.replaceChildren();
  }
  resetMilaConsole();
  if (!authenticated) return;
  try {
    const { sections } = await request();
    if (requestGeneration !== generation) return;
    render(sections);
    open.hidden = false;
  } catch {
    // A administração só aparece após autorização positiva do servidor.
  }
}

const operations = globalThis.document?.getElementById('platform-operations');
const operationStatus = globalThis.document?.getElementById('platform-operations-status');
const overviewList = globalThis.document?.getElementById('platform-overview');
const requestList = globalThis.document?.getElementById('platform-requests');
const auditList = globalThis.document?.getElementById('platform-audit');
const stages = { novo: 'Novo', em_analise: 'Em análise', respondido: 'Respondido', encerrado: 'Encerrado' };
const nextStage = { novo: 'em_analise', em_analise: 'respondido', respondido: 'encerrado' };

async function operation(path, payload) {
  const response = await fetch('/api/admin/' + path, payload ? {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
  } : {});
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message ?? 'A operação não pôde ser concluída.');
  return data;
}

function listItem(value) {
  const entry = document.createElement('li');
  entry.textContent = value;
  return entry;
}

async function loadOperations() {
  if (!operations?.open || section.hidden) return;
  const currentGeneration = generation;
  operationStatus.textContent = 'Carregando administração…';
  try {
    const [{ overview }, { requests }, { logs }] = await Promise.all([
      operation('overview'), operation('customization-requests'), operation('audit-logs')
    ]);
    if (currentGeneration !== generation || !operations.open || section.hidden) return;
    const mb = bytes => (bytes / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    overviewList.replaceChildren(...[
      `Banco: ${mb(overview.databaseBytes)} de ${mb(overview.databaseLimitBytes)} MB`,
      `Vitrines: ${overview.siteCount}`,
      `Arquivos: ${overview.assetCount}`,
      `Domínios ativos: ${overview.activeDomainCount} · vagas reservadas: ${overview.reservedDomainCount} de ${overview.domainLimit}`
    ].map(listItem));
    requestList.replaceChildren(...requests.map(entry => {
      const item = listItem(`${stages[entry.status] ?? entry.status} · ${entry.goal}`);
      const next = nextStage[entry.status];
      if (!next) return item;
      const advance = button(`Marcar como ${stages[next].toLowerCase()}`);
      advance.addEventListener('click', async () => {
        advance.disabled = true;
        try {
          await operation('customization-requests/' + encodeURIComponent(entry.id), { status: next });
          await loadOperations();
        } catch (error) {
          operationStatus.textContent = error.message;
        } finally {
          advance.disabled = false;
        }
      });
      item.append(' ', advance);
      return item;
    }));
    if (!requests.length) requestList.append(listItem('Nenhum pedido registrado.'));
    auditList.replaceChildren(...logs.map(entry => listItem(
      `${new Date(entry.created_at).toLocaleString('pt-BR')} · ${entry.action} · ${entry.entity_type}`
    )));
    if (!logs.length) auditList.append(listItem('Nenhuma atividade registrada.'));
    operationStatus.textContent = '';
  } catch (error) {
    if (currentGeneration === generation) operationStatus.textContent = error.message;
  }
}
operations?.addEventListener('toggle', loadOperations);

const templatePanel = globalThis.document?.getElementById('platform-templates');
const templateStatus = globalThis.document?.getElementById('platform-templates-status');
const templateSelect = globalThis.document?.getElementById('platform-template-select');
const templateFields = globalThis.document?.getElementById('platform-template-fields');
const templateCopy = globalThis.document?.getElementById('platform-template-copy');
let availableTemplates = [];

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
  templateCopy.hidden = !template || !['pizzeria-v1', 'products-v1', 'booking-v1', 'quote-v1'].includes(template.code);
  if (!template) {
    templateFields.replaceChildren();
    return;
  }
  const editor = document.createElement('div');
  templateFields.replaceChildren(editor);
  let code;
  if (creating) {
    const label = document.createElement('label');
    label.textContent = 'Identificador do novo modelo ';
    code = document.createElement('input');
    code.pattern = '[a-z0-9][a-z0-9_\\-]{1,63}';
    code.maxLength = 64;
    code.placeholder = 'cardapio-bistro';
    label.append(code);
    templateFields.prepend(label);
    code.focus();
  }
  renderStructureFields(editor, {
    theme: template.default_tokens,
    navigation: {},
    pages: [{ slug: 'home', title: 'Início', active: true, sections: template.default_sections }]
  }, async ({ name, themeOverrides, pages }) => {
    const currentGeneration = generation;
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
templatePanel?.addEventListener('toggle', async () => {
  if (!templatePanel.open || section.hidden) return;
  const currentGeneration = generation;
  templateStatus.textContent = 'Carregando modelos…';
  try {
    const { templates } = await templateRequest();
    if (currentGeneration !== generation || !templatePanel.open) return;
    availableTemplates = templates;
    templateSelect.replaceChildren(...templates.map(entry => new Option(entry.name, entry.code)));
    templateStatus.textContent = templates.length ? '' : 'Nenhum modelo disponível.';
    showSelectedTemplate();
  } catch (error) {
    if (currentGeneration === generation) templateStatus.textContent = error.message;
  }
});

const milaPanel = globalThis.document?.getElementById('platform-mila');
const milaForm = globalThis.document?.getElementById('platform-mila-form');
const milaMessage = globalThis.document?.getElementById('platform-mila-message');
const milaCustomer = globalThis.document?.getElementById('platform-mila-customer');
const milaStatus = globalThis.document?.getElementById('platform-mila-status');
const milaResults = globalThis.document?.getElementById('platform-mila-results');

function resetMilaConsole() {
  if (!milaPanel) return;
  milaPanel.open = false;
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
