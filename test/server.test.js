import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.js';
import { createLibrary } from '../src/library/index.js';
import { tmpdir } from 'node:os';
import path from 'node:path';

let server;
let base;
let lookups = 0;

before(async () => {
  server = createServer({
    token: null,
    library: createLibrary({ file: path.join(tmpdir(), `rylix-test-${process.pid}`, 'library.json') }),
    nowPlaying: { get: () => ({ available: true, playing: true, track: { title: 'Ветер' }, positionMs: 1234 }) },
    lookup: async ({ artist, title }) => {
      lookups++;
      if (title === 'boom') throw new Error('kaput');
      return { found: true, artist, title };
    },
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const post = (body) => fetch(`${base}/api/lyrics`, { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });

test('serves the UI and static assets', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /text\/html/);
  assert.equal((await fetch(`${base}/app.js`)).status, 200);
});

test('path traversal cannot read files outside public/', async () => {
  for (const p of ['/../.env', '/%2e%2e/.env', '/..%2f.env', '/../package.json']) {
    assert.notEqual((await fetch(`${base}${p}`)).status, 200, p);
  }
});

test('lookup: validation, success, cache and upstream failure', async () => {
  assert.equal((await post({ artist: '', title: 'x' })).status, 400);
  assert.equal((await post('{nope')).status, 400);
  assert.equal((await post({ artist: 'a'.repeat(201), title: 'x' })).status, 400);

  const before = lookups;
  const ok = await post({ artist: 'Кино', title: 'Ветер' });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { found: true, artist: 'Кино', title: 'Ветер' });
  await post({ artist: 'кино', title: 'ВЕТЕР' });
  assert.equal(lookups - before, 1, 'second, case-different query is served from cache');

  assert.equal((await post({ artist: 'x', title: 'boom' })).status, 502);
});

test('status endpoint reports Genius availability', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/status`)).json(), { genius: false });
});

test('art proxy only serves images from Genius', async () => {
  const { isAllowedArtUrl } = await import('../src/server.js');
  assert.equal(isAllowedArtUrl('https://images.genius.com/abc.300x300x1.png'), true);
  for (const bad of ['http://images.genius.com/a.png', 'https://evil.com/a.png',
    'https://images.genius.com.evil.com/a.png', 'https://user@images.genius.com/a.png',
    'https://images.genius.com:8443/a.png', 'file:///C:/Windows/win.ini', 'nonsense', null]) {
    assert.equal(isAllowedArtUrl(bad), false, String(bad));
  }
  assert.equal((await fetch(`${base}/api/art?u=${encodeURIComponent('https://evil.com/x.png')}`)).status, 400);
});

test('now-playing endpoint returns the watcher snapshot', async () => {
  const body = await (await fetch(`${base}/api/now-playing`)).json();
  assert.equal(body.positionMs, 1234);
  assert.equal(body.track.title, 'Ветер');
});

test('media control endpoint validates the action', async () => {
  const bad = await fetch(`${base}/api/now-playing/control`, { method: 'POST', body: JSON.stringify({ action: 'format c:' }) });
  assert.equal(bad.status, 400);
});
