import { io, type Socket } from 'socket.io-client';
import { create } from 'zustand';
import type { ClientEvents, Requests, RoomTicket, RoomView, ServerEvents } from '@arena/shared';

type Ticket = { code: string; token: string; accountId?: string };
type ArenaState = {
  connected: boolean;
  recovering: boolean;
  room: RoomView | null;
  receivedAt: number;
  notice: string;
};

const SESSION_KEY = 'kelime-arenasi:session';

export const useArena = create<ArenaState>(() => ({
  connected: false,
  recovering: false,
  room: null,
  receivedAt: 0,
  notice: '',
}));

export const socket: Socket<ServerEvents, ClientEvents> = io({ autoConnect: false, retries: 0 });

export class RequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
  }
}

type ResponseFor<Event extends keyof Requests> = Parameters<Parameters<ClientEvents[Event]>[1]>[0];

type Accepted<Event extends keyof Requests> = Extract<ResponseFor<Event>, { ok: true }>;

export async function request<Event extends keyof Requests>(
  event: Event,
  data: Requests[Event],
): Promise<Accepted<Event>> {
  if (!socket.connected) throw new RequestError('Bağlantı kuruluyor. Biraz sonra tekrar dene.', true);
  // The shared event map binds each command payload and its acknowledgment.
  const channel = socket.timeout(4500) as unknown as {
    emitWithAck: (event: Event, data: Requests[Event]) => Promise<ResponseFor<Event>>;
  };
  const reply = await channel.emitWithAck(event, data).catch(() => {
    throw new RequestError('Sunucudan yanıt gelmedi. Tekrar deneyebilirsin.', true);
  });
  if (!reply.ok) throw new RequestError(reply.error, false);
  return reply as Accepted<Event>;
}

function readTicket(): Ticket | null {
  try {
    const ticket = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? 'null');
    return typeof ticket?.code === 'string' && typeof ticket?.token === 'string' ? ticket : null;
  } catch {
    return null;
  }
}

let activeTicket = readTicket();
let activeAccountId: string | undefined;

export function hasRoomTicket() {
  return activeTicket !== null;
}

function receiveRoom(room: RoomView) {
  const current = useArena.getState().room;
  if (current?.code === room.code && current.serverNow > room.serverNow) return;
  useArena.setState({ room, receivedAt: performance.now() });
}

export function rememberTicket({ token, room }: RoomTicket) {
  activeTicket = { code: room.code, token, accountId: activeAccountId };
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(activeTicket));
  } catch {
    /* Keep the session in memory if browser storage is unavailable. */
  }
  receiveRoom(room);
}

export function forgetTicket(notice = '') {
  activeTicket = null;
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* The in-memory session has already been cleared. */
  }
  useArena.setState({ room: null, recovering: false, notice });
}

export function attachConnection(accessToken?: string, accountId?: string, onAccountInvalid?: () => void) {
  activeAccountId = accountId;
  if (activeTicket && activeTicket.accountId !== accountId) forgetTicket();
  socket.auth = accessToken ? { accessToken } : {};

  let epoch = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const opened = async () => {
    const attempt = ++epoch;
    const ticket = activeTicket;
    useArena.setState({ connected: true, recovering: Boolean(ticket) });
    if (!ticket) return;
    try {
      const restored = await request('room:resume', { code: ticket.code, token: ticket.token });
      if (attempt !== epoch) return;
      rememberTicket(restored);
      useArena.setState({ recovering: false });
    } catch (error) {
      if (attempt !== epoch) return;
      if (error instanceof RequestError && error.retryable) {
        retry = setTimeout(opened, 1200);
        return;
      }
      forgetTicket(error instanceof Error ? error.message : 'Oturum geri yüklenemedi.');
    }
  };
  const closed = () => {
    epoch += 1;
    clearTimeout(retry);
    useArena.setState({ connected: false, recovering: false });
  };
  const removed = ({ error }: { error: string }) => forgetTicket(error);
  const connectError = (error: Error & { data?: unknown }) => {
    if (error.data !== 'ACCOUNT_SESSION') return;
    forgetTicket('Hesap oturumun sona erdi. Yeniden giriş yap.');
    onAccountInvalid?.();
  };
  socket.on('connect', opened);
  socket.on('connect_error', connectError);
  socket.on('disconnect', closed);
  socket.on('room:update', receiveRoom);
  socket.on('room:removed', removed);
  socket.connect();
  return () => {
    closed();
    socket.off('connect', opened);
    socket.off('connect_error', connectError);
    socket.off('disconnect', closed);
    socket.off('room:update', receiveRoom);
    socket.off('room:removed', removed);
    socket.disconnect();
  };
}
