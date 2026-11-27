import { detectPlatformCms, hasPlatformAdminAccess, initializePlatformCms, showPlatformCms } from './platform-cms.js';
import { detectSponsorImpact, hasSponsorImpactAccess, initializeSponsorImpact, showSponsorImpact } from './sponsor-impact.mjs';
import { clearEditor, flushAutosave, isEditorShowingSite, loadEditor, showEditorTab } from './editor.js';
import { attachWhatsappMask, extractPhoneDigits, formatWhatsappBR } from './phone-mask.mjs';
import { createInterestsMultiSelect } from './multi-select.mjs';
import { initAuctionsPanel, loadAuctionsPanel, selectAuctionSite } from './auctions-panel.js';
import { loadBillingNotice } from './billing-notice.mjs';
import { initBillingPanel, loadBillingPanel } from './billing-panel.mjs';
import { loadDemoInvitations } from './linktree-import.js';
import {
  activeSites,
  createLifecycleMenuItems,
  createSiteViewFilter,
  emptyViewMessage,
  siteStatusBadge,
  sitesForCurrentView
} from './site-lifecycle.js';
import { renderInsightsOrigin } from './insights-origin.mjs';
import { captureInviteToken, renderInviteConfirmation } from './invite-accept.mjs';

// State variables
let isOnline = false;
let currentUser = null;
let sites = [];
let activeSite = null;
let currentSection = null;
let routeToken = 0;
let homeSearchQuery = '';
let newVitrineTemplate = 'products';
let newSiteSlugTouched = false;
let insightsRequestToken = 0;

export let PUBLIC_SITE_ORIGIN = 'https://vitrine.inspira.dev.br';
export let PORTAL_ORIGIN = 'https://painel.inspira.dev.br';

// New Profile & Customization state
let profile = {
  displayName: '',
  businessName: '',
  city: '',
  whatsapp: '',
  interests: []
};
let customizationRequests = [];
let selectedInterests = new Set();
let insightsPeriod = '7d';
let currentInsightsData = null;

// DOM Elements
const authSection = globalThis.document?.getElementById('auth-section');
const authenticatedApp = globalThis.document?.getElementById('authenticated-app');
const mainContent = globalThis.document?.getElementById('conteudo-portal');
const appTopBar = globalThis.document?.getElementById('app-top-bar');
const homeSearch = globalThis.document?.getElementById('home-search');
const homeSearchInput = globalThis.document?.getElementById('home-search-input');
const editorSection = globalThis.document?.getElementById('editor-section');
const inicioSection = globalThis.document?.getElementById('inicio-section');
const perfilSection = globalThis.document?.getElementById('perfil-section');
const customizacoesSection = globalThis.document?.getElementById('customizacoes-section');
const planoSection = globalThis.document?.getElementById('plano-section');
const conviteSection = globalThis.document?.getElementById('convite-section');
const profileGateSection = globalThis.document?.getElementById('profile-gate-section');
const auctionsBlock = globalThis.document?.getElementById('auctions-block');

const demoModeBadge = globalThis.document?.getElementById('demo-mode-badge');
const logoutButton = globalThis.document?.getElementById('logout-button');
const globalFeedback = globalThis.document?.getElementById('global-feedback');
const sitesListContainer = globalThis.document?.getElementById('sites-list-container');
const sitesListStatus = globalThis.document?.getElementById('sites-list-status');
const sitesViewFilterSlot = globalThis.document?.getElementById('sites-view-filter-slot');
const accountMenuButton = globalThis.document?.getElementById('account-menu-button');
const accountMenu = globalThis.document?.getElementById('account-menu');
const accountMenuName = globalThis.document?.getElementById('account-menu-name');

// Profile DOM Elements
const profileForm = globalThis.document?.getElementById('profile-form');
const profileDisplayNameInput = globalThis.document?.getElementById('profile-display-name');
const profileBusinessNameInput = globalThis.document?.getElementById('profile-business-name');
const profileCityInput = globalThis.document?.getElementById('profile-city');
const profileWhatsappInput = globalThis.document?.getElementById('profile-whatsapp');
const profileWhatsappError = globalThis.document?.getElementById('profile-whatsapp-error');
const interestsChipsContainer = globalThis.document?.getElementById('interests-chips-container');

// Profile Gate DOM Elements
const profileGateForm = globalThis.document?.getElementById('profile-gate-form');
const gateDisplayNameInput = globalThis.document?.getElementById('gate-display-name');
const gateBusinessNameInput = globalThis.document?.getElementById('gate-business-name');
const gateCityInput = globalThis.document?.getElementById('gate-city');
const gateWhatsappInput = globalThis.document?.getElementById('gate-whatsapp');
const gateWhatsappError = globalThis.document?.getElementById('gate-whatsapp-error');
const gateInterestsChipsContainer = globalThis.document?.getElementById('gate-interests-chips-container');

// Customization DOM Elements
const customizationForm = globalThis.document?.getElementById('customization-request-form');
const requestStorefrontTypeSelect = globalThis.document?.getElementById('request-storefront-type');
const requestTemplateInterestInput = globalThis.document?.getElementById('request-template-interest');
const requestGoalInput = globalThis.document?.getElementById('request-goal');
const requestReferenceUrlsInput = globalThis.document?.getElementById('request-reference-urls');
const requestReferenceError = globalThis.document?.getElementById('request-reference-error');
const requestDesiredDeadlineInput = globalThis.document?.getElementById('request-desired-deadline');
const requestsListContainer = globalThis.document?.getElementById('requests-list-container');

// New vitrine dialog (name + address)
const newVitrineDialog = globalThis.document?.getElementById('new-vitrine-dialog');
const newVitrineForm = globalThis.document?.getElementById('new-vitrine-form');
const newVitrineModelText = globalThis.document?.getElementById('new-vitrine-model-text');
const newSiteNameInput = globalThis.document?.getElementById('new-site-name');
const newSiteSlugInput = globalThis.document?.getElementById('new-site-slug');
const newSiteSlugPreview = globalThis.document?.getElementById('new-site-slug-preview');
const newSiteSlugError = globalThis.document?.getElementById('new-site-slug-error');
const newSiteSubmit = globalThis.document?.getElementById('new-site-submit');

let profileInterestsMultiSelect = null;
let gateInterestsMultiSelect = null;

// Insights DOM Elements (aba Pedidos da vitrine aberta)
const insightsHighlightsList = globalThis.document?.getElementById('insights-highlights-list');
const insightsKpiVisits = globalThis.document?.getElementById('insights-kpi-visits');
const insightsKpiVisitsDelta = globalThis.document?.getElementById('insights-kpi-visits-delta');
const insightsKpiOrders = globalThis.document?.getElementById('insights-kpi-orders');
const insightsKpiOrdersDelta = globalThis.document?.getElementById('insights-kpi-orders-delta');
const insightsKpiConversion = globalThis.document?.getElementById('insights-kpi-conversion');
const insightsKpiConversionDelta = globalThis.document?.getElementById('insights-kpi-conversion-delta');
const insightsKpiEstimated = globalThis.document?.getElementById('insights-kpi-estimated');
const insightsDayChartContainer = globalThis.document?.getElementById('insights-day-chart-container');
const insightsHourChartContainer = globalThis.document?.getElementById('insights-hour-chart-container');
const insightsTopItemsList = globalThis.document?.getElementById('insights-top-items-list');
const insightsTopCategoriesList = globalThis.document?.getElementById('insights-top-categories-list');
const insightsLikesTotal = globalThis.document?.getElementById('insights-likes-total');
const insightsLikesPeriod = globalThis.document?.getElementById('insights-likes-period');
const insightsLikesList = globalThis.document?.getElementById('insights-likes-list');

const googleLoginButton = globalThis.document?.getElementById('google-login-button');

// Reserved slugs to block on the client side
const RESERVED_SLUGS = ['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout'];
export const DEFAULT_SUPABASE_URL = 'https://qawlpsrfewosxsfgmmpm.supabase.co';

const TEMPLATE_MODELS = Object.freeze({
  products: { label: 'Produtos', template: 'products-v1', catalogType: 'products' },
  services: { label: 'Serviços e produtos', template: 'servicos-produtos-v1', catalogType: 'products' },
  booking: { label: 'Agendamento', template: 'booking-v1', catalogType: 'booking' },
  quote: { label: 'Orçamento', template: 'quote-v1', catalogType: 'quote' }
});

// ==========================================
// Rotas por hash
// ==========================================

const VITRINE_TABS = new Set(['itens', 'pedidos', 'config']);
const SIMPLE_ROUTES = Object.freeze({
  '#/perfil': 'perfil',
  '#/customizacoes': 'customizacoes',
  '#/plano': 'plano',
  '#/administracao': 'platform-cms',
  '#/impacto': 'impacto',
  '#/primeiro-acesso': 'profile-gate',
  '#/convite': 'convite'
});
const LEGACY_ROUTES = Object.freeze({
  '#inicio': '#/',
  '#vitrines': '#/',
  '#dashboard': '#/',
  '#perfil': '#/perfil',
  '#pedidos': '#/customizacoes',
  '#plano': '#/plano',
  '#administracao': '#/administracao',
  '#impacto': '#/impacto',
  '#profile-gate': '#/primeiro-acesso'
});
const CONTEXT_LEGACY_ROUTES = new Set(['#insights', '#leiloes', '#editor', '#wizard']);
const AUCTION_ROLES = ['owner', 'admin'];

