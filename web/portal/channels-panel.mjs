// Central de canais do editor (issue #125): links diretos (sem login de terceiros) e
// integrações, cada uma com estado em texto, titular, permissões, plano e próximo passo.
// O carregamento só faz GET; o rascunho muda apenas quando a pessoa edita um campo.
import {
  draftInstagramUrl,
  normalizeInstagramUrl,
  normalizePublicEmail,
  whatsappTestLink
} from '../assets/channels.mjs';

export const PLANS_URL = 'https://vitrine.inspira.dev.br/planos/';
const PUBLIC_ORIGIN = 'https://vitrine.inspira.dev.br';
const LINK_EDITOR_ROLES = ['owner', 'admin', 'editor'];
const MANAGER_ROLES = ['owner', 'admin'];
const ROLE_LABELS = Object.freeze({ owner: 'Proprietário', admin: 'Administrador', editor: 'Editor', viewer: 'Leitor' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo'
});

export const INTEGRATION_CATALOG = Object.freeze({
  custom_domain: {
    name: 'Domínio próprio',
    holder: 'Você, no provedor onde o domínio está registrado.',
    permissions: 'Nenhuma senha. Você cria um registro CNAME e um TXT no DNS do seu domínio.',
    prerequisites: 'Domínio registrado em seu nome e acesso ao painel de DNS.',
    manage: { tab: 'settings', target: 'custom-domains', label: 'Abrir Domínios e publicação' }
  },
  public_json: {
    name: 'vitrine.json para robôs de conversa',
    holder: 'Vitrine Inspira, num endereço público sem login.',
    permissions: 'Nenhuma. O robô só lê o que já está publicado na vitrine.',
    prerequisites: 'Vitrine publicada depois de o plano incluir o recurso.'
  },
  quote_webhook: {
    name: 'Pré-orçamento para CRM ou planilha',
    holder: 'O seu CRM ou planilha, no endereço que você informa.',
    permissions: 'Nenhum login em terceiros. Envia categoria, data e bairro, só com o consentimento da pessoa, com assinatura HMAC.',
    prerequisites: 'Endereço HTTPS do destino e segredo gerado.',
    manage: { tab: 'order-msg', target: 'quote-webhook-panel', label: 'Abrir configuração do pré-orçamento' }
  },
  instagram_connect: {
    name: 'Instagram conectado',
    holder: 'A sua conta profissional do Instagram (Empresa ou Criador).',
    permissions: 'instagram_basic: só leitura do perfil e das publicações.',
    prerequisites: 'Conta profissional do Instagram ligada a esta vitrine.'
  }
});

const STATE_LABELS = Object.freeze({
  off: 'Desligada',
  active: 'Ativa',
  error: 'Com erro',
  locked: 'Exige plano',
  pending: 'Aguardando',
  soon: 'Em breve',
  restricted: 'Detalhes com a administração',
  unavailable: 'Indisponível agora'
});

const panel = {
  site: null,
  status: null,
  statusError: null,
  isOnline: false,
  getContent: () => null,
  onChange: () => {},
  openSection: () => {},
  fetchImpl: null,
  container: null,
  doc: null,
  generation: 0
};

function el(doc, tag, className, text) {
  const node = doc.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function externalLink(doc, href, label, className, ariaLabel) {
  const link = el(doc, 'a', className, label);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  if (ariaLabel) link.setAttribute('aria-label', ariaLabel);
  return link;
}

function actionButton(doc, label, onClick, className = 'button button-small button-secondary button-pill') {
  const node = el(doc, 'button', className, label);
  node.type = 'button';
  node.addEventListener('click', onClick);
  return node;
}

export function formatChannelDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date).replace(', ', ' às ');
}

