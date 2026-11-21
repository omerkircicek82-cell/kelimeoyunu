import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { io, type Socket } from "socket.io-client";
import { FINAL_GUESS_MS, ROUND_MS, type ClientEvents, type Requests, type ResponseFor, type RoomView, type ServerEvents } from "@arena/shared";
import type { ArenaEvent, Clock } from "./arena";
import { mountGateway } from "./gateway";

type Client = Socket<ServerEvents, ClientEvents>;

class FakeClock implements Clock {
  private time = Date.now();
  private readonly timers = new Map<() => void, number>();

  now = () => this.time;

  setTimer(callback: () => void, delay: number) {
    this.timers.set(callback, this.time + delay);
    return () => void this.timers.delete(callback);
  }

  advance(ms: number) {
    const target = this.time + ms;
    while (true) {
      const next = [...this.timers].sort((a, b) => a[1] - b[1])[0];
      if (!next || next[1] > target) break;
      this.time = next[1];
      this.timers.delete(next[0]);
      next[0]();
    }
    this.time = target;
  }
}

function snapshot(client: Client, predicate: (value: RoomView) => boolean) {
  return new Promise<RoomView>(resolve => {
    function update(value: RoomView) {
      if (!predicate(value)) return;
      client.off("room:update", update);
      resolve(value);
    }
    client.on("room:update", update);
  });
}

function request<Event extends keyof Requests>(
  client: Client, event: Event, data: Requests[Event],
): Promise<ResponseFor<Event>> {
  // Socket.IO cannot correlate a generic event with its decorated acknowledgement tuple.
  return (client as Socket).timeout(2_000).emitWithAck(event, data);
}

function successful<Result extends object>(response: { ok: true } & Result | { ok: false; error: string }) {
  assert.ok(response.ok, response.ok ? undefined : response.error);
  return response;
}

