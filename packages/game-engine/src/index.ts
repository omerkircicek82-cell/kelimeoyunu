import { MAX_ATTEMPTS, ROUND_MS, TURKISH_ALPHABET, WORD_LENGTH, type Mark } from '@arena/shared';

export { MAX_ATTEMPTS as ATTEMPTS, ROUND_COUNT as ROUNDS, ROUND_MS, normalizeWord } from '@arena/shared';
export const COUNTDOWN_MS = 3_000;
export const INTERMISSION_MS = 5_000;
const wordPattern = new RegExp(`^[${TURKISH_ALPHABET}]{${WORD_LENGTH}}$`, 'u');

export function isTurkishWord(value: string): boolean {
  return wordPattern.test(value);
}

export function evaluateGuess(answer: string, guess: string): Mark[] {
  const marks: Mark[] = Array(WORD_LENGTH).fill('absent');
  const remaining = new Map<string, number>();

  for (let index = 0; index < WORD_LENGTH; index++) {
    const letter = answer[index];
    if (guess[index] === letter) {
      marks[index] = 'correct';
    } else {
      remaining.set(letter, (remaining.get(letter) ?? 0) + 1);
    }
  }

  for (let index = 0; index < WORD_LENGTH; index++) {
    if (marks[index] === 'correct') continue;
    const letter = guess[index];
    const count = remaining.get(letter) ?? 0;
    if (count > 0) {
      marks[index] = 'present';
      remaining.set(letter, count - 1);
    }
  }

  return marks;
}

export function calculatePoints(remainingMs: number, attempt: number): number {
  const timeBonus = Math.floor(Math.min(ROUND_MS, Math.max(0, remainingMs)) * 300 / ROUND_MS);
  const attemptBonus = (MAX_ATTEMPTS - attempt) * 50;
  return 500 + timeBonus + attemptBonus;
}

export interface Stats {
  points: number;
  solved: number;
  solveMs: number;
  attempts: number;
}

export function compareStats(a: Stats, b: Stats): number {
  return b.points - a.points || b.solved - a.solved || a.solveMs - b.solveMs || a.attempts - b.attempts;
}

export function rankPlayers<T extends Stats>(players: readonly T[]): (T & { rank: number })[] {
  let rank = 1;
  const sorted = [...players].sort(compareStats);
  return sorted.map((player, index) => {
    if (index > 0 && compareStats(sorted[index - 1], player) !== 0) rank = index + 1;
    return { ...player, rank };
  });
}