/** "Último envio em 14/11 às 17:34: HTTP 200 (entregue)". */
export function describeWebhookDiagnostic(lastDelivery) {
  if (!lastDelivery) return 'Nenhum envio ainda.';
  const what = lastDelivery.kind === 'test' ? 'Último teste' : 'Último envio';
  const when = formatChannelDate(lastDelivery.at);
  const result = lastDelivery.httpStatus
    ? `HTTP ${lastDelivery.httpStatus} (${lastDelivery.ok ? 'entregue' : 'falhou'})`
    : 'sem resposta do destino';
  return `${what}${when ? ` em ${when}` : ''}: ${result}.`;
}

function planText(integration, status) {
  const current = status?.plan?.name ? ` Seu plano: ${status.plan.name}.` : '';
  if (integration.id === 'instagram_connect') return 'A definir quando a integração existir.';
  if (integration.available) return `Incluído no seu plano${status?.plan?.name ? ` (${status.plan.name})` : ''}.`;
  return `${integration.requiredPlan?.name ?? 'Plano pago'} ou superior.${current}`;
}

function stateLabel(integration) {
  if (integration.state === 'locked') return `Exige plano ${integration.requiredPlan?.name ?? 'pago'}`;
  if (integration.state === 'pending') {
    return integration.id === 'custom_domain' ? 'Aguardando DNS' : 'Aguardando publicação';
  }
  return STATE_LABELS[integration.state] ?? integration.state;
}

/**
 * Último diagnóstico e próximo passo, em texto. `slug` monta o endereço padrão; nenhuma
 * frase depende de cor para ser entendida.
 */
