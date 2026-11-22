import type { ConfigContext, ExpoConfig } from "expo/config";

function requireReleaseServer(value: string | undefined) {
  let url: URL;
  try {
    url = new URL(value ?? "");
  } catch {
    throw new Error("Üretim derlemesi için EXPO_PUBLIC_ARENA_URL değerine oyunun HTTPS adresini yazın.");
  }

  const host = url.hostname;
  const localHost =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "[::1]" ||
    /^\[(?:fc|fd|fe[89ab])/i.test(host) ||
    /^(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/.test(host);

  if (url.protocol !== "https:" || localHost || url.username || url.password || url.pathname !== "/" || url.search || url.hash) {
    throw new Error("EXPO_PUBLIC_ARENA_URL genel erişime açık bir HTTPS sunucu adresi olmalı.");
  }
}

export default function mobileConfig({ config }: ConfigContext): ExpoConfig {
  const release = process.env.ARENA_RELEASE === "1";
  const preview = process.env.ARENA_LAN_PREVIEW === "1" && !release;
  if (release) requireReleaseServer(process.env.EXPO_PUBLIC_ARENA_URL);
  const packageName = config.android?.package ?? "com.kelimearenasi.oyun";

  return {
    ...config,
    name: preview ? "HarfArena Önizleme" : (config.name ?? "HarfArena"),
    slug: config.slug ?? "kelime-arenasi",
    android: {
      ...config.android,
      package: preview ? `${packageName}.preview` : packageName,
    },
    plugins: [
      ...(config.plugins ?? []),
      ["expo-build-properties", {
        android: {
          minSdkVersion: 24,
          compileSdkVersion: 37,
          targetSdkVersion: 36,
          usesCleartextTraffic: preview,
        },
      }],
    ],
  };
}
