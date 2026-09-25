// Providers run against a fake fetch; no network. Lyrics are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { searchAll, queryVariants } from '../src/search/index.js';
import { latinToCyrillic, stripParenthetical } from '../src/search/reverse.js';
import { matchScore, titlePrecision } from '../src/search/match.js';
import { lookupLyrics } from '../src/pipeline.js';

const LYRICS = '[Куплет 1]\nТёплый ветер над рекой\nЕль у дома\n\n[Припев]\nПой со мной\nПой со мной';
const PLAIN = 'Теплый ветер над рекой\nЕль у дома\n\nПой со мной\nПой со мной';
const OTHER_SONG = 'Совсем другая\nпесня про\nосенний\nдождь';

const geniusPage = (text) =>
  `<div data-lyrics-container="true">${text.split('\n').join('<br>')}</div>`;

const json = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
const html = (body) => ({ ok: true, status: 200, text: async () => body });

function fakeFetch(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [match, respond] of routes) {
      if (url.includes(match)) return respond(url);
    }
    return json([]);
  };
  fn.calls = calls;
  return fn;
}

const lrclibEntry = (over = {}) => ({
  id: 1, artistName: 'Тестовая Группа', trackName: 'Ветер', instrumental: false,
  plainLyrics: PLAIN, syncedLyrics: '[00:01.00]Теплый ветер над рекой\n[00:03.50]Ель у дома', ...over,
});
const geniusHit = (over = {}) => ({
  type: 'song',
  result: {
    id: 10, url: 'https://genius.com/test-veter-lyrics', title: 'Ветер (Wind)',
    full_title: 'Ветер (Wind) by Тестовая Группа (Testovaya Gruppa)',
    primary_artist: { name: 'Тестовая Группа (Testovaya Gruppa)' }, ...over,
  },
});

test('latinToCyrillic handles English- and Czech-style input', () => {
  assert.equal(latinToCyrillic('Moy kray'), 'мой край');
  assert.equal(latinToCyrillic('Shchuka zhdyot'), 'щука ждёт');
  assert.equal(latinToCyrillic('Žemčug'), 'жемчуг');
  assert.equal(latinToCyrillic("Eto noch'"), 'это ночь');
  assert.equal(latinToCyrillic('Čaj s limonem'), 'чай с лимонем');
});

test('queryVariants adds a Cyrillic guess only for Latin input', () => {
  assert.deepEqual(queryVariants({ artist: 'Кино', title: 'Ветер' }), [{ artist: 'Кино', title: 'Ветер' }]);
  assert.deepEqual(queryVariants({ artist: 'Kino', title: 'Veter' })[1], { artist: 'кино', title: 'ветер' });
});

test('matchScore compares across scripts; titlePrecision prefers exact titles', () => {
  assert.equal(matchScore('Testovaya Gruppa', 'Тестовая Группа'), 1);
  assert.equal(matchScore('Veter', 'Ветер (Wind)'), 1);
  assert.equal(matchScore('Veter', 'Дождь'), 0);
  assert.ok(titlePrecision('Osen', 'Осень (Autumn)') > titlePrecision('Osen', 'Что такое осень'));
  assert.equal(stripParenthetical('ДДТ (DDT)'), 'ДДТ');
});

test('both providers found → two candidates, Genius page scraped', async () => {
  const fetch = fakeFetch([
    ['lrclib.net/api/search', () => json([lrclibEntry()])],
    ['api.genius.com/search', () => json({ response: { hits: [geniusHit()] } })],
    ['genius.com/test-veter-lyrics', () => html(geniusPage(LYRICS))],
  ]);
  const { candidates, errors } = await searchAll({ artist: 'Тестовая Группа', title: 'Ветер' }, { fetch, token: 't' });
  assert.deepEqual(errors, []);
  assert.deepEqual(candidates.map((c) => c.source.provider), ['lrclib', 'genius']);
  assert.equal(candidates[0].synced.length, 2);
});

test('full pipeline: Genius headers + LRCLIB timing, ё restored, high confidence, 1:1 lines', async () => {
  const fetch = fakeFetch([
    ['lrclib.net/api/search', () => json([lrclibEntry()])],
    ['api.genius.com/search', () => json({ response: { hits: [geniusHit()] } })],
    ['genius.com/test-veter-lyrics', () => html(geniusPage(LYRICS.replace('Тёплый', 'Теплый')))],
  ]);
  const r = await lookupLyrics({ artist: 'Testovaya Gruppa', title: 'Veter' }, { fetch, token: 't' });
  assert.equal(r.found, true);
  assert.equal(r.source.provider, 'genius');
  assert.equal(r.confidence, 'high');
  assert.equal(r.valid, true);
  assert.deepEqual(r.stats, { originalLines: 4, romanizedLines: 4 });
  assert.equal(r.text.romanized, '[Kuplet 1]\nTeplyy veter nad rekoy\nYel\' u doma\n\n[Pripev]\nPoy so mnoy\nPoy so mnoy');
  assert.deepEqual(r.synced.map((l) => l.romanized), ['Teplyy veter nad rekoy', "Yel' u doma"]);
});

