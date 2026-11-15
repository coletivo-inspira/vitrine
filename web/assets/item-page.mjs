/**
 * Comportamento da página do item na vitrine pública: troca de foto pelas miniaturas,
 * "Compartilhar" e endereço das páginas de item para os cartões.
 * CSP: sem innerHTML, sem estilos inline e sem scripts inline.
 */
import { assignItemSlugs, itemPagePath } from './item-page-fields.mjs';

export const LINK_COPIED_MESSAGE = 'Link copiado';
export const SHARE_FAILED_MESSAGE = 'Não foi possível copiar. Copie o endereço na barra do navegador.';

/** `/<endereço>` quando a página está no endereço básico; `''` no domínio próprio. */
export function resolveItemBasePath(slug, pathname = globalThis.location?.pathname ?? '/') {
  const first = String(pathname).split('/').filter(Boolean)[0] ?? '';
  return slug && first === slug ? `/${slug}` : '';
}

/** Função `item → caminho` para o "Ver detalhes" dos cartões. */
export function createItemHref(menu, basePath) {
  const slugs = assignItemSlugs(menu?.items ?? []);
  return (item) => {
    const slug = slugs.get(String(item?.id));
    return slug ? itemPagePath(basePath, slug) : '';
  };
}

function setupGallery(root) {
  const photo = root.querySelector?.('.item-page-photo');
  const thumbs = [...(root.querySelectorAll?.('.item-page-thumb') ?? [])];
  if (!photo || thumbs.length < 2) return;
  for (const thumb of thumbs) {
    thumb.addEventListener('click', (event) => {
      event.preventDefault();
      const src = thumb.getAttribute('href');
      if (!src) return;
      photo.setAttribute('src', src);
      photo.setAttribute('alt', thumb.dataset.photoAlt || photo.getAttribute('alt') || '');
      for (const other of thumbs) other.removeAttribute('aria-current');
      thumb.setAttribute('aria-current', 'true');
    });
  }
}

/**
 * "Compartilhar": `navigator.share` quando existe; senão copia o endereço e anuncia
 * "Link copiado" na região viva ao lado do botão.
 */
export function setupItemShare(root, { navigatorObj = globalThis.navigator } = {}) {
  const button = root.querySelector?.('.item-page-share-button');
  const status = root.querySelector?.('.item-page-share-status');
  if (!button) return null;
  const canShare = typeof navigatorObj?.share === 'function';
  const canCopy = typeof navigatorObj?.clipboard?.writeText === 'function';
  if (!canShare && !canCopy) return null;
  button.hidden = false;
  const announce = (message) => {
    if (!status) return;
    status.textContent = '';
    status.textContent = message;
  };
  const share = async () => {
    const url = button.dataset.shareUrl || globalThis.location?.href || '';
    const title = button.dataset.shareTitle || '';
    if (canShare) {
      try {
        await navigatorObj.share({ title, url });
        return 'shared';
      } catch (error) {
        if (error?.name === 'AbortError') return 'cancelled';
        if (!canCopy) return 'failed';
      }
    }
    try {
      await navigatorObj.clipboard.writeText(url);
      announce(LINK_COPIED_MESSAGE);
      return 'copied';
    } catch {
      announce(SHARE_FAILED_MESSAGE);
      return 'failed';
    }
  };
  button.addEventListener('click', () => {
    share();
  });
  return { share };
}

/** Liga galeria e "Compartilhar" quando o documento é uma página de item. */
export function setupItemPage(doc = globalThis.document, deps = {}) {
  const root = doc?.querySelector?.('.item-page-main');
  if (!root) return null;
  setupGallery(root);
  return { share: setupItemShare(root, deps) };
}
