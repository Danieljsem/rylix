import { searchAll } from './search/index.js';
import { romanizeLyrics, romanizeLine } from './romanizer/index.js';
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

  const romanized = romanizeLyrics(original);
  const validation = validateRomanization(original, romanized);
  const providers = new Set(candidates.map((c) => c.source.provider));

  const syncedSource = candidates.find((c) => c.synced?.length);
  const synced = syncedSource
    ? syncedSource.synced.map((e) => ({ ...e, romanized: romanizeLine(e.text) }))
    : null;

  return {
    found: true,
    artist: base.artist,
    title: base.title,
    original,
    romanized,
    text: { original: formatLyrics(original), romanized: formatLyrics(romanized) },
    synced,
    source: base.source,
    alternatives: others.map((c, i) => ({ ...c.source, agreement: agreements[i] })),
    confidence: confidenceLevel(providers.size, agreements, validation.valid),
    stats: { originalLines: validation.originalLines, romanizedLines: validation.romanizedLines },
    uncertain: uncertain.map((u) => ({ ...u, romanized: romanizeLine(u.text) })),
    valid: validation.valid,
    validationErrors: validation.errors,
    rejected,
    errors,
  };
}
