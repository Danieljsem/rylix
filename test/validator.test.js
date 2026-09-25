// All Cyrillic test phrases are invented for this project.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLine, alignLines, restoreYo, chooseBase, compareVersions,
  confidenceLevel, validateRomanization,
} from '../src/validator/index.js';
import { romanizeLyrics } from '../src/romanizer/index.js';

const s = (name, ...lines) => ({ name, lines });

test('normalizeLine ignores case, punctuation and е/ё', () => {
  assert.equal(normalizeLine('  Тёплый, ВЕТЕР!  '), normalizeLine('теплый ветер'));
});

test('alignLines: identical versions → agreement 1, no gaps', () => {
  const lines = ['Раз', 'Два', 'Два', 'Три'];
  const { agreement, gaps } = alignLines(lines, [...lines]);
  assert.equal(agreement, 1);
  assert.deepEqual(gaps, []);
});

test('alignLines: one changed line produces one gap with the variant', () => {
  const { agreement, gaps } = alignLines(['Раз', 'Два', 'Три'], ['Раз', 'Пять', 'Три']);
  assert.ok(agreement < 1 && agreement > 0.6);
  assert.deepEqual(gaps, [{ base: [1], other: [1] }]);
});

test('restoreYo takes ё spelling only when it is the sole difference', () => {
  assert.equal(restoreYo('Теплый ветер', 'Тёплый ветер'), 'Тёплый ветер');
  assert.equal(restoreYo('Теплый ветер', 'Тёплый ветер!'), 'Теплый ветер');
  assert.equal(restoreYo('Тёплый ветер', 'Теплый ветер'), 'Тёплый ветер');
});

test('compareVersions: matching sources → no uncertain lines, ё restored', () => {
  const base = { sections: [s('Куплет 1', 'Теплый ветер', 'Ель у дома'), s('Припев', 'Пой', 'Пой')] };
  const other = { sections: [s(null, 'Тёплый ветер', 'Ель у дома', 'Пой', 'Пой')] };
  const { structure, uncertain, agreements } = compareVersions(base, [other]);
  assert.deepEqual(uncertain, []);
  assert.deepEqual(agreements, [1]);
  assert.equal(structure.sections[0].lines[0], 'Тёплый ветер');
  assert.equal(structure.sections[0].name, 'Куплет 1');
  assert.equal(base.sections[0].lines[0], 'Теплый ветер', 'input is not mutated');
});

test('compareVersions: differing line is marked uncertain with variants', () => {
  const base = { sections: [s('Куплет 1', 'Раз два', 'Снова утро', 'Три')] };
  const other = { sections: [s(null, 'Раз два', 'Снова вечер', 'Три')] };
  const { uncertain } = compareVersions(base, [other]);
  assert.deepEqual(uncertain, [{
    section: 0, line: 1, text: 'Снова утро', reason: 'differs between sources', variants: ['Снова вечер'],
  }]);
});

test('compareVersions: missing repeated line in another source is flagged, never removed', () => {
  const base = { sections: [s('Припев', 'Пой', 'Пой', 'Пой', 'Конец')] };
  const other = { sections: [s(null, 'Пой', 'Пой', 'Конец')] };
  const { structure, uncertain } = compareVersions(base, [other]);
  assert.equal(structure.sections[0].lines.length, 4);
  assert.equal(uncertain.length, 1);
});

test('compareVersions: an unrelated text does not flag lines', () => {
  const base = { sections: [s(null, 'Раз', 'Два', 'Три')] };
  const other = { sections: [s(null, 'Совсем', 'другая', 'песня')] };
  const { uncertain, agreements } = compareVersions(base, [other]);
  assert.deepEqual(uncertain, []);
  assert.equal(agreements[0], 0);
});

test('chooseBase prefers the version with section headers when it agrees', () => {
  const plain = { sections: [s(null, 'Раз', 'Два', 'Три')] };
  const headed = { sections: [s('Куплет', 'Раз', 'Два'), s('Припев', 'Три')] };
  assert.equal(chooseBase([plain, headed]), 1);
  assert.equal(chooseBase([plain]), 0);
});

test('chooseBase: headed version that disagrees loses to the consensus', () => {
  const a = { sections: [s(null, 'Раз', 'Два', 'Три', 'Четыре')] };
  const b = { sections: [s(null, 'Раз', 'Два', 'Три', 'Четыре')] };
  const wrong = { sections: [s('Куплет', 'Другая', 'песня', 'совсем', 'Четыре')] };
  assert.notEqual(chooseBase([wrong, a, b]), 0);
});

test('confidenceLevel', () => {
  assert.equal(confidenceLevel(2, [0.98], true), 'high');
  assert.equal(confidenceLevel(2, [0.9], true), 'medium');
  assert.equal(confidenceLevel(1, [], true), 'medium');
  assert.equal(confidenceLevel(3, [0.5, 0.6], true), 'low');
  assert.equal(confidenceLevel(2, [1], false), 'low');
});

test('validateRomanization: real romanization passes, tampered output fails', () => {
  const original = { sections: [s('Припев', 'Пой', 'Пой'), s(null, 'Конец')] };
  const ok = validateRomanization(original, romanizeLyrics(original));
  assert.deepEqual(ok, { valid: true, errors: [], originalLines: 3, romanizedLines: 3 });

  const dedup = { sections: [s('Pripev', 'Poy'), s(null, 'Konets')] };
  const bad = validateRomanization(original, dedup);
  assert.equal(bad.valid, false);
  assert.equal(bad.romanizedLines, 2);
});

test('alignLines: different line breaks with the same words count as agreement', () => {
  const base = ['Раз два', 'три четыре', 'Пять'];
  const other = ['Раз два три четыре', 'Пять'];
  const { agreement, gaps, reflows } = alignLines(base, other);
  assert.equal(agreement, 1);
  assert.deepEqual(gaps, []);
  assert.deepEqual(reflows, [{ base: [0, 1], other: [0] }]);
});

test('compareVersions: reflowed lines are not uncertain and keep base line breaks', () => {
  const base = { sections: [s('Куплет', 'Раз два,', 'три четыре', 'Пять')] };
  const other = { sections: [s(null, 'Раз два три четыре', 'Пять')] };
  const { structure, uncertain } = compareVersions(base, [other]);
  assert.deepEqual(uncertain, []);
  assert.deepEqual(structure.sections[0].lines, ['Раз два,', 'три четыре', 'Пять']);
});
