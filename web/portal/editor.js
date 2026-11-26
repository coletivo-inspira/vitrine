import {
  canChooseStructurePalette,
  getStructurePalette,
  renderStructureFields,
  setStructurePalette
} from './showcase-structure.js';
import { renderPalettePicker } from './palette-picker.mjs';
import { confirmDomainDisconnect } from './site-lifecycle.js';
import {
  bindMenu,
  closeDialog,
  copyToClipboard,
  openDialog,
  portalRequest,
  publicUrlForSite,
  showFeedback,
  updateSiteSummary,
  vitrineHash
} from './portal.js';
import { mountTeamPanel } from './team-panel.mjs';
import { attachWhatsappMask, extractPhoneDigits, formatWhatsappBR } from './phone-mask.mjs';
import { StorefrontRenderer, slugifyCategoryId } from '../assets/storefront-renderer.mjs';
import { MILA_WHATSAPP, ORDER_RELAY_MILA, buildPublicOrderRelay } from '../assets/mila-relay.mjs';
import {
  addTimeSlot,
  buildHighlightedTemplateNodes,
  buildSimulatedWhatsappPreview,
  generateTimeSlotInterval,
  getAvailableTemplateVariables,
  handleAtomicVariableKeydown,
  normalizeTimeSlots,
  removeTimeSlot,
  toggleVariableInTemplate
} from './order-message-tools.mjs';
import { formatAuctionDeadline } from '../assets/auction-rules.mjs';
import { mountPlacePanel, showPlaceServerErrors } from './place-panel.mjs';
import { mountSeoPanel, showSeoServerErrors } from './seo-panel.mjs';
import { mountCommentToVitrinePanel } from './comment-to-vitrine.mjs';
import { mountQuoteWebhookPanel } from './quote-webhook.mjs';
import { mountChannelsPanel, refreshChannelsPanel } from './channels-panel.mjs';
import { loadSitePlan, lockAction, markPlanRequirement, requiredPlanFor } from './plan-gate.mjs';
import { renderItemPageFields } from './item-page-fields.mjs';
import { renderPaymentLinkField, showPaymentLinkServerErrors } from './payment-link-field.mjs';
import { itemPageTexts } from '../assets/item-page-fields.mjs';
import {
  DEFAULT_SOON_LABEL,
  ITEM_AVAILABILITY_LABEL_MAX,
  ITEM_VISIBILITY_STATES,
  applyItemVisibilityState,
  itemVisibilityState
} from '../assets/item-availability.mjs';
import {
  QUOTA_MAX_TOTAL,
  QUOTA_MIN_TOTAL,
  QUOTA_TEXT_MAX_LENGTH,
  findProhibitedQuotaTerm
} from '../assets/quota-rules.mjs';
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
let editorLoadInFlight = false;
let pendingRename = null;
let renameTimer = null;
let autosaveTimeout = null;
let autosaveInFlight = null;
let autosaveBlocked = false;

const AUTOSAVE_DELAY_MS = 1500;
const LIMIT_WARNING_RATIO = 0.8;
const MAX_ACTIVE_ITEMS = 20;
const MAX_TOTAL_ITEMS = 100;
const MAX_DRAFT_BYTES = 262144;
const KEEPALIVE_MAX_BYTES = 60000;
const EDITOR_TABS = ['itens', 'pedidos', 'config'];
const LEGACY_EDITOR_TABS = Object.freeze({
  items: 'itens',
  categories: 'itens',
  preview: 'itens',
  settings: 'config',
  'order-msg': 'config',
  channels: 'config'
});
const MANAGER_ROLES = ['owner', 'admin'];

export function clearEditor() {
  editorLoadGeneration += 1;
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = null;
  clearRenameTimer();
  pendingRename = null;
  currentDraft = null;
  currentSite = null;
  savedDraftContent = '';
}

export function hasUnsavedDraftChanges() {
  return Boolean(currentDraft && JSON.stringify(currentDraft.content) !== savedDraftContent);
}

export function isEditorShowingSite(siteId) {
  return Boolean(currentSite && currentSite.id === siteId && (currentDraft || editorLoadInFlight));
}

function canManageSite(site) {
  return Boolean(site) && (!site.role || MANAGER_ROLES.includes(site.role));
}
let selectedCategoryForItems = null;
let activePreviewRenderer = null;
let activeEditingItemId = null;

