// Old anchor redirects
const anchorMap = {
  '#como-funciona': '/como-funciona/',
  '#possibilidades': '/possibilidades/',
  '#planos': '/planos/',
  '#duvidas': '/planos/#duvidas',
  '#contato': '/orcamento/',
  '#inicio': '/'
};
function checkRedirect() {
  const hash = window.location.hash;
  if (hash && anchorMap[hash]) {
    window.location.replace(anchorMap[hash]);
  }
}
window.addEventListener('hashchange', checkRedirect);
checkRedirect();

import { quoteContactLink } from './assets/portfolio.mjs';

const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
document.body.classList.add('js-ready');
if (menuButton) menuButton.hidden = false;
function closeMenu(returnFocus = false) {
  if (!nav || !menuButton) return;
  nav.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menu');
  if (returnFocus) menuButton.focus();
}
if (menuButton) {
  menuButton.addEventListener('click', () => {
    const open = menuButton.getAttribute('aria-expanded') !== 'true';
    if (nav) nav.classList.toggle('is-open', open);
    menuButton.setAttribute('aria-expanded', String(open));
    menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
  });
}
if (nav) {
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link || !menuButton || menuButton.getAttribute('aria-expanded') !== 'true') return;
    const hash = link.hash;
    if (hash) {
      try {
        const destination = document.getElementById(hash.slice(1));
        if (destination) {
          destination.setAttribute('tabindex', '-1');
          destination.focus({ preventScroll: true });
        }
      } catch {}
    }
    closeMenu();
  });
}
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton && menuButton.getAttribute('aria-expanded') === 'true') closeMenu(true); });

function safeContactUrl(value) {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.hostname !== 'wa.me' || !/^\/[1-9]\d{7,14}$/.test(url.pathname) || url.username || url.password) return null;
    return url;
  } catch { return null; }
}

async function json(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Content unavailable');
  return response.json();
}

async function loadContent() {
  const [contactResult, casesResult] = await Promise.allSettled([json(new URL('./data/contact.json', import.meta.url)), json(new URL('./data/portfolio.json', import.meta.url))]);
  const contact = contactResult.status === 'fulfilled' ? safeContactUrl(contactResult.value?.href) : null;
  
  const contactAction = document.querySelector('#contact-action');
  if (contact && contactAction) {
    const link = document.createElement('a');
    link.className = 'button'; link.href = contact.href;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Falar com a Mila no WhatsApp ↗';
    link.setAttribute('aria-label', 'Falar com a Mila no WhatsApp (abre em nova aba)');
    contactAction.replaceChildren(link);
  }
  
  const list = document.querySelector('#project-list');
  const projetosSection = document.querySelector('#projetos');
  if (list && casesResult.status === 'fulfilled' && Array.isArray(casesResult.value)) {
    for (const entry of casesResult.value) {
      if (!entry || typeof entry.title !== 'string' || typeof entry.summary !== 'string' || typeof entry.category !== 'string') continue;
      let destination;
      try { destination = new URL(entry.url); } catch { continue; }
      if (destination.protocol !== 'https:' || destination.username || destination.password) continue;
      const article = document.createElement('article');
      const title = document.createElement('h3');
      const link = document.createElement('a');
      link.className = 'project-link'; link.textContent = entry.title;
      link.href = destination.href; link.target = '_blank'; link.rel = 'noopener noreferrer';
      link.setAttribute('aria-label', `${entry.title} (abre em nova aba)`); title.append(link);
      const copy = document.createElement('p'); copy.className = 'project-copy'; copy.textContent = entry.summary;
      const category = document.createElement('p'); category.className = 'project-category'; category.textContent = entry.category;
      article.append(title, copy, category);
      if (contact && typeof entry.id === 'string') {
        const quote = document.createElement('a'); quote.className = 'text-link project-quote';
        quote.href = quoteContactLink(contact.pathname.slice(1), entry);
        quote.textContent = 'Quero algo parecido ↗'; quote.target = '_blank'; quote.rel = 'noopener noreferrer';
        article.append(quote);
      }
      list.append(article);
    }
    if (projetosSection) {
      projetosSection.hidden = !list.childElementCount;
    }
  }
}
// Static marketing content remains useful even when optional data cannot be loaded.

