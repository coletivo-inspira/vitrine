import { cp, mkdir, open, readFile, rm, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedPortfolio, quoteContactLink } from '../src/portfolio.mjs';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { applyPricingPage } from '../src/pricing-page.mjs';
import { STATIC_STOREFRONTS } from '../src/static-storefronts.mjs';

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

function minifyCss(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\n[ \t]+/g, '\n').replace(/\n{2,}/g, '\n').trim() + '\n';
}

await acquireBuildLock();
try {
  const catalog = JSON.parse(await readFile(new URL('../content/portfolio.json', import.meta.url), 'utf8'));
  const contact = JSON.parse(await readFile(new URL('../content/contact.json', import.meta.url), 'utf8'));
  const paymentLinkDomains = JSON.parse(await readFile(new URL('../content/payment-link-domains.json', import.meta.url), 'utf8'));
  const publicCases = publishedPortfolio(catalog);
  const contactHref = quoteContactLink(contact.teamWhatsapp);
  const storefronts = [];
  for (const { file, publishedAt, limits } of STATIC_STOREFRONTS) {
    const source = JSON.parse(await readFile(new URL(`../content/vitrines/${file}`, import.meta.url), 'utf8'));
    storefronts.push(await compilePublicStorefront(
      source,
      { slug: source.slug, name: source.businessName, template: source.template },
      { revision: 1, publishedAt, ...limits }
    ));
  }

  await mkdir(output, { recursive: true });
  // A vitrine pública tem teto de peso (test/e2e-full-journey.test.mjs): o CSS dela vai sem comentários nem recuos.
  const vitrineCssSource = fileURLToPath(new URL('../web/vitrine/vitrine.css', import.meta.url));
  await cp(new URL('../web/', import.meta.url), output, {
    recursive: true,
    force: true,
    filter: (source) => resolve(source) !== vitrineCssSource
  });
  await mkdir(resolve(output, 'vitrine'), { recursive: true });
  await writeFile(resolve(output, 'vitrine/vitrine.css'), minifyCss(await readFile(vitrineCssSource, 'utf8')));
  const planTable = JSON.parse(await readFile(new URL('../content/plans.json', import.meta.url), 'utf8'));
  const pricingPath = resolve(output, 'planos/index.html');
  await writeFile(pricingPath, applyPricingPage(await readFile(pricingPath, 'utf8'), planTable));
  const notFoundPath = resolve(output, '404.html');
  const notFound = await readFile(notFoundPath, 'utf8');
  await writeFile(notFoundPath, notFound.replaceAll('__SITE_BASE__', basePath));
  await mkdir(resolve(output, 'data'), { recursive: true });
  await writeFile(resolve(output, 'data/portfolio.json'), JSON.stringify(publicCases));
  await writeFile(resolve(output, 'data/contact.json'), JSON.stringify({ href: contactHref }));
  // O editor confere o link de pagamento com a mesma lista do servidor (#134).
  await writeFile(resolve(output, 'assets/payment-link-domains.json'), JSON.stringify({ domains: paymentLinkDomains.domains }));
  await cp(new URL('../src/portfolio.mjs', import.meta.url), resolve(output, 'assets/portfolio.mjs'));
  await cp(new URL('../src/public-menu.mjs', import.meta.url), resolve(output, 'assets/public-menu.mjs'));

  const vitrineTemplatePath = resolve(output, 'vitrine/index.html');
  const vitrineTemplateHtml = await readFile(vitrineTemplatePath, 'utf8');
  for (const { hash, json, menu } of storefronts) {
    await mkdir(resolve(output, `data/vitrines/${menu.slug}/releases`), { recursive: true });
    await writeFile(resolve(output, `data/vitrines/${menu.slug}/menu.json`), json);
    await writeFile(resolve(output, `data/vitrines/${menu.slug}/releases/${hash}.json`), json);
    await mkdir(resolve(output, menu.slug), { recursive: true });
    await writeFile(resolve(output, `${menu.slug}/index.html`), renderStorefrontHtml(menu, vitrineTemplateHtml));
  }

  const summary = storefronts
    .map(({ hash, menu }) => `/${menu.slug}, ${menu.items.length} active items, hash ${hash.slice(0, 12)}`)
    .join('; ');
  console.log(
    `Built marketing site & storefronts (${summary}): ${publicCases.length} published cases; contact ${contactHref ? 'configured' : 'not configured'}.`
  );
} finally {
  await unlink(lockFile).catch(() => {});
}
