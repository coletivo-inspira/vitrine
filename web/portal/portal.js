import { detectPlatformCms, initializePlatformCms, showPlatformCms } from './platform-cms.js';
import { clearEditor, hasUnsavedDraftChanges, loadEditor } from './editor.js';
import { attachWhatsappMask, extractPhoneDigits, formatWhatsappBR } from './phone-mask.mjs';
import { createInterestsMultiSelect } from './multi-select.mjs';
import { initAuctionsPanel, loadAuctionsPanel, selectAuctionSite } from './auctions-panel.js';

// State variables
let isOnline = false;
let currentUser = null;
let sites = [];
let activeSite = null;

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
let wizardCurrentStep = 1;
let insightsPeriod = '7d';
let insightsSelectedSiteId = null;
let currentInsightsData = null;

// DOM Elements
const authSection = globalThis.document?.getElementById('auth-section');
const authenticatedApp = globalThis.document?.getElementById('authenticated-app');
const vitrinesSection = globalThis.document?.getElementById('vitrines-section');
const insightsSection = globalThis.document?.getElementById('insights-section');
const leiloesSection = globalThis.document?.getElementById('leiloes-section');
const editorSection = globalThis.document?.getElementById('editor-section');
const inicioSection = globalThis.document?.getElementById('inicio-section');
const perfilSection = globalThis.document?.getElementById('perfil-section');
const pedidosSection = globalThis.document?.getElementById('pedidos-section');
const wizardSection = globalThis.document?.getElementById('wizard-section');
const profileGateSection = globalThis.document?.getElementById('profile-gate-section');

const demoModeBadge = globalThis.document?.getElementById('demo-mode-badge');
const logoutButton = globalThis.document?.getElementById('logout-button');
const globalFeedback = globalThis.document?.getElementById('global-feedback');
const sitesListContainer = globalThis.document?.getElementById('sites-list-container');

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

// Wizard DOM Elements
const wizardForm = globalThis.document?.getElementById('wizard-form');
const wizardSiteNameInput = globalThis.document?.getElementById('wizard-site-name');
const wizardSiteSlugInput = globalThis.document?.getElementById('wizard-site-slug');
const wizardSlugPreview = globalThis.document?.getElementById('wizard-slug-preview');
const wizardSlugValidationError = globalThis.document?.getElementById('wizard-slug-validation-error');
const wizardOpenBtn = globalThis.document?.getElementById('wizard-open-btn');

// Hub DOM Elements
const vitrinesSummaryText = globalThis.document?.getElementById('vitrines-summary-text');
const hubVitrinesList = globalThis.document?.getElementById('hub-vitrines-list');
const customRequestsSummaryText = globalThis.document?.getElementById('custom-requests-summary-text');
const hubRequestsList = globalThis.document?.getElementById('hub-requests-list');
const hubInsightsHighlightText = globalThis.document?.getElementById('hub-insights-highlight-text');
const hubInsightsStatsList = globalThis.document?.getElementById('hub-insights-stats-list');

let profileInterestsMultiSelect = null;
let gateInterestsMultiSelect = null;

// Insights DOM Elements
const insightsSiteSelect = globalThis.document?.getElementById('insights-site-select');
const insightsHighlightsList = globalThis.document?.getElementById('insights-highlights-list');
const insightsKpiVisits = globalThis.document?.getElementById('insights-kpi-visits');
const insightsKpiVisitsDelta = globalThis.document?.getElementById('insights-kpi-visits-delta');
const insightsKpiOrders = globalThis.document?.getElementById('insights-kpi-orders');
const insightsKpiOrdersDelta = globalThis.document?.getElementById('insights-kpi-orders-delta');
const insightsKpiConversion = globalThis.document?.getElementById('insights-kpi-conversion');
const insightsKpiConversionDelta = globalThis.document?.getElementById('insights-kpi-conversion-delta');
const insightsKpiEstimated = globalThis.document?.getElementById('insights-kpi-estimated');
const insightsKpiEstimatedDelta = globalThis.document?.getElementById('insights-kpi-estimated-delta');
const insightsDayChartContainer = globalThis.document?.getElementById('insights-day-chart-container');
const insightsHourChartContainer = globalThis.document?.getElementById('insights-hour-chart-container');
const insightsTopItemsList = globalThis.document?.getElementById('insights-top-items-list');
const insightsTopCategoriesList = globalThis.document?.getElementById('insights-top-categories-list');
const insightsLikesTotal = globalThis.document?.getElementById('insights-likes-total');
const insightsLikesPeriod = globalThis.document?.getElementById('insights-likes-period');
const insightsLikesList = globalThis.document?.getElementById('insights-likes-list');

