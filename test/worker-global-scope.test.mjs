import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// O Cloudflare Workers recusa o upload (erro 10021) quando um módulo usa, no escopo global,
// timers, geração de aleatórios ou I/O. O `wrangler deploy --dry-run` não acusa isso.
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const FORBIDDEN = [
  [globalThis, 'setTimeout'],
  [globalThis, 'setInterval'],
  [globalThis, 'fetch'],
  [globalThis.crypto, 'getRandomValues'],
  [globalThis.crypto, 'randomUUID']
];

async function moduleFiles(dir) {
  const entries = await readdir(resolve(root, dir), { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = `${dir}/${entry.name}`;
    if (entry.isDirectory()) files.push(...await moduleFiles(path));
    else if (entry.name.endsWith('.mjs')) files.push(path);
  }
  return files;
}

test('módulos do Worker não usam timers, aleatórios nem fetch ao serem carregados', async () => {
  const calls = [];
  const originals = FORBIDDEN.map(([owner, name]) => [owner, name, owner[name]]);
  for (const [owner, name, original] of originals) {
    owner[name] = function guarded(...args) {
      calls.push({ name, stack: new Error().stack.split('\n').slice(2, 5).join(' | ') });
      return original.apply(this, args);
    };
  }
  try {
    const files = ['workers/api.mjs', ...await moduleFiles('src')];
    for (const file of files) {
      await import(`${pathToFileURL(resolve(root, file)).href}?escopo-global`);
    }
  } finally {
    for (const [owner, name, original] of originals) owner[name] = original;
  }
  assert.deepEqual(calls, [], `chamadas proibidas no escopo global:\n${calls.map((c) => `${c.name}: ${c.stack}`).join('\n')}`);
});

test('o teste acusa um módulo que gera aleatórios ao carregar', async () => {
  const calls = [];
  const original = globalThis.crypto.getRandomValues;
  globalThis.crypto.getRandomValues = function guarded(...args) {
    calls.push('getRandomValues');
    return original.apply(this, args);
  };
  try {
    const source = 'export const salt = crypto.getRandomValues(new Uint8Array(4));';
    await import(`data:text/javascript,${encodeURIComponent(source)}`);
  } finally {
    globalThis.crypto.getRandomValues = original;
  }
  assert.deepEqual(calls, ['getRandomValues']);
});
