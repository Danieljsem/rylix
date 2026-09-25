import { alignLines } from './diff.js';

export { normalizeLine, alignLines } from './diff.js';

// Flat list of lines with their position in the section structure.
export function flattenLines({ sections }) {
  return sections.flatMap((s, section) => s.lines.map((text, line) => ({ section, line, text })));
}

// If two lines differ only by е/ё, take the ё spelling (character positions are identical).
export function restoreYo(baseLine, otherLine) {
  if (baseLine === otherLine || !/ё/i.test(otherLine)) return baseLine;
  const deYo = (s) => s.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
  if (deYo(baseLine) !== deYo(otherLine)) return baseLine;
  return otherLine;
}

// Picks the base version among candidates:
// a version with section headers wins if it agrees with the rest (≥ 80 %),
// otherwise the one that agrees best with all others.
export function chooseBase(candidates) {
  if (candidates.length === 1) return 0;
  const lines = candidates.map((c) => flattenLines(c).map((l) => l.text));
  const avgAgreement = lines.map((a, i) => {
    const others = lines.filter((_, j) => j !== i);
    return others.reduce((sum, b) => sum + alignLines(a, b).agreement, 0) / others.length;
  });
  const hasHeaders = (c) => c.sections.some((s) => s.name !== null);

  const withHeaders = candidates
    .map((c, i) => i)
    .filter((i) => hasHeaders(candidates[i]) && avgAgreement[i] >= 0.8)
    .sort((x, y) => avgAgreement[y] - avgAgreement[x]);
  if (withHeaders.length > 0) return withHeaders[0];

  return avgAgreement.indexOf(Math.max(...avgAgreement));
}

// Compares the base candidate with all others. Returns the base structure with
// ё restored where another source has it, the uncertain lines, and per-source agreement.
export function compareVersions(base, others) {
  const flat = flattenLines(base);
  const baseTexts = flat.map((l) => l.text);
  const restored = [...baseTexts];
  const uncertain = new Map(); // flat index → { variants: Set }
  const agreements = [];

  for (const other of others) {
    const otherTexts = flattenLines(other).map((l) => l.text);
    const { agreement, matches, gaps } = alignLines(baseTexts, otherTexts);
    agreements.push(agreement);

    for (const [i, j] of matches) restored[i] = restoreYo(restored[i], otherTexts[j]);

    // A completely different text says nothing about individual lines.
    if (agreement < 0.5) continue;
    for (const gap of gaps) {
      for (const [k, i] of gap.base.entries()) {
        const variants = gap.base.length === gap.other.length ? [gap.other[k]] : gap.other;
        const entry = uncertain.get(i) ?? { variants: new Set() };
        variants.forEach((j) => entry.variants.add(otherTexts[j]));
        uncertain.set(i, entry);
      }
    }
  }

  const sections = base.sections.map((s) => ({ name: s.name, lines: [...s.lines] }));
  flat.forEach(({ section, line }, i) => {
    sections[section].lines[line] = restored[i];
  });

  return {
    structure: { sections },
    agreements,
    uncertain: [...uncertain.entries()]
      .sort(([a], [b]) => a - b)
      .map(([i, { variants }]) => ({
        section: flat[i].section,
        line: flat[i].line,
        text: restored[i],
        reason: variants.size === 0 ? 'missing in another source' : 'differs between sources',
        variants: [...variants],
      })),
  };
}

// high: ≥ 2 independent sources agreeing ≥ 95 %; medium: 1 source or 80–95 %; low: otherwise.
export function confidenceLevel(sourceCount, agreements, valid) {
  if (!valid) return 'low';
  if (sourceCount < 2 || agreements.length === 0) return 'medium';
  const best = Math.max(...agreements);
  if (best >= 0.95) return 'high';
  if (best >= 0.8) return 'medium';
  return 'low';
}

// Hard invariants between original and romanized structure.
export function validateRomanization(original, romanized) {
  const errors = [];
  if (original.sections.length !== romanized.sections.length) {
    errors.push(`section count ${original.sections.length} ≠ ${romanized.sections.length}`);
  }
  original.sections.forEach((s, i) => {
    const r = romanized.sections[i];
    if (!r) return;
    if (s.lines.length !== r.lines.length) {
      errors.push(`section ${i + 1}: ${s.lines.length} lines ≠ ${r.lines.length}`);
    }
    if ((s.name === null) !== (r.name === null)) errors.push(`section ${i + 1}: header mismatch`);
  });
  const count = (x) => x.sections.reduce((n, s) => n + s.lines.length, 0);
  return {
    valid: errors.length === 0,
    errors,
    originalLines: count(original),
    romanizedLines: count(romanized),
  };
}
