// Local development server (never deployed): serves dist/ and /api against a local PostgreSQL.
// AMELIB_LOCAL_PG=1 DATABASE_URL=postgres://… node scripts/local-api.mjs  → http://localhost:3001
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { pgNeon } from './pg-neon.mjs';
import { useDatabase } from '../server/db.mjs';
if (!process.env.AMELIB_LOCAL_PG) throw new Error('Set AMELIB_LOCAL_PG=1: this server is for local databases only.');
useDatabase(pgNeon(process.env.DATABASE_URL));
const { default: handler } = await import('../api/index.mjs');
const root = new URL('../dist/', import.meta.url).pathname;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json' };
createServer(async (req, res) => {
  const url = new URL(req.url, 'http://' + req.headers.host);
  if (url.pathname === '/api') {
    let raw = ''; for await (const chunk of req) raw += chunk;
    let body; try { body = raw ? JSON.parse(raw) : undefined; } catch { body = undefined; }
    const response = { setHeader: (k, v) => res.setHeader(k, v), status(code) { res.statusCode = code; return this; }, json(data) { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); } };
    return handler(Object.assign(req, { query: Object.fromEntries(url.searchParams), body }), response);
  }
  const file = normalize(join(root, url.pathname)).startsWith(root) ? join(root, url.pathname) : root;
  try { const data = await readFile(extname(file) ? file : join(root, 'index.html')); res.setHeader('Content-Type', types[extname(file)] || 'text/html'); res.end(data); }
  catch { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(join(root, 'index.html'))); }
}).listen(3001, () => console.log('Amelib local server on http://localhost:3001'));
