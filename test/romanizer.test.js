// All Cyrillic test phrases are invented for this project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { romanizeLine, romanizeLyrics, hasCyrillic } from '../src/romanizer/index.js';

test('base alphabet', () => {
  assert.equal(
    romanizeLine('абвгджзийклмнопрстуфхцчшщыэюя'),
    'abvgdzhziyklmnoprstufkhtschshshchyeyuya',
  );
});

test('е → ye at word start, after vowel and after ь/ъ, otherwise e', () => {
  assert.equal(romanizeLine('ель'), "yel'");
  assert.equal(romanizeLine('моему'), 'moyemu');
  assert.equal(romanizeLine('съезд'), "s'yezd");
  assert.equal(romanizeLine('вьется'), "v'yetsya");
  assert.equal(romanizeLine('небо'), 'nebo');
  assert.equal(romanizeLine('по-еще'), 'po-yeshche');
});

test('ё → yo, but o after ж ш ч щ ц', () => {
  assert.equal(romanizeLine('тёплый'), 'tyoplyy');
  assert.equal(romanizeLine('ёж'), 'yozh');
  assert.equal(romanizeLine('моё'), 'moyo');
  assert.equal(romanizeLine('жёлтый'), 'zholtyy');
  assert.equal(romanizeLine('щёки'), 'shchoki');
});

test('ь and ъ → apostrophe', () => {
  assert.equal(romanizeLine('мышь'), "mysh'");
  assert.equal(romanizeLine('объявить'), "ob'yavit'");
});

test('й and endings -ий / -ый', () => {
  assert.equal(romanizeLine('мой край синий новый'), 'moy kray siniy novyy');
});

test('capitalization follows the original', () => {
  assert.equal(romanizeLine('Жук'), 'Zhuk');
  assert.equal(romanizeLine('ЖУК'), 'ZHUK');
  assert.equal(romanizeLine('Щука и ЩУКА'), 'Shchuka i SHCHUKA');
  assert.equal(romanizeLine('Ёлка'), 'Yolka');
  assert.equal(romanizeLine('Я'), 'Ya');
  assert.equal(romanizeLine('ЁЖ'), 'YOZH');
});

test('punctuation, digits, Latin and spacing are kept as is', () => {
  assert.equal(
    romanizeLine('  Тёплый ветер — над рекой, 2 раза! (x2) OK…'),
    '  Tyoplyy veter — nad rekoy, 2 raza! (x2) OK…',
  );
  assert.equal(romanizeLine(''), '');
});

test('section names are romanized', () => {
  assert.equal(romanizeLine('[Куплет 1]'), '[Kuplet 1]');
  assert.equal(romanizeLine('Припев'), 'Pripev');
});

test('structure: same sections, line counts, order and repeated lines', () => {
  const original = {
    sections: [
      { name: 'Куплет 1', lines: ['Тёплый ветер над рекой', 'Ель у дома'] },
      { name: 'Припев', lines: ['Пой со мной', 'Пой со мной', 'Пой со мной'] },
      { name: null, lines: ['Конец'] },
    ],
  };
  const out = romanizeLyrics(original);
  assert.deepEqual(out, {
    sections: [
      { name: 'Kuplet 1', lines: ['Tyoplyy veter nad rekoy', 'Yel\' u doma'] },
      { name: 'Pripev', lines: ['Poy so mnoy', 'Poy so mnoy', 'Poy so mnoy'] },
      { name: null, lines: ['Konets'] },
    ],
  });
  original.sections.forEach((s, i) => assert.equal(out.sections[i].lines.length, s.lines.length));
});

test('hasCyrillic', () => {
  assert.equal(hasCyrillic('hello'), false);
  assert.equal(hasCyrillic('hello мир'), true);
});
