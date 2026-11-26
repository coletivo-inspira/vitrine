import { STOREFRONT_PALETTES, getStorefrontPalette, resolveStorefrontPaletteId } from '../assets/storefront-palettes.mjs';

let pickerCount = 0;

function el(doc, tag, className = '', text = '') {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

/**
 * "Cores da vitrine": one native radio per palette inside a fieldset. Replaces the
 * contents of `container`. `onChange(id)` runs only on user choice; `setValue(id)`
 * syncs the selection silently (e.g. after reloading the draft).
 * Swatches read the `--sf-*` tokens of /assets/storefront-palettes.css via `data-palette`.
 */
export function renderPalettePicker({
  doc = globalThis.document,
  container,
  value,
  onChange,
  disabled = false,
  hint = ''
} = {}) {
  pickerCount += 1;
  const name = `palette-picker-${pickerCount}`;
  const fieldset = el(doc, 'fieldset', 'palette-picker');
  const legend = el(doc, 'legend', 'palette-picker-legend', 'Cores da vitrine');
  legend.id = `${name}-legend`;
  const help = el(doc, 'p', 'form-help palette-picker-help',
    hint || 'Paletas com contraste conferido nos temas claro e escuro. Uma cor de destaque própria, se houver, continua valendo nos botões.');
  help.id = `${name}-help`;

  const group = el(doc, 'div', 'palette-options');
  group.setAttribute('role', 'radiogroup');
  group.setAttribute('aria-labelledby', legend.id);
  group.setAttribute('aria-describedby', help.id);

  const status = el(doc, 'p', 'palette-picker-status');
  status.setAttribute('aria-live', 'polite');

  const inputs = new Map();
  let current = resolveStorefrontPaletteId(value);

  const sync = () => {
    for (const [id, input] of inputs) input.checked = id === current;
    status.textContent = `Paleta: ${getStorefrontPalette(current).label}`;
  };

  for (const palette of STOREFRONT_PALETTES) {
    const option = el(doc, 'label', 'palette-option');
    const input = doc.createElement('input');
    input.type = 'radio';
    input.className = 'palette-option-input';
    input.name = name;
    input.value = palette.id;
    input.id = `${name}-${palette.id}`;
    option.setAttribute('for', input.id);
    const swatch = el(doc, 'span', `palette-swatch palette-swatch--${palette.id}`);
    swatch.setAttribute('data-palette', palette.id);
    swatch.setAttribute('aria-hidden', 'true');
    option.append(input, swatch, el(doc, 'span', 'palette-option-name', palette.label));
    input.addEventListener('change', () => {
      if (!input.checked || current === palette.id) return;
      current = palette.id;
      sync();
      onChange?.(palette.id);
    });
    inputs.set(palette.id, input);
    group.appendChild(option);
  }

  fieldset.disabled = Boolean(disabled);
  fieldset.append(legend, help, group, status);
  sync();
  container?.replaceChildren(fieldset);

  return {
    setValue(id) {
      current = resolveStorefrontPaletteId(id);
      sync();
    }
  };
}
