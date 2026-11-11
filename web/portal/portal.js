import { loadEditor } from './editor.js';

// State variables
let isOnline = false;
let currentUser = null;
let sites = [];
let activeSite = null;

// DOM Elements
const authSection = globalThis.document?.getElementById('auth-section');
const dashboardSection = globalThis.document?.getElementById('dashboard-section');
const editorSection = globalThis.document?.getElementById('editor-section');
const demoModeBadge = globalThis.document?.getElementById('demo-mode-badge');
const logoutButton = globalThis.document?.getElementById('logout-button');
const globalFeedback = globalThis.document?.getElementById('global-feedback');
const sitesListContainer = globalThis.document?.getElementById('sites-list-container');
const createSiteForm = globalThis.document?.getElementById('create-site-form');
const newSiteNameInput = globalThis.document?.getElementById('new-site-name');
const newSiteSlugInput = globalThis.document?.getElementById('new-site-slug');
const slugPreview = globalThis.document?.getElementById('slug-preview');
const slugValidationError = globalThis.document?.getElementById('slug-validation-error');
const googleLoginButton = globalThis.document?.getElementById('google-login-button');
const localDemoButton = globalThis.document?.getElementById('local-demo-button');
const backToDashboardButton = globalThis.document?.getElementById('back-to-dashboard');

// Reserved slugs to block on the client side
const RESERVED_SLUGS = ['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout'];
export const DEFAULT_SUPABASE_URL = 'https://qawlpsrfewosxsfgmmpm.supabase.co';

// Initialize App
globalThis.document?.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkSession();
});

// Setup Events
function setupEventListeners() {
  // Google OAuth PKCE
  googleLoginButton.addEventListener('click', async () => {
    try {
      await startGoogleLogin();
    } catch (err) {
      showFeedback('Erro ao iniciar login com Google. Tente novamente ou utilize o Modo Local (Offline).', 'error');
    }
  });

  // Local Demo Mode
  localDemoButton.addEventListener('click', () => {
    enterLocalDemoMode();
  });

  // Logout
  logoutButton.addEventListener('click', async () => {
    await handleLogout();
  });

  // Back to Dashboard
  backToDashboardButton.addEventListener('click', () => {
    showSection('dashboard');
  });

  // Reactive Slug Input
  newSiteSlugInput.addEventListener('input', () => {
    const rawVal = newSiteSlugInput.value;
    // Autoclean uppercase and whitespace, but let them type
    const cleaned = rawVal.toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (rawVal !== cleaned) {
      newSiteSlugInput.value = cleaned;
    }
    validateSlug(newSiteSlugInput.value);
  });

  // Create Site Submit
  createSiteForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await handleCreateSite();
  });
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
      // Fall through to search string check
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
  try {
    const res = await fetchImpl('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      isOnline = true;
      currentUser = data.user;
      if (demoModeBadge) demoModeBadge.hidden = true;
      if (logoutButton) logoutButton.hidden = false;
      onSection('dashboard');
      await loadSitesFn();
      return { ok: true, user: data.user, sites };
    } else if (res.status === 401) {
      isOnline = true;
      if (logoutButton) logoutButton.hidden = true;
      onSection('auth');
      return { ok: false, status: 401 };
    } else {
      // Other status (like 404) implies offline static preview
      fallbackToLocalIfNoSession();
      return { ok: false, status: res.status };
    }
  } catch (err) {
    // Network error implies offline static preview
    fallbackToLocalIfNoSession();
    return { ok: false, error: 'network_error' };
  }
}

