// Capturas da Spec 011 (curtidas) com o Worker real e store em memória, sem Supabase.
// Uso: npm run build && PLAYWRIGHT_MODULE=/caminho/playwright-core CHROME_PATH=/usr/bin/google-chrome \
//   node scripts/capture-curtidas-screenshots.mjs [--serve] [--out <pasta>]
// Com --serve, apenas sobe o servidor em http://127.0.0.1:8788 (vitrine em /loja1, painel em /portal/#insights).
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiHandler } from '../workers/api.mjs';

const distRoot = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 8788);
const origin = `http://127.0.0.1:${port}`;
const args = process.argv.slice(2);
const serveOnly = args.includes('--serve');
const outIndex = args.indexOf('--out');
const outDir = resolve(
  outIndex >= 0 ? args[outIndex + 1] : '/cursor/stores/bc-eda3ac10-4053-4841-9e17-ee3927f2a123/media/curtidas'
);
const OWNER_TOKEN = 'token-owner';
const SITE_A = '20000000-0000-0000-0000-000000000001';

const mime = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.ttf': 'font/ttf'
};

async function readDistFile(pathname) {
  const target = resolve(distRoot, `.${decodeURIComponent(pathname)}`);
  if (!target.startsWith(distRoot.endsWith(sep) ? distRoot : distRoot + sep)) return null;
  try {
    if (!(await stat(target)).isFile()) return null;
    return { body: await readFile(target), type: mime[extname(target)] || 'application/octet-stream' };
  } catch {
    return null;
  }
}

const assets = {
  async fetch(request) {
    const { pathname } = new URL(request.url);
    const file = (await readDistFile(pathname)) ?? (await readDistFile(`${pathname.replace(/\/$/, '')}/index.html`));
    if (!file) return new Response('Not found', { status: 404 });
    return new Response(file.body, { headers: { 'content-type': file.type } });
  }
};

const api = createApiHandler({ assets });
const STATIC_PREFIXES = ['/assets/', '/vitrine/vitrine.', '/styles.css', '/theme.js', '/app.js', '/categories.js'];

async function handle(req, res) {
  const url = new URL(req.url, origin);
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === 'string') headers.set(key, value);
  }
  if (url.pathname.startsWith('/api/') && url.pathname !== '/api/likes' && !headers.has('authorization')) {
    headers.set('authorization', `Bearer ${OWNER_TOKEN}`);
  }

  let response;
  if (STATIC_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) {
    response = await assets.fetch(new Request(url));
  } else if (url.pathname === '/portal' || url.pathname.startsWith('/portal/')) {
    const file = await readDistFile(url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname);
    response = file
      ? new Response(file.body, { headers: { 'content-type': file.type } })
      : new Response('Not found', { status: 404 });
  } else {
    response = await api.fetch(
      new Request(url, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks)
      })
    );
  }

  const outHeaders = {};
  response.headers.forEach((value, key) => {
    outHeaders[key] = key === 'set-cookie' ? value.replace(/; Secure/i, '') : value;
  });
  res.writeHead(response.status, outHeaders);
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function callApi(path, init = {}) {
  const response = await api.fetch(
    new Request(`${origin}${path}`, {
      ...init,
      headers: { origin, 'content-type': 'application/json', 'user-agent': 'Mozilla/5.0', ...(init.headers ?? {}) }
    })
  );
  if (!response.ok) throw new Error(`${path} -> ${response.status} ${await response.text()}`);
  return response.json();
}

async function seedLikes(slug, itemId, total) {
  for (let i = 0; i < total; i += 1) {
    await callApi('/api/likes', { method: 'POST', body: JSON.stringify({ slug, itemId, liked: true }) });
  }
}

