import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTDOWN_MS, INTERMISSION_MS, ROUND_MS } from '@arena/game-engine';
import { FINAL_GUESS_MS, MAX_ATTEMPTS } from '@arena/shared';
import { Arena, ArenaError, type ArenaEvent, type Clock, type Identity, type Settings } from './arena';

class ManualClock implements Clock {
  private time = 1_700_000_000_000;
  private readonly timers = new Map<() => void, number>();

  now = () => this.time;

  setTimer = (callback: () => void, delayMs: number) => {
    this.timers.set(callback, this.time + delayMs);
    return () => { this.timers.delete(callback); };
  };

  advance(ms: number) {
    const end = this.time + ms;
    for (;;) {
      const next = [...this.timers].sort(([, a], [, b]) => a - b)[0];
      if (!next || next[1] > end) break;
      const [callback, timestamp] = next;
      this.time = timestamp;
      this.timers.delete(callback);
      callback();
    }
    this.time = end;
  }

  stall(ms: number) {
    this.time += ms;
  }
}

const testAnswers = ['KALEM', 'ÇİÇEK', 'ISLAK', 'KÜÇÜK', 'OĞLAK'];
const knownWrong = 'ARMUT';

function fixture(answers = testAnswers, guessPool = [knownWrong], settings: Settings = {}) {
  const clock = new ManualClock();
  const events: ArenaEvent[] = [];
  const arena = new Arena({
    answers,
    accepted: new Set(guessPool),
    clock,
    onPersist: event => events.push(event),
  });
  const host = arena.create({ name: 'Ayşe', roomName: 'Yarış', maxPlayers: 2, ...settings });
  const guest = arena.join({ name: 'Ömer', code: host.code });

  function start() {
    arena.ready(guest, true);
    arena.start(host);
    clock.advance(COUNTDOWN_MS);
  }

  let id = 0;
  function submit(player: Identity, word: string, requestId = 'request-' + ++id) {
    const room = arena.snapshot(player);
    return arena.guess(player, { round: room.round, matchId: room.matchId!, word, requestId });
  }

  return { arena, host, guest, clock, events, start, submit };
}

function expectError(operation: () => unknown, code: string) {
  assert.throws(operation, (error: unknown) => error instanceof ArenaError && error.code === code);
}

test('room rules support up to ten distinct rounds, custom time, and limits', () => {
  const pool = [...testAnswers, 'KİTAP', 'MASAL', 'LİMON', 'LOKMA', 'BALIK'];
  const { arena, clock, events, host, guest, start } = fixture(pool, [knownWrong]);
  expectError(() => arena.settings(host, { roundCount: 2 }), 'ROUND_COUNT');
  expectError(() => arena.settings(host, { roundCount: 11 }), 'ROUND_COUNT');
  expectError(() => arena.settings(host, { roundSeconds: 301 }), 'ROUND_SECONDS');

  arena.ready(guest, true);
  arena.settings(host, { roundCount: 10, roundSeconds: 45, maxPlayers: 3 });
  assert.equal(arena.snapshot(guest).players.find(player => player.id === guest.playerId)?.ready, false);
  assert.equal(arena.snapshot(host).maxPlayers, 3);
  start();

  for (let round = 1; round <= 10; round++) {
    const playing = arena.snapshot(host);
    assert.equal(playing.round, round);
    assert.equal(playing.roundCount, 10);
    assert.equal(playing.roundSeconds, 45);
    assert.equal(playing.deadline, clock.now() + 45_000);
    assert.equal(playing.roundAnalyses.length, round - 1);
    assert.equal(playing.answer, null);
    clock.advance(45_000 + INTERMISSION_MS);
  }

  const result = arena.snapshot(host);
  assert.equal(result.phase, 'finished');
  assert.equal(new Set(result.roundAnalyses.map(round => round.answer)).size, 10);
  assert.ok(result.roundAnalyses.every(round => round.players.every(player =>
    player.status === 'timeout' && player.elapsedMs === 45_000 && player.attempts === 0,
  )));
  assert.equal(events.filter(event => event.type === 'round:end').length, 10);
});

