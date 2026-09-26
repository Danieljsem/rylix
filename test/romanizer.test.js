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

test('cyrillicShare tells original lyrics from romanized ones', async () => {
  const { cyrillicShare, isOriginalCyrillic } = await import('../src/romanizer/index.js');
  assert.equal(cyrillicShare('Пой со мной'), 1);
  assert.equal(isOriginalCyrillic('Poy so mnoy\nPoy so mnoy\n[Припев]'), false);
  assert.equal(isOriginalCyrillic('Пой со мной всю ночь, baby'), true);
  assert.equal(cyrillicShare('123 !!!'), 0);
});

test('Ukrainian (official KMU 2010): г→h, и→y, і→i, iotated letters by position, ь and apostrophe dropped', async () => {
  const { romanizeLine: r } = await import('../src/romanizer/index.js');
  assert.equal(r('Гора', 'uk'), 'Hora');
  assert.equal(r('Згадка', 'uk'), 'Zghadka');
  assert.equal(r('Їжак', 'uk'), 'Yizhak');
  assert.equal(r('Мої', 'uk'), 'Moi');
  assert.equal(r('Юнак і яблуко', 'uk'), 'Yunak i yabluko');
  assert.equal(r('Мрія', 'uk'), 'Mriia');
  assert.equal(r("м'ята", 'uk'), 'miata');
  assert.equal(r('Сіль', 'uk'), 'Sil');
  assert.equal(r('Єнот, сміється', 'uk'), 'Yenot, smiietsia');
  assert.equal(r('Край', 'uk'), 'Krai');
});

test('Belarusian (practical): г→h, ў→w, е→ye after vowels, ь→apostrophe', async () => {
  const { romanizeLine: r } = await import('../src/romanizer/index.js');
  assert.equal(r('Воўк', 'be'), 'Vowk');
  assert.equal(r('Горад', 'be'), 'Horad');
  assert.equal(r('Моё неба', 'be'), 'Moyo neba');
  assert.equal(r('Ель і соль', 'be'), "Yel' i sol'");
  assert.equal(r("п'е", 'be'), 'pye');
});

test('detectLanguage tells ru / uk / be / other', async () => {
  const { detectLanguage } = await import('../src/romanizer/index.js');
  assert.equal(detectLanguage('Тёплый ветер над рекой, съезд у дома'), 'ru');
  assert.equal(detectLanguage('Мрія їде додому, і сміється'), 'uk');
  assert.equal(detectLanguage('Воўк ідзе па лесе, і вецер'), 'be');
  assert.equal(detectLanguage('Ranní vítr fouká nad řekou'), 'other');
  assert.equal(detectLanguage('Hello world, just a test'), 'other');
});

test('romanizeLyrics leaves other languages untouched', async () => {
  const { romanizeLyrics } = await import('../src/romanizer/index.js');
  const s = { sections: [{ name: 'Refrén', lines: ['Ranní vítr', 'Ranní vítr'] }] };
  assert.deepEqual(romanizeLyrics(s, 'other'), s);
});

test('lineLanguage: щ is Ukrainian too; и + ы is Russian; neutral lines → null', async () => {
  const { lineLanguage } = await import('../src/romanizer/index.js');
  assert.equal(lineLanguage('Ще не вечір'), 'uk');
  assert.equal(lineLanguage('Мы идём домой'), 'ru');
  assert.equal(lineLanguage('Съезд'), 'ru');
  assert.equal(lineLanguage('Воўк'), 'be');
  assert.equal(lineLanguage('Ля-ля-ля'), null);
  assert.equal(lineLanguage('Ранок'), null);
});

test('detectLanguage: majority of lines decides, one borrowed word does not flip a song', async () => {
  const { detectLanguage } = await import('../src/romanizer/index.js');
  const russianWithOneUkrainianWord = ['Мы идём домой', 'Тихий вечер, ты рядом', 'Ещё один день', 'Привіт'].join('\n');
  assert.equal(detectLanguage(russianWithOneUkrainianWord), 'ru');
  const ukrainian = ['Ще не вечір', 'Мрія їде додому', 'Ми разом', 'Привіт'].join('\n');
  assert.equal(detectLanguage(ukrainian), 'uk');
});

test('mixed song: each line romanized by its own language', async () => {
  const { romanizeLyrics } = await import('../src/romanizer/index.js');
  const song = { sections: [{ name: null, lines: ['Мы идём домой', 'Гей, ще не вечір', 'Гора'] }] };
  const out = romanizeLyrics(song, 'ru');
  // Russian line: и → i, ы → y; Ukrainian line: г → h, щ → shch; neutral line: song language (ru: г → g)
  assert.deepEqual(out.sections[0].lines, ['My idyom domoy', 'Hei, shche ne vechir', 'Gora']);
});

test('a line with only "і" stays Belarusian inside a Belarusian song', async () => {
  const { romanizeMixed } = await import('../src/romanizer/index.js');
  assert.equal(romanizeMixed('Сінь і соль', 'be'), "Sin' i sol'");
  assert.equal(romanizeMixed('Сінь і сіль', 'uk'), 'Sin i sil');
});
