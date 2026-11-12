import { loadEditor } from './editor.js';

// State variables
let isOnline = false;
let currentUser = null;
let sites = [];
let activeSite = null;

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

// DOM Elements
const authSection = globalThis.document?.getElementById('auth-section');
const authenticatedApp = globalThis.document?.getElementById('authenticated-app');
const dashboardSection = globalThis.document?.getElementById('dashboard-section');
const editorSection = globalThis.document?.getElementById('editor-section');
const inicioSection = globalThis.document?.getElementById('inicio-section');
const perfilSection = globalThis.document?.getElementById('perfil-section');
const pedidosSection = globalThis.document?.getElementById('pedidos-section');
const wizardSection = globalThis.document?.getElementById('wizard-section');

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
const profileProgressText = globalThis.document?.getElementById('profile-progress-text');
const profileCompletenessBar = globalThis.document?.getElementById('profile-completeness-bar');
const profileMissingFields = globalThis.document?.getElementById('profile-missing-fields');
const vitrinesSummaryText = globalThis.document?.getElementById('vitrines-summary-text');
const hubVitrinesList = globalThis.document?.getElementById('hub-vitrines-list');
const customRequestsSummaryText = globalThis.document?.getElementById('custom-requests-summary-text');
const hubRequestsList = globalThis.document?.getElementById('hub-requests-list');

const googleLoginButton = globalThis.document?.getElementById('google-login-button');
const localDemoButton = globalThis.document?.getElementById('local-demo-button');
const backToDashboardButton = globalThis.document?.getElementById('back-to-dashboard');

// Reserved slugs to block on the client side
const RESERVED_SLUGS = ['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout'];
export const DEFAULT_SUPABASE_URL = 'https://qawlpsrfewosxsfgmmpm.supabase.co';

// Initialize App
globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  setupAppShellNavigation();
  setupProfileChips();
  setupWizardFlow();
  await checkSession();
  if (currentUser) {
    await loadProfile();
    await loadCustomizationRequests();
    updateHubSummary();
    showSection('inicio');
  }
});

// Setup App Shell Navigation
function setupAppShellNavigation() {
  globalThis.document?.querySelectorAll('.nav-link:not(.nav-link-future)').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const section = link.getAttribute('data-section');
      if (section) {
        showSection(section);
      }
    });
  });

  // Hub shortcuts
  globalThis.document?.getElementById('hub-complete-profile-btn')?.addEventListener('click', () => {
    showSection('perfil');
  });
  globalThis.document?.getElementById('hub-create-site-btn')?.addEventListener('click', () => {
    openWizard();
  });
  globalThis.document?.getElementById('hub-new-request-btn')?.addEventListener('click', () => {
    showSection('pedidos');
  });
  wizardOpenBtn?.addEventListener('click', () => {
    openWizard();
  });
}

// Profile Chips setup
function setupProfileChips() {
  interestsChipsContainer?.querySelectorAll('.chip-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const interest = btn.getAttribute('data-interest');
      if (selectedInterests.has(interest)) {
        selectedInterests.delete(interest);
        btn.classList.remove('active');
      } else {
        selectedInterests.add(interest);
        btn.classList.add('active');
      }
    });
  });
}

