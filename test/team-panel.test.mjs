import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { assignableRoles, canManageMember, mountTeamPanel, whatsappShareUrl } from '../web/portal/team-panel.mjs';
import { INVITE_TOKEN_KEY, captureInviteToken, renderInviteConfirmation } from '../web/portal/invite-accept.mjs';

class FakeElement {
  constructor(doc, tag) {
    Object.assign(this, {
      ownerDocument: doc, tagName: tag.toUpperCase(), childNodes: [], parentNode: null, attributes: {},
      listeners: {}, hidden: false, disabled: false, value: '', type: '', href: '', target: '', rel: '', readOnly: false
    });
    this.classSet = new Set();
  }
  get className() { return [...this.classSet].join(' '); }
  set className(value) { this.classSet = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get id() { return this.attributes.id ?? ''; }
  set id(value) { this.attributes.id = String(value); }
  get children() { return this.childNodes.filter((node) => node instanceof FakeElement); }
  get textContent() { return this.childNodes.map((node) => node.textContent ?? '').join(''); }
  set textContent(value) { this.replaceChildren(String(value ?? '')); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  getAttribute(name) { return this.attributes[name] ?? null; }
  append(...nodes) {
    for (const node of nodes) {
      const child = typeof node === 'string' ? { textContent: node } : node;
      child.parentNode = this;
      this.childNodes.push(child);
    }
  }
  replaceChildren(...nodes) { this.childNodes = []; this.append(...nodes); }
  matches(selector) { return this.tagName === selector.toUpperCase() || this.classSet.has(selector.replace(/^\./, '')); }
  querySelectorAll(selector) {
    return this.children.flatMap((child) => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  async fire(type) { for (const listener of this.listeners[type] ?? []) await listener({ type }); }
  focus() { this.ownerDocument.activeElement = this; }
  select() { this.ownerDocument.selected = this; }
}

function fakeDocument() {
  const doc = { activeElement: null, selected: null };
  doc.createElement = (tag) => new FakeElement(doc, tag);
  return doc;
}

const ownerId = '10000000-0000-0000-0000-0000000000e1';
const adminId = '10000000-0000-0000-0000-0000000000e2';
const editorId = '10000000-0000-0000-0000-0000000000e3';
const siteId = '20000000-0000-0000-0000-0000000000e1';
const team = () => ({
  members: [
    { userId: ownerId, displayName: 'Ana Dona', role: 'owner' },
    { userId: adminId, displayName: null, role: 'admin' },
    { userId: editorId, displayName: 'Bia', role: 'editor' }
  ],
  invitations: [{ id: '30000000-0000-0000-0000-0000000000e1', role: 'admin', expiresAt: '2026-12-03T13:00:00.000Z' }]
});

function fakeRequest(responses = {}) {
  const calls = [];
  const request = async (path, init = {}) => {
    calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(init.body) : undefined, headers: init.headers });
    const handler = responses[`${init.method ?? 'GET'} ${path}`];
    if (!handler) throw Object.assign(new Error('não simulado'), { status: 500 });
    return typeof handler === 'function' ? handler(init) : structuredClone(handler);
  };
  return { request, calls };
}

const buttons = (root, label) => root.querySelectorAll('button').filter((node) => node.textContent === label);
const rows = (root) => root.querySelectorAll('li');
const status = (root) => root.querySelectorAll('p').find((node) => node.getAttribute('role') === 'status');

test('regras de papel do painel seguem as do banco', () => {
  assert.deepEqual(assignableRoles('owner'), ['admin', 'editor', 'viewer']);
  assert.deepEqual(assignableRoles('admin'), ['editor', 'viewer']);
  assert.deepEqual(assignableRoles('editor'), []);
  assert.equal(canManageMember('owner', 'owner'), false);
  assert.equal(canManageMember('owner', 'admin'), true);
  assert.equal(canManageMember('admin', 'admin'), false);
  assert.equal(canManageMember('admin', 'editor'), true);
  assert.equal(canManageMember('editor', 'viewer'), false);
  assert.equal(whatsappShareUrl('Oi & tchau'), 'https://wa.me/?text=Oi%20%26%20tchau');
});

test('proprietário vê nomes e papéis, muda papel, remove e gera link com Copiar e WhatsApp', async () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  const base = `/api/sites/${siteId}`;
  const url = `https://painel.inspira.dev.br/convite/${'a'.repeat(43)}`;
  const { request, calls } = fakeRequest({
    [`GET ${base}/team`]: team(),
    [`POST ${base}/members`]: (init) => ({ member: JSON.parse(init.body) }),
    [`DELETE ${base}/members/${adminId}`]: () => null,
    [`POST ${base}/invitations`]: {
      invitation: { id: '30000000-0000-0000-0000-0000000000e2', role: 'viewer', expiresAt: '2026-12-03T14:00:00.000Z' },
      url,
      message: `Oi! Estou chamando você para a equipe da vitrine Pizza na Vitrine Inspira, como Somente leitura. Entre por este link: ${url}`
    }
  });
  const copied = [];
  const panel = mountTeamPanel({
    doc, container, siteId, siteName: 'Pizza', role: 'owner', request,
    clipboard: { writeText: async (text) => { copied.push(text); } }
  });
  await panel.ready;

  assert.ok(container.className.includes('team-panel'));
  assert.equal(status(container).getAttribute('aria-live'), 'polite');
  const text = container.textContent;
  assert.match(text, /Ana Dona/);
  assert.match(text, /Proprietário/);
  assert.match(text, /Pessoa sem nome/);
  assert.match(text, /Administrador/);
  assert.match(text, /Funcionário/);
  assert.match(text, /Convite para Administrador/);
  assert.ok(!text.includes(ownerId) && !text.includes(adminId) && !text.includes(editorId));

  const memberRows = rows(container).slice(0, 3);
  assert.equal(memberRows[0].querySelectorAll('select').length, 0);
  assert.equal(memberRows[0].querySelectorAll('button').length, 0);
  const editorSelect = memberRows[2].querySelectorAll('select')[0];
  const editorLabel = memberRows[2].querySelectorAll('label')[0];
  assert.equal(editorLabel.getAttribute('for'), editorSelect.id);
  assert.equal(editorLabel.textContent, 'Papel de Bia');
  assert.deepEqual(editorSelect.querySelectorAll('option').map((node) => node.value), ['admin', 'editor', 'viewer']);

  editorSelect.value = 'viewer';
  await editorSelect.fire('change');
  assert.deepEqual(calls.at(-1), {
    path: `${base}/members`, method: 'POST', body: { userId: editorId, role: 'viewer' }, headers: { 'content-type': 'application/json' }
  });
  assert.equal(status(container).textContent, 'Bia agora é Somente leitura.');

  await buttons(memberRows[1], 'Remover')[0].fire('click');
  assert.equal(buttons(container, 'Confirmar remoção').length, 1);
  await buttons(container, 'Confirmar remoção')[0].fire('click');
  assert.deepEqual(calls.at(-1).path, `${base}/members/${adminId}`);
  assert.equal(calls.at(-1).method, 'DELETE');
  assert.equal(status(container).textContent, 'Pessoa sem nome saiu da equipe.');
  const memberList = container.querySelectorAll('ul')[0];
  assert.deepEqual(memberList.querySelectorAll('strong').map((node) => node.textContent), ['Ana Dona', 'Bia']);

  const inviteSelect = container.querySelectorAll('select').find((node) => node.id === 'equipe-convite-papel');
  inviteSelect.value = 'viewer';
  await inviteSelect.fire('change');
  await buttons(container, 'Gerar link de convite')[0].fire('click');
  assert.deepEqual(calls.at(-1).body, { role: 'viewer' });
  const linkInput = container.querySelectorAll('input')[0];
  assert.equal(linkInput.value, url);
  assert.equal(linkInput.readOnly, true);
  const whatsapp = container.querySelectorAll('a').find((node) => node.textContent === 'Abrir no WhatsApp');
  assert.ok(whatsapp.href.startsWith('https://wa.me/?text=Oi!%20Estou%20chamando'));
  assert.ok(whatsapp.href.includes(encodeURIComponent(url)));
  assert.equal(whatsapp.rel, 'noopener noreferrer');
  assert.match(container.textContent, /Convite para Somente leitura/);

  await buttons(container, 'Copiar link')[0].fire('click');
  assert.deepEqual(copied, [url]);
  assert.equal(status(container).textContent, 'Link copiado.');
});

test('admin não gere admin, e editor ou viewer só veem o aviso de leitura', async () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  const { request } = fakeRequest({ [`GET /api/sites/${siteId}/team`]: team() });
  await mountTeamPanel({ doc, container, siteId, role: 'admin', request, clipboard: null }).ready;
  const memberRows = rows(container).slice(0, 3);
  assert.equal(memberRows[1].querySelectorAll('select').length, 0);
  assert.equal(memberRows[2].querySelectorAll('select').length, 1);
  assert.deepEqual(memberRows[2].querySelectorAll('select')[0].querySelectorAll('option').map((node) => node.value), ['editor', 'viewer']);
  assert.equal(buttons(rows(container)[3], 'Revogar').length, 0);
  const inviteSelect = container.querySelectorAll('select').find((node) => node.id === 'equipe-convite-papel');
  assert.deepEqual(inviteSelect.querySelectorAll('option').map((node) => node.value), ['editor', 'viewer']);

  for (const role of ['editor', 'viewer']) {
    const readOnly = doc.createElement('section');
    const tracked = fakeRequest({});
    await mountTeamPanel({ doc, container: readOnly, siteId, role, request: tracked.request }).ready;
    assert.equal(tracked.calls.length, 0);
    assert.match(readOnly.textContent, /Só o proprietário e a administração convidam pessoas e mudam papéis/);
    assert.equal(readOnly.querySelectorAll('button').length, 0);
    assert.equal(readOnly.querySelectorAll('select').length, 0);
  }
});