const googleLoginButton = globalThis.document?.getElementById('google-login-button');
const localDemoButton = globalThis.document?.getElementById('local-demo-button');
const backToDashboardButton = globalThis.document?.getElementById('back-to-dashboard');

// Reserved slugs to block on the client side
const RESERVED_SLUGS = ['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout'];
export const DEFAULT_SUPABASE_URL = 'https://qawlpsrfewosxsfgmmpm.supabase.co';

export function getSectionFromHash(hash) {
  const hashToSection = {
    '#inicio': 'inicio',
    '#vitrines': 'vitrines',
    '#dashboard': 'vitrines',
    '#insights': 'insights',
    '#leiloes': 'leiloes',
    '#perfil': 'perfil',
    '#pedidos': 'pedidos',
    '#wizard': 'wizard',
    '#editor': 'editor',
    '#profile-gate': 'profile-gate'
  };
  return hashToSection[hash] || 'inicio';
}

export function isProfileComplete() {
  return !!(profile && profile.displayName && profile.businessName && profile.city && profile.whatsapp && /^[1-9]\d{7,14}$/.test(profile.whatsapp));
}

export function handleRouting() {
  if (!currentUser) {
    showSection('auth');
    return;
  }

  const complete = isProfileComplete();
  const hash = globalThis.window?.location?.hash || '';
  let section = getSectionFromHash(hash);

  if (!complete) {
    section = 'profile-gate';
    if (globalThis.window && globalThis.window.location.hash !== '#profile-gate') {
      globalThis.window.location.hash = '#profile-gate';
      return;
    }
  } else {
    if (section === 'profile-gate') {
      section = 'inicio';
      if (globalThis.window) {
        globalThis.window.location.hash = '#inicio';
        return;
      }
    }
  }

  if (section === 'editor' && !activeSite) {
    if (globalThis.window) {
      globalThis.window.location.hash = '#vitrines';
    }
    return;
  }
  
  if (section === 'wizard') {
    openWizard();
    return;
  }

  // Set hash if it's empty to keep deep links consistent and trigger onSection/showSection
  if (globalThis.window && !globalThis.window.location.hash && section === 'inicio') {
    globalThis.window.location.hash = '#inicio';
    return;
  }

  showSection(section);
}

function setupHashRouting() {
  globalThis.window?.addEventListener('hashchange', () => {
    handleRouting();
  });
}

// Initialize App
globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupAppShellNavigation();
  setupProfileChips();
  setupWizardFlow();
  setupInsightsControls();
  initAuctionsPanel({ getSites: () => sites, isOnline: () => isOnline });
  setupHashRouting();
  await checkSession();
  if (currentUser) {
    await loadProfile();
    await loadCustomizationRequests();
    await loadInsightsForActiveSite();
    updateHubSummary();
    handleRouting();
  }
});

