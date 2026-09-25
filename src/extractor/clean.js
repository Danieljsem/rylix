// Removes lines that are page furniture rather than lyrics.

const JUNK_LINE = [
  /^\d+\s*Contributors?\b/i,
  /^Translations?$/i,
  /^You might also like$/i,
  /^\d*\s*Embed$/i,
  /^See .+ Live$/i,
  /^Get tickets as low as/i,
  /^Read More\b/i,
  /^https?:\/\/\S+$/i,
  /^(©|℗|Copyright\b)/i,
  /^(Lyrics|Текст песни) (provided|licensed) by\b/i,
];

// Header lines like "Some Song Lyrics" only count as junk before the first lyric line.
const LEADING_TITLE = /\bLyrics$/i;

export function cleanLyricsText(text) {
  const lines = text
    .replace(/ /g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .split(/\r?\n/)
    .map((l) => l.trimEnd());

  // Trailing "123Embed" glued to the last lyric line.
  const last = lines.findLastIndex((l) => l.trim() !== '');
  if (last >= 0) lines[last] = lines[last].replace(/\s*\d*Embed$/, '');

  const out = [];
  let started = false;
  for (const line of lines) {
    const t = line.trim();
    if (JUNK_LINE.some((re) => re.test(t))) continue;
    if (!started && t !== '' && LEADING_TITLE.test(t)) continue;
    if (t !== '') started = true;
    out.push(line);
  }

  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}