test('copiar sem área de transferência seleciona o link e avisa', async () => {
  const doc = fakeDocument();
  const container = doc.createElement('section');
  const base = `/api/sites/${siteId}`;
  const { request } = fakeRequest({
    [`GET ${base}/team`]: { members: [], invitations: [] },
    [`POST ${base}/invitations`]: { invitation: { id: 'x', role: 'editor', expiresAt: null }, url: 'https://exemplo.test/convite/abc', message: 'Oi' }
  });
  await mountTeamPanel({ doc, container, siteId, role: 'owner', request, clipboard: undefined }).ready;
  await buttons(container, 'Gerar link de convite')[0].fire('click');
  await buttons(container, 'Copiar link')[0].fire('click');
  assert.equal(doc.selected, container.querySelectorAll('input')[0]);
  assert.match(status(container).textContent, /O link está selecionado/);
  assert.match(status(container).className, /is-error/);
});

function memoryStorage(initial = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data
  };
}

test('captureInviteToken guarda o token na sessão e tira o token do endereço', () => {
  const token = 'b'.repeat(43);
  const storage = memoryStorage();
  const replaced = [];
  const location = { hash: `#/convite/${token}`, pathname: '/portal/', search: '' };
  const history = { replaceState: (_state, _title, target) => replaced.push(target) };
  assert.equal(captureInviteToken({ location, history, storage }), true);
  assert.equal(storage.getItem(INVITE_TOKEN_KEY), token);
  assert.deepEqual(replaced, ['/portal/#/convite']);

  const empty = memoryStorage();
  assert.equal(captureInviteToken({ location: { hash: '#/', pathname: '/', search: '' }, history, storage: empty }), false);
  assert.equal(replaced.length, 1);
  assert.equal(captureInviteToken({ location: { hash: '#/convite', pathname: '/', search: '' }, history, storage }), true);
});

