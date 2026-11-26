// Aba "Equipe" (spec 018, User Story 5): membros pelo nome de exibição, convites pendentes
// e convite por link de uso único. O identificador interno da pessoa só vai nas chamadas
// de mudar papel e remover; a tela nunca o mostra (FR-021).
// `request(path, init)` resolve o JSON da resposta ou lança Error com `.status` e `.code`.

export const TEAM_ROLE_LABELS = Object.freeze({
  owner: 'Proprietário',
  admin: 'Administrador',
  editor: 'Funcionário',
  viewer: 'Somente leitura',
  collaborator: 'Colaborador'
});

export const TEAM_ROLE_HINTS = Object.freeze({
  admin: 'Administrador cuida de tudo na vitrine, menos da propriedade, do plano e da cobrança.',
  editor: 'Funcionário edita itens, blocos, fotos e rascunho, mas não publica nem mexe na equipe.',
  viewer: 'Somente leitura vê a vitrine e o rascunho, sem alterar nada.'
});

const MANAGER_ROLES = ['owner', 'admin'];
const JSON_HEADERS = Object.freeze({ 'content-type': 'application/json' });
const NO_NAME = 'Pessoa sem nome';
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
});

const ERROR_MESSAGES = Object.freeze({
  ADMIN_INVITE_OWNER_ONLY: 'Só o proprietário convida administradores.',
  TEAM_INVITATIONS_LIMIT: 'A vitrine já tem 20 convites pendentes. Revogue um ou espere vencer para gerar outro.',
  FORBIDDEN_MEMBER_CHANGE: 'A mudança foi recusada. O proprietário não sai nem é rebaixado, e a administração não muda outro administrador.',
  FORBIDDEN: 'Só o proprietário e a administração da vitrine gerem a equipe.',
  INVITATION_NOT_FOUND: 'Este convite já não estava pendente. A lista foi atualizada.',
  UNAUTHORIZED: 'Sua sessão expirou. Entre de novo para continuar.'
});

export function formatTeamDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date).replace(', ', ' às ');
}

/** Papéis que quem está logado pode dar: o proprietário dá os três, o admin só os dois de baixo. */
export function assignableRoles(viewerRole) {
  if (viewerRole === 'owner') return ['admin', 'editor', 'viewer'];
  if (viewerRole === 'admin') return ['editor', 'viewer'];
  return [];
}

/** O proprietário nunca é removido nem rebaixado; o admin não mexe em outro admin. */
export function canManageMember(viewerRole, memberRole) {
  if (memberRole === 'owner') return false;
  if (viewerRole === 'owner') return true;
  return viewerRole === 'admin' && memberRole !== 'admin';
}

export function whatsappShareUrl(message) {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}

export function teamErrorMessage(error, fallback = 'Não foi possível concluir agora. Tente de novo.') {
  return ERROR_MESSAGES[error?.code] ?? (typeof error?.message === 'string' && error.message.trim() ? error.message : fallback);
}

const memberName = (member) => (typeof member?.displayName === 'string' && member.displayName.trim()) || NO_NAME;

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

function roleSelect(doc, id, roles, current) {
  const select = el(doc, 'select', 'select-styled team-select');
  select.id = id;
  const options = roles.includes(current) || !current ? roles : [current, ...roles];
  for (const role of options) {
    const option = el(doc, 'option', '', TEAM_ROLE_LABELS[role] ?? role);
    option.value = role;
    if (!roles.includes(role)) option.disabled = true;
    if (role === current) option.selected = true;
    select.append(option);
  }
  select.value = current ?? options[0];
  return select;
}

function sectionWithTitle(doc, id, title) {
  const section = el(doc, 'section', 'team-section');
  section.setAttribute('aria-labelledby', id);
  const heading = el(doc, 'h3', 'team-section-title', title);
  heading.id = id;
  heading.setAttribute('tabindex', '-1');
  section.append(heading);
  return { section, heading };
}

/**
 * Desenha a aba Equipe em `container`. Editor e viewer veem só um aviso de leitura;
 * nada é carregado para eles. Devolve `{ reload, ready }`.
 */
