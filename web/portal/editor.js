import { renderStructureFields } from './showcase-structure.js';
import { showFeedback } from './portal.js';
import { attachWhatsappMask, extractPhoneDigits, formatWhatsappBR } from './phone-mask.mjs';
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
let savedDraftContent = '';
let editorLoadGeneration = 0;

export function clearEditor() {
  editorLoadGeneration += 1;
  currentDraft = null;
  currentSite = null;
  savedDraftContent = '';
}

export function hasUnsavedDraftChanges() {
  return Boolean(currentDraft && JSON.stringify(currentDraft.content) !== savedDraftContent);
}
let selectedCategoryForItems = null;
let activePreviewRenderer = null;
let activeEditingItemId = null;

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

const securePreviewButton = globalThis.document?.getElementById('secure-preview-button');
const publicationHistory = globalThis.document?.getElementById('publication-history');
const historyStatus = globalThis.document?.getElementById('publication-history-status');
const historyList = globalThis.document?.getElementById('publication-history-list');

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
  const generation = ++editorLoadGeneration;
  currentSite = site;
  currentIsOnline = isOnline;
  currentDraft = null;
  selectedCategoryForItems = null;
  activePreviewRenderer = null;

  const team = globalThis.document?.getElementById('team-management');
  if (team) {
    team.open = false;
    team.hidden = !isOnline || !['owner', 'admin'].includes(site.role);
  }
  if (domainPanel) {
    domainPanel.open = false;
    domainPanel.hidden = !isOnline || !['owner', 'admin'].includes(site.role);
    domainList.replaceChildren();
    defaultDomain.href = `https://vitrine.inspira.dev.br/${site.slug}`;
    defaultDomain.textContent = defaultDomain.href;
  }
  if (assetLibrary) {
    assetLibrary.open = false;
    assetLibrary.hidden = !isOnline || !['owner', 'admin', 'editor'].includes(site.role);
    assetList.replaceChildren();
  }
  if (structurePanel) {
    structurePanel.open = false;
    structurePanel.hidden = !isOnline || !['owner', 'admin', 'editor'].includes(site.role);
    structureFields.replaceChildren();
  }
  if (securePreviewButton) securePreviewButton.hidden = !isOnline;
  if (publicationHistory) {
    publicationHistory.open = false;
    publicationHistory.hidden = !isOnline;
    historyStatus.textContent = '';
    historyList.replaceChildren();
  }

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
    loadingP.textContent = 'Carregando vitrine...';
    categoriesContainer.appendChild(loadingP);
  }

  if (isOnline) {
    try {
      const res = await fetch(`/api/sites/${site.id}/draft`);
      if (res.ok) {
        const data = await res.json();
        if (generation !== editorLoadGeneration) return;
        currentDraft = data.draft;
        currentDraft.content = normalizeDraftForEditor(currentDraft.content, site);
        const initialTab =
          currentDraft.content.categories.length > 0 ? 'items' : 'settings';
        setActiveTab(initialTab);
        initializeEditorWorkspace();
        savedDraftContent = JSON.stringify(currentDraft.content);
      } else {
        if (generation === editorLoadGeneration) showFeedback('Erro ao carregar o rascunho remoto.', 'error');
      }
    } catch {
      if (generation === editorLoadGeneration) showFeedback('Falha de rede ao buscar o rascunho.', 'error');
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
    savedDraftContent = JSON.stringify(currentDraft.content);
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

  const addItemBtn = document.getElementById('add-item-button');
  const addItemMenu = document.getElementById('add-item-menu');

  addItemBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentDraft) return;
    if (!currentDraft.content.categories || currentDraft.content.categories.length === 0) {
      addCategory('Geral');
    }
    const expanded = addItemBtn.getAttribute('aria-expanded') === 'true';
    addItemBtn.setAttribute('aria-expanded', !expanded);
    addItemMenu.hidden = expanded;
  });

  // Handle clicking items in type menu
  addItemMenu?.querySelectorAll('.dropdown-item').forEach((item) => {
    item.addEventListener('click', () => {
      const type = item.getAttribute('data-type');
      addItem(type);
      addItemBtn.setAttribute('aria-expanded', 'false');
      addItemMenu.hidden = true;
    });
  });

  // Floating Side/Bottom Toolbar Event Listeners
  const toolbarAddItem = document.getElementById('toolbar-add-item');
  const toolbarAddSection = document.getElementById('toolbar-add-section');
  const toolbarAddImage = document.getElementById('toolbar-add-image');

  toolbarAddItem?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentDraft) return;
    if (!currentDraft.content.categories || currentDraft.content.categories.length === 0) {
      addCategory('Geral');
    }
    const expanded = addItemBtn?.getAttribute('aria-expanded') === 'true';
    addItemBtn?.setAttribute('aria-expanded', !expanded);
    if (addItemMenu) addItemMenu.hidden = expanded;
  });

  toolbarAddSection?.addEventListener('click', () => {
    if (!currentDraft) return;
    addCategory();
  });

  toolbarAddImage?.addEventListener('click', () => {
    if (!currentDraft) return;
    if (!currentDraft.content.categories || currentDraft.content.categories.length === 0) {
      addCategory('Geral');
    }
    addItem('photo');
  });

  const csvBtn = document.getElementById('csv-menu-btn');
  const csvMenu = document.getElementById('csv-dropdown-menu');

  csvBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    const expanded = csvBtn.getAttribute('aria-expanded') === 'true';
    csvBtn.setAttribute('aria-expanded', !expanded);
    csvMenu.hidden = expanded;
  });

  // Wire up Planilha (CSV) dropdown items:
  const csvUploadItem = document.getElementById('csv-upload-btn-item');
  const csvExportItem = document.getElementById('csv-export-btn-item');
  
  csvUploadItem?.addEventListener('click', () => {
    document.getElementById('csv-file-input')?.click();
  });
  
  csvExportItem?.addEventListener('click', () => {
    document.getElementById('csv-export-btn')?.click();
  });

  // Close dropdowns when clicking outside
  document.addEventListener('click', () => {
    if (addItemBtn) addItemBtn.setAttribute('aria-expanded', 'false');
    if (addItemMenu) addItemMenu.hidden = true;
    if (csvBtn) csvBtn.setAttribute('aria-expanded', 'false');
    if (csvMenu) csvMenu.hidden = true;
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

  attachWhatsappMask(editorWhatsapp, (rawPhone) => {
    if (!currentDraft) return;
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
    editorWhatsapp.value = formatWhatsappBR(currentDraft.content.whatsapp || '');
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
  const activeCat = categories.find((c) => c.id === selectedCategoryForItems);
  if (activeCat?.items?.length > 0 && (!activeEditingItemId || !activeCat.items.some((i) => i.id === activeEditingItemId))) {
    activeEditingItemId = activeCat.items[0].id;
  }
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

    if (currentIsOnline && ['owner', 'admin', 'editor'].includes(currentSite.role)) {
      controls.appendChild(quickToggleButton(category, 'category'));
    }
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
    empty.textContent = 'Nenhum item nesta categoria. Clique em "+ Adicionar Item" ou importe uma planilha.';
    itemsContainer.appendChild(empty);
    return;
  }

  const comp = currentDraft.content.components || {};
  const isQuote = currentDraft.content.catalogType === 'quote';

  // Google Forms-style header card (storefront title and short description)
  const formHeaderCard = document.createElement('div');
  formHeaderCard.className = 'google-forms-header-card';
  const formTitle = document.createElement('h3');
  formTitle.className = 'forms-header-title';
  formTitle.textContent = currentDraft.content.businessName || currentSite?.name || 'Minha Vitrine';
  const formSubtitle = document.createElement('p');
  formSubtitle.className = 'forms-header-subtitle';
  formSubtitle.textContent =
    currentDraft.content.messages?.welcomeText ||
    `Categoria: ${category.name || 'Itens'} · ${category.items.length} ${category.items.length === 1 ? 'item' : 'itens'} na vitrine`;
  formHeaderCard.appendChild(formTitle);
  formHeaderCard.appendChild(formSubtitle);
  itemsContainer.appendChild(formHeaderCard);

  category.items.forEach((item, itemIdx) => {
    const card = document.createElement('div');
    // Accent bar visual highlight like Google Forms
    const isEditing = activeEditingItemId === item.id;
    card.className = `item-block google-forms-card ${isEditing ? 'is-editing' : 'is-preview'}`;
    card.id = `item-card-${item.id}`;

    // Click to focus/edit card
    card.addEventListener('click', (e) => {
      if (activeEditingItemId !== item.id && !e.target.closest('button') && !e.target.closest('input') && !e.target.closest('textarea')) {
        activeEditingItemId = item.id;
        renderItems();
      }
    });

    if (!isEditing) {
      // COMPACT PREVIEW STATE (Google Forms Style)
      const previewHeader = document.createElement('div');
      previewHeader.className = 'item-preview-header';

      // Thumbnail
      const thumb = document.createElement('div');
      thumb.className = 'item-preview-thumb';
      if (comp.photo && item.imageUrl) {
        const thumbImg = document.createElement('img');
        thumbImg.src = item.imageUrl;
        thumbImg.alt = item.name || 'Foto';
        thumb.appendChild(thumbImg);
      } else {
        thumb.innerHTML = `<svg width="20" height="20" class="svg-icon-gray"><use href="#icon-image"/></svg>`;
      }
      previewHeader.appendChild(thumb);

      const previewInfo = document.createElement('div');
      previewInfo.className = 'item-preview-info';

      const previewTitle = document.createElement('h3');
      previewTitle.className = 'item-preview-title';
      previewTitle.textContent = item.name || 'Item sem nome';
      previewInfo.appendChild(previewTitle);

      const previewSub = document.createElement('p');
      previewSub.className = 'item-preview-subtitle soft-text';
      const priceText = item.priceCents ? formatCentsToReais(item.priceCents) : '';
      const sectionText = item.section ? `Seção: ${item.section}` : '';
      const details = [priceText, sectionText, item.active !== false ? 'Visível' : 'Oculto'].filter(Boolean);
      previewSub.textContent = details.join(' · ');
      previewInfo.appendChild(previewSub);

      previewHeader.appendChild(previewInfo);

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'button button-small button-secondary button-pill';
      editBtn.textContent = 'Editar';
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        activeEditingItemId = item.id;
        renderItems();
      });
      previewHeader.appendChild(editBtn);

      card.appendChild(previewHeader);
      itemsContainer.appendChild(card);
      return;
    }

    // EXPANDED EDITING STATE (Google Forms Style)
    const headerRow = document.createElement('div');
    headerRow.className = 'item-header-row';

    // Thumbnail / Placeholder
    const thumb = document.createElement('div');
    thumb.className = 'item-thumb-container';
    if (comp.photo && item.imageUrl) {
      const thumbImg = document.createElement('img');
      thumbImg.src = item.imageUrl;
      thumbImg.alt = item.name || 'Foto';
      thumb.appendChild(thumbImg);
    } else {
      // Local symbol or inline SVG icon
      thumb.innerHTML = `<svg width="24" height="24" class="svg-icon-gray"><use href="#icon-image"/></svg>`;
    }
    headerRow.appendChild(thumb);

    // Title / bold name
    const titleGroup = document.createElement('div');
    titleGroup.className = 'item-title-group';
    const boldName = document.createElement('h3');
    boldName.className = 'item-bold-title';
    boldName.textContent = item.name || 'Novo Item';
    titleGroup.appendChild(boldName);
    headerRow.appendChild(titleGroup);

    // Header actions
    const headerActions = document.createElement('div');
    headerActions.className = 'item-header-actions';

    // Move Up
    const upBtn = document.createElement('button');
    upBtn.type = 'button';
    upBtn.className = 'icon-btn';
    upBtn.setAttribute('aria-label', 'Subir item');
    upBtn.disabled = itemIdx === 0;
    upBtn.innerHTML = `<svg width="18" height="18"><use href="#icon-up"/></svg>`;
    upBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveItem(selectedCategoryForItems, itemIdx, -1);
    });

    // Move Down
    const downBtn = document.createElement('button');
    downBtn.type = 'button';
    downBtn.className = 'icon-btn';
    downBtn.setAttribute('aria-label', 'Descer item');
    downBtn.disabled = itemIdx === category.items.length - 1;
    downBtn.innerHTML = `<svg width="18" height="18"><use href="#icon-down"/></svg>`;
    downBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moveItem(selectedCategoryForItems, itemIdx, 1);
    });

    // Duplicate
    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'icon-btn';
    dupBtn.setAttribute('aria-label', 'Duplicar item');
    dupBtn.innerHTML = `<svg width="18" height="18"><use href="#icon-copy"/></svg>`;
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateItem(selectedCategoryForItems, itemIdx);
    });

    headerActions.appendChild(upBtn);
    headerActions.appendChild(downBtn);
    headerActions.appendChild(dupBtn);
    headerRow.appendChild(headerActions);
    card.appendChild(headerRow);

    // FIELDS GRID
    const fields = document.createElement('div');
    fields.className = 'item-fields';

    // Column 1: Nome do item
    const gName = document.createElement('div');
    gName.className = 'form-group item-fields-full';
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
      boldName.textContent = nameInput.value || 'Novo Item';
      updateDraftAndPreview();
    });
    gName.appendChild(lName);
    gName.appendChild(nameInput);
    fields.appendChild(gName);

    // Column 2: Preço (if visible)
    const showPriceField = comp.price !== false && item._showPrice !== false;
    if (showPriceField) {
      const gPrice = document.createElement('div');
      gPrice.className = 'form-group';
      const lPrice = document.createElement('label');
      lPrice.setAttribute('for', `item-price-${item.id}`);
      lPrice.textContent = isQuote ? 'Preço (opcional)' : 'Preço (BRL)';
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

    // New Google Forms field: Section name (grupo de agrupamento opcional)
    const gSec = document.createElement('div');
    gSec.className = 'form-group';
    const lSec = document.createElement('label');
    lSec.setAttribute('for', `item-section-${item.id}`);
    lSec.textContent = 'Seção (opcional)';
    const secInput = document.createElement('input');
    secInput.type = 'text';
    secInput.id = `item-section-${item.id}`;
    secInput.className = 'item-input input-styled-height';
    secInput.value = item.section || '';
    secInput.placeholder = 'Ex: Pizzas, Pães, Doces, Bebidas';
    secInput.addEventListener('input', () => {
      item.section = secInput.value;
      updateDraftAndPreview();
    });
    gSec.appendChild(lSec);
    gSec.appendChild(secInput);
    fields.appendChild(gSec);

    // Full Width: Descrição (textarea style)
    if (comp.description !== false) {
      const gDesc = document.createElement('div');
      gDesc.className = 'form-group item-fields-full';
      const lDesc = document.createElement('label');
      lDesc.setAttribute('for', `item-desc-${item.id}`);
      lDesc.textContent = 'Descrição';
      const descInput = document.createElement('textarea');
      descInput.id = `item-desc-${item.id}`;
      descInput.className = 'item-input textarea-styled';
      descInput.value = item.description || '';
      descInput.placeholder = 'Ex: Molho de tomate San Marzano, muçarela fresca, folhas de manjericão e azeite extravirgem.';
      descInput.addEventListener('input', () => {
        item.description = descInput.value;
        updateDraftAndPreview();
      });
      gDesc.appendChild(lDesc);
      gDesc.appendChild(descInput);
      fields.appendChild(gDesc);
    }

    // Min Quantity (if enabled)
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

    // Duration Minutes (if enabled)
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

    // PHOTO UPLOAD AREA (if enabled)
    const showPhotoField = comp.photo && item._showPhoto !== false;
    if (showPhotoField) {
      const gPhoto = document.createElement('div');
      gPhoto.className = 'form-group item-fields-full';

      const fileInputId = `item-photo-file-${item.id}`;
      const lPhoto = document.createElement('label');
      lPhoto.setAttribute('for', fileInputId);
      lPhoto.textContent = 'Foto do item';
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
      uploadBtn.textContent = item.imageUrl ? 'Trocar' : 'Enviar foto';
      uploadBtn.addEventListener('click', () => fileInp.click());

      const statusSpan = document.createElement('span');
      statusSpan.className = 'upload-status-text';
      statusSpan.textContent = item.imageUrl ? 'WebP até 200 KB, convertida automaticamente' : 'Sem foto';

      fileGroup.appendChild(fileInp);
      fileGroup.appendChild(uploadBtn);

      if (item.imageUrl) {
        const clearPhotoBtn = document.createElement('button');
        clearPhotoBtn.type = 'button';
        clearPhotoBtn.className = 'button button-small button-secondary button-pill';
        clearPhotoBtn.textContent = 'Remover';
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

    card.appendChild(fields);

    // CARD FOOTER (Google Forms style)
    const footer = document.createElement('div');
    footer.className = 'item-card-footer';

    // Quick toggle switches or options
    const quickAddLinks = document.createElement('div');
    quickAddLinks.className = 'quick-add-links';
    
    if (item._showPrice === false) {
      const addPriceLink = document.createElement('button');
      addPriceLink.type = 'button';
      addPriceLink.className = 'text-link-btn';
      addPriceLink.textContent = '+ Adicionar Preço';
      addPriceLink.addEventListener('click', () => {
        item._showPrice = true;
        renderItems();
      });
      quickAddLinks.appendChild(addPriceLink);
    }
    if (item._showPhoto === false && comp.photo) {
      const addPhotoLink = document.createElement('button');
      addPhotoLink.type = 'button';
      addPhotoLink.className = 'text-link-btn';
      addPhotoLink.textContent = '+ Adicionar Foto';
      addPhotoLink.addEventListener('click', () => {
        item._showPhoto = true;
        renderItems();
      });
      quickAddLinks.appendChild(addPhotoLink);
    }
    footer.appendChild(quickAddLinks);

    const footerRight = document.createElement('div');
    footerRight.className = 'footer-right-actions';

    // Duplicate button in footer (Google Forms style)
    const footerDupBtn = document.createElement('button');
    footerDupBtn.type = 'button';
    footerDupBtn.className = 'icon-btn';
    footerDupBtn.setAttribute('aria-label', 'Duplicar item');
    footerDupBtn.title = 'Duplicar item';
    footerDupBtn.innerHTML = `<svg width="18" height="18"><use href="#icon-copy"/></svg>`;
    footerDupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateItem(selectedCategoryForItems, itemIdx);
    });

    // Delete Trash icon
    const trashBtn = document.createElement('button');
    trashBtn.type = 'button';
    trashBtn.className = 'icon-btn trash-color-btn';
    trashBtn.setAttribute('aria-label', 'Excluir item');
    trashBtn.title = 'Excluir item';
    trashBtn.innerHTML = `<svg width="18" height="18"><use href="#icon-trash"/></svg>`;
    trashBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (item.name && !confirm(`Deseja excluir o item "${item.name}"?`)) {
        return;
      }
      removeItem(selectedCategoryForItems, itemIdx);
    });

    // Separator line
    const sep = document.createElement('div');
    sep.className = 'footer-divider';

    // Visible switch
    const activeLabel = document.createElement('label');
    activeLabel.className = 'toggle-container-forms';

    const activeCheckbox = document.createElement('input');
    activeCheckbox.type = 'checkbox';
    activeCheckbox.setAttribute('role', 'switch');
    activeCheckbox.setAttribute('aria-checked', item.active !== false ? 'true' : 'false');
    activeCheckbox.checked = item.active !== false;
    activeCheckbox.addEventListener('change', () => {
      item.active = activeCheckbox.checked;
      activeCheckbox.setAttribute('aria-checked', item.active ? 'true' : 'false');
      updateDraftAndPreview();
    });

    const activeLabelText = document.createElement('span');
    activeLabelText.textContent = 'Visível na vitrine';

    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(activeLabelText);

    // Save and collapse card button
    const collapseBtn = document.createElement('button');
    collapseBtn.type = 'button';
    collapseBtn.className = 'button button-small button-secondary button-pill';
    collapseBtn.textContent = 'Concluir';
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      activeEditingItemId = null;
      renderItems();
    });

    footerRight.appendChild(footerDupBtn);
    footerRight.appendChild(trashBtn);
    footerRight.appendChild(sep);
    footerRight.appendChild(activeLabel);
    footerRight.appendChild(collapseBtn);
    footer.appendChild(footerRight);

    card.appendChild(footer);
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

      const canvas = typeof OffscreenCanvas === 'function'
        ? new OffscreenCanvas(width, height)
        : document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(source, 0, 0, width, height);

      for (const quality of qualitySteps) {
        const blob = typeof canvas.convertToBlob === 'function'
          ? await canvas.convertToBlob({ type: 'image/webp', quality })
          : await canvasToWebpBlob(canvas, quality);
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

function addItem(type = 'price') {
  const category = (currentDraft.content.categories || []).find(
    (c) => c.id === selectedCategoryForItems
  );
  if (!category) return;

  if (!category.items) category.items = [];

  const item = {
    id: `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    name: '',
    description: '',
    active: true
  };

  if (type === 'price' || type === 'photo') {
    item.priceCents = 0;
  }
  if (type === 'photo') {
    item._showPhoto = true;
  }
  if (type === 'text') {
    item._showPrice = false;
    item._showPhoto = false;
  } else if (type === 'price') {
    item._showPrice = true;
    item._showPhoto = false;
  } else if (type === 'photo') {
    item._showPrice = true;
    item._showPhoto = true;
  }

  if (currentDraft.content.components?.minQuantity) item.minQuantity = 1;
  if (currentDraft.content.components?.durationMinutes) item.durationMinutes = 30;

  category.items.push(item);
  activeEditingItemId = item.id; // Highlight new item in editing mode
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

function moveItem(catId, itemIdx, direction) {
  const category = (currentDraft.content.categories || []).find((c) => c.id === catId);
  if (category && category.items) {
    const targetIdx = itemIdx + direction;
    if (targetIdx >= 0 && targetIdx < category.items.length) {
      const temp = category.items[itemIdx];
      category.items[itemIdx] = category.items[targetIdx];
      category.items[targetIdx] = temp;
      renderItems();
      updateDraftAndPreview();
    }
  }
}

function duplicateItem(catId, itemIdx) {
  const category = (currentDraft.content.categories || []).find((c) => c.id === catId);
  if (category && category.items) {
    const original = category.items[itemIdx];
    const copy = structuredClone(original);
    copy.id = `item-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    if (copy.name) copy.name = `${copy.name} (Cópia)`;
    category.items.splice(itemIdx + 1, 0, copy);
    activeEditingItemId = copy.id; // Highlight duplicated item
    renderItems();
    updateDraftAndPreview();
  }
}

let autosaveTimeout = null;

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

  // AUTOSAVE DEBOUNCED TRIGGER
  const indicator = globalThis.document?.getElementById('autosave-indicator');
  if (indicator) {
    indicator.textContent = 'Alterando...';
    indicator.className = 'autosave-indicator saving';
  }

  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(async () => {
    if (!currentDraft) return;
    try {
      if (currentIsOnline) {
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
          savedDraftContent = JSON.stringify(currentDraft.content);
          if (indicator) {
            indicator.textContent = '✓ Todas as alterações foram salvas';
            indicator.className = 'autosave-indicator saved';
          }
          if (conflictBanner) conflictBanner.hidden = true;
        } else if (res.status === 409) {
          const data = await res.json();
          if (conflictBanner) conflictBanner.hidden = false;
          if (indicator) {
            indicator.textContent = '⚠️ Erro ao salvar (conflito)';
            indicator.className = 'autosave-indicator error';
          }
          if (data.error?.currentRevision && editorRevisionIndicator) {
            editorRevisionIndicator.textContent = `Revisão em conflito: ${currentDraft.revision} (servidor: ${data.error.currentRevision})`;
          }
        } else {
          if (indicator) {
            indicator.textContent = '⚠️ Erro ao salvar';
            indicator.className = 'autosave-indicator error';
          }
        }
      } else {
        currentDraft.revision += 1;
        currentDraft.updatedAt = new Date().toISOString();
        localStorage.setItem(`vitrine_local_draft_${currentSite.id}`, JSON.stringify(currentDraft));
        if (editorRevisionIndicator) {
          editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
        }
        savedDraftContent = JSON.stringify(currentDraft.content);
        if (indicator) {
          indicator.textContent = '✓ Salvo localmente (offline)';
          indicator.className = 'autosave-indicator saved';
        }
      }
    } catch {
      if (indicator) {
        indicator.textContent = '⚠️ Erro de conexão';
        indicator.className = 'autosave-indicator error';
      }
    }
  }, 1200);
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
  if (!currentDraft || !validateCatalogLocal()) return;
  const generation = editorLoadGeneration;

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

      if (generation !== editorLoadGeneration) return;
      if (res.ok) {
        const data = await res.json();
        if (generation !== editorLoadGeneration) return;
        currentDraft = data.draft;
        currentDraft.content = normalizeDraftForEditor(currentDraft.content, currentSite);
        if (editorRevisionIndicator) {
          editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
        }
        savedDraftContent = JSON.stringify(currentDraft.content);
        showFeedback('Rascunho salvo com sucesso.', 'success');
        if (conflictBanner) conflictBanner.hidden = true;
      } else if (res.status === 409) {
        const data = await res.json();
        if (generation !== editorLoadGeneration) return;
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
        if (generation !== editorLoadGeneration) return;
        showFeedback(data.error?.message || 'Erro ao salvar rascunho.', 'error');
      }
    } catch {
      if (generation !== editorLoadGeneration) return;
      showFeedback('Erro de rede ao salvar rascunho.', 'error');
    }
  } else {
    currentDraft.revision += 1;
    currentDraft.updatedAt = new Date().toISOString();
    localStorage.setItem(`vitrine_local_draft_${currentSite.id}`, JSON.stringify(currentDraft));
    if (editorRevisionIndicator) {
      editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
    }
    savedDraftContent = JSON.stringify(currentDraft.content);
    showFeedback('Rascunho local salvo com sucesso.', 'success');
    if (conflictBanner) conflictBanner.hidden = true;
  }
  updateDraftAndPreview();
}

