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

const TEMPLATE_SWATCHES = {
  '': '#C74414',
  'pizzeria-v1': '#C74414',
  'products-v1': '#133824',
  'booking-v1': '#2E5E4E',
  'quote-v1': '#8C5A32'
};

let uidCounter = 0;
function nextFieldId(prefix, doc = globalThis.document) {
  uidCounter += 1;
  return `struct-${prefix}-${uidCounter}`;
}

function el(doc, tag, className = '', text = '') {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function labeledInput(doc, parent, caption, value, options = null, extraClass = '') {
  const group = el(doc, 'div', `form-group structure-field-group ${extraClass}`.trim());
  const id = nextFieldId('field', doc);
  const label = el(doc, 'label', 'structure-field-label', caption);
  label.setAttribute('for', id);

  const element = doc.createElement(options ? 'select' : 'input');
  element.id = id;
  if (options) {
    element.className = 'select-styled';
    for (const [key, text] of Object.entries(options)) {
      const option = el(doc, 'option', '', text);
      option.value = key;
      element.appendChild(option);
    }
  } else {
    element.type = 'text';
    element.className = 'item-input input-styled-height';
  }
  element.value = value ?? '';
  group.appendChild(label);
  group.appendChild(element);
  parent.appendChild(group);
  return { group, label, element };
}

function iconActionBtn(doc, ariaLabel, symbolId, onClick, extraClass = '') {
  const btn = el(doc, 'button', `icon-btn structure-icon-btn ${extraClass}`.trim());
  btn.type = 'button';
  btn.setAttribute('aria-label', ariaLabel);
  btn.title = ariaLabel;
  btn.innerHTML = `<svg width="16" height="16" aria-hidden="true"><use href="#${symbolId}"/></svg>`;
  btn.addEventListener('click', onClick);
  return btn;
}

function reorderButtons(doc, row, list, label) {
  return [
    iconActionBtn(doc, `Subir ${label}`, 'icon-up', () => {
      if (row.previousElementSibling) list.insertBefore(row, row.previousElementSibling);
    }),
    iconActionBtn(doc, `Descer ${label}`, 'icon-down', () => {
      if (row.nextElementSibling) list.insertBefore(row.nextElementSibling, row);
    })
  ];
}

export function renderStructureFields(root, structure, onSave, widgets = [], templateName = null, choices = null) {
  const doc = root?.ownerDocument || globalThis.document;
  const form = el(doc, 'form', 'structure-editor-form form-flex-col');
  const editingTemplate = templateName !== null;

  let nameInput = null;
  if (editingTemplate) {
    const { element } = labeledInput(doc, form, 'Nome do modelo', templateName);
    element.required = true;
    element.maxLength = 120;
    nameInput = element;
  }

  let selectedModelValue = choices?.selected ?? '';
  const hasModelChoices = Boolean(choices?.templates?.length);

  if (hasModelChoices) {
    const modelCard = el(doc, 'section', 'structure-section-card');
    const modelHeader = el(doc, 'div', 'structure-section-header');
    modelHeader.appendChild(el(doc, 'h4', 'structure-section-title', 'Modelo visual'));
    modelHeader.appendChild(
      el(doc, 'p', 'form-help', 'Escolha a base visual da vitrine mantendo seus itens e categorias.')
    );
    modelCard.appendChild(modelHeader);

    const grid = el(doc, 'div', 'structure-model-grid');
    grid.setAttribute('role', 'radiogroup');
    grid.setAttribute('aria-label', 'Modelo visual');

    const allChoices = [
      { code: '', name: 'Modelo original' },
      ...choices.templates.map((entry) => ({
        code: entry.code,
        name: entry.name,
        color: entry.defaultTokens?.accentColor
      }))
    ];

    const renderModelCards = () => {
      grid.replaceChildren();
      for (const item of allChoices) {
        const cardBtn = el(
          doc,
          'button',
          `structure-model-card ${selectedModelValue === item.code ? 'is-selected' : ''}`.trim()
        );
        cardBtn.type = 'button';
        cardBtn.setAttribute('role', 'radio');
        cardBtn.setAttribute('aria-checked', selectedModelValue === item.code ? 'true' : 'false');
        cardBtn.setAttribute('data-template-code', item.code);

        const thumb = el(doc, 'span', 'structure-model-thumb');
        const swatchColor = item.color || TEMPLATE_SWATCHES[item.code] || '#C74414';
        thumb.setAttribute('data-swatch', swatchColor);

        const dot = el(doc, 'span', 'structure-model-swatch-dot');
        if (item.code === 'booking-v1') dot.classList.add('swatch-forest');
        else if (item.code === 'quote-v1') dot.classList.add('swatch-earth');
        else if (item.code === 'products-v1') dot.classList.add('swatch-deep');
        thumb.appendChild(dot);

        const labelStrong = el(doc, 'strong', 'structure-model-name', item.name);
        cardBtn.appendChild(thumb);
        cardBtn.appendChild(labelStrong);

        cardBtn.addEventListener('click', () => {
          selectedModelValue = item.code;
          renderModelCards();
        });

        grid.appendChild(cardBtn);
      }
    };

    renderModelCards();
    modelCard.appendChild(grid);
    form.appendChild(modelCard);
  }

  // Visual Identity Card
  const themeCard = el(doc, 'section', 'structure-section-card');
  const themeHeader = el(doc, 'div', 'structure-section-header');
  themeHeader.appendChild(el(doc, 'h4', 'structure-section-title', 'Identidade visual'));
  themeHeader.appendChild(
    el(doc, 'p', 'form-help', 'Cor de destaque, combinação tipográfica e formato dos botões.')
  );
  themeCard.appendChild(themeHeader);

  const themeGrid = el(doc, 'div', 'structure-theme-grid');

  // Accent Color with color picker + hex input
  const colorGroup = el(doc, 'div', 'form-group structure-field-group');
  const hexId = nextFieldId('accent-hex', doc);
  const pickerId = nextFieldId('accent-picker', doc);
  const colorLabel = el(doc, 'label', 'structure-field-label', 'Cor de destaque (hexadecimal)');
  colorLabel.setAttribute('for', hexId);

  const colorRow = el(doc, 'div', 'structure-color-control');
  const colorPicker = el(doc, 'input', 'structure-color-picker');
  colorPicker.type = 'color';
  colorPicker.id = pickerId;
  colorPicker.setAttribute('aria-label', 'Escolher cor de destaque');
  const initialColor =
    typeof structure.theme?.accentColor === 'string' &&
    /^#[0-9a-fA-F]{6}$/.test(structure.theme.accentColor.trim())
      ? structure.theme.accentColor.trim()
      : '#C74414';
  colorPicker.value = initialColor;

  const accent = el(doc, 'input', 'item-input input-styled-height structure-hex-input');
  accent.type = 'text';
  accent.id = hexId;
  accent.placeholder = '#C74414';
  accent.maxLength = 7;
  accent.value = structure.theme?.accentColor ?? '';

  colorPicker.addEventListener('input', () => {
    accent.value = colorPicker.value.toUpperCase();
  });
  accent.addEventListener('input', () => {
    const val = accent.value.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(val)) {
      colorPicker.value = val;
    }
  });

  colorRow.appendChild(colorPicker);
  colorRow.appendChild(accent);
  colorGroup.appendChild(colorLabel);
  colorGroup.appendChild(colorRow);
  themeGrid.appendChild(colorGroup);

  // Typography select + font preview
  const fontOptions = {
    '': 'Padrão (Syne + DM Sans)',
    'editorial-syne': 'Syne Editorial',
    'modern-inter': 'Sans Contemporânea',
    'playful-poppins': 'Sans Geométrica',
    'classic-garamond': 'Serifada Clássica (Garamond)'
  };
  const { group: fontGroup, element: font } = labeledInput(
    doc,
    themeGrid,
    'Tipografia',
    structure.theme?.fontPair ?? '',
    fontOptions
  );
  const fontSample = el(doc, 'span', 'structure-font-sample', 'Aa Bb Cc — Vitrine Inspira');
  const syncFontSample = () => {
    fontSample.setAttribute('data-font-pair', font.value || 'editorial-syne');
  };
  syncFontSample();
  font.addEventListener('change', syncFontSample);
  fontGroup.appendChild(fontSample);

  themeCard.appendChild(themeGrid);

  // Button shape visual selector (3 options: pílula, arredondado, reto)
  const shapeGroup = el(doc, 'div', 'form-group structure-field-group');
  shapeGroup.appendChild(el(doc, 'span', 'structure-field-label', 'Formato dos botões'));

  let selectedShape = structure.theme?.buttonStyle ?? '';
  const shapeOptions = [
    { value: 'pill', label: 'Pílula', sampleClass: 'shape-sample-pill' },
    { value: 'rounded', label: 'Arredondado', sampleClass: 'shape-sample-rounded' },
    { value: '', label: 'Reto (padrão)', sampleClass: 'shape-sample-straight' }
  ];

  const shapeRow = el(doc, 'div', 'structure-shape-grid');
  shapeRow.setAttribute('role', 'radiogroup');
  shapeRow.setAttribute('aria-label', 'Formato dos botões');

  const renderShapeButtons = () => {
    shapeRow.replaceChildren();
    for (const opt of shapeOptions) {
      const btn = el(
        doc,
        'button',
        `structure-shape-option ${selectedShape === opt.value ? 'is-selected' : ''}`.trim()
      );
      btn.type = 'button';
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', selectedShape === opt.value ? 'true' : 'false');
      btn.setAttribute('data-shape-value', opt.value);

      const pillPreview = el(doc, 'span', `structure-shape-preview ${opt.sampleClass}`, 'Botão');
      const textSpan = el(doc, 'span', 'structure-shape-label', opt.label);
      btn.appendChild(pillPreview);
      btn.appendChild(textSpan);

      btn.addEventListener('click', () => {
        selectedShape = opt.value;
        renderShapeButtons();
      });
      shapeRow.appendChild(btn);
    }
  };
  renderShapeButtons();
  shapeGroup.appendChild(shapeRow);
  themeCard.appendChild(shapeGroup);
  form.appendChild(themeCard);

  // Navigation Menus (Header & Footer)
  const navEntries = editingTemplate
    ? []
    : [
        ['header', 'Menu do cabeçalho'],
        ['footer', 'Menu do rodapé']
      ];

  const navReaders = Object.fromEntries(
    navEntries.map(([key, title]) => {
      const group = el(doc, 'section', 'structure-section-card');
      const header = el(doc, 'div', 'structure-section-header structure-header-inline');
      header.appendChild(el(doc, 'h4', 'structure-section-title', title));

      const list = el(doc, 'div', 'structure-links-list');

      function append(link = {}) {
        const row = el(doc, 'div', 'structure-link-row');
        const { element: label } = labeledInput(
          doc,
          row,
          'Texto do link',
          link.label,
          null,
          'structure-link-col'
        );
        const { element: href } = labeledInput(
          doc,
          row,
          'Destino',
          link.href,
          null,
          'structure-link-col'
        );
        label.required = true;
        label.placeholder = 'Ex: Sobre';
        href.required = true;
        href.placeholder = '#sec-sobre';
        row.read = () => ({ label: label.value, href: href.value });

        const actionsCol = el(doc, 'div', 'structure-row-actions');
        actionsCol.append(
          ...reorderButtons(doc, row, list, 'link'),
          iconActionBtn(
            doc,
            'Remover link',
            'icon-trash',
            () => row.remove(),
            'trash-color-btn'
          )
        );
        row.appendChild(actionsCol);
        list.appendChild(row);
      }

      (structure.navigation?.[key] ?? []).forEach(append);

      const addBtn = el(
        doc,
        'button',
        'button button-small button-secondary button-pill structure-add-btn',
        '+ Adicionar link'
      );
      addBtn.type = 'button';
      addBtn.addEventListener('click', () => {
        if (list.children.length < 15) append();
      });

      header.appendChild(addBtn);
      group.appendChild(header);
      group.appendChild(list);
      form.appendChild(group);
      return [key, () => [...list.children].map((row) => row.read())];
    })
  );

  // Pages & Sections
  const pagesCard = el(doc, 'section', 'structure-section-card');
  const pagesHeader = el(doc, 'div', 'structure-section-header structure-header-inline');
  pagesHeader.appendChild(el(doc, 'h4', 'structure-section-title', 'Páginas e seções'));
  const pageList = el(doc, 'div', 'structure-pages-list');

  function appendPage(page = { slug: '', title: '', active: true, sections: [] }) {
    const detailsCard = el(doc, 'details', 'structure-page-card');
    detailsCard.open = true;

    const summary = el(doc, 'summary', 'structure-page-summary');
    const summaryTitle = el(
      doc,
      'strong',
      'structure-page-summary-title',
      editingTemplate ? 'Seções padrão' : page.title || 'Nova página'
    );
    summary.appendChild(summaryTitle);

    if (!editingTemplate) {
      const pageActions = el(doc, 'div', 'structure-row-actions');
      pageActions.addEventListener('click', (e) => e.stopPropagation());
      pageActions.append(
        ...reorderButtons(doc, detailsCard, pageList, 'página'),
        iconActionBtn(
          doc,
          'Remover página',
          'icon-trash',
          () => detailsCard.remove(),
          'trash-color-btn'
        )
      );
      summary.appendChild(pageActions);
    }

    detailsCard.appendChild(summary);

    const pageBody = el(doc, 'div', 'structure-page-body');
    const pageMetaRow = el(doc, 'div', 'structure-page-meta-grid');

    const { group: titleGroup, element: title } = labeledInput(
      doc,
      pageMetaRow,
      'Título da página',
      page.title
    );
    const { group: slugGroup, element: slug } = labeledInput(
      doc,
      pageMetaRow,
      'Identificador (slug)',
      page.slug
    );
    title.required = true;
    slug.required = true;
    title.addEventListener('input', () => {
      if (!editingTemplate) {
        summaryTitle.textContent = title.value.trim() || 'Nova página';
      }
    });

    const visibleLabel = el(doc, 'label', 'toggle-container-forms structure-toggle-pill');
    const visible = el(doc, 'input');
    visible.type = 'checkbox';
    visible.checked = page.active !== false;
    visibleLabel.appendChild(visible);
    visibleLabel.appendChild(el(doc, 'span', '', 'Exibir página'));
    pageMetaRow.appendChild(visibleLabel);

    if (editingTemplate) {
      titleGroup.hidden = true;
      slugGroup.hidden = true;
      visibleLabel.hidden = true;
      pageMetaRow.hidden = true;
    }

    pageBody.appendChild(pageMetaRow);

    const sections = el(doc, 'div', 'structure-sections-list');

    function appendSection(section) {
      const row = el(doc, 'div', 'structure-section-item');
      const [modName, fields] = modules[section.moduleCode];

      const secTopBar = el(doc, 'div', 'structure-section-item-header');
      const badge = el(doc, 'span', 'structure-module-badge', modName);
      secTopBar.appendChild(badge);

      const secControls = el(doc, 'div', 'structure-row-actions');
      const enabledLabel = el(doc, 'label', 'toggle-container-forms');
      const enabled = el(doc, 'input');
      enabled.type = 'checkbox';
      enabled.checked = section.active !== false;
      enabledLabel.appendChild(enabled);
      enabledLabel.appendChild(el(doc, 'span', '', 'Exibir seção'));

      secControls.append(
        enabledLabel,
        ...reorderButtons(doc, row, sections, 'seção'),
        iconActionBtn(
          doc,
          'Remover seção',
          'icon-trash',
          () => row.remove(),
          'trash-color-btn'
        )
      );
      secTopBar.appendChild(secControls);
      row.appendChild(secTopBar);

      const secFieldsGrid = el(doc, 'div', 'structure-section-fields-grid');
      const getters = Object.entries(fields).map(([key, label]) => {
        const { element } = labeledInput(doc, secFieldsGrid, label, section.config?.[key]);
        return [key, element];
      });

      const widgetChoice =
        section.moduleCode === 'custom_sandbox'
          ? labeledInput(
              doc,
              secFieldsGrid,
              'Componente',
              section.config?.widgetId,
              Object.fromEntries(
                widgets.map((widget) => [widget.id, `${widget.name} · ${widget.version}`])
              )
            ).element
          : null;

      if (getters.length > 0 || widgetChoice) {
        row.appendChild(secFieldsGrid);
      }

      row.read = () => ({
        id: section.id,
        moduleCode: section.moduleCode,
        active: enabled.checked,
        config: widgetChoice
          ? {
              widgetId: widgetChoice.value,
              bundleHash: widgets.find((widget) => widget.id === widgetChoice.value)?.hash
            }
          : {
              ...section.config,
              ...Object.fromEntries(getters.map(([key, value]) => [key, value.value]))
            }
      });

      sections.appendChild(row);
    }

    (page.sections || [])
      .filter((section) => Object.hasOwn(modules, section.moduleCode))
      .forEach(appendSection);

    pageBody.appendChild(sections);

    // Add Section bar at the bottom of the page
    const addSecBar = el(doc, 'div', 'structure-add-section-bar');
    const availableModules = Object.fromEntries(
      Object.entries(modules)
        .filter(([key]) => key !== 'custom_sandbox' || widgets.length)
        .map(([key, [label]]) => [key, label])
    );
    const { element: moduleSelect } = labeledInput(
      doc,
      addSecBar,
      'Tipo da nova seção',
      'about_story',
      availableModules,
      'structure-add-sec-select-group'
    );
    const addSecBtn = el(
      doc,
      'button',
      'button button-small button-secondary button-pill',
      '+ Adicionar seção'
    );
    addSecBtn.type = 'button';
    addSecBtn.addEventListener('click', () => {
      if (sections.children.length >= 15) return;
      const widget = widgets[0];
      const config =
        moduleSelect.value === 'custom_sandbox'
          ? { widgetId: widget.id, bundleHash: widget.hash }
          : {};
      appendSection({
        id: 'sec-' + crypto.randomUUID().slice(0, 12),
        moduleCode: moduleSelect.value,
        config
      });
    });
    addSecBar.appendChild(addSecBtn);
    pageBody.appendChild(addSecBar);

    detailsCard.appendChild(pageBody);
    detailsCard.read = () => ({
      title: title.value,
      slug: slug.value,
      active: visible.checked,
      sections: [...sections.children].map((row) => row.read())
    });
    pageList.appendChild(detailsCard);
  }

  (structure.pages || []).forEach(appendPage);

  if (!editingTemplate) {
    const addPageBtn = el(
      doc,
      'button',
      'button button-small button-secondary button-pill',
      '+ Adicionar página'
    );
    addPageBtn.type = 'button';
    addPageBtn.addEventListener('click', () => {
      if (pageList.children.length < 5) appendPage();
    });
    pagesHeader.appendChild(addPageBtn);
  }

  pagesCard.appendChild(pagesHeader);
  pagesCard.appendChild(pageList);
  form.appendChild(pagesCard);

  const save = el(
    doc,
    'button',
    'button button-small button-pill structure-save-btn',
    editingTemplate ? 'Salvar modelo' : 'Salvar estrutura'
  );
  save.type = 'submit';
  form.appendChild(save);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    save.disabled = true;
    try {
      await onSave({
        themeOverrides: Object.fromEntries(
          Object.entries({
            accentColor: accent.value.trim(),
            fontPair: font.value,
            buttonStyle: selectedShape
          }).filter(([, value]) => value)
        ),
        navigationMenus: Object.fromEntries(
          Object.entries(navReaders).map(([key, read]) => [key, read()])
        ),
        pages: [...pageList.children].map((row) => row.read()),
        ...(nameInput ? { name: nameInput.value } : {}),
        ...(hasModelChoices && selectedModelValue !== (choices.selected ?? '')
          ? { templateCode: selectedModelValue || null }
          : {})
      });
    } finally {
      save.disabled = false;
    }
  });

  root.replaceChildren(form);
}
