import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePoints, evaluateGuess, isTurkishWord, normalizeWord, rankPlayers } from './index';

test('correct matches take priority over duplicate letters elsewhere', () => {
  assert.deepEqual(evaluateGuess('KALEM', 'KATAR'), ['correct', 'correct', 'absent', 'absent', 'absent']);
  assert.deepEqual(evaluateGuess('KABAK', 'BAKAR'), ['present', 'correct', 'present', 'correct', 'absent']);
  assert.deepEqual(evaluateGuess('ELMAS', 'ESMER'), ['correct', 'present', 'correct', 'absent', 'absent']);
});

test('normalization preserves dotted and dotless Turkish I and composed characters', () => {
  assert.equal(normalizeWord('  ıslak  '), 'ISLAK');
  assert.equal(normalizeWord('içlik'), 'İÇLİK');
  assert.equal(normalizeWord('c\u0327ic\u0327ek'), 'ÇİÇEK');
  assert.equal(isTurkishWord('IŞIĞI'), true);
  assert.equal(isTurkishWord('İŞIĞQ'), false);
  assert.equal(isTurkishWord('İİİİ'), false);
});

test('circumflex vowels remain distinct and can be used in five-letter guesses', () => {
  assert.equal(normalizeWord('ka\u0302tip'), 'KÂTİP');
  assert.equal(normalizeWord('resmî'), 'RESMÎ');
  assert.equal(normalizeWord('sükûn'), 'SÜKÛN');
  for (const word of ['KÂTİP', 'RESMÎ', 'SÜKÛN']) assert.ok(isTurkishWord(word));
  assert.deepEqual(evaluateGuess('KATİP', 'KÂTİP'), ['correct', 'absent', 'correct', 'correct', 'correct']);
});

test('scoring follows the fixed time and attempt bonuses', () => {
  assert.equal(calculatePoints(60_000, 2), 850);
  assert.equal(calculatePoints(20_000, 4), 616);
  assert.equal(calculatePoints(90_000, 1), 1000);
  assert.equal(calculatePoints(0, 5), 500);
});

test('ranking applies all tie breakers and gives equal entries the same rank', () => {
  const entries = [
    { id: 'attempts', points: 850, solved: 2, solveMs: 20, attempts: 6 },
    { id: 'time', points: 850, solved: 2, solveMs: 30, attempts: 1 },
    { id: 'solved', points: 850, solved: 1, solveMs: 10, attempts: 1 },
    { id: 'points', points: 900, solved: 1, solveMs: 10, attempts: 5 },
    { id: 'tie-a', points: 850, solved: 2, solveMs: 20, attempts: 4 },
    { id: 'tie-b', points: 850, solved: 2, solveMs: 20, attempts: 4 },
  ];
  assert.deepEqual(rankPlayers(entries).map(({ id, rank }) => [id, rank]), [
    ['points', 1], ['tie-a', 2], ['tie-b', 2], ['attempts', 4], ['time', 5], ['solved', 6],
  ]);
});
