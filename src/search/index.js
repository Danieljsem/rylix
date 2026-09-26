import { searchLrclib } from './providers/lrclib.js';
import { searchGenius } from './providers/genius.js';
import { latinToCyrillic, hasLatin, stripParenthetical } from './reverse.js';
import { primaryArtist } from '../nowplaying/clean.js';
import { titlePrecision } from './match.js';
import { wordAgreement, flattenLines } from '../validator/index.js';

// Spellings of the query to try: as typed, the first of several artists
// ("A & B" → "A"), then Cyrillic guesses if typed in Latin.
// A leading "E" is ambiguous (Егор vs. Это), so both readings are tried.
export function queryVariants({ artist, title }) {
  const variants = [{ artist, title }];
  const first = primaryArtist(artist);
  if (first) variants.push({ artist: first, title });
  if (hasLatin(artist) || hasLatin(title)) {
    for (const initialE of ['е', 'э']) {
      const guess = (s) => (hasLatin(s) ? latinToCyrillic(s, { initialE }) : s);
      const v = { artist: guess(artist), title: guess(title) };
      if (!variants.some((x) => x.artist === v.artist && x.title === v.title)) variants.push(v);
    }
  }
  return variants;
}

const namesOf = (candidates) =>
  candidates.map((c) => ({ artist: stripParenthetical(c.artist), title: stripParenthetical(c.title) }));

const lineTexts = (c) => flattenLines(c).map((l) => l.text);

// Two sources found the same song if their texts agree at least half-way.
export const sameSong = (a, b) => wordAgreement(lineTexts(a), lineTexts(b)) >= 0.5;

// Order matters: each provider can hand the exact (usually Cyrillic) names it found
// to the next one. One failing provider never stops the others.
export async function searchAll(query, options = {}) {
  const variants = queryVariants(query);
  const errors = [];
  const rejected = [];
  const run = async (provider, fn) => {
    try {
      return await fn();
    } catch (err) {
      errors.push({ provider, message: err?.message ?? String(err) });
      return [];
    }
  };
  const lrclibSearch = (queries) => run('lrclib', () => searchLrclib(queries, options));
  const geniusSearch = (queries) => run('genius', () => searchGenius(queries, options));

  let lrclib = await lrclibSearch(variants);
  let genius = await geniusSearch([...variants, ...namesOf(lrclib)]);
  if (lrclib.length === 0 && genius.length > 0) lrclib = await lrclibSearch(namesOf(genius));

  // Different songs (e.g. two songs with "осень" in the title): keep the one whose title
  // fits the query best, ask the other provider again with its exact names.
  if (lrclib.length > 0 && genius.length > 0 && !sameSong(lrclib[0], genius[0])) {
    const precision = (c) => Math.max(...variants.map((v) => titlePrecision(v.title, c.title)));
    const trustGenius = precision(genius[0]) >= precision(lrclib[0]);
    const [trusted, doubted] = trustGenius ? [genius, lrclib] : [lrclib, genius];
    const retry = trustGenius ? await lrclibSearch(namesOf(genius)) : await geniusSearch(namesOf(lrclib));
    const replacement = retry.filter((c) => sameSong(c, trusted[0]));

    rejected.push(...doubted.map((c) => ({ ...c.source, title: c.title, reason: 'different song' })));
    if (trustGenius) lrclib = replacement;
    else genius = replacement;
  }

  return { candidates: [...lrclib, ...genius], errors, rejected };
}
