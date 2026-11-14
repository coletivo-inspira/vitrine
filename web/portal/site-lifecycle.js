const VIEWS = Object.freeze({ active: 'Ativas', archived: 'Arquivadas' });
let currentView = 'active';

export function isArchivedSite(site) {
  return Boolean(site?.archivedAt);
}

export function activeSites(sites = []) {
  return sites.filter(site => !isArchivedSite(site));
}

export function sitesForCurrentView(sites = []) {
  return sites.filter(site => isArchivedSite(site) === (currentView === 'archived'));
}

export function emptyViewMessage() {
  return currentView === 'archived'
    ? 'Nenhuma vitrine arquivada.'
    : 'Nenhuma vitrine ativa cadastrada.';
}

export function createSiteViewFilter(sites, onChange) {
  const group = document.createElement('div');
  group.className = 'site-view-filter';
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Filtrar vitrines');
  const counts = { active: activeSites(sites).length, archived: sites.length - activeSites(sites).length };
  for (const [view, label] of Object.entries(VIEWS)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chip-btn';
    button.textContent = `${label} (${counts[view]})`;
    const pressed = view === currentView;
    button.classList.toggle('active', pressed);
    button.setAttribute('aria-pressed', String(pressed));
    button.addEventListener('click', () => {
      if (currentView === view) return;
      currentView = view;
      onChange();
      globalThis.document?.querySelector(`.site-view-filter [data-view="${view}"]`)?.focus();
    });
    button.dataset.view = view;
    group.append(button);
  }
  return group;
}

function formatDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('pt-BR');
}

function statusBadge(site) {
  if (!site.pausedAt && !site.archivedAt) return null;
  const badge = document.createElement('span');
  badge.className = 'site-state-badge';
  if (isArchivedSite(site)) {
    const until = new Date(Date.parse(site.archivedAt) + 90 * 24 * 60 * 60 * 1000);
    badge.textContent = `Arquivada · restaurável até ${formatDate(until)}`;
  } else {
    badge.textContent = 'Pausada';
  }
  return badge;
}

let dialogParts = null;

function ensureDialog() {
  if (dialogParts) return dialogParts;
  const dialog = document.createElement('dialog');
  dialog.id = 'site-lifecycle-dialog';
  dialog.className = 'portal-dialog site-lifecycle-dialog';
  dialog.setAttribute('aria-labelledby', 'site-lifecycle-title');
  dialog.setAttribute('aria-describedby', 'site-lifecycle-message');
  const body = document.createElement('div');
  body.className = 'portal-dialog-body';
  const title = document.createElement('h2');
  title.id = 'site-lifecycle-title';
  title.className = 'portal-dialog-title';
  const message = document.createElement('p');
  message.id = 'site-lifecycle-message';
  message.className = 'portal-dialog-desc';
  const list = document.createElement('ul');
  list.className = 'admin-confirm-list';
  const blocked = document.createElement('p');
  blocked.className = 'site-lifecycle-blocked';
  blocked.setAttribute('role', 'alert');
  const field = document.createElement('label');
  field.className = 'site-lifecycle-confirm-field';
  const fieldText = document.createElement('span');
  const input = document.createElement('input');
  input.type = 'text';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('autocapitalize', 'off');
  field.append(fieldText, input);
  const actions = document.createElement('div');
  actions.className = 'portal-dialog-actions';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'button button-small button-secondary button-pill';
  cancel.textContent = 'Cancelar';
  const accept = document.createElement('button');
  accept.type = 'button';
  accept.className = 'button button-small button-pill';
  actions.append(cancel, accept);
  body.append(title, message, list, blocked, field, actions);
  dialog.append(body);
  document.body.append(dialog);
  dialogParts = { dialog, title, message, list, blocked, field, fieldText, input, cancel, accept };
  return dialogParts;
}