// DOM Elements
const editorSiteSlug = globalThis.document?.getElementById('editor-site-slug');
const editorRevisionIndicator = globalThis.document?.getElementById('editor-revision-indicator');
const editorOpenPublicLink = globalThis.document?.getElementById('editor-open-public-link');
const publishSiteButton = globalThis.document?.getElementById('publish-site-button');
const vitrineMoreBtn = globalThis.document?.getElementById('vitrine-more-btn');
const vitrineMoreMenu = globalThis.document?.getElementById('vitrine-more-menu');
const customizeOpenBtn = globalThis.document?.getElementById('customize-open-btn');
const previewOpenBtn = globalThis.document?.getElementById('preview-open-btn');
const customizeDialog = globalThis.document?.getElementById('customize-dialog');
const customizeForm = globalThis.document?.getElementById('customize-form');
const previewDialog = globalThis.document?.getElementById('preview-dialog');
const publishDialog = globalThis.document?.getElementById('publish-dialog');
const publishDialogText = globalThis.document?.getElementById('publish-dialog-text');
const publishLinkInput = globalThis.document?.getElementById('publish-link-input');
const publishCopyBtn = globalThis.document?.getElementById('publish-copy-btn');
const publicLinkInput = globalThis.document?.getElementById('public-link-input');
const copyPublicLinkBtn = globalThis.document?.getElementById('copy-public-link-btn');
const csvUploadMenuItem = globalThis.document?.getElementById('csv-upload-menu-item');
const editorLimits = globalThis.document?.getElementById('editor-limits');
const editorTabList = globalThis.document?.querySelector('.vitrine-tabs');
const editorPanels = {
  itens: globalThis.document?.getElementById('panel-itens'),
  pedidos: globalThis.document?.getElementById('panel-pedidos'),
  config: globalThis.document?.getElementById('panel-config')
};
const configAcesso = globalThis.document?.getElementById('config-acesso');
const configAtendimentoSummary = globalThis.document?.getElementById('config-atendimento-summary');
const configPedidoSummary = globalThis.document?.getElementById('config-pedido-summary');
const configItensSummary = globalThis.document?.getElementById('config-itens-summary');
const configAcessoSummary = globalThis.document?.getElementById('config-acesso-summary');
const teamPanelSlot = globalThis.document?.getElementById('team-panel');
const palettePickerSlot = globalThis.document?.getElementById('palette-picker');
const editorStorefrontType = globalThis.document?.getElementById('editor-storefront-type');
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
const editorBusinessName = globalThis.document?.getElementById('vitrine-name-input');
const editorWhatsapp = globalThis.document?.getElementById('editor-whatsapp');
const editorWhatsappError = globalThis.document?.getElementById('editor-whatsapp-error');
const editorMilaRelay = globalThis.document?.getElementById('editor-mila-relay');
const editorMilaRelayHelp = globalThis.document?.getElementById('editor-mila-relay-help');
const editorCatalogType = globalThis.document?.getElementById('editor-catalog-type');
const editorLocalityListed = globalThis.document?.getElementById('editor-locality-listed');
const editorLocalityCity = globalThis.document?.getElementById('editor-locality-city');
const editorLocalityUf = globalThis.document?.getElementById('editor-locality-uf');
const editorLocalityError = globalThis.document?.getElementById('editor-locality-error');
const editorLocalityLink = globalThis.document?.getElementById('editor-locality-link');
const LOCALITY_CITY_PATTERN = /^[\p{L}][\p{L}\s.'’-]{0,58}[\p{L}.]$/u;
const liveStorefrontPreview = globalThis.document?.getElementById('live-storefront-preview');

// Components checkboxes
const compDescription = globalThis.document?.getElementById('comp-description');
const compPhoto = globalThis.document?.getElementById('comp-photo');
const compPrice = globalThis.document?.getElementById('comp-price');
const compMinQuantity = globalThis.document?.getElementById('comp-min-quantity');
const compQuantitySelector = globalThis.document?.getElementById('comp-quantity-selector');
const compDuration = globalThis.document?.getElementById('comp-duration');

// Category selector and Items panel
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
const editorWhatsappBackdrop = globalThis.document?.getElementById('editor-whatsapp-backdrop');
const whatsappTemplateVars = globalThis.document?.getElementById('whatsapp-template-vars');
const simulateWhatsappBtn = globalThis.document?.getElementById('simulate-whatsapp-btn');
const whatsappSimulationPanel = globalThis.document?.getElementById('whatsapp-simulation-panel');
const whatsappSimCloseBtn = globalThis.document?.getElementById('whatsapp-sim-close-btn');
const whatsappSimWarning = globalThis.document?.getElementById('whatsapp-sim-warning');
const whatsappSimBubbleText = globalThis.document?.getElementById('whatsapp-sim-bubble-text');
const whatsappSimOpenLink = globalThis.document?.getElementById('whatsapp-sim-open-link');

const timeslotPickerInput = globalThis.document?.getElementById('timeslot-picker-input');
const timeslotAddBtn = globalThis.document?.getElementById('timeslot-add-btn');
const timeslotGeneratorToggleBtn = globalThis.document?.getElementById('timeslot-generator-toggle-btn');
const timeslotGeneratorPanel = globalThis.document?.getElementById('timeslot-generator-panel');
const timeslotGenStart = globalThis.document?.getElementById('timeslot-gen-start');
const timeslotGenEnd = globalThis.document?.getElementById('timeslot-gen-end');
const timeslotGenStep = globalThis.document?.getElementById('timeslot-gen-step');
const timeslotGenApplyBtn = globalThis.document?.getElementById('timeslot-gen-apply-btn');
const timeslotClearAllBtn = globalThis.document?.getElementById('timeslot-clear-all-btn');
const timeslotsChipsList = globalThis.document?.getElementById('timeslots-chips-list');
const timeslotsStatusNote = globalThis.document?.getElementById('timeslots-status-note');

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

export function applyCatalogTypeSwitch(draftContent, nextType) {
  if (!draftContent || typeof draftContent !== 'object') return draftContent;
  draftContent.catalogType = nextType;
  draftContent.template =
    nextType === 'booking' ? 'booking-v1' : nextType === 'quote' ? 'quote-v1' : 'products-v1';
  const defaults = getCatalogDefaults(
    nextType,
    draftContent.businessName,
    draftContent.template
  );
  draftContent.components = defaults.components;
  draftContent.orderFields = defaults.orderFields;
  draftContent.messages = defaults.messages;
  return draftContent;
}

export function getCatalogTypeDisplayLabel(catalogType) {
  if (catalogType === 'booking') return 'Agendamento de Serviços';
  if (catalogType === 'quote') return 'Lista de Interesse / Orçamento';
  return 'Produtos (com carrinho)';
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
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = null;
  autosaveBlocked = false;
  currentSite = site;
  currentIsOnline = isOnline;
  currentDraft = null;
  editorLoadInFlight = true;
  selectedCategoryForItems = null;
  activePreviewRenderer = null;
  activeEditingItemId = null;

  if (team) {
    team.open = false;
    team.hidden = !isOnline || !MANAGER_ROLES.includes(site.role);
  }
  if (configAcesso) configAcesso.open = false;
  resetTeamPanel();
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

  void applyPlanGates(site, isOnline);

  if (conflictBanner) conflictBanner.hidden = true;
  if (publicationStatusBar) publicationStatusBar.hidden = true;
  if (csvPreviewContainer) csvPreviewContainer.hidden = true;

  if (editorBusinessName) editorBusinessName.value = site.name || '';
  if (editorSiteSlug) editorSiteSlug.textContent = `vitrine.inspira.dev.br/${site.slug}`;
  if (editorOpenPublicLink) {
    editorOpenPublicLink.href = isOnline ? `/${site.slug}` : '/loja1';
  }
  if (publishSiteButton) publishSiteButton.hidden = !canManageSite(site);
  updateAccessSection(site);
  setSaveIndicator('loading');

  if (itemsContainer) {
    itemsContainer.replaceChildren();
    const loadingP = document.createElement('p');
    loadingP.className = 'loading-msg';
    loadingP.textContent = 'Carregando vitrine...';
    itemsContainer.appendChild(loadingP);
  }

  if (isOnline) {
    try {
      const res = await fetch(`/api/sites/${site.id}/draft`);
      if (res.ok) {
        const data = await res.json();
        if (generation !== editorLoadGeneration) return;
        editorLoadInFlight = false;
        currentDraft = data.draft;
        currentDraft.content = normalizeDraftForEditor(currentDraft.content, site);
        initializeEditorWorkspace({ skipAutosave: true });
        savedDraftContent = JSON.stringify(currentDraft.content);
      } else if (generation === editorLoadGeneration) {
        editorLoadInFlight = false;
        setSaveIndicator('error', 'rascunho indisponível');
        showFeedback('Erro ao carregar o rascunho remoto.', 'error');
      }
    } catch {
      if (generation === editorLoadGeneration) {
        editorLoadInFlight = false;
        setSaveIndicator('error', 'sem conexão');
        showFeedback('Falha de rede ao buscar o rascunho.', 'error');
      }
    }
  } else {
    editorLoadInFlight = false;
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
    initializeEditorWorkspace({ skipAutosave: true });
    savedDraftContent = JSON.stringify(currentDraft.content);
  }
}

export function resolveEditorTab(tabId) {
  if (EDITOR_TABS.includes(tabId)) return tabId;
  return LEGACY_EDITOR_TABS[tabId] ?? 'itens';
}

export function showEditorTab(tabId) {
  const target = resolveEditorTab(tabId);
  editorTabList?.querySelectorAll('[role="tab"]').forEach((tab) => {
    const isMatch = tab.dataset.tab === target;
    tab.classList.toggle('active', isMatch);
    tab.setAttribute('aria-selected', isMatch ? 'true' : 'false');
    tab.tabIndex = isMatch ? 0 : -1;
  });
  for (const [name, panel] of Object.entries(editorPanels)) {
    if (panel) panel.hidden = name !== target;
  }
  if (target === 'config') refreshChannelsPanel();
  return target;
}

function goToTab(tabId) {
  const target = showEditorTab(tabId);
  if (!currentSite || !globalThis.window) return;
  const hash = vitrineHash(currentSite.id, target);
  if (globalThis.window.location.hash !== hash) globalThis.window.location.hash = hash;
}

function openEditorSection(tabId, targetId) {
  goToTab(tabId);
  const target = globalThis.document?.getElementById(targetId);
  if (!target || target.hidden) return;
  for (let parent = target.parentElement?.closest('details'); parent; parent = parent.parentElement?.closest('details')) {
    parent.open = true;
  }
  if (target.tagName === 'DETAILS') target.open = true;
  const focusable = target.tagName === 'DETAILS' ? target.querySelector('summary') : target;
  target.scrollIntoView?.({ block: 'start' });
  if (focusable && !focusable.hasAttribute('tabindex') && !/^(INPUT|SELECT|TEXTAREA|BUTTON|SUMMARY|A)$/.test(focusable.tagName)) {
    focusable.setAttribute('tabindex', '-1');
  }
  focusable?.focus?.({ preventScroll: true });
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

  editorTabList?.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[role="tab"]');
    if (tabBtn) goToTab(tabBtn.dataset.tab);
  });

  editorTabList?.addEventListener('keydown', (e) => {
    const tabs = Array.from(editorTabList.querySelectorAll('[role="tab"]'));
    const index = tabs.indexOf(globalThis.document?.activeElement);
    if (index === -1) return;
    let next = null;
    if (e.key === 'ArrowRight') next = tabs[(index + 1) % tabs.length];
    else if (e.key === 'ArrowLeft') next = tabs[(index - 1 + tabs.length) % tabs.length];
    else if (e.key === 'Home') next = tabs[0];
    else if (e.key === 'End') next = tabs[tabs.length - 1];
    if (!next) return;
    e.preventDefault();
    goToTab(next.dataset.tab);
    next.focus();
  });

  publishSiteButton?.addEventListener('click', async () => {
    if (publishSiteButton.disabled) return;
    publishSiteButton.disabled = true;
    try {
      await handlePublishSite();
    } finally {
      publishSiteButton.disabled = false;
    }
  });

  bindMenu(vitrineMoreBtn, vitrineMoreMenu);

  customizeOpenBtn?.addEventListener('click', () => {
    openDialog(customizeDialog, customizeOpenBtn);
  });

  customizeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    closeDialog(customizeDialog);
  });

  previewOpenBtn?.addEventListener('click', () => {
    if (!currentDraft) return;
    activePreviewRenderer = null;
    renderLivePreview();
    openDialog(previewDialog, previewOpenBtn);
  });

  publishCopyBtn?.addEventListener('click', async () => {
    const ok = await copyToClipboard(publishLinkInput?.value || '');
    showFeedback(ok ? 'Link da vitrine copiado.' : 'Não foi possível copiar o link.', ok ? 'success' : 'error');
  });

  copyPublicLinkBtn?.addEventListener('click', async () => {
    const ok = await copyToClipboard(publicLinkInput?.value || '');
    showFeedback(ok ? 'Link da vitrine copiado.' : 'Não foi possível copiar o link.', ok ? 'success' : 'error');
  });

  csvUploadMenuItem?.addEventListener('click', () => {
    csvFileInput?.click();
  });

  editorStorefrontType?.addEventListener('change', () => {
    if (!currentDraft) return;
    currentDraft.content.storefrontType = editorStorefrontType.value;
    updateDraftAndPreview();
  });

  configAcesso?.addEventListener('toggle', () => {
    if (configAcesso.open) void refreshTeamPanel();
  });

  globalThis.window?.addEventListener('pagehide', handlePageHide);

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

  // Floating Side/Bottom Toolbar Event Listeners
  const toolbarAddItem = document.getElementById('toolbar-add-item');
  const toolbarAddItemMenu = document.getElementById('toolbar-add-item-menu');
  const toolbarAddSection = document.getElementById('toolbar-add-section');
  const toolbarAddImage = document.getElementById('toolbar-add-image');

  const closeToolbarAddMenu = () => {
    if (toolbarAddItem) toolbarAddItem.setAttribute('aria-expanded', 'false');
    if (toolbarAddItemMenu) toolbarAddItemMenu.hidden = true;
  };

  toolbarAddItem?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!currentDraft) return;
    if (currentDraft.content.catalogType === 'booking') return;
    const expanded = toolbarAddItem.getAttribute('aria-expanded') === 'true';
    toolbarAddItem.setAttribute('aria-expanded', expanded ? 'false' : 'true');
    if (toolbarAddItemMenu) {
      toolbarAddItemMenu.hidden = expanded;
      if (!expanded) {
        const firstOpt = toolbarAddItemMenu.querySelector('.toolbar-mode-option');
        firstOpt?.focus();
      }
    }
  });

  toolbarAddItem?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (toolbarAddItemMenu && toolbarAddItemMenu.hidden) {
        toolbarAddItem.setAttribute('aria-expanded', 'true');
        toolbarAddItemMenu.hidden = false;
      }
      const opts = Array.from(toolbarAddItemMenu?.querySelectorAll('.toolbar-mode-option') || []);
      if (opts.length > 0) {
        const target = e.key === 'ArrowUp' ? opts[opts.length - 1] : opts[0];
        target?.focus();
      }
    } else if (e.key === 'Escape') {
      closeToolbarAddMenu();
    }
  });

  toolbarAddItemMenu?.addEventListener('keydown', (e) => {
    const opts = Array.from(toolbarAddItemMenu.querySelectorAll('.toolbar-mode-option'));
    const idx = opts.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (opts.length > 0) {
        opts[(idx + 1) % opts.length]?.focus();
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (opts.length > 0) {
        opts[(idx - 1 + opts.length) % opts.length]?.focus();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeToolbarAddMenu();
      toolbarAddItem?.focus();
    }
  });

  toolbarAddItemMenu?.querySelectorAll('.toolbar-mode-option').forEach((opt) => {
    opt.addEventListener('click', (e) => {
      e.stopPropagation();
      if (!currentDraft) return;
      if (!currentDraft.content.categories || currentDraft.content.categories.length === 0) {
        addCategory('Geral');
      }
      const mode = opt.getAttribute('data-price-mode') || 'fixed';
      addItem('price', mode);
      closeToolbarAddMenu();
    });
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

  // Close the add-item dropdown when clicking outside
  document.addEventListener('click', () => {
    closeToolbarAddMenu();
  });

  editorBusinessName?.addEventListener('input', () => {
    if (!currentDraft) return;
    currentDraft.content.businessName = editorBusinessName.value;
    const trimmed = editorBusinessName.value.trim();
    if (trimmed && currentSite && canManageSite(currentSite)) {
      updateSiteSummary(currentSite.id, { name: trimmed });
      scheduleRename(trimmed);
    }
    updateDraftAndPreview();
  });

  [editorLocalityListed, editorLocalityUf].forEach((control) => {
    control?.addEventListener('change', () => {
      syncLocalityFromUI();
      updateDraftAndPreview();
    });
  });
  editorLocalityCity?.addEventListener('input', () => {
    syncLocalityFromUI();
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

  editorMilaRelay?.addEventListener('change', () => {
    if (!currentDraft) return;
    if (editorMilaRelay.checked) {
      currentDraft.content.orderRelay = ORDER_RELAY_MILA;
    } else {
      delete currentDraft.content.orderRelay;
    }
    syncMilaRelayUI();
    updateDraftAndPreview();
  });

  [compDescription, compPhoto, compPrice, compMinQuantity, compQuantitySelector, compDuration].forEach(
    (checkbox) => {
      checkbox?.addEventListener('change', () => {
        syncComponentsFromUI();
        renderItems();
        renderTemplateVarsAndHighlight();
        updateDraftAndPreview();
      });
    }
  );

  [fieldCustName, fieldDate, fieldDeliveryPickup, fieldNotes].forEach((checkbox) => {
    checkbox?.addEventListener('change', () => {
      syncOrderFieldsFromUI();
      renderTemplateVarsAndHighlight();
      updateDraftAndPreview();
    });
  });

  const typeConfirmDialog = document.getElementById('catalog-type-confirm-dialog');
  const typeDialogTitle = document.getElementById('catalog-type-dialog-title');
  const typeCancelBtn = document.getElementById('catalog-type-cancel-btn');
  const typeConfirmBtn = document.getElementById('catalog-type-confirm-btn');
  let pendingCatalogType = null;

  const closeTypeDialog = (revert = true) => {
    if (revert && editorCatalogType && currentDraft) {
      editorCatalogType.value = currentDraft.content.catalogType || 'products';
    }
    pendingCatalogType = null;
    if (typeConfirmDialog) {
      if (typeof typeConfirmDialog.close === 'function' && typeConfirmDialog.open) {
        typeConfirmDialog.close();
      } else {
        typeConfirmDialog.removeAttribute('open');
      }
    }
  };

  editorCatalogType?.addEventListener('change', () => {
    if (!currentDraft) return;
    const prevType = currentDraft.content.catalogType || 'products';
    const nextType = editorCatalogType.value;
    if (nextType === prevType) return;

    pendingCatalogType = nextType;
    if (typeDialogTitle) {
      typeDialogTitle.textContent = `Trocar para ${getCatalogTypeDisplayLabel(nextType)}?`;
    }
    if (typeConfirmDialog) {
      if (typeof typeConfirmDialog.showModal === 'function') {
        typeConfirmDialog.showModal();
      } else {
        typeConfirmDialog.setAttribute('open', '');
      }
    } else {
      applyCatalogTypeSwitch(currentDraft.content, nextType);
      initializeEditorWorkspace();
    }
  });

  typeCancelBtn?.addEventListener('click', () => {
    closeTypeDialog(true);
  });

  typeConfirmBtn?.addEventListener('click', () => {
    if (currentDraft && pendingCatalogType) {
      applyCatalogTypeSwitch(currentDraft.content, pendingCatalogType);
      closeTypeDialog(false);
      initializeEditorWorkspace();
    } else {
      closeTypeDialog(true);
    }
  });

  typeConfirmDialog?.addEventListener('cancel', (e) => {
    e.preventDefault();
    closeTypeDialog(true);
  });

  editorTimeslots?.addEventListener('input', () => {
    if (!currentDraft) return;
    const lines = normalizeTimeSlots(editorTimeslots.value.split('\n'));
    currentDraft.content.orderFields.timeSlots = lines;
    renderTimeslotsUI();
    renderTemplateVarsAndHighlight();
    updateDraftAndPreview();
  });

  timeslotAddBtn?.addEventListener('click', () => {
    if (!currentDraft || !timeslotPickerInput) return;
    const currentSlots = currentDraft.content.orderFields?.timeSlots || [];
    const result = addTimeSlot(currentSlots, timeslotPickerInput.value);
    if (!result.added) {
      if (result.reason === 'limit') {
        showFeedback('O limite máximo é de 24 horários disponíveis.', 'error');
      } else if (result.reason === 'duplicate') {
        showFeedback('Este horário já está na lista.', 'info');
      } else {
        showFeedback('Informe um horário válido no formato HH:MM.', 'error');
      }
      return;
    }
    currentDraft.content.orderFields.timeSlots = result.slots;
    if (editorTimeslots) editorTimeslots.value = result.slots.join('\n');
    renderTimeslotsUI();
    renderTemplateVarsAndHighlight();
    updateDraftAndPreview();
  });

  timeslotGeneratorToggleBtn?.addEventListener('click', () => {
    if (!timeslotGeneratorPanel) return;
    const nextOpen = timeslotGeneratorPanel.hidden;
    timeslotGeneratorPanel.hidden = !nextOpen;
    timeslotGeneratorToggleBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
  });

  timeslotGenApplyBtn?.addEventListener('click', () => {
    if (!currentDraft) return;
    const startVal = timeslotGenStart?.value || '09:00';
    const endVal = timeslotGenEnd?.value || '17:00';
    const stepVal = Number(timeslotGenStep?.value || 60);
    const result = generateTimeSlotInterval(startVal, endVal, stepVal, []);
    if (result.error) {
      showFeedback(result.error, 'error');
      return;
    }
    currentDraft.content.orderFields.timeSlots = result.slots;
    if (editorTimeslots) editorTimeslots.value = result.slots.join('\n');
    if (timeslotGeneratorPanel) timeslotGeneratorPanel.hidden = true;
    timeslotGeneratorToggleBtn?.setAttribute('aria-expanded', 'false');
    renderTimeslotsUI();
    renderTemplateVarsAndHighlight();
    updateDraftAndPreview();
    if (result.truncated) {
      showFeedback('Horários gerados (limitados aos primeiros 24 horários).', 'info');
    }
  });

  timeslotClearAllBtn?.addEventListener('click', () => {
    if (!currentDraft) return;
    currentDraft.content.orderFields.timeSlots = [];
    if (editorTimeslots) editorTimeslots.value = '';
    renderTimeslotsUI();
    renderTemplateVarsAndHighlight();
    updateDraftAndPreview();
  });

  [editorHeroTitle, editorWelcomeText, editorCtaLabel, editorWhatsappTemplate].forEach((input) => {
    input?.addEventListener('input', () => {
      syncMessagesFromUI();
      if (input === editorWhatsappTemplate) {
        renderTemplateVarsAndHighlight();
      }
      if (whatsappSimulationPanel && !whatsappSimulationPanel.hidden) {
        renderWhatsappSimulation();
      }
      updateDraftAndPreview();
    });
  });

  editorWhatsappTemplate?.addEventListener('scroll', () => {
    if (editorWhatsappBackdrop && editorWhatsappTemplate) {
      editorWhatsappBackdrop.scrollTop = editorWhatsappTemplate.scrollTop;
      editorWhatsappBackdrop.scrollLeft = editorWhatsappTemplate.scrollLeft;
    }
  });

  editorWhatsappTemplate?.addEventListener('keydown', (e) => {
    if (!editorWhatsappTemplate) return;
    const atomic = handleAtomicVariableKeydown(
      editorWhatsappTemplate.value,
      editorWhatsappTemplate.selectionStart ?? 0,
      editorWhatsappTemplate.selectionEnd ?? 0,
      e.key
    );
    if (atomic) {
      e.preventDefault();
      editorWhatsappTemplate.value = atomic.text;
      try {
        editorWhatsappTemplate.setSelectionRange(atomic.cursor, atomic.cursor);
      } catch {
        // Ignore on unsupported environments
      }
      syncMessagesFromUI();
      renderTemplateVarsAndHighlight();
      if (whatsappSimulationPanel && !whatsappSimulationPanel.hidden) {
        renderWhatsappSimulation();
      }
      updateDraftAndPreview();
    }
  });

  editorWhatsappTemplate?.addEventListener('dragover', (e) => {
    e.preventDefault();
  });

  editorWhatsappTemplate?.addEventListener('drop', (e) => {
    const token = e.dataTransfer?.getData('text/plain') || '';
    if (!/^\{(itens|total|data|horario|endereco|nome)\}$/.test(token.trim())) {
      return;
    }
    e.preventDefault();
    const cleanToken = token.trim();
    const pos =
      typeof editorWhatsappTemplate.selectionStart === 'number'
        ? editorWhatsappTemplate.selectionStart
        : editorWhatsappTemplate.value.length;
    const before = editorWhatsappTemplate.value.slice(0, pos);
    const after = editorWhatsappTemplate.value.slice(pos);
    editorWhatsappTemplate.value = `${before}${cleanToken}${after}`;
    const nextPos = pos + cleanToken.length;
    editorWhatsappTemplate.focus();
    try {
      editorWhatsappTemplate.setSelectionRange(nextPos, nextPos);
    } catch {
      // Ignore
    }
    syncMessagesFromUI();
    renderTemplateVarsAndHighlight();
    if (whatsappSimulationPanel && !whatsappSimulationPanel.hidden) {
      renderWhatsappSimulation();
    }
    updateDraftAndPreview();
  });

  simulateWhatsappBtn?.addEventListener('click', () => {
    if (!whatsappSimulationPanel) return;
    const nextOpen = whatsappSimulationPanel.hidden;
    whatsappSimulationPanel.hidden = !nextOpen;
    simulateWhatsappBtn.setAttribute('aria-expanded', nextOpen ? 'true' : 'false');
    if (nextOpen) {
      renderWhatsappSimulation();
    }
  });

  whatsappSimCloseBtn?.addEventListener('click', () => {
    if (whatsappSimulationPanel) whatsappSimulationPanel.hidden = true;
    simulateWhatsappBtn?.setAttribute('aria-expanded', 'false');
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
            `Importação aplicada ao rascunho (${result.validRows.length} itens processados). As alterações são salvas automaticamente.`,
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

function initializeEditorWorkspace({ skipAutosave = false } = {}) {
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
  syncMilaRelayUI();
  if (editorCatalogType) {
    editorCatalogType.value = currentDraft.content.catalogType || 'products';
  }
  if (editorStorefrontType) {
    editorStorefrontType.value = currentDraft.content.storefrontType || 'food';
  }
  const locality = currentDraft.content.locality || {};
  if (editorLocalityListed) editorLocalityListed.checked = locality.listed === true;
  if (editorLocalityCity) editorLocalityCity.value = locality.city || '';
  if (editorLocalityUf) editorLocalityUf.value = locality.uf || '';
  renderLocalityState();
  mountPlacePanel({
    getContent: () => currentDraft?.content,
    getSlug: () => currentSite?.slug,
    onChange: () => updateDraftAndPreview()
  });
  mountSeoPanel({
    getContent: () => currentDraft?.content,
    getSlug: () => currentSite?.slug,
    onChange: () => updateDraftAndPreview()
  });
  mountCommentToVitrinePanel({ getSlug: () => currentSite?.slug });
  void mountQuoteWebhookPanel({
    site: currentSite,
    isOnline: currentIsOnline,
    getContent: () => currentDraft?.content,
    onChange: () => updateDraftAndPreview()
  });
  void mountChannelsPanel({
    site: currentSite,
    isOnline: currentIsOnline,
    getContent: () => currentDraft?.content,
    onChange: () => updateDraftAndPreview(),
    openSection: openEditorSection
  });

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
  if (fieldNotes) fieldNotes.checked = Boolean(fields.notes !== false);

  const normalizedSlots = normalizeTimeSlots(fields.timeSlots || []);
  currentDraft.content.orderFields.timeSlots = normalizedSlots;
  if (editorTimeslots) {
    editorTimeslots.value = normalizedSlots.join('\n');
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

  renderTimeslotsUI();
  renderTemplateVarsAndHighlight();
  if (whatsappSimulationPanel && !whatsappSimulationPanel.hidden) {
    renderWhatsappSimulation();
  }

  updateCsvModelLink();
  syncTargetCategory();
  mountPalettePicker();
  renderItems();
  updateDraftAndPreview({ skipAutosave });
}

function mountPalettePicker() {
  if (!palettePickerSlot || !currentDraft) return;
  const available = canChooseStructurePalette(currentDraft.content);
  renderPalettePicker({
    doc: globalThis.document,
    container: palettePickerSlot,
    value: getStructurePalette(currentDraft.content),
    disabled: !available,
    hint: available ? '' : 'Disponível depois de escolher a estrutura da vitrine em Configurações > Identidade, menus e páginas.',
    onChange: (id) => {
      if (!currentDraft) return;
      currentDraft.content = setStructurePalette(currentDraft.content, id);
      updateDraftAndPreview();
    }
  });
}

function syncCatalogTypeDefaults() {
  if (!currentDraft) return;
  applyCatalogTypeSwitch(currentDraft.content, currentDraft.content.catalogType);
  initializeEditorWorkspace();
}

function slugifyLocality(city, uf) {
  const base = city
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base && uf ? `${base}-${uf.toLowerCase()}` : '';
}

function readLocalityFromUI() {
  const city = (editorLocalityCity?.value || '').trim().replace(/\s+/g, ' ');
  const uf = editorLocalityUf?.value || '';
  const cityValid = !city || LOCALITY_CITY_PATTERN.test(city);
  const wantsListing = Boolean(editorLocalityListed?.checked);
  return { city, uf, cityValid, wantsListing, complete: Boolean(city && uf && cityValid) };
}

function renderLocalityState() {
  const state = readLocalityFromUI();
  if (editorLocalityError) {
    editorLocalityError.hidden = state.cityValid && (!state.wantsListing || state.complete);
    editorLocalityError.textContent = state.cityValid
      ? 'Informe a cidade e o estado para aparecer na página da cidade.'
      : 'Use só letras no nome da cidade (2 a 60 caracteres).';
  }
  if (editorLocalityLink) {
    const slug = state.complete ? slugifyLocality(state.city, state.uf) : '';
    editorLocalityLink.href = slug ? `/por-cidade/${slug}` : '/por-cidade';
    editorLocalityLink.textContent = slug ? `Ver página de ${state.city} – ${state.uf}` : 'Ver página por cidade';
  }
  return state;
}

// Incomplete or invalid input stays local (listed=false) so autosave never sends a draft the API rejects.
function syncLocalityFromUI() {
  if (!currentDraft) return;
  const state = renderLocalityState();
  currentDraft.content.locality = {
    listed: state.wantsListing && state.complete,
    city: state.cityValid ? state.city : '',
    uf: state.uf
  };
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

function renderTimeslotsUI() {
  if (!currentDraft) return;
  const slots = normalizeTimeSlots(currentDraft.content.orderFields?.timeSlots || []);
  currentDraft.content.orderFields.timeSlots = slots;

  if (timeslotsStatusNote) {
    timeslotsStatusNote.textContent = `${slots.length} / 24 horários`;
  }
  if (timeslotAddBtn) {
    timeslotAddBtn.disabled = slots.length >= 24;
  }
  if (!timeslotsChipsList) return;

  timeslotsChipsList.replaceChildren();
  if (slots.length === 0) {
    const emptySpan = document.createElement('span');
    emptySpan.className = 'timeslots-empty-hint';
    emptySpan.textContent = 'Lista vazia: não pedir horário ao visitante.';
    timeslotsChipsList.appendChild(emptySpan);
    return;
  }

  slots.forEach((slot) => {
    const chip = document.createElement('span');
    chip.className = 'timeslot-chip';
    chip.setAttribute('role', 'listitem');
    chip.setAttribute('data-slot', slot);

    const textSpan = document.createElement('span');
    textSpan.textContent = slot;

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'timeslot-chip-remove';
    removeBtn.setAttribute('aria-label', `Remover horário ${slot}`);
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      const next = removeTimeSlot(currentDraft.content.orderFields.timeSlots, slot);
      currentDraft.content.orderFields.timeSlots = next;
      if (editorTimeslots) editorTimeslots.value = next.join('\n');
      renderTimeslotsUI();
      renderTemplateVarsAndHighlight();
      updateDraftAndPreview();
    });

    chip.appendChild(textSpan);
    chip.appendChild(removeBtn);
    timeslotsChipsList.appendChild(chip);
  });
}

function renderTemplateVarsAndHighlight() {
  if (!currentDraft) return;
  const text = editorWhatsappTemplate?.value || '';

  if (editorWhatsappBackdrop) {
    const nodes = buildHighlightedTemplateNodes(document, text);
    editorWhatsappBackdrop.replaceChildren(...nodes);
  }

  if (!whatsappTemplateVars) return;
  whatsappTemplateVars.replaceChildren();

  const available = getAvailableTemplateVariables(
    currentDraft.content.catalogType,
    currentDraft.content.orderFields,
    currentDraft.content.components
  );

  available.forEach((varMeta) => {
    const isUsed = text.includes(varMeta.token);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.draggable = true;
    btn.className = `template-var-chip ${varMeta.colorClass} ${isUsed ? 'is-used' : ''}`.trim();
    btn.setAttribute('data-var-token', varMeta.token);
    btn.setAttribute('aria-pressed', isUsed ? 'true' : 'false');
    btn.title = isUsed
      ? `Remover ${varMeta.token} do modelo`
      : `Inserir ${varMeta.token} no modelo`;

    const labelSpan = document.createElement('span');
    labelSpan.className = 'template-var-chip-label';
    labelSpan.textContent = varMeta.label;

    const codeSpan = document.createElement('code');
    codeSpan.className = 'template-var-chip-code';
    codeSpan.textContent = varMeta.token;

    btn.appendChild(labelSpan);
    btn.appendChild(codeSpan);

    btn.addEventListener('dragstart', (e) => {
      e.dataTransfer?.setData('text/plain', varMeta.token);
    });

    btn.addEventListener('click', () => {
      if (!editorWhatsappTemplate) return;
      const res = toggleVariableInTemplate(
        editorWhatsappTemplate.value,
        varMeta.token,
        editorWhatsappTemplate.selectionStart,
        editorWhatsappTemplate.selectionEnd
      );
      editorWhatsappTemplate.value = res.text;
      editorWhatsappTemplate.focus();
      try {
        editorWhatsappTemplate.setSelectionRange(res.cursor, res.cursor);
      } catch {
        // Ignore
      }
      syncMessagesFromUI();
      renderTemplateVarsAndHighlight();
      if (whatsappSimulationPanel && !whatsappSimulationPanel.hidden) {
        renderWhatsappSimulation();
      }
      updateDraftAndPreview();
    });

    whatsappTemplateVars.appendChild(btn);
  });
}

function renderWhatsappSimulation() {
  if (!currentDraft || !whatsappSimulationPanel) return;
  const sim = buildSimulatedWhatsappPreview(currentDraft.content);
  if (whatsappSimBubbleText) {
    whatsappSimBubbleText.textContent = sim.message;
  }
  if (whatsappSimOpenLink) {
    whatsappSimOpenLink.href = sim.waHref;
  }
  if (whatsappSimWarning) {
    if (sim.unsupported.length > 0) {
      const tokens = sim.unsupported.map((u) => u.token).join(', ');
      whatsappSimWarning.textContent = `Atenção: seu modelo usa ${tokens}, que este tipo de vitrine ou configuração de campos não preenche.`;
      whatsappSimWarning.hidden = false;
    } else {
      whatsappSimWarning.textContent = '';
      whatsappSimWarning.hidden = true;
    }
  }
}

function syncTargetCategory() {
  const categories = currentDraft?.content?.categories || [];
  if (categories.length === 0) {
    selectedCategoryForItems = null;
    return;
  }
  if (!selectedCategoryForItems || !categories.some((c) => c.id === selectedCategoryForItems)) {
    selectedCategoryForItems = categories[categories.length - 1].id;
  }
}

function sectionButton(text, label, onClick) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button button-small button-secondary button-pill';
  button.textContent = text;
  if (label) button.setAttribute('aria-label', label);
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    onClick();
  });
  return button;
}

function createCategorySection(category, catIndex, total) {
  const section = document.createElement('div');
  section.className = 'category-block items-section-header';
  section.dataset.index = String(catIndex);
  const displayName = category.name || `Categoria ${catIndex + 1}`;

  const labelGroup = document.createElement('div');
  labelGroup.className = 'form-group';

  const label = document.createElement('label');
  label.setAttribute('for', `cat-input-${category.id}`);
  label.className = 'items-section-label';
  label.textContent = `Categoria ${catIndex + 1}`;

  const titleInput = document.createElement('input');
  titleInput.type = 'text';
  titleInput.id = `cat-input-${category.id}`;
  titleInput.className = 'category-title-input input-styled-height';
  titleInput.value = category.name || '';
  titleInput.placeholder = 'Ex: Pizzas Artesanais';
  titleInput.addEventListener('focus', () => {
    selectedCategoryForItems = category.id;
  });
  titleInput.addEventListener('input', () => {
    category.name = titleInput.value;
    updateDraftAndPreview();
  });

  const count = document.createElement('span');
  count.className = 'form-help items-section-count';
  const itemLen = Array.isArray(category.items) ? category.items.length : 0;
  count.textContent = itemLen === 1 ? '1 item' : `${itemLen} itens`;

  labelGroup.append(label, titleInput, count);

  const controls = document.createElement('div');
  controls.className = 'category-controls';

  controls.appendChild(sectionButton('+ Item', `Adicionar item em ${displayName}`, () => {
    selectedCategoryForItems = category.id;
    addItem('price', 'fixed');
  }));
  if (currentIsOnline && ['owner', 'admin', 'editor'].includes(currentSite.role)) {
    controls.appendChild(quickToggleButton(category, 'category'));
  }
  const moveUpBtn = sectionButton('Subir', `Mover categoria ${displayName} para cima`, () => moveCategory(catIndex, -1));
  moveUpBtn.disabled = catIndex === 0;
  const moveDownBtn = sectionButton('Descer', `Mover categoria ${displayName} para baixo`, () => moveCategory(catIndex, 1));
  moveDownBtn.disabled = catIndex === total - 1;
  const deleteCatBtn = sectionButton('Excluir', `Excluir categoria ${displayName}`, () => {
    if (category.items && category.items.length > 0) {
      if (!confirm(`Deseja excluir a categoria "${category.name || 'sem nome'}" e seus ${category.items.length} itens?`)) {
        return;
      }
    }
    deleteCategory(catIndex);
  });
  controls.append(moveUpBtn, moveDownBtn, deleteCatBtn);

  section.append(labelGroup, controls);
  return section;
}

function renderItems() {
  if (!itemsContainer || !currentDraft) return;
  itemsContainer.replaceChildren();
  syncTargetCategory();

  const categories = currentDraft.content.categories || [];
  const comp = currentDraft.content.components || {};
  const isQuote = currentDraft.content.catalogType === 'quote';
  const isBooking = currentDraft.content.catalogType === 'booking';

  const toolbarAddMenuWrapper = document.querySelector('.toolbar-menu-wrapper');
  const toolbarAddBtnEl = document.getElementById('toolbar-add-item');
  if (toolbarAddMenuWrapper) {
    toolbarAddMenuWrapper.hidden = isBooking;
  } else if (toolbarAddBtnEl) {
    toolbarAddBtnEl.hidden = isBooking;
  }

  const getPriceModeLabel = (mode) => {
    if (mode === 'offer') return 'Item de lance';
    if (mode === 'donation') return 'Doação';
    if (mode === 'trade') return 'Troca';
    if (mode === 'quota') return 'Cotas de apoio';
    return 'Item à venda';
  };

  const totalItems = categories.reduce((sum, cat) => sum + (cat.items?.length || 0), 0);

  // Google Forms-style header card (storefront title and short description)
  const formHeaderCard = document.createElement('div');
  formHeaderCard.className = 'google-forms-header-card';
  const formTitle = document.createElement('h2');
  formTitle.className = 'forms-header-title';
  formTitle.textContent = currentDraft.content.businessName || currentSite?.name || 'Minha Vitrine';
  const formSubtitle = document.createElement('p');
  formSubtitle.className = 'forms-header-subtitle';
  formSubtitle.textContent =
    currentDraft.content.messages?.welcomeText ||
    `${categories.length} ${categories.length === 1 ? 'categoria' : 'categorias'} · ${totalItems} ${totalItems === 1 ? 'item' : 'itens'} na vitrine`;
  formHeaderCard.appendChild(formTitle);
  formHeaderCard.appendChild(formSubtitle);
  itemsContainer.appendChild(formHeaderCard);

  if (categories.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent = 'Nenhum item ainda. Use a barra ao lado para adicionar um item, uma categoria ou importar uma planilha.';
    itemsContainer.appendChild(empty);
    return;
  }

  const context = { comp, isQuote, isBooking, getPriceModeLabel };
  categories.forEach((category, catIndex) => {
    itemsContainer.appendChild(createCategorySection(category, catIndex, categories.length));
    if (!category.items || category.items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-msg items-section-empty';
      empty.textContent = 'Nenhum item nesta categoria.';
      itemsContainer.appendChild(empty);
      return;
    }
    category.items.forEach((item, itemIdx) => renderItemCard(category, item, itemIdx, context));
  });
}

function renderItemCard(category, item, itemIdx, { comp, isQuote, isBooking, getPriceModeLabel }) {
    const card = document.createElement('div');
    // Accent bar visual highlight like Google Forms
    const isEditing = activeEditingItemId === item.id;
    card.className = `item-block google-forms-card ${isEditing ? 'is-editing' : 'is-preview'}`;
    card.id = `item-card-${item.id}`;

    // Click to focus/edit card
    card.addEventListener('click', (e) => {
      if (activeEditingItemId !== item.id && !e.target.closest('button') && !e.target.closest('input') && !e.target.closest('textarea')) {
        activeEditingItemId = item.id;
        selectedCategoryForItems = category.id;
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

      const previewTitleRow = document.createElement('div');
      previewTitleRow.className = 'item-title-badge-row';

      const previewTitle = document.createElement('h3');
      previewTitle.className = 'item-preview-title';
      previewTitle.textContent = item.name || 'Item sem nome';
      previewTitleRow.appendChild(previewTitle);

      const itemPriceMode = isBooking ? 'fixed' : (item.priceMode || 'fixed');
      if (!isBooking) {
        const modePill = document.createElement('span');
        modePill.className = `item-mode-badge item-mode-${itemPriceMode}`;
        modePill.textContent = getPriceModeLabel(itemPriceMode);
        previewTitleRow.appendChild(modePill);
      }

      previewInfo.appendChild(previewTitleRow);

      const previewSub = document.createElement('p');
      previewSub.className = 'item-preview-subtitle soft-text';
      const quotaText = `Cotas de ${item.priceCents ? formatCentsToReais(item.priceCents) : 'R$ 0,00'} · ${item.quotaFilled || 0}/${item.quotaTotal || 0} confirmadas`;
      const priceText =
        itemPriceMode === 'quota'
          ? quotaText
          : itemPriceMode === 'donation'
            ? 'Doação'
            : itemPriceMode === 'trade'
              ? item.tradeFor
                ? `Aceito: ${item.tradeFor}`
                : 'Troca'
              : itemPriceMode === 'offer'
                ? [
                    item.auctionEndsAt ? `Leilão até ${formatAuctionDeadline(item.auctionEndsAt)}` : '',
                    item.priceCents ? `Lance mín.: ${formatCentsToReais(item.priceCents)}` : item.auctionEndsAt ? '' : 'Faça sua oferta'
                  ].filter(Boolean).join(' · ')
                : item.priceCents
                  ? formatCentsToReais(item.priceCents)
                  : '';
      const sectionText = item.section ? `Seção: ${item.section}` : '';
      const visibility = ITEM_VISIBILITY_STATES.find((state) => state.value === itemVisibilityState(item));
      const details = [priceText, sectionText, visibility.label].filter(Boolean);
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

    // Title / bold name + mode badge
    const itemPriceMode = isBooking ? 'fixed' : (item.priceMode || 'fixed');
    const titleGroup = document.createElement('div');
    titleGroup.className = 'item-title-group item-title-badge-row';
    const boldName = document.createElement('h3');
    boldName.className = 'item-bold-title';
    boldName.textContent = item.name || 'Novo Item';
    titleGroup.appendChild(boldName);

    if (!isBooking) {
      const modePill = document.createElement('span');
      modePill.className = `item-mode-badge item-mode-${itemPriceMode}`;
      modePill.textContent = getPriceModeLabel(itemPriceMode);
      titleGroup.appendChild(modePill);
    }
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
      moveItem(category.id, itemIdx, -1);
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
      moveItem(category.id, itemIdx, 1);
    });

    // Duplicate
    const dupBtn = document.createElement('button');
    dupBtn.type = 'button';
    dupBtn.className = 'icon-btn';
    dupBtn.setAttribute('aria-label', 'Duplicar item');
    dupBtn.innerHTML = `<svg width="18" height="18"><use href="#icon-copy"/></svg>`;
    dupBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      duplicateItem(category.id, itemIdx);
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

    const termWarning = document.createElement('p');
    termWarning.className = 'item-quota-term-warning item-fields-full';
    termWarning.setAttribute('role', 'status');
    fields.appendChild(termWarning);

    renderItemVisibilityField(item, fields);

    // Selector: Tipo do item (Products & Quote)
    if (!isBooking) {
      const gMode = document.createElement('div');
      gMode.className = 'form-group item-fields-full';
      const lMode = document.createElement('label');
      lMode.setAttribute('for', `item-mode-${item.id}`);
      lMode.textContent = 'Tipo do item';
      const modeSelect = document.createElement('select');
      modeSelect.id = `item-mode-${item.id}`;
      modeSelect.className = 'select-styled item-mode-select';
      for (const [val, label] of [
        ['fixed', 'Item à venda (preço fixo)'],
        ['offer', 'Item de lance'],
        ['donation', 'Doação'],
        ['trade', 'Troca'],
        ['quota', 'Cotas de apoio (sem sorteio)']
      ]) {
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label;
        modeSelect.appendChild(opt);
      }
      modeSelect.value = itemPriceMode;
      modeSelect.addEventListener('change', () => {
        const nextMode = modeSelect.value;
        if (nextMode === 'fixed') {
          delete item.priceMode;
        } else {
          item.priceMode = nextMode;
        }
        if (nextMode === 'donation' || nextMode === 'trade') {
          item.priceCents = 0;
        }
        if (nextMode === 'quota') {
          applyQuotaDefaults(item);
        }
        if (nextMode !== 'offer') {
          delete item.auctionEndsAt;
          delete item.bidIncrementCents;
        }
        renderItems();
        updateDraftAndPreview();
      });
      gMode.appendChild(lMode);
      gMode.appendChild(modeSelect);
      fields.appendChild(gMode);
    }

    // Column 2: Preço / Lance mínimo / Condições / Aceito em troca
    const showPriceField =
      (itemPriceMode === 'fixed' && comp.price !== false && item._showPrice !== false) ||
      itemPriceMode === 'offer';
    if (showPriceField) {
      const gPrice = document.createElement('div');
      gPrice.className = 'form-group item-fields-full';
      const lPrice = document.createElement('label');
      lPrice.setAttribute('for', `item-price-${item.id}`);
      lPrice.textContent =
        itemPriceMode === 'offer'
          ? 'Lance mínimo (opcional)'
          : isQuote
            ? 'Preço (opcional)'
            : 'Preço (BRL)';
      const priceInput = document.createElement('input');
      priceInput.type = 'text';
      priceInput.id = `item-price-${item.id}`;
      priceInput.className = 'item-input input-styled-height';
      priceInput.placeholder =
        itemPriceMode === 'offer'
          ? 'Opcional (ex: R$ 50,00)'
          : isQuote
            ? 'Opcional (ex: R$ 48,00)'
            : 'Ex: R$ 48,00';
      priceInput.value = item.priceCents ? formatCentsToReais(item.priceCents) : '';
      priceInput.addEventListener('input', () => {
        maskMoneyInput(priceInput);
        item.priceCents = parseReaisToCents(priceInput.value);
        updateDraftAndPreview();
      });
      gPrice.appendChild(lPrice);
      gPrice.appendChild(priceInput);
      fields.appendChild(gPrice);

      if (itemPriceMode === 'offer') {
        const gEnds = document.createElement('div');
        gEnds.className = 'form-group item-fields-full';
        const lEnds = document.createElement('label');
        lEnds.setAttribute('for', `item-auction-ends-${item.id}`);
        lEnds.textContent = 'Encerramento do leilão';
        const endsInput = document.createElement('input');
        endsInput.type = 'datetime-local';
        endsInput.id = `item-auction-ends-${item.id}`;
        endsInput.className = 'item-input input-styled-height';
        endsInput.value = isoToLocalDateTimeInput(item.auctionEndsAt);
        const endsHelp = document.createElement('span');
        endsHelp.className = 'form-help';
        endsHelp.id = `item-auction-ends-help-${item.id}`;
        endsHelp.textContent = 'Com data, os lances ficam registrados e você vê o vencedor em Leilões. Sem data, as ofertas chegam só pelo WhatsApp.';
        endsInput.setAttribute('aria-describedby', endsHelp.id);
        endsInput.addEventListener('change', () => {
          const iso = localDateTimeInputToIso(endsInput.value);
          if (iso) {
            item.auctionEndsAt = iso;
          } else {
            delete item.auctionEndsAt;
          }
          updateDraftAndPreview();
        });
        gEnds.appendChild(lEnds);
        gEnds.appendChild(endsInput);
        gEnds.appendChild(endsHelp);
        fields.appendChild(gEnds);

        const gIncrement = document.createElement('div');
        gIncrement.className = 'form-group item-fields-full';
        const lIncrement = document.createElement('label');
        lIncrement.setAttribute('for', `item-bid-increment-${item.id}`);
        lIncrement.textContent = 'Incremento mínimo entre lances (opcional)';
        const incrementInput = document.createElement('input');
        incrementInput.type = 'text';
        incrementInput.inputMode = 'numeric';
        incrementInput.id = `item-bid-increment-${item.id}`;
        incrementInput.className = 'item-input input-styled-height';
        incrementInput.placeholder = 'Padrão: R$ 1,00';
        incrementInput.value = item.bidIncrementCents ? formatCentsToReais(item.bidIncrementCents) : '';
        incrementInput.addEventListener('input', () => {
          maskMoneyInput(incrementInput);
          const cents = parseReaisToCents(incrementInput.value);
          if (cents > 0) {
            item.bidIncrementCents = cents;
          } else {
            delete item.bidIncrementCents;
          }
          updateDraftAndPreview();
        });
        gIncrement.appendChild(lIncrement);
        gIncrement.appendChild(incrementInput);
        fields.appendChild(gIncrement);
      }
    } else if (itemPriceMode === 'donation') {
      const gCond = document.createElement('div');
      gCond.className = 'form-group item-fields-full';
      const lCond = document.createElement('label');
      lCond.setAttribute('for', `item-conditions-${item.id}`);
      lCond.textContent = 'Condições (opcional)';
      const condInput = document.createElement('input');
      condInput.type = 'text';
      condInput.id = `item-conditions-${item.id}`;
      condInput.maxLength = 240;
      condInput.className = 'item-input input-styled-height';
      condInput.placeholder = 'Ex: retirar no local até sexta';
      condInput.value = item.conditions || '';
      condInput.addEventListener('input', () => {
        item.conditions = condInput.value;
        updateDraftAndPreview();
      });
      gCond.appendChild(lCond);
      gCond.appendChild(condInput);
      fields.appendChild(gCond);
    } else if (itemPriceMode === 'trade') {
      const gTrade = document.createElement('div');
      gTrade.className = 'form-group item-fields-full';
      const lTrade = document.createElement('label');
      lTrade.setAttribute('for', `item-trade-for-${item.id}`);
      lTrade.textContent = 'Aceito em troca (opcional)';
      const tradeInput = document.createElement('input');
      tradeInput.type = 'text';
      tradeInput.id = `item-trade-for-${item.id}`;
      tradeInput.maxLength = 240;
      tradeInput.className = 'item-input input-styled-height';
      tradeInput.placeholder = 'Ex: livros ou plantas';
      tradeInput.value = item.tradeFor || '';
      tradeInput.addEventListener('input', () => {
        item.tradeFor = tradeInput.value;
        updateDraftAndPreview();
      });
      gTrade.appendChild(lTrade);
      gTrade.appendChild(tradeInput);
      fields.appendChild(gTrade);
    } else if (itemPriceMode === 'quota') {
      renderQuotaFields(item, fields);
    }

    // New Google Forms field: Section name (grupo de agrupamento opcional)
    const gSec = document.createElement('div');
    gSec.className = 'form-group item-fields-full';
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

    renderPaymentLinkField(item, fields, {
      onChange: updateDraftAndPreview,
      priceMode: itemPriceMode,
      soon: itemVisibilityState(item) === 'soon'
    });

    renderItemPageFields(item, fields, {
      onChange: updateDraftAndPreview,
      uploadImage: async (file) => uploadImageToSupabaseStorage(await resizeAndConvertToWebP(file), `${item.id}-galeria`),
      isOnline: () => currentIsOnline,
      notify: showFeedback
    });

    const refreshTermWarning = () => {
      const term = findProhibitedQuotaTerm(
        [item.name, item.description, item.conditions, item.tradeFor, item.section, item.quotaReward, item.paymentLink?.label, ...itemPageTexts(item)],
        { quota: itemPriceMode === 'quota' }
      );
      termWarning.hidden = !term;
      termWarning.textContent = term
        ? `Remova "${term}": a vitrine não aceita rifa, sorteio, prêmio ou promessa de retorno financeiro.`
        : '';
    };
    refreshTermWarning();
    card.addEventListener('input', refreshTermWarning);

    card.appendChild(fields);

    // CARD FOOTER (Google Forms style)
    const footer = document.createElement('div');
    footer.className = 'item-card-footer';

    // Quick toggle switches or options
    const quickAddLinks = document.createElement('div');
    quickAddLinks.className = 'quick-add-links';
    
    if (item._showPrice === false && itemPriceMode !== 'quota') {
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
      duplicateItem(category.id, itemIdx);
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
      removeItem(category.id, itemIdx);
    });

    // Separator line
    const sep = document.createElement('div');
    sep.className = 'footer-divider';

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
    footerRight.appendChild(collapseBtn);
    footer.appendChild(footerRight);

    card.appendChild(footer);
    itemsContainer.appendChild(card);
}

/** Abre o cartão do item com erro no link de pagamento e leva o foco ao campo. */
function revealPaymentLinkError(error) {
  const itemId = showPaymentLinkServerErrors(error, { focus: false });
  if (!itemId || !currentDraft) return;
  const category = (currentDraft.content.categories || []).find((cat) => (cat.items || []).some((entry) => String(entry.id) === itemId));
  if (!category) return;
  goToTab('itens');
  selectedCategoryForItems = category.id;
  activeEditingItemId = category.items.find((entry) => String(entry.id) === itemId).id;
  renderItems();
  showPaymentLinkServerErrors(error, { focus: true });
}

/**
 * Controle único de visibilidade do item (#133, `PB-20`/`UX-66-012`): Disponível, Em
 * breve ou Oculto. Grupo de rádios nativo (setas do teclado) e texto opcional do selo.
 */
function renderItemVisibilityField(item, fields) {
  const group = document.createElement('fieldset');
  group.className = 'form-group item-fields-full item-visibility';
  const legend = document.createElement('legend');
  legend.className = 'item-visibility-legend';
  legend.textContent = 'Na vitrine';
  group.appendChild(legend);

  const options = document.createElement('div');
  options.className = 'item-visibility-options';
  const hint = document.createElement('p');
  hint.className = 'item-visibility-hint';
  hint.id = `item-visibility-hint-${item.id}`;
  hint.setAttribute('aria-live', 'polite');

  const labelGroup = document.createElement('div');
  labelGroup.className = 'item-visibility-label-field';
  const labelFor = `item-soon-label-${item.id}`;
  const lLabel = document.createElement('label');
  lLabel.setAttribute('for', labelFor);
  lLabel.textContent = `Texto do selo (opcional, até ${ITEM_AVAILABILITY_LABEL_MAX} caracteres)`;
  const labelInput = document.createElement('input');
  labelInput.type = 'text';
  labelInput.id = labelFor;
  labelInput.className = 'item-input input-styled-height';
  labelInput.maxLength = ITEM_AVAILABILITY_LABEL_MAX;
  labelInput.placeholder = `${DEFAULT_SOON_LABEL} (ex.: Próxima turma em março)`;
  labelInput.value = item.availabilityLabel || '';
  labelInput.addEventListener('input', () => {
    if (labelInput.value.trim()) item.availabilityLabel = labelInput.value;
    else delete item.availabilityLabel;
    updateDraftAndPreview();
  });
  labelGroup.appendChild(lLabel);
  labelGroup.appendChild(labelInput);

  const sync = (state) => {
    hint.textContent = ITEM_VISIBILITY_STATES.find((entry) => entry.value === state).hint;
    labelGroup.hidden = state !== 'soon';
  };

  const current = itemVisibilityState(item);
  for (const state of ITEM_VISIBILITY_STATES) {
    const optionLabel = document.createElement('label');
    optionLabel.className = 'item-visibility-option';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = `item-visibility-${item.id}`;
    radio.value = state.value;
    radio.checked = state.value === current;
    radio.setAttribute('aria-describedby', hint.id);
    radio.addEventListener('change', () => {
      if (!radio.checked) return;
      applyItemVisibilityState(item, state.value);
      sync(state.value);
      updateDraftAndPreview();
    });
    const text = document.createElement('span');
    text.textContent = state.label;
    optionLabel.appendChild(radio);
    optionLabel.appendChild(text);
    options.appendChild(optionLabel);
  }

  group.appendChild(options);
  group.appendChild(hint);
  group.appendChild(labelGroup);
  sync(current);
  fields.appendChild(group);
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

async function resizeAndConvertToWebP(file, maxBytes = 204800, dimensionSteps = [800, 640, 480]) {
  const source = await decodeImageSource(file);
  const srcWidth = source.width;
  const srcHeight = source.height;

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
    throw new Error(`A imagem excedeu ${Math.round(maxBytes / 1024)} KB mesmo após compressão. Escolha uma imagem menor.`);
  } finally {
    if (source && typeof source.close === 'function') {
      source.close();
    }
  }
}

async function uploadHeroImage(file) {
  // A foto do hero é o maior elemento da primeira tela; 100 KB mantém o LCP em até 2,5 s no Slow 4G.
  const blob = await resizeAndConvertToWebP(file, 102400);
  return { url: await uploadImageToSupabaseStorage(blob, 'hero-foto'), bytes: blob.size };
}

async function uploadTestimonialPhoto(file) {
  // Aparece em 48 px: 160 px cobre telas de densidade 3 sem pesar na vitrine.
  const blob = await resizeAndConvertToWebP(file, 20480, [160, 128]);
  return { url: await uploadImageToSupabaseStorage(blob, 'depoimento-foto'), bytes: blob.size };
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

function isoToLocalDateTimeInput(iso) {
  const date = typeof iso === 'string' ? new Date(iso) : null;
  if (!date || Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDateTimeInputToIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
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
  const focusName = !defaultName;
  currentDraft.content.categories.push({
    id,
    name: defaultName || `Categoria ${currentDraft.content.categories.length + 1}`,
    items: []
  });
  selectedCategoryForItems = id;
  syncTargetCategory();
  renderItems();
  updateDraftAndPreview();
  if (focusName) {
    const input = globalThis.document?.getElementById(`cat-input-${id}`);
    input?.focus();
    input?.select?.();
  }
}

function deleteCategory(catIndex) {
  currentDraft.content.categories.splice(catIndex, 1);
  syncTargetCategory();
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
    syncTargetCategory();
    renderItems();
    updateDraftAndPreview();
  }
}

function applyQuotaDefaults(item) {
  if (!Number.isSafeInteger(item.quotaTotal)) item.quotaTotal = 10;
  if (!Number.isSafeInteger(item.quotaFilled)) item.quotaFilled = 0;
  if (!Number.isSafeInteger(item.priceCents)) item.priceCents = 0;
  item._showPrice = true;
}

function parseQuotaInteger(raw, min, max) {
  const parsed = parseInt(String(raw ?? '').replace(/\D/g, ''), 10);
  if (!Number.isSafeInteger(parsed)) return min;
  return Math.max(min, Math.min(max, parsed));
}

function renderQuotaFields(item, fields) {
  const callout = document.createElement('p');
  callout.className = 'item-quota-legal-callout item-fields-full';
  callout.textContent =
    'Cotas de apoio dividem uma meta em partes iguais, sem sorteio: toda cota garante o mesmo benefício. ' +
    'Não use para rifa, sorteio, prêmio ou promessa de retorno financeiro (exigem autorização federal). ' +
    'Combine o pagamento direto com cada apoiador.';
  fields.appendChild(callout);

  const makeGroup = (id, labelText, input) => {
    const group = document.createElement('div');
    group.className = 'form-group item-fields-full';
    const label = document.createElement('label');
    label.setAttribute('for', id);
    label.textContent = labelText;
    input.id = id;
    group.appendChild(label);
    group.appendChild(input);
    fields.appendChild(group);
    return group;
  };

  const priceInput = document.createElement('input');
  priceInput.type = 'text';
  priceInput.inputMode = 'numeric';
  priceInput.className = 'item-input input-styled-height';
  priceInput.placeholder = 'Ex: R$ 20,00';
  priceInput.value = item.priceCents ? formatCentsToReais(item.priceCents) : '';
  priceInput.addEventListener('input', () => {
    maskMoneyInput(priceInput);
    item.priceCents = parseReaisToCents(priceInput.value);
    updateDraftAndPreview();
  });
  makeGroup(`item-quota-price-${item.id}`, 'Valor de cada cota (BRL)', priceInput);

  const totalInput = document.createElement('input');
  totalInput.type = 'number';
  totalInput.inputMode = 'numeric';
  totalInput.min = String(QUOTA_MIN_TOTAL);
  totalInput.max = String(QUOTA_MAX_TOTAL);
  totalInput.className = 'item-input input-styled-height';
  totalInput.value = String(item.quotaTotal ?? 10);

  const filledInput = document.createElement('input');
  filledInput.type = 'number';
  filledInput.inputMode = 'numeric';
  filledInput.min = '0';
  filledInput.max = String(item.quotaTotal ?? 10);
  filledInput.className = 'item-input input-styled-height';
  filledInput.value = String(item.quotaFilled ?? 0);

  totalInput.addEventListener('change', () => {
    item.quotaTotal = parseQuotaInteger(totalInput.value, QUOTA_MIN_TOTAL, QUOTA_MAX_TOTAL);
    totalInput.value = String(item.quotaTotal);
    filledInput.max = String(item.quotaTotal);
    if ((item.quotaFilled ?? 0) > item.quotaTotal) {
      item.quotaFilled = item.quotaTotal;
      filledInput.value = String(item.quotaFilled);
    }
    updateDraftAndPreview();
  });
  filledInput.addEventListener('change', () => {
    item.quotaFilled = parseQuotaInteger(filledInput.value, 0, item.quotaTotal ?? QUOTA_MAX_TOTAL);
    filledInput.value = String(item.quotaFilled);
    updateDraftAndPreview();
  });
  makeGroup(`item-quota-total-${item.id}`, `Total de cotas (${QUOTA_MIN_TOTAL} a ${QUOTA_MAX_TOTAL})`, totalInput);
  makeGroup(`item-quota-filled-${item.id}`, 'Cotas já confirmadas', filledInput);

  const rewardInput = document.createElement('input');
  rewardInput.type = 'text';
  rewardInput.maxLength = QUOTA_TEXT_MAX_LENGTH;
  rewardInput.className = 'item-input input-styled-height';
  rewardInput.placeholder = 'Ex: 1 pão de fermentação natural por cota';
  rewardInput.value = item.quotaReward || '';
  rewardInput.addEventListener('input', () => {
    item.quotaReward = rewardInput.value;
    updateDraftAndPreview();
  });
  makeGroup(`item-quota-reward-${item.id}`, 'O que cada cota garante (opcional)', rewardInput);

  const condInput = document.createElement('input');
  condInput.type = 'text';
  condInput.maxLength = QUOTA_TEXT_MAX_LENGTH;
  condInput.className = 'item-input input-styled-height';
  condInput.placeholder = 'Ex: entrega quando a meta fechar; devolução se não fechar';
  condInput.value = item.conditions || '';
  condInput.addEventListener('input', () => {
    item.conditions = condInput.value;
    updateDraftAndPreview();
  });
  makeGroup(`item-quota-conditions-${item.id}`, 'Condições (opcional)', condInput);
}

function addItem(type = 'price', priceMode = 'fixed') {
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

  if (priceMode && priceMode !== 'fixed') {
    item.priceMode = priceMode;
  }

  if (type === 'price' || type === 'photo') {
    item.priceCents = 0;
  }
  if (type === 'photo') {
    item._showPhoto = true;
  }
  if (type === 'text' || priceMode === 'donation' || priceMode === 'trade') {
    item._showPrice = false;
    item._showPhoto = type === 'photo';
  } else if (type === 'price') {
    item._showPrice = true;
    item._showPhoto = false;
  } else if (type === 'photo') {
    item._showPrice = true;
    item._showPhoto = true;
  }

  if (priceMode === 'quota') applyQuotaDefaults(item);

  if (currentDraft.content.components?.minQuantity && priceMode === 'fixed') item.minQuantity = 1;
  if (currentDraft.content.components?.durationMinutes) item.durationMinutes = 30;

  category.items.push(item);
  activeEditingItemId = item.id; // Highlight new item in editing mode
  renderItems();
  updateDraftAndPreview();
}

function removeItem(catId, itemIdx) {
  const category = (currentDraft.content.categories || []).find((c) => c.id === catId);
  if (category && category.items) {
    category.items.splice(itemIdx, 1);
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

function setSaveIndicator(state, detail = '') {
  const indicator = globalThis.document?.getElementById('autosave-indicator');
  if (!indicator) return;
  const texts = {
    loading: 'Carregando...',
    saving: 'Salvando...',
    saved: currentIsOnline ? 'Salvo' : 'Salvo neste navegador',
    conflict: 'Não salvo: conflito de revisão',
    invalid: `Não salvo: ${detail}`,
    error: detail ? `Erro ao salvar: ${detail}` : 'Erro ao salvar'
  };
  const text = texts[state] ?? '';
  if (indicator.textContent !== text) indicator.textContent = text;
  indicator.dataset.state = state;
  const tone = state === 'saved' ? 'saved' : ['conflict', 'invalid', 'error'].includes(state) ? 'error' : 'saving';
  indicator.className = `autosave-indicator ${tone}`;
}

function countDraftItems(content) {
  let totalCount = 0;
  let activeCount = 0;
  (content?.categories || []).forEach((cat) => {
    (cat.items || []).forEach((item) => {
      totalCount += 1;
      if (item.active !== false) activeCount += 1;
    });
  });
  return { totalCount, activeCount };
}

function measureDraftBytes(content) {
  return new TextEncoder().encode(JSON.stringify(content)).length;
}

function draftLimitIssue(sizeInBytes, activeCount, totalCount) {
  if (activeCount > MAX_ACTIVE_ITEMS) return `limite de ${MAX_ACTIVE_ITEMS} itens ativos`;
  if (totalCount > MAX_TOTAL_ITEMS) return `limite de ${MAX_TOTAL_ITEMS} itens`;
  if (sizeInBytes > MAX_DRAFT_BYTES) return 'rascunho acima de 256 KiB';
  return '';
}

// Incomplete names or prices stay local so autosave never sends a draft the API rejects.
export function findIncompleteDraftField(content) {
  const categories = content?.categories || [];
  const priceRequired = content?.catalogType !== 'quote' && content?.components?.price !== false;
  for (let catIndex = 0; catIndex < categories.length; catIndex += 1) {
    const category = categories[catIndex];
    if (!String(category.name || '').trim()) return `dê um nome à categoria ${catIndex + 1}`;
    const items = category.items || [];
    for (let itemIndex = 0; itemIndex < items.length; itemIndex += 1) {
      const item = items[itemIndex];
      const where = `"${category.name.trim()}"`;
      if (!String(item.name || '').trim()) return `dê um nome ao item ${itemIndex + 1} de ${where}`;
      const priceMode = content.catalogType === 'booking' ? 'fixed' : (item.priceMode || 'fixed');
      if ((priceMode === 'fixed' && priceRequired) || priceMode === 'quota') {
        if (!Number.isSafeInteger(item.priceCents) || item.priceCents <= 0) {
          return `informe o preço de "${item.name.trim()}"`;
        }
      }
    }
  }
  return '';
}

function updateLimitMeters(sizeInBytes, activeCount, totalCount) {
  if (draftSizeCount) draftSizeCount.textContent = `${(sizeInBytes / 1024).toFixed(1)} / 256 KiB`;
  if (draftSizeProgress) draftSizeProgress.value = sizeInBytes;
  if (draftSizeWarning) draftSizeWarning.hidden = sizeInBytes <= MAX_DRAFT_BYTES;
  if (activeItemsCount) activeItemsCount.textContent = `${activeCount} / ${MAX_ACTIVE_ITEMS}`;
  if (activeItemsProgress) activeItemsProgress.value = activeCount;
  if (activeItemsWarning) activeItemsWarning.hidden = activeCount <= MAX_ACTIVE_ITEMS;
  if (totalItemsCount) totalItemsCount.textContent = `${totalCount} / ${MAX_TOTAL_ITEMS}`;
  if (totalItemsProgress) totalItemsProgress.value = totalCount;
  if (totalItemsWarning) totalItemsWarning.hidden = totalCount <= MAX_TOTAL_ITEMS;
  if (editorLimits) {
    editorLimits.hidden = !(
      activeCount > MAX_ACTIVE_ITEMS * LIMIT_WARNING_RATIO ||
      totalCount > MAX_TOTAL_ITEMS * LIMIT_WARNING_RATIO ||
      sizeInBytes > MAX_DRAFT_BYTES * LIMIT_WARNING_RATIO
    );
  }
}

function updateConfigSummaries() {
  const content = currentDraft?.content;
  if (!content) return;
  if (configAtendimentoSummary) {
    const phone = content.whatsapp ? formatWhatsappBR(content.whatsapp) : 'WhatsApp não informado';
    configAtendimentoSummary.textContent = `${phone} · ${getCatalogTypeDisplayLabel(content.catalogType)}`;
  }
  if (configPedidoSummary) {
    const fields = content.orderFields || {};
    const asked = [
      fields.customerName !== false && 'nome',
      fields.date && 'data',
      fields.deliveryOrPickup && 'endereço',
      fields.notes !== false && 'observação'
    ].filter(Boolean);
    const slots = (fields.timeSlots || []).length;
    configPedidoSummary.textContent =
      `${asked.length ? `Pede ${asked.join(', ')}` : 'Sem campos extras'} · ${slots} ${slots === 1 ? 'horário' : 'horários'}`;
  }
  if (configItensSummary) {
    const comp = content.components || {};
    const visible = 1 + ['description', 'photo', 'price', 'minQuantity', 'quantitySelector', 'durationMinutes']
      .filter((key) => Boolean(comp[key])).length;
    configItensSummary.textContent = `${visible} componentes visíveis nos cartões`;
  }
}

function updateAccessSection(site = currentSite) {
  if (!site) return;
  if (publicLinkInput) publicLinkInput.value = publicUrlForSite(site);
  if (configAcessoSummary) {
    configAcessoSummary.textContent = `${site.publishedAt ? 'Publicada' : 'Rascunho'} · link público e equipe`;
  }
}

function updateDraftAndPreview({ skipAutosave = false } = {}) {
  if (!currentDraft) return;

  const sizeInBytes = measureDraftBytes(currentDraft.content);
  const { activeCount, totalCount } = countDraftItems(currentDraft.content);
  updateLimitMeters(sizeInBytes, activeCount, totalCount);
  renderLivePreview();
  updateConfigSummaries();

  const limitIssue = draftLimitIssue(sizeInBytes, activeCount, totalCount);
  if (limitIssue) {
    setSaveIndicator('invalid', limitIssue);
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
    return;
  }

  const incomplete = skipAutosave ? '' : findIncompleteDraftField(currentDraft.content);
  if (incomplete) {
    setSaveIndicator('invalid', incomplete);
    if (autosaveTimeout) clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
    return;
  }

  if (skipAutosave) {
    setSaveIndicator('saved');
    return;
  }
  if (autosaveBlocked) {
    setSaveIndicator('conflict');
    return;
  }

  setSaveIndicator('saving');
  scheduleAutosave();
}

function scheduleAutosave(delay = AUTOSAVE_DELAY_MS) {
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = setTimeout(() => {
    autosaveTimeout = null;
    void runAutosave();
  }, delay);
}

async function runAutosave() {
  while (autosaveInFlight) await autosaveInFlight;
  if (!currentDraft || !currentSite) return true;
  if (autosaveBlocked) {
    setSaveIndicator('conflict');
    return false;
  }
  if (!hasUnsavedDraftChanges()) {
    setSaveIndicator('saved');
    return true;
  }
  const { activeCount, totalCount } = countDraftItems(currentDraft.content);
  const limitIssue =
    draftLimitIssue(measureDraftBytes(currentDraft.content), activeCount, totalCount) ||
    findIncompleteDraftField(currentDraft.content);
  if (limitIssue) {
    setSaveIndicator('invalid', limitIssue);
    return false;
  }

  const site = currentSite;
  const draft = currentDraft;
  const generation = editorLoadGeneration;
  const sentContent = JSON.stringify(draft.content);
  setSaveIndicator('saving');

  autosaveInFlight = (async () => {
    if (!currentIsOnline) {
      draft.revision += 1;
      draft.updatedAt = new Date().toISOString();
      localStorage.setItem(`vitrine_local_draft_${site.id}`, JSON.stringify(draft));
      return { ok: true };
    }
    try {
      const res = await fetch(`/api/sites/${site.id}/draft`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: draft.revision, content: draft.content })
      });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (Number.isSafeInteger(data?.draft?.revision)) draft.revision = data.draft.revision;
        if (data?.draft?.updatedAt) draft.updatedAt = data.draft.updatedAt;
        return { ok: true };
      }
      const data = await res.json().catch(() => null);
      if (res.status === 409) return { ok: false, conflict: true, error: data?.error };
      return { ok: false, error: data?.error };
    } catch {
      return { ok: false, network: true };
    }
  })();

  let result;
  try {
    result = await autosaveInFlight;
  } finally {
    autosaveInFlight = null;
  }
  if (generation !== editorLoadGeneration || draft !== currentDraft) return result.ok;

  if (result.ok) {
    savedDraftContent = sentContent;
    if (editorRevisionIndicator) editorRevisionIndicator.textContent = `Revisão: ${draft.revision}`;
    if (conflictBanner) conflictBanner.hidden = true;
    updateSiteSummary(site.id, { updatedAt: draft.updatedAt || new Date().toISOString() });
    if (hasUnsavedDraftChanges()) {
      setSaveIndicator('saving');
      scheduleAutosave();
    } else {
      setSaveIndicator('saved');
    }
    return true;
  }

  if (result.conflict) {
    autosaveBlocked = true;
    if (conflictBanner) conflictBanner.hidden = false;
    setSaveIndicator('conflict');
    if (result.error?.currentRevision && editorRevisionIndicator) {
      editorRevisionIndicator.textContent = `Revisão em conflito: ${draft.revision} (servidor: ${result.error.currentRevision})`;
    }
    return false;
  }

  if (result.network) {
    setSaveIndicator('error', 'sem conexão');
    scheduleAutosave(10000);
    return false;
  }

  showPlaceServerErrors(result.error, { focus: false });
  showSeoServerErrors(result.error, { focus: false });
  showPaymentLinkServerErrors(result.error, { focus: false });
  setSaveIndicator(
    'error',
    result.error?.code === 'ACTIVE_ITEMS_LIMIT_EXCEEDED'
      ? `limite de ${MAX_ACTIVE_ITEMS} itens ativos`
      : result.error?.message || ''
  );
  return false;
}

function clearRenameTimer() {
  if (renameTimer) {
    clearTimeout(renameTimer);
    renameTimer = null;
  }
}

function scheduleRename(name) {
  if (!currentSite || !currentIsOnline) return;
  pendingRename = { siteId: currentSite.id, name };
  clearRenameTimer();
  renameTimer = setTimeout(() => {
    renameTimer = null;
    void flushRename();
  }, AUTOSAVE_DELAY_MS);
}

async function flushRename() {
  clearRenameTimer();
  const rename = pendingRename;
  pendingRename = null;
  if (!rename) return true;
  try {
    const res = await fetch(`/api/sites/${encodeURIComponent(rename.siteId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ name: rename.name })
    });
    if (res.ok) {
      const data = await res.json().catch(() => null);
      if (data?.site) updateSiteSummary(rename.siteId, { name: data.site.name, updatedAt: data.site.updatedAt });
      return true;
    }
    const data = await res.json().catch(() => ({}));
    showFeedback(data.error?.message || 'Não foi possível renomear a vitrine.', 'error');
  } catch {
    showFeedback('Sem conexão para renomear a vitrine.', 'error');
  }
  return false;
}

export async function flushAutosave() {
  await flushRename();
  if (autosaveTimeout) {
    clearTimeout(autosaveTimeout);
    autosaveTimeout = null;
  }
  if (autosaveInFlight) await autosaveInFlight;
  if (!currentDraft || !hasUnsavedDraftChanges() || autosaveBlocked) return true;
  return runAutosave();
}

function handlePageHide() {
  if (!currentDraft || !currentSite || !hasUnsavedDraftChanges() || autosaveBlocked || autosaveInFlight) return;
  const { activeCount, totalCount } = countDraftItems(currentDraft.content);
  if (draftLimitIssue(measureDraftBytes(currentDraft.content), activeCount, totalCount)) return;
  if (findIncompleteDraftField(currentDraft.content)) return;
  if (autosaveTimeout) clearTimeout(autosaveTimeout);
  autosaveTimeout = null;
  if (!currentIsOnline) {
    currentDraft.revision += 1;
    localStorage.setItem(`vitrine_local_draft_${currentSite.id}`, JSON.stringify(currentDraft));
    savedDraftContent = JSON.stringify(currentDraft.content);
    return;
  }
  const body = JSON.stringify({ revision: currentDraft.revision, content: currentDraft.content });
  if (new TextEncoder().encode(body).length > KEEPALIVE_MAX_BYTES) return;
  void fetch(`/api/sites/${currentSite.id}/draft`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true
  }).catch(() => {});
}

function resolveDraftMilaRelay() {
  if (currentDraft?.content?.orderRelay !== ORDER_RELAY_MILA) return null;
  try {
    return buildPublicOrderRelay(currentDraft.content.slug || currentSite?.slug || '');
  } catch {
    return null;
  }
}

function syncMilaRelayUI() {
  if (!editorMilaRelay || !currentDraft) return;
  const relay = resolveDraftMilaRelay();
  const enabled = currentDraft.content.orderRelay === ORDER_RELAY_MILA;
  editorMilaRelay.checked = enabled;
  editorMilaRelay.setAttribute('aria-checked', enabled ? 'true' : 'false');
  if (editorMilaRelayHelp) {
    editorMilaRelayHelp.textContent = enabled
      ? `Ligado: o botão de pedido abre o WhatsApp da Mila, da equipe Vitrine Inspira, e a mensagem começa com o código #${relay?.code ?? 'da sua vitrine'}. A Mila repassa cada pedido para o WhatsApp acima. O repasse é feito por uma pessoa, então pode levar alguns minutos. Vale a partir da próxima publicação.`
      : 'Desligado: os pedidos chegam direto no seu WhatsApp, e o número aparece na vitrine publicada.';
  }
}

function renderLivePreview() {
  if (!liveStorefrontPreview || !currentDraft) return;

  const menuConfig = structuredClone(currentDraft.content);
  const milaRelay = resolveDraftMilaRelay();
  if (milaRelay) {
    menuConfig.whatsapp = MILA_WHATSAPP;
    menuConfig.orderRelay = milaRelay;
  } else {
    delete menuConfig.orderRelay;
  }

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
    showFeedback('Digite o número de WhatsApp comercial em Configurações > Atendimento.', 'error');
    openEditorSection('config', 'config-atendimento');
    return false;
  }

  if (!/^[1-9]\d{7,14}$/.test(whatsapp)) {
    showFeedback('Número de WhatsApp comercial inválido. Exemplo: 5511999999999', 'error');
    openEditorSection('config', 'config-atendimento');
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

        const itemPriceMode =
          currentDraft.content.catalogType === 'booking'
            ? 'fixed'
            : (item.priceMode || 'fixed');
        const priceRequired =
          itemPriceMode === 'fixed' &&
          currentDraft.content.components?.price !== false &&
          currentDraft.content.catalogType !== 'quote';
        if (priceRequired && (!Number.isSafeInteger(item.priceCents) || item.priceCents <= 0)) {
          showFeedback(
            `O preço do item "${item.name || `Item ${itemIndex + 1}`}" precisa ser maior que R$ 0,00.`,
            'error'
          );
          hasValidationErrors = true;
        }

        const itemLabel = item.name || `Item ${itemIndex + 1}`;
        if (itemPriceMode === 'quota') {
          if (!Number.isSafeInteger(item.priceCents) || item.priceCents <= 0) {
            showFeedback(`Informe o valor de cada cota do item "${itemLabel}".`, 'error');
            hasValidationErrors = true;
          }
          if (
            !Number.isSafeInteger(item.quotaTotal) ||
            item.quotaTotal < QUOTA_MIN_TOTAL ||
            item.quotaTotal > QUOTA_MAX_TOTAL
          ) {
            showFeedback(
              `O total de cotas do item "${itemLabel}" deve ficar entre ${QUOTA_MIN_TOTAL} e ${QUOTA_MAX_TOTAL}.`,
              'error'
            );
            hasValidationErrors = true;
          } else if ((item.quotaFilled ?? 0) > item.quotaTotal) {
            showFeedback(
              `As cotas confirmadas do item "${itemLabel}" não podem passar do total.`,
              'error'
            );
            hasValidationErrors = true;
          }
        }
        const prohibitedTerm = findProhibitedQuotaTerm(
          [item.name, item.description, item.conditions, item.tradeFor, item.section, item.quotaReward],
          { quota: itemPriceMode === 'quota' }
        );
        if (prohibitedTerm) {
          showFeedback(
            `Remova "${prohibitedTerm}" do item "${itemLabel}": a vitrine não aceita rifa, sorteio, prêmio ou promessa de retorno financeiro.`,
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

async function handlePublishSite() {
  if (!currentDraft || !validateCatalogLocal()) return;
  const generation = editorLoadGeneration;
  const site = currentSite;

  if (currentIsOnline) {
    const saved = await flushAutosave();
    if (generation !== editorLoadGeneration) return;
    if (!saved || hasUnsavedDraftChanges()) {
      showFeedback(
        autosaveBlocked
          ? 'Conflito de revisão detectado antes de publicar. Recarregue o rascunho.'
          : 'Não foi possível salvar o rascunho antes de publicar.',
        'error'
      );
      return;
    }
    try {
      const pubRes = await fetch(`/api/sites/${site.id}/publish`, {
        method: 'POST'
      });
      if (generation !== editorLoadGeneration) return;
      if (pubRes.ok) {
        const pubData = await pubRes.json();
        if (generation !== editorLoadGeneration) return;
        const pub = pubData.publication;
        const shortHash = String(pub.hash || '').slice(0, 12);
        markPublished(site, pub.url, `Revisão ${pub.revision} publicada em ${pub.url} (SHA-256: ${shortHash}...)`);
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
    return;
  }

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

  markPublished(
    site,
    publicUrlForSite(site),
    `Prévia publicada no modo local (revisão ${currentDraft.revision}). Exemplo estático disponível em /loja1.`
  );
}

function markPublished(site, url, statusText) {
  if (publicationStatusText) publicationStatusText.textContent = statusText;
  if (publicationStatusBar) publicationStatusBar.hidden = false;
  if (editorOpenPublicLink) editorOpenPublicLink.href = url;
  if (publicationViewLink) publicationViewLink.href = url;
  localStorage.setItem('vitrine_has_published', 'true');
  const publishedAt = new Date().toISOString();
  site.publishedAt = publishedAt;
  updateSiteSummary(site.id, { publishedAt });
  updateAccessSection(site);
  if (publishDialogText) publishDialogText.textContent = 'Sua vitrine está no ar. Compartilhe o link com seus clientes.';
  if (publishLinkInput) publishLinkInput.value = url;
  openDialog(publishDialog, publishSiteButton);
  publishCopyBtn?.focus();
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
const teamStatus = globalThis.document?.getElementById('team-status');
const teamAudit = globalThis.document?.getElementById('team-audit');
let teamPanelMountedFor = null;

function teamPanelNote(text) {
  const note = document.createElement('p');
  note.className = 'form-help';
  note.textContent = text;
  teamPanelSlot?.replaceChildren(note);
}

function resetTeamPanel() {
  teamPanelMountedFor = null;
  teamPanelNote('Abra esta seção com a vitrine conectada para ver a equipe.');
}

async function refreshTeamPanel() {
  if (!teamPanelSlot || !currentSite) return;
  if (!currentIsOnline) {
    teamPanelNote('A equipe aparece quando você entra com sua conta.');
    return;
  }
  if (teamPanelMountedFor === currentSite.id) return;
  teamPanelMountedFor = currentSite.id;
  teamPanelSlot.replaceChildren();
  await mountTeamPanel({
    doc: globalThis.document,
    container: teamPanelSlot,
    siteId: currentSite.id,
    siteName: currentSite.name,
    role: currentSite.role,
    request: portalRequest
  });
}

async function refreshTeamAudit() {
  if (!team?.open || !currentIsOnline) return;
  const site = currentSite;
  teamAudit.replaceChildren();
  teamStatus.textContent = 'Carregando histórico…';
  try {
    const { logs } = await publicationRequest(site, 'audit-logs');
    if (site !== currentSite || !team.open) return;
    teamStatus.textContent = logs.length ? '' : 'Nenhuma alteração registrada.';
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

team?.addEventListener('toggle', refreshTeamAudit);

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
        if (!saved.ok) {
          throw Object.assign(new Error(data.error?.message ?? 'Não foi possível salvar a estrutura.'),
            { missingFields: data.error?.missingFields });
        }
        if (site !== currentSite) return;
        expectedRevision = data.draft.revision;
        currentDraft.revision = expectedRevision;
        currentDraft.content.structure = data.draft.content.structure;
        if (savedDraftContent) {
          const previous = JSON.parse(savedDraftContent);
          previous.structure = data.draft.content.structure;
          savedDraftContent = JSON.stringify(previous);
        }
        mountPalettePicker();
        if (Object.hasOwn(structure, 'templateCode')) render(data.resolved, data.draft.content.structure.templateCode);
        if (editorRevisionIndicator) editorRevisionIndicator.textContent = `Revisão: ${expectedRevision}`;
        structureStatus.textContent = 'Estrutura salva. Abra a prévia para conferir.';
      } catch (error) {
        if (site !== currentSite) return;
        structureStatus.textContent = error.message;
        structureFields.querySelector('form')?.showFieldErrors?.(error.missingFields);
      }
    }, widgets, null, {
      templates, selected, uploadImage: uploadHeroImage, uploadTestimonialPhoto, planGate,
      readPalette: () => getStructurePalette(currentDraft?.content)
    });
    const planSummary = await loadSitePlan(site.id);
    if (site !== currentSite || !structurePanel.open) return;
    const planGate = planSummary
      ? { itemBlocks: { max: planSummary.limits.itemBlocks, plan: requiredPlanFor(planSummary, 'item_blocks') } }
      : null;
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

function renderDomainForm(site, planSummary = null) {
  const form = document.createElement('form');
  const label = document.createElement('label');
  const hostname = document.createElement('input');
  hostname.placeholder = 'loja.exemplo.com.br';
  hostname.required = true;
  hostname.maxLength = 253;
  hostname.autocomplete = 'off';
  label.append('Domínio próprio ', hostname);
  const submit = domainAction('Vincular domínio', 'submit');
  form.append(label, submit);
  const plan = requiredPlanFor(planSummary, 'custom_domain');
  if (plan) {
    lockAction(
      submit,
      plan,
      `Domínio próprio faz parte do plano ${plan.name} ou superior e depende de vaga e da configuração do DNS. O botão leva a Plano e cobrança.`
    );
  }
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
    const [{ domains }, planSummary] = await Promise.all([publicationRequest(site, 'domains'), loadSitePlan(site.id)]);
    if (site !== currentSite || !domainPanel.open) return;
    domainStatus.textContent = domains.length ? '' : 'Nenhum domínio próprio vinculado.';
    domainList.replaceChildren();
    renderDomainForm(site, planSummary);
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
      const remove = domainAction('Desconectar');
      remove.addEventListener('click', async () => {
        if (!await confirmDomainDisconnect(site, domain)) return;
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

// Selos dos recursos pagos visíveis antes de abrir os painéis (issue #115).
async function applyPlanGates(site, isOnline) {
  const domainSummary = globalThis.document?.getElementById('custom-domains-summary');
  const seoLegend = globalThis.document?.getElementById('editor-seo-legend');
  const seoHint = globalThis.document?.getElementById('editor-seo-plan-hint');
  const clear = () => {
    markPlanRequirement(domainSummary, null);
    markPlanRequirement(seoLegend, null);
    if (seoHint) seoHint.hidden = true;
  };
  clear();
  if (!isOnline) return;
  const summary = await loadSitePlan(site.id);
  if (site !== currentSite || !summary) return;
  markPlanRequirement(domainSummary, requiredPlanFor(summary, 'custom_domain'));
  const seoPlan = requiredPlanFor(summary, 'local_seo');
  markPlanRequirement(seoLegend, seoPlan);
  if (seoHint && seoPlan) {
    seoHint.textContent = `Os dados para o Google entram na vitrine publicada a partir do plano ${seoPlan.name}. Você já pode preencher; eles passam a valer quando o plano estiver ativo.`;
    seoHint.hidden = false;
  }
}
