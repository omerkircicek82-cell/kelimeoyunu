import type { Guess } from "./index";

export interface DailyRoundView {
  round: number;
  guesses: Guess[];
  answer: string | null;
  solved: boolean;
  points: number;
}

export interface DailyAttemptView {
  phase: "guessing" | "roundEnd" | "finished";
  round: number;
  rounds: DailyRoundView[];
  solved: number;
  points: number;
}

export interface DailyRank {
  rank: number;
  username: string;
  solved: number;
  points: number;
}

export interface DailyState {
  date: string;
  attempt: DailyAttemptView | null;
  leaderboard: DailyRank[];
  rank: number | null;
}

export interface DailyRoundRequest {
  date: string;
  round: number;
}

export interface DailyGuessRequest extends DailyRoundRequest {
  requestId: string;
  word: string;
}
