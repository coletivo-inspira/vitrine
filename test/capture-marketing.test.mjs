import { chromium } from 'playwright-chromium';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';
import test from 'node:test';

test('capture marketing screenshots', async () => {
  const targetDir = '/cursor/stores/bc-eda3ac10-4053-4841-9e17-ee3927f2a123/media/mila/';
  await mkdir(targetDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { width: 1440, height: 900, isMobile: false, name: 'desktop' },
    { width: 390, height: 844, isMobile: true, name: 'mobile' }
  ];

  const pages = [
    { path: '/', name: 'home' },
    { path: '/como-funciona/', name: 'como-funciona' },
    { path: '/possibilidades/', name: 'possibilidades' },
    { path: '/planos/', name: 'planos' },
    { path: '/orcamento/', name: 'orcamento' }
  ];

  for (const vp of viewports) {
    for (const p of pages) {
      const page = await browser.newPage({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        hasTouch: vp.isMobile
      });

      const url = `http://127.0.0.1:4173${p.path}`;
      console.log(`Navigating to ${url} (${vp.name})...`);
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(1000); // Wait for animations/load stability

      // Light mode screenshot
      const lightFile = `${p.name}-${vp.name}-light.png`;
      const lightPath = resolve(targetDir, lightFile);
      await page.screenshot({ path: lightPath });
      console.log(`Saved: ${lightPath}`);

      // Toggle theme if button exists
      const toggle = page.locator('.theme-toggle').first();
      if (await toggle.count() > 0) {
        await toggle.click();
        await page.waitForTimeout(1000); // Wait for transition

        // Dark mode screenshot
        const darkFile = `${p.name}-${vp.name}-dark.png`;
        const darkPath = resolve(targetDir, darkFile);
        await page.screenshot({ path: darkPath });
        console.log(`Saved: ${darkPath}`);
      }

      await page.close();
    }
  }

  await browser.close();
  console.log('All screenshots captured successfully!');
});