for (const { gameMode, count } of [{ gameMode: '2v2', count: 4 }, { gameMode: '3v3', count: 6 }] as const) {
  test(`${gameMode} requires full teams and calculates the winner and per-word results`, () => {
    const game = fixture(testAnswers, [knownWrong], { gameMode, roundCount: 3, roundSeconds: 60 });
    const { arena, host, guest, clock, events, submit } = game;
    assert.equal(arena.snapshot(host).maxPlayers, count);
    arena.ready(guest, true);
    arena.selectTeam(guest, 'a');
    assert.equal(arena.snapshot(host).players.find(player => player.id === guest.playerId)?.ready, false);
    expectError(() => arena.start(host), 'UNBALANCED_TEAMS');
    const roster = [host, guest];
    for (let index = 2; index < count; index++) {
      roster.push(arena.join({ name: `Oyuncu ${index}`, code: host.code }));
    }
    expectError(() => arena.join({ name: 'Fazladan', code: host.code }), 'ROOM_FULL');
    for (const player of roster.slice(1)) arena.ready(player, true);
    arena.start(host);
    clock.advance(COUNTDOWN_MS);
    expectError(() => arena.selectTeam(guest, 'b'), 'MATCH_ACTIVE');

    for (let round = 1; round <= 3; round++) {
      clock.advance(30_000);
      for (const candidate of testAnswers) {
        if (submit(host, candidate).marks.every(mark => mark === 'correct')) break;
      }
      const running = arena.snapshot(guest);
      assert.equal(running.finalCountdown, true);
      assert.equal(running.winnerTeamId, null);
      const solver = running.players.find(player => player.id === host.playerId)!;
      assert.equal(solver.roundSolved, true);
      assert.equal(solver.roundPoints, 650 + (5 - solver.roundAttempts) * 50);
      assert.equal(running.teams.find(team => team.id === 'a')?.roundPoints, solver.roundPoints);
      assert.deepEqual(running.guesses, []);
      clock.advance(FINAL_GUESS_MS);
      const summary = arena.snapshot(guest).roundAnalyses.at(-1)!;
      const answerResult = summary.players.find(player => player.playerId === host.playerId)!;
      assert.equal(answerResult.teamId, 'a');
      assert.equal(answerResult.elapsedMs, 30_000);
      assert.equal(answerResult.solveMs, 30_000);
      assert.equal(answerResult.attempts, solver.roundAttempts);
      assert.equal(answerResult.points, solver.roundPoints);
      clock.advance(INTERMISSION_MS);
    }
    const final = arena.snapshot(guest);
    assert.equal(final.phase, 'finished');
    assert.equal(final.winnerTeamId, 'a');
    assert.equal(final.teams[0].rank, 1);
    assert.equal(final.teams[0].solved, 3);
    assert.equal(events.find(event => event.type === 'match:end')?.winnerTeamId, 'a');
  });
}

test('a dictionary needs at least five distinct valid answer words', () => {
  const accepted = new Set(testAnswers);
  assert.throws(() => new Arena({ answers: [...testAnswers.slice(0, 4), testAnswers[0]], accepted }));
  assert.throws(() => new Arena({ answers: [...testAnswers.slice(0, 4), 'ABC'], accepted }));
});

const kabAnswers = ['KABAK', 'KABAN', 'KABUL', 'KABİN', 'KABLO'];

function solveFirstRound(game: ReturnType<typeof fixture>) {
  for (const word of kabAnswers) {
    if (game.submit(game.host, word).marks.every(mark => mark === 'correct')) return word;
  }
  throw new Error('Beklenen test cevabı bulunamadı');
}

test('the host selects the round mode in the lobby and the store records it for the match', () => {
  const game = fixture();
  assert.equal(game.arena.snapshot(game.guest).roundMode, 'timed');
  expectError(() => game.arena.settings(game.guest, { roundMode: 'untimed' }), 'HOST_ONLY');
  game.arena.settings(game.host, { roundMode: 'untimed' });
  assert.equal(game.arena.snapshot(game.guest).roundMode, 'untimed');
  const update = game.events.find(event => event.type === 'room:update');
  assert.ok(update?.type === 'room:update');
  assert.equal(update.room.roundMode, 'untimed');
  game.start();
  expectError(() => game.arena.settings(game.host, { roundMode: 'timed' }), 'MATCH_ACTIVE');
  assert.equal(game.events.find(event => event.type === 'match:start')?.roundMode, 'untimed');
});

