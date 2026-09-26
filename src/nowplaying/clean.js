// Turns what a player reports into a clean { artist, title } lyrics query.
//   Spotify:  "Song - Remastered 2011", "Song (feat. X)"
//   YouTube:  artist = channel ("KinoVEVO", "Кино - Topic"), title = "Кино - Song (Official Video)"

const TITLE_NOISE = [
  /\s*[([](?:official|officia?l'?nyy|офиц|lyric|lyrics|текст|клип|video|videoclip|audio|visuali[sz]er|премьера|premiere|hd|hq|4k|mv|m\/v|live|концерт)[^)\]]*[)\]]/giu,
  /\s*[([](?:feat\.?|ft\.?|при уч\.?|prod\.?)[^)\]]*[)\]]/giu,
  /\s+(?:feat\.?|ft\.?)\s+.*$/iu,
  /\s+-\s+(?:remaster(?:ed)?|remastered \d{4}|\d{4} remaster(?:ed)?|live|mono|stereo|radio edit|single version|original mix|bonus track)\b.*$/iu,
  /\s*[([](?:remaster(?:ed)?|\d{4} remaster(?:ed)?|mono|stereo|radio edit|single version|original mix)[^)\]]*[)\]]/giu,
  /\s*\|\s*.*$/u,
];

const CHANNEL_NOISE = /\s*(?:VEVO|- Topic|Official|Music|TV|Records)\s*$/i;
const BROWSER_APPS = /chrome|msedge|firefox|opera|brave|vivaldi|browser/i;

function cleanTitle(title) {
  let t = title;
  for (const re of TITLE_NOISE) t = t.replace(re, '');
  return t.replace(/\s+/g, ' ').replace(/[\s\-–—:]+$/u, '').trim();
}

// "Sheen & Jickson" stays whole; additional query variants are built later.
function cleanArtist(artist) {
  return artist.replace(CHANNEL_NOISE, '').replace(/\s+/g, ' ').trim();
}

export function trackQuery({ app = '', artist = '', title = '' }) {
  let a = artist ?? '';
  let t = title ?? '';

  // Video-style title "Artist - Song": trust it for browsers and channel-like artists.
  const split = t.match(/^(.+?)\s+[-–—]\s+(.+)$/u);
  if (split && (BROWSER_APPS.test(app) || !a || CHANNEL_NOISE.test(a))) {
    a = split[1];
    t = split[2];
  }

  const query = { artist: cleanArtist(a), title: cleanTitle(t) };
  return query.artist && query.title ? query : null;
}

// First artist of "A, B", "A & B", "A feat. B", "A x B" — used as an extra search variant.
export function primaryArtist(artist) {
  const first = artist.split(/\s*(?:,|&|\bfeat\.?|\bft\.?|\bx\b|\bи\b|\/)\s*/iu)[0].trim();
  return first && first !== artist ? first : null;
}
