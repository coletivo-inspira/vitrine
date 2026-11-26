// Aba "Resposta automática" da Administração da plataforma (só platform_admin; as rotas
// /api/admin/auto-reply* conferem o papel no Worker e no banco). Mostra alertas, interruptores,
// vitrines liberadas, conexões, métricas de 7 dias e a rotação da chave. Nunca recebe token
// nem dado de consumidor.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const STATUS_LABELS = Object.freeze({
  connected: 'Conectada',
  reconnect_required: 'Reconexão necessária',
  suspended: 'Suspensa'
});
const SEVERITY_LABELS = Object.freeze({ critical: 'Crítico', warning: 'Atenção', info: 'Informação' });
const METRICS = Object.freeze([
  ['received', 'Eventos recebidos'],
  ['sent', 'Respostas enviadas'],
  ['skippedFrequency', 'Ignorados por frequência'],
  ['failed', 'Falhas de envio'],
  ['authFailures', 'Falhas de autorização'],
  ['uncertain', 'Inconclusivos'],
  ['cancelled', 'Cancelados']
]);
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
});

export function formatAdminDate(iso) {
  const date = new Date(iso ?? '');
  return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date).replace(', ', ' às ');
}

export function validateSiteIdInput(value) {
  const siteId = String(value ?? '').trim();
  if (!siteId) return 'Informe o identificador da vitrine.';
  if (!UUID_PATTERN.test(siteId)) return 'Use o identificador completo da vitrine, no formato 00000000-0000-0000-0000-000000000000.';
  return '';
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(doc, label, onClick, className = 'button button-small button-secondary button-pill') {
  const node = el(doc, 'button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function section(doc, title, description) {
  const wrap = el(doc, 'section', 'auto-reply-admin-section');
  const heading = el(doc, 'h3', 'auto-reply-admin-title', title);
  wrap.append(heading);
  if (description) wrap.append(el(doc, 'p', 'admin-card-desc', description));
  return wrap;
}

function renderAlerts(doc, root, alerts) {
  const block = section(doc, 'Alertas', 'Calculados na hora a partir das conexões, das execuções dos últimos 7 dias e da configuração das chaves.');
  if (!alerts.length) {
    block.append(el(doc, 'p', 'admin-empty', 'Nenhum alerta agora.'));
    root.append(block);
    return;
  }
  const list = el(doc, 'ul', 'admin-list auto-reply-admin-alerts');
  list.setAttribute('aria-label', 'Alertas da resposta automática');
  for (const alert of alerts) {
    const item = el(doc, 'li', `auto-reply-admin-alert is-${alert.severity}`);
    const head = el(doc, 'div', 'auto-reply-admin-alert-head');
    head.append(el(doc, 'span', `auto-reply-admin-severity is-${alert.severity}`, SEVERITY_LABELS[alert.severity] ?? alert.severity),
      el(doc, 'strong', '', alert.title));
    item.append(head, el(doc, 'p', '', alert.detail));
    if (alert.sites?.length) item.append(el(doc, 'p', 'auto-reply-admin-meta', `Vitrines: ${alert.sites.join(', ')}`));
    list.append(item);
  }
  block.append(list);
  root.append(block);
}

function toggle(doc, id, label, checked, onChange) {
  const wrap = el(doc, 'label', 'checkbox-label-styled auto-reply-toggle');
  wrap.setAttribute('for', id);
  const input = doc.createElement('input');
  input.type = 'checkbox';
  input.id = id;
  input.setAttribute('role', 'switch');
  input.checked = checked;
  input.setAttribute('aria-checked', String(checked));
  input.addEventListener('change', () => onChange(input.checked, input));
  wrap.append(input, el(doc, 'span', '', label));
  return wrap;
}

function renderControls(doc, root, data, handlers) {
  const block = section(doc, 'Interruptores', 'Desligar para os envios na hora, inclusive de mensagens que já chegaram e ainda não foram respondidas.');
  block.append(
    toggle(doc, 'auto-reply-admin-enabled', 'Resposta automática ligada na plataforma', data.controls?.enabled === true,
      (value, input) => handlers.onControls({ enabled: value }, input)),
    toggle(doc, 'auto-reply-admin-instagram', 'Canal Instagram ligado', data.controls?.instagramEnabled === true,
      (value, input) => handlers.onControls({ instagramEnabled: value }, input))
  );
  root.append(block);
}

function renderSites(doc, root, data, handlers, ui) {
  const block = section(doc, 'Vitrines liberadas', 'Só vitrines liberadas conectam e ligam a resposta automática.');
  const sites = data.allowedSites ?? [];
  const list = el(doc, 'ul', 'admin-list');
  list.setAttribute('aria-label', 'Vitrines liberadas');
  if (!sites.length) list.append(el(doc, 'li', 'admin-empty', 'Nenhuma vitrine liberada.'));
  for (const site of sites) {
    const item = el(doc, 'li', 'auto-reply-admin-row');
    item.append(el(doc, 'span', 'auto-reply-admin-row-main', site.slug ?? site.siteId),
      button(doc, 'Retirar', () => handlers.onSiteAccess(site.siteId, false, site.slug)));
    list.append(item);
  }
  const form = el(doc, 'form', 'auto-reply-admin-form');
  form.noValidate = true;
  const label = el(doc, 'label', '', 'Identificador da vitrine');
  label.setAttribute('for', 'auto-reply-admin-site');
  const input = doc.createElement('input');
  input.type = 'text';
  input.id = 'auto-reply-admin-site';
  input.className = 'item-input input-styled-height';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.maxLength = 36;
  input.placeholder = '00000000-0000-0000-0000-000000000000';
  input.setAttribute('aria-describedby', 'auto-reply-admin-site-help');
  const help = el(doc, 'span', 'form-help', ui.siteError || 'O mesmo identificador da vitrine usado na administração.');
  help.id = 'auto-reply-admin-site-help';
  if (ui.siteError) input.setAttribute('aria-invalid', 'true');
  const submit = el(doc, 'button', 'button button-small button-pill', 'Liberar vitrine');
  submit.type = 'submit';
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    handlers.onAddSite(input.value);
  });
  form.append(label, input, help, submit);
  block.append(list, form);
  root.append(block);
}