function fallbackToLocalIfNoSession() {
  isOnline = false;
  // Check if already authenticated in local storage
  const localAuth = globalThis.sessionStorage?.getItem('portal_local_authenticated') === 'true';
  if (localAuth) {
    currentUser = { id: 'local-demo-user' };
    if (demoModeBadge) demoModeBadge.hidden = false;
    if (logoutButton) logoutButton.hidden = false;
    showSection('dashboard');
    loadLocalSites();
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
      // Fall through to window fallback check
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
  showSection('dashboard');
  loadLocalSites();
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
  currentUser = null;
  sites = [];
  activeSite = null;
  
  if (demoModeBadge) demoModeBadge.hidden = true;
  if (logoutButton) logoutButton.hidden = true;
  showFeedback('Sessão encerrada com sucesso.', 'success');
  showSection('auth');
}

// Section Switching
function showSection(section) {
  if (authSection) authSection.hidden = section !== 'auth';
  if (dashboardSection) dashboardSection.hidden = section !== 'dashboard';
  if (editorSection) editorSection.hidden = section !== 'editor';
}

// Show Feedback Messages
export function showFeedback(msg, type = 'success') {
  const feedbackEl = globalFeedback ?? globalThis.document?.getElementById('global-feedback');
  if (feedbackEl) {
    feedbackEl.textContent = msg;
    feedbackEl.className = `feedback-banner ${type}`;
    feedbackEl.hidden = false;
    setTimeout(() => {
      feedbackEl.hidden = true;
    }, 6000);
  }

  // Auto-scroll to top to let user see feedback
  if (typeof globalThis.window?.scrollTo === 'function') {
    globalThis.window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Slug validation reactive rules
function validateSlug(slug) {
  slugPreview.textContent = `Endereço: vitrine.inspira.dev.br/${slug || 'sua-loja'}`;

  if (!slug) {
    slugValidationError.hidden = true;
    return false;
  }

  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  if (!slugRegex.test(slug)) {
    slugValidationError.textContent = 'O endereço deve conter apenas letras minúsculas, números e hífens, sem hífens consecutivos ou nas extremidades.';
    slugValidationError.hidden = false;
    return false;
  }

  if (slug.length < 3 || slug.length > 40) {
    slugValidationError.textContent = 'O endereço deve ter entre 3 e 40 caracteres.';
    slugValidationError.hidden = false;
    return false;
  }

  if (RESERVED_SLUGS.includes(slug)) {
    slugValidationError.textContent = 'Este endereço é reservado pelo sistema.';
    slugValidationError.hidden = false;
    return false;
  }

  slugValidationError.hidden = true;
  return true;
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
    actionBtn.className = 'button button-small button-secondary';
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

// Handle site creation
async function handleCreateSite() {
  const name = newSiteNameInput.value.trim();
  const slug = newSiteSlugInput.value.trim();

  if (!name) {
    showFeedback('Digite o nome do negócio.', 'error');
    return;
  }

  if (!validateSlug(slug)) {
    showFeedback('Verifique o endereço da vitrine fornecido.', 'error');
    return;
  }

  if (isOnline) {
    try {
      const res = await fetch('/api/sites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, slug, template: 'pizzeria-v1' })
      });

      if (res.status === 201) {
        showFeedback(`Vitrine "${name}" criada com sucesso!`, 'success');
        createSiteForm.reset();
        slugPreview.textContent = 'Endereço: vitrine.inspira.dev.br/loja';
        await loadSites();
      } else if (res.status === 409) {
        showFeedback('Este endereço (slug) já está sendo utilizado por outra vitrine.', 'error');
      } else {
        const data = await res.json();
        showFeedback(data.error?.message || 'Erro ao criar vitrine.', 'error');
      }
    } catch (err) {
      showFeedback('Erro de rede ao criar vitrine.', 'error');
    }
  } else {
    // Local creation
    // Check for duplicate slug
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
      template: "pizzeria-v1",
      role: "owner",
      updatedAt: new Date().toISOString()
    };

    sites.push(newSite);
    localStorage.setItem('vitrine_local_sites', JSON.stringify(sites));

    // Create default local draft
    const defaultDraft = {
      siteId: newId,
      revision: 1,
      updatedAt: new Date().toISOString(),
      content: {
        schemaVersion: 1,
        template: "pizzeria-v1",
        slug,
        businessName: name,
        whatsapp: "5511999999999",
        categories: []
      }
    };
    localStorage.setItem(`vitrine_local_draft_${newId}`, JSON.stringify(defaultDraft));

    showFeedback(`Vitrine "${name}" criada com sucesso no modo local!`, 'success');
    createSiteForm.reset();
    slugPreview.textContent = 'Endereço: vitrine.inspira.dev.br/loja';
    loadLocalSites();
  }
}

// Open Catalog Editor screen
function openEditor(site) {
  activeSite = site;
  showSection('editor');
  loadEditor(site, isOnline);
}