async function handlePublishSite() {
  if (!currentDraft || !validateCatalogLocal()) return;
  const generation = editorLoadGeneration;

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

      if (generation !== editorLoadGeneration) return;
      if (saveRes.ok) {
        const savedData = await saveRes.json();
        if (generation !== editorLoadGeneration) return;
        currentDraft = savedData.draft;
        currentDraft.content = normalizeDraftForEditor(currentDraft.content, currentSite);
        if (editorRevisionIndicator) {
          editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
        }
        savedDraftContent = JSON.stringify(currentDraft.content);
      } else if (saveRes.status === 409) {
        if (conflictBanner) conflictBanner.hidden = false;
        showFeedback(
          'Conflito de revisão detectado antes de publicar. Recarregue o rascunho.',
          'error'
        );
        return;
      } else {
        const errData = await saveRes.json().catch(() => ({}));
        if (generation !== editorLoadGeneration) return;
        showFeedback(errData.error?.message || 'Erro ao salvar rascunho antes de publicar.', 'error');
        return;
      }

      const pubRes = await fetch(`/api/sites/${currentSite.id}/publish`, {
        method: 'POST'
      });

      if (generation !== editorLoadGeneration) return;
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        if (generation !== editorLoadGeneration) return;
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
        localStorage.setItem('vitrine_has_published', 'true');
        showFeedback(`Vitrine publicada com sucesso em ${pub.url}.`, 'success');
        void refreshPublicationHistory();
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
    localStorage.setItem('vitrine_has_published', 'true');
    showFeedback('Publicação validada com sucesso no modo local.', 'success');
  }
}


