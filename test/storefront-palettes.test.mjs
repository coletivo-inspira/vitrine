import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  DEFAULT_STOREFRONT_PALETTE,
  STOREFRONT_PALETTES,
  STOREFRONT_PALETTE_IDS,
  STOREFRONT_PALETTE_TOKENS,
  getStorefrontPalette,
  isStorefrontPaletteId,
  resolveStorefrontPaletteId,
  storefrontPaletteOf
} from '../web/assets/storefront-palettes.mjs';
import { PortalValidationError, validateDraftContent } from '../src/portal-validation.mjs';
import {
  assertNoPrivateLeakage,
  compilePublicStorefront,
  renderStorefrontHtml,
  renderStorefrontItemHtml
} from '../src/publication-engine.mjs';
import {
  extractShowcaseOverrides,
  projectShowcaseManifest,
  resolveShowcaseManifest
} from '../src/showcase-structure.mjs';
import { applyPreviewPalette } from '../web/assets/storefront-renderer.mjs';
import { renderPalettePicker } from '../web/portal/palette-picker.mjs';
import {
  canChooseStructurePalette,
  getStructurePalette,
  renderStructureFields,
  setStructurePalette
} from '../web/portal/showcase-structure.js';
import { applyStorefrontPalette } from '../web/vitrine/vitrine.js';
import { heroPhotoDraft } from './fixtures/hero-photo-storefront.mjs';

const readText = (path) => readFile(new URL(path, import.meta.url), 'utf8');

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

// Pares de cor usados em web/vitrine/vitrine.css e na prévia do portal.
// Texto: 4.5:1. Sobre `apricot` (hero, mensagem do WhatsApp e selos) o texto de destaque usa
// `primary-hover`; `primary` sobre `apricot`/`offer-surface` só aparece em bordas, ícones e
// fundos de hover, então vale o mínimo de componente: 3:1.
const TEXT_PAIRS = [
  ...['ink', 'ink-soft'].flatMap((fg) =>
    ['paper', 'surface', 'apricot', 'offer-surface'].map((bg) => [fg, bg])
  ),
  ['primary', 'paper'],
  ['primary', 'surface'],
  ['primary-hover', 'apricot'],
  ['action-text', 'primary'],
  ['action-text', 'primary-hover']
];
const UI_PAIRS = [
  ['primary', 'apricot'],
  ['primary', 'offer-surface']
];

const site = (draft) => ({ slug: draft.slug, name: draft.businessName, template: draft.template });
const compile = (draft) => compilePublicStorefront(draft, site(draft), {
  revision: 1, publishedAt: '2026-11-26T00:00:00.000Z'
});

async function draftWithPalette(palette) {
  const draft = await heroPhotoDraft();
  if (palette !== undefined) draft.structure.themeOverrides = { palette };
  return draft;
}

function fakeDocument() {
  const doc = {
    createElement(tag) {
      const classes = new Set();
      let text = '';
      const node = {
        tagName: tag.toUpperCase(),
        ownerDocument: doc,
        children: [],
        attributes: {},
        listeners: {},
        dataset: {},
        id: '', type: '', name: '', value: '', checked: false, disabled: false, hidden: false,
        get className() { return [...classes].join(' '); },
        set className(value) {
          classes.clear();
          String(value || '').split(/\s+/).filter(Boolean).forEach((entry) => classes.add(entry));
        },
        classList: {
          add: (...names) => names.forEach((entry) => classes.add(entry)),
          remove: (...names) => names.forEach((entry) => classes.delete(entry)),
          contains: (entry) => classes.has(entry)
        },
        get textContent() {
          return node.children.length ? node.children.map((child) => child.textContent ?? '').join('') : text;
        },
        set textContent(value) {
          node.children = [];
          text = String(value ?? '');
        },
        appendChild(child) { node.children.push(child); return child; },
        append(...nodes) { node.children.push(...nodes.filter(Boolean)); },
        replaceChildren(...nodes) { node.children = [...nodes]; },
        setAttribute(key, value) { node.attributes[key] = String(value); },
        getAttribute(key) { return node.attributes[key] ?? null; },
        removeAttribute(key) { delete node.attributes[key]; },
        addEventListener(type, listener) { (node.listeners[type] ??= []).push(listener); }
      };
      return node;
    }
  };
  return doc;
}

