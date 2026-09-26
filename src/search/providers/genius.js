// Genius — API for search (needs GENIUS_TOKEN), lyrics come from the song page.
import { parseLyrics } from '../../parser/index.js';
import { extractGeniusLyrics } from '../../extractor/genius.js';
import { matchScore, titlePrecision } from '../match.js';

const API = 'https://api.genius.com';
const PAGE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36',
  'Accept-Language': 'ru,en;q=0.8',
};

// Genius' own romanization/translation pages ("Genius Romanizations", …) are not original
// lyrics, but they link to the original song via a `translation_of` relationship.
const GENIUS_META_ARTIST = /^Genius\b/i;

async function api(fetchImpl, token, path) {
  const res = await fetchImpl(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Genius API HTTP ${res.status}`);
  return (await res.json()).response;
}

const artistText = (r) => `${r.primary_artist?.name ?? ''} ${r.artist_names ?? ''}`;

async function resolveOriginal(fetchImpl, token, metaSong) {
  const { song } = await api(fetchImpl, token, `/songs/${metaSong.id}`);
  const rel = song.song_relationships?.find((x) => x.relationship_type === 'translation_of');
  return rel?.songs?.[0] ?? null;
}

async function findSong(fetchImpl, token, { artist, title }) {
  const { hits } = await api(fetchImpl, token, `/search?${new URLSearchParams({ q: `${artist} ${title}` })}`);
  const songs = hits.filter((h) => h.type === 'song').map((h) => h.result);
  const isMeta = (r) => GENIUS_META_ARTIST.test(r.primary_artist?.name ?? '');

  const scored = songs
    .map((r) => {
      // Meta pages carry the real artist only inside the full title.
      const artistScore = matchScore(artist, isMeta(r) ? r.full_title : artistText(r));
      const titleScore = matchScore(title, r.full_title ?? r.title);
      return { r, score: Math.min(artistScore, titleScore), precision: titlePrecision(title, r.title) };
    })
    .filter(({ score }) => score >= 0.5)
    .sort((a, b) => b.score - a.score || isMeta(a.r) - isMeta(b.r) || b.precision - a.precision);

  for (const { r } of scored) {
    if (!isMeta(r)) return r;
    const original = await resolveOriginal(fetchImpl, token, r);
    if (original && !isMeta(original)) return original;
  }
  return null;
}

const ARTIST_SONG_PAGES = 4; // × 50 most popular songs

// Fallback when "artist title" finds nothing (typical for Latin input like "Egor Kreed
// Budilnik"): find the artist alone — Genius names Russian artists "Егор Крид (Egor Kreed)" —
// then look the title up among the artist's most popular songs.
async function findViaArtist(fetchImpl, token, { artist, title }) {
  const { hits } = await api(fetchImpl, token, `/search?${new URLSearchParams({ q: artist })}`);
  const artists = new Map();
  for (const { type, result } of hits) {
    const a = result.primary_artist;
    if (type === 'song' && a && !GENIUS_META_ARTIST.test(a.name) && matchScore(artist, a.name) === 1) {
      artists.set(a.id, a);
    }
  }

  for (const artistId of artists.keys()) {
    const pages = await Promise.all(
      Array.from({ length: ARTIST_SONG_PAGES }, (_, i) =>
        api(fetchImpl, token, `/artists/${artistId}/songs?sort=popularity&per_page=50&page=${i + 1}`)
          .then((r) => r.songs ?? [])
          .catch(() => [])),
    );
    const best = pages
      .flat()
      .filter((s) => s.primary_artist?.id === artistId)
      .map((s) => ({ s, score: matchScore(title, s.title), precision: titlePrecision(title, s.title) }))
      .filter(({ score }) => score === 1)
      .sort((a, b) => b.precision - a.precision)[0];
    if (best) return best.s;
  }
  return null;
}

// `queries` — spellings to try in order (as typed, Cyrillic guess, names from other providers).
export async function searchGenius(queries, { fetch: fetchImpl = fetch, token } = {}) {
  if (!token) return [];

  let song = null;
  for (const q of queries) {
    song = await findSong(fetchImpl, token, q);
    if (song) break;
  }
  for (const q of song ? [] : queries) {
    song = await findViaArtist(fetchImpl, token, q);
    if (song) break;
  }
  if (!song) return [];

  const page = await fetchImpl(song.url, { headers: PAGE_HEADERS });
  if (!page.ok) throw new Error(`Genius page HTTP ${page.status}`);
  const text = extractGeniusLyrics(await page.text());
  if (!text) return [];

  return [{
    artist: song.primary_artist?.name ?? queries[0].artist,
    title: song.title,
    source: { provider: 'genius', url: song.url },
    art: song.song_art_image_thumbnail_url ?? null,
    sections: parseLyrics(text).sections,
    synced: null,
  }];
}
