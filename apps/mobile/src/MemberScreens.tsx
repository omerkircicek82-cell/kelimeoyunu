import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BADGE_DETAILS,
  LEAGUES,
  LEAGUE_DETAILS,
  RATING_GREEN_POINTS,
  RATING_ROUND_POINTS,
  RATING_YELLOW_POINTS,
  type AccountProfile,
  type LeaderboardEntry,
  type LeagueId,
} from '@arena/shared';
import { useMarkSymbols } from '../services/useMarkSymbols';
import { ArenaBackdrop, arenaCrest } from './ArenaArt';
import { baseStyles as base, colors } from './Theme';

export type { AccountProfile, LeaderboardEntry } from '@arena/shared';

type Credentials = { username: string; password: string };

const numbers = new Intl.NumberFormat('tr-TR');

function Screen({ children, goBack }: { children: ReactNode; goBack?: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      <ArenaBackdrop muted />
      {goBack && (
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
            <Text style={styles.backText}>‹ Arena</Text>
          </Pressable>
          <Image
            source={arenaCrest}
            resizeMode="contain"
            style={styles.headerCrest}
            accessibilityIgnoresInvertColors
          />
        </View>
      )}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Button({
  label,
  onPress,
  primary = false,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  primary?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.primary,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[base.label, primary && styles.onGold]}>{label}</Text>
    </Pressable>
  );
}

function Notice({ message }: { message: string }) {
  return (
    <Text accessibilityRole="alert" style={styles.notice}>
      {message}
    </Text>
  );
}

export function NativeModeHome({
  openOnline,
  openOffline,
  openDaily,
  openLeaderboard,
  openProfile,
  openSettings,
  account,
  pending,
  notice,
}: {
  openOnline: () => void;
  openOffline: () => void;
  openDaily: () => void;
  openLeaderboard: () => void;
  openProfile: () => void;
  openSettings: () => void;
  account?: AccountProfile;
  pending: number;
  notice?: string;
}) {
  const { height, width } = useWindowDimensions();
  const crestHeight = Math.min(206, height * 0.23, width * 0.51);
  const profileTitle = account?.progression?.title;
  const buttons = [
    {
      title: 'Hızlı Oyna',
      detail: 'Tek başına kelime çöz',
      tone: 'gold',
      icon: 'play',
      onPress: openOffline,
    },
    {
      title: 'Özel Oda',
      detail: 'Oda kur, katıl veya izle',
      tone: 'teal',
      icon: 'lock',
      onPress: openOnline,
    },
    {
      title: 'Günlük Mücadele',
      detail: 'Günün kelimelerini çöz',
      tone: 'plum',
      icon: 'daily',
      onPress: openDaily,
    },
    {
      title: 'Liderlik',
      detail: 'Genel sıralamayı gör',
      tone: 'navy',
      icon: 'ranks',
      onPress: openLeaderboard,
    },
  ] as const;

  return (
    <SafeAreaView style={styles.screen}>
      <ArenaBackdrop />
      <ScrollView contentContainerStyle={styles.homeContent}>
        {account ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Profil"
            onPress={openProfile}
            style={styles.accountStrip}
          >
            <View style={styles.avatarMedallion} importantForAccessibility="no">
              <Text style={styles.avatarLetter}>
                {account.username.slice(0, 1).toLocaleUpperCase('tr-TR')}
              </Text>
            </View>
            <View style={styles.modeText}>
              <Text numberOfLines={1} style={base.label}>
                {account.username}
              </Text>
              {profileTitle && (
                <Text numberOfLines={1} style={base.caption}>
                  {profileTitle}
                </Text>
              )}
            </View>
            <View style={styles.accountRating}>
              <Text style={styles.accountScore}>{numbers.format(account.rating)}</Text>
              <Text style={base.caption}>Derece puanı</Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.guestBadge}>
            <Text style={base.caption}>Misafir</Text>
          </View>
        )}
        <Image
          accessibilityRole="image"
          accessibilityLabel="HarfArena"
          accessibilityIgnoresInvertColors
          resizeMode="contain"
          source={arenaCrest}
          style={[styles.homeCrest, { height: crestHeight }]}
        />
        <View style={styles.modeStack}>
          {buttons.map((button) => (
            <ModeCard key={button.title} {...button} />
          ))}
        </View>
        {pending > 0 && (
          <Text style={[base.caption, styles.homeNotice]}>
            {pending} sonuç eşitlenmeyi bekliyor
          </Text>
        )}
        {!!notice && <Notice message={notice} />}
        <View style={styles.homeFooter}>
          <Button label={account ? 'Profil' : 'Giriş / Kayıt'} onPress={openProfile} />
          <Button label="Ayarlar" onPress={openSettings} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

export function MemberSettings({
  serverUrl,
  goBack,
  changeServer,
}: {
  serverUrl: string | null;
  goBack: () => void;
  changeServer?: () => void;
}) {
  const { showMarkSymbols, saveMarkSymbols, preferenceError } = useMarkSymbols();
  return (
    <Screen goBack={goBack}>
      <Text accessibilityRole="header" style={base.title}>
        Ayarlar
      </Text>
      <View style={[base.card, base.section]}>
        <Text accessibilityRole="header" style={base.subtitle}>
          Oyun görünümü
        </Text>
        <View style={styles.scoreRow}>
          <View style={styles.modeText}>
            <Text style={base.label}>Harf işaretleri</Text>
            <Text style={base.caption}>
              Tahmin kutularında renklerin yanında ✓, ↗ ve − işaretlerini göster.
            </Text>
          </View>
          <Switch
            accessibilityLabel="Harf işaretleri"
            value={showMarkSymbols}
            onValueChange={saveMarkSymbols}
            trackColor={{ false: colors.line, true: colors.correct }}
            thumbColor={showMarkSymbols ? colors.gold : colors.muted}
          />
        </View>
        {!!preferenceError && <Notice message={preferenceError} />}
      </View>
      <View style={[base.card, base.section]}>
        <Text accessibilityRole="header" style={base.subtitle}>
          Oyun sunucusu
        </Text>
        <Text selectable style={base.body}>
          {serverUrl ?? 'Henüz bağlantı adresi eklenmedi.'}
        </Text>
        {changeServer && <Button label="Sunucu adresini değiştir" onPress={changeServer} />}
      </View>
    </Screen>
  );
}

export function MemberProfile({
  account,
  goBack,
  onLogout,
  openLeaderboard,
}: {
  account: AccountProfile;
  goBack: () => void;
  onLogout: () => Promise<void>;
  openLeaderboard: () => void;
}) {
  const progress = account.progression;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onLogout();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Çıkış yapılamadı.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen goBack={goBack}>
      <View style={base.sectionTitle}>
        <Text accessibilityRole="header" style={base.title}>
          {account.username}
        </Text>
        {progress && <Text style={base.subtitle}>{progress.title}</Text>}
      </View>
      <View style={[base.card, base.section]}>
        <View style={styles.scoreRow}>
          <View style={styles.modeText}>
            <Text style={base.caption}>Arena ligi</Text>
            <Text style={base.subtitle}>
              {progress ? LEAGUE_DETAILS[progress.league].label : 'Lig bilgisi alınamadı'}
            </Text>
            <Text style={base.caption}>{numbers.format(account.ratedGames)} dereceli tur</Text>
          </View>
          <View style={styles.ratingBadge}>
            <Text style={styles.ratingValue}>{numbers.format(account.rating)}</Text>
            <Text style={base.caption}>Derece puanı</Text>
          </View>
        </View>
        {Object.entries(LEAGUE_DETAILS).map(([id, { label, minRating }]) => (
          <View key={id} style={[styles.scoreRow, styles.progressRow]}>
            <Text style={[base.label, styles.modeText, progress?.league === id && styles.emphasis]}>
              {label}
              {progress?.league === id ? ' · Senin ligin' : ''}
            </Text>
            <Text style={base.caption}>{numbers.format(minRating)} puan</Text>
          </View>
        ))}
        <Button label="Genel sıralama" onPress={openLeaderboard} />
      </View>
      {progress && (
        <>
          <View style={[base.card, base.section]}>
            <Text accessibilityRole="header" style={base.subtitle}>
              Galibiyet serisi
            </Text>
            <Text style={base.caption}>Art arda çözdüğün dereceli turlar.</Text>
            <View style={styles.progressMetrics}>
              <ProgressMetric label="Güncel" value={progress.winStreak} />
              <ProgressMetric label="En uzun" value={progress.bestWinStreak} />
              <ProgressMetric label="Galibiyet" value={progress.wins} />
            </View>
            <Text style={base.caption}>
              En yüksek derece puanın {numbers.format(progress.peakRating)}.
            </Text>
          </View>
          <View style={[base.card, base.section]}>
            <Text accessibilityRole="header" style={base.subtitle}>
              Rozetler
            </Text>
            <Text style={base.caption}>
              {progress.badges.length} / {Object.keys(BADGE_DETAILS).length} kazanıldı
            </Text>
            {Object.entries(BADGE_DETAILS).map(([id, badge]) => {
              const acquired = progress.badges.some((earned) => earned === id);
              return (
                <View key={id} style={[styles.scoreRow, styles.progressRow]}>
                  <View style={styles.modeText}>
                    <Text style={base.label}>{badge.label}</Text>
                    <Text style={base.caption}>{badge.description}</Text>
                  </View>
                  <Text style={[base.caption, acquired && styles.emphasis]}>
                    {acquired ? 'Kazanıldı' : 'Kilitli'}
                  </Text>
                </View>
              );
            })}
          </View>
        </>
      )}
      {error ? <Notice message={error} /> : null}
      <Button
        label={busy ? 'Çıkılıyor…' : 'Hesaptan çık'}
        disabled={busy}
        onPress={() => void logout()}
      />
    </Screen>
  );
}

