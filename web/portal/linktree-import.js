import { formatWhatsappBR } from './phone-mask.mjs';

const USERNAME_PATTERN = /^[A-Za-z0-9_.]{1,30}$/;
const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const doc = globalThis.document;
const importForm = doc?.getElementById('platform-linktree-form');
const usernameInput = doc?.getElementById('platform-linktree-username');
const slugInput = doc?.getElementById('platform-linktree-slug');
const statusLine = doc?.getElementById('platform-linktree-status');
const result = doc?.getElementById('platform-linktree-result');
const invitations = doc?.getElementById('linktree-invitations');

export function validateUsernameInput(value) {
  const username = String(value ?? '').trim();
  if (!username) return 'Informe o nome de usuário do Linktree.';
  if (username.includes('/') || username.includes('@') || username.includes('..') || !USERNAME_PATTERN.test(username) || /^\.+$/.test(username)) {
    return 'Use só o nome de usuário: até 30 letras, números, ponto ou sublinhado, sem barra, arroba ou "..".';
  }
  return '';
}

function formatDay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { dateStyle: 'long' });
}

function element(tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

async function send(path, method = 'GET', payload) {
  const response = await fetch(path, {
    method,
    ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? 'Não foi possível concluir a operação.');
  return data;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function describeDemoContacts(extracted = {}) {
  const contacts = [];
  if (extracted.whatsapp) contacts.push({ label: 'WhatsApp', value: formatWhatsappBR(extracted.whatsapp) });
  if (extracted.instagram) contacts.push({ label: 'Instagram', value: `@${extracted.instagram}` });
  return contacts;
}

function renderInvite(demo) {
  const form = element('form', 'linktree-invite');
  form.noValidate = true;
  const group = element('div', 'form-group');
  const label = element('label', '', 'Conta do dono (identificador da equipe)');
  label.htmlFor = 'platform-linktree-invite-user';
  const input = element('input', 'item-input input-styled-height');
  input.id = 'platform-linktree-invite-user';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 36;
  input.placeholder = '00000000-0000-0000-0000-000000000000';
  input.setAttribute('aria-describedby', 'platform-linktree-invite-help');
  const help = element('p', 'form-help', 'O mesmo identificador usado para adicionar alguém à equipe de uma vitrine. A pessoa precisa entrar no painel e aceitar; só depois ela pode publicar.');
  help.id = 'platform-linktree-invite-help';
  group.append(label, input, help);
  const submit = element('button', 'button button-small button-secondary button-pill', 'Convidar dono');
  submit.type = 'submit';
  const feedback = element('p', 'form-help');
  feedback.setAttribute('role', 'status');
  form.append(group, submit, feedback);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    const userId = input.value.trim();
    if (!UUID_PATTERN.test(userId)) {
      feedback.textContent = 'Informe um identificador de conta válido.';
      input.focus();
      return;
    }
    submit.disabled = true;
    feedback.textContent = 'Enviando convite…';
    try {
      await send(`/api/admin/linktree-demos/${encodeURIComponent(demo.id)}/invite`, 'POST', { userId });
      feedback.textContent = 'Convite registrado. A vitrine aparece para essa conta em "Minhas Vitrines" até ser aceita.';
    } catch (error) {
      feedback.textContent = error.message;
    } finally {
      submit.disabled = false;
    }
  });
  return form;
}

export function renderDemoResult(container, demo) {
  const extracted = demo.extracted ?? {};
  const header = element('div', 'linktree-result-header');
  const title = element('h3', '', demo.name);
  const badges = element('div', 'linktree-result-badges');
  badges.append(element('span', 'admin-badge admin-badge-stage', 'Demonstração'), element('span', 'admin-badge admin-badge-hidden', 'Não publicada'));
  header.append(title, badges);

  const meta = element('p', 'linktree-result-meta');
  const expires = formatDay(demo.demoExpiresAt);
  meta.textContent = `vitrine.inspira.dev.br/${demo.slug} · rascunho${expires ? `, apagado em ${expires} se não for aceito` : ''}`;

  const facts = element('dl', 'linktree-result-facts');
  const addFact = (term, value) => {
    facts.append(element('dt', '', term), element('dd', '', value));
  };
  addFact('Descrição', extracted.description || 'Sem descrição pública.');
  addFact('Foto', extracted.photoUrl ? 'Encontrada no Linktree; não foi copiada.' : 'Não encontrada.');
  const contacts = describeDemoContacts(extracted);
  addFact('Botões diretos', contacts.length ? contacts.map(entry => `${entry.label} ${entry.value}`).join(' · ') : 'Nenhum WhatsApp ou Instagram encontrado.');

  const linksTitle = element('h4', 'linktree-result-subtitle', `Itens com link (${extracted.links?.length ?? 0})`);
  const links = element('ul', 'linktree-result-links');
  for (const link of extracted.links ?? []) {
    const item = element('li');
    item.append(element('strong', '', link.title), element('span', '', hostOf(link.url)));
    links.append(item);
  }
  if (!extracted.links?.length) links.append(element('li', 'admin-empty', 'Nenhum outro link público.'));
  const notes = [];
  if (extracted.skipped) notes.push(`${extracted.skipped} link(s) ignorados por não usarem https, serem inseguros ou passarem do limite de 20 itens.`);
  container.replaceChildren(header, meta, facts, linksTitle, links,
    ...notes.map(text => element('p', 'form-help', text)), renderInvite(demo));
  container.hidden = false;
}

importForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const problem = validateUsernameInput(usernameInput.value);
  if (problem) {
    statusLine.textContent = problem;
    usernameInput.setAttribute('aria-invalid', 'true');
    usernameInput.focus();
    return;
  }
  const slug = slugInput.value.trim();
  if (slug && (!SLUG_PATTERN.test(slug) || slug.length < 3 || slug.length > 40)) {
    statusLine.textContent = 'Endereço inválido. Use de 3 a 40 letras minúsculas, números e hifens.';
    slugInput.setAttribute('aria-invalid', 'true');
    slugInput.focus();
    return;
  }
  usernameInput.removeAttribute('aria-invalid');
  slugInput.removeAttribute('aria-invalid');
  const submit = importForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  result.hidden = true;
  statusLine.textContent = `Lendo linktr.ee/${usernameInput.value.trim()}… (até 5 segundos)`;
  try {
    const { demo } = await send('/api/admin/linktree-demos', 'POST', {
      username: usernameInput.value.trim(), ...(slug ? { slug } : {})
    });
    renderDemoResult(result, demo);
    statusLine.textContent = `Rascunho de demonstração criado para ${demo.name}. Nada foi publicado.`;
  } catch (error) {
    statusLine.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

export function resetLinktreeImport() {
  if (!importForm) return;
  importForm.reset();
  statusLine.textContent = '';
  result.replaceChildren();
  result.hidden = true;
}

function renderInvitation(entry, onAccepted) {
  const card = element('article', 'portal-card portal-card-padded linktree-invitation');
  const eyebrow = element('div', 'card-eyebrow', 'Convite da equipe Inspira');
  const title = element('h2', '', `Uma vitrine foi preparada para você: ${entry.name}`);
  const expires = formatDay(entry.demoExpiresAt);
  const text = element('p', 'section-desc', `É um rascunho de demonstração em vitrine.inspira.dev.br/${entry.slug}. Ao aceitar, ele passa a ser seu e só vai ao ar quando você publicar.${expires ? ` Disponível até ${expires}.` : ''}`);
  const accept = element('button', 'button button-small button-pill', 'Aceitar vitrine');
  accept.type = 'button';
  const feedback = element('p', 'form-help');
  feedback.setAttribute('role', 'status');
  accept.addEventListener('click', async () => {
    accept.disabled = true;
    feedback.textContent = 'Aceitando…';
    try {
      await send(`/api/linktree-demos/${encodeURIComponent(entry.siteId)}/accept`, 'POST', {});
      card.remove();
      if (!invitations.children.length) invitations.hidden = true;
      await onAccepted?.();
    } catch (error) {
      feedback.textContent = error.message;
      accept.disabled = false;
    }
  });
  card.append(eyebrow, title, text, accept, feedback);
  return card;
}

export async function loadDemoInvitations(onAccepted) {
  if (!invitations) return;
  try {
    const data = await send('/api/linktree-demos/invitations');
    const list = Array.isArray(data?.invitations) ? data.invitations : [];
    invitations.replaceChildren(...list.map(entry => renderInvitation(entry, onAccepted)));
    invitations.hidden = !list.length;
  } catch {
    invitations.replaceChildren();
    invitations.hidden = true;
  }
}
