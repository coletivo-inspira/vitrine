import { DEFAULT_LOCAL_BUSINESS_TYPE, LOCAL_BUSINESS_TYPES, validateLocalSeo } from '../assets/local-seo.mjs';

const DEFAULT_IMAGE = '/assets/brand/og-vitrine.png';
const DEFAULT_DESCRIPTION = 'Vitrine oficial: faça seu pedido direto no WhatsApp.';
const FIELDS = { businessType: 'editor-seo-type', areaServed: 'editor-seo-area' };

const doc = () => globalThis.document;
const byId = (id) => doc()?.getElementById(id) ?? null;

const panel = {
  getContent: () => null,
  getSlug: () => '',
  onChange: () => {},
  bound: false
};

function draftItems(content) {
  const flat = Array.isArray(content?.items) ? content.items : [];
  const nested = Array.isArray(content?.categories)
    ? content.categories.filter((category) => category?.active !== false).flatMap((category) => category?.items ?? [])
    : [];
  return [...flat, ...nested].filter((item) => item && item.active !== false && item.available !== false);
}

function previewImage(content) {
  const candidates = [content?.structure?.theme?.logoUrl, ...draftItems(content).map((item) => item.imageUrl)];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const src = candidate.trim();
    if (/^\/[a-z0-9][a-z0-9/_.-]*$/i.test(src)) return src;
    try {
      if (new URL(src).protocol === 'https:') return src;
    } catch {
      // URL inválida: tenta a próxima.
    }
  }
  return DEFAULT_IMAGE;
}

function fillTypeOptions() {
  const select = byId(FIELDS.businessType);
  if (!select || select.options.length) return;
  for (const entry of LOCAL_BUSINESS_TYPES) {
    const option = doc().createElement('option');
    option.value = entry.value === DEFAULT_LOCAL_BUSINESS_TYPE ? '' : entry.value;
    option.textContent = entry.label;
    select.append(option);
  }
}

function fillInputs() {
  const seo = panel.getContent()?.localSeo ?? {};
  const select = byId(FIELDS.businessType);
  const area = byId(FIELDS.areaServed);
  if (select) select.value = seo.businessType && seo.businessType !== DEFAULT_LOCAL_BUSINESS_TYPE ? seo.businessType : '';
  if (area) area.value = typeof seo.areaServed === 'string' ? seo.areaServed : '';
}

function renderErrors(extraErrors = []) {
  const content = panel.getContent();
  if (!content) return;
  const errors = [...validateLocalSeo(content.localSeo).errors, ...extraErrors];
  for (const [field, id] of Object.entries(FIELDS)) {
    const input = byId(id);
    const errorNode = byId(`${id}-error`);
    const error = errors.find((entry) => entry.field === `localSeo.${field}`);
    if (error) input?.setAttribute('aria-invalid', 'true');
    else input?.removeAttribute('aria-invalid');
    if (errorNode) {
      errorNode.textContent = error?.message ?? '';
      errorNode.hidden = !error;
    }
  }
}

/** Atualiza a prévia simulada do cartão (não é a captura real do WhatsApp). */
export function renderSharePreview() {
  const content = panel.getContent();
  const card = byId('editor-share-preview');
  if (!content || !card) return;
  const name = (byId('editor-business-name')?.value ?? content.businessName ?? '').trim() || 'Sua vitrine';
  const welcome = (byId('editor-welcome-text')?.value ?? content.messages?.welcomeText ?? '').trim();
  const image = byId('editor-share-preview-image');
  const src = previewImage(content);
  if (image && image.getAttribute('src') !== src) image.setAttribute('src', src);
  const title = byId('editor-share-preview-title');
  const description = byId('editor-share-preview-description');
  const host = byId('editor-share-preview-host');
  if (title) title.textContent = `${name} — Vitrine`;
  if (description) description.textContent = welcome || DEFAULT_DESCRIPTION;
  if (host) host.textContent = `vitrine.inspira.dev.br/${panel.getSlug() || 'sua-vitrine'}`;
}

function update() {
  const content = panel.getContent();
  if (!content) return;
  const businessType = byId(FIELDS.businessType)?.value ?? '';
  const areaServed = byId(FIELDS.areaServed)?.value ?? '';
  if (!businessType && !areaServed.trim()) delete content.localSeo;
  else content.localSeo = { ...(businessType ? { businessType } : {}), ...(areaServed.trim() ? { areaServed } : {}) };
  renderErrors();
  panel.onChange();
}

function bindEvents() {
  if (panel.bound) return;
  panel.bound = true;
  byId(FIELDS.businessType)?.addEventListener('change', update);
  const area = byId(FIELDS.areaServed);
  area?.addEventListener('input', update);
  area?.addEventListener('change', update);
  for (const id of ['editor-business-name', 'editor-welcome-text']) {
    byId(id)?.addEventListener('input', renderSharePreview);
  }
  byId('editor-share-preview-image')?.addEventListener('error', (event) => {
    if (event.target.getAttribute('src') !== DEFAULT_IMAGE) event.target.setAttribute('src', DEFAULT_IMAGE);
  });
}

/** Liga os campos "Google e WhatsApp" ao rascunho aberto no editor. */
export function mountSeoPanel({ getContent, getSlug, onChange } = {}) {
  if (!byId('editor-seo-group')) return;
  panel.getContent = getContent ?? panel.getContent;
  panel.getSlug = getSlug ?? panel.getSlug;
  panel.onChange = onChange ?? panel.onChange;
  fillTypeOptions();
  bindEvents();
  fillInputs();
  renderErrors();
  renderSharePreview();
}

/** Mostra no campo os erros `localSeo.*` devolvidos pelo servidor. Devolve `true` quando eram deste painel. */
export function showSeoServerErrors(error, { focus = true, reveal } = {}) {
  const fieldErrors = Array.isArray(error?.fieldErrors) ? error.fieldErrors : error?.field ? [error] : [];
  const mine = fieldErrors.filter((entry) => /^localSeo(\.|$)/.test(entry.field ?? ''));
  if (!mine.length) return false;
  reveal?.();
  renderErrors(mine);
  if (focus) doc()?.querySelector('#editor-seo-group [aria-invalid="true"]')?.focus();
  return true;
}
