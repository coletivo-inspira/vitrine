import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { access, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_WHATSAPP, validateDraftContent } from '../src/portal-validation.mjs';
import { assertNoPrivateLeakage, compilePublicStorefront } from '../src/publication-engine.mjs';
import { publishedPortfolio } from '../src/portfolio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const PLACEHOLDER = '[a preencher com o conteúdo autorizado';
const readJson = async (path) => JSON.parse(await readFile(resolve(root, path), 'utf8'));

test('Rascunho guavira-fotos passa pelos validadores sem dados reais', async () => {
  const draft = await readJson('content/vitrines/rascunho-guavira-fotos.json');
  assert.equal(draft.slug, 'guavira-fotos');
  const { activeItems } = validateDraftContent(draft);
  assert.ok(activeItems > 0);

  const { menu } = await compilePublicStorefront(
    draft,
    { slug: draft.slug, name: draft.businessName, template: draft.template },
    { revision: 1, publishedAt: '2026-11-14T00:00:00.000Z' }
  );
  assertNoPrivateLeakage(menu);
  assert.ok(menu.items.every((item) => item.id !== 'pacote-em-revisao'));

  const source = JSON.stringify(draft);
  assert.ok(source.includes(PLACEHOLDER));
  assert.equal(draft.whatsapp, DEFAULT_WHATSAPP, 'telefone real só depois de BLK-GUAVIRA-01');
  assert.doesNotMatch(source, /"(?:imageUrl|logoUrl|coverUrl|instagramUrl|locality)"/, 'fotos, perfil e endereço reais só depois de BLK-GUAVIRA-01');
  for (const item of menu.items) {
    assert.match(item.description, /fictício/);
  }
});

test('Case com autorização pendente ou texto a preencher nunca é publicado', async () => {
  const catalog = await readJson('content/portfolio.json');
  const guavira = catalog.entries.find((entry) => entry.id === 'guavira-fotos');
  assert.ok(guavira, 'entrada do case preparada');
  assert.equal(guavira.published, false);
  assert.match(guavira.authorization, /^pendente: BLK-GUAVIRA-01$/);

  for (const entry of catalog.entries.filter((e) => e.published === true)) {
    assert.ok(!JSON.stringify(entry).includes(PLACEHOLDER), `${entry.id} ainda tem texto a preencher`);
    assert.ok(!String(entry.authorization ?? '').startsWith('pendente'), `${entry.id} ainda aguarda autorização`);
  }
  assert.ok(publishedPortfolio(catalog).every((entry) => entry.id !== 'guavira-fotos'));
});

test('Build não publica a vitrine nem o case guavira-fotos em dist/', async () => {
  await promisify(execFile)(process.execPath, ['scripts/build.mjs'], { cwd: root });
  const dist = resolve(root, 'dist');
  await assert.rejects(access(resolve(dist, 'guavira-fotos')));
  await assert.rejects(access(resolve(dist, 'data/vitrines/guavira-fotos')));

  const cases = JSON.parse(await readFile(resolve(dist, 'data/portfolio.json'), 'utf8'));
  assert.ok(cases.every((entry) => entry.id !== 'guavira-fotos'));

  const files = (await readdir(dist, { recursive: true })).filter((name) => /\.(?:html|json|js|mjs|css|txt|xml)$/.test(name));
  for (const name of files) {
    const content = await readFile(resolve(dist, name), 'utf8');
    assert.doesNotMatch(content, /guavira/i, `dist/${name} menciona a Guavira antes de BLK-GUAVIRA-01`);
  }
});
