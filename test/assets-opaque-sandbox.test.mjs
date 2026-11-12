import test from 'node:test';
import assert from 'node:assert/strict';
import { R2StorageProvider, SupabaseStorageProvider } from '../src/storage-adapter.mjs';
import { computeSha256Hex, renderStorefrontHtml } from '../src/publication-engine.mjs';
import { createApiHandler, createMemoryStore } from '../workers/api.mjs';

const origin = 'https://vitrine.inspira.dev.br';
const siteId = '20000000-0000-0000-0000-000000000001';
const widgetId = '40000000-0000-0000-0000-000000000001';

test('Adaptadores preservam MIME e cache imutável do WebP', async () => {
  const bytes = new Uint8Array([1, 2, 3]);
  const calls = [];
  const supabase = new SupabaseStorageProvider({
    baseUrl: 'https://storage.example.com', bucket: 'catalog-images', anonKey: 'anon', token: 'session',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new Response(null, { status: 200 });
    }
  });
  assert.equal(await supabase.put('site/image.webp', bytes),
    'https://storage.example.com/storage/v1/object/public/catalog-images/site/image.webp');
  assert.equal(calls[0].options.headers['Content-Type'], 'image/webp');
  assert.match(calls[0].options.headers['cache-control'], /immutable/);
  assert.equal(await supabase.delete('site/image.webp'), true);
  assert.equal(calls[1].options.method, 'DELETE');

  const r2 = new R2StorageProvider({
    publicBaseUrl: 'https://media.example.com/images/',
    binding: { put: async (...args) => calls.push(args) }
  });
  assert.equal(await r2.put('site/image.webp', bytes), 'https://media.example.com/images/site/image.webp');
  assert.deepEqual(calls[2][2].httpMetadata, {
    contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable'
  });
});

test('Upload rejeita arquivos acima de 200 KiB e conteúdo que não é WebP', async () => {
  const api = createApiHandler();
  const upload = body => api(new Request(`${origin}/api/sites/${siteId}/upload`, {
    method: 'POST', body,
    headers: { origin, authorization: 'Bearer token-owner', 'content-type': 'image/webp' }
  }));
  assert.equal((await upload(new Uint8Array(204801))).status, 413);
  assert.equal((await upload(new Uint8Array(12))).status, 422);
});

test('Componente aprovado é servido na origem isolada e confere o hash antes de executar', async () => {
  const bundle = '<!doctype html><script>document.body.textContent = "Widget";</script>';
  const hash = await computeSha256Hex(bundle);
  const store = createMemoryStore();
  store.readSandboxBundle = async () => bundle;
  const api = createApiHandler({ store });
  const path = `/embed/${widgetId}?v=${hash}`;
  const isolated = await api(new Request('https://sandbox.inspira.dev.br' + path));
  assert.equal(isolated.status, 200);
  assert.equal(await isolated.text(), bundle);
  const csp = isolated.headers.get('content-security-policy');
  assert.match(csp, /default-src 'none'/);
  assert.match(csp, /connect-src 'none'/);
  assert.match(csp, /sandbox allow-scripts/);
  assert.doesNotMatch(csp, /allow-same-origin/);
  assert.equal((await api(new Request(origin + path))).status, 404);
  assert.equal((await api(new Request('https://sandbox.inspira.dev.br' + path.replace(hash, 'a'.repeat(64))))).status, 404);
  assert.equal((await api(new Request('https://sandbox.inspira.dev.br/api/sites'))).status, 404);

  const html = renderStorefrontHtml({
    name: 'Vitrine', slug: 'demo', items: [], categories: [],
    structure: { pages: [{
      slug: 'home', title: 'Início', sections: [{
        id: 'widget', moduleCode: 'custom_sandbox', config: { widgetId, bundleHash: hash }
      }]
    }] }
  });
  assert.match(html, /sandbox="allow-scripts" referrerpolicy="no-referrer"/);
  assert.match(html, /src="https:\/\/sandbox\.inspira\.dev\.br\/embed\//);
  assert.doesNotMatch(html, /allow-same-origin/);
});
