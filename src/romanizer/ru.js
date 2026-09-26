// Cyrillic → Latin for Russian, Ukrainian and Belarusian (see README, section 5).
// Pure function of a single line: never adds, removes or reorders characters
// other than the letter-by-letter replacement described below.
//
//   ru  "ru-practical" (BGN/PCGN without diacritics): е → ye/e, ё → yo, ь → '
//   uk  official Ukrainian national system (KMU 2010): г → h, и → y, і → i,
//       є/ї/й/ю/я → ye/yi/y/yu/ya at word start, ie/i/i/iu/ia elsewhere, ь and ' dropped
//   be  practical Belarusian (BGN/PCGN without diacritics): г → h, ў → w, ь → '

const RU = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y',
  э: 'e', ю: 'yu', я: 'ya', ь: "'", ъ: "'",
};
const UK = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'y', і: 'i',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ь: '',
};
const UK_IOTATED = { є: ['ye', 'ie'], ї: ['yi', 'i'], й: ['y', 'i'], ю: ['yu', 'iu'], я: ['ya', 'ia'] };
const BE = {
  а: 'a', б: 'b', в: 'v', г: 'h', ґ: 'g', д: 'd', ж: 'zh', з: 'z', і: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ў: 'w', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', ы: 'y', ь: "'", э: 'e', ю: 'yu', я: 'ya',
};

const VOWELS = new Set('аеёиоуыэюяіїє');
const SIGNS = new Set('ьъ');
const HUSHING = new Set('жшчщц');
const APOSTROPHES = new Set(["'", '’', 'ʼ']);

export const LANGUAGES = ['ru', 'uk', 'be'];

const isCyrillicLetter = (ch) => ch !== undefined && /[а-яёіїєґў]/i.test(ch);
const isUpper = (ch) => ch !== ch.toLowerCase();

// Character before `i`, looking through a Ukrainian/Belarusian apostrophe (м'ята, п'ю).
function prevLetter(chars, i) {
  const p = chars[i - 1];
  if (APOSTROPHES.has(p) && isCyrillicLetter(chars[i - 2])) return { ch: chars[i - 2], afterApostrophe: true };
  return { ch: p, afterApostrophe: false };
}

function ruLetter(ch, chars, i) {
  const prev = chars[i - 1];
  const p = prev?.toLowerCase();
  if (ch === 'е') return !isCyrillicLetter(prev) || VOWELS.has(p) || SIGNS.has(p) ? 'ye' : 'e';
  if (ch === 'ё') return HUSHING.has(p) ? 'o' : 'yo';
  // Ukrainian/Belarusian letters that sometimes appear in Russian-tagged text.
  return RU[ch] ?? UK[ch] ?? BE[ch] ?? ch;
}

function ukLetter(ch, chars, i) {
  const { ch: prev } = prevLetter(chars, i);
  const wordStart = !isCyrillicLetter(prev);
  if (UK_IOTATED[ch]) return UK_IOTATED[ch][wordStart ? 0 : 1];
  if (ch === 'г' && prev?.toLowerCase() === 'з') return 'gh'; // зг → zgh (not zh)
  return UK[ch] ?? RU[ch] ?? ch;
}

function beLetter(ch, chars, i) {
  const { ch: prev, afterApostrophe } = prevLetter(chars, i);
  const p = prev?.toLowerCase();
  const soft = !isCyrillicLetter(prev) || afterApostrophe || VOWELS.has(p) || p === 'ь' || p === 'ў';
  if (ch === 'е') return soft ? 'ye' : 'e';
  if (ch === 'ё') return 'yo';
  return BE[ch] ?? RU[ch] ?? ch;
}

const PROFILE = { ru: ruLetter, uk: ukLetter, be: beLetter };

// Uppercase letter inside an ALL-CAPS word → whole digraph uppercase (ЖУК → ZHUK),
// otherwise only the first letter (Жук → Zhuk).
function isAllCapsContext(chars, i) {
  const next = chars[i + 1];
  const prev = chars[i - 1];
  if (isCyrillicLetter(next)) return isUpper(next);
  if (isCyrillicLetter(prev)) return isUpper(prev);
  return false;
}

export function romanizeLine(line, lang = 'ru') {
  const letter = PROFILE[lang] ?? PROFILE.ru;
  const chars = [...line];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    // Ukrainian/Belarusian apostrophe inside a word only marks separation; it is dropped.
    if (lang !== 'ru' && APOSTROPHES.has(ch) && isCyrillicLetter(chars[i - 1]) && isCyrillicLetter(chars[i + 1])) {
      continue;
    }
    if (!isCyrillicLetter(ch)) {
      out += ch;
      continue;
    }
    const latin = letter(ch.toLowerCase(), chars, i);
    if (!isUpper(ch) || latin === '') {
      out += latin;
    } else if (isAllCapsContext(chars, i)) {
      out += latin.toUpperCase();
    } else {
      out += latin.charAt(0).toUpperCase() + latin.slice(1);
    }
  }
  return out;
}

export const hasCyrillic = (text) => /[а-яёіїєґў]/i.test(text);

// Share of Cyrillic among all letters (0–1). Used to tell original lyrics from
// already romanized ones, which some sources store under the same song.
export function cyrillicShare(text) {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  return letters.filter((ch) => /[а-яёіїєґў]/i.test(ch)).length / letters.length;
}

export const isOriginalCyrillic = (text) => cyrillicShare(text) >= 0.8;

// Language of one line from letters only one language uses, or null if the line
// has none of them (then the song's language applies).
//   uk: ї є ґ, or і without ы/э      be: ў, or і together with ы/э
//   ru: ъ, or ы/э together with и (Belarusian has no и, Ukrainian no ы/э)
export function lineLanguage(line) {
  const count = (re) => (line.match(re) ?? []).length;
  if (count(/ў/gi)) return 'be';
  if (count(/[їєґ]/gi)) return 'uk';
  const i = count(/і/gi);
  const yE = count(/[ыэ]/gi);
  if (i && !yE) return 'uk';
  if (i && yE) return 'be';
  if (count(/ъ/gi)) return 'ru';
  if (yE && count(/и/gi)) return 'ru';
  return null;
}

// 'ru' | 'uk' | 'be' for Cyrillic lyrics, 'other' for anything else (Czech, English, …),
// which is shown as is. The song's language is the one most of its lines show,
// so a single borrowed word never flips a whole song.
export function detectLanguage(text) {
  if (cyrillicShare(text) < 0.3) return 'other';
  const votes = { ru: 0, uk: 0, be: 0 };
  for (const line of text.split(/\r?\n/)) {
    const lang = lineLanguage(line);
    if (lang) votes[lang]++;
  }
  const [best, n] = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  return n > 0 ? best : 'ru';
}

// Romanizes a line with its own language when it shows one (mixed ru/uk songs),
// otherwise with the song's language.
export function romanizeMixed(line, songLang) {
  let lang = lineLanguage(line) ?? songLang;
  // "і" alone fits Ukrainian and Belarusian alike: in a Belarusian song, stay Belarusian.
  if (lang === 'uk' && songLang === 'be' && !/[їєґ]/i.test(line)) lang = 'be';
  return romanizeLine(line, lang);
}