export function openLifecycleDialog({ title, message, items = [], confirmLabel = 'Confirmar', requiresSlug, blockedReason }) {
  const parts = ensureDialog();
  if (typeof parts.dialog.showModal !== 'function') {
    return Promise.resolve(!blockedReason && !requiresSlug && (globalThis.confirm?.(`${title}\n\n${message}`) ?? false));
  }
  const trigger = document.activeElement;
  parts.title.textContent = title;
  parts.message.textContent = message;
  parts.list.replaceChildren(...items.map(text => {
    const item = document.createElement('li');
    item.textContent = text;
    return item;
  }));
  parts.list.hidden = !items.length;
  parts.blocked.textContent = blockedReason ?? '';
  parts.blocked.hidden = !blockedReason;
  parts.field.hidden = !requiresSlug || Boolean(blockedReason);
  parts.fieldText.textContent = requiresSlug ? `Digite ${requiresSlug} para confirmar` : '';
  parts.input.value = '';
  parts.accept.textContent = confirmLabel;
  const updateAccept = () => {
    parts.accept.disabled = Boolean(blockedReason) || (Boolean(requiresSlug) && parts.input.value.trim() !== requiresSlug);
  };
  updateAccept();
  return new Promise(resolve => {
    const finish = accepted => {
      parts.accept.removeEventListener('click', accept);
      parts.cancel.removeEventListener('click', cancel);
      parts.dialog.removeEventListener('cancel', cancel);
      parts.input.removeEventListener('input', updateAccept);
      if (parts.dialog.open) parts.dialog.close();
      trigger?.focus?.();
      resolve(accepted ? (requiresSlug ? parts.input.value.trim() : true) : false);
    };
    const accept = () => { if (!parts.accept.disabled) finish(true); };
    const cancel = event => {
      event?.preventDefault?.();
      finish(false);
    };
    parts.accept.addEventListener('click', accept);
    parts.cancel.addEventListener('click', cancel);
    parts.dialog.addEventListener('cancel', cancel);
    parts.input.addEventListener('input', updateAccept);
    parts.dialog.showModal();
    (requiresSlug && !blockedReason ? parts.input : parts.cancel).focus();
  });
}

async function requestLifecycle(site, payload) {
  const response = await fetch(`/api/sites/${encodeURIComponent(site.id)}/lifecycle`, payload
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
    : undefined);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message ?? 'Não foi possível atualizar a vitrine.');
  return data;
}

const ACTION_LABELS = Object.freeze({
  pause: ['Pausar', 'canPause', 'Vitrine pausada. A página pública mostra o aviso de pausa.'],
  resume: ['Retomar', 'canResume', 'Vitrine retomada com a mesma publicação de antes.'],
  archive: ['Arquivar', 'canArchive', 'Vitrine arquivada. Ela está no filtro “Arquivadas”.'],
  restore: ['Restaurar', 'canRestore', 'Vitrine restaurada. Ela continua pausada até você retomar.'],
  delete: ['Excluir de vez', 'canDelete', 'Vitrine excluída de vez.']
});

async function runAction(site, action, { notify, onChanged }) {
  try {
    const { lifecycle } = await requestLifecycle(site);
    const confirmed = await openLifecycleDialog(lifecycle.dialogs[action]);
    if (!confirmed) return;
    await requestLifecycle(site, { action, ...(action === 'delete' ? { confirmSlug: confirmed } : {}) });
    notify?.(ACTION_LABELS[action][2], 'success');
    await onChanged?.();
  } catch (error) {
    notify?.(error.message, 'error');
  }
}

function visibleActions(site) {
  const role = site.role;
  const paused = Boolean(site.pausedAt);
  const archived = isArchivedSite(site);
  const canPause = role === 'owner' || role === 'admin';
  const isOwner = role === 'owner';
  return [
    canPause && !paused && 'pause',
    canPause && paused && !archived && 'resume',
    isOwner && !archived && 'archive',
    isOwner && archived && 'restore',
    isOwner && archived && 'delete'
  ].filter(Boolean);
}

export function decorateSiteItem(site, info, actions, { online = true, notify, onChanged } = {}) {
  const badge = statusBadge(site);
  if (badge) info.append(badge);
  if (!online) return;
  for (const action of visibleActions(site)) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `button button-small button-secondary button-pill site-lifecycle-${action}`;
    button.textContent = ACTION_LABELS[action][0];
    button.addEventListener('click', async () => {
      button.disabled = true;
      await runAction(site, action, { notify, onChanged });
      button.disabled = false;
    });
    actions.append(button);
  }
}

export async function confirmDomainDisconnect(site, domain) {
  let dialog = null;
  try {
    const { lifecycle } = await requestLifecycle(site);
    dialog = lifecycle.dialogs.domains.find(entry => entry.id === domain.id) ?? null;
  } catch {
    dialog = null;
  }
  dialog ??= {
    title: `Desconectar ${domain.hostname}?`,
    message: `O endereço ${domain.hostname} deixa de abrir a vitrine; ela continua em vitrine.inspira.dev.br/${site.slug}. O nome fica em quarentena.`,
    items: [],
    confirmLabel: 'Desconectar domínio'
  };
  return Boolean(await openLifecycleDialog(dialog));
}