// Setup App Shell Navigation
function setupAppShellNavigation() {
  globalThis.document?.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const hash = link.getAttribute('href');
      if (hash && globalThis.window) {
        globalThis.window.location.hash = hash;
      }
    });
  });

  // Hub shortcuts
  globalThis.document?.getElementById('hub-create-site-btn')?.addEventListener('click', () => {
    if (globalThis.window) globalThis.window.location.hash = '#wizard';
  });
  globalThis.document?.getElementById('hub-new-request-btn')?.addEventListener('click', () => {
    if (globalThis.window) globalThis.window.location.hash = '#pedidos';
  });
  globalThis.document?.getElementById('hub-open-insights-btn')?.addEventListener('click', () => {
    if (globalThis.window) globalThis.window.location.hash = '#insights';
  });
  wizardOpenBtn?.addEventListener('click', () => {
    if (globalThis.window) globalThis.window.location.hash = '#wizard';
  });
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

  // Back to Dashboard from Editor
  backToDashboardButton?.addEventListener('click', () => {
    if (globalThis.window) globalThis.window.location.hash = '#vitrines';
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

// 3-Step Wizard Flow setup
function setupWizardFlow() {
  const wizardFormEl = globalThis.document?.getElementById('wizard-form');

  // Cancel Buttons
  globalThis.document?.querySelectorAll('.wizard-cancel-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (globalThis.window) globalThis.window.location.hash = '#vitrines';
    });
  });

  // Next Buttons
  wizardSection?.querySelectorAll('.wizard-next-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (wizardCurrentStep === 1) {
        // Area selection
        goToWizardStep(2);
      } else if (wizardCurrentStep === 2) {
        // Model selection
        const model = wizardFormEl.elements['wizard-model'].value;
        if (model === 'custom') {
          // Redirect to Customization Request with pre-fill!
          const area = wizardFormEl.elements['wizard-area'].value;
          requestStorefrontTypeSelect.value = area;
          requestTemplateInterestInput.value = 'Modelo Personalizado';
          requestGoalInput.value = `Gostaria de um modelo personalizado de vitrine para o segmento de ${getAreaLabel(area)}.`;
          requestDesiredDeadlineInput.value = '';
          requestReferenceUrlsInput.value = '';
          
          showSection('pedidos');
          showFeedback('Preencha os detalhes do seu pedido personalizado abaixo.', 'success');
        } else {
          goToWizardStep(3);
        }
      }
    });
  });

  // Prev Buttons
  wizardSection?.querySelectorAll('.wizard-prev-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      goToWizardStep(wizardCurrentStep - 1);
    });
  });

  // Reactive Slug Input in Wizard
  wizardSiteSlugInput?.addEventListener('input', () => {
    const rawVal = wizardSiteSlugInput.value;
    const cleaned = rawVal.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (rawVal !== cleaned) {
      wizardSiteSlugInput.value = cleaned;
    }
    validateWizardSlug(wizardSiteSlugInput.value);
  });

  // Automatic Slug generation on Name input
  wizardSiteNameInput?.addEventListener('input', () => {
    const name = wizardSiteNameInput.value;
    const suggestedSlug = name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // remove accents
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');
    wizardSiteSlugInput.value = suggestedSlug.substring(0, 40);
    validateWizardSlug(wizardSiteSlugInput.value);
  });

  // Wizard Form Submit
  if (wizardForm) {
    wizardForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleCreateWizardSite();
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

function openWizard() {
  wizardSiteNameInput.value = profile.businessName || '';
  if (profile.businessName) {
    wizardSiteNameInput.dispatchEvent(new Event('input'));
  } else {
    wizardSiteSlugInput.value = '';
    wizardSlugPreview.textContent = 'Endereço: vitrine.inspira.dev.br/sua-loja';
    wizardSlugValidationError.hidden = true;
  }
  goToWizardStep(1);
  showSection('wizard');
}

function goToWizardStep(step) {
  wizardCurrentStep = step;
  
  // Show/Hide step panes
  globalThis.document?.getElementById('wizard-step-1').toggleAttribute('hidden', step !== 1);
  globalThis.document?.getElementById('wizard-step-2').toggleAttribute('hidden', step !== 2);
  globalThis.document?.getElementById('wizard-step-3').toggleAttribute('hidden', step !== 3);

  // Update steps indicator classes
  globalThis.document?.getElementById('step-ind-1')?.classList.toggle('active', step >= 1);
  globalThis.document?.getElementById('step-ind-2')?.classList.toggle('active', step >= 2);
  globalThis.document?.getElementById('step-ind-3')?.classList.toggle('active', step >= 3);
}

function validateWizardSlug(slug) {
  wizardSlugPreview.textContent = `Endereço: vitrine.inspira.dev.br/${slug || 'sua-loja'}`;

  if (!slug) {
    wizardSlugValidationError.hidden = true;
    return false;
  }

  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug)) {
    wizardSlugValidationError.textContent = 'O endereço deve conter apenas letras minúsculas, números e hífens, sem hífens consecutivos ou nas extremidades.';
    wizardSlugValidationError.hidden = false;
    return false;
  }

  if (slug.length < 3 || slug.length > 40) {
    wizardSlugValidationError.textContent = 'O endereço deve ter entre 3 e 40 caracteres.';
    wizardSlugValidationError.hidden = false;
    return false;
  }

  if (RESERVED_SLUGS.includes(slug)) {
    wizardSlugValidationError.textContent = 'Este endereço é reservado pelo sistema.';
    wizardSlugValidationError.hidden = false;
    return false;
  }

  wizardSlugValidationError.hidden = true;
  return true;
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
  currentUser = null;
  void detectPlatformCms(false);
  sites = [];
  activeSite = null;
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