// Setup Events
function setupEventListeners() {
  // Google OAuth PKCE
  googleLoginButton?.addEventListener('click', async () => {
    try {
      await startGoogleLogin();
    } catch (err) {
      showFeedback('Erro ao iniciar login com Google. Tente novamente ou utilize o Modo Local (Offline).', 'error');
    }
  });

  // Local Demo Mode
  localDemoButton?.addEventListener('click', () => {
    enterLocalDemoMode();
  });

  // Logout
  logoutButton?.addEventListener('click', async () => {
    await handleLogout();
  });

  // Back to Dashboard from Editor
  backToDashboardButton?.addEventListener('click', () => {
    showSection('dashboard');
  });

  // Profile Form Submit
  if (profileForm) {
    profileForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      await handleSaveProfile();
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
      showSection('dashboard');
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
    return handlePkceFailure(
      'Sessão de login expirada ou verificador PKCE ausente. Inicie o login com Google novamente.'
    );
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
    if (typeof storage?.setItem === 'function') {
      storage.setItem('supabase_access_token', accessToken);
    }
    if (demoModeBadge) demoModeBadge.hidden = true;
    if (logoutButton) logoutButton.hidden = false;
    
    onSection('dashboard');
    await loadSitesFn();
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
  const storage = deps.sessionStorage ?? globalThis.sessionStorage;
  try {
    const res = await fetchImpl('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      isOnline = true;
      currentUser = data.user;
      if (typeof storage?.setItem === 'function' && data.token) {
        storage.setItem('supabase_access_token', data.token);
      }
      if (demoModeBadge) demoModeBadge.hidden = true;
      if (logoutButton) logoutButton.hidden = false;
      
      await loadSitesFn();
      onSection('dashboard');
      
      return { ok: true, user: data.user, sites };
    } else if (res.status === 401) {
      isOnline = true;
      if (logoutButton) logoutButton.hidden = true;
      onSection('auth');
      return { ok: false, status: 401 };
    } else {
      fallbackToLocalIfNoSession();
      return { ok: false, status: res.status };
    }
  } catch (err) {
    fallbackToLocalIfNoSession();
    return { ok: false, error: 'network_error' };
  }
}

function fallbackToLocalIfNoSession() {
  isOnline = false;
  const localAuth = globalThis.sessionStorage?.getItem('portal_local_authenticated') === 'true';
  if (localAuth) {
    currentUser = { id: 'local-demo-user' };
    if (demoModeBadge) demoModeBadge.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
    
    loadLocalSites();
    loadLocalProfile();
    loadLocalCustomizationRequests();
    updateHubSummary();
    showSection('inicio');
  } else {
    if (logoutButton) logoutButton.hidden = true;
    showSection('auth');
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
          return { supabaseUrl, publishableKey };
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
      'Configuração de autenticação do Supabase ausente ou indisponível no servidor. Verifique SUPABASE_ANON_KEY ou utilize o Modo Local (Offline).',
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

  const origin = deps.origin ?? globalThis.window?.location?.origin ?? 'http://localhost';
  const redirectUrl = `${origin}/portal/`;
  const googleAuthUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&code_challenge=${challenge}&code_challenge_method=s256&redirect_to=${encodeURIComponent(redirectUrl)}`;

  if (typeof deps.navigate === 'function') {
    deps.navigate(googleAuthUrl);
  } else if (typeof window !== 'undefined' && window.location) {
    window.location.href = googleAuthUrl;
  }
  return googleAuthUrl;
}

// Enter Local Demo Mode
function enterLocalDemoMode() {
  isOnline = false;
  currentUser = { id: 'local-demo-user' };
  sessionStorage.setItem('portal_local_authenticated', 'true');
  demoModeBadge.hidden = false;
  logoutButton.hidden = false;
  showFeedback('Entrou no Modo Local de Demonstração (Offline)', 'success');
  
  loadLocalSites();
  loadLocalProfile();
  loadLocalCustomizationRequests();
  updateHubSummary();
  showSection('inicio');
}

// Handle Logout
async function handleLogout() {
  if (isOnline) {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {
      // Silently ignore
    }
  }

  // Clear local state
  globalThis.sessionStorage?.removeItem('portal_local_authenticated');
  globalThis.sessionStorage?.removeItem('pkce_verifier');
  globalThis.sessionStorage?.removeItem('supabase_publishable_key');
  globalThis.sessionStorage?.removeItem('supabase_access_token');
  currentUser = null;
  sites = [];
  activeSite = null;
  profile = {
    displayName: '',
    businessName: '',
    city: '',
    whatsapp: '',
    interests: []
  };
  customizationRequests = [];
  selectedInterests.clear();
  
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

  if (section !== 'auth') {
    // Show/Hide authenticated content panes
    if (inicioSection) inicioSection.hidden = section !== 'inicio';
    if (dashboardSection) dashboardSection.hidden = section !== 'dashboard';
    if (perfilSection) perfilSection.hidden = section !== 'perfil';
    if (pedidosSection) pedidosSection.hidden = section !== 'pedidos';
    if (wizardSection) wizardSection.hidden = section !== 'wizard';
    if (editorSection) editorSection.hidden = section !== 'editor';

    // Update active nav styling
    globalThis.document?.querySelectorAll('.nav-link').forEach(link => {
      const matches = link.getAttribute('data-section') === section;
      link.classList.toggle('active', matches);
    });

    // Handle Editor exception (hide outer top-bar and nav on small editor views if needed, or keep)
    // For now we keep normal shell layout
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

function syncProfileToForm() {
  if (profileDisplayNameInput) profileDisplayNameInput.value = profile.displayName || '';
  if (profileBusinessNameInput) profileBusinessNameInput.value = profile.businessName || '';
  if (profileCityInput) profileCityInput.value = profile.city || '';
  if (profileWhatsappInput) profileWhatsappInput.value = profile.whatsapp || '';

  selectedInterests.clear();
  const interestsArray = profile.interests || [];
  interestsArray.forEach(interest => {
    selectedInterests.add(interest);
  });

  interestsChipsContainer?.querySelectorAll('.chip-btn').forEach(btn => {
    const interest = btn.getAttribute('data-interest');
    btn.classList.toggle('active', selectedInterests.has(interest));
  });
}

// Save Profile
async function handleSaveProfile() {
  const displayName = profileDisplayNameInput.value.trim();
  const businessName = profileBusinessNameInput.value.trim();
  const city = profileCityInput.value.trim();
  const whatsapp = profileWhatsappInput.value.trim();
  const interests = Array.from(selectedInterests);

  // Validations
  if (whatsapp && !/^[1-9]\d{7,14}$/.test(whatsapp)) {
    profileWhatsappError.hidden = false;
    showFeedback('Digite o número de WhatsApp no formato internacional de dígitos (ex: 5551999999999).', 'error');
    return;
  }
  profileWhatsappError.hidden = true;

  profile = { displayName, businessName, city, whatsapp, interests };
  localStorage.setItem('vitrine_profile', JSON.stringify(profile));

  let savedOnServer = false;
  if (isOnline) {
    try {
      const res = await fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      if (res.ok) {
        savedOnServer = true;
      }
    } catch (err) {
      // Caught gracefully
    }
  }

  updateHubSummary();
  if (savedOnServer) {
    showFeedback('Perfil e interesses salvos com sucesso na nuvem!', 'success');
  } else {
    showFeedback('Perfil e interesses salvos com sucesso no navegador (modo offline).', 'success');
  }
  
  showSection('inicio');
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

// Update Home Dashboard (Início) Summary Cards
function updateHubSummary() {
  // 1. Profile completeness
  let filledFields = 0;
  let missing = [];
  if (profile.displayName) filledFields++; else missing.push('Seu Nome');
  if (profile.businessName) filledFields++; else missing.push('Nome do Negócio');
  if (profile.city) filledFields++; else missing.push('Cidade');
  if (profile.whatsapp && /^[1-9]\d{7,14}$/.test(profile.whatsapp)) filledFields++; else missing.push('WhatsApp válido');
  if (profile.interests && profile.interests.length > 0) filledFields++; else missing.push('Áreas de interesse');

  const completenessPercent = filledFields * 20;
  if (profileProgressText) profileProgressText.textContent = `${completenessPercent}% completo`;
  if (profileCompletenessBar) profileCompletenessBar.value = completenessPercent;

  if (profileMissingFields) {
    if (completenessPercent === 100) {
      profileMissingFields.textContent = 'Parabéns! Seu perfil está completo.';
      profileMissingFields.classList.add('success-text');
      profileMissingFields.classList.remove('soft-text');
    } else {
      profileMissingFields.textContent = `Pendente: ${missing.join(', ')}`;
      profileMissingFields.classList.add('soft-text');
      profileMissingFields.classList.remove('success-text');
    }
  }

  // 2. Vitrines list summary
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
      hubVitrinesList.innerHTML = '<p style="font-size: 13px; color: var(--ink-soft); margin: 0;">Nenhuma vitrine ativa.</p>';
    } else {
      hubVitrinesList.innerHTML = '';
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
      hubRequestsList.innerHTML = '<p style="font-size: 13px; color: var(--ink-soft); margin: 0;">Nenhuma solicitação pendente.</p>';
    } else {
      hubRequestsList.innerHTML = '';
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
    actionBtn.textContent = 'Gerenciar Cardápio';
    actionBtn.addEventListener('click', () => {
      openEditor(site);
    });

    item.appendChild(info);
    item.appendChild(actionBtn);

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
          catalogType
        })
      });

      if (res.status === 201) {
        showFeedback(`Vitrine "${name}" criada com sucesso!`, 'success');
        wizardForm.reset();
        wizardSlugPreview.textContent = 'Endereço: vitrine.inspira.dev.br/loja';
        await loadSites();
        updateHubSummary();
        showSection('dashboard');
      } else if (res.status === 409) {
        showFeedback('Este endereço (slug) já está sendo utilizado por outra vitrine.', 'error');
      } else {
        // Safe 404/501 retry fallback for backwards compatibility when route is not yet fully extended
        const errorData = await res.json().catch(() => null);
        if (res.status === 404 || res.status === 501 || errorData?.error?.code === 'INVALID_TEMPLATE') {
          // Retry with original pizzeria-v1 template
          const retryRes = await fetch('/api/sites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, slug, template: 'pizzeria-v1' })
          });
          if (retryRes.status === 201) {
            showFeedback(`Vitrine "${name}" criada com sucesso (modelo padrão)!`, 'success');
            wizardForm.reset();
            await loadSites();
            updateHubSummary();
            showSection('dashboard');
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
    showSection('dashboard');
  }
}

// Open Catalog Editor screen
function openEditor(site) {
  activeSite = site;
  showSection('editor');
  loadEditor(site, isOnline);
}
