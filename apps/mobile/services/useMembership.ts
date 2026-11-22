import { useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import type {
  AccountProfile, AuthReply, DailyState, LeaderboardEntry, LeagueId, SoloChallengeTicket, SoloResultRequest,
} from "@arena/shared";

type Session = AuthReply & { serverUrl: string };
type Credentials = { username: string; password: string };
type Cache = { tickets: SoloChallengeTicket[]; pending: SoloResultRequest[] };

const sessionKey = "arena.member";
const emptyCache: Cache = { tickets: [], pending: [] };
let writes = Promise.resolve();

export class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function api<T>(server: string, path: string, token?: string, body?: object): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`${server}/api/${path}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new RequestError(payload?.message ?? "Sunucu isteği tamamlanamadı.", response.status);
    if (!payload) throw new RequestError("Sunucudan geçerli yanıt alınamadı.", 502);
    return payload as T;
  } catch (error) {
    if (error instanceof RequestError) throw error;
    throw new RequestError("Oyun sunucusuna ulaşılamadı. Bağlantını kontrol et.", 0);
  } finally {
    clearTimeout(timeout);
  }
}

async function read<T>(key: string, fallback: T): Promise<T> {
  try {
    await writes;
    const value = await SecureStore.getItemAsync(key);
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

function retain(key: string, value: unknown) {
  const task = writes.then(() => value === null
    ? SecureStore.deleteItemAsync(key)
    : SecureStore.setItemAsync(key, JSON.stringify(value))
  );
  writes = task.catch(() => {});
  return task;
}

const queueKey = (id: string) => `arena.solo.pending.${id}`;
const ticketsKey = (id: string) => `arena.solo.tickets.${id}`;

export function useMembership(serverUrl: string | null) {
  const [session, setSession] = useState<Session | null>(null);
  const [cache, setCache] = useState(emptyCache);
  const [ready, setReady] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);
  const current = useRef<Session | null>(null);
  const local = useRef(emptyCache);
  const running = useRef<Promise<void> | null>(null);

  function applySession(value: Session | null) {
    current.current = value;
    setSession(value);
  }

  function applyCache(value: Cache) {
    local.current = value;
    setCache(value);
  }

  async function loadCache(value: Session) {
    const id = value.profile.id;
    const [pending, tickets] = await Promise.all([
      read<SoloResultRequest[]>(queueKey(id), []),
      read<SoloChallengeTicket[]>(ticketsKey(id), []),
    ]);
    return { pending, tickets: tickets.filter(ticket => !pending.some(result => result.challengeId === ticket.id)) };
  }

  function sync() {
    const value = current.current;
    if (!value) return Promise.resolve();
    if (running.current) return running.current;
    const { token, serverUrl: server, profile: { id } } = value;
    const task = (async () => {
      try {
        for (const result of local.current.pending) {
          try {
            await api(server, "solo/results", token, result);
          } catch (error) {
            if (!(error instanceof RequestError) || error.status !== 400) throw error;
            setSyncNotice(error.message);
          }
          if (current.current?.token !== token) return;
          const pending = local.current.pending.filter(entry => entry.challengeId !== result.challengeId);
          applyCache({ ...local.current, pending });
          await retain(queueKey(id), pending);
        }
        const [{ profile }, { tickets }] = await Promise.all([
          api<{ profile: AccountProfile }>(server, "auth/me", token),
          api<{ tickets: SoloChallengeTicket[] }>(server, "solo/challenges", token, {}),
        ]);
        if (current.current?.token !== token) return;
        const available = tickets.filter(ticket => !local.current.pending.some(entry => entry.challengeId === ticket.id));
        applyCache({ ...local.current, tickets: available });
        applySession({ ...value, profile });
        await Promise.all([retain(sessionKey, { ...value, profile }), retain(ticketsKey(id), available)]);
      } catch (error) {
        if (current.current?.token !== token) return;
        if (error instanceof RequestError && error.status === 401) {
          applySession(null);
          applyCache(emptyCache);
          await retain(sessionKey, null).catch(() => {});
          setSyncNotice(error.message);
        }
      }
    })();
    running.current = task;
    void task.finally(() => { if (running.current === task) running.current = null; });
    return task;
  }

  useEffect(() => {
    let active = true;
    setReady(false);
    applySession(null);
    applyCache(emptyCache);
    void (async () => {
      const saved = await read<Session | null>(sessionKey, null);
      if (!active) return;
      if (saved && saved.serverUrl === serverUrl) {
        const savedCache = await loadCache(saved);
        if (!active) return;
        applyCache(savedCache);
        applySession(saved);
        void sync();
      }
      setReady(true);
    })();
    const subscription = AppState.addEventListener("change", state => { if (state === "active") void sync(); });
    const timer = setInterval(() => { if (AppState.currentState === "active") void sync(); }, 20_000);
    return () => { active = false; subscription.remove(); clearInterval(timer); };
  }, [serverUrl]);

  async function authenticate(kind: "login" | "register", credentials: Credentials) {
    if (!serverUrl) throw new Error("Kayıt veya giriş için önce oyun sunucusunu bağla.");
    const reply = await api<AuthReply>(serverUrl, `auth/${kind}`, undefined, credentials);
    const value = { ...reply, serverUrl };
    const savedCache = await loadCache(value);
    await retain(sessionKey, value);
    applyCache(savedCache);
    applySession(value);
    setSyncNotice(null);
    void sync();
  }

  async function logout() {
    const saved = current.current;
    applySession(null);
    applyCache(emptyCache);
    setSyncNotice(null);
    await retain(sessionKey, null);
    if (saved) void api(saved.serverUrl, "auth/logout", saved.token, {}).catch(() => {});
  }

  async function recordSolo(result: SoloResultRequest) {
    const saved = current.current;
    if (!saved || local.current.pending.some(entry => entry.challengeId === result.challengeId)) return;
    const pending = [...local.current.pending, result];
    const tickets = local.current.tickets.filter(ticket => ticket.id !== result.challengeId);
    applyCache({ pending, tickets });
    try {
      await retain(queueKey(saved.profile.id), pending);
      await retain(ticketsKey(saved.profile.id), tickets);
    } catch {
      setSyncNotice("Sonuç cihazda saklanamadı. Bağlantın varsa hemen senkronize ediliyor.");
    }
    void sync();
  }

  async function loadEntries(league?: LeagueId) {
    if (!serverUrl) throw new Error("Lider tablosunu görmek için bir sunucuya bağlan.");
    await sync();
    const path = league ? `leaderboard?league=${league}` : "leaderboard";
    return (await api<{ entries: LeaderboardEntry[] }>(serverUrl, path, current.current?.token)).entries;
  }

  async function dailyRequest(path: string, body?: object) {
    const value = current.current;
    if (!value) throw new Error("Günlük mücadele için hesabına giriş yap.");
    try {
      return await api<DailyState>(value.serverUrl, path, value.token, body);
    } catch (error) {
      if (error instanceof RequestError && error.status === 401) void sync();
      throw error;
    }
  }

  return {
    ready, session, pending: cache.pending.length, syncNotice, authenticate, logout, loadEntries, recordSolo, sync,
    availableTicket: cache.tickets.find(ticket => ticket.expiresAt > Date.now()),
    loadDaily: () => dailyRequest("daily"),
    startDaily: (date: string) => dailyRequest("daily/start", { date }),
    guessDaily: (date: string, round: number, requestId: string, word: string) =>
      dailyRequest("daily/guess", { date, round, requestId, word }),
    nextDaily: (date: string, round: number) => dailyRequest("daily/next", { date, round }),
  };
}