export function describeIntegration(integration, { slug = '', planName = '' } = {}) {
  const fallbackUrl = `vitrine.inspira.dev.br/${slug}`;
  const diag = integration.diagnostic ?? {};
  const requiredPlan = integration.requiredPlan?.name ?? 'pago';
  if (integration.state === 'restricted') {
    return {
      diagnostic: 'O endereço e as entregas aparecem só para o dono e a administração da vitrine.',
      nextStep: 'Peça a quem administra a vitrine para conferir ou mudar esta integração.'
    };
  }
  if (integration.state === 'unavailable') {
    return {
      diagnostic: 'Não foi possível consultar esta integração agora.',
      nextStep: 'Tente de novo em alguns minutos. Se continuar, fale com a equipe Vitrine Inspira.'
    };
  }
  if (integration.state === 'soon') {
    return {
      diagnostic: 'Ainda não disponível.',
      nextStep: 'Em breve você poderá conectar a conta profissional para mostrar as publicações na vitrine. Até lá, o perfil aparece como link direto, em "Links diretos".'
    };
  }
  if (integration.id === 'custom_domain') {
    if (integration.state === 'locked') {
      return diag.hostname
        ? {
          diagnostic: `${diag.hostname} está suspenso: o plano atual não inclui domínio próprio.`,
          nextStep: `A vitrine continua em ${fallbackUrl} e nada foi apagado. Volte ao plano ${requiredPlan} para reativar o domínio.`
        }
        : {
          diagnostic: 'Nenhum domínio ligado.',
          nextStep: `Disponível no plano ${requiredPlan}. Com ele, você liga um domínio seu (como www.seunegocio.com.br).`
        };
    }
    if (integration.state === 'off') {
      return {
        diagnostic: `Nenhum domínio ligado. A vitrine abre em ${fallbackUrl}.`,
        nextStep: 'Abra "Domínios e publicação", informe o domínio e siga as instruções de DNS.'
      };
    }
    if (integration.state === 'active') {
      const when = diag.verifiedAt ? formatChannelDate(diag.verifiedAt) : '';
      return {
        diagnostic: `${diag.hostname} verificado${when ? ` em ${when}` : ''}, com certificado SSL ativo.`,
        nextStep: 'Nada a fazer. Para trocar de domínio, desconecte este em "Domínios e publicação".'
      };
    }
    if (integration.state === 'pending') {
      return diag.status === 'verifying'
        ? {
          diagnostic: `O DNS de ${diag.hostname} foi conferido; o certificado SSL está sendo emitido.`,
          nextStep: 'Volte em alguns minutos e clique em "Verificar" em "Domínios e publicação".'
        }
        : {
          diagnostic: `O DNS de ${diag.hostname} ainda não aponta para ${diag.cnameTarget ?? 'o endereço indicado'}.`,
          nextStep: `Crie no seu provedor o registro CNAME de ${diag.hostname} para ${diag.cnameTarget ?? 'o endereço indicado'} e o TXT mostrado em "Domínios e publicação"; depois clique em "Verificar".`
        };
    }
    return {
      diagnostic: diag.hostname
        ? `O DNS de ${diag.hostname} não aponta para ${diag.cnameTarget ?? 'o endereço indicado'} ou o certificado falhou.`
        : 'Não foi possível ler o domínio.',
      nextStep: 'Confira os registros CNAME e TXT no seu provedor de DNS e clique em "Verificar" de novo.'
    };
  }
  if (integration.id === 'public_json') {
    const url = diag.url ?? `${PUBLIC_ORIGIN}/${slug}/vitrine.json`;
    if (integration.state === 'locked') {
      return {
        diagnostic: 'Desligado no seu plano.',
        nextStep: `Disponível no plano ${requiredPlan}. Robôs como Manychat e BotConversa passam a ler horário, links e itens em ${url}.`
      };
    }
    if (integration.state === 'active') {
      const when = diag.publishedAt ? formatChannelDate(diag.publishedAt) : '';
      return {
        diagnostic: `Ligado desde a publicação${when ? ` de ${when}` : ''}. Endereço: ${url}`,
        nextStep: 'Copie o endereço no seu robô de conversa. Cada nova publicação atualiza o conteúdo.'
      };
    }
    if (integration.state === 'pending') {
      return {
        diagnostic: 'O plano inclui o vitrine.json, mas a última publicação é anterior.',
        nextStep: 'Publique a vitrine de novo para ligar o endereço.'
      };
    }
    return {
      diagnostic: 'A vitrine ainda não foi publicada.',
      nextStep: 'Publique a vitrine para ligar o vitrine.json.'
    };
  }
  if (integration.id === 'quote_webhook') {
    if (integration.state === 'locked') {
      return {
        diagnostic: 'Desligado no seu plano.',
        nextStep: `Disponível no plano ${requiredPlan}${planName ? ` (seu plano: ${planName})` : ''}. Nada do que já foi salvo é apagado.`
      };
    }
    const last = describeWebhookDiagnostic(diag.lastDelivery);
    if (integration.state === 'off') {
      return {
        diagnostic: diag.host ? `Destino ${diag.host}, sem segredo gerado.` : 'Nenhum destino informado.',
        nextStep: 'Na aba Pedido, informe o endereço HTTPS do seu CRM ou planilha, gere o segredo e envie um teste.'
      };
    }
    if (integration.state === 'error') {
      const status = diag.lastDelivery?.httpStatus;
      return {
        diagnostic: last,
        nextStep: status
          ? `O destino ${diag.host ?? ''} respondeu HTTP ${status}. Confira o endereço e o segredo no seu CRM e use "Enviar teste" na aba Pedido.`.replace('  ', ' ')
          : `O destino ${diag.host ?? ''} não respondeu. Confira se o endereço está no ar e use "Enviar teste" na aba Pedido.`.replace('  ', ' ')
      };
    }
    return {
      diagnostic: last,
      nextStep: `Entregando em ${diag.host ?? 'seu destino'}. ${diag.totals?.delivered ?? 0} entregues, ${diag.totals?.failed ?? 0} com falha.`
    };
  }
  return { diagnostic: '', nextStep: '' };
}

function definitionRow(doc, list, term, value) {
  const row = el(doc, 'div', 'channels-def-row');
  row.append(el(doc, 'dt', '', term), el(doc, 'dd', '', value));
  list.append(row);
}

