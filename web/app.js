import { quoteContactLink } from './assets/portfolio.mjs';

const menuButton = document.querySelector('.menu-toggle');
const nav = document.querySelector('#site-nav');
document.body.classList.add('js-ready');
menuButton.hidden = false;
function closeMenu(returnFocus = false) {
  nav.classList.remove('is-open');
  menuButton.setAttribute('aria-expanded', 'false');
  menuButton.setAttribute('aria-label', 'Abrir menu');
  if (returnFocus) menuButton.focus();
}
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  nav.classList.toggle('is-open', open);
  menuButton.setAttribute('aria-expanded', String(open));
  menuButton.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
});
nav.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || menuButton.getAttribute('aria-expanded') !== 'true') return;
  const destination = document.querySelector(link.getAttribute('href'));
  if (destination) {
    destination.setAttribute('tabindex', '-1');
    destination.focus({ preventScroll: true });
  }
  closeMenu();
});
document.addEventListener('keydown', event => { if (event.key === 'Escape' && menuButton.getAttribute('aria-expanded') === 'true') closeMenu(true); });

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
  if (contact) {
    const link = document.createElement('a');
    link.className = 'button'; link.href = contact.href;
    link.target = '_blank'; link.rel = 'noopener noreferrer';
    link.textContent = 'Pedir orçamento pelo WhatsApp ↗';
    link.setAttribute('aria-label', 'Pedir orçamento pelo WhatsApp (abre em nova aba)');
    document.querySelector('#contact-action').replaceChildren(link);
  }
  if (casesResult.status !== 'fulfilled' || !Array.isArray(casesResult.value)) return;
  const list = document.querySelector('#project-list');
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
  document.querySelector('#projetos').hidden = !list.childElementCount;
}
// Static marketing content remains useful even when optional data cannot be loaded.
loadContent().catch(() => {});