function ProgressMetric({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.ratingValue}>{numbers.format(value)}</Text>
      <Text style={base.caption}>{label}</Text>
    </View>
  );
}

type ModeTone = 'gold' | 'teal' | 'plum' | 'navy';
type ModeIcon = 'play' | 'lock' | 'daily' | 'ranks';

function ModeCard({
  title,
  detail,
  tone,
  icon,
  onPress,
}: {
  title: string;
  detail: string;
  tone: ModeTone;
  icon: ModeIcon;
  onPress: () => void;
}) {
  const primary = tone === 'gold';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [styles.modeCard, modeTones[tone], pressed && styles.pressed]}
    >
      <View style={styles.modeSheen} pointerEvents="none" />
      <View
        style={[styles.modeIcon, primary && styles.primaryIcon]}
        importantForAccessibility="no-hide-descendants"
      >
        <ModeSymbol icon={icon} primary={primary} />
      </View>
      <View style={styles.modeText}>
        <Text style={[styles.modeTitle, primary && styles.onGold]}>{title}</Text>
        <Text style={[base.caption, primary && styles.primaryDetail]}>{detail}</Text>
      </View>
      <Text style={[styles.modeArrow, primary && styles.onGold]}>›</Text>
    </Pressable>
  );
}

function ModeSymbol({ icon, primary }: { icon: ModeIcon; primary: boolean }) {
  const paint = primary ? colors.goldInk : colors.gold;
  if (icon === 'play') return <View style={[styles.playTriangle, { borderLeftColor: paint }]} />;
  if (icon === 'lock') {
    return (
      <View style={styles.lockIcon}>
        <View style={[styles.lockArch, { borderColor: paint }]} />
        <View style={[styles.lockBody, { backgroundColor: paint }]} />
      </View>
    );
  }
  if (icon === 'daily') return <Text style={[styles.modeStar, { color: paint }]}>✦</Text>;
  return (
    <View style={styles.podiumIcon}>
      {[8, 16, 11].map((height) => (
        <View key={height} style={{ width: 5, height, backgroundColor: paint }} />
      ))}
    </View>
  );
}

