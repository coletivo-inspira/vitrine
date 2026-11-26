// Mensagem da AutoResposta (specs/019-autoresposta, FR-006). Usado pelo Worker no envio e
// pelo painel na prévia e no contador. Só duas variáveis, sem motor de templates.
export const AUTO_REPLY_MAX_BYTES = 1000;
export const AUTO_REPLY_DEFAULT_MESSAGE =
  'Olá! Obrigado pelo contato. Para conhecer nossos produtos, serviços e informações, acesse nossa vitrine:\n\n{{vitrine.url}}';
export const AUTO_REPLY_VARIABLES = Object.freeze(['{{vitrine.nome}}', '{{vitrine.url}}']);
export const AUTO_REPLY_FREQUENCIES = Object.freeze(['once', 'daily', 'weekly']);
export const AUTO_REPLY_DEFAULT_FREQUENCY = 'daily';
export const AUTO_REPLY_FREQUENCY_LABELS = Object.freeze({
  once: 'Uma vez por contato',
  daily: 'No máximo uma vez a cada 24 horas',
  weekly: 'No máximo uma vez a cada 7 dias'
});

const CONTROL_CHARS = /[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const UNKNOWN_VARIABLE = /\{\{\s*(?!vitrine\.(?:nome|url)\s*\}\})[^{}]*\}\}/;
const utf8 = new TextEncoder();

export function utf8Bytes(text) {
  return utf8.encode(String(text ?? '')).byteLength;
}

function normalizeNewlines(text) {
  return String(text ?? '').replace(/\r\n?/g, '\n');
}

/**
 * Texto final enviado ao consumidor. `{{vitrine.url}}` e `{{vitrine.nome}}` são trocados;
 * sem a variável e sem o próprio endereço no texto, o endereço vai ao fim uma vez.
 */
export function renderAutoReplyMessage(template, { name = '', url = '' } = {}) {
  const source = normalizeNewlines(template).trim();
  const hasUrlVariable = /\{\{\s*vitrine\.url\s*\}\}/.test(source);
  let text = source
    .replace(/\{\{\s*vitrine\.nome\s*\}\}/g, String(name ?? '').trim())
    .replace(/\{\{\s*vitrine\.url\s*\}\}/g, url);
  let appendedUrl = false;
  if (url && !hasUrlVariable && !text.includes(url)) {
    text = `${text}${text ? '\n\n' : ''}${url}`;
    appendedUrl = true;
  }
  text = text.trim();
  return { text, bytes: utf8Bytes(text), appendedUrl };
}

/** Erros do campo de mensagem, em português; lista vazia quando está tudo certo. */
export function validateAutoReplyTemplate(template, { name = '', url = '' } = {}) {
  const source = normalizeNewlines(template);
  const errors = [];
  if (!source.trim()) errors.push({ field: 'message', code: 'AUTO_REPLY_MESSAGE_EMPTY', message: 'Escreva a mensagem.' });
  if (CONTROL_CHARS.test(source)) {
    errors.push({ field: 'message', code: 'AUTO_REPLY_MESSAGE_INVALID', message: 'A mensagem tem caracteres que não podem ser enviados.' });
  }
  if (UNKNOWN_VARIABLE.test(source)) {
    errors.push({
      field: 'message', code: 'AUTO_REPLY_MESSAGE_VARIABLE',
      message: 'Use só {{vitrine.nome}} e {{vitrine.url}}.'
    });
  }
  if (utf8Bytes(source) > AUTO_REPLY_MAX_BYTES) {
    errors.push({ field: 'message', code: 'AUTO_REPLY_MESSAGE_TOO_LONG', message: 'A mensagem passou do limite do Instagram.' });
  } else if (source.trim() && renderAutoReplyMessage(source, { name, url }).bytes > AUTO_REPLY_MAX_BYTES) {
    errors.push({
      field: 'message', code: 'AUTO_REPLY_MESSAGE_TOO_LONG',
      message: 'Com o endereço da vitrine, a mensagem passa do limite do Instagram. Encurte o texto.'
    });
  }
  return errors;
}

/** Contador do painel: bytes restantes com o endereço já incluído. */
export function autoReplyCounter(template, context = {}) {
  const { bytes } = renderAutoReplyMessage(template, context);
  return { used: bytes, remaining: AUTO_REPLY_MAX_BYTES - bytes, max: AUTO_REPLY_MAX_BYTES };
}

export function normalizeAutoReplyFrequency(value) {
  return AUTO_REPLY_FREQUENCIES.includes(value) ? value : null;
}
