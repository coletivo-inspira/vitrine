// Seção "Resposta automática" da aba Canais (specs/019-autoresposta). Conecta o Instagram
// pela tela oficial da Meta, mostra a conta, a mensagem, a prévia e o interruptor. O
// navegador nunca vê token: só o estado vindo de GET /api/sites/:id/auto-reply.
import {
  AUTO_REPLY_FREQUENCIES,
  AUTO_REPLY_FREQUENCY_LABELS,
  autoReplyCounter,
  renderAutoReplyMessage,
  validateAutoReplyTemplate
} from '../assets/auto-reply-message.mjs';

const PRIVACY_URL = 'https://vitrine.inspira.dev.br/privacidade/';
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
});

export const OAUTH_RESULT_MESSAGES = Object.freeze({
  connected: { tone: 'success', text: 'Instagram conectado. A resposta automática continua desligada até você ligar.' },
  connected_without_webhook: {
    tone: 'warning',
    text: 'Instagram conectado, mas a Meta não confirmou o recebimento de mensagens. Tente "Reconectar" em alguns minutos.'
  },
  cancelled: { tone: 'info', text: 'A conexão foi cancelada. Nada foi alterado.' },
  permission_missing: {
    tone: 'error',
    text: 'A Meta não liberou a permissão de mensagens. Conecte de novo e mantenha marcada a opção de mensagens.'
  },
  no_account: { tone: 'error', text: 'Nenhuma conta profissional do Instagram foi compartilhada. Conecte de novo e escolha a conta do negócio.' },
  multiple_accounts: { tone: 'error', text: 'Mais de uma conta foi compartilhada. Conecte de novo e escolha só a conta desta vitrine.' },
  account_in_use: { tone: 'error', text: 'Esta conta já responde por outra vitrine. Desconecte lá primeiro.' },
  account_mismatch: { tone: 'error', text: 'A conta autorizada é diferente da conectada. Desconecte a atual antes de trocar.' },
  invalid_state: { tone: 'error', text: 'O pedido de conexão venceu ou não é desta sessão. Toque em "Conectar Instagram" de novo.' },
  invalid_callback: { tone: 'error', text: 'A Meta não devolveu a autorização. Tente conectar de novo.' },
  meta_error: { tone: 'error', text: 'A Meta não respondeu como esperado. Tente de novo em alguns minutos.' }
});

const STATUS_TEXT = Object.freeze({
  connected: ['Conectado', 'active'],
  reconnect_required: ['Reconexão necessária', 'error'],
  suspended: ['Suspensa pela equipe Vitrine Inspira', 'error']
});

const BLOCKER_TEXT = Object.freeze({
  not_connected: 'Conecte o Instagram para ligar.',
  reconnect_required: 'Reconecte o Instagram para ligar de novo.',
  connection_suspended: 'A conexão foi suspensa pela equipe Vitrine Inspira. Fale com a equipe.',
  permission_missing: 'A permissão de mensagens não foi dada. Reconecte e mantenha a opção de mensagens.',
  site_not_published: 'Publique a vitrine para ligar a resposta automática.',
  site_paused: 'A vitrine está pausada. Retome a vitrine para ligar.',
  site_archived: 'A vitrine está arquivada.',
  site_demo: 'Demonstrações não respondem mensagens.',
  public_url_invalid: 'O endereço da vitrine não pôde ser conferido. Fale com a equipe.',
  platform_disabled: 'A resposta automática está desligada pela equipe Vitrine Inspira.',
  not_allowed: 'Por enquanto, só vitrines convidadas para o teste usam a resposta automática.',
  unconfigured: 'Ainda não disponível neste ambiente.'
});

export function formatAutoReplyDate(iso) {
  const date = new Date(iso ?? '');
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date).replace(', ', ' às ');
}

export function describeConnection(connection) {
  if (!connection) return { label: 'Desconectado', state: 'off' };
  const [label, state] = STATUS_TEXT[connection.status] ?? ['Indisponível', 'error'];
  return { label, state };
}

export function blockerText(code) {
  return code ? BLOCKER_TEXT[code] ?? 'Não é possível ligar agora.' : '';
}

