import test from 'node:test';
import assert from 'node:assert/strict';
import {
  JWKS_CACHE_TTL_MS,
  SUPABASE_PUBLIC_PROJECT_URL,
  clearJwksCache,
  createApiHandler,
  resolveJwtSession,
  verifyJwtEs256,
  verifyJwtHs256
} from '../workers/api.mjs';

const TEST_USER_ID = '99999999-9999-4999-8999-999999999999';
const EXPECTED_ISSUER = `${SUPABASE_PUBLIC_PROJECT_URL}/auth/v1`;

function toBase64Url(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

async function generateEs256JwkPair(kid) {
  const pair = await crypto.subtle.generateKey(
    { name: 'ECDSA', namedCurve: 'P-256' },
    true,
    ['sign', 'verify']
  );
  const exported = await crypto.subtle.exportKey('jwk', pair.publicKey);
  return {
    kid,
    privateKey: pair.privateKey,
    publicKey: pair.publicKey,
    jwk: {
      kty: exported.kty,
      crv: exported.crv,
      x: exported.x,
      y: exported.y,
      kid,
      use: 'sig',
      alg: 'ES256'
    }
  };
}

async function signEs256Token(payload, privateKey, header = {}) {
  const encoder = new TextEncoder();
  const fullHeader = { alg: 'ES256', typ: 'JWT', ...header };
  const headerB64 = toBase64Url(encoder.encode(JSON.stringify(fullHeader)));
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    privateKey,
    encoder.encode(signingInput)
  );
  return `${signingInput}.${toBase64Url(new Uint8Array(sig))}`;
}

