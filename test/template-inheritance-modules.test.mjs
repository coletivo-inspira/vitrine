import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveShowcaseManifest, projectShowcaseManifest } from '../src/showcase-structure.mjs';
import { compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { createMemoryStore } from '../workers/api.mjs';

test('Manifesto combina defaults, preserva os dados da vitrine e filtra estruturas ocultas', async () => {
  const store = createMemoryStore();
  const site = [...store.sites.values()][0];
  const draft = await store.getDraft(site.id, site.owner_user_id);
  const structure = {
    themeOverrides: { accentColor: '#1E3A8A' },
    navigationMenus: { header: [{ href: '#sec-about', label: 'Sobre' }] },
    pages: [
      {
        slug: 'home', title: 'Início', sections: [
          { id: 'sec-about', moduleCode: 'about_story', config: { bio: 'Desde 1984 & feita à mão' } },
          { id: 'sec-hours', moduleCode: 'hours_location', active: false, config: { scheduleText: 'Privado' } }
        ]
      }
    ]
  };
  const base = { defaultTokens: { accentColor: '#C74414', fontPair: 'editorial-syne' } };
  assert.deepEqual(resolveShowcaseManifest(structure, base).theme, {
    accentColor: '#1E3A8A', fontPair: 'editorial-syne'
  });
  assert.equal(projectShowcaseManifest(structure).pages[0].sections.length, 1);
  const { menu } = await compilePublicStorefront({ ...draft.content, structure }, site);
  assert.ok(menu.items.length > 0);
  const html = renderStorefrontHtml(menu, undefined, { interactive: false });
  assert.match(html, /Desde 1984 &amp; feita à mão/);
  assert.doesNotMatch(html, /Privado|vitrine\/vitrine.js/);
  assert.throws(() => projectShowcaseManifest({
    navigationMenus: { header: [{ label: 'X', href: 'javascript:alert(1)' }] }
  }));
});