// Section Switching with sidebar/bottom-nav integration
export function showSection(section) {
  // Toggle Auth section
  if (authSection) authSection.hidden = section !== 'auth';
  if (authenticatedApp) authenticatedApp.hidden = section === 'auth';
  showPlatformCms(section === 'platform-cms');

  if (section !== 'auth') {
    // Show/Hide authenticated content panes
    if (inicioSection) inicioSection.hidden = section !== 'inicio';
    if (vitrinesSection) vitrinesSection.hidden = section !== 'vitrines';
    if (insightsSection) insightsSection.hidden = section !== 'insights';
    if (leiloesSection) leiloesSection.hidden = section !== 'leiloes';
    if (perfilSection) perfilSection.hidden = section !== 'perfil';
    if (pedidosSection) pedidosSection.hidden = section !== 'pedidos';
    if (wizardSection) wizardSection.hidden = section !== 'wizard';
    if (editorSection) editorSection.hidden = section !== 'editor';
    if (profileGateSection) profileGateSection.hidden = section !== 'profile-gate';

    // Update active nav styling
    globalThis.document?.querySelectorAll('.nav-link').forEach(link => {
      const matches = link.getAttribute('data-section') === section;
      link.classList.toggle('active', matches);
    });

    if (section === 'insights') {
      syncInsightsSiteSelector();
      loadInsightsForActiveSite();
    }
    if (section === 'leiloes') {
      void loadAuctionsPanel();
    }
  }
}

