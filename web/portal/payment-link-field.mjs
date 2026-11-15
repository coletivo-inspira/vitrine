/**
 * Painel: campo "Link de pagamento" do item (#134), dentro do cartão do item no editor.
 * Confere o endereço com a mesma lista de domínios do servidor
 * (`content/payment-link-domains.json`, copiada para `/assets/` no build) e mostra no
 * campo o erro devolvido pelo servidor. Renderizar não altera o item.
 */
import {
  PAYMENT_LINK_DEFAULT_LABEL,
  PAYMENT_LINK_HIDDEN_PRICE_MODES,
  PAYMENT_LINK_LABEL_MAX,
  checkPaymentLinkUrl,
  normalizePaymentLinkLabel
} from '../assets/payment-link.mjs';

export const PAYMENT_LINK_DOMAINS_URL = '/assets/payment-link-domains.json';

let domainsPromise = null;
let domains = null;
const serverErrors = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

/** Lista `{ host, provider }` carregada uma vez; `null` se não der para carregar (o servidor confere). */
export function loadPaymentLinkDomains(fetchImpl = globalThis.fetch) {
  if (!domainsPromise) {
    domainsPromise = Promise.resolve()
      .then(() => fetchImpl(PAYMENT_LINK_DOMAINS_URL, { headers: { accept: 'application/json' } }))
      .then((response) => (response?.ok ? response.json() : null))
      .then((data) => {
        const list = Array.isArray(data?.domains) ? data.domains.filter((entry) => typeof entry?.host === 'string') : null;
        domains = list && list.length ? list : null;
        return domains;
      })
      .catch(() => null);
  }
  return domainsPromise;
}

/** Mensagem para o campo do endereço; sem a lista carregada, só as regras de formato. */
export function describePaymentLinkProblem(value, list = domains) {
  if (!String(value ?? '').trim()) return '';
  const hosts = list ? list.map((entry) => entry.host) : null;
  const { error } = checkPaymentLinkUrl(value, hosts ?? []);
  if (!error) return '';
  if (!hosts && error.code === 'PAYMENT_LINK_DOMAIN_NOT_ALLOWED') return '';
  return error.message;
}

