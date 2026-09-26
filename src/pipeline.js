import { searchAll } from './search/index.js';
import { romanizeLyrics, romanizeLine, detectLanguage, needsRomanization } from './romanizer/index.js';
import { chooseBase, compareVersions, confidenceLevel, validateRomanization } from './validator/index.js';
import { formatLyrics } from './formatter/index.js';

export async function lookupLyrics({ artist, title }, options = {}) {
  const { candidates, errors, rejected } = await searchAll({ artist, title }, options);
  if (candidates.length === 0) {
    return { found: false, errors, rejected };
  }

  const baseIndex = chooseBase(candidates);
  const base = candidates[baseIndex];
  const others = candidates.filter((_, i) => i !== baseIndex);
  const { structure: original, agreements, uncertain } = compareVersions(base, others);

  // Russian, Ukrainian, Belarusian → Latin; any other language is shown as is.
  const language = detectLanguage(formatLyrics(original));
  const romanize = needsRomanization(language);
  const toLatin = (s) => (romanize ? romanizeLine(s, language) : s);
  const romanized = romanizeLyrics(original, language);
  const validation = validateRomanization(original, romanized);
  const providers = new Set(candidates.map((c) => c.source.provider));

  const syncedSource = candidates.find((c) => c.synced?.length);
  const synced = syncedSource
    ? syncedSource.synced.map((e) => ({ ...e, romanized: toLatin(e.text) }))
    : null;

  return {
    found: true,
    artist: base.artist,
    title: base.title,
    original,
    romanized,
    text: { original: formatLyrics(original), romanized: formatLyrics(romanized) },
    synced,
    art: candidates.find((c) => c.art)?.art ?? null,
    source: base.source,
    alternatives: others.map((c, i) => ({ ...c.source, agreement: agreements[i] })),
    confidence: confidenceLevel(providers.size, agreements, validation.valid),
    stats: { originalLines: validation.originalLines, romanizedLines: validation.romanizedLines },
    uncertain: uncertain.map((u) => ({ ...u, romanized: toLatin(u.text) })),
    language,
    romanize,
    valid: validation.valid,
    validationErrors: validation.errors,
    rejected,
    errors,
  };
}