// Show Feedback Messages
export function showFeedback(msg, type = 'success') {
  const feedbackEl = isOnline ? 
    (globalThis.document?.getElementById('shell-global-feedback') || globalFeedback) : 
    (globalFeedback || globalThis.document?.getElementById('shell-global-feedback'));

  if (feedbackEl) {
    feedbackEl.textContent = msg;
    feedbackEl.className = `feedback-banner ${type}`;
    feedbackEl.hidden = false;
    setTimeout(() => {
      feedbackEl.hidden = true;
    }, 6000);
  }

  if (typeof globalThis.window?.scrollTo === 'function') {
    globalThis.window.scrollTo({ top: 0, behavior: 'smooth' });
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

export function prefillProfileWithGoogleCredentials(userOverride = currentUser, profileTarget = profile) {
  const userObj = userOverride ?? currentUser;
  if (!userObj) return;
  
  const googleName = userObj.user_metadata?.full_name || userObj.user_metadata?.name || '';
  const googleAvatar = userObj.user_metadata?.avatar_url || userObj.user_metadata?.picture || '';
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
              placeholderDiv.textContent = (googleName || googleEmail || 'U')[0].toUpperCase();
            }
          });
        }
      }
      if (placeholderDiv) placeholderDiv.hidden = true;
    } else {
      if (avatarImg) avatarImg.hidden = true;
      if (placeholderDiv) {
        placeholderDiv.hidden = false;
        placeholderDiv.textContent = (googleName || googleEmail || 'U')[0].toUpperCase();
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

  updateHubSummary();
  if (savedOnServer) {
    showFeedback('Perfil criado com sucesso na nuvem!', 'success');
    if (globalThis.window) {
      globalThis.window.location.hash = '#inicio';
    }
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

  updateHubSummary();
  if (savedOnServer) {
    showFeedback('Perfil e interesses salvos com sucesso na nuvem!', 'success');
    showSection('inicio');
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
    waBtn.textContent = 'Conversar no WhatsApp 💬';

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
  updateHubSummary();

  if (savedOnServer) {
    showFeedback('Pedido de customização registrado com sucesso!', 'success');
  } else {
    showFeedback('Pedido registrado com sucesso no navegador (modo offline).', 'success');
  }
}

function updateOnboardingChecklist() {
  const checklistCard = globalThis.document?.getElementById('onboarding-checklist-card');
  if (!checklistCard) return;

  const profileComplete = isProfileComplete();
  const hasSite = sites.length > 0;
  
  // Check if published from localStorage
  let isPublished = localStorage.getItem('vitrine_has_published') === 'true';

  const itemProfile = globalThis.document?.getElementById('checklist-item-profile');
  const itemCreate = globalThis.document?.getElementById('checklist-item-create');
  const itemPublish = globalThis.document?.getElementById('checklist-item-publish');

  const updateChecklistItem = (el, done) => {
    if (!el) return;
    el.classList.toggle('done', done);
    const icon = el.querySelector('.checklist-status-icon');
    if (icon) {
      icon.textContent = done ? '✓' : '○';
    }
  };

  updateChecklistItem(itemProfile, profileComplete);
  updateChecklistItem(itemCreate, hasSite);
  updateChecklistItem(itemPublish, isPublished);

  checklistCard.hidden = false;
}

// Update Home Dashboard (Início) Summary Cards
function updateHubSummary() {
  // Update onboarding checklist
  updateOnboardingChecklist();

  // 1. Vitrines list summary
  if (vitrinesSummaryText) {
    if (sites.length === 0) {
      vitrinesSummaryText.textContent = 'Você não possui nenhuma vitrine cadastrada.';
    } else if (sites.length === 1) {
      vitrinesSummaryText.textContent = 'Você possui 1 vitrine cadastrada.';
    } else {
      vitrinesSummaryText.textContent = `Você possui ${sites.length} vitrines cadastradas.`;
    }
  }
  if (hubVitrinesList) {
    if (sites.length === 0) {
      hubVitrinesList.replaceChildren();
      const emptyP = document.createElement('p');
      emptyP.className = 'soft-text';
      emptyP.textContent = 'Nenhuma vitrine ativa.';
      hubVitrinesList.appendChild(emptyP);
    } else {
      hubVitrinesList.replaceChildren();
      sites.slice(0, 3).forEach(site => {
        const item = document.createElement('div');
        item.className = 'hub-list-item';
        
        const title = document.createElement('strong');
        title.textContent = site.name;
        
        const badge = document.createElement('span');
        badge.textContent = site.role === 'owner' ? 'Proprietário' : 'Colaborador';

        item.appendChild(title);
        item.appendChild(badge);
        hubVitrinesList.appendChild(item);
      });
    }
  }

  // 3. Customization Requests summary
  if (customRequestsSummaryText) {
    if (customizationRequests.length === 0) {
      customRequestsSummaryText.textContent = 'Nenhum pedido enviado ao coletivo.';
    } else if (customizationRequests.length === 1) {
      customRequestsSummaryText.textContent = '1 pedido enviado ao coletivo.';
    } else {
      customRequestsSummaryText.textContent = `${customizationRequests.length} pedidos enviados ao coletivo.`;
    }
  }
  if (hubRequestsList) {
    if (customizationRequests.length === 0) {
      hubRequestsList.replaceChildren();
      const emptyReqP = document.createElement('p');
      emptyReqP.className = 'soft-text';
      emptyReqP.textContent = 'Nenhuma solicitação pendente.';
      hubRequestsList.appendChild(emptyReqP);
    } else {
      hubRequestsList.replaceChildren();
      customizationRequests.slice(0, 2).forEach(req => {
        const item = document.createElement('div');
        item.className = 'hub-list-item';
        
        const title = document.createElement('strong');
        title.textContent = req.templateInterest || 'Customização';
        
        const badge = document.createElement('span');
        badge.textContent = getRequestStatusLabel(req.status);

        item.appendChild(title);
        item.appendChild(badge);
        hubRequestsList.appendChild(item);
      });
    }
  }

  // 4. Insights Weekly Highlight Card on Home Dashboard
  renderHubInsightsCard(currentInsightsData);
}

// Load Sites (Online / Offline)
async function loadSites(fetchImpl = globalThis.fetch) {
  if (sitesListContainer) {
    sitesListContainer.innerHTML = '<p class="loading-msg">Carregando vitrines...</p>';
  }
  try {
    const res = await fetchImpl('/api/sites');
    if (res.ok) {
      const data = await res.json();
      sites = data.sites || [];
      if (sitesListContainer && globalThis.document) {
        renderSites();
      }
    } else {
      showFeedback('Erro ao carregar vitrines do servidor.', 'error');
    }
  } catch (err) {
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

function renderSites() {
  if (!sitesListContainer) return;

  if (sites.length === 0) {
    sitesListContainer.innerHTML = '<p class="empty-msg">Nenhuma vitrine ativa cadastrada.</p>';
    return;
  }

  sitesListContainer.innerHTML = '';
  sites.forEach(site => {
    const item = document.createElement('div');
    item.className = 'site-item';

    const info = document.createElement('div');
    info.className = 'site-item-info';
    
    const title = document.createElement('h3');
    title.textContent = site.name;
    
    const link = document.createElement('p');
    link.textContent = `vitrine.inspira.dev.br/${site.slug}`;

    const badge = document.createElement('span');
    badge.className = 'site-role-badge';
    badge.textContent = site.role === 'owner' ? 'Proprietário' : 'Colaborador';

    info.appendChild(title);
    info.appendChild(link);
    info.appendChild(badge);

    const actionBtn = document.createElement('button');
    actionBtn.className = 'button button-small button-secondary button-pill';
    actionBtn.type = 'button';
    actionBtn.textContent = 'Editar vitrine';
    actionBtn.addEventListener('click', () => {
      openEditor(site);
    });

    const actions = document.createElement('div');
    actions.className = 'site-item-actions';
    actions.appendChild(actionBtn);
    if (site.role === 'owner' || site.role === 'admin') {
      const auctionsBtn = document.createElement('button');
      auctionsBtn.className = 'button button-small button-secondary button-pill';
      auctionsBtn.type = 'button';
      auctionsBtn.textContent = 'Leilões';
      auctionsBtn.addEventListener('click', () => {
        selectAuctionSite(site.id);
        if (globalThis.window) globalThis.window.location.hash = '#leiloes';
      });
      actions.appendChild(auctionsBtn);
    }

    item.appendChild(info);
    item.appendChild(actions);

    sitesListContainer.appendChild(item);
  });
}

// Handle Wizard site creation
async function handleCreateWizardSite() {
  const name = wizardSiteNameInput.value.trim();
  const slug = wizardSiteSlugInput.value.trim();
  const area = wizardForm.elements['wizard-area'].value;
  const model = wizardForm.elements['wizard-model'].value;

  if (!name) {
    showFeedback('Digite o nome do negócio.', 'error');
    return;
  }

  if (!validateWizardSlug(slug)) {
    showFeedback('Verifique o endereço da vitrine fornecido.', 'error');
    return;
  }

  // Determine template based on selected model
  let template = 'pizzeria-v1';
  let catalogType = 'products';
  if (model === 'booking') {
    template = 'booking-v1';
    catalogType = 'booking';
  } else if (model === 'quote') {
    template = 'quote-v1';
    catalogType = 'quote';
  } else if (model === 'products') {
    template = 'products-v1';
    catalogType = 'products';
  }

  if (isOnline) {
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          slug,
          storefrontType: area,
          template,
          catalogType,
          whatsapp: profile.whatsapp
        })
      });

      if (res.status === 201) {
        showFeedback(`Vitrine "${name}" criada com sucesso!`, 'success');
        wizardForm.reset();
        wizardSlugPreview.textContent = 'Endereço: vitrine.inspira.dev.br/loja';
        await loadSites();
        updateHubSummary();
        if (globalThis.window) globalThis.window.location.hash = '#vitrines';
      } else if (res.status === 409) {
        const errorData = await res.json().catch(() => null);
        if (errorData?.error?.code === 'PROFILE_INCOMPLETE') {
          showFeedback('Por favor, preencha todos os campos do seu perfil antes de criar sua vitrine.', 'error');
          profile.displayName = ''; // force incomplete
          handleRouting();
        } else {
          showFeedback('Este endereço (slug) já está sendo utilizado por outra vitrine.', 'error');
        }
      } else {
        // Safe 404/501 retry fallback for backwards compatibility when route is not yet fully extended
        const errorData = await res.json().catch(() => null);
        if (res.status === 404 || res.status === 501 || errorData?.error?.code === 'INVALID_TEMPLATE') {
          // Retry with original pizzeria-v1 template
          const retryRes = await fetch('/api/sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, slug, template: 'pizzeria-v1', whatsapp: profile.whatsapp })
          });
          if (retryRes.status === 201) {
            showFeedback(`Vitrine "${name}" criada com sucesso (modelo padrão)!`, 'success');
            wizardForm.reset();
            await loadSites();
            updateHubSummary();
            if (globalThis.window) globalThis.window.location.hash = '#vitrines';
            return;
          }
        }
        showFeedback(errorData?.error?.message || 'Erro ao criar vitrine.', 'error');
      }
    } catch (err) {
      showFeedback('Erro de rede ao criar vitrine.', 'error');
    }
  } else {
    // Local creation
    const duplicate = sites.some(s => s.slug === slug);
    if (duplicate) {
      showFeedback('Este endereço (slug) já está sendo utilizado por outra vitrine local.', 'error');
      return;
    }

    const newId = `local-site-${Date.now()}`;
    const newSite = {
      id: newId,
      slug,
      name,
      template,
      role: "owner",
      updatedAt: new Date().toISOString()
    };

    sites.push(newSite);
    localStorage.setItem('vitrine_local_sites', JSON.stringify(sites));

    // Create default local draft matching selected template
    const defaultDraft = {
      siteId: newId,
      revision: 1,
      updatedAt: new Date().toISOString(),
      content: {
        schemaVersion: 1,
        template,
        slug,
        businessName: name,
        whatsapp: profile.whatsapp || "5511999999999",
        categories: []
      }
    };
    localStorage.setItem(`vitrine_local_draft_${newId}`, JSON.stringify(defaultDraft));

    showFeedback(`Vitrine "${name}" criada com sucesso no modo local!`, 'success');
    wizardForm.reset();
    wizardSlugPreview.textContent = 'Endereço: vitrine.inspira.dev.br/loja';
    
    loadLocalSites();
    updateHubSummary();
    if (globalThis.window) globalThis.window.location.hash = '#vitrines';
  }
}

