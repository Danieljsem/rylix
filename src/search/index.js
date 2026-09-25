import { searchLrclib } from './providers/lrclib.js';
import { searchGenius } from './providers/genius.js';
import { latinToCyrillic, hasLatin, stripParenthetical } from './reverse.js';
import { titlePrecision } from './match.js';
import { alignLines, flattenLines } from '../validator/index.js';

// Spellings of the query to try: as typed, then a Cyrillic guess if typed in Latin.
export function queryVariants({ artist, title }) {
  const variants = [{ artist, title }];
  if (hasLatin(artist) || hasLatin(title)) {
    variants.push({
      artist: hasLatin(artist) ? latinToCyrillic(artist) : artist,
      title: hasLatin(title) ? latinToCyrillic(title) : title,
    });
  }
  return variants;
}

const namesOf = (candidates) =>
  candidates.map((c) => ({ artist: stripParenthetical(c.artist), title: stripParenthetical(c.title) }));

const lineTexts = (c) => flattenLines(c).map((l) => l.text);

// Two sources found the same song if their texts agree at least half-way.
export const sameSong = (a, b) => alignLines(lineTexts(a), lineTexts(b)).agreement >= 0.5;

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