async function seed() {
  const auth = { authorization: `Bearer ${OWNER_TOKEN}` };
  await callApi('/api/profile', {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({
      displayName: 'Lino Teste',
      businessName: 'Pizza A',
      city: 'Porto Alegre',
      whatsapp: '5551999999999',
      interests: ['cardapio-digital']
    })
  });

  const draftRes = await callApi(`/api/sites/${SITE_A}/draft`, { headers: auth });
  const draft = draftRes.draft;
  const { items: _flatItems, ...baseContent } = draft.content;
  const content = {
    ...baseContent,
    businessName: 'Pizza A',
    categories: [
      {
        id: 'pizzas',
        name: 'Pizzas da Casa',
        items: [
          { id: 'margherita', name: 'Margherita', description: 'Tomate, muçarela e manjericão.', priceCents: 4800, active: true },
          { id: 'calabresa', name: 'Calabresa com Cebola Roxa', description: 'Calabresa artesanal.', priceCents: 5200, active: true },
          { id: 'quatro-queijos', name: 'Quatro Queijos', description: 'Muçarela, parmesão, gorgonzola e catupiry.', priceCents: 5600, active: true }
        ]
      },
      {
        id: 'bebidas',
        name: 'Bebidas',
        items: [{ id: 'soda-limao', name: 'Soda de Limão', description: 'Artesanal, 350 ml.', priceCents: 1400, active: true }]
      }
    ]
  };
  await callApi(`/api/sites/${SITE_A}/draft`, {
    method: 'PUT',
    headers: auth,
    body: JSON.stringify({ revision: draft.revision, content })
  });
  await callApi(`/api/sites/${SITE_A}/publish`, { method: 'POST', headers: auth });

  await seedLikes('pizza-a', 'margherita', 9);
  await seedLikes('pizza-a', 'quatro-queijos', 5);
  await seedLikes('pizza-a', 'soda-limao', 2);
  await callApi('/api/events', {
    method: 'POST',
    body: JSON.stringify({
      slug: 'pizza-a',
      events: [
        { type: 'visit', count: 24 },
        { type: 'item_select', itemId: 'margherita', count: 6 },
        { type: 'whatsapp_order', estimatedCents: 9600 }
      ]
    })
  });

  await seedLikes('loja1', 'margherita-verace', 12);
  await seedLikes('loja1', 'calabresa-artesanal', 4);
  await seedLikes('loja1', 'cogumelos-trufados', 7);
}

async function capture() {
  const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? 'playwright-core');
  const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || undefined });
  await mkdir(outDir, { recursive: true });
  const saved = [];
  for (const theme of ['light', 'dark']) {
    for (const width of [1280, 375]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 375 ? 812 : 900 },
        deviceScaleFactor: 1,
        colorScheme: theme,
        bypassCSP: true,
        userAgent:
          width === 375
            ? 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36'
            : 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36',
        isMobile: width === 375,
        hasTouch: width === 375
      });
      const page = await context.newPage();

      await page.goto(`${origin}/loja1`, { waitUntil: 'networkidle' });
      await page.waitForSelector('.sf-like-button:not([hidden])');
      const firstLike = page.locator('[data-like-item-id="margherita-verace"]');
      if ((await firstLike.getAttribute('aria-pressed')) !== 'true') await firstLike.click();
      await page.waitForFunction(() =>
        document.querySelector('[data-like-item-id="margherita-verace"]')?.getAttribute('aria-busy') === 'false'
      );
      await page.locator('.menu-category').first().scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollBy(0, -16));
      const storefrontPath = resolve(outDir, `vitrine-curtidas-${width}-${theme === 'light' ? 'claro' : 'escuro'}.png`);
      await page.screenshot({ path: storefrontPath });
      saved.push(storefrontPath);

      await page.goto(`${origin}/portal/#insights`, { waitUntil: 'networkidle' });
      await page.waitForSelector('#insights-section:not([hidden])');
      await page.waitForFunction(() => document.querySelectorAll('#insights-likes-list .insights-rank-row').length > 0);
      await page.locator('.insights-likes-card').scrollIntoViewIfNeeded();
      const card = page.locator('.insights-likes-card');
      const panelPath = resolve(outDir, `painel-curtidas-${width}-${theme === 'light' ? 'claro' : 'escuro'}.png`);
      await card.screenshot({ path: panelPath });
      saved.push(panelPath);
      await context.close();
    }
  }
  await browser.close();
  return saved;
}

const server = createServer((req, res) => {
  handle(req, res).catch((err) => {
    res.writeHead(500, { 'content-type': 'text/plain' });
    res.end(String(err?.stack ?? err));
  });
});
await new Promise((ready) => server.listen(port, '127.0.0.1', ready));
await seed();

if (serveOnly) {
  console.log(`Servidor de captura em ${origin} (vitrine: /loja1, painel: /portal/#insights)`);
} else {
  try {
    for (const file of await capture()) console.log(`Salvo: ${file}`);
  } finally {
    server.close();
  }
}
