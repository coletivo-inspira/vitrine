import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { getAvatarInitials, getSafeAvatarUrl } from '../web/portal/portal.js';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'web/portal/index.html'), 'utf8');

function slice(startMarker, endMarker) {
  const start = html.indexOf(startMarker);
  assert.ok(start >= 0, `trecho ${startMarker} existe`);
  return html.slice(start, html.indexOf(endMarker, start));
}

const topBar = slice('<header id="app-top-bar" class="app-top-bar">', '</header>');
const authSection = slice('<section id="auth-section"', '</section>');

test('Sem barra lateral nem barra inferior: a conta fica no menu do avatar', () => {
  assert.doesNotMatch(html, /class="app-sidebar"|class="app-bottom-nav"|class="nav-link/);
  assert.match(topBar, /<button id="account-menu-button" class="avatar-button"[^>]*aria-haspopup="menu"/);
  assert.match(topBar, /id="home-search-input"/);
});

test('Menu do avatar: Perfil, Customizações, Plano, Impacto, Administração, tema e Sair por último', () => {
  const menu = slice('<div id="account-menu"', '</header>');
  const items = [...menu.matchAll(/role="menuitem"[^>]*>([\s\S]*?)<\/(a|button)>/g)]
    .map(([, label]) => label.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  assert.deepEqual(items, [
    'Perfil',
    'Customizações',
    'Plano e cobrança',
    'Impacto',
    'Administração',
    'Tema escuro Tema claro',
    'Sair'
  ]);
  assert.match(menu, /<a class="menu-item" role="menuitem" href="#\/perfil">Perfil<\/a>/);
  assert.match(menu, /<div class="nav-sponsor-item" role="none" hidden>/);
  assert.match(menu, /<div class="nav-admin-item" role="none" hidden>/);
});

test('Logo: deslogado leva ao site principal; dentro do painel leva ao Início', () => {
  const authLink = authSection.match(/<a id="auth-brand-link"[^>]*>/)?.[0];
  assert.ok(authLink, 'a tela "Entrar no Painel" tem o logo como link');
  assert.match(authLink, /href="https:\/\/vitrine\.inspira\.dev\.br\/"/);
  const panelLinks = [...html.matchAll(/<a class="brand[^"]*"[^>]*>/g)].map(([tag]) => tag);
  assert.equal(panelLinks.length, 1);
  assert.match(panelLinks[0], /href="#\/"/);
  assert.match(panelLinks[0], /aria-label="Ir para o Início do painel"/);
});

test('Avatar do Google: só fotos de lh3.googleusercontent.com; senão as iniciais', () => {
  assert.equal(getSafeAvatarUrl('https://lh3.googleusercontent.com/a/abc=s96-c'), 'https://lh3.googleusercontent.com/a/abc=s96-c');
  assert.equal(getSafeAvatarUrl('https://example.com/a.png'), '');
  assert.equal(getSafeAvatarUrl('javascript:alert(1)'), '');
  assert.equal(getSafeAvatarUrl(undefined), '');
  assert.equal(getAvatarInitials('Maria da Silva'), 'MS');
  assert.equal(getAvatarInitials('ana@exemplo.com'), 'A');
  assert.equal(getAvatarInitials(''), 'U');
  assert.match(topBar, /<img id="top-bar-avatar"[^>]*referrerpolicy="no-referrer"/);
});