const walk = (node) => [node, ...(node.children ?? []).flatMap(walk)];

test('8 paletas com ids únicos, rótulos e todos os tokens em hexadecimal', () => {
  assert.equal(STOREFRONT_PALETTES.length, 8);
  assert.deepEqual(STOREFRONT_PALETTE_IDS, [
    'inspira', 'vinho', 'oceano', 'floresta', 'terracota', 'lavanda', 'grafite', 'mostarda'
  ]);
  assert.equal(STOREFRONT_PALETTE_IDS[0], DEFAULT_STOREFRONT_PALETTE);
  for (const palette of STOREFRONT_PALETTES) {
    assert.match(palette.id, /^[a-z]+$/);
    assert.ok(palette.label.length > 2);
    for (const mode of ['light', 'dark']) {
      assert.deepEqual(Object.keys(palette[mode]).sort(), [...STOREFRONT_PALETTE_TOKENS].sort(), `${palette.id} ${mode}`);
      for (const value of Object.values(palette[mode])) assert.match(value, /^#[0-9A-F]{6}$/);
    }
  }
});

test('a paleta Inspira repete os tokens padrão de vitrine.css', async () => {
  const css = await readText('../web/vitrine/vitrine.css');
  const inspira = getStorefrontPalette('inspira');
  const block = (selector) => css.slice(css.indexOf(`${selector} {`), css.indexOf('}', css.indexOf(`${selector} {`)));
  for (const [mode, selector] of [['light', ':root'], ['dark', 'html[data-theme="dark"]']]) {
    const text = block(selector);
    for (const token of STOREFRONT_PALETTE_TOKENS) {
      assert.match(text, new RegExp(`--${token}: ${inspira[mode][token]};`, 'i'), `${mode} --${token}`);
    }
  }
});

test('todas as paletas atendem WCAG AA nos temas claro e escuro', () => {
  for (const palette of STOREFRONT_PALETTES) {
    for (const mode of ['light', 'dark']) {
      const tokens = palette[mode];
      for (const [fg, bg] of TEXT_PAIRS) {
        const ratio = contrast(tokens[fg], tokens[bg]);
        assert.ok(ratio >= 4.5, `${palette.id} ${mode}: ${fg} sobre ${bg} = ${ratio.toFixed(2)}`);
      }
      for (const [fg, bg] of UI_PAIRS) {
        const ratio = contrast(tokens[fg], tokens[bg]);
        assert.ok(ratio >= 3, `${palette.id} ${mode}: ${fg} sobre ${bg} = ${ratio.toFixed(2)}`);
      }
    }
  }
});

function assertCssMirrorsPalettes(css, palettes) {
  for (const palette of palettes) {
    const lightMatch = css.match(new RegExp(`(?:^|\\n)\\[data-palette="${palette.id}"\\] \\{([^}]*)\\}`));
    const darkMatch = css.match(
      new RegExp(`\\[data-theme="dark"\\]\\[data-palette="${palette.id}"\\],\\s*\\[data-theme="dark"\\] \\[data-palette="${palette.id}"\\] \\{([^}]*)\\}`)
    );
    assert.ok(lightMatch && darkMatch, `blocos de ${palette.id}`);
    for (const [mode, body] of [['light', lightMatch[1]], ['dark', darkMatch[1]]]) {
      const declared = Object.fromEntries(
        [...body.matchAll(/--sf-([a-z-]+):\s*(#[0-9A-Fa-f]{6});/g)].map((m) => [m[1], m[2].toUpperCase()])
      );
      assert.deepEqual(declared, { ...palette[mode] }, `${palette.id} ${mode}`);
    }
  }
  const declaredIds = [...css.matchAll(/(?:^|\n)\[data-palette="([a-z]+)"\] \{/g)].map((m) => m[1]);
  assert.deepEqual(declaredIds, palettes.map((palette) => palette.id));
}

test('storefront-palettes.css espelha exatamente o módulo e mapeia os tokens da vitrine', async () => {
  const css = await readText('../web/assets/storefront-palettes.css');
  assertCssMirrorsPalettes(css, STOREFRONT_PALETTES);
  const map = css.match(/\nbody\[data-palette\] \{([^}]*)\}/);
  assert.ok(map, 'mapeia --sf-* nos tokens de vitrine.css');
  for (const token of STOREFRONT_PALETTE_TOKENS) {
    assert.match(map[1], new RegExp(`--${token}: var\\(--sf-${token}\\);`));
  }
});

test('resolve paleta ausente ou desconhecida para o padrão e lê artefato ou rascunho', () => {
  assert.equal(resolveStorefrontPaletteId(undefined), DEFAULT_STOREFRONT_PALETTE);
  assert.equal(resolveStorefrontPaletteId({ palette: 'neon' }), DEFAULT_STOREFRONT_PALETTE);
  assert.equal(resolveStorefrontPaletteId('oceano'), 'oceano');
  assert.equal(isStorefrontPaletteId('__proto__'), false);
  assert.equal(storefrontPaletteOf({ structure: { theme: { palette: 'vinho' } } }), 'vinho');
  assert.equal(storefrontPaletteOf({ structure: { themeOverrides: { palette: 'oceano' } } }), 'oceano');
  assert.equal(storefrontPaletteOf({ structure: { theme: { palette: 'inspira' } } }), null);
  assert.equal(storefrontPaletteOf({ structure: { theme: { palette: 'neon' } } }), null);
  assert.equal(storefrontPaletteOf({}), null);
});

test('validação: structure.themeOverrides.palette só aceita a lista de paletas', async () => {
  const draft = await heroPhotoDraft();
  assert.doesNotThrow(() => validateDraftContent(draft));
  for (const id of STOREFRONT_PALETTE_IDS) {
    assert.equal(resolveShowcaseManifest({ themeOverrides: { palette: id } }).theme.palette, id);
    assert.doesNotThrow(() => validateDraftContent({ ...draft, structure: { ...draft.structure, themeOverrides: { palette: id } } }));
  }
  for (const palette of ['neon', 42, '', '__proto__', 'url(javascript:alert(1))', 'VINHO']) {
    assert.throws(
      () => resolveShowcaseManifest({ themeOverrides: { palette } }),
      (err) => err instanceof PortalValidationError && err.code === 'INVALID_STRUCTURE',
      JSON.stringify(palette)
    );
    assert.throws(
      () => validateDraftContent({ ...draft, structure: { ...draft.structure, themeOverrides: { palette } } }),
      (err) => err instanceof PortalValidationError && err.status === 422 && err.code === 'INVALID_PALETTE',
      JSON.stringify(palette)
    );
  }
});

test('paleta escolhida vence a cor do modelo; cor própria na mesma camada vence a paleta', () => {
  const template = { defaultTokens: { accentColor: '#0F766E', fontPair: 'modern-inter', buttonStyle: 'pill' } };
  assert.deepEqual(resolveShowcaseManifest({}, template).theme, template.defaultTokens);
  assert.deepEqual(resolveShowcaseManifest({ themeOverrides: { palette: 'vinho' } }, template).theme,
    { fontPair: 'modern-inter', buttonStyle: 'pill', palette: 'vinho' });
  assert.deepEqual(resolveShowcaseManifest({ themeOverrides: { palette: 'vinho', accentColor: '#1E3A8A' } }, template).theme,
    { accentColor: '#1E3A8A', fontPair: 'modern-inter', buttonStyle: 'pill', palette: 'vinho' });

  const resolved = resolveShowcaseManifest({ themeOverrides: { palette: 'vinho' } }, template);
  const stored = extractShowcaseOverrides(resolved, template, {}, {});
  assert.deepEqual(stored.themeOverrides, { palette: 'vinho' });
  assert.deepEqual(resolveShowcaseManifest(stored, template).theme, resolved.theme);
});

test('publicação omite a paleta padrão: mesmo artefato e mesmo hash de quem não escolheu', async () => {
  const plain = await compile(await draftWithPalette());
  const explicitDefault = await compile(await draftWithPalette(DEFAULT_STOREFRONT_PALETTE));
  assert.equal(Object.hasOwn(plain.menu.structure.theme, 'palette'), false);
  assert.doesNotMatch(plain.json, /palette/);
  assert.equal(explicitDefault.json, plain.json);
  assert.equal(explicitDefault.hash, plain.hash);

  const legacy = JSON.parse(await readText('../content/vitrines/loja1.json'));
  const legacyCompiled = await compile(legacy);
  assert.doesNotMatch(legacyCompiled.json, /palette/);

  const colored = await compile(await draftWithPalette('floresta'));
  assert.equal(colored.menu.structure.theme.palette, 'floresta');
  assert.notEqual(colored.hash, plain.hash);
  assert.ok(Object.isFrozen(colored.menu.structure.theme));
  assert.doesNotThrow(() => assertNoPrivateLeakage(colored.menu));
  assert.deepEqual(projectShowcaseManifest({ themeOverrides: { palette: 'inspira' } }).theme, {});
});

test('artefato público recusa paleta padrão explícita ou fora da lista', async () => {
  const { menu } = await compile(await draftWithPalette('floresta'));
  for (const palette of ['inspira', 'neon', 7]) {
    const tampered = { ...menu, structure: { ...menu.structure, theme: { ...menu.structure.theme, palette } } };
    assert.throws(
      () => assertNoPrivateLeakage(tampered),
      (err) => err instanceof PortalValidationError && ['PRIVATE_FIELD_LEAKAGE', 'INVALID_STRUCTURE'].includes(err.code),
      JSON.stringify(palette)
    );
  }
});

test('HTML público aplica a paleta por atributo no body, sem estilos inline', async () => {
  const { menu: colored } = await compile(await draftWithPalette('lavanda'));
  const { menu: plain } = await compile(await draftWithPalette());

  const html = renderStorefrontHtml(colored);
  assert.match(html, /<body data-storefront-slug="forno-praca-destaques"[^>]* data-palette="lavanda">/);
  const paletteLink = '<link rel="stylesheet" href="/assets/storefront-palettes.css">\n  ';
  assert.match(html, /<link rel="stylesheet" href="\/vitrine\/vitrine\.css">\s*<link rel="stylesheet" href="\/assets\/storefront-palettes\.css">/);
  assert.doesNotMatch(html, /\sstyle=/);

  const plainHtml = renderStorefrontHtml(plain);
  assert.doesNotMatch(plainHtml, /data-palette|storefront-palettes\.css/);
  assert.equal(plainHtml.match(/<link rel="stylesheet"/g).length, 1, 'sem paleta, uma única folha de estilo');
  assert.equal(plainHtml, html.replace(' data-palette="lavanda"', '').replace(paletteLink, ''), 'sem paleta, o HTML não muda');

  const itemHtml = renderStorefrontItemHtml(colored, colored.items[0].id);
  assert.match(itemHtml, /<body data-storefront-slug="forno-praca-destaques"[^>]* data-palette="lavanda"/);
});

test('vitrine.css, vitrine pública e prévia do portal consomem a paleta', async () => {
  const [vitrineCss, vitrineHtml, vitrineJs, renderer, pickerCss, pickerJs] = await Promise.all([
    readText('../web/vitrine/vitrine.css'),
    readText('../web/vitrine/index.html'),
    readText('../web/vitrine/vitrine.js'),
    readText('../web/assets/storefront-renderer.mjs'),
    readText('../web/portal/palette-picker.css'),
    readText('../web/portal/palette-picker.mjs')
  ]);

  assert.doesNotMatch(vitrineCss, /data-palette|--sf-/, 'quem não escolhe paleta não baixa os tokens');
  for (const selector of ['.storefront-eyebrow', '.sf-wa-message-label', '.sf-mode-badge', '.sf-auction-status.is-open']) {
    const rule = vitrineCss.match(new RegExp(`\\n${selector.replaceAll('.', '\\.')} \\{([^}]*)\\}`));
    assert.match(rule[1], /color: var\(--primary-hover\);/, `${selector} sobre apricot usa primary-hover`);
  }
  assert.equal(vitrineHtml.match(/<link rel="stylesheet"/g).length, 1);
  assert.match(vitrineJs, /applyStorefrontPalette\(doc, storefrontPaletteOf\(menu\)\)/);
  assert.match(pickerCss, /^[\s\S]*?\*\/\s*@import url\("\.\.\/assets\/storefront-palettes\.css"\);/);

  const previewMap = pickerCss.match(/\.live-preview-box\[data-palette\] \{([^}]*)\}/);
  assert.ok(previewMap, 'palette-picker.css mapeia a paleta na prévia');
  for (const [portalVar, token] of [
    ['paper', 'paper'], ['white', 'surface'], ['apricot', 'apricot'], ['ink', 'ink'],
    ['ink-soft', 'ink-soft'], ['line', 'line'], ['orange', 'primary'], ['orange-hover', 'primary-hover']
  ]) {
    assert.match(previewMap[1], new RegExp(`--${portalVar}: var\\(--sf-${token}\\);`));
  }
  assert.match(pickerCss, /\.palette-option \{[^}]*min-width: 44px;[^}]*min-height: 44px;/);
  assert.match(pickerCss, /\.palette-option:has\(\.palette-option-input:focus-visible\) \{[^}]*outline: 3px solid var\(--orange\);/);
  for (const code of [vitrineJs, renderer, pickerJs]) assert.doesNotMatch(code, /\.style\./);
  assert.doesNotMatch(pickerJs, /innerHTML|style=/);

  const page = fakeDocument();
  page.body = page.createElement('body');
  page.head = page.createElement('head');
  page.querySelector = (selector) => walk(page.head).find((node) => selector === `link[href="${node.href}"]`) ?? null;
  applyStorefrontPalette(page, null);
  assert.equal(page.head.children.length, 0);
  applyStorefrontPalette(page, 'grafite');
  applyStorefrontPalette(page, 'grafite');
  assert.equal(page.body.getAttribute('data-palette'), 'grafite');
  assert.deepEqual(page.head.children.map((node) => [node.rel, node.href]), [['stylesheet', '/assets/storefront-palettes.css']]);

  const preview = fakeDocument().createElement('div');
  assert.equal(applyPreviewPalette(preview, { structure: { themeOverrides: { palette: 'oceano' } } }), 'oceano');
  assert.equal(preview.getAttribute('data-palette'), 'oceano');
  applyPreviewPalette(preview, { structure: {} });
  assert.equal(preview.getAttribute('data-palette'), null);
});

test('seletor "Cores da vitrine": rádios nativos, amostras por classe e aviso educado', () => {
  const doc = fakeDocument();
  const container = doc.createElement('div');
  const chosen = [];
  const picker = renderPalettePicker({ doc, container, value: 'vinho', onChange: (id) => chosen.push(id) });

  const [fieldset] = container.children;
  assert.equal(fieldset.tagName, 'FIELDSET');
  const nodes = walk(fieldset);
  const legend = nodes.find((node) => node.tagName === 'LEGEND');
  assert.equal(legend.textContent, 'Cores da vitrine');
  const group = nodes.find((node) => node.getAttribute?.('role') === 'radiogroup');
  assert.equal(group.getAttribute('aria-labelledby'), legend.id);

  const radios = nodes.filter((node) => node.tagName === 'INPUT');
  assert.deepEqual(radios.map((radio) => radio.value), STOREFRONT_PALETTE_IDS);
  assert.ok(radios.every((radio) => radio.type === 'radio' && radio.name === radios[0].name));
  const labels = nodes.filter((node) => node.tagName === 'LABEL');
  assert.deepEqual(labels.map((label) => label.getAttribute('for')), radios.map((radio) => radio.id));
  assert.deepEqual(labels.map((label) => label.textContent), STOREFRONT_PALETTES.map((palette) => palette.label));
  for (const id of STOREFRONT_PALETTE_IDS) {
    const swatch = nodes.find((node) => node.className === `palette-swatch palette-swatch--${id}`);
    assert.ok(swatch, id);
    assert.equal(swatch.getAttribute('data-palette'), id);
    assert.equal(swatch.getAttribute('aria-hidden'), 'true');
  }
  assert.ok(nodes.every((node) => !node.attributes || !Object.hasOwn(node.attributes, 'style')));

  const status = nodes.find((node) => node.getAttribute?.('aria-live') === 'polite');
  assert.equal(status.textContent, 'Paleta: Vinho');
  assert.equal(radios.find((radio) => radio.checked).value, 'vinho');

  const floresta = radios.find((radio) => radio.value === 'floresta');
  floresta.checked = true;
  floresta.listeners.change[0]();
  assert.deepEqual(chosen, ['floresta']);
  assert.equal(status.textContent, 'Paleta: Floresta');

  picker.setValue('oceano');
  assert.deepEqual(chosen, ['floresta'], 'setValue não dispara onChange');
  assert.equal(radios.find((radio) => radio.checked).value, 'oceano');
  picker.setValue('neon');
  assert.equal(status.textContent, 'Paleta: Inspira');

  const disabledBox = doc.createElement('div');
  renderPalettePicker({ doc, container: disabledBox, value: null, disabled: true });
  assert.equal(disabledBox.children[0].disabled, true);
});

test('estrutura da vitrine: helpers do rascunho e o painel não perdem a paleta', async () => {
  const withStructure = { slug: 'x', structure: { themeOverrides: { accentColor: '#1E3A8A' }, pages: [] } };
  assert.equal(canChooseStructurePalette(withStructure), true);
  assert.equal(canChooseStructurePalette({ slug: 'x' }), false);
  assert.equal(getStructurePalette(withStructure), null);

  const colored = setStructurePalette(withStructure, 'terracota');
  assert.notEqual(colored, withStructure);
  assert.deepEqual(colored.structure.themeOverrides, { accentColor: '#1E3A8A', palette: 'terracota' });
  assert.equal(withStructure.structure.themeOverrides.palette, undefined, 'não altera o objeto original');
  assert.equal(getStructurePalette(colored), 'terracota');
  assert.deepEqual(setStructurePalette(colored, '').structure.themeOverrides, { accentColor: '#1E3A8A' });
  assert.equal(Object.hasOwn(setStructurePalette({ structure: {} }, null).structure, 'themeOverrides'), false);
  const legacy = { slug: 'x' };
  assert.equal(setStructurePalette(legacy, 'vinho'), legacy, 'sem estrutura a paleta não é gravada');

  const submit = async (choices) => {
    const doc = fakeDocument();
    const root = doc.createElement('div');
    let saved = null;
    renderStructureFields(root, {
      theme: { fontPair: 'editorial-syne', palette: 'vinho' }, navigation: { header: [], footer: [] }, pages: []
    }, async (payload) => { saved = payload; }, [], null, choices);
    const [form] = root.children;
    assert.ok(walk(form).every((node) => node.value !== 'vinho'), 'o painel não mostra campo de paleta');
    await form.listeners.submit[0]({ preventDefault() {} });
    return saved.themeOverrides;
  };
  assert.deepEqual(await submit(null), { fontPair: 'editorial-syne', palette: 'vinho' });
  assert.deepEqual(await submit({ readPalette: () => 'mostarda' }), { fontPair: 'editorial-syne', palette: 'mostarda' });
  assert.deepEqual(await submit({ readPalette: () => null }), { fontPair: 'editorial-syne' });
});
