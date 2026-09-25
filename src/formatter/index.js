// { sections } → plain text: "[Name]" header (if any), its lines, blank line between sections.
export function formatLyrics({ sections }) {
  return sections
    .map((s) => (s.name === null ? s.lines : [`[${s.name}]`, ...s.lines]).join('\n'))
    .join('\n\n');
}

export const countLines = ({ sections }) =>
  sections.reduce((sum, s) => sum + s.lines.length, 0);
