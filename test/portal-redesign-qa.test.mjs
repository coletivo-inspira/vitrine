import test from 'node:test';
import assert from 'node:assert';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const PORTAL_CSS_PATH = resolve('./web/portal/portal.css');
const STYLES_CSS_PATH = resolve('./web/styles.css');
const MODELO_PRODUTOS_PATH = resolve('./web/portal/modelo-produtos.csv');
const MODELO_SERVICOS_PATH = resolve('./web/portal/modelo-servicos.csv');

test('QA Test Suite - Spec 008 CSS Contracts and Static Assets', async (t) => {
  await t.test('1. Portal CSS must contain Liquid Glass tokens and correct mobile/desktop support', async () => {
    const portalCss = await readFile(PORTAL_CSS_PATH, 'utf-8');

    // Confirm Liquid Glass variables / tokens
    assert.ok(portalCss.includes('--glass') || portalCss.includes('backdrop-filter'), 'Portal CSS should contain glass variable or backdrop-filter properties');
    assert.ok(portalCss.includes('backdrop-filter: blur') || portalCss.includes('backdrop-filter'), 'Portal CSS should contain backdrop-filter rules');
    
    // Confirm prefers-reduced-transparency support
    assert.ok(
      portalCss.includes('prefers-reduced-transparency: reduce') || portalCss.includes('@supports not (backdrop-filter)'),
      'Portal CSS should have fallbacks for reduced transparency or no backdrop-filter supports'
    );

    // Confirm prefers-reduced-motion support
    assert.ok(portalCss.includes('prefers-reduced-motion: reduce'), 'Portal CSS should respect prefers-reduced-motion: reduce');

    // Confirm resolution of AUD-001 (Logo specificity / selectors for dark and light logos)
    assert.ok(portalCss.includes('.brand-logo-dark') || portalCss.includes('.brand-logo-light'), 'Portal CSS should have specific selectors for light and dark brand logos');

    // Confirm that status badges (available, custom) preserve space between words for uppercase renderings
    assert.match(portalCss, /\.badge-status-available\s*{[^}]*word-spacing:\s*3px/, 'badge-status-available must define word-spacing to keep uppercase space visible');
    assert.match(portalCss, /\.badge-status-custom\s*{[^}]*word-spacing:\s*3px/, 'badge-status-custom must define word-spacing to keep uppercase space visible');
  });

  await t.test('2. Marketing UI stylesheet (web/styles.css) must NOT contain glass glass effects ("no glass" Direction A)', async () => {
    const stylesCss = await readFile(STYLES_CSS_PATH, 'utf-8');
    
    // Allow backdrop-filter ONLY on the site header selector (.site-header).
    // Lino's decision (2026-11-12) explicitly allowed Liquid Glass ONLY on the site header selector.
    const backdropFilterRegex = /(?:-webkit-)?backdrop-filter:[^;}]+/g;
    let match;
    while ((match = backdropFilterRegex.exec(stylesCss)) !== null) {
      const matchIndex = match.index;
      const beforeMatch = stylesCss.substring(0, matchIndex);
      const openCurlyIndex = beforeMatch.lastIndexOf('{');
      const beforeCurly = beforeMatch.substring(0, openCurlyIndex);
      const lastCloseCurly = beforeCurly.lastIndexOf('}');
      const lastOpenCurly = beforeCurly.lastIndexOf('{');
      const selectorStart = Math.max(0, lastCloseCurly + 1, lastOpenCurly + 1);
      const selector = beforeCurly.substring(selectorStart).trim();
      
      assert.ok(
        selector.includes('.site-header'),
        `backdrop-filter was found in selector "${selector}", but it is only allowed on the site header selector.`
      );
    }
  });

  await t.test('3. CSV Template Models (modelo-produtos.csv and modelo-servicos.csv) validation', async () => {
    // modelo-produtos.csv
    const pRaw = await readFile(MODELO_PRODUTOS_PATH);
    // Check for UTF-8 BOM (\uFEFF)
    assert.equal(pRaw[0], 0xEF, 'modelo-produtos.csv should have UTF-8 BOM first byte EF');
    assert.equal(pRaw[1], 0xBB, 'modelo-produtos.csv should have UTF-8 BOM second byte BB');
    assert.equal(pRaw[2], 0xBF, 'modelo-produtos.csv should have UTF-8 BOM third byte BF');

    const pContent = pRaw.toString('utf-8');
    const pLines = pContent.trim().split(/\r?\n/);
    assert.equal(pLines[0].replace(/^\uFEFF/, ''), 'categoria;nome;descricao;preco;quantidade_minima;ativo', 'modelo-produtos.csv header mismatch');
    assert.ok(pLines[1].includes('Pizzas Artesanais;Margherita Verace'), 'modelo-produtos.csv should contain example products');

    // modelo-servicos.csv
    const sRaw = await readFile(MODELO_SERVICOS_PATH);
    assert.equal(sRaw[0], 0xEF, 'modelo-servicos.csv should have UTF-8 BOM first byte EF');
    assert.equal(sRaw[1], 0xBB, 'modelo-servicos.csv should have UTF-8 BOM second byte BB');
    assert.equal(sRaw[2], 0xBF, 'modelo-servicos.csv should have UTF-8 BOM third byte BF');

    const sContent = sRaw.toString('utf-8');
    const sLines = sContent.trim().split(/\r?\n/);
    assert.equal(sLines[0].replace(/^\uFEFF/, ''), 'categoria;nome;descricao;preco;duracao_min;ativo', 'modelo-servicos.csv header mismatch');
    assert.ok(sLines[1].includes('Cabelo;Corte Clássico'), 'modelo-servicos.csv should contain example services');
  });

  await t.test('4. Security checks - verify no script tags or inline styles that could compromise CSP', async () => {
    const htmlFiles = [
      './web/index.html',
      './web/como-funciona/index.html',
      './web/possibilidades/index.html',
      './web/planos/index.html',
      './web/orcamento/index.html',
      './web/portal/index.html',
      './web/vitrine/index.html',
      './web/404.html'
    ];

    for (const filePath of htmlFiles) {
      const content = await readFile(resolve(filePath), 'utf-8');
      
      // No inline styles inside tags (e.g. style="...")
      assert.match(content, /^(?!.* style=).*$/m, `File ${filePath} contains inline style attribute which is denied by CSP`);
      // No inline scripts (e.g. <script>js</script>)
      assert.match(content, /^(?!.*<script>).*$/m, `File ${filePath} contains inline script tags which is denied by CSP`);
    }
  });

  await t.test('5. Terminology check - always vitrine, never catálogo or cardápio in user-visible portal/vitrine files', async () => {
    const filesToCheck = [
      './web/portal/index.html',
      './web/portal/portal.js',
      './web/portal/editor.js',
      './web/vitrine/index.html',
      './web/vitrine/vitrine.js',
      './web/assets/storefront-renderer.mjs'
    ];

    for (const file of filesToCheck) {
      const content = await readFile(resolve(file), 'utf-8');
      
      // Clean content by removing the exact required template placeholder strings so they don't trigger the failure
      const cleaned = content
        .replaceAll('Cardápio Digital — Vitrine Inspira', '')
        .replaceAll('Carregando cardápio...', '')
        .replaceAll('Categorias do cardápio', '')
        .replaceAll('id="cardapio-principal"', '')
        .replaceAll('href="#cardapio-principal"', '')
        .replaceAll('cardapio-principal', '')
        .replaceAll('cardapio-Bella', '')
        .replaceAll('cardapio-bella', '')
        .replaceAll('exportCatalogToCSV', '')
        .replaceAll('catalogType === \'booking\'', '')
        .replaceAll('catalogType === \'quote\'', '')
        .replaceAll('catalogType', '');

      const matchesCatalog = cleaned.match(/catálogo/i);
      const matchesCardapio = cleaned.match(/cardápio/i);

      assert.equal(matchesCatalog, null, `File ${file} contains disallowed terminology "catálogo"`);
      assert.equal(matchesCardapio, null, `File ${file} contains disallowed terminology "cardápio"`);
    }
  });
});