function quickToggleButton(target, targetType) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-small button-secondary button-pill';
  button.textContent = target.active === false ? 'Reativar no rascunho' : 'Ocultar no rascunho';
  button.addEventListener('click', async () => {
    const site = currentSite;
    const draft = currentDraft;
    button.disabled = true;
    try {
      const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/quick-toggle`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType, targetId: target.id, active: target.active === false, expectedRevision: draft.revision
        })
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Não foi possível alterar a disponibilidade.');
      if (site !== currentSite || draft !== currentDraft) return;
      draft.revision = data.draft.revision;
      target.active = target.active === false;
      if (Object.hasOwn(target, 'available')) target.available = target.active;
      if (editorRevisionIndicator) editorRevisionIndicator.textContent = `Revisão: ${draft.revision}`;
      renderCategories();
      renderItems();
      updateDraftAndPreview();
      showFeedback('Disponibilidade salva no rascunho.', 'success');
    } catch (error) {
      if (site === currentSite) showFeedback(error.message, 'error');
    } finally {
      button.disabled = false;
    }
  });
  return button;
}

async function publicationRequest(site, action, payload) {
  const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/${action}`, payload === undefined ? {} : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || 'Não foi possível concluir a operação.');
  return data;
}

securePreviewButton?.addEventListener('click', async () => {
  const site = currentSite;
  securePreviewButton.disabled = true;
  try {
    const data = await publicationRequest(site, 'preview-token', {});
    if (site === currentSite) location.assign(data.url);
  } catch (error) {
    if (site === currentSite) showFeedback(error.message, 'error');
  } finally {
    securePreviewButton.disabled = false;
  }
});

async function refreshPublicationHistory() {
  if (!publicationHistory?.open || !currentIsOnline) return;
  const site = currentSite;
  historyList.replaceChildren();
  historyStatus.textContent = 'Carregando versões…';
  try {
    const { releases } = await publicationRequest(site, 'releases');
    if (site !== currentSite || !publicationHistory.open) return;
    historyStatus.textContent = releases.length ? '' : 'Nenhuma versão publicada.';
    for (const release of releases) {
      const entry = document.createElement('li');
      const date = new Date(release.publishedAt).toLocaleString('pt-BR');
      entry.textContent = `Revisão ${release.revision} · ${date} `;
      if (['owner', 'admin'].includes(site.role)) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'button button-small button-secondary button-pill';
        button.textContent = 'Restaurar';
        button.setAttribute('aria-label', `Restaurar revisão ${release.revision}`);
        button.addEventListener('click', async () => {
          if (!window.confirm(`Publicar novamente a revisão ${release.revision}?`)) return;
          button.disabled = true;
          try {
            await publicationRequest(site, 'rollback', { targetRevision: release.revision });
            if (site === currentSite) showFeedback(`Revisão ${release.revision} restaurada.`, 'success');
          } catch (error) {
            if (site === currentSite) showFeedback(error.message, 'error');
          } finally {
            button.disabled = false;
          }
        });
        entry.append(button);
      }
      historyList.append(entry);
    }
  } catch (error) {
    if (site === currentSite) historyStatus.textContent = error.message;
  }
}

