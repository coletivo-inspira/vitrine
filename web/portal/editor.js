import { showFeedback } from './portal.js';
import { StorefrontRenderer, slugifyCategoryId } from '../assets/storefront-renderer.mjs';
import {
  parseImportCatalogCSV,
  applyCSVToCatalog,
  exportCatalogToCSV,
  validateCatalogLimits
} from './csv-catalog.js';

let currentSite = null;
let currentIsOnline = false;
let currentDraft = null;
let selectedCategoryForItems = null;
let activePreviewRenderer = null;

// DOM Elements
const editorSiteTitle = globalThis.document?.getElementById('editor-site-title');
const editorSiteSlug = globalThis.document?.getElementById('editor-site-slug');
const editorRevisionIndicator = globalThis.document?.getElementById('editor-revision-indicator');
const editorOpenPublicLink = globalThis.document?.getElementById('editor-open-public-link');
const saveDraftButton = globalThis.document?.getElementById('save-draft-button');
const publishSiteButton = globalThis.document?.getElementById('publish-site-button');
const publicationStatusBar = globalThis.document?.getElementById('publication-status-bar');
const publicationStatusText = globalThis.document?.getElementById('publication-status-text');
const publicationViewLink = globalThis.document?.getElementById('publication-view-link');
const conflictBanner = globalThis.document?.getElementById('conflict-banner');
const reloadConflictButton = globalThis.document?.getElementById('reload-conflict-button');
const copyConflictButton = globalThis.document?.getElementById('copy-conflict-button');

// Meters & warnings
const activeItemsCount = globalThis.document?.getElementById('active-items-count');
const activeItemsProgress = globalThis.document?.getElementById('active-items-progress');
const activeItemsWarning = globalThis.document?.getElementById('active-items-warning');

const totalItemsCount = globalThis.document?.getElementById('total-items-count');
const totalItemsProgress = globalThis.document?.getElementById('total-items-progress');
const totalItemsWarning = globalThis.document?.getElementById('total-items-warning');

const draftSizeCount = globalThis.document?.getElementById('draft-size-count');
const draftSizeProgress = globalThis.document?.getElementById('draft-size-progress');
const draftSizeWarning = globalThis.document?.getElementById('draft-size-warning');

// Forms, Tabs & Containers
const editorSettingsForm = globalThis.document?.getElementById('editor-settings-form');
const editorOrderMsgForm = globalThis.document?.getElementById('editor-order-msg-form');
const editorBusinessName = globalThis.document?.getElementById('editor-business-name');
const editorWhatsapp = globalThis.document?.getElementById('editor-whatsapp');
const editorWhatsappError = globalThis.document?.getElementById('editor-whatsapp-error');
const editorCatalogType = globalThis.document?.getElementById('editor-catalog-type');
const addCategoryButton = globalThis.document?.getElementById('add-category-button');
const categoriesContainer = globalThis.document?.getElementById('categories-container');
const liveStorefrontPreview = globalThis.document?.getElementById('live-storefront-preview');

// Components checkboxes
const compDescription = globalThis.document?.getElementById('comp-description');
const compPhoto = globalThis.document?.getElementById('comp-photo');
const compPrice = globalThis.document?.getElementById('comp-price');
const compMinQuantity = globalThis.document?.getElementById('comp-min-quantity');
const compQuantitySelector = globalThis.document?.getElementById('comp-quantity-selector');
const compDuration = globalThis.document?.getElementById('comp-duration');

// Category selector and Items panel
const editorCategorySelect = globalThis.document?.getElementById('editor-category-select');
const addItemButton = globalThis.document?.getElementById('add-item-button');
const itemsContainer = globalThis.document?.getElementById('items-container');

// Order Fields and messages
const fieldCustName = globalThis.document?.getElementById('field-cust-name');
const fieldDate = globalThis.document?.getElementById('field-date');
const fieldDeliveryPickup = globalThis.document?.getElementById('field-delivery-pickup');
const fieldNotes = globalThis.document?.getElementById('field-notes');
const editorTimeslots = globalThis.document?.getElementById('editor-timeslots');
const timeslotsConfigGroup = globalThis.document?.getElementById('field-timeslots-config-group');

const editorHeroTitle = globalThis.document?.getElementById('editor-hero-title');
const editorWelcomeText = globalThis.document?.getElementById('editor-welcome-text');
const editorCtaLabel = globalThis.document?.getElementById('editor-cta-label');
const editorWhatsappTemplate = globalThis.document?.getElementById('editor-whatsapp-template');

// CSV Tool Elements
const csvDownloadPrimaryLink = globalThis.document?.getElementById('csv-download-primary-link');
const csvExportBtn = globalThis.document?.getElementById('csv-export-btn');
const csvUploadBtn = globalThis.document?.getElementById('csv-upload-btn');
const csvFileInput = globalThis.document?.getElementById('csv-file-input');
const csvFileName = globalThis.document?.getElementById('csv-file-name');
const csvPreviewContainer = globalThis.document?.getElementById('csv-preview-container');
const csvSummaryText = globalThis.document?.getElementById('csv-summary-text');
const csvErrorsList = globalThis.document?.getElementById('csv-errors-list');
const csvApplyBtn = globalThis.document?.getElementById('csv-apply-btn');
const csvCancelBtn = globalThis.document?.getElementById('csv-cancel-btn');