// Open Catalog Editor screen
function openEditor(site) {
  if (activeSite?.id === site.id && !editorSection?.hidden) {
    return;
  }
  if (hasUnsavedDraftChanges() && !globalThis.window.confirm('Trocar de vitrine e descartar as alterações ainda não salvas?')) {
    return;
  }
  activeSite = site;
  if (globalThis.window && globalThis.window.location.hash !== '#editor') {
    globalThis.window.location.hash = '#editor';
  }
  void loadEditor(site, isOnline);
}

// ==========================================
// Insights Panel & Weekly Highlight Logic
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
  if (insightsSiteSelect) {
    insightsSiteSelect.addEventListener('change', () => {
      insightsSelectedSiteId = insightsSiteSelect.value;
      loadInsightsForActiveSite();
    });
  }

  globalThis.document?.querySelectorAll('.insights-period-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextPeriod = btn.getAttribute('data-period') || '7d';
      insightsPeriod = nextPeriod;
      globalThis.document?.querySelectorAll('.insights-period-btn').forEach((b) => {
        const isCurrent = b.getAttribute('data-period') === nextPeriod;
        b.classList.toggle('active', isCurrent);
        b.setAttribute('aria-pressed', isCurrent ? 'true' : 'false');
      });
      loadInsightsForActiveSite();
    });
  });
}

