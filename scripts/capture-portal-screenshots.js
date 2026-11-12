import { chromium } from 'playwright-chromium';
import { resolve } from 'node:path';

(async () => {
  const browser = await chromium.launch({ headless: true });

  const viewports = [
    { width: 1440, height: 900, isMobile: false, name: 'desktop' },
    { width: 390, height: 844, isMobile: true, name: 'mobile' }
  ];

  for (const vp of viewports) {
    // New page
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.isMobile,
      hasTouch: vp.isMobile
    });

    await page.goto('http://127.0.0.1:4173/portal/', { waitUntil: 'load' });

    // Click local demo button to login offline
    await page.locator('#local-demo-button').click();
    await page.waitForTimeout(1000); // Wait for transition

    // Screenshot in light mode
    const lightPath = resolve('/cursor/stores/bc-eda3ac10-4053-4841-9e17-ee3927f2a123/media/portal-shell', `portal-shell-${vp.name}-light.png`);
    await page.screenshot({ path: lightPath });
    console.log(`Saved Light Theme: ${lightPath}`);

    // Toggle theme to dark mode
    await page.locator('.theme-toggle').first().click();
    await page.waitForTimeout(1000); // Wait for transition

    // Screenshot in dark mode
    const darkPath = resolve('/cursor/stores/bc-eda3ac10-4053-4841-9e17-ee3927f2a123/media/portal-shell', `portal-shell-${vp.name}-dark.png`);
    await page.screenshot({ path: darkPath });
    console.log(`Saved Dark Theme: ${darkPath}`);

    await page.close();
  }

  await browser.close();
  console.log('All screenshots taken successfully!');
})().catch(e => {
  console.error(e);
  process.exit(1);
});