function cardHeader(doc, title, badgeText, badgeState, titleId) {
  const header = el(doc, 'div', 'channels-card-header');
  const heading = el(doc, 'h4', 'channels-card-title', title);
  heading.id = titleId;
  const badge = el(doc, 'span', `channels-badge is-${badgeState}`);
  badge.append(el(doc, 'span', 'channels-sr-only', 'Estado: '), doc.createTextNode(badgeText));
  header.append(heading, badge);
  return header;
}

function testNote(doc, text) {
  return el(doc, 'p', 'channels-test-note', text);
}

function renderWhatsappCard(ctx, doc, list, content, slug, canEdit) {
  const link = whatsappTestLink({ ...content, orderRelay: undefined }, slug);
  const card = el(doc, 'li', 'channels-card');
  card.setAttribute('aria-labelledby', 'channels-whatsapp-title');
  card.append(cardHeader(doc, 'WhatsApp', link.url ? 'Ativo' : 'Falta o número', link.url ? 'active' : 'error', 'channels-whatsapp-title'));
  const defs = el(doc, 'dl', 'channels-defs');
  definitionRow(doc, defs, 'Link final', link.url ?? 'Sem número válido.');
  definitionRow(doc, defs, 'Onde aparece', content?.orderRelay === 'mila'
    ? 'Fica só no rascunho: com pedidos pela Mila, a vitrine mostra o WhatsApp da Mila.'
    : 'Botões de pedido e rodapé da vitrine.');
  card.append(defs);
  const actions = el(doc, 'div', 'channels-actions');
  if (link.url) {
    actions.append(externalLink(doc, link.url, 'Testar', 'button button-small button-pill channels-test', 'Testar o WhatsApp (abre em nova aba)'));
    card.append(actions, testNote(doc, 'Abre a conversa no WhatsApp em nova aba. Nada é enviado até você tocar em enviar.'));
  } else {
    card.append(el(doc, 'p', 'channels-next', canEdit
      ? 'Próximo passo: informe o número com DDD em Ajustes.'
      : 'Próximo passo: quem edita a vitrine precisa informar o número em Ajustes.'));
  }
  if (canEdit) {
    actions.append(actionButton(doc, 'Alterar em Ajustes', () => ctx.openSection('settings', 'editor-whatsapp')));
    if (!link.url) card.append(actions);
  }
  list.append(card);
}

function renderMilaCard(ctx, doc, list, content, slug, canEdit) {
  const on = content?.orderRelay === 'mila';
  const link = whatsappTestLink({ orderRelay: 'mila' }, slug);
  const card = el(doc, 'li', 'channels-card');
  card.setAttribute('aria-labelledby', 'channels-mila-title');
  card.append(cardHeader(doc, 'Pedidos pela Mila', on ? 'Ligado' : 'Desligado', on ? 'active' : 'off', 'channels-mila-title'));
  card.append(el(doc, 'p', 'form-help', 'A Mila, da equipe Vitrine Inspira, recebe os pedidos e repassa cada um para o seu WhatsApp. Seu número não aparece na vitrine.'));
  const defs = el(doc, 'dl', 'channels-defs');
  definitionRow(doc, defs, 'Link final', on ? link.url : 'Desligado: os pedidos vão direto para o seu WhatsApp.');
  card.append(defs);
  const actions = el(doc, 'div', 'channels-actions');
  if (on) {
    actions.append(externalLink(doc, link.url, 'Testar', 'button button-small button-pill channels-test', 'Testar o link da Mila (abre em nova aba)'));
  }
  if (canEdit) {
    actions.append(actionButton(doc, on ? 'Desligar em Ajustes' : 'Ligar em Ajustes', () => ctx.openSection('settings', 'editor-mila-relay')));
  }
  if (actions.children?.length ?? actions.childNodes?.length) card.append(actions);
  if (on) card.append(testNote(doc, 'Abre o WhatsApp da Mila em nova aba com o código da vitrine. Não envie: a mensagem iria para a Mila.'));
  list.append(card);
}