function getCatalogDefaults(catalogType = 'products', businessName = 'Vitrine', template = 'products-v1') {
  const safeName = businessName && businessName.trim() ? businessName.trim() : 'Vitrine';
  if (catalogType === 'booking') {
    return {
      components: {
        name: true,
        description: true,
        photo: true,
        price: true,
        minQuantity: false,
        quantitySelector: false,
        durationMinutes: true
      },
      orderFields: {
        date: true,
        timeSlots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'],
        deliveryOrPickup: false,
        customerName: true,
        notes: true
      },
      messages: {
        heroTitle: safeName,
        welcomeText:
          'Escolha o serviço desejado, selecione a data e o horário de preferência e confirme pelo WhatsApp.',
        ctaLabel: 'Confirmar agendamento no WhatsApp',
        whatsappTemplate:
          'Olá! Meu nome é {nome}. Gostaria de agendar:\n{itens}\nData: {data} às {horario}\nTotal estimado: {total}'
      }
    };
  }

  if (catalogType === 'quote') {
    return {
      components: {
        name: true,
        description: true,
        photo: true,
        price: false,
        minQuantity: false,
        quantitySelector: true,
        durationMinutes: false
      },
      orderFields: {
        date: false,
        timeSlots: [],
        deliveryOrPickup: false,
        customerName: true,
        notes: true
      },
      messages: {
        heroTitle: safeName,
        welcomeText:
          'Selecione os itens de seu interesse e envie sua solicitação de orçamento pelo WhatsApp.',
        ctaLabel: 'Solicitar orçamento no WhatsApp',
        whatsappTemplate:
          'Olá! Meu nome é {nome}. Tenho interesse em solicitar orçamento para:\n{itens}'
      }
    };
  }

  return {
    components: {
      name: true,
      description: true,
      photo: template !== 'pizzeria-v1',
      price: true,
      minQuantity: false,
      quantitySelector: true,
      durationMinutes: false
    },
    orderFields: {
      date: false,
      timeSlots: [],
      deliveryOrPickup: true,
      customerName: true,
      notes: true
    },
    messages: {
      heroTitle: safeName,
      welcomeText: 'Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.',
      ctaLabel: 'Enviar pedido no WhatsApp',
      whatsappTemplate:
        template === 'pizzeria-v1'
          ? 'Olá! Tenho interesse nestes produtos:\n{itens}\nTotal estimado: {total}'
          : 'Olá! Meu nome é {nome}. Gostaria de pedir:\n{itens}\nTotal estimado: {total}\nRecebimento: {endereco}'
    }
  };
}

export function normalizeDraftForEditor(rawContent, site = {}) {
  const cloned = rawContent && typeof rawContent === 'object' ? structuredClone(rawContent) : {};
  const template = cloned.template || site?.template || 'products-v1';
  const catalogType =
    cloned.catalogType ||
    (template === 'booking-v1' ? 'booking' : template === 'quote-v1' ? 'quote' : 'products');
  const storefrontType = cloned.storefrontType || site?.storefrontType || 'food';
  const businessName =
    (typeof cloned.businessName === 'string' && cloned.businessName.trim()) ||
    (typeof site?.name === 'string' && site.name.trim()) ||
    'Vitrine';

  const defaults = getCatalogDefaults(catalogType, businessName, template);
  const categories = Array.isArray(cloned.categories) ? cloned.categories : [];

  categories.forEach((cat, catIdx) => {
    if (!cat.id) {
      cat.id = `${slugifyCategoryId(cat.name, catIdx)}-${catIdx + 1}`;
    }
    if (!Array.isArray(cat.items)) {
      cat.items = [];
    }
    cat.items.forEach((item, itemIdx) => {
      if (!item.id) {
        item.id = `item-${catIdx + 1}-${itemIdx + 1}`;
      }
      if (item.active === undefined) {
        item.active = item.available !== false;
      }
    });
  });

  return {
    schemaVersion: cloned.schemaVersion ?? 1,
    ...cloned,
    template,
    storefrontType,
    catalogType,
    slug: cloned.slug || site?.slug || 'vitrine',
    businessName,
    whatsapp: cloned.whatsapp || '5511999999999',
    components: {
      ...defaults.components,
      ...(cloned.components && typeof cloned.components === 'object' ? cloned.components : {}),
      name: true
    },
    orderFields: {
      ...defaults.orderFields,
      ...(cloned.orderFields && typeof cloned.orderFields === 'object' ? cloned.orderFields : {}),
      timeSlots: Array.isArray(cloned.orderFields?.timeSlots)
        ? [...cloned.orderFields.timeSlots]
        : [...defaults.orderFields.timeSlots]
    },
    messages: {
      ...defaults.messages,
      ...(cloned.messages && typeof cloned.messages === 'object' ? cloned.messages : {})
    },
    categories
  };
}

export async function loadEditor(site, isOnline) {
  currentSite = site;
  currentIsOnline = isOnline;
  currentDraft = null;
  selectedCategoryForItems = null;
  activePreviewRenderer = null;

  if (conflictBanner) conflictBanner.hidden = true;
  if (publicationStatusBar) publicationStatusBar.hidden = true;
  if (csvPreviewContainer) csvPreviewContainer.hidden = true;

  if (editorSiteTitle) editorSiteTitle.textContent = site.name;
  if (editorSiteSlug) editorSiteSlug.textContent = `vitrine.inspira.dev.br/${site.slug}`;
  if (editorOpenPublicLink) {
    editorOpenPublicLink.href = isOnline ? `/${site.slug}` : '/loja1';
  }

  if (categoriesContainer) {
    categoriesContainer.replaceChildren();
    const loadingP = document.createElement('p');
    loadingP.className = 'loading-msg';
    loadingP.textContent = 'Carregando catálogo...';
    categoriesContainer.appendChild(loadingP);
  }

  if (isOnline) {
    try {
      const res = await fetch(`/api/sites/${site.id}/draft`);
      if (res.ok) {
        const data = await res.json();
        currentDraft = data.draft;
        currentDraft.content = normalizeDraftForEditor(currentDraft.content, site);
        const initialTab =
          currentDraft.content.categories.length > 0 ? 'items' : 'settings';
        setActiveTab(initialTab);
        initializeEditorWorkspace();
      } else {
        showFeedback('Erro ao carregar o rascunho remoto.', 'error');
      }
    } catch {
      showFeedback('Falha de rede ao buscar o rascunho.', 'error');
    }
  } else {
    const saved = localStorage.getItem(`vitrine_local_draft_${site.id}`);
    if (saved) {
      currentDraft = JSON.parse(saved);
      currentDraft.content = normalizeDraftForEditor(currentDraft.content, site);
    } else {
      currentDraft = {
        siteId: site.id,
        revision: 1,
        updatedAt: new Date().toISOString(),
        content: normalizeDraftForEditor({}, site)
      };
      localStorage.setItem(`vitrine_local_draft_${site.id}`, JSON.stringify(currentDraft));
    }
    const initialTab =
      currentDraft.content.categories.length > 0 ? 'items' : 'settings';
    setActiveTab(initialTab);
    initializeEditorWorkspace();
  }
}

