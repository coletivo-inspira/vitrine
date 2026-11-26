import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import {
  filterSitesForHome,
  isSitePublished,
  parseRoute,
  routeRedirectTarget,
  vitrineHash
} from '../web/portal/portal.js';

const root = resolve(import.meta.dirname, '..');
const js = await readFile(resolve(root, 'web/portal/portal.js'), 'utf8');
const css = await readFile(resolve(root, 'web/portal/portal.css'), 'utf8');
const html = await readFile(resolve(root, 'web/portal/index.html'), 'utf8');

test('Início: "Começar nova vitrine" tem os modelos e "Vitrines recentes" é uma grade', () => {
  const templates = [...html.matchAll(/class="template-card" data-template="([a-z]+)"/g)].map(([, id]) => id);
  assert.deepEqual(templates, ['products', 'services', 'booking', 'quote', 'custom']);
  assert.match(html, /<h1 id="home-start-title" class="home-band-title">Começar nova vitrine<\/h1>/);
  assert.match(html, /<h2 id="home-recent-title" class="home-recent-title">Vitrines recentes<\/h2>/);
  assert.match(html, /<ul id="sites-list-container" class="vitrine-grid" aria-labelledby="home-recent-title"><\/ul>/);
  assert.match(html, /<dialog id="new-vitrine-dialog"[\s\S]*id="new-site-name"[\s\S]*id="new-site-slug"/);
  assert.doesNotMatch(html, /id="wizard-section"|id="vitrines-section"|dashboard-hub-grid|onboarding-checklist-card/);
});

test('Início: cada cartão abre a vitrine em um clique e mostra Publicada ou Rascunho', () => {
  const card = js.slice(js.indexOf('function createSiteCard'), js.indexOf('export function createDotsIcon'));
  assert.match(card, /link\.href = vitrineHash\(site\.id, 'itens'\);/);
  assert.match(card, /link\.setAttribute\('aria-label', `Abrir a vitrine \$\{site\.name\}`\);/);
  assert.match(card, /published \? 'Publicada' : 'Rascunho'/);
  assert.match(card, /createLifecycleMenuItems\(site,/, 'pausar, arquivar e restaurar ficam no menu do cartão');
  assert.equal(isSitePublished({ publishedAt: '2026-11-20T10:00:00Z' }), true);
  assert.equal(isSitePublished({ publishedAt: null }), false);
});

test('Início: a busca filtra por nome ou endereço, sem acento, e ordena pela edição mais recente', () => {
  const sites = [
    { id: 'a', name: 'Pão & Café', slug: 'pao-cafe', updatedAt: '2026-11-01T00:00:00Z' },
    { id: 'b', name: 'Ateliê Maria', slug: 'atelie-maria', updatedAt: '2026-11-20T00:00:00Z' },
    { id: 'c', name: 'Studio', slug: 'cafe-studio', updatedAt: '2026-11-10T00:00:00Z' }
  ];
  assert.deepEqual(filterSitesForHome(sites, '').map((s) => s.id), ['b', 'c', 'a']);
  assert.deepEqual(filterSitesForHome(sites, 'CAFE').map((s) => s.id), ['c', 'a']);
  assert.deepEqual(filterSitesForHome(sites, 'atelie').map((s) => s.id), ['b']);
});

test('Rotas: #/, #/v/:id/itens|pedidos|config, #/perfil e #/customizacoes', () => {
  assert.deepEqual(parseRoute(''), { section: 'inicio' });
  assert.deepEqual(parseRoute('#/'), { section: 'inicio' });
  assert.deepEqual(parseRoute('#/perfil'), { section: 'perfil' });
  assert.deepEqual(parseRoute('#/customizacoes'), { section: 'customizacoes' });
  assert.deepEqual(parseRoute('#/plano'), { section: 'plano' });
  assert.deepEqual(parseRoute('#/v/abc/pedidos'), { section: 'editor', siteId: 'abc', tab: 'pedidos' });
  assert.deepEqual(parseRoute('#/v/abc'), { section: 'editor', siteId: 'abc', tab: 'itens' });
  assert.equal(parseRoute('#/v/abc/xyz').redirectTab, true);
  assert.equal(vitrineHash('a b', 'config'), '#/v/a%20b/config');
  assert.equal(vitrineHash('abc', 'desconhecida'), '#/v/abc/itens');
});

test('Rotas antigas são redirecionadas para o modelo novo', () => {
  const sites = [
    { id: 'ed', role: 'editor' },
    { id: 'own', role: 'owner' }
  ];
  const redirect = (hash, activeSite = null) => routeRedirectTarget(parseRoute(hash), { activeSite, sites });
  assert.equal(redirect('#inicio'), '#/');
  assert.equal(redirect('#vitrines'), '#/');
  assert.equal(redirect('#perfil'), '#/perfil');
  assert.equal(redirect('#pedidos'), '#/customizacoes');
  assert.equal(redirect('#plano'), '#/plano');
  assert.equal(redirect('#administracao'), '#/administracao');
  assert.equal(redirect('#insights'), '#/v/ed/pedidos');
  assert.equal(redirect('#insights', sites[1]), '#/v/own/pedidos');
  assert.equal(redirect('#leiloes'), '#/v/own/pedidos', 'leilões vão para uma vitrine em que a pessoa gerencia lances');
  assert.equal(redirect('#editor'), '#/');
  assert.equal(redirect('#editor', sites[0]), '#/v/ed/itens');
  assert.equal(redirect('#wizard'), '#/');
  assert.equal(redirect('#/v/own/pedidos'), null);
});

test('Início: grade sem quebra no celular e alvos de 44 px', () => {
  assert.match(css, /\.vitrine-grid \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(220px, 1fr\)\);/);
  assert.match(css, /\.vitrine-card:hover \{[^}]*border-color: var\(--orange\);/);
  assert.match(css, /\.icon-button \{[^}]*width: 44px;[^}]*height: 44px;/);
  assert.match(css, /\.menu-item \{[^}]*min-height: 44px;/);
  assert.match(css, /\.vitrine-card-title \{[^}]*text-overflow: ellipsis;[^}]*white-space: nowrap;/);
});
