import { showFeedback } from './portal.js';
import { StorefrontRenderer } from './storefront-renderer.js';
import {
  parseImportCatalogCSV,
  applyCSVToCatalog,
  exportCatalogToCSV
} from './csv-catalog.js';

// Active editor state
let currentSite = null;
let currentIsOnline = false;
let currentDraft = null; // { siteId, revision, updatedAt, content }
let selectedCategoryForItems = null;

// DOM Elements
const editorSiteTitle = globalThis.document?.getElementById('editor-site-title');
const editorSiteSlug = globalThis.document?.getElementById('editor-site-slug');
const editorRevisionIndicator = globalThis.document?.getElementById('editor-revision-indicator');
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

// Form, Tabs & Container
const editorSettingsForm = globalThis.document?.getElementById('editor-settings-form');
const editorOrderMsgForm = globalThis.document?.getElementById('editor-order-msg-form');
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
const csvDownloadModelsBtn = globalThis.document?.getElementById('csv-download-models-btn');
const csvModelsDropdownMenu = globalThis.document?.getElementById('csv-models-dropdown-menu');
const csvExportBtn = globalThis.document?.getElementById('csv-export-btn');
const csvUploadBtn = globalThis.document?.getElementById('csv-upload-btn');
const csvFileInput = globalThis.document?.getElementById('csv-file-input');
const csvFileName = globalThis.document?.getElementById('csv-file-name');
const csvPreviewContainer = globalThis.document?.getElementById('csv-preview-container');
const csvSummaryText = globalThis.document?.getElementById('csv-summary-text');
const csvErrorsList = globalThis.document?.getElementById('csv-errors-list');
const csvApplyBtn = globalThis.document?.getElementById('csv-apply-btn');

// Entrypoint exported to portal.js
export async function loadEditor(site, isOnline) {
  currentSite = site;
  currentIsOnline = isOnline;
  currentDraft = null;
  conflictBanner.hidden = true;
  if (publicationStatusBar) {
    publicationStatusBar.hidden = true;
  }

  editorSiteTitle.textContent = site.name;
  editorSiteSlug.textContent = `vitrine.inspira.dev.br/${site.slug}`;

  // Clear workspace and tabs
  categoriesContainer.innerHTML = '<p class="loading-msg">Carregando cardápio...</p>';
  setActiveTab('settings');

  if (isOnline) {
    try {
      const res = await fetch(`/api/sites/${site.id}/draft`);
      if (res.ok) {
        const data = await res.json();
        currentDraft = data.draft;
        initializeEditorWorkspace();
      } else {
        showFeedback('Erro ao carregar o rascunho remoto.', 'error');
      }
    } catch (err) {
      showFeedback('Falha de rede ao buscar o rascunho.', 'error');
    }
  } else {
    // Offline local storage draft lookup
    const saved = localStorage.getItem(`vitrine_local_draft_${site.id}`);
    if (saved) {
      currentDraft = JSON.parse(saved);
    } else {
      // Create empty fallback
      currentDraft = {
        siteId: site.id,
        revision: 1,
        updatedAt: new Date().toISOString(),
        content: {
          schemaVersion: 1,
          template: "products-v1",
          catalogType: "products",
          slug: site.slug,
          businessName: site.name,
          whatsapp: "5511999999999",
          components: {
            name: true,
            description: true,
            photo: true,
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
            heroTitle: site.name,
            welcomeText: "Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.",
            ctaLabel: "Enviar pedido no WhatsApp",
            whatsappTemplate: "Olá! Tenho interesse nestes produtos:\n{itens}\nTotal estimado: {total}"
          },
          categories: []
        }
      };
      localStorage.setItem(`vitrine_local_draft_${site.id}`, JSON.stringify(currentDraft));
    }
    initializeEditorWorkspace();
  }
}

