import { useCallback, useEffect, useRef, useState } from 'react';
import type { AuthReply, SoloChallengeTicket, SoloResultRequest } from '@arena/shared';
import { accountApi, AccountRequestError } from './membership';

const ticketKey = (id: string) => `kelime-arenasi:solo:tickets:${id}`;
const queuePrefix = (id: string) => `kelime-arenasi:solo:result:${id}:`;
const volatileResults = new Map<string, SoloResultRequest>();
const volatileTickets = new Map<string, SoloChallengeTicket[]>();

function pendingFor(id: string) {
  const prefix = queuePrefix(id);
  const pending = new Map([...volatileResults].filter(([key]) => key.startsWith(prefix)));
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(prefix)) continue;
      try {
        const value = JSON.parse(localStorage.getItem(key) ?? 'null') as SoloResultRequest | null;
        if (value && key === prefix + value.challengeId && Array.isArray(value.guesses)) pending.set(key, value);
      } catch {
        /* A malformed item doesn't prevent the other games from syncing. */
      }
    }
  } catch {
    /* Storage can be disabled; its in-memory fallback remains usable. */
  }
  return pending;
}

function ticketsFor(id: string): SoloChallengeTicket[] {
  const inMemory = volatileTickets.get(id);
  if (inMemory) return inMemory;

  try {
    const list = JSON.parse(localStorage.getItem(ticketKey(id)) ?? '[]');
    if (Array.isArray(list)) return list;
  } catch {
    // Storage can be disabled.
  }
  return [];
}

function saveTickets(id: string, tickets: SoloChallengeTicket[]) {
  try {
    localStorage.setItem(ticketKey(id), JSON.stringify(tickets));
    volatileTickets.delete(id);
  } catch {
    volatileTickets.set(id, tickets);
  }
}

function readyTicket(id: string) {
  const pending = pendingFor(id);
  const prefix = queuePrefix(id);
  return ticketsFor(id).find(ticket => ticket?.expiresAt > Date.now() && !pending.has(prefix + ticket.id));
}

const empty = { pending: 0, available: false };

export function useOfflineQueue(session: AuthReply | null, refresh: () => Promise<void>) {
  const id = session?.profile.id;
  const token = session?.token;
  const scope = useRef(token);
  scope.current = token;
  const working = useRef<string | null>(null);
  const [snapshot, setSnapshot] = useState(empty);
  const [notice, setNotice] = useState('');

  const read = useCallback(() => {
    setSnapshot(id ? { pending: pendingFor(id).size, available: Boolean(readyTicket(id)) } : empty);
  }, [id]);

  const sync = useCallback(async () => {
    if (!id || !token || !navigator.onLine || working.current === token) return;
    working.current = token;
    let applied = false;
    try {
      for (const [key, result] of pendingFor(id)) {
        if (scope.current !== token) return;
        try {
          await accountApi('solo/results', { token, body: result });
          applied = true;
        } catch (error) {
          if (!(error instanceof AccountRequestError) || error.status !== 400) throw error;
          if (scope.current === token) setNotice(error.message);
        }
        volatileResults.delete(key);
        try { localStorage.removeItem(key); } catch { /* A retry is idempotent on the server. */ }
        if (scope.current === token) read();
      }

      const { tickets } = await accountApi<{ tickets: SoloChallengeTicket[] }>('solo/challenges', { token, body: {} });
      if (scope.current === token) {
        saveTickets(id, tickets);
        read();
      }
    } catch (error) {
      if (error instanceof AccountRequestError && error.status === 401 && scope.current === token) void refresh();
    } finally {
      if (applied && scope.current === token) void refresh();
      if (working.current === token) working.current = null;
    }
  }, [id, token, read, refresh]);

  useEffect(() => {
    setNotice('');
    read();
    if (!id) return;
    const reconnect = () => { void sync(); };
    const storage = (event: StorageEvent) => {
      if (event.key === ticketKey(id) || event.key?.startsWith(queuePrefix(id))) read();
    };
    reconnect();
    const timer = window.setInterval(reconnect, 20_000);
    window.addEventListener('online', reconnect);
    window.addEventListener('focus', reconnect);
    window.addEventListener('storage', storage);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('online', reconnect);
      window.removeEventListener('focus', reconnect);
      window.removeEventListener('storage', storage);
    };
  }, [id, read, sync]);

  function record(result: SoloResultRequest, accountId: string) {
    const key = queuePrefix(accountId) + result.challengeId;
    if (pendingFor(accountId).has(key)) return;
    try {
      localStorage.setItem(key, JSON.stringify(result));
    } catch {
      volatileResults.set(key, result);
      setNotice('Bu tarayıcı sonucu diske kaydedemedi. Eşitleme için sekmeyi açık tut.');
    }
    saveTickets(accountId, ticketsFor(accountId).filter(ticket => ticket.id !== result.challengeId));
    if (accountId === id) {
      read();
      void sync();
    }
  }

  return {
    ...snapshot, notice, record, sync,
    getTicket: () => id ? readyTicket(id) : undefined,
  };
}
