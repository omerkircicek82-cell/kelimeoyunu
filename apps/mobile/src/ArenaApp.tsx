import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import {
  Alert,
  BackHandler,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  MAX_ATTEMPTS,
  ROUND_COUNT,
  ROUND_MS,
  type Mark,
  type PlayerView,
  type Requests,
  type ResponseFor,
  type RoomView,
} from '@arena/shared';
import { GameScreens } from './GameScreens';
import { baseStyles as base, colors } from './Theme';

export interface ArenaAppProps {
  room: RoomView | null;
  online: boolean;
  recovering: boolean;
  joinCode: string | null;
  error: string | null;
  serverUrl: string;
  send: <Event extends keyof Requests>(
    event: Event,
    data: Requests[Event],
  ) => Promise<Extract<ResponseFor<Event>, { ok: true }>>;
  openServerSettings?: () => void;
}

type Scene = 'home' | 'create' | 'join' | 'help';
type Variant = 'primary' | 'secondary' | 'plain' | 'danger';

const sample: ReadonlyArray<{ word: string; marks: readonly Mark[] }> = [
  { word: 'ŞEHİR', marks: ['present', 'present', 'absent', 'absent', 'absent'] },
  { word: 'GÜNEY', marks: ['correct', 'correct', 'correct', 'correct', 'absent'] },
  { word: 'GÜNEŞ', marks: ['correct', 'correct', 'correct', 'correct', 'correct'] },
];

const markLabels: Record<Mark, string> = {
  correct: 'Doğru yer',
  present: 'Yanlış yer',
  absent: 'Kelimede yok',
};

const markSymbols: Record<Mark, string> = { correct: '✓', present: '↗', absent: '−' };

function Action({
  title,
  onPress,
  variant = 'primary',
  disabled,
  compact,
}: {
  title: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        actionBackgrounds[variant],
        compact && styles.compactAction,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.actionLabel, actionText[variant]]}>{title}</Text>
    </Pressable>
  );
}

function Brand() {
  return (
    <View style={styles.brand} accessibilityLabel="Kelime Arenası" accessible>
      <View style={styles.brandMark} importantForAccessibility="no-hide-descendants">
        <Text style={styles.brandInitial}>K</Text>
        <View style={styles.brandCorner} />
      </View>
      <Text style={styles.brandText}>Kelime Arenası</Text>
    </View>
  );
}

function ConnectionBadge({ online, recovering }: { online: boolean; recovering: boolean }) {
  const label = recovering ? 'Oturum açılıyor' : online ? 'Çevrimiçi' : 'Bağlanıyor';
  return (
    <View style={styles.connection} accessibilityLiveRegion="polite">
      <View style={[styles.connectionDot, (recovering || !online) && styles.connectionPending]} />
      <Text style={styles.connectionLabel}>{label}</Text>
    </View>
  );
}