// Set active tab
function setActiveTab(tabId) {
  const tabs = globalThis.document?.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    if (tab.dataset.tab === tabId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  const panes = globalThis.document?.querySelectorAll('.editor-tab-pane');
  panes.forEach(pane => {
    if (pane.id === `pane-${tabId}`) {
      pane.hidden = false;
    } else {
      pane.hidden = true;
    }
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
      // preview stays visible on desktop via CSS grid
    }
  }
}

// Bind event listeners specific to the editor
function setupEditorEvents() {
  if (window.editorEventsBound) return;
  window.editorEventsBound = true;

  // Tabs events
  const tabSelector = globalThis.document?.querySelector('.editor-tabs-selector');
  tabSelector?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('.tab-btn');
    if (tabBtn) {
      setActiveTab(tabBtn.dataset.tab);
    }
  });

  saveDraftButton.addEventListener('click', async () => {
    await handleSaveDraft();
  });

  if (publishSiteButton) {
    publishSiteButton.addEventListener('click', async () => {
      await handlePublishSite();
    });
  }

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

  addCategoryButton.addEventListener('click', () => {
    addCategory();
  });

  addItemButton.addEventListener('click', () => {
    addItem();
  });

  editorCategorySelect.addEventListener('change', () => {
    selectedCategoryForItems = editorCategorySelect.value;
    renderItems();
  });

  editorWhatsapp.addEventListener('input', () => {
    const rawPhone = editorWhatsapp.value.replace(/\D/g, ''); // allow only digits
    editorWhatsapp.value = rawPhone;
    
    if (rawPhone && !/^[1-9]\d{7,14}$/.test(rawPhone)) {
      editorWhatsappError.hidden = false;
    } else {
      editorWhatsappError.hidden = true;
    }
    updateDraftAndPreview();
  });

  // Handle components changes
  [compDescription, compPhoto, compPrice, compMinQuantity, compQuantitySelector, compDuration].forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      syncComponentsFromUI();
      updateDraftAndPreview();
    });
  });

  // Handle order fields and custom messages
  [fieldDate, fieldDeliveryPickup, fieldNotes].forEach(checkbox => {
    checkbox.addEventListener('change', () => {
      syncOrderFieldsFromUI();
      updateDraftAndPreview();
    });
  });

  editorCatalogType.addEventListener('change', () => {
    currentDraft.content.catalogType = editorCatalogType.value;
    // Set matching template
    currentDraft.content.template = 
      editorCatalogType.value === 'booking' ? 'booking-v1' :
      editorCatalogType.value === 'quote' ? 'quote-v1' : 'products-v1';
    
    // Auto populate default components, orderFields and messages
    syncCatalogTypeDefaults();
    updateDraftAndPreview();
  });

  editorTimeslots.addEventListener('input', () => {
    const lines = editorTimeslots.value.split('\n')
      .map(line => line.trim())
      .filter(line => /^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(line)); // valid HH:MM
    currentDraft.content.orderFields.timeSlots = lines;
    updateDraftAndPreview();
  });

  [editorHeroTitle, editorWelcomeText, editorCtaLabel, editorWhatsappTemplate].forEach(input => {
    input.addEventListener('input', () => {
      syncMessagesFromUI();
      updateDraftAndPreview();
    });
  });

  // Conflict actions
  reloadConflictButton.addEventListener('click', async () => {
    conflictBanner.hidden = true;
    await loadEditor(currentSite, currentIsOnline);
  });

  copyConflictButton.addEventListener('click', async () => {
    try {
      const serialized = JSON.stringify(currentDraft.content, null, 2);
      await navigator.clipboard.writeText(serialized);
      showFeedback('Conteúdo do rascunho copiado para a área de transferência!', 'success');
    } catch (err) {
      showFeedback('Erro ao copiar rascunho local.', 'error');
    }
  });

  // CSV dropdown model trigger (Fix AUD-005)
  csvDownloadModelsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    csvModelsDropdownMenu.hidden = !csvModelsDropdownMenu.hidden;
  });

  globalThis.document?.addEventListener('click', () => {
    if (csvModelsDropdownMenu) csvModelsDropdownMenu.hidden = true;
  });

  csvExportBtn.addEventListener('click', () => {
    const csvContent = exportCatalogToCSV(currentDraft.content);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `cardapio-${currentSite.slug}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });

  csvUploadBtn.addEventListener('click', () => {
    csvFileInput.click();
  });

  csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    csvFileName.textContent = file.name;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const result = parseImportCatalogCSV(text, currentDraft.content.catalogType);
      
      csvPreviewContainer.hidden = false;
      csvSummaryText.textContent = `${result.summary.validCount} linhas válidas encontradas.`;
      
      if (result.errors.length > 0) {
        csvErrorsList.hidden = false;
        csvErrorsList.innerHTML = '<h5>Erros encontrados:</h5>' + 
          result.errors.map(err => `<div class="csv-error-item">${err}</div>`).join('');
      } else {
        csvErrorsList.hidden = true;
        csvErrorsList.innerHTML = '';
      }

      // Store results inside the button to read when confirmed
      csvApplyBtn.onclick = () => {
        const mode = document.querySelector('input[name="csv-import-mode"]:checked').value;
        const updatedContent = applyCSVToCatalog(currentDraft.content, result.validRows, mode);
        
        currentDraft.content = updatedContent;
        initializeEditorWorkspace();
        showFeedback('Planilha aplicada ao rascunho com sucesso! Salve para registrar.', 'success');
        
        // Reset file input
        csvFileInput.value = '';
        csvFileName.textContent = 'Nenhum arquivo selecionado';
        csvPreviewContainer.hidden = true;
      };
    };
    reader.readAsText(file, 'UTF-8');
  });
}

// Initial paint
function initializeEditorWorkspace() {
  setupEditorEvents();

  editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
  
  // Fill settings
  editorWhatsapp.value = currentDraft.content.whatsapp || '';
  editorWhatsappError.hidden = true;
  editorCatalogType.value = currentDraft.content.catalogType || 'products';

  // Toggle visible checkboxes
  const comp = currentDraft.content.components || {};
  compDescription.checked = comp.description !== false;
  compPhoto.checked = comp.photo !== false;
  compPrice.checked = comp.price !== false;
  compMinQuantity.checked = comp.minQuantity !== false;
  compQuantitySelector.checked = comp.quantitySelector !== false;
  compDuration.checked = comp.durationMinutes !== false;

  // Toggle visible order fields
  const fields = currentDraft.content.orderFields || {};
  fieldDate.checked = fields.date !== false;
  fieldDeliveryPickup.checked = fields.deliveryOrPickup !== false;
  fieldNotes.checked = fields.notes !== false;
  
  editorTimeslots.value = (fields.timeSlots || []).join('\n');
  timeslotsConfigGroup.hidden = currentDraft.content.catalogType !== 'booking';

  // Custom texts
  const msgs = currentDraft.content.messages || {};
  editorHeroTitle.value = msgs.heroTitle || currentDraft.content.businessName || '';
  editorWelcomeText.value = msgs.welcomeText || '';
  editorCtaLabel.value = msgs.ctaLabel || '';
  editorWhatsappTemplate.value = msgs.whatsappTemplate || '';

  // Sync category select dropdown
  populateCategorySelect();
  renderCategories();
  renderItems();
  updateDraftAndPreview();
}

function syncCatalogTypeDefaults() {
  const catType = currentDraft.content.catalogType;
  
  // Pre fill components default toggles
  if (catType === 'booking') {
    currentDraft.content.components = { name: true, description: true, photo: true, price: true, minQuantity: false, quantitySelector: false, durationMinutes: true };
    currentDraft.content.orderFields = { date: true, timeSlots: ['09:00', '10:00', '11:00', '14:00', '15:00', '16:00', '17:00'], deliveryOrPickup: false, customerName: true, notes: true };
    currentDraft.content.messages = {
      heroTitle: currentDraft.content.businessName,
      welcomeText: "Escolha o serviço desejado, selecione a data e o horário de preferência e confirme pelo WhatsApp.",
      ctaLabel: "Confirmar agendamento no WhatsApp",
      whatsappTemplate: "Olá! Meu nome é {nome}. Gostaria de agendar:\n{itens}\nData: {data} às {horario}\nTotal estimado: {total}"
    };
  } else if (catType === 'quote') {
    currentDraft.content.components = { name: true, description: true, photo: true, price: false, minQuantity: false, quantitySelector: true, durationMinutes: false };
    currentDraft.content.orderFields = { date: false, timeSlots: [], deliveryOrPickup: false, customerName: true, notes: true };
    currentDraft.content.messages = {
      heroTitle: currentDraft.content.businessName,
      welcomeText: "Selecione os itens de seu interesse e envie sua solicitação de orçamento pelo WhatsApp.",
      ctaLabel: "Solicitar orçamento no WhatsApp",
      whatsappTemplate: "Olá! Meu nome é {nome}. Tenho interesse em solicitar orçamento para:\n{itens}"
    };
  } else {
    currentDraft.content.components = { name: true, description: true, photo: true, price: true, minQuantity: false, quantitySelector: true, durationMinutes: false };
    currentDraft.content.orderFields = { date: false, timeSlots: [], deliveryOrPickup: true, customerName: true, notes: true };
    currentDraft.content.messages = {
      heroTitle: currentDraft.content.businessName,
      welcomeText: "Escolha seus itens abaixo, revise os dados do pedido e envie pelo WhatsApp.",
      ctaLabel: "Enviar pedido no WhatsApp",
      whatsappTemplate: "Olá! Tenho interesse nestes produtos:\n{itens}\nTotal estimado: {total}"
    };
  }

  // Reload the form configs from the newly assigned draft content
  initializeEditorWorkspace();
}

function syncComponentsFromUI() {
  currentDraft.content.components = {
    name: true,
    description: compDescription.checked,
    photo: compPhoto.checked,
    price: compPrice.checked,
    minQuantity: compMinQuantity.checked,
    quantitySelector: compQuantitySelector.checked,
    durationMinutes: compDuration.checked
  };
}

function syncOrderFieldsFromUI() {
  currentDraft.content.orderFields = {
    date: fieldDate.checked,
    timeSlots: currentDraft.content.orderFields.timeSlots || [],
    deliveryOrPickup: fieldDeliveryPickup.checked,
    customerName: true,
    notes: fieldNotes.checked
  };
}

function syncMessagesFromUI() {
  currentDraft.content.messages = {
    heroTitle: editorHeroTitle.value,
    welcomeText: editorWelcomeText.value,
    ctaLabel: editorCtaLabel.value,
    whatsappTemplate: editorWhatsappTemplate.value
  };
}

// Populate category dropdown select in Items panel
function populateCategorySelect() {
  editorCategorySelect.innerHTML = '';
  const categories = currentDraft.content.categories || [];
  
  if (categories.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhuma categoria cadastrada';
    editorCategorySelect.appendChild(opt);
    selectedCategoryForItems = null;
    return;
  }

  categories.forEach((cat, idx) => {
    const opt = document.createElement('option');
    opt.value = cat.id;
    opt.textContent = cat.name || `Categoria sem nome ${idx + 1}`;
    editorCategorySelect.appendChild(opt);
  });

  if (!selectedCategoryForItems || !categories.some(c => c.id === selectedCategoryForItems)) {
    selectedCategoryForItems = categories[0].id;
  }
  editorCategorySelect.value = selectedCategoryForItems;
}

// Render categories pane (T011)
function renderCategories() {
  categoriesContainer.innerHTML = '';
  const categories = currentDraft.content.categories || [];

  if (categories.length === 0) {
    categoriesContainer.innerHTML = '<p class="empty-msg">Nenhuma categoria cadastrada. Clique em "+ Categoria" para começar.</p>';
    return;
  }

  categories.forEach((category, catIndex) => {
    const block = document.createElement('div');
    block.className = 'category-block';
    block.dataset.index = catIndex;

    const labelGroup = document.createElement('div');
    labelGroup.className = 'form-group';

    // Accessible Label (Fix AUD-007)
    const label = document.createElement('label');
    label.setAttribute('for', `cat-input-${category.id}`);
    label.textContent = `Nome da Categoria ${catIndex + 1}`;

    const titleInput = document.createElement('input');
    titleInput.type = 'text';
    titleInput.id = `cat-input-${category.id}`;
    titleInput.className = 'category-title-input input-styled-height';
    titleInput.value = category.name || '';
    titleInput.placeholder = 'Ex: Pizzas Clássicas';
    titleInput.addEventListener('input', () => {
      category.name = titleInput.value;
      populateCategorySelect();
      updateDraftAndPreview();
    });

    labelGroup.appendChild(label);
    labelGroup.appendChild(titleInput);

    const controls = document.createElement('div');
    controls.className = 'category-controls';

    const moveUpBtn = document.createElement('button');
    moveUpBtn.type = 'button';
    moveUpBtn.className = 'button button-small button-secondary button-pill';
    moveUpBtn.textContent = '▲ Sobe';
    moveUpBtn.disabled = catIndex === 0;
    moveUpBtn.addEventListener('click', () => {
      moveCategory(catIndex, -1);
    });

    const moveDownBtn = document.createElement('button');
    moveDownBtn.type = 'button';
    moveDownBtn.className = 'button button-small button-secondary button-pill';
    moveDownBtn.textContent = '▼ Desce';
    moveDownBtn.disabled = catIndex === categories.length - 1;
    moveDownBtn.addEventListener('click', () => {
      moveCategory(catIndex, 1);
    });

    const deleteCatBtn = document.createElement('button');
    deleteCatBtn.type = 'button';
    deleteCatBtn.className = 'button button-small button-secondary button-pill';
    deleteCatBtn.textContent = 'Excluir';
    deleteCatBtn.addEventListener('click', () => {
      if (category.items && category.items.length > 0) {
        if (!confirm(`Deseja mesmo excluir a categoria "${category.name}" e todos os seus ${category.items.length} itens?`)) {
          return;
        }
      }
      deleteCategory(catIndex);
    });

    controls.appendChild(moveUpBtn);
    controls.appendChild(moveDownBtn);
    controls.appendChild(deleteCatBtn);

    block.appendChild(labelGroup);
    block.appendChild(controls);
    categoriesContainer.appendChild(block);
  });
}

// Render items pane for chosen category
function renderItems() {
  itemsContainer.innerHTML = '';
  if (!selectedCategoryForItems) {
    itemsContainer.innerHTML = '<p class="empty-msg">Cadastre uma categoria na aba anterior para adicionar itens.</p>';
    return;
  }

  const category = (currentDraft.content.categories || []).find(c => c.id === selectedCategoryForItems);
  if (!category) return;

  if (!category.items || category.items.length === 0) {
    itemsContainer.innerHTML = '<p class="empty-msg">Nenhum item nesta categoria. Clique em "+ Adicionar Item".</p>';
    return;
  }

  category.items.forEach((item, itemIdx) => {
    const card = document.createElement('div');
    card.className = 'item-block';

    const fields = document.createElement('div');
    fields.className = 'item-fields';

    // Item name with label (Fix AUD-007)
    const gName = document.createElement('div');
    gName.className = 'form-group';
    const lName = document.createElement('label');
    lName.setAttribute('for', `item-name-${item.id}`);
    lName.textContent = 'Nome do Item (obrigatório)';
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

    // Item Price with label (Fix AUD-007)
    const gPrice = document.createElement('div');
    gPrice.className = 'form-group';
    const lPrice = document.createElement('label');
    lPrice.setAttribute('for', `item-price-${item.id}`);
    lPrice.textContent = 'Preço (BRL)';
    const priceInput = document.createElement('input');
    priceInput.type = 'text';
    priceInput.id = `item-price-${item.id}`;
    priceInput.className = 'item-input input-styled-height';
    priceInput.placeholder = 'Ex: R$ 48,00';
    priceInput.value = item.priceCents ? formatCentsToReais(item.priceCents) : '';
    priceInput.addEventListener('input', () => {
      maskMoneyInput(priceInput);
      item.priceCents = parseReaisToCents(priceInput.value);
      updateDraftAndPreview();
    });
    gPrice.appendChild(lPrice);
    gPrice.appendChild(priceInput);

    // Item description with label
    const gDesc = document.createElement('div');
    gDesc.className = 'form-group item-fields-full';
    const lDesc = document.createElement('label');
    lDesc.setAttribute('for', `item-desc-${item.id}`);
    lDesc.textContent = 'Descrição do Item (opcional)';
    const descInput = document.createElement('input');
    descInput.type = 'text';
    descInput.id = `item-desc-${item.id}`;
    descInput.className = 'item-input input-styled-height';
    descInput.value = item.description || '';
    descInput.placeholder = 'Ex: Molho de tomate, muçarela...';
    descInput.addEventListener('input', () => {
      item.description = descInput.value;
      updateDraftAndPreview();
    });
    gDesc.appendChild(lDesc);
    gDesc.appendChild(descInput);

    fields.appendChild(gName);
    fields.appendChild(gPrice);
    fields.appendChild(gDesc);

    // Photo/Image Upload block (T019)
    if (currentDraft.content.components?.photo) {
      const gPhoto = document.createElement('div');
      gPhoto.className = 'form-group item-fields-full';
      
      const lPhoto = document.createElement('label');
      lPhoto.textContent = 'Foto do Item (redimensionada automaticamente para WebP)';
      gPhoto.appendChild(lPhoto);

      const fileGroup = document.createElement('div');
      fileGroup.className = 'file-upload-group';

      const fileInp = document.createElement('input');
      fileInp.type = 'file';
      fileInp.accept = 'image/*';
      fileInp.className = 'file-input-hidden';

      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'button button-small button-secondary button-pill';
      uploadBtn.textContent = item.imageUrl ? 'Alterar Foto' : 'Adicionar Foto';
      uploadBtn.addEventListener('click', () => fileInp.click());

      const statusSpan = document.createElement('span');
      statusSpan.className = 'upload-status-text';
      statusSpan.textContent = item.imageUrl ? '✓ Foto configurada' : 'Sem foto cadastrada';

      fileInp.addEventListener('change', async () => {
        const file = fileInp.files[0];
        if (!file) return;

        statusSpan.textContent = 'Processando imagem...';
        try {
          const webpBlob = await resizeAndConvertToWebP(file);
          
          if (currentIsOnline) {
            statusSpan.textContent = 'Enviando para o servidor...';
            const uploadedUrl = await uploadImageToSupabaseStorage(webpBlob, item.id);
            item.imageUrl = uploadedUrl;
            statusSpan.textContent = '✓ Upload concluído!';
          } else {
            // Offline mode blob preview
            item.imageUrl = URL.createObjectURL(webpBlob);
            statusSpan.textContent = '✓ Imagem configurada offline!';
          }
          
          updateDraftAndPreview();
        } catch (err) {
          statusSpan.textContent = '❌ Erro no processamento.';
          showFeedback('Erro ao processar/upload da imagem.', 'error');
        }
      });

      fileGroup.appendChild(fileInp);
      fileGroup.appendChild(uploadBtn);
      fileGroup.appendChild(statusSpan);
      gPhoto.appendChild(fileGroup);
      fields.appendChild(gPhoto);
    }

    // Min Quantity and Duration fields (depending on checkboxes)
    if (currentDraft.content.components?.minQuantity) {
      const gMin = document.createElement('div');
      gMin.className = 'form-group';
      const lMin = document.createElement('label');
      lMin.setAttribute('for', `item-min-${item.id}`);
      lMin.textContent = 'Quantidade Mínima';
      const minInput = document.createElement('input');
      minInput.type = 'number';
      minInput.id = `item-min-${item.id}`;
      minInput.className = 'item-input input-styled-height';
      minInput.min = '1';
      minInput.max = '99';
      minInput.value = item.minQuantity || 1;
      minInput.addEventListener('input', () => {
        item.minQuantity = parseInt(minInput.value, 10) || 1;
        updateDraftAndPreview();
      });
      gMin.appendChild(lMin);
      gMin.appendChild(minInput);
      fields.appendChild(gMin);
    }

    if (currentDraft.content.components?.durationMinutes) {
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
      durInput.value = item.durationMinutes || 30;
      durInput.addEventListener('input', () => {
        item.durationMinutes = parseInt(durInput.value, 10) || 30;
        updateDraftAndPreview();
      });
      gDur.appendChild(lDur);
      gDur.appendChild(durInput);
      fields.appendChild(gDur);
    }

    const controls = document.createElement('div');
    controls.className = 'item-controls';

    // Toggle Ocultar / Ativo
    const activeLabel = document.createElement('label');
    activeLabel.className = 'toggle-container';
    
    const activeCheckbox = document.createElement('input');
    activeCheckbox.type = 'checkbox';
    activeCheckbox.checked = item.active !== false; // default is true
    activeCheckbox.addEventListener('change', () => {
      item.active = activeCheckbox.checked;
      updateDraftAndPreview();
    });

    const activeText = document.createTextNode('Ativo');
    activeLabel.appendChild(activeCheckbox);
    activeLabel.appendChild(activeText);

    const removeItemBtn = document.createElement('button');
    removeItemBtn.type = 'button';
    removeItemBtn.className = 'button button-small button-secondary button-pill';
    removeItemBtn.textContent = 'Excluir';
    removeItemBtn.addEventListener('click', () => {
      removeItem(selectedCategoryForItems, itemIdx);
    });

    controls.appendChild(activeLabel);
    controls.appendChild(removeItemBtn);

    card.appendChild(fields);
    card.appendChild(controls);
    itemsContainer.appendChild(card);
  });
}

// Client-side resizing and WebP conversion
async function resizeAndConvertToWebP(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxDim = 800; // max 800px dimension (WebP ~200KB target)

        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Falha na conversão WebP.'));
          }
        }, 'image/webp', 0.8);
      };
      img.onerror = () => reject(new Error('Imagem inválida.'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo.'));
    reader.readAsDataURL(file);
  });
}

// Direct upload using accessToken to Supabase Storage bucket (FR-010)
async function uploadImageToSupabaseStorage(blob, itemId) {
  const token = sessionStorage.getItem('supabase_access_token');
  const key = sessionStorage.getItem('supabase_publishable_key');
  
  if (!token || !key) {
    throw new Error('Autenticação de armazenamento pendente. Salve ou reconecte.');
  }

  // Path matches expected: <site_id>/<item_id>-<hash_curto>.webp
  const hash = Math.floor(Math.random() * 10000);
  const path = `${currentSite.id}/${itemId}-${hash}.webp`;
  
  const uploadUrl = `https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/catalog-images/${path}`;

  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey': key,
      'Content-Type': 'image/webp'
    },
    body: blob
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Falha no upload: ${errText}`);
  }

  // Return public HTTPS URL
  return `https://qawlpsrfewosxsfgmmpm.supabase.co/storage/v1/object/public/catalog-images/${path}`;
}

