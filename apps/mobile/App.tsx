import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Image,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as SecureStore from 'expo-secure-store';
import {
  MAX_ATTEMPTS,
  ROUND_MS,
  type AccountProfile,
  type RoundMode,
  type SoloChallengeTicket,
} from '@arena/shared';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ArenaApp } from './src/ArenaApp';
import { parseServerUrl, inviteCodeFromUrl } from './services/server';
import { useArenaConnection } from './services/useArenaConnection';
import { useMembership } from './services/useMembership';
import {
  MemberAuth,
  MemberButton,
  MemberLeaderboard,
  MemberNotice,
  MemberProfile,
  MemberScreen,
  MemberSettings,
  NativeModeHome,
} from './src/MemberScreens';
import { ArenaBackdrop, arenaCrest } from './src/ArenaArt';
import { baseStyles as base, colors } from './src/Theme';
import { DailyScreen } from './src/DailyScreen';
import { SoloGame } from './src/SoloGame';

const serverPreference = 'arena.server-url';
const buildServer =
  process.env.EXPO_PUBLIC_ARENA_URL?.trim() || (__DEV__ ? 'http://83.66.10.8:8080' : undefined);

function ConnectedArena({
  serverUrl,
  token,
  account,
  joinCode,
  clearInvite,
  openModes,
  openServerSettings,
  sync,
}: {
  serverUrl: string;
  token?: string;
  account?: AccountProfile;
  joinCode: string | null;
  clearInvite: () => void;
  openModes: () => void;
  openServerSettings?: () => void;
  sync: () => Promise<void>;
}) {
  const connection = useArenaConnection(serverUrl, token, account?.id);
  const phase = connection.room?.phase;
  const round = connection.room?.round;

  useEffect(() => {
    if (connection.room && joinCode) clearInvite();
  }, [connection.room, joinCode]);

  useEffect(() => {
    if (!token || (phase !== 'intermission' && phase !== 'finished')) return;
    const timer = setTimeout(() => {
      void sync();
    }, 500);
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

function ServerSetup({
  initialValue,
  onSave,
  goBack,
}: {
  initialValue: string;
  onSave: (url: string) => void;
  goBack: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState('');

  function submit() {
    try {
      onSave(parseServerUrl(value));
    } catch {
      setError('Geçerli bir sunucu adresi gir. Örnek: http://192.168.1.42:8080');
    }
  }

  return (
    <MemberScreen goBack={goBack}>
      <View style={base.sectionTitle}>
        <Text accessibilityRole="header" style={base.title}>
          Sunucu bağlantısı
        </Text>
        <Text style={base.body}>HarfArena sunucusunun adresini gir.</Text>
      </View>
      <View style={[base.card, base.section]}>
        <Text style={base.label}>Sunucu adresi</Text>
        <TextInput
          accessibilityLabel="Sunucu adresi"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          style={styles.input}
          placeholder="https://arena.ornek.com"
          placeholderTextColor={colors.muted}
          returnKeyType="go"
          onChangeText={setValue}
          onSubmitEditing={submit}
          value={value}
        />
        {!!error && <MemberNotice message={error} />}
        <MemberButton primary label="Bağlan" onPress={submit} />
      </View>
    </MemberScreen>
  );
}

type Scene =
  | 'home'
  | 'online'
  | 'offline'
  | 'solo'
  | 'account'
  | 'profile'
  | 'leaderboard'
  | 'daily'
  | 'server'
  | 'settings';

function MobileApp() {
  const [server, setServer] = useState<string | null>(
    buildServer ? parseServerUrl(buildServer) : null,
  );
  const [ready, setReady] = useState(Boolean(buildServer));
  const [scene, setScene] = useState<Scene>('home');
  const [afterServer, setAfterServer] = useState<Scene>('home');
  const [afterAccount, setAfterAccount] = useState<'home' | 'daily'>('home');
  const [joinCode, setJoinCode] = useState<string | null>(null);
  const [solo, setSolo] = useState<{ key: number; mode: RoundMode; ticket?: SoloChallengeTicket }>({
    key: 0,
    mode: 'timed',
  });
  const member = useMembership(server);
  const profile = member.session?.profile;

  useEffect(() => {
    if (buildServer) return;
    let active = true;
    void SecureStore.getItemAsync(serverPreference)
      .then((value) => {
        if (value && active) setServer(parseServerUrl(value));
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    function invite(value?: string | null) {
      const code = inviteCodeFromUrl(value ?? null);
      if (!code || !active) return;
      setJoinCode(code);
      setScene((current) => (current === 'solo' ? current : 'online'));
    }
    void Linking.getInitialURL()
      .then(invite)
      .catch(() => {});
    const listener = Linking.addEventListener('url', (event) => invite(event.url));
    return () => {
      active = false;
      listener.remove();
    };
  }, []);

  useEffect(() => {
    if (scene === 'online' && server) return;
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (scene === 'home') return false;
      setScene(scene === 'solo' ? 'offline' : 'home');
      return true;
    });
    return () => listener.remove();
  }, [scene, server]);

  function saveServer(url: string) {
    setServer(url);
    if (scene === 'server') setScene(afterServer);
    void SecureStore.setItemAsync(serverPreference, url).catch(() => {});
  }

  function configureServer(next: Scene) {
    setAfterServer(next);
    setScene('server');
  }

  function signIn(next: 'home' | 'daily') {
    setAfterAccount(next);
    if (!server) configureServer('account');
    else setScene('account');
  }

  function openAccount() {
    if (profile) setScene('profile');
    else signIn('home');
  }

  function openDaily() {
    if (profile && server) setScene('daily');
    else signIn('daily');
  }

  function openLeaderboard() {
    if (server) setScene('leaderboard');
    else configureServer('leaderboard');
  }

  function startSolo(mode: RoundMode) {
    setSolo((value) => ({ key: value.key + 1, mode, ticket: member.availableTicket }));
    setScene('solo');
  }

  const home = () => setScene('home');
  if (!ready || !member.ready) {
    return (
      <View style={styles.loading}>
        <ArenaBackdrop muted />
        <Image
          source={arenaCrest}
          accessibilityRole="image"
          accessibilityLabel="HarfArena"
          resizeMode="contain"
          style={styles.loadingCrest}
        />
        <ActivityIndicator color={colors.gold} accessibilityLabel="HarfArena yükleniyor" />
      </View>
    );
  }

  if (scene === 'server' || (scene === 'online' && !server)) {
    return (
      <ServerSetup
        initialValue={server ?? ''}
        onSave={saveServer}
        goBack={
          scene === 'server' && afterServer === 'settings' ? () => setScene('settings') : home
        }
      />
    );
  }
  if (scene === 'online' && server) {
    return (
      <ConnectedArena
        key={`${server}:${profile?.id ?? 'guest'}`}
        serverUrl={server}
        token={member.session?.token}
        account={profile}
        joinCode={joinCode}
        clearInvite={() => setJoinCode(null)}
        openModes={home}
        openServerSettings={buildServer ? undefined : () => configureServer('online')}
        sync={member.sync}
      />
    );
  }
  if (scene === 'account' || (scene === 'daily' && !profile)) {
    const next = scene === 'daily' ? 'daily' : afterAccount;
    return (
      <MemberAuth
        goBack={home}
        daily={next === 'daily'}
        onLogin={async (credentials) => {
          await member.authenticate('login', credentials);
          setScene(next);
        }}
        onRegister={async (credentials) => {
          await member.authenticate('register', credentials);
          setScene(next);
        }}
      />
    );
  }
  if (scene === 'profile' && profile) {
    return (
      <MemberProfile
        account={profile}
        goBack={home}
        openLeaderboard={openLeaderboard}
        onLogout={async () => {
          await member.logout();
          home();
        }}
      />
    );
  }
  if (scene === 'daily' && profile) {
    return (
      <DailyScreen
        username={profile.username}
        goBack={home}
        operations={{
          load: member.loadDaily,
          start: member.startDaily,
          guess: member.guessDaily,
          next: member.nextDaily,
        }}
      />
    );
  }
  if (scene === 'leaderboard') {
    return (
      <MemberLeaderboard
        account={profile ?? null}
        goBack={home}
        loadEntries={member.loadEntries}
        onLogout={
          profile
            ? async () => {
                await member.logout();
                home();
              }
            : undefined
        }
      />
    );
  }
  if (scene === 'solo') {
    return (
      <SoloGame
        key={solo.key}
        mode={solo.mode}
        challenge={solo.ticket}
        onComplete={(result) => {
          void member.recordSolo(result);
        }}
        onBack={() => setScene('offline')}
        onPlayAgain={() => startSolo(solo.mode)}
      />
    );
  }
  if (scene === 'settings') {
    return (
      <MemberSettings
        serverUrl={server}
        goBack={home}
        changeServer={buildServer ? undefined : () => configureServer('settings')}
      />
    );
  }
  if (scene === 'offline') {
    return (
      <MemberScreen goBack={home}>
        <View style={base.sectionTitle}>
          <Text accessibilityRole="header" style={base.title}>
            Hızlı Oyna
          </Text>
          <Text style={base.body}>Tek kelime, {MAX_ATTEMPTS} tahmin hakkı.</Text>
        </View>
        <View style={[base.card, base.section]}>
          <Text style={base.body}>
            {member.availableTicket
              ? 'Puanlı oyun hazır. Sonucun bağlantı geldiğinde hesabına işlenecek.'
              : profile
                ? 'Bağlanınca yeni puanlı oyun biletleri alınır. Şimdi antrenman yapabilirsin.'
                : 'Misafir antrenmanı. Derece puanı kazanmak için hesap oluştur.'}
          </Text>
          {member.pending > 0 && (
            <Text style={base.caption}>{member.pending} sonuç eşitlenmeyi bekliyor</Text>
          )}
          <MemberButton
            primary
            label={`Süreli · ${ROUND_MS / 1000} saniye`}
            onPress={() => startSolo('timed')}
          />
          <MemberButton label="Süresiz" onPress={() => startSolo('untimed')} />
        </View>
      </MemberScreen>
    );
  }

  return (
    <NativeModeHome
      openOnline={() => setScene('online')}
      openOffline={() => setScene('offline')}
      openDaily={openDaily}
      openLeaderboard={openLeaderboard}
      openProfile={openAccount}
      openSettings={() => setScene('settings')}
      account={profile}
      pending={member.pending}
      notice={member.syncNotice || undefined}
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
  loading: {
    flex: 1,
    gap: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  loadingCrest: { width: 224, height: 166 },
  input: {
    color: colors.ink,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 14,
    fontSize: 16,
  },
});
