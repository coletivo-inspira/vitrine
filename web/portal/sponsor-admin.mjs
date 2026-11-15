const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const doc = globalThis.document;
const sponsorForm = doc?.getElementById('platform-sponsor-form');
const input = doc?.getElementById('platform-sponsor-user');
const statusLine = doc?.getElementById('platform-sponsor-status');
const list = doc?.getElementById('platform-sponsor-list');

let loaded = false;
let confirmWith = async () => true;

export function validateSponsorUserInput(value) {
  const userId = String(value ?? '').trim();
  if (!userId) return 'Informe o identificador da conta.';
  if (!UUID_PATTERN.test(userId)) return 'Use o identificador completo da conta, no formato 00000000-0000-0000-0000-000000000000.';
  return '';
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

function formatDay(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR', { dateStyle: 'short' });
}

function element(tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderList(sponsors) {
  if (!sponsors.length) {
    list.replaceChildren(element('li', 'admin-empty', 'Nenhum patrocinador com acesso ao Impacto.'));
    return;
  }
  list.replaceChildren(...sponsors.map(sponsor => {
    const item = element('li', 'sponsor-admin-row');
    const text = element('div', 'sponsor-admin-text');
    text.append(
      element('span', 'sponsor-admin-id', sponsor.userId),
      element('span', 'sponsor-admin-since', sponsor.since ? `Acesso desde ${formatDay(sponsor.since)}` : 'Acesso ativo')
    );
    const remove = element('button', 'button button-small button-secondary button-pill', 'Retirar acesso');
    remove.type = 'button';
    remove.setAttribute('aria-label', `Retirar acesso ao Impacto da conta ${sponsor.userId}`);
    remove.addEventListener('click', () => void revoke(sponsor.userId, remove));
    item.append(text, remove);
    return item;
  }));
}

async function refresh() {
  list.replaceChildren(element('li', 'admin-empty', 'Carregando patrocinadores…'));
  try {
    const { sponsors } = await send('/api/admin/sponsors');
    renderList(sponsors ?? []);
    loaded = true;
  } catch (error) {
    list.replaceChildren();
    statusLine.textContent = error.message;
  }
}

async function revoke(userId, trigger) {
  const accepted = await confirmWith({
    title: 'Retirar acesso ao Impacto?',
    message: 'A conta deixa de ver os números agregados das vitrines sociais. Nada mais muda nela.',
    items: [userId],
    confirmLabel: 'Retirar acesso'
  });
  if (!accepted) return;
  trigger.disabled = true;
  try {
    await send(`/api/admin/sponsors/${encodeURIComponent(userId)}`, 'DELETE');
    statusLine.textContent = 'Acesso retirado.';
    await refresh();
  } catch (error) {
    statusLine.textContent = error.message;
    trigger.disabled = false;
  }
}

async function grant() {
  const problem = validateSponsorUserInput(input.value);
  input.setAttribute('aria-invalid', String(Boolean(problem)));
  if (problem) {
    statusLine.textContent = problem;
    input.focus();
    return;
  }
  const submit = sponsorForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  statusLine.textContent = 'Dando acesso…';
  try {
    await send('/api/admin/sponsors', 'POST', { userId: input.value.trim() });
    statusLine.textContent = 'Pronto. A conta vê "Impacto" no menu na próxima vez que abrir o painel.';
    input.value = '';
    await refresh();
  } catch (error) {
    statusLine.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
}

export function loadSponsorAdmin({ confirm } = {}) {
  if (typeof confirm === 'function') confirmWith = confirm;
  if (!list || loaded) return;
  void refresh();
}

export function resetSponsorAdmin() {
  loaded = false;
  if (statusLine) statusLine.textContent = '';
  if (input) {
    input.value = '';
    input.removeAttribute('aria-invalid');
  }
  list?.replaceChildren();
}

sponsorForm?.addEventListener('submit', (event) => {
  event.preventDefault();
  void grant();
});