function setActiveTab(tabId) {
  const tabs = globalThis.document?.querySelectorAll('.tab-btn') || [];
  tabs.forEach((tab) => {
    const isMatch = tab.dataset.tab === tabId;
    tab.classList.toggle('active', isMatch);
    tab.setAttribute('aria-selected', isMatch ? 'true' : 'false');
  });

  const panes = globalThis.document?.querySelectorAll('.editor-tab-pane') || [];
  panes.forEach((pane) => {
    pane.hidden = pane.id !== `pane-${tabId}`;
  });

  const controlsPane = globalThis.document?.querySelector('.editor-controls-pane');
  const previewPane = globalThis.document?.querySelector('.editor-preview-pane');

  if (tabId === 'preview') {
    if (controlsPane) controlsPane.hidden = true;
    if (previewPane) {
      previewPane.classList.add('mobile-active');
      previewPane.hidden = false;
    }
  } else {
    if (controlsPane) controlsPane.hidden = false;
    if (previewPane) {
      previewPane.classList.remove('mobile-active');
      previewPane.hidden = false;
    }
  }
}

function updateCsvModelLink() {
  if (!csvDownloadPrimaryLink || !currentDraft) return;
  const isBooking = currentDraft.content?.catalogType === 'booking';
  const fileName = isBooking ? 'modelo-servicos.csv' : 'modelo-produtos.csv';
  csvDownloadPrimaryLink.href = `./${fileName}`;
  csvDownloadPrimaryLink.setAttribute('download', fileName);
  csvDownloadPrimaryLink.textContent = isBooking
    ? 'Baixar modelo (serviços)'
    : 'Baixar modelo (produtos)';
}

function setupEditorEvents() {
  if (globalThis.editorEventsBound) return;
  globalThis.editorEventsBound = true;

  const tabSelector = globalThis.document?.querySelector('.editor-tabs-selector');
  tabSelector?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) {
      setActiveTab(tabBtn.dataset.tab);
    }
  });

  saveDraftButton?.addEventListener('click', async () => {
    await handleSaveDraft();
  });

  publishSiteButton?.addEventListener('click', async () => {
    await handlePublishSite();
  });

  if (editorSettingsForm) {
    editorSettingsForm.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  }

  if (editorOrderMsgForm) {
    editorOrderMsgForm.addEventListener('submit', (e) => {
      e.preventDefault();
    });
  }

  addCategoryButton?.addEventListener('click', () => {
    addCategory();
  });

  addItemButton?.addEventListener('click', () => {
    if (!currentDraft) return;
    if (!currentDraft.content.categories || currentDraft.content.categories.length === 0) {
      addCategory('Geral');
    }
    addItem();
  });

  editorCategorySelect?.addEventListener('change', () => {
    selectedCategoryForItems = editorCategorySelect.value;
    renderItems();
  });

  editorBusinessName?.addEventListener('input', () => {
    if (!currentDraft) return;
    currentDraft.content.businessName = editorBusinessName.value;
    if (editorSiteTitle && editorBusinessName.value.trim()) {
      editorSiteTitle.textContent = editorBusinessName.value.trim();
    }
    updateDraftAndPreview();
  });

  editorWhatsapp?.addEventListener('input', () => {
    if (!currentDraft) return;
    const rawPhone = editorWhatsapp.value.replace(/\D/g, '');
    editorWhatsapp.value = rawPhone;
    currentDraft.content.whatsapp = rawPhone;

    if (editorWhatsappError) {
      editorWhatsappError.hidden = !(rawPhone && !/^[1-9]\d{7,14}$/.test(rawPhone));
    }
    updateDraftAndPreview();
  });

  [compDescription, compPhoto, compPrice, compMinQuantity, compQuantitySelector, compDuration].forEach(
    (checkbox) => {
      checkbox?.addEventListener('change', () => {
        syncComponentsFromUI();
        renderItems();
        updateDraftAndPreview();
      });
    }
  );

  [fieldCustName, fieldDate, fieldDeliveryPickup, fieldNotes].forEach((checkbox) => {
    checkbox?.addEventListener('change', () => {
      syncOrderFieldsFromUI();
      updateDraftAndPreview();
    });
  });

  editorCatalogType?.addEventListener('change', () => {
    if (!currentDraft) return;
    const nextType = editorCatalogType.value;
    currentDraft.content.catalogType = nextType;
    currentDraft.content.template =
      nextType === 'booking' ? 'booking-v1' : nextType === 'quote' ? 'quote-v1' : 'products-v1';
    syncCatalogTypeDefaults();
    updateDraftAndPreview();
  });

  editorTimeslots?.addEventListener('input', () => {
    if (!currentDraft) return;
    const lines = editorTimeslots.value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => /^([01]\d|2[0-3]):[0-5]\d$/.test(line))
      .slice(0, 24);
    currentDraft.content.orderFields.timeSlots = lines;
    updateDraftAndPreview();
  });

  [editorHeroTitle, editorWelcomeText, editorCtaLabel, editorWhatsappTemplate].forEach((input) => {
    input?.addEventListener('input', () => {
      syncMessagesFromUI();
      updateDraftAndPreview();
    });
  });

  reloadConflictButton?.addEventListener('click', async () => {
    if (conflictBanner) conflictBanner.hidden = true;
    await loadEditor(currentSite, currentIsOnline);
  });

  copyConflictButton?.addEventListener('click', async () => {
    try {
      const serialized = JSON.stringify(currentDraft.content, null, 2);
      await navigator.clipboard.writeText(serialized);
      showFeedback('Conteúdo do rascunho copiado para a área de transferência.', 'success');
    } catch {
      showFeedback('Erro ao copiar rascunho local.', 'error');
    }
  });

  csvExportBtn?.addEventListener('click', () => {
    if (!currentDraft) return;
    const csvContent = exportCatalogToCSV(currentDraft.content);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cardapio-${currentSite.slug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  });

  csvUploadBtn?.addEventListener('click', () => {
    csvFileInput?.click();
  });

  csvCancelBtn?.addEventListener('click', () => {
    if (csvFileInput) csvFileInput.value = '';
    if (csvPreviewContainer) csvPreviewContainer.hidden = true;
  });

  csvFileInput?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    if (!file || !currentDraft) return;

    if (csvFileName) {
      csvFileName.textContent = `Arquivo: ${file.name}`;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = String(event.target?.result || '');
      const result = parseImportCatalogCSV(
        text,
        currentDraft.content.catalogType,
        currentDraft.content
      );

      if (csvPreviewContainer) csvPreviewContainer.hidden = false;
      if (csvSummaryText) {
        csvSummaryText.textContent = `${result.summary.validCount} válidas · ${result.summary.errorCount} com erro`;
      }

      if (csvErrorsList) {
        csvErrorsList.replaceChildren();
        if (result.errors.length > 0) {
          csvErrorsList.hidden = false;
          const heading = document.createElement('h4');
          heading.textContent = 'Ajustes necessários na planilha:';
          csvErrorsList.appendChild(heading);

          result.errors.forEach((err) => {
            const rowErr = document.createElement('div');
            rowErr.className = 'csv-error-item';
            rowErr.textContent = err;
            csvErrorsList.appendChild(rowErr);
          });
        } else {
          csvErrorsList.hidden = true;
        }
      }

      if (csvApplyBtn) {
        csvApplyBtn.disabled = result.validRows.length === 0;
        csvApplyBtn.onclick = () => {
          const selectedMode =
            document.querySelector('input[name="csv-import-mode"]:checked')?.value || 'merge';
          const candidateContent = applyCSVToCatalog(
            currentDraft.content,
            result.validRows,
            selectedMode
          );

          const limitCheck = validateCatalogLimits(candidateContent);
          if (!limitCheck.ok) {
            showFeedback(limitCheck.message, 'error');
            return;
          }

          currentDraft.content = candidateContent;
          selectedCategoryForItems = candidateContent.categories[0]?.id || null;
          initializeEditorWorkspace();
          showFeedback(
            `Importação aplicada ao rascunho (${result.validRows.length} itens processados). Clique em Salvar Rascunho para gravar.`,
            'success'
          );

          csvFileInput.value = '';
          if (csvPreviewContainer) csvPreviewContainer.hidden = true;
        };
      }
    };
    reader.readAsText(file, 'UTF-8');
  });
}

