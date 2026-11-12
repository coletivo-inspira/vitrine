import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.txt': 'text/plain; charset=utf-8' };
const PUBLIC_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const PORTAL_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self'; font-src 'self'; connect-src 'self' https://qawlpsrfewosxsfgmmpm.supabase.co; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'";
const security = {
  'Content-Security-Policy': PUBLIC_CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'X-Frame-Options': 'DENY',
  'Cache-Control': 'no-store',
};
const RESERVED_PATHS = new Set(['admin', 'api', 'auth', 'app', 'www', 'portal', 'assets', 'data', 'login', 'logout', 'vitrine']);

function securityHeadersForPath(pathname) {
  const isPortal = pathname === '/portal' || pathname.startsWith('/portal/');
  return {
    ...security,
    'Content-Security-Policy': isPortal ? PORTAL_CSP : PUBLIC_CSP,
  };
}

async function isFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

createServer(async (req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405, { ...security, Allow: 'GET, HEAD' }); res.end(); return; }
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const pathname = decodeURIComponent(url.pathname);
    if (pathname.includes('\\') || pathname.includes('\0')) throw new Error('Invalid path');
    let resolvedPath = pathname;
    let cacheControl = security['Cache-Control'];

    if (resolvedPath === '/') {
      resolvedPath = '/index.html';
    } else if (resolvedPath === '/portal' || resolvedPath === '/portal/') {
      resolvedPath = '/portal/index.html';
    } else if (resolvedPath === '/vitrine' || resolvedPath === '/vitrine/') {
      resolvedPath = '/vitrine/index.html';
    } else if (/^\/data\/vitrines\/[a-z0-9-]+\/releases\/[a-f0-9]{64}\.json$/.test(resolvedPath)) {
      cacheControl = 'public, max-age=31536000, immutable';
    } else if (/^\/data\/vitrines\/[a-z0-9-]+\/menu\.json$/.test(resolvedPath)) {
      cacheControl = 'public, max-age=300, stale-while-revalidate=86400';
    } else {
      const slugMatch = resolvedPath.match(/^\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/);
      if (slugMatch && !RESERVED_PATHS.has(slugMatch[1])) {
        const slug = slugMatch[1];
        const staticStorefrontIndex = resolve(root, `./${slug}/index.html`);
        const staticStorefrontMenu = resolve(root, `./data/vitrines/${slug}/menu.json`);
        if (await isFile(staticStorefrontIndex)) {
          resolvedPath = `/${slug}/index.html`;
          cacheControl = 'public, max-age=300, stale-while-revalidate=86400';
        } else if (await isFile(staticStorefrontMenu)) {
          resolvedPath = '/vitrine/index.html';
          cacheControl = 'public, max-age=300, stale-while-revalidate=86400';
        }
      }
    }

    const target = resolve(root, `.${resolvedPath}`);
    if (!target.startsWith(root.endsWith(sep) ? root : root + sep)) throw new Error('Invalid path');
    if (!(await isFile(target))) throw new Error('Missing file');
    const content = await readFile(target);
    res.writeHead(200, {
      ...securityHeadersForPath(pathname),
      'Cache-Control': cacheControl,
      'Content-Type': mime[extname(target)] || 'application/octet-stream'
    });
    res.end(req.method === 'HEAD' ? undefined : content);
  } catch {
    let fallbackPath = '/';
    try {
      fallbackPath = decodeURIComponent(new URL(req.url, `http://127.0.0.1:${port}`).pathname);
    } catch {}
    res.writeHead(404, { ...securityHeadersForPath(fallbackPath), 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Página não encontrada.');
  }
}).listen(port, '127.0.0.1', () => console.log(`Marketing preview: http://127.0.0.1:${port}`));