test('confirmação: aceitar limpa a sessão; já membro e indisponível mostram o texto certo', async () => {
  const token = 'c'.repeat(43);
  const doc = fakeDocument();
  const lookup = { kind: 'team', siteName: 'Pizza Equipe', role: 'editor', expiresAt: '2026-12-03T13:00:00.000Z' };

  const storage = memoryStorage({ [INVITE_TOKEN_KEY]: token });
  const accepted = [];
  const { request, calls } = fakeRequest({
    'POST /api/invitations/lookup': lookup,
    'POST /api/invitations/accept': { siteId, slug: 'pizza-equipe', role: 'editor' }
  });
  const container = doc.createElement('div');
  assert.equal(await renderInviteConfirmation({ doc, container, request, storage, onAccepted: (value) => accepted.push(value) }), 'ready');
  assert.equal(container.querySelectorAll('h2')[0].textContent, 'Pizza Equipe convidou você para a equipe como Funcionário');
  assert.deepEqual(calls[0].body, { token });
  assert.equal(buttons(container, 'Agora não').length, 1);
  await buttons(container, 'Aceitar convite')[0].fire('click');
  assert.deepEqual(accepted, [{ siteId, role: 'editor' }]);
  assert.equal(storage.getItem(INVITE_TOKEN_KEY), null);
  assert.equal(status(container).textContent, 'Você entrou na equipe como Funcionário.');

  const memberStorage = memoryStorage({ [INVITE_TOKEN_KEY]: token });
  const member = fakeRequest({
    'POST /api/invitations/lookup': lookup,
    'POST /api/invitations/accept': () => { throw Object.assign(new Error('x'), { status: 409, code: 'ALREADY_MEMBER' }); }
  });
  const memberBox = doc.createElement('div');
  await renderInviteConfirmation({ doc, container: memberBox, request: member.request, storage: memberStorage });
  await buttons(memberBox, 'Aceitar convite')[0].fire('click');
  assert.equal(memberBox.querySelectorAll('h2')[0].textContent, 'Você já faz parte desta vitrine');
  assert.equal(memberStorage.getItem(INVITE_TOKEN_KEY), null);

  const goneStorage = memoryStorage({ [INVITE_TOKEN_KEY]: token });
  const gone = fakeRequest({
    'POST /api/invitations/lookup': () => { throw Object.assign(new Error('x'), { status: 404, code: 'INVITATION_UNAVAILABLE' }); }
  });
  const goneBox = doc.createElement('div');
  assert.equal(await renderInviteConfirmation({ doc, container: goneBox, request: gone.request, storage: goneStorage }), 'unavailable');
  assert.equal(goneBox.querySelectorAll('h2')[0].textContent, 'Este convite não está mais disponível');
  assert.equal(goneStorage.getItem(INVITE_TOKEN_KEY), null);

  const laterStorage = memoryStorage({ [INVITE_TOKEN_KEY]: token });
  const laterBox = doc.createElement('div');
  let dismissed = false;
  await renderInviteConfirmation({
    doc, container: laterBox, request: fakeRequest({ 'POST /api/invitations/lookup': lookup }).request,
    storage: laterStorage, onDismiss: () => { dismissed = true; }
  });
  await buttons(laterBox, 'Agora não')[0].fire('click');
  assert.equal(dismissed, true);
  assert.equal(laterStorage.getItem(INVITE_TOKEN_KEY), null);
});

test('módulos da Equipe seguem a CSP do painel: sem innerHTML, sem estilo inline', async () => {
  for (const file of ['team-panel.mjs', 'invite-accept.mjs']) {
    const source = await readFile(new URL(`../web/portal/${file}`, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|\.style\.|setAttribute\(\s*['"]style/);
  }
  const css = await readFile(new URL('../web/portal/team-panel.css', import.meta.url), 'utf8');
  assert.doesNotMatch(css, /border-radius:\s*(999px|var\(--radius-control\))/);
});
