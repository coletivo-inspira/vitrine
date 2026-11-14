// Painel "Pré-orçamento para CRM ou planilha" do editor (issue #121). Só dono e admin
// veem. O segredo chega uma única vez, na resposta de "Gerar segredo", e fica só na
// memória desta tela até ela ser redesenhada para outra vitrine.
import { QUOTE_LEAD_FIELDS, QUOTE_LEAD_LABELS, quoteLeadFields } from '../assets/quote-lead.mjs';

const PLANS_URL = 'https://vitrine.inspira.dev.br/planos/';
const STATE_LABELS = Object.freeze({
  locked: 'Plano Profissional',
  not_configured: 'Não configurado',
  ready: 'Pronto',
  failing: 'Com falha'
});
const dateFormat = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo'
});

const panel = {
  site: null,
  status: null,
  secret: null,
  confirmRotate: false,
  busy: false,
  message: null,
  urlDraft: null,
  getContent: () => null,
  onChange: () => {},
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

function button(doc, label, className, onClick, disabled = false) {
  const node = el(doc, 'button', className, label);
  node.type = 'button';
  node.disabled = disabled;
  node.addEventListener('click', onClick);
  return node;
}

function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

export function formatWebhookDate(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '' : dateFormat.format(date);
}

/** Frase do último envio, também usada pela central de canais (#125). */
export function describeLastDelivery(lastDelivery) {
  if (!lastDelivery) return 'Nenhum envio ainda.';
  const parts = [lastDelivery.ok ? 'Entregue' : 'Falhou'];
  parts.push(lastDelivery.httpStatus ? `HTTP ${lastDelivery.httpStatus}` : 'sem resposta do destino');
  if (lastDelivery.attempts) parts.push(plural(lastDelivery.attempts, 'tentativa', 'tentativas'));
  const when = formatWebhookDate(lastDelivery.at);
  if (when) parts.push(when);
  return `${parts.join(' · ')}${lastDelivery.kind === 'test' ? ' (teste)' : ''}`;
}

function renderFieldsConfig(doc, root, locked) {
  const content = panel.getContent();
  const enabled = quoteLeadFields(content?.quoteLead);
  const group = el(doc, 'fieldset', 'quote-webhook-fields');
  group.disabled = locked;
  group.append(el(doc, 'legend', 'quote-webhook-label', 'Campos na vitrine (até 3)'));
  const grid = el(doc, 'div', 'checkbox-group-grid');
  for (const field of QUOTE_LEAD_FIELDS) {
    const label = el(doc, 'label', 'checkbox-label-styled');
    const input = doc.createElement('input');
    input.type = 'checkbox';
    input.id = `quote-lead-field-${field}`;
    input.checked = enabled.includes(field);
    input.addEventListener('change', () => {
      const current = panel.getContent();
      if (!current) return;
      const next = QUOTE_LEAD_FIELDS.filter((name) =>
        name === field ? input.checked : quoteLeadFields(current.quoteLead).includes(name));
      if (next.length) current.quoteLead = { fields: next };
      else delete current.quoteLead;
      panel.onChange();
    });
    label.append(input, doc.createTextNode(` ${QUOTE_LEAD_LABELS[field]}`));
    grid.append(label);
  }
  group.append(grid);
  group.append(el(
    doc,
    'p',
    'form-help',
    'A pessoa vê os campos em "Dados para o orçamento" e só envia se marcar o consentimento. Vale a partir da próxima publicação.'
  ));
  root.append(group);
}

function renderUrl(doc, root, status, locked) {
  const group = el(doc, 'div', 'quote-webhook-row');
  const label = el(doc, 'label', 'quote-webhook-label', 'Endereço do webhook (HTTPS)');
  label.setAttribute('for', 'quote-webhook-url');
  const input = doc.createElement('input');
  input.type = 'url';
  input.id = 'quote-webhook-url';
  input.className = 'item-input input-styled-height';
  input.placeholder = 'https://seu-crm.com.br/webhooks/vitrine';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.disabled = locked;
  input.value = panel.urlDraft ?? status?.url ?? '';
  input.setAttribute('aria-describedby', 'quote-webhook-url-help');
  input.addEventListener('input', () => {
    panel.urlDraft = input.value;
  });
  const help = el(
    doc,
    'span',
    'form-help',
    'Só endereços HTTPS públicos. Endereços locais, IPs de rede interna e endereços da plataforma são recusados.'
  );
  help.id = 'quote-webhook-url-help';
  const actions = el(doc, 'div', 'quote-webhook-actions');
  actions.append(button(doc, 'Salvar endereço', 'button button-small button-pill', () => saveUrl(input.value), locked || panel.busy));
  group.append(label, input, help, actions);
  root.append(group);
}

function renderSecret(doc, root, status, locked) {
  const group = el(doc, 'div', 'quote-webhook-row');
  group.append(el(doc, 'span', 'quote-webhook-label', 'Segredo da assinatura'));
  if (panel.secret) {
    const box = el(doc, 'div', 'quote-webhook-secret');
    const input = doc.createElement('input');
    input.type = 'text';
    input.id = 'quote-webhook-secret';
    input.className = 'item-input input-styled-height quote-webhook-secret-value';
    input.readOnly = true;
    input.value = panel.secret;
    input.setAttribute('aria-label', 'Segredo gerado');
    const copy = button(doc, 'Copiar', 'button button-small button-secondary button-pill', async () => {
      try {
        await globalThis.navigator?.clipboard?.writeText(panel.secret);
        setMessage('Segredo copiado.', 'success');
      } catch {
        input.select?.();
        setMessage('Selecione o segredo e copie manualmente.', 'error');
      }
    });
    box.append(input, copy);
    group.append(box);
    group.append(el(
      doc,
      'p',
      'quote-webhook-warning',
      'Copie agora e guarde no seu CRM ou planilha: este segredo não aparece de novo.'
    ));
  } else {
    group.append(el(
      doc,
      'p',
      'form-help',
      status?.hasSecret
        ? `Segredo gerado em ${formatWebhookDate(status.secretCreatedAt)}. Por segurança, ele não é mostrado de novo.`
        : 'Nenhum segredo gerado. O destino usa o segredo para conferir que o envio veio da sua vitrine.'
    ));
  }
  const actions = el(doc, 'div', 'quote-webhook-actions');
  if (panel.confirmRotate) {
    actions.append(el(doc, 'span', 'quote-webhook-confirm', 'Gerar outro segredo invalida o atual.'));
    actions.append(button(doc, 'Confirmar novo segredo', 'button button-small button-pill', () => generateSecret(), panel.busy));
    actions.append(button(doc, 'Cancelar', 'text-link-btn', () => {
      panel.confirmRotate = false;
      render();
    }));
  } else {
    actions.append(button(
      doc,
      status?.hasSecret ? 'Gerar novo segredo' : 'Gerar segredo',
      status?.hasSecret ? 'button button-small button-secondary button-pill' : 'button button-small button-pill',
      () => {
        if (status?.hasSecret) {
          panel.confirmRotate = true;
          render();
        } else {
          generateSecret();
        }
      },
      locked || panel.busy
    ));
  }
  group.append(actions);
  root.append(group);
}

function renderDelivery(doc, root, status, locked) {
  const group = el(doc, 'div', 'quote-webhook-row');
  group.append(el(doc, 'span', 'quote-webhook-label', 'Entregas'));
  const list = el(doc, 'dl', 'quote-webhook-status');
  const pairs = [
    ['Último envio', describeLastDelivery(status?.lastDelivery)],
    ['Pré-orçamentos entregues', String(status?.totals?.delivered ?? 0)],
    ['Falhas', String(status?.totals?.failed ?? 0)]
  ];
  for (const [term, value] of pairs) {
    const row = el(doc, 'div', 'quote-webhook-status-row');
    row.append(el(doc, 'dt', '', term), el(doc, 'dd', '', value));
    list.append(row);
  }
  group.append(list);
  const ready = Boolean(status?.url && status?.hasSecret);
  const actions = el(doc, 'div', 'quote-webhook-actions');
  actions.append(button(doc, 'Enviar teste', 'button button-small button-pill', () => sendTest(), locked || !ready || panel.busy));
  if (!locked && !ready) {
    actions.append(el(doc, 'span', 'form-help', 'Salve o endereço e gere o segredo para testar.'));
  }
  group.append(actions);
  root.append(group);
}

/** Desenha o painel a partir do status (`presentQuoteWebhookStatus`). */
export function renderQuoteWebhookPanel(container, status, doc = globalThis.document) {
  if (!container || !doc) return;
  container.replaceChildren();
  const locked = !status?.available;

  const header = el(doc, 'div', 'quote-webhook-header');
  const heading = el(doc, 'div');
  heading.append(el(doc, 'span', 'card-eyebrow', 'Integração'));
  const title = el(doc, 'h3', 'quote-webhook-title', 'Pré-orçamento para CRM ou planilha');
  title.id = 'quote-webhook-title';
  heading.append(title);
  header.append(heading);
  if (status?.state) {
    header.append(el(doc, 'span', `quote-webhook-badge is-${status.state}`, STATE_LABELS[status.state] ?? status.state));
  }
  container.append(header);
  container.append(el(
    doc,
    'p',
    'form-help',
    'Antes de abrir o WhatsApp, a vitrine envia categoria, data e bairro para o seu CRM (Kommo, BotConversa) ou para uma planilha, com assinatura HMAC. Só envia quando a pessoa marca o consentimento; nada fica guardado na Vitrine além das contagens.'
  ));

  if (locked) {
    const box = el(doc, 'div', 'quote-webhook-locked');
    const planName = status?.requiredPlan?.name ?? 'Profissional';
    box.append(el(doc, 'strong', 'quote-webhook-locked-title', `Disponível no ${planName}`));
    box.append(el(doc, 'p', '', 'O seu plano atual não inclui o pré-orçamento com webhook. Os campos ficam bloqueados até a mudança de plano; nada do que já foi salvo é apagado.'));
    const link = el(doc, 'a', 'text-link', 'Ver planos');
    link.href = PLANS_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    box.append(link);
    container.append(box);
  }

  renderFieldsConfig(doc, container, locked);
  renderUrl(doc, container, status, locked);
  renderSecret(doc, container, status, locked);
  renderDelivery(doc, container, status, locked);

  const message = el(doc, 'p', `quote-webhook-message${panel.message ? ` is-${panel.message.tone}` : ''}`, panel.message?.text ?? '');
  message.id = 'quote-webhook-message';
  message.setAttribute('role', 'status');
  container.append(message);

  if (!locked && (status?.url || status?.hasSecret)) {
    container.append(button(doc, 'Remover integração', 'text-link-btn quote-webhook-remove', () => removeWebhook(), panel.busy));
  }
}

function render() {
  if (panel.container && panel.doc) renderQuoteWebhookPanel(panel.container, panel.status, panel.doc);
}

function setMessage(text, tone = 'info') {
  panel.message = text ? { text, tone } : null;
  render();
}

function endpoint(suffix = '') {
  return `/api/sites/${encodeURIComponent(panel.site.id)}/quote-webhook${suffix}`;
}

async function request(suffix, method, body) {
  const generation = panel.generation;
  panel.busy = true;
  render();
  try {
    const response = await panel.fetchImpl(endpoint(suffix), {
      method,
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const data = await response.json().catch(() => ({}));
    if (generation !== panel.generation) return null;
    if (data?.quoteWebhook) panel.status = data.quoteWebhook;
    if (!response.ok) throw new Error(data?.error?.message ?? 'Não foi possível concluir. Tente de novo.');
    return data;
  } finally {
    if (generation === panel.generation) panel.busy = false;
  }
}

async function saveUrl(value) {
  try {
    const data = await request('', 'PUT', { url: String(value ?? '').trim() });
    if (!data) return;
    panel.urlDraft = null;
    setMessage('Endereço salvo.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function generateSecret() {
  try {
    const data = await request('/secret', 'POST', {});
    if (!data) return;
    panel.secret = typeof data.secret === 'string' ? data.secret : null;
    panel.confirmRotate = false;
    setMessage('Segredo gerado. Copie agora: ele não aparece de novo.', 'success');
  } catch (error) {
    panel.confirmRotate = false;
    setMessage(error.message, 'error');
  }
}

async function sendTest() {
  try {
    const data = await request('/test', 'POST', {});
    if (!data) return;
    const delivery = data.delivery ?? {};
    setMessage(
      delivery.ok
        ? `Teste entregue (HTTP ${delivery.httpStatus}).`
        : `O teste não foi entregue${delivery.httpStatus ? ` (HTTP ${delivery.httpStatus})` : ''}. Confira o endereço e o destino.`,
      delivery.ok ? 'success' : 'error'
    );
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

async function removeWebhook() {
  try {
    const data = await request('', 'DELETE');
    if (!data) return;
    panel.secret = null;
    panel.urlDraft = null;
    setMessage('Integração removida.', 'success');
  } catch (error) {
    setMessage(error.message, 'error');
  }
}

/** Liga o painel à vitrine aberta no editor. Esconde para quem não é dono ou admin. */
export async function mountQuoteWebhookPanel({
  site, isOnline, getContent, onChange, fetchImpl = globalThis.fetch?.bind(globalThis), doc = globalThis.document
} = {}) {
  const container = doc?.getElementById('quote-webhook-panel');
  if (!container) return;
  if (panel.status && panel.container === container && site && panel.site === site) {
    panel.getContent = getContent ?? panel.getContent;
    panel.onChange = onChange ?? panel.onChange;
    render();
    return;
  }
  panel.generation += 1;
  Object.assign(panel, {
    site, status: null, secret: null, confirmRotate: false, busy: false, message: null, urlDraft: null,
    getContent: getContent ?? (() => null), onChange: onChange ?? (() => {}), fetchImpl, container, doc
  });
  const allowed = Boolean(isOnline && site && ['owner', 'admin'].includes(site.role));
  container.hidden = !allowed;
  if (!allowed) {
    container.replaceChildren();
    return;
  }
  const generation = panel.generation;
  container.replaceChildren(el(doc, 'p', 'loading-msg', 'Carregando integração de pré-orçamento…'));
  try {
    const response = await fetchImpl(endpoint());
    const data = await response.json().catch(() => ({}));
    if (generation !== panel.generation) return;
    if (!response.ok) throw new Error(data?.error?.message ?? 'Não foi possível carregar a integração.');
    panel.status = data.quoteWebhook;
    render();
  } catch (error) {
    if (generation !== panel.generation) return;
    container.replaceChildren(el(doc, 'p', 'form-error-msg', error.message));
  }
}