function editableField(doc, card, { id, label, value, placeholder, help, type, inputMode, onValue }) {
  const group = el(doc, 'div', 'channels-field');
  const labelNode = el(doc, 'label', 'channels-field-label', label);
  labelNode.setAttribute('for', id);
  const input = doc.createElement('input');
  input.type = type;
  input.id = id;
  input.className = 'item-input input-styled-height';
  input.value = value;
  input.placeholder = placeholder;
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (inputMode) input.inputMode = inputMode;
  const helpNode = el(doc, 'span', 'form-help', help);
  helpNode.id = `${id}-help`;
  const error = el(doc, 'span', 'form-error-msg');
  error.id = `${id}-error`;
  error.hidden = true;
  input.setAttribute('aria-describedby', `${id}-help`);
  const update = (commit) => {
    const message = onValue(input.value, commit);
    error.textContent = message ?? '';
    error.hidden = !message;
    if (message) {
      input.setAttribute('aria-invalid', 'true');
      input.setAttribute('aria-describedby', `${id}-error ${id}-help`);
    } else {
      input.removeAttribute?.('aria-invalid');
      input.setAttribute('aria-describedby', `${id}-help`);
    }
  };
  input.addEventListener('input', () => update(false));
  input.addEventListener('change', () => update(true));
  group.append(labelNode, input, error, helpNode);
  card.append(group);
  return input;
}

function renderInstagramCard(ctx, doc, list, content, canEdit) {
  const current = draftInstagramUrl(content);
  const card = el(doc, 'li', 'channels-card');
  card.setAttribute('aria-labelledby', 'channels-instagram-title');
  card.append(cardHeader(doc, 'Perfil do Instagram', current ? 'Ativo' : 'Desligado', current ? 'active' : 'off', 'channels-instagram-title'));
  const finalLink = el(doc, 'dd', '', current ?? 'Nenhum perfil informado.');
  const defs = el(doc, 'dl', 'channels-defs');
  const row = el(doc, 'div', 'channels-def-row');
  row.append(el(doc, 'dt', '', 'Link final'), finalLink);
  defs.append(row);
  definitionRow(doc, defs, 'Onde aparece', 'Cabeçalho e rodapé da vitrine, a partir da próxima publicação.');
  const actions = el(doc, 'div', 'channels-actions');
  const test = externalLink(doc, current ?? PUBLIC_ORIGIN, 'Testar', 'button button-small button-pill channels-test', 'Testar o perfil do Instagram (abre em nova aba)');
  test.hidden = !current;
  actions.append(test);
  if (canEdit) {
    editableField(doc, card, {
      id: 'channels-instagram',
      label: 'Endereço ou @perfil',
      value: current ?? '',
      placeholder: '@seuperfil',
      help: 'Só perfis do instagram.com. Sem login: é um link direto.',
      type: 'text',
      onValue(raw, commit) {
        const live = ctx.getContent();
        if (!live) return null;
        const trimmed = String(raw ?? '').trim();
        const normalized = normalizeInstagramUrl(trimmed);
        if (!trimmed || normalized) {
          const next = trimmed ? normalized : null;
          if (draftInstagramUrl(live) !== next || live.instagram !== undefined) {
            if (next) live.instagramUrl = next;
            else delete live.instagramUrl;
            delete live.instagram;
            ctx.onChange();
          }
          finalLink.textContent = next ?? 'Nenhum perfil informado.';
          test.hidden = !next;
          if (next) test.href = next;
          return null;
        }
        return commit || trimmed.length > 3
          ? 'Use o @perfil ou o endereço https://www.instagram.com/seu.perfil/. Links de publicação (/p/…) não valem. O valor anterior continua salvo.'
          : null;
      }
    });
  }
  card.append(defs, actions);
  card.append(testNote(doc, 'Abre o perfil em nova aba.'));
  list.append(card);
}

