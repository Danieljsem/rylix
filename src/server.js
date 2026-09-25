// Local server: serves the UI from /public and the lookup API.
// The same server will run inside the Electron main process later.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupLyrics } from './pipeline.js';

const PUBLIC_DIR = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_FIELD = 200;

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > 10_000) throw new Error('body too large');
  }
  return JSON.parse(data || '{}');
}

async function serveStatic(req, res) {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = path.resolve(PUBLIC_DIR, `.${urlPath === '/' ? '/index.html' : urlPath}`);
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 403, { error: 'forbidden' });
  try {
    send(res, 200, await readFile(file), MIME[path.extname(file)] ?? 'application/octet-stream');
  } catch {
    send(res, 404, { error: 'not found' });
  }
}

export function createServer({ token = process.env.GENIUS_TOKEN, lookup = lookupLyrics } = {}) {
  const cache = new Map();

  async function handleLookup(req, res) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: 'Neplatný požadavek.' });
    }
    const artist = String(body.artist ?? '').trim();
    const title = String(body.title ?? '').trim();
    if (!artist || !title) return send(res, 400, { error: 'Vyplň interpreta i název skladby.' });
    if (artist.length > MAX_FIELD || title.length > MAX_FIELD) {
      return send(res, 400, { error: 'Příliš dlouhý dotaz.' });
    }

    const key = `${artist}\u0000${title}`.toLowerCase();
    const hit = cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return send(res, 200, hit.result);

    try {
      const result = await lookup({ artist, title }, { token });
      if (result.found) cache.set(key, { at: Date.now(), result });
      send(res, 200, result);
    } catch (err) {
      console.error('lookup failed:', err);
      send(res, 502, { error: 'Vyhledávání selhalo. Zkus to prosím znovu.' });
    }
  }

  return http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/lyrics') return handleLookup(req, res);
    if (req.method === 'GET' && req.url === '/api/status') {
      return send(res, 200, { genius: Boolean(token) });
    }
    if (req.method === 'GET') return serveStatic(req, res);
    send(res, 405, { error: 'method not allowed' });
  });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, '127.0.0.1', () => {
    console.log(`ualyrics běží na http://127.0.0.1:${port}`);
    if (!process.env.GENIUS_TOKEN) console.log('Pozor: GENIUS_TOKEN chybí, hledá se jen v LRCLIB.');
  });
}