test('Latin query: Genius romanization page resolves to the original song', async () => {
  const meta = geniusHit({
    id: 99, url: 'https://genius.com/romanized', title: 'Veter (Romanized)',
    full_title: 'Тестовая Группа – Ветер (Romanized) by Genius Romanizations',
    primary_artist: { name: 'Genius Romanizations' },
  });
  const fetch = fakeFetch([
    ['lrclib.net/api/search', () => json([])],
    ['api.genius.com/search', () => json({ response: { hits: [meta] } })],
    ['api.genius.com/songs/99', () => json({ response: { song: {
      song_relationships: [{ relationship_type: 'translation_of', songs: [geniusHit().result] }],
    } } })],
    ['genius.com/test-veter-lyrics', () => html(geniusPage(LYRICS))],
  ]);
  const { candidates } = await searchAll({ artist: 'Testovaya Gruppa', title: 'Veter' }, { fetch, token: 't' });
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].source.url, 'https://genius.com/test-veter-lyrics');
  assert.ok(!fetch.calls.includes('https://genius.com/romanized'), 'meta page is never scraped');
});

test('LRCLIB retried with the Cyrillic names Genius found', async () => {
  const fetch = fakeFetch([
    ['lrclib.net/api/search', (url) => json(decodeURIComponent(url).includes('Тестовая') ? [lrclibEntry()] : [])],
    ['api.genius.com/search', () => json({ response: { hits: [geniusHit()] } })],
    ['genius.com/test-veter-lyrics', () => html(geniusPage(LYRICS))],
  ]);
  // "Wind" only matches the English part of Genius' title; LRCLIB knows the song only as "Ветер".
  const { candidates } = await searchAll({ artist: 'Testovaya Gruppa', title: 'Wind' }, { fetch, token: 't' });
  assert.deepEqual(candidates.map((c) => c.source.provider).sort(), ['genius', 'lrclib']);
});

test('different songs from two providers: the less exact title is rejected', async () => {
  const fetch = fakeFetch([
    // LRCLIB only knows a different song whose title also contains the query word.
    ['lrclib.net/api/search', () => json([lrclibEntry({ trackName: 'Ветер и осенний дождь', plainLyrics: OTHER_SONG })])],
    ['api.genius.com/search', () => json({ response: { hits: [geniusHit()] } })],
    ['genius.com/test-veter-lyrics', () => html(geniusPage(LYRICS))],
  ]);
  const r = await searchAll({ artist: 'Тестовая Группа', title: 'Ветер' }, { fetch, token: 't' });
  assert.deepEqual(r.candidates.map((c) => c.source.provider), ['genius']);
  assert.equal(r.rejected.length, 1);
  assert.equal(r.rejected[0].reason, 'different song');
});

test('provider failure is reported, others still work; no token → Genius skipped', async () => {
  const fetch = fakeFetch([
    ['lrclib.net', () => ({ ok: false, status: 503 })],
    ['api.genius.com/search', () => json({ response: { hits: [geniusHit()] } })],
    ['genius.com/test-veter-lyrics', () => html(geniusPage(LYRICS))],
  ]);
  const r = await searchAll({ artist: 'Тестовая Группа', title: 'Ветер' }, { fetch, token: 't' });
  assert.deepEqual(r.candidates.map((c) => c.source.provider), ['genius']);
  assert.equal(r.errors[0].provider, 'lrclib');

  const noToken = await searchAll({ artist: 'Тестовая Группа', title: 'Ветер' }, { fetch: fakeFetch([]) });
  assert.deepEqual(noToken.candidates, []);
});

test('non-Cyrillic and instrumental LRCLIB entries are ignored', async () => {
  const fetch = fakeFetch([
    ['lrclib.net/api/search', () => json([
      lrclibEntry({ plainLyrics: 'Only latin text' }),
      lrclibEntry({ instrumental: true, plainLyrics: null }),
    ])],
  ]);
  const { candidates } = await searchAll({ artist: 'Тестовая Группа', title: 'Ветер' }, { fetch });
  assert.deepEqual(candidates, []);
});

test('nothing found → found: false', async () => {
  const r = await lookupLyrics({ artist: 'Нет', title: 'Ничего' }, { fetch: fakeFetch([]), token: 't' });
  assert.equal(r.found, false);
});