function renderEmailCard(ctx, doc, list, content, canEdit) {
  const current = normalizePublicEmail(content?.publicEmail);
  const card = el(doc, 'li', 'channels-card');
  card.setAttribute('aria-labelledby', 'channels-email-title');
  card.append(cardHeader(doc, 'E-mail público', current ? 'Ativo' : 'Desligado', current ? 'active' : 'off', 'channels-email-title'));
  const finalLink = el(doc, 'dd', '', current ? `mailto:${current}` : 'Nenhum e-mail informado.');
  const defs = el(doc, 'dl', 'channels-defs');
  const row = el(doc, 'div', 'channels-def-row');
  row.append(el(doc, 'dt', '', 'Link final'), finalLink);
  defs.append(row);
  definitionRow(doc, defs, 'Onde aparece', 'Rodapé da vitrine, a partir da próxima publicação. Não é o e-mail da sua conta.');
  if (canEdit) {
    editableField(doc, card, {
      id: 'channels-email',
      label: 'E-mail para contato',
      value: current ?? '',
      placeholder: 'contato@seunegocio.com.br',
      help: 'Fica visível para quem abre a vitrine. Use um e-mail do negócio.',
      type: 'email',
      inputMode: 'email',
      onValue(raw, commit) {
        const live = ctx.getContent();
        if (!live) return null;
        const trimmed = String(raw ?? '').trim();
        const normalized = normalizePublicEmail(trimmed);
        if (!trimmed || normalized) {
          if ((normalizePublicEmail(live.publicEmail) ?? null) !== (normalized ?? null)) {
            if (normalized) live.publicEmail = normalized;
            else delete live.publicEmail;
            ctx.onChange();
          }
          finalLink.textContent = normalized ? `mailto:${normalized}` : 'Nenhum e-mail informado.';
          return null;
        }
        return commit ? 'Use um e-mail completo, como contato@seunegocio.com.br. O valor anterior continua salvo.' : null;
      }
    });
  }
  card.append(defs);
  list.append(card);
}

