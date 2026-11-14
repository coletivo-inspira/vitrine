import { HIGHLIGHT_ICON_LABELS, highlightIconSvg } from '../assets/highlight-icons.mjs';
import { lockAction, unlockAction } from './plan-gate.mjs';

const modules = {
  hero: ['Cabeçalho', { headline: 'Título', subtitle: 'Subtítulo' }],
  highlights: ['Destaques', {}],
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

const DEFAULT_EYEBROW = 'Atendimento direto no WhatsApp';
const HERO_EXTRA_KEYS = ['eyebrow', 'imageUrl', 'imageAlt', 'primaryAction', 'secondaryAction'];

function fieldHelp(doc, group, element, text) {
  const help = el(doc, 'p', 'form-help', text);
  help.id = `${element.id}-help`;
  group.appendChild(help);
  element.setAttribute('aria-describedby', help.id);
  return help;
}

function fieldError(doc, group, element) {
  const error = el(doc, 'p', 'form-error-msg structure-field-error');
  error.id = `${element.id}-error`;
  error.hidden = true;
  error.setAttribute('role', 'alert');
  group.appendChild(error);
  const describedBy = element.getAttribute('aria-describedby');
  element.setAttribute('aria-describedby', describedBy ? `${describedBy} ${error.id}` : error.id);
  return {
    show(message) {
      error.textContent = message;
      error.hidden = false;
      element.setAttribute('aria-invalid', 'true');
    },
    clear() {
      error.textContent = '';
      error.hidden = true;
      element.setAttribute('aria-invalid', 'false');
    }
  };
}

function actionTargetOptions(pages = []) {
  const options = {
    '': 'Sem botão',
    selecao: 'Rolar até os itens',
    whatsapp: 'Conversa no WhatsApp'
  };
  for (const page of pages) {
    if (page.slug && page.slug !== 'home') options[`pagina:${page.slug}`] = `Página: ${page.title || page.slug}`;
  }
  const home = pages.find((page) => page.slug === 'home');
  for (const section of home?.sections ?? []) {
    if (section.id && modules[section.moduleCode] && section.moduleCode !== 'hero') {
      options[`#${section.id}`] = `Seção: ${modules[section.moduleCode][0]}`;
    }
  }
  return options;
}

function renderHeroExtras(doc, grid, config = {}, { pages = [], uploadImage = null } = {}) {
  const eyebrow = labeledInput(doc, grid, 'Rótulo acima do título', config.eyebrow ?? DEFAULT_EYEBROW);
  eyebrow.element.maxLength = 40;
  fieldHelp(doc, eyebrow.group, eyebrow.element, 'Até 40 caracteres. Deixe vazio para não mostrar.');

  const image = labeledInput(doc, grid, 'Foto do cabeçalho (endereço WebP)', config.imageUrl);
  image.element.inputMode = 'url';
  image.element.autocomplete = 'off';
  image.element.placeholder = 'https://…/foto.webp';
  const imageStatus = fieldHelp(doc, image.group, image.element,
    'Foto real sua ou do negócio. Convertida para WebP de até 100 KB ao enviar, para abrir rápido no celular.');
  if (uploadImage) {
    const actions = el(doc, 'div', 'structure-image-actions');
    const file = doc.createElement('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    file.setAttribute('aria-hidden', 'true');
    file.tabIndex = -1;
    const send = el(doc, 'button', 'button button-small button-secondary button-pill', 'Enviar foto');
    send.type = 'button';
    send.addEventListener('click', () => file.click());
    const remove = el(doc, 'button', 'button button-small button-secondary button-pill', 'Remover foto');
    remove.type = 'button';
    remove.addEventListener('click', () => {
      image.element.value = '';
      image.element.dispatchEvent(new Event('input', { bubbles: true }));
    });
    file.addEventListener('change', async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      send.disabled = true;
      imageStatus.textContent = 'Preparando a foto…';
      try {
        const { url, bytes } = await uploadImage(chosen);
        image.element.value = url;
        image.element.dispatchEvent(new Event('input', { bubbles: true }));
        imageStatus.textContent = `Foto enviada (${Math.ceil(bytes / 1024)} KB, WebP).`;
      } catch (error) {
        imageStatus.textContent = error.message;
      } finally {
        send.disabled = false;
        file.value = '';
      }
    });
    actions.append(send, remove, file);
    image.group.appendChild(actions);
  }

  const alt = labeledInput(doc, grid, 'Descrição da foto (para leitores de tela)', config.imageAlt);
  alt.element.maxLength = 160;
  alt.element.placeholder = 'Ex: Laura sorrindo no ateliê, com peças de cerâmica';
  fieldHelp(doc, alt.group, alt.element, 'Obrigatória quando houver foto. Diga quem ou o que aparece.');
  const altError = fieldError(doc, alt.group, alt.element);

  const targets = actionTargetOptions(pages);
  const actionFields = [
    ['primaryAction', 'Botão principal', 'Ex: Ver turmas'],
    ['secondaryAction', 'Link secundário', 'Ex: Conversar no WhatsApp']
  ].map(([key, caption, placeholder]) => {
    const box = el(doc, 'div', 'structure-hero-action');
    const label = labeledInput(doc, box, `${caption}: texto`, config[key]?.label);
    label.element.maxLength = 28;
    label.element.placeholder = placeholder;
    fieldHelp(doc, label.group, label.element, 'Até 28 caracteres.');
    const current = config[key]?.target;
    const options = current && !targets[current] ? { ...targets, [current]: current } : targets;
    const target = labeledInput(doc, box, `${caption}: destino`, current ?? '', options);
    const labelError = fieldError(doc, label.group, label.element);
    const targetError = fieldError(doc, target.group, target.element);
    grid.appendChild(box);
    return { key, label: label.element, target: target.element, labelError, targetError };
  });

  const preview = el(doc, 'div', 'structure-hero-preview');
  preview.setAttribute('aria-label', 'Prévia do cabeçalho');
  preview.setAttribute('role', 'group');
  const previewCopy = el(doc, 'div', 'structure-hero-preview-copy');
  const pEyebrow = el(doc, 'span', 'structure-hero-preview-eyebrow');
  const pTitle = el(doc, 'strong', 'structure-hero-preview-title');
  const pSubtitle = el(doc, 'span', 'structure-hero-preview-subtitle');
  const pActions = el(doc, 'span', 'structure-hero-preview-actions');
  previewCopy.append(pEyebrow, pTitle, pSubtitle, pActions);
  const pPhoto = doc.createElement('img');
  pPhoto.className = 'structure-hero-preview-photo';
  pPhoto.width = 120;
  pPhoto.height = 150;
  pPhoto.alt = '';
  pPhoto.loading = 'lazy';
  preview.append(previewCopy, pPhoto);
  grid.appendChild(preview);

  return {
    preview(headline, subtitle) {
      pEyebrow.textContent = eyebrow.element.value.trim();
      pEyebrow.hidden = !pEyebrow.textContent;
      pTitle.textContent = headline || 'Título da vitrine';
      pSubtitle.textContent = subtitle || '';
      pActions.replaceChildren();
      for (const action of actionFields) {
        const text = action.label.value.trim();
        if (!text) continue;
        pActions.appendChild(el(doc, 'span',
          action.key === 'primaryAction' ? 'structure-hero-preview-primary' : 'structure-hero-preview-secondary', text));
      }
      const url = image.element.value.trim();
      pPhoto.hidden = !url;
      if (url) pPhoto.src = url;
      if (url) preview.classList.add('has-photo');
      else preview.classList.remove('has-photo');
    },
    read() {
      const values = {};
      const eyebrowValue = eyebrow.element.value.trim();
      if (config.eyebrow !== undefined || eyebrowValue !== DEFAULT_EYEBROW) values.eyebrow = eyebrowValue;
      const url = image.element.value.trim();
      if (url) {
        values.imageUrl = url;
        values.imageAlt = alt.element.value.trim();
      }
      for (const action of actionFields) {
        const label = action.label.value.trim();
        if (label || action.target.value) values[action.key] = { label, target: action.target.value };
      }
      return values;
    },
    validate() {
      let firstInvalid = null;
      altError.clear();
      if (image.element.value.trim() && !alt.element.value.trim()) {
        altError.show('Descreva a foto para publicar o cabeçalho com imagem.');
        firstInvalid = alt.element;
      }
      for (const action of actionFields) {
        action.labelError.clear();
        action.targetError.clear();
        const label = action.label.value.trim();
        if (label && !action.target.value) {
          action.targetError.show('Escolha para onde o botão leva.');
          firstInvalid ??= action.target;
        } else if (!label && action.target.value) {
          action.labelError.show('Escreva o texto do botão ou escolha "Sem botão".');
          firstInvalid ??= action.label;
        }
      }
      firstInvalid?.focus();
      return !firstInvalid;
    }
  };
}

function renderHighlightsEditor(doc, grid, config = {}) {
  const box = el(doc, 'div', 'structure-highlights-editor');
  const list = el(doc, 'div', 'structure-highlights-list');
  const preview = el(doc, 'ul', 'structure-highlights-preview');
  preview.setAttribute('aria-label', 'Prévia dos destaques');
  const status = el(doc, 'p', 'form-help', 'De 2 a 4 destaques, cada um com ícone e uma linha de até 60 caracteres.');
  status.id = nextFieldId('highlights-help', doc);
  const error = el(doc, 'p', 'form-error-msg structure-field-error');
  error.hidden = true;
  error.setAttribute('role', 'alert');
  const addBtn = el(doc, 'button', 'button button-small button-secondary button-pill structure-add-btn', '+ Adicionar destaque');
  addBtn.type = 'button';

  const syncButtons = () => {
    const rows = [...list.children];
    addBtn.disabled = rows.length >= 4;
    for (const row of rows) row.removeBtn.disabled = rows.length <= 2;
  };

  const updatePreview = () => {
    preview.replaceChildren();
    for (const row of list.children) {
      const text = row.text.value.trim();
      if (!text) continue;
      const item = el(doc, 'li', 'structure-highlights-preview-item');
      const icon = el(doc, 'span', 'structure-highlights-preview-icon');
      icon.innerHTML = highlightIconSvg(row.icon.value);
      item.append(icon, el(doc, 'span', '', text));
      preview.appendChild(item);
    }
    preview.hidden = !preview.children.length;
  };

  function append(entry = {}) {
    const row = el(doc, 'div', 'structure-highlight-row');
    const position = list.children.length + 1;
    const icon = labeledInput(doc, row, `Ícone do destaque ${position}`, entry.icon ?? 'estrela', HIGHLIGHT_ICON_LABELS);
    const text = labeledInput(doc, row, `Texto do destaque ${position}`, entry.text, null, 'structure-highlight-text');
    text.element.maxLength = 60;
    text.element.placeholder = position === 1 ? 'Ex: Ao vivo, sem gravação' : 'Ex: Turmas pequenas';
    text.element.setAttribute('aria-describedby', status.id);
    row.icon = icon.element;
    row.text = text.element;
    row.removeBtn = iconActionBtn(doc, `Remover destaque ${position}`, 'icon-trash', () => {
      row.remove();
      syncButtons();
      updatePreview();
    }, 'trash-color-btn');
    const actions = el(doc, 'div', 'structure-row-actions');
    actions.appendChild(row.removeBtn);
    row.appendChild(actions);
    list.appendChild(row);
    syncButtons();
  }

  const initial = config.items?.length ? config.items : [{}, {}];
  initial.forEach(append);
  addBtn.addEventListener('click', () => {
    if (list.children.length < 4) append();
    list.lastElementChild?.text.focus();
  });
  box.addEventListener('input', updatePreview);
  box.addEventListener('change', updatePreview);
  box.append(status, list, addBtn, error, preview);
  grid.appendChild(box);
  updatePreview();

  return {
    read() {
      return [...list.children]
        .map((row) => ({ icon: row.icon.value, text: row.text.value.trim() }))
        .filter((item) => item.text);
    },
    validate() {
      const filled = this.read().length;
      error.hidden = true;
      error.textContent = '';
      if (filled === 0 || (filled >= 2 && filled <= 4)) return true;
      error.textContent = 'Preencha pelo menos 2 destaques ou deixe todos vazios.';
      error.hidden = false;
      const empty = [...list.children].find((row) => !row.text.value.trim());
      empty?.text.focus();
      return false;
    }
  };
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

  // Selo do plano no botão de seção quando os blocos de itens do plano acabaram.
  const blockGate = choices?.planGate?.itemBlocks ?? null;
  const gateSyncs = [];
  const countActiveItemBlocks = () => [...pageList.children]
    .map((page) => page.read?.())
    .filter((page) => page && page.active !== false)
    .flatMap((page) => page.sections ?? [])
    .filter((section) => section.moduleCode === 'catalog_grid' && section.active !== false).length;
  const syncGates = () => gateSyncs.forEach((sync) => sync());
  form.addEventListener('click', () => queueMicrotask(syncGates));
  form.addEventListener('change', () => queueMicrotask(syncGates));

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

      const heroExtras = section.moduleCode === 'hero'
        ? renderHeroExtras(doc, secFieldsGrid, section.config, { pages: structure.pages, uploadImage: choices?.uploadImage })
        : null;
      const highlightsEditor = section.moduleCode === 'highlights'
        ? renderHighlightsEditor(doc, secFieldsGrid, section.config)
        : null;
      if (heroExtras) {
        const fieldValue = (key) => getters.find(([name]) => name === key)?.[1].value.trim();
        const refresh = () => heroExtras.preview(fieldValue('headline'), fieldValue('subtitle'));
        secFieldsGrid.addEventListener('input', refresh);
        secFieldsGrid.addEventListener('change', refresh);
        refresh();
      }

      if (getters.length > 0 || widgetChoice || highlightsEditor) {
        row.appendChild(secFieldsGrid);
      }

      row.validate = () => (heroExtras?.validate() ?? true) && (highlightsEditor?.validate() ?? true);

      const readConfig = () => {
        if (widgetChoice) {
          return {
            widgetId: widgetChoice.value,
            bundleHash: widgets.find((widget) => widget.id === widgetChoice.value)?.hash
          };
        }
        const config = {
          ...section.config,
          ...Object.fromEntries(getters.map(([key, value]) => [key, value.value]))
        };
        if (heroExtras) {
          for (const key of HERO_EXTRA_KEYS) delete config[key];
          Object.assign(config, heroExtras.read());
        }
        if (highlightsEditor) config.items = highlightsEditor.read();
        return config;
      };

      row.read = () => ({
        id: section.id,
        moduleCode: section.moduleCode,
        active: enabled.checked,
        config: readConfig()
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
    if (blockGate?.plan) {
      const sync = () => {
        const full = moduleSelect.value === 'catalog_grid' && countActiveItemBlocks() >= blockGate.max;
        if (full && !addSecBtn.dataset.planLocked) {
          lockAction(
            addSecBtn,
            blockGate.plan,
            `Seu plano tem ${blockGate.max === 1 ? '1 bloco' : `${blockGate.max} blocos`} de itens. Mais blocos fazem parte do plano ${blockGate.plan.name}; o botão leva a Plano e cobrança.`
          );
        } else if (!full && addSecBtn.dataset.planLocked) {
          unlockAction(addSecBtn);
        }
      };
      moduleSelect.addEventListener('change', sync);
      gateSyncs.push(sync);
      sync();
    }

    detailsCard.appendChild(pageBody);
    detailsCard.validate = () => [...sections.children].every((row) => row.validate?.() ?? true);
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
    if (![...pageList.children].every((page) => page.validate?.() ?? true)) return;
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

  syncGates();
  root.replaceChildren(form);
}
