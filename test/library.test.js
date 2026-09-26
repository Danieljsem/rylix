// Lyrics below are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createLibrary, queryKey } from '../src/library/index.js';
import { createServer } from '../src/server.js';

const RESULT = {
  found: true,
  artist: 'Тестовая Группа',
  title: 'Ветер',
  art: null,
  source: { provider: 'genius', url: 'https://genius.com/test-veter-lyrics' },
  original: { sections: [{ name: 'Припев', lines: ['Пой со мной', 'Пой со мной'] }] },
  romanized: { sections: [{ name: 'Pripev', lines: ['Poy so mnoy', 'Poy so mnoy'] }] },
  text: { original: '', romanized: '' },
  synced: [{ timeMs: 1000, text: 'Пой со мной', romanized: 'Poy so mnoy' }],
  confidence: 'high',
  autoKey: 'Spotify.exe|x|y',
};

const tempFile = async () => path.join(await mkdtemp(path.join(tmpdir(), 'rylix-')), 'data', 'library.json');

test('queryKey ignores case, ё and punctuation', () => {
  assert.equal(queryKey({ artist: 'Тестовая  Группа!', title: 'Ёлка' }), queryKey({ artist: 'тестовая группа', title: 'елка' }));
});

test('save → list → get → findByQuery → remove, persisted to disk', async () => {
  const file = await tempFile();
  const lib = createLibrary({ file });
  const saved = await lib.save(RESULT, { queries: [{ artist: 'Testovaya Gruppa', title: 'Veter' }] });
  assert.equal(saved.title, 'Ветер');
  assert.equal(saved.synced, true);

  const reopened = createLibrary({ file });
  const [first] = await reopened.list();
  assert.equal(first.id, saved.id);
  const full = await reopened.get(saved.id);
  assert.deepEqual(full.romanized, RESULT.romanized);
  assert.equal(full.autoKey, undefined, 'session-only fields are not stored');

  assert.equal((await reopened.findByQuery({ artist: 'testovaya gruppa', title: 'veter' })).id, saved.id);
  assert.equal((await reopened.findByQuery({ artist: 'Тестовая Группа', title: 'Ветер' })).id, saved.id);
  assert.equal(await reopened.findByQuery({ artist: 'Нет', title: 'Ничего' }), null);

  assert.equal(await reopened.remove(saved.id), true);
  assert.deepEqual(await reopened.list(), []);
  assert.deepEqual(JSON.parse(await readFile(file, 'utf8')).entries, []);
  await rm(path.dirname(path.dirname(file)), { recursive: true });
});

test('saving the same song again updates it instead of duplicating', async () => {
  const lib = createLibrary({ file: await tempFile() });
  await lib.save(RESULT);
  await lib.save({ ...RESULT, confidence: 'medium' });
  const list = await lib.list();
  assert.equal(list.length, 1);
  assert.equal(list[0].confidence, 'medium');
});

test('server: saved song is served from the library instead of searching', async () => {
  let lookups = 0;
  const server = createServer({
    token: null,
    lookup: async () => { lookups++; return { found: false }; },
    nowPlaying: { get: () => ({ available: false }) },
    library: createLibrary({ file: await tempFile() }),
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = (method, url, body) => fetch(base + url, { method, body: body && JSON.stringify(body) }).then(async (r) => [r.status, await r.json()]);

  assert.equal((await json('POST', '/api/library', { result: { found: false } }))[0], 400);
  const [st, saved] = await json('POST', '/api/library', { result: RESULT, queries: [{ artist: 'TG', title: 'Wind' }] });
  assert.equal(st, 200);
  assert.equal((await json('GET', '/api/library'))[1].entries.length, 1);
  assert.equal((await json('GET', `/api/library/${saved.id}`))[1].fromLibrary, true);

  const [, found] = await json('POST', '/api/lyrics', { artist: 'tg', title: 'wind' });
  assert.equal(found.fromLibrary, true);
  assert.equal(lookups, 0);

  assert.equal((await json('DELETE', `/api/library/${saved.id}`))[0], 200);
  assert.equal((await json('DELETE', `/api/library/${saved.id}`))[0], 404);
  await json('POST', '/api/lyrics', { artist: 'tg', title: 'wind' });
  assert.equal(lookups, 1);
  server.close();
});