function renderConnections(doc, root, data, handlers) {
  const block = section(doc, 'Conexões', 'Nenhum token aparece aqui. Suspender desliga a resposta da vitrine; para voltar, o dono reconecta.');
  const connections = data.connections ?? [];
  const list = el(doc, 'ul', 'admin-list');
  list.setAttribute('aria-label', 'Conexões do Instagram');
  if (!connections.length) list.append(el(doc, 'li', 'admin-empty', 'Nenhuma conta conectada.'));
  for (const conn of connections) {
    const item = el(doc, 'li', 'auto-reply-admin-row');
    const main = el(doc, 'div', 'auto-reply-admin-row-main');
    main.append(
      el(doc, 'strong', '', `${conn.slug ?? conn.siteId}${conn.username ? ` · @${conn.username}` : ''}`),
      el(doc, 'span', 'auto-reply-admin-meta', [
        STATUS_LABELS[conn.status] ?? conn.status,
        conn.enabled ? 'resposta ligada' : 'resposta desligada',
        `última mensagem: ${conn.lastEventAt ? formatAdminDate(conn.lastEventAt) : 'nenhuma'}`,
        conn.keyVersion ? `chave v${conn.keyVersion}` : null
      ].filter(Boolean).join(' · '))
    );
    item.append(main);
    if (conn.status !== 'suspended') item.append(button(doc, 'Suspender', () => handlers.onSuspend(conn)));
    list.append(item);
  }
  block.append(list);
  root.append(block);
}