export function parseRoute(hash = '') {
  const raw = String(hash || '').trim();
  if (raw === '' || raw === '#' || raw === '#/') return { section: 'inicio' };
  if (Object.hasOwn(SIMPLE_ROUTES, raw)) return { section: SIMPLE_ROUTES[raw] };
  if (/^#\/convite\/[^/]+$/.test(raw)) return { section: 'convite' };

  const vitrineMatch = raw.match(/^#\/v\/([^/?#]+)(?:\/([a-z]+))?\/?$/);
  if (vitrineMatch) {
    let siteId;
    try {
      siteId = decodeURIComponent(vitrineMatch[1]);
    } catch {
      return { section: 'inicio', unknown: true };
    }
    const tab = vitrineMatch[2] || 'itens';
    if (!VITRINE_TABS.has(tab)) return { section: 'editor', siteId, tab: 'itens', redirectTab: true };
    return { section: 'editor', siteId, tab };
  }

  if (Object.hasOwn(LEGACY_ROUTES, raw) || CONTEXT_LEGACY_ROUTES.has(raw)) {
    return { section: parseRoute(LEGACY_ROUTES[raw] ?? '#/').section, legacy: raw };
  }
  return { section: 'inicio', unknown: true };
}

export function getSectionFromHash(hash) {
  return parseRoute(hash).section;
}

export function vitrineHash(siteId, tab = 'itens') {
  return `#/v/${encodeURIComponent(siteId)}/${VITRINE_TABS.has(tab) ? tab : 'itens'}`;
}

export function routeRedirectTarget(route, context = { activeSite, sites }) {
  if (route.legacy) {
    if (Object.hasOwn(LEGACY_ROUTES, route.legacy)) return LEGACY_ROUTES[route.legacy];
    const listed = activeSites(context.sites || []);
    if (route.legacy === '#insights') {
      const site = context.activeSite || listed[0];
      return site ? vitrineHash(site.id, 'pedidos') : '#/';
    }
    if (route.legacy === '#leiloes') {
      const site = AUCTION_ROLES.includes(context.activeSite?.role)
        ? context.activeSite
        : listed.find((entry) => AUCTION_ROLES.includes(entry.role));
      return site ? vitrineHash(site.id, 'pedidos') : '#/';
    }
    if (route.legacy === '#editor') {
      return context.activeSite ? vitrineHash(context.activeSite.id, 'itens') : '#/';
    }
    return '#/';
  }
  if (route.redirectTab) return vitrineHash(route.siteId, 'itens');
  if (route.unknown) return '#/';
  return null;
}

function replaceHash(target) {
  const win = globalThis.window;
  if (!win) return;
  if (typeof win.history?.replaceState === 'function') {
    win.history.replaceState(null, '', target);
  } else {
    win.location.hash = target;
  }
}

export function navigate(hash) {
  const win = globalThis.window;
  if (!win) return;
  if (win.location.hash === hash) {
    void handleRouting();
  } else {
    win.location.hash = hash;
  }
}

export function isProfileComplete() {
  return !!(profile && profile.displayName && profile.businessName && profile.city && profile.whatsapp && /^[1-9]\d{7,14}$/.test(profile.whatsapp));
}

function resolveProfileGate(route) {
  if (route.section === 'convite') return route;
  if (!isProfileComplete()) {
    if (hasSponsorImpactAccess()) {
      if (route.section !== 'impacto') replaceHash('#/impacto');
      return { section: 'impacto' };
    }
    if (route.section !== 'profile-gate') replaceHash('#/primeiro-acesso');
    return { section: 'profile-gate' };
  }
  if (route.section === 'profile-gate') {
    replaceHash('#/');
    return { section: 'inicio' };
  }
  return route;
}

export async function handleRouting() {
  if (!currentUser) {
    showSection('auth');
    return;
  }
  const token = ++routeToken;
  captureInviteToken({
    location: globalThis.window?.location,
    history: globalThis.window?.history,
    storage: globalThis.sessionStorage
  });

  let route = parseRoute(globalThis.window?.location?.hash || '');
  const target = routeRedirectTarget(route, { activeSite, sites });
  if (target) {
    const openDialogAfter = route.legacy === '#wizard';
    replaceHash(target);
    route = parseRoute(target);
    if (openDialogAfter && isProfileComplete()) {
      showSection('inicio');
      openNewVitrineDialog('products');
      return;
    }
  }
  route = resolveProfileGate(route);

  const leavingVitrine =
    currentSection === 'editor' && (route.section !== 'editor' || route.siteId !== activeSite?.id);
  if (leavingVitrine) {
    const saved = await flushAutosave();
    if (token !== routeToken) return;
    if (!saved) showFeedback('Algumas alterações não foram salvas: complete os nomes e preços pendentes na vitrine.', 'error');
  }

  if (route.section === 'editor') {
    const site = sites.find((entry) => entry.id === route.siteId);
    if (!site) {
      showFeedback('Vitrine não encontrada ou sem acesso.', 'error');
      replaceHash('#/');
      showSection('inicio');
      return;
    }
    const needsLoad = !isEditorShowingSite(site.id);
    activeSite = site;
    showSection('editor');
    showEditorTab(route.tab);
    if (needsLoad) {
      await loadEditor(site, isOnline);
      if (token !== routeToken) return;
      showEditorTab(route.tab);
    }
    if (route.tab === 'pedidos') loadPedidosForActiveSite();
    return;
  }

  if (route.section === 'convite') {
    showSection('convite');
    showInviteConfirmation();
    return;
  }

  showSection(route.section);
}

function setupHashRouting() {
  globalThis.window?.addEventListener('hashchange', () => {
    void handleRouting();
  });
}

function showInviteConfirmation() {
  const container = globalThis.document?.getElementById('invite-confirmation');
  if (!container) return;
  renderInviteConfirmation({
    doc: globalThis.document,
    container,
    request: portalRequest,
    storage: globalThis.sessionStorage,
    onAccepted: async ({ siteId }) => {
      await loadSites();
      navigate(siteId ? vitrineHash(siteId, 'itens') : '#/');
    }
  });
}

export async function portalRequest(path, init = {}) {
  const headers = { Accept: 'application/json', ...(init.headers || {}) };
  if (init.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
  const response = await globalThis.fetch(path, { ...init, headers });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.error?.message || 'Não foi possível concluir a operação.');
    error.status = response.status;
    error.code = data?.error?.code;
    throw error;
  }
  return data;
}

// Initialize App
globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupMenus();
  setupHomeControls();
  setupProfileChips();
  setupNewVitrineDialog();
  setupInsightsControls();
  initAuctionsPanel({ getSites: () => sites, isOnline: () => isOnline });
  initBillingPanel({ getSites: () => sites, isOnline: () => isOnline, publicOrigin: () => PUBLIC_SITE_ORIGIN });
  setupHashRouting();
  await checkSession();
  if (currentUser) {
    await loadProfile();
    await loadCustomizationRequests();
    updateAccountMenu();
    await handleRouting();
  }
});

// ==========================================
// Menus e diálogos (compartilhados com o editor)
// ==========================================

let openMenuState = null;

function menuItemsOf(menu) {
  return Array.from(menu.querySelectorAll('[role="menuitem"]')).filter(
    (el) => !el.closest('[hidden]') && !el.disabled && el.getAttribute('aria-disabled') !== 'true'
  );
}

function openMenu(button, menu) {
  closeOpenMenu(false);
  menu.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  openMenuState = { button, menu };
  menuItemsOf(menu)[0]?.focus();
}

export function closeOpenMenu(returnFocus = false) {
  if (!openMenuState) return;
  const { button, menu } = openMenuState;
  openMenuState = null;
  menu.hidden = true;
  button.setAttribute('aria-expanded', 'false');
  if (returnFocus && button.isConnected) button.focus();
}

export function bindMenu(button, menu) {
  if (!button || !menu || button.dataset.menuBound === 'true') return;
  button.dataset.menuBound = 'true';
  button.setAttribute('aria-haspopup', 'menu');
  button.setAttribute('aria-expanded', 'false');
  menu.hidden = true;

  button.addEventListener('click', (event) => {
    event.stopPropagation();
    if (openMenuState?.menu === menu) {
      closeOpenMenu(false);
    } else {
      openMenu(button, menu);
    }
  });

  button.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      openMenu(button, menu);
      if (event.key === 'ArrowUp') {
        const items = menuItemsOf(menu);
        items[items.length - 1]?.focus();
      }
    }
  });

  menu.addEventListener('keydown', (event) => {
    const items = menuItemsOf(menu);
    if (items.length === 0) return;
    const index = items.indexOf(globalThis.document?.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeOpenMenu(true);
    } else if (event.key === 'Tab') {
      closeOpenMenu(false);
    }
  });

  menu.addEventListener('click', (event) => {
    if (event.target.closest('[role="menuitem"]')) {
      closeOpenMenu(false);
    }
  });
}

function setupMenus() {
  bindMenu(accountMenuButton, accountMenu);
  globalThis.document?.addEventListener('click', (event) => {
    if (!openMenuState) return;
    const { button, menu } = openMenuState;
    if (menu.contains(event.target) || button.contains(event.target)) return;
    closeOpenMenu(false);
  });
}

export function openDialog(dialog, opener = null) {
  if (!dialog) return;
  closeOpenMenu(false);
  if (dialog.dataset.dialogBound !== 'true') {
    dialog.dataset.dialogBound = 'true';
    dialog.querySelectorAll('.dialog-close-btn').forEach((btn) => {
      btn.addEventListener('click', () => closeDialog(dialog));
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) closeDialog(dialog);
    });
    dialog.addEventListener('close', () => {
      const returnTo = dialog.returnFocusTarget;
      dialog.returnFocusTarget = null;
      if (returnTo && returnTo.isConnected && typeof returnTo.focus === 'function') {
        returnTo.focus();
      }
    });
  }
  dialog.returnFocusTarget = opener || globalThis.document?.activeElement || null;
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  const autofocusTarget =
    dialog.querySelector('[autofocus]') ||
    dialog.querySelector('input:not([type="hidden"]):not([readonly]), textarea, select') ||
    dialog.querySelector('.dialog-close-btn');
  autofocusTarget?.focus();
}

export function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) {
    dialog.close();
  } else {
    dialog.removeAttribute('open');
    dialog.dispatchEvent(new Event('close'));
  }
}

export async function copyToClipboard(text) {
  try {
    await globalThis.navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function publicUrlForSite(site) {
  if (!site) return PUBLIC_SITE_ORIGIN;
  return isOnline ? `${PUBLIC_SITE_ORIGIN}/${site.slug}` : `${globalThis.window?.location?.origin || PUBLIC_SITE_ORIGIN}/loja1`;
}

export function updateSiteSummary(siteId, patch) {
  const site = sites.find((entry) => entry.id === siteId);
  if (!site) return;
  Object.assign(site, patch);
  if (!isOnline) {
    try {
      localStorage.setItem('vitrine_local_sites', JSON.stringify(sites));
    } catch {
      // Local mode keeps the change in memory when storage is blocked.
    }
  }
  renderSites();
}

// ==========================================
// Início: modelos, busca e diálogo de nova vitrine
// ==========================================

function setupHomeControls() {
  homeSearchInput?.addEventListener('input', () => {
    homeSearchQuery = homeSearchInput.value;
    renderSites();
  });

  globalThis.document?.querySelectorAll('.template-card').forEach((card) => {
    card.addEventListener('click', () => {
      const template = card.getAttribute('data-template') || 'products';
      if (template === 'custom') {
        startCustomRequest();
      } else {
        openNewVitrineDialog(template, card);
      }
    });
  });
}

function startCustomRequest() {
  if (requestStorefrontTypeSelect) requestStorefrontTypeSelect.value = 'food';
  if (requestTemplateInterestInput) requestTemplateInterestInput.value = 'Modelo Sob Medida';
  if (requestGoalInput) requestGoalInput.value = 'Gostaria de uma vitrine sob medida para o meu negócio.';
  if (requestDesiredDeadlineInput) requestDesiredDeadlineInput.value = '';
  if (requestReferenceUrlsInput) requestReferenceUrlsInput.value = '';
  navigate('#/customizacoes');
  showFeedback('Revise os detalhes do seu pedido sob medida e envie.', 'success');
}

// Profile Interests & Phone Mask setup
function setupProfileChips() {
  const syncBoth = (values) => {
    selectedInterests = new Set(values);
    profileInterestsMultiSelect?.setValues(values);
    gateInterestsMultiSelect?.setValues(values);
  };

  if (interestsChipsContainer) {
    profileInterestsMultiSelect = createInterestsMultiSelect(interestsChipsContainer, {
      inputId: 'profile-interests-combobox',
      onChange: syncBoth
    });
  }

  if (gateInterestsChipsContainer) {
    gateInterestsMultiSelect = createInterestsMultiSelect(gateInterestsChipsContainer, {
      inputId: 'gate-interests-combobox',
      onChange: syncBoth
    });
  }

  attachWhatsappMask(gateWhatsappInput, () => {
    if (gateWhatsappError) gateWhatsappError.hidden = true;
  });
  attachWhatsappMask(profileWhatsappInput, () => {
    if (profileWhatsappError) profileWhatsappError.hidden = true;
  });
}

// Setup Events
function setupEventListeners() {
  // Google OAuth PKCE
  googleLoginButton?.addEventListener('click', async () => {
    try {
      googleLoginButton.disabled = true;
      googleLoginButton.textContent = 'Redirecionando...';
      await startGoogleLogin();
    } catch (err) {
      googleLoginButton.disabled = false;
      googleLoginButton.textContent = 'Entrar com Google';
      showFeedback('Erro ao iniciar login com Google. Tente novamente.', 'error');
    }
  });

  // Logout
  logoutButton?.addEventListener('click', async () => {
    await handleLogout();
  });

  // Profile Form Submit
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveProfile();
    });
  }

  // Profile Gate Form Submit
  if (profileGateForm) {
    profileGateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveProfileGate();
    });
  }

  // Customization Request Form Submit
  if (customizationForm) {
    customizationForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateCustomizationRequest();
    });
  }
}

