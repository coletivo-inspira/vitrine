import { chromium } from 'playwright-chromium';
import { resolve } from 'node:path';
import { exec } from 'node:child_process';
import { mkdir } from 'node:fs/promises';

(async () => {
  console.log('Starting preview server...');
  const serverProcess = exec('node scripts/serve.mjs');

  // Wait 2 seconds for server to boot
  await new Promise(r => setTimeout(r, 2000));

  const targetDir = '/cursor/stores/bc-eda3ac10-4053-4841-9e17-ee3927f2a123/media/portal-editor';
  await mkdir(targetDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  // 1. Capture Editor on Desktop (1440x900)
  console.log('Capturing editor desktop screens...');
  const pageDesktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    isMobile: false
  });

  await pageDesktop.goto('http://127.0.0.1:4173/portal/', { waitUntil: 'load' });
  await pageDesktop.locator('#local-demo-button').click();
  await pageDesktop.waitForTimeout(1000);

  // Navigate to Minhas Vitrines section to make buttons visible
  await pageDesktop.locator('a[data-section="dashboard"]').first().click();
  await pageDesktop.waitForTimeout(1000);

  // Click on "Gerenciar Cardápio" to open the editor
  await pageDesktop.locator('button:has-text("Gerenciar Cardápio")').first().click();
  await pageDesktop.waitForTimeout(1000);

  // Save Editor Desktop Light Mode
  const editorLightPath = resolve(targetDir, 'portal-editor-desktop-light.png');
  await pageDesktop.screenshot({ path: editorLightPath });
  console.log(`Saved: ${editorLightPath}`);

  // Toggle Theme to Dark
  await pageDesktop.locator('.theme-toggle').first().click();
  await pageDesktop.waitForTimeout(1000);

  // Save Editor Desktop Dark Mode
  const editorDarkPath = resolve(targetDir, 'portal-editor-desktop-dark.png');
  await pageDesktop.screenshot({ path: editorDarkPath });
  console.log(`Saved: ${editorDarkPath}`);

  await pageDesktop.close();

  // 2. Capture Public Storefront Flow on Mobile (390x844)
  console.log('Capturing public flow mobile screens...');
  const pageMobile = await browser.newPage({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true
  });

  await pageMobile.goto('http://127.0.0.1:4173/loja1', { waitUntil: 'load' });
  await pageMobile.waitForTimeout(1000);

  // Save Public Flow Mobile Light Mode
  const flowLightPath = resolve(targetDir, 'public-flow-mobile-light.png');
  await pageMobile.screenshot({ path: flowLightPath });
  console.log(`Saved: ${flowLightPath}`);

  // Toggle Theme to Dark
  await pageMobile.locator('.theme-toggle').first().click();
  await pageMobile.waitForTimeout(1000);

  // Save Public Flow Mobile Dark Mode
  const flowDarkPath = resolve(targetDir, 'public-flow-mobile-dark.png');
  await pageMobile.screenshot({ path: flowDarkPath });
  console.log(`Saved: ${flowDarkPath}`);

  await pageMobile.close();

  // Cleanup
  await browser.close();
  serverProcess.kill();
  console.log('Screenshots completed!');
})().catch(e => {
  console.error('Error during screenshot capture:', e);
  process.exit(1);
});
