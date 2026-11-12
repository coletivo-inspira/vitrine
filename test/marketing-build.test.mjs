import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';

test('marketing package excludes private sources and resolves its local assets', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const output = resolve(root, 'dist');
  const files = await readdir(output, { recursive: true });
  for (const filename of files) {
    assert.doesNotMatch(filename, /(?:^|[/\\])(?:node_modules|supabase|test|scripts|\.env|\.git)(?:$|[/\\.])/);
    assert.ok(!filename.endsWith('.sql'), 'Migration must never be published');
  }
  const html = await readFile(resolve(output, 'index.html'), 'utf8');
  for (const match of html.matchAll(/(?:src|href)="(\.\/[^"#]+)"/g)) {
    assert.ok((await stat(resolve(output, match[1]))).isFile(), `Missing asset ${match[1]}`);
  }
  const cases = JSON.parse(await readFile(resolve(output, 'data/portfolio.json'), 'utf8'));
  assert.ok(Array.isArray(cases));
  assert.ok(cases.every(entry => !('internalNotes' in entry) && !('published' in entry)));
  const contact = JSON.parse(await readFile(resolve(output, 'data/contact.json'), 'utf8'));
  assert.deepEqual(Object.keys(contact), ['href']);
  assert.ok(contact.href === null || contact.href.startsWith('https://wa.me/'));
  const headers = await readFile(resolve(output, '_headers'), 'utf8');
  assert.match(headers, /script-src 'self'/);
  assert.doesNotMatch(headers, /script-src[^;\n]*unsafe-inline/);
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root, env: { ...process.env, SITE_BASE_PATH: '/vitrine/' } });
  const notFound = await readFile(resolve(output, '404.html'), 'utf8');
  assert.match(notFound, /href="\/vitrine\/styles\.css"/);
  assert.match(notFound, /href="\/vitrine\/"/);
  const app = await readFile(resolve(output, 'app.js'), 'utf8');
  assert.match(app, /new URL\('\.\/data\/contact\.json', import\.meta\.url\)/);
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });
});

test('every nav link on marketing pages points to a page that exists in dist/', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = resolve(root, 'dist');
  
  const marketingPages = [
    'index.html',
    'como-funciona/index.html',
    'possibilidades/index.html',
    'planos/index.html',
    'orcamento/index.html',
    'privacidade/index.html',
    'termos/index.html'
  ];
  
  for (const page of marketingPages) {
    const html = await readFile(resolve(output, page), 'utf8');
    const navMatch = html.match(/<nav id="site-nav"[^>]*>([\s\S]*?)<\/nav>/);
    assert.ok(navMatch, `Missing nav in ${page}`);
    const navContent = navMatch[1];
    
    for (const linkMatch of navContent.matchAll(/href="([^"]+)"/g)) {
      const href = linkMatch[1];
      if (href.startsWith('https://') || href.startsWith('http://') || href.startsWith('#')) {
        continue;
      }
      
      let targetFile;
      if (href === '/') {
        targetFile = 'index.html';
      } else {
        const cleanPath = href.replace(/^\/|\/$/g, '');
        targetFile = `${cleanPath}/index.html`;
      }
      
      const absoluteTarget = resolve(output, targetFile);
      const statResult = await stat(absoluteTarget);
      assert.ok(statResult.isFile(), `Nav link href="${href}" in ${page} resolves to missing file: ${targetFile}`);
    }
  }
});

test('no user-visible catálogo or cardápio exists on marketing pages in dist/', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const output = resolve(root, 'dist');
  
  const marketingPages = [
    'index.html',
    'como-funciona/index.html',
    'possibilidades/index.html',
    'planos/index.html',
    'orcamento/index.html',
    'privacidade/index.html',
    'termos/index.html'
  ];
  
  for (const page of marketingPages) {
    const html = await readFile(resolve(output, page), 'utf8');
    const textOnly = html.replace(/<[^>]*>/g, ' ');
    const hasCatalogo = /(?:catálogo|catalogo)/i.test(textOnly);
    const hasCardapio = /(?:cardápio|cardapio)/i.test(textOnly);
    
    assert.ok(!hasCatalogo, `Page ${page} contains forbidden terminology "catálogo": ... ${textOnly.match(/[^ ]{0,20}(?:catálogo|catalogo)[^ ]{0,20}/i)?.[0]} ...`);
    assert.ok(!hasCardapio, `Page ${page} contains forbidden terminology "cardápio": ... ${textOnly.match(/[^ ]{0,20}(?:cardápio|cardapio)[^ ]{0,20}/i)?.[0]} ...`);
  }
});
