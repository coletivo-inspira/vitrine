import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishedPortfolio, quoteContactLink } from '../src/portfolio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
const basePath = process.env.SITE_BASE_PATH || '/';
if (!/^\/(?:[A-Za-z0-9._~-]+\/)*$/.test(basePath)) throw new Error('Invalid SITE_BASE_PATH');
// The only deletion target is our generated dist directory, never a user input.
if (dirname(output) !== resolve(root) || basename(output) !== 'dist') throw new Error('Invalid build directory');
const catalog = JSON.parse(await readFile(new URL('../content/portfolio.json', import.meta.url), 'utf8'));
const contact = JSON.parse(await readFile(new URL('../content/contact.json', import.meta.url), 'utf8'));
const publicCases = publishedPortfolio(catalog);
const contactHref = quoteContactLink(contact.teamWhatsapp);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp(new URL('../web/', import.meta.url), output, { recursive: true });
const notFoundPath = resolve(output, '404.html');
const notFound = await readFile(notFoundPath, 'utf8');
await writeFile(notFoundPath, notFound.replaceAll('__SITE_BASE__', basePath));
await mkdir(resolve(output, 'data'), { recursive: true });
await writeFile(resolve(output, 'data/portfolio.json'), JSON.stringify(publicCases));
await writeFile(resolve(output, 'data/contact.json'), JSON.stringify({ href: contactHref }));
await cp(new URL('../src/portfolio.mjs', import.meta.url), resolve(output, 'assets/portfolio.mjs'));
console.log(`Built marketing site: ${publicCases.length} published cases; contact ${contactHref ? 'configured' : 'not configured'}.`);
