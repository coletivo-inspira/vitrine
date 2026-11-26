import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const html = await readFile(resolve(root, 'web/portal/index.html'), 'utf8');
const cmsJs = await readFile(resolve(root, 'web/portal/platform-cms.js'), 'utf8');
const adminHtml = html.slice(
  html.indexOf('<section id="platform-cms-section"'),
  html.indexOf('</section>', html.indexOf('<section id="platform-cms-section"'))
);

test('Administração: entrada pelo menu só para platform_admin, sem pílula no Início', () => {
  const inicio = html.slice(html.indexOf('<section id="inicio-section"'), html.indexOf('</section>', html.indexOf('<section id="inicio-section"')));
  assert.ok(!inicio.includes('platform-cms-open'), 'o Início não pode ter a pílula de administração');
  const items = [...html.matchAll(/<div class="nav-admin-item" role="none" hidden>\s*<a\b([^>]*)>/g)];
  assert.equal(items.length, 1, 'o menu do avatar tem o item de administração oculto por padrão');
  for (const [, attrs] of items) {
    assert.match(attrs, /href="#\/administracao"/);
    assert.match(attrs, /role="menuitem"/);
    assert.match(attrs, /id="platform-cms-open"/);
  }
});

test('Administração: abas acessíveis no lugar dos <details>', () => {
  assert.ok(adminHtml.length > 0);
  assert.doesNotMatch(adminHtml, /<details|<summary/, 'a administração não usa mais blocos <details> crus');
  assert.match(adminHtml, /role="tablist"/);
  assert.match(adminHtml, /class="display-title"/);
  const tabs = [...adminHtml.matchAll(/<button\b[^>]*role="tab"[^>]*>([^<]+)<\/button>/g)];
  assert.deepEqual(tabs.map(([, label]) => label), ['Visão geral', 'Pedidos pela Mila', 'Importar do Linktree', 'Patrocinadores', 'Resposta automática', 'Modelos de vitrine', 'Site institucional']);
  for (const [tag] of tabs) {
    const panelId = tag.match(/aria-controls="([^"]+)"/)[1];
    const tabId = tag.match(/id="([^"]+)"/)[1];
    const panel = adminHtml.match(new RegExp(`<div id="${panelId}"[^>]*>`))?.[0];
    assert.ok(panel, `painel #${panelId} existe`);
    assert.match(panel, /role="tabpanel"/);
    assert.match(panel, new RegExp(`aria-labelledby="${tabId}"`));
  }
  assert.equal([...adminHtml.matchAll(/aria-selected="true"/g)].length, 1);
});

test('Administração: todo id usado pelo JS existe no HTML e a UI evita os termos proibidos', () => {
  for (const [, id] of cmsJs.matchAll(/getElementById\('([^']+)'\)/g)) {
    assert.match(html, new RegExp(`id="${id}"`), `#${id} referenciado em platform-cms.js`);
  }
  for (const source of [adminHtml, cmsJs]) {
    assert.doesNotMatch(source, /cat[aá]logo|card[aá]pio/i);
  }
});

test('Administração: rota #/administracao no portal (e a antiga #administracao)', async () => {
  const { getSectionFromHash } = await import('../web/portal/portal.js');
  assert.equal(getSectionFromHash('#/administracao'), 'platform-cms');
  assert.equal(getSectionFromHash('#administracao'), 'platform-cms');
  assert.equal(getSectionFromHash('#inicio'), 'inicio');
});

