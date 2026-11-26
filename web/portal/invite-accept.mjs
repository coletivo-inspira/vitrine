// Confirmação do convite de equipe no painel (spec 018, FR-011). A página /convite/<token>
// leva a `#/convite/<token>`: o token sai da barra de endereço na hora, fica só na sessão
// do navegador até o aceite ou a recusa, e nunca vai para a query string nem para logs.

export const INVITE_TOKEN_KEY = 'vitrine.inviteToken';
const INVITE_HASH = /^#\/convite\/([A-Za-z0-9_-]{1,128})\/?$/;
const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' });
const UNAVAILABLE = 'Este convite não está mais disponível';
const ROLE_LABELS = Object.freeze({ admin: 'Administrador', editor: 'Funcionário', viewer: 'Somente leitura' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
});

function readToken(storage) {
  try {
    return storage?.getItem(INVITE_TOKEN_KEY) || null;
  } catch {
    return null;
  }
}

function clearToken(storage) {
  try {
    storage?.removeItem(INVITE_TOKEN_KEY);
  } catch {
    // Sem sessionStorage (modo privado restrito): não há o que apagar.
  }
}

/**
 * Lê `#/convite/<token>`, guarda o token em sessionStorage e troca o endereço por
 * `#/convite`. Devolve `true` quando há convite pendente nesta aba.
 */
export function captureInviteToken({
  location = globalThis.location, history = globalThis.history, storage = globalThis.sessionStorage
} = {}) {
  const match = String(location?.hash ?? '').match(INVITE_HASH);
  if (match) {
    try {
      storage?.setItem(INVITE_TOKEN_KEY, match[1]);
    } catch {
      // Sem sessionStorage o convite não sobrevive ao login; a confirmação mostra indisponível.
    }
    if (typeof history?.replaceState === 'function') {
      history.replaceState(null, '', `${location.pathname ?? ''}${location.search ?? ''}#/convite`);
    } else if (location) {
      location.hash = '#/convite';
    }
  }
  return Boolean(readToken(storage));
}

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function formatDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date).replace(', ', ' às ');
}

/**
 * Tela "{vitrine} convidou você para a equipe como {papel}", com "Aceitar convite" e
 * "Agora não". Devolve uma promessa com o estado final da carga: `ready`, `unavailable`
 * ou `error`.
 */
export async function renderInviteConfirmation({
  doc = globalThis.document, container, request, storage = globalThis.sessionStorage,
  onAccepted = () => {}, onDismiss = () => {}
} = {}) {
  if (!doc || !container) return 'error';
  const section = el(doc, 'section', 'invite-confirm');
  const title = el(doc, 'h2', 'invite-confirm-title', 'Convite para a equipe');
  title.id = 'convite-equipe-titulo';
  title.setAttribute('tabindex', '-1');
  section.setAttribute('aria-labelledby', title.id);
  const detail = el(doc, 'p', 'form-help');
  const status = el(doc, 'p', 'team-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const actions = el(doc, 'div', 'team-actions');
  section.append(title, detail, status, actions);
  container.replaceChildren(section);

  const say = (text, isError = false) => {
    status.textContent = text;
    status.className = isError ? 'team-status is-error' : 'team-status';
  };
  const showUnavailable = (text = 'Peça um novo convite a quem administra a vitrine.') => {
    clearToken(storage);
    title.textContent = UNAVAILABLE;
    detail.textContent = text;
    actions.replaceChildren();
    say('');
    title.focus?.();
    return 'unavailable';
  };

  const token = readToken(storage);
  if (!token) return showUnavailable();

  say('Carregando o convite…');
  let summary;
  try {
    summary = await request('/api/invitations/lookup', {
      method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ token })
    });
  } catch (error) {
    if (error?.status === 429) {
      say('Muitas tentativas com convites inválidos. Tente de novo em alguns minutos.', true);
      return 'error';
    }
    if (error?.status === 404 || error?.code === 'INVITATION_UNAVAILABLE') return showUnavailable();
    say('Não foi possível abrir o convite agora. Tente de novo em alguns minutos.', true);
    return 'error';
  }
  if (summary?.kind !== 'team') return showUnavailable();

  const roleLabel = ROLE_LABELS[summary.role] ?? summary.role;
  const when = formatDate(summary.expiresAt);
  title.textContent = `${summary.siteName} convidou você para a equipe como ${roleLabel}`;
  detail.textContent = when
    ? `Ao aceitar, você passa a ver esta vitrine com o papel ${roleLabel}. O convite vale até ${when}.`
    : `Ao aceitar, você passa a ver esta vitrine com o papel ${roleLabel}.`;
  say('');

  const accept = el(doc, 'button', 'button button-small button-pill', 'Aceitar convite');
  accept.type = 'button';
  const later = el(doc, 'button', 'button button-small button-secondary button-pill', 'Agora não');
  later.type = 'button';

  accept.addEventListener('click', async () => {
    accept.disabled = true;
    later.disabled = true;
    say('Aceitando o convite…');
    try {
      const result = await request('/api/invitations/accept', {
        method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ token })
      });
      clearToken(storage);
      actions.replaceChildren();
      say(`Você entrou na equipe como ${ROLE_LABELS[result?.role] ?? roleLabel}.`);
      onAccepted({ siteId: result?.siteId, role: result?.role });
    } catch (error) {
      if (error?.code === 'ALREADY_MEMBER' || error?.status === 409) {
        clearToken(storage);
        actions.replaceChildren();
        title.textContent = 'Você já faz parte desta vitrine';
        detail.textContent = 'Nada mudou no seu acesso. Abra a vitrine em Minhas Vitrines.';
        say('');
        title.focus?.();
        return;
      }
      if (error?.status === 404 || error?.code === 'INVITATION_UNAVAILABLE') {
        showUnavailable();
        return;
      }
      accept.disabled = false;
      later.disabled = false;
      say(error?.status === 401
        ? 'Entre na sua conta para aceitar o convite.'
        : 'Não foi possível aceitar agora. Tente de novo em alguns minutos.', true);
    }
  });

  later.addEventListener('click', () => {
    clearToken(storage);
    actions.replaceChildren();
    say(when
      ? `Tudo bem. O link continua valendo até ${when}, se você mudar de ideia.`
      : 'Tudo bem. O link continua valendo, se você mudar de ideia.');
    onDismiss();
  });

  actions.append(accept, later);
  accept.focus?.();
  return 'ready';
}
