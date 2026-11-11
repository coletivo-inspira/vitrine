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
