// Ajuda do kit Comment-to-Vitrine (issue #122). Só monta o endereço da vitrine com a
// origem `ig_comment`; a Vitrine não fala com o Instagram, o Manychat ou o BotConversa.
import { MAX_SOURCE_TOKEN_LENGTH, normalizeMetricCampaign } from '../assets/metrics-source.mjs';

export const COMMENT_SOURCE = 'ig_comment';
export const DEFAULT_COMMENT_CAMPAIGN = 'reel_01';
export const COMMENT_VARIABLE_NAME = 'URL_VITRINE_INSPIRA';
export const COMMENT_TO_VITRINE_GUIDE_URL =
  'https://github.com/coletivo-inspira/vitrine/blob/main/docs/aquisicao/comment-to-vitrine.md';
const PLATFORM_ORIGIN = 'https://vitrine.inspira.dev.br';

const COPIED_MESSAGES = Object.freeze({
  link: 'Link do Direct copiado.',
  variable: `Valor de ${COMMENT_VARIABLE_NAME} copiado.`
});

/**
 * Converte o que a pessoa digitou ("Reel de Natal!") em um nome aceito pelos Insights
 * ("reel_de_natal"). Devolve `{ value, error }`; com erro, `value` é ''.
 */
export function normalizeCommentCampaign(raw) {
  const value = String(raw ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_-]+/, '')
    .slice(0, MAX_SOURCE_TOKEN_LENGTH)
    .replace(/[_-]+$/, '');
  if (!value) {
    return { value: '', error: 'Escreva um nome curto para o post, por exemplo reel_01.' };
  }
  if (normalizeMetricCampaign(value, COMMENT_SOURCE) !== value) {
    return {
      value: '',
      error: 'Evite seis números seguidos: parecem telefone, CPF ou CEP e os Insights descartariam o nome.'
    };
  }
  return { value, error: '' };
}

export function buildVitrineBaseUrl(slug, origin = PLATFORM_ORIGIN) {
  return new URL(`/${encodeURIComponent(String(slug ?? '').trim())}`, origin).toString();
}

export function buildCommentToVitrineUrl(slug, campaign, origin = PLATFORM_ORIGIN) {
  const url = new URL(buildVitrineBaseUrl(slug, origin));
  url.searchParams.set('utm_source', COMMENT_SOURCE);
  const { value } = normalizeCommentCampaign(campaign);
  if (value) url.searchParams.set('utm_campaign', value);
  return url.toString();
}

const doc = () => globalThis.document;
const byId = (id) => doc()?.getElementById(id) ?? null;

const panel = {
  getSlug: () => '',
  built: false,
  campaign: DEFAULT_COMMENT_CAMPAIGN,
  statusTimer: null
};

function el(tag, attrs = {}, children = []) {
  const node = doc().createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'className') node.className = value;
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of [].concat(children)) {
    if (child) node.append(child);
  }
  return node;
}

function copyRow({ id, label, help, kind }) {
  const helpId = `${id}-help`;
  return el('div', { className: 'comment-kit-row' }, [
    el('label', { for: id, text: label }),
    el('div', { className: 'comment-kit-copy' }, [
      el('input', {
        type: 'text',
        id,
        readonly: true,
        className: 'item-input input-styled-height comment-kit-value',
        'aria-describedby': helpId,
        spellcheck: 'false'
      }),
      el('button', {
        type: 'button',
        className: 'button button-small button-pill comment-kit-copy-button',
        'data-copy': kind,
        'aria-label': `Copiar ${label.toLowerCase()}`,
        text: 'Copiar'
      })
    ]),
    el('span', { id: helpId, className: 'form-help', text: help })
  ]);
}