test("two Socket.IO clients complete five private rounds, reconnect, and rematch", { timeout: 10_000 }, async t => {
  const clock = new FakeClock();
  const answers = ["KALEM", "KİTAP", "ARMUT", "ÇİLEK", "DOLAP"];
  const misses = ["SEPET", "YAKUT", "BAHAR", "DÜĞME", "PAMUK"];
  const persisted: Array<ArenaEvent | { type: string }> = [];
  const http = createServer();
  const gateway = mountGateway(http, { enqueue: event => persisted.push(event) }, {
    clock, answers, accepted: new Set(misses),
  });
  http.listen(0, "127.0.0.1");
  await once(http, "listening");
  const port = (http.address() as AddressInfo).port;
  const clients: Client[] = [];
  t.after(async () => {
    for (const socket of clients) socket.disconnect();
    await gateway.close();
  });
  async function connect() {
    const client: Client = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"], forceNew: true, reconnection: false, autoConnect: false,
    });
    clients.push(client);
    const connected = new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    client.connect();
    await connected;
    return client;
  }

  let ada = await connect();
  const deniz = await connect();
  const owner = successful(await request(ada, "room:create", { playerName: "Ada", maxPlayers: 2 }));
  assert.match(owner.room.code, /^[A-Z0-9]{6}$/);
  const lobby = snapshot(ada, room => room.players.length === 2);
  const guest = successful(await request(deniz, "room:join", { playerName: "Deniz", code: owner.room.code }));
  await lobby;
  assert.equal((await request(deniz, "game:start", {})).ok, false);
  assert.equal((await request(ada, "game:start", {})).ok, false);
  successful(await request(deniz, "room:player-ready", { ready: true }));
  const countdown = snapshot(deniz, room => room.phase === "countdown");
  successful(await request(ada, "game:start", {}));
  assert.equal((await countdown).deadline, clock.now() + 3_000);

  const guestGuesses: string[] = [];
  deniz.on("game:guess-result", guess => guestGuesses.push(guess.word));
  const revealed = new Set<string>();
  let firstRound: RoomView | undefined;
  for (let round = 1; round <= 5; round++) {
    const active = snapshot(ada, room => room.phase === "round" && room.round === round);
    const other = snapshot(deniz, room => room.phase === "round" && room.round === round);
    clock.advance(round === 1 ? 3_000 : 5_000);
    const [a, b] = await Promise.all([active, other]);
    firstRound ??= a;
    assert.ok(a.matchId);
    assert.equal(a.deadline, clock.now() + ROUND_MS);
    assert.equal(b.deadline, a.deadline);
    assert.equal(a.answer, null);
    assert.deepEqual(b.guesses, []);

    if (round === 1) {
      const privateGuess = { matchId: a.matchId, round, requestId: "ada-retry-1", word: misses[0] };
      const [first] = await Promise.all([
        request(ada, "game:submit-guess", privateGuess),
        request(deniz, "game:submit-guess", { ...privateGuess, requestId: "deniz-own-1", word: misses[1] }),
      ]);
      successful(first);
      const disconnected = snapshot(deniz, room => room.players.some(player => player.id === a.playerId && !player.connected));
      ada.disconnect();
      await disconnected;
      ada = await connect();
      const resumed = successful(await request(ada, "room:resume", { code: a.code, token: owner.token }));
      assert.equal(resumed.room.playerId, a.playerId);
      const retry = successful(await request(ada, "room:resume", { code: a.code, token: owner.token }));
      assert.equal(retry.room.playerId, a.playerId);
      assert.deepEqual(resumed.room.guesses.map(guess => guess.word), [misses[0]]);
      assert.deepEqual(successful(await request(ada, "game:submit-guess", privateGuess)).guess, successful(first).guess);
      assert.equal((await request(ada, "game:submit-guess", { ...privateGuess, word: misses[1] })).ok, false);
    } else {
      const lastChance = snapshot(deniz, room => room.phase === "round" && room.round === round && room.finalCountdown);
      const result = snapshot(deniz, room => room.phase === "intermission" && room.round === round);
      let solved = false;
      for (const [index, word] of answers.filter(word => !revealed.has(word)).entries()) {
        const reply = successful(await request(ada, "game:submit-guess", {
          matchId: a.matchId, round, requestId: `ada-${round}-0${index}`, word,
        }));
        if (reply.guess.marks.every(mark => mark === "correct")) {
          solved = true;
          break;
        }
      }
      assert.ok(solved);
      assert.equal((await lastChance).deadline, clock.now() + FINAL_GUESS_MS);
      clock.advance(FINAL_GUESS_MS);
      const summary = await result;
      assert.ok(summary.answer);
      assert.ok(!revealed.has(summary.answer));
      assert.deepEqual(summary.guesses, []);
      assert.ok(summary.players.find(player => player.id === a.playerId)!.roundPoints > 0);
      revealed.add(summary.answer);
      continue;
    }
    const result = snapshot(deniz, room => room.phase === "intermission");
    clock.advance(ROUND_MS);
    const summary = await result;
    assert.deepEqual(summary.guesses.map(guess => guess.word), [misses[1]]);
    assert.equal(summary.players.find(player => player.id === a.playerId)?.roundAttempts, 1);
    assert.ok(summary.answer);
    revealed.add(summary.answer);
  }
  const finished = snapshot(ada, room => room.phase === "finished");
  clock.advance(5_000);
  const result = await finished;
  assert.equal(revealed.size, 5);
  assert.equal(result.players[0].id, owner.room.playerId);
  assert.equal(result.players[0].solved, 4);
  assert.deepEqual(guestGuesses, [misses[1]]);
  assert.equal(persisted.filter(event => event.type === "round:end").length, 5);
  assert.equal(persisted.filter(event => event.type === "match:end").length, 1);
  ada.disconnect();
  ada = await connect();
  successful(await request(ada, "room:resume", { code: owner.room.code, token: owner.token }));
  const rematch = snapshot(deniz, room => room.phase === "lobby");
  successful(await request(ada, "game:restart", {}));
  assert.ok((await rematch).players.every(player => !player.ready && player.points === 0));
  successful(await request(ada, "room:settings", { name: "Yeni maç", maxPlayers: 2, roundMode: "untimed" }));
  successful(await request(deniz, "room:player-ready", { ready: true }));
  successful(await request(ada, "game:start", {}));
  const next = snapshot(ada, room => room.phase === "round");
  clock.advance(3_000);
  const newRound = await next;
  assert.notEqual(newRound.matchId, firstRound?.matchId);
  assert.equal(newRound.roundMode, "untimed");
  assert.equal(newRound.deadline, null);
  assert.equal(newRound.finalCountdown, false);
  assert.equal((await request(ada, "game:submit-guess", {
    matchId: firstRound!.matchId!, round: 1, requestId: "ada-retry-1", word: misses[0],
  })).ok, false);
});