function navigationLinks(content) {
  const menus = content?.structure?.navigationMenus ?? content?.structure?.navigation ?? {};
  const seen = new Set();
  const links = [];
  for (const entry of [...(menus.header ?? []), ...(menus.footer ?? [])]) {
    if (typeof entry?.href !== 'string' || !/^https:\/\//.test(entry.href) || seen.has(entry.href)) continue;
    seen.add(entry.href);
    links.push({ label: String(entry.label ?? entry.href), href: entry.href });
  }
  return links;
}

function renderOtherLinksCard(ctx, doc, list, content, canEdit) {
  const links = navigationLinks(content);
  const card = el(doc, 'li', 'channels-card');
  card.setAttribute('aria-labelledby', 'channels-links-title');
  card.append(cardHeader(doc, 'Outros links', links.length ? `${links.length} ${links.length === 1 ? 'link' : 'links'}` : 'Nenhum', links.length ? 'active' : 'off', 'channels-links-title'));
  if (links.length) {
    const ul = el(doc, 'ul', 'channels-link-list');
    for (const link of links) {
      const li = el(doc, 'li', 'channels-link-row');
      const text = el(doc, 'span', 'channels-link-text');
      text.append(el(doc, 'strong', '', link.label), el(doc, 'span', 'channels-link-href', link.href));
      li.append(text, externalLink(doc, link.href, 'Testar', 'button button-small button-secondary button-pill channels-test', `Testar ${link.label} (abre em nova aba)`));
      ul.append(li);
    }
    card.append(ul);
  } else {
    card.append(el(doc, 'p', 'channels-next', 'Nenhum link externo nos menus da vitrine.'));
  }
  if (canEdit) {
    const actions = el(doc, 'div', 'channels-actions');
    actions.append(actionButton(doc, 'Editar menus em Ajustes', () => ctx.openSection('settings', 'showcase-structure')));
    card.append(actions);
  }
  list.append(card);
}

function renderIntegrationCard(ctx, doc, list, integration, status, slug, canManage) {
  const catalog = INTEGRATION_CATALOG[integration.id];
  if (!catalog) return;
  const titleId = `channels-${integration.id}-title`;
  const card = el(doc, 'li', `channels-card channels-integration is-${integration.state}`);
  card.setAttribute('aria-labelledby', titleId);
  card.append(cardHeader(doc, catalog.name, stateLabel(integration), integration.state, titleId));
  const { diagnostic, nextStep } = describeIntegration(integration, { slug, planName: status?.plan?.name ?? '' });
  const defs = el(doc, 'dl', 'channels-defs');
  definitionRow(doc, defs, 'Plano necessário', planText(integration, status));
  definitionRow(doc, defs, 'Titular', catalog.holder);
  definitionRow(doc, defs, 'Permissões pedidas', catalog.permissions);
  definitionRow(doc, defs, 'Pré-requisitos', catalog.prerequisites);
  definitionRow(doc, defs, 'Último diagnóstico', diagnostic);
  card.append(defs);
  card.append(el(doc, 'p', 'channels-next', `Próximo passo: ${nextStep}`));
  const actions = el(doc, 'div', 'channels-actions');
  if (integration.state === 'locked') {
    actions.append(externalLink(doc, PLANS_URL, `Ver o plano ${integration.requiredPlan?.name ?? ''}`.trim(), 'text-link channels-plan-link', `Ver o plano ${integration.requiredPlan?.name ?? ''} (abre em nova aba)`.replace('  ', ' ')));
  }
  if (integration.id === 'public_json' && integration.state === 'active' && integration.diagnostic?.url) {
    actions.append(externalLink(doc, integration.diagnostic.url, 'Testar', 'button button-small button-pill channels-test', 'Testar o vitrine.json (abre em nova aba)'));
  }
  if (canManage && catalog.manage && integration.state !== 'locked' && integration.state !== 'unavailable') {
    actions.append(actionButton(doc, catalog.manage.label, () => ctx.openSection(catalog.manage.tab, catalog.manage.target)));
  }
  if (actions.children?.length ?? actions.childNodes?.length) card.append(actions);
  list.append(card);
}

/** Desenha a central. `status` vem de `GET /api/sites/:id/channels` (ou `null`). */
export function renderChannelsPanel(container, {
  site, content, status, statusError = null, isOnline = true,
  getContent = () => content, onChange = () => {}, openSection = () => {}, onRetry = () => {}
}, doc = globalThis.document) {
  if (!container || !doc) return;
  const ctx = { getContent, onChange, openSection };
  container.replaceChildren();
  const role = status?.role ?? site?.role ?? 'viewer';
  const canEdit = LINK_EDITOR_ROLES.includes(role);
  const canManage = MANAGER_ROLES.includes(role);
  const slug = site?.slug ?? content?.slug ?? '';

  const header = el(doc, 'div', 'channels-header');
  const title = el(doc, 'h2', 'channels-title', 'Canais');
  title.id = 'channels-title';
  header.append(title, el(doc, 'p', 'form-help', 'Links diretos funcionam sem login de terceiros. Integrações ligam a vitrine a outros serviços: cada uma mostra o estado, o plano necessário e o que fazer.'));
  container.append(header);

  if (!canEdit) {
    const note = el(doc, 'p', 'channels-role-note', `Acesso de leitura (${ROLE_LABELS[role] ?? 'Leitor'}): você vê os canais e pode testar os links, mas não altera nada.`);
    note.setAttribute('role', 'note');
    container.append(note);
  } else if (!canManage) {
    const note = el(doc, 'p', 'channels-role-note', 'Como Editor, você altera os links diretos. As integrações são ligadas pelo dono ou pela administração da vitrine.');
    note.setAttribute('role', 'note');
    container.append(note);
  }

  const direct = el(doc, 'section', 'channels-group');
  direct.setAttribute('aria-labelledby', 'channels-direct-title');
  const directTitle = el(doc, 'h3', 'channels-group-title', 'Links diretos');
  directTitle.id = 'channels-direct-title';
  direct.append(directTitle, el(doc, 'p', 'form-help', 'Sem login de terceiros: a vitrine só mostra o link. Cada um tem o botão "Testar".'));
  const directList = el(doc, 'ul', 'channels-list');
  renderWhatsappCard(ctx, doc, directList, content ?? {}, slug, canEdit);
  renderMilaCard(ctx, doc, directList, content ?? {}, slug, canEdit);
  renderInstagramCard(ctx, doc, directList, content ?? {}, canEdit);
  renderEmailCard(ctx, doc, directList, content ?? {}, canEdit);
  renderOtherLinksCard(ctx, doc, directList, content ?? {}, canEdit);
  direct.append(directList);
  container.append(direct);

  const integrations = el(doc, 'section', 'channels-group');
  integrations.setAttribute('aria-labelledby', 'channels-integrations-title');
  const integrationsTitle = el(doc, 'h3', 'channels-group-title', 'Integrações');
  integrationsTitle.id = 'channels-integrations-title';
  integrations.append(integrationsTitle, el(doc, 'p', 'form-help', status?.plan?.name
    ? `Plano atual: ${status.plan.name}. O plano necessário aparece em cada integração, antes de qualquer clique.`
    : 'O plano necessário aparece em cada integração, antes de qualquer clique.'));
  if (!isOnline) {
    integrations.append(el(doc, 'p', 'channels-next', 'Entre com sua conta para ver o estado das integrações.'));
  } else if (statusError) {
    const error = el(doc, 'p', 'form-error-msg', `${statusError} `);
    error.setAttribute('role', 'alert');
    integrations.append(error, actionButton(doc, 'Tentar de novo', onRetry));
  } else if (!status) {
    integrations.append(el(doc, 'p', 'loading-msg', 'Carregando integrações…'));
  } else {
    const list = el(doc, 'ul', 'channels-list');
    for (const integration of status.integrations ?? []) {
      renderIntegrationCard(ctx, doc, list, integration, status, slug, canManage);
    }
    integrations.append(list);
  }
  container.append(integrations);
}

function render() {
  if (!panel.container || !panel.doc) return;
  renderChannelsPanel(panel.container, {
    site: panel.site,
    content: panel.getContent(),
    status: panel.status,
    statusError: panel.statusError,
    isOnline: panel.isOnline,
    getContent: () => panel.getContent(),
    onChange: () => panel.onChange(),
    openSection: (tab, target) => panel.openSection(tab, target),
    onRetry: () => { void loadStatus(); }
  }, panel.doc);
}

async function loadStatus() {
  const generation = panel.generation;
  panel.statusError = null;
  panel.status = null;
  render();
  try {
    const response = await panel.fetchImpl(`/api/sites/${encodeURIComponent(panel.site.id)}/channels`);
    const data = await response.json().catch(() => ({}));
    if (generation !== panel.generation) return;
    if (!response.ok) throw new Error(data?.error?.message ?? 'Não foi possível carregar as integrações.');
    panel.status = data.channels ?? null;
  } catch (error) {
    if (generation !== panel.generation) return;
    panel.statusError = error?.message || 'Não foi possível carregar as integrações.';
  }
  render();
}

/** Redesenha com o rascunho atual (ao abrir a aba Canais). */
export function refreshChannelsPanel() {
  render();
}

/** Liga a central à vitrine aberta no editor. Só faz GET. */
export async function mountChannelsPanel({
  site, isOnline, getContent, onChange, openSection,
  fetchImpl = globalThis.fetch?.bind(globalThis), doc = globalThis.document
} = {}) {
  const container = doc?.getElementById('channels-panel');
  if (!container) return;
  if (panel.container === container && site && panel.site === site) {
    panel.getContent = getContent ?? panel.getContent;
    panel.onChange = onChange ?? panel.onChange;
    render();
    return;
  }
  panel.generation += 1;
  Object.assign(panel, {
    site, status: null, statusError: null, isOnline: Boolean(isOnline),
    getContent: getContent ?? (() => null), onChange: onChange ?? (() => {}),
    openSection: openSection ?? (() => {}), fetchImpl, container, doc
  });
  render();
  if (panel.isOnline && site?.id) await loadStatus();
}
