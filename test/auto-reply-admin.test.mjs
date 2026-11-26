import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderAutoReplyAdmin, validateSiteIdInput } from '../web/portal/auto-reply-admin.mjs';

function fakeDocument() {
  const make = (tag) => ({
    tag, className: '', id: '', textContent: '', attrs: {}, children: [], listeners: {}, hidden: false,
    setAttribute(name, value) { this.attrs[name] = String(value); },
    removeAttribute(name) { delete this.attrs[name]; },
    append(...nodes) { this.children.push(...nodes); },
    appendChild(node) { this.children.push(node); return node; },
    replaceChildren(...nodes) { this.children = [...nodes]; },
    addEventListener(type, fn) { this.listeners[type] = fn; }
  });
  return { createElement: make, createTextNode: (text) => ({ textContent: text, children: [] }) };
}

function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) walk(child, visit);
}

function textOf(node) {
  let text = node.textContent ?? '';
  for (const child of node.children ?? []) text += textOf(child);
  return text;
}

const handlers = {
  onRetry() {}, onControls() {}, onSiteAccess() {}, onAddSite() {}, onSuspend() {}, onRotate() {}
};

const DATA = {
  controls: { enabled: true, instagramEnabled: false },
  allowedSites: [{ siteId: '20000000-0000-0000-0000-00000000000a', slug: 'pizzaria-exemplo' }],
  connections: [
    { connectionId: 'c1', slug: 'pizzaria-exemplo', username: 'pizzaria.exemplo', status: 'connected', enabled: true, lastEventAt: null, keyVersion: 1 },
    { connectionId: 'c2', slug: 'outra', username: null, status: 'suspended', enabled: false, keyVersion: 2 }
  ],
  last7Days: { received: 12, sent: 7, skippedFrequency: 4, failed: 0, authFailures: 0, uncertain: 1, cancelled: 0 },
  keys: { currentVersion: 2, previousKeyConfigured: true, stableHashKey: true },
  alerts: [
    { code: 'credentials_pending_rotation', severity: 'warning', title: 'Recifragem pendente', detail: '1 credencial ainda na chave antiga.', count: 1, sites: ['pizzaria-exemplo'] },
    { code: 'auth_failures', severity: 'critical', title: 'Falhas de autorização', detail: '2 envios recusados.', count: 2, sites: [] }
  ]
};

test('administração: mostra alertas, interruptores, métricas, conexões, vitrines e chaves', () => {
  const doc = fakeDocument();
  const root = doc.createElement('article');
  renderAutoReplyAdmin(root, { data: DATA, busy: null, rotation: null, siteError: '' }, handlers, doc);
  const text = textOf(root);
  for (const expected of ['Falhas de autorização', 'Recifragem pendente', 'Vitrines: pizzaria-exemplo', 'Eventos recebidos', '12',
    'pizzaria-exemplo · @pizzaria.exemplo', 'Suspensa', 'chave v1', 'Versão atual', 'v2', 'Credenciais na chave antiga']) {
    assert.ok(text.includes(expected), expected);
  }
  const buttons = [];
  const switches = {};
  let form = null;
  walk(root, (node) => {
    if (node.tag === 'button') buttons.push(node.textContent);
    if (node.attrs?.role === 'switch') switches[node.id] = node.checked;
    if (node.tag === 'form') form = node;
  });
  assert.deepEqual(buttons, ['Suspender', 'Retirar', 'Liberar vitrine', 'Recifrar agora']);
  assert.deepEqual(switches, { 'auto-reply-admin-enabled': true, 'auto-reply-admin-instagram': false });
  let prevented = false;
  form.listeners.submit({ preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  const severities = [];
  walk(root, (node) => { if (/auto-reply-admin-severity/.test(node.className)) severities.push(node.textContent); });
  assert.deepEqual(severities, ['Atenção', 'Crítico']);
});

test('administração: erro, carregando e sem alertas', () => {
  const doc = fakeDocument();
  const root = doc.createElement('article');
  renderAutoReplyAdmin(root, { error: 'Acesso restrito aos operadores da plataforma.' }, handlers, doc);
  assert.match(textOf(root), /Acesso restrito/);
  renderAutoReplyAdmin(root, {}, handlers, doc);
  assert.match(textOf(root), /Carregando/);
  renderAutoReplyAdmin(root, { data: { ...DATA, alerts: [], connections: [], allowedSites: [] } }, handlers, doc);
  const text = textOf(root);
  assert.match(text, /Nenhum alerta agora/);
  assert.match(text, /Nenhuma conta conectada/);
  assert.match(text, /Nenhuma vitrine liberada/);
});

test('administração: identificador da vitrine validado e aba ligada ao painel', async () => {
  assert.equal(validateSiteIdInput(''), 'Informe o identificador da vitrine.');
  assert.match(validateSiteIdInput('pizzaria'), /identificador completo/);
  assert.equal(validateSiteIdInput(' 20000000-0000-0000-0000-00000000000a '), '');
  const html = await readFile(new URL('../web/portal/index.html', import.meta.url), 'utf8');
  assert.match(html, /id="platform-tab-auto-reply"[^>]*aria-controls="platform-auto-reply"/);
  assert.match(html, /id="platform-auto-reply-root"/);
  assert.match(html, /href="\.\/auto-reply-admin\.css"/);
  const cms = await readFile(new URL('../web/portal/platform-cms.js', import.meta.url), 'utf8');
  assert.match(cms, /loadAutoReplyAdmin\(\{ confirm: confirmAction \}\)/);
  assert.match(cms, /resetAutoReplyAdmin\(\)/);
});