publicationHistory?.addEventListener('toggle', refreshPublicationHistory);

const team = globalThis.document?.getElementById('team-management');
const teamForm = globalThis.document?.getElementById('team-form');
const teamStatus = globalThis.document?.getElementById('team-status');
const teamMembers = globalThis.document?.getElementById('team-members');
const teamAudit = globalThis.document?.getElementById('team-audit');
const teamRoleLabels = { owner: 'Proprietário', admin: 'Administrador', editor: 'Editor', viewer: 'Leitor', collaborator: 'Colaborador' };

async function refreshTeam() {
  if (!team?.open || !currentIsOnline) return;
  const site = currentSite;
  teamMembers.replaceChildren();
  teamAudit.replaceChildren();
  teamStatus.textContent = 'Carregando equipe…';
  try {
    const [{ members }, { logs }] = await Promise.all([
      publicationRequest(site, 'members'),
      publicationRequest(site, 'audit-logs')
    ]);
    if (site !== currentSite || !team.open) return;
    teamStatus.textContent = members.length ? '' : 'Nenhum membro adicional.';
    for (const member of members) {
      const row = document.createElement('li');
      row.textContent = `${teamRoleLabels[member.role] ?? member.role} · ${member.userId} `;
      if (member.role !== 'admin' || site.role === 'owner') {
        const remove = document.createElement('button');
        remove.type = 'button';
        remove.className = 'button button-small button-secondary button-pill';
        remove.textContent = 'Remover';
        remove.setAttribute('aria-label', `Remover membro ${member.userId}`);
        remove.addEventListener('click', async () => {
          if (!window.confirm('Remover o acesso deste membro à vitrine?')) return;
          remove.disabled = true;
          try {
            const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/members/${encodeURIComponent(member.userId)}`, {
              method: 'DELETE', headers: { 'Content-Type': 'application/json' }
            });
            if (!response.ok) throw new Error('Não foi possível remover o membro.');
            if (site === currentSite) await refreshTeam();
          } catch (error) {
            if (site === currentSite) teamStatus.textContent = error.message;
          } finally {
            remove.disabled = false;
          }
        });
        row.append(remove);
      }
      teamMembers.append(row);
    }
    for (const log of logs) {
      const row = document.createElement('li');
      const action = { insert: 'Adição', update: 'Alteração', delete: 'Remoção', rollback: 'Restauração' }[log.action] ?? log.action;
      row.textContent = `${new Date(log.createdAt).toLocaleString('pt-BR')} · ${action} · ${log.entityId}`;
      teamAudit.append(row);
    }
  } catch (error) {
    if (site === currentSite) teamStatus.textContent = error.message;
  }
}

team?.addEventListener('toggle', refreshTeam);
teamForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const site = currentSite;
  const values = new FormData(teamForm);
  const submit = teamForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  try {
    await publicationRequest(site, 'members', { userId: values.get('userId').trim(), role: values.get('role') });
    if (site === currentSite) {
      teamForm.reset();
      await refreshTeam();
    }
  } catch (error) {
    if (site === currentSite) teamStatus.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

const structurePanel = globalThis.document?.getElementById('showcase-structure');
const structureStatus = globalThis.document?.getElementById('showcase-structure-status');
const structureFields = globalThis.document?.getElementById('showcase-structure-fields');

structurePanel?.addEventListener('toggle', async () => {
  if (!structurePanel.open || !currentSite) return;
  const site = currentSite;
  const endpoint = `/api/sites/${encodeURIComponent(site.id)}/structure`;
  structureFields.replaceChildren();
  structureStatus.textContent = 'Carregando estrutura…';
  try {
    const response = await fetch(endpoint);
    if (!response.ok) throw new Error('Não foi possível consultar a estrutura.');
    const { resolved, revision, widgets, templates, structure: savedStructure } = await response.json();
    if (site !== currentSite || !structurePanel.open) return;
    structureStatus.textContent = '';
    let expectedRevision = revision;
    const render = (layout, selected) => renderStructureFields(structureFields, layout, async structure => {
      try {
        if (currentDraft?.revision !== expectedRevision) {
          throw new Error('A revisão mudou. Feche e abra o editor de estrutura para recarregar.');
        }
        const saved = await fetch(endpoint, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expectedRevision, ...structure })
        });
        const data = await saved.json();
        if (!saved.ok) throw new Error(data.error?.message ?? 'Não foi possível salvar a estrutura.');
        if (site !== currentSite) return;
        expectedRevision = data.draft.revision;
        currentDraft.revision = expectedRevision;
        currentDraft.content.structure = data.draft.content.structure;
        if (savedDraftContent) {
          const previous = JSON.parse(savedDraftContent);
          previous.structure = data.draft.content.structure;
          savedDraftContent = JSON.stringify(previous);
        }
        if (Object.hasOwn(structure, 'templateCode')) render(data.resolved, data.draft.content.structure.templateCode);
        if (editorRevisionIndicator) editorRevisionIndicator.textContent = `Revisão: ${expectedRevision}`;
        structureStatus.textContent = 'Estrutura salva. Abra a prévia para conferir.';
      } catch (error) {
        if (site === currentSite) structureStatus.textContent = error.message;
      }
    }, widgets, null, { templates, selected });
    render(resolved, savedStructure?.templateCode);
  } catch (error) {
    if (site === currentSite) structureStatus.textContent = error.message;
  }
});

const assetLibrary = globalThis.document?.getElementById('asset-library');
const assetStatus = globalThis.document?.getElementById('asset-library-status');
const assetInput = globalThis.document?.getElementById('asset-library-upload');
const assetList = globalThis.document?.getElementById('asset-library-list');

function assetEndpoint(site, id) {
  return `/api/sites/${encodeURIComponent(site.id)}/assets${id ? '/' + encodeURIComponent(id) : ''}`;
}

async function loadAssetLibrary() {
  if (!assetLibrary?.open || !currentSite) return;
  const site = currentSite;
  assetStatus.textContent = 'Carregando arquivos…';
  try {
    const response = await fetch(assetEndpoint(site));
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message ?? 'Não foi possível carregar os arquivos.');
    if (site !== currentSite || !assetLibrary.open) return;
    const used = data.assets.reduce((total, item) => total + item.bytes, 0);
    const mib = bytes => (bytes / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
    assetStatus.textContent = `${data.assets.length} de ${data.maxAssets} arquivos · ${mib(used)} de ${mib(data.maxBytes)} MiB`;
    assetList.replaceChildren();
    for (const asset of data.assets) {
      const entry = document.createElement('li');
      const link = document.createElement('a');
      link.textContent = asset.key.split('/').at(-1);
      const url = new URL(asset.url);
      if (url.protocol !== 'https:') continue;
      link.href = url.href;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'button button-small button-secondary button-pill';
      remove.textContent = 'Excluir';
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Excluir ${link.textContent}?`)) return;
        remove.disabled = true;
        try {
          const result = await fetch(assetEndpoint(site, asset.id), {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }
          });
          if (!result.ok) {
            const error = await result.json();
            throw new Error(error.error?.message ?? 'Não foi possível excluir o arquivo.');
          }
          if (site === currentSite) await loadAssetLibrary();
        } catch (error) {
          if (site === currentSite) assetStatus.textContent = error.message;
        } finally {
          remove.disabled = false;
        }
      });
      entry.append(link, ' ', remove);
      assetList.append(entry);
    }
  } catch (error) {
    if (site === currentSite) assetStatus.textContent = error.message;
  }
}

