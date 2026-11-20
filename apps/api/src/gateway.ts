import { createHash, randomBytes } from "node:crypto";
import type { Server as HttpServer } from "node:http";
import { isIP } from "node:net";
import { Server, type Socket } from "socket.io";
import { z } from "zod";
import type { ClientEvents, PublicPhase, Reply, RoomTicket, RoomView, ServerEvents } from "@arena/shared";
import { Arena, ArenaError, type ArenaOptions } from "./arena";
import type { History } from "./history";

type Identity = { code: string; playerId: string };
type Client = Socket<ClientEvents, ServerEvents, Record<never, never>, { identity?: Identity }>;
type Session = Identity & { id: string; expiresAt: number };
type Ack<T extends object> = (reply: Reply<T>) => void;

const sessionMs = 12 * 60 * 60 * 1_000;
const minute = 60_000;
const playerName = z.string().trim().min(1).max(24).regex(/^[^\p{C}<>]+$/u);
const roomName = playerName.max(40);
const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6}$/);
const capacity = z.number().int().min(2).max(8);
const empty = z.object({}).strict();
const guess = z.object({
  matchId: z.string().uuid(),
  round: z.number().int().min(1).max(5),
  requestId: z.string().regex(/^[\w-]{8,64}$/),
  word: z.string().min(1).max(24),
}).strict();

