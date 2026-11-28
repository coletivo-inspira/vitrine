// Aba "Usuários" da Administração (spec 022): busca, detalhe com vitrines, plano em vigor,
// licenças e limites. Conceder e retirar licença e ajustar limites exigem licenses.manage.
import {
  LICENSE_SOURCES, PLAN_NAMES, ROLE_LABELS, actionButton, adminRequest, can, copyText, element, formatDay
} from './platform-access.mjs';

const doc = globalThis.document;
const usersForm = doc?.getElementById('platform-users-form');
const search = doc?.getElementById('platform-users-search');
const statusLine = doc?.getElementById('platform-users-status');
const list = doc?.getElementById('platform-users-list');
const more = doc?.getElementById('platform-users-more');
const detail = doc?.getElementById('platform-user-detail');

const SITE_ROLES = { owner: 'Proprietária', admin: 'Administrador da vitrine', editor: 'Funcionário', viewer: 'Somente leitura', collaborator: 'Colaborador' };
const SUBSCRIPTION_STATES = { active: 'ativa', pending: 'aguardando pagamento', past_due: 'em atraso', grace: 'em tolerância', suspended: 'suspensa', canceled: 'cancelada' };

let access = { role: null, capabilities: [] };
let confirmWith = async () => true;
let loaded = false;
let query = '';
let users = [];
let total = 0;
let generation = 0;
let openUserId = null;

export function licenseIsActive(license, now = Date.now()) {
  return !license.revokedAt && Date.parse(license.startsAt) <= now && Date.parse(license.endsAt) > now;
}

export function describeLicense(license, now = Date.now()) {
  const plan = PLAN_NAMES[license.planCode] ?? license.planCode;
  const source = LICENSE_SOURCES[license.source] ?? license.source;
  const state = license.revokedAt
    ? `retirada em ${formatDay(license.revokedAt)}`
    : Date.parse(license.startsAt) > now
      ? `começa em ${formatDay(license.startsAt)}, vale até ${formatDay(license.endsAt)}`
      : Date.parse(license.endsAt) > now ? `vale até ${formatDay(license.endsAt)}` : `terminou em ${formatDay(license.endsAt)}`;
  return `${plan} (${source}) · ${state}${license.note ? ` · ${license.note}` : ''}`;
}

export function userSummary(user) {
  const name = user.displayName || user.businessName || user.email || user.id;
  const parts = [
    user.email && user.email !== name ? user.email : '',
    user.platformRole ? ROLE_LABELS[user.platformRole] ?? user.platformRole : '',
    `${user.siteCount} ${user.siteCount === 1 ? 'vitrine' : 'vitrines'}`,
    user.lastSignInAt ? `último acesso em ${formatDay(user.lastSignInAt)}` : ''
  ].filter(Boolean);
  return { name, meta: parts.join(' · ') };
}

export function limitsSummary(site) {
  const e = site.entitlements ?? {};
  const plan = e.planName ?? PLAN_NAMES[e.planCode] ?? 'Gratuito/Social';
  const base = `${plan}: até ${e.maxActiveItems ?? '—'} itens ativos e ${e.maxItemBlocks ?? '—'} ${e.maxItemBlocks === 1 ? 'bloco' : 'blocos'} de itens`;
  return site.limits ? `${base} (limites próprios desta vitrine)` : base;
}

function renderUsers() {
  list.replaceChildren(...users.map(user => {
    const item = element('li', 'admin-user-row');
    const open = element('button', 'admin-user-open');
    open.type = 'button';
    const { name, meta } = userSummary(user);
    open.append(element('strong', 'admin-user-name', name), element('span', 'admin-user-meta', meta));
    if (user.id === openUserId) open.setAttribute('aria-current', 'true');
    open.addEventListener('click', () => void openUser(user.id));
    item.append(open);
    return item;
  }));
  if (!users.length) list.append(element('li', 'admin-empty', query ? 'Nenhuma conta encontrada para essa busca.' : 'Nenhuma conta cadastrada.'));
  more.hidden = users.length >= total;
}

async function fetchUsers(append = false) {
  const current = ++generation;
  const offset = append ? users.length : 0;
  statusLine.textContent = append ? 'Carregando mais…' : 'Buscando…';
  more.disabled = true;
  try {
    const params = new URLSearchParams({ q: query, offset: String(offset) });
    const data = await adminRequest(`/api/admin/users?${params}`);
    if (current !== generation) return;
    users = append ? [...users, ...data.users] : data.users;
    total = data.total;
    statusLine.textContent = total ? `${total} ${total === 1 ? 'conta' : 'contas'}` : '';
    renderUsers();
  } catch (error) {
    if (current === generation) statusLine.textContent = error.message;
  } finally {
    more.disabled = false;
  }
}

