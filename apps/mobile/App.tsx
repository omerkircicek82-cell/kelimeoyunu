import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import * as SecureStore from "expo-secure-store";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { ArenaApp } from "./src/ArenaApp";
import { parseServerUrl, inviteCodeFromUrl } from "./services/server";
import { useArenaConnection } from "./services/useArenaConnection";

const serverPreference = "arena.server-url";
const buildServer = process.env.EXPO_PUBLIC_ARENA_URL?.trim();

function ConnectedArena({ serverUrl, openServerSettings }: { serverUrl: string; openServerSettings?: () => void }) {
  const connection = useArenaConnection(serverUrl);
  const [joinCode, setJoinCode] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    function invite(value?: string | null) {
      const code = inviteCodeFromUrl(value ?? null);
      if (code && active) setJoinCode(code);
    }
    void Linking.getInitialURL().then(invite).catch(() => {});
    const subscription = Linking.addEventListener("url", event => invite(event.url));
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  useEffect(() => {
    if (connection.room) setJoinCode(null);
  }, [connection.room]);

  return (
    <ArenaApp
      {...connection}
      joinCode={joinCode}
      serverUrl={serverUrl}
      openServerSettings={connection.room ? undefined : openServerSettings}
    />
  );
}

function ServerSetup({ initialValue, onSave }: { initialValue: string; onSave: (url: string) => void }) {
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

function MobileApp() {
  const [server, setServer] = useState<string | null>(buildServer ? parseServerUrl(buildServer) : null);
  const [ready, setReady] = useState(Boolean(buildServer));
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (buildServer) return;
    let active = true;
    void SecureStore.getItemAsync(serverPreference)
      .then(value => { if (value && active) setServer(parseServerUrl(value)); })
      .catch(() => {})
      .finally(() => { if (active) setReady(true); });
    return () => { active = false; };
  }, []);

  function saveServer(url: string) {
    setServer(url);
    setEditing(false);
    void SecureStore.setItemAsync(serverPreference, url).catch(() => {});
  }

  if (!ready) return <View style={styles.loading}><ActivityIndicator color="#baf56b" /></View>;
  if (!server || editing) return <ServerSetup initialValue={server ?? ""} onSave={saveServer} />;
  return (
    <ConnectedArena
      key={server}
      serverUrl={server}
      openServerSettings={buildServer ? undefined : () => setEditing(true)}
    />
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
});
