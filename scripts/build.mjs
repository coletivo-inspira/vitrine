import { cp, mkdir, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedPortfolio, quoteContactLink } from '../src/portfolio.mjs';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const lockFile = resolve(root, '.build.lock');
const basePath = process.env.SITE_BASE_PATH || '/';
if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath)) throw new Error('Invalid SITE_BASE_PATH');
// The only deletion target is our generated dist directory, never a user input.
if (dirname(output) !== resolve(root) || basename(output) !== 'dist') throw new Error('Invalid build directory');

async function acquireBuildLock() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    try {
      const handle = await open(lockFile, 'wx');
      await handle.close();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 25));
    }
  }
}

await acquireBuildLock();
try {
  const catalog = JSON.parse(await readFile(new URL('../content/portfolio.json', import.meta.url), 'utf8'));
  const contact = JSON.parse(await readFile(new URL('../content/contact.json', import.meta.url), 'utf8'));
  const loja1Source = JSON.parse(await readFile(new URL('../content/vitrines/loja1.json', import.meta.url), 'utf8'));
  const publicCases = publishedPortfolio(catalog);
  const contactHref = quoteContactLink(contact.teamWhatsapp);
  const loja1Compiled = await compilePublicStorefront(
    loja1Source,
    {
      slug: loja1Source.slug,
      name: loja1Source.businessName,
      template: loja1Source.template
    },
    {
      revision: 1,
      publishedAt: '2026-11-11T00:00:00.000Z'
    }
  );

  await mkdir(output, { recursive: true });
  await cp(new URL('../web/', import.meta.url), output, { recursive: true, force: true });
  const notFoundPath = resolve(output, '404.html');
  const notFound = await readFile(notFoundPath, 'utf8');
  await writeFile(notFoundPath, notFound.replaceAll('__SITE_BASE__', basePath));
  await mkdir(resolve(output, 'data/vitrines/loja1/releases'), { recursive: true });
  await writeFile(resolve(output, 'data/portfolio.json'), JSON.stringify(publicCases));
  await writeFile(resolve(output, 'data/contact.json'), JSON.stringify({ href: contactHref }));
  await writeFile(resolve(output, 'data/vitrines/loja1/menu.json'), loja1Compiled.json);
  await writeFile(
    resolve(output, `data/vitrines/loja1/releases/${loja1Compiled.hash}.json`),
    loja1Compiled.json
  );
  await cp(new URL('../src/portfolio.mjs', import.meta.url), resolve(output, 'assets/portfolio.mjs'));
  await cp(new URL('../src/public-menu.mjs', import.meta.url), resolve(output, 'assets/public-menu.mjs'));

  const vitrineTemplatePath = resolve(output, 'vitrine/index.html');
  const vitrineTemplateHtml = await readFile(vitrineTemplatePath, 'utf8');
  const loja1Html = renderStorefrontHtml(loja1Compiled.menu, vitrineTemplateHtml);
  await mkdir(resolve(output, 'loja1'), { recursive: true });
  await writeFile(resolve(output, 'loja1/index.html'), loja1Html);

  console.log(
    `Built marketing site & pilot storefront (/loja1, ${loja1Compiled.menu.items.length} active items, hash ${loja1Compiled.hash.slice(0, 12)}): ${publicCases.length} published cases; contact ${contactHref ? 'configured' : 'not configured'}.`
  );
} finally {
  await unlink(lockFile).catch(() => {});
}
