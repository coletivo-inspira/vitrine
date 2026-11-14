import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  MIGRATIONS_DIR,
  checkAddedAfterBase,
  checkLocalMigrations
} from '../scripts/check-migration-order.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

test('migrações do repositório têm nomes válidos, versões únicas e ordem estável', async () => {
  const files = await readdir(resolve(root, MIGRATIONS_DIR));
  assert.deepEqual(checkLocalMigrations(files), []);
});

test('a migração do Linktree vem depois da de pausa e arquivamento já aplicada no remoto', async () => {
  const files = (await readdir(resolve(root, MIGRATIONS_DIR))).sort();
  assert.ok(!files.includes('20261115000700_linktree_demo.sql'));
  assert.ok(files.indexOf('20261115000800_site_pause_archive.sql') < files.indexOf('20261115000900_linktree_demo.sql'));
});

test('checagem local acusa versão repetida, nome inválido e ordem divergente', () => {
  assert.match(checkLocalMigrations(['20261115000100_a.sql', '20261115000100_b.sql']).join(), /repetida/);
  assert.match(checkLocalMigrations(['nn_linktree_demo.sql']).join(), /nome inválido/);
  assert.match(checkLocalMigrations(['3000000000000_x.sql', '20261115000100_a.sql']).join(), /nome inválido/);
  assert.deepEqual(checkLocalMigrations(['202611120009_a.sql', '20261112190500_b.sql', 'README.md']), []);
});

test('migração adicionada no PR precisa ser posterior à última da base', () => {
  const base = ['202611120009_a.sql', '20261115000800_site_pause_archive.sql'];
  assert.match(checkAddedAfterBase(base, ['20261115000700_linktree_demo.sql']).join(), /20261115000800_site_pause_archive\.sql/);
  assert.equal(checkAddedAfterBase(base, ['20261115000800_outra.sql']).length, 1);
  assert.deepEqual(checkAddedAfterBase(base, ['20261115000900_linktree_demo.sql']), []);
  assert.deepEqual(checkAddedAfterBase([], ['20261115000100_a.sql']), []);
});
