import { randomInt, randomUUID } from 'node:crypto';
import {
  ATTEMPTS, COUNTDOWN_MS, INTERMISSION_MS, ROUND_MS, ROUNDS,
  calculatePoints, evaluateGuess, isTurkishWord, normalizeWord, rankPlayers,
  type Stats,
} from '@arena/game-engine';
import {
  DEFAULT_ROUND_MODE, FINAL_GUESS_MS, ROUND_COUNT_MAX, ROUND_COUNT_MIN,
  ROUND_SECONDS_MAX, ROUND_SECONDS_MIN, TEAM_IDS, TEAM_SIZE, ratedRoundDelta, scoreCloseness,
  type ClosenessScore, type Guess, type GuessRequest, type Phase, type PlayerStatus,
  type GameMode, type PlayerView, type RoomRules, type RoomView, type RoundMode,
  type RoundAnalysis, type RoundPlayerAnalysis, type TeamId, type TeamView,
} from '@arena/shared';

export type Identity = { code: string; playerId: string; role?: 'spectator' };
export type Settings = RoomRules & { roomName?: string; maxPlayers?: number };

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

interface MatchRules {
  roundMode: RoundMode;
  gameMode: GameMode;
  roundCount: number;
  roundSeconds: number;
}

interface RoomMetadata extends MatchRules {
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

type RoundResult = Omit<RoundPlayerAnalysis, 'name'>;

interface Standing extends Stats {
  playerId: string;
  teamId: TeamId | null;
  rank: number;
  fastestMs: number | null;
  fastestWord: string | null;
}

export type ArenaEvent =
  | { type: 'player:create'; player: { id: string; name: string; accountId?: string } }
  | { type: 'room:create' | 'room:update'; room: RoomMetadata }
  | { type: 'room:participant'; roomId: string; playerId: string }
  | ({ type: 'match:start'; matchId: string; roomId: string } & MatchRules)
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
      ratings: { accountId: string; delta: number }[];
    }
  | {
      type: 'match:end'; matchId: string; endedAt: number; results: Standing[];
      teamResults: TeamView[]; winnerTeamId: TeamId | null;
    };

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
  completedAt?: number;
  closeness?: ClosenessScore;
  ratedAccount?: string;
}

interface Player extends Stats {
  id: string;
  accountId?: string;
  name: string;
  teamId: TeamId | null;
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
  finalCountdown: boolean;
  analyses: RoundAnalysis[];
}

interface Spectator {
  id: string;
  connected: boolean;
  cancelExpiry?: () => void;
}

interface Room extends RoomMetadata {
  players: Map<string, Player>;
  spectators: Map<string, Spectator>;
  phase: Phase;
  deadline: number | null;
  cancelTimer?: () => void;
  match?: Match;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const RECONNECT_MS = 90_000;
const MAX_ROOMS = 2_000;
const MAX_SPECTATORS = 24;

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