assetLibrary?.addEventListener('toggle', loadAssetLibrary);
assetInput?.addEventListener('change', async () => {
  const file = assetInput.files[0];
  if (!file || !currentSite) return;
  const site = currentSite;
  assetInput.disabled = true;
  assetStatus.textContent = 'Preparando imagem…';
  try {
    const blob = await resizeAndConvertToWebP(file);
    const response = await fetch(assetEndpoint(site), {
      method: 'POST', headers: { 'Content-Type': 'image/webp' }, body: blob
    });
    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error?.message ?? 'Não foi possível enviar a imagem.');
    }
    if (site === currentSite) await loadAssetLibrary();
  } catch (error) {
    if (site === currentSite) assetStatus.textContent = error.message;
  } finally {
    assetInput.value = '';
    assetInput.disabled = false;
  }
});

const domainPanel = globalThis.document?.getElementById('custom-domains');
const domainList = globalThis.document?.getElementById('custom-domains-list');
const domainStatus = globalThis.document?.getElementById('custom-domains-status');
const defaultDomain = globalThis.document?.getElementById('default-showcase-domain');
const domainFields = globalThis.document?.getElementById('custom-domains-fields');

function domainAction(text, type = 'button') {
  const button = document.createElement('button');
  button.type = type;
  button.textContent = text;
  button.className = 'button button-small button-secondary button-pill';
  return button;
}

