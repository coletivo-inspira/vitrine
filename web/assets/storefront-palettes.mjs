/**
 * Curated color palettes for public storefronts (Personalizar > Cores da vitrine).
 * Stored as `structure.themeOverrides.palette` in the draft and published as
 * `structure.theme.palette` only when it is not the default.
 * Shared by the Worker (validation and publication), the public storefront and the portal preview.
 * The CSS tokens live in web/assets/storefront-palettes.css and must match these values;
 * test/storefront-palettes.test.mjs checks WCAG AA contrast and keeps both in sync.
 * The first palette is the default and repeats the base tokens of web/vitrine/vitrine.css.
 */

export const DEFAULT_STOREFRONT_PALETTE = 'inspira';

/** Linked only on storefronts with a non-default palette, so the others keep a single stylesheet. */
export const STOREFRONT_PALETTES_CSS = '/assets/storefront-palettes.css';

export const STOREFRONT_PALETTE_TOKENS = Object.freeze([
  'paper',
  'surface',
  'offer-surface',
  'apricot',
  'ink',
  'ink-soft',
  'line',
  'primary',
  'primary-hover',
  'action-text'
]);

const LIGHT_ACTION_TEXT = '#FFFFFF';
const DARK_ACTION_TEXT = '#171E1A';

function palette(id, label, light, dark) {
  return Object.freeze({
    id,
    label,
    light: Object.freeze({ ...light, 'action-text': LIGHT_ACTION_TEXT }),
    dark: Object.freeze({ ...dark, 'action-text': DARK_ACTION_TEXT })
  });
}

