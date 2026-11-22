import { useEffect, useState } from "react";
import { ActivityIndicator, BackHandler, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import type { AccountProfile, RoundMode, SoloChallengeTicket } from "@arena/shared";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ArenaApp } from "./src/ArenaApp";
import { parseServerUrl, inviteCodeFromUrl } from "./services/server";
import { useArenaConnection } from "./services/useArenaConnection";
import { useMembership } from "./services/useMembership";
import { MemberAuth, MemberLeaderboard, NativeModeHome } from "./src/MemberScreens";
import { SoloGame } from "./src/SoloGame";

const serverPreference = "arena.server-url";
const buildServer = process.env.EXPO_PUBLIC_ARENA_URL?.trim() || (__DEV__ ? "http://83.66.10.8:8080" : undefined);

function ConnectedArena({
  serverUrl, token, account, joinCode, clearInvite, openModes, openServerSettings, sync,
}: {
  serverUrl: string; token?: string; account?: AccountProfile; joinCode: string | null;
  clearInvite: () => void; openModes: () => void; openServerSettings?: () => void; sync: () => Promise<void>;
}) {
  const connection = useArenaConnection(serverUrl, token, account?.id);
  const phase = connection.room?.phase;
  const round = connection.room?.round;

  useEffect(() => {
    if (connection.room && joinCode) clearInvite();
  }, [connection.room, joinCode]);

  useEffect(() => {
    if (!token || (phase !== "intermission" && phase !== "finished")) return;
    const timer = setTimeout(() => { void sync(); }, 500);
    return () => clearTimeout(timer);
  }, [token, phase, round]);

  return (
    <ArenaApp
      {...connection}
      joinCode={joinCode}
      serverUrl={serverUrl}
      accountName={account?.username}
      openModes={openModes}
      openServerSettings={connection.room ? undefined : openServerSettings}
    />
  );
}