for (const { roundMode, beforeFirstSolve, secondScore } of [
  { roundMode: 'timed', beforeFirstSolve: 10_000, secondScore: 950 },
  { roundMode: 'untimed', beforeFirstSolve: 120_000, secondScore: 700 },
] as const) {
  test(`the first solver starts one shared 30-second countdown in ${roundMode} mode`, () => {
    const game = fixture(kabAnswers, ['KABUS'], { roundMode, maxPlayers: 3 });
    const third = game.arena.join({ code: game.host.code, name: 'Cem' });
    game.arena.ready(third, true);
    game.start();
    const initial = game.arena.snapshot(third);
    assert.equal(initial.deadline, roundMode === 'timed' ? game.clock.now() + ROUND_MS : null);
    assert.equal(initial.finalCountdown, false);
    game.clock.advance(beforeFirstSolve);
    assert.equal(game.arena.snapshot(third).phase, 'round');
    const answer = solveFirstRound(game);
    const closing = game.arena.snapshot(third);
    assert.equal(closing.deadline, game.clock.now() + FINAL_GUESS_MS);
    assert.equal(closing.finalCountdown, true);
    assert.equal(closing.answer, null);

    game.clock.advance(5_000);
    game.submit(game.guest, answer);
    const stillClosing = game.arena.snapshot(third);
    assert.equal(stillClosing.deadline, closing.deadline);
    assert.equal(stillClosing.players.find(player => player.id === game.guest.playerId)?.roundPoints, secondScore);
    game.clock.advance(FINAL_GUESS_MS - 5_000);
    const finished = game.arena.snapshot(third);
    assert.equal(finished.phase, 'intermission');
    assert.equal(finished.finalCountdown, false);
    assert.equal(finished.players.find(player => player.id === third.playerId)?.status, 'timeout');

    game.clock.advance(INTERMISSION_MS);
    const next = game.arena.snapshot(third);
    assert.equal(next.round, 2);
    assert.equal(next.finalCountdown, false);
    assert.equal(next.deadline, roundMode === 'timed' ? game.clock.now() + ROUND_MS : null);
  });
}

test('a timed first solve near expiration still grants the other player all 30 seconds', () => {
  const game = fixture(kabAnswers, ['KABUS']);
  game.start();
  game.clock.advance(ROUND_MS - 1_000);
  solveFirstRound(game);
  game.clock.advance(2_000);
  assert.equal(game.arena.snapshot(game.guest).phase, 'round');
  assert.equal(game.arena.snapshot(game.guest).deadline! - game.clock.now(), FINAL_GUESS_MS - 2_000);
  game.submit(game.guest, 'KABUS');
  game.clock.stall(FINAL_GUESS_MS - 2_000);
  expectError(() => game.submit(game.guest, 'KABUS'), 'ROUND_CLOSED');
  assert.equal(game.arena.snapshot(game.guest).phase, 'intermission');
});

test('an untimed round with no solver ends when attempts run out and awards closeness', () => {
  const game = fixture(kabAnswers, ['KABUS'], { roundMode: 'untimed' });
  game.start();
  game.clock.advance(2 * ROUND_MS);
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    game.submit(game.host, 'KABUS');
    game.submit(game.guest, 'KABUS');
  }
  const result = game.arena.snapshot(game.host);
  assert.equal(result.phase, 'intermission');
  assert.ok(result.players.every(player => player.roundCloseness && player.roundPoints >= 150));
});

test('only the closest single guess scores on an unsolved round and the points are persisted', () => {
  const { arena, host, guest, clock, events, start, submit } =
    fixture(kabAnswers, ['KABUS', 'ARMUT']);
  start();
  for (let attempt = 0; attempt < 4; attempt++) submit(guest, 'ARMUT');
  const best = submit(host, 'KABUS').marks;
  submit(host, 'ARMUT');

  const correct = best.filter(mark => mark === 'correct').length;
  const present = best.filter(mark => mark === 'present').length;
  const points = correct * 50 + present * 25;
  assert.ok(correct >= 3);
  assert.ok(arena.snapshot(guest).players.every(player => !player.roundCloseness && player.points === 0));

  clock.advance(ROUND_MS);
  const result = arena.snapshot(guest);
  const winner = result.players.find(player => player.id === host.playerId);
  assert.equal(result.phase, 'intermission');
  assert.equal(winner?.points, points);
  assert.equal(winner?.roundPoints, points);
  assert.equal(winner?.solved, 0);
  assert.equal(winner?.roundSolveMs, null);
  assert.deepEqual(winner?.roundCloseness, { correct, present, points });
  assert.equal(result.players.find(player => player.id === guest.playerId)?.points, 0);
  assert.ok(result.guesses.every(guess => guess.word === 'ARMUT'));
  const saved = events.find(event => event.type === 'round:end');
  assert.equal(saved?.results.find(player => player.playerId === host.playerId)?.points, points);
  assert.equal(saved?.results.length, 2);

  clock.advance(INTERMISSION_MS);
  assert.equal(arena.snapshot(host).players[0].points, points);
  assert.equal(arena.snapshot(host).players[0].roundCloseness, undefined);
});

