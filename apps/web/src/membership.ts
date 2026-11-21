import { useCallback, useRef, useState } from 'react';
import type { AccountProfile, AuthReply, LeaderboardEntry } from '@arena/shared';

type Credentials = { username: string; password: string };
const ACCOUNT_KEY = 'kelime-arenasi:account';

export class AccountRequestError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function accountApi<T>(path: string, { token, body }: { token?: string; body?: object } = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(`/api/${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (response.status === 204) return undefined as T;
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      throw new AccountRequestError(
        response.status === 404
          ? 'Sunucudaki hesap özelliği güncellenmeli.'
          : typeof payload?.message === 'string' ? payload.message : 'Sunucu isteği tamamlanamadı.',
        response.status,
      );
    }
    if (!payload) throw new AccountRequestError('Sunucudan geçerli bir yanıt alınamadı.', 502);
    return payload as T;
  } catch (error) {
    if (error instanceof AccountRequestError) throw error;
    throw new AccountRequestError('Oyun sunucusuna ulaşılamadı. Bağlantını kontrol et.', 0);
  } finally {
    clearTimeout(timer);
  }
}

function readSession(): AuthReply | null {
  try {
    const value: AuthReply | null = JSON.parse(sessionStorage.getItem(ACCOUNT_KEY) ?? 'null');
    if (value && /^[A-Za-z0-9_-]{43}$/.test(value.token) &&
      typeof value.profile?.id === 'string' && typeof value.profile.username === 'string') return value;
  } catch {
    /* A new browser session can start as a guest. */
  }
  return null;
}

export function useMembership() {
  const [session, setSession] = useState(readSession);
  const current = useRef(session);
  const requestVersion = useRef(0);

  const update = useCallback((value: AuthReply | null) => {
    current.current = value;
    setSession(value);
    try {
      if (value) sessionStorage.setItem(ACCOUNT_KEY, JSON.stringify(value));
      else sessionStorage.removeItem(ACCOUNT_KEY);
    } catch {
      /* The account is available in memory if browser storage is unavailable. */
    }
  }, []);

  const invalidate = useCallback(() => update(null), [update]);

  const refresh = useCallback(async () => {
    const value = current.current;
    if (!value) return;
    const version = ++requestVersion.current;
    try {
      const { profile } = await accountApi<{ profile: AccountProfile }>('auth/me', { token: value.token });
      if (version === requestVersion.current && current.current?.token === value.token) update({ ...value, profile });
    } catch (error) {
      if (error instanceof AccountRequestError && error.status === 401 && current.current?.token === value.token) {
        invalidate();
      }
    }
  }, [invalidate, update]);

  const authenticate = useCallback(async (kind: 'login' | 'register', credentials: Credentials) => {
    const reply = await accountApi<AuthReply>(`auth/${kind}`, { body: credentials });
    update(reply);
  }, [update]);

  const logout = useCallback(async () => {
    const value = current.current;
    if (!value) return;
    await accountApi('auth/logout', { token: value.token, body: {} });
    if (current.current?.token === value.token) invalidate();
  }, [invalidate]);

  const loadEntries = useCallback(async () => {
    await refresh();
    return (await accountApi<{ entries: LeaderboardEntry[] }>('leaderboard', { token: current.current?.token })).entries;
  }, [refresh]);

  return { session, refresh, invalidate, authenticate, logout, loadEntries };
}