  create(input: Settings & { name: string; accountId?: string }): Identity {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new ArenaError('SERVER_FULL', 'Şu anda yeni oda açılamıyor. Lütfen daha sonra tekrar deneyin.');
    }
    const player = this.newPlayer(input.name, input.accountId);
    const name = this.roomName(input.roomName ?? '') || `${player.name} odası`;
    const rules = this.gameRules(input);
    const maxPlayers = this.capacity(input.maxPlayers ?? 8, rules.gameMode);
    let code: string;
    do {
      code = Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('');
    } while (this.rooms.has(code));
    const room: Room = {
      id: randomUUID(), code, name, maxPlayers, hostId: player.id,
      ...rules, players: new Map(), spectators: new Map(), phase: 'lobby', deadline: null,
    };
    this.rooms.set(code, room);
    return this.addPlayer(room, player, true);
  }

  join(input: { code: string; name: string; accountId?: string }): Identity {
    const room = this.getRoom(input.code.trim().toUpperCase());
    this.requireLobby(room);
    if (room.players.size >= room.maxPlayers) throw new ArenaError('ROOM_FULL', 'Oda dolu.');
    if (input.accountId && [...room.players.values()].some(player => player.accountId === input.accountId)) {
      throw new ArenaError('ACCOUNT_IN_ROOM', 'Bu hesap zaten odada.');
    }
    const player = this.newPlayer(input.name, input.accountId);
    return this.addPlayer(room, player);
  }

  spectate(code: string): Identity {
    const room = this.getRoom(code);
    if (room.spectators.size >= MAX_SPECTATORS) {
      throw new ArenaError('SPECTATORS_FULL', 'Bu odanın izleyici kapasitesi dolu.');
    }
    const spectator: Spectator = { id: randomUUID(), connected: true };
    room.spectators.set(spectator.id, spectator);
    this.changed(room);
    return { code, playerId: spectator.id, role: 'spectator' };
  }

  resume(identity: Identity): void {
    const { room, viewer } = this.viewer(identity);
    viewer.cancelExpiry?.();
    viewer.cancelExpiry = undefined;
    if (viewer.connected) return;
    viewer.connected = true;
    this.changed(room);
  }

  disconnect(identity: Identity): void {
    const room = this.rooms.get(identity.code);
    if (identity.role === 'spectator') {
      const spectator = room?.spectators.get(identity.playerId);
      if (!room || !spectator?.connected) return;
      spectator.connected = false;
      spectator.cancelExpiry = this.clock.setTimer(() => this.removeSpectator(room, spectator), this.reconnectMs);
      this.changed(room);
      return;
    }
    const player = room?.players.get(identity.playerId);
    if (!room || !player?.connected || player.left) return;

    player.connected = false;
    player.cancelExpiry = this.clock.setTimer(() => this.removePlayer(room, player), this.reconnectMs);
    this.changed(room);
  }

  leave(identity: Identity): void {
    if (identity.role === 'spectator') {
      const room = this.getRoom(identity.code);
      this.removeSpectator(room, this.spectator(room, identity.playerId));
      return;
    }
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
    const rules = this.gameRules(input, room);
    const maxPlayers = this.capacity(input.maxPlayers ?? room.maxPlayers, rules.gameMode);
    if (maxPlayers < room.players.size) {
      throw new ArenaError('CAPACITY', 'Kapasite mevcut oyuncu sayısından küçük olamaz.');
    }
    const reassign = room.gameMode !== rules.gameMode;
    const rulesChanged = reassign || room.roundMode !== rules.roundMode
      || room.roundCount !== rules.roundCount || room.roundSeconds !== rules.roundSeconds
      || room.maxPlayers !== maxPlayers;
    Object.assign(room, rules, { name, maxPlayers });
    if (rulesChanged) {
      for (const [index, player] of [...room.players.values()].entries()) {
        player.ready = false;
        if (reassign) player.teamId = room.gameMode === 'ffa' ? null : TEAM_IDS[index % TEAM_IDS.length];
      }
    }
    this.options.onPersist?.({ type: 'room:update', room: this.metadata(room) });
    this.changed(room);
  }

  selectTeam(identity: Identity, teamId: TeamId): void {
    const { room, player } = this.member(identity);
    this.requireLobby(room);
    const size = TEAM_SIZE[room.gameMode];
    if (!size) throw new ArenaError('NO_TEAMS', 'Bu odada takımlar açık değil.');
    if (player.teamId === teamId) return;
    if (this.teamMemberCount(room, teamId) >= size) throw new ArenaError('TEAM_FULL', 'Bu takım dolu.');
    player.teamId = teamId;
    player.ready = false;
    this.changed(room);
  }

  start(identity: Identity): void {
    const room = this.host(identity);
    this.requireLobby(room);
    if (room.players.size < 2) throw new ArenaError('NEED_PLAYERS', 'Maç için en az iki oyuncu gerekli.');
    const teamSize = TEAM_SIZE[room.gameMode];
    if (teamSize && TEAM_IDS.some(id => this.teamMemberCount(room, id) !== teamSize)) {
      throw new ArenaError('UNBALANCED_TEAMS', `Maç için her takımda ${teamSize} oyuncu olmalı.`);
    }
    if ([...room.players.values()].some(player => !player.connected || (player.id !== room.hostId && !player.ready))) {
      throw new ArenaError('NOT_READY', 'Tüm oyuncular bağlanmalı ve misafirler hazır olmalı.');
    }
    const words = [...this.answers];
    const chosen = Array.from({ length: room.roundCount }, () => words.splice(randomInt(words.length), 1)[0]);
    room.match = {
      id: randomUUID(), answers: chosen, round: 0, roundId: '', startedAt: 0,
      finalCountdown: false, analyses: [],
    };
    this.options.onPersist?.({
      type: 'match:start', matchId: room.match.id, roomId: room.id,
      roundMode: room.roundMode, gameMode: room.gameMode, roundCount: room.roundCount, roundSeconds: room.roundSeconds,
    });
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
    if (input.round !== match.round || room.phase !== 'round') {
      throw new ArenaError('ROUND_CLOSED', 'Bu tur tahmine açık değil.');
    }
    const atMs = this.clock.now();
    if (room.deadline !== null && atMs >= room.deadline) {
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
      round.completedAt = atMs;
      round.solveMs = atMs - match.startedAt;
      const durationMs = room.roundSeconds * 1_000;
      const timeBonusBudget = room.roundMode === 'timed'
        ? (durationMs - round.solveMs) * ROUND_MS / durationMs
        : 0;
      round.points = calculatePoints(timeBonusBudget, attempt);
      player.solved++;
      player.points += round.points;
      player.solveMs += round.solveMs;
      if (player.fastestMs === null || round.solveMs < player.fastestMs) {
        player.fastestMs = round.solveMs;
        player.fastestWord = word;
      }
    } else if (attempt === ATTEMPTS) {
      round.status = 'exhausted';
      round.completedAt = atMs;
    }
    if (!this.finishIfDone(room)) {
      if (round.status === 'solved' && !match.finalCountdown) {
        match.finalCountdown = true;
        this.setPhase(room, 'round', FINAL_GUESS_MS, () => this.endRound(room));
      } else {
        this.changed(room);
      }
    }
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
    const { room } = this.viewer(identity);
    const match = room.match;
    const spectator = identity.role === 'spectator';
    const player = spectator ? undefined : room.players.get(identity.playerId);
    const standings = this.standings(room);
    const players: PlayerView[] = standings.map(entry => {
      const participant = room.players.get(entry.playerId)!;
      return {
        id: entry.playerId, name: participant.name, rank: entry.rank, teamId: participant.teamId,
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
        roundSolved: participant.round.status === 'solved',
        roundSolveMs: participant.round.solveMs,
      };
    });
    const teams = this.teams(room);
    return {
      code: room.code, name: room.name, maxPlayers: room.maxPlayers,
      hostId: room.hostId, playerId: identity.playerId, phase: room.phase,
      viewerRole: spectator ? 'spectator' : 'player',
      spectatorCount: [...room.spectators.values()].filter(viewer => viewer.connected).length,
      roundMode: room.roundMode, gameMode: room.gameMode, roundCount: room.roundCount,
      roundSeconds: room.roundSeconds, finalCountdown: room.phase === 'round' && match?.finalCountdown === true,
      matchId: match?.id ?? null,
      round: match?.round ?? 0, deadline: room.deadline, serverNow: this.clock.now(),
      players, teams, winnerTeamId: room.phase === 'finished' ? this.winningTeam(teams) : null,
      roundAnalyses: match?.analyses ?? [],
      guesses: player?.round.guesses.map(guess => this.privateGuess(guess)) ?? [],
      answer: match && (room.phase === 'intermission' || room.phase === 'finished')
        ? match.answers[match.round - 1]
        : null,
    };
  }

  private newPlayer(input: string, accountId?: string): Player {
    const name = input.normalize('NFC').trim().replace(/ +/g, ' ');
    if (name.length < 2 || name.length > 24 || !/^[\p{L}\p{M}\p{N} _.-]+$/u.test(name)) {
      throw new ArenaError('INVALID_NAME', 'Oyuncu adı 2–24 karakter olmalı ve geçerli karakterler içermeli.');
    }
    return {
      id: randomUUID(), name, accountId, teamId: null, ready: false, connected: true, left: false,
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

  private capacity(value: number, gameMode: GameMode): number {
    if (!Number.isInteger(value) || value < 2 || value > 8) {
      throw new ArenaError('CAPACITY', 'Oda kapasitesi 2 ile 8 arasında olmalı.');
    }
    return TEAM_SIZE[gameMode] * TEAM_IDS.length || value;
  }

  private gameRules(input: RoomRules, current?: MatchRules): MatchRules {
    const roundCount = input.roundCount ?? current?.roundCount ?? ROUNDS;
    const roundSeconds = input.roundSeconds ?? current?.roundSeconds ?? ROUND_MS / 1_000;
    if (!Number.isInteger(roundCount) || roundCount < ROUND_COUNT_MIN || roundCount > ROUND_COUNT_MAX) {
      throw new ArenaError('ROUND_COUNT', `Tur sayısı ${ROUND_COUNT_MIN} ile ${ROUND_COUNT_MAX} arasında olmalı.`);
    }
    if (roundCount > this.answers.length) {
      throw new ArenaError('ROUND_COUNT', 'Bu tur sayısı için sözlükte yeterli cevap yok.');
    }
    if (!Number.isInteger(roundSeconds) || roundSeconds < ROUND_SECONDS_MIN || roundSeconds > ROUND_SECONDS_MAX) {
      throw new ArenaError('ROUND_SECONDS', `Tur süresi ${ROUND_SECONDS_MIN} ile ${ROUND_SECONDS_MAX} saniye arasında olmalı.`);
    }
    return {
      roundCount,
      roundSeconds,
      gameMode: input.gameMode ?? current?.gameMode ?? 'ffa',
      roundMode: input.roundMode ?? current?.roundMode ?? DEFAULT_ROUND_MODE,
    };
  }

  private metadata(room: Room): RoomMetadata {
    return {
      id: room.id, code: room.code, name: room.name, maxPlayers: room.maxPlayers, hostId: room.hostId,
      roundMode: room.roundMode, gameMode: room.gameMode, roundCount: room.roundCount, roundSeconds: room.roundSeconds,
    };
  }

  private addPlayer(room: Room, player: Player, owner = false): Identity {
    if (room.gameMode !== 'ffa') {
      const [first, second] = TEAM_IDS;
      player.teamId = this.teamMemberCount(room, first) <= this.teamMemberCount(room, second) ? first : second;
    }
    room.players.set(player.id, player);
    this.options.onPersist?.({ type: 'player:create', player: { id: player.id, name: player.name, accountId: player.accountId } });
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
    if (identity.role === 'spectator') {
      throw new ArenaError('SPECTATOR_READ_ONLY', 'İzleyiciler yalnızca maçı takip edebilir.');
    }
    const room = this.getRoom(identity.code);
    const player = room.players.get(identity.playerId);
    if (!player || player.left || (requireConnected && !player.connected)) {
      throw new ArenaError('NOT_A_MEMBER', 'Oda oturumunuz artık geçerli değil.');
    }
    return { room, player };
  }

  private spectator(room: Room, id: string): Spectator {
    const spectator = room.spectators.get(id);
    if (!spectator) throw new ArenaError('NOT_A_MEMBER', 'İzleyici oturumunuz artık geçerli değil.');
    return spectator;
  }

  private viewer(identity: Identity): { room: Room; viewer: Player | Spectator } {
    if (identity.role === 'spectator') {
      const room = this.getRoom(identity.code);
      return { room, viewer: this.spectator(room, identity.playerId) };
    }
    const { room, player } = this.member(identity, false);
    return { room, viewer: player };
  }

  private removeSpectator(room: Room, spectator: Spectator): void {
    spectator.cancelExpiry?.();
    room.spectators.delete(spectator.id);
    this.changed(room);
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
    if (room.phase === 'round' && player.round.status === 'playing') {
      player.round.status = 'timeout';
      player.round.completedAt = this.clock.now();
    }
    if (room.phase === 'lobby') room.players.delete(player.id);
    const members = [...room.players.values()].filter(participant => !participant.left);
    if (room.hostId === player.id && members.length) {
      room.hostId = (members.find(participant => participant.connected) ?? members[0]).id;
      this.options.onPersist?.({ type: 'room:update', room: this.metadata(room) });
    }
    if (members.length === 0 && (room.phase === 'lobby' || room.phase === 'finished')) {
      this.closeRoom(room);
    }
    if (!this.finishIfDone(room)) this.changed(room);
  }

  private standings(room: Room): Standing[] {
    return rankPlayers([...room.players.values()].map(player => ({
      playerId: player.id, teamId: player.teamId, points: player.points, solved: player.solved,
      solveMs: player.solveMs, attempts: player.attempts, fastestMs: player.fastestMs,
      fastestWord: player.fastestWord,
    })));
  }

  private teamMemberCount(room: Room, id: TeamId): number {
    return [...room.players.values()].filter(player => player.teamId === id && !player.left).length;
  }

  private teams(room: Room): TeamView[] {
    if (room.gameMode === 'ffa') return [];
    const scores = TEAM_IDS.map(id => {
      const totals = { id, points: 0, solved: 0, solveMs: 0, attempts: 0, roundPoints: 0 };
      for (const player of room.players.values()) {
        if (player.teamId !== id) continue;
        totals.points += player.points;
        totals.solved += player.solved;
        totals.solveMs += player.solveMs;
        totals.attempts += player.attempts;
        totals.roundPoints += player.round.points;
      }
      return totals;
    });
    return rankPlayers(scores).map(({ id, points, solved, roundPoints, rank }) => (
      { id, points, solved, roundPoints, rank }
    ));
  }

  private winningTeam(teams: TeamView[]): TeamId | null {
    return teams.length > 1 && teams[1].rank > teams[0].rank ? teams[0].id : null;
  }

  private changed(room: Room): void {
    this.options.onUpdate?.(room.code);
  }

  private closeRoom(room: Room): void {
    room.cancelTimer?.();
    for (const spectator of room.spectators.values()) spectator.cancelExpiry?.();
    room.spectators.clear();
    this.rooms.delete(room.code);
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
    if (![...room.players.values()].some(player => !player.left)) {
      this.finishMatch(room);
      return;
    }
    const match = room.match!;
    match.round++;
    match.roundId = randomUUID();
    match.startedAt = this.clock.now();
    match.finalCountdown = false;
    for (const player of room.players.values()) {
      player.round = newPlayerRound();
      if (player.left) {
        player.round.status = 'timeout';
        player.round.completedAt = match.startedAt;
      }
      else player.round.ratedAccount = player.accountId;
    }
    const duration = room.roundMode === 'timed' ? room.roundSeconds * 1_000 : undefined;
    this.setPhase(room, 'round', duration, () => this.endRound(room));
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
    const now = this.clock.now();
    const endedAt = room.deadline === null ? now : Math.min(now, room.deadline);
    this.awardClosenessPoints(room);
    const guesses: StoredGuess[] = [];
    const results: RoundResult[] = [];
    const ratings: { accountId: string; delta: number }[] = [];
    for (const player of room.players.values()) {
      const round = player.round;
      if (round.status === 'playing') round.status = 'timeout';
      guesses.push(...round.guesses);
      if (round.ratedAccount) ratings.push({
        accountId: round.ratedAccount,
        delta: ratedRoundDelta(round.guesses, round.status === 'solved'),
      });
      results.push({
        playerId: player.id, teamId: player.teamId, status: round.status, points: round.points,
        attempts: round.guesses.length, solveMs: round.solveMs,
        elapsedMs: Math.min(round.completedAt ?? endedAt, endedAt) - match.startedAt,
      });
    }
    const answer = match.answers[match.round - 1];
    match.analyses = [...match.analyses, {
      round: match.round, answer, startedAt: match.startedAt, endedAt,
      players: results.map(result => ({ ...result, name: room.players.get(result.playerId)!.name })),
    }];
    this.options.onPersist?.({
      type: 'round:end', roundId: match.roundId, matchId: match.id, number: match.round,
      answer, startedAt: match.startedAt,
      endedAt, guesses, results, ratings,
    });
    this.setPhase(room, 'intermission', INTERMISSION_MS, () => {
      if (match.round < room.roundCount) this.beginRound(room);
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
    const teamResults = this.teams(room);
    this.options.onPersist?.({
      type: 'match:end', matchId: room.match!.id, endedAt: this.clock.now(), results: this.standings(room),
      teamResults, winnerTeamId: this.winningTeam(teamResults),
    });
    if (![...room.players.values()].some(player => !player.left)) this.closeRoom(room);
    this.setPhase(room, 'finished');
  }

  private privateGuess(guess: StoredGuess): Guess {
    return { word: guess.word, marks: [...guess.marks] };
  }
}