class FakeElement {
  constructor(doc, tag) {
    Object.assign(this, {
      ownerDocument: doc, tagName: tag.toUpperCase(), childNodes: [], parentNode: null, attributes: {},
      listeners: {}, dataset: {}, hidden: false, disabled: false, value: '', checked: false, type: '', open: false
    });
    this.classSet = new Set();
    this.classList = {
      add: (...names) => names.forEach(name => this.classSet.add(name)),
      remove: (...names) => names.forEach(name => this.classSet.delete(name)),
      toggle: (name, force) => (force ?? !this.classSet.has(name)) ? this.classSet.add(name) : this.classSet.delete(name),
      contains: name => this.classSet.has(name)
    };
  }
  get className() { return [...this.classSet].join(' '); }
  set className(value) { this.classSet = new Set(String(value).split(/\s+/).filter(Boolean)); }
  get id() { return this.attributes.id ?? ''; }
  set id(value) { this.setAttribute('id', value); }
  get children() { return this.childNodes.filter(node => node instanceof FakeElement); }
  get textContent() { return this.childNodes.map(node => node.textContent ?? node).join(''); }
  set textContent(value) { this.replaceChildren(String(value ?? '')); }
  get valueAsNumber() { return Number(this.value); }
  setAttribute(name, value) {
    this.attributes[name] = String(value);
    if (name === 'id') this.ownerDocument.ids.set(String(value), this);
  }
  getAttribute(name) { return this.attributes[name] ?? null; }
  removeAttribute(name) { delete this.attributes[name]; }
  adopt(node) {
    if (node instanceof FakeElement) {
      node.parentNode?.childNodes.splice(node.parentNode.childNodes.indexOf(node), 1);
      node.parentNode = this;
      return node;
    }
    return { textContent: String(node) };
  }
  append(...nodes) { this.childNodes.push(...nodes.map(node => this.adopt(node))); }
  prepend(...nodes) { this.childNodes.unshift(...nodes.map(node => this.adopt(node))); }
  replaceChildren(...nodes) {
    this.childNodes.forEach(node => { if (node instanceof FakeElement) node.parentNode = null; });
    this.childNodes = [];
    this.append(...nodes);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }
  replaceWith(node) {
    const parent = this.parentNode;
    const index = parent.childNodes.indexOf(this);
    this.remove();
    parent.childNodes.splice(index, 0, parent.adopt(node));
  }
  matches(selector) {
    return selector.split(',').some(part => {
      const [, tag, cls, attr, attrValue] = part.trim().match(/^([a-z]*)(?:\.([\w-]+))?(?:\[(\w+)="([^"]+)"\])?$/) ?? [];
      return (!tag || this.tagName === tag.toUpperCase()) && (!cls || this.classSet.has(cls)) &&
        (!attr || String(this[attr] ?? this.attributes[attr]) === attrValue);
    });
  }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] ?? null; }
  addEventListener(type, listener) { (this.listeners[type] ??= []).push(listener); }
  removeEventListener(type, listener) { this.listeners[type] = (this.listeners[type] ?? []).filter(entry => entry !== listener); }
  dispatchEvent(event) {
    event.target ??= this;
    event.preventDefault ??= () => { event.defaultPrevented = true; };
    for (let node = this; node; node = node.parentNode) {
      (node.listeners[event.type] ?? []).forEach(listener => listener(event));
    }
  }
  click() { this.dispatchEvent({ type: 'click' }); }
  focus() { this.ownerDocument.activeElement = this; }
  reset() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function createDocument(markup) {
  const doc = { ids: new Map(), activeElement: null, listeners: {} };
  doc.createElement = tag => new FakeElement(doc, tag);
  doc.body = doc.createElement('body');
  for (const [, tag, attrs] of markup.matchAll(/<(\w+)\b([^>]*\bid="[^"]+"[^>]*)>/g)) {
    const element = doc.createElement(tag);
    for (const [, name, value] of attrs.matchAll(/([\w-]+)(?:="([^"]*)")?/g)) {
      if (name === 'class') element.className = value;
      else if (name === 'hidden') element.hidden = true;
      else if (name === 'type') element.type = value;
      else element.setAttribute(name, value ?? '');
    }
    doc.body.append(element);
  }
  for (const _ of markup.matchAll(/<li class="nav-admin-item" hidden>/g)) {
    const item = doc.createElement('li');
    item.className = 'nav-admin-item';
    item.hidden = true;
    doc.body.append(item);
  }
  doc.getElementById = id => doc.ids.get(id) ?? null;
  const submit = doc.createElement('button');
  submit.type = 'submit';
  doc.getElementById('platform-mila-form').append(submit);
  doc.querySelectorAll = selector => doc.body.querySelectorAll(selector);
  doc.addEventListener = () => {};
  return doc;
}

test('Administração: menu só após autorização, abas, rascunho e publicação com confirmação', async () => {
  const doc = createDocument(html);
  globalThis.document = doc;
  const calls = [];
  const responses = {
    'GET /api/admin/cms': [200, { sections: [
      { sectionKey: 'footer', visible: true, displayOrder: 9, publishedAt: '2026-11-12T19:00:00Z', content: { copyright: 'Coletivo Inspira' } },
      { sectionKey: 'hero', visible: true, displayOrder: 1, publishedAt: null, content: { headline: 'Sua vitrine', subtitle: 'Pedidos no WhatsApp' } }
    ] }],
    'PUT /api/admin/cms/hero': [200, {}],
    'POST /api/admin/cms/publish': [200, { published: true }]
  };
  globalThis.fetch = async (url, init = {}) => {
    const key = `${init.method ?? 'GET'} ${url}`;
    calls.push({ key, body: init.body ? JSON.parse(init.body) : undefined });
    const [status, body] = responses[key] ?? [403, { error: { message: 'Acesso restrito.' } }];
    return { ok: status < 400, status, json: async () => body };
  };
  const tick = () => new Promise(resolveTick => setTimeout(resolveTick, 0));
  const cms = await import(`../web/portal/platform-cms.js?dom=${Date.now()}`);
  cms.initializePlatformCms();
  const navItems = doc.querySelectorAll('.nav-admin-item');

  responses['GET /api/admin/cms'][0] = 403;
  await cms.detectPlatformCms(true);
  assert.ok(navItems.every(item => item.hidden), 'sem autorização o item do menu continua oculto');
  assert.equal(cms.hasPlatformAdminAccess(), false);
  cms.showPlatformCms(true);
  assert.equal(doc.getElementById('platform-cms-section').hidden, true, 'a seção não abre sem autorização');

  responses['GET /api/admin/cms'][0] = 200;
  await cms.detectPlatformCms(true);
  assert.ok(navItems.every(item => !item.hidden), 'com autorização o item aparece no menu e na navegação móvel');
  assert.equal(cms.hasPlatformAdminAccess(), true);

  const list = doc.getElementById('platform-cms-list');
  const names = list.querySelectorAll('.admin-cms-item').map(item => item.textContent);
  assert.deepEqual(names.map(name => name.replace(/^\d+/, '')), ['AberturaVisível', 'RodapéVisível'], 'lista ordenada pela posição');
  assert.match(doc.getElementById('platform-cms-status').textContent, /Última publicação em/);

  const siteTab = doc.getElementById('platform-tab-site');
  siteTab.click();
  assert.equal(doc.getElementById('platform-site').hidden, false);
  assert.equal(doc.getElementById('platform-operations').hidden, true);
  assert.equal(siteTab.getAttribute('aria-selected'), 'true');
  doc.getElementById('platform-tab-overview').dispatchEvent({ type: 'keydown', key: 'End' });
  assert.equal(doc.activeElement, siteTab, 'End leva à última aba');

  const forms = doc.getElementById('platform-cms-fields').querySelectorAll('form');
  const heroForm = forms.find(form => !form.hidden);
  heroForm.querySelector('.admin-cms-content').querySelector('input').value = 'Nova abertura';
  heroForm.dispatchEvent({ type: 'input' });
  heroForm.dispatchEvent({ type: 'submit' });
  await tick();
  const put = calls.find(call => call.key === 'PUT /api/admin/cms/hero');
  assert.deepEqual(put.body, { content: { headline: 'Nova abertura', subtitle: 'Pedidos no WhatsApp' }, visible: true, displayOrder: 1 });
  assert.match(heroForm.querySelector('p').textContent, /Rascunho salvo/, 'o resultado aparece junto do botão');

  const dialog = doc.getElementById('platform-confirm');
  doc.getElementById('platform-cms-publish').click();
  await tick();
  assert.equal(dialog.open, true, 'publicar pede confirmação');
  assert.match(doc.getElementById('platform-confirm-list').textContent, /Abertura: rascunho salvo nesta sessão/);
  doc.getElementById('platform-confirm-cancel').click();
  await tick();
  assert.equal(calls.some(call => call.key === 'POST /api/admin/cms/publish'), false, 'cancelar não publica');

  doc.getElementById('platform-cms-publish').click();
  await tick();
  doc.getElementById('platform-confirm-accept').click();
  await tick();
  assert.equal(calls.filter(call => call.key === 'POST /api/admin/cms/publish').length, 1);
  assert.match(doc.getElementById('platform-cms-status').textContent, /publicada em/);

  responses['POST /api/admin/cms/publish'] = [409, { error: { message: 'O rascunho mudou.' } }];
  doc.getElementById('platform-cms-publish').click();
  await tick();
  doc.getElementById('platform-confirm-accept').click();
  await tick();
  assert.equal(doc.getElementById('platform-cms-reload').hidden, false, 'conflito oferece atualizar o rascunho');

  await cms.detectPlatformCms(false);
  assert.ok(navItems.every(item => item.hidden), 'ao sair o item some de novo');
  delete globalThis.document;
});

test('Administração: helpers de abas, indicadores e atividade', async () => {
  const { nextTabIndex, overviewMetrics, describeAudit } = await import('../web/portal/platform-cms.js');
  assert.equal(nextTabIndex(0, 'ArrowRight', 4), 1);
  assert.equal(nextTabIndex(0, 'ArrowLeft', 4), 3);
  assert.equal(nextTabIndex(2, 'Home', 4), 0);
  assert.equal(nextTabIndex(1, 'End', 4), 3);
  assert.equal(nextTabIndex(1, 'Enter', 4), -1);

  const metrics = overviewMetrics({
    databaseBytes: 41_200_000, databaseLimitBytes: 500_000_000, siteCount: 12, assetCount: 87,
    activeDomainCount: 1, reservedDomainCount: 3, domainLimit: 95
  }, [{ status: 'novo' }, { status: 'respondido' }, { status: 'encerrado' }]);
  assert.deepEqual(metrics.map(metric => [metric.label, metric.value]), [
    ['Vitrines', '12'], ['Pedidos em aberto', '2'], ['Banco de dados', '41,2 MB'], ['Arquivos', '87'], ['Domínios ativos', '1']
  ]);
  assert.equal(metrics[4].detail, '3 de 95 vagas reservadas');

  assert.equal(describeAudit({ action: 'publish', entity_type: 'platform_cms' }), 'Publicação · página institucional');
  assert.equal(
    describeAudit({ action: 'status_changed', entity_type: 'customization_request', summary: { from: 'novo', to: 'em_analise' } }),
    'Etapa alterada · pedido de customização (Novo → Em análise)'
  );
  assert.equal(describeAudit({ action: 'template_updated', entity_type: 'template', entity_id: 'booking-v1' }), 'Modelo atualizado · modelo de vitrine booking-v1');
});
