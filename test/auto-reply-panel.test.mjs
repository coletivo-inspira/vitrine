import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  OAUTH_RESULT_MESSAGES,
  blockerText,
  describeConnection,
  readOAuthResult,
  renderAutoReplyPanel
} from '../web/portal/auto-reply-panel.mjs';
import { AUTO_REPLY_DEFAULT_MESSAGE } from '../web/assets/auto-reply-message.mjs';

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

function buttons(root) {
  const found = [];
  walk(root, (node) => { if (node.tag === 'button') found.push(node.textContent); });
  return found;
}

const URL_A = 'https://vitrine.inspira.dev.br/pizzaria-exemplo';

function data(overrides = {}) {
  return {
    role: 'owner', canManage: true, availability: 'available', connection: null,
    settings: { enabled: false, message: AUTO_REPLY_DEFAULT_MESSAGE, frequency: 'daily', version: 0, lastSentAt: null },
    publicUrl: URL_A, publicUrlReason: null, enableBlocker: 'not_connected', limits: { maxBytes: 1000 },
    ...overrides
  };
}

function ui(dataValue, extra = {}) {
  return {
    isOnline: true, data: dataValue, draft: { ...dataValue.settings }, siteName: 'Pizzaria Exemplo',
    onConnect() {}, onDraft() {}, onSave() {}, onAskDisconnect() {}, onCancelDisconnect() {}, onDisconnect() {}, onRetry() {},
    ...extra
  };
}

const CONNECTION = {
  provider: 'instagram', username: 'pizzaria.exemplo', displayName: 'Pizzaria Exemplo', status: 'connected',
  hasMessagingPermission: true, webhookSubscribed: true, connectedAt: '2026-11-26T15:00:00.000Z', lastEventAt: null
};

test('painel: desconectado mostra benefícios, requisitos, permissões e o botão só para quem gerencia', () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  renderAutoReplyPanel(container, ui(data()), doc);
  const text = textOf(container);
  assert.match(text, /Conta profissional do Instagram/);
  assert.match(text, /Permitir acesso às mensagens/);
  assert.match(text, /não guarda o texto das conversas/);
  assert.deepEqual(buttons(container), ['Conectar Instagram']);
  const viewer = doc.createElement('section');
  renderAutoReplyPanel(viewer, ui(data({ role: 'viewer', canManage: false })), doc);
  assert.deepEqual(buttons(viewer), []);
  assert.match(textOf(viewer), /Só o dono e a administração/);
});

test('painel: fora do piloto mostra "Em teste" sem botão', () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  renderAutoReplyPanel(container, ui(data({ availability: 'not_allowed', enableBlocker: 'not_allowed' })), doc);
  assert.match(textOf(container), /vitrines convidadas/);
  assert.deepEqual(buttons(container), []);
});

test('painel: conectado mostra conta, mensagem, endereço, frequência, prévia e ações', () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  renderAutoReplyPanel(container, ui(data({ connection: CONNECTION, enableBlocker: null })), doc);
  const text = textOf(container);
  assert.match(text, /@pizzaria\.exemplo/);
  assert.match(text, /Aguardando a primeira mensagem/);
  assert.match(text, /Endereço enviado/);
  assert.match(text, new RegExp(URL_A.replace(/[./]/g, '\\$&')));
  assert.match(text, /No máximo uma vez a cada 24 horas/);
  assert.match(text, /Gostaria de conhecer o cardápio/);
  assert.match(text, /Espaço restante: \d+ de 1000/);
  assert.deepEqual(buttons(container), ['Reconectar', 'Desconectar', 'Salvar']);
  let toggle;
  walk(container, (node) => { if (node.id === 'auto-reply-enabled') toggle = node; });
  assert.equal(toggle.attrs.role, 'switch');
  assert.equal(toggle.disabled, false);
});

test('painel: reconexão necessária mostra alerta e bloqueia o interruptor com o motivo', () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  renderAutoReplyPanel(container, ui(data({
    connection: { ...CONNECTION, status: 'reconnect_required' }, enableBlocker: 'reconnect_required'
  })), doc);
  assert.match(textOf(container), /renovar a autorização/);
  let toggle;
  walk(container, (node) => { if (node.id === 'auto-reply-enabled') toggle = node; });
  assert.equal(toggle.disabled, true);
  assert.equal(describeConnection({ status: 'reconnect_required' }).label, 'Reconexão necessária');
  assert.equal(blockerText('site_not_published'), 'Publique a vitrine para ligar a resposta automática.');
});

test('painel: resultado do retorno da Meta vira aviso e some do endereço', () => {
  const replaced = [];
  const result = readOAuthResult(
    { href: 'https://painel.inspira.dev.br/?autoResposta=cancelled&vitrine=abc#canais' },
    { state: null, replaceState: (_s, _t, url) => replaced.push(url) }
  );
  assert.equal(result, 'cancelled');
  assert.deepEqual(replaced, ['/#canais']);
  assert.equal(readOAuthResult({ href: 'https://painel.inspira.dev.br/?autoResposta=<script>' }, null), 'meta_error');
  for (const message of Object.values(OAUTH_RESULT_MESSAGES)) assert.ok(message.text.length > 10);
});

test('painel: index carrega o CSS e a seção, e o editor monta o painel', async () => {
  const html = await readFile(new URL('../web/portal/index.html', import.meta.url), 'utf8');
  assert.match(html, /href="\.\/auto-reply-panel\.css"/);
  assert.match(html, /id="auto-reply-panel"/);
  const editor = await readFile(new URL('../web/portal/editor.js', import.meta.url), 'utf8');
  assert.match(editor, /mountAutoReplyPanel\(/);
});