async function signHs256Token(payload, secret, header = {}) {
  const encoder = new TextEncoder();
  const fullHeader = { alg: 'HS256', typ: 'JWT', ...header };
  const headerB64 = toBase64Url(encoder.encode(JSON.stringify(fullHeader)));
  const payloadB64 = toBase64Url(encoder.encode(JSON.stringify(payload)));
  const signingInput = `${headerB64}.${payloadB64}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
  return `${signingInput}.${toBase64Url(new Uint8Array(sig))}`;
}

test('Verificação JWT ES256 via JWKS, Cache no Isolate e Compatibilidade HS256 Legada', async (t) => {
  const nowSec = Math.floor(Date.now() / 1000);
  const key1 = await generateEs256JwkPair('kid-es256-1');
  const key2 = await generateEs256JwkPair('kid-es256-2');
  const wrongKey = await generateEs256JwkPair('kid-es256-1');
  const jwks = { keys: [key1.jwk] };

  t.afterEach(() => {
    clearJwksCache();
  });

  await t.test('1. verifyJwtEs256 aceita token ES256 válido (aud string e array) e extrai sub', async () => {
    const validToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 600
      },
      key1.privateKey,
      { kid: key1.kid }
    );
    const verified = await verifyJwtEs256(validToken, jwks, nowSec);
    assert.equal(verified?.id, TEST_USER_ID);
    assert.equal(verified?.role, 'authenticated');

    const validArrayAudToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: ['authenticated', 'project-aud'],
        role: 'authenticated',
        exp: nowSec + 600
      },
      key1.privateKey,
      { kid: key1.kid }
    );
    const verifiedArrayAud = await verifyJwtEs256(validArrayAudToken, jwks, nowSec);
    assert.equal(verifiedArrayAud?.id, TEST_USER_ID);
  });

  await t.test('2. verifyJwtEs256 rejeita kid desconhecido, assinatura adulterada, expirado, iss/aud/role errados e alg:none', async () => {
    const unknownKidToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 600
      },
      key1.privateKey,
      { kid: 'kid-desconhecido' }
    );
    assert.equal(await verifyJwtEs256(unknownKidToken, jwks, nowSec), null);

    // Assinatura gerada por outra chave privada P-256 com o mesmo kid
    const wrongKeyToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 600
      },
      wrongKey.privateKey,
      { kid: key1.kid }
    );
    assert.equal(await verifyJwtEs256(wrongKeyToken, jwks, nowSec), null);

    // Adulteração de byte na assinatura JOSE de 64 bytes
    const validToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 600
      },
      key1.privateKey,
      { kid: key1.kid }
    );
    const [h, p, s] = validToken.split('.');
    const sigBytes = Buffer.from(s, 'base64url');
    sigBytes[0] ^= 0xff;
    const mutatedSigToken = `${h}.${p}.${toBase64Url(sigBytes)}`;
    assert.equal(await verifyJwtEs256(mutatedSigToken, jwks, nowSec), null);

    // Expirado
    const expiredToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec - 1
      },
      key1.privateKey,
      { kid: key1.kid }
    );
    assert.equal(await verifyJwtEs256(expiredToken, jwks, nowSec), null);

    // iss errado
    const wrongIssToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: 'https://malicious.supabase.co/auth/v1',
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 600
      },
      key1.privateKey,
      { kid: key1.kid }
    );
    assert.equal(await verifyJwtEs256(wrongIssToken, jwks, nowSec), null);

    // aud errado
    const wrongAudToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'anon',
        role: 'authenticated',
        exp: nowSec + 600
      },
      key1.privateKey,
      { kid: key1.kid }
    );
    assert.equal(await verifyJwtEs256(wrongAudToken, jwks, nowSec), null);

    // role errado
    const wrongRoleToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'anon',
        exp: nowSec + 600
      },
      key1.privateKey,
      { kid: key1.kid }
    );
    assert.equal(await verifyJwtEs256(wrongRoleToken, jwks, nowSec), null);

    // alg: none
    const algNoneToken = `${toBase64Url(
      Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT', kid: key1.kid }))
    )}.${toBase64Url(
      Buffer.from(
        JSON.stringify({
          sub: TEST_USER_ID,
          iss: EXPECTED_ISSUER,
          aud: 'authenticated',
          role: 'authenticated',
          exp: nowSec + 600
        })
      )
    )}.`;
    assert.equal(await verifyJwtEs256(algNoneToken, jwks, nowSec), null);
  });

  await t.test('3. Cache da JWKS em memória do isolate (TTL 10 min) e refetch único em kid desconhecido', async () => {
    assert.equal(JWKS_CACHE_TTL_MS, 10 * 60 * 1000);

    let jwksCalls = 0;
    let currentRemoteJwks = { keys: [key1.jwk] };
    let clockSeconds = nowSec;

    const customFetch = async (input) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url === `${SUPABASE_PUBLIC_PROJECT_URL}/auth/v1/.well-known/jwks.json`) {
        jwksCalls += 1;
        return new Response(JSON.stringify(currentRemoteJwks), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      return new Response('Not found', { status: 404 });
    };

    const api = createApiHandler({
      fetch: customFetch,
      nowSeconds: () => clockSeconds
    });
    const env = {
      SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL
    };

    const tokenKey1 = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 3600
      },
      key1.privateKey,
      { kid: key1.kid }
    );

    // 1ª requisição busca JWKS remota
    const res1 = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Authorization: `Bearer ${tokenKey1}` }
      }),
      env
    );
    assert.equal(res1.status, 200);
    assert.equal(jwksCalls, 1);

    // 2ª requisição dentro do TTL reutiliza cache do isolate
    clockSeconds += 120;
    const res2 = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Authorization: `Bearer ${tokenKey1}` }
      }),
      env
    );
    assert.equal(res2.status, 200);
    assert.equal(jwksCalls, 1);

    // Token com kid desconhecido que não existe na JWKS remota: faz exatamente 1 refetch e retorna 401
    const unknownToken = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 3600
      },
      key2.privateKey,
      { kid: 'kid-inexistente' }
    );
    const resUnknown = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Authorization: `Bearer ${unknownToken}` }
      }),
      env
    );
    assert.equal(resUnknown.status, 401);
    assert.equal(jwksCalls, 2);

    // Rotação de chave: JWKS remota passa a incluir key2; ao receber tokenKey2, faz 1 refetch e autentica
    currentRemoteJwks = { keys: [key1.jwk, key2.jwk] };
    const tokenKey2 = await signEs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 3600
      },
      key2.privateKey,
      { kid: key2.kid }
    );
    const resRotated = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Authorization: `Bearer ${tokenKey2}` }
      }),
      env
    );
    assert.equal(resRotated.status, 200);
    assert.equal((await resRotated.json()).user.id, TEST_USER_ID);
    assert.equal(jwksCalls, 3);

    // Após expirar o TTL de 10 minutos, nova chamada renova o cache
    clockSeconds += 601;
    const resAfterTtl = await api.fetch(
      new Request('https://painel.inspira.dev.br/api/auth/session', {
        headers: { Authorization: `Bearer ${tokenKey2}` }
      }),
      env
    );
    assert.equal(resAfterTtl.status, 200);
    assert.equal(jwksCalls, 4);
  });

  await t.test('4. Caminho HS256 legado funciona apenas quando SUPABASE_JWT_SECRET está presente', async () => {
    const legacySecret = 'legacy-hs256-secret-for-vitrine-tests';
    const hs256Token = await signHs256Token(
      {
        sub: TEST_USER_ID,
        iss: EXPECTED_ISSUER,
        aud: 'authenticated',
        role: 'authenticated',
        exp: nowSec + 600
      },
      legacySecret
    );

    assert.equal((await verifyJwtHs256(hs256Token, legacySecret, nowSec))?.id, TEST_USER_ID);
    assert.equal(
      await resolveJwtSession(hs256Token, { SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL }, { nowSeconds: nowSec }),
      null
    );
    assert.equal(
      (
        await resolveJwtSession(
          hs256Token,
          {
            SUPABASE_URL: SUPABASE_PUBLIC_PROJECT_URL,
            SUPABASE_JWT_SECRET: legacySecret
          },
          { nowSeconds: nowSec }
        )
      )?.id,
      TEST_USER_ID
    );
  });
});