function Home({ open, enabled }: { open: (scene: Scene) => void; enabled: boolean }) {
  return (
    <View style={styles.home}>
      <View style={styles.hero}>
        <View style={styles.heroRule} />
        <Text accessibilityRole="header" style={styles.heroFirst}>
          KELİME
        </Text>
        <Text accessibilityRole="header" style={[styles.heroFirst, styles.heroSecond]}>
          ARENASI
        </Text>
        <Text style={styles.heroCopy}>Aynı kelime. Kimin daha hızlı olduğunu görelim.</Text>
        <View style={styles.heroStats}>
          <View style={styles.heroStat}>
            <Text style={styles.statValue}>2–8</Text>
            <Text style={base.caption}>Oyuncu</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.statValue}>{ROUND_COUNT}</Text>
            <Text style={base.caption}>Tur</Text>
          </View>
          <View style={styles.heroStat}>
            <Text style={styles.statValue}>{ROUND_MS / 1000} sn</Text>
            <Text style={base.caption}>Tur başına</Text>
          </View>
        </View>
      </View>
      <View style={styles.actions}>
        <Action title="Oda oluştur" onPress={() => open('create')} disabled={!enabled} />
        <Action
          title="Odaya katıl"
          onPress={() => open('join')}
          variant="secondary"
          disabled={!enabled}
        />
      </View>
      <View style={[base.card, base.section]}>
        <View style={styles.between}>
          <Text style={base.subtitle}>Örnek tahta</Text>
          <Action title="Nasıl oynanır?" onPress={() => open('help')} variant="plain" compact />
        </View>
        <View
          style={styles.exampleGrid}
          accessible
          accessibilityLabel="ŞEHİR, GÜNEY ve GÜNEŞ tahminleriyle örnek oyun"
        >
          {sample.map(({ word, marks }) => (
            <View
              key={word}
              style={styles.exampleRow}
              importantForAccessibility="no-hide-descendants"
            >
              {Array.from(word).map((letter, index) => (
                <View key={index} style={[styles.exampleTile, exampleMarks[marks[index]]]}>
                  <Text style={styles.exampleLetter}>{letter}</Text>
                  <Text style={styles.exampleSymbol}>{markSymbols[marks[index]]}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

function Help({ close }: { close: () => void }) {
  return (
    <View style={base.section}>
      <Text accessibilityRole="header" style={base.title}>
        Nasıl oynanır?
      </Text>
      <Text style={base.body}>
        Arkadaşlarınla aynı gizli kelimeyi tahmin et. {ROUND_COUNT} turun sonunda en çok puanı alan
        kazanır.
      </Text>
      <View style={[base.card, base.section]}>
        <Text style={base.subtitle}>Harfleri takip et</Text>
        {(Object.keys(markLabels) as Mark[]).map((mark) => (
          <View key={mark} style={styles.helpRow}>
            <View style={[styles.helpMarker, exampleMarks[mark]]}>
              <Text style={styles.exampleLetter}>{markSymbols[mark]}</Text>
            </View>
            <Text style={base.label}>{markLabels[mark]}</Text>
          </View>
        ))}
        <Text style={base.body}>
          Her turda {MAX_ATTEMPTS} tahmin hakkın ve {ROUND_MS / 1000} saniyen var. Kelimeyi erken ve
          az tahminle bulduğunda daha fazla puan alırsın.
        </Text>
      </View>
      <Action title="Ana menü" onPress={close} variant="secondary" />
    </View>
  );
}

function Capacity({
  value,
  set,
  minimum = 2,
}: {
  value: number;
  set: (capacity: number) => void;
  minimum?: number;
}) {
  return (
    <View style={styles.field}>
      <Text style={base.label}>Oyuncu sınırı</Text>
      <View style={styles.capacityRows}>
        {Array.from({ length: 7 }, (_, index) => index + 2).map((size) => (
          <Pressable
            key={size}
            accessibilityRole="button"
            accessibilityLabel={`${size} oyuncu`}
            accessibilityState={{ selected: size === value, disabled: size < minimum }}
            disabled={size < minimum}
            onPress={() => set(size)}
            style={[
              styles.capacityButton,
              size === value && styles.capacitySelected,
              size < minimum && styles.disabled,
            ]}
          >
            <Text style={[styles.capacityText, size === value && styles.capacitySelectedText]}>
              {size}
            </Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={base.label}>{label}</Text>
      {children}
    </View>
  );
}

function EntryForm({
  mode,
  invitation,
  submit,
  enabled,
  busy,
}: {
  mode: 'create' | 'join';
  invitation: string | null;
  submit: (input: { playerName: string; name?: string; code: string; maxPlayers: number }) => void;
  enabled: boolean;
  busy: boolean;
}) {
  const [playerName, setPlayerName] = useState('');
  const [name, setName] = useState('');
  const [code, setCode] = useState(invitation ?? '');
  const [maxPlayers, setMaxPlayers] = useState(4);
  const join = mode === 'join';
  const title = join ? 'Odaya katıl' : 'Oda oluştur';
  const valid = playerName.trim().length >= 2 && (!join || /^[A-Z0-9]{6}$/.test(code));

  useEffect(() => {
    if (invitation) setCode(invitation);
  }, [invitation]);

  function enter() {
    if (!valid || busy || !enabled) return;
    submit({ playerName: playerName.trim(), name: name.trim() || undefined, code, maxPlayers });
  }

  return (
    <View style={base.section}>
      <Text accessibilityRole="header" style={base.title}>
        {title}
      </Text>
      <View style={[base.card, base.section]}>
        <Field label="Oyuncu adın">
          <TextInput
            accessibilityLabel="Oyuncu adın"
            value={playerName}
            onChangeText={setPlayerName}
            placeholder="Örn. Deniz"
            placeholderTextColor={colors.muted}
            autoCapitalize="words"
            maxLength={24}
            style={styles.input}
          />
        </Field>
        {join ? (
          <Field label="Oda kodu">
            <TextInput
              accessibilityLabel="Oda kodu"
              value={code}
              onChangeText={(value) =>
                setCode(
                  value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              placeholder="ABC123"
              placeholderTextColor={colors.muted}
              autoCapitalize="characters"
              autoCorrect={false}
              maxLength={6}
              returnKeyType="go"
              onSubmitEditing={enter}
              style={[styles.input, styles.codeInput]}
            />
          </Field>
        ) : (
          <>
            <Field label="Oda adı (isteğe bağlı)">
              <TextInput
                accessibilityLabel="Oda adı"
                value={name}
                onChangeText={setName}
                placeholder="Örn. Akşam arenası"
                placeholderTextColor={colors.muted}
                maxLength={40}
                style={styles.input}
              />
            </Field>
            <Capacity value={maxPlayers} set={setMaxPlayers} />
          </>
        )}
      </View>
      <Action
        title={busy ? 'Bağlanıyor…' : title}
        onPress={enter}
        disabled={!valid || busy || !enabled}
      />
    </View>
  );
}

function PlayerRow({
  player,
  room,
  kick,
}: {
  player: PlayerView;
  room: RoomView;
  kick?: () => void;
}) {
  const mine = player.id === room.playerId;
  const host = player.id === room.hostId;
  const ready = player.connected && (host || player.ready);
  const initials = Array.from(player.name.trim())[0]?.toLocaleUpperCase('tr-TR');

  return (
    <View style={styles.playerRow}>
      <View style={[styles.avatar, host && styles.avatarHost]}>
        <Text style={[styles.avatarText, host && styles.avatarHostText]}>{initials}</Text>
      </View>
      <View style={styles.playerName}>
        <Text style={base.label} numberOfLines={1}>
          {player.name}
          {mine ? ' (sen)' : ''}
        </Text>
        <Text style={[base.caption, ready && styles.ready]}>
          {!player.connected
            ? 'Bağlantı kesildi'
            : host
              ? 'Oda sahibi'
              : player.ready
                ? 'Hazır'
                : 'Bekleniyor'}
        </Text>
      </View>
      {kick && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${player.name} adlı oyuncuyu çıkar`}
          onPress={kick}
          style={styles.kick}
        >
          <Text style={styles.kickText}>Çıkar</Text>
        </Pressable>
      )}
    </View>
  );
}

function Lobby({
  room,
  enabled,
  busy,
  share,
  kick,
  setReady,
  start,
  save,
  leave,
}: {
  room: RoomView;
  enabled: boolean;
  busy: boolean;
  share: () => void;
  kick: (playerId: string) => void;
  setReady: (ready: boolean) => void;
  start: () => void;
  save: (changes: { name: string; maxPlayers: number }) => Promise<void>;
  leave: () => void;
}) {
  const host = room.hostId === room.playerId;
  const myself = room.players.find((player) => player.id === room.playerId);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(room.name);
  const [capacity, setCapacity] = useState(room.maxPlayers);
  const canStart =
    room.players.length >= 2 &&
    room.players.every((player) => player.connected && (player.id === room.hostId || player.ready));
  const disabled = !enabled || busy;

  useEffect(() => {
    if (!host) setEditing(false);
  }, [host]);

  function openSettings() {
    setName(room.name);
    setCapacity(room.maxPlayers);
    setEditing(true);
  }

  return (
    <View style={base.section}>
      <View style={styles.sectionHeader}>
        <Text accessibilityRole="header" style={base.title}>
          {room.name}
        </Text>
      </View>
      <View style={[base.card, styles.inviteCard]}>
        <View>
          <Text style={base.caption}>Oda kodu</Text>
          <Text selectable style={styles.roomCode}>
            {room.code}
          </Text>
        </View>
        <Action title="Daveti paylaş" onPress={share} variant="secondary" compact />
      </View>
      <View style={[base.card, base.section]}>
        <View style={styles.between}>
          <Text style={base.subtitle}>Oyuncular</Text>
          <Text style={styles.playerCount}>
            {room.players.length} / {room.maxPlayers}
          </Text>
        </View>
        {room.players.map((player) => (
          <PlayerRow
            key={player.id}
            player={player}
            room={room}
            kick={
              host && player.id !== room.playerId && !disabled ? () => kick(player.id) : undefined
            }
          />
        ))}
      </View>
      {host && editing && (
        <View style={[base.card, base.section]}>
          <Text style={base.subtitle}>Oda ayarları</Text>
          <Field label="Oda adı">
            <TextInput
              accessibilityLabel="Oda adı"
              value={name}
              onChangeText={setName}
              style={styles.input}
              maxLength={40}
            />
          </Field>
          <Capacity value={capacity} set={setCapacity} minimum={room.players.length} />
          <View style={styles.buttonRow}>
            <View style={styles.fill}>
              <Action
                title="Vazgeç"
                onPress={() => setEditing(false)}
                variant="secondary"
                compact
              />
            </View>
            <View style={styles.fill}>
              <Action
                title="Kaydet"
                onPress={() =>
                  void save({ name: name.trim(), maxPlayers: capacity })
                    .then(() => setEditing(false))
                    .catch(() => {})
                }
                disabled={disabled || !name.trim() || capacity < room.players.length}
                compact
              />
            </View>
          </View>
        </View>
      )}
      {host ? (
        <>
          <Action title="Maçı başlat" onPress={start} disabled={disabled || !canStart} />
          {!canStart && (
            <Text style={base.caption}>
              En az iki oyuncu gerekir. Oda sahibi dışındaki oyuncular hazır olduğunda maç
              başlayabilir.
            </Text>
          )}
          {!editing && (
            <Action
              title="Oda ayarları"
              onPress={openSettings}
              variant="secondary"
              disabled={disabled}
            />
          )}
        </>
      ) : (
        <Action
          title={myself?.ready ? 'Hazır değilim' : 'Hazırım'}
          onPress={() => setReady(!myself?.ready)}
          disabled={disabled || !myself}
          variant={myself?.ready ? 'secondary' : 'primary'}
        />
      )}
      <Action title="Odadan ayrıl" onPress={leave} variant="danger" disabled={disabled} />
    </View>
  );
}

export function ArenaApp({
  room,
  online,
  recovering,
  joinCode,
  error,
  serverUrl,
  send,
  openServerSettings,
}: ArenaAppProps) {
  const [scene, setScene] = useState<Scene>(joinCode ? 'join' : 'home');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const pending = useRef(false);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const enabled = online && !recovering;

  useEffect(() => {
    if (!room && joinCode) setScene('join');
  }, [joinCode, room]);

  useEffect(() => {
    scroller.current?.scrollTo({ y: 0, animated: false });
  }, [scene, room?.phase, room?.round]);

  function open(next: Scene) {
    setLocalError(null);
    setScene(next);
  }

  async function act(operation: () => Promise<unknown>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setLocalError(null);
    try {
      await operation();
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : 'İşlem tamamlanamadı.');
      throw cause;
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  function run(operation: () => Promise<unknown>) {
    void act(operation).catch(() => {});
  }

  async function leave() {
    await act(async () => {
      await send('room:leave', {});
      setScene('home');
    });
  }

  function confirmLeave() {
    if (busy) return;
    Alert.alert('Odadan ayrıl', 'Odadan çıkıp ana menüye dönmek istiyor musun?', [
      { text: 'Kal', style: 'cancel' },
      { text: 'Ayrıl', style: 'destructive', onPress: () => void leave().catch(() => {}) },
    ]);
  }

  useEffect(() => {
    const back = BackHandler.addEventListener('hardwareBackPress', () => {
      if (room) {
        confirmLeave();
        return true;
      }
      if (scene !== 'home') {
        open('home');
        return true;
      }
      return false;
    });
    return () => back.remove();
  });

  function share(results = false) {
    if (!room) return;
    const url = `${serverUrl.replace(/\/+$/, '')}/room/${room.code}`;
    const best = room.players[0];
    const message =
      results && best
        ? `Kelime Arenası • ${room.name}\n${best.name} maçı ${best.points.toLocaleString('tr-TR')} puanla tamamladı.\n${url}`
        : `Kelime Arenası’nda bana katıl! Oda kodu: ${room.code}\n${url}`;
    void Share.share({ message }).catch(() => setLocalError('Paylaşım açılamadı.'));
  }

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        {!room && scene !== 'home' ? (
          <Pressable accessibilityRole="button" onPress={() => open('home')} style={styles.back}>
            <Text style={styles.backText}>‹ Ana menü</Text>
          </Pressable>
        ) : (
          <Brand />
        )}
        <View style={styles.headerActions}>
          <ConnectionBadge online={online} recovering={recovering} />
          {!room && openServerSettings && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Sunucu ayarları"
              onPress={openServerSettings}
              style={styles.settings}
            >
              <Text style={styles.settingsText}>⚙</Text>
            </Pressable>
          )}
        </View>
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          {Boolean(localError || error) && (
            <View accessibilityRole="alert" style={styles.notice}>
              <Text style={styles.noticeText}>{localError || error}</Text>
            </View>
          )}
          {room ? (
            room.phase === 'lobby' ? (
              <Lobby
                key={room.code}
                room={room}
                enabled={enabled}
                busy={busy}
                share={() => share()}
                kick={(playerId) => {
                  const player = room.players.find((candidate) => candidate.id === playerId);
                  if (player)
                    Alert.alert('Oyuncuyu çıkar', `${player.name} odadan çıkarılsın mı?`, [
                      { text: 'Vazgeç', style: 'cancel' },
                      {
                        text: 'Çıkar',
                        style: 'destructive',
                        onPress: () => run(() => send('room:player-kick', { playerId })),
                      },
                    ]);
                }}
                setReady={(ready) => run(() => send('room:player-ready', { ready }))}
                start={() => run(() => send('game:start', {}))}
                save={(input) => act(() => send('room:settings', input))}
                leave={confirmLeave}
              />
            ) : (
              <GameScreens
                key={`${room.code}:${room.matchId ?? ''}:${room.phase}:${room.round}`}
                room={room}
                online={enabled}
                submitGuess={async (word, requestId) => {
                  if (!room.matchId) throw new Error('Maç henüz başlamadı.');
                  await send('game:submit-guess', {
                    word,
                    requestId,
                    matchId: room.matchId,
                    round: room.round,
                  });
                }}
                restart={() => act(() => send('game:restart', {}))}
                canRestart={room.hostId === room.playerId && !busy}
                share={() => share(true)}
                leave={leave}
              />
            )
          ) : scene === 'home' ? (
            <Home open={open} enabled={enabled} />
          ) : scene === 'help' ? (
            <Help close={() => open('home')} />
          ) : (
            <EntryForm
              key={scene}
              mode={scene}
              invitation={scene === 'join' ? joinCode : null}
              enabled={enabled}
              busy={busy}
              submit={({ playerName, name, code, maxPlayers }) =>
                run(async () => {
                  if (scene === 'join') await send('room:join', { playerName, code });
                  else await send('room:create', { playerName, name, maxPlayers });
                  setScene('home');
                })
              }
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    paddingHorizontal: 16,
    minHeight: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    alignItems: 'center',
  },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  brand: { flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  brandText: { color: colors.ink, fontSize: 16, fontWeight: '900', flexShrink: 1 },
  brandMark: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.lime,
    overflow: 'hidden',
  },
  brandInitial: { fontSize: 20, fontWeight: '900', color: colors.background },
  brandCorner: {
    position: 'absolute',
    top: 3,
    right: 3,
    borderRadius: 2,
    width: 5,
    height: 5,
    backgroundColor: colors.background,
    opacity: 0.5,
  },
  settings: { paddingHorizontal: 8, minHeight: 44, justifyContent: 'center' },
  settingsText: { fontSize: 23, color: colors.muted },
  connection: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  connectionDot: { width: 7, height: 7, backgroundColor: colors.lime, borderRadius: 4 },
  connectionPending: { backgroundColor: colors.amber },
  connectionLabel: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  scroll: {
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
    alignSelf: 'center',
    width: '100%',
    maxWidth: 560,
    gap: 12,
    flexGrow: 1,
  },
  home: { gap: 14 },
  hero: {
    paddingTop: 18,
    paddingHorizontal: 18,
    paddingBottom: 16,
    borderRadius: 22,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
  },
  heroRule: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.violet,
    marginBottom: 12,
  },
  heroFirst: {
    fontSize: 48,
    lineHeight: 50,
    letterSpacing: -2.5,
    fontWeight: '900',
    color: colors.ink,
  },
  heroSecond: { color: colors.lime },
  heroCopy: { color: colors.ink, fontSize: 16, fontWeight: '600', lineHeight: 22, marginTop: 8 },
  heroStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 18,
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  heroStat: { minWidth: 64, flexGrow: 1, gap: 2 },
  statValue: { color: colors.ink, fontSize: 19, fontWeight: '800' },
  actions: { gap: 8 },
  action: {
    minHeight: 50,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 13,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactAction: { minHeight: 44, paddingVertical: 8 },
  actionLabel: { fontSize: 15, fontWeight: '800', textAlign: 'center' },
  primary: { backgroundColor: colors.lime, borderColor: colors.lime },
  secondary: { backgroundColor: colors.surface, borderColor: colors.line },
  plain: { backgroundColor: 'transparent', borderColor: 'transparent', paddingHorizontal: 0 },
  danger: { backgroundColor: 'transparent', borderColor: colors.line },
  primaryText: { color: colors.background },
  secondaryText: { color: colors.ink },
  plainText: { color: colors.violet },
  dangerText: { color: colors.danger },
  pressed: { opacity: 0.7 },
  disabled: { opacity: 0.45 },
  between: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  exampleGrid: { gap: 5, maxWidth: 233, width: '100%', alignSelf: 'center' },
  exampleRow: { flexDirection: 'row', gap: 5 },
  exampleTile: {
    flex: 1,
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  hasLetter: { backgroundColor: colors.correct },
  otherPosition: { backgroundColor: colors.present },
  noLetter: { backgroundColor: colors.absent },
  exampleLetter: { color: colors.ink, fontSize: 18, fontWeight: '900' },
  exampleSymbol: {
    position: 'absolute',
    top: 2,
    right: 4,
    color: colors.ink,
    fontSize: 9,
    fontWeight: '800',
  },
  helpRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  helpMarker: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  back: { minHeight: 44, justifyContent: 'center' },
  backText: { color: colors.violet, fontSize: 15, fontWeight: '800' },
  field: { gap: 7 },
  input: {
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.background,
    color: colors.ink,
    borderRadius: 11,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    fontSize: 16,
  },
  codeInput: { letterSpacing: 3, fontWeight: '800' },
  capacityRows: { flexDirection: 'row', flexWrap: 'wrap', gap: 5 },
  capacityButton: {
    flexGrow: 1,
    minWidth: 33,
    minHeight: 44,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderRadius: 10,
    borderColor: colors.line,
    backgroundColor: colors.background,
  },
  capacitySelected: { backgroundColor: colors.lime, borderColor: colors.lime },
  capacityText: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  capacitySelectedText: { color: colors.background },
  sectionHeader: { gap: 5 },
  inviteCard: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  roomCode: { color: colors.lime, fontSize: 27, fontWeight: '900', letterSpacing: 2, marginTop: 3 },
  playerCount: { color: colors.violet, fontWeight: '800', fontVariant: ['tabular-nums'] },
  playerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 53,
    gap: 9,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: 7,
  },
  playerName: { flex: 1, minWidth: 0, gap: 3 },
  avatar: {
    width: 39,
    height: 39,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.violetSoft,
  },
  avatarHost: { backgroundColor: '#4a562f' },
  avatarText: { color: colors.violet, fontSize: 17, fontWeight: '900' },
  avatarHostText: { color: colors.lime },
  ready: { color: colors.lime },
  kick: { minHeight: 44, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  kickText: { color: colors.danger, fontSize: 13, fontWeight: '800' },
  buttonRow: { flexDirection: 'row', gap: 8 },
  fill: { flex: 1 },
  notice: {
    borderWidth: 1,
    borderColor: '#774353',
    borderRadius: 12,
    backgroundColor: '#34212b',
    padding: 10,
  },
  noticeText: { color: colors.danger, fontSize: 14, lineHeight: 20 },
});

const actionBackgrounds = {
  primary: styles.primary,
  secondary: styles.secondary,
  plain: styles.plain,
  danger: styles.danger,
};
const actionText = {
  primary: styles.primaryText,
  secondary: styles.secondaryText,
  plain: styles.plainText,
  danger: styles.dangerText,
};
const exampleMarks = {
  correct: styles.hasLetter,
  present: styles.otherPosition,
  absent: styles.noLetter,
};