test('tied closest players receive the same bonus when both exhaust their attempts', () => {
  const { arena, host, guest, start, submit } = fixture(kabAnswers, ['KABUS']);
  start();
  for (let attempt = 0; attempt < 5; attempt++) {
    submit(host, 'KABUS');
    submit(guest, 'KABUS');
  }
  const result = arena.snapshot(host);
  assert.equal(result.phase, 'intermission');
  assert.ok(result.players.every(player => player.status === 'exhausted' && player.rank === 1));
  assert.ok((result.players[0].roundCloseness?.points ?? 0) >= 150);
  assert.deepEqual(result.players[0].roundCloseness, result.players[1].roundCloseness);
});

test('a solved round or guesses without any matches produce no closeness bonus', () => {
  const playing = fixture(kabAnswers, ['KABUS']);
  playing.start();
  playing.submit(playing.guest, 'KABUS');
  for (const word of kabAnswers) {
    const guess = playing.submit(playing.host, word);
    if (guess.marks.every(mark => mark === 'correct')) break;
  }
  playing.clock.advance(ROUND_MS);
  const solved = playing.arena.snapshot(playing.host);
  assert.ok(solved.players.every(player => !player.roundCloseness));
  assert.ok(solved.players[0].points >= 500);
  assert.equal(solved.players[1].points, 0);

  const misses = fixture(kabAnswers, ['ÇÖPÇÜ']);
  misses.start();
  assert.ok(misses.submit(misses.host, 'ÇÖPÇÜ').marks.every(mark => mark === 'absent'));
  misses.clock.advance(ROUND_MS);
  assert.ok(misses.arena.snapshot(misses.host).players.every(player => !player.roundCloseness && player.points === 0));
});

test('room creation, permissions, capacity, settings and host departure', () => {
  const { arena, host, guest, events } = fixture();

  assert.match(host.code, /^[A-Z0-9]{6}$/);
  assert.equal(arena.snapshot(guest).hostId, host.playerId);
  assert.deepEqual(events.slice(0, 3).map(event => event.type), [
    'player:create', 'room:create', 'room:participant',
  ]);
  expectError(() => arena.join({ name: 'Cem', code: host.code }), 'ROOM_FULL');
  expectError(() => arena.start(guest), 'HOST_ONLY');
  expectError(() => arena.start(host), 'NOT_READY');
  expectError(() => arena.snapshot({ code: host.code, playerId: 'stranger' }), 'NOT_A_MEMBER');

  arena.settings(host, { roomName: 'Yeni oda', maxPlayers: 4 });
  assert.equal(arena.snapshot(guest).name, 'Yeni oda');
  assert.equal(arena.snapshot(guest).maxPlayers, 4);

  const third = arena.join({ name: 'Cem', code: host.code });
  arena.kick(host, third.playerId);
  expectError(() => arena.resume(third), 'NOT_A_MEMBER');

  arena.leave(host);
  assert.equal(arena.snapshot(guest).hostId, guest.playerId);
  expectError(() => arena.start(guest), 'NEED_PLAYERS');
});

test('countdown starts a timed round and the server rejects a guess at the deadline', () => {
  const { arena, clock, start, host, submit } = fixture();

  start();
  const room = arena.snapshot(host);
  assert.equal(room.phase, 'round');
  assert.equal(room.round, 1);
  assert.equal(room.deadline, clock.now() + ROUND_MS);
  assert.equal(room.answer, null);
  expectError(() => arena.join({ code: host.code, name: 'Derya' }), 'MATCH_ACTIVE');

  clock.stall(ROUND_MS);
  expectError(() => submit(host, knownWrong), 'ROUND_CLOSED');
  assert.equal(arena.snapshot(host).phase, 'intermission');
  assert.equal(arena.snapshot(host).players[0].status, 'timeout');

  clock.advance(INTERMISSION_MS);
  assert.equal(arena.snapshot(host).round, 2);
  assert.equal(arena.snapshot(host).answer, null);
  clock.advance(ROUND_MS);
  assert.equal(arena.snapshot(host).phase, 'intermission');
});