function getAreaLabel(area) {
  const map = {
    food: 'Alimentação',
    art: 'Arte & design',
    photo: 'Fotografia & mídia',
    health: 'Saúde',
    tech: 'Tecnologia'
  };
  return map[area] || area;
}

export function slugifySiteName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40)
    .replace(/-+$/g, '');
}

function setupNewVitrineDialog() {
  newSiteSlugInput?.addEventListener('input', () => {
    newSiteSlugTouched = true;
    const rawVal = newSiteSlugInput.value;
    const cleaned = rawVal.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (rawVal !== cleaned) newSiteSlugInput.value = cleaned;
    validateNewSiteSlug(newSiteSlugInput.value);
  });

  newSiteNameInput?.addEventListener('input', () => {
    if (newSiteSlugTouched) return;
    newSiteSlugInput.value = slugifySiteName(newSiteNameInput.value);
    validateNewSiteSlug(newSiteSlugInput.value, { quiet: true });
  });

  newVitrineForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (newSiteSubmit?.disabled) return;
    if (newSiteSubmit) newSiteSubmit.disabled = true;
    try {
      await handleCreateSite();
    } finally {
      if (newSiteSubmit) newSiteSubmit.disabled = false;
    }
  });
}

function openNewVitrineDialog(template = 'products', opener = null) {
  newVitrineTemplate = TEMPLATE_MODELS[template] ? template : 'products';
  newSiteSlugTouched = false;
  if (newVitrineModelText) {
    newVitrineModelText.textContent = `Modelo: ${TEMPLATE_MODELS[newVitrineTemplate].label}`;
  }
  if (newSiteNameInput) {
    newSiteNameInput.value = activeSites(sites).length === 0 ? profile.businessName || '' : '';
  }
  if (newSiteSlugInput) newSiteSlugInput.value = slugifySiteName(newSiteNameInput?.value || '');
  if (newSiteSlugError) newSiteSlugError.hidden = true;
  validateNewSiteSlug(newSiteSlugInput?.value || '', { quiet: true });
  openDialog(newVitrineDialog, opener);
}

export function describeSlugProblem(slug) {
  if (!slug) return 'Digite um endereço para a vitrine.';
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    return 'O endereço deve conter apenas letras minúsculas, números e hífens, sem hífens consecutivos ou nas extremidades.';
  }
  if (slug.length < 3 || slug.length > 40) return 'O endereço deve ter entre 3 e 40 caracteres.';
  if (RESERVED_SLUGS.includes(slug)) return 'Este endereço é reservado pelo sistema.';
  return '';
}

function validateNewSiteSlug(slug, { quiet = false } = {}) {
  if (newSiteSlugPreview) newSiteSlugPreview.textContent = `vitrine.inspira.dev.br/${slug || 'sua-loja'}`;
  const message = describeSlugProblem(slug);
  if (newSiteSlugError) {
    newSiteSlugError.textContent = message;
    newSiteSlugError.hidden = quiet || !message || !slug;
  }
  newSiteSlugInput?.setAttribute('aria-invalid', message && !quiet ? 'true' : 'false');
  return !message;
}

function showSlugError(message) {
  if (newSiteSlugError) {
    newSiteSlugError.textContent = message;
    newSiteSlugError.hidden = false;
  }
  newSiteSlugInput?.setAttribute('aria-invalid', 'true');
  newSiteSlugInput?.focus();
}

function extractAuthCodeFromUrl(deps = {}) {
  const href =
    deps.locationHref ??
    deps.location?.href ??
    globalThis.window?.location?.href ??
    '';
  if (href) {
    try {
      const parsed = new URL(href, 'http://localhost');
      const code = parsed.searchParams.get('code');
      if (typeof code === 'string' && code.trim()) {
        return code.trim();
      }
    } catch {
      // Fall through
    }
  }
  const search =
    deps.locationSearch ??
    deps.location?.search ??
    globalThis.window?.location?.search ??
    '';
  if (search) {
    const params = new URLSearchParams(search);
    const code = params.get('code');
    if (typeof code === 'string' && code.trim()) {
      return code.trim();
    }
  }
  return null;
}

function clearAuthCodeFromUrl(deps = {}) {
  const historyObj = deps.history ?? globalThis.window?.history ?? globalThis.history;
  if (!historyObj || typeof historyObj.replaceState !== 'function') {
    return null;
  }
  const href =
    deps.locationHref ??
    deps.location?.href ??
    globalThis.window?.location?.href ??
    'http://localhost/portal/';
  try {
    const parsed = new URL(href, 'http://localhost');
    parsed.searchParams.delete('code');
    const cleanUrl = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    historyObj.replaceState(null, '', cleanUrl);
    return cleanUrl;
  } catch {
    historyObj.replaceState(null, '', '/portal/');
    return '/portal/';
  }
}

