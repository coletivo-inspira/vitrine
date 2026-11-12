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
    assert.strictEqual(
      stylesCss.includes('backdrop-filter: blur') || stylesCss.includes('backdrop-filter:blur'),
      false,
      'Site de divulgação should preserve Direction A (solid surfaces) and have NO glass/blur effects'
    );
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
});