function initializeEditorWorkspace() {
  setupEditorEvents();

  if (editorRevisionIndicator) {
    editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
  }
  if (editorBusinessName) {
    editorBusinessName.value = currentDraft.content.businessName || '';
  }
  if (editorWhatsapp) {
    editorWhatsapp.value = currentDraft.content.whatsapp || '';
  }
  if (editorWhatsappError) {
    editorWhatsappError.hidden = true;
  }
  if (editorCatalogType) {
    editorCatalogType.value = currentDraft.content.catalogType || 'products';
  }

  const comp = currentDraft.content.components || {};
  if (compDescription) compDescription.checked = comp.description !== false;
  if (compPhoto) compPhoto.checked = comp.photo !== false;
  if (compPrice) compPrice.checked = comp.price !== false;
  if (compMinQuantity) compMinQuantity.checked = Boolean(comp.minQuantity);
  if (compQuantitySelector) compQuantitySelector.checked = comp.quantitySelector !== false;
  if (compDuration) compDuration.checked = Boolean(comp.durationMinutes);

  const fields = currentDraft.content.orderFields || {};
  if (fieldCustName) fieldCustName.checked = fields.customerName !== false;
  if (fieldDate) fieldDate.checked = Boolean(fields.date);
  if (fieldDeliveryPickup) fieldDeliveryPickup.checked = Boolean(fields.deliveryOrPickup);
  if (fieldNotes) fieldNotes.checked = fields.notes !== false;

  if (editorTimeslots) {
    editorTimeslots.value = (fields.timeSlots || []).join('\n');
  }
  if (timeslotsConfigGroup) {
    timeslotsConfigGroup.hidden = false;
  }

  const msgs = currentDraft.content.messages || {};
  if (editorHeroTitle) {
    editorHeroTitle.value = msgs.heroTitle || currentDraft.content.businessName || '';
  }
  if (editorWelcomeText) {
    editorWelcomeText.value = msgs.welcomeText || '';
  }
  if (editorCtaLabel) {
    editorCtaLabel.value = msgs.ctaLabel || '';
  }
  if (editorWhatsappTemplate) {
    editorWhatsappTemplate.value = msgs.whatsappTemplate || '';
  }

  updateCsvModelLink();
  populateCategorySelect();
  renderCategories();
  renderItems();
  updateDraftAndPreview();
}

function syncCatalogTypeDefaults() {
  const catType = currentDraft.content.catalogType;
  const defaults = getCatalogDefaults(
    catType,
    currentDraft.content.businessName,
    currentDraft.content.template
  );
  currentDraft.content.components = defaults.components;
  currentDraft.content.orderFields = defaults.orderFields;
  currentDraft.content.messages = defaults.messages;
  initializeEditorWorkspace();
}

function syncComponentsFromUI() {
  currentDraft.content.components = {
    name: true,
    description: Boolean(compDescription?.checked),
    photo: Boolean(compPhoto?.checked),
    price: Boolean(compPrice?.checked),
    minQuantity: Boolean(compMinQuantity?.checked),
    quantitySelector: Boolean(compQuantitySelector?.checked),
    durationMinutes: Boolean(compDuration?.checked)
  };
}

function syncOrderFieldsFromUI() {
  currentDraft.content.orderFields = {
    date: Boolean(fieldDate?.checked),
    timeSlots: currentDraft.content.orderFields?.timeSlots || [],
    deliveryOrPickup: Boolean(fieldDeliveryPickup?.checked),
    customerName: Boolean(fieldCustName?.checked),
    notes: Boolean(fieldNotes?.checked)
  };
}

function syncMessagesFromUI() {
  currentDraft.content.messages = {
    heroTitle: editorHeroTitle?.value || currentDraft.content.businessName || 'Vitrine',
    welcomeText: editorWelcomeText?.value || '',
    ctaLabel: editorCtaLabel?.value || '',
    whatsappTemplate: editorWhatsappTemplate?.value || ''
  };
}

function populateCategorySelect() {
  if (!editorCategorySelect) return;
  editorCategorySelect.replaceChildren();
  const categories = currentDraft.content.categories || [];

  if (categories.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhuma categoria criada';
    editorCategorySelect.appendChild(opt);
    selectedCategoryForItems = null;
    return;
  }

  categories.forEach((cat, idx) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name || `Categoria ${idx + 1}`;
    editorCategorySelect.appendChild(opt);
  });

  if (!selectedCategoryForItems || !categories.some((c) => c.id === selectedCategoryForItems)) {
    selectedCategoryForItems = categories[0].id;
  }
  editorCategorySelect.value = selectedCategoryForItems;
}

