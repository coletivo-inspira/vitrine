export const PROFILE_INTEREST_OPTIONS = Object.freeze([
  { value: 'cardapio-digital', label: 'Vitrine online' },
  { value: 'agendamento', label: 'Agendamento de serviços' },
  { value: 'orcamento-whatsapp', label: 'Orçamento pelo WhatsApp' },
  { value: 'dominio-proprio', label: 'Domínio próprio' },
  { value: 'identidade-visual', label: 'Identidade visual' },
  { value: 'fotografia-conteudo', label: 'Fotografia e conteúdo' },
  { value: 'automacao-atendimento', label: 'Automação de atendimento' },
  { value: 'design-sob-medida', label: 'Design sob medida' }
]);

export const MAX_PROFILE_INTERESTS = 8;

const PRESET_LABEL_MAP = new Map(
  PROFILE_INTEREST_OPTIONS.map((opt) => [opt.value, opt.label])
);

function normalizeForSearch(str) {
  return String(str ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function cleanCustomInterestText(raw) {
  return String(raw ?? '')
    .replace(/[\u0000-\u001F\u007F<>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

export function getInterestDisplayLabel(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (PRESET_LABEL_MAP.has(trimmed)) {
    return PRESET_LABEL_MAP.get(trimmed);
  }
  if (trimmed.startsWith('outro:')) {
    return trimmed.slice(6).trim();
  }
  return trimmed;
}

export function createInterestsMultiSelect(container, options = {}) {
  if (!container) {
    return {
      getValues: () => [],
      setValues: () => {}
    };
  }

  const doc = container.ownerDocument || globalThis.document;
  const inputId = options.inputId || `${container.id || 'interests'}-combobox`;
  const listboxId = `${inputId}-listbox`;
  const maxItems = options.maxItems || MAX_PROFILE_INTERESTS;
  const onChange = typeof options.onChange === 'function' ? options.onChange : null;

  let selected = [];
  let isOpen = false;
  let activeIndex = -1;
  let currentItems = [];

  container.replaceChildren();
  container.classList.add('multi-select-root');

  const controlBox = doc.createElement('div');
  controlBox.className = 'multi-select-control';

  const tagsWrap = doc.createElement('div');
  tagsWrap.className = 'multi-select-tags';

  const input = doc.createElement('input');
  input.type = 'text';
  input.id = inputId;
  input.className = 'multi-select-input';
  input.placeholder = options.placeholder || 'Buscar ou digitar área de interesse...';
  input.autocomplete = 'off';
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listboxId);
  input.setAttribute('aria-haspopup', 'listbox');

  controlBox.appendChild(tagsWrap);
  controlBox.appendChild(input);

  const listbox = doc.createElement('ul');
  listbox.id = listboxId;
  listbox.className = 'multi-select-listbox';
  listbox.setAttribute('role', 'listbox');
  listbox.setAttribute('aria-label', 'Opções de áreas de interesse');
  listbox.hidden = true;

  const statusNote = doc.createElement('span');
  statusNote.className = 'multi-select-limit-note';
  statusNote.setAttribute('aria-live', 'polite');
  statusNote.hidden = true;

  container.appendChild(controlBox);
  container.appendChild(listbox);
  container.appendChild(statusNote);

  function notifyChange() {
    if (onChange) {
      onChange([...selected]);
    }
  }

  function updateLimitNote(customMsg = '') {
    if (customMsg) {
      statusNote.textContent = customMsg;
      statusNote.hidden = false;
      return;
    }
    if (selected.length >= maxItems) {
      statusNote.textContent = `Limite de ${maxItems} áreas atingido.`;
      statusNote.hidden = false;
    } else {
      statusNote.textContent = '';
      statusNote.hidden = true;
    }
  }

  function renderTags() {
    tagsWrap.replaceChildren();
    selected.forEach((val) => {
      const chip = doc.createElement('span');
      chip.className = 'multi-select-tag';
      chip.setAttribute('data-value', val);

      const textSpan = doc.createElement('span');
      textSpan.className = 'multi-select-tag-text';
      textSpan.textContent = getInterestDisplayLabel(val);

      const removeBtn = doc.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'multi-select-tag-remove';
      removeBtn.setAttribute('aria-label', `Remover ${getInterestDisplayLabel(val)}`);
      removeBtn.textContent = '×';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        removeValue(val);
        input.focus();
      });

      chip.appendChild(textSpan);
      chip.appendChild(removeBtn);
      tagsWrap.appendChild(chip);
    });

    input.placeholder =
      selected.length === 0
        ? options.placeholder || 'Buscar ou digitar área de interesse...'
        : selected.length >= maxItems
          ? ''
          : 'Adicionar outra...';
    updateLimitNote();
  }

  function buildCandidateList() {
    const query = input.value;
    const normQuery = normalizeForSearch(query);
    const items = [];

    for (const opt of PROFILE_INTEREST_OPTIONS) {
      if (selected.includes(opt.value)) continue;
      if (
        !normQuery ||
        normalizeForSearch(opt.label).includes(normQuery) ||
        normalizeForSearch(opt.value).includes(normQuery)
      ) {
        items.push({
          value: opt.value,
          label: opt.label,
          isCustom: false
        });
      }
    }

    const cleanedCustom = cleanCustomInterestText(query);
    if (cleanedCustom.length >= 2) {
      const exactPresetMatch = PROFILE_INTEREST_OPTIONS.some(
        (opt) =>
          normalizeForSearch(opt.label) === normalizeForSearch(cleanedCustom) ||
          normalizeForSearch(opt.value) === normalizeForSearch(cleanedCustom)
      );
      const customValue = `outro:${cleanedCustom}`;
      const alreadySelected = selected.some(
        (val) => normalizeForSearch(getInterestDisplayLabel(val)) === normalizeForSearch(cleanedCustom)
      );
      if (!exactPresetMatch && !alreadySelected) {
        items.push({
          value: customValue,
          label: `Adicionar “${cleanedCustom}”`,
          isCustom: true
        });
      }
    }

    return items;
  }

  function renderListbox() {
    currentItems = buildCandidateList();
    listbox.replaceChildren();

    if (!isOpen || selected.length >= maxItems || currentItems.length === 0) {
      listbox.hidden = true;
      input.setAttribute('aria-expanded', 'false');
      input.removeAttribute('aria-activedescendant');
      activeIndex = -1;
      return;
    }

    if (activeIndex < 0 || activeIndex >= currentItems.length) {
      activeIndex = 0;
    }

    currentItems.forEach((item, idx) => {
      const li = doc.createElement('li');
      const optId = `${listboxId}-opt-${idx}`;
      li.id = optId;
      li.className = 'multi-select-option';
      if (item.isCustom) {
        li.classList.add('multi-select-option-custom');
      }
      if (idx === activeIndex) {
        li.classList.add('is-active');
        input.setAttribute('aria-activedescendant', optId);
      }
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', idx === activeIndex ? 'true' : 'false');
      li.setAttribute('data-value', item.value);
      li.textContent = item.label;

      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectValue(item.value);
      });

      listbox.appendChild(li);
    });

    listbox.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function openDropdown() {
    if (selected.length >= maxItems) {
      updateLimitNote();
      return;
    }
    isOpen = true;
    renderListbox();
  }

  function closeDropdown() {
    isOpen = false;
    activeIndex = -1;
    listbox.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  }

  function selectValue(val) {
    if (!val || selected.includes(val)) return;
    if (selected.length >= maxItems) {
      updateLimitNote(`Limite de ${maxItems} áreas atingido.`);
      closeDropdown();
      return;
    }
    selected.push(val);
    input.value = '';
    renderTags();
    if (selected.length >= maxItems) {
      closeDropdown();
    } else {
      renderListbox();
    }
    notifyChange();
  }

  function removeValue(val) {
    const idx = selected.indexOf(val);
    if (idx === -1) return;
    selected.splice(idx, 1);
    renderTags();
    if (isOpen) {
      renderListbox();
    }
    notifyChange();
  }

  controlBox.addEventListener('click', () => {
    input.focus();
    openDropdown();
  });

  input.addEventListener('focus', () => {
    openDropdown();
  });

  input.addEventListener('input', () => {
    openDropdown();
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!isOpen) {
        openDropdown();
        return;
      }
      if (currentItems.length > 0) {
        activeIndex = (activeIndex + 1) % currentItems.length;
        renderListbox();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!isOpen) {
        openDropdown();
        return;
      }
      if (currentItems.length > 0) {
        activeIndex = (activeIndex - 1 + currentItems.length) % currentItems.length;
        renderListbox();
      }
    } else if (e.key === 'Enter') {
      if (isOpen && activeIndex >= 0 && activeIndex < currentItems.length) {
        e.preventDefault();
        selectValue(currentItems[activeIndex].value);
      } else if (input.value.trim()) {
        e.preventDefault();
        const cleaned = cleanCustomInterestText(input.value);
        if (cleaned.length >= 2) {
          const preset = PROFILE_INTEREST_OPTIONS.find(
            (opt) =>
              normalizeForSearch(opt.label) === normalizeForSearch(cleaned) ||
              normalizeForSearch(opt.value) === normalizeForSearch(cleaned)
          );
          selectValue(preset ? preset.value : `outro:${cleaned}`);
        }
      }
    } else if (e.key === 'Escape') {
      if (isOpen) {
        e.preventDefault();
        closeDropdown();
      }
    } else if (e.key === 'Backspace' && !input.value && selected.length > 0) {
      e.preventDefault();
      removeValue(selected[selected.length - 1]);
    }
  });

  doc.addEventListener('click', (e) => {
    if (!container.contains(e.target)) {
      closeDropdown();
    }
  });

  return {
    getValues() {
      return [...selected];
    },
    setValues(values) {
      const incoming = Array.isArray(values) ? values : [];
      const seen = new Set();
      const next = [];
      for (const raw of incoming) {
        if (typeof raw !== 'string') continue;
        const trimmed = raw.trim();
        if (!trimmed || seen.has(trimmed)) continue;
        if (PRESET_LABEL_MAP.has(trimmed)) {
          seen.add(trimmed);
          next.push(trimmed);
        } else if (trimmed.startsWith('outro:')) {
          const cleaned = cleanCustomInterestText(trimmed.slice(6));
          if (cleaned.length >= 2) {
            const normalizedVal = `outro:${cleaned}`;
            if (!seen.has(normalizedVal)) {
              seen.add(normalizedVal);
              next.push(normalizedVal);
            }
          }
        }
        if (next.length >= maxItems) break;
      }
      selected = next;
      renderTags();
      if (isOpen) {
        renderListbox();
      }
    }
  };
}
