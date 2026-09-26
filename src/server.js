// Local server: serves the UI from /public and the lookup API.
// The same server will run inside the Electron main process later.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupLyrics } from './pipeline.js';
import { createNowPlaying } from './nowplaying/index.js';
import { createLibrary } from './library/index.js';

const PUBLIC_DIR = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const LIBRARY_FILE = fileURLToPath(new URL('../data/library.json', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_FIELD = 200;
const MAX_ART_BYTES = 5 * 1024 * 1024;
// Cover art is proxied (same origin → the UI can read its colors). Only Genius'
// image host is allowed, so this never becomes an open proxy.
const ART_HOSTS = new Set(['images.genius.com']);

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req, maxChars = 10_000) {
  let data = '';
  for await (const chunk of req) {
    data += chunk;
    if (data.length > maxChars) throw new Error('body too large');
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

export function isAllowedArtUrl(raw) {
  try {
    const u = new URL(raw);
    return u.protocol === 'https:' && ART_HOSTS.has(u.hostname) && !u.username && !u.port;
  } catch {
    return false;
  }
}

export function createServer({
  token = process.env.GENIUS_TOKEN,
  lookup = lookupLyrics,
  fetchArt = (url) => fetch(url, { redirect: 'error' }),
  nowPlaying = createNowPlaying(),
  library = createLibrary({ file: LIBRARY_FILE }),
} = {}) {
  const cache = new Map();

  async function handleLibrary(req, res) {
    const id = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice('/api/library'.length).replace(/^\//, ''));
    try {
      if (req.method === 'GET' && !id) return send(res, 200, { entries: await library.list() });
      if (req.method === 'GET') {
        const entry = await library.get(id);
        return entry ? send(res, 200, { ...entry, fromLibrary: true }) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'DELETE' && id) {
        return (await library.remove(id)) ? send(res, 200, { ok: true }) : send(res, 404, { error: 'not found' });
      }
      if (req.method === 'POST' && !id) {
        let body;
        try {
          body = await readJson(req, 2_000_000);
        } catch {
          return send(res, 400, { error: 'Neplatný požadavek.' });
        }
        const { result, queries = [] } = body;
        if (!result?.found || !result.original?.sections || !result.romanized?.sections) {
          return send(res, 400, { error: 'Chybí text k uložení.' });
        }
        return send(res, 200, await library.save(result, { queries: queries.slice(0, 10) }));
      }
      send(res, 405, { error: 'method not allowed' });
    } catch (err) {
      console.error('library failed:', err);
      send(res, 500, { error: 'Knihovnu se nepodařilo uložit.' });
    }
  }

  async function handleArt(req, res) {
    const target = new URL(req.url, 'http://x').searchParams.get('u');
    if (!isAllowedArtUrl(target)) return send(res, 400, { error: 'bad art url' });
    try {
      const upstream = await fetchArt(target);
      const type = upstream.headers.get('content-type') ?? '';
      if (!upstream.ok || !type.startsWith('image/')) return send(res, 502, { error: 'art unavailable' });
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.length > MAX_ART_BYTES) return send(res, 502, { error: 'art too large' });
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'max-age=86400' });
      res.end(body);
    } catch {
      send(res, 502, { error: 'art unavailable' });
    }
  }

  async function handleControl(req, res) {
    let body;
    try {
      body = await readJson(req);
    } catch {
      return send(res, 400, { error: 'bad request' });
    }
    if (!['toggle', 'next', 'prev', 'seek'].includes(body.action)) return send(res, 400, { error: 'unknown action' });
    send(res, 200, { ok: await nowPlaying.control(body.action, body.positionMs) });
  }

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

    // An approved (saved) version always wins over a fresh search.
    try {
      const saved = await library.findByQuery({ artist, title });
      if (saved) return send(res, 200, { ...saved, fromLibrary: true });
    } catch (err) {
      console.error('library lookup failed:', err);
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
    if (req.url === '/api/library' || req.url.startsWith('/api/library/')) return handleLibrary(req, res);
    if (req.method === 'GET' && req.url.startsWith('/api/art?')) return handleArt(req, res);
    if (req.method === 'GET' && req.url === '/api/now-playing') return send(res, 200, nowPlaying.get());
    if (req.method === 'POST' && req.url === '/api/now-playing/control') return handleControl(req, res);
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
    console.log(`Rylix běží na http://127.0.0.1:${port}`);
    if (!process.env.GENIUS_TOKEN) console.log('Pozor: GENIUS_TOKEN chybí, hledá se jen v LRCLIB.');
  });
}
