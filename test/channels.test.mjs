import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEntitlements } from '../src/entitlements.mjs';
import { assertNoPrivateLeakage, compilePublicStorefront, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { validateDraftContent } from '../src/portal-validation.mjs';
import { projectPublicChannels, readChannelsStatus } from '../src/channels.mjs';
import { buildLinktreeDemoDraft } from '../src/linktree-import.mjs';
import {
  channelDraftErrors,
  instagramHandleFrom,
  normalizeInstagramUrl,
  normalizePublicEmail,
  whatsappTestLink
} from '../web/assets/channels.mjs';
import { MILA_WHATSAPP, buildMilaRelayCode } from '../web/assets/mila-relay.mjs';
import { describeIntegration, describeWebhookDiagnostic, renderChannelsPanel } from '../web/portal/channels-panel.mjs';
import { createApiHandler, createMemoryStore, hydratePublicationRecord } from '../workers/api.mjs';

const SITE = '20000000-0000-0000-0000-0000000000c1';
const OWNER = '10000000-0000-0000-0000-000000000001';
const MEMBER = '10000000-0000-0000-0000-000000000002';
const PANEL = 'https://painel.inspira.dev.br';
const PRO = { plan_code: 'profissional', features: ['custom_domain', 'quote_webhook', 'public_json', 'local_seo'] };

function content(extra = {}) {
  return {
    schemaVersion: 1,
    template: 'pizzeria-v1',
    catalogType: 'products',
    slug: 'atelie-barro',
    businessName: 'Ateliê Barro Vivo',
    whatsapp: '5531988887777',
    categories: [{ id: 'pecas', name: 'Peças', items: [{ id: 'vaso', name: 'Vaso', priceCents: 9000 }] }],
    ...extra
  };
}

function store(role = 'viewer') {
  return createMemoryStore({
    sites: [{ id: SITE, owner_user_id: OWNER, slug: 'atelie-barro', name: 'Ateliê Barro Vivo', template: 'pizzeria-v1' }],
    memberships: [{ site_id: SITE, user_id: MEMBER, role }],
    drafts: [{ siteId: SITE, revision: 1, content: content() }]
  });
}

function get(path, token) {
  return new Request(`${PANEL}${path}`, { headers: { Authorization: `Bearer ${token}`, Origin: PANEL } });
}

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

test('Instagram: aceita @perfil, perfil e instagram.com; recusa publicação, http e outros domínios', () => {
  for (const value of ['@atelie.barro', 'atelie.barro', 'https://instagram.com/atelie.barro', 'https://www.instagram.com/atelie.barro/', 'instagram.com/atelie.barro']) {
    assert.equal(normalizeInstagramUrl(value), 'https://www.instagram.com/atelie.barro/', value);
  }
  for (const value of [
    'https://www.instagram.com/p/xyz/', 'http://instagram.com/atelie', 'https://instagram.com.golpe.example/x',
    'https://facebook.com/atelie', 'javascript:alert(1)', 'a..b', '@', 'https://user:x@instagram.com/a', ''
  ]) {
    assert.equal(normalizeInstagramUrl(value), null, value);
  }
  assert.equal(instagramHandleFrom('https://www.instagram.com/explore/'), null);
  assert.equal(normalizePublicEmail(' oi@atelie.com.br '), 'oi@atelie.com.br');
  assert.equal(normalizePublicEmail('sem-arroba'), null);
});

test('Rascunho: instagramUrl e publicEmail inválidos são recusados no servidor; o instagram do Linktree vale', () => {
  assert.throws(() => validateDraftContent(content({ instagramUrl: 'https://golpe.example/atelie' })), { code: 'INVALID_INSTAGRAM_URL', field: 'instagramUrl' });
  assert.throws(() => validateDraftContent(content({ publicEmail: 'oi@' })), { code: 'INVALID_PUBLIC_EMAIL', field: 'publicEmail' });
  assert.throws(() => validateDraftContent(content({ instagram: 'p' })), { code: 'INVALID_INSTAGRAM_URL' });
  assert.doesNotThrow(() => validateDraftContent(content({ instagram: 'ana.doces', publicEmail: 'oi@ana.com.br' })));
  assert.deepEqual(channelDraftErrors(content({ instagramUrl: '', publicEmail: '' })), []);
});

test('Projeção: instagramUrl canônico e publicEmail entram no snapshot; o perfil do Linktree vira instagramUrl', async () => {
  const { menu } = await compilePublicStorefront(
    content({ instagramUrl: '@atelie.barro', publicEmail: 'oi@atelie.com.br' }),
    { slug: 'atelie-barro' }
  );
  assert.equal(menu.instagramUrl, 'https://www.instagram.com/atelie.barro/');
  assert.equal(menu.publicEmail, 'oi@atelie.com.br');
  assert.doesNotThrow(() => assertNoPrivateLeakage(menu));

  const legacy = projectPublicChannels({ instagram: 'ana.doces' });
  assert.deepEqual(legacy, { instagramUrl: 'https://www.instagram.com/ana.doces/' });
  const linktree = buildLinktreeDemoDraft(
    { username: 'ana.doces', name: 'Ana Doces', description: null, photoUrl: null, whatsapp: '5531999998888', instagram: 'ana.doces', links: [], skipped: 0 },
    { importedAt: '2026-11-14T12:00:00.000Z' }
  );
  assert.equal(linktree.content.instagramUrl, 'https://www.instagram.com/ana.doces/');

  const { menu: bare } = await compilePublicStorefront(content(), { slug: 'atelie-barro' });
  assert.equal('instagramUrl' in bare, false);
  assert.equal('publicEmail' in bare, false);
});

test('assertNoPrivateLeakage: instagramUrl fora do instagram.com, não canônico ou e-mail inválido são recusados', async () => {
  const { menu } = await compilePublicStorefront(content({ instagramUrl: '@atelie.barro' }), { slug: 'atelie-barro' });
  for (const forged of [
    { ...menu, instagramUrl: 'https://golpe.example/atelie' },
    { ...menu, instagramUrl: 'https://instagram.com/atelie.barro' },
    { ...menu, publicEmail: 'javascript:alert(1)' },
    { ...menu, email: 'dono@privado.com' }
  ]) {
    assert.throws(() => assertNoPrivateLeakage(forged), { code: 'PRIVATE_FIELD_LEAKAGE' });
  }
});

test('Reidratação: snapshot com Instagram e e-mail mantém o hash', async () => {
  const compiled = await compilePublicStorefront(
    content({ instagramUrl: 'https://instagram.com/atelie.barro', publicEmail: 'oi@atelie.com.br' }),
    { slug: 'atelie-barro' },
    { publishedAt: '2026-11-15T00:00:00.000Z' }
  );
  const hydrated = await hydratePublicationRecord({
    slug: 'atelie-barro', revision: 1, published_at: '2026-11-15T00:00:00.000Z', menu: JSON.parse(compiled.json)
  });
  assert.equal(hydrated.hash, compiled.hash);
  assert.equal(hydrated.menu.instagramUrl, 'https://www.instagram.com/atelie.barro/');
});

test('Vitrine pública: Instagram no cabeçalho e e-mail e Instagram no rodapé', async () => {
  const { menu } = await compilePublicStorefront(
    content({ instagramUrl: '@atelie.barro', publicEmail: 'oi@atelie.com.br' }),
    { slug: 'atelie-barro' }
  );
  const html = renderStorefrontHtml(menu);
  const header = html.match(/<header class="storefront-topbar"[\s\S]*?<\/header>/)?.[0] ?? '';
  const footer = html.match(/<footer class="storefront-footer"[\s\S]*?<\/footer>/)?.[0] ?? '';
  assert.match(header, /href="https:\/\/www\.instagram\.com\/atelie\.barro\/"/);
  assert.match(footer, /href="https:\/\/www\.instagram\.com\/atelie\.barro\/"/);
  assert.match(footer, /href="mailto:oi@atelie\.com\.br"/);
});

test('Testar do WhatsApp: wa.me sem mensagem no modo direto; no modo Mila, o número da Mila e o código', () => {
  assert.deepEqual(whatsappTestLink({ whatsapp: '5531988887777' }, 'atelie-barro'), {
    via: 'direct', number: '5531988887777', url: 'https://wa.me/5531988887777'
  });
  const mila = whatsappTestLink({ whatsapp: '5531988887777', orderRelay: 'mila' }, 'atelie-barro');
  assert.equal(mila.number, MILA_WHATSAPP);
  assert.equal(mila.url, `https://wa.me/${MILA_WHATSAPP}?text=${encodeURIComponent(`#${buildMilaRelayCode('atelie-barro')}`)}`);
  assert.equal(whatsappTestLink({ whatsapp: '123' }, 'x').url, null);
});

test('GET /channels: dono vê domínio, vitrine.json, webhook e Instagram "em breve"; viewer só leitura e sem detalhes', async () => {
  const memory = store('viewer');
  memory.getSiteEntitlements = async () => PRO;
  memory.listDomains = async () => [{
    id: 'd1', hostname: 'www.atelie.com.br', status: 'pending_dns', ssl_status: 'pending', cname_target: 'vitrine.inspira.dev.br'
  }];
  await memory.saveQuoteWebhookUrl(SITE, 'https://hooks.example.com/vitrine');
  await memory.saveQuoteWebhookSecret(SITE, 'v1.cifrado.teste');
  await memory.recordQuoteWebhookDelivery(SITE, { kind: 'lead', ok: false, httpStatus: 500, attempts: 3 });
  const api = createApiHandler({ store: memory });

  const owner = await api.fetch(get(`/api/sites/${SITE}/channels`, 'token-owner'), {});
  assert.equal(owner.status, 200);
  assert.equal(owner.headers.get('cache-control'), 'no-store');
  const { channels } = await owner.json();
  assert.equal(channels.canManageIntegrations, true);
  assert.deepEqual(channels.plan, { code: 'profissional', name: 'Profissional' });
  const byId = Object.fromEntries(channels.integrations.map((entry) => [entry.id, entry]));
  assert.equal(byId.custom_domain.state, 'pending');
  assert.equal(byId.custom_domain.diagnostic.cnameTarget, 'vitrine.inspira.dev.br');
  assert.equal(byId.public_json.state, 'off');
  assert.equal(byId.quote_webhook.state, 'error');
  assert.equal(byId.quote_webhook.diagnostic.host, 'hooks.example.com');
  assert.equal(byId.quote_webhook.diagnostic.lastDelivery.httpStatus, 500);
  assert.equal(byId.instagram_connect.state, 'soon');
  assert.ok(!JSON.stringify(channels).includes('v1.cifrado'), 'nunca devolve o segredo');

  const viewer = await api.fetch(get(`/api/sites/${SITE}/channels`, 'token-member'), {});
  assert.equal(viewer.status, 200);
  const view = (await viewer.json()).channels;
  assert.equal(view.role, 'viewer');
  assert.equal(view.canEditLinks, false);
  assert.equal(view.canManageIntegrations, false);
  const viewById = Object.fromEntries(view.integrations.map((entry) => [entry.id, entry]));
  assert.equal(viewById.quote_webhook.state, 'restricted');
  assert.equal(viewById.quote_webhook.diagnostic, undefined);
  assert.equal(viewById.custom_domain.state, 'restricted');
  assert.ok(!JSON.stringify(view).includes('hooks.example.com'));

  assert.equal((await api.fetch(get(`/api/sites/${SITE}/channels`, 'token-stranger'), {})).status, 404);
  assert.equal((await api.fetch(new Request(`${PANEL}/api/sites/${SITE}/channels`), {})).status, 401);
  const post = await api.fetch(new Request(`${PANEL}/api/sites/${SITE}/channels`, {
    method: 'POST', headers: { Authorization: 'Bearer token-owner', Origin: PANEL, 'Content-Type': 'application/json' }, body: '{}'
  }), {});
  assert.equal(post.status, 405);
});

test('Status: plano Gratuito mostra o plano necessário; vitrine.json fica ativo depois de publicar com o recurso', async () => {
  const memory = store('editor');
  const free = await readChannelsStatus(memory, { id: SITE, slug: 'atelie-barro', role: 'owner' });
  const freeById = Object.fromEntries(free.integrations.map((entry) => [entry.id, entry]));
  assert.equal(freeById.custom_domain.state, 'locked');
  assert.deepEqual(freeById.custom_domain.requiredPlan, { code: 'essencial', name: 'Essencial' });
  assert.equal(freeById.public_json.state, 'locked');
  assert.equal(freeById.quote_webhook.requiredPlan.name, 'Profissional');

  memory.getSiteEntitlements = async () => PRO;
  const compiled = await compilePublicStorefront(content(), { slug: 'atelie-barro' }, { publicJson: true });
  const pro = await readChannelsStatus(memory, { id: SITE, slug: 'atelie-barro', role: 'editor' }, {
    loadPublication: async () => compiled.publication
  });
  const proById = Object.fromEntries(pro.integrations.map((entry) => [entry.id, entry]));
  assert.equal(proById.public_json.state, 'active');
  assert.equal(proById.public_json.diagnostic.url, 'https://vitrine.inspira.dev.br/atelie-barro/vitrine.json');
  assert.equal(pro.canEditLinks, true);
  assert.equal(pro.canManageIntegrations, false);
});

test('Painel: viewer vê a central sem botões nem campos de alteração; dono tem campos e o plano aparece antes do clique', () => {
  const doc = fakeDocument();
  const status = {
    role: 'viewer', canEditLinks: false, canManageIntegrations: false, plan: { code: 'free', name: 'Gratuito' },
    integrations: [
      { id: 'custom_domain', available: false, requiredPlan: { code: 'essencial', name: 'Essencial' }, state: 'locked' },
      { id: 'public_json', available: false, requiredPlan: { code: 'profissional', name: 'Profissional' }, state: 'locked' },
      { id: 'quote_webhook', available: false, requiredPlan: { code: 'profissional', name: 'Profissional' }, state: 'locked', restricted: true },
      { id: 'instagram_connect', available: false, requiredPlan: null, state: 'soon' }
    ]
  };
  const draft = content({ instagramUrl: 'https://www.instagram.com/atelie.barro/', publicEmail: 'oi@atelie.com.br' });
  const container = doc.createElement('section');
  renderChannelsPanel(container, { site: { id: SITE, slug: 'atelie-barro', role: 'viewer' }, content: draft, status }, doc);
  const tags = [];
  const links = [];
  walk(container, (node) => {
    tags.push(node.tag);
    if (node.tag === 'a') links.push(node);
  });
  assert.ok(!tags.includes('button'), 'viewer não tem botões');
  assert.ok(!tags.includes('input'), 'viewer não tem campos');
  const text = textOf(container);
  assert.match(text, /Acesso de leitura \(Leitor\)/);
  assert.match(text, /Exige plano Essencial/);
  assert.match(text, /Plano necessário/);
  assert.match(text, /Em breve/);
  const whatsapp = links.find((link) => link.href === 'https://wa.me/5531988887777');
  assert.ok(whatsapp, 'Testar do WhatsApp');
  assert.equal(whatsapp.target, '_blank');
  assert.equal(whatsapp.rel, 'noopener noreferrer');
  assert.match(text, /Nada é enviado até você tocar em enviar/);
  assert.ok(links.some((link) => link.href === 'https://vitrine.inspira.dev.br/planos/'), 'link para os planos, não botão desabilitado');

  const ownerContainer = doc.createElement('section');
  renderChannelsPanel(ownerContainer, {
    site: { id: SITE, slug: 'atelie-barro', role: 'owner' }, content: draft, status: { ...status, role: 'owner', canEditLinks: true, canManageIntegrations: true }
  }, doc);
  const ownerTags = [];
  walk(ownerContainer, (node) => ownerTags.push(node.tag));
  assert.ok(ownerTags.includes('input') && ownerTags.includes('button'));
});

test('Painel: editar o Instagram grava instagramUrl canônico, remove o campo do Linktree e não grava valor inválido', () => {
  const doc = fakeDocument();
  let changes = 0;
  const draft = content({ instagram: 'ana.doces' });
  const container = doc.createElement('section');
  renderChannelsPanel(container, {
    site: { id: SITE, slug: 'atelie-barro', role: 'editor' }, content: draft, status: null, onChange: () => { changes += 1; }
  }, doc);
  let input;
  let error;
  walk(container, (node) => {
    if (node.id === 'channels-instagram') input = node;
    if (node.id === 'channels-instagram-error') error = node;
  });
  assert.equal(input.value, 'https://www.instagram.com/ana.doces/', 'mostra o perfil importado sem gravar nada');
  assert.equal(draft.instagramUrl, undefined);
  assert.equal(changes, 0);

  input.value = 'https://www.instagram.com/p/abc/';
  input.listeners.change();
  assert.equal(changes, 0, 'valor inválido não muda o rascunho');
  assert.equal(error.hidden, false);
  assert.equal(input.attrs['aria-invalid'], 'true');

  input.value = '@atelie.barro';
  input.listeners.input();
  assert.equal(draft.instagramUrl, 'https://www.instagram.com/atelie.barro/');
  assert.equal(draft.instagram, undefined);
  assert.equal(changes, 1);
  assert.equal(error.hidden, true);

  input.value = '';
  input.listeners.input();
  assert.equal(draft.instagramUrl, undefined);
  assert.equal(changes, 2);
});

test('Diagnóstico: textos com o que fazer, sem depender de cor', () => {
  assert.match(describeWebhookDiagnostic({ kind: 'lead', ok: true, httpStatus: 200, at: '2026-11-14T20:34:00Z' }), /^Último envio em 14\/11 às 17:34: HTTP 200 \(entregue\)\.$/);
  const failing = describeIntegration({ id: 'custom_domain', state: 'error', diagnostic: { hostname: 'www.a.com.br', status: 'failed', cnameTarget: 'vitrine.inspira.dev.br' } });
  assert.match(failing.diagnostic, /não aponta para vitrine\.inspira\.dev\.br/);
  assert.match(failing.nextStep, /CNAME/);
  const pending = describeIntegration({ id: 'custom_domain', state: 'pending', diagnostic: { hostname: 'www.a.com.br', status: 'pending_dns', cnameTarget: 'vitrine.inspira.dev.br' } });
  assert.match(pending.diagnostic, /ainda não aponta para vitrine\.inspira\.dev\.br/);
  const webhook = describeIntegration({ id: 'quote_webhook', state: 'error', diagnostic: { host: 'hooks.example.com', lastDelivery: { ok: false, httpStatus: 500, at: '2026-11-14T20:34:00Z' } } });
  assert.match(webhook.nextStep, /respondeu HTTP 500/);
});
