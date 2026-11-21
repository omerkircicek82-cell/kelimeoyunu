import { randomInt, randomUUID } from 'node:crypto';
import {
  ATTEMPTS, COUNTDOWN_MS, INTERMISSION_MS, ROUND_MS, ROUNDS,
  calculatePoints, evaluateGuess, isTurkishWord, normalizeWord, rankPlayers,
  type Stats,
} from '@arena/game-engine';
import { scoreCloseness, type ClosenessScore, type Guess, type GuessRequest, type Phase, type PlayerStatus, type PlayerView, type RoomView } from '@arena/shared';

export type Identity = { code: string; playerId: string };
export type Settings = { roomName?: string; maxPlayers?: number };

export interface Clock {
  now(): number;
  setTimer(callback: () => void, delayMs: number): () => void;
}

const systemClock: Clock = {
  now: () => Math.floor(performance.timeOrigin + performance.now()),
  setTimer(callback, delayMs) {
    const timer = setTimeout(callback, delayMs);
    timer.unref();
    return () => clearTimeout(timer);
  },
};

interface RoomMetadata {
  id: string;
  code: string;
  name: string;
  maxPlayers: number;
  hostId: string;
}

interface StoredGuess extends Guess {
  playerId: string;
  attempt: number;
  atMs: number;
}

interface RoundResult {
  playerId: string;
  status: PlayerStatus;
  points: number;
  attempts: number;
  solveMs: number | null;
}

interface Standing extends Stats {
  playerId: string;
  rank: number;
  fastestMs: number | null;
  fastestWord: string | null;
}

export type ArenaEvent =
  | { type: 'player:create'; player: { id: string; name: string } }
  | { type: 'room:create' | 'room:update'; room: RoomMetadata }
  | { type: 'room:participant'; roomId: string; playerId: string }
  | { type: 'match:start'; matchId: string; roomId: string }
  | {
      type: 'round:end';
      roundId: string;
      matchId: string;
      number: number;
      answer: string;
      startedAt: number;
      endedAt: number;
      guesses: StoredGuess[];
      results: RoundResult[];
    }
  | { type: 'match:end'; matchId: string; endedAt: number; results: Standing[] };

export interface ArenaOptions {
  clock?: Clock;
  answers: readonly string[];
  accepted: ReadonlySet<string>;
  reconnectMs?: number;
  onUpdate?: (code: string) => void;
  onPersist?: (event: ArenaEvent) => void;
}

type RoundStatus = Exclude<PlayerStatus, 'disconnected'>;
interface PlayerRound {
  guesses: StoredGuess[];
  status: RoundStatus;
  points: number;
  solveMs: number | null;
  closeness?: ClosenessScore;
}

interface Player extends Stats {
  id: string;
  name: string;
  ready: boolean;
  connected: boolean;
  left: boolean;
  cancelExpiry?: () => void;
  fastestMs: number | null;
  fastestWord: string | null;
  round: PlayerRound;
  seenGuesses: Map<string, StoredGuess>;
}

interface Match {
  id: string;
  answers: string[];
  round: number;
  roundId: string;
  startedAt: number;
}

interface Room extends RoomMetadata {
  players: Map<string, Player>;
  phase: Phase;
  deadline: number | null;
  cancelTimer?: () => void;
  match?: Match;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_MS = 90_000;
const MAX_ROOMS = 2_000;

function newPlayerRound(): PlayerRound {
  return { guesses: [], status: 'playing', points: 0, solveMs: null };
}

export class ArenaError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = 'ArenaError';
  }
}

export class Arena {
  private readonly rooms = new Map<string, Room>();
  private readonly clock: Clock;
  private readonly answers: string[];
  private readonly accepted: ReadonlySet<string>;
  private readonly reconnectMs: number;

  constructor(private readonly options: ArenaOptions) {
    this.clock = options.clock ?? systemClock;
    this.answers = [...new Set(options.answers.map(normalizeWord))];
    if (this.answers.length < ROUNDS || this.answers.some(word => !isTurkishWord(word))) {
      throw new Error('Oyun için en az beş farklı geçerli cevap gerekli.');
    }
    this.accepted = new Set([...options.accepted, ...this.answers]);
    this.reconnectMs = options.reconnectMs ?? RECONNECT_MS;
  }

