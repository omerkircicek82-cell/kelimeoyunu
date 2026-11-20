import assert from 'node:assert/strict';
import test from 'node:test';
import { COUNTDOWN_MS, INTERMISSION_MS, ROUND_MS } from '@arena/game-engine';
import { Arena, ArenaError, type ArenaEvent, type Clock, type Identity } from './arena';
import { accepted, answers } from './words';

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

function fixture() {
  const clock = new ManualClock();
  const events: ArenaEvent[] = [];
  const arena = new Arena({
    answers: testAnswers,
    accepted: new Set([knownWrong]),
    clock,
    onPersist: event => events.push(event),
  });
  const host = arena.create({ name: 'Ayşe', roomName: 'Yarış', maxPlayers: 2 });
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

test('answer pool contains distinct allowed words and excludes invented combinations', () => {
  assert.ok(answers.length >= 5);
  assert.equal(new Set(answers).size, answers.length);
  assert.ok(answers.every(word => accepted.has(word)));
  assert.ok(accepted.has('KATAR'));
  assert.equal(accepted.has('ZZZZZ'), false);
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