// Helpers
function formatCentsToReais(cents) {
  if (typeof cents !== 'number' || isNaN(cents)) return 'R$ 0,00';
  const reais = cents / 100;
  return reais.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function maskMoneyInput(inputEl) {
  let value = inputEl.value.replace(/\D/g, ''); // only digits
  if (!value) {
    inputEl.value = '';
    return;
  }
  let integerPart = value.slice(0, -2) || '0';
  let decimalPart = value.slice(-2).padStart(2, '0');
  integerPart = parseInt(integerPart, 10).toString();
  
  inputEl.value = `R$ ${integerPart},${decimalPart}`;
}

function parseReaisToCents(valStr) {
  const digits = valStr.replace(/\D/g, '');
  return parseInt(digits, 10) || 0;
}

// Categories Actions
function addCategory() {
  const id = `cat-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  currentDraft.content.categories.push({
    id,
    name: '',
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
    renderCategories();
    updateDraftAndPreview();
  }
}

// Items Actions
function addItem() {
  const category = (currentDraft.content.categories || []).find(c => c.id === selectedCategoryForItems);
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
  renderItems();
  updateDraftAndPreview();
}

function removeItem(catId, itemIdx) {
  const category = (currentDraft.content.categories || []).find(c => c.id === catId);
  if (category && category.items) {
    category.items.splice(itemIdx, 1);
    renderItems();
    updateDraftAndPreview();
  }
}

// Reactively calculate size and counts and render live preview
function updateDraftAndPreview() {
  if (!currentDraft) return;

  // Size measurement
  const textEncoder = new TextEncoder();
  const serialized = JSON.stringify(currentDraft.content);
  const sizeInBytes = textEncoder.encode(serialized).length;

  draftSizeCount.textContent = `${(sizeInBytes / 1024).toFixed(2)} KiB / 256 KiB`;
  draftSizeProgress.value = sizeInBytes;
  draftSizeWarning.hidden = sizeInBytes <= 262144;

  // Counts measurement
  let totalCount = 0;
  let activeCount = 0;

  (currentDraft.content.categories || []).forEach(cat => {
    if (cat.items) {
      cat.items.forEach(item => {
        totalCount++;
        if (item.active !== false) {
          activeCount++;
        }
      });
    }
  });

  // Display active item count
  activeItemsCount.textContent = `${activeCount} / 20`;
  activeItemsProgress.value = activeCount;
  activeItemsWarning.hidden = activeCount <= 20;

  // Display total item count
  totalItemsCount.textContent = `${totalCount} / 100`;
  totalItemsProgress.value = totalCount;
  totalItemsWarning.hidden = totalCount <= 100;

  // Disable save button if technically invalid size or limits exceeded
  const isInvalid = sizeInBytes > 262144;
  saveDraftButton.disabled = isInvalid;

  renderLivePreview();
}

// Render dynamic instant visual storefront mock using StorefrontRenderer
function renderLivePreview() {
  liveStorefrontPreview.innerHTML = '';
  
  // Clone currentDraft.content to avoid affecting active input state during render
  const menuConfig = structuredClone(currentDraft.content);
  
  const renderer = new StorefrontRenderer(liveStorefrontPreview, menuConfig, {
    isPreview: true,
    targetWhatsapp: menuConfig.whatsapp
  });
  renderer.render();
}

// Validate catalog draft payload locally before saving
function validateCatalogLocal() {
  const { whatsapp, categories } = currentDraft.content;

  if (!whatsapp) {
    showFeedback('Digite o número de WhatsApp comercial.', 'error');
    return false;
  }

  if (!/^[1-9]\d{7,14}$/.test(whatsapp)) {
    showFeedback('Número de WhatsApp comercial inválido. Exemplo: 5511999999999', 'error');
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
        totalCount++;
        if (item.active !== false) {
          activeCount++;
        }

        if (!item.name || !item.name.trim()) {
          showFeedback(`O item na categoria "${cat.name}" e posição ${itemIndex + 1} precisa ter um nome.`, 'error');
          hasValidationErrors = true;
        }

        // Only enforce price validation if price component is toggled on and it's NOT a quote mode
        if (currentDraft.content.components?.price && currentDraft.content.catalogType !== 'quote') {
          if (!Number.isSafeInteger(item.priceCents) || item.priceCents <= 0) {
            showFeedback(`O preço do item "${item.name || `Item ${itemIndex + 1}`}" precisa ser um valor maior que R$ 0,00.`, 'error');
            hasValidationErrors = true;
          }
        }
      });
    }
  });

  if (hasValidationErrors) return false;

  if (activeCount > 20) {
    showFeedback('O plano básico gratuito permite no máximo 20 itens ativos. Oculte alguns itens antes de salvar.', 'error');
    return false;
  }

  if (totalCount > 100) {
    showFeedback('O limite técnico total é de 100 itens (ativos e ocultos). Remova alguns itens antes de salvar.', 'error');
    return false;
  }

  return true;
}

// Handle save draft
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
        editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
        showFeedback('Rascunho salvo com sucesso!', 'success');
        conflictBanner.hidden = true;
      } else if (res.status === 409) {
        const data = await res.json();
        conflictBanner.hidden = false;
        showFeedback('Conflito de revisão detectado. Salve suas alterações locais ou recarregue.', 'error');
        if (data.error && data.error.currentRevision) {
          editorRevisionIndicator.textContent = `Revisão (Conflito): ${currentDraft.revision} (Atual no Servidor: ${data.error.currentRevision})`;
        }
      } else {
        const data = await res.json();
        showFeedback(data.error?.message || 'Erro ao salvar rascunho.', 'error');
      }
    } catch (err) {
      showFeedback('Erro de rede ao salvar rascunho.', 'error');
    }
  } else {
    // Offline / Local save
    currentDraft.revision += 1;
    currentDraft.updatedAt = new Date().toISOString();
    localStorage.setItem(`vitrine_local_draft_${currentSite.id}`, JSON.stringify(currentDraft));
    editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
    showFeedback('Rascunho local salvo com sucesso (revisão incrementada)!', 'success');
    conflictBanner.hidden = true;
  }
  updateDraftAndPreview();
}

// Handle publish storefront
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
        editorRevisionIndicator.textContent = `Revisão: ${currentDraft.revision}`;
      } else if (saveRes.status === 409) {
        conflictBanner.hidden = false;
        showFeedback('Conflito de revisão detectado antes de publicar. Recarregue o rascunho.', 'error');
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
          publicationStatusText.textContent = `Revisão ${pub.revision} publicada em ${pub.url} (SHA-256: ${shortHash}…)`;
          publicationViewLink.href = pub.url;
          publicationStatusBar.hidden = false;
        }
        showFeedback(`Vitrine publicada com sucesso em ${pub.url}!`, 'success');
      } else {
        const errData = await pubRes.json().catch(() => ({}));
        showFeedback(
          errData.error?.message || 'Falha ao publicar vitrine. A publicação anterior foi preservada.',
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
    showFeedback('Publicação validada com sucesso no modo local!', 'success');
  }
}
