// Aba "Equipe da plataforma" (spec 022). O Dono dá e retira Administrador; Administradores
// dão e retiram Gestor de licenças e Suporte. O banco confere a mesma regra.
import { ROLE_LABELS, actionButton, adminRequest, canManageRole, element, manageableRoles } from './platform-access.mjs';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const doc = globalThis.document;
const teamForm = doc?.getElementById('platform-team-form');
const input = doc?.getElementById('platform-team-user');
const roleSelect = doc?.getElementById('platform-team-role');
const statusLine = doc?.getElementById('platform-team-status');
const list = doc?.getElementById('platform-team-list');

let access = { role: null, capabilities: [] };
let confirmWith = async () => true;
let loaded = false;

export function validateTeamUserInput(value) {
  const userId = String(value ?? '').trim();
  if (!userId) return 'Informe o identificador da conta.';
  if (!UUID_PATTERN.test(userId)) return 'Use o identificador completo da conta, copiado da aba Usuários.';
  return '';
}

function renderRoleOptions() {
  roleSelect.replaceChildren(...manageableRoles(access).map(role => {
    const option = element('option', '', ROLE_LABELS[role]);
    option.value = role;
    return option;
  }));
  roleSelect.value = manageableRoles(access).includes('license_manager') ? 'license_manager' : manageableRoles(access)[0] ?? '';
}

function renderList(operators) {
  list.replaceChildren(...operators.map(operator => {
    const item = element('li', 'sponsor-admin-row');
    const text = element('div', 'sponsor-admin-text');
    text.append(
      element('strong', '', `${ROLE_LABELS[operator.role] ?? operator.role} · ${operator.displayName || operator.email || operator.userId}`),
      element('span', 'sponsor-admin-id', [operator.email, operator.userId].filter(Boolean).join(' · '))
    );
    item.append(text);
    if (canManageRole(access, operator.role)) {
      const remove = actionButton('Retirar papel');
      remove.setAttribute('aria-label', `Retirar o papel de ${ROLE_LABELS[operator.role]} de ${operator.email || operator.userId}`);
      remove.addEventListener('click', () => void revoke(operator, remove));
      item.append(remove);
    }
    return item;
  }));
  if (!operators.length) list.append(element('li', 'admin-empty', 'Ninguém na equipe da plataforma.'));
}

async function refresh() {
  list.replaceChildren(element('li', 'admin-empty', 'Carregando equipe…'));
  try {
    const { operators } = await adminRequest('/api/admin/operators');
    renderList(operators ?? []);
  } catch (error) {
    list.replaceChildren();
    statusLine.textContent = error.message;
  }
}

async function revoke(operator, trigger) {
  const accepted = await confirmWith({
    title: `Retirar o papel de ${ROLE_LABELS[operator.role]}?`,
    message: 'A conta deixa de ver a Administração. As vitrines dela não mudam.',
    items: [operator.email || operator.userId],
    confirmLabel: 'Retirar papel'
  });
  if (!accepted) return;
  trigger.disabled = true;
  try {
    await adminRequest(`/api/admin/operators/${encodeURIComponent(operator.userId)}`, 'DELETE');
    statusLine.textContent = 'Papel retirado.';
    await refresh();
  } catch (error) {
    statusLine.textContent = error.message;
    trigger.disabled = false;
  }
}

async function grant() {
  const problem = validateTeamUserInput(input.value);
  input.setAttribute('aria-invalid', String(Boolean(problem)));
  if (problem) {
    statusLine.textContent = problem;
    input.focus();
    return;
  }
  const role = roleSelect.value;
  const accepted = await confirmWith({
    title: `Dar o papel de ${ROLE_LABELS[role]}?`,
    message: role === 'platform_admin'
      ? 'Administradores operam usuários, licenças, cupons, CMS e modelos, e dão o papel de Gestor de licenças.'
      : 'Gestores de licenças concedem licenças, criam cupons e ajustam limites das vitrines.',
    items: [input.value.trim()],
    confirmLabel: 'Dar papel'
  });
  if (!accepted) return;
  const submit = teamForm.querySelector('button[type="submit"]');
  if (submit) submit.disabled = true;
  statusLine.textContent = 'Dando papel…';
  try {
    await adminRequest('/api/admin/operators', 'POST', { userId: input.value.trim(), role });
    statusLine.textContent = 'Pronto. A conta vê a Administração na próxima vez que abrir o painel.';
    input.value = '';
    await refresh();
  } catch (error) {
    statusLine.textContent = error.message;
  } finally {
    if (submit) submit.disabled = false;
  }
}

export function loadPlatformTeam({ access: nextAccess, confirm } = {}) {
  if (nextAccess) access = nextAccess;
  if (typeof confirm === 'function') confirmWith = confirm;
  if (!list || loaded) return;
  loaded = true;
  renderRoleOptions();
  void refresh();
}

export function resetPlatformTeam() {
  loaded = false;
  if (statusLine) statusLine.textContent = '';
  if (input) {
    input.value = '';
    input.removeAttribute('aria-invalid');
  }
  list?.replaceChildren();
  roleSelect?.replaceChildren();
}

teamForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void grant();
});