// A sheet leaves the front, then settles behind the other real sites.
const showcase = document.querySelector('.showcase');
if (showcase) {
  const stack = showcase.querySelector('.showcase-stack');
  let sheets = [...stack.querySelectorAll('.showcase-sheet')];
  const next = showcase.querySelector('.showcase-next');
  const pause = showcase.querySelector('.showcase-pause');
  const link = showcase.querySelector('.showcase-link');
  const count = showcase.querySelector('.showcase-count');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let paused = reduced.matches, busy = false, visible = false, timer;
  const original = [...sheets];
  showcase.querySelector('.showcase-controls').hidden = false;
  function syncPause() {
    if (!pause) return;
    pause.setAttribute('aria-pressed', String(paused));
    pause.setAttribute('aria-label', paused ? 'Retomar troca automática' : 'Pausar troca automática');
  }
  function schedule() {
    clearTimeout(timer);
    if (!paused && !reduced.matches && visible && !document.hidden && !showcase.matches(':hover, :focus-within')) timer = setTimeout(advance, 5000);
  }
  async function advance() {
    if (busy) return;
    busy = true;
    clearTimeout(timer);
    const front = sheets[0];
    if (!reduced.matches) {
      front.classList.add('is-leaving');
      await new Promise(resolve => setTimeout(resolve, 360));
    }
    sheets.push(sheets.shift());
    sheets.forEach((sheet, depth) => { sheet.dataset.depth = depth; sheet.setAttribute('aria-hidden', String(depth !== 0)); });
    front.classList.remove('is-leaving');
    const current = sheets[0];
    if (link) {
      link.href = current.dataset.url;
      link.firstChild.textContent = current.dataset.title;
    }
    if (count) {
      count.textContent = `${String(original.indexOf(current) + 1).padStart(2, '0')} / 04`;
    }
    if (!reduced.matches) await new Promise(resolve => setTimeout(resolve, 650));
    busy = false;
    schedule();
  }
  if (next) next.addEventListener('click', advance);
  if (pause) pause.addEventListener('click', () => { paused = !paused; syncPause(); schedule(); });
  showcase.addEventListener('mouseenter', () => clearTimeout(timer));
  showcase.addEventListener('mouseleave', schedule);
  showcase.addEventListener('focusin', () => clearTimeout(timer));
  showcase.addEventListener('focusout', () => setTimeout(schedule, 0));
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', () => { paused = reduced.matches; syncPause(); schedule(); });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }, { threshold: .25 }).observe(showcase);
  let startX;
  stack.addEventListener('pointerdown', event => { startX = event.clientX; });
  stack.addEventListener('pointerup', event => { if (startX !== undefined && Math.abs(event.clientX - startX) > 45) advance(); startX = undefined; });
  stack.addEventListener('pointercancel', () => { startX = undefined; });
  syncPause();
}

const cmsSections = {
  hero: '#inicio', value_props: '#cms-benefits', areas_showcase: '#possibilidades',
  templates_catalog: '#cms-templates', featured_cases: '#projetos',
  commercial_offer: '#planos', faq: '#duvidas', announcements: '#cms-announcements',
  header_nav: '#site-nav', footer: '.site-footer'
};

function updateText(root, selector, value) {
  const element = root.querySelector(selector);
  if (element && typeof value === 'string') element.textContent = value;
}

function createTextElement(tag, text) {
  const element = document.createElement(tag);
  element.textContent = text;
  return element;
}

function applyPlatformCms(sections) {
  const main = document.getElementById('conteudo');
  const contact = document.getElementById('contato');
  for (const { sectionKey, content, visible } of sections) {
    if (!Object.hasOwn(cmsSections, sectionKey)) continue;
    const root = document.querySelector(cmsSections[sectionKey]);
    if (!visible) {
      root.hidden = true;
      continue;
    }
    if (root.parentElement === main) main.insertBefore(root, contact);
    switch (sectionKey) {
      case 'hero':
        updateText(root, 'h1', content.headline);
        updateText(root, '.hero-description', content.subtitle);
        break;
      case 'value_props':
        updateText(root, 'h2', content.title);
        root.querySelector('ul').replaceChildren(...(content.items ?? []).map(item => createTextElement('li', item)));
        break;
      case 'areas_showcase':
        updateText(root, 'h2', content.title);
        if (Array.isArray(content.areas)) {
          root.querySelectorAll('[data-area]').forEach(button => {
            if (!content.areas.includes(button.dataset.area)) {
              document.getElementById(button.getAttribute('aria-controls'))?.remove();
              button.remove();
            }
          });
          root.querySelector('[data-area]')?.click();
        }
        break;
      case 'commercial_offer':
        updateText(root, 'h2', content.title);
        updateText(root, '.offer-emphasis', content.freePlanTitle);
        break;
      case 'faq':
        updateText(root, 'h2', content.title);
        if (Array.isArray(content.items)) {
          root.querySelector('.faq-list').replaceChildren(...content.items.map(({ q, a }) => {
            const detail = document.createElement('details');
            detail.append(createTextElement('summary', q), createTextElement('p', a));
            return detail;
          }));
        }
        break;
      case 'announcements':
        updateText(root, 'p', content.bannerText);
        break;
      case 'header_nav':
        if (Array.isArray(content.links)) {
          root.replaceChildren(...content.links.filter(entry => /^#[a-z][a-z0-9-]*$/.test(entry.href))
            .map(({ label, href }) => {
              const link = createTextElement('a', label);
              link.href = href;
              return link;
            }));
        }
        break;
      case 'footer':
        updateText(root, 'p', content.copyright);
        break;
      default:
        updateText(root, 'h2', content.title);
    }
    if (sectionKey !== 'featured_cases' || root.querySelector('#project-list').children.length > 0) {
      root.hidden = false;
    }
  }
}

async function loadPlatformCms() {
  try {
    const { sections } = await json('/api/public/platform-cms');
    if (Array.isArray(sections)) applyPlatformCms(sections);
  } catch {
    // A página continua disponível com seu conteúdo estático.
  }
}

if (!document.body.hasAttribute('data-static-institutional-page')) {
  void loadContent().catch(() => {}).then(loadPlatformCms);
}
