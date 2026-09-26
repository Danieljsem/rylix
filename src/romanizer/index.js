import { romanizeMixed, LANGUAGES } from './ru.js';

export {
  romanizeLine, romanizeMixed, hasCyrillic, cyrillicShare, isOriginalCyrillic, detectLanguage, lineLanguage, LANGUAGES,
} from './ru.js';

export const needsRomanization = (lang) => LANGUAGES.includes(lang);

// Romanizes a parsed lyrics structure 1:1 — same sections, same lines, same order.
// Each line uses its own language if it shows one (mixed ru/uk songs), else the song's.
// Lyrics in other languages (lang 'other') come back unchanged.
export function romanizeLyrics({ sections }, lang = 'ru') {
  const convert = needsRomanization(lang) ? (s) => romanizeMixed(s, lang) : (s) => s;
  return {
    sections: sections.map((section) => ({
      name: section.name === null ? null : convert(section.name),
      lines: section.lines.map(convert),
    })),
  };
}
