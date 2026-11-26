// Criptografia da AutoResposta: token cifrado (AES-GCM com HKDF da AUTO_REPLY_ENCRYPTION_KEY),
// hash do consumidor por conexão (HMAC) e comparação em tempo constante.
export const AUTO_REPLY_KEY_ENV = 'AUTO_REPLY_ENCRYPTION_KEY';
export const MIN_KEY_LENGTH = 32;

const utf8 = new TextEncoder();

export function toHex(bytes) {
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function toBase64Url(bytes) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(text) {
  const clean = String(text ?? '');
  if (!/^[A-Za-z0-9_-]*$/.test(clean)) throw new Error('base64url inválido');
  const padded = clean.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (clean.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (char) => char.charCodeAt(0));
}

export function hasAutoReplyKey(env = {}) {
  return typeof env[AUTO_REPLY_KEY_ENV] === 'string' && env[AUTO_REPLY_KEY_ENV].length >= MIN_KEY_LENGTH;
}

async function deriveKey(envKey, info, algorithm, usages) {
  if (typeof envKey !== 'string' || envKey.length < MIN_KEY_LENGTH) throw new Error('AUTO_REPLY_KEY_MISSING');
  const material = await crypto.subtle.importKey('raw', utf8.encode(envKey), 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: utf8.encode('vitrine-auto-reply'), info: utf8.encode(info) },
    material,
    algorithm,
    false,
    usages
  );
}

function tokenAad(siteId, provider, accountId) {
  return utf8.encode(`${siteId}:${provider}:${accountId}`);
}

/** `v1.<iv>.<cifra>`; vitrine, canal e conta entram como dado associado. */
export async function encryptChannelToken(token, { siteId, provider, accountId }, envKey) {
  const key = await deriveKey(envKey, 'token-v1', { name: 'AES-GCM', length: 256 }, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: tokenAad(siteId, provider, accountId) }, key, utf8.encode(token)
  );
  return `v1.${toBase64Url(iv)}.${toBase64Url(cipher)}`;
}

export async function decryptChannelToken(ciphertext, { siteId, provider, accountId }, envKey) {
  const match = /^v1\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)$/.exec(String(ciphertext ?? ''));
  if (!match) throw new Error('AUTO_REPLY_TOKEN_UNREADABLE');
  const key = await deriveKey(envKey, 'token-v1', { name: 'AES-GCM', length: 256 }, ['decrypt']);
  try {
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: fromBase64Url(match[1]), additionalData: tokenAad(siteId, provider, accountId) },
      key,
      fromBase64Url(match[2])
    );
    return new TextDecoder().decode(plain);
  } catch {
    throw new Error('AUTO_REPLY_TOKEN_UNREADABLE');
  }
}

/** Pseudônimo do consumidor: HMAC da conexão + id do provedor. Não serve em outra conexão. */
export async function recipientHash(connectionId, providerUserId, envKey) {
  const key = await deriveKey(envKey, 'recipient-v1', { name: 'HMAC', hash: 'SHA-256', length: 256 }, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, utf8.encode(`${connectionId}:${providerUserId}`)));
}

export async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', utf8.encode(String(text))));
}

export function randomToken(bytes = 32) {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** HMAC-SHA256 em tempo constante (crypto.subtle.verify). */
export async function verifyHmacSha256(secret, data, expectedBytes) {
  if (typeof secret !== 'string' || !secret) return false;
  const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
  const payload = typeof data === 'string' ? utf8.encode(data) : data;
  return crypto.subtle.verify('HMAC', key, expectedBytes, payload);
}

export async function hmacSha256Hex(secret, data) {
  const key = await crypto.subtle.importKey('raw', utf8.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const payload = typeof data === 'string' ? utf8.encode(data) : data;
  return toHex(await crypto.subtle.sign('HMAC', key, payload));
}

/** Igualdade de textos sem vazar a posição da diferença. */
export function constantTimeEqual(a, b) {
  const left = utf8.encode(String(a ?? ''));
  const right = utf8.encode(String(b ?? ''));
  let diff = left.length ^ right.length;
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) diff |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return diff === 0;
}