function renderMetrics(doc, root, data) {
  const block = section(doc, 'Últimos 7 dias', 'Eventos recebidos não são mensagens enviadas: ecos e leituras nem entram na conta.');
  const grid = el(doc, 'ul', 'admin-kpi-grid');
  grid.setAttribute('aria-label', 'Métricas da resposta automática');
  for (const [key, label] of METRICS) {
    const item = el(doc, 'li', 'admin-kpi portal-card');
    item.append(el(doc, 'span', 'admin-kpi-label', label), el(doc, 'span', 'admin-kpi-value', String(Number(data.last7Days?.[key]) || 0)));
    grid.append(item);
  }
  block.append(grid);
  root.append(block);
}

function renderKeys(doc, root, data, handlers, ui) {
  const keys = data.keys ?? {};
  const block = section(doc, 'Chave de cifragem', 'Os valores ficam só no cofre do Worker. Aqui aparecem a versão e o que está configurado.');
  const defs = el(doc, 'dl', 'channels-defs');
  const row = (term, value) => {
    const wrap = el(doc, 'div', 'channels-def-row');
    wrap.append(el(doc, 'dt', '', term), el(doc, 'dd', '', value));
    defs.append(wrap);
  };
  row('Versão atual', `v${keys.currentVersion ?? 1}`);
  row('Chave anterior', keys.previousKeyConfigured ? 'Configurada (abre cifras antigas)' : 'Não configurada');
  row('Chave do hash', keys.stableHashKey ? 'Fixada (AUTO_REPLY_HASH_KEY)' : 'Usa a chave atual');
  const pending = (data.connections ?? []).filter((c) => Number.isInteger(c.keyVersion) && c.keyVersion < (keys.currentVersion ?? 1)).length;
  row('Credenciais na chave antiga', String(pending));
  block.append(defs);
  if (pending > 0) {
    const rotate = button(doc, ui.busy === 'rotate' ? 'Recifrando…' : 'Recifrar agora', handlers.onRotate, 'button button-small button-pill');
    rotate.disabled = Boolean(ui.busy);
    block.append(rotate);
  }
  if (ui.rotation) {
    block.append(el(doc, 'p', 'form-help',
      `Recifradas: ${ui.rotation.rotated}. Falhas: ${ui.rotation.failed}. Mudaram durante a recifragem: ${ui.rotation.conflicts}. Faltam: ${ui.rotation.remaining > 0 ? 'mais' : '0'}.`));
  }
  root.append(block);
}

/** Desenha a aba. `ui.data` vem de GET /api/admin/auto-reply (`autoReply`). */
export function renderAutoReplyAdmin(root, ui, handlers, doc = globalThis.document) {
  if (!root || !doc) return;
  root.replaceChildren();
  root.append(el(doc, 'h2', '', 'Resposta automática'),
    el(doc, 'p', 'admin-card-desc', 'Liga a AutoResposta aos poucos, desliga em emergência e acompanha falhas. Só administradores da plataforma veem esta área.'));
  const status = el(doc, 'p', 'form-help', ui.message ?? '');
  status.setAttribute('role', 'status');
  if (ui.error) {
    const error = el(doc, 'p', 'form-error-msg', ui.error);
    error.setAttribute('role', 'alert');
    root.append(error, button(doc, 'Tentar de novo', handlers.onRetry));
    return;
  }
  if (!ui.data) {
    root.append(el(doc, 'p', 'loading-msg', 'Carregando…'));
    return;
  }
  root.append(status);
  renderAlerts(doc, root, ui.data.alerts ?? []);
  renderControls(doc, root, ui.data, handlers);
  renderMetrics(doc, root, ui.data);
  renderConnections(doc, root, ui.data, handlers);
  renderSites(doc, root, ui.data, handlers, ui);
  renderKeys(doc, root, ui.data, handlers, ui);
}

const state = { root: null, doc: null, data: null, error: null, message: '', busy: null, rotation: null, siteError: '', loaded: false, confirm: async () => true, generation: 0 };