export async function exchangePkceCode(code, deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const storage = deps.sessionStorage ?? globalThis.sessionStorage;
  const onFeedback = deps.showFeedback ?? showFeedback;
  const onSection = deps.showSection ?? showSection;
  const loadSitesFn = deps.loadSites ?? (() => loadSites(fetchImpl));

  const codeVerifier =
    typeof storage?.getItem === 'function'
      ? (storage.getItem('pkce_verifier') || '').trim()
      : '';

  function cleanupPkceState() {
    if (typeof storage?.removeItem === 'function') {
      storage.removeItem('pkce_verifier');
      storage.removeItem('supabase_publishable_key');
    }
    clearAuthCodeFromUrl(deps);
  }

  function handlePkceFailure(message) {
    cleanupPkceState();
    isOnline = true;
    currentUser = null;
    if (typeof storage?.removeItem === 'function') {
      storage.removeItem('portal_local_authenticated');
    }
    if (demoModeBadge) demoModeBadge.hidden = true;
    if (logoutButton) logoutButton.hidden = true;
    onSection('auth');
    onFeedback(message, 'error');
    return { ok: false, error: message };
  }

  const trimmedCode = typeof code === 'string' ? code.trim() : '';
  if (!trimmedCode || !codeVerifier) {
    const retryCount = parseInt(storage?.getItem('pkce_retry_count') || '0', 10);
    if (retryCount === 0 && typeof window !== 'undefined' && !deps.history) {
      if (typeof storage?.setItem === 'function') {
        storage.setItem('pkce_retry_count', '1');
      }
      onFeedback('Verificador PKCE ausente. Tentando reiniciar o login automaticamente...', 'info');
      setTimeout(() => {
        startGoogleLogin(deps);
      }, 1500);
      return { ok: false, error: 'missing_verifier_retrying' };
    } else {
      if (typeof storage?.removeItem === 'function') {
        storage.removeItem('pkce_retry_count');
      }
      return handlePkceFailure(
        'Sessão de login expirada ou verificador PKCE ausente. Inicie o login com Google novamente.'
      );
    }
  } else {
    if (typeof storage?.removeItem === 'function') {
      storage.removeItem('pkce_retry_count');
    }
  }

  const config = await fetchAuthConfig(fetchImpl);
  if (!config || !config.supabaseUrl || !config.publishableKey) {
    return handlePkceFailure(
      'Configuração de autenticação do Supabase ausente ou indisponível no servidor.'
    );
  }

  let accessToken = '';
  try {
    const tokenRes = await fetchImpl(`${config.supabaseUrl}/auth/v1/token?grant_type=pkce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        apikey: config.publishableKey
      },
      body: JSON.stringify({
        auth_code: trimmedCode,
        code_verifier: codeVerifier
      })
    });

    if (!tokenRes || !tokenRes.ok) {
      return handlePkceFailure(
        'Não foi possível trocar o código de autorização PKCE no Supabase. Tente entrar com Google novamente.'
      );
    }

    const tokenData = await tokenRes.json().catch(() => null);
    accessToken =
      typeof tokenData?.access_token === 'string' ? tokenData.access_token.trim() : '';
  } catch {
    return handlePkceFailure(
      'Falha de comunicação ao trocar o código PKCE no Supabase. Tente entrar com Google novamente.'
    );
  }

  if (!accessToken) {
    return handlePkceFailure(
      'Resposta de autenticação inválida do provedor OAuth. Tente entrar com Google novamente.'
    );
  }

  try {
    const sessionRes = await fetchImpl('/api/auth/session', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ accessToken })
    });

    if (!sessionRes || !sessionRes.ok) {
      return handlePkceFailure(
        'Falha ao validar o token de sessão no servidor. Tente entrar com Google novamente.'
      );
    }

    const sessionData = await sessionRes.json().catch(() => null);
    if (!sessionData?.authenticated || !sessionData?.user?.id) {
      return handlePkceFailure(
        'Sessão retornada pelo servidor é inválida. Tente entrar com Google novamente.'
      );
    }

    cleanupPkceState();
    isOnline = true;
    currentUser = sessionData.user;
    if (typeof storage?.removeItem === 'function') {
      storage.removeItem('portal_local_authenticated');
    }
    if (demoModeBadge) demoModeBadge.hidden = true;
    if (logoutButton) logoutButton.hidden = false;
    
    const initialHash = deps.locationHash ?? deps.location?.hash ?? globalThis.window?.location?.hash ?? '';
    const initialSection = getSectionFromHash(initialHash);
    onSection(initialSection);
    await loadSitesFn();
    void detectPlatformCms(true);
    void detectSponsorImpact(true);
    return { ok: true, user: sessionData.user, sites };
  } catch {
    return handlePkceFailure(
      'Erro de rede ao estabelecer a sessão no servidor. Tente entrar com Google novamente.'
    );
  }
}

// Check session on startup
export async function checkSession(deps = {}) {
  const authCode = extractAuthCodeFromUrl(deps);
  if (authCode !== null) {
    return exchangePkceCode(authCode, deps);
  }

  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const onSection = deps.showSection ?? showSection;
  const loadSitesFn = deps.loadSites ?? (() => loadSites(fetchImpl));
  try {
    const res = await fetchImpl('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      isOnline = true;
      currentUser = data.user;
      if (demoModeBadge) demoModeBadge.hidden = true;
      if (logoutButton) logoutButton.hidden = false;
      
      await loadSitesFn();
      void detectPlatformCms(true);
      void detectSponsorImpact(true);
      
      const initialHash = deps.locationHash ?? deps.location?.hash ?? globalThis.window?.location?.hash ?? '';
      const initialSection = getSectionFromHash(initialHash);
      onSection(initialSection);
      
      return { ok: true, user: data.user, sites };
    } else if (res.status === 401) {
      isOnline = true;
      if (logoutButton) logoutButton.hidden = true;
      onSection('auth');
      return { ok: false, status: 401 };
    } else {
      isOnline = false;
      if (logoutButton) logoutButton.hidden = true;
      onSection('auth');
      return { ok: false, status: res.status };
    }
  } catch (err) {
    isOnline = false;
    if (logoutButton) logoutButton.hidden = true;
    onSection('auth');
    return { ok: false, error: 'network_error' };
  }
}

// PKCE Generation helpers
function generateRandomString(length) {
  const array = new Uint32Array(length / 2);
  globalThis.crypto.getRandomValues(array);
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return globalThis.crypto.subtle.digest('SHA-256', data);
}

function base64urlencode(a) {
  let str = "";
  const bytes = new Uint8Array(a);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    str += String.fromCharCode(bytes[i]);
  }
  return btoa(str)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function fetchAuthConfig(fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl === 'function') {
    try {
      const res = await fetchImpl('/api/auth/config', {
        method: 'GET',
        headers: { Accept: 'application/json' },
        cache: 'no-store'
      });
      if (res && res.ok) {
        const data = await res.json();
        if (data?.PUBLIC_SITE_ORIGIN || data?.publicSiteOrigin) {
          PUBLIC_SITE_ORIGIN = data.PUBLIC_SITE_ORIGIN || data.publicSiteOrigin;
        }
        if (data?.PORTAL_ORIGIN || data?.portalOrigin) {
          PORTAL_ORIGIN = data.PORTAL_ORIGIN || data.portalOrigin;
        }
        const supabaseUrl = String(
          data?.supabaseUrl || globalThis.window?.SUPABASE_URL || DEFAULT_SUPABASE_URL
        )
          .trim()
          .replace(/\/+$/, '');
        const publishableKey =
          typeof data?.publishableKey === 'string' ? data.publishableKey.trim() : '';
        if (supabaseUrl && publishableKey) {
          if (typeof window !== 'undefined') {
            window.SUPABASE_URL = supabaseUrl;
            window.SUPABASE_ANON_KEY = publishableKey;
          }
          return { supabaseUrl, publishableKey, PUBLIC_SITE_ORIGIN, PORTAL_ORIGIN };
        }
      }
    } catch {
      // Fall through
    }
  }

  const fallbackUrl = String(globalThis.window?.SUPABASE_URL || DEFAULT_SUPABASE_URL)
    .trim()
    .replace(/\/+$/, '');
  const fallbackKey =
    typeof globalThis.window?.SUPABASE_ANON_KEY === 'string'
      ? globalThis.window.SUPABASE_ANON_KEY.trim()
      : '';
  if (fallbackUrl && fallbackKey) {
    return { supabaseUrl: fallbackUrl, publishableKey: fallbackKey };
  }
  return null;
}

export async function startGoogleLogin(deps = {}) {
  const fetchImpl = deps.fetch ?? globalThis.fetch;
  const onFeedback = deps.showFeedback ?? showFeedback;
  const config = await fetchAuthConfig(fetchImpl);

  if (!config || !config.supabaseUrl || !config.publishableKey) {
    onFeedback(
      'Configuração de autenticação do Supabase ausente ou indisponível no servidor. Verifique SUPABASE_ANON_KEY.',
      'error'
    );
    return null;
  }

  const { supabaseUrl, publishableKey } = config;
  const verifier = generateRandomString(56);
  const storage = deps.sessionStorage ?? globalThis.sessionStorage;
  if (storage && typeof storage.setItem === 'function') {
    storage.setItem('pkce_verifier', verifier);
    storage.setItem('supabase_publishable_key', publishableKey);
  }

  const hashed = await sha256(verifier);
  const challenge = base64urlencode(hashed);

  const origin = deps.origin ?? globalThis.window?.location?.origin ?? PORTAL_ORIGIN;
  const redirectUrl = `${origin}/portal/`;
  const googleAuthUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&code_challenge=${challenge}&code_challenge_method=s256&redirect_to=${encodeURIComponent(redirectUrl)}`;

  if (typeof deps.navigate === 'function') {
    deps.navigate(googleAuthUrl);
  } else if (typeof window !== 'undefined' && window.location) {
    window.location.href = googleAuthUrl;
  }
  return googleAuthUrl;
}

// Logout
async function handleLogout() {
  if (isOnline) {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Silently ignore
    }
  }

  // Clear local state
  globalThis.sessionStorage?.removeItem('pkce_verifier');
  globalThis.sessionStorage?.removeItem('supabase_publishable_key');
  await flushAutosave();
  currentUser = null;
  void detectPlatformCms(false);
  void detectSponsorImpact(false);
  sites = [];
  activeSite = null;
  currentSection = null;
  clearEditor();
  profile = {
    displayName: '',
    businessName: '',
    city: '',
    whatsapp: '',
    interests: []
  };
  customizationRequests = [];
  selectedInterests.clear();
  profileInterestsMultiSelect?.setValues([]);
  gateInterestsMultiSelect?.setValues([]);
  
  if (demoModeBadge) demoModeBadge.hidden = true;
  if (logoutButton) logoutButton.hidden = true;
  showFeedback('Sessão encerrada com sucesso.', 'success');
  showSection('auth');
}

const SHELL_SECTIONS = [
  ['inicio', () => inicioSection],
  ['perfil', () => perfilSection],
  ['customizacoes', () => customizacoesSection],
  ['plano', () => planoSection],
  ['convite', () => conviteSection],
  ['editor', () => editorSection],
  ['profile-gate', () => profileGateSection]
];

export function showSection(section) {
  if (section === 'platform-cms' && !hasPlatformAdminAccess()) section = 'inicio';
  if (section === 'impacto' && !hasSponsorImpactAccess()) section = 'inicio';
  if (section === 'editor' && !activeSite) section = 'inicio';
  const previous = currentSection;
  currentSection = section;

  if (authSection) authSection.hidden = section !== 'auth';
  if (authenticatedApp) authenticatedApp.hidden = section === 'auth';
  showPlatformCms(section === 'platform-cms');
  showSponsorImpact(section === 'impacto');
  closeOpenMenu(false);

  if (section === 'auth') return;

  for (const [name, getElement] of SHELL_SECTIONS) {
    const element = getElement();
    if (element) element.hidden = section !== name;
  }
  if (appTopBar) appTopBar.hidden = section === 'editor';
  if (homeSearch) homeSearch.hidden = section !== 'inicio';
  globalThis.document?.body?.classList.toggle('is-vitrine-view', section === 'editor');

  if (section === 'plano') {
    void loadBillingPanel();
  }

  if (previous && previous !== 'auth' && previous !== section) {
    mainContent?.focus?.({ preventScroll: true });
    if (typeof globalThis.window?.scrollTo === 'function') {
      globalThis.window.scrollTo({ top: 0 });
    }
  }
}

// Show Feedback Messages
let feedbackTimer = null;
export function showFeedback(msg, type = 'success') {
  const feedbackEl = isOnline ? 
    (globalThis.document?.getElementById('shell-global-feedback') || globalFeedback) : 
    (globalFeedback || globalThis.document?.getElementById('shell-global-feedback'));

  if (feedbackEl) {
    feedbackEl.textContent = msg;
    feedbackEl.className = `feedback-banner ${type}`;
    feedbackEl.setAttribute('role', type === 'error' ? 'alert' : 'status');
    feedbackEl.hidden = false;
    clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedbackEl.hidden = true;
    }, 6000);
  }
}

// Load Profile (Online with localStorage Fallbacks)
async function loadProfile() {
  if (isOnline) {
    try {
      const res = await fetch('/api/profile');
      if (res.ok) {
        const data = await res.json();
        profile = data.profile || profile;
        localStorage.setItem('vitrine_profile', JSON.stringify(profile));
      } else {
        // Graceful Fallback on 404/501
        loadLocalProfile();
      }
    } catch (err) {
      loadLocalProfile();
    }
  } else {
    loadLocalProfile();
  }
  syncProfileToForm();
}

function loadLocalProfile() {
  const saved = localStorage.getItem('vitrine_profile');
  if (saved) {
    try {
      profile = JSON.parse(saved);
    } catch {
      // Keep defaults
    }
  }
}

export function renderAccountEmailStatus(emailSpan, googleName, googleEmail) {
  if (!emailSpan) return;
  const doc = emailSpan.ownerDocument || globalThis.document;
  emailSpan.replaceChildren();
  const cleanName = typeof googleName === 'string' ? googleName.trim() : '';
  const cleanEmail = typeof googleEmail === 'string' ? googleEmail.trim() : '';

  if (cleanName && cleanEmail) {
    emailSpan.appendChild(doc.createTextNode('Conectado como '));
    const strong = doc.createElement('strong');
    strong.textContent = cleanName;
    emailSpan.appendChild(strong);
    emailSpan.appendChild(doc.createTextNode(` · ${cleanEmail}`));
  } else if (cleanName) {
    emailSpan.appendChild(doc.createTextNode('Conectado como '));
    const strong = doc.createElement('strong');
    strong.textContent = cleanName;
    emailSpan.appendChild(strong);
  } else if (cleanEmail) {
    emailSpan.textContent = `Conectado como ${cleanEmail}`;
  } else {
    emailSpan.textContent = 'Conta Google conectada';
  }
}

const AVATAR_URL_PREFIX = 'https://lh3.googleusercontent.com/';

// Only Google profile photos are allowed by the portal CSP (img-src).
export function getSafeAvatarUrl(url) {
  const value = typeof url === 'string' ? url.trim() : '';
  return value.startsWith(AVATAR_URL_PREFIX) ? value : '';
}

export function getAvatarInitials(label) {
  const text = String(label ?? '').trim();
  if (!text) return 'U';
  const firstLetter = (word) => (Array.from(word)[0] || '').toLocaleUpperCase('pt-BR');
  if (text.includes('@')) return firstLetter(text);
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 1) return firstLetter(words[0]);
  return firstLetter(words[0]) + firstLetter(words[words.length - 1]);
}

function updateAccountMenu() {
  const googleName = currentUser?.user_metadata?.full_name || currentUser?.user_metadata?.name || '';
  const name = (profile.displayName && profile.displayName.trim()) || googleName;
  const email = currentUser?.email || '';
  const label = name || email || (isOnline ? 'Sua conta' : 'Modo local');
  if (accountMenuName) accountMenuName.textContent = label;
  accountMenuButton?.setAttribute('aria-label', `Menu da conta: ${label}`);
  const placeholder = globalThis.document?.getElementById('top-bar-avatar-placeholder');
  if (placeholder) placeholder.textContent = getAvatarInitials(name || email);
}

