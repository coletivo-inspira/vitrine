import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { publishedPortfolio, quoteContactLink } from '../src/portfolio.mjs';

const entry = () => ({ id: 'example', title: 'Projeto exemplo', url: 'https://example.com/',
  summary: 'Descrição autorizada', category: 'Cardápio', tags: ['WhatsApp'],
  order: 1, featured: true, published: true, internalNotes: 'do not export' });

test('portfolio exports only published fields, ordered without modifying input', () => {
  const input = { schemaVersion: 1, entries: [entry(), { ...entry(), id: 'first', order: 0 },
    { id: 'draft', published: false }] };
  const before = structuredClone(input);
  const output = publishedPortfolio(input);
  assert.deepEqual(output.map(e => e.id), ['first', 'example']);
  assert.deepEqual(Object.keys(output[0]), ['id', 'title', 'url', 'summary', 'category', 'tags', 'order', 'featured']);
  assert.deepEqual(input, before);
});
test('portfolio rejects unsafe protocols, credentials and duplicate identities', () => {
  for (const url of ['javascript:alert(1)', 'http://example.com/', 'https://user:secret@example.com/']) {
    assert.throws(() => publishedPortfolio({ schemaVersion: 1, entries: [{ ...entry(), url }] }));
  }
  assert.throws(() => publishedPortfolio({ schemaVersion: 1, entries: [entry(), entry()] }), /duplicate/);
});
test('portfolio rejects invalid fields and schemas', () => {
  for (const change of [{ title: '' }, { tags: 'tag' }, { order: -1 }, { id: '../private' }]) {
    assert.throws(() => publishedPortfolio({ schemaVersion: 1, entries: [{ ...entry(), ...change }] }));
  }
  assert.throws(() => publishedPortfolio({ schemaVersion: 2, entries: [] }));
});
test('contact stays unavailable without a configured team phone', () => {
  assert.equal(quoteContactLink(null, entry()), null);
  assert.throws(() => quoteContactLink('55?text=bad'), /phone/);
});
test('quote link encodes case reference and opens only the configured team number', () => {
  const url = new URL(quoteContactLink('5511999999999', { ...entry(), title: 'A & B' }));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/5511999999999');
  assert.equal(url.searchParams.size, 1);
  assert.match(url.searchParams.get('text'), /A & B \(example\)/);
});
test('committed catalog passes the public projection contract', async () => {
  const catalog = JSON.parse(await readFile(new URL('../content/portfolio.json', import.meta.url), 'utf8'));
  const output = publishedPortfolio(catalog);
  assert.equal(output.length, catalog.entries.filter(e => e?.published === true).length);
});
