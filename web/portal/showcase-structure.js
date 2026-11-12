const modules = {
  hero: ['Cabeçalho', { headline: 'Título', subtitle: 'Subtítulo' }],
  catalog_grid: ['Vitrine', {}],
  service_booking: ['Agendamento', {}],
  quote_request: ['Orçamento', {}],
  about_story: ['Sobre', { bio: 'Apresentação' }],
  hours_location: ['Horários e localização', { scheduleText: 'Horários', addressText: 'Endereço' }],
  faq: ['Perguntas frequentes', {}],
  testimonials: ['Depoimentos', {}],
  links_bio: ['Links', {}],
  custom_sandbox: ['Componente aprovado', {}]
};

function control(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function action(text, onClick) {
  const button = control('button', text);
  button.type = 'button';
  button.className = 'button button-small button-secondary button-pill';
  button.addEventListener('click', onClick);
  return button;
}

function input(parent, caption, value, options) {
  const label = control('label', caption);
  const element = document.createElement(options ? 'select' : 'input');
  if (options) for (const [key, text] of Object.entries(options)) {
    const option = control('option', text);
    option.value = key;
    element.append(option);
  }
  element.value = value ?? '';
  label.append(element);
  parent.append(label);
  return element;
}

function checkbox(parent, text, checked) {
  const label = document.createElement('label');
  const element = document.createElement('input');
  element.type = 'checkbox';
  element.checked = checked;
  label.append(element, text);
  parent.append(label);
  return element;
}

function reorder(row, list, label) {
  return [
    action(`Subir ${label}`, () => {
      if (row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    }),
    action(`Descer ${label}`, () => {
      if (row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    })
  ];
}

export function renderStructureFields(root, structure, onSave, widgets = [], templateName = null, choices = null) {
  const form = document.createElement('form');
  const editingTemplate = templateName !== null;
  const name = editingTemplate ? input(form, 'Nome do modelo', templateName) : null;
  if (name) {
    name.required = true;
    name.maxLength = 120;
  }
  const model = choices?.templates?.length
    ? input(form, 'Modelo visual', choices.selected ?? '', {
      '': 'Modelo original', ...Object.fromEntries(choices.templates.map(entry => [entry.code, entry.name]))
    })
    : null;
  const theme = document.createElement('fieldset');
  theme.append(control('legend', 'Identidade visual'));
  const accent = input(theme, 'Cor de destaque em hexadecimal', structure.theme.accentColor);
  accent.placeholder = '#C74414';
  const font = input(theme, 'Tipografia', structure.theme.fontPair ?? '', {
    '': 'Padrão', 'editorial-syne': 'Syne', 'modern-inter': 'Sans contemporânea',
    'playful-poppins': 'Sans geométrica', 'classic-garamond': 'Serifada'
  });
  const shape = input(theme, 'Formato dos botões', structure.theme.buttonStyle ?? '', {
    '': 'Padrão', pill: 'Pílula', rounded: 'Arredondado'
  });
  form.append(theme);

  const navReaders = Object.fromEntries((editingTemplate ? [] : [['header', 'Menu do cabeçalho'], ['footer', 'Menu do rodapé']]).map(([key, title]) => {
    const group = document.createElement('fieldset');
    group.append(control('legend', title));
    const list = document.createElement('div');
    function append(link = {}) {
      const row = document.createElement('div');
      const label = input(row, 'Nome do link', link.label);
      const href = input(row, 'Destino', link.href);
      label.required = true;
      href.required = true;
      href.placeholder = '#sec-sobre';
      row.read = () => ({ label: label.value, href: href.value });
      row.append(...reorder(row, list, 'link'), action('Remover link', () => row.remove()));
      list.append(row);
    }
    (structure.navigation[key] ?? []).forEach(append);
    group.append(list, action('Adicionar link', () => {
      if (list.children.length < 15) append();
    }));
    form.append(group);
    return [key, () => [...list.children].map(row => row.read())];
  }));

  const pages = document.createElement('fieldset');
  pages.append(control('legend', 'Páginas e seções'));
  const pageList = document.createElement('div');

  function appendPage(page = { slug: '', title: '', active: true, sections: [] }) {
    const card = document.createElement('fieldset');
    card.append(control('legend', editingTemplate ? 'Seções padrão' : page.title || 'Nova página'));
    const title = input(card, 'Título', page.title);
    const slug = input(card, 'Identificador', page.slug);
    title.required = true;
    slug.required = true;
    if (editingTemplate) {
      title.parentElement.hidden = true;
      slug.parentElement.hidden = true;
    }
    const visible = checkbox(card, ' Exibir página', page.active);
    if (editingTemplate) visible.parentElement.hidden = true;
    const sections = document.createElement('div');

    function appendSection(section) {
      const row = document.createElement('fieldset');
      const [name, fields] = modules[section.moduleCode];
      row.append(control('legend', name));
      const enabled = checkbox(row, ' Exibir seção', section.active !== false);
      const getters = Object.entries(fields).map(([key, label]) => [
        key, input(row, label, section.config?.[key])
      ]);
      const widgetChoice = section.moduleCode === 'custom_sandbox'
        ? input(row, 'Componente', section.config?.widgetId, Object.fromEntries(widgets.map(widget => [
          widget.id, `${widget.name} · ${widget.version}`
        ])))
        : null;
      row.read = () => ({
        id: section.id, moduleCode: section.moduleCode, active: enabled.checked,
        config: widgetChoice
          ? { widgetId: widgetChoice.value, bundleHash: widgets.find(widget => widget.id === widgetChoice.value)?.hash }
          : { ...section.config, ...Object.fromEntries(getters.map(([key, value]) => [key, value.value])) }
      });
      row.append(
        ...reorder(row, sections, 'seção'),
        action('Remover seção', () => row.remove())
      );
      sections.append(row);
    }

    page.sections.filter(section => Object.hasOwn(modules, section.moduleCode)).forEach(appendSection);
    const module = input(card, 'Tipo da nova seção', 'about_story', Object.fromEntries(
      Object.entries(modules).filter(([key]) => key !== 'custom_sandbox' || widgets.length).map(([key, [label]]) => [key, label])
    ));
    card.append(
      action('Adicionar seção', () => {
        if (sections.children.length >= 15) return;
        const widget = widgets[0];
        const config = module.value === 'custom_sandbox' ? { widgetId: widget.id, bundleHash: widget.hash } : {};
        appendSection({ id: 'sec-' + crypto.randomUUID().slice(0, 12), moduleCode: module.value, config });
      }),
      sections
    );
    if (!editingTemplate) card.append(...reorder(card, pageList, 'página'), action('Remover página', () => card.remove()));
    card.read = () => ({
      title: title.value, slug: slug.value, active: visible.checked,
      sections: [...sections.children].map(row => row.read())
    });
    pageList.append(card);
  }

  structure.pages.forEach(appendPage);
  pages.append(pageList);
  if (!editingTemplate) pages.append(action('Adicionar página', () => {
    if (pageList.children.length < 5) appendPage();
  }));
  const save = control('button', editingTemplate ? 'Salvar modelo' : 'Salvar estrutura');
  save.type = 'submit';
  save.className = 'button button-small button-pill';
  form.append(pages, save);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await onSave({
        themeOverrides: Object.fromEntries(Object.entries({
          accentColor: accent.value.trim(), fontPair: font.value, buttonStyle: shape.value
        }).filter(([, value]) => value)),
        navigationMenus: Object.fromEntries(Object.entries(navReaders).map(([key, read]) => [key, read()])),
        pages: [...pageList.children].map(row => row.read()),
        ...(name ? { name: name.value } : {}),
        ...(model && model.value !== (choices.selected ?? '') ? { templateCode: model.value || null } : {})
      });
    } finally {
      save.disabled = false;
    }
  });
  root.replaceChildren(form);
}