export function prefillProfileWithGoogleCredentials(userOverride = currentUser, profileTarget = profile) {
  const userObj = userOverride ?? currentUser;
  if (!userObj) return;
  
  const googleName = userObj.user_metadata?.full_name || userObj.user_metadata?.name || '';
  const googleAvatar = getSafeAvatarUrl(userObj.user_metadata?.avatar_url || userObj.user_metadata?.picture);
  const googleEmail = userObj.email || '';

  // Prefill ONLY empty fields!
  if (profileTarget && !profileTarget.displayName && googleName) {
    profileTarget.displayName = googleName;
  }

  // Update read-only account cards in UI
  const updateAccountCard = (avatarImg, placeholderDiv, emailSpan) => {
    renderAccountEmailStatus(emailSpan, googleName, googleEmail);
    if (googleAvatar) {
      if (avatarImg) {
        avatarImg.src = googleAvatar;
        avatarImg.hidden = false;
        
        if (!avatarImg._hasOnError) {
          avatarImg._hasOnError = true;
          avatarImg.addEventListener('error', () => {
            avatarImg.hidden = true;
            if (placeholderDiv) {
              placeholderDiv.hidden = false;
              placeholderDiv.textContent = getAvatarInitials(googleName || googleEmail);
            }
          });
        }
      }
      if (placeholderDiv) placeholderDiv.hidden = true;
    } else {
      if (avatarImg) avatarImg.hidden = true;
      if (placeholderDiv) {
        placeholderDiv.hidden = false;
        placeholderDiv.textContent = getAvatarInitials(googleName || googleEmail);
      }
    }
  };

  updateAccountCard(
    globalThis.document?.getElementById('gate-avatar'),
    globalThis.document?.getElementById('gate-avatar-placeholder'),
    globalThis.document?.getElementById('gate-email')
  );

  updateAccountCard(
    globalThis.document?.getElementById('profile-avatar'),
    globalThis.document?.getElementById('profile-avatar-placeholder'),
    globalThis.document?.getElementById('profile-email')
  );

  updateAccountCard(
    globalThis.document?.getElementById('top-bar-avatar'),
    globalThis.document?.getElementById('top-bar-avatar-placeholder'),
    null
  );
}

function syncProfileToForm() {
  prefillProfileWithGoogleCredentials();

  if (profileDisplayNameInput) profileDisplayNameInput.value = profile.displayName || '';
  if (profileBusinessNameInput) profileBusinessNameInput.value = profile.businessName || '';
  if (profileCityInput) profileCityInput.value = profile.city || '';
  if (profileWhatsappInput) profileWhatsappInput.value = formatWhatsappBR(profile.whatsapp || '');

  if (gateDisplayNameInput) gateDisplayNameInput.value = profile.displayName || '';
  if (gateBusinessNameInput) gateBusinessNameInput.value = profile.businessName || '';
  if (gateCityInput) gateCityInput.value = profile.city || '';
  if (gateWhatsappInput) gateWhatsappInput.value = formatWhatsappBR(profile.whatsapp || '');

  selectedInterests.clear();
  const interestsArray = Array.isArray(profile.interests) ? profile.interests : [];
  interestsArray.forEach(interest => {
    selectedInterests.add(interest);
  });

  profileInterestsMultiSelect?.setValues(interestsArray);
  gateInterestsMultiSelect?.setValues(interestsArray);
}

// Save Profile Gate
async function handleSaveProfileGate() {
  const displayName = gateDisplayNameInput.value.trim();
  const businessName = gateBusinessNameInput.value.trim();
  const city = gateCityInput.value.trim();
  const whatsapp = extractPhoneDigits(gateWhatsappInput.value);
  const interests = gateInterestsMultiSelect
    ? gateInterestsMultiSelect.getValues()
    : Array.from(selectedInterests);

  // Validations
  if (!displayName || !businessName || !city || !whatsapp) {
    showFeedback('Por favor, preencha todos os campos obrigatórios.', 'error');
    return;
  }

  if (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp)) {
    gateWhatsappError.hidden = false;
    showFeedback('Digite um número de WhatsApp válido (ex: +55 (51) 99999-9999).', 'error');
    return;
  }
  gateWhatsappError.hidden = true;

  profile = { displayName, businessName, city, whatsapp, interests };
  localStorage.setItem('vitrine_profile', JSON.stringify(profile));

  let savedOnServer = false;
  let serverErrorMsg = '';
  if (isOnline) {
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (res.ok) {
        savedOnServer = true;
      } else {
        const errBody = await res.json().catch(() => null);
        serverErrorMsg = errBody?.error?.message || '';
      }
    } catch (err) {
      // Caught gracefully
    }
  }

  updateAccountMenu();
  if (savedOnServer) {
    showFeedback('Perfil criado com sucesso na nuvem!', 'success');
    navigate('#/');
  } else {
    showFeedback(
      serverErrorMsg || 'Erro ao conectar ao servidor. Verifique sua conexão e tente novamente.',
      'error'
    );
  }
}

// Save Profile
async function handleSaveProfile() {
  const displayName = profileDisplayNameInput.value.trim();
  const businessName = profileBusinessNameInput.value.trim();
  const city = profileCityInput.value.trim();
  const whatsapp = extractPhoneDigits(profileWhatsappInput.value);
  const interests = profileInterestsMultiSelect
    ? profileInterestsMultiSelect.getValues()
    : Array.from(selectedInterests);

  // Validations
  if (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp)) {
    profileWhatsappError.hidden = false;
    showFeedback('Digite um número de WhatsApp válido (ex: +55 (51) 99999-9999).', 'error');
    return;
  }
  profileWhatsappError.hidden = true;

  profile = { displayName, businessName, city, whatsapp, interests };
  localStorage.setItem('vitrine_profile', JSON.stringify(profile));

  let savedOnServer = false;
  let serverErrorMsg = '';
  if (isOnline) {
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (res.ok) {
        savedOnServer = true;
      } else {
        const errBody = await res.json().catch(() => null);
        serverErrorMsg = errBody?.error?.message || '';
      }
    } catch (err) {
      // Caught gracefully
    }
  }

  updateAccountMenu();
  if (savedOnServer) {
    showFeedback('Perfil e interesses salvos com sucesso na nuvem!', 'success');
    navigate('#/');
  } else {
    showFeedback(
      serverErrorMsg || 'Erro ao conectar ao servidor. Verifique sua conexão e tente novamente.',
      'error'
    );
  }
}

// Load Customization Requests (Online/Offline)
async function loadCustomizationRequests() {
  if (isOnline) {
    try {
      const res = await fetch('/api/customization-requests');
      if (res.ok) {
        const data = await res.json();
        customizationRequests = data.requests || [];
        localStorage.setItem('vitrine_customization_requests', JSON.stringify(customizationRequests));
      } else {
        loadLocalCustomizationRequests();
      }
    } catch (err) {
      loadLocalCustomizationRequests();
    }
  } else {
    loadLocalCustomizationRequests();
  }
  renderCustomizationRequests();
}

function loadLocalCustomizationRequests() {
  const saved = localStorage.getItem('vitrine_customization_requests');
  if (saved) {
    try {
      customizationRequests = JSON.parse(saved);
    } catch {
      customizationRequests = [];
    }
  } else {
    customizationRequests = [];
  }
}

function renderCustomizationRequests() {
  if (!requestsListContainer) return;

  if (customizationRequests.length === 0) {
    requestsListContainer.innerHTML = '<p class="empty-msg">Nenhuma solicitação enviada ainda.</p>';
    return;
  }

  requestsListContainer.innerHTML = '';
  customizationRequests.forEach(req => {
    const card = document.createElement('div');
    card.className = 'site-item request-card';

    const header = document.createElement('div');
    header.className = 'request-card-header';

    const modelTitle = document.createElement('h3');
    modelTitle.className = 'request-card-title';
    modelTitle.textContent = `${req.templateInterest || 'Customização'} (${getAreaLabel(req.storefrontType)})`;

    const statusBadge = document.createElement('span');
    statusBadge.className = 'site-role-badge request-card-badge';
    statusBadge.textContent = getRequestStatusLabel(req.status);

    header.appendChild(modelTitle);
    header.appendChild(statusBadge);

    const goalPara = document.createElement('p');
    goalPara.className = 'request-card-goal';
    goalPara.textContent = req.goal;

    const details = document.createElement('div');
    details.className = 'request-card-details';

    const deadline = document.createElement('span');
    deadline.textContent = `Prazo: ${req.desiredDeadline || 'Não informado'}`;

    const dateStr = new Date(req.createdAt || req.updatedAt || Date.now()).toLocaleDateString('pt-BR');
    const dateSpan = document.createElement('span');
    dateSpan.textContent = dateStr;

    details.appendChild(deadline);
    details.appendChild(dateSpan);

    // Optional WhatsApp button to continue discussion
    const actionContainer = document.createElement('div');
    actionContainer.className = 'request-card-actions';

    const waBtn = document.createElement('a');
    waBtn.className = 'button button-small button-secondary button-pill request-card-wa-btn';
    waBtn.target = '_blank';
    waBtn.rel = 'noopener noreferrer';
    
    // Fallback or real WhatsApp discussion link
    const waText = `Olá Coletivo Inspira! Enviei uma solicitação de customização para o segmento de ${getAreaLabel(req.storefrontType)} (${req.templateInterest}). Meu objetivo é: ${req.goal.substring(0, 100)}...`;
    waBtn.href = `https://wa.me/5511999999999?text=${encodeURIComponent(waText)}`;
    waBtn.textContent = 'Conversar no WhatsApp';

    actionContainer.appendChild(waBtn);

    card.appendChild(header);
    card.appendChild(goalPara);
    card.appendChild(details);
    card.appendChild(actionContainer);

    requestsListContainer.appendChild(card);
  });
}

function getRequestStatusLabel(status) {
  const map = {
    novo: 'Novo',
    em_analise: 'Em Análise',
    respondido: 'Respondido',
    encerrado: 'Encerrado'
  };
  return map[status] || 'Pendente';
}

// Create Customization Request
async function handleCreateCustomizationRequest() {
  const storefrontType = requestStorefrontTypeSelect.value;
  const templateInterest = requestTemplateInterestInput.value.trim();
  const goal = requestGoalInput.value.trim();
  const rawUrls = requestReferenceUrlsInput.value.trim();
  const desiredDeadline = requestDesiredDeadlineInput.value.trim();

  // Validations
  if (!templateInterest || templateInterest.length > 120) {
    showFeedback('Insira o nome do modelo/recurso desejado (máx. 120 caracteres).', 'error');
    return;
  }
  if (!goal || goal.length < 10 || goal.length > 2000) {
    showFeedback('O objetivo do projeto deve ter entre 10 e 2000 caracteres.', 'error');
    return;
  }

  // Parse Reference URLs and validate HTTPS
  const referenceUrls = rawUrls ? rawUrls.split('\n').map(u => u.trim()).filter(Boolean) : [];
  let urlsValid = true;
  for (const url of referenceUrls) {
    if (!url.startsWith('https://')) {
      urlsValid = false;
      break;
    }
  }
  if (!urlsValid) {
    requestReferenceError.hidden = false;
    showFeedback('Todos os links de referência devem usar o protocolo seguro HTTPS (ex: https://site.com).', 'error');
    return;
  }
  requestReferenceError.hidden = true;

  const newRequest = {
    id: `req-local-${Date.now()}`,
    siteId: null,
    storefrontType,
    templateInterest,
    goal,
    referenceUrls,
    desiredDeadline,
    status: 'novo',
    createdAt: new Date().toISOString()
  };

  customizationRequests.unshift(newRequest);
  localStorage.setItem('vitrine_customization_requests', JSON.stringify(customizationRequests));

  let savedOnServer = false;
  if (isOnline) {
    try {
      const res = await fetch('/api/customization-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          storefrontType,
          templateInterest,
          goal,
          referenceUrls,
          desiredDeadline
        })
      });
      if (res.ok) {
        savedOnServer = true;
        const data = await res.json();
        // Replace mock local request with server response
        if (data.request) {
          customizationRequests[0] = data.request;
          localStorage.setItem('vitrine_customization_requests', JSON.stringify(customizationRequests));
        }
      }
    } catch (err) {
      // Caught gracefully
    }
  }

  customizationForm.reset();
  renderCustomizationRequests();

  if (savedOnServer) {
    showFeedback('Pedido de customização registrado com sucesso!', 'success');
  } else {
    showFeedback('Pedido registrado com sucesso no navegador (modo offline).', 'success');
  }
}

