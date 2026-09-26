import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimecode, recognizeAudd } from '../src/recognize/audd.js';
import { createServer } from '../src/server.js';

test('parseTimecode', () => {
  assert.equal(parseTimecode('00:56'), 56_000);
  assert.equal(parseTimecode('1:02:03'), 3_723_000);
  assert.equal(parseTimecode('nonsense'), null);
  assert.equal(parseTimecode(undefined), null);
});

test('recognizeAudd maps the response and sends token + file', async () => {
  let sent;
  const fetch = async (url, opts) => {
    sent = opts.body;
    return { ok: true, json: async () => ({ status: 'success', result: {
      artist: 'Тестовая Группа', title: 'Ветер', album: 'Альбом', timecode: '01:10', song_link: 'https://lis.tn/x',
      spotify: { duration_ms: 200000 },
    } }) };
  };
  const r = await recognizeAudd(Buffer.alloc(2000), 'audio/webm', { token: 't', fetch });
  assert.deepEqual(r, { found: true, artist: 'Тестовая Группа', title: 'Ветер', album: 'Альбом', timecodeMs: 70_000, durationMs: 200000, link: 'https://lis.tn/x' });
  assert.equal(sent.get('api_token'), 't');
  assert.ok(sent.get('file'));
});

test('recognizeAudd: no match → found false; API error → throws', async () => {
  const ok = (body) => async () => ({ ok: true, json: async () => body });
  assert.deepEqual(await recognizeAudd(Buffer.alloc(10), 'audio/webm', { token: 't', fetch: ok({ status: 'success', result: null }) }), { found: false });
  await assert.rejects(recognizeAudd(Buffer.alloc(10), 'audio/webm', { token: 't', fetch: ok({ status: 'error', error: { error_message: 'bad token' } }) }));
  await assert.rejects(recognizeAudd(Buffer.alloc(10), 'audio/webm', { token: '' }));
});

test('server /api/recognize: disabled without token, validates size, returns result', async () => {
  const start = async (opts) => {
    const s = createServer({ token: null, nowPlaying: { get: () => ({ available: false }) }, ...opts });
    await new Promise((r) => s.listen(0, '127.0.0.1', r));
    return [s, `http://127.0.0.1:${s.address().port}`];
  };
  const [off, offBase] = await start({ auddToken: '' });
  assert.equal((await fetch(`${offBase}/api/recognize`, { method: 'POST', body: Buffer.alloc(5000) })).status, 503);
  assert.equal((await (await fetch(`${offBase}/api/status`)).json()).recognition, false);
  off.close();

  const [on, base] = await start({ auddToken: 'x', recognize: async (audio) => ({ found: true, bytes: audio.length }) });
  assert.equal((await fetch(`${base}/api/recognize`, { method: 'POST', body: Buffer.alloc(10) })).status, 400);
  const r = await fetch(`${base}/api/recognize`, { method: 'POST', headers: { 'Content-Type': 'audio/webm' }, body: Buffer.alloc(5000) });
  assert.deepEqual(await r.json(), { found: true, bytes: 5000 });
  on.close();
});