function renderCategories() {
  if (!categoriesContainer) return;
  categoriesContainer.replaceChildren();
  const categories = currentDraft.content.categories || [];

  if (categories.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent = 'Nenhuma categoria cadastrada. Clique em "+ Categoria" para começar.';
    categoriesContainer.appendChild(empty);
    return;
  }

  categories.forEach((category, catIndex) => {
    const block = document.createElement('div');
    block.className = 'category-block';
    block.dataset.index = String(catIndex);

    const labelGroup = document.createElement('div');
    labelGroup.className = 'form-group';

    const label = document.createElement('label');
    label.setAttribute('for', `cat-input-${category.id}`);
    label.textContent = `Nome da categoria ${catIndex + 1}`;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = `cat-input-${category.id}`;
    titleInput.className = 'category-title-input input-styled-height';
    titleInput.value = category.name || '';
    titleInput.placeholder = 'Ex: Pizzas Artesanais';
    titleInput.addEventListener('input', () => {
      category.name = titleInput.value;
      populateCategorySelect();
      updateDraftAndPreview();
    });

    labelGroup.appendChild(label);
    labelGroup.appendChild(titleInput);

    const controls = document.createElement('div');
    controls.className = 'category-controls';

    const editItemsBtn = document.createElement('button');
    editItemsBtn.type = 'button';
    editItemsBtn.className = 'button button-small button-secondary button-pill';
    const itemLen = Array.isArray(category.items) ? category.items.length : 0;
    editItemsBtn.textContent = `Ver itens (${itemLen})`;
    editItemsBtn.addEventListener('click', () => {
      selectedCategoryForItems = category.id;
      populateCategorySelect();
      renderItems();
      setActiveTab('items');
    });

    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'button button-small button-secondary button-pill';
    moveUpBtn.textContent = 'Subir';
    moveUpBtn.disabled = catIndex === 0;
    moveUpBtn.setAttribute('aria-label', `Mover categoria ${category.name || catIndex + 1} para cima`);
    moveUpBtn.addEventListener('click', () => {
      moveCategory(catIndex, -1);
    });

    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'button button-small button-secondary button-pill';
    moveDownBtn.textContent = 'Descer';
    moveDownBtn.disabled = catIndex === categories.length - 1;
    moveDownBtn.setAttribute('aria-label', `Mover categoria ${category.name || catIndex + 1} para baixo`);
    moveDownBtn.addEventListener('click', () => {
      moveCategory(catIndex, 1);
    });

    const deleteCatBtn = document.createElement('button');
    deleteCatBtn.type = 'button';
    deleteCatBtn.className = 'button button-small button-secondary button-pill';
    deleteCatBtn.textContent = 'Excluir';
    deleteCatBtn.setAttribute('aria-label', `Excluir categoria ${category.name || catIndex + 1}`);
    deleteCatBtn.addEventListener('click', () => {
      if (category.items && category.items.length > 0) {
        if (
          !confirm(
            `Deseja excluir a categoria "${category.name || 'sem nome'}" e seus ${category.items.length} itens?`
          )
        ) {
          return;
        }
      }
      deleteCategory(catIndex);
    });

    controls.appendChild(editItemsBtn);
    controls.appendChild(moveUpBtn);
    controls.appendChild(moveDownBtn);
    controls.appendChild(deleteCatBtn);

    block.appendChild(labelGroup);
    block.appendChild(controls);
    categoriesContainer.appendChild(block);
  });
}