export function mountTeamPanel({
  doc = globalThis.document, container, siteId, siteName = '', role, request,
  clipboard = globalThis.navigator?.clipboard, idPrefix = 'equipe'
} = {}) {
  if (!doc || !container) return null;
  const base = `/api/sites/${encodeURIComponent(siteId)}`;
  const state = { team: null, loadError: null, invite: null, confirmUserId: null, inviteRole: 'editor', busy: false };
  const canManage = MANAGER_ROLES.includes(role);
  const roles = assignableRoles(role);
  if (!roles.includes(state.inviteRole)) state.inviteRole = roles[0] ?? 'viewer';

  if (!String(container.className ?? '').split(/\s+/).includes('team-panel')) {
    container.className = `${container.className ?? ''} team-panel`.trim();
  }
  const header = el(doc, 'div', 'team-header');
  const title = el(doc, 'h2', 'team-title', 'Equipe');
  title.id = `${idPrefix}-titulo`;
  header.append(title, el(doc, 'p', 'form-help', siteName
    ? `Quem ajuda a cuidar de ${siteName} e o que cada pessoa pode fazer.`
    : 'Quem ajuda a cuidar da vitrine e o que cada pessoa pode fazer.'));
  const status = el(doc, 'p', 'team-status');
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  const body = el(doc, 'div', 'team-body');
  container.replaceChildren(header, status, body);
  container.setAttribute?.('aria-labelledby', title.id);

  const say = (text, isError = false) => {
    status.textContent = text;
    status.className = isError ? 'team-status is-error' : 'team-status';
  };

  if (!canManage) {
    const note = el(doc, 'p', 'team-role-note',
      `Você participa desta vitrine como ${TEAM_ROLE_LABELS[role] ?? 'membro'}. Só o proprietário e a administração convidam pessoas e mudam papéis.`);
    note.setAttribute('role', 'note');
    body.append(note);
    return { reload: async () => {}, ready: Promise.resolve() };
  }

  const findIn = (selector, predicate) => Array.from(body.querySelectorAll?.(selector) ?? []).find(predicate);
  const focusHeading = (key) => findIn('h3', (node) => node.id === `${idPrefix}-${key}`)?.focus?.();

  function renderMembers() {
    const { section } = sectionWithTitle(doc, `${idPrefix}-membros`, 'Pessoas na equipe');
    if (!state.team) {
      if (state.loadError) {
        const error = el(doc, 'p', 'form-error-msg', state.loadError);
        error.setAttribute('role', 'alert');
        section.append(error, button(doc, 'Tentar de novo', () => { void load(); }));
      } else {
        section.append(el(doc, 'p', 'form-help', 'Carregando a equipe…'));
      }
      return section;
    }
    const list = el(doc, 'ul', 'team-list');
    state.team.members.forEach((member, index) => {
      const name = memberName(member);
      const row = el(doc, 'li', 'team-row');
      const person = el(doc, 'div', 'team-person');
      const roleLabel = el(doc, 'span', 'team-role-label', TEAM_ROLE_LABELS[member.role] ?? member.role);
      person.append(el(doc, 'strong', 'team-name', name), roleLabel);
      row.append(person);
      if (canManageMember(role, member.role)) {
        const actions = el(doc, 'div', 'team-actions');
        const selectId = `${idPrefix}-papel-${index}`;
        const label = el(doc, 'label', 'team-sr-only', `Papel de ${name}`);
        label.setAttribute('for', selectId);
        const select = roleSelect(doc, selectId, roles, member.role);
        select.addEventListener('change', async () => {
          const next = select.value;
          if (next === member.role || !roles.includes(next)) return;
          select.disabled = true;
          say(`Mudando o papel de ${name}…`);
          try {
            await request(`${base}/members`, {
              method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ userId: member.userId, role: next })
            });
            member.role = next;
            roleLabel.textContent = TEAM_ROLE_LABELS[next];
            say(`${name} agora é ${TEAM_ROLE_LABELS[next]}.`);
          } catch (error) {
            select.value = member.role;
            say(teamErrorMessage(error), true);
          } finally {
            select.disabled = false;
          }
        });
        const remove = button(doc, 'Remover', () => {
          state.confirmUserId = member.userId;
          render();
          findIn('button', (node) => node.textContent === 'Confirmar remoção')?.focus?.();
        });
        remove.setAttribute('aria-label', `Remover ${name} da equipe`);
        actions.append(label, select, remove);
        row.append(actions);
        if (state.confirmUserId === member.userId) row.append(renderRemoveConfirmation(member, name));
      }
      list.append(row);
    });
    section.append(list);
    return section;
  }

  function renderRemoveConfirmation(member, name) {
    const box = el(doc, 'div', 'team-confirm');
    box.setAttribute('role', 'group');
    box.setAttribute('aria-label', `Confirmar a remoção de ${name}`);
    box.append(el(doc, 'p', 'team-confirm-text', `Remover ${name} da equipe? A pessoa perde o acesso a esta vitrine na hora.`));
    const actions = el(doc, 'div', 'team-actions');
    const confirm = button(doc, 'Confirmar remoção', async () => {
      confirm.disabled = true;
      say(`Removendo ${name}…`);
      try {
        await request(`${base}/members/${encodeURIComponent(member.userId)}`, { method: 'DELETE', headers: JSON_HEADERS });
        state.team.members = state.team.members.filter((entry) => entry.userId !== member.userId);
        state.confirmUserId = null;
        render();
        say(`${name} saiu da equipe.`);
        focusHeading('membros');
      } catch (error) {
        confirm.disabled = false;
        say(teamErrorMessage(error), true);
      }
    }, 'button button-small button-pill team-danger');
    const cancel = button(doc, 'Cancelar', () => {
      state.confirmUserId = null;
      render();
      focusHeading('membros');
    });
    actions.append(confirm, cancel);
    box.append(actions);
    return box;
  }

  function renderInvitations() {
    const { section } = sectionWithTitle(doc, `${idPrefix}-convites`, 'Convites pendentes');
    const invitations = state.team?.invitations ?? [];
    if (!state.team) return section;
    if (!invitations.length) {
      section.append(el(doc, 'p', 'form-help', 'Nenhum convite pendente.'));
      return section;
    }
    const list = el(doc, 'ul', 'team-list');
    for (const invitation of invitations) {
      const label = TEAM_ROLE_LABELS[invitation.role] ?? invitation.role;
      const when = formatTeamDate(invitation.expiresAt);
      const row = el(doc, 'li', 'team-row');
      const info = el(doc, 'div', 'team-person');
      info.append(el(doc, 'strong', 'team-name', `Convite para ${label}`), el(doc, 'span', 'team-role-label', when ? `Vale até ${when}` : 'Pendente'));
      row.append(info);
      if (role === 'owner' || invitation.role !== 'admin') {
        const revoke = button(doc, 'Revogar', async () => {
          revoke.disabled = true;
          say('Revogando o convite…');
          try {
            await request(`${base}/invitations/${encodeURIComponent(invitation.id)}`, { method: 'DELETE', headers: JSON_HEADERS });
            state.team.invitations = state.team.invitations.filter((entry) => entry.id !== invitation.id);
            render();
            say('Convite revogado. O link deixou de funcionar.');
            focusHeading('convites');
          } catch (error) {
            say(teamErrorMessage(error), true);
            if (error?.status === 404) await load();
            else revoke.disabled = false;
          }
        });
        revoke.setAttribute('aria-label', `Revogar convite para ${label}${when ? `, válido até ${when}` : ''}`);
        const actions = el(doc, 'div', 'team-actions');
        actions.append(revoke);
        row.append(actions);
      }
      list.append(row);
    }
    section.append(list);
    return section;
  }

  function renderInviteForm() {
    const { section } = sectionWithTitle(doc, `${idPrefix}-convidar`, 'Convidar pessoa');
    section.append(el(doc, 'p', 'form-help', 'Gere um link de uso único, válido por 7 dias, e envie pelo WhatsApp ou por onde preferir. Quem abrir o link entra com a própria conta.'));
    const group = el(doc, 'div', 'form-group team-invite-group');
    const selectId = `${idPrefix}-convite-papel`;
    const label = el(doc, 'label', '', 'Papel da pessoa convidada');
    label.setAttribute('for', selectId);
    const select = roleSelect(doc, selectId, roles, state.inviteRole);
    const hint = el(doc, 'p', 'form-help', TEAM_ROLE_HINTS[state.inviteRole] ?? '');
    hint.id = `${selectId}-ajuda`;
    select.setAttribute('aria-describedby', hint.id);
    select.addEventListener('change', () => {
      state.inviteRole = select.value;
      hint.textContent = TEAM_ROLE_HINTS[state.inviteRole] ?? '';
    });
    group.append(label, select, hint);
    const generate = button(doc, 'Gerar link de convite', async () => {
      if (state.busy) return;
      state.busy = true;
      generate.disabled = true;
      say('Gerando o link do convite…');
      try {
        const created = await request(`${base}/invitations`, {
          method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ role: state.inviteRole })
        });
        state.invite = { url: created.url, message: created.message, role: created.invitation?.role ?? state.inviteRole };
        if (state.team && created.invitation) state.team.invitations = [...state.team.invitations, created.invitation];
        render();
        say('Link gerado. Ele aparece só agora: copie ou envie antes de sair.');
        focusHeading('link');
      } catch (error) {
        say(teamErrorMessage(error), true);
      } finally {
        state.busy = false;
        generate.disabled = false;
      }
    }, 'button button-small button-pill');
    section.append(group, generate);
    if (state.invite) section.append(renderInviteResult());
    return section;
  }

  function renderInviteResult() {
    const { section: box, heading } = sectionWithTitle(doc, `${idPrefix}-link`, `Link para ${TEAM_ROLE_LABELS[state.invite.role] ?? 'a equipe'}`);
    box.className = 'team-invite-result';
    heading.className = 'team-result-title';
    box.append(el(doc, 'p', 'form-help', 'Este link aparece só agora e vale para uma pessoa. Se perder, revogue e gere outro.'));
    const inputId = `${idPrefix}-link-campo`;
    const label = el(doc, 'label', 'team-sr-only', 'Link do convite');
    label.setAttribute('for', inputId);
    const input = el(doc, 'input', 'item-input team-link-input');
    input.id = inputId;
    input.type = 'text';
    input.readOnly = true;
    input.value = state.invite.url;
    input.setAttribute('readonly', '');
    const copy = button(doc, 'Copiar link', async () => {
      try {
        if (typeof clipboard?.writeText !== 'function') throw new Error('sem área de transferência');
        await clipboard.writeText(state.invite.url);
        say('Link copiado.');
      } catch {
        input.focus?.();
        input.select?.();
        say('Não deu para copiar sozinho. O link está selecionado: copie com Ctrl+C ou com um toque longo.', true);
      }
    }, 'button button-small button-pill');
    const whatsapp = el(doc, 'a', 'button button-small button-secondary button-pill', 'Abrir no WhatsApp');
    whatsapp.href = whatsappShareUrl(state.invite.message ?? state.invite.url);
    whatsapp.target = '_blank';
    whatsapp.rel = 'noopener noreferrer';
    whatsapp.setAttribute('aria-label', 'Abrir no WhatsApp com a mensagem do convite (abre em nova aba)');
    const actions = el(doc, 'div', 'team-actions');
    actions.append(copy, whatsapp);
    box.append(label, input, actions);
    return box;
  }

  function render() {
    body.replaceChildren(renderMembers(), renderInvitations(), renderInviteForm());
  }

  async function load() {
    state.loadError = null;
    say('Carregando a equipe…');
    render();
    try {
      const team = await request(`${base}/team`);
      state.team = {
        members: Array.isArray(team?.members) ? team.members : [],
        invitations: Array.isArray(team?.invitations) ? team.invitations : []
      };
      say('');
    } catch (error) {
      state.team = null;
      state.loadError = teamErrorMessage(error, 'Não foi possível carregar a equipe.');
      say(state.loadError, true);
    }
    render();
  }

  return { reload: load, ready: load() };
}
