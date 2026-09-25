import { romanizeLine } from '../romanizer/index.js';

// Everything is compared in Latin, so "Kino" matches "КИНО" and "budilnik" matches
// "Будильник". Czech-style input (č, š, ž) is folded to the English-style digraphs.
export const toTokens = (text) =>
  romanizeLine(text.toLowerCase().replace(/ё/g, 'е'))
    .replace(/č/g, 'ch').replace(/š/g, 'sh').replace(/ž/g, 'zh').replace(/ř/g, 'r')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

// Spelling-independent key: people write the same Russian sound in many ways
// (Kreed / Krid, Yegor / Egor, Khleb / Hleb, Tsoy / Coy).
const soundKey = (t) =>
  t
    .replace(/ee|ie|ii|iy|yi/g, 'i')
    .replace(/oo|ou/g, 'u')
    .replace(/kh/g, 'h')
    .replace(/ts|tz/g, 'c')
    .replace(/w/g, 'v')
    .replace(/x/g, 'ks')
    .replace(/ck/g, 'k')
    .replace(/^ye/, 'e')
    .replace(/y/g, 'i')
    .replace(/j/g, 'i')
    .replace(/(.)\1+/g, '$1');

function levenshtein(a, b) {
  if (a === b) return 0;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[b.length];
}

// Tokens match exactly, by sound key, or with a small typo allowance for longer words.
export function tokensMatch(a, b) {
  if (a === b) return true;
  const ka = soundKey(a);
  const kb = soundKey(b);
  if (ka === kb) return true;
  const len = Math.min(ka.length, kb.length);
  const tolerance = len >= 9 ? 2 : len >= 5 ? 1 : 0;
  return tolerance > 0 && levenshtein(ka, kb) <= tolerance;
}

const containsToken = (tokens, t) => tokens.some((c) => tokensMatch(t, c));

// Fraction of query tokens found in the candidate text (0–1).
export function matchScore(query, candidate) {
  const q = toTokens(query);
  if (q.length === 0) return 0;
  const c = toTokens(candidate);
  return q.filter((t) => containsToken(c, t)).length / q.length;
}

// How much of the candidate title is explained by the query (0–1), ignoring
// "(English translation)" style suffixes: "Osen" fits "Осень" better than "Что такое осень".
export function titlePrecision(queryTitle, candidateTitle) {
  const c = toTokens(candidateTitle.replace(/\s*\([^)]*\)/g, ''));
  if (c.length === 0) return 0;
  const q = toTokens(queryTitle);
  return c.filter((t) => containsToken(q, t)).length / c.length;
}