function renderDomainForm(site) {
  const form = document.createElement('form');
  const label = document.createElement('label');
  const hostname = document.createElement('input');
  hostname.placeholder = 'cardapio.exemplo.com.br';
  hostname.required = true;
  hostname.maxLength = 253;
  hostname.autocomplete = 'off';
  label.append('Domínio próprio ', hostname);
  const submit = domainAction('Vincular domínio', 'submit');
  form.append(label, submit);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submit.disabled = true;
    try {
      await publicationRequest(site, 'domains', { hostname: hostname.value.trim() });
      if (site === currentSite) await refreshDomains();
    } catch (error) {
      if (site === currentSite) domainStatus.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  domainFields.replaceChildren(form);
}

async function refreshDomains() {
  if (!domainPanel?.open || !currentSite) return;
  const site = currentSite;
  domainStatus.textContent = 'Consultando domínios…';
  try {
    const { domains } = await publicationRequest(site, 'domains');
    if (site !== currentSite || !domainPanel.open) return;
    domainStatus.textContent = domains.length ? '' : 'Nenhum domínio próprio vinculado.';
    domainList.replaceChildren();
    renderDomainForm(site);
    for (const domain of domains) {
      const entry = document.createElement('li');
      const name = document.createElement('strong');
      name.textContent = domain.hostname;
      const details = document.createElement('p');
      const state = { active: 'Ativo', pending_dns: 'Aguardando DNS', verifying: 'Em verificação', failed: 'Falhou', suspended: 'Suspenso' }[domain.status];
      details.textContent = `${state} · HTTPS ${domain.sslStatus === 'active' ? 'ativo' : 'pendente'}`;
      const dns = document.createElement('p');
      dns.textContent = `TXT ${domain.txtName} → ${domain.txtValue}. CNAME ${domain.hostname} → ${domain.cnameTarget}.`;
      if (domain.isApex) dns.textContent += ' Para a raiz, use DNS com CNAME flattening ou vincule um subdomínio.';
      const verify = domainAction('Verificar DNS e HTTPS');
      verify.addEventListener('click', async () => {
        verify.disabled = true;
        try {
          await publicationRequest(site, `domains/${domain.id}/verify`, {});
          if (site === currentSite) await refreshDomains();
        } catch (error) {
          if (site === currentSite) domainStatus.textContent = error.message;
        } finally {
          verify.disabled = false;
        }
      });
      const remove = domainAction('Desvincular');
      remove.addEventListener('click', async () => {
        if (!window.confirm(`Desvincular ${domain.hostname}?`)) return;
        remove.disabled = true;
        try {
          const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/domains/${domain.id}`, {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' }
          });
          if (!response.ok) {
            const data = await response.json();
            throw new Error(data.error?.message ?? 'Não foi possível desvincular o domínio.');
          }
          if (site === currentSite) await refreshDomains();
        } catch (error) {
          if (site === currentSite) domainStatus.textContent = error.message;
        } finally {
          remove.disabled = false;
        }
      });
      entry.append(name, details, dns, verify, remove);
      domainList.append(entry);
    }
  } catch (error) {
    if (site === currentSite) domainStatus.textContent = error.message;
  }
}
domainPanel?.addEventListener('toggle', refreshDomains);