// ==========================================
// Vitrines recentes (Início)
// ==========================================

async function loadSites(fetchImpl = globalThis.fetch) {
  setSitesStatus('Carregando vitrines...');
  try {
    const res = await fetchImpl('/api/sites');
    if (res.ok) {
      const data = await res.json();
      sites = data.sites || [];
      if (activeSite) activeSite = sites.find((site) => site.id === activeSite.id) || activeSite;
      if (sitesListContainer && globalThis.document) {
        renderSites();
        void loadDemoInvitations(() => loadSites(fetchImpl));
      }
      void loadBillingNotice(globalThis.document?.getElementById('billing-notice'), fetchImpl);
    } else {
      setSitesStatus('');
      showFeedback('Erro ao carregar vitrines do servidor.', 'error');
    }
  } catch (err) {
    setSitesStatus('');
    showFeedback('Falha de rede ao carregar vitrines.', 'error');
  }
}

function loadLocalSites() {
  const saved = localStorage.getItem('vitrine_local_sites');
  if (saved) {
    sites = JSON.parse(saved);
  } else {
    // Scaffold default demo site
    sites = [
      {
        id: "demo-site-pastus",
        slug: "pastus-demo",
        name: "Pastus Fogo & Parrilla (Demo)",
        template: "pizzeria-v1",
        role: "owner",
        updatedAt: new Date().toISOString()
      }
    ];
    localStorage.setItem('vitrine_local_sites', JSON.stringify(sites));

    // Scaffold default demo draft matching pizzeria-v1 structure
    const defaultDraft = {
      siteId: "demo-site-pastus",
      revision: 1,
      updatedAt: new Date().toISOString(),
      content: {
        schemaVersion: 1,
        template: "pizzeria-v1",
        slug: "pastus-demo",
        businessName: "Pastus Fogo & Parrilla (Demo)",
        whatsapp: "5551999999999",
        categories: [
          {
            name: "Pizzas Tradicionais",
            items: [
              { id: "item-1", name: "Margherita", description: "Molho de tomate fresco, mozzarella e manjericão.", priceCents: 4500, active: true },
              { id: "item-2", name: "Calabresa", description: "Mozzarella, calabresa fatiada e cebola.", priceCents: 4800, active: true }
            ]
          },
          {
            name: "Bebidas",
            items: [
              { id: "item-3", name: "Refrigerante Lata", description: "Coca-cola ou Guaraná 350ml.", priceCents: 650, active: true }
            ]
          }
        ]
      }
    };
    localStorage.setItem('vitrine_local_draft_demo-site-pastus', JSON.stringify(defaultDraft));
  }
  renderSites();
}

function setSitesStatus(message) {
  if (!sitesListStatus) return;
  sitesListStatus.textContent = message;
  sitesListStatus.hidden = !message;
}

function catalogTypeOfSite(site) {
  const template = site?.template || '';
  if (template.startsWith('servicos')) return 'services';
  if (template.startsWith('booking')) return 'booking';
  if (template.startsWith('quote')) return 'quote';
  return 'products';
}

function formatShortDate(value) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
}

