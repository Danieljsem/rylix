// All Cyrillic test phrases are invented for this project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseLyrics, parseLrc } from '../src/parser/index.js';
import { formatLyrics, countLines } from '../src/formatter/index.js';

const WITH_HEADERS = `
[Куплет 1]
Тёплый ветер над рекой
Ель у дома

[Припев]
Пой со мной
Пой со мной

[Куплет 2]
Снова утро
`;

test('sections with headers keep names, lines and order', () => {
  assert.deepEqual(parseLyrics(WITH_HEADERS), {
    sections: [
      { name: 'Куплет 1', lines: ['Тёплый ветер над рекой', 'Ель у дома'] },
      { name: 'Припев', lines: ['Пой со мной', 'Пой со мной'] },
      { name: 'Куплет 2', lines: ['Снова утро'] },
    ],
  });
});

test('text without headers is split into untitled blocks by blank lines', () => {
  const text = 'Первая строка\nВторая строка\n\n\nТретья строка\r\n';
  assert.deepEqual(parseLyrics(text), {
    sections: [
      { name: null, lines: ['Первая строка', 'Вторая строка'] },
      { name: null, lines: ['Третья строка'] },
    ],
  });
});

test('blank line right after a header does not drop the header', () => {
  const { sections } = parseLyrics('[Интро]\n\nРаз два\n[Проигрыш]\n[Аутро]\nТри');
  assert.deepEqual(sections, [
    { name: 'Интро', lines: ['Раз два'] },
    { name: 'Проигрыш', lines: [] },
    { name: 'Аутро', lines: ['Три'] },
  ]);
});

test('repeated lines are never deduplicated', () => {
  const { sections } = parseLyrics('Ла-ла\nЛа-ла\nЛа-ла\nЛа-ла');
  assert.equal(sections[0].lines.length, 4);
});

test('inline brackets inside a lyric line are not treated as headers', () => {
  const { sections } = parseLyrics('[Припев]\nПой [тихо] со мной');
  assert.deepEqual(sections[0].lines, ['Пой [тихо] со мной']);
});

test('format → parse round trip keeps the structure', () => {
  const parsed = parseLyrics(WITH_HEADERS);
  const text = formatLyrics(parsed);
  assert.equal(text.startsWith('[Куплет 1]\nТёплый ветер над рекой'), true);
  assert.deepEqual(parseLyrics(text), parsed);
  assert.equal(countLines(parsed), 5);
});

test('LRC parsing: timestamps, metadata ignored, gaps kept, multi-stamp lines', () => {
  const lrc = [
    '[ar:Кто-то]',
    '[00:12.50]Пой со мной',
    '[00:15.00]',
    '[01:02.345]Снова утро',
    '[00:20.00][00:40.00]Ла-ла',
  ].join('\n');
  assert.deepEqual(parseLrc(lrc), [
    { timeMs: 12500, text: 'Пой со мной' },
    { timeMs: 15000, text: '' },
    { timeMs: 20000, text: 'Ла-ла' },
    { timeMs: 40000, text: 'Ла-ла' },
    { timeMs: 62345, text: 'Снова утро' },
  ]);
});
