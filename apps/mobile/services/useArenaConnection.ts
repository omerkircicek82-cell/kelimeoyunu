import { useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { Socket } from "socket.io-client";
import type { ClientEvents, Requests, ResponseFor, RoomTicket, RoomView, ServerEvents } from "@arena/shared";

import { createArenaSocket } from "./server";

type Ticket = { serverUrl: string; code: string; token: string; accountId?: string };
type Success<Event extends keyof Requests> = Extract<ResponseFor<Event>, { ok: true }>;
type ConnectionState = { room: RoomView | null; online: boolean; recovering: boolean; error: string | null };
type ArenaSocket = Socket<ServerEvents, ClientEvents>;

const sessionKey = "arena.player-session";
let storageWrites = Promise.resolve();

function saveSession(ticket: Ticket | null) {
  storageWrites = storageWrites.then(() => ticket
    ? SecureStore.setItemAsync(sessionKey, JSON.stringify(ticket))
    : SecureStore.deleteItemAsync(sessionKey)
  ).catch(() => {});
}

async function loadSession(serverUrl: string, accountId?: string): Promise<Ticket | null> {
  try {
    await storageWrites;
    const raw = await SecureStore.getItemAsync(sessionKey);
    const ticket = raw ? JSON.parse(raw) as Partial<Ticket> : null;
    if (ticket?.serverUrl === serverUrl && ticket.accountId === accountId && typeof ticket.code === "string" && typeof ticket.token === "string") {
      return { serverUrl, code: ticket.code, token: ticket.token, accountId };
    }
  } catch {
    // A missing or inaccessible credential leaves the app in guest mode.
  }
  return null;
}

class TemporaryConnectionError extends Error {}

async function request<Event extends keyof Requests>(
  socket: ArenaSocket, event: Event, data: Requests[Event],
): Promise<Success<Event>> {
  if (!socket.connected) throw new TemporaryConnectionError("Sunucu bağlantısı kuruluyor.");
  const channel = socket.timeout(5_000) as unknown as {
    emitWithAck: (event: Event, data: Requests[Event]) => Promise<ResponseFor<Event>>;
  };
  const reply = await channel.emitWithAck(event, data).catch(() => {
    throw new TemporaryConnectionError("Sunucudan yanıt gelmedi. Tekrar deneyebilirsin.");
  });
  if (!reply.ok) throw new Error(reply.error);
  return reply as Success<Event>;
}

export function useArenaConnection(serverUrl: string, accessToken?: string, accountId?: string) {
  const socket = useMemo(() => createArenaSocket(serverUrl, accessToken), [serverUrl, accessToken]);
  const [state, setState] = useState<ConnectionState>({
    room: null, online: false, recovering: false, error: null,
  });
  const ticket = useRef<Ticket | null>(null);

  function remember(reply: RoomTicket) {
    ticket.current = { serverUrl, code: reply.room.code, token: reply.token, accountId };
    saveSession(ticket.current);
    receive(reply.room);
  }

  function forget(error: string | null = null) {
    ticket.current = null;
    saveSession(null);
    setState(value => ({ ...value, room: null, recovering: false, error }));
  }

  function receive(room: RoomView) {
    setState(value => {
      if (value.room?.code === room.code && value.room.serverNow > room.serverNow) return value;
      return { ...value, room };
    });
  }

  useEffect(() => {
    let mounted = true;
    let epoch = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;

    async function connected() {
      const attempt = ++epoch;
      const saved = ticket.current;
      setState(value => ({ ...value, online: true, recovering: Boolean(saved), error: null }));
      if (!saved) return;

      try {
        const restored = await request(socket, "room:resume", { code: saved.code, token: saved.token });
        if (!mounted || epoch !== attempt) return;
        remember(restored);
        setState(value => ({ ...value, recovering: false }));
      } catch (error) {
        if (!mounted || epoch !== attempt) return;
        if (error instanceof TemporaryConnectionError) {
          retry = setTimeout(() => { if (socket.connected) void connected(); }, 1_000);
          return;
        }
        forget(error instanceof Error ? error.message : "Oturum geri yüklenemedi.");
      }
    }

    function disconnected() {
      epoch += 1;
      clearTimeout(retry);
      setState(value => ({ ...value, online: false, recovering: Boolean(ticket.current) }));
    }

    function connectFailed(error: Error & { description?: unknown; data?: unknown }) {
      if (__DEV__) {
        const status = typeof error.description === "number" ? ` (HTTP ${error.description})` : "";
        console.info(`[HarfArena] Socket.IO bağlantısı: ${serverUrl} — ${error.message}${status}`);
      }
      setState(value => ({ ...value, online: false, recovering: Boolean(ticket.current),
        error: error.data === "ACCOUNT_SESSION" ? error.message : "Oyun bağlantısı kurulamadı. Yeniden deneniyor." }));
    }

    function update(room: RoomView) {
      if (ticket.current?.code === room.code) receive(room);
    }

    function removed({ error }: { error: string }) {
      epoch += 1;
      clearTimeout(retry);
      forget(error);
    }

    socket.on("connect", connected);
    socket.on("disconnect", disconnected);
    socket.on("connect_error", connectFailed);
    socket.on("room:update", update);
    socket.on("room:removed", removed);
    void loadSession(serverUrl, accountId).then(saved => {
      if (!mounted) return;
      ticket.current = saved;
      setState(value => ({ ...value, recovering: Boolean(saved) }));
      socket.connect();
    });

    const appState = AppState.addEventListener("change", status => {
      if (status === "active" && !socket.connected && !socket.active) socket.connect();
    });

    return () => {
      mounted = false;
      epoch += 1;
      clearTimeout(retry);
      appState.remove();
      socket.off("connect", connected);
      socket.off("disconnect", disconnected);
      socket.off("connect_error", connectFailed);
      socket.off("room:update", update);
      socket.off("room:removed", removed);
      socket.disconnect();
    };
  }, [socket, serverUrl, accountId]);

  async function send<Event extends keyof Requests>(event: Event, data: Requests[Event]) {
    const reply = await request(socket, event, data);
    if ("token" in reply && "room" in reply) remember(reply);
    if (event === "room:leave") forget();
    return reply;
  }

  return { ...state, send };
}
