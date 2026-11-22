import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  BADGE_DETAILS, LEAGUES, LEAGUE_DETAILS, RATING_GREEN_POINTS, RATING_ROUND_POINTS, RATING_YELLOW_POINTS,
  type AccountProfile, type LeaderboardEntry, type LeagueId,
} from '@arena/shared';
import { baseStyles as base, colors } from './Theme';

export type { AccountProfile, LeaderboardEntry } from '@arena/shared';

type Credentials = { username: string; password: string };

const numbers = new Intl.NumberFormat('tr-TR');

function Screen({ children, goBack }: { children: ReactNode; goBack?: () => void }) {
  return (
    <SafeAreaView style={styles.screen}>
      {goBack && (
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" onPress={goBack} style={styles.back}>
            <Text style={styles.backText}>‹ Arena</Text>
          </Pressable>
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
      <Text style={[base.label, primary && styles.onLime]}>{label}</Text>
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
}: {
  openOnline: () => void;
  openOffline: () => void;
  openDaily: () => void;
}) {
  return (
    <Screen>
      <View style={styles.hero}>
        <View style={styles.wordGrid} importantForAccessibility="no-hide-descendants">
          {Array.from('ARENA').map((letter, index) => (
            <View key={index} style={[styles.letter, index >= 2 && styles.markedLetter]}>
              <Text style={[styles.letterText, index >= 2 && styles.markedLetterText]}>
                {letter}
              </Text>
            </View>
          ))}
        </View>
        <Text accessibilityRole="header" style={styles.heroTitle}>
          KELİME{'\n'}
          <Text style={styles.emphasis}>ARENASI</Text>
        </Text>
        <Text style={base.body}>Nasıl oynamak istersin?</Text>
      </View>
      <ModeCard
        title="Online"
        detail="Arkadaşlarınla aynı odada yarış veya dereceli sıralamaya katıl."
        symbol="↗"
        onPress={openOnline}
        primary
      />
      <ModeCard
        title="Günlük mücadele"
        detail="Günün beş kelimesini çöz ve bugünün sıralamasına katıl."
        symbol="◆"
        onPress={openDaily}
      />
      <ModeCard
        title="Çevrimdışı"
        detail="Kelimeleri tek başına ve kendi hızında bul."
        symbol="▦"
        onPress={openOffline}
      />
    </Screen>
  );
}

export function MemberProfile({ account, goBack, onLogout, openLeaderboard }: {
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
        <Text accessibilityRole="header" style={base.title}>{account.username}</Text>
        {progress && <Text style={base.subtitle}>{progress.title}</Text>}
      </View>
      <View style={[base.card, base.section]}>
        <View style={styles.scoreRow}>
          <View style={styles.modeText}>
            <Text style={base.caption}>Arena ligi</Text>
            <Text style={base.subtitle}>{progress ? LEAGUE_DETAILS[progress.league].label : 'Lig bilgisi alınamadı'}</Text>
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
              {label}{progress?.league === id ? ' · Senin ligin' : ''}
            </Text>
            <Text style={base.caption}>{numbers.format(minRating)} puan</Text>
          </View>
        ))}
        <Button label="Genel sıralama" onPress={openLeaderboard} />
      </View>
      {progress && (
        <>
          <View style={[base.card, base.section]}>
            <Text accessibilityRole="header" style={base.subtitle}>Galibiyet serisi</Text>
            <Text style={base.caption}>Art arda çözdüğün dereceli turlar.</Text>
            <View style={styles.progressMetrics}>
              <ProgressMetric label="Güncel" value={progress.winStreak} />
              <ProgressMetric label="En uzun" value={progress.bestWinStreak} />
              <ProgressMetric label="Galibiyet" value={progress.wins} />
            </View>
            <Text style={base.caption}>En yüksek derece puanın {numbers.format(progress.peakRating)}.</Text>
          </View>
          <View style={[base.card, base.section]}>
            <Text accessibilityRole="header" style={base.subtitle}>Rozetler</Text>
            <Text style={base.caption}>{progress.badges.length} / {Object.keys(BADGE_DETAILS).length} kazanıldı</Text>
            {Object.entries(BADGE_DETAILS).map(([id, badge]) => {
              const acquired = progress.badges.some(earned => earned === id);
              return (
                <View key={id} style={[styles.scoreRow, styles.progressRow]}>
                  <View style={styles.modeText}>
                    <Text style={base.label}>{badge.label}</Text>
                    <Text style={base.caption}>{badge.description}</Text>
                  </View>
                  <Text style={[base.caption, acquired && styles.emphasis]}>{acquired ? 'Kazanıldı' : 'Kilitli'}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}
      {error ? <Notice message={error} /> : null}
      <Button label={busy ? 'Çıkılıyor…' : 'Hesaptan çık'} disabled={busy} onPress={() => void logout()} />
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

function ModeCard({
  title,
  detail,
  symbol,
  onPress,
  primary = false,
}: {
  title: string;
  detail: string;
  symbol: string;
  onPress: () => void;
  primary?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      onPress={onPress}
      style={({ pressed }) => [
        styles.modeCard,
        primary && styles.primary,
        pressed && styles.pressed,
      ]}
    >
      <View style={[styles.modeIcon, primary && styles.primaryIcon]} importantForAccessibility="no">
        <Text style={[styles.modeSymbol, primary && styles.onLime]}>{symbol}</Text>
      </View>
      <View style={styles.modeText}>
        <Text style={[base.subtitle, primary && styles.onLime]}>{title}</Text>
        <Text style={[base.caption, primary && styles.primaryDetail]}>{detail}</Text>
      </View>
      <Text style={[styles.modeArrow, primary && styles.onLime]}>›</Text>
    </Pressable>
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
          Çözüm +{RATING_ROUND_POINTS}, çözülemeyen tur −{RATING_ROUND_POINTS}.
          En iyi satırda yeşil harf +{RATING_GREEN_POINTS}, sarı harf +{RATING_YELLOW_POINTS}.
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
          {([undefined, ...LEAGUES] as const).map(id => (
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
          <ActivityIndicator color={colors.lime} accessibilityLabel="Sıralama yükleniyor" />
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
    justifyContent: 'center',
  },
  back: { minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', paddingRight: 12 },
  backText: { color: colors.violet, fontSize: 14, fontWeight: '800' },
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
  primary: { backgroundColor: colors.lime, borderColor: colors.lime },
  onLime: { color: colors.background },
  primaryDetail: { color: colors.limeDetail },
  pressed: { opacity: 0.76 },
  disabled: { opacity: 0.48 },
  hero: {
    backgroundColor: colors.heroPanel,
    borderWidth: 1,
    borderColor: colors.heroLine,
    borderRadius: 22,
    padding: 20,
    gap: 12,
  },
  heroTitle: {
    color: colors.ink,
    fontSize: 44,
    lineHeight: 46,
    fontWeight: '900',
    letterSpacing: -1.8,
  },
  emphasis: { color: colors.lime },
  wordGrid: { flexDirection: 'row', gap: 4 },
  letter: {
    alignItems: 'center',
    justifyContent: 'center',
    height: 28,
    width: 28,
    borderRadius: 6,
    backgroundColor: colors.violetSoft,
  },
  markedLetter: { backgroundColor: colors.correct },
  letterText: { color: colors.violet, fontWeight: '900', fontSize: 13 },
  markedLetterText: { color: colors.lime },
  modeCard: {
    backgroundColor: colors.panel,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: 17,
    padding: 12,
    gap: 10,
    minHeight: 78,
    flexDirection: 'row',
    alignItems: 'center',
  },
  modeIcon: {
    width: 43,
    height: 43,
    borderRadius: 11,
    backgroundColor: colors.violetSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryIcon: { backgroundColor: colors.limeInset },
  modeSymbol: { color: colors.violet, fontSize: 22, fontWeight: '900' },
  modeArrow: { color: colors.muted, fontSize: 24 },
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
  activeTab: { backgroundColor: colors.violetSoft },
  notice: { color: colors.danger, fontSize: 14, lineHeight: 20 },
  scoreRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  progressRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10 },
  progressMetrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metric: { flex: 1, minWidth: 66, alignItems: 'center', padding: 8, borderRadius: 9, backgroundColor: colors.violetSoft },
  ratingBadge: {
    backgroundColor: colors.violetSoft,
    borderRadius: 10,
    padding: 8,
    alignItems: 'center',
  },
  ratingValue: {
    fontSize: 20,
    color: colors.lime,
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
  myRank: { backgroundColor: colors.violetSoft, borderRadius: 9, borderTopColor: 'transparent' },
  rank: {
    minWidth: 26,
    textAlign: 'center',
    color: colors.violet,
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

export { Screen as MemberScreen, Button as MemberButton, Notice as MemberNotice };
