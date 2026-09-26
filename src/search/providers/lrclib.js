// LRCLIB (https://lrclib.net) — free, no API key; plain and time-synced lyrics.
import { parseLyrics, parseLrc } from '../../parser/index.js';
import { isOriginalCyrillic } from '../../romanizer/index.js';
import { matchScore, titlePrecision } from '../match.js';

const API = 'https://lrclib.net/api';
const HEADERS = { 'User-Agent': 'rylix/0.1 (personal lyrics romanizer)' };

async function getJson(fetchImpl, params) {
  const res = await fetchImpl(`${API}/search?${new URLSearchParams(params)}`, { headers: HEADERS });
  if (!res.ok) throw new Error(`LRCLIB HTTP ${res.status}`);
  return res.json();
}

function pickBest(results, { artist, title }) {
  let usable = results.filter((r) => !r.instrumental && r.plainLyrics);
  // A Cyrillic song is sometimes stored a second time already romanized: prefer the original.
  const cyrillic = usable.filter((r) => isOriginalCyrillic(r.plainLyrics));
  const matching = (list) => list.filter((r) => Math.min(matchScore(artist, r.artistName), matchScore(title, r.trackName)) >= 0.5);
  if (matching(cyrillic).length > 0) usable = cyrillic;
  return usable
    .map((r) => ({
      r,
      score: Math.min(matchScore(artist, r.artistName), matchScore(title, r.trackName)),
      precision: titlePrecision(title, r.trackName),
    }))
    .filter(({ score }) => score >= 0.5)
    // Best name match first, then the most exact title; among equals prefer time-synced lyrics.
    .sort((a, b) => b.score - a.score || b.precision - a.precision
      || Boolean(b.r.syncedLyrics) - Boolean(a.r.syncedLyrics))[0]?.r;
}

// `queries` — spellings to try in order; the first one that yields a match wins.
export async function searchLrclib(queries, { fetch: fetchImpl = fetch } = {}) {
  for (const q of queries) {
    let best = pickBest(await getJson(fetchImpl, { track_name: q.title, artist_name: q.artist }), q);
    best ??= pickBest(await getJson(fetchImpl, { q: `${q.artist} ${q.title}` }), q);
    if (best) {
      return [{
        artist: best.artistName,
        title: best.trackName,
        source: { provider: 'lrclib', url: `https://lrclib.net/api/get/${best.id}` },
        sections: parseLyrics(best.plainLyrics).sections,
        synced: best.syncedLyrics ? parseLrc(best.syncedLyrics) : null,
      }];
    }
  }
  return [];
}