function normalizeSearch(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

export function isSitePublished(site) {
  return Boolean(site?.publishedAt);
}

export function filterSitesForHome(list, query) {
  const normalized = normalizeSearch(query).trim();
  return list
    .filter((site) => !normalized || normalizeSearch(`${site.name} ${site.slug}`).includes(normalized))
    .sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

function renderSites() {
  if (!sitesListContainer || !globalThis.document) return;
  sitesListContainer.replaceChildren();
  sitesViewFilterSlot?.replaceChildren();

  if (sites.length === 0) {
    setSitesStatus('Nenhuma vitrine ainda. Escolha um modelo acima para começar.');
    return;
  }

  if (sites.some((site) => site.archivedAt)) {
    sitesViewFilterSlot?.appendChild(createSiteViewFilter(sites, renderSites));
  }

  const viewSites = sitesForCurrentView(sites);
  if (viewSites.length === 0) {
    setSitesStatus(emptyViewMessage());
    return;
  }

  const filtered = filterSitesForHome(viewSites, homeSearchQuery);
  if (filtered.length === 0) {
    setSitesStatus(`Nenhuma vitrine encontrada para "${homeSearchQuery.trim()}".`);
    return;
  }
  setSitesStatus(homeSearchQuery.trim() ? `${filtered.length} vitrine(s) encontrada(s).` : '');

  for (const site of filtered) {
    sitesListContainer.appendChild(createSiteCard(site));
  }
}

function roleLabel(role) {
  return {
    owner: 'Proprietário',
    admin: 'Administrador',
    editor: 'Funcionário',
    viewer: 'Somente leitura'
  }[role] || 'Colaborador';
}

function createSiteCard(site) {
  const doc = globalThis.document;
  const item = doc.createElement('li');
  item.className = 'vitrine-card';

  const link = doc.createElement('a');
  link.className = 'vitrine-card-link';
  link.href = vitrineHash(site.id, 'itens');
  link.setAttribute('aria-label', `Abrir a vitrine ${site.name}`);

  const cover = doc.createElement('span');
  cover.className = `vitrine-card-cover template-thumb thumb-${catalogTypeOfSite(site)}`;
  cover.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 3; i += 1) cover.appendChild(doc.createElement('span'));

  const body = doc.createElement('span');
  body.className = 'vitrine-card-body';

  const title = doc.createElement('span');
  title.className = 'vitrine-card-title';
  title.textContent = site.name;

  const address = doc.createElement('span');
  address.className = 'vitrine-card-address';
  address.textContent = `vitrine.inspira.dev.br/${site.slug}`;

  const meta = doc.createElement('span');
  meta.className = 'vitrine-card-meta';

  const published = isSitePublished(site);
  const status = doc.createElement('span');
  status.className = `status-pill ${published ? 'is-published' : 'is-draft'}`;
  status.textContent = published ? 'Publicada' : 'Rascunho';
  meta.appendChild(status);

  const lifecycleBadge = siteStatusBadge(site);
  if (lifecycleBadge) meta.appendChild(lifecycleBadge);

  if (site.role && site.role !== 'owner') {
    const shared = doc.createElement('span');
    shared.className = 'vitrine-card-shared';
    shared.textContent = roleLabel(site.role);
    meta.appendChild(shared);
  }

  const date = doc.createElement('span');
  date.className = 'vitrine-card-date';
  date.textContent = `Editada ${formatShortDate(site.updatedAt)}`;
  meta.appendChild(date);

  body.append(title, address, meta);
  link.append(cover, body);

  const menuAnchor = doc.createElement('div');
  menuAnchor.className = 'menu-anchor vitrine-card-menu';

  const menuId = `site-menu-${String(site.id).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
  const menuBtn = doc.createElement('button');
  menuBtn.type = 'button';
  menuBtn.className = 'icon-button';
  menuBtn.setAttribute('aria-label', `Mais opções de ${site.name}`);
  menuBtn.setAttribute('aria-controls', menuId);
  menuBtn.appendChild(createDotsIcon());

  const menu = doc.createElement('div');
  menu.className = 'menu-popup menu-popup-end';
  menu.id = menuId;
  menu.setAttribute('role', 'menu');
  menu.setAttribute('aria-label', `Opções de ${site.name}`);

  const menuLink = (text, href, extra = {}) => {
    const anchor = doc.createElement('a');
    anchor.className = 'menu-item';
    anchor.setAttribute('role', 'menuitem');
    anchor.href = href;
    anchor.textContent = text;
    if (extra.external) {
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
    }
    return anchor;
  };

  menu.appendChild(menuLink('Abrir', vitrineHash(site.id, 'itens')));
  menu.appendChild(menuLink('Pedidos', vitrineHash(site.id, 'pedidos')));

  if (published) {
    const copyItem = doc.createElement('button');
    copyItem.type = 'button';
    copyItem.className = 'menu-item';
    copyItem.setAttribute('role', 'menuitem');
    copyItem.textContent = 'Copiar link';
    copyItem.addEventListener('click', async () => {
      const ok = await copyToClipboard(publicUrlForSite(site));
      showFeedback(ok ? 'Link da vitrine copiado.' : 'Não foi possível copiar o link.', ok ? 'success' : 'error');
    });
    menu.appendChild(copyItem);
    menu.appendChild(menuLink('Abrir vitrine pública', publicUrlForSite(site), { external: true }));
  }

  for (const lifecycleItem of createLifecycleMenuItems(site, {
    online: isOnline,
    notify: showFeedback,
    onChanged: loadSites
  })) {
    menu.appendChild(lifecycleItem);
  }

  menuAnchor.append(menuBtn, menu);
  bindMenu(menuBtn, menu);

  item.append(link, menuAnchor);
  return item;
}

export function createDotsIcon() {
  const svg = createSvgElement('svg', {
    width: '22',
    height: '22',
    viewBox: '0 0 24 24',
    'aria-hidden': 'true',
    class: 'icon-dots'
  });
  for (const cy of [5, 12, 19]) {
    svg.appendChild(createSvgElement('circle', { cx: 12, cy, r: 1.6 }));
  }
  return svg;
}

// ==========================================
// Criação de vitrine (diálogo único)
// ==========================================

async function handleCreateSite() {
  const name = newSiteNameInput.value.trim();
  const slug = newSiteSlugInput.value.trim();
  const model = TEMPLATE_MODELS[newVitrineTemplate] || TEMPLATE_MODELS.products;

  if (!name) {
    showFeedback('Digite o nome da vitrine.', 'error');
    newSiteNameInput.focus();
    return;
  }

  if (!validateNewSiteSlug(slug)) {
    if (newSiteSlugError) newSiteSlugError.hidden = false;
    newSiteSlugInput.focus();
    return;
  }

  const { template, catalogType } = model;

  if (isOnline) {
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, template, catalogType, whatsapp: profile.whatsapp })
      });

      if (res.status === 201) {
        const created = await res.json().catch(() => null);
        await finishSiteCreation(name, slug, created);
      } else if (res.status === 409) {
        const errorData = await res.json().catch(() => null);
        if (errorData?.error?.code === 'PROFILE_INCOMPLETE') {
          closeDialog(newVitrineDialog);
          showFeedback('Por favor, preencha todos os campos do seu perfil antes de criar sua vitrine.', 'error');
          profile.displayName = '';
          void handleRouting();
        } else {
          showSlugError('Este endereço já está sendo utilizado por outra vitrine.');
        }
      } else {
        const errorData = await res.json().catch(() => null);
        showFeedback(errorData?.error?.message || 'Erro ao criar vitrine.', 'error');
      }
    } catch (err) {
      showFeedback('Erro de rede ao criar vitrine.', 'error');
    }
    return;
  }

  // Local creation
  if (sites.some((site) => site.slug === slug)) {
    showSlugError('Este endereço já está sendo utilizado por outra vitrine local.');
    return;
  }

  const newId = `local-site-${Date.now()}`;
  sites.push({ id: newId, slug, name, template, role: 'owner', updatedAt: new Date().toISOString() });
  localStorage.setItem('vitrine_local_sites', JSON.stringify(sites));

  const defaultDraft = {
    siteId: newId,
    revision: 1,
    updatedAt: new Date().toISOString(),
    content: {
      schemaVersion: 1,
      template,
      catalogType,
      slug,
      businessName: name,
      whatsapp: profile.whatsapp || '5511999999999',
      categories: [],
      ...(template === 'servicos-produtos-v1' ? { structure: {} } : {})
    }
  };
  localStorage.setItem(`vitrine_local_draft_${newId}`, JSON.stringify(defaultDraft));
  await finishSiteCreation(name, slug, { site: { id: newId } });
}

async function finishSiteCreation(name, slug, created) {
  newVitrineForm?.reset();
  closeDialog(newVitrineDialog);
  if (isOnline) {
    await loadSites();
  } else {
    renderSites();
  }
  const createdId = created?.site?.id ?? created?.id;
  const site = sites.find((entry) => (createdId && entry.id === createdId) || entry.slug === slug);
  showFeedback(`Vitrine "${name}" criada.`, 'success');
  if (site) navigate(vitrineHash(site.id, 'itens'));
}

// ==========================================
// Aba Pedidos: Insights e leilões da vitrine aberta
// ==========================================

function formatInsightsCurrencyBRL(cents) {
  const safe = Number.isFinite(cents) && cents >= 0 ? Math.round(cents) : 0;
  const reais = Math.floor(safe / 100);
  const dec = String(safe % 100).padStart(2, '0');
  return `R$ ${reais.toLocaleString('pt-BR')},${dec}`;
}

function formatInsightsPercent(value) {
  const num = Number.isFinite(value) ? value : 0;
  return `${num.toFixed(1).replace('.', ',')}%`;
}

export function buildDemoInsightsDataset(siteId = 'demo-site-pastus', period = '7d') {
  const multiplier = period === '90d' ? 9 : period === '30d' ? 3.5 : 1;
  const visits = Math.round(186 * multiplier);
  const previousVisits = Math.round(142 * multiplier);
  const orders = Math.round(38 * multiplier);
  const previousOrders = Math.round(27 * multiplier);
  const estimatedCents = Math.round(182400 * multiplier);
  const previousEstimatedCents = Math.round(129600 * multiplier);
  const conversionPercent = Math.round((orders / visits) * 1000) / 10;
  const previousConversionPercent = Math.round((previousOrders / previousVisits) * 1000) / 10;

  const baseDays = [
    { date: '2026-11-06', visits: 21, orders: 4 },
    { date: '2026-11-07', visits: 29, orders: 6 },
    { date: '2026-11-08', visits: 34, orders: 8 },
    { date: '2026-11-09', visits: 24, orders: 5 },
    { date: '2026-11-10', visits: 19, orders: 3 },
    { date: '2026-11-11', visits: 26, orders: 5 },
    { date: '2026-11-12', visits: 33, orders: 7 }
  ];

  const byHour = Array.from({ length: 24 }, (_, hour) => {
    if (hour === 12 || hour === 13) {
      return { hour, visits: Math.round(16 * multiplier), orders: Math.round(4 * multiplier) };
    }
    if (hour === 18) {
      return { hour, visits: Math.round(34 * multiplier), orders: Math.round(9 * multiplier) };
    }
    if (hour === 19) {
      return { hour, visits: Math.round(48 * multiplier), orders: Math.round(13 * multiplier) };
    }
    if (hour === 20) {
      return { hour, visits: Math.round(39 * multiplier), orders: Math.round(8 * multiplier) };
    }
    if (hour === 21) {
      return { hour, visits: Math.round(22 * multiplier), orders: Math.round(3 * multiplier) };
    }
    if (hour >= 10 && hour <= 22) {
      return { hour, visits: Math.round(5 * multiplier), orders: Math.round(1 * multiplier) };
    }
    return { hour, visits: 0, orders: 0 };
  });

  return {
    siteId,
    period,
    summary: {
      visits,
      previousVisits,
      orders,
      previousOrders,
      conversionPercent,
      previousConversionPercent,
      estimatedCents,
      previousEstimatedCents
    },
    topItems: [
      {
        itemId: 'item-3',
        name: 'Refrigerante Lata',
        categoryName: 'Bebidas',
        views: Math.round(112 * multiplier),
        selections: Math.round(42 * multiplier),
        previousSelections: Math.round(30 * multiplier),
        deltaPercent: 40.0
      },
      {
        itemId: 'item-1',
        name: 'Margherita',
        categoryName: 'Pizzas Tradicionais',
        views: Math.round(98 * multiplier),
        selections: Math.round(34 * multiplier),
        previousSelections: Math.round(26 * multiplier),
        deltaPercent: 30.8
      },
      {
        itemId: 'item-2',
        name: 'Calabresa',
        categoryName: 'Pizzas Tradicionais',
        views: Math.round(84 * multiplier),
        selections: Math.round(28 * multiplier),
        previousSelections: Math.round(22 * multiplier),
        deltaPercent: 27.3
      }
    ],
    topCategories: [
      {
        categoryId: 'pizzas-tradicionais',
        name: 'Pizzas Tradicionais',
        selections: Math.round(62 * multiplier)
      },
      {
        categoryId: 'bebidas',
        name: 'Bebidas',
        selections: Math.round(42 * multiplier)
      }
    ],
    byDay: baseDays.map((d) => ({
      date: d.date,
      visits: Math.round(d.visits * multiplier),
      orders: Math.round(d.orders * multiplier)
    })),
    byHour,
    highlights: [
      'Refrigerante Lata foi o item mais escolhido nesta semana, 40% a mais que na anterior.',
      'Seus pedidos se concentram entre 18h e 20h.',
      'As visitas cresceram 31% nesta semana em relação ao período anterior.'
    ]
  };
}

function setupInsightsControls() {
  globalThis.document?.querySelectorAll('.insights-period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextPeriod = btn.getAttribute('data-period') || '7d';
      insightsPeriod = nextPeriod;
      globalThis.document?.querySelectorAll('.insights-period-btn').forEach((b) => {
        const isCurrent = b.getAttribute('data-period') === nextPeriod;
        b.classList.toggle('active', isCurrent);
        b.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
      });
      void loadInsightsForActiveSite();
    });
  });
}

export function getEmptyInsightsDataset() {
  return {
    summary: {
      visits: 0,
      orders: 0,
      conversionPercent: 0,
      estimatedCents: 0,
      visitsDelta: 0,
      ordersDelta: 0,
      estimatedDeltaCents: 0
    },
    highlights: ['Ainda sem visitas registradas'],
    byDay: [],
    byHour: [],
    topItems: [],
    topCategories: [],
    likes: { total: 0, periodNew: 0, items: [] }
  };
}

function loadPedidosForActiveSite() {
  void loadInsightsForActiveSite();
  const canSeeAuctions = AUCTION_ROLES.includes(activeSite?.role);
  if (auctionsBlock) auctionsBlock.hidden = !canSeeAuctions;
  if (canSeeAuctions) {
    selectAuctionSite(activeSite.id);
    void loadAuctionsPanel();
  }
}

export async function loadInsightsForActiveSite(fetchImpl = globalThis.fetch) {
  const targetSiteId = activeSite?.id;
  const token = ++insightsRequestToken;

  if (isOnline && targetSiteId && typeof fetchImpl === 'function') {
    try {
      const res = await fetchImpl(
        `/api/sites/${encodeURIComponent(targetSiteId)}/insights?period=${encodeURIComponent(insightsPeriod)}`,
        {
          headers: { Accept: 'application/json' }
        }
      );
      if (res && res.ok) {
        const body = await res.json();
        if (body?.insights) {
          if (token !== insightsRequestToken) return currentInsightsData;
          currentInsightsData = body.insights;
          renderInsightsPanel(currentInsightsData);
          return currentInsightsData;
        }
      }
    } catch {
      // Fallback to empty dataset
    }
  }

  if (token !== insightsRequestToken) return currentInsightsData;
  currentInsightsData = getEmptyInsightsDataset();
  renderInsightsPanel(currentInsightsData);
  return currentInsightsData;
}

function createSvgElement(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    el.setAttribute(k, String(v));
  }
  return el;
}

function renderDaySvgChart(container, byDay = []) {
  if (!container || !globalThis.document) return;
  container.replaceChildren();

  const items = Array.isArray(byDay) && byDay.length > 0 ? byDay.slice(-14) : [];
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent = 'Sem dados diários para exibir neste período.';
    container.appendChild(empty);
    return;
  }

  const width = 440;
  const height = 220;
  const padLeft = 36;
  const padRight = 14;
  const padTop = 24;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxVal = Math.max(
    1,
    ...items.map((d) => Math.max(Number(d.visits) || 0, Number(d.orders) || 0))
  );

  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: String(width),
    height: String(height),
    preserveAspectRatio: 'xMidYMid meet',
    class: 'insights-svg-chart',
    'aria-hidden': 'true'
  });

  // Horizontal grid lines
  for (const ratio of [0, 0.5, 1]) {
    const y = Math.round(padTop + plotH * (1 - ratio));
    svg.appendChild(
      createSvgElement('line', {
        x1: padLeft,
        y1: y,
        x2: width - padRight,
        y2: y,
        class: 'svg-grid-line'
      })
    );
    const label = createSvgElement('text', {
      x: padLeft - 8,
      y: y + 4,
      'text-anchor': 'end',
      class: 'svg-axis-label'
    });
    label.textContent = String(Math.round(maxVal * ratio));
    svg.appendChild(label);
  }

  const slotW = plotW / items.length;
  const barW = Math.max(10, Math.min(20, Math.floor(slotW * 0.36)));

  items.forEach((day, idx) => {
    const centerX = padLeft + idx * slotW + slotW / 2;
    const visitsVal = Math.max(0, Number(day.visits) || 0);
    const ordersVal = Math.max(0, Number(day.orders) || 0);

    const vH = Math.max(visitsVal > 0 ? 8 : 0, Math.round((visitsVal / maxVal) * plotH));
    const oH = Math.max(ordersVal > 0 ? 12 : 0, Math.round((ordersVal / maxVal) * plotH));

    if (vH > 0) {
      svg.appendChild(
        createSvgElement('rect', {
          x: Math.round(centerX - barW - 2),
          y: padTop + plotH - vH,
          width: barW,
          height: vH,
          rx: 4,
          class: 'svg-bar-visits'
        })
      );

      if (items.length <= 7) {
        const visitLabel = createSvgElement('text', {
          x: Math.round(centerX - barW / 2 - 2),
          y: Math.max(13, padTop + plotH - vH - 5),
          'text-anchor': 'middle',
          class: 'svg-bar-value-soft'
        });
        visitLabel.textContent = String(visitsVal);
        svg.appendChild(visitLabel);
      }
    }

    if (oH > 0) {
      svg.appendChild(
        createSvgElement('rect', {
          x: Math.round(centerX + 2),
          y: padTop + plotH - oH,
          width: barW,
          height: oH,
          rx: 4,
          class: 'svg-bar-orders'
        })
      );

      const valLabel = createSvgElement('text', {
        x: Math.round(centerX + 2 + barW / 2),
        y: Math.max(13, padTop + plotH - oH - 5),
        'text-anchor': 'middle',
        class: 'svg-bar-value'
      });
      valLabel.textContent = String(ordersVal);
      svg.appendChild(valLabel);
    }

    if (items.length <= 7 || idx % 2 === 0 || idx === items.length - 1) {
      const shortDate = String(day.date || '').slice(5).split('-').reverse().join('/');
      const xLabel = createSvgElement('text', {
        x: Math.round(centerX),
        y: height - 10,
        'text-anchor': 'middle',
        class: 'svg-axis-label'
      });
      xLabel.textContent = shortDate;
      svg.appendChild(xLabel);
    }
  });

  container.appendChild(svg);
}

function renderHourSvgChart(container, byHour = []) {
  if (!container || !globalThis.document) return;
  container.replaceChildren();

  const hours = Array.from({ length: 24 }, (_, h) => {
    const found = Array.isArray(byHour) ? byHour.find((entry) => Number(entry.hour) === h) : null;
    return {
      hour: h,
      visits: Math.max(0, Number(found?.visits) || 0),
      orders: Math.max(0, Number(found?.orders) || 0)
    };
  });

  const width = 440;
  const height = 220;
  const padLeft = 28;
  const padRight = 12;
  const padTop = 22;
  const padBottom = 38;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const maxActivity = Math.max(1, ...hours.map((h) => h.visits + h.orders));

  // Identify top peak hours
  const peakThreshold = maxActivity * 0.65;

  const svg = createSvgElement('svg', {
    viewBox: `0 0 ${width} ${height}`,
    width: String(width),
    height: String(height),
    preserveAspectRatio: 'xMidYMid meet',
    class: 'insights-svg-chart',
    'aria-hidden': 'true'
  });

  for (const ratio of [0, 0.5, 1]) {
    const y = Math.round(padTop + plotH * (1 - ratio));
    svg.appendChild(
      createSvgElement('line', {
        x1: padLeft,
        y1: y,
        x2: width - padRight,
        y2: y,
        class: 'svg-grid-line'
      })
    );
  }

  const slotW = plotW / 24;
  const barW = Math.max(6, Math.floor(slotW * 0.68));

  hours.forEach((hObj, idx) => {
    const total = hObj.visits + hObj.orders;
    const barH = Math.max(total > 0 ? 3 : 2, Math.round((total / maxActivity) * plotH));
    const x = Math.round(padLeft + idx * slotW + (slotW - barW) / 2);
    const y = padTop + plotH - barH;
    const isPeak = total > 0 && total >= peakThreshold;

    svg.appendChild(
      createSvgElement('rect', {
        x,
        y,
        width: barW,
        height: barH,
        rx: 3,
        class: isPeak ? 'svg-bar-hour-peak' : 'svg-bar-hour'
      })
    );

    if (idx % 3 === 0 || idx === 23) {
      const lbl = createSvgElement('text', {
        x: Math.round(x + barW / 2),
        y: height - 10,
        'text-anchor': 'middle',
        class: 'svg-axis-label'
      });
      lbl.textContent = `${hObj.hour}h`;
      svg.appendChild(lbl);
    }
  });

  container.appendChild(svg);
}

export function renderInsightsPanel(insights) {
  if (!globalThis.document || !insights) return;

  const summary = insights.summary || {};
  if (insightsKpiVisits) {
    insightsKpiVisits.textContent = String(summary.visits ?? 0);
  }
  if (insightsKpiVisitsDelta) {
    const prev = summary.previousVisits ?? 0;
    const diff = (summary.visits ?? 0) - prev;
    insightsKpiVisitsDelta.textContent =
      prev > 0
        ? `${diff >= 0 ? '+' : ''}${Math.round((diff / prev) * 100)}% vs. período anterior (${prev})`
        : `Período anterior: ${prev}`;
    insightsKpiVisitsDelta.classList.toggle('is-positive', diff > 0);
  }

  if (insightsKpiOrders) {
    insightsKpiOrders.textContent = String(summary.orders ?? 0);
  }
  if (insightsKpiOrdersDelta) {
    const prev = summary.previousOrders ?? 0;
    const diff = (summary.orders ?? 0) - prev;
    insightsKpiOrdersDelta.textContent =
      prev > 0
        ? `${diff >= 0 ? '+' : ''}${Math.round((diff / prev) * 100)}% vs. período anterior (${prev})`
        : `Período anterior: ${prev}`;
    insightsKpiOrdersDelta.classList.toggle('is-positive', diff > 0);
  }

  if (insightsKpiConversion) {
    insightsKpiConversion.textContent = formatInsightsPercent(summary.conversionPercent ?? 0);
  }
  if (insightsKpiConversionDelta) {
    insightsKpiConversionDelta.textContent = `Anterior: ${formatInsightsPercent(summary.previousConversionPercent ?? 0)}`;
    insightsKpiConversionDelta.classList.toggle(
      'is-positive',
      (summary.conversionPercent ?? 0) >= (summary.previousConversionPercent ?? 0) &&
        (summary.conversionPercent ?? 0) > 0
    );
  }

  if (insightsKpiEstimated) {
    insightsKpiEstimated.textContent = `${formatInsightsCurrencyBRL(summary.estimatedCents ?? 0)} estimados`;
  }

  if (insightsHighlightsList) {
    insightsHighlightsList.replaceChildren();
    const list =
      Array.isArray(insights.highlights) && insights.highlights.length > 0
        ? insights.highlights
        : ['Nenhum evento registrado neste período.'];
    for (const sentence of list) {
      const li = document.createElement('li');
      li.textContent = sentence;
      insightsHighlightsList.appendChild(li);
    }
  }

  renderInsightsOrigin(globalThis.document.getElementById('insights-origin-card'), insights);
  renderDaySvgChart(insightsDayChartContainer, insights.byDay);
  renderHourSvgChart(insightsHourChartContainer, insights.byHour);

  if (insightsTopItemsList) {
    insightsTopItemsList.replaceChildren();
    const topItems = Array.isArray(insights.topItems) ? insights.topItems : [];
    if (topItems.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-msg';
      empty.textContent = 'Nenhum item visualizado ou selecionado neste período.';
      insightsTopItemsList.appendChild(empty);
    } else {
      topItems.forEach((item, idx) => {
        const row = document.createElement('div');
        row.className = 'insights-rank-row';

        const main = document.createElement('div');
        main.className = 'insights-rank-main';

        const pos = document.createElement('span');
        pos.className = 'insights-rank-pos';
        pos.textContent = `${idx + 1}º`;

        const info = document.createElement('div');
        info.className = 'insights-rank-info';

        const nameStrong = document.createElement('strong');
        nameStrong.textContent = item.name || item.itemId;

        const catSpan = document.createElement('span');
        catSpan.textContent = `${item.categoryName || 'Vitrine'} · ${item.views ?? 0} visualizações`;

        info.appendChild(nameStrong);
        info.appendChild(catSpan);
        main.appendChild(pos);
        main.appendChild(info);

        const metrics = document.createElement('div');
        metrics.className = 'insights-rank-metrics';

        const selPill = document.createElement('span');
        selPill.className = 'insights-metric-pill';
        selPill.textContent = `${item.selections ?? 0} escolhas`;
        metrics.appendChild(selPill);

        if (typeof item.deltaPercent === 'number' && Number.isFinite(item.deltaPercent)) {
          const deltaPill = document.createElement('span');
          deltaPill.className = 'insights-delta-pill';
          const rounded = Math.round(item.deltaPercent);
          deltaPill.textContent = `${rounded >= 0 ? '+' : ''}${rounded}%`;
          metrics.appendChild(deltaPill);
        }

        row.appendChild(main);
        row.appendChild(metrics);
        insightsTopItemsList.appendChild(row);
      });
    }
  }

  if (insightsTopCategoriesList) {
    insightsTopCategoriesList.replaceChildren();
    const topCats = Array.isArray(insights.topCategories) ? insights.topCategories : [];
    if (topCats.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty-msg';
      empty.textContent = 'Nenhuma categoria com seleções registradas neste período.';
      insightsTopCategoriesList.appendChild(empty);
    } else {
      topCats.forEach((cat, idx) => {
        const row = document.createElement('div');
        row.className = 'insights-rank-row';

        const main = document.createElement('div');
        main.className = 'insights-rank-main';

        const pos = document.createElement('span');
        pos.className = 'insights-rank-pos';
        pos.textContent = `${idx + 1}º`;

        const info = document.createElement('div');
        info.className = 'insights-rank-info';

        const nameStrong = document.createElement('strong');
        nameStrong.textContent = cat.name || cat.categoryId;

        info.appendChild(nameStrong);
        main.appendChild(pos);
        main.appendChild(info);

        const metrics = document.createElement('div');
        metrics.className = 'insights-rank-metrics';

        const selPill = document.createElement('span');
        selPill.className = 'insights-metric-pill';
        selPill.textContent = `${cat.selections ?? 0} itens escolhidos`;
        metrics.appendChild(selPill);

        row.appendChild(main);
        row.appendChild(metrics);
        insightsTopCategoriesList.appendChild(row);
      });
    }
  }

  renderInsightsLikes(insights.likes);
}

function formatLikesCount(count) {
  return count === 1 ? '1 curtida' : `${count} curtidas`;
}

function renderInsightsLikes(likes) {
  const data = likes && typeof likes === 'object' ? likes : { total: 0, periodNew: 0, items: [] };
  if (insightsLikesTotal) {
    insightsLikesTotal.textContent = String(data.total ?? 0);
  }
  if (insightsLikesPeriod) {
    insightsLikesPeriod.textContent = `+${data.periodNew ?? 0}`;
  }
  if (!insightsLikesList) return;

  insightsLikesList.replaceChildren();
  const items = Array.isArray(data.items) ? data.items : [];
  if (items.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'empty-msg';
    empty.textContent =
      'Nenhuma curtida ainda. Quando visitantes tocarem no coração de um item da vitrine publicada, o ranking aparece aqui.';
    insightsLikesList.appendChild(empty);
    return;
  }

  items.forEach((item, idx) => {
    const row = document.createElement('div');
    row.className = 'insights-rank-row';

    const main = document.createElement('div');
    main.className = 'insights-rank-main';

    const pos = document.createElement('span');
    pos.className = 'insights-rank-pos';
    pos.textContent = `${idx + 1}º`;

    const info = document.createElement('div');
    info.className = 'insights-rank-info';

    const nameStrong = document.createElement('strong');
    nameStrong.textContent = item.name || item.itemId;

    const catSpan = document.createElement('span');
    catSpan.textContent = item.categoryName || 'Vitrine';

    info.appendChild(nameStrong);
    info.appendChild(catSpan);
    main.appendChild(pos);
    main.appendChild(info);

    const metrics = document.createElement('div');
    metrics.className = 'insights-rank-metrics';

    const likesPill = document.createElement('span');
    likesPill.className = 'insights-metric-pill';
    likesPill.textContent = formatLikesCount(item.likes ?? 0);
    metrics.appendChild(likesPill);

    if ((item.periodLikes ?? 0) > 0) {
      const periodPill = document.createElement('span');
      periodPill.className = 'insights-delta-pill';
      periodPill.textContent = `+${item.periodLikes} no período`;
      metrics.appendChild(periodPill);
    }

    row.appendChild(main);
    row.appendChild(metrics);
    insightsLikesList.appendChild(row);
  });
}


initializePlatformCms(() => {
  if (getSectionFromHash(globalThis.window?.location?.hash) === 'platform-cms') void handleRouting();
});
initializeSponsorImpact(() => {
  if (['impacto', 'profile-gate'].includes(getSectionFromHash(globalThis.window?.location?.hash))) void handleRouting();
});