function syncInsightsSiteSelector() {
  if (!insightsSiteSelect || !globalThis.document) return;
  insightsSiteSelect.replaceChildren();

  if (!Array.isArray(sites) || sites.length === 0) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'Nenhuma vitrine cadastrada';
    insightsSiteSelect.appendChild(opt);
    insightsSelectedSiteId = null;
    return;
  }

  if (!insightsSelectedSiteId || !sites.some((s) => s.id === insightsSelectedSiteId)) {
    insightsSelectedSiteId = sites[0].id;
  }

  for (const site of sites) {
    const opt = document.createElement('option');
    opt.value = site.id;
    opt.textContent = `${site.name} (/${site.slug})`;
    opt.selected = site.id === insightsSelectedSiteId;
    insightsSiteSelect.appendChild(opt);
  }
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

export async function loadInsightsForActiveSite(fetchImpl = globalThis.fetch) {
  syncInsightsSiteSelector();
  const targetSiteId = insightsSelectedSiteId || sites[0]?.id || 'demo-site-pastus';

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
          currentInsightsData = body.insights;
          renderInsightsPanel(currentInsightsData);
          renderHubInsightsCard(currentInsightsData);
          return currentInsightsData;
        }
      }
    } catch {
      // Fallback to empty dataset
    }
  }

  currentInsightsData = getEmptyInsightsDataset();
  renderInsightsPanel(currentInsightsData);
  renderHubInsightsCard(currentInsightsData);
  return currentInsightsData;
}