function ServerSetup({ initialValue, onSave, goBack }: { initialValue: string; onSave: (url: string) => void; goBack: () => void }) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState("");

  function submit() {
    try {
      onSave(parseServerUrl(value));
    } catch {
      setError("Geçerli bir sunucu adresi gir. Örnek: http://192.168.1.42:8080");
    }
  }

  return (
    <SafeAreaView style={styles.background}>
      <KeyboardAvoidingView style={styles.center} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable accessibilityRole="button" onPress={goBack}><Text style={styles.link}>‹ Arena</Text></Pressable>
        <View style={styles.logo}>
          <Text style={styles.logoText}>KA</Text>
        </View>
        <Text accessibilityRole="header" style={styles.title}>Kelime Arenası</Text>
        <Text style={styles.description}>Oynamak için Kelime Arenası sunucusunun adresini gir.</Text>
        <Text style={styles.label}>Sunucu adresi</Text>
        <TextInput
          accessibilityLabel="Sunucu adresi"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          placeholder="https://arena.ornek.com"
          placeholderTextColor="#8f8aa4"
          returnKeyType="go"
          onChangeText={setValue}
          onSubmitEditing={submit}
          value={value}
        />
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
        <Pressable accessibilityRole="button" onPress={submit} style={styles.button}>
          <Text style={styles.buttonText}>Bağlan</Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

type Scene = "home" | "online" | "offline" | "solo" | "account" | "leaderboard" | "server";

function MobileApp() {
  const [server, setServer] = useState<string | null>(buildServer ? parseServerUrl(buildServer) : null);
  const [ready, setReady] = useState(Boolean(buildServer));
  const [scene, setScene] = useState<Scene>("home");
  const [afterServer, setAfterServer] = useState<Scene>("home");
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [solo, setSolo] = useState<{ key: number; mode: RoundMode; ticket?: SoloChallengeTicket }>({ key: 0, mode: "timed" });
  const member = useMembership(server);
  const profile = member.session?.profile;

  useEffect(() => {
    if (buildServer) return;
    let active = true;
    void SecureStore.getItemAsync(serverPreference)
      .then(value => { if (value && active) setServer(parseServerUrl(value)); })
      .catch(() => {})
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    let active = true;
    function invite(value?: string | null) {
      const code = inviteCodeFromUrl(value ?? null);
      if (!code || !active) return;
      setJoinCode(code);
      setScene(current => current === "solo" ? current : "online");
    }
    void Linking.getInitialURL().then(invite).catch(() => {});
    const listener = Linking.addEventListener("url", event => invite(event.url));
    return () => { active = false; listener.remove(); };
  }, []);

  useEffect(() => {
    if (scene === "online" && server) return;
    const listener = BackHandler.addEventListener("hardwareBackPress", () => {
      if (scene === "home") return false;
      setScene(scene === "solo" ? "offline" : "home");
      return true;
    });
    return () => listener.remove();
  }, [scene, server]);

  function saveServer(url: string) {
    setServer(url);
    if (scene === "server") setScene(afterServer);
    void SecureStore.setItemAsync(serverPreference, url).catch(() => {});
  }

  function configureServer(next: Scene) {
    setAfterServer(next);
    setScene("server");
  }

  function openAccount() {
    if (profile) setScene("leaderboard");
    else if (!server) configureServer("account");
    else setScene("account");
  }

  function startSolo(mode: RoundMode) {
    setSolo(value => ({ key: value.key + 1, mode, ticket: member.availableTicket }));
    setScene("solo");
  }

  const home = () => setScene("home");
  if (!ready || !member.ready) return <View style={styles.loading}><ActivityIndicator color="#baf56b" /></View>;

  if (scene === "server" || (scene === "online" && !server)) {
    return <ServerSetup initialValue={server ?? ""} onSave={saveServer} goBack={home} />;
  }
  if (scene === "online" && server) {
    return (
      <ConnectedArena
        key={`${server}:${profile?.id ?? "guest"}`}
        serverUrl={server}
        token={member.session?.token}
        account={profile}
        joinCode={joinCode}
        clearInvite={() => setJoinCode(null)}
        openModes={home}
        openServerSettings={buildServer ? undefined : () => configureServer("online")}
        sync={member.sync}
      />
    );
  }
  if (scene === "account") {
    return <MemberAuth goBack={home} onLogin={async credentials => {
      await member.authenticate("login", credentials);
      setScene("home");
    }} onRegister={async credentials => {
      await member.authenticate("register", credentials);
      setScene("home");
    }} />;
  }
  if (scene === "leaderboard") {
    return (
      <MemberLeaderboard
        account={profile ?? null}
        goBack={home}
        loadEntries={member.loadEntries}
        onLogout={profile ? async () => { await member.logout(); home(); } : undefined}
      />
    );
  }
  if (scene === "solo") {
    return (
      <SoloGame
        key={solo.key}
        mode={solo.mode}
        challenge={solo.ticket}
        onComplete={result => { void member.recordSolo(result); }}
        onBack={() => setScene("offline")}
        onPlayAgain={() => startSolo(solo.mode)}
      />
    );
  }
  if (scene === "offline") {
    return (
      <SafeAreaView style={styles.background}>
        <View style={styles.center}>
          <Pressable accessibilityRole="button" onPress={home}><Text style={styles.link}>‹ Arena</Text></Pressable>
          <Text accessibilityRole="header" style={styles.title}>Çevrimdışı</Text>
          <Text style={styles.description}>Tek kelime, beş tahmin hakkı.</Text>
          <Text style={styles.description}>
            {member.availableTicket
              ? "Puanlı oyun hazır. Sonucun bağlantı geldiğinde hesabına işlenecek."
              : profile
                ? "Puanlı oyun bileti yok. Bağlanınca yeni biletler alınır. Şimdi antrenman yapabilirsin."
                : "Misafir antrenmanı. Genel puan kazanmak için bir hesap oluştur."}
          </Text>
          {!!member.pending && <Text style={styles.link}>{member.pending} sonuç eşitlenmeyi bekliyor</Text>}
          <Pressable accessibilityRole="button" onPress={() => startSolo("timed")} style={styles.button}>
            <Text style={styles.buttonText}>Süreli · 90 saniye</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => startSolo("untimed")} style={styles.secondary}>
            <Text style={styles.label}>Süresiz</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.background}>
      <NativeModeHome openOnline={() => setScene("online")} openOffline={() => setScene("offline")} />
      <SafeAreaView edges={["bottom"]} style={styles.hubFooter}>
        <Text style={styles.description}>
          {profile ? `${profile.username} · ${profile.rating.toLocaleString("tr-TR")} genel puan` : "Misafir · Eğlence amaçlı oyun"}
        </Text>
        {member.pending > 0 && <Text style={styles.link}>{member.pending} sonuç eşitlenmeyi bekliyor</Text>}
        {member.syncNotice && <Text accessibilityRole="alert" style={styles.error}>{member.syncNotice}</Text>}
        <View style={styles.hubActions}>
          <Pressable accessibilityRole="button" onPress={openAccount} style={styles.hubAction}>
            <Text style={styles.link}>{profile ? "Hesabım" : "Giriş / Kayıt"}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setScene("leaderboard")} style={styles.hubAction}>
            <Text style={styles.link}>Lider tablosu</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <MobileApp />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  background: { flex: 1, backgroundColor: "#10101a" },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#10101a" },
  center: { flex: 1, width: "100%", maxWidth: 480, alignSelf: "center", justifyContent: "center", padding: 24, gap: 12 },
  logo: { width: 62, height: 62, justifyContent: "center", alignItems: "center", borderRadius: 18, backgroundColor: "#baf56b" },
  logoText: { color: "#172011", fontSize: 25, fontWeight: "900" },
  title: { color: "#f1eefc", fontWeight: "900", fontSize: 32 },
  description: { color: "#b0aac7", fontSize: 15, lineHeight: 22 },
  label: { color: "#f1eefc", fontSize: 14, fontWeight: "600", marginTop: 8 },
  input: { color: "#f1eefc", backgroundColor: "#1b1929", borderRadius: 12, borderWidth: 1, borderColor: "#3d3559", padding: 14, fontSize: 16 },
  error: { color: "#ffa2b4", fontSize: 14 },
  button: { alignItems: "center", borderRadius: 12, paddingVertical: 15, backgroundColor: "#baf56b" },
  buttonText: { color: "#172011", fontWeight: "900", fontSize: 16 },
  link: { color: "#c6b1ff", fontWeight: "800", fontSize: 14 },
  secondary: { alignItems: "center", borderRadius: 12, paddingVertical: 15, borderWidth: 1, borderColor: "#3d3559", backgroundColor: "#1b1929" },
  hubFooter: { gap: 6, paddingVertical: 10, paddingHorizontal: 18, backgroundColor: "#1b1929", borderTopWidth: 1, borderTopColor: "#3d3559" },
  hubActions: { flexDirection: "row", gap: 8 },
  hubAction: { flex: 1, minHeight: 44, justifyContent: "center", alignItems: "center" },
});