function renderItems() {
  if (!itemsContainer) return;
  itemsContainer.replaceChildren();

  if (!selectedCategoryForItems) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent = 'Clique em "+ Adicionar Item" ou importe uma planilha CSV para começar.';
    itemsContainer.appendChild(empty);
    return;
  }

  const category = (currentDraft.content.categories || []).find(
    (c) => c.id === selectedCategoryForItems
  );
  if (!category) return;

  if (!category.items || category.items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent = 'Nenhum item nesta categoria. Clique em "+ Adicionar Item".';
    itemsContainer.appendChild(empty);
    return;
  }

  const comp = currentDraft.content.components || {};
  const isQuote = currentDraft.content.catalogType === 'quote';

  category.items.forEach((item, itemIdx) => {
    const card = document.createElement('div');
    card.className = 'item-block';

    const fields = document.createElement('div');
    fields.className = 'item-fields';

    const gName = document.createElement('div');
    gName.className = 'form-group';
    const lName = document.createElement('label');
    lName.setAttribute('for', `item-name-${item.id}`);
    lName.textContent = 'Nome do item';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = `item-name-${item.id}`;
    nameInput.className = 'item-input input-styled-height';
    nameInput.value = item.name || '';
    nameInput.placeholder = 'Ex: Margherita Verace';
    nameInput.addEventListener('input', () => {
      item.name = nameInput.value;
      updateDraftAndPreview();
    });
    gName.appendChild(lName);
    gName.appendChild(nameInput);
    fields.appendChild(gName);

    if (comp.price !== false) {
      const gPrice = document.createElement('div');
      gPrice.className = 'form-group';
      const lPrice = document.createElement('label');
      lPrice.setAttribute('for', `item-price-${item.id}`);
      lPrice.textContent = isQuote ? 'Preço (opcional no orçamento)' : 'Preço (BRL)';
      const priceInput = document.createElement('input');
      priceInput.type = 'text';
      priceInput.id = `item-price-${item.id}`;
      priceInput.className = 'item-input input-styled-height';
      priceInput.placeholder = isQuote ? 'Opcional (ex: R$ 48,00)' : 'Ex: R$ 48,00';
      priceInput.value = item.priceCents ? formatCentsToReais(item.priceCents) : '';
      priceInput.addEventListener('input', () => {
        maskMoneyInput(priceInput);
        item.priceCents = parseReaisToCents(priceInput.value);
        updateDraftAndPreview();
      });
      gPrice.appendChild(lPrice);
      gPrice.appendChild(priceInput);
      fields.appendChild(gPrice);
    }

    if (comp.description !== false) {
      const gDesc = document.createElement('div');
      gDesc.className = 'form-group item-fields-full';
      const lDesc = document.createElement('label');
      lDesc.setAttribute('for', `item-desc-${item.id}`);
      lDesc.textContent = 'Descrição';
      const descInput = document.createElement('input');
      descInput.type = 'text';
      descInput.id = `item-desc-${item.id}`;
      descInput.className = 'item-input input-styled-height';
      descInput.value = item.description || '';
      descInput.placeholder = 'Ex: Molho de tomate San Marzano, muçarela fresca e manjericão.';
      descInput.addEventListener('input', () => {
        item.description = descInput.value;
        updateDraftAndPreview();
      });
      gDesc.appendChild(lDesc);
      gDesc.appendChild(descInput);
      fields.appendChild(gDesc);
    }

    if (comp.minQuantity) {
      const gMin = document.createElement('div');
      gMin.className = 'form-group';
      const lMin = document.createElement('label');
      lMin.setAttribute('for', `item-min-${item.id}`);
      lMin.textContent = 'Quantidade mínima';
      const minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.id = `item-min-${item.id}`;
      minInput.className = 'item-input input-styled-height';
      minInput.min = '1';
      minInput.max = '99';
      minInput.value = String(item.minQuantity || 1);
      minInput.addEventListener('input', () => {
        item.minQuantity = Math.max(1, Math.min(99, parseInt(minInput.value, 10) || 1));
        updateDraftAndPreview();
      });
      gMin.appendChild(lMin);
      gMin.appendChild(minInput);
      fields.appendChild(gMin);
    }

    if (comp.durationMinutes) {
      const gDur = document.createElement('div');
      gDur.className = 'form-group';
      const lDur = document.createElement('label');
      lDur.setAttribute('for', `item-dur-${item.id}`);
      lDur.textContent = 'Duração (minutos)';
      const durInput = document.createElement('input');
      durInput.type = 'number';
      durInput.id = `item-dur-${item.id}`;
      durInput.className = 'item-input input-styled-height';
      durInput.min = '5';
      durInput.max = '480';
      durInput.value = String(item.durationMinutes || 30);
      durInput.addEventListener('input', () => {
        item.durationMinutes = Math.max(5, Math.min(480, parseInt(durInput.value, 10) || 30));
        updateDraftAndPreview();
      });
      gDur.appendChild(lDur);
      gDur.appendChild(durInput);
      fields.appendChild(gDur);
    }

    if (comp.photo) {
      const gPhoto = document.createElement('div');
      gPhoto.className = 'form-group item-fields-full';

      const fileInputId = `item-photo-file-${item.id}`;
      const lPhoto = document.createElement('label');
      lPhoto.setAttribute('for', fileInputId);
      lPhoto.textContent = 'Foto do item (convertida no navegador para WebP até 200 KB)';
      gPhoto.appendChild(lPhoto);

      const fileGroup = document.createElement('div');
      fileGroup.className = 'file-upload-group';

      const fileInp = document.createElement('input');
      fileInp.type = 'file';
      fileInp.id = fileInputId;
      fileInp.accept = 'image/*';
      fileInp.className = 'file-input-hidden';

      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'button button-small button-secondary button-pill';
      uploadBtn.textContent = item.imageUrl ? 'Trocar foto' : 'Enviar foto';
      uploadBtn.addEventListener('click', () => fileInp.click());

      const statusSpan = document.createElement('span');
      statusSpan.className = 'upload-status-text';
      statusSpan.textContent = item.imageUrl ? 'Foto vinculada ao item' : 'Sem foto';

      fileGroup.appendChild(fileInp);
      fileGroup.appendChild(uploadBtn);

      if (item.imageUrl) {
        const clearPhotoBtn = document.createElement('button');
        clearPhotoBtn.type = 'button';
        clearPhotoBtn.className = 'button button-small button-secondary button-pill';
        clearPhotoBtn.textContent = 'Remover foto';
        clearPhotoBtn.addEventListener('click', () => {
          delete item.imageUrl;
          renderItems();
          updateDraftAndPreview();
        });
        fileGroup.appendChild(clearPhotoBtn);
      }

      fileGroup.appendChild(statusSpan);

      fileInp.addEventListener('change', async () => {
        const file = fileInp.files?.[0];
        if (!file) return;

        statusSpan.textContent = 'Convertendo para WebP...';
        try {
          const webpBlob = await resizeAndConvertToWebP(file);
          if (currentIsOnline) {
            statusSpan.textContent = 'Enviando imagem...';
            const uploadedUrl = await uploadImageToSupabaseStorage(webpBlob, item.id);
            item.imageUrl = uploadedUrl;
            statusSpan.textContent = `Foto enviada (${Math.ceil(webpBlob.size / 1024)} KB)`;
            renderItems();
            updateDraftAndPreview();
          } else {
            statusSpan.textContent = `WebP pronta (${Math.ceil(webpBlob.size / 1024)} KB — faça login para salvar no bucket)`;
            showFeedback(
              'Imagem convertida para WebP com sucesso. Entre na sua conta para enviá-la ao armazenamento.',
              'info'
            );
          }
        } catch (err) {
          statusSpan.textContent = 'Falha ao enviar imagem';
          showFeedback(err?.message || 'Erro ao processar ou enviar a imagem.', 'error');
        }
      });

      gPhoto.appendChild(fileGroup);
      fields.appendChild(gPhoto);
    }

    const controls = document.createElement('div');
    controls.className = 'item-controls';

    const activeLabel = document.createElement('label');
    activeLabel.className = 'toggle-container';

    const activeCheckbox = document.createElement('input');
    activeCheckbox.type = 'checkbox';
    activeCheckbox.checked = item.active !== false;
    activeCheckbox.addEventListener('change', () => {
      item.active = activeCheckbox.checked;
      updateDraftAndPreview();
    });

    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(document.createTextNode('Visível na vitrine'));

    const removeItemBtn = document.createElement('button');
    removeItemBtn.type = 'button';
    removeItemBtn.className = 'button button-small button-secondary button-pill';
    removeItemBtn.textContent = 'Excluir item';
    removeItemBtn.setAttribute('aria-label', `Excluir item ${item.name || itemIdx + 1}`);
    removeItemBtn.addEventListener('click', () => {
      if (item.name && !confirm(`Deseja excluir o item "${item.name}"?`)) {
        return;
      }
      removeItem(selectedCategoryForItems, itemIdx);
    });

    controls.appendChild(activeLabel);
    controls.appendChild(removeItemBtn);

    card.appendChild(fields);
    card.appendChild(controls);
    itemsContainer.appendChild(card);
  });
}

function canvasToWebpBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha na conversão da imagem para WebP.'));
      },
      'image/webp',
      quality
    );
  });
}

async function decodeImageSource(file) {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file);
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Arquivo de imagem inválido.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo de imagem.'));
    reader.readAsDataURL(file);
  });
}