function build(root) {
  const fieldset = el('fieldset', {
    className: 'form-group locality-fieldset comment-kit',
    id: 'editor-comment-kit-group'
  }, [
    el('legend', { className: 'locality-legend', text: 'Comentário no Instagram: link para o Direct' }),
    el('p', {
      className: 'form-help',
      text: 'Quando alguém comenta uma palavra no seu post, o Manychat ou o BotConversa manda uma mensagem no Direct com o link da sua vitrine. A Vitrine não se conecta ao Instagram: você monta o fluxo na ferramenta e cola o link abaixo. As visitas ficam registradas com a origem "Comentário no Instagram"; o quadro Visitas por origem, em Insights, faz parte dos planos Profissional e Equipe.'
    }),
    el('div', { className: 'comment-kit-row' }, [
      el('label', { for: 'editor-comment-campaign', text: 'Nome do post (campanha)' }),
      el('input', {
        type: 'text',
        id: 'editor-comment-campaign',
        maxlength: 60,
        autocomplete: 'off',
        spellcheck: 'false',
        className: 'item-input input-styled-height',
        'aria-describedby': 'editor-comment-campaign-help editor-comment-campaign-error'
      }),
      el('span', {
        id: 'editor-comment-campaign-help',
        className: 'form-help',
        text: `Um nome por post, para comparar nos Insights. Letras sem acento, números, _ ou -, até ${MAX_SOURCE_TOKEN_LENGTH}. Ex.: reel_01, promo_dia_maes.`
      }),
      el('span', { id: 'editor-comment-campaign-error', className: 'form-error-msg', hidden: true })
    ]),
    copyRow({
      id: 'editor-comment-link',
      label: 'Link para a mensagem do Direct',
      help: 'Cole na mensagem do Direct. Abre a vitrine com a origem "Comentário no Instagram" e o nome do post.',
      kind: 'link'
    }),
    copyRow({
      id: 'editor-comment-variable',
      label: `Valor da variável ${COMMENT_VARIABLE_NAME}`,
      help: 'Para criar a variável global na ferramenta, como explica o guia. Fica igual para todos os posts.',
      kind: 'variable'
    }),
    el('p', { id: 'editor-comment-status', className: 'comment-kit-status', role: 'status', 'aria-live': 'polite' }),
    el('ul', { className: 'comment-kit-notes' }, [
      el('li', { text: 'Publique a vitrine antes e confira o cartão de prévia em "Google e WhatsApp", acima.' }),
      el('li', { text: 'Os planos gratuitos das ferramentas têm limites, e a Meta cobra mensagens do WhatsApp fora da janela de 24 horas. O guia explica.' })
    ]),
    el('p', { className: 'comment-kit-guide' }, [
      el('a', {
        className: 'comment-kit-guide-link',
        href: COMMENT_TO_VITRINE_GUIDE_URL,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: 'Abrir o guia passo a passo (Manychat e BotConversa)'
      }),
      el('span', { className: 'form-help', text: ' Abre em outra aba, no GitHub do projeto.' })
    ])
  ]);
  root.replaceChildren(fieldset);
}

function announce(message) {
  const status = byId('editor-comment-status');
  if (!status) return;
  clearTimeout(panel.statusTimer);
  status.textContent = '';
  // Esvaziar antes garante que leitores de tela anunciem a mesma frase de novo.
  panel.statusTimer = setTimeout(() => {
    status.textContent = message;
  }, 50);
}

function render() {
  const slug = panel.getSlug() || 'vitrine';
  const campaignInput = byId('editor-comment-campaign');
  const errorNode = byId('editor-comment-campaign-error');
  const { value, error } = normalizeCommentCampaign(panel.campaign);
  if (campaignInput && campaignInput.value !== panel.campaign) campaignInput.value = panel.campaign;
  if (campaignInput) campaignInput.setAttribute('aria-invalid', error ? 'true' : 'false');
  if (errorNode) {
    errorNode.textContent = error;
    errorNode.hidden = !error;
  }
  const link = byId('editor-comment-link');
  if (link) link.value = buildCommentToVitrineUrl(slug, value || DEFAULT_COMMENT_CAMPAIGN);
  const variable = byId('editor-comment-variable');
  if (variable) variable.value = buildVitrineBaseUrl(slug);
}

async function copyValue(kind) {
  const input = byId(kind === 'variable' ? 'editor-comment-variable' : 'editor-comment-link');
  if (!input) return;
  if (kind === 'link' && normalizeCommentCampaign(panel.campaign).error) {
    announce('Corrija o nome do post antes de copiar.');
    byId('editor-comment-campaign')?.focus();
    return;
  }
  try {
    await globalThis.navigator.clipboard.writeText(input.value);
    announce(COPIED_MESSAGES[kind]);
  } catch {
    input.focus();
    input.select();
    announce('Não deu para copiar automaticamente. O endereço ficou selecionado: copie com Ctrl+C ou tocando e segurando.');
  }
}

function bind(root) {
  root.addEventListener('input', (event) => {
    if (event.target?.id !== 'editor-comment-campaign') return;
    panel.campaign = event.target.value;
    render();
  });
  root.addEventListener('blur', (event) => {
    if (event.target?.id !== 'editor-comment-campaign') return;
    const { value } = normalizeCommentCampaign(panel.campaign);
    if (value && value !== panel.campaign) {
      panel.campaign = value;
      render();
    }
  }, true);
  root.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-copy]');
    if (button) copyValue(button.getAttribute('data-copy'));
  });
}

/** Monta (uma vez) e atualiza a ajuda para o endereço da vitrine aberta no editor. */
export function mountCommentToVitrinePanel({ getSlug } = {}) {
  const root = byId('editor-comment-kit');
  if (!root) return;
  panel.getSlug = getSlug ?? panel.getSlug;
  if (!panel.built) {
    build(root);
    bind(root);
    panel.built = true;
  }
  panel.campaign = DEFAULT_COMMENT_CAMPAIGN;
  const status = byId('editor-comment-status');
  if (status) status.textContent = '';
  render();
}
