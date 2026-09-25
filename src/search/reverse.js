// Latin → Cyrillic, used ONLY to build search queries when the user types in Latin
// ("Kino Gruppa krovi", "DDT Osen", Czech-style "Žemčug"). It is a guess, never shown
// as lyrics. Accepts both English-style (zh, kh, ya) and Czech-style (ž, ch→ч, ja) input.

const MULTI = [
  ['shch', 'щ'], ['sch', 'щ'], ['zh', 'ж'], ['kh', 'х'], ['ts', 'ц'], ['ch', 'ч'], ['sh', 'ш'],
  ['yu', 'ю'], ['ya', 'я'], ['yo', 'ё'], ['ye', 'е'], ['ju', 'ю'], ['ja', 'я'], ['jo', 'ё'], ['je', 'е'],
];
const SINGLE = {
  a: 'а', b: 'б', c: 'ц', d: 'д', e: 'е', f: 'ф', g: 'г', h: 'х', i: 'и', j: 'й', k: 'к', l: 'л',
  m: 'м', n: 'н', o: 'о', p: 'п', q: 'к', r: 'р', s: 'с', t: 'т', u: 'у', v: 'в', w: 'в', x: 'кс',
  z: 'з', č: 'ч', š: 'ш', ž: 'ж', ř: 'р', "'": 'ь', '’': 'ь',
};
const CYR_VOWELS = new Set('аеёиоуыэюя');
const isLatinLetter = (ch) => ch !== undefined && /[a-zčšžř]/.test(ch);

export function latinToCyrillic(text) {
  // Keep č š ž ř (they map to letters); strip other accents (á → a, ě → e).
  const src = text
    .toLowerCase()
    .normalize('NFC')
    .replace(/[^\sčšžř]/g, (ch) => ch.normalize('NFD').replace(/[̀-ͯ]/g, ''));
  let out = '';
  let i = 0;
  while (i < src.length) {
    const wordStart = !isLatinLetter(src[i - 1]);
    const multi = MULTI.find(([lat]) => src.startsWith(lat, i));
    if (multi) {
      out += multi[1];
      i += multi[0].length;
      continue;
    }
    const ch = src[i];
    if (ch === 'e' && wordStart) {
      out += 'э';
    } else if (ch === 'y') {
      // "moy", "kray" → й after a vowel; "my", "novyy" → ы after a consonant.
      const prev = out[out.length - 1];
      out += wordStart || CYR_VOWELS.has(prev) ? 'й' : 'ы';
    } else {
      out += SINGLE[ch] ?? ch;
    }
    i++;
  }
  return out;
}

export const hasLatin = (text) => /[a-z]/i.test(text);

// "ДДТ (DDT)" → "ДДТ", "Осень, мёртвые дожди (Autumn, dead rain)" → "Осень, мёртвые дожди"
export const stripParenthetical = (name) => name.replace(/\s*\([^)]*\)/g, '').trim();
