export const ROUND_COUNT = 5;
export const ROUND_MS = 90_000;
export const MAX_ATTEMPTS = 5;
export const WORD_LENGTH = 5;
export const TURKISH_ALPHABET = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZÂÎÛ";

export function normalizeWord(value: string) {
  return value.trim().normalize("NFC").toLocaleUpperCase("tr-TR");
}

export type Phase = "lobby" | "countdown" | "round" | "intermission" | "finished";
export type Mark = "correct" | "present" | "absent";
export type PlayerStatus = "playing" | "solved" | "exhausted" | "timeout" | "disconnected";

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
  "room:create": { playerName: string; name?: string; maxPlayers: number };
  "room:join": { playerName: string; code: string };
  "room:resume": { code: string; token: string };
  "room:leave": Record<string, never>;
  "room:player-ready": { ready: boolean };
  "room:player-kick": { playerId: string };
  "room:settings": { name: string; maxPlayers: number };
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
