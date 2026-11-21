import { io, type Socket } from "socket.io-client";
import type { ClientEvents, ServerEvents } from "@arena/shared";

export function createArenaSocket(serverUrl: string): Socket<ServerEvents, ClientEvents> {
  return io(serverUrl, {
    autoConnect: false,
    // Keep the polling connection when an emulator or proxy cannot upgrade to WebSocket.
    transports: ["polling", "websocket"],
    tryAllTransports: true,
    timeout: 8_000,
  });
}

export function parseServerUrl(value: string) {
  const address = value.trim();
  if (!/^https?:\/\/(?:[a-z0-9.-]+|\[[a-f0-9:]+\])(?::[0-9]{1,5})?\/?$/i.test(address)) {
    throw new Error("Sunucunun tam adresini gir. Örnek: https://arena.ornek.com");
  }
  const url = new URL(address);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !url.hostname || (url.port && Number(url.port) > 65535)
  ) {
    throw new Error("Sunucunun tam adresini gir. Örnek: https://arena.ornek.com");
  }
  return url.origin;
}

export function inviteCodeFromUrl(value: string | null) {
  if (!value) return null;
  const match = /^kelimearenasi:\/\/room\/([a-z0-9]{6})\/?$/i.exec(value);
  return match?.[1].toUpperCase() ?? null;
}
