import { readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { renderStorefrontHtml } from '../src/publication-engine.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const root = resolve(__dirname, '..');

test('disclosure marketing pages have absolute og:image pointing to an existing file in web/', async () => {
  const marketingPages = [
    'web/index.html',
    'web/como-funciona/index.html',
    'web/possibilidades/index.html',
    'web/planos/index.html',
    'web/orcamento/index.html'
  ];

  for (const pagePath of marketingPages) {
    const html = await readFile(resolve(root, pagePath), 'utf8');
    
    // Extract og:image content
    const ogImageMatch = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
    assert.ok(ogImageMatch, `Missing og:image in ${pagePath}`);
    
    const ogImageUrl = ogImageMatch[1];
    assert.ok(ogImageUrl.startsWith('https://vitrine.inspira.dev.br/'), `og:image is not absolute in ${pagePath}: ${ogImageUrl}`);
    
    // Resolve relative path within the workspace
    const relativePart = ogImageUrl.replace('https://vitrine.inspira.dev.br/', '');
    const localFile = resolve(root, 'web', relativePart);
    const fileStat = await stat(localFile);
    assert.ok(fileStat.isFile(), `og:image target does not exist locally: ${localFile}`);
  }
});

test('published vitrine has correct og:title with escaped business name', async () => {
  const mockMenu = {
    template: 'pizzeria-v1',
    slug: 'loja-do-lino',
    name: 'Lino & Cia',
    whatsapp: '5551999999999',
    currency: 'BRL',
    items: [
      { id: 'item-1', name: 'Pizza', priceCents: 1000 }
    ],
    categories: []
  };

  const storefrontHtml = renderStorefrontHtml(mockMenu, '');
  
  assert.match(storefrontHtml, /<meta\s+property="og:title"\s+content="Lino &amp; Cia — Vitrine"/, 'og:title is missing or not properly escaped');
  assert.match(storefrontHtml, /<meta\s+property="og:image"\s+content="https:\/\/vitrine\.inspira\.dev\.br\/assets\/brand\/og-vitrine\.png"/, 'default og:image is missing');
});