const trustProxy = process.env.TRUST_PROXY === "1";
const allowedOrigins = new Set(
  (process.env.CORS_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173")
    .split(",").map(origin => origin.trim()).filter(Boolean),
);

export function originAllowed(origin: string | undefined, host?: string) {
  if (!origin || allowedOrigins.has(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "https:" || url.protocol === "http:") && url.host === host;
  } catch {
    return false;
  }
}

class RateWindow {
  private readonly limits = new Map<string, { count: number; expiresAt: number }>();

  take(key: string, limit: number, duration: number) {
    let entry = this.limits.get(key);
    const now = Date.now();
    if (!entry || now >= entry.expiresAt) {
      entry = { count: 0, expiresAt: now + duration };
      this.limits.set(key, entry);
    }
    return ++entry.count <= limit;
  }

  sweep(now: number) {
    for (const [key, entry] of this.limits) {
      if (now >= entry.expiresAt) this.limits.delete(key);
    }
  }
}

function clientAddress(socket: Client) {
  const forwarded = socket.handshake.headers["x-forwarded-for"];
  if (trustProxy && typeof forwarded === "string" && isIP(forwarded)) return forwarded;
  return socket.handshake.address;
}

function digest(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function mountGateway(
  http: HttpServer,
  history: Pick<History, "enqueue">,
  options: Pick<ArenaOptions, "clock" | "answers" | "accepted">,
) {
  const io = new Server<ClientEvents, ServerEvents, Record<never, never>, { identity?: Identity }>(http, {
    maxHttpBufferSize: 4_096,
    allowRequest: (req, callback) => callback(null, originAllowed(req.headers.origin, req.headers.host)),
    cors: (req, callback) => callback(null, { origin: originAllowed(req.headers.origin, req.headers.host) }),
    serveClient: false,
  });

  const members = new Map<string, Map<string, Client>>();
  const sessions = new Map<string, Session>();
  const sessionIds = new Map<string, string>();
  const delivered = new WeakMap<Client, RoomView>();
  const rate = new RateWindow();
  const arena = new Arena({ ...options, onUpdate: publish, onPersist: event => history.enqueue(event) });

  function publish(roomCode: string) {
    for (const socket of members.get(roomCode)?.values() ?? []) {
      const identity = socket.data.identity;
      if (!identity) continue;
      try {
        const room = arena.snapshot(identity);
        const previous = delivered.get(socket);
        delivered.set(socket, room);
        socket.emit("room:update", room);
        emitChanges(socket, previous, room);
      } catch (error) {
        if (!(error instanceof ArenaError)) throw error;
        detach(socket);
        revoke(identity.playerId);
        socket.emit("room:removed", { error: "Bu odadaki oturumunuz sona erdi." });
      }
    }
  }

  function emitChanges(socket: Client, previous: RoomView | undefined, room: RoomView) {
    const stage: PublicPhase = { round: room.round, deadline: room.deadline, serverNow: room.serverNow };
    if (!previous || previous.phase !== room.phase || previous.round !== room.round) {
      if (room.phase === "countdown") socket.emit("game:countdown", stage);
      if (room.phase === "round") socket.emit("game:round-start", stage);
      if (room.phase === "intermission" && room.answer) socket.emit("game:round-end", { ...stage, answer: room.answer });
      if (room.phase === "finished") socket.emit("game:match-end", stage);
    }
    if (!previous || previous.players.length !== room.players.length || previous.players.some(player =>
      room.players.find(current => current.id === player.id)?.status !== player.status,
    )) socket.emit("game:player-status", room.players);
    if (!previous || previous.players.length !== room.players.length || previous.players.some(player =>
      room.players.find(current => current.id === player.id)?.points !== player.points,
    )) socket.emit("game:score-update", room.players);
  }

  function bind(socket: Client, identity: Identity) {
    let sockets = members.get(identity.code);
    const old = sockets?.get(identity.playerId);
    if (old && old !== socket) {
      detach(old);
      old.emit("room:removed", { error: "Oturumunuz başka bir sekmede açıldı." });
      sockets = members.get(identity.code);
    }
    if (!sockets) {
      sockets = new Map();
      members.set(identity.code, sockets);
    }
    socket.data.identity = { code: identity.code, playerId: identity.playerId };
    sockets.set(identity.playerId, socket);
  }

  function detach(socket: Client) {
    const identity = socket.data.identity;
    if (!identity) return;
    delete socket.data.identity;
    delivered.delete(socket);
    const sockets = members.get(identity.code);
    if (sockets?.get(identity.playerId) === socket) sockets.delete(identity.playerId);
    if (!sockets?.size) members.delete(identity.code);
  }

  function revoke(playerId: string) {
    const id = sessionIds.get(playerId);
    if (!id) return;
    sessionIds.delete(playerId);
    sessions.delete(id);
    history.enqueue({ type: "session:remove", id });
  }

  function issue(socket: Client, identity: Identity): RoomTicket {
    const token = randomBytes(32).toString("base64url");
    const id = digest(token);
    const expiresAt = Date.now() + sessionMs;
    sessions.set(id, { ...identity, id, expiresAt });
    sessionIds.set(identity.playerId, id);
    history.enqueue({ type: "session:save", id, playerId: identity.playerId, expiresAt });
    bind(socket, identity);
    announce(identity, "player:connected");
    return { token, room: arena.snapshot(identity) };
  }

  function announce(identity: Identity, event: "player:connected" | "player:disconnected" | "player:reconnected") {
    for (const socket of members.get(identity.code)?.values() ?? []) {
      socket.emit(event, { playerId: identity.playerId });
    }
  }

  const maintenance = setInterval(() => {
    const now = Date.now();
    rate.sweep(now);
    for (const session of sessions.values()) {
      try {
        if (session.expiresAt <= now) {
          const socket = members.get(session.code)?.get(session.playerId);
          if (socket) {
            detach(socket);
            socket.emit("room:removed", { error: "Oturum süreniz doldu." });
          }
          arena.leave(session);
          revoke(session.playerId);
        } else {
          arena.snapshot(session);
        }
      } catch (error) {
        if (!(error instanceof ArenaError)) throw error;
        revoke(session.playerId);
      }
    }
  }, 30_000);
  maintenance.unref();

  io.use((socket, next) => {
    if (rate.take(`connect:${clientAddress(socket)}`, 120, minute)) next();
    else next(new Error("Çok fazla bağlantı denemesi."));
  });

  io.on("connection", socket => {
    let received = 0;
    let resets = 0;

    function command<Schema extends z.ZodTypeAny, Result extends object>(
      schema: Schema,
      operation: (input: z.output<Schema>) => Result,
    ) {
      return (payload: unknown, ack: Ack<Result>) => {
        if (typeof ack !== "function") return;
        const now = Date.now();
        if (now >= resets) {
          received = 0;
          resets = now + 1_000;
        }
        if (++received > 15) {
          ack({ ok: false, error: "Çok fazla istek. Biraz bekleyip tekrar deneyin." });
          return;
        }
        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          ack({ ok: false, error: "Gönderilen bilgiler geçersiz." });
          return;
        }
        try {
          ack({ ok: true, ...operation(parsed.data) });
        } catch (error) {
          if (error instanceof ArenaError) {
            ack({ ok: false, error: error.message });
          } else {
            console.error("Oyun isteği işlenemedi", error instanceof Error ? error.name : "UnknownError");
            ack({ ok: false, error: "İşlem tamamlanamadı." });
          }
        }
      };
    }

    function identity() {
      const member = socket.data.identity;
      const key = member && sessionIds.get(member.playerId);
      const session = key ? sessions.get(key) : undefined;
      if (!member || !session || session.expiresAt <= Date.now()) {
        throw new ArenaError("UNAUTHORIZED", "Oyun oturumu bulunamadı.");
      }
      return member;
    }

    function authorizeEntry() {
      if (socket.data.identity) throw new ArenaError("ALREADY_JOINED", "Önce mevcut odanızdan ayrılın.");
      if (!rate.take(`entry:${clientAddress(socket)}`, 60, minute)) {
        throw new ArenaError("RATE_LIMIT", "Çok fazla oda denemesi. Daha sonra tekrar deneyin.");
      }
    }

    socket.on("room:create", command(
      z.object({ playerName, name: z.union([roomName, z.literal("")]).optional(), maxPlayers: capacity }).strict(),
      input => {
        authorizeEntry();
        return issue(socket, arena.create({
          name: input.playerName, roomName: input.name || undefined, maxPlayers: input.maxPlayers,
        }));
      },
    ));
    socket.on("room:join", command(z.object({ playerName, code }).strict(), input => {
      authorizeEntry();
      return issue(socket, arena.join({ code: input.code, name: input.playerName }));
    }));
    socket.on("room:resume", command(z.object({
      code, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
    }).strict(), input => {
      const session = sessions.get(digest(input.token));
      if (!session || session.expiresAt <= Date.now() || session.code !== input.code) {
        throw new ArenaError("SESSION_EXPIRED", "Oyun oturumunuz bulunamadı. Odaya tekrar katılın.");
      }
      const current = socket.data.identity;
      if (current?.playerId === session.playerId && current.code === session.code) {
        return { token: input.token, room: arena.snapshot(session) };
      }
      authorizeEntry();
      arena.resume(session);
      bind(socket, session);
      announce(session, "player:reconnected");
      return { token: input.token, room: arena.snapshot(session) };
    }));
    socket.on("room:leave", command(empty, () => {
      const member = identity();
      detach(socket);
      revoke(member.playerId);
      arena.leave(member);
      return {};
    }));
    socket.on("room:player-ready", command(z.object({ ready: z.boolean() }).strict(), input => {
      arena.ready(identity(), input.ready);
      return {};
    }));
    socket.on("room:player-kick", command(z.object({ playerId: z.string().uuid() }).strict(), input => {
      arena.kick(identity(), input.playerId);
      revoke(input.playerId);
      return {};
    }));
    socket.on("room:settings", command(z.object({ name: roomName, maxPlayers: capacity }).strict(), input => {
      arena.settings(identity(), { roomName: input.name, maxPlayers: input.maxPlayers });
      return {};
    }));
    socket.on("game:start", command(empty, () => {
      arena.start(identity());
      return {};
    }));
    socket.on("game:restart", command(empty, () => {
      arena.restart(identity());
      return {};
    }));
    socket.on("game:submit-guess", command(guess, input => {
      const result = arena.guess(identity(), input);
      socket.emit("game:guess-result", result);
      return { guess: result };
    }));
    socket.on("disconnect", () => {
      const member = socket.data.identity;
      if (!member) return;
      detach(socket);
      arena.disconnect(member);
      announce(member, "player:disconnected");
    });
  });

  return {
    async close() {
      clearInterval(maintenance);
      await io.close();
    },
  };
}
