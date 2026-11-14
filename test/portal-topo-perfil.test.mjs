import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { showSection } from '../web/portal/portal.js';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'web/portal/index.html'), 'utf8');
const css = await readFile(resolve(root, 'web/portal/portal.css'), 'utf8');

function slice(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  assert.ok(start >= 0, `trecho ${startMarker} existe`);
  return html.slice(start, html.indexOf(endMarker, start));
}

const bottomNav = slice('<nav class="app-bottom-nav"', '</nav>');
const sidebar = slice('<aside class="app-sidebar">', '</aside>');
const topBar = slice('<header class="app-top-bar">', '</header>');
const authSection = slice('<section id="auth-section"', '</section>');

test('Perfil sai do menu inferior e da barra lateral', () => {
  assert.doesNotMatch(bottomNav, /data-section="perfil"|href="#perfil"/);
  assert.doesNotMatch(sidebar, /data-section="perfil"|href="#perfil"/);
  const labels = [...bottomNav.matchAll(/<span>([^<]+)<\/span>/g)].map(([, label]) => label);
  assert.deepEqual(labels, ['Início', 'Vitrines', 'Insights', 'Pedidos', 'Admin']);
});

test('Perfil fica no topo, imediatamente antes do Sair', () => {
  const profile = topBar.match(/<a id="top-bar-profile"[^>]*>/)?.[0];
  assert.ok(profile, 'o topo tem o link de Perfil');
  assert.match(profile, /href="#perfil"/);
  assert.match(profile, /aria-label="Perfil e interesses"/);
  assert.match(topBar, /<span class="top-bar-profile-label">Perfil<\/span>/);
  assert.match(topBar, /id="top-bar-avatar-placeholder"/);
  const afterProfile = topBar.slice(topBar.indexOf('id="top-bar-profile"'));
  const nextControl = afterProfile.slice(afterProfile.indexOf('</a>')).match(/<(a|button)\b[^>]*>/)?.[0];
  assert.match(nextControl, /id="logout-button"/, 'o próximo controle depois do Perfil é o Sair');
  assert.match(html, /href="#perfil" class="checklist-link"/, 'o atalho do painel inicial continua levando ao Perfil');
});

test('showSection marca o Perfil do topo como ativo só na seção Perfil', () => {
  const classes = new Set();
  const attributes = {};
  const topBarProfile = {
    classList: { toggle: (name, on) => (on ? classes.add(name) : classes.delete(name)) },
    setAttribute: (name, value) => { attributes[name] = value; },
    removeAttribute: (name) => { delete attributes[name]; }
  };
  const previous = globalThis.document;
  globalThis.document = {
    getElementById: (id) => (id === 'top-bar-profile' ? topBarProfile : null),
    querySelectorAll: () => []
  };
  try {
    showSection('perfil');
    assert.ok(classes.has('active'));
    assert.equal(attributes['aria-current'], 'page');
    showSection('vitrines');
    assert.ok(!classes.has('active'));
    assert.equal(attributes['aria-current'], undefined);
  } finally {
    globalThis.document = previous;
  }
});

test('Logo: deslogado leva ao site principal; dentro do painel leva ao Início', () => {
  const authLink = authSection.match(/<a id="auth-brand-link"[^>]*>/)?.[0];
  assert.ok(authLink, 'a tela "Entrar no Painel" tem o logo como link');
  assert.match(authLink, /href="https:\/\/vitrine\.inspira\.dev\.br\/"/);

  const panelLinks = [...html.matchAll(/<a class="brand[^"]*"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(panelLinks.length, 2, 'barra lateral e topo do celular têm o logo');
  for (const tag of panelLinks) {
    assert.match(tag, /href="#inicio"/);
    assert.match(tag, /aria-label="Ir para o Início do painel"/);
  }
  assert.match(sidebar, /class="brand panel-home-link" href="#inicio"/);
  assert.match(topBar, /class="brand panel-home-link" href="#inicio"/);
});

test('Cards de vitrine: ações sem quebra e em coluna abaixo de 480 px', () => {
  assert.match(css, /\.site-item-actions \.button \{[^}]*white-space: nowrap;[^}]*min-height: 44px;/);
  assert.match(css, /\.site-item-info \{[^}]*min-width: 0;/);
  const mobile = css.match(/@media \(max-width: 479px\) \{([\s\S]*?)\n\}/)?.[1] ?? '';
  assert.match(mobile, /\.site-item \{[^}]*flex-direction: column;/);
  assert.match(mobile, /\.site-item-actions \.button \{[^}]*flex: 1 1 0;/);
});
