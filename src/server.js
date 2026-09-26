// Local server: serves the UI from /public and the lookup API.
// The same server will run inside the Electron main process later.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lookupLyrics } from './pipeline.js';
import { createNowPlaying } from './nowplaying/index.js';
import { createLibrary } from './library/index.js';
import { recognizeAudd, MAX_AUDIO_BYTES } from './recognize/audd.js';

const PUBLIC_DIR = path.resolve(fileURLToPath(new URL('../public/', import.meta.url)));
const LIBRARY_FILE = fileURLToPath(new URL('../data/library.json', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
const CACHE_TTL_MS = 60 * 60 * 1000;
const MAX_FIELD = 200;
const MAX_ART_BYTES = 5 * 1024 * 1024;
// Cover art is proxied (same origin → the UI can read its colors). Only Genius'
// image host is allowed, so this never becomes an open proxy.
const ART_HOSTS = new Set(['images.genius.com']);

// Map with a size cap: the oldest entry goes when it is full.
export function lru(max) {
  const map = new Map();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key);
      map.delete(key);
      map.set(key, value);
      return value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, value);
      if (map.size > max) map.delete(map.keys().next().value);
    },
    get size() { return map.size; },
  };
}

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
  auddToken = process.env.AUDD_TOKEN,
  recognize = (audio, mime) => recognizeAudd(audio, mime, { token: auddToken }),
} = {}) {
  const cache = lru(300);
  const artCache = lru(150);
  const inFlight = new Map(); // same query asked twice at once → one lookup

  async function handleLibrary(req, res) {
    const rest = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice('/api/library'.length).replace(/^\//, ''));
    const [id, sub] = rest.split('/');
    try {
      if (req.method === 'GET' && id && sub === 'cover') {
        const cover = await library.cover(id);
        if (!cover) return send(res, 404, { error: 'no cover' });
        res.writeHead(200, { 'Content-Type': cover.type, 'Cache-Control': 'max-age=86400' });
        return res.end(cover.body);
      }
      if (req.method === 'PATCH' && id && !sub) {
        let body;
        try {
          body = await readJson(req);
        } catch {
          return send(res, 400, { error: 'Neplatný požadavek.' });
        }
        const updated = await library.update(id, { offsetMs: Number(body.offsetMs) });
        return updated ? send(res, 200, updated) : send(res, 404, { error: 'not found' });
      }
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
        // Keep the cover too, so the saved song looks the same offline.
        let cover = null;
        if (isAllowedArtUrl(result.art)) {
          try {
            cover = artCache.get(result.art);
            if (!cover) {
              const upstream = await fetchArt(result.art);
              const type = upstream.headers.get('content-type') ?? '';
              const body = Buffer.from(await upstream.arrayBuffer());
              if (upstream.ok && type.startsWith('image/') && body.length <= MAX_ART_BYTES) cover = { type, body };
            }
          } catch { /* offline or gone: saved without a cover */ }
        }
        return send(res, 200, await library.save(result, { queries: queries.slice(0, 10), cover }));
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
    const cached = artCache.get(target);
    if (cached) {
      res.writeHead(200, { 'Content-Type': cached.type, 'Cache-Control': 'max-age=86400' });
      return res.end(cached.body);
    }
    try {
      const upstream = await fetchArt(target);
      const type = upstream.headers.get('content-type') ?? '';
      if (!upstream.ok || !type.startsWith('image/')) return send(res, 502, { error: 'art unavailable' });
      const body = Buffer.from(await upstream.arrayBuffer());
      if (body.length > MAX_ART_BYTES) return send(res, 502, { error: 'art too large' });
      artCache.set(target, { type, body });
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

  // Body = raw audio (a few seconds recorded by the desktop app).
  async function handleRecognize(req, res) {
    if (!auddToken) return send(res, 503, { error: 'Rozpoznávání není nastavené (chybí AUDD_TOKEN).' });
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > MAX_AUDIO_BYTES) return send(res, 413, { error: 'Nahrávka je příliš velká.' });
      chunks.push(chunk);
    }
    if (size < 1000) return send(res, 400, { error: 'Nahrávka je prázdná.' });
    try {
      send(res, 200, await recognize(Buffer.concat(chunks), req.headers['content-type']));
    } catch (err) {
      console.error('recognize failed:', err.message);
      send(res, 502, { error: 'Rozpoznání selhalo.' });
    }
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
      let pending = inFlight.get(key);
      if (!pending) {
        pending = lookup({ artist, title }, { token }).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      const result = await pending;
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
    if (req.method === 'POST' && req.url === '/api/recognize') return handleRecognize(req, res);
    if (req.method === 'GET' && req.url === '/api/status') {
      return send(res, 200, { genius: Boolean(token), recognition: Boolean(auddToken) });
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