function field(labelText, input) {
  const label = element('label', 'admin-field');
  label.append(element('span', 'admin-field-label', labelText), input);
  return label;
}

function numberInput(min, max, value) {
  const input = element('input', 'item-input input-styled-height');
  input.type = 'number';
  input.min = String(min);
  input.max = String(max);
  input.value = value === null || value === undefined ? '' : String(value);
  return input;
}

function textInput(placeholder) {
  const input = element('input', 'item-input input-styled-height');
  input.type = 'text';
  input.maxLength = 280;
  input.placeholder = placeholder;
  return input;
}

function planSelect() {
  const select = element('select', 'select-styled');
  for (const code of ['essencial', 'profissional', 'equipe']) {
    const option = element('option', '', PLAN_NAMES[code]);
    option.value = code;
    if (code === 'profissional') option.selected = true;
    select.append(option);
  }
  select.value = 'profissional';
  return select;
}

function licenseForm(site, status) {
  const wrapper = element('form', 'admin-inline-form');
  const plan = planSelect();
  const months = numberInput(1, 36, 12);
  const note = textInput('Observação (opcional)');
  const submit = element('button', 'button button-small button-pill', 'Conceder licença');
  submit.type = 'submit';
  wrapper.append(field('Plano', plan), field('Meses', months), field('Observação', note), submit);
  wrapper.addEventListener('submit', async event => {
    event.preventDefault?.();
    const total = Number(months.value);
    const accepted = await confirmWith({
      title: `Conceder ${PLAN_NAMES[plan.value]} por ${total} ${total === 1 ? 'mês' : 'meses'}?`,
      message: `A vitrine ${site.name} passa a ter os recursos do plano, sem cobrança. Se já houver uma licença do mesmo plano, os meses somam.`,
      confirmLabel: 'Conceder licença'
    });
    if (!accepted) return;
    submit.disabled = true;
    status.textContent = 'Concedendo…';
    try {
      await adminRequest('/api/admin/licenses', 'POST', { siteId: site.id, planCode: plan.value, months: total, note: note.value.trim() });
      await openUser(openUserId, 'Licença concedida.');
    } catch (error) {
      status.textContent = error.message;
      submit.disabled = false;
    }
  });
  return wrapper;
}

function limitsForm(site, status) {
  const wrapper = element('form', 'admin-inline-form');
  const items = numberInput(1, 100, site.limits?.maxActiveItems);
  items.placeholder = String(site.entitlements?.maxActiveItems ?? '');
  const blocks = numberInput(1, 5, site.limits?.maxItemBlocks);
  blocks.placeholder = String(site.entitlements?.maxItemBlocks ?? '');
  const note = textInput('Motivo (opcional)');
  note.value = site.limits?.note ?? '';
  const save = element('button', 'button button-small button-pill', 'Salvar limites');
  save.type = 'submit';
  wrapper.append(field('Itens ativos (1 a 100)', items), field('Blocos de itens (1 a 5)', blocks), field('Motivo', note), save);
  if (site.limits) {
    const clear = actionButton('Voltar aos limites do plano');
    clear.addEventListener('click', async () => {
      const accepted = await confirmWith({
        title: 'Voltar aos limites do plano?',
        message: `A vitrine ${site.name} passa a seguir só os limites do plano em vigor.`,
        confirmLabel: 'Voltar aos limites do plano'
      });
      if (!accepted) return;
      clear.disabled = true;
      try {
        await adminRequest(`/api/admin/sites/${encodeURIComponent(site.id)}/limits`, 'DELETE');
        await openUser(openUserId, 'Limites do plano restaurados.');
      } catch (error) {
        status.textContent = error.message;
        clear.disabled = false;
      }
    });
    wrapper.append(clear);
  }
  wrapper.addEventListener('submit', async event => {
    event.preventDefault?.();
    const payload = {
      maxActiveItems: items.value === '' ? null : Number(items.value),
      maxItemBlocks: blocks.value === '' ? null : Number(blocks.value),
      note: note.value.trim()
    };
    save.disabled = true;
    status.textContent = 'Salvando limites…';
    try {
      await adminRequest(`/api/admin/sites/${encodeURIComponent(site.id)}/limits`, 'PUT', payload);
      await openUser(openUserId, 'Limites salvos.');
    } catch (error) {
      status.textContent = error.message;
      save.disabled = false;
    }
  });
  return wrapper;
}