async function send(path, method = 'GET', payload) {
  const response = await fetch(path, {
    method,
    ...(payload === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error?.message ?? 'Não foi possível concluir a operação.');
  return data;
}

function draw() {
  renderAutoReplyAdmin(state.root, state, handlers, state.doc);
}

async function act(run, message) {
  try {
    const data = await run();
    state.data = data.autoReply ?? state.data;
    if (data.rotation) state.rotation = data.rotation;
    state.message = message;
  } catch (error) {
    state.message = error.message;
  }
  state.busy = null;
  draw();
}

const handlers = {
  onRetry: () => { void load(); },
  async onControls(patch, input) {
    const turningOff = Object.values(patch).some((value) => value === false);
    const accepted = await state.confirm({
      title: turningOff ? 'Desligar a resposta automática?' : 'Ligar a resposta automática?',
      message: turningOff
        ? 'Os envios param na hora em todas as vitrines afetadas, inclusive mensagens já recebidas e ainda não respondidas.'
        : 'Vitrines liberadas e com a resposta ligada voltam a responder a mensagens novas.',
      confirmLabel: turningOff ? 'Desligar' : 'Ligar'
    });
    if (!accepted) {
      if (input) input.checked = !input.checked;
      return;
    }
    await act(() => send('/api/admin/auto-reply/controls', 'PUT', patch), 'Interruptores salvos.');
  },
  async onSiteAccess(siteId, allowed, slug) {
    if (!allowed) {
      const accepted = await state.confirm({
        title: 'Retirar a vitrine do teste?', message: `${slug ?? siteId} deixa de responder e não consegue ligar de novo.`, confirmLabel: 'Retirar'
      });
      if (!accepted) return;
    }
    await act(() => send(`/api/admin/auto-reply/sites/${encodeURIComponent(siteId)}`, 'PUT', { allowed }),
      allowed ? 'Vitrine liberada.' : 'Vitrine retirada do teste.');
  },
  async onAddSite(value) {
    state.siteError = validateSiteIdInput(value);
    if (state.siteError) return draw();
    await handlers.onSiteAccess(String(value).trim(), true);
  },
  async onSuspend(conn) {
    const accepted = await state.confirm({
      title: 'Suspender a conexão?',
      message: `${conn.slug ?? 'A vitrine'} para de responder na hora. Para voltar, o dono precisa reconectar.`,
      confirmLabel: 'Suspender'
    });
    if (!accepted) return;
    await act(() => send(`/api/admin/auto-reply/connections/${encodeURIComponent(conn.connectionId)}/suspend`, 'POST', {}),
      'Conexão suspensa.');
  },
  async onRotate() {
    state.busy = 'rotate';
    draw();
    await act(() => send('/api/admin/auto-reply/rotate-keys', 'POST', {}), 'Recifragem concluída para este lote.');
  }
};

async function load() {
  const generation = ++state.generation;
  Object.assign(state, { data: null, error: null, message: '' });
  draw();
  try {
    const { autoReply } = await send('/api/admin/auto-reply');
    if (generation !== state.generation) return;
    state.data = autoReply;
  } catch (error) {
    if (generation !== state.generation) return;
    state.error = error.message;
  }
  draw();
}

/** Chamado ao abrir a aba. `confirm` é o diálogo padrão da administração. */
export function loadAutoReplyAdmin({ confirm, doc = globalThis.document } = {}) {
  state.root = doc?.getElementById('platform-auto-reply-root') ?? null;
  state.doc = doc;
  if (typeof confirm === 'function') state.confirm = confirm;
  if (!state.root || state.loaded) return;
  state.loaded = true;
  void load();
}

export function resetAutoReplyAdmin() {
  state.generation += 1;
  Object.assign(state, { data: null, error: null, message: '', busy: null, rotation: null, siteError: '', loaded: false });
  state.root?.replaceChildren?.();
}
