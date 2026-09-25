import { romanizeLine } from './ru.js';

export { romanizeLine, hasCyrillic, cyrillicShare, isOriginalCyrillic } from './ru.js';

// Romanizes a parsed lyrics structure 1:1 — same sections, same lines, same order.
export function romanizeLyrics({ sections }) {
  return {
    sections: sections.map((section) => ({
      name: section.name === null ? null : romanizeLine(section.name),
      lines: section.lines.map(romanizeLine),
    })),
  };
}
