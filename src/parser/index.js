// Raw lyrics text → { sections: [{ name, lines }] }, and LRC → [{ timeMs, text }].
// Lines are kept exactly as they are (only trailing whitespace is trimmed);
// nothing is merged, split, reordered or deduplicated.

const HEADER = /^\s*\[([^\]]+)\]\s*$/;

export function parseLyrics(text) {
  const sections = [];
  let current = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const header = line.match(HEADER);

    if (header) {
      current = { name: header[1].trim(), lines: [] };
      sections.push(current);
    } else if (line.trim() === '') {
      // A blank line closes an untitled block, and ends a titled one only once it has lines.
      if (current && (current.name === null || current.lines.length > 0)) current = null;
    } else {
      if (!current) {
        current = { name: null, lines: [] };
        sections.push(current);
      }
      current.lines.push(line);
    }
  }

  return { sections };
}

const LRC_TIME = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;

// Standard LRC: "[mm:ss.xx]text", possibly several timestamps per line.
// Metadata tags ([ar:…], [ti:…]) are ignored. Empty text is kept (instrumental gap).
export function parseLrc(lrc) {
  const entries = [];
  for (const rawLine of lrc.split(/\r?\n/)) {
    const times = [...rawLine.matchAll(LRC_TIME)];
    if (times.length === 0) continue;
    const text = rawLine.replace(LRC_TIME, '').trim();
    for (const [, min, sec] of times) {
      const timeMs = Math.round((Number(min) * 60 + Number(sec.replace(':', '.'))) * 1000);
      entries.push({ timeMs, text });
    }
  }
  return entries.sort((a, b) => a.timeMs - b.timeMs);
}
