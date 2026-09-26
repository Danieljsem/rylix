import { romanizeLine, LANGUAGES } from './ru.js';

export { romanizeLine, hasCyrillic, cyrillicShare, isOriginalCyrillic, detectLanguage, LANGUAGES } from './ru.js';

export const needsRomanization = (lang) => LANGUAGES.includes(lang);

// Romanizes a parsed lyrics structure 1:1 — same sections, same lines, same order.
// Lyrics in other languages (lang 'other') come back unchanged.
export function romanizeLyrics({ sections }, lang = 'ru') {
  const convert = needsRomanization(lang) ? (s) => romanizeLine(s, lang) : (s) => s;
  return {
    sections: sections.map((section) => ({
      name: section.name === null ? null : convert(section.name),
      lines: section.lines.map(convert),
    })),
  };
}