function setProblem(input, problem, message) {
  problem.textContent = message;
  input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

/**
 * Guarda os erros do link de pagamento devolvidos pelo servidor e os mostra nos campos
 * já desenhados. Devolve o `itemId` do primeiro erro (ou `''` quando o erro é de outro campo).
 */
export function showPaymentLinkServerErrors(error, { focus = true } = {}) {
  const fieldErrors = Array.isArray(error?.fieldErrors) ? error.fieldErrors : [];
  const mine = fieldErrors.filter((entry) => /^paymentLink\.(url|label)$/.test(entry?.field ?? '') && entry.itemId);
  if (!mine.length) return '';
  for (const entry of mine) {
    serverErrors.set(entry.itemId, { field: entry.field, message: entry.message });
    const input = document.getElementById(`item-payment-${entry.field === 'paymentLink.label' ? 'label' : 'url'}-${entry.itemId}`);
    const problem = input ? document.getElementById(input.dataset.problemId) : null;
    if (input && problem) {
      setProblem(input, problem, entry.message);
      if (focus && entry === mine[0]) input.focus();
    }
  }
  return mine[0].itemId;
}

function textField(id, labelText, input, helpText) {
  const group = el('div', 'item-payment-link-field');
  const label = el('label', '', labelText);
  label.setAttribute('for', id);
  input.id = id;
  const problem = el('span', 'form-error-msg item-payment-link-problem');
  problem.id = `${id}-problem`;
  problem.setAttribute('role', 'status');
  input.dataset.problemId = problem.id;
  const described = [problem.id];
  group.append(label, input);
  if (helpText) {
    const help = el('span', 'form-help', helpText);
    help.id = `${id}-help`;
    described.unshift(help.id);
    group.appendChild(help);
  }
  group.appendChild(problem);
  input.setAttribute('aria-describedby', described.join(' '));
  return { group, problem };
}

function renderDomainList(box) {
  box.replaceChildren();
  const summary = el('summary', 'item-payment-link-domains-summary', 'Sites de pagamento aceitos');
  box.appendChild(summary);
  if (domains) {
    const list = el('ul', 'item-payment-link-domains-list');
    for (const entry of domains) {
      const li = el('li');
      li.append(el('span', 'item-payment-link-host', entry.host));
      if (entry.provider) li.append(document.createTextNode(` · ${entry.provider}`));
      list.appendChild(li);
    }
    box.appendChild(list);
  }
  box.appendChild(el('p', 'form-help', 'O seu provedor não está na lista? Fale com a equipe Vitrine Inspira para pedir a inclusão.'));
}

/**
 * Acrescenta o grupo "Link de pagamento" ao grid de campos do cartão.
 * `deps`: `onChange` (salva e atualiza a prévia), `priceMode` e `soon` do item.
 */
export function renderPaymentLinkField(item, fields, { onChange, priceMode = 'fixed', soon = false } = {}) {
  const id = String(item.id);
  const box = el('fieldset', 'form-group item-fields-full item-payment-link');
  box.appendChild(el('legend', 'item-payment-link-legend', 'Link de pagamento (opcional)'));
  box.appendChild(el(
    'p',
    'form-help item-payment-link-intro',
    'Se você cobra por um link do seu Mercado Pago, Asaas ou outro site de pagamento, cole aqui. Ele aparece na página do item e na revisão do pedido; o WhatsApp continua sendo o envio principal.'
  ));

  const url = el('input', 'item-input input-styled-height');
  url.type = 'url';
  url.inputMode = 'url';
  url.autocomplete = 'off';
  url.spellcheck = false;
  url.maxLength = 2048;
  url.placeholder = 'https://mpago.la/...';
  url.value = item.paymentLink?.url ?? '';
  const urlField = textField(`item-payment-url-${id}`, 'Endereço do link (https://)', url);

  const label = el('input', 'item-input input-styled-height');
  label.type = 'text';
  label.maxLength = PAYMENT_LINK_LABEL_MAX;
  label.placeholder = PAYMENT_LINK_DEFAULT_LABEL;
  label.value = item.paymentLink?.label ?? '';
  const labelField = textField(
    `item-payment-label-${id}`,
    `Texto do botão (opcional, até ${PAYMENT_LINK_LABEL_MAX} caracteres)`,
    label
  );

  const showUrlProblem = () => {
    const server = serverErrors.get(id);
    const local = describePaymentLinkProblem(url.value);
    setProblem(url, urlField.problem, local || (server?.field === 'paymentLink.url' ? server.message : ''));
    setProblem(label, labelField.problem, server?.field === 'paymentLink.label' ? server.message : '');
  };

  const sync = () => {
    serverErrors.delete(id);
    const value = url.value.trim();
    if (!value) {
      delete item.paymentLink;
    } else {
      item.paymentLink = { url: value };
      if (normalizePaymentLinkLabel(label.value)) item.paymentLink.label = label.value;
    }
    showUrlProblem();
    onChange?.();
  };
  url.addEventListener('input', sync);
  label.addEventListener('input', () => {
    if (url.value.trim()) sync();
  });

  box.append(urlField.group, labelField.group);

  if (soon || PAYMENT_LINK_HIDDEN_PRICE_MODES.includes(priceMode)) {
    box.appendChild(el(
      'p',
      'item-payment-link-mode-note',
      soon
        ? 'Itens "Em breve" não mostram o link de pagamento; ele aparece quando o item ficar disponível.'
        : 'Itens de lance e de troca não mostram o link de pagamento na vitrine.'
    ));
  }

  const list = el('details', 'item-payment-link-domains');
  renderDomainList(list);
  box.appendChild(list);

  showUrlProblem();
  loadPaymentLinkDomains().then(() => {
    if (!box.isConnected) return;
    renderDomainList(list);
    showUrlProblem();
  });

  fields.appendChild(box);
  return box;
}
