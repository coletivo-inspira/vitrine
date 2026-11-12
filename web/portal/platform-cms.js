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
}

export async function detectPlatformCms(authenticated) {
  if (!open) return;
  const requestGeneration = ++generation;
  open.hidden = true;
  fields.replaceChildren();
  status.textContent = '';
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