  create(input: Settings & { name: string }): Identity {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new ArenaError('SERVER_FULL', 'Şu anda yeni oda açılamıyor. Lütfen daha sonra tekrar deneyin.');
    }
    const player = this.newPlayer(input.name);
    const name = this.roomName(input.roomName ?? '') || `${player.name} odası`;
    const maxPlayers = this.capacity(input.maxPlayers ?? 8);
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = {
      id: randomUUID(), code, name, maxPlayers, hostId: player.id,
      players: new Map(), phase: 'lobby', deadline: null,
    };
    this.rooms.set(code, room);
    return this.addPlayer(room, player, true);
  }

  join(input: { code: string; name: string }): Identity {
    const room = this.getRoom(input.code.trim().toUpperCase());
    this.requireLobby(room);
    if (room.players.size >= room.maxPlayers) throw new ArenaError('ROOM_FULL', 'Oda dolu.');
    const player = this.newPlayer(input.name);
    return this.addPlayer(room, player);
  }

  resume(identity: Identity): void {
    const { room, player } = this.member(identity, false);
    player.cancelExpiry?.();
    player.cancelExpiry = undefined;
    if (player.connected) return;
    player.connected = true;
    this.changed(room);
  }

  disconnect(identity: Identity): void {
    const room = this.rooms.get(identity.code);
    const player = room?.players.get(identity.playerId);
    if (!room || !player?.connected || player.left) return;

    player.connected = false;
    player.cancelExpiry = this.clock.setTimer(() => this.removePlayer(room, player), this.reconnectMs);
    this.changed(room);
  }

  leave(identity: Identity): void {
    const { room, player } = this.member(identity, false);
    this.removePlayer(room, player);
  }

  ready(identity: Identity, value: boolean): void {
    const { room, player } = this.member(identity);
    this.requireLobby(room);
    if (player.ready === value) return;
    player.ready = value;
    this.changed(room);
  }

  kick(identity: Identity, targetId: string): void {
    const room = this.host(identity);
    this.requireLobby(room);
    const target = room.players.get(targetId);
    if (!target || targetId === room.hostId) {
      throw new ArenaError('INVALID_TARGET', 'Çıkarılabilecek bir oyuncu seçin.');
    }
    this.removePlayer(room, target);
  }

  settings(identity: Identity, input: Settings): void {
    const room = this.host(identity);
    this.requireLobby(room);
    const host = room.players.get(room.hostId)!;
    const name = input.roomName === undefined ? room.name : this.roomName(input.roomName) || `${host.name} odası`;
    const maxPlayers = input.maxPlayers === undefined ? room.maxPlayers : this.capacity(input.maxPlayers);
    if (maxPlayers < room.players.size) {
      throw new ArenaError('CAPACITY', 'Kapasite mevcut oyuncu sayısından küçük olamaz.');
    }
    room.name = name;
    room.maxPlayers = maxPlayers;
    this.options.onPersist?.({ type: 'room:update', room: this.metadata(room) });
    this.changed(room);
  }

  start(identity: Identity): void {
    const room = this.host(identity);
    this.requireLobby(room);
    if (room.players.size < 2) throw new ArenaError('NEED_PLAYERS', 'Maç için en az iki oyuncu gerekli.');
    if ([...room.players.values()].some(player => !player.connected || (player.id !== room.hostId && !player.ready))) {
      throw new ArenaError('NOT_READY', 'Tüm oyuncular bağlanmalı ve misafirler hazır olmalı.');
    }
    const words = [...this.answers];
    const chosen = Array.from({ length: ROUNDS }, () => words.splice(randomInt(words.length), 1)[0]);
    room.match = { id: randomUUID(), answers: chosen, round: 0, roundId: '', startedAt: 0 };
    this.options.onPersist?.({ type: 'match:start', matchId: room.match.id, roomId: room.id });
    this.setPhase(room, 'countdown', COUNTDOWN_MS, () => this.beginRound(room));
  }

  guess(identity: Identity, input: GuessRequest): Guess {
    const { room, player } = this.member(identity);
    const match = room.match;
    if (!match || input.matchId !== match.id) {
      throw new ArenaError('ROUND_CLOSED', 'Bu tahmin önceki bir maça ait.');
    }
    const word = normalizeWord(input.word);
    const key = `${input.round}:${input.requestId}`;
    const prior = player.seenGuesses.get(key);
    if (prior) {
      if (prior.word !== word) throw new ArenaError('REQUEST_CONFLICT', 'Bu istek kimliği başka bir tahmin için kullanıldı.');
      return this.privateGuess(prior);
    }
    if (input.round !== match.round || room.phase !== 'round' || room.deadline === null) {
      throw new ArenaError('ROUND_CLOSED', 'Bu tur tahmine açık değil.');
    }
    const atMs = this.clock.now();
    if (atMs >= room.deadline) {
      this.endRound(room);
      throw new ArenaError('ROUND_CLOSED', 'Tur süresi doldu.');
    }
    const round = player.round;
    if (round.status !== 'playing') throw new ArenaError('PLAYER_DONE', 'Bu turdaki tahminleriniz tamamlandı.');
    if (!isTurkishWord(word) || !this.accepted.has(word)) {
      throw new ArenaError('INVALID_WORD', 'Sözlükte bulunan beş harfli bir Türkçe kelime girin.');
    }
    const attempt = round.guesses.length + 1;
    const answer = match.answers[match.round - 1];
    const guess: StoredGuess = { playerId: player.id, word, marks: evaluateGuess(answer, word), attempt, atMs };
    round.guesses.push(guess);
    player.seenGuesses.set(key, guess);
    player.attempts++;
    if (word === answer) {
      round.status = 'solved';
      round.solveMs = atMs - match.startedAt;
      round.points = calculatePoints(room.deadline - atMs, attempt);
      player.solved++;
      player.points += round.points;
      player.solveMs += round.solveMs;
      if (player.fastestMs === null || round.solveMs < player.fastestMs) {
        player.fastestMs = round.solveMs;
        player.fastestWord = word;
      }
    } else if (attempt === ATTEMPTS) {
      round.status = 'exhausted';
    }
    if (!this.finishIfDone(room)) this.changed(room);
    return this.privateGuess(guess);
  }

  restart(identity: Identity): void {
    const room = this.host(identity);
    if (room.phase !== 'finished') throw new ArenaError('MATCH_IN_PROGRESS', 'Yeni maç için mevcut maçın bitmesini bekleyin.');
    for (const player of room.players.values()) {
      if (player.left) {
        room.players.delete(player.id);
        continue;
      }
      player.ready = false;
      player.points = 0;
      player.solved = 0;
      player.solveMs = 0;
      player.attempts = 0;
      player.fastestMs = null;
      player.fastestWord = null;
      player.round = newPlayerRound();
      player.seenGuesses.clear();
    }
    room.match = undefined;
    this.setPhase(room, 'lobby');
  }

  snapshot(identity: Identity): RoomView {
    const { room, player } = this.member(identity, false);
    const match = room.match;
    const standings = this.standings(room);
    const players: PlayerView[] = standings.map(entry => {
      const participant = room.players.get(entry.playerId)!;
      return {
        id: entry.playerId, name: participant.name, rank: entry.rank,
        points: entry.points, solved: entry.solved, solveMs: entry.solveMs,
        attempts: entry.attempts, fastestMs: entry.fastestMs,
        fastestWord: room.phase === 'finished' ? entry.fastestWord : null,
        ready: participant.ready, connected: participant.connected,
        status: participant.connected || ['intermission', 'finished'].includes(room.phase)
          ? participant.round.status
          : 'disconnected',
        roundPoints: participant.round.points,
        roundCloseness: participant.round.closeness,
        roundAttempts: participant.round.guesses.length,
        roundSolveMs: participant.round.solveMs,
      };
    });
    return {
      code: room.code, name: room.name, maxPlayers: room.maxPlayers,
      hostId: room.hostId, playerId: player.id, phase: room.phase,
      matchId: match?.id ?? null,
      round: match?.round ?? 0, deadline: room.deadline, serverNow: this.clock.now(),
      players, guesses: player.round.guesses.map(guess => this.privateGuess(guess)),
      answer: match && (room.phase === 'intermission' || room.phase === 'finished')
        ? match.answers[match.round - 1]
        : null,
    };
  }

  private newPlayer(input: string): Player {
    const name = input.normalize('NFC').trim().replace(/ +/g, ' ');
    if (name.length < 2 || name.length > 24 || !/^[\p{L}\p{M}\p{N} _.-]+$/u.test(name)) {
      throw new ArenaError('INVALID_NAME', 'Oyuncu adı 2–24 karakter olmalı ve geçerli karakterler içermeli.');
    }
    return {
      id: randomUUID(), name, ready: false, connected: true, left: false,
      points: 0, attempts: 0, solveMs: 0, solved: 0, fastestMs: null, fastestWord: null,
      round: newPlayerRound(), seenGuesses: new Map(),
    };
  }

  private roomName(input: string): string {
    const name = input.normalize('NFC').trim().replace(/ +/g, ' ');
    if (name.length > 40 || !/^[\p{L}\p{M}\p{N} _.-]*$/u.test(name)) {
      throw new ArenaError('INVALID_ROOM_NAME', 'Oda adı en fazla 40 karakter olmalı ve geçerli karakterler içermeli.');
    }
    return name;
  }

  private capacity(value: number): number {
    if (!Number.isInteger(value) || value < 2 || value > 8) {
      throw new ArenaError('CAPACITY', 'Oda kapasitesi 2 ile 8 arasında olmalı.');
    }
    return value;
  }

  private metadata(room: Room): RoomMetadata {
    return { id: room.id, code: room.code, name: room.name, maxPlayers: room.maxPlayers, hostId: room.hostId };
  }

  private addPlayer(room: Room, player: Player, owner = false): Identity {
    room.players.set(player.id, player);
    this.options.onPersist?.({ type: 'player:create', player: { id: player.id, name: player.name } });
    if (owner) this.options.onPersist?.({ type: 'room:create', room: this.metadata(room) });
    this.options.onPersist?.({ type: 'room:participant', roomId: room.id, playerId: player.id });
    this.changed(room);
    return { code: room.code, playerId: player.id };
  }

  private getRoom(code: string): Room {
    const room = this.rooms.get(code);
    if (!room) throw new ArenaError('ROOM_NOT_FOUND', 'Bu kodla eşleşen oda bulunamadı.');
    return room;
  }

  private member(identity: Identity, requireConnected = true): { room: Room; player: Player } {
    const room = this.getRoom(identity.code);
    const player = room.players.get(identity.playerId);
    if (!player || player.left || (requireConnected && !player.connected)) {
      throw new ArenaError('NOT_A_MEMBER', 'Oda oturumunuz artık geçerli değil.');
    }
    return { room, player };
  }

  private host(identity: Identity): Room {
    const { room, player } = this.member(identity);
    if (room.hostId !== player.id) throw new ArenaError('HOST_ONLY', 'Bu işlem oda sahibine ait.');
    return room;
  }

  private requireLobby(room: Room): void {
    if (room.phase !== 'lobby') throw new ArenaError('MATCH_ACTIVE', 'Bu oda şu anda maç için kapalı.');
  }

  private removePlayer(room: Room, player: Player): void {
    player.cancelExpiry?.();
    player.cancelExpiry = undefined;
    player.left = true;
    player.connected = false;
    if (room.phase === 'lobby') room.players.delete(player.id);
    const members = [...room.players.values()].filter(participant => !participant.left);
    if (room.hostId === player.id && members.length) {
      room.hostId = (members.find(participant => participant.connected) ?? members[0]).id;
      this.options.onPersist?.({ type: 'room:update', room: this.metadata(room) });
    }
    if (members.length === 0 && (room.phase === 'lobby' || room.phase === 'finished')) {
      this.rooms.delete(room.code);
    }
    if (!this.finishIfDone(room)) this.changed(room);
  }

  private standings(room: Room): Standing[] {
    return rankPlayers([...room.players.values()].map(player => ({
      playerId: player.id, points: player.points, solved: player.solved,
      solveMs: player.solveMs, attempts: player.attempts, fastestMs: player.fastestMs,
      fastestWord: player.fastestWord,
    })));
  }

  private changed(room: Room): void {
    this.options.onUpdate?.(room.code);
  }

  private setPhase(room: Room, phase: Phase, duration?: number, callback?: () => void): void {
    room.cancelTimer?.();
    room.cancelTimer = undefined;
    room.phase = phase;
    room.deadline = duration === undefined ? null : this.clock.now() + duration;
    if (callback && room.deadline !== null) {
      const deadline = room.deadline;
      const run = () => {
        const remaining = deadline - this.clock.now();
        if (remaining > 0) {
          room.cancelTimer = this.clock.setTimer(run, remaining);
          return;
        }
        room.cancelTimer = undefined;
        callback();
      };
      room.cancelTimer = this.clock.setTimer(run, duration!);
    }
    this.changed(room);
  }

  private beginRound(room: Room): void {
    const match = room.match!;
    match.round++;
    match.roundId = randomUUID();
    match.startedAt = this.clock.now();
    for (const player of room.players.values()) {
      player.round = newPlayerRound();
      if (player.left) player.round.status = 'timeout';
    }
    this.setPhase(room, 'round', ROUND_MS, () => this.endRound(room));
    this.finishIfDone(room);
  }

  private finishIfDone(room: Room): boolean {
    if (room.phase !== 'round') return false;
    const hasPending = [...room.players.values()].some(player => !player.left && player.round.status === 'playing');
    if (hasPending) return false;
    this.endRound(room);
    return true;
  }

  private endRound(room: Room): void {
    const match = room.match!;
    const endedAt = Math.min(this.clock.now(), room.deadline!);
    this.awardClosenessPoints(room);
    const guesses: StoredGuess[] = [];
    const results: RoundResult[] = [];
    for (const player of room.players.values()) {
      const round = player.round;
      if (round.status === 'playing') round.status = 'timeout';
      guesses.push(...round.guesses);
      results.push({
        playerId: player.id, status: round.status, points: round.points,
        attempts: round.guesses.length, solveMs: round.solveMs,
      });
    }
    this.options.onPersist?.({
      type: 'round:end', roundId: match.roundId, matchId: match.id, number: match.round,
      answer: match.answers[match.round - 1], startedAt: match.startedAt,
      endedAt, guesses, results,
    });
    this.setPhase(room, 'intermission', INTERMISSION_MS, () => {
      if (match.round < ROUNDS) this.beginRound(room);
      else this.finishMatch(room);
    });
  }

  private awardClosenessPoints(room: Room): void {
    const players = [...room.players.values()];
    if (players.some(player => player.round.status === 'solved')) return;

    const candidates = players.filter(player => !player.left).map(player => {
      const scores = player.round.guesses.map(guess => scoreCloseness(guess.marks));
      const best = scores.sort((first, second) => second.points - first.points)[0];
      return { player, best };
    });
    const highest = Math.max(0, ...candidates.map(({ best }) => best?.points ?? 0));
    if (highest === 0) return;

    for (const { player, best } of candidates) {
      if (best?.points !== highest) continue;
      player.round.closeness = best;
      player.round.points = best.points;
      player.points += best.points;
    }
  }

  private finishMatch(room: Room): void {
    this.options.onPersist?.({
      type: 'match:end', matchId: room.match!.id, endedAt: this.clock.now(), results: this.standings(room),
    });
    if (![...room.players.values()].some(player => !player.left)) this.rooms.delete(room.code);
    this.setPhase(room, 'finished');
  }

  private privateGuess(guess: StoredGuess): Guess {
    return { word: guess.word, marks: [...guess.marks] };
  }
}
