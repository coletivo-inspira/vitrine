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

test('Editor salva somente alterações e o Worker herda novos padrões ao publicar', async () => {
  const { createApiHandler } = await import('../workers/api.mjs');
  const store = createMemoryStore();
  const site = [...store.sites.values()][0];
  let template = {
    defaultTokens: { accentColor: '#1E3A8A', fontPair: 'editorial-syne' },
    defaultSections: [{ id: 'sec-hero', moduleCode: 'hero', config: { headline: 'Antes' } }]
  };
  store.getStructureDefaults = async () => ({ template, modules: { hero: { subtitle: 'Texto padrão' } } });
  const api = createApiHandler({ store });
  const origin = 'https://vitrine.inspira.dev.br';
  const endpoint = `${origin}/api/sites/${site.id}`;
  const send = (path, method = 'GET', body) => api(new Request(endpoint + path, {
    method,
    headers: { origin, authorization: 'Bearer token-owner', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  const { revision, resolved } = await (await send('/structure')).json();
  const response = await send('/structure', 'PUT', {
    expectedRevision: revision,
    themeOverrides: { ...resolved.theme, accentColor: '#272A38' },
    pages: resolved.pages,
    navigationMenus: { header: [{ label: 'Início', href: '#sec-hero' }] }
  });
  assert.equal(response.status, 200);
  const { draft } = await response.json();
  assert.deepEqual(draft.content.structure, {
    themeOverrides: { accentColor: '#272A38' },
    navigationMenus: { header: [{ label: 'Início', href: '#sec-hero' }] }
  });
  template = {
    defaultTokens: { accentColor: '#102132', fontPair: 'classic-garamond' },
    defaultSections: [{ id: 'sec-hero', moduleCode: 'hero', config: { headline: 'Depois' } }]
  };
  const published = await send('/publish', 'POST');
  assert.equal(published.status, 200);
  const { publication } = await published.json();
  const { theme, pages } = publication.menu.structure;
  assert.deepEqual(theme, { accentColor: '#272A38', fontPair: 'classic-garamond' });
  assert.equal(pages[0].sections[0].config.headline, 'Depois');
  assert.ok(publication.menu.items.length > 0);
  const toggled = await send('/quick-toggle', 'PATCH', {
    targetType: 'section', targetId: 'sec-hero', active: false
  });
  assert.equal(toggled.status, 200);
  const republished = await (await send('/publish', 'POST')).json();
  assert.deepEqual(republished.publication.menu.structure.pages[0].sections, []);
});

test('Operador atualiza modelo suportado e o Worker recusa estrutura insegura', async () => {
  const { createApiHandler } = await import('../workers/api.mjs');
  const store = createMemoryStore();
  store.isPlatformAdmin = userId => userId === '10000000-0000-0000-0000-000000000001';
  store.listPlatformTemplates = async () => [{ code: 'products-v1' }];
  store.updatePlatformTemplate = async (code, patch) => ({ code, ...patch });
  const api = createApiHandler({ store });
  const origin = 'https://vitrine.inspira.dev.br';
  const template = {
    code: 'products-v1', name: 'Cardápio atualizado',
    defaultTokens: { accentColor: '#272A38' },
    defaultSections: [{ id: 'sec-about', moduleCode: 'about_story', config: { bio: 'Bem-vindo' } }]
  };
  const send = (method, token, payload) => api(new Request(origin + '/api/admin/templates', {
    method, headers: { origin, authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    ...(payload ? { body: JSON.stringify(payload) } : {})
  }));
  assert.equal((await send('GET', 'token-member')).status, 403);
  assert.deepEqual(await (await send('GET', 'token-owner')).json(), { templates: [{ code: 'products-v1' }] });
  assert.equal((await send('POST', 'token-member', template)).status, 403);
  assert.equal((await send('POST', 'token-owner', {
    ...template, defaultTokens: { accentColor: 'javascript:alert(1)' }
  })).status, 422);
  const response = await send('POST', 'token-owner', template);
  assert.equal(response.status, 200);
  const { template: saved } = await response.json();
  assert.equal(saved.name, template.name);
  assert.equal(saved.default_sections[0].config.bio, 'Bem-vindo');
});

test('Operador cria variante e a troca de modelo conserva personalizações e catálogo', async () => {
  const { createApiHandler } = await import('../workers/api.mjs');
  const store = createMemoryStore();
  const [site] = [...store.sites.values()];
  const models = new Map([[site.template, {
    catalogType: 'products', template: {
      defaultTokens: { accentColor: '#1E3A8A', fontPair: 'editorial-syne' },
      defaultSections: [{ id: 'hero-original', moduleCode: 'hero', config: { headline: 'Original' } }]
    }
  }]]);
  store.isPlatformAdmin = userId => userId === site.owner_user_id;
  store.createPlatformTemplate = async (code, baseCode, patch) => {
    assert.equal(baseCode, site.template);
    models.set(code, { catalogType: 'products', template: {
      defaultTokens: patch.default_tokens, defaultSections: patch.default_sections
    } });
    return { code, ...patch };
  };
  store.getStructureDefaults = async code => models.get(code);
  store.listStructureTemplates = async () => [{ code: 'cardapio-bistro', name: 'Bistrô' }];
  const api = createApiHandler({ store });
  const origin = 'https://vitrine.inspira.dev.br';
  const path = `/api/sites/${site.id}`;
  const send = (endpoint, method, body) => api(new Request(origin + endpoint, {
    method, headers: { origin, authorization: 'Bearer token-owner', 'content-type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  }));
  const create = await send('/api/admin/templates', 'POST', {
    code: 'cardapio-bistro', baseCode: site.template, name: 'Bistrô',
    defaultTokens: { fontPair: 'classic-garamond' },
    defaultSections: [{ id: 'hero-bistro', moduleCode: 'hero', config: { headline: 'Bistrô' } }]
  });
  assert.equal(create.status, 200);
  const { revision, resolved, templates } = await (await send(path + '/structure', 'GET')).json();
  assert.equal(templates[0].code, 'cardapio-bistro');
  const change = await send(path + '/structure', 'PUT', {
    expectedRevision: revision, templateCode: 'cardapio-bistro', pages: resolved.pages,
    themeOverrides: { ...resolved.theme, accentColor: '#272A38' },
    navigationMenus: { header: [{ label: 'Cardápio', href: '#catalogo' }] }
  });
  assert.equal(change.status, 200);
  const { draft, resolved: next } = await change.json();
  assert.equal(draft.content.structure.templateCode, 'cardapio-bistro');
  assert.equal(next.pages[0].sections[0].id, 'hero-bistro');
  assert.deepEqual(next.theme, { accentColor: '#272A38', fontPair: 'classic-garamond' });
  const invalid = await send(path + '/structure', 'PUT', {
    expectedRevision: draft.revision, templateCode: 'nao-existe'
  });
  assert.equal(invalid.status, 422);
  const { publication } = await (await send(path + '/publish', 'POST')).json();
  assert.equal(publication.menu.structure.pages[0].sections[0].config.headline, 'Bistrô');
  assert.ok(publication.menu.items.length > 0);
  const reset = await send(path + '/structure', 'PUT', {
    expectedRevision: draft.revision, templateCode: null
  });
  assert.equal(reset.status, 200);
  assert.equal((await reset.json()).resolved.pages[0].sections[0].id, 'hero-original');
});
