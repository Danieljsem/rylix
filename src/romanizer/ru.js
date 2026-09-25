// Russian Cyrillic → Latin, profile "ru-practical" (see README, section 5).
// Pure function of a single line: never adds, removes or reorders characters
// other than the letter-by-letter replacement described below.

const BASE = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ж: 'zh', з: 'z', и: 'i', й: 'y',
  к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ы: 'y',
  э: 'e', ю: 'yu', я: 'ya', ь: "'", ъ: "'",
};

const VOWELS = new Set('аеёиоуыэюя');
const SIGNS = new Set('ьъ');
const HUSHING = new Set('жшчщц');

const isCyrillicLetter = (ch) => ch !== undefined && /[а-яё]/i.test(ch);
const isUpper = (ch) => ch !== ch.toLowerCase();

function lowerLatin(ch, prev) {
  const p = prev?.toLowerCase();
  if (ch === 'е') {
    return !isCyrillicLetter(prev) || VOWELS.has(p) || SIGNS.has(p) ? 'ye' : 'e';
  }
  if (ch === 'ё') {
    return HUSHING.has(p) ? 'o' : 'yo';
  }
  return BASE[ch];
}

// Uppercase letter inside an ALL-CAPS word → whole digraph uppercase (ЖУК → ZHUK),
// otherwise only the first letter (Жук → Zhuk).
function isAllCapsContext(chars, i) {
  const next = chars[i + 1];
  const prev = chars[i - 1];
  if (isCyrillicLetter(next)) return isUpper(next);
  if (isCyrillicLetter(prev)) return isUpper(prev);
  return false;
}

export function romanizeLine(line) {
  const chars = [...line];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (!isCyrillicLetter(ch)) {
      out += ch;
      continue;
    }
    const latin = lowerLatin(ch.toLowerCase(), chars[i - 1]);
    if (!isUpper(ch)) {
      out += latin;
    } else if (isAllCapsContext(chars, i)) {
      out += latin.toUpperCase();
    } else {
      out += latin.charAt(0).toUpperCase() + latin.slice(1);
    }
  }
  return out;
}

export const hasCyrillic = (text) => /[а-яё]/i.test(text);

// Share of Cyrillic among all letters (0–1). Used to tell original lyrics from
// already romanized ones, which some sources store under the same song.
export function cyrillicShare(text) {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  return letters.filter((ch) => /[а-яё]/i.test(ch)).length / letters.length;
}

export const isOriginalCyrillic = (text) => cyrillicShare(text) >= 0.8;
