import { loadEditor } from './editor.js';

// State variables
let isOnline = false;
let currentUser = null;
let sites = [];
let activeSite = null;

// DOM Elements
const authSection = document.getElementById('auth-section');
const dashboardSection = document.getElementById('dashboard-section');
const editorSection = document.getElementById('editor-section');
const demoModeBadge = document.getElementById('demo-mode-badge');
const logoutButton = document.getElementById('logout-button');
const globalFeedback = document.getElementById('global-feedback');
const sitesListContainer = document.getElementById('sites-list-container');
const createSiteForm = document.getElementById('create-site-form');
const newSiteNameInput = document.getElementById('new-site-name');
const newSiteSlugInput = document.getElementById('new-site-slug');
const slugPreview = document.getElementById('slug-preview');
const slugValidationError = document.getElementById('slug-validation-error');
const googleLoginButton = document.getElementById('google-login-button');
const localDemoButton = document.getElementById('local-demo-button');
const backToDashboardButton = document.getElementById('back-to-dashboard');

// Reserved slugs to block on the client side
const RESERVED_SLUGS = ['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout'];

// Initialize App
document.addEventListener('DOMContentLoaded', async () => {
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
      showFeedback('Erro ao iniciar login com Google. Utilizando modo local.', 'error');
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

// Check session on startup
async function checkSession() {
  try {
    const res = await fetch('/api/auth/session');
    if (res.ok) {
      const data = await res.json();
      isOnline = true;
      currentUser = data.user;
      demoModeBadge.hidden = true;
      logoutButton.hidden = false;
      showSection('dashboard');
      await loadSites();
    } else if (res.status === 401) {
      isOnline = true;
      logoutButton.hidden = true;
      showSection('auth');
    } else {
      // Other status (like 404) implies offline static preview
      fallbackToLocalIfNoSession();
    }
  } catch (err) {
    // Network error implies offline static preview
    fallbackToLocalIfNoSession();
  }
}

function fallbackToLocalIfNoSession() {
  isOnline = false;
  // Check if already authenticated in local storage
  const localAuth = sessionStorage.getItem('portal_local_authenticated') === 'true';
  if (localAuth) {
    currentUser = { id: 'local-demo-user' };
    demoModeBadge.hidden = false;
    logoutButton.hidden = false;
    showSection('dashboard');
    loadLocalSites();
  } else {
    logoutButton.hidden = true;
    showSection('auth');
  }
}

// PKCE Generation helpers
function generateRandomString(length) {
  const array = new Uint32Array(length / 2);
  window.crypto.getRandomValues(array);
  return Array.from(array, dec => ('0' + dec.toString(16)).substr(-2)).join('');
}

async function sha256(plain) {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return window.crypto.subtle.digest('SHA-256', data);
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

async function startGoogleLogin() {
  const supabaseUrl = window.SUPABASE_URL;
  const supabaseAnonKey = window.SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    showFeedback('Configuração do Supabase ausente. Redirecionando para o modo local de demonstração...', 'error');
    setTimeout(() => {
      enterLocalDemoMode();
    }, 1500);
    return;
  }

  const verifier = generateRandomString(56);
  sessionStorage.setItem('pkce_verifier', verifier);

  const hashed = await sha256(verifier);
  const challenge = base64urlencode(hashed);

  const redirectUrl = `${window.location.origin}/portal/`;
  const googleAuthUrl = `${supabaseUrl}/auth/v1/authorize?provider=google&code_challenge=${challenge}&code_challenge_method=s256&redirect_to=${encodeURIComponent(redirectUrl)}`;

  window.location.href = googleAuthUrl;
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
  sessionStorage.removeItem('portal_local_authenticated');
  sessionStorage.removeItem('pkce_verifier');
  currentUser = null;
  sites = [];
  activeSite = null;
  
  demoModeBadge.hidden = true;
  logoutButton.hidden = true;
  showFeedback('Sessão encerrada com sucesso.', 'success');
  showSection('auth');
}

// Section Switching
function showSection(section) {
  authSection.hidden = section !== 'auth';
  dashboardSection.hidden = section !== 'dashboard';
  editorSection.hidden = section !== 'editor';
}

// Show Feedback Messages
export function showFeedback(msg, type = 'success') {
  globalFeedback.textContent = msg;
  globalFeedback.className = `feedback-banner ${type}`;
  globalFeedback.hidden = false;
  
  // Auto-scroll to top to let user see feedback
  window.scrollTo({ top: 0, behavior: 'smooth' });

  setTimeout(() => {
    globalFeedback.hidden = true;
  }, 6000);
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
async function loadSites() {
  sitesListContainer.innerHTML = '<p class="loading-msg">Carregando vitrines...</p>';
  try {
    const res = await fetch('/api/sites');
    if (res.ok) {
      const data = await res.json();
      sites = data.sites || [];
      renderSites();
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