export const STOREFRONT_PALETTES = Object.freeze([
  palette(
    'inspira',
    'Inspira',
    {
      paper: '#F7F7F4',
      surface: '#FFFFFF',
      'offer-surface': '#F0EFE9',
      apricot: '#FBEDE5',
      ink: '#27322E',
      'ink-soft': '#56615B',
      line: '#DDDCD6',
      primary: '#C74414',
      'primary-hover': '#A9360E'
    },
    {
      paper: '#171E1A',
      surface: '#202A23',
      'offer-surface': '#202A23',
      apricot: '#33291F',
      ink: '#F7F7F4',
      'ink-soft': '#B9C5BD',
      line: '#45544A',
      primary: '#FFB18A',
      'primary-hover': '#FFC4A7'
    }
  ),
  palette(
    'vinho',
    'Vinho',
    {
      paper: '#F8F4F5',
      surface: '#FFFFFF',
      'offer-surface': '#F1EAEC',
      apricot: '#F6E6EA',
      ink: '#2E2226',
      'ink-soft': '#5E4E54',
      line: '#E2D6DA',
      primary: '#8E1F3F',
      'primary-hover': '#741832'
    },
    {
      paper: '#1D1517',
      surface: '#2A1E22',
      'offer-surface': '#2A1E22',
      apricot: '#3A2229',
      ink: '#F8F1F3',
      'ink-soft': '#CDB8BF',
      line: '#554047',
      primary: '#F4A7BB',
      'primary-hover': '#F8C2D0'
    }
  ),
  palette(
    'oceano',
    'Oceano',
    {
      paper: '#F3F6F8',
      surface: '#FFFFFF',
      'offer-surface': '#E9EFF3',
      apricot: '#E2EEF6',
      ink: '#1F2B35',
      'ink-soft': '#4C5B67',
      line: '#D3DEE6',
      primary: '#0B5C8E',
      'primary-hover': '#084A73'
    },
    {
      paper: '#121A21',
      surface: '#1B2630',
      'offer-surface': '#1B2630',
      apricot: '#1C3140',
      ink: '#F1F5F8',
      'ink-soft': '#B3C3CF',
      line: '#3C4E5C',
      primary: '#8CC8F0',
      'primary-hover': '#AED8F5'
    }
  ),
  palette(
    'floresta',
    'Floresta',
    {
      paper: '#F4F7F4',
      surface: '#FFFFFF',
      'offer-surface': '#EAF0EB',
      apricot: '#E3EFE6',
      ink: '#1F2D25',
      'ink-soft': '#4D5D53',
      line: '#D5E0D8',
      primary: '#1E6B43',
      'primary-hover': '#165535'
    },
    {
      paper: '#131C17',
      surface: '#1C2921',
      'offer-surface': '#1C2921',
      apricot: '#1F3527',
      ink: '#F1F6F2',
      'ink-soft': '#B5C7BB',
      line: '#3D5245',
      primary: '#8FD6AC',
      'primary-hover': '#AEE3C3'
    }
  ),
  palette(
    'terracota',
    'Terracota',
    {
      paper: '#F8F5F2',
      surface: '#FFFFFF',
      'offer-surface': '#F1EBE5',
      apricot: '#F5E8DF',
      ink: '#2F2621',
      'ink-soft': '#5F5249',
      line: '#E2D8CF',
      primary: '#9C4A2F',
      'primary-hover': '#803B25'
    },
    {
      paper: '#1C1714',
      surface: '#29211C',
      'offer-surface': '#29211C',
      apricot: '#3A2A21',
      ink: '#F7F2EE',
      'ink-soft': '#CBBBAF',
      line: '#54453B',
      primary: '#F0AE8F',
      'primary-hover': '#F5C6AF'
    }
  ),
  palette(
    'lavanda',
    'Lavanda',
    {
      paper: '#F6F5F9',
      surface: '#FFFFFF',
      'offer-surface': '#EEECF4',
      apricot: '#ECE8F6',
      ink: '#29253A',
      'ink-soft': '#57526B',
      line: '#DCD8E6',
      primary: '#5B3FA0',
      'primary-hover': '#4A3285'
    },
    {
      paper: '#18161F',
      surface: '#23202D',
      'offer-surface': '#23202D',
      apricot: '#2E2840',
      ink: '#F4F2F8',
      'ink-soft': '#C1BBD2',
      line: '#48425A',
      primary: '#C4B2F2',
      'primary-hover': '#D6CAF6'
    }
  ),
  palette(
    'grafite',
    'Grafite',
    {
      paper: '#F5F5F5',
      surface: '#FFFFFF',
      'offer-surface': '#ECECEC',
      apricot: '#E9E9EA',
      ink: '#1F2022',
      'ink-soft': '#505257',
      line: '#D9D9DB',
      primary: '#2F3237',
      'primary-hover': '#1C1E21'
    },
    {
      paper: '#151617',
      surface: '#202124',
      'offer-surface': '#202124',
      apricot: '#2A2C30',
      ink: '#F4F4F5',
      'ink-soft': '#BDBFC4',
      line: '#45474C',
      primary: '#E4E5E7',
      'primary-hover': '#FFFFFF'
    }
  ),
  palette(
    'mostarda',
    'Mostarda',
    {
      paper: '#F9F7F0',
      surface: '#FFFFFF',
      'offer-surface': '#F2EEE0',
      apricot: '#F6EED3',
      ink: '#2B2718',
      'ink-soft': '#5B5540',
      line: '#E3DCC6',
      primary: '#8A6200',
      'primary-hover': '#6F4F00'
    },
    {
      paper: '#1B1912',
      surface: '#27241A',
      'offer-surface': '#27241A',
      apricot: '#383121',
      ink: '#F8F5EB',
      'ink-soft': '#CFC7AE',
      line: '#514A35',
      primary: '#F2C14E',
      'primary-hover': '#F6D27E'
    }
  )
]);

export const STOREFRONT_PALETTE_IDS = Object.freeze(STOREFRONT_PALETTES.map((entry) => entry.id));

export function isStorefrontPaletteId(value) {
  return typeof value === 'string' && STOREFRONT_PALETTE_IDS.includes(value);
}

export function resolveStorefrontPaletteId(themeOrId) {
  const raw =
    themeOrId && typeof themeOrId === 'object' && !Array.isArray(themeOrId)
      ? themeOrId.palette
      : themeOrId;
  return isStorefrontPaletteId(raw) ? raw : DEFAULT_STOREFRONT_PALETTE;
}

export function getStorefrontPalette(id) {
  const resolved = resolveStorefrontPaletteId(id);
  return STOREFRONT_PALETTES.find((entry) => entry.id === resolved);
}

/**
 * Non-default palette of a published menu (`structure.theme`) or a draft
 * (`structure.themeOverrides`); `null` keeps the base tokens.
 */
export function storefrontPaletteOf(menuOrDraft) {
  const structure = menuOrDraft?.structure;
  const id = structure?.theme?.palette ?? structure?.themeOverrides?.palette;
  return isStorefrontPaletteId(id) && id !== DEFAULT_STOREFRONT_PALETTE ? id : null;
}