function renderHubInsightsCard(insights) {
  if (!hubInsightsHighlightText || !hubInsightsStatsList || !globalThis.document) return;
  const data = insights || getEmptyInsightsDataset();
  const firstHighlight =
    Array.isArray(data.highlights) && data.highlights.length > 0
      ? data.highlights[0]
      : 'Acompanhe visitas, pedidos no WhatsApp e itens mais escolhidos da sua vitrine.';

  hubInsightsHighlightText.textContent = firstHighlight;
  hubInsightsStatsList.replaceChildren();

  const rows = [
    {
      label: 'Visitas (7 dias)',
      badge: `${data.summary?.visits ?? 0} acessos`
    },
    {
      label: 'Pedidos no WhatsApp',
      badge: `${data.summary?.orders ?? 0} (${formatInsightsPercent(data.summary?.conversionPercent ?? 0)})`
    },
    {
      label: 'Valor estimado',
      badge: formatInsightsCurrencyBRL(data.summary?.estimatedCents ?? 0)
    }
  ];

  for (const r of rows) {
    const item = document.createElement('div');
    item.className = 'hub-list-item';

    const strong = document.createElement('strong');
    strong.textContent = r.label;

    const span = document.createElement('span');
    span.textContent = r.badge;

    item.appendChild(strong);
    item.appendChild(span);
    hubInsightsStatsList.appendChild(item);
  }
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
    insightsKpiEstimated.textContent = formatInsightsCurrencyBRL(summary.estimatedCents ?? 0);
  }
  if (insightsKpiEstimatedDelta) {
    insightsKpiEstimatedDelta.textContent = `Anterior: ${formatInsightsCurrencyBRL(summary.previousEstimatedCents ?? 0)}`;
    insightsKpiEstimatedDelta.classList.toggle(
      'is-positive',
      (summary.estimatedCents ?? 0) > (summary.previousEstimatedCents ?? 0)
    );
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


initializePlatformCms(() => showSection('platform-cms'));
