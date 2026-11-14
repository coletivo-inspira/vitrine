import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHubSiteLink } from '../web/portal/portal.js';

const root = resolve(import.meta.dirname, '..');
const js = await readFile(resolve(root, 'web/portal/portal.js'), 'utf8');
const css = await readFile(resolve(root, 'web/portal/portal.css'), 'utf8');

function fakeDoc() {
  const make = (tagName) => ({
    tagName,
    attributes: {},
    children: [],
    listeners: {},
    textContent: '',
    setAttribute(name, value) { this.attributes[name] = String(value); },
    appendChild(child) { this.children.push(child); return child; },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  return { createElement: make, createElementNS: (_ns, tag) => make(tag) };
}

test('Início: cada linha de "Suas Vitrines" é um botão que abre a vitrine', () => {
  const site = { id: 's2', name: 'SAM & MAC', slug: 'sam-mac', role: 'owner' };
  const opened = [];
  const item = createHubSiteLink(site, fakeDoc(), (s) => opened.push(s));

  assert.equal(item.tagName, 'button');
  assert.equal(item.type, 'button');
  assert.match(item.className, /\bhub-site-link\b/);
  assert.equal(item.attributes['aria-label'], 'Abrir a vitrine SAM & MAC');
  assert.deepEqual(item.children.map((c) => c.textContent).slice(0, 2), ['SAM & MAC', 'Proprietário']);
  const arrow = item.children[2];
  assert.equal(arrow.tagName, 'svg');
  assert.equal(arrow.attributes['aria-hidden'], 'true');

  item.listeners.click();
  assert.deepEqual(opened, [site], 'o clique abre a mesma vitrine');
});

test('Início: a lista usa o mesmo openEditor do "Editar vitrine" e só vitrines ativas', () => {
  const hub = js.slice(js.indexOf('function updateHubSummary'), js.indexOf('// 3. Customization Requests summary'));
  assert.match(hub, /const hubSites = activeSites\(sites\);/);
  assert.match(hub, /createHubSiteLink\(site, document, openEditor\)/);
  const editButton = js.slice(js.indexOf("actionBtn.textContent = 'Editar vitrine';"), js.indexOf("actionBtn.textContent = 'Editar vitrine';") + 200);
  assert.match(editButton, /openEditor\(site\)/);
  assert.doesNotMatch(hub, /catálogo/i);
});

test('Início: linha clicável tem 48 px, seta e hover', () => {
  assert.match(css, /\.hub-site-link \{[^}]*min-height: 48px;[^}]*cursor: pointer;/);
  assert.match(css, /\.hub-site-link:hover \{[^}]*border-color: var\(--orange\);/);
  assert.match(css, /\.hub-site-link strong \{[^}]*min-width: 0;/);
});
