// Line alignment between two versions of the same lyrics (LCS on normalized lines).

// Lowercase, ё→е, drop punctuation, collapse whitespace — so that only real
// wording differences count as disagreement.
export function normalizeLine(line) {
  return line
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// Returns matched index pairs [[i, j], …] in order.
export function lcsPairs(a, b) {
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const pairs = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      pairs.push([i, j]);
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return pairs;
}

// Aligns two raw line arrays. Returns:
//  agreement  0–1 (Dice coefficient of matched lines; reflowed lines count as matched)
//  matches    Map baseIndex → otherIndex for equal lines
//  gaps       [{ base: [indices], other: [indices] }] unmatched stretches between matches
//  reflows    gaps where the same words are only broken into lines differently
export function alignLines(baseLines, otherLines) {
  const a = baseLines.map(normalizeLine);
  const b = otherLines.map(normalizeLine);
  const pairs = lcsPairs(a, b);

  const matches = new Map(pairs);
  const gaps = [];
  const reflows = [];
  let matched = 2 * pairs.length;
  let pi = 0;
  let pj = 0;
  for (const [i, j] of [...pairs, [a.length, b.length]]) {
    if (i > pi || j > pj) {
      const gap = { base: range(pi, i), other: range(pj, j) };
      if (isReflow(gap, a, b)) {
        reflows.push(gap);
        matched += gap.base.length + gap.other.length;
      } else {
        gaps.push(gap);
      }
    }
    pi = i + 1;
    pj = j + 1;
  }
  const total = a.length + b.length;
  const agreement = total === 0 ? 1 : matched / total;
  return { agreement, matches, gaps, reflows };
}

// "Раз два / три" vs "Раз два три" — same words, different line breaks.
function isReflow(gap, a, b) {
  if (gap.base.length === 0 || gap.other.length === 0) return false;
  if (gap.base.length === 1 && gap.other.length === 1) return false;
  const joined = (idx, lines) => idx.map((i) => lines[i]).join('').replace(/\s/g, '');
  return joined(gap.base, a) === joined(gap.other, b);
}

const range = (from, to) => Array.from({ length: to - from }, (_, k) => from + k);
