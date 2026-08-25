/**
 * Local dev server: `npm run dev`.
 *
 * Vercel's own `vercel dev` works too (`npm run dev:vercel`) but needs a login.
 * This is node:http plus the same handlers the platform calls, so contributors
 * can iterate on a card without an account.
 */

import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = fileURLToPath(new URL('./public/', import.meta.url));

const ROUTES = {
  '/api/card': () => import('./api/card.js'),
  '/api/stack': () => import('./api/stack.js'),
  '/api/stats': () => import('./api/stats.js'),
  // The clean paths `vercel.json` rewrites in production.
  '/card': () => import('./api/card.js'),
  '/stack': () => import('./api/stack.js'),
  '/stats': () => import('./api/stats.js')
};

const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.ico': 'image/x-icon',
  '.json': 'application/json'
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = ROUTES[url.pathname];

  if (route) {
    // Vercel hands handlers a parsed `query`; mirror that here.
    req.query = Object.fromEntries(url.searchParams.entries());
    const { default: handler } = await route();
    await handler(req, res);
    return;
  }

  // Static files, with the leading slash and any `..` stripped before joining.
  const relative = normalize(url.pathname === '/' ? 'index.html' : url.pathname).replace(
    /^([/\\]|\.\.[/\\])+/,
    ''
  );
  try {
    const file = await readFile(join(PUBLIC_DIR, relative));
    res.setHeader('Content-Type', CONTENT_TYPES[extname(relative)] ?? 'application/octet-stream');
    res.end(file);
  } catch {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`readme-svg-generator dev server: http://localhost:${PORT}`);
});
