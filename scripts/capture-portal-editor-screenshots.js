import { chromium } from 'playwright-chromium';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const targetDir = '/cursor/stores/bc-eda3ac10-4053-4841-9e17-ee3927f2a123/media/portal-editor';

const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  stdio: 'ignore',
  detached: false
});

function fail(message) {
  server.kill('SIGTERM');
  throw new Error(message);
}

try {
  await new Promise((r) => setTimeout(r, 800));
  await mkdir(targetDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  const desktop = await browser.newPage({ viewport: { width: 1440, height: 1400 } });
  await desktop.goto('http://127.0.0.1:4173/portal/', { waitUntil: 'load' });
  await desktop.locator('#local-demo-button').click();
  await desktop.locator('a[data-section="dashboard"]').first().click();
  await desktop.locator('button:has-text("Gerenciar Cardápio")').first().click();
  await desktop.locator('#live-storefront-preview').getByText('Margherita').waitFor();
  await desktop.locator('#items-container input').first().waitFor();

  const editorLight = resolve(targetDir, 'portal-editor-desktop-light.png');
  await desktop.screenshot({ path: editorLight });
  await desktop.locator('.theme-toggle').first().click();
  await desktop.locator('#live-storefront-preview').getByRole('heading', { name: 'Calabresa', exact: true }).waitFor();
  const editorDark = resolve(targetDir, 'portal-editor-desktop-dark.png');
  await desktop.screenshot({ path: editorDark });
  await desktop.close();

  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });
  await mobile.goto('http://127.0.0.1:4173/loja1', { waitUntil: 'load' });
  await mobile.locator('#storefront-catalog').getByText('Margherita Verace').waitFor();
  await mobile.locator('.btn-qty[aria-label="Adicionar Margherita Verace"]').click();
  await mobile.getByText('1 item selecionado').waitFor();
  const flowLight = resolve(targetDir, 'public-flow-mobile-light.png');
  await mobile.screenshot({ path: flowLight });

  await mobile.getByRole('button', { name: 'Preencher dados' }).click();
  await mobile.getByText('Dados do seu pedido').waitFor();
  await mobile.locator('.theme-toggle').first().click();
  await mobile.locator('#public-sf-cust-name').fill('Ana Souza');
  const flowDark = resolve(targetDir, 'public-flow-mobile-dark.png');
  await mobile.screenshot({ path: flowDark });

  await browser.close();
  console.log('saved', editorLight);
  console.log('saved', editorDark);
  console.log('saved', flowLight);
  console.log('saved', flowDark);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}

if (process.exitCode) fail('screenshot capture failed');