async function resizeAndConvertToWebP(file) {
  const maxBytes = 204800; // 200 KiB
  const source = await decodeImageSource(file);
  const srcWidth = source.width;
  const srcHeight = source.height;

  const dimensionSteps = [800, 640, 480];
  const qualitySteps = [0.82, 0.68, 0.52, 0.38];

  try {
    let lastBlob = null;
    for (const maxDim of dimensionSteps) {
      let width = srcWidth;
      let height = srcHeight;
      if (width > maxDim || height > maxDim) {
        if (width >= height) {
          height = Math.max(1, Math.round((height * maxDim) / width));
          width = maxDim;
        } else {
          width = Math.max(1, Math.round((width * maxDim) / height));
          height = maxDim;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const blob = await canvasToWebpBlob(canvas, quality);
        lastBlob = blob;
        if (blob.size <= maxBytes) {
          return blob;
        }
      }
    }

    if (lastBlob && lastBlob.size <= maxBytes) {
      return lastBlob;
    }
    throw new Error('A imagem excedeu 200 KB mesmo após compressão. Escolha uma imagem menor.');
  } finally {
    if (source && typeof source.close === 'function') {
      source.close();
    }
  }
}

// Server-side authenticated proxy upload (uses HttpOnly session cookie — zero client token exposure)
async function uploadImageToSupabaseStorage(blob, itemId) {
  const safeId = String(itemId || 'item').replace(/[^a-zA-Z0-9._-]/g, '-');
  const uploadUrl = `/api/sites/${encodeURIComponent(currentSite.id)}/upload?itemId=${encodeURIComponent(safeId)}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'image/webp'
    },
    body: blob
  });

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error?.message || `Falha no upload (${res.status}).`);
  }

  const data = await res.json();
  return data.imageUrl;
}

function formatCentsToReais(cents) {
  if (typeof cents !== 'number' || Number.isNaN(cents)) return 'R$ 0,00';
  const reais = cents / 100;
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskMoneyInput(inputEl) {
  const value = inputEl.value.replace(/\D/g, '');
  if (!value) {
    inputEl.value = '';
    return;
  }
  const integerPart = parseInt(value.slice(0, -2) || '0', 10).toString();
  const decimalPart = value.slice(-2).padStart(2, '0');
  inputEl.value = `R$ ${integerPart},${decimalPart}`;
}

function parseReaisToCents(valStr) {
  const digits = valStr.replace(/\D/g, '');
  return parseInt(digits, 10) || 0;
}

function addCategory(defaultName = '') {
  const id = `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  currentDraft.content.categories.push({
    id,
    name: defaultName,
    items: []
  });
  selectedCategoryForItems = id;
  populateCategorySelect();
  renderCategories();
  renderItems();
  updateDraftAndPreview();
}

function deleteCategory(catIndex) {
  currentDraft.content.categories.splice(catIndex, 1);
  populateCategorySelect();
  renderCategories();
  renderItems();
  updateDraftAndPreview();
}

function moveCategory(catIndex, direction) {
  const categories = currentDraft.content.categories;
  const targetIndex = catIndex + direction;
  if (targetIndex >= 0 && targetIndex < categories.length) {
    const temp = categories[catIndex];
    categories[catIndex] = categories[targetIndex];
    categories[targetIndex] = temp;
    populateCategorySelect();
    renderCategories();
    updateDraftAndPreview();
  }
}

function addItem() {
  const category = (currentDraft.content.categories || []).find(
    (c) => c.id === selectedCategoryForItems
  );
  if (!category) return;

  if (!category.items) category.items = [];

  const item = {
    id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: '',
    description: '',
    priceCents: 0,
    active: true
  };

  if (currentDraft.content.components?.minQuantity) item.minQuantity = 1;
  if (currentDraft.content.components?.durationMinutes) item.durationMinutes = 30;

  category.items.push(item);
  renderCategories();
  renderItems();
  updateDraftAndPreview();
}

function removeItem(catId, itemIdx) {
  const category = (currentDraft.content.categories || []).find((c) => c.id === catId);
  if (category && category.items) {
    category.items.splice(itemIdx, 1);
    renderCategories();
    renderItems();
    updateDraftAndPreview();
  }
}

function updateDraftAndPreview() {
  if (!currentDraft) return;

  const textEncoder = new TextEncoder();
  const serialized = JSON.stringify(currentDraft.content);
  const sizeInBytes = textEncoder.encode(serialized).length;

  if (draftSizeCount) {
    draftSizeCount.textContent = `${(sizeInBytes / 1024).toFixed(1)} / 256 KiB`;
  }
  if (draftSizeProgress) draftSizeProgress.value = sizeInBytes;
  if (draftSizeWarning) draftSizeWarning.hidden = sizeInBytes <= 262144;

  let totalCount = 0;
  let activeCount = 0;

  (currentDraft.content.categories || []).forEach((cat) => {
    if (cat.items) {
      cat.items.forEach((item) => {
        totalCount += 1;
        if (item.active !== false) {
          activeCount += 1;
        }
      });
    }
  });

  if (activeItemsCount) activeItemsCount.textContent = `${activeCount} / 20`;
  if (activeItemsProgress) activeItemsProgress.value = activeCount;
  if (activeItemsWarning) activeItemsWarning.hidden = activeCount <= 20;

  if (totalItemsCount) totalItemsCount.textContent = `${totalCount} / 100`;
  if (totalItemsProgress) totalItemsProgress.value = totalCount;
  if (totalItemsWarning) totalItemsWarning.hidden = totalCount <= 100;

  if (saveDraftButton) {
    saveDraftButton.disabled = sizeInBytes > 262144;
  }

  renderLivePreview();
}

function renderLivePreview() {
  if (!liveStorefrontPreview || !currentDraft) return;

  const menuConfig = structuredClone(currentDraft.content);

  if (!activePreviewRenderer || activePreviewRenderer.container !== liveStorefrontPreview) {
    activePreviewRenderer = new StorefrontRenderer(liveStorefrontPreview, menuConfig, {
      isPreview: true,
      targetWhatsapp: menuConfig.whatsapp
    });
  } else {
    activePreviewRenderer.menu = menuConfig;
    activePreviewRenderer.options.targetWhatsapp = menuConfig.whatsapp;
  }

  activePreviewRenderer.render();
}

function validateCatalogLocal() {
  const { whatsapp, categories } = currentDraft.content;

  if (!whatsapp) {
    showFeedback('Digite o número de WhatsApp comercial na aba Configurações.', 'error');
    setActiveTab('settings');
    return false;
  }

  if (!/^[1-9]\d{7,14}$/.test(whatsapp)) {
    showFeedback('Número de WhatsApp comercial inválido. Exemplo: 5511999999999', 'error');
    setActiveTab('settings');
    return false;
  }

  let totalCount = 0;
  let activeCount = 0;
  let hasValidationErrors = false;

  (categories || []).forEach((cat, catIndex) => {
    if (!cat.name || !cat.name.trim()) {
      showFeedback(`Preencha o nome da categoria na posição ${catIndex + 1}.`, 'error');
      hasValidationErrors = true;
    }

    if (cat.items) {
      cat.items.forEach((item, itemIndex) => {
        totalCount += 1;
        if (item.active !== false) {
          activeCount += 1;
        }

        if (!item.name || !item.name.trim()) {
          showFeedback(
            `O item ${itemIndex + 1} na categoria "${cat.name || catIndex + 1}" precisa ter um nome.`,
            'error'
          );
          hasValidationErrors = true;
        }

        const priceRequired =
          currentDraft.content.components?.price !== false &&
          currentDraft.content.catalogType !== 'quote';
        if (priceRequired && (!Number.isSafeInteger(item.priceCents) || item.priceCents <= 0)) {
          showFeedback(
            `O preço do item "${item.name || `Item ${itemIndex + 1}`}" precisa ser maior que R$ 0,00.`,
            'error'
          );
          hasValidationErrors = true;
        }
      });
    }
  });

  if (hasValidationErrors) return false;

  if (activeCount > 20) {
    showFeedback(
      'O plano básico gratuito permite no máximo 20 itens ativos. Oculte alguns itens antes de salvar.',
      'error'
    );
    return false;
  }

  if (totalCount > 100) {
    showFeedback(
      'O limite técnico total é de 100 itens (ativos e ocultos). Remova alguns itens antes de salvar.',
      'error'
    );
    return false;
  }

  return true;
}

async function handleSaveDraft() {
  if (!validateCatalogLocal()) return;

  if (currentIsOnline) {
    try {
      const res = await fetch(`/api/sites/${currentSite.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: currentDraft.revision,
          content: currentDraft.content
        })
      });

      if (res.ok) {
        const data = await res.json();
        currentDraft = data.draft;
        currentDraft.content = normalizeDraftForEditor(currentDraft.content, currentSite);
        if (editorRevisionIndicator) {
          editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
        }
        showFeedback('Rascunho salvo com sucesso.', 'success');
        if (conflictBanner) conflictBanner.hidden = true;
      } else if (res.status === 409) {
        const data = await res.json();
        if (conflictBanner) conflictBanner.hidden = false;
        showFeedback(
          'Conflito de revisão detectado. Salve suas alterações locais ou recarregue.',
          'error'
        );
        if (data.error?.currentRevision && editorRevisionIndicator) {
          editorRevisionIndicator.textContent = `Revisão em conflito: ${currentDraft.revision} (servidor: ${data.error.currentRevision})`;
        }
      } else {
        const data = await res.json().catch(() => ({}));
        showFeedback(data.error?.message || 'Erro ao salvar rascunho.', 'error');
      }
    } catch {
      showFeedback('Erro de rede ao salvar rascunho.', 'error');
    }
  } else {
    currentDraft.revision += 1;
    currentDraft.updatedAt = new Date().toISOString();
    localStorage.setItem(`vitrine_local_draft_${currentSite.id}`, JSON.stringify(currentDraft));
    if (editorRevisionIndicator) {
      editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
    }
    showFeedback('Rascunho local salvo com sucesso.', 'success');
    if (conflictBanner) conflictBanner.hidden = true;
  }
  updateDraftAndPreview();
}

async function handlePublishSite() {
  if (!validateCatalogLocal()) return;

  if (currentIsOnline) {
    try {
      const saveRes = await fetch(`/api/sites/${currentSite.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revision: currentDraft.revision,
          content: currentDraft.content
        })
      });

      if (saveRes.ok) {
        const savedData = await saveRes.json();
        currentDraft = savedData.draft;
        currentDraft.content = normalizeDraftForEditor(currentDraft.content, currentSite);
        if (editorRevisionIndicator) {
          editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
        }
      } else if (saveRes.status === 409) {
        if (conflictBanner) conflictBanner.hidden = false;
        showFeedback(
          'Conflito de revisão detectado antes de publicar. Recarregue o rascunho.',
          'error'
        );
        return;
      } else {
        const errData = await saveRes.json().catch(() => ({}));
        showFeedback(errData.error?.message || 'Erro ao salvar rascunho antes de publicar.', 'error');
        return;
      }

      const pubRes = await fetch(`/api/sites/${currentSite.id}/publish`, {
        method: 'POST'
      });

      if (pubRes.ok) {
        const pubData = await pubRes.json();
        const pub = pubData.publication;
        if (publicationStatusBar && publicationStatusText && publicationViewLink) {
          const shortHash = String(pub.hash || '').slice(0, 12);
          publicationStatusText.textContent = `Revisão ${pub.revision} publicada em ${pub.url} (SHA-256: ${shortHash}...)`;
          publicationViewLink.href = pub.url;
          publicationStatusBar.hidden = false;
        }
        if (editorOpenPublicLink) {
          editorOpenPublicLink.href = pub.url;
        }
        showFeedback(`Vitrine publicada com sucesso em ${pub.url}.`, 'success');
      } else {
        const errData = await pubRes.json().catch(() => ({}));
        showFeedback(
          errData.error?.message ||
            'Falha ao publicar vitrine. A publicação anterior foi preservada.',
          'error'
        );
      }
    } catch {
      showFeedback('Erro de rede ao publicar vitrine.', 'error');
    }
  } else {
    let activeCount = 0;
    (currentDraft.content.categories || []).forEach((cat) => {
      (cat.items || []).forEach((item) => {
        if (item.active !== false) activeCount += 1;
      });
    });

    if (activeCount === 0) {
      showFeedback('O rascunho precisa ter ao menos 1 item ativo para ser publicado.', 'error');
      return;
    }

    if (publicationStatusBar && publicationStatusText && publicationViewLink) {
      publicationStatusText.textContent = `Prévia publicada no modo local (revisão ${currentDraft.revision}). Exemplo estático disponível em /loja1.`;
      publicationViewLink.href = '/loja1';
      publicationStatusBar.hidden = false;
    }
    showFeedback('Publicação validada com sucesso no modo local.', 'success');
  }
}
