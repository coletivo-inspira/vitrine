import {
  assertNoDangerousTextPayload, PortalValidationError, validateSafePublicHttpsUrl
} from './portal-validation.mjs';
import { HIGHLIGHT_ICON_PATHS } from '../web/assets/highlight-icons.mjs';
import { DEFAULT_STOREFRONT_PALETTE, isStorefrontPaletteId } from '../web/assets/storefront-palettes.mjs';

export const HIGHLIGHT_ICONS = Object.freeze(Object.keys(HIGHLIGHT_ICON_PATHS));
export const HERO_LIMITS = Object.freeze({ eyebrow: 40, actionLabel: 28, imageAlt: 160, highlightText: 60 });
export const SOCIAL_PROOF_LIMITS = Object.freeze({ testimonials: 12, testimonialContext: 60, faq: 12, faqTitle: 80 });
const heroAction = { label: `text:${HERO_LIMITS.actionLabel}`, target: 'target' };
const actionTarget = /^(?:selecao|whatsapp|pagina:[a-z0-9][a-z0-9_-]{0,39}|#[a-z0-9][a-z0-9_-]{0,63})$/;

const moduleFields = {
  hero: {
    headline: 'text', subtitle: 'text', eyebrow: `text:${HERO_LIMITS.eyebrow}`,
    imageUrl: 'webp', imageAlt: `text:${HERO_LIMITS.imageAlt}`,
    primaryAction: heroAction, secondaryAction: heroAction
  },
  highlights: { items: [{ icon: 'icon', text: `text:${HERO_LIMITS.highlightText}` }] },
  catalog_grid: { columns: 'columns' },
  service_booking: { showDuration: 'boolean' },
  quote_request: { allowNotes: 'boolean' },
  about_story: { bio: 'text' },
  testimonials: {
    items: [{
      name: 'text', quote: 'text', context: `text:${SOCIAL_PROOF_LIMITS.testimonialContext}`,
      photoUrl: 'webp', consent: 'boolean'
    }]
  },
  faq: { title: `text:${SOCIAL_PROOF_LIMITS.faqTitle}`, items: [{ q: 'text', a: 'text' }] },
  hours_location: { scheduleText: 'text', addressText: 'text' },
  links_bio: { links: [{ label: 'text', href: 'link' }] },
  custom_sandbox: { widgetId: 'uuid', bundleHash: 'hash' }
};
const themeFields = { accentColor: 'color', fontPair: 'font', buttonStyle: 'button', palette: 'palette', logoUrl: 'webp' };
const navFields = { header: [{ label: 'text', href: 'link' }], footer: [{ label: 'text', href: 'link' }] };
const fonts = ['editorial-syne', 'modern-inter', 'playful-poppins', 'classic-garamond'];
const identifier = /^[a-z0-9][a-z0-9_-]{0,39}$/;

function invalid() {
  return new PortalValidationError(422, 'INVALID_STRUCTURE', 'Confira os campos, links e limites da estrutura da vitrine.');
}

function validateValue(value, type) {
  if (Array.isArray(type)) {
    if (!Array.isArray(value) || value.length > 15) throw invalid();
    return value.map(entry => validateValue(entry, type[0]));
  }
  if (typeof type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    if (Object.keys(value).some(key => !Object.hasOwn(type, key))) throw invalid();
    return Object.fromEntries(Object.keys(type).filter(key => Object.hasOwn(value, key))
      .map(key => [key, validateValue(value[key], type[key])]));

  }
  if (type === 'boolean' && typeof value === 'boolean') return value;
  if (type === 'columns' && [1, 2, 3].includes(value)) return value;
  if (typeof value !== 'string' || value.length > 1000) throw invalid();
  if (type === 'text' || type.startsWith('text:')) {
    assertNoDangerousTextPayload(value);
    const max = type === 'text' ? 1000 : Number(type.slice(5));
    if (value.trim().length > max) throw invalid();
    return value.trim();
  }
  if (type === 'icon' && HIGHLIGHT_ICONS.includes(value)) return value;
  if (type === 'target' && actionTarget.test(value)) return value;
  if (type === 'webp') {
    if (/^\/(?!.*\.\.)[a-z0-9][a-z0-9/_.-]*\.webp$/i.test(value)) return value;
    const url = validateSafePublicHttpsUrl(value);
    if (/\.webp$/i.test(new URL(url).pathname)) return url;
  }
  if (type === 'uuid' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)) return value;
  if (type === 'hash' && /^[a-f0-9]{64}$/.test(value)) return value;
  if (type === 'font' && fonts.includes(value)) return value;
  if (type === 'button' && ['pill', 'rounded'].includes(value)) return value;
  if (type === 'palette' && isStorefrontPaletteId(value)) return value;
  if (type === 'color' && /^#[a-f0-9]{6}$/i.test(value)) {
    const colors = value.slice(1).match(/.{2}/g).map(part => parseInt(part, 16) / 255)
      .map(color => color <= 0.04045 ? color / 12.92 : ((color + 0.055) / 1.055) ** 2.4);
    const luminance = colors[0] * 0.2126 + colors[1] * 0.7152 + colors[2] * 0.0722;
    if (1.05 / (luminance + 0.05) >= 4.5) return value;
  }
  if (type === 'link') {
    if (/^#[a-z0-9][a-z0-9_-]*$/i.test(value) || /^\/[a-z0-9][a-z0-9/_-]*$/i.test(value)) return value;
    return validateSafePublicHttpsUrl(value);
  }
  throw invalid();
}

function assertHeroConfig(config, sectionId) {
  if (config.imageUrl && !config.imageAlt) {
    throw new PortalValidationError(422, 'HERO_IMAGE_ALT_REQUIRED',
      'Descreva a foto do cabeçalho no campo "Descrição da foto" para publicar com imagem.',
      { missingFields: [`${sectionId}.imageAlt`] });
  }
  if (!config.imageUrl) delete config.imageAlt;
  for (const key of ['primaryAction', 'secondaryAction']) {
    if (config[key] && (!config[key].label || !config[key].target)) throw invalid();
  }
}

function assertHighlightsConfig(config) {
  const items = config.items ?? [];
  if (items.length === 0) return;
  if (items.length < 2 || items.length > 4 || items.some(item => !item.icon || !item.text)) {
    throw new PortalValidationError(422, 'INVALID_HIGHLIGHTS',
      'Os destaques precisam de 2 a 4 itens, cada um com ícone e texto de até 60 caracteres.');
  }
}

/**
 * Regras de publicação dos depoimentos e das perguntas frequentes. Ficam fora de
 * `resolveShowcaseManifest` porque a projeção pública também passa por lá: vitrines
 * publicadas antes do consentimento continuam abrindo, mas não são salvas nem
 * republicadas sem ele.
 */
export function assertPublishableSocialProof(pages = []) {
  for (const page of pages ?? []) {
    for (const section of page?.sections ?? []) {
      const items = section?.config?.items ?? [];
      if (section?.moduleCode === 'testimonials') {
        if (items.length > SOCIAL_PROOF_LIMITS.testimonials || items.some(item => !item?.name?.trim() || !item?.quote?.trim())) {
          throw new PortalValidationError(422, 'INVALID_TESTIMONIALS',
            `Cada depoimento precisa de nome e texto, até ${SOCIAL_PROOF_LIMITS.testimonials} por seção.`);
        }
        const missingFields = items.flatMap((item, index) =>
          item.consent === true ? [] : [`${section.id}.items.${index}.consent`]);
        if (missingFields.length) {
          throw new PortalValidationError(422, 'TESTIMONIAL_CONSENT_REQUIRED',
            'Marque "Tenho autorização desta pessoa para publicar o depoimento" em cada depoimento.',
            { missingFields });
        }
      }
      if (section?.moduleCode === 'faq' &&
          (items.length > SOCIAL_PROOF_LIMITS.faq || items.some(item => !item?.q?.trim() || !item?.a?.trim()))) {
        throw new PortalValidationError(422, 'INVALID_FAQ',
          `Cada pergunta precisa de resposta, até ${SOCIAL_PROOF_LIMITS.faq} por seção.`);
      }
    }
  }
}

function publicConfig(moduleCode, config) {
  if (moduleCode !== 'testimonials' || !config.items) return config;
  return { ...config, items: config.items.map(({ consent, ...item }) => item) };
}

function validateSections(sections, moduleDefaults, inheritedSections = []) {
  if (!Array.isArray(sections) || sections.length > 15) throw invalid();
  const ids = new Set();
  return sections.map(section => {
    if (!section || typeof section.id !== 'string' || !identifier.test(section.id) || ids.has(section.id) ||
        !Object.hasOwn(moduleFields, section.moduleCode) ||
        (section.active !== undefined && typeof section.active !== 'boolean')) throw invalid();
    ids.add(section.id);
    const defaults = section.moduleCode === 'custom_sandbox' ? {} : moduleDefaults[section.moduleCode] ?? {};
    const inherited = inheritedSections.find(entry => entry.id === section.id && entry.moduleCode === section.moduleCode);
    const fields = moduleFields[section.moduleCode];
    const config = {
      ...validateValue(defaults, fields),
      ...validateValue(inherited?.config ?? {}, fields),
      ...validateValue(section.config ?? {}, fields)
    };
    if (section.moduleCode === 'custom_sandbox' && (!config.widgetId || !config.bundleHash)) throw invalid();
    if (section.moduleCode === 'hero') assertHeroConfig(config, section.id);
    if (section.moduleCode === 'highlights') assertHighlightsConfig(config);
    return { id: section.id, moduleCode: section.moduleCode, config, active: section.active !== false };
  });
}

export function resolveShowcaseManifest(structure, template = {}, vertical = {}, moduleDefaults = {}) {
  if (!structure || typeof structure !== 'object' || Array.isArray(structure)) throw invalid();
  const theme = {};
  for (const layer of [template.defaultTokens, vertical.theme, structure.themeOverrides]) {
    const tokens = validateValue(layer ?? {}, themeFields);
    // Paleta escolhida numa camada vence a cor de destaque herdada do modelo; a cor definida na mesma camada continua valendo.
    if (tokens.palette && !tokens.accentColor) delete theme.accentColor;
    Object.assign(theme, tokens);
  }
  const navigation = validateValue(structure.navigationMenus ?? {}, navFields);
  const inheritedSections = vertical.sections ?? template.defaultSections ?? [];
  // Páginas extras do modelo (ex.: "Para empresas"), herdadas como a home: só o que muda fica no rascunho.
  const inheritedPages = (Array.isArray(template.defaultPages) ? template.defaultPages : [])
    .filter(page => page?.slug && page.slug !== 'home');
  const sourcePages = structure.pages ?? [{
    slug: 'home', title: 'Início', sections: inheritedSections
  }, ...inheritedPages];
  if (!Array.isArray(sourcePages) || sourcePages.length > 5) throw invalid();
  const slugs = new Set();
  const pages = sourcePages.map(page => {
    if (!page || typeof page.slug !== 'string' || !identifier.test(page.slug) || slugs.has(page.slug) ||
        typeof page.title !== 'string' || !page.title.trim() || page.title.length > 120 ||
        (page.active !== undefined && typeof page.active !== 'boolean')) throw invalid();
    slugs.add(page.slug);
    return {
      slug: page.slug, title: validateValue(page.title, 'text'),
      sections: validateSections(page.sections ?? [], moduleDefaults, page.slug === 'home'
        ? inheritedSections
        : inheritedPages.find(entry => entry.slug === page.slug)?.sections ?? []),
      active: page.active !== false
    };
  });
  return { theme, navigation, pages };
}

export function extractShowcaseOverrides(resolved, template, vertical, moduleDefaults) {
  const baseline = resolveShowcaseManifest({}, template, vertical, moduleDefaults);
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);
  const changes = (selected, defaults) => Object.fromEntries(
    Object.entries(selected).filter(([key, value]) => !same(value, defaults[key]))
  );
  const layout = resolved.pages.map(page => ({
    ...page,
    sections: page.sections.map(section => {
      const basePage = baseline.pages.find(entry => entry.slug === page.slug);
      const baseSection = basePage?.sections.find(entry => entry.id === section.id && entry.moduleCode === section.moduleCode);
      return {
        ...section,
        config: changes(section.config, baseSection?.config ?? moduleDefaults?.[section.moduleCode] ?? {})
      };
    })
  }));
  return {
    themeOverrides: changes(resolved.theme, baseline.theme),
    navigationMenus: resolved.navigation,
    ...(!same(resolved.pages, baseline.pages) ? { pages: layout } : {})
  };
}

export function projectShowcaseManifest(structure) {
  const { theme: { palette, ...theme }, navigation, pages } = resolveShowcaseManifest(structure);
  return {
    // A paleta padrão fica implícita: artefatos sem paleta mantêm os mesmos bytes e hash.
    theme: palette && palette !== DEFAULT_STOREFRONT_PALETTE ? { ...theme, palette } : theme,
    navigation,
    pages: pages.filter(page => page.active).map(({ slug, title, sections }) => ({
      slug, title,
      sections: sections.filter(section => section.active)
        .map(({ id, moduleCode, config }) => ({ id, moduleCode, config: publicConfig(moduleCode, config) }))
    }))
  };
}
