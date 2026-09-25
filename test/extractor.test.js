// The HTML below is a synthetic page modeled on Genius' markup; lyrics are invented.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractGeniusLyrics } from '../src/extractor/genius.js';
import { cleanLyricsText } from '../src/extractor/clean.js';
import { parseLyrics } from '../src/parser/index.js';

const PAGE = `<!doctype html><html><head><title>Тест Lyrics | Genius</title>
<script>window.__AD__ = "Реклама";</script></head><body>
<div class="Header">Тест Лирика — Песня Lyrics</div>
<div class="SongDescription">Об исполнителе: очень длинная биография…</div>
<div data-lyrics-container="true" class="Lyrics__Container">
  <div data-exclude-from-selection="true" class="LyricsHeader">
    <span>12 Contributors</span><span>Translations</span><span>English</span>
    <span>Песня Lyrics</span><div>Read More about this song</div>
  </div>
  [Куплет 1]<br>
  <a href="/12345/annotation" class="ReferentFragment"><span>Тёплый ветер над рекой</span></a><br>
  Ель у&nbsp;дома, съезд<br>
  <br>
  [Припев]<br>
  Пой со мной<br>
  Пой со мной
</div>
<div class="RightSidebar">You might also like<a href="/other">Другая песня</a></div>
<div data-lyrics-container="true" class="Lyrics__Container">
  <div data-exclude-from-selection="true"><div>You might also like</div><a href="/x">Чужая песня</a></div>
  <br>[Куплет 2]<br>
  Снова утро (снова)<br>
  <i>Конец</i>1Embed
</div>
<footer>© 2026 Genius Media Group Inc. Все права защищены.</footer>
</body></html>`;

test('extracts only lyrics containers, keeps line order and repeats', () => {
  const text = extractGeniusLyrics(PAGE);
  assert.deepEqual(parseLyrics(text).sections, [
    { name: 'Куплет 1', lines: ['Тёплый ветер над рекой', 'Ель у дома, съезд'] },
    { name: 'Припев', lines: ['Пой со мной', 'Пой со мной'] },
    { name: 'Куплет 2', lines: ['Снова утро (снова)', 'Конец'] },
  ]);
});

test('removes ads, header, contributors, recommendations, links, embed and copyright', () => {
  const text = extractGeniusLyrics(PAGE);
  for (const junk of ['Contributors', 'Translations', 'Read More', 'You might also like', 'Чужая песня',
    'Другая песня', 'Embed', 'Genius', '©', 'Реклама', 'биография', 'Lyrics', 'http', '/12345']) {
    assert.ok(!text.includes(junk), `should not contain "${junk}"`);
  }
});

test('returns null for pages without lyrics', () => {
  assert.equal(extractGeniusLyrics('<html><body><p>Нет текста</p></body></html>'), null);
  assert.equal(extractGeniusLyrics('<div data-lyrics-container="true"> <br> </div>'), null);
});

test('cleanLyricsText: junk lines removed, lyric lines and blank separators kept', () => {
  const raw = [
    '3 Contributors',
    'Песня Lyrics',
    '[Куплет]',
    'Раз два',
    'https://example.com/ad',
    '',
    '',
    '',
    'Три четыре Lyrics',
    'Copyright © 2026 Кто-то',
    'Пять7Embed',
  ].join('\n');
  assert.equal(cleanLyricsText(raw), '[Куплет]\nРаз два\n\nТри четыре Lyrics\nПять');
});

test('cleanLyricsText keeps lines that merely mention words like Embed mid-line', () => {
  assert.equal(cleanLyricsText('Слово Embed в середине\nКонец'), 'Слово Embed в середине\nКонец');
});
