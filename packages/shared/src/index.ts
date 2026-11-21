export const ROUND_COUNT = 5;
export const ROUND_MS = 90_000;
export const FINAL_GUESS_MS = 30_000;
export const ROUND_MODES = ["timed", "untimed"] as const;
export type RoundMode = (typeof ROUND_MODES)[number];
export const DEFAULT_ROUND_MODE: RoundMode = "timed";
export const MAX_ATTEMPTS = 5;
export const WORD_LENGTH = 5;
export const TURKISH_ALPHABET = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZÂÎÛ";
export const CLOSENESS_CORRECT_POINTS = 50;
export const CLOSENESS_PRESENT_POINTS = 25;

export function normalizeWord(value: string) {
  return value.trim().normalize("NFC").toLocaleUpperCase("tr-TR");
}

export type Phase = "lobby" | "countdown" | "round" | "intermission" | "finished";
export type Mark = "correct" | "present" | "absent";
export type PlayerStatus = "playing" | "solved" | "exhausted" | "timeout" | "disconnected";

export interface ClosenessScore {
  correct: number;
  present: number;
  points: number;
}

export function scoreCloseness(marks: readonly Mark[]): ClosenessScore {
  const correct = marks.filter(mark => mark === "correct").length;
  const present = marks.filter(mark => mark === "present").length;
  return {
    correct,
    present,
    points: correct * CLOSENESS_CORRECT_POINTS + present * CLOSENESS_PRESENT_POINTS,
  };
}

export interface Guess {
  word: string;
  marks: Mark[];
}

export interface PlayerView {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  rank: number;
  points: number;
  solved: number;
  solveMs: number;
  attempts: number;
  fastestMs: number | null;
  fastestWord: string | null;
  status: PlayerStatus;
  roundPoints: number;
  roundCloseness?: ClosenessScore;
  roundAttempts: number;
  roundSolveMs: number | null;
}

export interface RoomView {
  code: string;
  name: string;
  maxPlayers: number;
  hostId: string;
  playerId: string;
  phase: Phase;
  roundMode: RoundMode;
  finalCountdown: boolean;
  matchId: string | null;
  round: number;
  deadline: number | null;
  serverNow: number;
  players: PlayerView[];
  guesses: Guess[];
  answer: string | null;
}

export interface RoomTicket {
  token: string;
  room: RoomView;
}

export interface GuessRequest {
  matchId: string;
  round: number;
  requestId: string;
  word: string;
}

export type Reply<T extends object = Record<never, never>> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

export interface Requests {
  "room:create": { playerName: string; name?: string; maxPlayers: number; roundMode?: RoundMode };
  "room:join": { playerName: string; code: string };
  "room:resume": { code: string; token: string };
  "room:leave": Record<string, never>;
  "room:player-ready": { ready: boolean };
  "room:player-kick": { playerId: string };
  "room:settings": { name: string; maxPlayers: number; roundMode?: RoundMode };
  "game:start": Record<string, never>;
  "game:restart": Record<string, never>;
  "game:submit-guess": GuessRequest;
}

type TicketEvent = "room:create" | "room:join" | "room:resume";

export type ResponseFor<Event extends keyof Requests> = Event extends TicketEvent
  ? Reply<RoomTicket>
  : Event extends "game:submit-guess" ? Reply<{ guess: Guess }> : Reply;

export type ClientEvents = {
  [Event in keyof Requests]: (request: Requests[Event], ack: (reply: ResponseFor<Event>) => void) => void;
};

export interface ServerEvents {
  "room:update": (room: RoomView) => void;
  "room:removed": (message: { error: string }) => void;
  "game:countdown": (state: PublicPhase) => void;
  "game:round-start": (state: PublicPhase) => void;
  "game:guess-result": (guess: Guess) => void;
  "game:player-status": (players: PlayerView[]) => void;
  "game:score-update": (players: PlayerView[]) => void;
  "game:round-end": (state: PublicPhase & { answer: string }) => void;
  "game:match-end": (state: PublicPhase) => void;
  "player:connected": (player: { playerId: string }) => void;
  "player:disconnected": (player: { playerId: string }) => void;
  "player:reconnected": (player: { playerId: string }) => void;
}

export type PublicPhase = Pick<RoomView, "round" | "deadline" | "serverNow">;

export const INITIAL_RATING = 1_000;
export const RATING_ROUND_POINTS = 24;
export const RATING_GREEN_POINTS = 3;
export const RATING_YELLOW_POINTS = 1;
export const SOLO_TICKET_LIMIT = 8;

export interface AccountProfile {
  id: string;
  username: string;
  rating: number;
  ratedGames: number;
}

export interface AuthReply {
  token: string;
  profile: AccountProfile;
}

export interface LeaderboardEntry extends Omit<AccountProfile, "id"> {
  rank: number;
}

export interface SoloChallengeTicket {
  id: string;
  answer: string;
  expiresAt: number;
}

export interface SoloResultRequest {
  challengeId: string;
  roundMode: RoundMode;
  guesses: string[];
  expired: boolean;
}

export function ratedRoundDelta(guesses: readonly Guess[], solved: boolean) {
  const best = Math.max(0, ...guesses.map(guess => {
    const { correct, present } = scoreCloseness(guess.marks);
    return correct * RATING_GREEN_POINTS + present * RATING_YELLOW_POINTS;
  }));
  return (solved ? RATING_ROUND_POINTS : -RATING_ROUND_POINTS) + best;
}
