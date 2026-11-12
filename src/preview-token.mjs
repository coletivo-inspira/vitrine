const encoder = new TextEncoder();
const TOKEN_LIFETIME_SECONDS = 30 * 60;

function encode(bytes) {
  return btoa(String.fromCharCode(...bytes)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function decode(value) {
  return Uint8Array.from(atob(value.replaceAll('-', '+').replaceAll('_', '/')), char => char.charCodeAt(0));
}

function importKey(secret) {
  return crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signPreviewToken(secret, siteId, userId, revision, now = Date.now()) {
  const expires = Math.floor(now / 1000) + TOKEN_LIFETIME_SECONDS;
  const payload = encode(encoder.encode(JSON.stringify([siteId, userId, revision, expires])));
  const signature = await crypto.subtle.sign('HMAC', await importKey(secret), encoder.encode(payload));
  return `${payload}.${encode(new Uint8Array(signature))}`;
}

export async function verifyPreviewToken(secret, token, siteId, userId, now = Date.now()) {
  if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{1,512}\.[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const [payload, signature] = token.split('.');
  try {
    const valid = await crypto.subtle.verify('HMAC', await importKey(secret), decode(signature), encoder.encode(payload));
    if (!valid) return null;
    const [signedSite, signedUser, revision, expires] = JSON.parse(new TextDecoder().decode(decode(payload)));
    if (signedSite !== siteId || signedUser !== userId || !Number.isSafeInteger(revision) ||
        revision < 1 || !Number.isSafeInteger(expires) || expires <= Math.floor(now / 1000)) return null;
    return revision;
  } catch {
    return null;
  }
}