/** Lê e limpa `?autoResposta=` deixado pelo retorno da Meta. */
export function readOAuthResult(location, history) {
  if (!location?.href) return null;
  const url = new URL(location.href);
  const result = url.searchParams.get('autoResposta');
  if (!result) return null;
  url.searchParams.delete('autoResposta');
  url.searchParams.delete('vitrine');
  history?.replaceState?.(history.state ?? null, '', url.pathname + url.search + url.hash);
  return OAUTH_RESULT_MESSAGES[result] ? result : 'meta_error';
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function row(doc, list, term, value) {
  const wrapper = el(doc, 'div', 'channels-def-row');
  wrapper.append(el(doc, 'dt', '', term), el(doc, 'dd', '', value));
  list.append(wrapper);
}

function button(doc, label, onClick, className = 'button button-small button-secondary button-pill') {
  const node = el(doc, 'button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

function header(doc, title, badgeText, badgeState, id) {
  const wrap = el(doc, 'div', 'channels-card-header');
  const heading = el(doc, 'h3', 'channels-card-title', title);
  heading.id = id;
  const badge = el(doc, 'span', `channels-badge is-${badgeState}`);
  badge.append(el(doc, 'span', 'channels-sr-only', 'Estado: '), doc.createTextNode(badgeText));
  wrap.append(heading, badge);
  return wrap;
}

function bulletList(doc, items, className = 'auto-reply-list') {
  const list = el(doc, 'ul', className);
  for (const item of items) list.append(el(doc, 'li', '', item));
  return list;
}

function renderDisconnected(doc, card, ui, data) {
  card.append(el(doc, 'p', 'form-help',
    'Quando alguém manda mensagem para o Instagram do negócio, a Vitrine responde uma vez com o endereço da sua vitrine. Depois disso, a conversa segue no Instagram, com você.'));
  const benefits = el(doc, 'div', 'auto-reply-block');
  benefits.append(el(doc, 'h4', 'auto-reply-subtitle', 'O que você ganha'), bulletList(doc, [
    'Quem pergunta "tem cardápio?" recebe o link na hora, mesmo fora do horário.',
    'Você escolhe o texto e com que frequência a mesma pessoa recebe a resposta.',
    'Desliga quando quiser; nada muda na sua vitrine.'
  ]));
  const requirements = el(doc, 'div', 'auto-reply-block');
  requirements.append(el(doc, 'h4', 'auto-reply-subtitle', 'Antes de conectar'), bulletList(doc, [
    'Conta profissional do Instagram (Empresa ou Criador).',
    'A conta precisa estar num portfólio empresarial da Meta; a tela da Meta pede para escolher.',
    'No app do Instagram, deixe ligado "Permitir acesso às mensagens".',
    'Vitrine publicada.'
  ]));
  const privacy = el(doc, 'div', 'auto-reply-block');
  privacy.append(el(doc, 'h4', 'auto-reply-subtitle', 'Permissões e privacidade'));
  privacy.append(el(doc, 'p', 'form-help',
    'A Meta vai pedir para ler o perfil da conta e enviar e receber mensagens. A Vitrine não guarda o texto das conversas nem quem escreveu; guarda só se a resposta saiu. Você não precisa criar app, copiar códigos ou passar sua senha.'));
  const link = el(doc, 'a', 'text-link', 'Ler a política de privacidade');
  link.href = PRIVACY_URL;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  privacy.append(link);
  card.append(benefits, requirements, privacy);
  if (data.canManage) {
    const actions = el(doc, 'div', 'channels-actions');
    const connect = button(doc, ui.busy === 'connect' ? 'Abrindo a Meta…' : 'Conectar Instagram', ui.onConnect, 'button button-small button-pill');
    connect.disabled = Boolean(ui.busy);
    actions.append(connect);
    card.append(actions, el(doc, 'p', 'channels-test-note', 'Você vai para a tela oficial da Meta e volta para cá ao terminar.'));
  }
}

function renderConnection(doc, card, ui, data) {
  const connection = data.connection;
  const identity = el(doc, 'div', 'auto-reply-identity');
  const initial = (connection.displayName || connection.username || '?').trim().charAt(0).toUpperCase() || '?';
  const avatar = el(doc, 'span', 'auto-reply-avatar', initial);
  avatar.setAttribute('aria-hidden', 'true');
  const names = el(doc, 'div', 'auto-reply-names');
  names.append(el(doc, 'strong', '', connection.displayName || 'Conta do Instagram'));
  if (connection.username) names.append(el(doc, 'span', 'auto-reply-handle', `@${connection.username}`));
  identity.append(avatar, names);
  card.append(identity);
  const defs = el(doc, 'dl', 'channels-defs');
  row(doc, defs, 'Canal', 'Instagram');
  row(doc, defs, 'Conectado em', formatAutoReplyDate(connection.connectedAt) || '—');
  row(doc, defs, 'Autorização', describeConnection(connection).label);
  row(doc, defs, 'Mensagens', connection.lastEventAt
    ? `Última mensagem recebida em ${formatAutoReplyDate(connection.lastEventAt)}.`
    : 'Aguardando a primeira mensagem.');
  if (connection.expiresAt) row(doc, defs, 'Vale até', formatAutoReplyDate(connection.expiresAt));
  card.append(defs);
  if (connection.status === 'reconnect_required') {
    const alert = el(doc, 'p', 'auto-reply-alert', 'A Meta pediu para renovar a autorização. A resposta automática foi desligada; reconecte para voltar a responder.');
    alert.setAttribute('role', 'alert');
    card.append(alert);
  }
  if (!connection.webhookSubscribed && connection.status === 'connected') {
    card.append(el(doc, 'p', 'auto-reply-alert', 'A Meta ainda não confirmou o recebimento de mensagens desta conta. Toque em "Reconectar" se continuar assim.'));
  }
  if (data.canManage) {
    const actions = el(doc, 'div', 'channels-actions');
    const reconnect = button(doc, 'Reconectar', ui.onConnect);
    reconnect.disabled = Boolean(ui.busy) || data.availability !== 'available';
    actions.append(reconnect);
    if (ui.confirmDisconnect) {
      const confirm = el(doc, 'div', 'auto-reply-confirm');
      confirm.setAttribute('role', 'group');
      confirm.setAttribute('aria-label', 'Confirmar desconexão');
      confirm.append(el(doc, 'p', 'channels-next',
        'Desconectar apaga a autorização guardada, desliga a resposta automática e para os envios. Para cortar também do lado da Meta, remova o app em Configurações do negócio > Integrações.'));
      const yes = button(doc, ui.busy === 'disconnect' ? 'Desconectando…' : 'Desconectar', ui.onDisconnect, 'button button-small button-pill');
      yes.disabled = Boolean(ui.busy);
      confirm.append(yes, button(doc, 'Cancelar', ui.onCancelDisconnect));
      card.append(actions, confirm);
    } else {
      actions.append(button(doc, 'Desconectar', ui.onAskDisconnect));
      card.append(actions);
    }
  }
}

function renderSettings(doc, container, ui, data) {
  const form = el(doc, 'section', 'channels-card auto-reply-settings');
  form.setAttribute('aria-labelledby', 'auto-reply-settings-title');
  const enabled = ui.draft.enabled;
  form.append(header(doc, 'Mensagem e envio', enabled ? 'Ligada' : 'Desligada', enabled ? 'active' : 'off', 'auto-reply-settings-title'));
  const readOnly = !data.canManage;

  const toggleWrap = el(doc, 'label', 'checkbox-label-styled auto-reply-toggle');
  toggleWrap.setAttribute('for', 'auto-reply-enabled');
  const toggle = doc.createElement('input');
  toggle.type = 'checkbox';
  toggle.id = 'auto-reply-enabled';
  toggle.setAttribute('role', 'switch');
  toggle.checked = enabled;
  toggle.setAttribute('aria-checked', String(enabled));
  toggle.setAttribute('aria-describedby', 'auto-reply-enabled-help');
  const blocker = blockerText(data.enableBlocker);
  toggle.disabled = readOnly || (!enabled && Boolean(data.enableBlocker));
  toggle.addEventListener('change', () => ui.onDraft({ enabled: toggle.checked }));
  toggleWrap.append(toggle, el(doc, 'span', '', 'Responder automaticamente'));
  const toggleHelp = el(doc, 'span', 'form-help', blocker && !enabled ? blocker : enabled
    ? 'Ligada: a primeira mensagem de cada pessoa recebe a resposta, conforme a frequência abaixo.'
    : 'Desligada: ninguém recebe resposta automática.');
  toggleHelp.id = 'auto-reply-enabled-help';
  form.append(toggleWrap, toggleHelp);

  const field = el(doc, 'div', 'channels-field');
  const label = el(doc, 'label', 'channels-field-label', 'Mensagem');
  label.setAttribute('for', 'auto-reply-message');
  const textarea = doc.createElement('textarea');
  textarea.id = 'auto-reply-message';
  textarea.className = 'item-input auto-reply-textarea';
  textarea.rows = 5;
  textarea.value = ui.draft.message;
  textarea.readOnly = readOnly;
  textarea.setAttribute('aria-describedby', 'auto-reply-message-help auto-reply-counter');
  const context = { name: ui.siteName, url: data.publicUrl ?? '' };
  const counter = autoReplyCounter(ui.draft.message, context);
  const counterNode = el(doc, 'span', `form-help auto-reply-counter${counter.remaining < 0 ? ' is-over' : ''}`,
    counter.remaining >= 0 ? `Espaço restante: ${counter.remaining} de ${counter.max}` : `Passou ${-counter.remaining} do limite de ${counter.max}`);
  counterNode.id = 'auto-reply-counter';
  counterNode.setAttribute('aria-live', 'polite');
  textarea.addEventListener('input', () => ui.onDraft({ message: textarea.value }, { rerender: false, counterNode, textarea }));
  const help = el(doc, 'span', 'form-help',
    'Use {{vitrine.nome}} para o nome e {{vitrine.url}} para o endereço. Sem {{vitrine.url}}, o endereço entra no fim. Dica: diga que é uma resposta automática.');
  help.id = 'auto-reply-message-help';
  const errors = ui.fieldError ? el(doc, 'span', 'form-error-msg', ui.fieldError) : null;
  if (errors) {
    errors.id = 'auto-reply-message-error';
    textarea.setAttribute('aria-invalid', 'true');
    textarea.setAttribute('aria-describedby', 'auto-reply-message-error auto-reply-message-help auto-reply-counter');
  }
  field.append(label, textarea, ...(errors ? [errors] : []), counterNode, help);
  form.append(field);

  const defs = el(doc, 'dl', 'channels-defs');
  row(doc, defs, 'Endereço enviado', data.publicUrl ?? blockerText(data.publicUrlReason));
  form.append(defs);

  const fieldset = el(doc, 'fieldset', 'auto-reply-frequency');
  fieldset.append(el(doc, 'legend', 'channels-field-label', 'Para a mesma pessoa'));
  for (const value of AUTO_REPLY_FREQUENCIES) {
    const option = el(doc, 'label', 'auto-reply-radio');
    const radio = doc.createElement('input');
    radio.type = 'radio';
    radio.name = 'auto-reply-frequency';
    radio.value = value;
    radio.checked = ui.draft.frequency === value;
    radio.disabled = readOnly;
    radio.addEventListener('change', () => ui.onDraft({ frequency: value }));
    option.append(radio, el(doc, 'span', '', AUTO_REPLY_FREQUENCY_LABELS[value]));
    fieldset.append(option);
  }
  fieldset.append(el(doc, 'span', 'form-help', 'É um intervalo mínimo: a resposta só sai quando a pessoa escreve.'));
  form.append(fieldset);

  const preview = el(doc, 'div', 'auto-reply-preview');
  preview.append(el(doc, 'span', 'auto-reply-preview-label', 'Prévia no Instagram'));
  const incoming = el(doc, 'p', 'auto-reply-bubble is-incoming', 'Olá! Gostaria de conhecer o cardápio.');
  incoming.setAttribute('aria-label', 'Exemplo de mensagem de um cliente');
  const outgoing = el(doc, 'p', 'auto-reply-bubble is-outgoing',
    data.publicUrl ? renderAutoReplyMessage(ui.draft.message, context).text : 'A prévia aparece quando a vitrine estiver publicada.');
  outgoing.id = 'auto-reply-preview-text';
  preview.append(incoming, outgoing);
  form.append(preview);

  form.append(bulletList(doc, [
    'A conversa continua no app do Instagram; quem responde depois é você.',
    'Conversas respondidas pela Vitrine vão para a pasta "Geral" do Instagram.',
    'Se você usa outra ferramenta de resposta automática (como Manychat), use só uma para não responder duas vezes.'
  ], 'auto-reply-list auto-reply-notes'));

  const footer = el(doc, 'div', 'channels-actions');
  if (!readOnly) {
    const save = button(doc, ui.busy === 'save' ? 'Salvando…' : 'Salvar', ui.onSave, 'button button-small button-pill');
    save.disabled = Boolean(ui.busy);
    footer.append(save);
  }
  const last = data.settings.lastSentAt
    ? `Última resposta enviada em ${formatAutoReplyDate(data.settings.lastSentAt)}.`
    : 'Nenhuma resposta enviada ainda.';
  footer.append(el(doc, 'span', 'channels-test-note', last));
  form.append(footer);
  container.append(form);
}

/** Desenha a seção. `data` vem de GET /api/sites/:id/auto-reply (`autoReply`). */
export function renderAutoReplyPanel(container, ui, doc = globalThis.document) {
  if (!container || !doc) return;
  container.replaceChildren();
  const head = el(doc, 'div', 'channels-header');
  const title = el(doc, 'h2', 'channels-title', 'Resposta automática');
  title.id = 'auto-reply-title';
  head.append(title, el(doc, 'p', 'form-help', 'Responde uma vez, com o endereço da vitrine, a quem manda mensagem no Instagram do negócio.'));
  container.append(head);

  if (ui.notice) {
    const notice = el(doc, 'p', `auto-reply-notice is-${ui.notice.tone}`, ui.notice.text);
    notice.setAttribute('role', ui.notice.tone === 'error' ? 'alert' : 'status');
    container.append(notice);
  }
  if (!ui.isOnline) {
    container.append(el(doc, 'p', 'channels-next', 'Entre com sua conta para configurar a resposta automática.'));
    return;
  }
  if (ui.loadError) {
    const error = el(doc, 'p', 'form-error-msg', ui.loadError);
    error.setAttribute('role', 'alert');
    container.append(error, button(doc, 'Tentar de novo', ui.onRetry));
    return;
  }
  const data = ui.data;
  if (!data) {
    container.append(el(doc, 'p', 'loading-msg', 'Carregando…'));
    return;
  }
  if (!data.canManage) {
    const note = el(doc, 'p', 'channels-role-note', 'Só o dono e a administração da vitrine conectam e configuram. Você vê o estado.');
    note.setAttribute('role', 'note');
    container.append(note);
  }

  const card = el(doc, 'section', 'channels-card auto-reply-card');
  card.setAttribute('aria-labelledby', 'auto-reply-instagram-title');
  if (data.availability !== 'available' && !data.connection) {
    card.append(header(doc, 'Instagram', data.availability === 'unconfigured' ? 'Indisponível agora' : 'Em teste', 'soon', 'auto-reply-instagram-title'));
    card.append(el(doc, 'p', 'channels-next', blockerText(data.availability)));
    card.append(el(doc, 'p', 'form-help', 'Enquanto isso, o perfil do Instagram continua aparecendo como link direto na vitrine.'));
    container.append(card);
    return;
  }
  const { label, state } = describeConnection(data.connection);
  card.append(header(doc, 'Instagram', label, state, 'auto-reply-instagram-title'));
  if (data.connection) renderConnection(doc, card, ui, data);
  else renderDisconnected(doc, card, ui, data);
  container.append(card);
  if (data.connection) renderSettings(doc, container, ui, data);
}

const panel = {
  container: null, doc: null, site: null, isOnline: false, fetchImpl: null, location: null, history: null,
  data: null, loadError: null, notice: null, busy: null, confirmDisconnect: false, draft: null, fieldError: null, generation: 0
};

function draftFrom(data) {
  return { enabled: data.settings.enabled, message: data.settings.message, frequency: data.settings.frequency, version: data.settings.version };
}

function draw() {
  renderAutoReplyPanel(panel.container, {
    isOnline: panel.isOnline,
    data: panel.data,
    loadError: panel.loadError,
    notice: panel.notice,
    busy: panel.busy,
    confirmDisconnect: panel.confirmDisconnect,
    draft: panel.draft ?? { enabled: false, message: '', frequency: 'daily', version: 0 },
    fieldError: panel.fieldError,
    siteName: panel.site?.name ?? '',
    onRetry: () => { void load(); },
    onConnect: () => { void connect(); },
    onAskDisconnect: () => { panel.confirmDisconnect = true; draw(); },
    onCancelDisconnect: () => { panel.confirmDisconnect = false; draw(); },
    onDisconnect: () => { void disconnect(); },
    onSave: () => { void save(); },
    onDraft: (patch, { rerender = true, counterNode, textarea } = {}) => {
      panel.draft = { ...panel.draft, ...patch };
      panel.fieldError = null;
      if (rerender) return draw();
      const counter = autoReplyCounter(panel.draft.message, { name: panel.site?.name ?? '', url: panel.data?.publicUrl ?? '' });
      if (counterNode) {
        counterNode.textContent = counter.remaining >= 0
          ? `Espaço restante: ${counter.remaining} de ${counter.max}`
          : `Passou ${-counter.remaining} do limite de ${counter.max}`;
        counterNode.className = `form-help auto-reply-counter${counter.remaining < 0 ? ' is-over' : ''}`;
      }
      const preview = panel.doc?.getElementById?.('auto-reply-preview-text');
      if (preview && panel.data?.publicUrl) {
        preview.textContent = renderAutoReplyMessage(panel.draft.message, { name: panel.site?.name ?? '', url: panel.data.publicUrl }).text;
      }
      textarea?.removeAttribute?.('aria-invalid');
    }
  }, panel.doc);
}

async function api(path, init = {}) {
  const response = await panel.fetchImpl(path, {
    ...init,
    headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(init.headers ?? {}) }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message ?? 'Não foi possível concluir agora.');
    error.code = data?.error?.code;
    error.field = data?.error?.field;
    throw error;
  }
  return data;
}

function basePath() {
  return `/api/sites/${encodeURIComponent(panel.site.id)}/auto-reply`;
}

async function load() {
  const generation = panel.generation;
  panel.loadError = null;
  panel.data = null;
  draw();
  try {
    const { autoReply } = await api(basePath());
    if (generation !== panel.generation) return;
    panel.data = autoReply;
    panel.draft = draftFrom(autoReply);
  } catch (error) {
    if (generation !== panel.generation) return;
    panel.loadError = error.message || 'Não foi possível carregar a resposta automática.';
  }
  draw();
}

async function connect() {
  panel.busy = 'connect';
  draw();
  try {
    const { authorizeUrl } = await api(`${basePath()}/instagram/connect`, { method: 'POST', body: '{}' });
    if (typeof authorizeUrl === 'string' && authorizeUrl.startsWith('https://www.facebook.com/')) {
      panel.location?.assign?.(authorizeUrl);
      return;
    }
    throw new Error('A Meta não respondeu como esperado.');
  } catch (error) {
    panel.notice = { tone: 'error', text: error.message };
  }
  panel.busy = null;
  draw();
}

async function disconnect() {
  panel.busy = 'disconnect';
  draw();
  try {
    const { autoReply } = await api(`${basePath()}/instagram/connection`, { method: 'DELETE' });
    panel.data = autoReply;
    panel.draft = draftFrom(autoReply);
    panel.notice = { tone: 'info', text: 'Instagram desconectado. A resposta automática parou.' };
  } catch (error) {
    panel.notice = { tone: 'error', text: error.message };
  }
  panel.busy = null;
  panel.confirmDisconnect = false;
  draw();
}

async function save() {
  const errors = validateAutoReplyTemplate(panel.draft.message, { name: panel.site?.name ?? '', url: panel.data?.publicUrl ?? '' });
  if (errors.length) {
    panel.fieldError = errors[0].message;
    return draw();
  }
  panel.busy = 'save';
  draw();
  try {
    const { autoReply } = await api(basePath(), {
      method: 'PUT',
      body: JSON.stringify({
        enabled: panel.draft.enabled, message: panel.draft.message, frequency: panel.draft.frequency, version: panel.draft.version
      })
    });
    panel.data = autoReply;
    panel.draft = draftFrom(autoReply);
    panel.notice = { tone: 'success', text: autoReply.settings.enabled ? 'Salvo. A resposta automática está ligada.' : 'Salvo. A resposta automática está desligada.' };
  } catch (error) {
    if (error.field === 'message') panel.fieldError = error.message;
    else panel.notice = { tone: 'error', text: error.message };
  }
  panel.busy = null;
  draw();
}

/** Liga a seção à vitrine aberta no editor. Só faz GET ao montar. */
export async function mountAutoReplyPanel({
  site, isOnline, fetchImpl = globalThis.fetch?.bind(globalThis), doc = globalThis.document,
  location = globalThis.location, history = globalThis.history
} = {}) {
  const container = doc?.getElementById?.('auto-reply-panel');
  if (!container) return;
  if (panel.container === container && panel.site === site) return draw();
  panel.generation += 1;
  const result = readOAuthResult(location, history);
  Object.assign(panel, {
    container, doc, site, isOnline: Boolean(isOnline), fetchImpl, location, history,
    data: null, loadError: null, busy: null, confirmDisconnect: false, draft: null, fieldError: null,
    notice: result ? OAUTH_RESULT_MESSAGES[result] : null
  });
  draw();
  if (panel.isOnline && site?.id) await load();
}
