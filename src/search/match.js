import { romanizeLine } from '../romanizer/index.js';

// Compares in Latin so that "Kino" matches "КИНО" and "Gruppa krovi" matches "Группа крови".
export const toTokens = (text) =>
  romanizeLine(text.toLowerCase().replace(/ё/g, 'е'))
    .replace(/'/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

// Fraction of query tokens found in the candidate text (0–1).
export function matchScore(query, candidate) {
  const q = toTokens(query);
  if (q.length === 0) return 0;
  const c = new Set(toTokens(candidate));
  return q.filter((t) => c.has(t)).length / q.length;
}

// How much of the candidate title is explained by the query (0–1), ignoring
// "(English translation)" style suffixes: "Osen" fits "Осень" better than "Что такое осень".
export function titlePrecision(queryTitle, candidateTitle) {
  const c = toTokens(candidateTitle.replace(/\s*\([^)]*\)/g, ''));
  if (c.length === 0) return 0;
  const q = new Set(toTokens(queryTitle));
  return c.filter((t) => q.has(t)).length / c.length;
}
