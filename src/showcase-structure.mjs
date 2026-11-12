import {
  assertNoDangerousTextPayload, PortalValidationError, validateSafePublicHttpsUrl
} from './portal-validation.mjs';

const moduleFields = {
  hero: { headline: 'text', subtitle: 'text' },
  catalog_grid: { columns: 'columns' },
  service_booking: { showDuration: 'boolean' },
  quote_request: { allowNotes: 'boolean' },
  about_story: { bio: 'text' },
  testimonials: { items: [{ name: 'text', quote: 'text' }] },
  faq: { items: [{ q: 'text', a: 'text' }] },
  hours_location: { scheduleText: 'text', addressText: 'text' },
  links_bio: { links: [{ label: 'text', href: 'link' }] },
  custom_sandbox: { widgetId: 'uuid', bundleHash: 'hash' }
};
const themeFields = { accentColor: 'color', fontPair: 'font', buttonStyle: 'button' };
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
  if (type === 'text') {
    assertNoDangerousTextPayload(value);
    return value.trim();
  }
  if (type === 'uuid' && /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)) return value;
  if (type === 'hash' && /^[a-f0-9]{64}$/.test(value)) return value;
  if (type === 'font' && fonts.includes(value)) return value;
  if (type === 'button' && ['pill', 'rounded'].includes(value)) return value;
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

function validateSections(sections, moduleDefaults) {
  if (!Array.isArray(sections) || sections.length > 15) throw invalid();
  const ids = new Set();
  return sections.map(section => {
    if (!section || typeof section.id !== 'string' || !identifier.test(section.id) || ids.has(section.id) ||
        !Object.hasOwn(moduleFields, section.moduleCode) ||
        (section.active !== undefined && typeof section.active !== 'boolean')) throw invalid();
    ids.add(section.id);
    const defaults = section.moduleCode === 'custom_sandbox' ? {} : moduleDefaults[section.moduleCode] ?? {};
    const config = {
      ...validateValue(defaults, moduleFields[section.moduleCode]),
      ...validateValue(section.config ?? {}, moduleFields[section.moduleCode])
    };
    if (section.moduleCode === 'custom_sandbox' && (!config.widgetId || !config.bundleHash)) throw invalid();
    return { id: section.id, moduleCode: section.moduleCode, config, active: section.active !== false };
  });
}

export function resolveShowcaseManifest(structure, template = {}, vertical = {}, moduleDefaults = {}) {
  if (!structure || typeof structure !== 'object' || Array.isArray(structure)) throw invalid();
  const theme = {
    ...validateValue(template.defaultTokens ?? {}, themeFields),
    ...validateValue(vertical.theme ?? {}, themeFields),
    ...validateValue(structure.themeOverrides ?? {}, themeFields)
  };
  const navigation = validateValue(structure.navigationMenus ?? {}, navFields);
  const sourcePages = structure.pages ?? [{
    slug: 'home', title: 'Início', sections: vertical.sections ?? template.defaultSections ?? []
  }];
  if (!Array.isArray(sourcePages) || sourcePages.length > 5) throw invalid();
  const slugs = new Set();
  const pages = sourcePages.map(page => {
    if (!page || typeof page.slug !== 'string' || !identifier.test(page.slug) || slugs.has(page.slug) ||
        typeof page.title !== 'string' || !page.title.trim() || page.title.length > 120 ||
        (page.active !== undefined && typeof page.active !== 'boolean')) throw invalid();
    slugs.add(page.slug);
    return {
      slug: page.slug, title: validateValue(page.title, 'text'),
      sections: validateSections(page.sections ?? [], moduleDefaults), active: page.active !== false
    };
  });
  return { theme, navigation, pages };
}

export function projectShowcaseManifest(structure) {
  const { theme, navigation, pages } = resolveShowcaseManifest(structure);
  return {
    theme, navigation,
    pages: pages.filter(page => page.active).map(({ slug, title, sections }) => ({
      slug, title,
      sections: sections.filter(section => section.active).map(({ id, moduleCode, config }) => ({ id, moduleCode, config }))
    }))
  };
}
