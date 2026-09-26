// Track names below are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackQuery, primaryArtist } from '../src/nowplaying/clean.js';
import { parseLine, present, createNowPlaying } from '../src/nowplaying/index.js';
import { queryVariants } from '../src/search/index.js';

test('trackQuery cleans Spotify-style titles', () => {
  assert.deepEqual(trackQuery({ app: 'Spotify.exe', artist: 'Тестовая Группа', title: 'Ветер - Remastered 2011' }),
    { artist: 'Тестовая Группа', title: 'Ветер' });
  assert.deepEqual(trackQuery({ app: 'Spotify.exe', artist: 'Группа', title: 'Ветер (feat. Кто-то)' }),
    { artist: 'Группа', title: 'Ветер' });
  assert.deepEqual(trackQuery({ app: 'Spotify.exe', artist: 'Группа', title: 'Ветер - Live' }),
    { artist: 'Группа', title: 'Ветер' });
});

test('trackQuery splits YouTube-style "Artist - Song (Official Video)"', () => {
  assert.deepEqual(
    trackQuery({ app: 'MSEdge', artist: 'GruppaVEVO', title: 'Группа - Ветер (Official Music Video)' }),
    { artist: 'Группа', title: 'Ветер' },
  );
  assert.deepEqual(
    trackQuery({ app: 'Chrome', artist: 'Some Channel', title: 'Группа — Ветер [Клип] | 2026' }),
    { artist: 'Группа', title: 'Ветер' },
  );
});

test('trackQuery keeps dashes inside Spotify titles and rejects empty data', () => {
  assert.deepEqual(trackQuery({ app: 'Spotify.exe', artist: 'Группа', title: 'Раз - два' }),
    { artist: 'Группа', title: 'Раз - два' });
  assert.equal(trackQuery({ app: 'Spotify.exe', artist: '', title: '' }), null);
});

test('primaryArtist and query variants for several artists', () => {
  assert.equal(primaryArtist('Первый & Второй'), 'Первый');
  assert.equal(primaryArtist('Первый, Второй'), 'Первый');
  assert.equal(primaryArtist('Один'), null);
  const v = queryVariants({ artist: 'Первый & Второй', title: 'Ветер' });
  assert.deepEqual(v[1], { artist: 'Первый', title: 'Ветер' });
});

test('parseLine accepts watcher output and rejects garbage', () => {
  const snap = parseLine('{"status":"Playing","app":"Spotify.exe","artist":"Группа","title":"Ветер","positionMs":1000,"durationMs":200000,"sampledAt":5000}');
  assert.equal(snap.title, 'Ветер');
  assert.equal(parseLine('not json'), null);
  assert.equal(parseLine('{"foo":1}'), null);
});

test('present extrapolates position while playing, not while paused', () => {
  const base = { status: 'Playing', app: 'Spotify.exe', artist: 'Группа', title: 'Ветер', positionMs: 1000, durationMs: 3000, sampledAt: 10_000 };
  assert.equal(present(base, 10_500).positionMs, 1500);
  assert.equal(present(base, 99_000).positionMs, 3000, 'clamped to duration');
  assert.equal(present({ ...base, status: 'Paused' }, 10_500).positionMs, 1000);
  assert.deepEqual(present(base, 10_000).track.query, { artist: 'Группа', title: 'Ветер' });
  assert.equal(present({ status: 'None', sampledAt: 1 }).track, null);
});

test('now-playing is unavailable outside Windows and never spawns there', () => {
  let spawned = false;
  const np = createNowPlaying({ platform: 'linux', spawnImpl: () => { spawned = true; } });
  assert.deepEqual(np.get(), { available: false });
  assert.equal(spawned, false);
});

test('control: only known actions, Windows only, position sanitized', async () => {
  const calls = [];
  const np = createNowPlaying({
    platform: 'win32',
    spawnImpl: () => ({ stdout: null, on() {} }),
    execImpl: (cmd, args, opts, cb) => { calls.push(args); cb(null, 'true\r\n'); },
  });
  assert.equal(await np.control('toggle'), true);
  assert.equal(await np.control('seek', '12345.6'), true);
  assert.equal(await np.control('rm -rf'), false);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls[1].slice(-4), ['-Action', 'seek', '-PositionMs', '12346']);
  const linux = createNowPlaying({ platform: 'linux' });
  assert.equal(await linux.control('toggle'), false);
});