function licenseList(site, status) {
  const items = element('ul', 'admin-list admin-list-compact');
  for (const license of site.licenses ?? []) {
    const item = element('li', 'admin-license-row');
    item.append(element('span', '', describeLicense(license)));
    if (can(access, 'licenses.manage') && !license.revokedAt && Date.parse(license.endsAt) > Date.now()) {
      const revoke = actionButton('Retirar');
      revoke.setAttribute('aria-label', `Retirar licença ${PLAN_NAMES[license.planCode] ?? license.planCode} da vitrine ${site.name}`);
      revoke.addEventListener('click', async () => {
        const accepted = await confirmWith({
          title: 'Retirar a licença?',
          message: `A vitrine ${site.name} perde os recursos desta licença agora. Nada é apagado.`,
          confirmLabel: 'Retirar licença'
        });
        if (!accepted) return;
        revoke.disabled = true;
        try {
          await adminRequest(`/api/admin/licenses/${encodeURIComponent(license.id)}`, 'DELETE');
          await openUser(openUserId, 'Licença retirada.');
        } catch (error) {
          status.textContent = error.message;
          revoke.disabled = false;
        }
      });
      item.append(revoke);
    }
    items.append(item);
  }
  if (!items.children.length) items.append(element('li', 'admin-empty', 'Nenhuma licença.'));
  return items;
}

function siteCard(site, status) {
  const card = element('section', 'admin-site-card');
  const title = element('h3', '', site.name);
  const meta = [
    `/${site.slug}`,
    SITE_ROLES[site.role] ?? site.role,
    site.archivedAt ? 'arquivada' : site.pausedAt ? 'pausada' : ''
  ].filter(Boolean).join(' · ');
  card.append(title, element('p', 'admin-card-desc', meta), element('p', 'admin-site-plan', limitsSummary(site)));
  if (site.subscription) {
    const plan = PLAN_NAMES[site.subscription.planCode] ?? site.subscription.planCode;
    card.append(element('p', 'form-help', `Assinatura: ${plan}, ${SUBSCRIPTION_STATES[site.subscription.status] ?? site.subscription.status}`));
  }
  if (site.role === 'owner') {
    card.append(element('h4', 'admin-subtitle', 'Licenças'), licenseList(site, status));
    if (can(access, 'licenses.manage')) {
      card.append(licenseForm(site, status), element('h4', 'admin-subtitle', 'Limites desta vitrine'), limitsForm(site, status));
    }
  }
  return card;
}

function renderDetail(data, message = '') {
  const { user, sites } = data;
  const header = element('div', 'admin-user-detail-header');
  const heading = element('h2', '', user.displayName || user.businessName || user.email);
  heading.tabIndex = -1;
  header.append(heading);
  const meta = [
    user.email,
    user.platformRole ? ROLE_LABELS[user.platformRole] ?? user.platformRole : '',
    user.city,
    user.createdAt ? `conta criada em ${formatDay(user.createdAt)}` : ''
  ].filter(Boolean).join(' · ');
  const idLine = element('p', 'admin-user-id');
  idLine.append(element('code', '', user.id));
  const copy = actionButton('Copiar identificador');
  copy.addEventListener('click', async () => {
    status.textContent = await copyText(user.id) ? 'Identificador copiado.' : 'Copie o identificador acima.';
  });
  idLine.append(copy);
  const status = element('p', 'form-help', message);
  status.setAttribute('role', 'status');
  detail.replaceChildren(header, element('p', 'admin-card-desc', meta), idLine, status);
  if (!sites.length) detail.append(element('p', 'admin-empty', 'Esta conta ainda não tem vitrines.'));
  for (const site of sites) detail.append(siteCard(site, status));
  detail.hidden = false;
  return heading;
}

async function openUser(userId, message = '') {
  if (!userId) return;
  const current = ++generation;
  openUserId = userId;
  renderUsers();
  detail.hidden = false;
  if (!message) detail.replaceChildren(element('p', 'admin-empty', 'Carregando conta…'));
  try {
    const data = await adminRequest(`/api/admin/users/${encodeURIComponent(userId)}`);
    if (current !== generation) return;
    const heading = renderDetail(data, message);
    if (!message) heading.focus?.();
  } catch (error) {
    if (current === generation) detail.replaceChildren(element('p', 'admin-empty', error.message));
  }
}

export function loadPlatformUsers({ access: nextAccess, confirm } = {}) {
  if (nextAccess) access = nextAccess;
  if (typeof confirm === 'function') confirmWith = confirm;
  if (!list || loaded) return;
  loaded = true;
  void fetchUsers();
}

export function resetPlatformUsers() {
  loaded = false;
  generation += 1;
  query = '';
  users = [];
  total = 0;
  openUserId = null;
  if (search) search.value = '';
  if (statusLine) statusLine.textContent = '';
  list?.replaceChildren();
  if (more) more.hidden = true;
  if (detail) {
    detail.hidden = true;
    detail.replaceChildren();
  }
}

usersForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  query = search.value.trim();
  openUserId = null;
  detail.hidden = true;
  void fetchUsers();
});
more?.addEventListener('click', () => void fetchUsers(true));
