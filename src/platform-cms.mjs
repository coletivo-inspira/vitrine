import { PortalValidationError, assertNoDangerousTextPayload } from './portal-validation.mjs';

const schemas = {
  hero: { headline: 'text', subtitle: 'text' },
  value_props: { title: 'text', items: ['text'] },
  areas_showcase: { title: 'text', areas: ['area'] },
  templates_catalog: { title: 'text' },
  featured_cases: { title: 'text' },
  commercial_offer: { title: 'text', freePlanTitle: 'text' },
  faq: { title: 'text', items: [{ q: 'text', a: 'text' }] },
  announcements: { bannerText: 'text' },
  header_nav: { links: [{ label: 'text', href: 'anchor' }] },
  footer: { copyright: 'text' }
};

const areas = ['food', 'art', 'photo', 'health', 'tech'];

function invalidContent() {
  return new PortalValidationError(422, 'INVALID_CMS_CONTENT', 'Confira os campos permitidos na seção institucional.');
}

function validate(value, schema) {
  if (Array.isArray(schema)) {
    if (!Array.isArray(value) || value.length > 20) throw invalidContent();
    return value.map(entry => validate(entry, schema[0]));
  }
  if (typeof schema === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalidContent();
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      if (!Object.hasOwn(schema, key)) throw invalidContent();
      return [key, validate(entry, schema[key])];
    }));
  }
  if (typeof value !== 'string' || !value.trim() || value.length > 1000) throw invalidContent();
  if (schema === 'anchor' && !/^#[a-z][a-z0-9-]*$/.test(value)) throw invalidContent();
  if (schema === 'area' && !areas.includes(value)) throw invalidContent();
  assertNoDangerousTextPayload(value);
  return value.trim();
}

export function validateCmsSection(sectionKey, input) {
  if (!Object.hasOwn(schemas, sectionKey) || !input ||
      typeof input.visible !== 'boolean' || !Number.isSafeInteger(input.displayOrder) ||
      input.displayOrder < 0 || input.displayOrder > 99) throw invalidContent();
  return {
    content: validate(input.content, schemas[sectionKey]),
    visible: input.visible,
    displayOrder: input.displayOrder
  };
}