test('invalid, duplicate and concurrent guesses preserve player-specific attempt counts', async () => {
  const { arena, start, host, guest, submit } = fixture();
  start();

  expectError(() => submit(host, 'ARM'), 'INVALID_WORD');
  expectError(() => submit(host, 'ZZZZZ'), 'INVALID_WORD');
  assert.deepEqual(arena.snapshot(host).guesses, []);

  const [first, second] = await Promise.all([
    Promise.resolve().then(() => submit(host, 'armut', 'shared-request')),
    Promise.resolve().then(() => submit(guest, 'armut', 'shared-request')),
  ]);
  assert.deepEqual(first, second);
  assert.deepEqual(submit(host, 'ARMUT', 'shared-request'), first);
  expectError(() => submit(host, 'KALEM', 'shared-request'), 'REQUEST_CONFLICT');
  assert.equal(arena.snapshot(host).guesses.length, 1);
  assert.equal(arena.snapshot(guest).guesses.length, 1);

  for (let index = 0; index < 4; index++) submit(host, knownWrong);
  assert.equal(arena.snapshot(host).phase, 'round');
  assert.equal(arena.snapshot(host).guesses.length, 5);
  assert.equal(arena.snapshot(host).players.find(player => player.id === host.playerId)?.status, 'exhausted');
  assert.deepEqual(arena.snapshot(guest).guesses, [second]);
  expectError(() => submit(host, knownWrong), 'PLAYER_DONE');
});

test('game continues on disconnect and restores private progress before expiry', () => {
  const { arena, clock, start, host, guest, submit } = fixture();
  start();

  const initial = submit(host, knownWrong);
  arena.disconnect(host);
  const player = () => arena.snapshot(guest).players.find(entry => entry.id === host.playerId)!;
  assert.equal(player().status, 'disconnected');
  assert.deepEqual(arena.snapshot(guest).guesses, []);
  expectError(() => submit(host, knownWrong), 'NOT_A_MEMBER');

  clock.advance(700);
  submit(guest, knownWrong);
  arena.resume(host);
  assert.equal(player().connected, true);
  assert.deepEqual(arena.snapshot(host).guesses, [initial]);
  assert.equal(arena.snapshot(host).deadline! - clock.now(), ROUND_MS - 700);

  arena.disconnect(host);
  clock.advance(ROUND_MS);
  expectError(() => arena.resume(host), 'NOT_A_MEMBER');
  assert.equal(arena.snapshot(guest).hostId, guest.playerId);
});

test('five rounds use distinct answers, retain results and rematch with fresh ready states', () => {
  const { arena, clock, events, start, host, guest, submit } = fixture();
  start();
  const seen = new Set<string>();
  const oldMatchId = arena.snapshot(host).matchId!;

  for (let round = 1; round <= 5; round++) {
    assert.equal(arena.snapshot(host).round, round);
    assert.equal(arena.snapshot(host).answer, null);

    for (const candidate of testAnswers) {
      const result = submit(host, candidate.toLocaleLowerCase('tr'));
      if (result.marks.every(mark => mark === 'correct')) break;
    }
    assert.equal(arena.snapshot(host).phase, 'round');
    assert.equal(arena.snapshot(guest).guesses.length, 0);
    clock.advance(1_000);
    for (let index = 0; index < 5; index++) submit(guest, knownWrong);

    const room = arena.snapshot(guest);
    assert.equal(room.phase, 'intermission');
    assert.ok(room.answer && !seen.has(room.answer));
    seen.add(room.answer);
    assert.equal(room.players[0].rank, 1);
    assert.equal(room.players[0].solved, round);
    assert.equal(room.players[0].fastestWord, null);
    assert.equal(room.players[1].points, 0);
    clock.advance(INTERMISSION_MS);
  }
  assert.equal(arena.snapshot(host).phase, 'finished');
  assert.equal(arena.snapshot(host).players[0].points, 4500);
  assert.equal(arena.snapshot(host).players[0].fastestWord, [...seen][0]);
  assert.equal(events.filter(event => event.type === 'round:end').length, 5);
  assert.ok(events.some(event => event.type === 'match:end'));
  arena.restart(host);
  assert.equal(arena.snapshot(host).phase, 'lobby');
  assert.ok(arena.snapshot(host).players.every(player => player.points === 0 && !player.ready && !player.fastestWord));
  expectError(() => arena.start(host), 'NOT_READY');

  start();
  expectError(() => arena.guess(host, {
    matchId: oldMatchId, round: 1, requestId: 'old-request', word: knownWrong,
  }), 'ROUND_CLOSED');
});