export function MemberAuth({
  onLogin,
  onRegister,
  goBack,
  daily = false,
}: {
  onLogin: (credentials: Credentials) => Promise<void>;
  onRegister: (credentials: Credentials) => Promise<void>;
  goBack: () => void;
  daily?: boolean;
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const passwordInput = useRef<React.ComponentRef<typeof TextInput>>(null);
  const register = mode === 'register';
  const label = register ? 'Hesap oluştur' : 'Giriş yap';
  const valid = /^[a-z0-9_]{3,20}$/i.test(username.trim()) && password.length >= 8;

  async function submit() {
    const name = username.trim();
    if (inFlight.current || !valid) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const action = register ? onRegister : onLogin;
      await action({ username: name, password });
      setPassword('');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'İşlem tamamlanamadı. Tekrar dene.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <Screen goBack={goBack}>
      <View style={base.sectionTitle}>
        <Text accessibilityRole="header" style={base.title}>
          Arena hesabı
        </Text>
        <Text style={base.body}>
          {daily
            ? 'Günlük mücadeleye katılmak için Arena hesabınla giriş yap.'
            : 'Dereceli maçlarını ve puanını hesabında takip et.'}
        </Text>
      </View>
      <View style={[base.card, base.section]}>
        <View accessibilityRole="tablist" style={styles.tabs}>
          {(
            [
              { value: 'login', title: 'Giriş yap' },
              { value: 'register', title: 'Kayıt ol' },
            ] as const
          ).map(({ value, title }) => (
            <Pressable
              key={value}
              accessibilityRole="tab"
              accessibilityState={{ selected: mode === value, disabled: busy }}
              disabled={busy}
              onPress={() => {
                setMode(value);
                setShowPassword(false);
                setError('');
              }}
              style={[styles.tab, mode === value && styles.activeTab]}
            >
              <Text style={[base.label, mode === value && styles.emphasis]}>{title}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.field}>
          <Text style={base.label}>Kullanıcı adı</Text>
          <TextInput
            accessibilityLabel="Kullanıcı adı"
            autoCapitalize="none"
            autoComplete="username"
            autoCorrect={false}
            editable={!busy}
            maxLength={20}
            onChangeText={setUsername}
            onSubmitEditing={() => passwordInput.current?.focus()}
            placeholder="Kullanıcı adın"
            placeholderTextColor={colors.muted}
            returnKeyType="next"
            style={styles.input}
            value={username}
          />
          {register && (
            <Text style={base.caption}>
              3–20 karakter. A–Z, rakam ve alt çizgi kullanabilirsin.
            </Text>
          )}
        </View>
        <View style={styles.field}>
          <Text style={base.label}>Parola</Text>
          <View style={styles.passwordField}>
            <TextInput
              ref={passwordInput}
              accessibilityLabel="Parola"
              autoCapitalize="none"
              autoComplete={register ? 'new-password' : 'current-password'}
              autoCorrect={false}
              editable={!busy}
              maxLength={128}
              onChangeText={setPassword}
              onSubmitEditing={() => void submit()}
              placeholder="Parolan"
              placeholderTextColor={colors.muted}
              returnKeyType="go"
              secureTextEntry={!showPassword}
              style={[styles.input, styles.passwordInput]}
              value={password}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={showPassword ? 'Parolayı gizle' : 'Parolayı göster'}
              onPress={() => setShowPassword((visible) => !visible)}
              style={styles.passwordToggle}
            >
              <Text style={styles.backText}>{showPassword ? 'Gizle' : 'Göster'}</Text>
            </Pressable>
          </View>
          {register && <Text style={base.caption}>En az 8 karakter.</Text>}
        </View>
        {error ? <Notice message={error} /> : null}
        <Button
          primary
          label={busy ? 'Bekle…' : label}
          disabled={busy || !valid}
          onPress={() => void submit()}
        />
      </View>
    </Screen>
  );
}

type BoardState = { entries?: readonly LeaderboardEntry[]; loading: boolean; error: string };

export function MemberLeaderboard({
  account,
  loadEntries,
  goBack,
  onLogout,
}: {
  account: AccountProfile | null;
  loadEntries: (league?: LeagueId) => Promise<readonly LeaderboardEntry[]>;
  goBack: () => void;
  onLogout?: () => void | Promise<void>;
}) {
  const [version, setVersion] = useState(0);
  const [league, setLeague] = useState<LeagueId>();
  const [board, setBoard] = useState<BoardState>({ loading: true, error: '' });
  const [logoutBusy, setLogoutBusy] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const load = useRef(loadEntries);
  load.current = loadEntries;

  useEffect(() => {
    let subscribed = true;
    setBoard((previous) => ({ ...previous, loading: true, error: '' }));
    void (async () => {
      try {
        const entries = await load.current(league);
        if (subscribed) setBoard({ entries, loading: false, error: '' });
      } catch (reason) {
        if (subscribed) {
          const error = reason instanceof Error ? reason.message : 'Sıralama yüklenemedi.';
          setBoard((previous) => ({ ...previous, loading: false, error }));
        }
      }
    })();
    return () => {
      subscribed = false;
    };
  }, [league, version]);

  async function logout() {
    if (!onLogout || logoutBusy) return;
    setLogoutBusy(true);
    setLogoutError('');
    try {
      await onLogout();
    } catch (reason) {
      setLogoutError(reason instanceof Error ? reason.message : 'Çıkış yapılamadı.');
    } finally {
      setLogoutBusy(false);
    }
  }

  return (
    <Screen goBack={goBack}>
      <View style={base.sectionTitle}>
        <Text accessibilityRole="header" style={base.title}>
          Sıralama
        </Text>
        <Text style={base.body}>Online ve çevrimdışı genel puana göre Arena sıralaması.</Text>
        <Text style={base.caption}>
          Çözüm +{RATING_ROUND_POINTS}, çözülemeyen tur −{RATING_ROUND_POINTS}. En iyi satırda yeşil
          harf +{RATING_GREEN_POINTS}, sarı harf +{RATING_YELLOW_POINTS}.
        </Text>
      </View>
      {account ? (
        <View style={[base.card, base.section]}>
          <View style={styles.scoreRow}>
            <View style={styles.modeText}>
              <Text style={base.caption}>Oyuncu hesabın</Text>
              <Text style={base.subtitle}>{account.username}</Text>
              <Text style={base.caption}>{numbers.format(account.ratedGames)} dereceli tur</Text>
            </View>
            <View style={styles.ratingBadge}>
              <Text style={styles.ratingValue}>{numbers.format(account.rating)}</Text>
              <Text style={base.caption}>Derece puanı</Text>
            </View>
          </View>
          {logoutError ? <Notice message={logoutError} /> : null}
          {onLogout && (
            <Button label="Hesaptan çık" disabled={logoutBusy} onPress={() => void logout()} />
          )}
        </View>
      ) : (
        <View style={[base.card, styles.field]}>
          <Text style={base.label}>Misafir oyuncu</Text>
          <Text style={base.caption}>
            Dereceli maçlara katılmak için Arena hesabınla giriş yap.
          </Text>
        </View>
      )}
      <View style={[base.card, base.section]}>
        <View style={styles.scoreRow}>
          <Text style={[base.subtitle, styles.modeText]}>Lider tablosu</Text>
          <Button
            label="Yenile"
            disabled={board.loading}
            onPress={() => setVersion((value) => value + 1)}
          />
        </View>
        <View style={styles.leagueFilters} accessibilityRole="tablist">
          {([undefined, ...LEAGUES] as const).map((id) => (
            <Pressable
              key={id ?? 'all'}
              style={[styles.leagueFilter, league === id && styles.activeTab]}
              accessibilityRole="tab"
              accessibilityState={{ selected: league === id }}
              onPress={() => {
                if (league === id) return;
                setBoard({ loading: true, error: '' });
                setLeague(id);
              }}
            >
              <Text style={[base.caption, league === id && styles.emphasis]}>
                {id ? LEAGUE_DETAILS[id].label : 'Tümü'}
              </Text>
            </Pressable>
          ))}
        </View>
        {board.loading && (
          <ActivityIndicator color={colors.gold} accessibilityLabel="Sıralama yükleniyor" />
        )}
        {board.error ? <Notice message={board.error} /> : null}
        {!board.loading && board.entries?.length === 0 && (
          <Text style={base.body}>Henüz dereceli maç oynayan oyuncu yok.</Text>
        )}
        {board.entries?.map((entry) => {
          const mine = account?.username === entry.username;
          return (
            <View
              key={entry.username}
              style={[styles.scoreRow, styles.rankingRow, mine && styles.myRank]}
            >
              <Text style={[styles.rank, entry.rank === 1 && styles.emphasis]}>{entry.rank}</Text>
              <View style={styles.modeText}>
                <Text style={base.label}>
                  {entry.username}
                  {mine ? ' (sen)' : ''}
                </Text>
                <Text style={base.caption}>
                  {entry.progression
                    ? `${LEAGUE_DETAILS[entry.progression.league].label} · ${entry.progression.title}`
                    : `${numbers.format(entry.ratedGames)} tur`}
                </Text>
              </View>
              <Text style={styles.rankingValue} accessibilityLabel={`${entry.rating} puan`}>
                {numbers.format(entry.rating)}
              </Text>
            </View>
          );
        })}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  fill: { flex: 1 },
  content: {
    padding: 16,
    paddingBottom: 24,
    gap: 14,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  topBar: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    minHeight: 50,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
  },
  headerCrest: { width: 80, height: 46 },
  back: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: 12 },
  backText: { color: colors.tealLight, fontSize: 14, fontWeight: '800' },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderColor: colors.line,
    borderWidth: 1,
    backgroundColor: colors.surface,
    minHeight: 44,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  primary: { backgroundColor: colors.gold, borderColor: colors.gold },
  onGold: { color: colors.background },
  primaryDetail: { color: colors.goldInk },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.48 },
  homeContent: {
    flexGrow: 1,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    padding: 16,
    paddingVertical: 10,
    gap: 10,
    justifyContent: 'center',
  },
  accountStrip: {
    minHeight: 50,
    borderColor: colors.heroLine,
    borderWidth: 1,
    borderRadius: 12,
    padding: 7,
    paddingHorizontal: 10,
    backgroundColor: '#0a1e2ceb',
    alignItems: 'center',
    flexDirection: 'row',
    gap: 9,
  },
  avatarMedallion: {
    width: 35,
    height: 35,
    borderRadius: 18,
    borderColor: colors.heroLine,
    borderWidth: 1,
    backgroundColor: colors.tealSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLetter: { color: colors.gold, fontFamily: 'serif', fontWeight: '800', fontSize: 18 },
  accountRating: { alignItems: 'flex-end' },
  accountScore: {
    color: colors.gold,
    fontSize: 18,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
  guestBadge: {
    alignSelf: 'center',
    backgroundColor: '#0a1e2ce8',
    borderWidth: 1,
    borderColor: colors.heroLine,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  homeCrest: { alignSelf: 'center', width: '91%', maxWidth: 340 },
  modeStack: { gap: 8 },
  modeCard: {
    backgroundColor: colors.panel,
    borderColor: colors.heroLine,
    borderBottomWidth: 3,
    borderWidth: 1,
    borderRadius: 12,
    padding: 9,
    gap: 11,
    minHeight: 61,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
  },
  modeSheen: {
    position: 'absolute',
    top: 1,
    left: 4,
    right: 4,
    borderRadius: 5,
    height: 19,
    backgroundColor: 'rgba(255, 255, 255, 0.065)',
  },
  modeIcon: {
    width: 38,
    height: 38,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#cfaa60ad',
    backgroundColor: '#07192980',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIcon: { backgroundColor: '#fbd889', borderColor: '#956220' },
  modeTitle: { color: colors.ink, fontFamily: 'serif', fontSize: 21, fontWeight: '800' },
  modeArrow: { color: colors.gold, fontSize: 28, paddingHorizontal: 3 },
  modeStar: { fontSize: 25, fontWeight: '800' },
  playTriangle: {
    marginLeft: 3,
    borderLeftWidth: 14,
    borderTopWidth: 8,
    borderBottomWidth: 8,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  lockIcon: { alignItems: 'center' },
  lockArch: { width: 11, height: 9, borderWidth: 2, borderRadius: 6 },
  lockBody: { width: 15, height: 10, marginTop: -3, borderRadius: 2 },
  podiumIcon: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, minHeight: 17 },
  homeNotice: { textAlign: 'center' },
  homeFooter: { flexDirection: 'row', justifyContent: 'center', gap: 9 },
  emphasis: { color: colors.gold },
  modeText: { flex: 1, minWidth: 0, gap: 3 },
  field: { gap: 6 },
  input: {
    minHeight: 46,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    color: colors.ink,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
  },
  passwordField: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  passwordInput: { flex: 1, minWidth: 0 },
  passwordToggle: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  tabs: {
    flexDirection: 'row',
    padding: 4,
    gap: 4,
    backgroundColor: colors.background,
    borderRadius: 11,
  },
  tab: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
  activeTab: { backgroundColor: colors.tealSoft },
  notice: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  progressMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metric: {
    flex: 1,
    minWidth: 66,
    alignItems: 'center',
    padding: 8,
    borderRadius: 9,
    backgroundColor: colors.tealSoft,
  },
  ratingBadge: {
    backgroundColor: colors.tealSoft,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  ratingValue: {
    fontSize: 20,
    color: colors.gold,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  leagueFilters: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  leagueFilter: { borderRadius: 8, minHeight: 44, justifyContent: 'center', paddingHorizontal: 7 },
  rankingRow: {
    minHeight: 52,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingHorizontal: 6,
    paddingVertical: 6,
  },
  myRank: { backgroundColor: colors.tealSoft, borderRadius: 9, borderTopColor: 'transparent' },
  rank: {
    minWidth: 26,
    textAlign: 'center',
    color: colors.tealLight,
    fontSize: 14,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  rankingValue: {
    color: colors.ink,
    fontSize: 16,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});

const modeTones = StyleSheet.create({
  gold: { backgroundColor: '#ecc268', borderColor: '#9a6427', borderTopColor: '#ffe4a3' },
  teal: { backgroundColor: '#17484f', borderColor: '#986c38', borderTopColor: '#a0d1b3' },
  plum: { backgroundColor: '#38294a', borderColor: '#927044', borderTopColor: '#aa9abc' },
  navy: { backgroundColor: '#1a3e67', borderColor: '#977340', borderTopColor: '#779ccb' },
});

export { Screen as MemberScreen, Button as MemberButton, Notice as MemberNotice };
