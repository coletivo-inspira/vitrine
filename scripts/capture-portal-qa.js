import { chromium } from 'playwright-chromium';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const targetDir = '/cursor/stores/bc-eda3ac10-4053-4841-9e17-ee3927f2a123/media/portal-qa';

const server = spawn(process.execPath, ['scripts/serve.mjs'], {
  stdio: 'ignore',
  detached: false
});

function fail(message) {
  server.kill('SIGTERM');
  throw new Error(message);
}

try {
  await new Promise((r) => setTimeout(r, 1000));
  await mkdir(targetDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });

  // 1. Desktop Flow (1280 x 850)
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 850 } });
  
  // Login Screen
  await desktop.goto('http://127.0.0.1:4173/portal/', { waitUntil: 'load' });
  await desktop.screenshot({ path: resolve(targetDir, 'portal-auth-desktop-light.png') });
  
  // Set dark theme programmatically for login screen
  await desktop.evaluate(() => {
    document.documentElement.dataset.theme = 'dark';
  });
  await desktop.waitForTimeout(300);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-auth-desktop-dark.png') });
  
  // Set back to light
  await desktop.evaluate(() => {
    document.documentElement.dataset.theme = 'light';
  });
  await desktop.waitForTimeout(200);

  // Login offline via Local Demo
  await desktop.locator('#local-demo-button').click();
  await desktop.waitForTimeout(800);
  
  // Home (Início)
  await desktop.screenshot({ path: resolve(targetDir, 'portal-home-desktop-light.png') });
  await desktop.locator('.theme-toggle').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-home-desktop-dark.png') });
  await desktop.locator('.theme-toggle').first().click(); // back to light
  await desktop.waitForTimeout(300);

  // Dashboard / Minhas Vitrines
  await desktop.locator('a[data-section="dashboard"]').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-dashboard-desktop-light.png') });
  await desktop.locator('.theme-toggle').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-dashboard-desktop-dark.png') });
  await desktop.locator('.theme-toggle').first().click(); // back to light
  await desktop.waitForTimeout(300);

  // Insights Panel
  await desktop.locator('a[data-section="insights"]').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-insights-desktop-light.png') });
  await desktop.locator('.theme-toggle').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-insights-desktop-dark.png') });
  await desktop.locator('.theme-toggle').first().click(); // back to light
  await desktop.waitForTimeout(300);

  // Perfil e Interesses
  await desktop.locator('a[data-section="perfil"]').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-perfil-desktop-light.png') });
  await desktop.locator('.theme-toggle').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-perfil-desktop-dark.png') });
  await desktop.locator('.theme-toggle').first().click(); // back to light
  await desktop.waitForTimeout(300);

  // Pedidos de Customização
  await desktop.locator('a[data-section="pedidos"]').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-pedidos-desktop-light.png') });
  await desktop.locator('.theme-toggle').first().click();
  await desktop.waitForTimeout(500);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-pedidos-desktop-dark.png') });
  await desktop.locator('.theme-toggle').first().click(); // back to light
  await desktop.waitForTimeout(300);

  // 3-Step Wizard (Opening it)
  await desktop.locator('a[data-section="dashboard"]').first().click();
  await desktop.locator('#wizard-open-btn').click();
  await desktop.waitForTimeout(500);
  // Step 1
  await desktop.screenshot({ path: resolve(targetDir, 'portal-wizard-step1-desktop-light.png') });
  await desktop.locator('#wizard-step-1 .wizard-next-btn').click();
  await desktop.waitForTimeout(300);
  // Step 2
  await desktop.screenshot({ path: resolve(targetDir, 'portal-wizard-step2-desktop-light.png') });
  await desktop.locator('#wizard-step-2 .wizard-next-btn').click();
  await desktop.waitForTimeout(300);
  // Step 3
  await desktop.screenshot({ path: resolve(targetDir, 'portal-wizard-step3-desktop-light.png') });
  
  // Exit wizard by clicking dashboard link in sidebar
  await desktop.locator('a[data-section="dashboard"]').first().click();
  await desktop.waitForTimeout(500);

  // Editor (Gerenciar Cardápio)
  await desktop.locator('button:has-text("Gerenciar Cardápio")').first().click();
  await desktop.waitForTimeout(1000);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-editor-desktop-light.png') });
  await desktop.locator('.theme-toggle').first().click();
  await desktop.waitForTimeout(800);
  await desktop.screenshot({ path: resolve(targetDir, 'portal-editor-desktop-dark.png') });
  
  await desktop.close();


  // 2. Mobile Flow (390 x 844)
  const mobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  // Storefront Public Flow (loja1)
  await mobile.goto('http://127.0.0.1:4173/loja1', { waitUntil: 'load' });
  await mobile.waitForTimeout(800);
  await mobile.screenshot({ path: resolve(targetDir, 'storefront-public-mobile-light.png') });
  await mobile.locator('.theme-toggle').first().click();
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: resolve(targetDir, 'storefront-public-mobile-dark.png') });
  await mobile.locator('.theme-toggle').first().click(); // back to light
  await mobile.waitForTimeout(300);

  // Select item & click "Preencher dados"
  await mobile.locator('.btn-qty[aria-label="Adicionar Margherita Verace"]').click();
  await mobile.waitForTimeout(300);
  await mobile.getByRole('button', { name: 'Preencher dados' }).click();
  await mobile.waitForTimeout(500);
  await mobile.screenshot({ path: resolve(targetDir, 'storefront-details-mobile-light.png') });

  // Fill in name
  await mobile.locator('#public-sf-cust-name').fill('Ana Souza');
  await mobile.waitForTimeout(300);
  await mobile.screenshot({ path: resolve(targetDir, 'storefront-filled-mobile-light.png') });

  await mobile.close();
  await browser.close();
  
  console.log('All QA screenshots captured and saved to', targetDir);
} catch (error) {
  console.error('Error during QA capture:', error);
  process.exitCode = 1;
} finally {
  server.kill('SIGTERM');
}

if (process.exitCode) fail('QA screenshot capture failed');
